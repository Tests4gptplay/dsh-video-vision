// Real engine/resolver subprocess and synthetic media/probe only. No browser, credentials or network.
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { VideoVision } from '../lib/engine.js';
import { makeTool } from '../index.js';
import { CacheManager } from '../lib/cache.js';
const root = await mkdtemp(join(tmpdir(), 'video-vision-refresh-test-'));
const control = join(root, 'control.json'), calls = join(root, 'calls.jsonl'), started = join(root, 'started');
const source = 'https://fixture.invalid/watch';
const signal = () => new AbortController().signal;
const config = { cacheDirectory: join(root, 'cache'), configDirectory: join(root, 'config'), maxHeight: 720 };
const controlWrite = value => writeFile(control, JSON.stringify(value));
async function files(folder, prefix = '') {
  const output = {};
  for (const entry of await readdir(join(folder, prefix), { withFileTypes: true })) {
    const name = prefix ? prefix + '/' + entry.name : entry.name;
    if (entry.isDirectory()) Object.assign(output, await files(folder, name));
    else output[name] = (await readFile(join(folder, name))).toString('base64');
  }
  return output;
}
async function callList() { return (await readFile(calls, 'utf8')).trim().split('\n').map(JSON.parse); }
try {
  const method = join(config.configDirectory, 'resolvers', 'fixture');
  await mkdir(method, { recursive: true });
  await writeFile(join(method, 'manifest.json'), JSON.stringify({ name: 'Synthetic fixture', hosts: ['fixture.invalid'] }));
  await writeFile(join(method, 'resolve.mjs'), `import {readFile,writeFile,appendFile} from 'node:fs/promises';
import {join} from 'node:path';
export default async function(input) {
 const fixture = JSON.parse(await readFile(${JSON.stringify(control)},'utf8'));
 await appendFile(${JSON.stringify(calls)},JSON.stringify({maxHeight:input.maxHeight,mode:fixture.mode||'ok'})+'\\n');
 await writeFile(join(input.outputDirectory,'video.fixture'),JSON.stringify(fixture));
 if(fixture.mode==='fail') throw Error('synthetic acquisition failure');
 if(fixture.mode==='wait') { await writeFile(${JSON.stringify(started)},'started'); await new Promise(()=>{setInterval(()=>{},1000);}); }
 return {mediaPath:'video.fixture',title:fixture.title,captions:{cues:[{start:0,end:1,text:fixture.title}]}};
}`);
  const engine = new VideoVision(root, config);
  engine.probe = async path => {
    const fixture = JSON.parse(await readFile(path, 'utf8'));
    if (fixture.mode === 'invalid') throw Object.assign(Error('synthetic invalid media'), { code: 'INVALID_MEDIA' });
    return { duration: fixture.duration, width: fixture.height * 16 / 9, height: fixture.height, hasAudio: false, frameRate: '30/1', timelineStart: 0 };
  };
  await controlWrite({ title: 'old', height: 720, duration: 100 });
  let asset = await engine.open(source, signal(), 'auto');
  assert.equal(engine.summary(asset).cache.state, 'acquired');
  asset.cursor = 80; await engine.save(asset);
  const folder = engine.folder(asset.id);
  await mkdir(join(folder, 'frames'));
  for (const file of ['frames/old.jpg', 'audio.m4a', 'audio-0-10.wav', 'speech-old.json']) await writeFile(join(folder, file), 'old-derived');
  await controlWrite({ title: 'new', height: 1080, duration: 50 });
  asset = await engine.open(source, signal(), 'auto', { max_height: 1080 });
  assert.equal(engine.summary(asset).cache.state, 'hit');
  assert.equal(engine.summary(asset).duration_seconds, 100);
  assert.equal(engine.summary(asset).source_reported_duration_seconds, null, 'Legacy/custom cache has no known source duration');
  assert.equal(asset.height, 720); assert.equal(asset.cursor, 80); assert.equal((await callList()).length, 1);
  asset = await engine.open(source, signal(), 'auto', { refresh: true, max_height: 1080 });
  assert.equal(engine.summary(asset).cache.state, 'refreshed');
  assert.equal(engine.summary(asset).resolution, '1920x1080');
  assert.equal(asset.cursor, 50, 'Progress is clamped only to the new duration');
  assert.equal(asset.captions.cues[0].text, 'new');
  const refreshedFiles = await files(folder);
  for (const name of ['frames/old.jpg', 'audio.m4a', 'audio-0-10.wav', 'speech-old.json']) assert.equal(refreshedFiles[name], undefined, name);
  assert.equal(JSON.parse(await readFile(asset.mediaPath, 'utf8')).title, 'new');
  assert.equal((await callList())[1].maxHeight, 1080);
  assert.equal(engine.config.maxHeight, 720); assert.equal(config.maxHeight, 720);
  assert.equal((await engine.load(asset.id)).cursor, 50);
  await controlWrite({ title: 'unlimited', height: 2160, duration: 100 });
  asset = await engine.open(source, signal(), 'auto', { refresh: true, max_height: 0 });
  assert.equal(asset.cursor, 50, 'Progress survives replacement when the new duration permits it');
  assert.equal(asset.height, 2160); assert.equal((await callList()).at(-1).maxHeight, 0);
  assert.equal(engine.config.maxHeight, 720, 'Unlimited override does not overwrite global settings');
  await writeFile(asset.mediaPath, JSON.stringify({ mode: 'invalid' }));
  asset = await engine.open(source, signal(), 'auto', { refresh: true });
  assert.equal(asset.cursor, 50, 'A valid manifest retains progress even when old media is corrupt');
  await rm(asset.mediaPath);
  asset = await engine.open(source, signal(), 'auto', { refresh: true });
  assert.equal(asset.cursor, 50, 'A valid manifest retains progress even when old media is missing');
  const stable = await files(folder);
  for (const mode of ['fail', 'invalid']) {
    await controlWrite({ title: 'bad', height: 2160, duration: 100, mode });
    await assert.rejects(engine.open(source, signal(), 'auto', { refresh: true, max_height: 0 }));
    assert.deepEqual(await files(folder), stable, `${mode} must preserve all old bytes and progress`);
  }
  await controlWrite({ title: 'aborted', height: 2160, duration: 100, mode: 'wait' });
  const abort = new AbortController();
  const pending = engine.open(source, abort.signal, 'auto', { refresh: true });
  // Harness watchdog only; production has no added timeout.
  const deadline = Date.now() + 10000;
  while (true) {
    try { await readFile(started); break; } catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (Date.now() >= deadline) { abort.abort(); throw Error('Synthetic resolver did not reach cancellation checkpoint'); }
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  abort.abort(Error('synthetic user cancellation'));
  await assert.rejects(pending, /synthetic user cancellation/);
  assert.deepEqual(await files(folder), stable, 'Cancel must preserve all old bytes and progress');
  assert.equal((await callList()).at(-1).maxHeight, 720, 'Absent override still respects global setting');
  await controlWrite({ title: '15-second fixture; source duration unknown', height: 1080, duration: 15 });
  asset = await engine.open(source, signal(), 'auto', { refresh: true });
  assert.equal(engine.summary(asset).duration_seconds, 15, 'Report the actual measured file duration');
  assert.equal(engine.summary(asset).source_reported_duration_seconds, null, 'Do not claim a short fixture is the complete source');
  const localSource = join(root, 'local-video.fixture');
  const originalLocalBytes = Buffer.from(JSON.stringify({ title: 'local', height: 1080, duration: 30 }));
  await writeFile(localSource, originalLocalBytes);
  const local = await engine.open(localSource, signal());
  local.cursor = 12; await engine.save(local);
  const refreshedLocal = await engine.open(localSource, signal(), 'auto', { refresh: true });
  assert.deepEqual(await readFile(localSource), originalLocalBytes, 'Refresh never alters the external local media source');
  assert.equal(refreshedLocal.mediaPath, localSource); assert.equal(refreshedLocal.cursor, 12);
  assert.equal(engine.summary(refreshedLocal).duration_seconds, 30);
  assert.equal(engine.summary(refreshedLocal).source_reported_duration_seconds, null);
  // Existing CacheManager mutual exclusion is instance-local, not a cross-process lock.
  const cache = new CacheManager({ config, cwd: root });
  let releaseRead;
  const reading = cache.use(root, () => new Promise(resolve => { releaseRead = resolve; }));
  await assert.rejects(cache.change(async () => {}), /正在使用缓存/);
  releaseRead(); await reading;
  let releaseWrite;
  const writing = cache.change(() => new Promise(resolve => { releaseWrite = resolve; }));
  await assert.rejects(cache.use(root, async () => {}), /缓存正在整理/);
  releaseWrite(); await writing;
  assert.equal(cache.readers, 0); assert.equal(cache.writing, false);
  const schema = makeTool({}, config).parameters.properties;
  assert.equal(schema.refresh.type, 'boolean'); assert.equal(schema.max_height.type, 'integer'); assert.equal(schema.max_height.minimum, 0);
  await assert.rejects(engine.open(source, signal(), 'auto', { max_height: -1 }), /max_height/);
  await assert.rejects(engine.open(source, signal(), 'auto', { refresh: 'yes' }), /refresh/);
  console.log('PASS open refresh: actual resolver subprocess, default cache hit, explicit replacement, actual dimensions, derived-cache consistency, progress clamp, failure/invalid/cancel byte preservation, per-request quality isolation, measured versus unknown source duration, unchanged local source, instance-local cache gates and tool schema. Synthetic media/probe only.');
} finally { await rm(root, { recursive: true, force: true }); }
