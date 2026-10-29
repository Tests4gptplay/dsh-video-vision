# 浏览器登录态导入与内置浏览器同步

## 平台

Windows Desktop 使用下述原会话组件。Linux/macOS 由插件生命周期管理本地会话服务，继续使用设置页的导入/刷新按钮，不要求浏览器扩展。Linux 需要可用的 Secret Service；macOS 使用系统钥匙串，实机验证待补。macOS 内置浏览器同步尚未适配。Web 模式共享会话服务与 Electron 内置浏览器同步是不同能力。

## Desktop 会话组件安装

视频插件通过 DSH 原生插件管理器安装。Windows Electron 版 DSH Desktop 的登录态导入与内置浏览器同步使用随包附带的本地会话组件，首次使用时安装一次；升级后运行同一命令更新组件。

先完全退出 DSH Desktop（包括托盘中的主进程），在 PowerShell 中运行以下命令，再重新打开 DSH。示例采用默认安装位置；自定义安装时替换相应路径。

```powershell
$resources = Join-Path $env:LOCALAPPDATA 'Programs\DeepSeek Harness\resources'
$plugin = Join-Path $env:USERPROFILE '.dsh\profiles\desktop\node_modules\dsh-video-vision'
$node = Join-Path $env:USERPROFILE '.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe'
& $node (Join-Path $plugin 'browser-session\install-desktop.cjs') $resources
```

已安装过组件时，若 Desktop 更新使组件或启动入口缺失，点击“导入登录态”或“刷新登录态”会恢复组件。恢复后完全退出并重新启动 Desktop，再导入；刷新页面或重新加载插件不会重启 Desktop 主进程。

组件将会话服务接入 Desktop 主进程，并为原始应用文件保留备份。安装完成后，按下面的设置页步骤授权和导入。

## 用户操作

**保持已登录的浏览器运行，点击“导入登录态”；以后按需刷新。**

1. 在“设置 → 视频视觉”开启 **授权使用默认浏览器登录态**，点击 **导入登录态**。
2. 插件自动发现正在运行的 Chrome、Edge 等浏览器连接，包括 CAH 使用的自定义资料目录和端口。浏览器若显示连接确认，选择允许即可。
3. 看到“导入完成”后，登录态已加密保存在本机，本次连接自动结束。**刷新登录态**可手动更新；刷新失败保留原登录态。
4. Windows Desktop 需要内置浏览器复用时，开启 **同步至 DSH 内置浏览器**。

若登录态失效，先在来源浏览器登录，再点击“刷新登录态”。已有 CAH 等浏览器连接时直接导入；设置页提供的 Chrome 连接设置用于建立新连接。

两项授权由用户控制；设置页加载、状态检查和窗口获得焦点只读取状态。

## 工作方式

- 从正在运行的浏览器进程识别实际端口与资料目录，同时支持浏览器公布的 `DevToolsActivePort`。连接通过浏览器级 `Storage.getCookies` 读取快照后断开，浏览器继续运行。
- Windows Desktop 快照由主进程通过系统加密存储保存为 `browser-sessions/session-state.bin`。Linux/macOS 按所选来源独立保存加密快照，并由系统密钥服务保管加密密钥。DSH 重启后可继续使用；刷新由用户点击触发。
- 共享服务按请求网站、路径、HTTPS 与有效期匹配 Cookie。插件通过 `ctx.browserSessions.fetch(url, options)` / `.json(url, options)` 复用会话，支持请求方法、请求体与重定向选项。工具和设置状态返回授权、导入状态及时间；凭据留在本地服务。
- **同步至 DSH 内置浏览器**独立控制。开启后，内置浏览器访问网站时从快照导入适用 Cookie（含 HttpOnly）。关闭同步恢复本组件导入前的同键 Cookie。插件卸载过程只结束当前操作，持久化授权由用户设置决定。
- 快照保存普通 Cookie 会话；分区 Cookie（CHIPS）暂不导入。浏览器资料保留在原位置。

## 凭据与下载

登录态由自有本地服务使用，并发送给 Cookie 所属网站。yt-dlp 和站点解析子进程使用匿名下载路径。凭据保留在系统加密存储中，不进入模型上下文、对话、日志、工程文件、缓存清单或方法笔记。

实现参考：[Playwright 认证状态](https://playwright.dev/docs/auth)、[Chrome 浏览器连接](https://developer.chrome.com/docs/devtools/agents/use-cases/auto-connect)。
