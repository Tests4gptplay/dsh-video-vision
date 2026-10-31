import { byteBudget, BudgetExceededError, isBudgetError } from './budgets.js';
import { createHash } from 'node:crypto';
import { stat } from 'node:fs/promises';
import { resolve, relative, isAbsolute, basename } from 'node:path';
import { run } from './process.js';
import { resolverPath, nodeRuntime } from './dependencies.js';
import { prepareResolver } from './prepare.js';

export function normalizeSource(source) {
  const url = new URL(source.trim());
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Use an HTTP or HTTPS video URL.');
  const host = url.hostname.toLowerCase();
  if (host === 'youtu.be' || host === 'youtube.com' || host.endsWith('.youtube.com') ||
      host === 'youtube-nocookie.com' || host.endsWith('.youtube-nocookie.com')) {
    const id = host === 'youtu.be' ? url.pathname.split('/')[1] :
      url.searchParams.get('v') ?? url.pathname.match(/^\/(?:shorts|embed|live)\/([^/]+)/)?.[1];
    if (id && /^[\w-]{11}$/.test(id)) return 'https://www.youtube.com/watch?v=' + id;
  }
  return url.href;
}
export function webId(source) {
  return 'web-' + createHash('sha256').update(normalizeSource(source)).digest('hex').slice(0, 20);
}
export function timestampUrl(source, seconds) {
  if (!source) return null;
  const url = new URL(source);
  const host = url.hostname.toLowerCase();
  if (host === 'youtu.be' || /(^|\.)(youtube\.com|bilibili\.com)$/.test(host)) {
    url.searchParams.set('t', String(Math.floor(seconds)));
  } else if (/(^|\.)vimeo\.com$/.test(host)) {
    url.hash = 't=' + Math.floor(seconds) + 's';
  }
  return url.href;
}

function decodeText(value) {
  return String(value).replace(/<[^>]*>/g, '').replace(/&(?:amp|lt|gt|quot|apos|nbsp);|&#(?:x[\da-f]+|\d+);/gi, entity => {
    const named = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'", '&nbsp;': ' ' };
    if (named[entity]) return named[entity];
    const code = entity[2].toLowerCase() === 'x' ? parseInt(entity.slice(3), 16) : parseInt(entity.slice(2), 10);
    return Number.isInteger(code) && code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : entity;
  }).trim();
}
function cueTime(value) {
  return value.replace(',', '.').split(':').reduce((total, part) => total * 60 + Number(part), 0);
}
export function parseCaptions(body, format) {
  let cues = [];
  if (format === 'json3') {
    cues = (JSON.parse(body).events ?? []).filter(e => e.segs).map(e => ({
      start: Number(e.tStartMs) / 1000,
      end: (Number(e.tStartMs) + Number(e.dDurationMs ?? 0)) / 1000,
      text: decodeText(e.segs.map(s => s.utf8 ?? '').join(''))
    }));
  } else {
    const lines = body.replace(/^\uFEFF/, '').replace(/\r/g, '').split('\n');
    for (let i = 0; i < lines.length; i++) {
      const match = lines[i].match(/^\s*((?:\d+:)?\d{2}:\d{2}[.,]\d+)\s+-->\s+((?:\d+:)?\d{2}:\d{2}[.,]\d+)/);
      if (!match) continue;
      const text = [];
      while (i + 1 < lines.length && lines[i + 1].trim()) text.push(lines[++i]);
      cues.push({ start: cueTime(match[1]), end: cueTime(match[2]), text: decodeText(text.join('\n')) });
    }
  }
  return cues.filter(c => c.text && Number.isFinite(c.start) && Number.isFinite(c.end) && c.end >= c.start);
}
export function selectCaption(info, languages = ['zh-Hans', 'zh-Hant', 'zh', 'en', 'ja']) {
  for (const [kind, tracks] of [['manual', info.subtitles], ['automatic', info.automatic_captions]]) {
    const keys = Object.keys(tracks ?? {}).filter(k => k !== 'live_chat' &&
      tracks[k].some(t => t.url && ['json3', 'vtt', 'srt'].includes(t.ext)));
    if (!keys.length) continue;
    const order = kind === 'automatic' ? [info.language + '-orig', info.language, ...languages] : languages;
    const language = order.find(l => keys.includes(l)) ?? keys.find(l => l.endsWith('-orig')) ?? keys[0];
    const formats = tracks[language];
    const track = ['json3', 'vtt', 'srt'].map(ext => formats.find(t => t.ext === ext && t.url)).find(Boolean);
    return { kind, language, track };
  }
  return null;
}
async function captions(info, config, signal) {
  const selected = selectCaption(info, config.subtitleLanguages);
  if (!selected) return { state: 'none', tracks: [], cues: [] };
  const { language, kind, track } = selected;
  try {
    const response = await fetch(track.url, {
      headers: info.http_headers,
      signal: AbortSignal.any([signal, AbortSignal.timeout(20000)])
    });
    if (!response.ok) throw new Error('Subtitle HTTP ' + response.status);
    const cues = parseCaptions(await response.text(), track.ext);
    return { state: cues.length ? 'available' : 'none', language, kind,
      tracks: [{ language, kind }], cues };
  } catch (error) {
    signal.throwIfAborted();
    return { state: 'unavailable', language, kind, reason: error.message, tracks: [{ language, kind }], cues: [] };
  }
}

export function resolverArgs(config) {
  const args = ['--ignore-config', '--no-cookies', '--no-cookies-from-browser', '--no-plugin-dirs',
    '--no-playlist', '--playlist-items', '1', '--no-progress',
    '--no-colors', '--no-cache-dir', '--retries', '1', '--fragment-retries', '1',
    '--extractor-retries', '1', '--socket-timeout', '20',
    '--js-runtimes', 'node:' + nodeRuntime(config)];
  if (config.ffmpegPath && config.ffmpegPath !== 'ffmpeg') args.push('--ffmpeg-location', config.ffmpegPath);
  // The backup stays anonymous even when native-browser authorization is enabled.
  if (config.proxy) args.push('--proxy', config.proxy);
  return args;
}
export function anonymousEnvironment(source = process.env) {
  const keep = new Set(['PATH', 'SYSTEMROOT', 'WINDIR', 'COMSPEC', 'PATHEXT', 'LANG', 'LC_ALL']);
  return Object.fromEntries(Object.entries(source).filter(([key]) => keep.has(key.toUpperCase())));
}
export async function invokeResolver(args, folder, config, signal, stem) {
  const invoke = async executable => {
    let output;
    try { output = await run(executable, args, folder, signal, config.downloadTimeoutMs, stem, true, anonymousEnvironment(),
      { budgetSetting: 'downloadTimeoutMs', captureOutput: true }); }
    catch (error) {
      signal.throwIfAborted();
      if (isBudgetError(error)) throw error;
      if (maxFilesizeRejected(error, args, config)) throw new BudgetExceededError('maxDownloadMB', config.maxDownloadMB, { cause: error });
      throw error;
    }
    const diagnostic = maxFilesizeRejected(output, args, config);
    if (diagnostic)
      throw new BudgetExceededError('maxDownloadMB', config.maxDownloadMB, { cause: new Error(diagnostic) });
    return output.stdout;
  };
  try {
    return await invoke(resolverPath(config));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    if (config.ytDlpPath) throw new Error('The configured ytDlpPath was not found: ' + config.ytDlpPath, { cause: error });
    const executable = await prepareResolver({ signal });
    return invoke(executable);
  }
}
function maxFilesizeRejected(output, args, config) {
  const index = args.indexOf('--max-filesize'), limit = Math.floor(byteBudget(config));
  if (index < 0 || !Number.isFinite(limit) || Number(args[index + 1]) !== limit) return false;
  // Match yt-dlp's specific measured-size diagnostic, not "no output" or a
  // generic timeout. Source: yt_dlp/downloader/http.py, max_filesize branch.
  const lines = `${output.stdout || ''}\n${output.stderr || ''}`.split(/[\r\n]+/);
  return lines.find(line => {
    const match = line.match(/^\[download\] File is larger than max-filesize \((\d+) bytes > (\d+) bytes\)\. Aborting\.$/);
    return match && Number(match[2]) === limit && Number(match[1]) > limit;
  });
}
export async function downloadWeb(source, folder, config, signal) {
  source = normalizeSource(source);
  const common = resolverArgs(config);
  const raw = await invokeResolver([...common, '--dump-single-json', '--', source], folder, config, signal, 'metadata');
  let info = JSON.parse(raw);
  const playlist = Array.isArray(info.entries);
  if (playlist) info = info.entries.find(Boolean);
  if (!info) throw new Error('No video was returned for this URL.');
  if (info.is_live || info.live_status === 'is_live' || info.live_status === 'is_upcoming') {
    throw new Error('This URL is a live or upcoming broadcast. Open its completed replay to view timestamped frames.');
  }
  if (info.has_drm) throw new Error('This video requires the platform DRM player.');
  const budget = byteBudget(config);
  const height = Number(config.maxHeight ?? 0);
  if (!Number.isFinite(height) || height < 0) throw new Error('maxHeight must be zero (unlimited) or a positive number.');
  if (!(budget > 0)) throw new Error('maxDownloadMB must be zero (unlimited) or a positive number.');
  const format = height === 0 ? 'bv*+ba/b/bv' : `bv*[height<=${height}]+ba/b[height<=${height}]/bv[height<=${height}]`;
  const downloadUrl = playlist ? info.webpage_url || source : source;
  const output = await invokeResolver([...common, '--no-simulate',
    '--match-filter', '!is_live & !is_upcoming',
    '--format', format,
    '--merge-output-format', 'mkv', ...(Number.isFinite(budget) ? ['--max-filesize', String(Math.floor(budget)), '--no-quiet'] : []),
    '--paths', folder, '--output', 'video.%(ext)s', '--print', 'after_move:filepath',
    '--', downloadUrl], folder, config, signal, 'download');
  const printed = output.trim().split(/\r?\n/).filter(Boolean).at(-1);
  if (!printed) throw new Error('The resolver did not produce a video; no specific budget failure was reported.');
  const mediaPath = resolve(folder, printed);
  const within = relative(folder, mediaPath);
  if (isAbsolute(within) || within.startsWith('..') || !basename(mediaPath).startsWith('video.')) {
    throw new Error('The resolver returned an unexpected output path.');
  }
  const file = await stat(mediaPath);
  if (!file.isFile() || !file.size) throw new Error('The downloaded video is empty.');
  if (file.size > budget) throw new BudgetExceededError('maxDownloadMB', config.maxDownloadMB);
  // Keep only user-facing metadata; stream URLs and request headers stay transient.
  return { source: String(info.extractor_key ?? info.extractor ?? 'web').toLowerCase(),
    platformVideoId: String(info.id ?? ''), title: String(info.title ?? info.id ?? 'Online video'),
    sourceUrl: downloadUrl, mediaPath, downloadBytes: file.size,
    captions: await captions(info, config, signal) };
}
