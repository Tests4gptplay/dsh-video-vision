import { writeFile, mkdir, rename } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import P from '../browser-session/protocol.cjs';
import Snapshot from '../browser-session/snapshot.cjs';
import { desktopIntegrationState, restoreDesktopIntegration } from './desktop-integration.js';
export async function desktopIntegrationInstalled(directory = P.root()) {
  return (await desktopIntegrationState(directory)).installed;
}
const exec = promisify(execFile);
const settingsUrl = 'chrome://inspect/#remote-debugging';

export async function defaultBrowser() {
  if (process.platform !== 'win32') return { supported: false, label: '当前平台' };
  try {
    const { stdout } = await exec('reg.exe', ['query', 'HKCU\\Software\\Microsoft\\Windows\\Shell\\Associations\\UrlAssociations\\https\\UserChoice', '/v', 'ProgId'], { windowsHide: true });
    const progId = stdout.match(/ProgId\s+REG_SZ\s+(\S+)/)?.[1] || '';
    const browser = progId.startsWith('ChromeHTML') ? { id: 'chrome', label: 'Google Chrome' } :
      progId.startsWith('MSEdgeHTM') ? { id: 'edge', label: 'Microsoft Edge' } : null;
    if (!browser) return { supported: false, label: progId || '未识别' };
    const command = await exec('reg.exe', ['query', 'HKCR\\' + progId + '\\shell\\open\\command', '/ve'], { windowsHide: true });
    const executable = command.stdout.match(/REG_SZ\s+"([^"]+)"/)?.[1];
    return { ...browser, executable, supported: Boolean(executable && existsSync(executable)) };
  } catch { return { supported: false, label: '未识别' }; }
}

export class BrowserSessions {
  #request; #fetch; #directory; #controllers = new Set(); #grant; #ready;
  constructor(config = {}, { directory = P.root(), request = Snapshot.request, fetch = globalThis.fetch } = {}) {
    this.#directory = directory; this.#request = request; this.#fetch = fetch;
    this.#grant = { enabled: config.browserSessionAuthorized === true, syncToNative: config.browserSessionAuthorized === true && config.syncToNativeBrowser === true };
    this.#ready = this.#save();
  }
  async #save() {
    await mkdir(this.#directory, { recursive: true });
    const file = join(this.#directory, 'authorization.json');
    await writeFile(file + '.tmp', JSON.stringify(this.#grant), { mode: 0o600 });
    await rename(file + '.tmp', file);
  }
  async setAuthorization({ enabled, syncToNative }) {
    await this.#ready;
    if (!enabled) this.close();
    this.#grant = { enabled: enabled === true, syncToNative: enabled === true && syncToNative === true };
    await this.#save();
    return this.status();
  }
  close() {
    for (const controller of this.#controllers) controller.abort(new Error('默认浏览器授权已关闭或更新。'));
    this.#controllers.clear();
  }
  async dispose() { await this.#ready; this.close(); }
  enabled() { return this.#grant.enabled; }
  async status() {
    await this.#ready;
    const browser = await defaultBrowser();
    let state = { ready: false, connected: false, imported: false, importedAt: null };
    try { state = await this.#request('status', {}, { directory: this.#directory, timeoutMs: 1500 }); } catch {}
    const desktopIntegration = state.ready === true || await desktopIntegrationInstalled(this.#directory);
    return { ...this.#grant, connected: state.connected === true, ready: state.ready === true,
      imported: state.ready === true ? state.imported === true : null, importedAt: state.importedAt || null,
      provider: 'default-browser-snapshot', browser: browser.label, supported: state.ready === true || browser.supported,
      desktopIntegration, settingsUrl,
      componentMessage: state.ready === true ? null : desktopIntegration
        ? '本地组件已安装，等待 Desktop 载入。'
        : '本地组件缺失，点击“导入登录态”可恢复组件。' };
  }
  async setup(_config = {}, { signal } = {}) {
    await this.#ready;
    if (!this.#grant.enabled) throw new Error('请先开启“授权使用默认浏览器登录态”。');
    try {
      return await this.#request('import', {}, { directory: this.#directory, timeoutMs: 95000, signal });
    } catch (error) {
      if (error.code !== 'browser_session_unavailable') throw error;
      if (await restoreDesktopIntegration(this.#directory, { signal }))
        throw new Error('本地会话组件已恢复。请重启 DSH Desktop 载入组件，再点击导入登录态。');
      if (await desktopIntegrationInstalled(this.#directory))
        throw new Error('本地会话组件已安装但尚未运行。请重启 DSH Desktop 载入组件，再点击导入登录态。');
      throw error;
    }
  }
  async openSettings() {
    const browser = await defaultBrowser();
    if (!browser.supported) throw new Error('请在 Chrome 中打开 ' + settingsUrl);
    // Only this explicit settings-button action may open a browser tab.
    await new Promise((resolve, reject) => {
      const child = spawn(browser.executable, [settingsUrl], { detached: true, stdio: 'ignore', shell: false });
      child.once('error', reject); child.once('spawn', () => { child.unref(); resolve(); });
    });
    return { settingsUrl };
  }
  async fetch(input, options = {}) {
    await this.#ready;
    if (!this.#grant.enabled) throw new Error('默认浏览器授权已关闭。');
    const controller = new AbortController();
    this.#controllers.add(controller);
    const signal = AbortSignal.any([controller.signal, ...(options.signal ? [options.signal] : [])]);
    let url = P.siteUrl(input);
    let method = (options.method || 'GET').toUpperCase(), body = options.body;
    const baseHeaders = new Headers(options.headers);
    for (const header of ['cookie', 'authorization', 'proxy-authorization', 'host']) baseHeaders.delete(header);
    try {
      for (let count = 0; count <= 20; count++) {
        signal.throwIfAborted();
        const headers = new Headers(baseHeaders);
        const result = await this.#request('cookies', { url: url.href }, { directory: this.#directory, signal });
        const cookies = P.scopedCookies(result.cookies, url.href);
        if (cookies.length) headers.set('cookie', cookies.map(c => c.name + '=' + c.value).join('; '));
        const response = await this.#fetch(url, { ...options, method, body, headers, signal, redirect: 'manual' });
        if ([301, 302, 303, 307, 308].includes(response.status) && response.headers.has('location')) {
          if (options.redirect === 'error') { await response.body?.cancel(); throw new Error('请求发生重定向。'); }
          if (options.redirect === 'manual') {
            const clean = new Headers(response.headers); clean.delete('set-cookie'); clean.delete('set-cookie2');
            return new Response(response.body, { status: response.status, statusText: response.statusText, headers: clean });
          }
          if ((response.status === 303 && !['GET', 'HEAD'].includes(method)) ||
              ([301, 302].includes(response.status) && method === 'POST')) {
            method = 'GET'; body = undefined;
            for (const header of ['content-type', 'content-length', 'content-encoding', 'content-language', 'content-location']) baseHeaders.delete(header);
          }
          const next = P.siteUrl(new URL(response.headers.get('location'), url).href);
          await response.body?.cancel();
          if (url.origin !== next.origin) { baseHeaders.delete('referer'); baseHeaders.delete('origin'); }
          url = next; continue;
        }
        signal.throwIfAborted();
        const clean = new Headers(response.headers); clean.delete('set-cookie'); clean.delete('set-cookie2');
        return new Response(response.body, { status: response.status, statusText: response.statusText, headers: clean });
      }
      throw new Error('站点重定向次数过多。');
    } finally { this.#controllers.delete(controller); }
  }
  async json(url, options) {
    const response = await this.fetch(url, options);
    if (!response.ok) { await response.body?.cancel(); throw new Error('站点请求 HTTP ' + response.status); }
    return response.json();
  }
  facade() { return Object.freeze({ status: () => this.status(), fetch: (url, options) => this.fetch(url, options), json: (url, options) => this.json(url, options) }); }
}
