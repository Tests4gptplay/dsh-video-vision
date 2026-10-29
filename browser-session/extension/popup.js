const english = !(navigator.language || '').toLowerCase().startsWith('zh');
const messages = {
 title: ['DSH 本地会话桥', 'DSH Local Session Bridge'],
 intro: ['让 DSH 在本机复用此浏览器资料的网站会话。授权与内置浏览器同步开关由 DSH 设置控制。', 'Let DSH reuse website sessions from this browser profile locally. Authorization and built-in browser sync are controlled in DSH settings.'],
 privacy: ['会话按请求站点在本地传递；扩展没有外部上传服务，也不保存 Cookie 文件。', 'Sessions are passed locally for the requested site. The extension has no external upload service and does not save cookie files.'],
 connect: ['连接 DSH', 'Connect to DSH'],
 loading: ['正在读取连接状态…', 'Reading connection status…'],
 connected: ['本地桥已连接。使用权限以 DSH 设置中的开关为准。', 'Local bridge connected. Access is controlled by the switches in DSH settings.'],
 disconnected: ['尚未连接。请打开 DSH，再点击连接。', 'Not connected. Open DSH, then click Connect.']
};
const t = key => messages[key][english ? 1 : 0];
document.documentElement.lang = english ? 'en' : 'zh';
for (const node of document.querySelectorAll('[data-i18n]')) node.textContent = t(node.dataset.i18n);
async function state(op) {
  const result = await chrome.runtime.sendMessage({ op });
  document.getElementById('state').textContent = result.connected ? t('connected') : t('disconnected') + (english && result.message === '本地连接已关闭' ? 'Local connection closed' : result.message || '');
}
document.getElementById('connect').onclick = () => state('connect');
state('status');
