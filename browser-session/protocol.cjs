const { homedir } = require('node:os');
const { join } = require('node:path');
const { readFileSync } = require('node:fs');
function root() { return process.env.DSH_BROWSER_SESSION_HOME || join(process.env.DSH_HOME || join(homedir(), '.dsh'), 'browser-sessions'); }
// Deliberately separate from the retired Desktop bridge's authorization.json.
const authorizationFilename = 'vv-plugin-authorization-v1.json';
function authorization(directory = root()) {
 try { return { enabled: JSON.parse(readFileSync(join(directory, authorizationFilename), 'utf8')).enabled === true }; } catch { return { enabled: false }; }
}
function siteUrl(value) {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('需要普通 HTTP(S) 站点地址。');
  return url;
}
function scopedCookies(cookies, value) {
  const url = siteUrl(value);
  return (Array.isArray(cookies) ? cookies : []).filter(c => {
    const domain = String(c.domain || '').replace(/^\./, '').toLowerCase();
    return typeof c.name === 'string' && typeof c.value === 'string' && !/[\r\n;]/.test(c.name + c.value) &&
      (c.hostOnly ? url.hostname === domain : url.hostname === domain || url.hostname.endsWith('.' + domain)) &&
      (!c.secure || url.protocol === 'https:') && (!c.expirationDate || c.expirationDate > Date.now() / 1000) &&
      (url.pathname === (c.path || '/') || url.pathname.startsWith((c.path || '/').replace(/\/$/, '') + '/'));
  }).sort((a, b) => (b.path || '/').length - (a.path || '/').length);
}
module.exports = { root, authorizationFilename, authorization, siteUrl, scopedCookies };
