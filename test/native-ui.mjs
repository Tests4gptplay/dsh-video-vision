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
let factory, Component, picks = 0;
const React = {
  createElement: (type, props, ...children) => ({ type, props, children }),
  useState: value => [value, () => {}],
  useEffect: () => {},
  useRef: () => ({ current: null })
};
const window = { __DSH_DIRECTORY_PICKER__: { pick: async () => { picks++; return null; } },
  __ModuleLoader__: { load: value => { factory = value.factory; } } };
vm.runInNewContext(await readFile(new URL('../client.js', import.meta.url), 'utf8'), { window });
const plugin = factory(() => React);
plugin.apply({
  effect: fn => fn(),
  locale: { register: () => () => {}, bind: () => key => key },
  connection: { rpc: { call: () => { throw Error('Canceled picker must not migrate'); } } },
  slots: { inject: (_, fn) => fn(), register: (_, component) => { Component = component; } }
});
const tree = Component({ rpc: async () => { throw Error('Canceled picker must not migrate'); } });
const nodes = [];
function walk(node) { if (!node || typeof node !== 'object') return; nodes.push(node); for (const c of node.children || []) { if (Array.isArray(c)) c.forEach(walk); else walk(c); } }
walk(tree);
const button = nodes.find(n => n.type === 'button' && n.children[0] === '设置缓存目录');
assert(button); assert.equal(button.props.disabled, false);
await button.props.onClick();
await button.props.onClick();
assert.equal(picks, 2);
assert(!nodes.some(n => n.type === 'button' && n.children[0] === '保存并迁移'));
console.log('PASS: visible Explorer launch on every click; enabled native directory picker; cancel/reopen without migration.');
