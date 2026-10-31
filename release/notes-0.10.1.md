## Video Vision 0.10.1

## 安装与升级 / Install and update

### 中文

推荐安装来源（可直接复制到 DSH 的“包名或地址”）：

```text
github:Tests4gptplay/dsh-video-vision#v0.10.1
```

也可使用本次正式安装包：[dsh-video-vision-0.10.1.tgz](https://github.com/Tests4gptplay/dsh-video-vision/releases/download/v0.10.1/dsh-video-vision-0.10.1.tgz)。下载后无需解压；可填本机 TGZ 完整路径或上述下载地址。[SHA-256 校验文件](https://github.com/Tests4gptplay/dsh-video-vision/releases/download/v0.10.1/SHA256SUMS-0.10.1.txt)：

```text
ad30f5f225459af0b38bcf59e690eae9767ee5aee5ff0e3a7c0ff0098515faf7  dsh-video-vision-0.10.1.tgz
```

**DSH Desktop**
1. 打开侧栏 **插件 → 添加插件**，或箭头菜单中的 **安装第三方插件**。
2. 在 **包名或地址** 填入上面的 GitHub 来源、TGZ 下载地址，或运行 DSH 电脑上的 TGZ 完整路径。
3. 点击 **安装**，确认版本为 **0.10.1**，然后 **立即启用**。

**已有版本升级**：同样填写本版来源，安装成功后确认版本并启用。保留设置、登录态、缓存、观看进度与用户文件；不要手动删除目录。若宿主提示已安装或要求先卸载，只按提示处理对应插件条目；是否重启以 DSH 提示为准。

**DSH Web**：先停止对应 profile，在服务所在环境执行，成功后重启（profile 名不是 `web` 时换成实际名称）：

```sh
dsh plugin --profile web add 'github:Tests4gptplay/dsh-video-vision#v0.10.1'
```

Desktop 与 Web 分别安装。运行依赖与平台条件见 [README](https://github.com/Tests4gptplay/dsh-video-vision/blob/v0.10.1/README.md)；曾安装旧宿主桥的用户参阅[一次性退出说明](https://github.com/Tests4gptplay/dsh-video-vision/blob/v0.10.1/docs/testing/LEGACY-EXIT.md)，已完成者不必重复。

### English

In **DSH Desktop → Plugins → Add plugin** (or **Install third-party plugin**), paste the GitHub source above into the package/address field. Alternatively, use the linked release TGZ URL or its full local path on the DSH computer; do not unpack it. Install, verify **0.10.1**, and enable the plugin.

To update, install from this version's source and verify the enabled version. Preserve settings, imported login state, cache, viewing progress and user files; do not manually delete directories. If DSH requires removal of the existing plugin entry, follow its prompt for that entry only. Restart only as requested by DSH.

For **DSH Web**, stop the relevant profile, run the command above in the server environment (replace `web` with the actual profile name if different), then restart. Desktop and Web installations are separate. Verify the downloaded archive against the SHA-256 value above. See the linked README for dependencies/platform requirements and the legacy-exit guide only if applicable.


多站点在线视频与本地视频分析：结合时间戳画面、音频、字幕与语音转写，支持接续观看、积累站点解析方法、导入登录态、管理缓存与提取保存。

### 新功能与改进
- 统一浏览器登录态采集与加密保存。普通 Chrome 可通过微软官方商店扩展、由用户确认连接后导入；保留已有浏览器连接支持，日常读取保存副本不要求浏览器常开。
- 导入等待状态可在设置重开后恢复，并可准确取消显示的那次导入；必要时只检查选定来源，不后台扫描其他浏览器。
- 新配置不默认限制源视频高度；已有高度上限可在界面修改。AI 可用 `open` 的 `refresh` 和单次 `max_height` 参数更新旧缓存，不必先删缓存、不改全局设置。
- 新媒体成功校验后整项替换，避免混用旧帧、音轨或转写；采集失败保留旧缓存与进度。文件时长与实际分析范围分别报告。
- 修复来源名称中英切换、清理登录态后的界面跳动、等待状态与取消归属；公开提示使用 Video Vision 全称。

### 兼容性说明
删除向 DSH 内置浏览器同步登录态的旧功能，因为当前宿主没有提供对应的合法插件导入接口。保留从用户浏览器导入、加密保存及本插件带登录态的请求。清理登录态不退出源浏览器或 DSH 内置浏览器，也不删除媒体缓存。旧宿主桥安装请按[独立一次性退出说明](https://github.com/Tests4gptplay/dsh-video-vision/blob/v0.10.1/docs/testing/LEGACY-EXIT.md)处理，已完成者不必重复。

站点可用质量、字幕和识别结果取决于源站及已准备的识别器，不保证所有站点或所有平台已实测通过。[安装与使用](https://github.com/Tests4gptplay/dsh-video-vision/blob/v0.10.1/README.md) · [验证范围](https://github.com/Tests4gptplay/dsh-video-vision/blob/v0.10.1/docs/testing/RELEASE-0.10.0.md)

### English summary
Analyze multi-site online and local video with timestamped frames, audio, captions and speech transcription; resume viewing, reuse site methods, import encrypted browser-session copies, and manage or export cached media. This release unifies browser-session handling, supports user-confirmed Chrome extension imports, restores pending-import UI with scoped cancellation, fixes localized source labels, and adds explicit cache refresh with per-request source-height selection. Acquisition failures retain prior cached media and progress; successful replacement discards stale derived data. The unsupported built-in-browser session synchronization path is removed, not browser-session import itself. See the linked verification scope; cross-platform availability is not a claim of universal real-device validation.

## 0.10.1 追加修复 / Additional fix

- 修复接近满幅的音频在峰值、响度等结果中产生负零，导致宿主以 `value is not lossless JSON` 拒收整个工具结果的问题。保持原有分析精度和功能，无需关闭音频分析。新增边界回归；真实视频30秒与60秒音频范围通过官方无损JSON校验组件。`watch` 自动音频仍最多30秒，较长范围用 `audio`。
- Fix near-full-scale audio measurements returning negative zero and causing the host to reject the entire tool result as non-lossless JSON. Existing features and precision are unchanged. Added boundary regression coverage; real-video 30-second and 60-second audio ranges passed the official lossless-JSON component. `watch` still limits automatic audio to 30 seconds; use `audio` for longer ranges.
