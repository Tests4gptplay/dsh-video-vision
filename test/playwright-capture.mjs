import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { EventEmitter } from 'node:events';
const require = createRequire(import.meta.url);
const { captureCookies, workerEnvironment, VERSION } = require('../browser-session/playwright-capture.cjs');
const { collectCookies } = require('../browser-session/playwright-worker.cjs');
const selection = { channel: 'chrome', userDataDir: '/synthetic/chrome', profileDirectory: 'Default' };
const cookie = { name: 'synthetic', value: 'fixture-only', domain: '.example.invalid', path: '/', expires: -1, httpOnly: true, secure: true, sameSite: 'Lax', partitionKey: 'https://example.invalid' };
function official({ version = VERSION, ownership = 'attached', failAt } = {}) {
  const calls = [];
  const browser = {
    async unbind() { calls.push('unbind'); if (failAt === 'unbind') throw Error('sensitive endpoint'); },
    contexts() { calls.push('contexts'); return [{ async cookies() { calls.push('cookies'); if (failAt === 'cookies') throw Error('secret'); return [cookie]; } }]; },
    async close() { calls.push('close'); if (failAt === 'close') throw Error('secret'); }
  };
  return { calls, load(id) {
    if (id.endsWith('package.json')) return { version };
    return { tools: { async createBrowserWithInfo(config, client, cli, bind) {
      calls.push('create');
      assert.equal(client.clientName, 'Video Vision browser session import');
      assert.equal(bind.title, 'Video Vision browser session import');
      assert.equal(config.extension, true); assert.equal(config.browser.isolated, undefined);
      assert.equal(config.browser.userDataDir, selection.userDataDir); assert.equal(config.timeouts.idle, 0);
      assert.deepEqual(cli, { browser: 'chrome', profileDirName: 'Default' });
      assert.equal(bind.workspaceDir, undefined); assert.equal(config.browser.cdpEndpoint, undefined);
      return { browser, ownership };
    } } };
  } };
}
{
  const fake = official();
  assert.deepEqual(await collectCookies(selection, fake), [cookie]);
  assert.deepEqual(fake.calls, ['create', 'unbind', 'contexts', 'cookies', 'close']);
  for (const failAt of ['unbind', 'cookies', 'close']) {
    const failed = official({ failAt }); await assert.rejects(collectCookies(selection, failed));
    assert.equal(failed.calls.at(-1), 'close');
    if (failAt === 'unbind') assert.ok(!failed.calls.includes('cookies'));
  }
  const mismatch = official({ version: '1.64.1' });
  await assert.rejects(collectCookies(selection, mismatch), { code: 'incompatible' }); assert.deepEqual(mismatch.calls, []);
  await assert.rejects(collectCookies({ ...selection, profileDirectory: '../Other' }, official()), { code: 'invalid_source' });
}
await assert.rejects(collectCookies({ channel: 'chrome' }, official()), { code: 'invalid_source' });
await assert.rejects(collectCookies({ channel: 'chrome', executablePath: '/synthetic/chrome', profileDirectory: 'Default' }, official()), { code: 'invalid_source' });
{
  const calls = [];
  const result = await collectCookies({ channel: 'chrome', executablePath: '/synthetic/chrome' }, { load: id => id.endsWith('package.json') ? { version: VERSION } : { tools: { async createBrowserWithInfo(config, client, cli) {
    assert.equal(Object.hasOwn(config.browser, 'userDataDir'), false);
    assert.deepEqual(cli, { browser: 'chrome', executablePath: '/synthetic/chrome' });
    return { ownership: 'attached', browser: { async unbind() { calls.push('unbind'); }, contexts() { return [{ async cookies() { return [cookie]; } }]; }, async close() { calls.push('close'); } } };
  } } } });
  assert.deepEqual(result, [cookie]); assert.deepEqual(calls, ['unbind', 'close']);
}
const env = workerEnvironment({ PATH: '/bin', DEBUG: '*', PWDEBUG: '1', PWTEST_EXTENSION_PROTOCOL: '1', PLAYWRIGHT_MCP_EXTENSION_TOKEN: 'secret', NODE_OPTIONS: '--require=secret', NODE_PATH: 'secret' }, '/private/run');
assert.equal(env.PATH, '/bin'); assert.equal(env.ELECTRON_RUN_AS_NODE, '1');
assert.equal(env.PWTEST_SERVER_REGISTRY, '/private/run/registry'); assert.equal(env.TMPDIR, '/private/run');
for (const key of ['DEBUG', 'PWDEBUG', 'PWTEST_EXTENSION_PROTOCOL', 'PLAYWRIGHT_MCP_EXTENSION_TOKEN', 'NODE_OPTIONS', 'NODE_PATH']) assert.equal(env[key], undefined);
function harness(scenario, { cleanupFailure = false } = {}) {
  const records = [];
  const io = {
    async mkdtemp() { records.push('mkdir'); return '/private/run'; },
    async chmod(dir, mode) { assert.equal(mode, 0o700); records.push('chmod'); },
    async rm(dir, opts) { assert.equal(dir, '/private/run'); assert.equal(opts.recursive, true); records.push('cleanup'); if (cleanupFailure) throw Error('sensitive path'); }
  };
  const fork = (script, args, options) => {
    records.push('fork'); assert.ok(script.endsWith('playwright-worker.cjs')); assert.deepEqual(args, []);
    assert.deepEqual(options.stdio, ['ignore', 'ignore', 'ignore', 'ipc']); assert.deepEqual(options.execArgv, []);
    const child = new EventEmitter(); let closed = false;
    child.finish = (code = 0) => { if (!closed) { closed = true; records.push('close'); child.emit('close', code); } };
    child.kill = signal => { assert.equal(signal, 'SIGKILL'); records.push('kill'); queueMicrotask(() => child.finish(1)); return true; };
    child.send = (message, callback) => { assert.deepEqual(message, { type: 'capture', selection: { ...selection, executablePath: undefined } }); callback(); queueMicrotask(() => scenario(child)); };
    return child;
  };
  return { records, io, fork, env: {} };
}
{
  const h = harness(child => { child.emit('message', { type: 'result', cookies: [cookie] }); child.finish(); });
  assert.deepEqual(await captureCookies(selection, h), [cookie]); assert.deepEqual(h.records, ['mkdir', 'chmod', 'fork', 'close', 'cleanup']);
}
{
  const controller = new AbortController(); controller.abort(); const h = harness(() => assert.fail());
  await assert.rejects(captureCookies({ ...selection, signal: controller.signal }, h), { code: 'aborted' }); assert.deepEqual(h.records, []);
}
for (const afterResult of [false, true]) {
  const controller = new AbortController();
  const h = harness(child => {
    if (afterResult) child.emit('message', { type: 'result', cookies: [cookie] });
    controller.abort(); child.emit('message', { type: 'result', cookies: [cookie] });
  });
  await assert.rejects(captureCookies({ ...selection, signal: controller.signal }, h), { code: 'aborted' });
  assert.ok(h.records.includes('kill')); assert.equal(h.records.at(-1), 'cleanup');
}
for (const scenario of [
  child => child.emit('error', Error('cookie=secret')),
  child => child.emit('message', { type: 'error', code: 'cookie=secret', message: 'token=secret' }),
  child => child.emit('message', { type: 'unknown', cookies: [cookie] }),
  child => child.finish(1)
]) {
  await assert.rejects(captureCookies(selection, harness(scenario)), error => error.code === 'capture_failed' && !error.message.includes('secret'));
}
await assert.rejects(captureCookies(selection, harness(child => { child.emit('message', { type: 'result', cookies: [cookie] }); child.finish(); }, { cleanupFailure: true })), { code: 'cleanup_failed' });
console.log('PASS Playwright cookie-only adapter: pinned config, release-before-result, field fidelity, cancellation/late IPC, environment isolation and sanitized failures (synthetic only).');

// Optional real-official-package protocol test. The only substituted boundary
// is Chrome/its extension: spawn is intercepted and a synthetic WebSocket peer
// answers Chrome debugger commands. No browser process/profile is opened.
if (process.argv.includes('--official') || process.argv.includes('--official-mock-bind')) {
  const mockBind = process.argv.includes('--official-mock-bind');
  const disconnect = process.argv.includes('--disconnect-before-initialized');
  const noTab = process.argv.includes('--no-tab');
  const browserConfirmed = process.argv.includes('--browser-confirmed');
  const fs = await import('node:fs/promises');
  const os = await import('node:os');
  const path = await import('node:path');
  const cp = require('node:child_process');
  const packageRoot = process.env.VV_PLAYWRIGHT_CORE_PATH || path.resolve('node_modules/playwright-core');
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'vv-official-protocol-'));
  await fs.chmod(root, 0o700);
  const originalEnv = { ...process.env }, originalSpawn = cp.spawn;
  const fsp = require('node:fs/promises');
  const originalReaddir = fsp.readdir, originalReadFile = fsp.readFile;
  const beforeOpenReads = [];
  fsp.readdir = async (...args) => { if (browserConfirmed && !captureURL) beforeOpenReads.push('readdir'); return originalReaddir(...args); };
  fsp.readFile = async (...args) => { if (browserConfirmed && !captureURL) beforeOpenReads.push('readFile'); return originalReadFile(...args); };
  let socket, captureURL, authorized = false, restoreBind;
  const binding = { active: false, starts: 0, stops: 0 };
  let rejectProtocol;
  const protocolFailure = new Promise((resolve, reject) => { rejectProtocol = reject; });
  const methods = [], expectedExecutable = '/synthetic/never-executed-chrome';
  const closed = new Promise(resolve => {
    cp.spawn = (executable, args, options) => {
      assert.equal(executable, expectedExecutable);
      assert.equal(options.shell, false); assert.equal(options.stdio, 'ignore');
      assert.ok(!args.some(arg => /remote-debugging|no-sandbox/.test(arg)));
      if (browserConfirmed) assert.ok(!args.some(arg => /--(profile-directory|user-data-dir)/.test(arg)), 'no browser profile search/selection arguments');
      else assert.ok(args.includes('--profile-directory=Default'));
      if (browserConfirmed) assert.deepEqual(beforeOpenReads, [], 'no profile/filesystem inspection before opening confirmation');
      captureURL = new URL(args.at(-1));
      assert.equal(captureURL.hostname, 'mmlmfjhmonkocbjadbfplnigmagldckm');
      assert.equal(captureURL.searchParams.get('protocolVersion'), '2');
      assert.equal(captureURL.searchParams.has('token'), false);
      const WS = require(path.join(packageRoot, 'lib/utilsBundle.js')).ws;
      socket = new WS(captureURL.searchParams.get('mcpRelayUrl'));
      socket.on('close', resolve);
      socket.on('error', rejectProtocol);
      socket.on('open', () => {
        assert.deepEqual(methods, []);
        // Simulate explicit permission followed by the official v2 handshake;
        // this does not test Chrome's actual authorization UI.
        if (disconnect) { socket.close(); return; }
        authorized = true;
        if (!noTab) socket.send(JSON.stringify({ method: 'chrome.tabs.onCreated', params: [{ id: 7, url: 'https://example.invalid/' }] }));
        socket.send(JSON.stringify({ method: 'extension.initialized', params: {} }));
      });
      socket.on('message', data => { void (async () => {
        const message = JSON.parse(data);
        assert.equal(authorized, true);
        methods.push(message.method === 'chrome.debugger.sendCommand' ? message.params[1] : message.method);
        let result = {};
        if (message.method === 'chrome.debugger.attach') assert.deepEqual(message.params, [{ tabId: 7 }, '1.3']);
        else if (message.method === 'chrome.debugger.sendCommand') {
          const [target, method] = message.params;
          assert.equal(target.tabId, 7);
          if (method === 'Target.getTargetInfo') result = { targetInfo: { targetId: 'synthetic-target', type: 'page', browserContextId: 'default-context', title: 'Synthetic', url: 'https://example.invalid/', attached: true } };
          else if (method === 'Page.getFrameTree') result = { frameTree: { frame: { id: 'synthetic-target', loaderId: 'loader', url: 'https://example.invalid/', securityOrigin: 'https://example.invalid', mimeType: 'text/html' } } };
          else if (method === 'Storage.getCookies') {
            assert.ok(methods.includes('chrome.debugger.attach'));
            assert.equal(target.sessionId, undefined, 'browser-scoped cookie read');
            if (mockBind) assert.equal(binding.active, false, 'unbind before cookies');
            else assert.deepEqual(await fs.readdir(path.join(root, 'registry')), [], 'unbind removes descriptor before cookies');
            result = { cookies: [{ ...cookie, partitionKey: { topLevelSite: cookie.partitionKey, hasCrossSiteAncestor: false } }] };
          }
        } else assert.fail('Unexpected extension method: ' + message.method);
        socket.send(JSON.stringify({ id: message.id, result }));
      })().catch(rejectProtocol); });
      return new EventEmitter();
    };
  });
  try {
    for (const key of Object.keys(process.env)) delete process.env[key];
    Object.assign(process.env, workerEnvironment(originalEnv, root));
    const load = id => require(path.join(packageRoot, id === 'playwright-core/package.json' ? 'package.json' : 'lib/coreBundle.js'));
    assert.equal(load('playwright-core/package.json').version, VERSION);
    if (mockBind) {
      const prototype = load('playwright-core/lib/coreBundle').server.Browser.prototype;
      const start = prototype.startServer, stop = prototype.stopServer;
      prototype.startServer = async function () { binding.active = true; binding.starts++; return { endpoint: 'synthetic-not-listening' }; };
      prototype.stopServer = async function () { binding.active = false; binding.stops++; };
      restoreBind = () => { prototype.startServer = start; prototype.stopServer = stop; };
    }
    const attempt = collectCookies(browserConfirmed
      ? { channel: 'chrome', executablePath: expectedExecutable }
      : { ...selection, executablePath: expectedExecutable }, { load });
    if (disconnect || noTab) {
      await assert.rejects(Promise.race([attempt, protocolFailure]), disconnect ? /disconnected|closed/i : /No attached tab/);
      await closed;
      assert.deepEqual(methods, []);
      console.log('PASS actual official synthetic negative: ' + (disconnect ? 'disconnect before initialized rejects without cookie access' : 'no attached tab rejects; no anonymous/cached fallback'));
    } else {
    const result = await Promise.race([attempt, protocolFailure]);
    await closed;
    assert.equal(result[0].value, cookie.value);
    assert.equal(result[0].partitionKey, cookie.partitionKey);
    assert.equal(result[0].httpOnly, true); assert.equal(result[0].secure, true);
    assert.ok(methods.includes('Storage.getCookies'));
    assert.ok(!methods.includes('Browser.close')); assert.ok(!methods.includes('chrome.tabs.remove'));
    assert.ok(!methods.includes('Storage.getStorageKeyForFrame'));
    if (mockBind) assert.deepEqual(binding, { active: false, starts: 1, stops: 2 });
    else assert.deepEqual(await fs.readdir(path.join(root, 'registry')), []);
    console.log('PASS ' + (mockBind ? '[BIND IO MOCKED; real Unix bind NOT verified] ' : '') + 'actual official ' + VERSION + ' relay-v2/CDP integration with synthetic extension: attach-before-Storage.getCookies, metadata unbind, cookie fidelity, transport closes without Browser.close. Methods: ' + [...new Set(methods)].join(', '));
    }
  } finally {
    socket?.terminate(); restoreBind?.(); cp.spawn = originalSpawn;
    fsp.readdir = originalReaddir; fsp.readFile = originalReadFile;
    for (const key of Object.keys(process.env)) delete process.env[key];
    Object.assign(process.env, originalEnv);
    await fs.rm(root, { recursive: true, force: true });
  }
}
