import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BrowserSessions } from '../lib/browser-session.js';
import { nativeRequest, nativeResult } from '../lib/native-session.js';
import { VideoVision } from '../lib/engine.js';

const directory = await mkdtemp(join(tmpdir(), 'dsh-session-regression-'));
const cookie = { name: 'session', value: 'synthetic', domain: '.example.test', path: '/', secure: true };
const calls = [], imports = [];
let release, entered;
const started = new Promise(resolve => { entered = resolve; });
const session = new BrowserSessions({ browserSessionAuthorized: true }, {
  directory,
  request: async (op, payload) => {
    if (op === 'status') return { ready: true, connected: true };
    if (op === 'import') { imports.push(op); return { imported: true }; }
    return { cookies: [cookie] };
  },
  fetch: async (url, options) => {
    calls.push({ url: String(url), method: options.method, body: options.body, cookie: options.headers.get('cookie') });
    if (String(url).endsWith('/pending')) {
      entered(); await new Promise(resolve => { release = resolve; });
      options.signal.throwIfAborted();
    }
    if (String(url).endsWith('/redirect')) return new Response(null, { status: 302, headers: { location: 'https://other.test/result' } });
    return new Response('ok', { headers: { 'set-cookie': 'synthetic=1' } });
  }
});
try {
  await session.setup(); assert.equal(imports.length, 1);
  const pending = session.fetch('https://example.test/pending');
  await started;
  await session.setAuthorization({ enabled: true });
  release(); assert.equal(await (await pending).text(), 'ok');
  assert.equal(await (await session.fetch('https://example.test/post', { method: 'POST', body: 'fixture' })).text(), 'ok');
  assert.equal(calls.at(-1).method, 'POST'); assert.equal(calls.at(-1).body, 'fixture');
  const result = await session.fetch('https://example.test/redirect', { method: 'POST', body: 'fixture' });
  assert.equal(result.headers.has('set-cookie'), false);
  assert.equal(calls.at(-2).cookie, 'session=synthetic');
  assert.equal(calls.at(-1).cookie, null);
  assert.equal(calls.at(-1).method, 'GET'); assert.equal(calls.at(-1).body, undefined);
  const manual = await session.fetch('https://example.test/redirect', { redirect: 'manual' });
  assert.equal(manual.status, 302);
  await session.dispose();
  assert.deepEqual(JSON.parse(await readFile(join(directory, 'vv-plugin-authorization-v1.json'))), { enabled: true });

  assert.deepEqual(nativeRequest('/x/player/playurl', { aid: '123', cid: '1', platform: 'html5' }).params,
    { aid: '123', cid: '1', platform: 'html5' });
  const media = nativeResult('/x/player/playurl', { dash: { video: [{
    baseUrl: 'https://new-cdn.example.test/video', backupUrl: Array.from({ length: 5 }, (_, i) => 'https://cdn' + i + '.example.test/video')
  }] } });
  assert.equal(media.dash.video[0].baseUrl, 'https://new-cdn.example.test/video');
  assert.equal(media.dash.video[0].backupUrl.length, 5);

  // A playable third URL must not be discarded by a fixed two-attempt cap.
  const engine = new VideoVision(directory, { maxDownloadMB: 1 });
  let attempts = 0;
  engine.mediaFetch = async () => ++attempts < 3 ? new Response('', { status: 503 }) : new Response('fixture');
  await engine.download(['https://a.test', 'https://b.test', 'https://c.test'], join(directory, 'video.mp4'), 'https://example.test', new AbortController().signal);
  assert.equal(attempts, 3);
  console.log('PASS: import without browser/version gate, authorization updates preserve requests, reload preserves grants, POST/redirect, CDN URLs and all media backups.');
} finally {
  await session.dispose();
  await rm(directory, { recursive: true, force: true });
}
