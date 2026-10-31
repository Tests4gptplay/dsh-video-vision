import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, chmod, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DEFAULTS, VideoVision } from '../lib/engine.js';
import { Config } from '../lib/settings.js';
import { selectStreams, playback } from '../lib/bilibili.js';
import { downloadWeb } from '../lib/ytdlp.js';
assert.equal(DEFAULTS.maxHeight, 0);
assert.equal(DEFAULTS.frameWidth, 1280); // Source limit must not silently change frame sizing.
assert.equal(new VideoVision('.').config.maxHeight, 0);
assert.equal(new VideoVision('.', { maxHeight: 720 }).config.maxHeight, 720);
assert.equal(Config({}).maxHeight, 0);
assert.equal(Config({ maxHeight: 720 }).maxHeight, 720);
const video = (height, width = height * 16 / 9) => ({ height, width, id: height, codecs: 'avc1', baseUrl: `fixture-${width}x${height}` });
const play = { dash: { video: [video(720), video(1080), video(2160)] } };
assert.equal(selectStreams(play).height, 2160);
assert.equal(selectStreams(play, 0).height, 2160);
assert.equal(selectStreams(play, 720).height, 720);
assert.equal(selectStreams(play, 1080).height, 1080);
assert.throws(() => selectStreams(play, 480), /no stream at or below/);
assert.equal(selectStreams({ dash: { video: [video(1280, 720), video(1920, 1080)] } }).height, 1920);
assert.equal(selectStreams({ dash: { video: [video(1280, 720), video(1920, 1080)] } }, 1280).width, 720);
const unknown = selectStreams({ durl: [{ url: 'fixture' }], quality: 64 }, 720);
assert.equal(unknown.height, null); // Retain the existing acquire/probe path, not a new rejection gate.
let requests = 0;
assert.equal((await playback('fixture', 1, 0, new AbortController().signal, async (path, params) => {
  requests++;
  assert.equal(path, '/x/player/playurl');
  assert.equal(params.fourk, 1);
  assert.equal(params.fnval, 4048);
  assert.equal(Object.hasOwn(params, 'qn'), false);
  return play;
})).height, 2160);
assert.equal(requests, 1);
const root = await mkdtemp(join(tmpdir(), 'vv-resolution-'));
try {
  const executable = join(root, 'resolver.cjs');
  await writeFile(executable, `#!${process.execPath}\nconst fs=require('node:fs'),p=require('node:path'),a=process.argv.slice(2);if(a.includes('--dump-single-json'))console.log(JSON.stringify({id:'synthetic',title:'synthetic'}));else{const dir=a[a.indexOf('--paths')+1];fs.writeFileSync(p.join(dir,'args.json'),JSON.stringify(a));const f=p.join(dir,'video.mp4');fs.writeFileSync(f,'fixture');console.log(f);}`);
  await chmod(executable, 0o755);
  for (const height of [undefined, 0, 720, 1080, 2160]) {
    await downloadWeb('https://fixture.invalid/video', root, { ...DEFAULTS, maxHeight: height, ytDlpPath: executable }, new AbortController().signal);
    const args = JSON.parse(await readFile(join(root, 'args.json'), 'utf8'));
    const format = args[args.indexOf('--format') + 1];
    if (!height) assert.equal(format, 'bv*+ba/b/bv');
    else {
      assert.equal(format, `bv*[height<=${height}]+ba/b[height<=${height}]/bv[height<=${height}]`);
      assert(!format.endsWith('/b')); // No unlimited escape from the user's ceiling.
    }
  }
} finally { await rm(root, { recursive: true, force: true }); }
console.log('PASS source resolution: unlimited defaults/schema, explicit limits, 4K and portrait fixtures, no matching format, unknown durl preserved, Bilibili request and actual resolver argv. No live site claim.');
