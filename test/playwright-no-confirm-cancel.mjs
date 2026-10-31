// Real worker + installed pinned official core, synthetic browser-launch boundary.
// No Chrome/profile is opened, no extension is installed or connected, and no
// cookies are read. This reaches the official confirmation wait before bind();
// it does NOT validate bind IO or a real extension's permission UI.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fork as realFork } from 'node:child_process';
import { EventEmitter } from 'node:events';
import Capture from '../browser-session/playwright-capture.cjs';

const staging = await fs.mkdtemp(join(tmpdir(), 'vv-no-confirm-test-'));
const executable = join(staging, 'synthetic-never-executed-chrome');
const preload = join(staging, 'synthetic-launch.cjs');
let privateDirectory, child, workerClosed = false, confirmationOpened = false, watchdogExpired = false;
const controller = new AbortController();
// Harness fail-safe only; production confirmation remains user-controlled.
const watchdog = setTimeout(() => { watchdogExpired = true; controller.abort(); }, 15000);
try {
  await fs.writeFile(preload, `
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
require('node:child_process').spawn = (executable, args, options) => {
  assert.equal(executable, ${JSON.stringify(executable)});
  assert.equal(args.length, 1);
  const url = new URL(args[0]);
  assert.equal(url.protocol, 'chrome-extension:');
  assert.equal(url.hostname, 'mmlmfjhmonkocbjadbfplnigmagldckm');
  assert.equal(url.pathname, '/connect.html');
  assert.equal(JSON.parse(url.searchParams.get('client')).name, 'Video Vision browser session import');
  assert.equal(url.searchParams.has('token'), false);
  assert.equal(options.shell, false);
  process.send({ fixture: 'confirmation-opened' });
  // Intentionally no extension handshake. Never invoke the original spawn.
  return new EventEmitter();
};
`, { mode: 0o600 });
  const io = { ...fs, async mkdtemp(prefix) { privateDirectory = await fs.mkdtemp(prefix); return privateDirectory; } };
  const fork = (filename, args, options) => {
    // Only this test adds a preload. Production passes execArgv: [].
    child = realFork(filename, args, { ...options, execArgv: ['--require', preload] });
    const proxy = new EventEmitter();
    proxy.send = (...values) => child.send(...values);
    proxy.kill = (...values) => child.kill(...values);
    child.on('message', message => {
      if (message.fixture === 'confirmation-opened') {
        confirmationOpened = true;
        controller.abort();
      } else proxy.emit('message', message);
    });
    child.on('error', error => proxy.emit('error', error));
    child.on('close', (...values) => { workerClosed = true; proxy.emit('close', ...values); });
    return proxy;
  };
  await assert.rejects(Capture.captureCookies({
    channel: 'chrome', executablePath: executable, signal: controller.signal
  }, { fork, io }), { code: 'aborted' });
  assert.equal(watchdogExpired, false, 'Harness deadline expired before confirmation; not a successful cancellation test');
  assert.equal(confirmationOpened, true, 'The actual official core must reach its no-handshake confirmation wait');
  assert.equal(workerClosed, true, 'Capture must settle only after the real worker closes');
  assert.ok(privateDirectory);
  await assert.rejects(fs.access(privateDirectory), { code: 'ENOENT' });
  console.log('PASS actual pinned-core worker without extension handshake: user abort closes worker and removes private temp; Chrome spawn intercepted, no browser/profile/cookies, bind not reached.');
} finally {
  clearTimeout(watchdog);
  if (child && !workerClosed) {
    const closed = new Promise(resolve => child.once('close', resolve));
    child.kill('SIGKILL');
    await closed;
  }
  if (privateDirectory) await fs.rm(privateDirectory, { recursive: true, force: true });
  await fs.rm(staging, { recursive: true, force: true });
}
