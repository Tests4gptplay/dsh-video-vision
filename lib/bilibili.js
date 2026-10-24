const AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';
export function headers(url = 'https://www.bilibili.com/') {
  return { 'User-Agent': AGENT, Referer: url, Origin: 'https://www.bilibili.com', Accept: '*/*' };
}

export async function api(path, params, signal) {
  const url = new URL(path, 'https://api.bilibili.com');
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));
  const r = await fetch(url, { headers: headers(), signal: AbortSignal.any([signal, AbortSignal.timeout(20000)]) });
  if (!r.ok) throw new Error(`Bilibili ${path}: HTTP ${r.status}.`);
  const json = await r.json();
  if (json.code !== 0) throw new Error(`Bilibili ${path}: ${json.code} ${json.message ?? ''}`);
  return json.data;
}

export async function parseBilibili(source, signal) {
  let text = source.trim();
  if (/^https?:\/\/b23\.tv\//i.test(text)) {
    const r = await fetch(text, { headers: headers(), redirect: 'follow', signal: AbortSignal.any([signal, AbortSignal.timeout(20000)]) });
    text = r.url;
    await r.body?.cancel();
  }
  if (/^BV[0-9A-Za-z]{10}$/i.test(text)) return { bvid: 'BV' + text.slice(2), page: 1 };
  let u;
  try { u = new URL(text); } catch { return null; }
  if (!['http:', 'https:'].includes(u.protocol) || !(u.hostname === 'bilibili.com' || u.hostname.endsWith('.bilibili.com'))) return null;
  const bvid = u.pathname.match(/\/(BV[0-9A-Za-z]{10})(?:\/|$)/i)?.[1] ?? u.searchParams.get('bvid');
  if (!bvid || !/^BV[0-9A-Za-z]{10}$/i.test(bvid)) throw new Error('Use a Bilibili BV video URL, BV id, or b23.tv share link.');
  const page = Number(u.searchParams.get('p') ?? 1);
  if (!Number.isInteger(page) || page < 1) throw new Error('The Bilibili part p must be a positive integer.');
  return { bvid: 'BV' + bvid.slice(2), page };
}

export function selectStreams(play, maxHeight = 720) {
  const videos = (play.dash?.video ?? []).filter(v => v.baseUrl || v.base_url);
  if (videos.length) {
    const eligible = videos.filter(v => Number(v.height) <= maxHeight);
    const choices = (eligible.length ? eligible : videos).slice().sort((a, b) =>
      Number(b.height) - Number(a.height) || Number(b.width) - Number(a.width) ||
      Number(String(b.codecs).startsWith('avc')) - Number(String(a.codecs).startsWith('avc')) ||
      Number(a.bandwidth) - Number(b.bandwidth));
    const v = choices[0];
    const audios = (play.dash.audio ?? []).filter(a => a.baseUrl || a.base_url);
    audios.sort((a, b) => Number(a.bandwidth) - Number(b.bandwidth));
    return { video: v.baseUrl ?? v.base_url, videoBackup: v.backupUrl ?? v.backup_url ?? [],
      audio: audios[0]?.baseUrl ?? audios[0]?.base_url ?? null,
      quality: Number(v.id), width: Number(v.width), height: Number(v.height), videoOnly: true };
  }
  if (play.durl?.length === 1 && play.durl[0].url) {
    return { video: play.durl[0].url, videoBackup: play.durl[0].backup_url ?? [], audio: null,
      quality: play.quality, width: null, height: null, videoOnly: false };
  }
  throw new Error('Bilibili did not return a playable stream for this video.');
}

export async function playback(bvid, cid, maxHeight, signal) {
  const play = await api('/x/player/playurl', { bvid, cid, qn: 64, fnval: 4048, fnver: 0, fourk: 0 }, signal);
  return { ...selectStreams(play, maxHeight), duration: Number(play.timelength) / 1000 };
}

export async function resolveBilibili(target, maxHeight, signal) {
  // pagelist remains useful when the unrelated web-interface/view endpoint is rate-limited.
  const pages = await api('/x/player/pagelist', { bvid: target.bvid }, signal);
  const part = pages.find(p => p.page === target.page);
  if (!part) throw new Error(`Video has ${pages.length} part(s); part ${target.page} does not exist.`);
  const media = await playback(target.bvid, part.cid, maxHeight, signal);
  return { id: `${target.bvid}-p${target.page}`, source: 'bilibili', bvid: target.bvid, page: target.page,
    cid: part.cid, title: part.part, sourceUrl: `https://www.bilibili.com/video/${target.bvid}/?p=${target.page}`,
    duration: media.duration || part.duration, pageCount: pages.length, media };
}

export async function subtitles(bvid, cid, signal) {
  try {
    const player = await api('/x/player/v2', { bvid, cid }, signal);
    const tracks = player.subtitle?.subtitles ?? [];
    if (!tracks.length) return { state: player.need_login_subtitle ? 'login-required' : 'none', tracks: [], cues: [] };
    const preferred = tracks.find(t => /^zh|^ai-zh/.test(t.lan)) ?? tracks[0];
    const url = new URL(preferred.subtitle_url, 'https://api.bilibili.com').href;
    const r = await fetch(url, { headers: headers(), signal: AbortSignal.any([signal, AbortSignal.timeout(20000)]) });
    if (!r.ok) throw new Error(`Subtitle HTTP ${r.status}`);
    const j = await r.json();
    return { state: 'available', language: preferred.lan, label: preferred.lan_doc,
      tracks: tracks.map(t => ({ language: t.lan, label: t.lan_doc })),
      cues: (j.body ?? []).map(c => ({ start: Number(c.from), end: Number(c.to), text: String(c.content) })) };
  } catch (error) {
    signal.throwIfAborted();
    return { state: 'unavailable', reason: error.message, tracks: [], cues: [] };
  }
}
