let nativePort;
let lastError = '';
function connect() {
  if (nativePort) return;
  const port = chrome.runtime.connectNative('dsh.browser_sessions');
  nativePort = port;
  lastError = '';
  port.postMessage({ op: 'hello' });
  port.onMessage.addListener(async message => {
    if (message.op === 'error') { lastError = message.message; return; }
    if (message.op !== 'cookies') return;
    try {
      const url = new URL(message.url);
      if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw new Error();
      // Chrome supplies only cookies applicable to the requested site and path.
      const cookies = await chrome.cookies.getAll({ url: url.href });
      if (nativePort === port) port.postMessage({ id: message.id, cookies });
    } catch { if (nativePort === port) port.postMessage({ id: message.id, error: true }); }
  });
  port.onDisconnect.addListener(() => {
    lastError = chrome.runtime.lastError?.message || '本地连接已关闭';
    if (nativePort === port) nativePort = null;
  });
}
chrome.runtime.onInstalled.addListener(connect);
chrome.runtime.onStartup.addListener(connect);
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (sender.id !== chrome.runtime.id) return;
  if (message.op === 'connect') connect();
  respond({ connected: Boolean(nativePort), message: lastError });
});
