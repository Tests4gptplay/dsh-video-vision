import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
const script = await readFile(new URL('../client.js', import.meta.url), 'utf8');
function fixture(desktop = false) {
 let factory, Component, inject, index = 0, dictionaries, language = 'zh';
 const states = [], calls = [];
 let status = { enabled: true, syncToNative: false, connected: false, imported: false, ready: true,
  localCapture: true, sourceId: 'A', browser: 'Synthetic A', sources: [{ id: 'A', label: 'Synthetic A' }, { id: 'B', label: 'Synthetic B' }] };
 const listing = () => ({ entries: [], bytes: 0, root: '/synthetic-cache', browser_session: status });
 const React = {
  useSyncExternalStore: (_subscribe, getSnapshot) => getSnapshot(),
  createElement: (type, props, ...children) => ({ type, props: props || {}, children }),
  useState: value => { const slot = index++; if (!(slot in states)) states[slot] = value;
   return [states[slot], next => { states[slot] = typeof next === 'function' ? next(states[slot]) : next; }]; },
  useRef: () => ({ current: null }), useEffect() {},
 };
 const window = { __ModuleLoader__: { load: module => { factory = module.factory; } } };
 const context = { window }; if (desktop) context.dshDesktop = { protocolVersion: 1, browser: {} };
 vm.runInNewContext(script, context);
 factory(() => React).apply({ effect: fn => fn(), locale: {
  register: (_ns, values) => { dictionaries = values; return () => {}; },
  bind: () => key => dictionaries[language][key], getSnapshot: () => ({ active: language }), subscribe: () => () => {},
 }, connection: { rpc: { call: async (_path, method, payload) => {
  calls.push({ method, payload }); let value;
  if (method.endsWith('/browser-source')) { status = { ...status, sourceId: payload.sourceId, browser: status.sources.find(item => item.id === payload.sourceId)?.label }; value = status; }
  else if (method.endsWith('/list')) value = listing();
  else throw new Error(method);
  return { ok: true, value };
 } } }, slots: { inject: (_name, callback) => callback(), register: (options, component) => { Component = component; inject = options.inject; } } });
 states[0] = listing();
 const render = () => {
  index = 0; const nodes = [];
  const walk = (node, parents = []) => {
   if (!node || typeof node !== 'object') return;
   nodes.push({ ...node, parents });
   for (const child of node.children || []) if (Array.isArray(child)) child.forEach(item => walk(item, [...parents, node])); else walk(child, [...parents, node]);
  };
  walk(Component(inject())); return nodes;
 };
 return { render, calls, language: value => { language = value; }, status: value => { status = { ...status, ...value }; states[0] = listing(); } };
}
const web = fixture();
let nodes = web.render();
assert.equal(web.calls.length, 0, 'Rendering does not import or switch a source');
assert.ok(!nodes.some(n => n.props['aria-label'] === '同步至 DSH 内置浏览器'));
let selectors = nodes.filter(n => n.type === 'select' && n.props['aria-label'] === '选择来源浏览器连接');
assert.equal(selectors.length, 1, 'Source picker appears only once');
assert.equal(selectors[0].parents.filter(n => n.props.className === 'vv-card').length, 1);
assert.ok(selectors[0].parents.some(n => n.props.className === 'vv-card' && n.children.some(c => c?.type === 'h3' && c.children.includes('浏览器登录态授权'))));
assert.equal(nodes.filter(n => n.type === 'option' && ['A', 'B'].includes(n.props.value)).length, 2);
await selectors[0].props.onChange({ target: { value: 'B' } });
assert.equal(web.calls.filter(c => c.method.endsWith('/browser-source')).length, 1);
assert.equal(web.calls.filter(c => c.method.endsWith('/list')).length, 1);
assert.equal(web.calls.find(c => c.method.endsWith('/browser-source')).payload.sourceId, 'B');
assert.equal(web.render().find(n => n.type === 'select').props.value, 'B');
web.status({ sourceId: 'OFFLINE', browser: 'Offline saved browser', imported: true, sources: [{ id: 'NEW', label: 'New synthetic browser' }] });
nodes = web.render();
assert.equal(nodes.filter(n => n.type === 'select').length, 1, 'Offline selected source plus one live alternative remains selectable');
assert.ok(nodes.some(n => n.type === 'option' && n.props.value === 'NEW'));
await nodes.find(n => n.type === 'select').props.onChange({ target: { value: 'NEW' } });
assert.equal(web.calls.filter(c => c.method.endsWith('/browser-source')).length, 2);
web.status({ sourceId: 'A', sources: [{ id: 'A', label: 'Synthetic A' }, { id: 'B', label: 'Synthetic B' }] });
web.language('en'); nodes = web.render();
assert.equal(nodes.filter(n => n.type === 'select' && n.props['aria-label'] === 'Select source browser connection').length, 1);
assert.ok(!nodes.some(n => n.props['aria-label'] === 'Sync to the DSH built-in browser'));
assert.ok(nodes.some(n => n.type === 'option' && n.children.includes('Synthetic A')), 'Source names remain unchanged');
const desktop = fixture(true);
assert.ok(desktop.render().some(n => n.props['aria-label'] === '同步至 DSH 内置浏览器'));
desktop.language('en');
assert.ok(desktop.render().some(n => n.props['aria-label'] === 'Sync to the DSH built-in browser'));
console.log('PASS: VM-rendered Web/Desktop capability visibility, single browser-card source picker, two-source choice, offline-source replacement, one RPC+reload per switch, zh/en labels. Not a real browser GUI test.');
