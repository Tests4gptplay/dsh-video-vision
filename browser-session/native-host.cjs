const fs = require('node:fs');
const net = require('node:net');
const { join } = require('node:path');
const { createHash, randomUUID, timingSafeEqual } = require('node:crypto');
const P = require('./protocol.cjs');
const manifest = require('./extension/manifest.json');
const extensionId = createHash('sha256').update(Buffer.from(manifest.key, 'base64')).digest('hex').slice(0, 32).replace(/[0-9a-f]/g, c => String.fromCharCode(97 + parseInt(c, 16)));
if (!process.argv.includes('chrome-extension://' + extensionId + '/')) process.exit(1);
const key = fs.readFileSync(join(P.root(), 'bridge.key'), 'utf8').trim();
if (!/^[0-9a-f]{64}$/.test(key)) process.exit(1);
const pending = new Map(), clients = new Set();
let ready = false;
const server = net.createServer(socket => {
  clients.add(socket); socket.once('close', () => clients.delete(socket));
  socket.on('error', () => {});
  P.frames(socket, message => {
    const reply = (ok, value, code) => { if (!socket.destroyed) P.send(socket, { id: message.id, ok, value, code }); };
    if (typeof message.key !== 'string' || Buffer.byteLength(message.key) !== Buffer.byteLength(key) || !timingSafeEqual(Buffer.from(message.key), Buffer.from(key))) { reply(false, undefined, 'unauthorized'); return; }
    if (message.op === 'status') { reply(true, { connected: ready, ...P.authorization(), provider: 'default-browser-local' }); return; }
    if (!['cookies', 'sync'].includes(message.op)) { reply(false, undefined, 'unsupported'); return; }
    const grant = P.authorization();
    if (!grant.enabled) { reply(false, undefined, 'disabled'); return; }
    if (message.op === 'sync' && !grant.syncToNative) { reply(false, undefined, 'sync_disabled'); return; }
    let url;
    try { url = P.siteUrl(message.url).href; } catch { reply(false, undefined, 'invalid_url'); return; }
    if (!ready) { reply(false, undefined, 'disconnected'); return; }
    const id = randomUUID();
    const timer = setTimeout(() => { pending.delete(id); reply(false, undefined, 'timeout'); }, 20000);
    const cleanup = () => { clearTimeout(timer); pending.delete(id); };
    socket.once('close', cleanup);
    pending.set(id, { url, op: message.op, finish: result => {
      cleanup(); socket.removeListener('close', cleanup);
      const current = P.authorization();
      if (!current.enabled || (message.op === 'sync' && !current.syncToNative)) { reply(false, undefined, 'disabled'); return; }
      if (result.error) { reply(false, undefined, 'browser_error'); return; }
      reply(true, { cookies: P.scopedCookies(result.cookies, url) });
    } });
    P.send(process.stdout, { id, op: 'cookies', url });
  }, () => socket.destroy());
});
P.frames(process.stdin, message => {
  if (message.op === 'hello') { ready = true; return; }
  pending.get(message.id)?.finish(message);
}, () => shutdown());
function shutdown() {
  for (const item of pending.values()) item.finish({ error: true });
  for (const socket of clients) socket.destroy();
  server.close(); process.exit(0);
}
process.stdin.once('end', shutdown);
process.on('SIGTERM', shutdown);
server.once('error', () => { P.send(process.stdout, { op: 'error', message: '本机已有会话桥连接，请使用已连接的浏览器资料。' }); process.exit(1); });
fs.mkdirSync(P.root(), { recursive: true });
server.listen(P.socketPath());
