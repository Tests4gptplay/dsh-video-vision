import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { platformDialog } from '../lib/native-ui.js';
function launcher(replies) {
  const calls = [];
  const launch = (command, args, options) => {
    const child = new EventEmitter();
    child.stdout = new PassThrough(); child.stderr = new PassThrough(); child.stdin = new PassThrough();
    const call = { command, args, options, input: '' }; calls.push(call);
    child.stdin.on('data', data => { call.input += data; });
    queueMicrotask(() => {
      const reply = replies.shift();
      if (reply.error) { child.emit('error', reply.error); return; }
      child.stdout.end(reply.stdout || ''); child.stderr.end(reply.stderr || ''); child.emit('close', reply.code ?? 0);
    });
    return child;
  };
  return { launch, calls };
}
const tricky = '/tmp/space \' $(touch nope) 中文';
let mock = launcher([{ stdout: tricky + '\n' }]);
assert.deepEqual(await platformDialog('directory', tricky, undefined, 'en', { platform: 'linux', launch: mock.launch }), { path: tricky, canceled: false });
assert.ok(mock.calls[0].args.includes('--filename=' + tricky));
assert.equal(mock.calls[0].options.shell, false);
mock = launcher([{ code: 1 }]);
assert.deepEqual(await platformDialog('save', 'x.mp4', undefined, 'zh', { platform: 'linux', launch: mock.launch }), { canceled: true });
const missing = () => Object.assign(new Error('missing'), { code: 'ENOENT' });
mock = launcher([{ error: missing() }, { stdout: '/tmp/save.mp4\n' }]);
assert.equal((await platformDialog('save', 'save.mp4', undefined, 'en', { platform: 'linux', launch: mock.launch })).path, '/tmp/save.mp4');
assert.deepEqual(mock.calls.map(c => c.command), ['zenity', 'kdialog']);
mock = launcher([{ error: missing() }, { error: missing() }]);
await assert.rejects(platformDialog('directory', '', undefined, 'en', { platform: 'linux', launch: mock.launch }), /Install zenity or kdialog/);
mock = launcher([{ code: 1, stderr: '--confirm-overwrite is deprecated; GtkDialog has no transient parent' }]);
assert.deepEqual(await platformDialog('save', 'x.mp4', undefined, 'en', { platform: 'linux', launch: mock.launch }), { canceled: true });
mock = launcher([{ code: 255, stderr: 'File dialog failed' }]);
await assert.rejects(platformDialog('directory', '', undefined, 'en', { platform: 'linux', launch: mock.launch }), /File dialog failed/);
assert.equal(mock.calls.length, 1);
mock = launcher([{ stdout: 'PATH\n' + tricky + '\n' }]);
assert.equal((await platformDialog('directory', tricky, undefined, 'en', { platform: 'darwin', launch: mock.launch })).path, tricky);
assert.deepEqual(mock.calls[0].args, ['-', 'directory', tricky, 'Select video cache directory']);
assert.ok(!mock.calls[0].input.includes(tricky));
mock = launcher([{ stdout: 'CANCEL\n' }]);
assert.deepEqual(await platformDialog('save', 'a.mp4', undefined, 'zh', { platform: 'darwin', launch: mock.launch }), { canceled: true });
const controller = new AbortController(); controller.abort(new Error('stopped'));
mock = launcher([]);
await assert.rejects(platformDialog('directory', '', controller.signal, 'en', { platform: 'linux', launch: mock.launch }), /stopped/);
assert.equal(mock.calls.length, 0);
console.log('platform dialog adapter tests passed: argv/path preservation, EN/ZH, cancel/error, ENOENT-only fallback, mac fixed script, pre-abort. GUI not exercised.');
