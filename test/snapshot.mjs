import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm, mkdir, rename } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';
import Snapshot from '../browser-session/snapshot.cjs';
import Discovery from '../browser-session/discovery.cjs';
const directory = await mkdtemp(join(tmpdir(), 'dsh-snapshot-test-'));
const key = randomBytes(32);
const safeStorage = {
  isEncryptionAvailable: () => true,
  encryptString(text) { const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key, iv);
    const body = Buffer.concat([cipher.update(text), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), body]); },
  decryptString(bytes) { const cipher = createDecipheriv('aes-256-gcm', key, bytes.subarray(0, 12)); cipher.setAuthTag(bytes.subarray(12, 28));
    return Buffer.concat([cipher.update(bytes.subarray(28)), cipher.final()]).toString(); }
};
const fixture = { name: 'session', value: 'fixture-secret', domain: '.example.test', path: '/', secure: true, httpOnly: true, sameSite: 'Lax', session: true, expires: -1 };
const normalized = Snapshot.normalizeCookies([fixture])[0];
assert.equal(normalized.hostOnly, false); assert.equal(normalized.sameSite, 'lax'); assert.equal(normalized.httpOnly, true);
assert.equal(Snapshot.normalizeCookies([{ ...fixture, partitionKey: { topLevelSite: 'https://other.test' } }]).length, 0);
assert.throws(() => Snapshot.endpointFromPortFile('1234\nws://example.test/'), /连接信息/);
const auth = async grant => {
  await writeFile(join(directory, 'authorization.json.tmp'), JSON.stringify(grant));
  await rename(join(directory, 'authorization.json.tmp'), join(directory, 'authorization.json'));
};
let service, fail = false, captures = 0;
try {
  // Synthetic browser: validate that the sole CDP command is a read, then close.
  const portFile = join(directory, 'DevToolsActivePort');
  await writeFile(portFile, '43123\n/devtools/browser/fixture\n');
  const sent = []; let closed = false;
  class Socket extends EventTarget {
    constructor(url) { super(); assert.equal(url, 'ws://127.0.0.1:43123/devtools/browser/fixture'); queueMicrotask(() => this.dispatchEvent(new Event('open'))); }
    send(text) { const msg = JSON.parse(text); sent.push(msg.method);
      queueMicrotask(() => this.dispatchEvent(new MessageEvent('message', { data: JSON.stringify({ id: msg.id, result: { cookies: [fixture] } }) }))); }
    close() { closed = true; }
  }
  assert.equal((await Snapshot.captureCookies({ portFile, WebSocketImpl: Socket }))[0].value, 'fixture-secret');
  assert.deepEqual(sent, ['Storage.getCookies']); assert(closed);
  const command = '"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" --user-data-dir="C:\\fixture profile" --remote-debugging-port=43123';
  assert.equal(Discovery.argument(command, 'user-data-dir'), 'C:\\fixture profile');
  const endpoints = await Discovery.discoverBrowserEndpoints({
    commands: [command], portFiles: [],
    readFile: async () => { throw Object.assign(new Error('Missing port file'), { code: 'ENOENT' }); },
    fetch: async url => { assert.equal(url, 'http://127.0.0.1:43123/json/version');
      return Response.json({ webSocketDebuggerUrl: 'ws://127.0.0.1:43123/devtools/browser/fixture' }); }
  });
  assert.deepEqual(endpoints, ['ws://127.0.0.1:43123/devtools/browser/fixture']);
  assert.equal((await Snapshot.captureCookies({ discover: async () => endpoints, WebSocketImpl: Socket }))[0].value, 'fixture-secret');
  await assert.rejects(Snapshot.captureCookies({ discover: async () => [] }), /未找到可用/);
  assert.equal(Snapshot.normalizeCookies([{ ...fixture, domain: '[::1]' }]).length, 1);

  await auth({ enabled: false, syncToNative: false });
  const capture = async () => { captures++; if (fail) throw Object.assign(new Error('fixture'), { code: 'connection_failed' }); return [normalized]; };
  service = Snapshot.createSnapshotService({ directory, safeStorage, capture });
  await service.start();
  const request = (op, payload = {}) => Snapshot.request(op, payload, { directory });
  assert.equal((await request('status')).imported, false); assert.equal(captures, 0);
  await assert.rejects(request('import'), /已关闭/); assert.equal(captures, 0);
  await auth({ enabled: true, syncToNative: false });
  const imported = await request('import');
  assert(imported.connected); assert(imported.importedAt); assert.equal(captures, 1);
  assert(!JSON.stringify(imported).includes('fixture-secret'));
  const encrypted = await readFile(join(directory, 'session-state.bin'));
  assert(!encrypted.includes(Buffer.from('fixture-secret')));
  assert.equal((await request('cookies', { url: 'https://www.example.test/' })).cookies[0].value, 'fixture-secret');
  assert.equal((await request('cookies', { url: 'https://unrelated.test/' })).cookies.length, 0);
  await assert.rejects(request('sync', { url: 'https://example.test/' }), /同步已关闭/);
  // A sync preference update must not abort a pending import.
  let entered, finishCapture;
  const started = new Promise(resolve => { entered = resolve; });
  await service.close();
  service = Snapshot.createSnapshotService({ directory, safeStorage, capture: async ({ signal }) => {
    entered(); await new Promise(resolve => { finishCapture = resolve; });
    signal.throwIfAborted(); return [normalized];
  } });
  await service.start();
  const pending = request('import'); await started;
  await auth({ enabled: true, syncToNative: true });
  await new Promise(resolve => setTimeout(resolve, 30));
  finishCapture(); assert.equal((await pending).imported, true);
  await service.close();
  service = Snapshot.createSnapshotService({ directory, safeStorage, capture }); await service.start();
  const latestEncrypted = await readFile(join(directory, 'session-state.bin'));
  fail = true;
  await assert.rejects(request('import'), /未能连接/);
  assert.deepEqual(await readFile(join(directory, 'session-state.bin')), latestEncrypted, 'Failed refresh preserves prior snapshot');
  await service.close();
  service = Snapshot.createSnapshotService({ directory, safeStorage, capture }); await service.start();
  assert.equal((await request('status')).connected, true, 'Encrypted snapshot survives a service restart');
  await auth({ enabled: true, syncToNative: true });
  assert.equal((await request('sync', { url: 'https://example.test/' })).cookies.length, 1);
  await auth({ enabled: false, syncToNative: false });
  await assert.rejects(request('cookies', { url: 'https://example.test/' }), /已关闭/);
  const code = await readFile(new URL('../browser-session/snapshot.cjs', import.meta.url), 'utf8');
  for (const command of ['Target.activateTarget', 'Target.createTarget', 'Page.bringToFront', 'Input.dispatchMouseEvent', 'Browser.close'])
    assert(!code.includes(command));
  console.log('PASS: read-only CDP/disconnect, encrypted snapshot persistence, local pipe, grant/sync isolation, scope, safe UI status, and failed refresh preservation.');
} finally { await service?.close(); await rm(directory, { recursive: true, force: true }); }
