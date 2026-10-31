import { uiText } from './ui-locale.js';
import { writeFile, mkdir, rename } from 'node:fs/promises';
import { join } from 'node:path';
import P from '../browser-session/protocol.cjs';
import Platform from '../browser-session/platform/index.cjs';
import CdpSession from '../browser-session/cdp-session.cjs';
import Extension from '../browser-session/playwright-source.cjs';
const settingsUrl = Extension.STORE_URL;

export const defaultBrowser = Platform.defaultBrowser;

export class BrowserSessions {
  #request; #local; #fetch; #directory; #controllers = new Map(); #grant; #ready; #mutations = Promise.resolve(); #saves = Promise.resolve(); #disposed = false; #disposing; #importEpoch = 0;
  constructor(config = {}, { directory = P.root(), request, fetch = globalThis.fetch, localSession, platform = process.platform } = {}) {
    this.#directory = directory; this.#fetch = fetch;
    this.#local = localSession || (!request ? CdpSession.createCdpSession({ directory }) : null);
    this.#request = request || this.#local.request;
    this.#grant = { enabled: config.browserSessionAuthorized === true };
    this.#ready = this.#save();
  }
  #save() {
    const grant = { ...this.#grant };
    const task = this.#saves.then(async () => {
      await mkdir(this.#directory, { recursive: true });
      const file = join(this.#directory, P.authorizationFilename);
      await writeFile(file + '.tmp', JSON.stringify(grant), { mode: 0o600 });
      await rename(file + '.tmp', file);
    });
    this.#saves = task.catch(() => {});
    return task;
  }
  #mutate(operation) {
    const task = this.#mutations.then(async () => { await this.#ready; this.#assertOpen(); return operation(); });
    this.#mutations = task.catch(() => {});
    return task;
  }
  #assertOpen() { if (this.#disposed) throw new Error('浏览器会话服务已关闭。'); }
  setAuthorization({ enabled }) {
    return this.#mutate(async () => {
      if (!enabled) this.close();
      this.#grant = { enabled: enabled === true };
      try { await this.#save(); }
      catch (error) { this.#grant = { enabled: false }; this.close(); throw error; }
      return this.status();
    });
  }
  close() {
    for (const [controller, language] of this.#controllers) controller.abort(new Error(uiText('默认浏览器授权已关闭或更新。', language)));
    this.#controllers.clear(); this.#local?.cancel();
  }
  dispose() {
    if (this.#disposing) return this.#disposing;
    this.#disposed = true;
    this.#grant = { enabled: false };
    this.close();
    this.#disposing = (async () => {
      await this.#ready.catch(() => {});
      await this.#mutations;
      this.#grant = { enabled: false };
      this.close();
      await this.#local?.close();
    })();
    return this.#disposing;
  }
  enabled() { return this.#grant.enabled; }
  async status({ checkExtension = false } = {}) {
    await this.#ready; this.#assertOpen();
    const browser = await defaultBrowser();
    this.#assertOpen();
    let state = { ready: false, connected: false, imported: null, importedAt: null, snapshotState: 'unknown' };
    let localError;
    try { state = await this.#request('status', { checkExtension }, { directory: this.#directory, timeoutMs: 1500 }); } catch (error) { if (this.#local) localError = error.message; }
    return { ...state, ...this.#grant, connected: state.connected === true, ready: state.ready === true,
      imported: state.ready === true ? state.imported : null, importedAt: state.importedAt || null, cookieCount: state.cookieCount ?? null,
      provider: 'default-browser-snapshot', localCapture: Boolean(this.#local) || state.localCapture === true, sources: state.sources || [], sourceId: state.sourceId || null, browser: this.#local ? (state.source || '未选择浏览器连接') : (state.source || browser.label), supported: state.ready === true || browser.supported,
      settingsUrl, componentMessage: localError || null };
  }
  async setup(_config = {}, { signal } = {}) {
    const epoch = this.#importEpoch;
    await this.#ready;
    if (epoch !== this.#importEpoch) throw new Error('Browser import cancelled.'); this.#assertOpen();
    if (!this.#grant.enabled) throw new Error('请先开启“授权使用默认浏览器登录态”。');
    return this.#request('import', {}, { signal });
  }
  cancelImport(operationId) {
    this.#assertOpen();
    if (operationId !== undefined) return { cancellationRequested: (this.#local?.cancelImport(operationId) || 0) > 0 };
    this.#importEpoch++; this.#local?.cancelImport();
    return { cancellationRequested: true };
  }
  clear() {
    return this.#mutate(async () => {
      this.close();
      this.#grant = { enabled: false };
      await this.#save();
      return this.#local.clear();
    });
  }

  selectSource(id) {
    return this.#mutate(async () => {
      if (!this.#local) throw new Error('当前会话组件不需要选择连接。');
      this.close(); return this.#local.select(id);
    });
  }
  async openSettings() {
    this.#assertOpen();
    // The shop must open in Chrome, not an unrelated system-default browser.
    // Explicit user action only; no installation or permission is assumed.
    return Extension.openStore();
  }
  async fetch(input, options = {}) {
    const { uiLanguage, ...networkOptions } = options;
    return this.#fetchLocalized(input, networkOptions, uiLanguage);
  }
  async #fetchLocalized(input, options, language) {
    await this.#ready; this.#assertOpen();
    if (!this.#grant.enabled) throw new Error(uiText('默认浏览器授权已关闭。', language));
    const controller = new AbortController();
    this.#controllers.set(controller, language);
    const signal = AbortSignal.any([controller.signal, ...(options.signal ? [options.signal] : [])]);
    let url;
    try { url = P.siteUrl(input); } catch (error) { this.#controllers.delete(controller); throw localizeServiceError(error, language); }
    let method = (options.method || 'GET').toUpperCase(), body = options.body;
    const baseHeaders = new Headers(options.headers);
    for (const header of ['cookie', 'authorization', 'proxy-authorization', 'host']) baseHeaders.delete(header);
    let bodyOwned = false;
    const finishResponse = response => {
      const clean = new Headers(response.headers); clean.delete('set-cookie'); clean.delete('set-cookie2');
      if (!response.body) return new Response(null, { status: response.status, statusText: response.statusText, headers: clean });
      const reader = response.body.getReader();
      let released = false, streamController;
      const release = () => {
        if (released) return;
        released = true;
        signal.removeEventListener('abort', abortBody);
        this.#controllers.delete(controller);
      };
      const abortBody = () => {
        if (released) return;
        streamController.error(signal.reason);
        release();
        void reader.cancel(signal.reason).catch(() => {});
      };
      const body = new ReadableStream({
        start(value) {
          streamController = value;
          signal.addEventListener('abort', abortBody, { once: true });
          if (signal.aborted) abortBody();
        },
        async pull(value) {
          if (released) return;
          try {
            const chunk = await reader.read();
            if (released) return;
            if (chunk.done) { release(); value.close(); }
            else value.enqueue(chunk.value);
          } catch (error) { if (!released) { release(); value.error(error); } }
        },
        async cancel(reason) { release(); await reader.cancel(reason); }
      });
      bodyOwned = true;
      return new Response(body, { status: response.status, statusText: response.statusText, headers: clean });
    };
    try {
      for (let count = 0; count <= 20; count++) {
        signal.throwIfAborted();
        const headers = new Headers(baseHeaders);
        const result = await this.#request('cookies', { url: url.href }, { directory: this.#directory, signal }).catch(error => { throw localizeServiceError(error, language); });
        const cookies = P.scopedCookies(result.cookies, url.href);
        if (cookies.length) headers.set('cookie', cookies.map(c => c.name + '=' + c.value).join('; '));
        const response = await this.#fetch(url, { ...options, method, body, headers, signal, redirect: 'manual' });
        if ([301, 302, 303, 307, 308].includes(response.status) && response.headers.has('location')) {
          if (options.redirect === 'error') { await response.body?.cancel(); throw new Error(uiText('请求发生重定向。', language)); }
          if (options.redirect === 'manual') {
            return finishResponse(response);
          }
          if ((response.status === 303 && !['GET', 'HEAD'].includes(method)) ||
              ([301, 302].includes(response.status) && method === 'POST')) {
            method = 'GET'; body = undefined;
            for (const header of ['content-type', 'content-length', 'content-encoding', 'content-language', 'content-location']) baseHeaders.delete(header);
          }
          let next;
          try { next = P.siteUrl(new URL(response.headers.get('location'), url).href); }
          catch (error) { await response.body?.cancel(); throw localizeServiceError(error, language); }
          await response.body?.cancel();
          if (url.origin !== next.origin) { baseHeaders.delete('referer'); baseHeaders.delete('origin'); }
          url = next; continue;
        }
        signal.throwIfAborted();
        return finishResponse(response);
      }
      throw new Error(uiText('站点重定向次数过多。', language));
    } finally { if (!bodyOwned) this.#controllers.delete(controller); }
  }
  async json(url, options) {
    const response = await this.fetch(url, options);
    if (!response.ok) { await response.body?.cancel(); throw new Error((options?.uiLanguage === 'en' ? 'Site request HTTP ' : '站点请求 HTTP ') + response.status); }
    return response.json();
  }
  facade() { return Object.freeze({ status: () => this.status(), fetch: (url, options) => this.fetch(url, options), json: (url, options) => this.json(url, options) }); }
}

// Translate only known messages at the plugin service boundary; network errors pass through untouched.
function localizeServiceError(error, language) {
  const message = uiText(error?.message, language);
  if (message === error?.message) return error;
  const translated = new Error(message, { cause: error });
  translated.name = error.name;
  if (error.code !== undefined) translated.code = error.code;
  return translated;
}
