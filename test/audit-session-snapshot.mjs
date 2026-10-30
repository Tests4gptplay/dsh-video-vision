import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';
import Snapshot from '../browser-session/snapshot.cjs';
import P from '../browser-session/protocol.cjs';
import Sync from '../browser-session/sync.cjs';
const { createSync } = Sync;

const url = 'https://example.test/';
const cookie = (name, value, path = '/', domain = 'example.test') => ({ name, value, path, domain, hostOnly: true, secure: true, httpOnly: true });
const identity = c => [c.domain, c.path, c.name].join('\n');
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'vv-empty-snapshot-')), key = randomBytes(32), filename = join(directory, 'session-state.bin');
  let incoming = [cookie('session', 'synthetic-first'), cookie('bridge-only', 'synthetic-first')], captureHook, decryptFails = false;
  const safeStorage = {
    isEncryptionAvailable: () => true,
    encryptString(text) { const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key, iv), body = Buffer.concat([cipher.update(text), cipher.final()]); return Buffer.concat([iv, cipher.getAuthTag(), body]); },
    decryptString(bytes) {
      if (decryptFails) throw new Error('synthetic locked store');
      const cipher = createDecipheriv('aes-256-gcm', key, bytes.subarray(0, 12)); cipher.setAuthTag(bytes.subarray(12, 28));
      return Buffer.concat([cipher.update(bytes.subarray(28)), cipher.final()]).toString();
    }
  };
  await writeFile(join(directory, 'authorization.json'), JSON.stringify({ enabled: true, syncToNative: true }));
  const create = () => Snapshot.createSnapshotService({ directory, safeStorage, capture: async args => captureHook ? captureHook(args) : incoming });
  let service = create();
  return { directory, filename, safeStorage, get service() { return service; },
    setCookies(value) { incoming = value; captureHook = null; }, setCapture(value) { captureHook = value; }, setDecryptFails(value) { decryptFails = value; },
    async restart() { await service.close(); service = create(); },
    async dispose() { await service.close(); await rm(directory, { recursive: true, force: true }); }
  };
}
function syntheticBrowser(initial) {
  const jar = new Map(initial.map(c => [identity(c), { ...c }]));
  return { jar, session: { cookies: {
    get: async ({ url }) => P.scopedCookies([...jar.values()], url),
    set: async details => { const parsed = new URL(details.url), c = { ...details, domain: details.domain || parsed.hostname, path: details.path || '/', hostOnly: !details.domain }; delete c.url; jar.set(identity(c), c); },
    remove: async (value, name) => { const parsed = new URL(value); for (const [key, c] of jar) if (c.name === name && c.domain.replace(/^\./, '') === parsed.hostname && c.path === parsed.pathname) jar.delete(key); }
  } } };
}

test('nonempty -> successful empty -> next-visit scoped withdrawal -> restart -> new login', async () => {
  const f = await fixture(), native = cookie('session', 'synthetic-native'), unrelated = cookie('keep', 'synthetic-native', '/', 'unrelated.test');
  const browser = syntheticBrowser([native, unrelated]);
  const sync = createSync({ directory: f.directory, watch: false, request: (op, payload) => f.service.dispatch({ op, ...payload }) });
  try {
    assert.equal((await f.service.dispatch({ op: 'import' })).connected, true);
    await sync.beforeRequest(browser.session, url);
    assert.equal(browser.jar.get(identity(native)).value, 'synthetic-first');
    assert(browser.jar.has(identity(cookie('bridge-only', ''))));
    const oldBytes = await readFile(f.filename);
    f.setCookies([]);
    const empty = await f.service.dispatch({ op: 'import' });
    assert.equal(empty.imported, true); assert.equal(empty.connected, false); assert.equal(empty.cookieCount, 0); assert(empty.importedAt);
    const emptyBytes = await readFile(f.filename); assert.notDeepEqual(emptyBytes, oldBytes);
    assert.deepEqual(JSON.parse(f.safeStorage.decryptString(emptyBytes)).cookies, []);
    assert.deepEqual(await f.service.dispatch({ op: 'sync', url }), { cookies: [] });
    // No background claim: existing imported values are withdrawn on the next request.
    assert.equal(browser.jar.get(identity(native)).value, 'synthetic-first');
    await sync.beforeRequest(browser.session, url);
    assert.equal(browser.jar.get(identity(native)).value, 'synthetic-native');
    assert(!browser.jar.has(identity(cookie('bridge-only', ''))));
    assert.equal(browser.jar.get(identity(unrelated)).value, 'synthetic-native');
    await f.restart();
    const restarted = await f.service.status(); assert.equal(restarted.imported, true); assert.equal(restarted.connected, false); assert.equal(restarted.cookieCount, 0);
    assert.deepEqual(await f.service.dispatch({ op: 'cookies', url }), { cookies: [] });
    assert.deepEqual(await readFile(f.filename), emptyBytes, 'Loading empty snapshot never rewrites it');
    f.setCookies([cookie('session', 'synthetic-new-login')]);
    assert.equal((await f.service.dispatch({ op: 'import' })).connected, true);
    await sync.beforeRequest(browser.session, url);
    assert.equal(browser.jar.get(identity(native)).value, 'synthetic-new-login');
    assert.equal(browser.jar.get(identity(unrelated)).value, 'synthetic-native');
  } finally { await sync.dispose(); await f.dispose(); }
});

test('capture failure and malformed capture preserve last successful bytes and cookies', async () => {
  const f = await fixture();
  try {
    await f.service.dispatch({ op: 'import' }); const saved = await readFile(f.filename);
    f.setCapture(async () => { throw Object.assign(new Error('synthetic read failure'), { code: 'read_failed' }); });
    await assert.rejects(f.service.dispatch({ op: 'import' }), { code: 'read_failed' });
    assert.deepEqual(await readFile(f.filename), saved);
    assert.equal((await f.service.dispatch({ op: 'cookies', url })).cookies[0].value, 'synthetic-first');
    f.setCookies(undefined);
    await assert.rejects(f.service.dispatch({ op: 'import' }), { code: 'read_failed' });
    assert.deepEqual(await readFile(f.filename), saved);
    await f.restart();
    assert.equal((await f.service.status()).connected, true);
  } finally { await f.dispose(); }
});

test('transient decrypt failure preserves bytes, retries reading, and is not saved as empty', async () => {
  const f = await fixture();
  try {
    await f.service.dispatch({ op: 'import' }); const saved = await readFile(f.filename);
    await f.restart(); f.setDecryptFails(true);
    const unreadable = await f.service.status(); assert.equal(unreadable.imported, false); assert.equal(unreadable.cookieCount, null);
    await assert.rejects(f.service.dispatch({ op: 'cookies', url }), { code: 'no_snapshot' });
    assert.deepEqual(await readFile(f.filename), saved);
    f.setDecryptFails(false);
    assert.equal((await f.service.dispatch({ op: 'cookies', url })).cookies[0].value, 'synthetic-first');
    assert.deepEqual(await readFile(f.filename), saved);
  } finally { await f.dispose(); }
});

test('canceled capture preserves old snapshot, clears busy state, and allows empty then nonempty retry', async () => {
  const f = await fixture(), entered = deferred(), released = deferred(), controller = new AbortController();
  try {
    await f.service.dispatch({ op: 'import' }); const saved = await readFile(f.filename);
    // A provider may finish a read after cancellation; the service must not save it.
    f.setCapture(async () => { entered.resolve(); await released.promise; return []; });
    const pending = f.service.dispatch({ op: 'import' }, controller.signal); await entered.promise;
    await assert.rejects(f.service.dispatch({ op: 'import' }), { code: 'busy' });
    controller.abort(); released.resolve(); await assert.rejects(pending, { code: 'disabled' });
    assert.equal((await f.service.status()).importing, false); assert.deepEqual(await readFile(f.filename), saved);
    f.setCookies([]); assert.equal((await f.service.dispatch({ op: 'import' })).connected, false);
    f.setCookies([cookie('session', 'synthetic-after-cancel')]); assert.equal((await f.service.dispatch({ op: 'import' })).connected, true);
    assert.equal((await f.service.dispatch({ op: 'cookies', url })).cookies[0].value, 'synthetic-after-cancel');
  } finally { released.resolve(); await f.dispose(); }
});

test('CDP empty success is distinct from malformed/error replies and unsupported cookie filtering', async () => {
  let reply = { result: { cookies: [] } }, closed = 0;
  class Socket extends EventTarget {
    constructor() { super(); queueMicrotask(() => this.dispatchEvent(new Event('open'))); }
    send(text) { const message = JSON.parse(text); assert.equal(message.method, 'Storage.getCookies'); queueMicrotask(() => this.dispatchEvent(new MessageEvent('message', { data: JSON.stringify({ id: message.id, ...reply }) }))); }
    close() { closed++; }
  }
  const capture = () => Snapshot.captureCookies({ endpoint: 'ws://127.0.0.1:1/synthetic', WebSocketImpl: Socket });
  assert.deepEqual(await capture(), []);
  for (const value of [{ error: { code: -1 } }, { result: {} }, { result: { cookies: null } }]) {
    reply = value; await assert.rejects(capture(), { code: 'read_failed' });
  }
  reply = { result: { cookies: [{ ...cookie('partitioned', 'synthetic'), partitionKey: { topLevelSite: 'https://example.test' } }] } };
  assert.deepEqual(await capture(), [], 'Unsupported partitioned cookies remain excluded, not exported cross-partition');
  assert.equal(closed, 5);
});
