# DSH Video Vision

**在 DSH 中观看、分析和保存网络及本地视频，让 AI 结合时间戳画面、音频与字幕理解内容。**

当前候选：`0.10.0-candidate.2`（本分支测试包，未发布正式版本）。统一跨平台登录态采集与加密副本，移除无宿主插件接口的内置同步，新增仅清VV副本操作。保留此前视频/音频/缓存修复。本次仅修订清理登录态按钮、就地确认及方法说明换行；会话运行逻辑不变。验收见 [本次 UI 修订](docs/testing/UI-CANDIDATE-2.md)，此前全量记录见 [候选说明](docs/testing/UNIFIED-CANDIDATE.md)。

保留离线已选来源显示与宿主主题适配。完整云端源码、实际包和真实媒体验证记录见[全量覆盖](docs/testing/FULL-COVERAGE.md)；历史0.9.2记录见[旧版测试报告](docs/testing-0.9.2.md)。

发送视频链接或提供本地视频路径，AI 可以获取带时间戳的画面、分析音频、读取平台字幕，并在识别器就绪时转写对白和歌词。视频、音轨和画面保存在本地缓存，可接续观看、按时间细看，也可从设置页提取并另存视频或单个缓存文件。

通过内置解析、可复用的站点方法和 yt-dlp 备用解析接入不同视频来源；AI 还可借助宿主工具探索并积累新站点的方法。适合看教程、讨论作品、分析演示和保存视频素材。

## 这样使用

安装并启用后，在 DSH 中选择支持工具调用与图片输入的 AI 模型，直接对它说：

> 看一下这个视频：https://www.youtube.com/watch?v=视频ID

接着可以继续问：

> 细看 50 到 80 秒，告诉我画面怎么变化。
>
> 回到 1 分 40 秒，读一下屏幕上的代码。
>
> 结合字幕，整理这一段的操作步骤。
>
> 分析 12 到 28 秒的日语歌词，再找适合转场的声音起点。
>
> 接着往下看。

## 视频来源

站点名称是示例，具体链接由内置或扩展解析方法处理；遇到尚无方法的站点时，AI 可使用宿主已有的网页、浏览器和脚本工具探索并保存可运行的方法。获取结果取决于站点访问条件、解析方法和所需依赖。

- **Bilibili**：视频链接、BV 号、b23.tv 分享短链和分 P 视频，使用内置接口。
- **YouTube 与其他视频网站**：优先复用已保存的站点解析方法；遇到新站点时，AI 可按插件提供的指导，使用当前宿主的网页、浏览器和脚本工具探索方法，跑通后保存为扩展。
- **备用解析器**：保留 [yt-dlp](https://github.com/yt-dlp/yt-dlp)，可通过 `resolver: "yt-dlp"` 处理 YouTube、Vimeo、Dailymotion 等视频。上游覆盖范围见[站点目录](https://github.com/yt-dlp/yt-dlp/blob/master/supportedsites.md)。
- **媒体直链与本地视频**：支持站点扩展或备用解析器可读取的 HTTP(S) 媒体链接，以及本地视频文件。

yt-dlp 备用方式始终匿名，不接收 Cookie 或浏览器登录态。登录会话通过下方的插件内加密会话副本复用，网络代理可通过 `proxy` 设置。直播内容使用已结束的回放链接。

## 它怎样给 AI 接上视频视觉

插件获取视频，将带时间戳的画面通过 DSH 原生图片附件交给当前 AI 模型。AI 先看全片画面概览，同时取得一段音频分析与转写，再按时间区间查看细节。画面、音频、平台字幕和识别文本分别带有来源与覆盖范围。

- **链接直接观看**：发送视频链接即可开始。
- **按时间细看**：指定片段或时间点，查看动作变化、界面和屏幕文字。
- **接续观看**：保存观看位置，下一次从上次进度继续。
- **音视频一起看**：默认分析最多 30 秒声音，B 站分离音轨自动获取并缓存。
- **字幕与歌词**：读取平台字幕，并复用 DSH 已准备好的识别器，将歌词、对白按最多 15 秒窗口转写；重复观看复用结果。
- **音乐卡点**：查看每秒电平、停顿、明显起音和估计 BPM，辅助选择剪辑时间点。
- **本地缓存与提取保存**：复用视频、音轨、画面和观看进度；另存视频或单文件，已缓存的独立音轨可在提取视频时合并。
- **方法积累**：保存站点解析代码和实践笔记，下次直接复用，不必每次重新探索。

每批默认提供 6 张画面，默认上限 12 张。细看快速变化的内容时，可以缩短时间区间、增加画面数量。

## 安装和升级

本次候选包为 `dsh-video-vision-0.10.0-candidate.2.tgz`（本地候选交付文件，尚未发布）；精确SHA见 [本次包清单](test-artifacts/unified-0.10.0-candidate.2/PACKED-MANIFEST.json)，全量步骤见 [候选说明](docs/testing/UNIFIED-CANDIDATE.md)。已安装旧宿主桥时先审核 [一次性退出说明](docs/testing/LEGACY-EXIT.md)。`test-artifacts/` 中0.9.x文件仅历史证据，勿当作本候选安装。正式发行版仍在[GitHub Releases](https://github.com/Tests4gptplay/dsh-video-vision/releases)。

DSH Desktop：打开 **插件 → 添加插件**，填写候选 `.tgz` 的完整本地路径。Web 版安装命令：

```bash
dsh plugin --profile web add '/完整路径/dsh-video-vision-0.10.0-candidate.2.tgz'
```

Web 与 Desktop 分别安装。启用 `video-vision` 后正常重新加载插件，在新的请求中发送视频链接即可。

### 运行依赖

使用 Node.js 22+（可使用 DSH 自带版本），并将 FFmpeg 与 ffprobe 所在目录加入 PATH，或在插件配置中填写两个程序的路径。

只有选择 yt-dlp 备用方式时，插件才准备这项依赖：优先使用已配置或现有的解析器；缺少可用程序时自动下载官方版本，核对 SHA-256 后保存在用户目录的 `.dsh/tools/dsh-video-vision` 中。已经安装 yt-dlp 时，可填写 `ytDlpPath` 使用自己的解析器。B 站内置方法、本地视频和自定义站点扩展不依赖 yt-dlp。

### 平台说明

- Windows、Linux、macOS 共用插件内 CDP 采集、加密快照和 VV HTTP 路径；保留各系统浏览器发现与文件窗口适配。
- Linux 直接使用插件的导入/刷新按钮；加密存储需要可用的 Secret Service。系统文件窗口使用 Zenity，未安装时尝试 KDialog。
- macOS 已加入浏览器发现、系统钥匙串与文件窗口适配，实机验证待补。不再提供内置浏览器同步。
- Web/Desktop 使用相同会话服务；日常请求可在来源浏览器关闭后使用 VV 的加密副本。
- 导入需要来源浏览器提供可连接的调试端点；多个来源可在设置中选择。分区 Cookie（CHIPS）暂不支持。

### 升级与已有缓存

已安装 `dsh-video-vision` 时，使用上述来源更新，保留原来的插件配置和缓存目录。

从早期不同包名的版本迁移时，先记下缓存目录与自定义工具路径，停用并卸载旧包，再安装新版。在“视频视觉”中选择原缓存目录，并填回原来的工具路径，即可继续使用已有视频、画面和观看进度。

yt-dlp 处理 YouTube 时使用 Node.js 运行播放器解析逻辑；官方 yt-dlp 可执行文件内含所需的 EJS 脚本。插件会使用当前 Node.js 路径，也可通过 `nodePath` 指定。详见上游 [EJS 文档](https://github.com/yt-dlp/yt-dlp/wiki/EJS)。

## 设置与缓存管理

打开 DSH **设置 → 视频视觉**：

- **授权使用默认浏览器登录态**：默认关闭。保持已登录的浏览器运行，点击“导入登录态”。发现后必须明确选择现有 Chrome、Edge 等浏览器连接（支持自定义资料目录与端口）；浏览器若显示连接确认，选择允许即可。成功后按钮显示“登录态已导入”并禁用，“刷新登录态”可手动更新。登录态加密保存在本机，导入完成后结束本次连接。**若登录态失效，请点击“刷新登录态”。** 其他 DSH 插件可接入共享 `browserSessions.fetch/json` 服务。
- **清理 VV 登录态副本**：只清本插件管理的登录态保存副本，关闭有效读取；失败/部分成功明确报告。不清源浏览器、内置浏览器独立登录态或媒体缓存。官方 rc.5 未公开插件 Cookie/session 导入接口，因此移除内置同步及旧宿主桥，不保留隐藏恢复路径。已安装旧桥的退出步骤见 [说明](docs/testing/LEGACY-EXIT.md)。
- **匿名备用方式**：yt-dlp 始终匿名，不接收会话凭据；站点解析子进程也不接收凭据。视频、完整音轨和字幕遵循同样规则。

- **方法文件夹**：点击“设置缓存目录”同一行的“方法文件夹”，打开保存方法指导、站点解析扩展和笔记的独立目录。
- **存储位置**：点击“设置缓存目录”，在系统目录选择窗口中选择文件夹。已有视频、画面和观看进度会一起迁移，新位置立即生效。
- **当前占用**：查看缓存大小、条目数和画面数，可直接打开缓存文件夹。
- **缓存列表**：按标题、平台或视频 ID 搜索，跳转原视频、打开单项目录、提取视频或删除该项缓存。
- **提取与保存**：点击“提取视频”或单文件“提取”，弹出系统另存为窗口，选择文件名和位置；覆盖同名文件由系统窗口确认。第一栏的“缓存文件夹”打开上方显示的缓存目录，新缓存的视频按条目保存在其中的 videos 子目录。
- **清空缓存**：确认后清理列表中的全部缓存，保留已提取文件、本地原视频以及目录中的其他文件。

文件夹入口每次点击都会将对应窗口带到前台，关闭后可以再次打开。视频任务运行时仍可打开文件夹和提取文件；迁移和删除在任务完成后操作。“提取视频”会将已经获取的完整独立音轨无损合并进导出视频；原本已有声音的视频直接保存。文件列表中的单文件“提取”按原样保存，适合单独导出音频或视频轨。

## 可积累的解析方法

默认配置文件夹是用户主目录下的 `.dsh/video-vision`（Windows 为 `%USERPROFILE%\.dsh\video-vision`）；设置了 `DSH_HOME` 时位于 `%DSH_HOME%\video-vision`，也可通过 `configDirectory` 指定绝对路径。

```text
video-vision/
  BUILTIN_GUIDANCE.md         # 随版本更新的观看与解析指导
  AUDIO_GUIDANCE.md           # 随版本更新的音频、歌词、音乐指导
  GUIDANCE.md                 # 保留的个人指导
  README.md                   # 目录用途
  resolvers/
    BUILTIN_INTERFACE.md      # 随版本更新的可执行扩展接口
    README.md                 # 保留的接口说明和个人补充
    example.mjs.txt            # 不自动执行的模板
    your-site/
      manifest.json           # 匹配主机、路径与启用状态
      resolve.mjs             # 站点解析与下载代码
  notes/                      # 经过实践的方法笔记
```

每次调用工具，返回值都会带上 `method_guidance`：指导文件路径、`methods` 读取入口和使用时机。完整指导只在需要时读取。打开视频先复用缓存和现有方法；需要补充方法时，工具返回 `needs_method`，AI 再调用 `methods` 读取指导。新扩展先明确试用，通过实际视频解码和画面检查后启用，下一次请求即可使用，无需重装。

站点扩展是本机执行的 JavaScript，由 AI 使用宿主已有的文件工具保存。应只启用自己编写或确认过的代码；方法和笔记保存可复用步骤，不保存 Cookie、Token 或临时签名媒体地址。配置目录与安装目录、视频缓存分开。内置观看、音频和接口指导随版本更新，个人 GUIDANCE、站点方法和笔记保持原样。

## 工具

插件提供 `video_vision` 工具：

| action | 用途 |
| --- | --- |
| `open` | 打开视频链接、BV 号或本地文件，获取画面概览 |
| `watch` | 查看指定区间或精确时间点；省略起点时接着上次进度 |
| `transcript` | 读取平台字幕及其时间点 |
| `transcribe` | 使用 DSH 语音识别器按短窗转写歌词或对白 |
| `audio` | 分析指定音频片段，返回可播放 WAV、信号测量和转写 |
| `status` | 查看当前视频、缓存、配置目录和语音识别状态 |
| `methods` | 按需读取方法指导，列出站点扩展及其路径和错误 |

`open` / `watch` 默认处理最多 30 秒音频。读取 `audio.analyzed_range_seconds` 后，可用 `audio` 继续所需区间，单次默认上限 60 秒。`audio_mode: "analyze"` 只做信号分析，`audio_mode: "off"` 用于纯画面任务。日语歌使用 `language: "ja"`，歌词结合相应画面或平台字幕核对。`audio_source` 明确列出内嵌、独立缓存或待获取的音轨。

`tempo` 是起音包络的脉冲速度估计，返回候选 BPM 和周期性分数；与 `prominent_onsets_seconds` 一起辅助卡点。没有稳定脉冲时 BPM 返回 null。音频分析详见 [音频使用指导](resources/audio.md)。

`open` 的 `resolver` 默认为 `auto`；指定 `yt-dlp` 使用备用解析器，指定方法目录名可以直接试用该扩展，包括尚未启用的草稿。

## 配置

在 `video-vision` 条目的 `config` 中设置：

```yaml
ffmpegPath: ffmpeg
ffprobePath: ffprobe
cacheDirectory: .dsh-video-vision
maxHeight: 720
frameWidth: 1280
maxFrames: 12
maxDownloadMB: 1024
downloadTimeoutMs: 300000
processTimeoutMs: 60000
maxAudioSeconds: 60
speechProvider: sensevoice-local
# configDirectory: 'D:\VideoVisionConfig'
# ytDlpPath: 'D:\VideoTools\yt-dlp.exe'
# nodePath: 'C:\Program Files\nodejs\node.exe'
# proxy: 'http://127.0.0.1:7890'
```

默认使用当前会话工作目录的 `.dsh-video-vision`；设置页显示最近使用的视频会话缓存位置，尚未观看时使用 DSH 默认工作目录。可在设置页改为固定的绝对路径，让各会话共享同一缓存位置。`maxHeight` 是优先选择的清晰度，结果会列出实际分辨率。`maxDownloadMB` 设置文件大小预算，`downloadTimeoutMs` 设置解析或下载单次任务的最长时间。

字幕优先使用平台提供的人工字幕，其次使用自动字幕，结果标明语言和来源。使用语音转写前，在 DSH 的语音设置中准备好识别器，默认使用 `sensevoice-local`。转写以短片段为单位，默认每段最长 60 秒。

## 命令行与开发

命令行与插件共用视频及信号分析流程，输出画面、WAV 路径和结构化结果；歌词/对白识别使用运行中 DSH 的语音服务：

```powershell
node bin/video-vision.mjs methods --source "https://www.youtube.com/watch?v=视频ID"
node bin/video-vision.mjs open --source "https://www.youtube.com/watch?v=视频ID" --resolver yt-dlp --frames 6
node bin/video-vision.mjs watch --timestamps 12,45,120
node bin/video-vision.mjs transcript
node bin/video-vision.mjs audio --start 12 --end 28 --audio-mode analyze
node bin/video-vision.mjs --help
```

可用 `--cwd` 指定工作目录，`--cache` 指定缓存位置，`--config-directory` 指定持久化扩展目录，`--ytdlp`、`--ffmpeg` 和 `--ffprobe` 指定程序路径，`--output` 保存 JSON 结果。Ctrl+C 取消当前任务。

```powershell
npm test
```

## License

[MIT](LICENSE) · Tests4gptplay

备用解析使用独立安装的 [yt-dlp](https://github.com/yt-dlp/yt-dlp)，视频解码使用 [FFmpeg](https://ffmpeg.org/)。各工具采用各自的许可证；本项目的软件包包含插件运行代码和解析器准备工具。

## 支持项目 / Support

[GitHub Sponsors](https://github.com/sponsors/Tests4gptplay) · [Ko-fi](https://ko-fi.com/kou392350) · [Patreon](https://www.patreon.com/cw/Kou848) · [爱发电 / Afdian](https://afdian.com/a/kkt_ifd1) · [支付宝 / Alipay](SPONSOR.md)


逐项查验：[用例步骤、预期、实际结果与公开证据](docs/testing/CASEBOOK.md)。
