const messages = {
  "请确认清理 VV 登录态副本。": "Confirm clearing VV session copies.",
  "请求发生重定向。": "The request was redirected.",
  "站点重定向次数过多。": "Too many site redirects.",
  "需要普通 HTTP(S) 站点地址。": "An ordinary HTTP(S) site URL is required.",
  "未选择浏览器连接": "No browser connection selected",
  "浏览器来源已切换，请重试。": "Browser source changed. Retry with the selected browser.",
  "已保存的浏览器选择无效，请重新选择。": "Saved browser selection is invalid. Select a browser again.",
  "所选浏览器连接不可用。": "Selected browser endpoint is unavailable.",
  "请选择来源浏览器连接。": "Select a browser before importing.",
  "浏览器来源已切换或授权已关闭。": "Browser source changed or authorization was disabled.",
  "浏览器会话服务已关闭。": "Browser session service is closed.",

  "缓存正在整理，请完成后再查看视频。": "The cache is being reorganized. Wait for it to finish before watching videos.",
  "视频任务正在使用缓存，请稍后重试。": "A video task is using the cache. Please try again later.",
  "无效的视频缓存 ID。": "Invalid video cache ID.",
  "缓存目录不存在或是链接。": "The cache directory does not exist or is a link.",
  "此目录不是可管理的视频缓存。": "This directory is not a manageable video cache.",
  "请选择普通文件夹作为缓存目录。": "Select a regular folder as the cache directory.",
  "缓存文件不存在，请刷新列表。": "The cached file does not exist. Refresh the list.",
  "索引文件随整项缓存一起删除。": "Index files are deleted together with the entire cache entry.",
  "此缓存含目录链接，请先在文件管理器中处理。": "This cache contains directory links. Handle them in the file manager first.",
  "列表中含目录链接，请先在文件管理器中处理。": "The list contains directory links. Handle them in the file manager first.",
  "请选择与缓存源文件不同的保存位置。": "Choose a save location different from the cached source file.",
  "请选择与缓存音频文件不同的保存位置。": "Choose a save location different from the cached audio file.",
  "音视频合并未生成有效文件。": "Merging audio and video did not produce a valid file.",
  "DSH 设置服务尚未就绪。": "The DSH settings service is not ready.",
  "请填写缓存文件夹的完整路径。": "Enter the full path to the cache folder.",
  "新旧缓存目录不能互相包含。": "The old and new cache directories cannot contain each other.",
  "缓存含目录链接，请先在文件管理器中处理。": "The cache contains directory links. Handle them in the file manager first.",
  "目标目录已有同名缓存：": "The destination already contains a cache with this name: ",
  "当前平台": "Current platform",
  "未识别": "Unrecognized",
  "请先开启“授权使用默认浏览器登录态”。": "Enable “Allow use of the default browser session” first.",
  "请在 Chrome 中打开 ": "Open this in Chrome: ",
  "默认浏览器授权已关闭或更新。": "Default browser authorization has been disabled or updated.",
  "默认浏览器授权已关闭。": "Default browser authorization is off.",
  "请通过 Desktop 设置中的授权开关操作。": "Use the authorization switch in Desktop settings.",
  "请确认删除。": "Confirm deletion.",
  "请确认清空缓存。": "Confirm clearing the cache.",
  "Windows 文件窗口未能打开。": "The Windows file dialog could not be opened.",
  "Windows 文件窗口未返回结果。": "The Windows file dialog did not return a result.",
  "系统另存为窗口用于 Windows。": "The system Save As dialog is available on Windows.",
  "本地会话服务未响应，请重新打开设置。": "The local session service did not respond. Reopen settings.",
  "本地浏览器请求未完成，请检查连接。": "The local browser request did not complete. Check the connection.",
  "浏览器连接信息不完整。": "Browser connection information is incomplete.",
  "请先在设置中导入登录态。": "Import the browser session in settings first.",
  "未找到可用的浏览器连接。请保持已登录的来源浏览器运行，并确认该浏览器允许连接后重试。": "No available browser connection was found. Keep the signed-in source browser running and confirm that it allows connections, then try again.",
  "未能连接正在运行的浏览器。请保持来源浏览器运行后重试。": "Could not connect to the running browser. Keep the source browser running and try again.",
  "等待浏览器确认超时。原登录态未改动，可再次点击刷新。": "Timed out waiting for browser confirmation. The previous session is unchanged; you can refresh again.",
  "浏览器未提供可导入的 Cookie。原登录态未改动。": "The browser did not provide cookies to import. The previous session is unchanged.",
  "当前系统的本地加密存储不可用，未保存登录态。": "Local encrypted storage is unavailable on this system. The session was not saved.",
  "登录态未能保存，原登录态未改动。": "The session could not be saved. The previous session is unchanged.",
  "正在导入登录态，请等待本次操作结束。": "A session import is in progress. Wait for it to finish.",
  "本地会话请求无效。": "Invalid local session request."
};
export function uiText(message, language) {
  if (language !== 'en' && typeof message === 'string' && /^(maxDownloadMB|downloadTimeoutMs|processTimeoutMs) must be zero \(unlimited\) or a positive finite number\.$/.test(message)) return '预算必须为 0（不限制）或有效正数。';
  if (language !== 'en' || typeof message !== 'string') return message;
  if (Object.hasOwn(messages, message)) return messages[message];
  for (const prefix of ['目标目录已有同名缓存：', '请在 Chrome 中打开 ']) {
    if (message.startsWith(prefix)) return messages[prefix] + message.slice(prefix.length);
  }
  return message;
}
export function browserStatusUI(value, language) {
  if (!value) return value;
  return { ...value, browser: uiText(value.browser, language), componentMessage: uiText(value.componentMessage, language) };
}
