import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
let factory, Component, inject, index = 0;
const states = [], calls = [], callPayloads = [];
let connected = false, imported = false, enabled = true, failRefresh = false, finishImport;
const importResult = new Promise(resolve => { finishImport = resolve; });
const status = () => ({ enabled, connected, imported, snapshotState: imported ? "ready" : "absent", sourceId: "A", sourceAvailable: true, ready: true, supported: false, browser: 'Google Chrome', desktopIntegration: false });
const listing = () => ({ entries: [], bytes: 0, root: 'C:\\fixture-cache', browser_session: status() });
let dictionaries, clearResult = { cleared: true, failures: [] }, clearPending;

const React = {
  useSyncExternalStore: (_subscribe, getSnapshot) => getSnapshot(),
  createElement: (type, props, ...children) => ({ type, props: props || {}, children }),
  useState: value => { const slot = index++; if (!(slot in states)) states[slot] = value; return [states[slot], next => { states[slot] = typeof next === 'function' ? next(states[slot]) : next; }]; },
  useRef: () => ({ current: null }), useEffect() {}
};
const window = { __ModuleLoader__: { load: module => { factory = module.factory; } } };
const clientSource = await readFile(new URL('../client.js', import.meta.url), 'utf8');
vm.runInNewContext(clientSource, { window, dshDesktop: { protocolVersion: 1, browser: {} } });
factory(() => React).apply({ effect: fn => fn(), locale: { register: (_ns, values) => { dictionaries = values; return () => {}; }, bind: () => key => dictionaries.zh[key], getSnapshot: () => ({ active: 'zh' }), subscribe: () => () => {} },
  connection: { rpc: { call: async (_path, method, payload) => {
    calls.push(method); callPayloads.push({method,payload}); let value;
    if (method.endsWith('/browser-setup')) { await importResult; connected = imported = true; value = status(); }
    else if (method.endsWith('/browser-refresh')) {
      if (failRefresh) return { ok: false, error: { message: '浏览器未确认，原登录态未改动。' } };
      connected = imported = true; value = status();
    }
    else if (method.endsWith('/browser-clear')) { await clearPending; value = clearResult; if (value.cleared) connected = imported = false; }
    else if (method.endsWith('/browser-cancel')) value = {cancellationRequested:true};
    else if (method.endsWith('/browser-status')) value = status();
    else if (method.endsWith('/browser-authorization')) { enabled = payload.enabled; value = status(); }
    else if (method.endsWith('/list')) value = listing();
    else throw new Error(method);
    return { ok: true, value };
  } } },
  slots: { inject: (_name, callback) => callback(), register: (options, component) => { Component = component; inject = options.inject; } }
});
assert.equal(dictionaries.zh.ui48, '保持已登录的浏览器运行；现有的浏览器连接会自动识别。');
assert.equal(dictionaries.zh.ui53, '安装后，在浏览器内确认连接；再次导入会更新此处保存的登录态。');
assert.equal(dictionaries.en.ui48, 'Keep your signed-in browser running. Existing browser connections are detected automatically.');
assert.equal(dictionaries.en.ui53, 'After installation, confirm the connection in the browser. Importing again updates the login state saved here.');
states[0] = listing();
function render() {
  index = 0; const nodes = [];
  function walk(node) { if (!node || typeof node !== 'object') return; nodes.push(node); for (const child of node.children || []) { if (Array.isArray(child)) child.forEach(walk); else walk(child); } }
  walk(Component(inject())); return nodes;
}
const button = (nodes, label) => nodes.find(n => n.type === 'button' && n.children[0] === label);
let nodes = render();
assert.equal(calls.length, 0, 'Rendering never starts browser import or opens a window');
assert.equal(button(nodes, '导入登录态').props.disabled, false);
assert.equal(button(nodes, '刷新登录态').props.disabled, true);
assert(!nodes.some(n => n.props['aria-label'] === '同步至 DSH 内置浏览器'));
assert(nodes.some(n => n.type === 'strong' && n.props.className === 'vv-first-use'));
assert.match(nodes.find(n => n.type === 'style').children[0], /vv-first-use\{[^}]*font-size:inherit;[^}]*font-weight:700/);
assert(nodes.some(n => n.props.className === 'vv-sub' && n.children.includes('若登录态失效，请点击“刷新登录态”。')));
const pending = button(nodes, '导入登录态').props.onClick();
nodes = render();
assert.equal(button(nodes, '正在导入登录态…').props.disabled, true);
assert.equal(button(nodes, '取消导入').props.disabled, false);
await button(nodes, '取消导入').props.onClick();
assert.equal(calls.filter(x=>x.endsWith('/browser-cancel')).length,1);
assert.equal(button(render(), '正在导入登录态…').props.disabled,true,'Cancellation request does not prematurely unlock the pending import');
finishImport(); await pending;
nodes = render();
assert.equal(button(nodes, '登录态已导入').props.disabled, true);
assert.equal(button(nodes, '刷新登录态').props.disabled, false);
assert(nodes.some(n => n.props.role === 'status' && n.children.includes('导入完成：登录态已保存。')));
failRefresh = true;
await button(nodes, '刷新登录态').props.onClick(); nodes = render();
assert(nodes.some(n => n.props.role === 'alert' && n.children.includes('浏览器未确认，原登录态未改动。')));
assert.equal(button(nodes, '刷新登录态').props.disabled, false);
assert.equal(button(nodes, '登录态已导入').props.disabled, true);
failRefresh = false;
await button(nodes, '刷新登录态').props.onClick(); nodes = render();
assert(nodes.some(n => n.props.role === 'status' && n.children.includes('刷新完成：登录态已更新。')));
connected = false;
await button(nodes, '检查状态').props.onClick(); nodes = render();
assert.equal(callPayloads.findLast(c=>c.method.endsWith('/browser-status')).payload.checkExtension,true,'Explicit status check requests selected-source installation confirmation');
assert.equal(button(nodes, '导入登录态').props.disabled, false);
await nodes.find(n => n.props['aria-label'] === '授权使用默认浏览器登录态').props.onChange({ target: { checked: false } });
assert(render().some(n => n.props.role === 'status' && n.children.includes('已保存：浏览器登录态授权关闭。')));
assert(!calls.some(c => c.endsWith('/browser-settings')));
console.log('PASS: import/refresh pending-success-failure, effective button disabled, refresh available, reminder, bold font, no built-in sync, no automatic browser opening.');

// Clear uses an explicit scoped confirmation and never calls media clear or a browser API.
nodes=render();
button(nodes,'清理登录态').props.onClick();nodes=render();
assert(nodes.some(n=>n.props.role==='alertdialog' && n.props['aria-label']==='清理登录态'));
assert(nodes.some(n=>n.children.some(c=>typeof c==='string'&&c.includes('不退出来源浏览器或 DSH 内置浏览器的登录，也不清理媒体缓存'))));
button(nodes,'取消').props.onClick();nodes=render();assert(!nodes.some(n=>n.props.role==='alertdialog'));
assert(!calls.some(c=>c.endsWith('/browser-clear')));
button(nodes,'清理登录态').props.onClick();nodes=render();
let finishClear;clearPending=new Promise(resolve=>{finishClear=resolve});
const clearing=button(nodes,'确认删除').props.onClick();nodes=render();
assert.equal(button(nodes,'正在清理登录态…').props.disabled,true);
finishClear();await clearing;nodes=render();
assert(nodes.some(n=>n.props.role==='status'&&n.children.includes('Video Vision 登录态副本已清理。来源浏览器、DSH 内置浏览器和媒体缓存未改动。')));
clearResult={cleared:false,failures:[{path:'synthetic-copy',code:'EACCES'}]};
button(nodes,'清理登录态').props.onClick();nodes=render();
await button(nodes,'确认删除').props.onClick();nodes=render();
assert(nodes.some(n=>n.props.role==='alert'&&n.children.some(c=>typeof c==='string'&&c.includes('synthetic-copy: EACCES'))));
assert(!nodes.some(n=>n.props.role==='status'));
assert(!calls.some(c=>c.endsWith('/clear')));
clearResult={cleared:true,failures:[]};button(nodes,'清理登录态').props.onClick();nodes=render();await button(nodes,'确认删除').props.onClick();
assert(render().some(n=>n.props.role==='status'));
console.log('PASS: clear confirmation/cancel/pending/success/partial failure/retry; no media clear RPC.');
