const fs = require('node:fs/promises');
const { join } = require('node:path');
const { createHash } = require('node:crypto');
const { discoverBrowserEndpoints } = require('./discovery.cjs');
const Snapshot = require('./snapshot.cjs');
const P = require('./protocol.cjs');
const Extension = require('./playwright-source.cjs');
const fault = (code, message) => Object.assign(new Error(message), { code });
const switched = () => fault('browser_source_changed', '浏览器来源已切换，请重试。');
function createCdpSource({ directory = P.root(), discover = discoverBrowserEndpoints,
  capture: captureEndpoint = Snapshot.captureCookies, io = fs,
  discoverExtensions = discover === discoverBrowserEndpoints ? Extension.browserConfirmedSources : () => [],
  captureExtension = Extension.captureExtension, inspectExtension = Extension.inspectInstallation } = {}) {
  const selectionFile = join(directory, 'cdp-selected-source.json');
  const active = new Set(), installation = new Map();
  let selectedId = null, selectedLabel = null, storageId = null, epoch = 0, selectionError, records = {};
  let selectionTail = (async () => {
    try {
      const value = JSON.parse(await io.readFile(selectionFile, 'utf8'));
      if (!/^[0-9a-f]{64}$/.test(value.id || '')) throw fault('browser_source_unavailable', '已保存的浏览器选择无效，请重新选择。');
      if (value.records && typeof value.records === 'object') for (const [id, record] of Object.entries(value.records)) {
        if (/^[0-9a-f]{64}$/.test(id) && /^[0-9a-f]{64}$/.test(record?.storageId || '')) records[id] = {storageId: record.storageId, label: String(record.label || 'Saved browser')};
      }
      selectedId = value.id; storageId = /^[0-9a-f]{64}$/.test(value.storageId || '') ? value.storageId : value.id; selectedLabel = typeof value.label === 'string' ? value.label : 'Browser';
      records[selectedId] = { storageId, label: selectedLabel };
    } catch (error) {
      if (error.code !== 'ENOENT') selectionError = error instanceof SyntaxError
        ? fault('browser_source_unavailable', '已保存的浏览器选择无效，请重新选择。') : error;
    }
  })();
  async function sources(signal) {
    signal?.throwIfAborted();
    const endpoints = [...await discover({ signal }), ...await discoverExtensions()];
    signal?.throwIfAborted();
    return endpoints.map(item => {
      // Old injected discoveries remain distinguishable; never silently use their
      // changing WebSocket token as a new storage account.
      const endpoint = typeof item === 'string' ? item : item.endpoint;
      const identity = typeof item === 'string' ? 'unverified-endpoint:' + endpoint : item.identity;
      const id = createHash('sha256').update(identity).digest('hex');
      const legacyId = endpoint ? createHash('sha256').update(endpoint).digest('hex') : null;
      return { id, legacyId, label: typeof item === 'string' ? new URL(endpoint).host + ' (profile unverified)' : item.label, endpoint,
        ...(typeof item === 'object' && item.kind === 'playwright-extension' ? {kind: item.kind, extension: item.extension} : {}) };
    });
  }
  async function list() { await selectionTail; const live = (await sources()).map(({ id, label }) => ({ id, label, available: true }));
    return [...live, ...Object.entries(records).filter(([id])=>!live.some(item=>item.id===id)).map(([id,value])=>({id,label:value.label,available:false}))]; }
  async function selected() {
    await selectionTail;
    if (selectionError) throw selectionError;
    return selectedId ? { id: selectedId, storageId, label: selectedLabel,
      extensionInstallation: installation.get(selectedId) || {state: 'unknown'} } : null;
  }
  function select(id) {
    const operation = selectionTail.then(async () => {
      const source = (await sources()).find(source => source.id === id) || (records[id] ? {id,label:records[id].label} : null);
      const nextStorageId = records[id]?.storageId || (selectedId === source?.legacyId ? storageId : (selectedId === id ? storageId : id));
      if (!source) throw fault('browser_source_unavailable', '所选浏览器连接不可用。');
      if (selectedId === id && selectedLabel === source.label && !selectionError) return { id, label: source.label };
      epoch++;
      for (const controller of active) controller.abort(switched());
      const previous = selectedId;
      selectedId = null;
      try {
        await io.mkdir(directory, { recursive: true });
        const nextRecords = {...records, [id]: {storageId: nextStorageId,label:source.label}};
        // A proven legacy-endpoint mapping is one source, not two independent
        // mutable accounts pointing at the same encrypted file.
        for(const [oldId,record] of Object.entries(nextRecords)) if(oldId!==id && record.storageId===nextStorageId) delete nextRecords[oldId];
        await io.writeFile(selectionFile + '.tmp', JSON.stringify({ id, storageId: nextStorageId, label: source.label, records: nextRecords }), { mode: 0o600 });
        await io.rename(selectionFile + '.tmp', selectionFile);
        selectedId = id; storageId = nextStorageId; selectedLabel = source.label; records = nextRecords; selectionError = undefined;
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
    let abortListener, extensionWork = false;
    const stopped = new Promise((_, reject) => {
      abortListener = () => reject(controller.signal.reason);
      controller.signal.addEventListener('abort', abortListener, { once: true });
    });
    try {
      const work = (async () => {
        const source = (await sources(controller.signal)).find(source => source.id === boundId);
        check();
        if (!source) throw fault('browser_source_unavailable', '所选浏览器连接不可用。');
        // Installation evidence is not a permission/connection gate. The
        // official extension still asks the user to allow this import.
        extensionWork = source.kind === 'playwright-extension';
        const cookies = source.kind === 'playwright-extension'
          ? await captureExtension(source, { signal: controller.signal })
          : await captureEndpoint({ endpoint: source.endpoint, signal: controller.signal });
        check();
        if (source.kind === 'playwright-extension') installation.set(boundId, {state: 'installed', evidence: 'successful_extension_connection', connection: 'verified_for_last_import'});
        return cookies;
      })();
      try { return await Promise.race([work, stopped]); }
      catch (error) {
        // The extension adapter acknowledges cancellation only after its worker
        // closes and its private temporary artifacts are removed. Keep the UI
        // pending until that cleanup settles; legacy CDP retains its late guard.
        if (extensionWork) { try { await work; } catch (settledError) { if (settledError?.code === 'cleanup_failed') throw settledError; } }
        throw error;
      }
    } finally {
      active.delete(controller);
      signal?.removeEventListener('abort', abort);
      controller.signal.removeEventListener('abort', abortListener);
    }
  }
  async function inspectSelected() {
    await selectionTail;
    const id = selectedId;
    if (!id) return {state: 'unknown'};
    // Constructing selected-source metadata does not enumerate browser profiles.
    const source = (await discoverExtensions()).find(item => createHash('sha256').update(item.identity).digest('hex') === id);
    const state = source ? await inspectExtension(source) : {state: 'not_applicable'};
    if (selectedId === id) installation.set(id, state);
    return state;
  }
  return { list, selected, select, capture, inspectSelected };
}
module.exports = { createCdpSource };
