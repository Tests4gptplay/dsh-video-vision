import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm, mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createHash, randomBytes } from 'node:crypto';
import net from 'node:net';
import vm from 'node:vm';
import P from '../browser-session/protocol.cjs';
import Sync from '../browser-session/sync.cjs';
import { BrowserSessions } from '../lib/browser-session.js';
import { NativeSession, nativeResult } from '../lib/native-session.js';
import { VideoVision } from '../lib/engine.js';
import { resolverArgs, anonymousEnvironment } from '../lib/ytdlp.js';
import { Config } from '../lib/settings.js';

const args = resolverArgs({ cookieFile: 'private-cookie-file', browserSessionAuthorized: true });
for (const flag of ['--ignore-config', '--no-cookies', '--no-cookies-from-browser', '--no-plugin-dirs']) assert(args.includes(flag));
for (const value of ['--cookies', '--cookies-from-browser', 'private-cookie-file']) assert(!args.includes(value));
assert.deepEqual(anonymousEnvironment({ Path: 'runtime', SystemRoot: 'Windows', SESSDATA: 'secret', USERPROFILE: 'private' }), { Path: 'runtime', SystemRoot: 'Windows' });
for (const key of ['browserSessionAuthorized', 'syncToNativeBrowser']) assert.equal(Config.dict[key].meta.default, false);
assert(!Config.dict.cookieFile); assert(!Config.dict.nativeLoginAuthorized);

const directory = await mkdtemp(join(tmpdir(), 'dsh-browser-session-test-'));
const cookie = { name: 'session', value: 'fixture-secret', domain: '.example.com', hostOnly: false, path: '/', secure: true, httpOnly: true, sameSite: 'lax' };
const auth = value => writeFile(join(directory, 'authorization.json'), JSON.stringify(value));
let host;
try {
  await writeFile(join(directory, 'bridge.key'), randomBytes(32).toString('hex'));
  await auth({ enabled: false, syncToNative: false });
  const manifest = JSON.parse(await readFile(new URL('../browser-session/extension/manifest.json', import.meta.url), 'utf8'));
  const id = createHash('sha256').update(Buffer.from(manifest.key, 'base64')).digest('hex').slice(0, 32).replace(/[0-9a-f]/g, c => String.fromCharCode(97 + parseInt(c, 16)));
  host = spawn(process.execPath, [resolve('browser-session/native-host.cjs'), 'chrome-extension://' + id + '/'],
    { env: { ...process.env, DSH_BROWSER_SESSION_HOME: directory }, stdio: ['pipe', 'pipe', 'pipe'] });
  let stderr = '', browserReads = 0;
  host.stderr.on('data', c => stderr += c);
  P.frames(host.stdout, message => {
    if (message.op === 'cookies') {
      browserReads++;
      P.send(host.stdin, { id: message.id, cookies: [cookie, { ...cookie, name: 'unrelated', domain: '.other.test' }] });
    }
  });
  P.send(host.stdin, { op: 'hello' });
  // Wait for the real native host to bind once; not a production polling loop.
  for (let i = 0; ; i++) {
    try { assert.equal((await P.request('status', {}, { directory, timeoutMs: 500 })).connected, true); break; }
    catch (error) { if (i >= 30) throw error; await new Promise(r => setTimeout(r, 20)); }
  }
  await assert.rejects(P.request('cookies', { url: 'https://www.example.com/' }, { directory }), /已关闭/);
  assert.equal(browserReads, 0);
  await auth({ enabled: true, syncToNative: false });
  const result = await P.request('cookies', { url: 'https://www.example.com/' }, { directory });
  assert.deepEqual(result.cookies, [cookie]);
  await assert.rejects(P.request('sync', { url: 'https://www.example.com/' }, { directory }), /同步已关闭/);
  const badKey = await new Promise(resolveResult => {
    const socket = net.connect(P.socketPath(directory));
    socket.once('connect', () => P.send(socket, { id: 'bad', key: 'x'.repeat(64), op: 'cookies', url: 'https://www.example.com/' }));
    P.frames(socket, value => { socket.destroy(); resolveResult(value); });
  });
  assert.equal(badKey.code, 'unauthorized');
  await auth({ enabled: true, syncToNative: true });
  assert.equal((await P.request('sync', { url: 'https://www.example.com/' }, { directory })).cookies[0].httpOnly, true);
  assert.equal(P.scopedCookies([cookie], 'http://www.example.com/').length, 0);
  assert.equal(P.scopedCookies([cookie], 'https://example.com.evil.test/').length, 0);
  assert.equal(P.scopedCookies([{ ...cookie, path: '/private' }], 'https://example.com/private2').length, 0);

  const requests = [], outgoing = [];
  const service = new BrowserSessions({}, { directory,
    request: async (op, p) => { if (op === 'status') return { connected: true }; requests.push(p.url); return { cookies: [cookie] }; },
    fetch: async (url, options) => {
      outgoing.push({ url: String(url), cookie: options.headers.get('cookie') });
      return outgoing.length === 1 ? new Response(null, { status: 302, headers: { location: 'https://other.test/media' } }) :
        new Response('media', { headers: { 'set-cookie': 'do-not-expose=1', 'content-type': 'text/plain' } });
    }
  });
  await assert.rejects(service.fetch('https://example.com/'), /已关闭/);
  await service.setAuthorization({ enabled: true, syncToNative: false });
  const response = await service.fetch('https://example.com/', { headers: { cookie: 'injected', authorization: 'injected' } });
  assert.equal(await response.text(), 'media'); assert.equal(response.headers.has('set-cookie'), false);
  assert.deepEqual(outgoing.map(x => x.cookie), ['session=fixture-secret', null]);
  assert.deepEqual(requests, ['https://example.com/', 'https://other.test/media']);
  assert.deepEqual(Object.keys(service.facade()).sort(), ['fetch', 'json', 'status']);
  await service.setAuthorization({ enabled: false, syncToNative: false });
  await assert.rejects(service.fetch('https://example.com/'), /已关闭/);

  // Actual extension script calls the browser API with a URL, never a whole-store query.
  let handler, queried;
  const sent = [];
  const port = { postMessage: v => sent.push(v), onMessage: { addListener: fn => handler = fn }, onDisconnect: { addListener() {} } };
  vm.runInNewContext(await readFile(new URL('../browser-session/extension/background.js', import.meta.url), 'utf8'), {
    URL, chrome: { runtime: { id, connectNative: () => port, onInstalled: { addListener: fn => fn() }, onStartup: { addListener() {} }, onMessage: { addListener() {} } },
      cookies: { getAll: async query => { queried = query; return [cookie]; } } }
  });
  await handler({ id: 'fixture', op: 'cookies', url: 'https://www.example.com/' });
  assert.equal(queried.url, 'https://www.example.com/'); assert.deepEqual(Object.keys(queried), ['url']);
  assert.equal(sent.at(-1).cookies[0].value, 'fixture-secret');

  // Electron synchronization: preserve an existing native cookie, import HttpOnly, undo on revoke.
  const original = { ...cookie, value: 'native-original' }, jar = [original], sets = [];
  const session = { cookies: {
    get: async () => jar.map(c => ({ ...c })),
    set: async detail => { sets.push(detail); const i = jar.findIndex(c => c.name === detail.name); if (i >= 0) jar.splice(i, 1); jar.push({ ...detail, domain: detail.domain || new URL(detail.url).hostname }); },
    remove: async (_url, name) => { const i = jar.findIndex(c => c.name === name); if (i >= 0) jar.splice(i, 1); }
  } };
  let syncRequests = 0;
  const sync = Sync.createSync({ directory, watch: false, request: async () => { syncRequests++; return { cookies: [cookie] }; } });
  await auth({ enabled: true, syncToNative: false }); await sync.beforeRequest(session, 'https://www.example.com/');
  assert.equal(syncRequests, 0);
  await auth({ enabled: true, syncToNative: true }); await sync.beforeRequest(session, 'https://www.example.com/');
  assert.equal(jar[0].value, cookie.value); assert.equal(sets[0].httpOnly, true);
  await auth({ enabled: true, syncToNative: false }); await sync.changed();
  assert.equal(jar[0].value, 'native-original');
  jar.length = 0;
  await auth({ enabled: true, syncToNative: true });
  await sync.beforeRequest(session, 'https://www.example.com/');
  await sync.beforeRequest(session, 'https://www.example.com/');
  await auth({ enabled: false, syncToNative: false }); await sync.changed();
  assert.equal(jar.length, 0, 'Repeated sync must not turn an imported cookie into a native backup');
  await sync.dispose();

  const calls = [];
  const adapter = new NativeSession({ status: async () => ({ enabled: true, connected: true }), json: async url => { calls.push(String(url)); return { code: 0, data: [{ cid: 1, page: 1, duration: 2, part: 'fixture', cookie: 'secret' }] }; } });
  assert.deepEqual(await adapter.api('/x/player/pagelist', { bvid: 'BV1N3HM6WEPK' }, AbortSignal.timeout(1000)), [{ cid: 1, page: 1, duration: 2, part: 'fixture' }]);
  assert(calls[0].startsWith('https://api.bilibili.com/x/player/pagelist?'));
  const anonymous = new NativeSession({ status: async () => ({ enabled: true, connected: false }) },
    async () => new Response(JSON.stringify({ code: 0, data: [{ cid: 1, page: 1, duration: 2, part: 'public' }] })));
  assert.equal((await anonymous.api('/x/player/pagelist', { bvid: 'BV1N3HM6WEPK' }, AbortSignal.timeout(1000)))[0].part, 'public');
  assert.equal(new VideoVision(process.cwd(), { browserSessionAuthorized: true }).nativeApi, undefined);
  const engine = new VideoVision(process.cwd(), { browserSessionAuthorized: true }, adapter);
  assert.equal(typeof engine.nativeApi, 'function');
  assert.equal(new VideoVision(process.cwd(), {}, adapter).nativeApi, undefined);
  assert(!JSON.stringify(nativeResult('/x/player/playurl', { Cookie: 'secret', dash: {} })).includes('secret'));
  assert.equal(stderr, '');
  assert(!JSON.stringify(await service.status()).includes('fixture-secret'));
  console.log('PASS: real native host pipe, grant/revoke, independent sync, URL-only browser API, credential scope/redirection, HttpOnly sync/restore, Bilibili adapter and anonymous yt-dlp.');
} finally {
  if (host) { const closed = once(host, 'close'); host.stdin.end(); await closed; }
  await rm(directory, { recursive: true, force: true });
}
