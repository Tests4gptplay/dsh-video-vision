import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { revealFolder } from '../lib/native-ui.js';

const launches = [];
const launch = (command, args, options) => {
  launches.push({ command, args, options });
  const child = new EventEmitter(); child.unref = () => {};
  queueMicrotask(() => child.emit('spawn'));
  return child;
};
await revealFolder('D:\\cache', undefined, launch);
await revealFolder('D:\\cache', undefined, launch);
assert.equal(launches.length, 2);
for (const call of launches) {
  assert.equal(call.command, process.platform === 'win32' ? 'explorer.exe' : process.platform === 'darwin' ? 'open' : 'xdg-open');
  assert.deepEqual(call.args, ['D:\\cache']);
  assert.equal(call.options.windowsHide, false);
  assert.equal(call.options.stdio, 'ignore');
}
let factory, Component, moduleId, section, transportCall, picks = 0;
const registrations = [];
let dictionaries;
const React = {
  useSyncExternalStore: (_subscribe, getSnapshot) => getSnapshot(),
  createElement: (type, props, ...children) => ({ type, props, children }),
  useState: value => [value, () => {}],
  useEffect: () => {},
  useRef: () => ({ current: null })
};
const window = { __DSH_DIRECTORY_PICKER__: { pick: async () => { picks++; return null; } },
  __ModuleLoader__: { load: value => { factory = value.factory; moduleId = value.id; } } };
vm.runInNewContext(await readFile(new URL('../client.js', import.meta.url), 'utf8'), { window, dshDesktop: { protocolVersion: 1, browser: {} } });
const plugin = factory(name => { assert.equal(name, 'react'); return React; });
plugin.apply({
  effect: fn => fn(),
  locale: { register: (_ns, values) => { dictionaries = values; return () => {}; }, bind: () => key => dictionaries.zh[key], getSnapshot: () => ({ active: 'zh' }), subscribe: () => () => {} },
  connection: { rpc: { call: async (path, method) => { transportCall = { path, method }; return { ok: true, value: {} }; } } },
  slots: { inject: (_, fn) => fn(), register: (options, component) => {
    registrations.push(options);
    assert.equal(options.name, 'settings.section');
    Component = component; section = options;
  } }
});
assert.equal(moduleId, 'dsh-video-vision');
assert.equal(section.id, 'video-vision-cache');
assert.equal(section.locale, 'video-vision');
await section.inject().rpc('list');
assert.deepEqual(transportCall, { path: '/api', method: 'video-vision/cache/list' });
const tree = Component(section.inject());
assert.deepEqual(registrations.map(entry => entry.name), ['settings.section']);
const nodes = [];
function walk(node) { if (!node || typeof node !== 'object') return; nodes.push(node); for (const c of node.children || []) { if (Array.isArray(c)) c.forEach(walk); else walk(c); } }
walk(tree);
const authorization = nodes.find(n => n.type === 'input' && n.props.role === 'switch');
assert(authorization); assert.equal(authorization.props.checked, false);
assert.equal(authorization.props.disabled, true, 'Wait for the local bridge capability before enabling');
const switches = nodes.filter(n => n.type === 'input' && n.props.role === 'switch');
assert.equal(switches.length, 2);
assert.deepEqual(switches.map(n => n.props['aria-label']), ['授权使用默认浏览器登录态', '同步至 DSH 内置浏览器']);
assert(switches.every(n => n.props.checked === false));
const button = nodes.find(n => n.type === 'button' && n.children[0] === '设置缓存目录');
assert(button); assert.equal(button.props.disabled, false);
await button.props.onClick();
await button.props.onClick();
assert.equal(picks, 2);
assert.deepEqual(transportCall, { path: '/api', method: 'video-vision/cache/list' }, 'Canceling the picker leaves cache settings unchanged');
assert(nodes.some(n => n.type === 'button' && n.children[0] === '缓存文件夹'));
assert(!nodes.some(n => n.type === 'button' && ['保存并迁移', '视频文件夹', '打开缓存文件夹'].includes(n.children[0])));
const methodsButton = nodes.find(n => n.type === 'button' && n.children[0] === '方法文件夹');
assert(methodsButton); assert.equal(methodsButton.props.disabled, false);
await methodsButton.props.onClick();
assert.deepEqual(transportCall, { path: '/api', method: 'video-vision/cache/reveal-configuration' });
await methodsButton.props.onClick();
assert.deepEqual(transportCall, { path: '/api', method: 'video-vision/cache/reveal-configuration' });
assert.deepEqual(registrations.map(entry => entry.name), ['settings.section']);
console.log('PASS: own Methods Folder button calls configuration-folder RPC; video-folder button removed; host header untouched; native picker preserved.');
