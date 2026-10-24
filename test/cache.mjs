import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, stat, rm, symlink } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { CacheManager } from '../lib/cache.js';
import { VideoVision } from '../lib/engine.js';
import { registerCacheTransport, Config } from '../lib/settings.js';

const base = resolve('test/.cache-tests');
await mkdir(base, { recursive: true });
const testRoot = await mkdtemp(join(base, 'run-'));
const root = join(testRoot, 'cache');
const destination = join(testRoot, 'moved');
const exports = join(testRoot, 'exports');
const id = 'web-0123456789abcdef0123';
const localId = 'local-0123456789abcdef';
let configured = root;
const config = { cacheDirectory: { get: () => configured } };
let revealCount = 0, canceled = false;
const openedPaths = [];
const cache = new CacheManager({ config, cwd: testRoot, persist: async path => { configured = path; },
  openFolder: async path => { revealCount++; openedPaths.push(path); },
  saveFile: async name => { await mkdir(exports, { recursive: true }); return canceled ? { canceled: true } : { path: join(exports, name) }; } });
try {
  await mkdir(join(root, id, 'frames'), { recursive: true });
  await mkdir(join(root, localId));
  await writeFile(join(root, id, 'video.mp4'), 'video bytes');
  await writeFile(join(root, id, 'frames', 'frame.jpg'), 'frame');
  await writeFile(join(root, id, 'manifest.json'), JSON.stringify({ id, title: '测试视频', source: 'youtube', sourceUrl: 'https://example.org/watch',
    mediaPath: join(root, id, 'video.mp4'), duration: 12, cursor: 4, captions: { cues: [] } }));
  const original = join(testRoot, 'original.mp4');
  await writeFile(original, 'original');
  await writeFile(join(root, localId, 'manifest.json'), JSON.stringify({ id: localId, source: 'local', mediaPath: original }));
  await writeFile(join(root, 'latest.json'), JSON.stringify({ id }));
  await writeFile(join(root, 'unrelated.txt'), 'keep me');
  const listing = await cache.list();
  assert.equal(listing.entries.length, 2);
  assert.equal(listing.entries.find(e => e.id === id).mediaFile, 'video.mp4');
  assert(listing.bytes > listing.managedBytes);
  const extracted = await cache.extract(id);
  assert.equal(await readFile(extracted.path, 'utf8'), 'video bytes');
  await cache.extract(id);
  canceled = true;
  assert.deepEqual(await cache.extract(id), { canceled: true });
  canceled = false;
  await cache.reveal(id);
  await cache.reveal(id);
  assert.equal(revealCount, 2);
  await cache.reveal();
  await cache.reveal(undefined, true);
  assert.deepEqual(openedPaths.slice(-2), [root, join(root, 'videos')]);
  assert.equal(new VideoVision(testRoot, { cacheDirectory: root }).folder('new-id'), join(root, 'videos', 'new-id'));
  const frame = await cache.extract(id, 'frames/frame.jpg');
  assert.equal(await readFile(frame.path, 'utf8'), 'frame');
  await assert.rejects(() => cache.remove(id, '../original.mp4'), /不存在/);
  await cache.use(testRoot, async () => {
    await assert.rejects(() => cache.remove(id), /正在使用/);
    await assert.rejects(() => cache.relocate(destination), /正在使用/);
  });
  await cache.relocate(destination);
  const manifest = JSON.parse(await readFile(join(destination, 'videos', id, 'manifest.json')));
  assert.equal(manifest.mediaPath, join(destination, 'videos', id, 'video.mp4'));
  assert.equal(manifest.cursor, 4);
  assert.equal(JSON.parse(await readFile(join(destination, 'videos', localId, 'manifest.json'))).mediaPath, original);
  assert.equal(JSON.parse(await readFile(join(destination, 'latest.json'))).id, id);
  assert.equal(await readFile(join(root, 'unrelated.txt'), 'utf8'), 'keep me');
  await assert.rejects(() => stat(join(root, id)), { code: 'ENOENT' });
  await cache.remove(id, 'frames/frame.jpg');
  await assert.rejects(() => stat(join(destination, 'videos', id, 'frames/frame.jpg')), { code: 'ENOENT' });
  await cache.remove(localId);
  assert.equal(await readFile(original, 'utf8'), 'original');
  await writeFile(join(destination, 'unrelated.txt'), 'keep');
  await cache.clear();
  assert.equal((await cache.list()).entries.length, 0);
  assert.equal(await readFile(join(destination, 'unrelated.txt'), 'utf8'), 'keep');
  assert.equal(await readFile(extracted.path, 'utf8'), 'video bytes');
  assert.equal(await readFile(original, 'utf8'), 'original');

  const routes = [];
  const dispose = registerCacheTransport({ fetch: { register: r => { routes.push(r); return () => {}; } } }, cache);
  const route = routes.find(r => r.path.endsWith('/list'));
  const response = await route.fetch(new Request('http://localhost' + route.path, { method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'client-request', rpcId: 'test-1', method: 'codex-vision/cache/list', payload: {} }) }));
  const state = (await response.json()).result.value;
  assert.equal(state.root, destination);
  assert.equal(state.videoDirectory, join(destination, 'videos'));
  const revealRoute = routes.find(r => r.path.endsWith('/reveal'));
  for (const payload of [{}, { videos: true }]) {
    const result = await revealRoute.fetch(new Request('http://localhost' + revealRoute.path, { method: 'POST',
      headers: { 'content-type': 'application/json' }, body: JSON.stringify({ type: 'client-request', rpcId: 'open', method: 'codex-vision/cache/reveal', payload }) }));
    assert.equal((await result.json()).result.ok, true);
  }
  assert.deepEqual(openedPaths.slice(-2), [destination, join(destination, 'videos')]);
  assert(Config.dict.cacheDirectory.meta.volatile);
  dispose();
  console.log('PASS: cache listing, file extraction, relocation, live settings, scoped deletion, busy jobs, local originals and RPC.');
} finally {
  // Only the isolated directory created by this test is removed.
  if (!testRoot.startsWith(base + '\\')) throw new Error('Unexpected test directory');
  await rm(testRoot, { recursive: true, force: true });
}
