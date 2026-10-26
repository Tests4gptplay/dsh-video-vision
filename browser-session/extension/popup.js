async function state(op) {
  const result = await chrome.runtime.sendMessage({ op });
  document.getElementById('state').textContent = result.connected ? '本地桥已连接。使用权限以 DSH 设置中的开关为准。' : '尚未连接。请打开 DSH，再点击连接。' + (result.message || '');
}
document.getElementById('connect').onclick = () => state('connect');
state('status');
