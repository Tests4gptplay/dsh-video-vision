# Video Vision 技术与扩展参考

本文面向站点方法作者、开发者和高级配置使用者。普通安装与使用见 [README](../README.md)。

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

`tempo` 是起音包络的脉冲速度估计，返回候选 BPM 和周期性分数；与 `prominent_onsets_seconds` 一起辅助卡点。没有稳定脉冲时 BPM 返回 null。音频分析详见 [音频使用指导](../resources/audio.md)。

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


## 登录态实现与测试

- [登录态实现边界](testing/PLAYWRIGHT-ADAPTER-WORKING.md)
- [本候选验证及剩余实机范围](testing/PLAYWRIGHT-CANDIDATE-3.md)
- [旧宿主桥一次性退出](testing/LEGACY-EXIT.md)
- [全量覆盖记录](testing/FULL-COVERAGE.md)
- [历史测试用例](testing/CASEBOOK.md)

## 显式重新获取与单次清晰度

`open` 默认复用缓存。需要内容更新或画质升级时传 `refresh: true`；可传 `max_height: 1080`（仅本次采集上限，0 不限），不修改全局配置。以返回的实际 `resolution` 和 `cache.state` 为准。采集成功后整项替换；提交前失败或取消保留原缓存与进度，提交后取消不撤回已完成的替换。

`duration_seconds` 是实际文件时长，`source_reported_duration_seconds` 仅有真实源元数据时提供；画面 `sampled_range_seconds` 与音频 `analyzed_range_seconds` 单独表示分析范围，未知源时长不是完整性证明。
