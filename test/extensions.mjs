import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir, mkdtemp, readFile, writeFile, stat, rm } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { once } from 'node:events';
import { ensureConfiguration, listMethods } from '../lib/extensions.js';
import { makeTool } from '../index.js';
import { CacheManager } from '../lib/cache.js';
import { run } from '../lib/process.js';

const base = resolve('test/.cache-tests');
await mkdir(base, { recursive: true });
const root = await mkdtemp(join(base, 'extensions-'));
const config = { configDirectory: join(root, 'configuration'), cacheDirectory: join(root, 'cache'),
  ffmpegPath: process.env.FFMPEG_PATH || 'ffmpeg', ffprobePath: process.env.FFPROBE_PATH || 'ffprobe',
  downloadTimeoutMs: 10000, processTimeoutMs: 10000 };
const signal = new AbortController().signal;
let requests = 0;
let fixture;
const server = createServer((request, response) => {
  requests++;
  if (request.url === '/fixture.mp4') { response.setHeader('content-type', 'video/mp4'); response.end(fixture); }
  else { response.setHeader('content-type', 'application/json'); response.end(JSON.stringify({ media: '/fixture.mp4' })); }
});
const ctx = { workingDirectory: { ensure: async () => root }, get: () => undefined };
const tool = makeTool(ctx, config);
const execute = args => tool.execute(args, { agent: {}, signal });
try {
  const initial = await execute({ action: 'status' });
  assert.equal(initial.method_guidance.action, 'methods');
  assert.equal((await stat(initial.method_guidance.path)).isFile(), true);
  const directory = await ensureConfiguration(config);
  const guidance = join(directory, 'GUIDANCE.md');
  const original = await readFile(guidance, 'utf8');
  await writeFile(guidance, original + '\nUser-owned note.\n');
  await ensureConfiguration(config);
  assert((await readFile(guidance, 'utf8')).endsWith('User-owned note.\n'));
  const methods = await execute({ action: 'methods' });
  assert.equal(methods.directory, directory);
  assert.match(methods.guidance, /User-owned note/);
  assert.equal(methods.backup.resolver, 'yt-dlp');

  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const source = 'http://127.0.0.1:' + server.address().port + '/watch/demo';
  const missing = await execute({ action: 'open', source });
  assert.equal(missing.state, 'needs_method');
  assert.equal(requests, 0, 'No silent yt-dlp installation or speculative online request');

  await run(config.ffmpegPath, ['-nostdin', '-hide_banner', '-loglevel', 'error', '-y',
    '-f', 'lavfi', '-i', 'testsrc=size=160x90:rate=2', '-t', '2', '-pix_fmt', 'yuv420p',
    '-threads', '1', join(root, 'fixture.mp4')], root, signal, 10000, 'fixture');
  fixture = await readFile(join(root, 'fixture.mp4'));
  const methodDirectory = join(directory, 'resolvers', 'fixture');
  await mkdir(methodDirectory);
  const manifestPath = join(methodDirectory, 'manifest.json');
  const manifest = { name: 'Fixture resolver', hosts: ['127.0.0.1'], pathPrefix: '/watch/', enabled: false };
  await writeFile(manifestPath, JSON.stringify(manifest));
  const modulePath = join(methodDirectory, 'resolve.mjs');
  const code = `import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
export default async ({ source, outputDirectory, signal }) => {
  const metadata = await (await fetch(source, { signal })).json();
  const media = await fetch(new URL(metadata.media, source), { signal });
  await writeFile(join(outputDirectory, 'video.mp4'), Buffer.from(await media.arrayBuffer()));
  return { title: 'Downloaded fixture', mediaPath: 'video.mp4',
    captions: { language: 'en', cues: [{ start: 0, end: 1, text: 'Frame test' }] } };
};`;
  await writeFile(modulePath, code);
  assert.equal((await listMethods(config, source)).methods[0].matches, true);
  assert.equal((await listMethods(config, source.replace('/watch/', '/other/'))).methods[0].matches, false);
  assert.equal((await execute({ action: 'open', source })).state, 'needs_method');

  const first = await execute({ action: 'open', source, resolver: 'fixture', frames: 1 });
  assert.equal(first.method_guidance.path, guidance);
  assert.equal(missing.method_guidance.path, guidance);
  assert.equal(methods.method_guidance.path, guidance);
  assert.equal(first.resolver_id, 'fixture');
  assert.equal(first.resolution, '160x90');
  assert.equal(first.transcript.cues[0].text, 'Frame test');
  assert((await stat(first.frames[0].path)).size > 0, 'Actual child-process download, probe and frame decode');
  assert.equal(requests, 2);
  for (const action of ['status', 'transcript', 'transcribe', 'watch']) {
    const result = await execute({ action, video_id: first.video_id, timestamps: [0] });
    assert.equal(result.method_guidance.path, guidance);
  }
  await assert.rejects(execute({ action: 'open', source: join(root, 'missing.mp4') }),
    error => error.message.includes(guidance) && error.message.includes('video_vision methods'));
  await execute({ action: 'open', source, resolver: 'fixture', frames: 1 });
  assert.equal(requests, 2, 'Successful video cache is reused');

  await writeFile(modulePath, code.replace('Downloaded fixture', 'Updated fixture'));
  const updated = await execute({ action: 'open', source, resolver: 'fixture', frames: 1 });
  assert.notEqual(updated.video_id, first.video_id);
  assert.equal(updated.title, 'Updated fixture');
  assert.equal(requests, 4, 'Explicit test is tied to changed method code');

  await writeFile(manifestPath, JSON.stringify({ ...manifest, enabled: true }));
  const automatic = await execute({ action: 'open', source, frames: 1 });
  assert.equal(automatic.resolver_id, 'fixture');
  assert.equal(requests, 6);
  await execute({ action: 'open', source, frames: 1 });
  assert.equal(requests, 6, 'Enabled method is reused automatically without repeating download');

  // A broken native Bilibili request can use a saved repair, without changing the built-in resolver.
  await writeFile(manifestPath, JSON.stringify({ ...manifest, hosts: ['127.0.0.1', 'www.bilibili.com'],
    pathPrefix: '/', enabled: true }));
  await writeFile(modulePath, code.replace('({ source, outputDirectory, signal }) => {',
    '({ outputDirectory, signal }) => { const source = ' + JSON.stringify(source) + ';'));
  const fetchOriginal = globalThis.fetch;
  try {
    globalThis.fetch = async () => { throw new Error('Native request fixture failure'); };
    const repaired = await execute({ action: 'open', source: 'BV1GTn66pEi3', frames: 1 });
    assert.equal(repaired.resolver_id, 'fixture');
    assert((await stat(repaired.frames[0].path)).size > 0);
  } finally { globalThis.fetch = fetchOriginal; }

  const cache = new CacheManager({ config, cwd: root, persist: async path => { config.cacheDirectory = path; } });
  await cache.relocate(join(root, 'moved-cache'));
  await cache.clear();
  assert((await readFile(guidance, 'utf8')).endsWith('User-owned note.\n'));
  assert.equal((await stat(modulePath)).isFile(), true);
  console.log('PASS: persistent guidance, draft/active methods, child-process download and frames, revision-aware trials, Bilibili repair, cache-independent extensions.');
} finally {
  server.closeAllConnections();
  if (server.listening) await new Promise(resolve => server.close(resolve));
  if (!root.startsWith(base + sep)) throw new Error('Unexpected test directory');
  await rm(root, { recursive: true, force: true });
}
