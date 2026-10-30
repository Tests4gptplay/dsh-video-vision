import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
const browserTestRoot = await mkdtemp(join(tmpdir(), 'dsh-smoke-browser-'));
process.env.DSH_BROWSER_SESSION_HOME = browserTestRoot;
const services = {};
import { parseBilibili, selectStreams } from '../lib/bilibili.js';
import { sampleTimes, timecode, VideoVision, DEFAULTS } from '../lib/engine.js';
import { makeTool, renderVideo, apply, name } from '../index.js';
import { cacheMarker } from '../lib/cache.js';
assert.equal(name, 'video-vision');
assert.equal(DEFAULTS.cacheDirectory, '.dsh-video-vision');
assert.equal(cacheMarker, '.video-vision.json');
const signal = new AbortController().signal;
assert.deepEqual(await parseBilibili('https://www.bilibili.com/video/BV1GTn66pEi3/?p=2&share_source=copy_web', signal), { bvid: 'BV1GTn66pEi3', page: 2 });
assert.deepEqual(await parseBilibili('BV1GTn66pEi3', signal), { bvid: 'BV1GTn66pEi3', page: 1 });
assert.equal(await parseBilibili('D:/example/video.mp4', signal), null);
assert.deepEqual(sampleTimes(0, 10, 3), [0, 5, 10]);
assert.equal(timecode(127.065), '02:07.065');
const streams = selectStreams({ dash: { video: [
  { height: 360, width: 640, codecs: 'avc1', baseUrl: 'low', id: 16, bandwidth: 10 },
  { height: 480, width: 852, codecs: 'avc1', baseUrl: 'high', id: 32, bandwidth: 20 }],
  audio: [{ baseUrl: 'audio', bandwidth: 30 }] } }, 720);
assert.equal(streams.video, 'high');
assert.equal(streams.audio, 'audio');
assert.equal(streams.videoOnly, true);
const image = { attachmentId: 'fixture-image', mediaType: 'image/jpeg', width: 852, height: 480, bytes: 10 };
const rendered = renderVideo({}, { action: 'watch', frames: [{ seconds: 42.355, timestamp: '00:42.355', path: 'frame.jpg', image }] });
assert.deepEqual(rendered.map(b => b.type), ['text', 'text', 'image']);
assert.equal(rendered[2].attachment, image);
assert.match(rendered[1].text, /42.355/);
let registered;
const ctx = { tools: { register: value => { registered = value; } }, workingDirectory: { ensure: async () => process.cwd() }, get: () => undefined, inject: () => {}, effect: fn => fn(), provide: (key, value) => { services[key] = value; } };
apply(ctx, {});
assert.equal(registered.name, 'video_vision');
assert.equal(typeof registered.execute, 'function');
assert.equal(registered.isConcurrencySafe(), false);
// DSH ToolDefinition: omit timeoutMs for no deadline; cancellation is exercised by audit-budgets.mjs.
assert.equal(makeTool(ctx).timeoutMs, undefined);
assert.equal(new VideoVision(process.cwd()).transcript({ duration: 100, captions: { state: 'available', cues: [{ start: 5, end: 7, text: 'test' }, { start: 20, end: 23, text: 'other' }] } }, 4, 8).cues.length, 1);
const { normalizeSource, webId, timestampUrl, parseCaptions, selectCaption, resolverArgs } = await import('../lib/ytdlp.js');
const youtube = 'https://www.youtube.com/watch?v=BaW_jenozKc';
for (const url of ['https://youtu.be/BaW_jenozKc?t=3', 'https://www.youtube.com/shorts/BaW_jenozKc', youtube + '&list=abc']) {
  assert.equal(normalizeSource(url), youtube);
  assert.equal(webId(url), webId(youtube));
}
assert.equal(new URL(timestampUrl(youtube, 12.9)).searchParams.get('t'), '12');
assert.equal(timestampUrl('https://vimeo.com/12345', 15), 'https://vimeo.com/12345#t=15s');
assert.equal(timestampUrl('https://example.com/video.mp4?token=abc', 5), 'https://example.com/video.mp4?token=abc');
assert.deepEqual(parseCaptions('WEBVTT\n\n00:00:01.000 --> 00:00:02.500\n<b>Hello</b> &amp; world\n', 'vtt'),
  [{ start: 1, end: 2.5, text: 'Hello & world' }]);
assert.deepEqual(parseCaptions('1\n00:01:01,500 --> 00:01:03,000\n字幕\n', 'srt'),
  [{ start: 61.5, end: 63, text: '字幕' }]);
assert.equal(parseCaptions(JSON.stringify({ events: [{ tStartMs: 2000, dDurationMs: 1500, segs: [{ utf8: 'hello' }, { utf8: ' world' }] }] }), 'json3')[0].text, 'hello world');
assert.equal(selectCaption({ subtitles: { en: [{ ext: 'vtt', url: 'https://example.com/a' }] },
  automatic_captions: { zh: [{ ext: 'json3', url: 'https://example.com/b' }] } }).kind, 'manual');
assert.equal(selectCaption({ language: 'en', automatic_captions: {
  zh: [{ ext: 'json3', url: 'https://example.com/b' }], 'en-orig': [{ ext: 'json3', url: 'https://example.com/a' }] } }).language, 'en-orig');
assert(resolverArgs({}).includes('--ignore-config'));
assert(!resolverArgs({}).includes('--cookies-from-browser'));
await services.browserSessions.status();
await rm(browserTestRoot, { recursive: true, force: true });
console.log('PASS: platform URLs, captions, stream selection, timestamp sampling, image rendering, tool registration and transcript ranges.');
