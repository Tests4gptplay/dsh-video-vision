# DSH Video Vision

**让 AI 结合画面、声音和字幕，观看、理解并保存多站在线视频与本地视频。**

当前正式版 **0.10.2** · [更新记录与测试结果](https://github.com/Tests4gptplay/dsh-video-vision/blob/v0.10.2/docs/releases/v0.10.2.md) · [GitHub Release](https://github.com/Tests4gptplay/dsh-video-vision/releases/tag/v0.10.2)

## 0.10.2 带来了什么

- **更自由的取帧**：按精确时间点或时间段查看画面，重复时间点只解码一次；支持单帧、零帧音频请求和明确指定的多帧数量。
- **完整的音频区间**：默认六帧、30 秒音频用于快速概览；明确指定的音频范围完整处理，可返回全部检测事件并继续语音转写。
- **适配实际图片接口**：保留原始缓存画面，按运行中的 DSH 附件规格生成交付副本；图片真正保存并返回给模型后再推进观看进度。
- **准确的覆盖信息**：画面采样、音频分析与视频总时长分别报告。没有取帧时，视觉采样范围为 `null`；到达末尾时保持正确的观看进度。
- **保留熟悉的工作方式**：接续观看、站点方法、用户授权的登录态导入、缓存管理和提取保存继续使用。

详细改进、测试环境和结果见[本版更新页](https://github.com/Tests4gptplay/dsh-video-vision/blob/v0.10.2/docs/releases/v0.10.2.md)。

## 安装与升级

在 **DSH → 插件 → 添加插件 → 包名或地址** 中输入任一地址：

```text
@tests4gptplay/dsh-video-vision@0.10.2
```

```text
github:Tests4gptplay/dsh-video-vision#v0.10.2
```

安装后启用，确认设置页和 `video_vision status` 显示 **0.10.2**。正式包名为 `@tests4gptplay/dsh-video-vision`，插件入口身份保持 `video-vision`。

已有版本使用上述新地址升级，保留设置、已导入登录态、缓存、观看进度和个人方法。若旧的非 scoped 安装条目仍启用，请通过 DSH 插件管理停用旧条目并启用新包；保留用户数据，无需手动清空目录。重启按宿主提示进行。

DSH Web 在停止对应 profile 后执行，再启动：

```sh
dsh plugin --profile web add '@tests4gptplay/dsh-video-vision@0.10.2'
```

Desktop 与 Web 分别安装。也可使用 [Release 中的安装包与 SHA-256](https://github.com/Tests4gptplay/dsh-video-vision/releases/tag/v0.10.2)。

## 直接这样使用

在 DSH 选择支持工具调用与图片输入的模型，然后告诉它：

> 看一下这个视频：〈视频链接或本地文件路径〉，结合画面和声音介绍内容。
>
> 细看 50 到 80 秒，按时间说明画面变化。
>
> 读取 1.25 秒和 3.5 秒的两张画面。
>
> 只分析 20 到 35 秒的音频，不取图片。
>
> 接着往下看，并把视频保存到我选择的位置。

工具名为 `video_vision`，支持 `open`、`watch`、`audio`、`transcript`、`transcribe`、`status` 和 `methods`。Bilibili、YouTube 等为站点示例；媒体直链、本地文件和站点解析方法同样可用。

## 登录态、清晰度与缓存

在 **设置 → 视频视觉** 管理：

- **浏览器登录态**：选择来源，由用户在浏览器确认连接后导入，加密保存。以后按需刷新，来源浏览器可关闭。取消导入保留已有副本；清理仅处理本插件的登录态副本。
- **源视频清晰度**：`0` 表示不设置源高度上限；正数使用用户设置的高度上限。已有缓存通过 `open` 的 `refresh=true` 更新，可附带本次 `max_height`；新媒体成功后替换，失败保留旧缓存。
- **缓存和提取**：选择目录、查看占用、搜索、打开文件夹、提取视频或单文件。已就绪的独立音轨可合并保存；个人方法与笔记随升级保留。

## 运行环境

Node.js 22+（可使用 DSH 自带版本），FFmpeg 与 ffprobe 位于 PATH 或在插件设置中指定。语音转写使用 DSH 已准备的识别器；平台字幕、语音识别和画面文字分别标明来源。登录态加密使用操作系统凭据服务；Linux 使用 Secret Service，系统文件选择使用 Zenity 或 KDialog。

Android/Termux 的附件发布及 sharp 后端接入说明见[Android 指南](https://github.com/Tests4gptplay/dsh-video-vision/blob/v0.10.2/docs/ANDROID-TERMUX.md)，其中提供 DSH 附件组件补丁、对应安装资产和匹配的 WASM 依赖。

参数、站点方法和目录说明见[技术参考](https://github.com/Tests4gptplay/dsh-video-vision/blob/v0.10.2/docs/TECHNICAL-REFERENCE.md)。曾安装旧宿主桥的用户可参阅[一次性退出说明](https://github.com/Tests4gptplay/dsh-video-vision/blob/v0.10.2/docs/testing/LEGACY-EXIT.md)。

## English overview

Video Vision brings timestamped video frames, audio analysis, captions and speech transcription to DSH. Version **0.10.2** supports exact and repeated timestamps, single-frame and audio-only requests, explicit multi-frame batches, complete requested audio intervals, and image delivery adapted to the active DSH attachment service. Original cached media, viewing progress, browser-session imports and saved site methods are retained.

Install `@tests4gptplay/dsh-video-vision@0.10.2` or `github:Tests4gptplay/dsh-video-vision#v0.10.2` in DSH's package/address field. Verify version 0.10.2 after enabling. See the [release and verification page](https://github.com/Tests4gptplay/dsh-video-vision/blob/v0.10.2/docs/releases/v0.10.2.md) and [Android/Termux setup](https://github.com/Tests4gptplay/dsh-video-vision/blob/v0.10.2/docs/ANDROID-TERMUX.md).

## License

[MIT](LICENSE) · Tests4gptplay. Video decoding uses [FFmpeg](https://ffmpeg.org/); the optional anonymous resolver uses a separately installed [yt-dlp](https://github.com/yt-dlp/yt-dlp). Each tool retains its own license.

## 支持项目 / Support

感谢支持 Video Vision 的开发与维护。[捐赠页 / Donation page](https://github.com/Tests4gptplay/dsh-video-vision/blob/v0.10.2/SPONSOR.md) · [Ko-fi](https://ko-fi.com/kou392350) · [支付宝 / Alipay](https://github.com/Tests4gptplay/dsh-video-vision/blob/v0.10.2/SPONSOR.md#alipay--支付宝) · [GitHub Sponsors](https://github.com/sponsors/Tests4gptplay)
