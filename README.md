# DSH Video Vision

**让 AI 观看、理解并保存多站在线视频和本地视频。**

结合带时间戳的画面、音频、字幕与语音转写分析内容；按时间细看、接续观看，复用站点解析方法和登录态，并缓存、提取保存视频素材。

本分支及本安装包对应 **0.10.2-review.7 候选版**，修复零帧操作的视觉采样范围元数据；[前一候选版的实机与 DSH 联合验收](https://github.com/Tests4gptplay/dsh-video-vision/blob/prepare/v0.10.2-review.6/docs/acceptance/REVIEW-20261110.zh.md)。当前正式版为 **0.10.1** · [正式发行说明与安装包](https://github.com/Tests4gptplay/dsh-video-vision/releases/tag/v0.10.1)。

## 能做什么

- **在线视频与本地文件**：发送视频链接、媒体直链或本地文件路径。Bilibili、YouTube 等只是站点示例；可通过站点方法扩展更多来源。
- **画面与声音一起分析**：查看全片概览、指定片段或精确时间点，结合音轨理解动作、屏幕文字和演示过程。
- **按请求覆盖、按宿主接入**：默认六帧、30 秒音频是快速概览；明确指定的画面与音频范围可继续处理。保留源视频和缓存画面，发送给 AI 时根据运行中的 DSH 附件规格生成兼容的图像副本。
- **字幕与语音转写**：读取平台字幕；语音识别器就绪时，转写对白或歌词，并标明时间和来源。
- **音频与音乐辅助**：查看电平、停顿、明显起音和估计节拍，辅助选择剪辑或转场时间点。
- **接续观看**：保存观看进度，下次从上次位置继续；已处理的画面、音频和转写可复用。
- **积累站点方法**：复用已有解析方法；遇到新站点时，AI 可借助宿主工具探索、验证并保存方法和笔记。
- **使用登录态**：经用户确认导入浏览器登录态并加密保存，供 Video Vision 请求需要登录的内容；导入后不必一直开着浏览器。
- **缓存更新与提取保存**：默认复用缓存，需要更新内容或提高画质时可让 AI 重新获取，成功后再替换旧项；管理视频、音轨、画面及观看进度，另存视频或单个文件，支持合并已缓存的独立音轨。

## 这样使用

安装并启用后，在 DSH 中选择支持工具调用与图片输入的模型，直接对它说：

> 看一下这个视频：〈视频链接或本地文件路径〉
>
> 细看 50 到 80 秒，告诉我画面怎么变化。
>
> 回到 1 分 40 秒，读一下屏幕上的代码。
>
> 结合字幕，整理这一段的操作步骤。
>
> 分析这一段的对白或歌词，再找适合转场的声音起点。
>
> 接着往下看。

## 安装与升级

### 当前正式版 0.10.1

推荐安装来源：

```text
github:Tests4gptplay/dsh-video-vision#v0.10.1
```

**npm 安装：** 也可在 **包名或地址** 中填入 `@tests4gptplay/dsh-video-vision@0.10.1`。

也可从[正式发行页](https://github.com/Tests4gptplay/dsh-video-vision/releases/tag/v0.10.1)下载 `dsh-video-vision-0.10.1.tgz`，核对发行页 SHA-256，无需解压。

**DSH Desktop**：在侧栏打开 **插件 → 添加插件**（或箭头菜单 **安装第三方插件**），在 **包名或地址** 填入上方 GitHub 来源；也可填运行 DSH 电脑上的 TGZ 完整路径或正式发行页的 TGZ 下载地址。点击 **安装**，核对版本后 **立即启用**。

**升级**：同样填写本版新的来源，成功后核对版本并启用，保留设置与用户文件。如果宿主提示已安装或要求先卸载，再按提示仅处理对应插件条目；不清登录态、缓存或观看进度，不手动删除目录。重启以 DSH 提示为准。

**DSH Web**：先停止对应 profile，在服务所在环境执行，成功后重启：

```sh
dsh plugin --profile web add 'github:Tests4gptplay/dsh-video-vision#v0.10.1'
```

Web 与 Desktop 分别安装。曾安装旧宿主桥的用户，另见[一次性退出说明](https://github.com/Tests4gptplay/dsh-video-vision/blob/main/docs/testing/LEGACY-EXIT.md)；已完成者不必重复。

### 0.10.2-review.7 候选版（本分支）

在 DSH Desktop 的 **插件 → 添加插件 → 包名或地址** 中直接输入：

```text
github:Tests4gptplay/dsh-video-vision#prepare/v0.10.2-review.7
```

安装并启用后确认显示版本 `0.10.2-review.7`。如果宿主仍显示已安装旧版本，请核对当前加载的插件包与实际版本。也可使用候选安装包 `tests4gptplay-dsh-video-vision-0.10.2-review.7.tgz` 的完整本机路径。DSH Web 可在停止对应 profile 后运行：

```sh
dsh plugin --profile web add 'github:Tests4gptplay/dsh-video-vision#prepare/v0.10.2-review.7'
```

上一候选版的完整 DSH 集成验收资料：[0.10.2-review.6 验收详情](https://github.com/Tests4gptplay/dsh-video-vision/blob/prepare/v0.10.2-review.6/docs/acceptance/REVIEW-20261110.zh.md)。安装测试使用验收产物中的 TGZ，准备分支名称不是已发布的 Release tag 或 npm 发行版本。

Android/Termux 用户反馈的 [Issue #2](https://github.com/Tests4gptplay/dsh-video-vision/issues/2)（附件保存）与 [Issue #3](https://github.com/Tests4gptplay/dsh-video-vision/issues/3)（sharp 后端）位于 **DSH 附件组件**。针对 DSH `0.2.2-rc.1` 的验收资料另提供 `deepseek-ai-dsh-attachment-local-0.2.2-rc.1.termux.1.tgz` 和对应源码补丁；它们与 VV 候选包分别安装、分别验证。两项修复及已覆盖环境见[验收记录](https://github.com/Tests4gptplay/dsh-video-vision/blob/prepare/v0.10.2-review.6/docs/acceptance/REVIEW-20261110.zh.md)。

## 导入与管理登录态

在 **设置 → 视频视觉** 中：

1. 点击 **安装 Chrome 扩展**，进入微软官方 Playwright 扩展商店页，由用户确认安装。
2. 选择 **Google Chrome（浏览器内确认）**，开启登录态授权，点击 **导入登录态**，按扩展提示在 Chrome 中确认连接并选择页面。已有浏览器连接也可选择。
3. 导入后可关闭来源浏览器。需要更新或登录失效时，点击 **刷新登录态**；再次导入会更新当前保存的登录态。
4. 等待确认或采集时，可点击 **取消导入**，保留授权和已有副本。

安装状态仅在必要的用户操作中确认，不后台扫描或轮询其他浏览器。打开商店不等于安装成功；显示“尚未确认”时仍可尝试连接。

**清理登录态** 只删除 Video Vision 管理的活动副本并停止读取，不退出源浏览器或 DSH 内置浏览器，不清媒体缓存。未完全清理成功时会提示，可重试。

## 源视频清晰度

在设置的 **源视频清晰度** 中查看和修改高度上限。新配置默认 `0`（不限制），按来源可用质量选择；正数保留为用户设置的上限。已有配置若为 `720`，不会自动覆盖，可在此改为 `0` 并保存。此设置不是下载大小预算，不改变分析画面的缩放尺寸，已有缓存不会自动升级清晰度。

需要更新已有缓存或提升清晰度时，可以直接告诉 AI：“重新获取这个视频，最高使用 1080P。”本次要求不会修改全局设置，也不必先删除缓存。新媒体获取并校验成功后才替换旧项；失败保留旧缓存与观看进度。返回实际尺寸与缓存命中/重新获取状态，不保证源站一定提供指定质量。

只分析了 15 秒不代表文件仅有 15 秒：文件时长与本次画面、音频的分析区间分别报告。文件足够长时继续读取后续区间即可；若文件本身只是短片，可重新获取，但源站或自定义解析方法是否提供完整内容仍需核实。

## 缓存、保存与方法

- **设置缓存目录**：选择固定位置，迁移已有缓存时保留观看进度和画面。
- **缓存列表**：查看占用、搜索视频、打开文件夹、提取文件或删除项目。
- **提取视频 / 提取**：通过系统保存窗口另存视频或单个缓存文件；视频与独立音轨已就绪时可合并保存。
- **清空缓存**：清理 Video Vision 媒体缓存，保留已提取文件、本地原视频和目录中的其他文件。
- **方法文件夹**：查看站点方法、使用指导和笔记。升级插件或清空视频缓存会保留个人方法与笔记；只启用自己信任的扩展代码。

## 运行环境与宿主接入

- 使用 Node.js 22+（可使用 DSH 自带版本），并准备 FFmpeg、ffprobe；可放入 PATH 或在插件设置中指定路径。
- 发送图片时遵循当前 DSH 附件服务的媒体类型、字节数、像素数和单边尺寸要求。插件按实际规格准备交付图像，源视频和源帧缓存保留原有内容；模型请求的容量由 DSH 管理。
- 默认观看概览为六帧和最多 30 秒音频。可明确指定时间点、片段与音频范围；配置中的正数预算按用户设置生效，`0` 表示未设置插件侧预算。语音识别按短窗交给 DSH 服务。
- 语音转写需要先在 DSH 语音设置中准备识别器；没有平台字幕或识别器时，仍可查看画面和分析可用音频。
- 站点访问效果取决于链接、解析方法和网站限制，不保证所有视频均可获取；直播请使用已结束的回放。
- 登录态可能被网站过期、撤销或要求重新验证；备用解析方式不使用导入的登录态。Linux 的加密存储需要可用的 Secret Service，系统文件窗口需要 Zenity 或 KDialog。
- 备用解析器仅在需要时准备。正式版环境见[0.10.1 验证说明](https://github.com/Tests4gptplay/dsh-video-vision/blob/main/docs/testing/RELEASE-0.10.1.md)；本候选版实际测试范围见[review.6 验收记录](https://github.com/Tests4gptplay/dsh-video-vision/blob/prepare/v0.10.2-review.6/docs/acceptance/REVIEW-20261110.zh.md)。

站点方法接口、参数、目录结构、命令行与实现原理见 [本分支技术文档](https://github.com/Tests4gptplay/dsh-video-vision/blob/prepare/v0.10.2-review.6/docs/TECHNICAL-REFERENCE.md)。

## English overview

Video Vision helps AI analyze multi-site online and local video with timestamped frames, audio, captions and speech transcription. Resume viewing, reuse site methods, manage authorized encrypted browser-session copies, refresh cached media and export video or individual files. The 0.10.2-review.6 candidate handles explicitly requested frame/audio ranges while adapting image delivery to the running DSH attachment service. The default six-frame/30-second overview is a starting strategy, and user-selected budgets remain configurable. The current stable release is 0.10.1 (`github:Tests4gptplay/dsh-video-vision#v0.10.1`); install the review.6 candidate from its verified local TGZ. Android/Termux attachment and sharp fixes have a separate DSH companion package for the tested host version.

## License

[MIT](LICENSE) · Tests4gptplay

备用解析使用独立安装的 [yt-dlp](https://github.com/yt-dlp/yt-dlp)，视频解码使用 [FFmpeg](https://ffmpeg.org/)。各工具采用各自的许可证；本项目的软件包包含插件运行代码和解析器准备工具。

## 支持项目 / Support

[GitHub Sponsors](https://github.com/sponsors/Tests4gptplay) · [Ko-fi](https://ko-fi.com/kou392350) · [支付宝 / Alipay](SPONSOR.md)
