const { createHash, randomUUID } = require('node:crypto');
const { homedir, endianness } = require('node:os');
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
// Local IPC has a UInt32LE byte length, not Chrome's native-messaging budget.
// Accumulate only received bytes (not the advertised size), and concatenate once
// per frame so fragmented large cookie snapshots do not incur quadratic copies.
const localFormat = { byteOrder: 'LE', maxBytes: 0xffffffff };
// Chrome stdio is a separate protocol: native byte order and asymmetric limits.
// https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging
const nativeInputFormat = { byteOrder: endianness(), maxBytes: 64 * 1024 * 1024 };
const nativeOutputFormat = { byteOrder: endianness(), maxBytes: 1024 * 1024 };
function frameError(message) {
  return Object.assign(new Error(message), { code: 'invalid_browser_session_frame' });
}
function decodeFrames(stream, callback, fail, { byteOrder, maxBytes }) {
  const header = Buffer.alloc(4);
  const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
  let headerBytes = 0, size, received = 0, parts = [], stopped = false;
  function detach() {
    stopped = true; parts = [];
    stream.removeListener('data', data);
    stream.removeListener('end', ended);
    stream.removeListener('close', ended);
    stream.removeListener('error', failed);
  }
  function failed(error) {
    if (stopped) return;
    detach(); fail(error);
  }
  function ended() {
    if (stopped) return;
    if (headerBytes || size !== undefined) failed(frameError('Incomplete browser session frame.'));
    else detach();
  }
  function data(chunk) {
    if (stopped) return;
    try {
      if (!Buffer.isBuffer(chunk)) chunk = Buffer.from(chunk);
      let offset = 0;
      while (offset < chunk.length && !stopped) {
        if (size === undefined) {
          const count = Math.min(4 - headerBytes, chunk.length - offset);
          chunk.copy(header, headerBytes, offset, offset + count);
          headerBytes += count; offset += count;
          if (headerBytes !== 4) continue;
          size = byteOrder === 'LE' ? header.readUInt32LE(0) : header.readUInt32BE(0);
          headerBytes = 0;
          if (!size || size > maxBytes) throw frameError('Invalid browser session frame length.');
        }
        const count = Math.min(size - received, chunk.length - offset);
        if (count) { parts.push(chunk.subarray(offset, offset + count)); received += count; offset += count; }
        if (received !== size) continue;
        const payload = parts.length === 1 ? parts[0] : Buffer.concat(parts, size);
        size = undefined; received = 0; parts = [];
        callback(JSON.parse(decoder.decode(payload)));
      }
    } catch (error) { failed(error); }
  }
  stream.on('data', data);
  stream.once('end', ended);
  stream.once('close', ended);
  stream.once('error', failed);
  return detach;
}
function encodeFrame(stream, value, { byteOrder, maxBytes }) {
  const payload = Buffer.from(JSON.stringify(value));
  if (payload.length > maxBytes) throw frameError('Browser session message exceeds this protocol\'s length limit.');
  const header = Buffer.alloc(4);
  if (byteOrder === 'LE') header.writeUInt32LE(payload.length); else header.writeUInt32BE(payload.length);
  // Two queued writes avoid copying a complete large payload just to prefix it.
  stream.cork?.();
  try { stream.write(header); return stream.write(payload); }
  finally { stream.uncork?.(); }
}
function frames(stream, callback, fail = () => {}) { return decodeFrames(stream, callback, fail, localFormat); }
function send(stream, value) { return encodeFrame(stream, value, localFormat); }
function framesNative(stream, callback, fail = () => {}) { return decodeFrames(stream, callback, fail, nativeInputFormat); }
function sendNative(stream, value) { return encodeFrame(stream, value, nativeOutputFormat); }
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
    socket.once('error', cause => finish(Object.assign(new Error('无法连接本地会话组件，请检查组件状态。', { cause }), { code: 'browser_session_unavailable' })));
    socket.once('close', () => { if (!settled) finish(new Error('本地浏览器桥已断开。')); });
    socket.once('connect', () => {
      let key; try { key = readFileSync(join(directory, 'bridge.key'), 'utf8').trim(); } catch { finish(new Error('请先设置本地浏览器桥。')); return; }
      try { send(socket, { id: randomUUID(), op, ...payload, key }); }
      catch (error) { finish(error); }
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
module.exports = { root, socketPath, authorization, frames, send, framesNative, sendNative, request, siteUrl, scopedCookies };
