// First-party cookie snapshots, captured on explicit user import.
const fs = require('node:fs/promises');
const { join } = require('node:path');
const P = require('./protocol.cjs');
const { endpointFromPortFile, discoverBrowserEndpoints } = require('./discovery.cjs');

const messages = {
  disabled: '默认浏览器授权已关闭。',
  rollback_failed: '登录态恢复记录需要处理；读取已停止。请先清理 VV 副本后重新导入。',
  no_snapshot: '请先在设置中导入登录态。',
  setup_required: '未找到可用的浏览器连接。请保持已登录的来源浏览器运行，并确认该浏览器允许连接后重试。',
  connection_failed: '未能连接正在运行的浏览器。请保持来源浏览器运行后重试。',
  timed_out: '等待浏览器确认超时。原登录态未改动，可再次点击刷新。',
  read_failed: '无法读取浏览器 Cookie。原登录态未改动。',
  storage_unavailable: '当前系统的本地加密存储不可用，未保存登录态。',
  save_failed: '登录态未能保存，原登录态未改动。',
  busy: '正在导入登录态，请等待本次操作结束。',
  unauthorized: '本地会话服务连接未授权。',
  invalid: '本地会话请求无效。'
};
function fault(code) { return Object.assign(new Error(messages[code] || messages.invalid), { code }); }
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
  if (!endpoint && !portFile) throw Object.assign(new Error('Select a browser source before capture.'), { code: 'browser_source_required' });
  const selectedEndpoint = endpoint || endpointFromPortFile(await fs.readFile(portFile, 'utf8'));
  return captureEndpoint({ endpoint: selectedEndpoint, signal, WebSocketImpl, timeoutMs });
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
  let snapshot, importing, importDone, blocked = false, snapshotState = 'unknown', clearing = false, generation = 0;
  const filename = join(directory, storageFilename);
  const grant = () => P.authorization(authorizationDirectory);
  async function load() {
    if (blocked || importing || snapshot !== undefined) return;
    const version = generation;
    const current = () => generation === version && !blocked;
    try { await fs.access(filename + '.cleared'); if(current()){blocked = true; snapshotState = 'cleared';} return; } catch(error) { if(error.code !== 'ENOENT') { if(current()) snapshotState = 'read_failed'; return; } }
    try { await fs.access(filename + '.rollback'); if(current()){blocked=true;snapshotState='rollback_failed';}return; } catch(error){if(error.code!=='ENOENT'){if(current())snapshotState='read_failed';return;}}
    let bytes;
    try { bytes = await fs.readFile(filename); }
    catch (error) { if(current()){if (error.code === 'ENOENT') { snapshot = null; snapshotState = 'absent'; } else snapshotState = 'read_failed';} return; }
    try {
      if (!await safeStorage.isEncryptionAvailable()) { if(current()) snapshotState = 'decrypt_failed'; return; }
      const stored = JSON.parse(await safeStorage.decryptString(bytes));
      if (stored.version !== 1 || !Array.isArray(stored.cookies)) throw Error('Invalid snapshot');
      if(current()){snapshot = stored; snapshotState = stored.cookies.length ? 'ready' : 'empty';}
    } catch { if(current()) snapshotState = 'decrypt_failed'; }
  }
  async function status() {
    await load();
    const available = !blocked && Boolean(snapshot?.cookies.some(c => !c.expirationDate || c.expirationDate > Date.now() / 1000));
    return { ready: true, connected: available, imported: snapshot === undefined ? null : Boolean(snapshot), snapshotState,
      cookieCount: snapshot ? snapshot.cookies.length : null, importedAt: snapshot?.importedAt || null,
      source, importing: Boolean(importing), storageBackend: await safeStorage.getSelectedStorageBackend?.() || null };
  }
  async function clear() {
    generation++; clearing = true; blocked = true; importing?.abort();
    await importDone;
    snapshot = undefined; snapshotState = 'unknown';
    const failures = [];
    try { await fs.mkdir(directory,{recursive:true}); await fs.writeFile(filename + '.cleared','VV snapshot reads revoked\n',{mode:0o600}); } catch(error) { failures.push({file:storageFilename+'.cleared',code:error.code||'revoke_failed'}); }
    for (const path of [filename, filename + '.tmp', filename + '.rollback']) {
      try { await fs.rm(path, { force: true }); try { await fs.access(path); throw Error('File still exists'); } catch (error) { if (error.code !== 'ENOENT') throw error; } }
      catch (error) { failures.push({ file: require('node:path').basename(path), code: error.code || 'delete_failed' }); }
    }
    if (!failures.length) { snapshot = null; snapshotState = 'absent'; }
    clearing = false; return { cleared: !failures.length, failures };
  }
  async function dispatch(message, signal) {
    if (message.op === 'status') return status();
    if (message.op === 'clear') return clear();
    if (!grant().enabled) throw fault('disabled');
    if (message.op === 'import') {
      if (importing || clearing) throw fault('busy');
      const version = ++generation;
      const controller = new AbortController();
      importing = controller;
      let finishImport; importDone = new Promise(resolve => { finishImport = resolve; });
      const cancel = () => controller.abort();
      signal?.addEventListener('abort', cancel, { once: true });
      try {
        signal?.throwIfAborted();
        try { await fs.access(filename + '.rollback'); throw fault('rollback_failed'); } catch(error){if(error.code !== 'ENOENT')throw error;}
        try { await safeStorage.prepare?.(); } catch { throw fault('storage_unavailable'); }
        if (controller.signal.aborted || !grant().enabled) throw fault('disabled');
        if (!await safeStorage.isEncryptionAvailable()) throw fault('storage_unavailable');
        if (controller.signal.aborted || !grant().enabled) throw fault('disabled');
        const cookies = await capture({ portFile, signal: controller.signal });
        if (controller.signal.aborted || !grant().enabled) throw fault('disabled');
        // Only an explicit successful empty capture replaces the saved snapshot.
        if (!Array.isArray(cookies)) throw fault('read_failed');
        const next = { version: 1, importedAt: new Date().toISOString(), cookies };
        let encrypted;
        try { encrypted = await safeStorage.encryptString(JSON.stringify(next)); } catch { throw fault('storage_unavailable'); }
        let previous, hadMarker = false, replaced = false;
        const cancelled = () => controller.signal.aborted || !grant().enabled || generation !== version;
        try {
          try { previous = await fs.readFile(filename); } catch(error) { if(error.code !== 'ENOENT') throw error; }
          try { await fs.access(filename + '.cleared'); hadMarker = true; } catch(error) { if(error.code !== 'ENOENT') throw error; }
          await fs.writeFile(filename + '.rollback', previous || Buffer.alloc(0), {mode:0o600});
          await fs.writeFile(filename + '.tmp', encrypted, { mode: 0o600 });
          if (cancelled()) throw fault('disabled');
          await fs.rename(filename + '.tmp', filename); replaced = true;
          if (cancelled()) throw fault('disabled');
          await fs.rm(filename + '.cleared', {force:true});
          if (cancelled()) throw fault('disabled');
          // Linearization point: no await between the last cancellation check
          // and publishing the committed snapshot. Earlier loads cannot win.
          generation++; blocked = false; snapshot = next; snapshotState = next.cookies.length ? 'ready' : 'empty';
        } catch (error) {
          if (replaced) {
            try {
              if(previous) await fs.rename(filename + '.rollback', filename);
              else await fs.rm(filename, {force:true});
              if(hadMarker) await fs.writeFile(filename + '.cleared','VV snapshot reads revoked\n',{mode:0o600});
            } catch(rollbackError) {
              blocked = true; snapshot = undefined; snapshotState = 'rollback_failed';
              await fs.writeFile(filename + '.cleared','VV rollback requires review\n',{mode:0o600}).catch(()=>{});
              throw Object.assign(new Error('Snapshot save cancellation could not restore the previous file; retained rollback evidence requires review.'),{code:'rollback_failed',cause:rollbackError});
            }
          }
          throw error.code === 'disabled' ? error : fault('save_failed');
        } finally {
          await fs.rm(filename + '.tmp', { force: true }).catch(() => {});
          if(snapshotState !== 'rollback_failed') {
            try {await fs.rm(filename + '.rollback',{force:true});}
            catch {blocked=true;snapshotState='rollback_cleanup_failed';}
          }
        }
        return { ...await status(), committed: true, cleanupPending: snapshotState === 'rollback_cleanup_failed' };
      } finally { signal?.removeEventListener('abort', cancel); generation++; importing = null; finishImport(); }
    }
    if (message.op !== 'cookies') throw fault('invalid');
    await load();
    if (blocked) throw fault('no_snapshot');
    if (snapshot === undefined) throw Object.assign(new Error('Saved browser session could not be read or decrypted.'), { code: snapshotState });
    if (!snapshot) throw fault('no_snapshot');
    const cookies = P.scopedCookies(snapshot.cookies, message.url);
    if (!grant().enabled) throw fault('disabled');
    return { cookies };
  }
  async function close() { generation++; blocked = true; importing?.abort(); await importDone; snapshot = undefined; }
  return { close, clear, status, dispatch };
}
module.exports = { endpointFromPortFile, normalizeCookies, captureCookies, createSnapshotService };
