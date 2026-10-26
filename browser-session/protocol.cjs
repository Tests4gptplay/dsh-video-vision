const { createHash, randomUUID } = require('node:crypto');
const { homedir } = require('node:os');
const { join, resolve } = require('node:path');
const { readFileSync } = require('node:fs');
const net = require('node:net');
function root() { return process.env.DSH_BROWSER_SESSION_HOME || join(process.env.DSH_HOME || join(homedir(), '.dsh'), 'browser-sessions'); }
function socketPath(directory = root(), channel = 'bridge') {
  const id = createHash('sha256').update(resolve(directory).toLowerCase() + (channel === 'snapshot' ? ':snapshot' : '')).digest('hex').slice(0, 20);
  return process.platform === 'win32' ? '\\\\.\\pipe\\dsh-browser-session-' + id : join(directory, 'bridge.sock');
}
function authorization(directory = root()) {
  try { const value = JSON.parse(readFileSync(join(directory, 'authorization.json'), 'utf8'));
    return { enabled: value.enabled === true, syncToNative: value.enabled === true && value.syncToNative === true };
  } catch { return { enabled: false, syncToNative: false }; }
}
function frames(stream, callback, fail = () => {}) {
  let pending = Buffer.alloc(0);
  stream.on('data', chunk => {
    pending = Buffer.concat([pending, chunk]);
    while (pending.length >= 4) {
      const size = pending.readUInt32LE(0);
      if (size > 4 * 1024 * 1024) { pending = Buffer.alloc(0); fail(); return; }
      if (pending.length < size + 4) return;
      const payload = pending.subarray(4, size + 4); pending = pending.subarray(size + 4);
      try { callback(JSON.parse(payload.toString('utf8'))); } catch { fail(); }
    }
  });
}
function send(stream, value) {
  const payload = Buffer.from(JSON.stringify(value));
  const header = Buffer.alloc(4); header.writeUInt32LE(payload.length);
  stream.write(Buffer.concat([header, payload]));
}
function request(op, payload = {}, { directory = root(), signal, timeoutMs = 20000, channel = 'bridge', messages = {} } = {}) {
  signal?.throwIfAborted();
  return new Promise((resolveRequest, reject) => {
    const socket = net.connect(socketPath(directory, channel));
    let settled = false;
    const finish = (error, value) => {
      if (settled) return; settled = true; clearTimeout(timer);
      signal?.removeEventListener('abort', abort); socket.destroy();
      error ? reject(error) : resolveRequest(value);
    };
    const abort = () => finish(signal.reason);
    const timer = setTimeout(() => finish(new Error('本地会话服务未响应，请重新打开设置。')), timeoutMs);
    signal?.addEventListener('abort', abort, { once: true });
    socket.once('error', () => finish(new Error('本地会话组件尚未启动，请重启 DSH Desktop 后再试。')));
    socket.once('close', () => { if (!settled) finish(new Error('本地浏览器桥已断开。')); });
    socket.once('connect', () => {
      let key; try { key = readFileSync(join(directory, 'bridge.key'), 'utf8').trim(); } catch { finish(new Error('请先设置本地浏览器桥。')); return; }
      send(socket, { id: randomUUID(), op, ...payload, key });
    });
    frames(socket, value => value.ok ? finish(null, value.value) : finish(new Error(
      messages[value.code] || (value.code === 'disabled' ? '默认浏览器授权已关闭。' :
      value.code === 'sync_disabled' ? '内置浏览器同步已关闭。' : '本地浏览器请求未完成，请检查连接。')
    )), () => finish(new Error('本地浏览器桥响应无效。')));
  });
}
function siteUrl(value) {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('需要普通 HTTP(S) 站点地址。');
  return url;
}
function scopedCookies(cookies, value) {
  const url = siteUrl(value);
  return (Array.isArray(cookies) ? cookies : []).filter(c => {
    const domain = String(c.domain || '').replace(/^\./, '').toLowerCase();
    return typeof c.name === 'string' && typeof c.value === 'string' && !/[\r\n;]/.test(c.name + c.value) &&
      (c.hostOnly ? url.hostname === domain : url.hostname === domain || url.hostname.endsWith('.' + domain)) &&
      (!c.secure || url.protocol === 'https:') && (!c.expirationDate || c.expirationDate > Date.now() / 1000) &&
      (url.pathname === (c.path || '/') || url.pathname.startsWith((c.path || '/').replace(/\/$/, '') + '/'));
  }).sort((a, b) => (b.path || '/').length - (a.path || '/').length);
}
module.exports = { root, socketPath, authorization, frames, send, request, siteUrl, scopedCookies };
