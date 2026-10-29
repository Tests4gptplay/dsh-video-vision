// First-party cookie snapshots, captured on explicit user import.
const fs = require('node:fs/promises');
const { join } = require('node:path');
const net = require('node:net');
const { randomBytes, timingSafeEqual } = require('node:crypto');
const P = require('./protocol.cjs');
const { endpointFromPortFile, discoverBrowserEndpoints } = require('./discovery.cjs');

const messages = {
  disabled: '默认浏览器授权已关闭。',
  sync_disabled: '内置浏览器同步已关闭。',
  no_snapshot: '请先在设置中导入登录态。',
  setup_required: '未找到可用的浏览器连接。请保持已登录的浏览器或 CAH 运行，再点击导入。',
  connection_failed: '未能连接正在运行的浏览器。请保持来源浏览器运行后重试。',
  timed_out: '等待浏览器确认超时。原登录态未改动，可再次点击刷新。',
  read_failed: '浏览器未提供可导入的 Cookie。原登录态未改动。',
  storage_unavailable: '当前系统的本地加密存储不可用，未保存登录态。',
  save_failed: '登录态未能保存，原登录态未改动。',
  busy: '正在导入登录态，请等待本次操作结束。',
  unauthorized: '本地会话服务连接未授权。',
  invalid: '本地会话请求无效。'
};
function fault(code) { return Object.assign(new Error(messages[code] || messages.invalid), { code }); }
function snapshotPath(directory) { return P.socketPath(directory, 'snapshot'); }
function request(op, payload, options = {}) { return P.request(op, payload, { ...options, channel: 'snapshot', messages }); }

function normalizeCookies(items) {
  if (!Array.isArray(items)) throw fault('read_failed');
  return items.filter(c => typeof c.name === 'string' && typeof c.value === 'string' &&
    typeof c.domain === 'string' && c.domain.length > 0 &&
    !/[\r\n;]/.test(c.name + c.value) && !c.partitionKey &&
    (c.session || !(c.expires > 0) || c.expires > Date.now() / 1000)).map(c => ({
      name: c.name, value: c.value, domain: c.domain, path: c.path || '/',
      hostOnly: !c.domain.startsWith('.'), secure: Boolean(c.secure), httpOnly: Boolean(c.httpOnly),
      sameSite: ({ Strict: 'strict', Lax: 'lax', None: 'no_restriction' })[c.sameSite] || 'unspecified',
      ...(c.expires > 0 && !c.session ? { expirationDate: c.expires } : {})
    }));
}
async function captureCookies({ endpoint, portFile, signal, discover = discoverBrowserEndpoints, WebSocketImpl = globalThis.WebSocket, timeoutMs = 90000 } = {}) {
  signal?.throwIfAborted();
  const endpoints = endpoint ? [endpoint] : portFile ? [endpointFromPortFile(await fs.readFile(portFile, 'utf8'))] : await discover({ signal });
  if (!endpoints.length) throw fault('setup_required');
  let lastError;
  for (const endpoint of endpoints) {
    signal?.throwIfAborted();
    try { return await captureEndpoint({ endpoint, signal, WebSocketImpl, timeoutMs }); }
    catch (error) { signal?.throwIfAborted(); lastError = error; }
  }
  throw lastError;
}
async function captureEndpoint({ endpoint, signal, WebSocketImpl, timeoutMs }) {
  return new Promise((resolve, reject) => {
    let socket, settled = false;
    const finish = (error, value) => {
      if (settled) return; settled = true;
      clearTimeout(timer); signal?.removeEventListener('abort', abort);
      try { socket?.close(); } catch {}
      error ? reject(error) : resolve(value);
    };
    const abort = () => finish(fault('disabled'));
    const timer = setTimeout(() => finish(fault('timed_out')), timeoutMs);
    signal?.addEventListener('abort', abort, { once: true });
    try { socket = new WebSocketImpl(endpoint); } catch { finish(fault('connection_failed')); return; }
    socket.addEventListener('error', () => finish(fault('connection_failed')));
    socket.addEventListener('close', () => finish(fault('connection_failed')));
    socket.addEventListener('open', () => {
      if (signal?.aborted) { abort(); return; }
      // Capture the browser-level cookie snapshot.
      socket.send(JSON.stringify({ id: 1, method: 'Storage.getCookies', params: {} }));
    });
    socket.addEventListener('message', event => {
      try {
        const result = JSON.parse(String(event.data));
        if (result.id !== 1) return;
        if (result.error) { finish(fault('read_failed')); return; }
        finish(null, normalizeCookies(result.result?.cookies));
      } catch { finish(fault('read_failed')); }
    });
  });
}

function createSnapshotService({ directory = P.root(), safeStorage, capture = captureCookies,
  portFile, filename: storageFilename = 'session-state.bin', source = 'Chrome', authorizationDirectory = directory } = {}) {
  let snapshot, importing, server, watcher;
  const sockets = new Set();
  const filename = join(directory, storageFilename);
  const grant = () => P.authorization(authorizationDirectory);
  async function load() {
    if (snapshot !== undefined) return;
    let bytes;
    try { bytes = await fs.readFile(filename); }
    catch (error) { if (error.code === 'ENOENT') snapshot = null; return; }
    try {
      if (!await safeStorage.isEncryptionAvailable()) return;
      const stored = JSON.parse(await safeStorage.decryptString(bytes));
      if (stored.version === 1 && Array.isArray(stored.cookies)) snapshot = stored;
    } catch {
      // Locked storage or temporarily unreadable data can recover. Do not
      // cache a failure as an empty snapshot or change the stored file.
    }
  }
  async function status() {
    await load();
    const available = Boolean(snapshot?.cookies.some(c => !c.expirationDate || c.expirationDate > Date.now() / 1000));
    return { ready: true, connected: available, imported: Boolean(snapshot),
      importedAt: snapshot?.importedAt || null, source, importing: Boolean(importing),
      storageBackend: await safeStorage.getSelectedStorageBackend?.() || null };
  }
  async function dispatch(message, signal) {
    if (message.op === 'status') return status();
    if (!grant().enabled) throw fault('disabled');
    if (message.op === 'import') {
      if (importing) throw fault('busy');
      const controller = new AbortController();
      importing = controller;
      const cancel = () => controller.abort();
      signal?.addEventListener('abort', cancel, { once: true });
      try {
        signal?.throwIfAborted();
        try { await safeStorage.prepare?.(); } catch { throw fault('storage_unavailable'); }
        if (controller.signal.aborted || !grant().enabled) throw fault('disabled');
        if (!await safeStorage.isEncryptionAvailable()) throw fault('storage_unavailable');
        if (controller.signal.aborted || !grant().enabled) throw fault('disabled');
        const cookies = await capture({ portFile, signal: controller.signal });
        if (controller.signal.aborted || !grant().enabled) throw fault('disabled');
        if (!cookies.length) throw fault('read_failed');
        const next = { version: 1, importedAt: new Date().toISOString(), cookies };
        let encrypted;
        try { encrypted = await safeStorage.encryptString(JSON.stringify(next)); } catch { throw fault('storage_unavailable'); }
        try {
          await fs.writeFile(filename + '.tmp', encrypted, { mode: 0o600 });
          if (controller.signal.aborted || !grant().enabled) throw fault('disabled');
          await fs.rename(filename + '.tmp', filename);
          snapshot = next;
        } catch (error) {
          await fs.rm(filename + '.tmp', { force: true }).catch(() => {});
          throw error.code === 'disabled' ? error : fault('save_failed');
        }
        return status();
      } finally { signal?.removeEventListener('abort', cancel); importing = null; }
    }
    if (!['cookies', 'sync'].includes(message.op)) throw fault('invalid');
    if (message.op === 'sync' && !grant().syncToNative) throw fault('sync_disabled');
    await load();
    if (!snapshot) throw fault('no_snapshot');
    const cookies = P.scopedCookies(snapshot.cookies, message.url);
    if (!grant().enabled) throw fault('disabled');
    if (message.op === 'sync' && !grant().syncToNative) throw fault('sync_disabled');
    return { cookies };
  }
  async function start() {
    await fs.mkdir(directory, { recursive: true });
    let key;
    try { key = await fs.readFile(join(directory, 'bridge.key'), 'utf8'); }
    catch {
      key = randomBytes(32).toString('hex');
      await fs.writeFile(join(directory, 'bridge.key'), key, { mode: 0o600, flag: 'wx' });
    }
    key = key.trim();
    watcher = require('node:fs').watch(directory, { persistent: false }, (_event, file) => {
      if (String(file) === 'authorization.json' && !grant().enabled) importing?.abort();
    });
    watcher.on('error', () => {});
    server = net.createServer(socket => {
      sockets.add(socket); const controller = new AbortController();
      socket.once('close', () => { sockets.delete(socket); controller.abort(); });
      socket.on('error', () => {});
      let received = false;
      P.frames(socket, message => {
        if (received) { socket.destroy(); return; } received = true;
        const candidate = typeof message.key === 'string' ? message.key : '';
        if (!/^[0-9a-f]{64}$/.test(candidate) || !/^[0-9a-f]{64}$/.test(key) ||
          !timingSafeEqual(Buffer.from(candidate), Buffer.from(key))) {
          P.send(socket, { ok: false, code: 'unauthorized' }); return;
        }
        void dispatch(message, controller.signal).then(value => {
          if (!socket.destroyed) P.send(socket, { ok: true, value });
        }, error => {
          if (!socket.destroyed) P.send(socket, { ok: false, code: messages[error.code] ? error.code : 'invalid' });
        });
      }, () => socket.destroy());
    });
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(snapshotPath(directory), resolve); });
    server.on('error', () => {});
    server.unref(); return status();
  }
  async function close() {
    importing?.abort(); watcher?.close();
    for (const socket of sockets) socket.destroy();
    if (server?.listening) await new Promise(resolve => server.close(resolve));
    snapshot = null;
  }
  return { start, close, status, dispatch };
}
function startDesktopService() {
  const { app, safeStorage } = require('electron');
  const service = createSnapshotService({ safeStorage });
  app.whenReady().then(() => service.start()).catch(() => {
    // Connection availability is reported through the status endpoint.
  });
  app.once('will-quit', () => { void service.close(); });
  return service;
}
module.exports = { request, snapshotPath, endpointFromPortFile, normalizeCookies, captureCookies, createSnapshotService, startDesktopService };
