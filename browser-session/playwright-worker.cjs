'use strict';
const { VERSION, selectionFrom, failure } = require('./playwright-capture.cjs');

// Only synthetic tests inject this boundary. The worker never accepts a module
// path, token, endpoint, executable code, or dependency from its IPC caller.
async function collectCookies(selection, dependencies = {}) {
  selection = selectionFrom(selection);
  const load = dependencies.load || require;
  const version = load('playwright-core/package.json').version;
  if (version !== VERSION) throw failure('incompatible');
  const tools = load('playwright-core/lib/coreBundle').tools;
  if (typeof tools?.createBrowserWithInfo !== 'function') throw failure('incompatible');
  const config = {
    extension: true,
    browser: { browserName: 'chromium',
      ...(selection.userDataDir === undefined ? {} : { userDataDir: selection.userDataDir }),
      launchOptions: { channel: 'chrome', headless: false }, contextOptions: {} },
    timeouts: { idle: 0 }
  };
  let browser;
  try {
    const info = await tools.createBrowserWithInfo(config,
      { clientName: 'VV login state import' },
      { browser: 'chrome',
        ...(selection.executablePath === undefined ? {} : { executablePath: selection.executablePath }),
        ...(selection.profileDirectory === undefined ? {} : { profileDirName: selection.profileDirectory }) },
      { title: 'VV login state import' });
    browser = info.browser;
    if (info.ownership !== 'attached' || !browser || typeof browser.unbind !== 'function') throw failure('incompatible');
    // createBrowserWithInfo implicitly binds a second control endpoint. Remove
    // it before accessing cookies; parent deletes the isolated registry on exit.
    await browser.unbind();
    const contexts = browser.contexts();
    if (contexts.length !== 1) throw failure('capture_failed');
    // Full cookie fields, including expiry, secure, httpOnly and partitionKey.
    // VV does not export storageState, evaluate page scripts, or collect DOM/console.
    // Official CDP initialization still registers its empty utility-world script.
    const cookies = await contexts[0].cookies();
    if (!Array.isArray(cookies)) throw failure('capture_failed');
    return cookies;
  } finally {
    // Pinned official connectOverCDP close implementation closes transport and
    // its artifacts, NOT the source Chrome process (ownership is attached).
    if (browser) await browser.close();
  }
}
function startWorker() {
  let started = false;
  process.once('disconnect', () => process.exit(1));
  process.on('message', async message => {
    if (started) return;
    started = true;
    let response;
    try {
      if (message?.type !== 'capture') throw failure('invalid_source');
      response = { type: 'result', cookies: await collectCookies(message.selection) };
    } catch (error) {
      response = { type: 'error', code: ['incompatible', 'invalid_source'].includes(error?.code) ? error.code : 'capture_failed' };
    }
    // Cookies exist only in worker/parent memory and IPC, never CLI or logs.
    if (!process.connected) return process.exit(1);
    process.send(response, error => process.exit(error ? 1 : 0));
  });
}
if (require.main === module) startWorker();
module.exports = { collectCookies };
