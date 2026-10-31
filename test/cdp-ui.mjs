import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
const script = await readFile(new URL('../client.js', import.meta.url), 'utf8');
function fixture(desktop = false) {
 let factory, Component, inject, index = 0, dictionaries, language = 'zh';
 const states = [], calls = [];
 let status = { enabled: true, connected: false, imported: false, ready: true,
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
  else if (method.endsWith('/browser-settings')) value = { opened: true };
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
const offlineOption = nodes.find(n => n.type === 'option' && n.props.value === 'OFFLINE');
assert.ok(offlineOption && offlineOption.props.disabled, 'Offline current source has its own non-switching option');
assert.equal(offlineOption.children.join(''), 'Offline saved browser · 连接不可用（保留已选来源）');
assert.equal(nodes.find(n => n.type === 'select').props.value, 'OFFLINE');
assert.equal(web.calls.filter(c => c.method.endsWith('/browser-source')).length, 1, 'Offline rendering must not switch source');
web.language('en');
assert.equal(web.render().find(n => n.type === 'option' && n.props.value === 'OFFLINE').children.join(''), 'Offline saved browser · Connection unavailable (selected source retained)');
web.language('zh');

await nodes.find(n => n.type === 'select').props.onChange({ target: { value: 'NEW' } });
assert.equal(web.calls.filter(c => c.method.endsWith('/browser-source')).length, 2);
web.status({ sourceId: 'A', sources: [{ id: 'A', label: 'Synthetic A' }, { id: 'B', label: 'Synthetic B' }] });
web.language('en'); nodes = web.render();
assert.equal(nodes.filter(n => n.type === 'select' && n.props['aria-label'] === 'Select source browser connection').length, 1);
assert.ok(!nodes.some(n => n.props['aria-label'] === 'Sync to the DSH built-in browser'));
assert.ok(nodes.some(n => n.type === 'option' && n.children.includes('Synthetic A')), 'Source names remain unchanged');
const desktop = fixture(true);
assert.ok(!desktop.render().some(n => n.props['aria-label'] === '同步至 DSH 内置浏览器'));
desktop.language('en');
assert.ok(!desktop.render().some(n => n.props['aria-label'] === 'Sync to the DSH built-in browser'));
console.log('PASS: VM-rendered Web/Desktop capability visibility, single browser-card source picker, two-source choice, offline-source replacement, one RPC+reload per switch, zh/en labels. Not a real browser GUI test.');

const edge = fixture();
edge.status({sourceId:'A',browser:'Saved A',sources:[{id:'B',label:'Live B'}]});
let e=edge.render(); assert.equal(e.find(n=>n.type==='option'&&n.props.value==='A').props.disabled,true);
edge.status({sources:[{id:'A',label:'Returned A'},{id:'B',label:'Live B'}]});
e=edge.render();assert.equal(e.filter(n=>n.type==='option'&&n.props.value==='A').length,1);assert.notEqual(e.find(n=>n.type==='option'&&n.props.value==='A').props.disabled,true);assert.equal(e.find(n=>n.type==='select').props.value,'A');
edge.status({sources:[]});e=edge.render();assert.equal(e.filter(n=>n.type==='select').length,0);assert.ok(e.some(n=>n.children.some(c=>typeof c==='string'&&c.includes('Saved A'))));
edge.status({sourceId:'',sources:[{id:'B',label:'Live B'}]});e=edge.render();assert.equal(e.find(n=>n.type==='select').props.value,'');assert.equal(e.filter(n=>n.type==='option'&&n.props.value==='').length,1);
const label='<img src=x onerror=boom> & " \'';
edge.status({sourceId:'A',browser:label,sources:[{id:'B',label}]});e=edge.render();const a=e.find(n=>n.type==='option'&&n.props.value==='A');assert.ok(a.children[0].startsWith(label));assert.equal(a.props.dangerouslySetInnerHTML,undefined);assert.ok(e.find(n=>n.type==='option'&&n.props.value==='B').children.includes(label));assert.equal(edge.calls.length,0);
console.log('PASS independent VM edges: reappearance/no duplicate/empty list preserves summary/empty selection/text-child labels/no rendering RPC. Not native DOM or GUI proof.');

edge.status({sourceId:'A',sources:[{id:'A',label:'Only source'}]});
assert.equal(edge.render().filter(n=>n.type==='select').length,1,'Single source remains explicitly selectable');
for (const [snapshotState, expected] of Object.entries({absent:'未导入',empty:'已导入，当前无登录态',ready:'已保存可读取副本（未验证站点登录）',read_failed:'副本读取失败（不是空登录态）',decrypt_failed:'副本解密失败（不是空登录态）',unknown:'副本状态未知'})) {
 edge.status({snapshotState});assert(edge.render().some(n=>n.children.some(c=>typeof c==='string'&&c.includes(expected))), snapshotState);
}
edge.status({sourceId:null});assert.equal(edge.render().find(n=>n.type==='button'&&n.children[0]==='导入登录态').props.disabled,true);
console.log('PASS: all snapshot states, explicit single-source selection, no import before selection.');
edge.status({sourceId:'A',snapshotState:'ready',imported:true,sourceAvailable:undefined,sources:[{id:'A',label:'Saved A',available:false},{id:'B',label:'Live B',available:true}]});
e=edge.render();
assert.equal(e.find(n=>n.type==='option'&&n.props.value==='A').props.disabled,undefined,'Saved offline source remains explicitly selectable');
assert(e.find(n=>n.type==='option'&&n.props.value==='A').children[0].includes('连接不可用'));
assert.equal(e.find(n=>n.type==='button'&&n.children[0]==='导入登录态').props.disabled,true);
assert.equal(e.find(n=>n.type==='button'&&n.children[0]==='刷新登录态').props.disabled,true);
edge.status({sourceAvailable:true});e=edge.render();
assert.equal(e.find(n=>n.type==='button'&&n.children[0]==='刷新登录态').props.disabled,false,'Explicit runtime availability takes precedence');
console.log('PASS: saved offline source selectable without enabling capture; runtime availability precedence.');

const extension=fixture();
const findButton=(nodes,label)=>nodes.find(n=>n.type==='button'&&n.children[0]===label);
extension.status({sourceAvailable:true,extensionInstallation:{state:'not_installed'}});
let extensionNodes=extension.render();
assert.equal(findButton(extensionNodes,'安装 Chrome 扩展').props.disabled,false);
assert.equal(extension.calls.length,0,'Rendering never probes extension installation');
await findButton(extensionNodes,'安装 Chrome 扩展').props.onClick();extensionNodes=extension.render();
assert.equal(extension.calls.filter(c=>c.method.endsWith('/browser-settings')).length,1);
assert(!findButton(extensionNodes,'已安装'),'Opening store does not establish installation');
assert(extensionNodes.some(n=>n.props.role==='status'&&n.children.includes('已打开扩展商店页面。')));
extension.status({extensionInstallation:{state:'installed'}});extensionNodes=extension.render();
assert.equal(findButton(extensionNodes,'已安装').props.disabled,true);
assert.equal(findButton(extensionNodes,'导入登录态').props.disabled,false,'Verified installation disables only installation button');
for(const state of ['unknown','failed']) {
 extension.status({extensionInstallation:{state}});extensionNodes=extension.render();
 assert.equal(findButton(extensionNodes,'安装 Chrome 扩展').props.disabled,false);
 assert.equal(findButton(extensionNodes,'导入登录态').props.disabled,false,'Unknown installation does not block an available source');
 assert(extensionNodes.some(n=>n.children.includes('安装状态尚未确认。')));
}
extension.status({extensionInstallation:{state:'checking'}});extensionNodes=extension.render();
assert.equal(findButton(extensionNodes,'正在检查安装状态…').props.disabled,true);
extension.language('en');extension.status({extensionInstallation:{state:'installed'}});
assert.equal(findButton(extension.render(),'Installed').props.disabled,true);
extension.status({extensionInstallation:{state:'unknown'}});
assert.equal(findButton(extension.render(),'Install Chrome extension').props.disabled,false);
console.log('PASS: verified installation/absent/unknown/failed/checking zh/en UI, only install button gated, store opening is not installation, no render probe. VM only.');
