from pathlib import Path
import json

root = Path('.')
version = '0.10.2'
package = json.loads(Path('package.json').read_text())
assert package['name'] == '@tests4gptplay/dsh-video-vision'
assert package['version'] in ('0.10.2-review.7', version)
package['version'] = version
if 'CHANGELOG.md' not in package['files']:
    package['files'].append('CHANGELOG.md')
Path('package.json').write_text(json.dumps(package, ensure_ascii=False, indent=2) + '\n')
lock = json.loads(Path('package-lock.json').read_text())
lock['version'] = version
lock['packages']['']['version'] = version
Path('package-lock.json').write_text(json.dumps(lock, ensure_ascii=False, indent=2) + '\n')
for file in ['index.js', 'client.js']:
    p = Path(file)
    text = p.read_text()
    assert '0.10.2-review.7' in text or version in text
    p.write_text(text.replace('0.10.2-review.7', version))
assert 'sampled_range_seconds: frames.length ? [start, end] : null' in Path('index.js').read_text()
for p in [Path('docs/TECHNICAL-REFERENCE.md'), *Path('resources').rglob('*.md')]:
    if p.exists():
        text = p.read_text()
        p.write_text(text.replace('0.10.2-review.7', version).replace('0.10.2-review.6', version))

Path('README.md').write_text('''# DSH Video Vision

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
''', encoding='utf-8')

notes = '''# Video Vision 0.10.2

## 安装 / Install

在 DSH 的「包名或地址」中输入：

```text
@tests4gptplay/dsh-video-vision@0.10.2
```

或使用固定 GitHub 版本：

```text
github:Tests4gptplay/dsh-video-vision#v0.10.2
```

## 新功能与修复

- 精确时间点去重、单帧和零帧音频请求；明确指定的多帧数量按请求处理。
- 明确的音频分析区间完整覆盖，音频事件支持完整输出。
- 按 DSH 当前附件规格生成可交付图片，保留源缓存；附件失败或取消时保留原观看进度。
- 修复零帧结果误报视频末帧范围：没有画面时 sampled_range_seconds 为 null。
- 更新站点方法指导、源清晰度与缓存说明，保留登录态导入、缓存提取和接续观看。

## 实机验证

2026-11-10，Windows / DSH Desktop 0.2.2-rc.1，运行候选 0.10.2-review.7：

| 操作 | 观察结果 |
|---|---|
| 零帧＋音频 | 视觉范围 null、无图片附件，实际音频区间 20–35 秒 |
| 零帧＋关闭音频 | 视觉范围 null、无图片附件，音频 not-requested |
| 两个精确时间点 | 1.25、3.5 秒两张图片通过 DSH 工具链交给模型读取 |
| 多帧 | 0–60 秒的 20 张图片返回，首尾画面可读 |
| 音频区间 | 请求 15–75 秒，60 秒信号分析及完整识别窗口 |
| 音频事件 | 254 个起音事件全部返回，未截断 |
| 缓存与续播 | 缓存命中；从 60 秒继续到 65 秒；无音轨素材正常取图 |

验收按工具呈现接口判断：内部 frames 数组渲染为独立画面文字和图片内容块；零帧检查视觉范围为 null、没有画面内容块及图片附件。音频识别测试记录调用和区间覆盖，文本质量以所选识别器和素材的实际结果为准。

自动化检查在本次正式发布工作流执行，日志和产物见 [GitHub Actions](https://github.com/Tests4gptplay/dsh-video-vision/actions/workflows/release-0.10.2.yml)。此前的 [DSH 附件及插件联合验收](https://github.com/Tests4gptplay/dsh-video-vision/actions/runs/42785690042)覆盖真实附件服务、保存读回、模型适配、安装包与 TypeScript 编译。

## Android / Termux

[Issue #2](https://github.com/Tests4gptplay/dsh-video-vision/issues/2) 的 DSH 附件发布修复和 [Issue #3](https://github.com/Tests4gptplay/dsh-video-vision/issues/3) 的 sharp WASM 接入随本次发布提供独立资产与[安装指导](https://github.com/Tests4gptplay/dsh-video-vision/blob/v0.10.2/docs/ANDROID-TERMUX.md)。Android 12 / API 31 普通应用 UID 的目录访问及重命名操作、sharp WASM 图像处理均已有 [Actions 验证](https://github.com/Tests4gptplay/deepseek-harness/actions/runs/42773928285)。

## English

This release improves exact-frame sampling, audio-only and explicit multi-frame requests, complete requested audio coverage, host-compatible image delivery and viewing-progress consistency. Zero-frame results now report a null visual range. The Windows acceptance run verified readable model image attachments, 20-frame sampling, 60-second audio analysis, all detected events, cache reuse and resumed viewing. Android/Termux attachment fixes and sharp WASM setup are provided separately for the DSH host component.

[使用说明](https://github.com/Tests4gptplay/dsh-video-vision/blob/v0.10.2/README.md) · [捐赠支持](https://github.com/Tests4gptplay/dsh-video-vision/blob/v0.10.2/SPONSOR.md)
'''
Path('docs/releases').mkdir(parents=True, exist_ok=True)
Path('docs/releases/v0.10.2.md').write_text(notes, encoding='utf-8')
Path('CHANGELOG.md').write_text('''# Changelog

## 0.10.2 — 2026-11-10

精确取帧与去重、零帧音频、多帧请求、完整音频区间及事件、DSH 原生图片附件适配、观看进度与缓存一致性。修复零帧视觉采样范围误报。

[完整更新与测试结果](https://github.com/Tests4gptplay/dsh-video-vision/blob/v0.10.2/docs/releases/v0.10.2.md)

[0.10.1 历史发行](https://github.com/Tests4gptplay/dsh-video-vision/releases/tag/v0.10.1)
''', encoding='utf-8')
Path('docs/ANDROID-TERMUX.md').write_text('''# Android / Termux：Video Vision 附件接入

Video Vision 的图片由 DSH 附件组件保存。Android 12 / Termux 的目录权限、硬链接和 sharp 后端问题对应 Issue #2 和 #3。

## DSH 0.2.2-rc.1 源启动环境

附件存储修复位于 [DSH fork 提交 aa0d59b](https://github.com/Tests4gptplay/deepseek-harness/commit/aa0d59b6a095cae326e69ba59e2fe0a1a3c3b208)。该修改在系统祖先目录仅可穿越时保留可用路径；硬链接不可用时以已完成并同步的临时文件重命名发布。

[本版 Release](https://github.com/Tests4gptplay/dsh-video-vision/releases/tag/v0.10.2) 同时提供源码补丁和独立 DSH 附件组件候选包 `deepseek-ai-dsh-attachment-local-0.2.2-rc.1.termux.1.tgz`。它对应 DSH 0.2.2-rc.1 的宿主附件模块，与 Video Vision 插件分别安装。宿主通过其原有模块配置加载此包，源码启动环境可应用同页补丁并编译附件模块。

在实际 DSH 源工作区和运行 profile 中准备与 sharp 版本匹配的 WASM 后端。DSH 0.2.2-rc.1 使用 sharp 0.35.5：

```sh
# 在 DSH 源工作区执行
pnpm add -w --save-exact @img/sharp-wasm32@0.35.5
# 在实际运行的 DSH profile 中执行
pnpm add --save-exact @img/sharp-wasm32@0.35.5
```

完成后重启对应 DSH 进程，取一帧确认附件可保存、读回并在对话中显示。已有本地修改先保留，对照补丁合并。

## 验证记录

- [DSH 附件模块回归与编译](https://github.com/Tests4gptplay/deepseek-harness/actions/runs/42773928147)。
- [Android 12 / API 31 普通应用 UID、SELinux Enforcing 文件系统操作与 sharp WASM](https://github.com/Tests4gptplay/deepseek-harness/actions/runs/42773928285)。
- [Video Vision 与 DSH 附件实际依赖、源码和安装包联合测试](https://github.com/Tests4gptplay/dsh-video-vision/actions/runs/42785690042)。

手机使用结果可继续在 [Issue #2](https://github.com/Tests4gptplay/dsh-video-vision/issues/2) / [Issue #3](https://github.com/Tests4gptplay/dsh-video-vision/issues/3) 附上具体 DSH 版本和报错。
''', encoding='utf-8')
print('Prepared version', version)
