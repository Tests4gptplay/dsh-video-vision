import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
let factory, Component, inject, index = 0;
const states = [], calls = [];
let connected = false, imported = false, enabled = true, syncToNative = false, failRefresh = false, finishImport;
const importResult = new Promise(resolve => { finishImport = resolve; });
const status = () => ({ enabled, syncToNative, connected, imported, ready: true, supported: false, browser: 'Google Chrome', desktopIntegration: false });
const listing = () => ({ entries: [], bytes: 0, root: 'C:\\fixture-cache', browser_session: status() });
let dictionaries;
const React = {
  useSyncExternalStore: (_subscribe, getSnapshot) => getSnapshot(),
  createElement: (type, props, ...children) => ({ type, props: props || {}, children }),
  useState: value => { const slot = index++; if (!(slot in states)) states[slot] = value; return [states[slot], next => { states[slot] = typeof next === 'function' ? next(states[slot]) : next; }]; },
  useRef: () => ({ current: null }), useEffect() {}
};
const window = { __ModuleLoader__: { load: module => { factory = module.factory; } } };
vm.runInNewContext(await readFile(new URL('../client.js', import.meta.url), 'utf8'), { window, dshDesktop: { protocolVersion: 1, browser: {} } });
factory(() => React).apply({ effect: fn => fn(), locale: { register: (_ns, values) => { dictionaries = values; return () => {}; }, bind: () => key => dictionaries.zh[key], getSnapshot: () => ({ active: 'zh' }), subscribe: () => () => {} },
  connection: { rpc: { call: async (_path, method, payload) => {
    calls.push(method); let value;
    if (method.endsWith('/browser-setup')) { await importResult; connected = imported = true; value = status(); }
    else if (method.endsWith('/browser-refresh')) {
      if (failRefresh) return { ok: false, error: { message: '浏览器未确认，原登录态未改动。' } };
      connected = imported = true; value = status();
    }
    else if (method.endsWith('/browser-status')) value = status();
    else if (method.endsWith('/browser-authorization')) { enabled = payload.enabled; syncToNative = payload.syncToNative; value = status(); }
    else if (method.endsWith('/list')) value = listing();
    else throw new Error(method);
    return { ok: true, value };
  } } },
  slots: { inject: (_name, callback) => callback(), register: (options, component) => { Component = component; inject = options.inject; } }
});
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
assert.equal(nodes.find(n => n.props['aria-label'] === '同步至 DSH 内置浏览器').props.disabled, false);
assert(nodes.some(n => n.type === 'strong' && n.props.className === 'vv-first-use'));
assert.match(nodes.find(n => n.type === 'style').children[0], /vv-first-use\{[^}]*font-size:inherit;[^}]*font-weight:700/);
assert(nodes.some(n => n.props.className === 'vv-sub' && n.children.includes('若登录态失效，请点击“刷新登录态”。')));
const pending = button(nodes, '导入登录态').props.onClick();
nodes = render();
assert.equal(button(nodes, '正在导入登录态…').props.disabled, true);
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
assert.equal(button(nodes, '导入登录态').props.disabled, false);
await nodes.find(n => n.props['aria-label'] === '同步至 DSH 内置浏览器').props.onChange({ target: { checked: true } });
assert(render().some(n => n.props.role === 'status' && n.children.includes('已保存：默认浏览器授权开启，内置浏览器同步开启。')));
assert(!calls.some(c => c.endsWith('/browser-settings')));
console.log('PASS: import/refresh pending-success-failure, effective button disabled, refresh available, reminder, bold font, independent sync, no automatic browser opening.');
