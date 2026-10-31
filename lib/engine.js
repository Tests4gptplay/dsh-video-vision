import { createHash, randomUUID } from 'node:crypto';
import { existsSync, createWriteStream } from 'node:fs';
import { mkdir, readFile, writeFile, stat, rename, rm, open as openFile } from 'node:fs/promises';
import { resolve, join, dirname, basename, relative, isAbsolute, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { run } from './process.js';
import { normalizeSource, webId, downloadWeb, timestampUrl } from './ytdlp.js';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { parseBilibili, resolveBilibili, playback, subtitles, headers } from './bilibili.js?v=0.9.0';
import { listMethods, runMethod, MethodNeeded } from './extensions.js';
import { byteBudget, budgetSignal, BudgetExceededError, isBudgetError, timeoutRecovery } from './budgets.js';
import { wavFromPcm } from './audio.js';
import { createRefreshStage, commitRefresh, recoverRefresh } from './cache-refresh.js';

export const DEFAULTS = Object.freeze({ cacheDirectory: '.dsh-video-vision', ffmpegPath: 'ffmpeg', ffprobePath: 'ffprobe',
  maxHeight: 0, frameWidth: 1280, maxFrames: 12, maxDownloadMB: 0, downloadTimeoutMs: 0,
  processTimeoutMs: 0, maxAudioSeconds: 60 });

function bounded(value, fallback, min, max, label) {
  const n = value === undefined ? fallback : Number(value);
  if (!Number.isFinite(n) || n < min || n > max) throw new Error(`${label} must be between ${min} and ${max}.`);
  return n;
}
export function timecode(seconds) {
  const s = Math.max(0, Number(seconds));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${(s % 60).toFixed(3).padStart(6, '0')}`;
}
export function sampleTimes(start, end, count) {
  return Array.from({ length: count }, (_, i) => Number((count === 1 ? start : start + (end - start) * i / (count - 1)).toFixed(3)));
}

export class VideoVision {
  constructor(cwd, config = {}, nativeSession) {
    this.cwd = resolve(cwd);
    this.config = { ...DEFAULTS, ...config };
    this.nativeApi = this.config.browserSessionAuthorized === true && nativeSession ? nativeSession.api.bind(nativeSession) : undefined;
    this.mediaFetch = this.nativeApi && nativeSession?.fetch ? nativeSession.fetch.bind(nativeSession) : globalThis.fetch;
    this.root = resolve(this.cwd, this.config.cacheDirectory);
    this.latest = null;
  }
  folder(id) {
    if (!/^[A-Za-z0-9_-]+$/.test(id)) throw new Error('Use the video_id returned by open.');
    const legacy = join(this.root, id);
    return existsSync(legacy) || existsSync(legacy + '.refresh.json') ? legacy : join(this.root, 'videos', id);
  }
  async save(asset) {
    await writeFile(join(this.folder(asset.id), 'manifest.json'), JSON.stringify(asset, null, 2), 'utf8');
  }
  async load(id) {
    if (!id) {
      const latest = JSON.parse(await readFile(join(this.root, 'latest.json'), 'utf8').catch(() => '{"id":null}'));
      id = latest.id;
    }
    if (!id) throw new Error('Open a video first, or provide video_id.');
    const folder = this.folder(id);
    const recovery = await recoverRefresh(folder, id);
    const asset = JSON.parse(await readFile(join(folder, 'manifest.json'), 'utf8'));
    if (recovery.cleanupPending) Object.defineProperty(asset, 'cacheResult', { value: { state: 'loaded', cleanup_pending: true }, configurable: true });
    return asset;
  }
  async download(urls, destination, referer, signal, maxBytes = byteBudget(this.config)) {
    await mkdir(dirname(destination), { recursive: true });
    let lastError;
    for (const url of [...new Set(urls.filter(Boolean))]) {
      signal.throwIfAborted();
      const combined = budgetSignal(signal, this.config.downloadTimeoutMs, 'downloadTimeoutMs');
      try {
        const response = await this.mediaFetch(url, { headers: headers(referer), signal: combined });
        if (!response.ok || !response.body) throw new Error(`Video download HTTP ${response.status}`);
        if (Number(response.headers.get('content-length')) > maxBytes) {
          await response.body.cancel();
          throw new BudgetExceededError('maxDownloadMB', this.config.maxDownloadMB);
        }
        let bytes = 0;
        const sizeBudget = this.config.maxDownloadMB;
        const counter = new Transform({ transform(chunk, _encoding, callback) {
          bytes += chunk.length;
          callback(bytes > maxBytes ? new BudgetExceededError('maxDownloadMB', sizeBudget) : null, chunk);
        } });
        const partial = destination + '.part';
        await pipeline(Readable.fromWeb(response.body), counter, createWriteStream(partial), { signal: combined });
        if (bytes === 0) throw new Error('The video download was empty.');
        // Both paths are fixed, plugin-owned files inside this asset's cache directory.
        await rename(partial, destination);
        return bytes;
      } catch (error) {
        signal.throwIfAborted();
        // Node pipeline may report AbortError rather than the signal's reason.
        lastError = combined.aborted ? combined.reason : error;
        if (isBudgetError(lastError)) throw lastError;
      }
    }
    throw lastError ?? new Error('No video URL was provided by the player.');
  }
  async probe(path, directory, signal) {
    const output = await run(this.config.ffprobePath, ['-v', 'error', '-show_entries',
      'format=duration:stream=codec_type,width,height,avg_frame_rate,duration,start_time:stream_tags=DURATION', '-of', 'json', path],
      directory, signal, this.config.processTimeoutMs, 'probe');
    const info = JSON.parse(output);
    const v = info.streams?.find(s => s.codec_type === 'video');
    const tagged = v?.tags?.DURATION?.split(':').reduce((total, part) => total * 60 + Number(part), 0);
    let duration = [Number(v?.duration), tagged, Number(info.format?.duration)].find(n => Number.isFinite(n) && n > 0);
    if (!v || !duration) throw Object.assign(new Error('The source has no readable video stream or duration.'), { code: 'INVALID_MEDIA' });
    const timelineStart = Number(v.start_time) || 0;
    const tail = JSON.parse(await run(this.config.ffprobePath, ['-v', 'error', '-select_streams', 'v:0',
      '-read_intervals', `${timelineStart + Math.max(0, duration - 1)}%`,
      '-show_entries', 'frame=best_effort_timestamp_time,duration_time,pkt_duration_time', '-of', 'json', path],
      directory, signal, this.config.processTimeoutMs, 'probe-tail'));
    let lastFrameSeconds;
    for (const frame of tail.frames || []) {
      const position = Number((Number(frame.best_effort_timestamp_time) - timelineStart).toFixed(6));
      if (!Number.isFinite(position) || position < 0) continue;
      lastFrameSeconds = Math.max(lastFrameSeconds ?? 0, position);
      const length = Number(frame.duration_time ?? frame.pkt_duration_time);
      duration = Math.max(duration, Number((position + (Number.isFinite(length) && length > 0 ? length : 0)).toFixed(6)));
    }
    return { duration, width: v.width, height: v.height, frameRate: v.avg_frame_rate, timelineStart,
      ...(lastFrameSeconds === undefined ? {} : { lastFrameSeconds }),
      hasAudio: info.streams.some(s => s.codec_type === 'audio') };
  }
  async open(source, signal, resolver = 'auto', options = {}) {
    if (options.refresh !== undefined && typeof options.refresh !== 'boolean') throw new Error('refresh must be boolean.');
    if (options.max_height !== undefined && (!Number.isSafeInteger(options.max_height) || options.max_height < 0)) throw new Error('max_height must be a non-negative integer.');
    const acquisitionConfig = { ...this.config, ...(options.max_height === undefined ? {} : { maxHeight: options.max_height }) };
    if (!source?.trim()) throw new Error('open needs a video URL, BV id, or local video path.');
    source = source.trim();
    await mkdir(this.root, { recursive: true });
    let target = await parseBilibili(source, signal);
    if (target && resolver !== 'auto') {
      source = `https://www.bilibili.com/video/${target.bvid}/?p=${target.page}`;
      target = null;
    }
    let id, local, fingerprint, online, method;
    if (target) id = `${target.bvid}-p${target.page}`;
    else if (/^https?:/i.test(source)) {
      online = normalizeSource(source);
      id = webId(online);
      if (!['auto', 'yt-dlp'].includes(resolver)) {
        const listing = await listMethods(this.config, online);
        method = listing.methods.find(item => item.id === resolver);
        if (!method) throw new MethodNeeded(online, 'Resolver not found: ' + resolver, this.config);
        id = 'web-' + createHash('sha256').update(online + '\n' + method.id + '\n' + method.revision).digest('hex').slice(0, 20);
      }
    } else {
      local = source.startsWith('file:') ? fileURLToPath(source) : resolve(this.cwd, source);
      const info = await stat(local);
      if (!info.isFile()) throw new Error('The local video source must be a regular file.');
      fingerprint = `${local}|${info.size}|${info.mtimeMs}`;
      id = 'local-' + createHash('sha256').update(fingerprint).digest('hex').slice(0, 16);
    }
    const destination = this.folder(id);
    const recovery = await recoverRefresh(destination, id);
    let folder = destination;
    let asset, previousCursor;
    try {
      asset = await this.load(id);
      if (!asset || asset.id !== id || typeof asset.mediaPath !== 'string' || !Number.isFinite(asset.duration) || asset.duration <= 0 ||
          !asset.captions || !Array.isArray(asset.captions.cues) ||
          (asset.cursor !== undefined && (!Number.isFinite(asset.cursor) || asset.cursor < 0 || asset.cursor > asset.duration)))
        throw Object.assign(new Error('Invalid video cache manifest.'), { code: 'INVALID_CACHE' });
      previousCursor = asset.cursor ?? 0;
      // Check readability separately: permission failures must never become a silent redownload.
      const handle = await openFile(asset.mediaPath, 'r');
      try { await handle.read(Buffer.alloc(1), 0, 1, 0); } finally { await handle.close(); }
      try { Object.assign(asset, await this.probe(asset.mediaPath, folder, signal)); asset.cursor = Math.min(asset.cursor ?? 0, asset.duration); }
      catch (error) {
        signal.throwIfAborted();
        if (error.exitCode !== undefined || error.code === 'INVALID_MEDIA')
          throw Object.assign(new Error('Cached media needs to be acquired again.', { cause: error }), { code: 'INVALID_CACHE' });
        throw error;
      }
    } catch (error) {
      signal.throwIfAborted();
      if (error.code !== 'ENOENT' && error.code !== 'INVALID_CACHE' && !(error instanceof SyntaxError)) throw error;
      if (existsSync(folder) && !(asset?.id === id)) {
        let marker;
        try { marker = JSON.parse(await readFile(join(folder, '.video-vision.json'), 'utf8')); }
        catch (markerError) {
          if (markerError.code !== 'ENOENT' && !(markerError instanceof SyntaxError)) throw markerError;
        }
        if (marker?.id !== id) throw new Error('This existing directory is not an identifiable video cache; its files were not changed.', { cause: error });
      }
      asset = null;
    }
    const cacheHit = Boolean(asset) && !options.refresh;
    let stage;
    let committed = false;
    let cleanupPending = recovery.cleanupPending || Boolean(asset?.cacheResult?.cleanup_pending);
    try {
    if (options.refresh) {
      if (cleanupPending) throw new Error('Previous cache refresh cleanup is still pending; the existing media was retained.');
      stage = await createRefreshStage(destination, id);
      folder = stage;
      asset = null;
    }
    if (!asset) {
      if (online && resolver === 'auto') {
        const listing = await listMethods(this.config, online);
        method = listing.methods.find(item => item.enabled && item.matches);
        if (!method) throw new MethodNeeded(online, 'No saved resolver matches this URL. Read the method guidance or select the yt-dlp backup.', this.config);
      }
      await mkdir(folder, { recursive: true });
      await writeFile(join(folder, '.video-vision.json'), JSON.stringify({ id, version: 1 }));
      let info, downloadBytes;
      const path = join(folder, 'video.mp4');
      if (target) {
        try {
          info = await resolveBilibili(target, acquisitionConfig.maxHeight, signal, this.nativeApi);
          downloadBytes = await this.download([info.media.video, ...info.media.videoBackup], path, info.sourceUrl, signal);
        } catch (error) {
          signal.throwIfAborted();
          if (this.nativeApi || isBudgetError(error) || timeoutRecovery(error)) throw error;
          info = null;
          online = `https://www.bilibili.com/video/${target.bvid}/?p=${target.page}`;
          const listing = await listMethods(this.config, online);
          method = listing.methods.find(item => item.enabled && item.matches);
          if (!method) throw new MethodNeeded(online, error.message, this.config, { cause: error });
        }
      }
      if (info) {
        const measured = await this.probe(path, folder, signal);
        const captions = await subtitles(info.bvid, info.cid, signal, this.nativeApi, this.mediaFetch);
        // Expiring playback URLs are not exposed in tool output or persisted.
        const { media, ...metadata } = info;
        asset = { ...metadata, ...measured, ...(Number.isFinite(info.duration) && info.duration > 0 ? { sourceReportedDuration: info.duration } : {}), mediaPath: path, downloadBytes, videoOnly: media.videoOnly,
          acquisitionMode: this.nativeApi ? 'native-browser' : 'anonymous', publicStreamQuality: media.quality, hasSeparateAudio: Boolean(media.audio), captions, cursor: 0, openedAt: new Date().toISOString() };
      } else if (online) {
        let downloaded;
        try {
          downloaded = method ? await runMethod(method, online, folder, acquisitionConfig, signal) :
            await downloadWeb(online, folder, acquisitionConfig, signal);
        } catch (error) {
          signal.throwIfAborted();
          if (isBudgetError(error) || timeoutRecovery(error)) throw error;
          throw new MethodNeeded(online, error.message, this.config, { cause: error });
        }
        asset = { ...downloaded, ...await this.probe(downloaded.mediaPath, folder, signal),
          id, cursor: 0, openedAt: new Date().toISOString() };
      } else {
        asset = { id, source: 'local', title: basename(local), sourceUrl: null, mediaPath: local,
          ...await this.probe(local, folder, signal), captions: { state: 'not-provided', tracks: [], cues: [] },
          cursor: 0, openedAt: new Date().toISOString() };
      }
    }
    if (stage) {
      asset.cursor = Math.min(previousCursor ?? 0, asset.duration);
      for (const key of ['mediaPath', 'audioPath']) {
        if (!asset[key]) continue;
        const rel = relative(stage, asset[key]);
        if (rel !== '..' && !rel.startsWith('..' + sep) && !isAbsolute(rel)) asset[key] = join(destination, rel);
      }
      await writeFile(join(stage, 'manifest.json'), JSON.stringify(asset, null, 2), 'utf8');
      signal.throwIfAborted();
      const result = await commitRefresh(stage, destination, id);
      committed = result.committed; cleanupPending = result.cleanupPending;
    } else await this.save(asset);
    Object.defineProperty(asset, 'cacheResult', { value: { state: cacheHit ? 'hit' : options.refresh ? 'refreshed' : 'acquired', ...(cleanupPending ? { cleanup_pending: true } : {}) }, configurable: true });
    this.latest = id;
    try { await writeFile(join(this.root, 'latest.json'), JSON.stringify({ id })); }
    catch (error) { if (!committed) throw error; asset.cacheResult.latest_update_failed = true; }
    return asset;
    } finally {
      if (stage && !committed && !existsSync(destination + '.refresh.json')) await rm(stage, { recursive: true, force: true });
    }
  }
  audioSource(asset) {
    if (asset.hasAudio) return { state: 'available', storage: 'embedded', path: asset.mediaPath };
    const path = asset.audioPath || join(this.folder(asset.id), 'audio.m4a');
    if (existsSync(path)) return { state: 'available', storage: 'separate', path };
    if (asset.source === 'bilibili' && asset.hasSeparateAudio !== false)
      return { state: 'on-demand', storage: 'separate', next_action: 'audio or transcribe fetches the separate audio track.' };
    return { state: 'not-cached', storage: null };
  }
  summary(asset) {
    return { ...(asset.cacheResult ? { cache: asset.cacheResult } : {}), video_id: asset.id, title: asset.title, source: asset.source, source_url: asset.sourceUrl,
      duration_seconds: asset.duration, source_reported_duration_seconds: asset.sourceReportedDuration ?? null, resolution: `${asset.width}x${asset.height}`, has_audio_in_cached_video: asset.hasAudio,
      audio_source: this.audioSource(asset),
      subtitle_state: asset.captions.state, subtitle_language: asset.captions.language ?? null,
      next_start_seconds: asset.cursor, cache_directory: this.folder(asset.id), resolver_id: asset.resolver_id ?? null };
  }
  async frames(asset, options, signal) {
    const count = bounded(options.frames, 6, 1, this.config.maxFrames, 'frames');
    if (!Number.isInteger(count)) throw new Error('frames must be an integer.');
    if (!options.overview && !options.timestamps?.length && options.start_seconds === undefined && (asset.cursor ?? 0) >= asset.duration) return [];
    // Request bounds describe the whole video, not the decoder's last seek point.
    const start = bounded(options.start_seconds, options.overview ? 0 : asset.cursor ?? 0, 0, asset.duration, 'start_seconds');
    const end = bounded(options.end_seconds, options.overview ? asset.duration : Math.min(start + 30, asset.duration), start, asset.duration, 'end_seconds');
    const requestedTimes = options.timestamps?.length ? options.timestamps.map(t => bounded(t, 0, 0, asset.duration, 'timestamp')) : null;
    if (!requestedTimes && start === end) {
      if (!options.overview) { asset.cursor = end; await this.save(asset); }
      return [];
    }
    const times = [...new Set(requestedTimes || sampleTimes(start, end, count))];
    if ((requestedTimes?.length ?? times.length) > this.config.maxFrames) throw new Error(`At most ${this.config.maxFrames} frames per call; request the next batch separately.`);
    const folder = join(this.folder(asset.id), 'frames');
    await mkdir(folder, { recursive: true });
    const result = [], emitted = new Set();
    let lastTime = Number.isFinite(asset.lastFrameSeconds) && asset.lastFrameSeconds >= 0 && asset.lastFrameSeconds <= asset.duration ? asset.lastFrameSeconds : undefined;
    const lastFrame = async () => {
      if (lastTime !== undefined) return lastTime;
      // Probe the actual final frame only when EOF/late seeking needs it. The
      // expanding read window is an I/O strategy, not a discarded tail margin.
      let window = 1;
      while (true) {
        const from = Math.max(0, asset.duration - window);
        const text = await run(this.config.ffprobePath, ['-v', 'error', '-select_streams', 'v:0',
          '-read_intervals', `${from + (asset.timelineStart || 0)}%`,
          '-show_entries', 'frame=best_effort_timestamp_time:stream=start_time', '-of', 'json', asset.mediaPath],
          this.folder(asset.id), signal, this.config.processTimeoutMs, 'tail-probe');
        const value = JSON.parse(text), origin = Number(value.streams?.[0]?.start_time) || 0;
        const positions = (value.frames || []).map(frame => Number((Number(frame.best_effort_timestamp_time) - origin).toFixed(6)))
          .filter(time => Number.isFinite(time) && time >= 0 && time < asset.duration);
        if (positions.length) return (lastTime = positions.reduce((last, time) => Math.max(last, time), 0));
        if (from === 0) throw new Error('The video has no readable final frame.');
        window *= 2;
      }
    };
    const decodeAt = async t => {
      const path = join(folder, `t${Math.round(t * 1000).toString().padStart(9, '0')}-w${this.config.frameWidth}.jpg`);
      const frameInfo = await stat(path).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
      const mediaInfo = await stat(asset.mediaPath);
      if (!frameInfo?.size || frameInfo.mtimeMs < mediaInfo.mtimeMs) {
        const pending = join(folder, `frame-${randomUUID()}.jpg`);
        try {
          await run(this.config.ffmpegPath, ['-nostdin', '-hide_banner', '-loglevel', 'error', '-y',
            '-threads', '1', '-ss', String(t), '-i', asset.mediaPath, '-frames:v', '1', '-an',
            '-vf', `scale=w='min(${this.config.frameWidth},iw)':h=-2:out_range=full`,
            '-pix_fmt', 'yuvj420p', '-q:v', '2', '-threads', '1', pending],
            this.folder(asset.id), signal, this.config.processTimeoutMs, 'frame');
          const decoded = await stat(pending).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
          if (!decoded?.size) return null;
          await rename(pending, path);
        } finally { await rm(pending, { force: true }); }
      }
      return path;
    };
    for (const requested of times) {
      signal.throwIfAborted();
      let t = requested === asset.duration ? await lastFrame() : requested;
      let path = await decodeAt(t);
      if (!path) {
        const last = await lastFrame();
        if (t > last) { t = last; path = await decodeAt(t); }
      }
      if (!path) throw new Error(`No frame decoded at ${requested}s.`);
      if (emitted.has(t)) continue;
      emitted.add(t);
      result.push({ seconds: t, timestamp: timecode(t), path,
        source_url: timestampUrl(asset.sourceUrl, t) });
    }
    if (!options.overview) {
      asset.cursor = (requestedTimes ? Math.max(...requestedTimes) : end) === asset.duration ? asset.duration : Math.min(asset.duration, Math.max(...result.map(frame => frame.seconds)) + 0.001);
      await this.save(asset);
    }
    return result;
  }
  transcript(asset, start = 0, end = asset.duration) {
    return { state: asset.captions.state, language: asset.captions.language ?? null,
      reason: asset.captions.reason ?? null,
      cues: asset.captions.cues.filter(c => c.end >= start && c.start <= end).map(c => ({ ...c, timestamp: timecode(c.start) })) };
  }
  async audioClip(asset, start, end, signal) {
    start = bounded(start, 0, 0, asset.duration, 'start_seconds');
    end = bounded(end, Math.min(start + 30, asset.duration), start, asset.duration, 'end_seconds');
    if (end === start) throw new Error('The selected audio range is empty.');
    if (end - start > this.config.maxAudioSeconds) throw new Error(`Analyze at most ${this.config.maxAudioSeconds}s of audio per call; continue with the next range.`);
    const folder = this.folder(asset.id);
    let source = this.audioSource(asset);
    if (source.state !== 'available') {
      if (asset.source !== 'bilibili') {
        const error = new Error('The cached media has no audio track. For a site resolver, return audioPath or a merged audio/video file.');
        error.code = 'NO_AUDIO'; throw error;
      }
      const media = await playback(asset.bvid, asset.cid, this.config.maxHeight, signal, this.nativeApi);
      if (!media.audio) {
        const error = new Error('The player offered no separate public audio track.');
        error.code = 'NO_AUDIO'; throw error;
      }
      const path = join(folder, 'audio.m4a');
      const remaining = byteBudget(this.config) - (asset.downloadBytes || 0);
      if (remaining <= 0) throw new BudgetExceededError('maxDownloadMB', this.config.maxDownloadMB);
      const bytes = await this.download([media.audio, ...(media.audioBackup || [])], path, asset.sourceUrl, signal, remaining);
      asset.downloadBytes = (asset.downloadBytes || 0) + bytes;
      source = { state: 'available', storage: 'separate', path };
    }
    if (source.storage === 'separate' && asset.audioPath !== source.path) {
      asset.audioPath = source.path; asset.hasSeparateAudio = true;
      await this.save(asset);
    }
    const stem = `audio-${Math.round(start * 1000)}-${Math.round(end * 1000)}`;
    const raw = join(folder, stem + '.pcm'), path = join(folder, stem + '.wav');
    const audioStat = await stat(source.path);
    let reuse = false;
    try { const info = await stat(raw); reuse = info.size > 0 && info.size % 2 === 0 && info.mtimeMs >= audioStat.mtimeMs; }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (!reuse) await run(this.config.ffmpegPath, ['-nostdin', '-hide_banner', '-loglevel', 'error', '-y',
      '-ss', String(start), '-i', source.path, '-t', String(end - start), '-vn', '-ac', '1', '-ar', '16000',
      '-f', 's16le', '-threads', '1', raw], folder, signal, this.config.processTimeoutMs, 'audio');
    const pcm = await readFile(raw);
    if (!pcm.length || pcm.length % 2) throw new Error('The selected audio range decoded no complete PCM samples.');
    const audio = wavFromPcm(pcm);
    if (!reuse || !existsSync(path)) await writeFile(path, audio);
    const duration = pcm.length / 32000;
    return { audio, pcm, path, sampleRate: 16000, sourceKind: source.storage, start, end: Math.min(end, start + duration), duration };
  }
}
