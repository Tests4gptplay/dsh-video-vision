const fs = require('node:fs/promises');
const { join } = require('node:path');
const { createHash } = require('node:crypto');
const { discoverBrowserEndpoints } = require('./discovery.cjs');
const Snapshot = require('./snapshot.cjs');
const P = require('./protocol.cjs');
const fault = (code, message) => Object.assign(new Error(message), { code });
const switched = () => fault('browser_source_changed', '浏览器来源已切换，请重试。');
function createCdpSource({ directory = P.root(), discover = discoverBrowserEndpoints,
  capture: captureEndpoint = Snapshot.captureCookies, io = fs } = {}) {
  const selectionFile = join(directory, 'cdp-selected-source.json');
  const active = new Set();
  let selectedId = null, selectedLabel = null, epoch = 0, selectionError;
  let selectionTail = (async () => {
    try {
      const value = JSON.parse(await io.readFile(selectionFile, 'utf8'));
      if (!/^[0-9a-f]{64}$/.test(value.id || '')) throw fault('browser_source_unavailable', '已保存的浏览器选择无效，请重新选择。');
      selectedId = value.id; selectedLabel = typeof value.label === 'string' ? value.label : 'Browser';
    } catch (error) {
      if (error.code !== 'ENOENT') selectionError = error instanceof SyntaxError
        ? fault('browser_source_unavailable', '已保存的浏览器选择无效，请重新选择。') : error;
    }
  })();
  async function sources(signal) {
    signal?.throwIfAborted();
    const endpoints = await discover({ signal });
    signal?.throwIfAborted();
    return [...new Set(endpoints)].map(endpoint => {
      const id = createHash('sha256').update(endpoint).digest('hex');
      let label = 'Browser';
      try {
        const url = new URL(endpoint);
        const browserId = url.pathname.match(/\/devtools\/browser\/([a-zA-Z0-9-]+)/)?.[1]?.slice(0, 8);
        label = 'Browser' + (url.port ? ' :' + url.port : '') + (browserId ? ' · ' + browserId : '');
      } catch {}
      return { id, label, endpoint };
    });
  }
  async function list() { return (await sources()).map(({ id, label }) => ({ id, label })); }
  async function selected() {
    await selectionTail;
    if (selectionError) throw selectionError;
    return selectedId ? { id: selectedId, label: selectedLabel } : null;
  }
  function select(id) {
    const operation = selectionTail.then(async () => {
      const source = (await sources()).find(source => source.id === id);
      if (!source) throw fault('browser_source_unavailable', '所选浏览器连接不可用。');
      if (selectedId === id && selectedLabel === source.label && !selectionError) return { id, label: source.label };
      epoch++;
      for (const controller of active) controller.abort(switched());
      const previous = selectedId;
      selectedId = null;
      try {
        await io.mkdir(directory, { recursive: true });
        await io.writeFile(selectionFile + '.tmp', JSON.stringify({ id, label: source.label }), { mode: 0o600 });
        await io.rename(selectionFile + '.tmp', selectionFile);
        selectedId = id; selectedLabel = source.label; selectionError = undefined;
      } catch (error) { selectedId = previous; throw error; }
      return { id, label: source.label };
    });
    selectionTail = operation.catch(() => {});
    return operation;
  }
  async function capture({ signal } = {}) {
    await selectionTail;
    signal?.throwIfAborted();
    if (selectionError) throw selectionError;
    if (!selectedId) throw fault('browser_source_required', '请选择来源浏览器连接。');
    const boundId = selectedId, generation = epoch, controller = new AbortController();
    const abort = () => controller.abort(signal.reason);
    signal?.addEventListener('abort', abort, { once: true });
    active.add(controller);
    const check = () => {
      controller.signal.throwIfAborted();
      if (selectedId !== boundId || epoch !== generation) throw switched();
    };
    let abortListener;
    const stopped = new Promise((_, reject) => {
      abortListener = () => reject(controller.signal.reason);
      controller.signal.addEventListener('abort', abortListener, { once: true });
    });
    try {
      const work = (async () => {
        const source = (await sources(controller.signal)).find(source => source.id === boundId);
        check();
        if (!source) throw fault('browser_source_unavailable', '所选浏览器连接不可用。');
        const cookies = await captureEndpoint({ endpoint: source.endpoint, signal: controller.signal });
        check();
        return cookies;
      })();
      return await Promise.race([work, stopped]);
    } finally {
      active.delete(controller);
      signal?.removeEventListener('abort', abort);
      controller.signal.removeEventListener('abort', abortListener);
    }
  }
  return { list, selected, select, capture };
}
module.exports = { createCdpSource };
