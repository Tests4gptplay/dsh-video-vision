import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile, readFile, stat, rm } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { analyzePcm, wavFromPcm } from '../lib/audio.js';
import { makeTool } from '../index.js';
import { run } from '../lib/process.js';
import { runMethod } from '../lib/extensions.js';
import { CacheManager } from '../lib/cache.js';
import { registerCacheTransport } from '../lib/settings.js';

const rate = 16000, seconds = 20, pcm = Buffer.alloc(rate * seconds * 2);
for (let i = 0; i < rate * seconds; i++) {
  const t = i / rate, phase = t % 0.5;
  const sample = phase < 0.08 ? 0.75 * Math.exp(-phase * 40) * Math.sin(2 * Math.PI * 160 * t) : 0;
  pcm.writeInt16LE(Math.round(sample * 32767), i * 2);
}
const pulse = analyzePcm(pcm, 40);
assert.equal(pulse.tempo.state, 'estimated');
assert(Math.abs(pulse.tempo.bpm - 120) < 3, JSON.stringify(pulse.tempo));
assert(pulse.prominent_onsets_seconds.every(s => s >= 40 && s < 60));
assert.equal(pulse.level_timeline[0].seconds, 40);
const silent = analyzePcm(Buffer.alloc(rate * 10 * 2));
assert.equal(silent.silent, true);
assert.equal(silent.tempo.bpm, null);
const tone = Buffer.alloc(rate * 10 * 2);
for (let i = 0; i < rate * 10; i++) tone.writeInt16LE(Math.round(10000 * Math.sin(2 * Math.PI * 440 * i / rate)), i * 2);
assert.equal(analyzePcm(tone).tempo.bpm, null, 'A steady tone is not assigned a musical pulse');

const base = resolve('test/.cache-tests');
await mkdir(base, { recursive: true });
const root = await mkdtemp(join(base, 'audio-'));
const config = { configDirectory: join(root, 'methods'), cacheDirectory: join(root, 'cache'),
  ffmpegPath: process.env.FFMPEG_PATH || 'ffmpeg', ffprobePath: process.env.FFPROBE_PATH || 'ffprobe',
  processTimeoutMs: 20000, downloadTimeoutMs: 20000 };
const signal = new AbortController().signal;
let recognitions = 0;
const recognizer = {
  snapshot: () => ({ providers: [{ id: 'sensevoice-local', preparation: { phase: 'ready' } }] }),
  resolve: spec => spec,
  transcribe: async (spec, receivedSignal) => {
    assert.equal(receivedSignal, signal);
    assert.equal(spec.audio.toString('ascii', 0, 4), 'RIFF');
    assert(spec.audio.length <= 15 * rate * 2 + 44);
    recognitions++;
    return { text: 'Controlled recognition fixture ' + recognitions };
  }
};
const context = provider => ({ workingDirectory: { ensure: async () => root },
  get: name => name === 'speechToText' ? provider : undefined });
const tool = makeTool(context(recognizer), config);
const execute = args => tool.execute(args, { agent: {}, signal });
try {
  const wav = join(root, 'pulse.wav'), video = join(root, 'picture.mp4'), merged = join(root, 'merged.mp4');
  await writeFile(wav, wavFromPcm(pcm));
  await run(config.ffmpegPath, ['-nostdin', '-hide_banner', '-loglevel', 'error', '-y',
    '-f', 'lavfi', '-i', 'color=c=blue:s=160x90:r=1', '-t', String(seconds),
    '-c:v', 'libx264', '-threads', '1', '-pix_fmt', 'yuv420p', video], root, signal, 20000, 'fixture');
  await run(config.ffmpegPath, ['-nostdin', '-hide_banner', '-loglevel', 'error', '-y',
    '-i', video, '-i', wav, '-c:v', 'copy', '-c:a', 'aac', '-shortest', merged], root, signal, 20000, 'fixture');
  const opened = await execute({ action: 'open', source: merged, frames: 1, language: 'ja' });
  assert.equal(opened.audio.state, 'available');
  assert.equal(opened.audio_source.storage, 'embedded');
  assert.equal(opened.audio.transcript.segments.length, 2);
  assert.equal(opened.audio.transcript.segments[0].start_seconds, 0);
  assert.equal(opened.audio.transcript.segments[1].start_seconds, 15);
  assert.equal(recognitions, 2);
  assert.equal(opened.audio.transcript.language, 'ja');
  assert((await stat(opened.audio.clip_path)).size > 44);
  assert((await stat(opened.frames[0].path)).size > 0);
  const again = await execute({ action: 'open', source: merged, frames: 1, language: 'ja' });
  assert.equal(recognitions, 2, 'Repeated viewing reuses recognition results');
  assert(again.audio.transcript.segments.every(s => s.cached));
  const visual = await execute({ action: 'watch', video_id: opened.video_id, timestamps: [3], audio_mode: 'off' });
  assert.equal(visual.audio.state, 'not-requested');
  assert.equal(recognitions, 2);
  const noProvider = await makeTool(context(undefined), config).execute({
    action: 'open', source: merged, frames: 1 }, { agent: {}, signal });
  assert.equal(noProvider.audio.state, 'available');
  assert.equal(noProvider.audio.transcript.state, 'needs-provider');
  assert(noProvider.frames.length);
  const failedProvider = { ...recognizer, transcribe: async () => { throw new Error('Fixture recognizer failure'); } };
  const partial = await makeTool(context(failedProvider), config).execute({
    action: 'watch', video_id: opened.video_id, start_seconds: 2, end_seconds: 4, frames: 1, language: 'en'
  }, { agent: {}, signal });
  assert.equal(partial.audio.transcript.state, 'unavailable');
  assert.match(partial.audio.transcript.reason, /Fixture recognizer failure/);
  assert.equal(partial.audio.state, 'available');
  assert(partial.frames.length);
  const voice = await execute({ action: 'transcribe', video_id: opened.video_id, start_seconds: 12, end_seconds: 18, language: 'ja' });
  assert.equal(voice.transcript.start_seconds, 12);
  assert.equal(voice.transcript.end_seconds, 18);
  assert.equal(voice.transcript.source, 'speech-recognition');
  const analysis = await execute({ action: 'audio', video_id: opened.video_id, start_seconds: 5, end_seconds: 15, audio_mode: 'analyze' });
  assert.equal(analysis.audio.transcript.state, 'not-requested');
  assert.deepEqual(analysis.audio.analyzed_range_seconds, [5, 15]);

  // An old Bilibili video-only manifest plus its separate cached audio remains usable.
  const legacy = await execute({ action: 'open', source: video, frames: 1, audio_mode: 'off' });
  const folder = legacy.cache_directory;
  const manifest = JSON.parse(await readFile(join(folder, 'manifest.json'), 'utf8'));
  manifest.source = 'bilibili';
  manifest.mediaPath = join(folder, 'video.mp4');
  await writeFile(manifest.mediaPath, await readFile(video));
  await writeFile(join(folder, 'manifest.json'), JSON.stringify(manifest));
  await run(config.ffmpegPath, ['-nostdin', '-hide_banner', '-loglevel', 'error', '-y',
    '-i', wav, '-c:a', 'aac', join(folder, 'audio.m4a')], root, signal, 20000, 'fixture');
  const separate = await execute({ action: 'audio', video_id: legacy.video_id, start_seconds: 0, end_seconds: 10, audio_mode: 'analyze' });
  assert.equal(separate.has_audio_in_cached_video, false);
  assert.equal(separate.audio_source.storage, 'separate');
  assert.equal(separate.audio.state, 'available');
  assert.equal(separate.audio.source_kind, 'separate');

  // The settings UI's extract RPC muxes full video/audio; individual-file extraction stays unchanged.
  const exported = join(root, 'export-with-audio.mp4');
  const manager = new CacheManager({ config, cwd: root, saveFile: async () => ({ path: exported }) });
  const routes = [];
  const dispose = registerCacheTransport({ fetch: { register: route => { routes.push(route); return () => {}; } } }, manager);
  const route = routes.find(r => r.path.endsWith('/extract'));
  const response = await route.fetch(new Request('http://localhost' + route.path, { method: 'POST',
    headers: { 'content-type': 'application/json' }, body: JSON.stringify({ type: 'client-request', rpcId: 'mux-test',
      method: 'video-vision/cache/extract', payload: { id: legacy.video_id } }) }));
  const extraction = (await response.json()).result;
  assert.equal(extraction.ok, true, JSON.stringify(extraction));
  assert.equal(extraction.value.merged_audio, true);
  const exportedInfo = JSON.parse(await run(config.ffprobePath, ['-v', 'error', '-show_streams', '-show_format',
    '-of', 'json', exported], root, signal, 20000, 'export-probe'));
  assert.deepEqual(exportedInfo.streams.map(s => s.codec_type), ['video', 'audio']);
  assert.deepEqual(exportedInfo.streams.map(s => s.codec_name), ['h264', 'aac']);
  assert(Math.abs(Number(exportedInfo.format.duration) - seconds) < 0.1);
  assert(Number(exportedInfo.streams.find(s => s.codec_type === 'audio').duration) > 19.9);
  // Existing cached source files and raw-file exports retain their bytes.
  const videoBefore = await readFile(manifest.mediaPath), audioBefore = await readFile(join(folder, 'audio.m4a'));
  const rawExport = await manager.extract(legacy.video_id, 'video.mp4', signal);
  assert.equal(rawExport.merged_audio, false);
  assert.deepEqual(await readFile(rawExport.path), videoBefore);
  await writeFile(join(folder, 'manifest.json'), JSON.stringify(manifest));
  const oldManifestExport = await manager.extract(legacy.video_id, undefined, signal);
  assert.equal(oldManifestExport.merged_audio, true, 'Legacy audio.m4a is also included');
  assert.deepEqual(await readFile(manifest.mediaPath), videoBefore);
  assert.deepEqual(await readFile(join(folder, 'audio.m4a')), audioBefore);
  dispose();

  // Execute a real site-method process returning separately downloaded tracks.
  const outputDirectory = join(root, 'resolver-output');
  await mkdir(outputDirectory);
  const modulePath = join(root, 'resolve.mjs');
  const code = `import { copyFile } from 'node:fs/promises'; import { join } from 'node:path';
export default async ({ outputDirectory }) => {
  await copyFile(${JSON.stringify(video)}, join(outputDirectory, 'video.mp4'));
  await copyFile(${JSON.stringify(wav)}, join(outputDirectory, 'sound.wav'));
  return { mediaPath: 'video.mp4', audioPath: 'sound.wav' };
};`;
  await writeFile(modulePath, code);
  const method = { id: 'fixture', name: 'Fixture', modulePath, revision: 'audio1' };
  const result = await runMethod(method, 'https://example.org/video', outputDirectory, { ...config, maxDownloadMB: 10 }, signal);
  assert.equal(result.audioPath, join(outputDirectory, 'sound.wav'));
  await writeFile(modulePath, code.replace("audioPath: 'sound.wav'", 'audioPath: ' + JSON.stringify(wav)));
  await assert.rejects(runMethod(method, 'https://example.org/video', outputDirectory,
    { ...config, maxDownloadMB: 10 }, signal), /audioPath must be inside/);

  const aborted = new AbortController(); aborted.abort();
  await assert.rejects(tool.execute({ action: 'open', source: merged }, { agent: {}, signal: aborted.signal }));
  console.log('PASS: 120 BPM/silence/tone signals, default A/V workflow, timed lyrics, recognition cache, source language, partial failures, visual-only mode, legacy separate sound, resolver audioPath and cancellation.');
} finally {
  if (!root.startsWith(base + sep)) throw new Error('Unexpected test directory');
  await rm(root, { recursive: true, force: true });
}
