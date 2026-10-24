# DSH Video Vision

**让 DSH 中的 AI 直接看视频。**

发送 B 站、YouTube 等视频网站的链接，AI 就能获取视频画面、定位具体片段，并结合字幕理解内容，省去手动下载再上传视频的步骤。适合一起看教程、讨论作品、分析演示过程，以及回到某个时间点细看画面。

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
> 接着往下看。

## 视频来源

- **Bilibili**：视频链接、BV 号、b23.tv 分享短链和分 P 视频，使用内置接口。
- **YouTube 与其他视频网站**：优先复用已保存的站点解析方法；遇到新站点时，AI 可按插件提供的指导，使用当前宿主的网页、浏览器和脚本工具探索方法，跑通后保存为扩展。
- **备用解析器**：保留 [yt-dlp](https://github.com/yt-dlp/yt-dlp)，可通过 `resolver: "yt-dlp"` 处理 YouTube、Vimeo、Dailymotion 等视频。上游覆盖范围见[站点目录](https://github.com/yt-dlp/yt-dlp/blob/master/supportedsites.md)。
- **媒体直链与本地视频**：支持站点扩展或备用解析器可读取的 HTTP(S) 媒体链接，以及本地视频文件。

使用 yt-dlp 备用方式时，需要登录的视频可在配置中指定自己提供的 cookie 文件，网络代理可通过 `proxy` 设置。直播内容使用已结束的回放链接。

## 它怎样给 AI 接上视频视觉

插件获取视频，将带时间戳的画面通过 DSH 原生图片附件交给当前 AI 模型。AI 先看全片概览，再按时间区间或精确时间点查看细节；字幕与片段语音转写补充画面信息。

- **链接直接观看**：发送视频链接即可开始。
- **按时间细看**：指定片段或时间点，查看动作变化、界面和屏幕文字。
- **接续观看**：保存观看位置，下一次从上次进度继续。
- **字幕与转写**：读取平台字幕，也可复用 DSH 已准备好的语音识别器转写短片段。
- **本地缓存**：已打开的视频和画面可以重复使用。
- **方法积累**：保存站点解析代码和实践笔记，下次直接复用，不必每次重新探索。

每批默认提供 6 张画面，默认上限 12 张。细看快速变化的内容时，可以缩短时间区间、增加画面数量。

## 安装和升级

DSH Desktop：打开 **插件 → 添加插件**，粘贴以下 GitHub 来源：

```text
github:Tests4gptplay/dsh-video-vision#v0.5.1
```

安装并启用 `video-vision` 后，重新加载插件或重启 DSH，在新的请求中发送视频链接即可。

Web 版安装命令：

```bash
dsh plugin --profile web add 'github:Tests4gptplay/dsh-video-vision#v0.5.1'
```

Web 与 Desktop 分别安装。[GitHub Releases](https://github.com/Tests4gptplay/dsh-video-vision/releases/latest) 同时提供备用 `.tgz` 软件包。`v0.5.1` 是固定版本来源，后续更新使用新的版本号。

### 运行依赖

使用 Node.js 22+（可使用 DSH 自带版本），并将 FFmpeg 与 ffprobe 所在目录加入 PATH，或在插件配置中填写两个程序的路径。

只有选择 yt-dlp 备用方式时，插件才准备这项依赖：优先使用已配置或现有的解析器；缺少可用程序时自动下载官方版本，核对 SHA-256 后保存在用户目录的 `.dsh/tools/dsh-video-vision` 中。已经安装 yt-dlp 时，可填写 `ytDlpPath` 使用自己的解析器。B 站内置方法、本地视频和自定义站点扩展不依赖 yt-dlp。

### 升级与已有缓存

已安装 `dsh-video-vision` 时，使用上述来源更新，保留原来的插件配置和缓存目录。

从早期不同包名的版本迁移时，先记下缓存目录与自定义工具路径，停用并卸载旧包，再安装新版。在“视频视觉”中选择原缓存目录，并填回原来的工具路径，即可继续使用已有视频、画面和观看进度。

yt-dlp 处理 YouTube 时使用 Node.js 运行播放器解析逻辑；官方 yt-dlp 可执行文件内含所需的 EJS 脚本。插件会使用当前 Node.js 路径，也可通过 `nodePath` 指定。详见上游 [EJS 文档](https://github.com/yt-dlp/yt-dlp/wiki/EJS)。

## 设置与缓存管理

打开 DSH **设置 → 视频视觉**：

- **方法文件夹**：点击“设置缓存目录”同一行的“方法文件夹”，打开保存方法指导、站点解析扩展和笔记的独立目录。
- **存储位置**：点击“设置缓存目录”，在系统目录选择窗口中选择文件夹。已有视频、画面和观看进度会一起迁移，新位置立即生效。
- **当前占用**：查看缓存大小、条目数和画面数，可直接打开缓存文件夹。
- **缓存列表**：按标题、平台或视频 ID 搜索，跳转原视频、打开单项目录、提取视频或删除该项缓存。
- **提取与保存**：点击“提取视频”或单文件“提取”，直接弹出 Windows 另存为窗口，选择文件名和位置；覆盖同名文件由系统窗口确认。第一栏的“打开缓存文件夹”打开上方显示的缓存目录，新缓存的视频按条目保存在其中的 videos 子目录。
- **清空缓存**：确认后清理列表中的全部缓存，保留已提取文件、本地原视频以及目录中的其他文件。

文件夹入口每次点击都会将对应窗口带到前台，关闭后可以再次打开。视频任务运行时仍可打开文件夹和提取文件；迁移和删除在任务完成后操作。B 站分离音视频的缓存会标明视频轨，独立音频可从文件列表提取。

## 可积累的解析方法

默认配置文件夹是 `%USERPROFILE%\.dsh\video-vision`；设置了 `DSH_HOME` 时位于 `%DSH_HOME%\video-vision`，也可通过 `configDirectory` 指定绝对路径。

```text
video-vision/
  GUIDANCE.md                 # 按需给 AI 的探索与验证指导
  README.md                   # 目录用途
  resolvers/
    README.md                 # 可执行扩展接口
    example.mjs.txt            # 不自动执行的模板
    your-site/
      manifest.json           # 匹配主机、路径与启用状态
      resolve.mjs             # 站点解析与下载代码
  notes/                      # 经过实践的方法笔记
```

每次调用工具，返回值都会带上 `method_guidance`：指导文件路径、`methods` 读取入口和使用时机。完整指导只在需要时读取。打开视频先复用缓存和现有方法；需要补充方法时，工具返回 `needs_method`，AI 再调用 `methods` 读取指导。新扩展先明确试用，通过实际视频解码和画面检查后启用，下一次请求即可使用，无需重装。

站点扩展是本机执行的 JavaScript，由 AI 使用宿主已有的文件工具保存。应只启用自己编写或确认过的代码；方法和笔记保存可复用步骤，不保存 Cookie、Token 或临时签名媒体地址。配置目录与安装目录、视频缓存分开，插件只补齐缺失的说明文件，保留已有编辑和扩展。

## 工具

插件提供 `video_vision` 工具：

| action | 用途 |
| --- | --- |
| `open` | 打开视频链接、BV 号或本地文件，获取画面概览 |
| `watch` | 查看指定区间或精确时间点；省略起点时接着上次进度 |
| `transcript` | 读取平台字幕及其时间点 |
| `transcribe` | 使用 DSH 语音识别器转写指定短片段 |
| `status` | 查看当前视频、缓存、配置目录和语音识别状态 |
| `methods` | 按需读取方法指导，列出站点扩展及其路径和错误 |

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
# cookieFile: 'D:\Private\video-cookies.txt'
# proxy: 'http://127.0.0.1:7890'
```

默认使用当前会话工作目录的 `.dsh-video-vision`；设置页显示最近使用的视频会话缓存位置，尚未观看时使用 DSH 默认工作目录。可在设置页改为固定的绝对路径，让各会话共享同一缓存位置。`maxHeight` 是优先选择的清晰度，结果会列出实际分辨率。`maxDownloadMB` 设置文件大小预算，`downloadTimeoutMs` 设置解析或下载单次任务的最长时间。

字幕优先使用平台提供的人工字幕，其次使用自动字幕，结果标明语言和来源。使用语音转写前，在 DSH 的语音设置中准备好识别器，默认使用 `sensevoice-local`。转写以短片段为单位，默认每段最长 60 秒。

## 命令行与开发

命令行与插件共用视频处理流程，输出画面路径和结构化结果：

```powershell
node bin/video-vision.mjs methods --source "https://www.youtube.com/watch?v=视频ID"
node bin/video-vision.mjs open --source "https://www.youtube.com/watch?v=视频ID" --resolver yt-dlp --frames 6
node bin/video-vision.mjs watch --timestamps 12,45,120
node bin/video-vision.mjs transcript
node bin/video-vision.mjs --help
```

可用 `--cwd` 指定工作目录，`--cache` 指定缓存位置，`--config-directory` 指定持久化扩展目录，`--ytdlp`、`--ffmpeg` 和 `--ffprobe` 指定程序路径，`--output` 保存 JSON 结果。Ctrl+C 取消当前任务。

```powershell
npm test
```

## License

[MIT](LICENSE) · Tests4gptplay

备用解析使用独立安装的 [yt-dlp](https://github.com/yt-dlp/yt-dlp)，视频解码使用 [FFmpeg](https://ffmpeg.org/)。各工具采用各自的许可证；本项目的软件包包含插件运行代码和解析器准备工具。
