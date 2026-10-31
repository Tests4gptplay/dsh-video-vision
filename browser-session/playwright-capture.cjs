'use strict';
// Fixed-version internal adapter. No MCP response serializer, page evaluation,
// storageState export, password database access, or long-running helper.
const { fork } = require('node:child_process');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const VERSION = '1.64.0-alpha-1790635538000';
function failure(code) {
  const messages = {
    aborted: 'Browser import cancelled.',
    incompatible: 'The installed Playwright adapter version is incompatible.',
    invalid_source: 'Select a valid Chrome browser profile.',
    capture_failed: 'The browser connection or login state import failed. Confirm the official extension connection and try again.',
    cleanup_failed: 'The temporary browser connection could not be fully cleaned up. Login state was not imported.'
  };
  const error = new Error(messages[code] || messages.capture_failed);
  error.code = Object.hasOwn(messages, code) ? code : 'capture_failed';
  return error;
}
function selectionFrom(options) {
  const { channel = 'chrome', executablePath, userDataDir, profileDirectory } = options;
  const hasProfile = userDataDir !== undefined || profileDirectory !== undefined;
  const absolute = value => typeof value === 'string' && path.isAbsolute(value) && !value.includes('\0');
  if (channel !== 'chrome' || (executablePath !== undefined && !absolute(executablePath)) ||
      (hasProfile && (!absolute(userDataDir) || typeof profileDirectory !== 'string' || !profileDirectory ||
        ['.', '..'].includes(profileDirectory) || /[\\/\0]/.test(profileDirectory))) ||
      (!hasProfile && !absolute(executablePath))) throw failure('invalid_source');
  // No-profile mode MUST provide an executable: omitting it makes the official
  // implementation search browser profiles. The selected save slot is not a
  // claim that the extension identified the Chrome profile actually authorized.
  return { channel, executablePath, userDataDir, profileDirectory };
}
function workerEnvironment(env, directory) {
  const clean = { ...env };
  for (const key of Object.keys(clean)) {
    if (/^(DEBUG|PWDEBUG|PWTEST|PLAYWRIGHT_|NODE_OPTIONS$|NODE_PATH$)/i.test(key)) delete clean[key];
  }
  // Official internal override, pinned with the API above; not a public setting.
  // bind() briefly writes a sensitive connection descriptor. Isolate it and
  // artifacts in an owner-only temporary directory, then unbind before cookies.
  clean.ELECTRON_RUN_AS_NODE = '1';
  clean.PWTEST_SERVER_REGISTRY = path.join(directory, 'registry');
  clean.TMPDIR = clean.TMP = clean.TEMP = directory;
  return clean;
}
async function captureCookies(options = {}, dependencies = {}) {
  const selection = selectionFrom(options);
  const { signal } = options;
  if (signal?.aborted) throw failure('aborted');
  const io = dependencies.io || fs;
  const directory = await io.mkdtemp(path.join(os.tmpdir(), 'vv-playwright-'));
  let result, problem;
  try {
    await io.chmod(directory, 0o700);
    if (signal?.aborted) throw failure('aborted');
    result = await new Promise((resolve, reject) => {
      let child, response, error, closed = false;
      const abort = () => {
        error = failure('aborted');
        if (child && !closed) child.kill('SIGKILL');
      };
      try {
        child = (dependencies.fork || fork)(path.join(__dirname, 'playwright-worker.cjs'), [], {
          env: workerEnvironment(dependencies.env || process.env, directory),
          stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
          execArgv: [], serialization: 'json'
        });
      } catch { reject(failure('capture_failed')); return; }
      child.on('message', message => {
        if (closed || error || response) return;
        if (message?.type === 'result' && Array.isArray(message.cookies)) response = message.cookies;
        else if (message?.type === 'error') { error = failure(message.code); child.kill('SIGKILL'); }
        else { error = failure('capture_failed'); child.kill('SIGKILL'); }
      });
      child.on('error', () => { error ||= failure('capture_failed'); child.kill('SIGKILL'); });
      child.once('close', code => {
        closed = true;
        signal?.removeEventListener('abort', abort);
        if (signal?.aborted) error = failure('aborted');
        if (error || code !== 0 || !response) reject(error || failure('capture_failed'));
        else resolve(response);
      });
      signal?.addEventListener('abort', abort, { once: true });
      if (signal?.aborted) { abort(); return; }
      try {
        child.send({ type: 'capture', selection }, sendError => {
          if (sendError && !closed) { error = failure('capture_failed'); child.kill('SIGKILL'); }
        });
      } catch { error = failure('capture_failed'); child.kill('SIGKILL'); }
    });
  } catch (error) { problem = error; }
  try { await io.rm(directory, { recursive: true, force: true }); }
  catch { throw failure('cleanup_failed'); }
  if (problem) throw problem;
  if (signal?.aborted) throw failure('aborted');
  return result;
}
module.exports = { captureCookies, selectionFrom, workerEnvironment, failure, VERSION };
