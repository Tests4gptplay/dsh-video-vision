// Loaded in DSH Desktop main. Reads site-scoped cookies from the encrypted local snapshot.
const fs = require('node:fs');
const { join } = require('node:path');
const P = require('./protocol.cjs');
const Snapshot = require('./snapshot.cjs');
const identity = c => [c.domain, c.path || '/', c.name].join('\n');
function details(c, fallback) {
  const domain = c.domain.replace(/^\./, '');
  const result = { url: (c.secure ? 'https://' : 'http://') + domain + (c.path || '/'), name: c.name, value: c.value,
    path: c.path || '/', secure: Boolean(c.secure), httpOnly: Boolean(c.httpOnly),
    sameSite: ({ no_restriction: 'no_restriction', lax: 'lax', strict: 'strict' })[c.sameSite] || 'unspecified' };
  if (!c.hostOnly) result.domain = c.domain;
  if (Number.isFinite(c.expirationDate)) result.expirationDate = c.expirationDate;
  return result;
}
function createSync({ directory = P.root(), request = Snapshot.request, watch = true } = {}) {
  const sessions = new Map();
  let epoch = 0, watcher;
  function state(session) {
    if (!sessions.has(session)) sessions.set(session, { imported: new Map(), work: Promise.resolve() });
    return sessions.get(session);
  }
  async function revoke(session, data) {
    for (const saved of data.imported.values()) {
      // Touch only keys this bridge imported, restoring the previous native value.
      await session.cookies.remove(saved.details.url, saved.details.name).catch(() => {});
      if (saved.previous) await session.cookies.set(details(saved.previous)).catch(() => {});
    }
    data.imported.clear();
  }
  async function changed() {
    epoch++;
    if (P.authorization(directory).syncToNative) return;
    await Promise.all([...sessions].map(([session, data]) => {
      data.work = data.work.catch(() => {}).then(() => revoke(session, data));
      return data.work;
    }));
  }
  if (watch && fs.existsSync(directory)) {
    watcher = fs.watch(directory, { persistent: false }, (_type, file) => {
      if (String(file) === 'authorization.json') void changed();
    });
    watcher.on('error', () => {});
  }
  async function beforeRequest(session, value) {
    const data = state(session);
    data.work = data.work.catch(() => {}).then(async () => {
      if (!P.authorization(directory).syncToNative) { await revoke(session, data); return; }
      const start = epoch;
      const url = P.siteUrl(value);
      const response = await request('sync', { url: url.href }, { directory, timeoutMs: 3000 });
      if (start !== epoch || !P.authorization(directory).syncToNative) return;
      const current = await session.cookies.get({ url: url.href });
      const cookies = P.scopedCookies(response.cookies, url.href).filter(c => !c.partitionKey);
      const incoming = new Set(cookies.map(identity));
      // Browser logout removes previously imported cookies on the next visit.
      for (const [key, saved] of data.imported) if (P.scopedCookies([saved.cookie], url.href).length && !incoming.has(key)) {
        await session.cookies.remove(saved.details.url, saved.details.name).catch(() => {});
        if (saved.previous) await session.cookies.set(details(saved.previous)).catch(() => {});
        data.imported.delete(key);
      }
      for (const cookie of cookies) {
        if (start !== epoch || !P.authorization(directory).syncToNative) break;
        const key = identity(cookie), value = details(cookie);
        const saved = data.imported.get(key);
        await session.cookies.set(value);
        data.imported.set(key, { cookie, details: value, previous: saved ? saved.previous : current.find(c => identity(c) === key) });
      }
      if (!P.authorization(directory).syncToNative) await revoke(session, data);
    });
    // A missing bridge must not disable ordinary browsing.
    await data.work.catch(() => {});
  }
  return { beforeRequest, changed, async dispose() { watcher?.close(); epoch++; await Promise.all([...sessions].map(async ([s, d]) => { await d.work.catch(() => {}); await revoke(s, d); })); sessions.clear(); } };
}
// Initialize the local snapshot service in the Desktop main process.
if (process.versions.electron && process.type === 'browser') Snapshot.startDesktopService();
const instance = createSync();
module.exports = { beforeRequest: instance.beforeRequest, createSync };
