import { headers } from './bilibili.js';

// Bilibili media adapter over the shared default-browser session service.
export function nativeRequest(path, params = {}) {
  return { path, params };
}

function mediaUrl(value) {
  if (typeof value !== 'string') return undefined;
  try {
    const url = new URL(value, 'https://api.bilibili.com');
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return undefined;
    return url.href;
  } catch { return undefined; }
}
function track(value = {}) {
  return { id: Number(value.id), width: Number(value.width), height: Number(value.height),
    bandwidth: Number(value.bandwidth), codecs: String(value.codecs || ''),
    baseUrl: mediaUrl(value.baseUrl || value.base_url),
    backupUrl: (value.backupUrl || value.backup_url || []).map(mediaUrl).filter(Boolean) };
}
export function nativeResult(path, data) {
  if (path === '/x/player/pagelist') return (Array.isArray(data) ? data : []).map(p => ({
    cid: Number(p.cid), page: Number(p.page), duration: Number(p.duration), part: String(p.part || '')
  }));
  if (path === '/x/player/playurl') return {
    quality: Number(data?.quality), timelength: Number(data?.timelength),
    dash: { video: (data?.dash?.video || []).map(track), audio: (data?.dash?.audio || []).map(track) },
    durl: (data?.durl || []).map(d => ({ url: mediaUrl(d.url), backup_url: (d.backup_url || []).map(mediaUrl).filter(Boolean) }))
  };
  if (path === '/x/player/v2') return {
    need_login_subtitle: Boolean(data?.need_login_subtitle),
    subtitle: { subtitles: (data?.subtitle?.subtitles || []).map(s => ({
      lan: String(s.lan || ''), lan_doc: String(s.lan_doc || ''),
      subtitle_url: mediaUrl(s.subtitle_url)
    })).filter(s => s.subtitle_url) }
  };
  throw new Error('原生媒体响应类型无效。');
}
export class NativeSession {
  constructor(browserSessions, anonymousFetch = globalThis.fetch) { this.browserSessions = browserSessions; this.anonymousFetch = anonymousFetch; }
  status() { return this.browserSessions.status(); }
  async fetch(url, options) {
    const state = await this.status();
    return state.enabled && state.connected ? this.browserSessions.fetch(url, options) : this.anonymousFetch(url, options);
  }
  async api(path, params, signal) {
    const request = nativeRequest(path, params);
    const url = new URL('https://api.bilibili.com');
    url.pathname = request.path;
    for (const [key, value] of Object.entries(request.params)) url.searchParams.set(key, value);
    const state = await this.status();
    const options = { headers: headers(), signal };
    let json;
    if (state.enabled && state.connected) json = await this.browserSessions.json(url.href, options);
    else {
      const response = await this.anonymousFetch(url.href, options);
      if (!response.ok) throw new Error('B 站接口 HTTP ' + response.status);
      json = await response.json();
    }
    if (json.code !== 0) throw new Error('B 站接口返回错误：' + Number(json.code));
    return nativeResult(path, json.data);
  }
}
