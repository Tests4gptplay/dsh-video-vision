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
  assert.equal(call.command, 'explorer.exe');
  assert.deepEqual(call.args, ['D:\\cache']);
  assert.equal(call.options.windowsHide, false);
  assert.equal(call.options.stdio, 'ignore');
}
let factory, Component, moduleId, section, action, Action, transportCall, picks = 0;
const effects = [];
let actionDisposed = false;
const React = {
  createElement: (type, props, ...children) => ({ type, props, children }),
  useState: value => [value, () => {}],
  useEffect: fn => { effects.push(fn); },
  useRef: () => ({ current: null })
};
const window = { __DSH_DIRECTORY_PICKER__: { pick: async () => { picks++; return null; } },
  __ModuleLoader__: { load: value => { factory = value.factory; moduleId = value.id; } } };
vm.runInNewContext(await readFile(new URL('../client.js', import.meta.url), 'utf8'), { window });
const Button = Symbol('native Button');
const plugin = factory(name => name === 'react' ? React : { Button });
plugin.apply({
  effect: fn => fn(),
  locale: { register: () => () => {}, bind: () => key => key },
  connection: { rpc: { call: async (path, method) => { transportCall = { path, method }; return { ok: true, value: {} }; } } },
  slots: { inject: (_, fn) => fn(), register: (options, component) => {
    if (options.name === 'settings.section') { Component = component; section = options; }
    else { action = options; Action = component; return () => { actionDisposed = true; }; }
  } }
});
assert.equal(moduleId, 'dsh-video-vision');
assert.equal(section.id, 'video-vision-cache');
assert.equal(section.locale, 'video-vision');
await section.inject().rpc('list');
assert.deepEqual(transportCall, { path: '/api', method: 'video-vision/cache/list' });
assert.equal(action, undefined, 'Header override is absent outside Video Vision');
const tree = Component({ ...section.inject(), rpc: async () => { throw Error('Canceled picker must not migrate'); } });
const unmountAction = effects[0]();
assert.equal(action.name, 'settings.action');
assert.equal(action.id, 'open-document');
assert.equal(action.priority, 100);
const header = Action(action.inject());
assert.equal(header.type, Button);
assert.equal(header.children[0], '打开配置文件夹');
await header.props.onClick();
assert.deepEqual(transportCall, { path: '/api', method: 'video-vision/cache/reveal-configuration' });
unmountAction();
assert.equal(actionDisposed, true, 'Leaving Video Vision restores the host header action');
const nodes = [];
function walk(node) { if (!node || typeof node !== 'object') return; nodes.push(node); for (const c of node.children || []) { if (Array.isArray(c)) c.forEach(walk); else walk(c); } }
walk(tree);
const button = nodes.find(n => n.type === 'button' && n.children[0] === '设置缓存目录');
assert(button); assert.equal(button.props.disabled, false);
await button.props.onClick();
await button.props.onClick();
assert.equal(picks, 2);
assert(!nodes.some(n => n.type === 'button' && n.children[0] === '保存并迁移'));
console.log('PASS: visible Explorer per click; native picker; configuration-folder header action scoped to Video Vision and restored on unmount.');
