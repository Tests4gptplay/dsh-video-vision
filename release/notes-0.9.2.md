# DSH Video Vision 0.9.2

- 设置页、状态提示、确认框和系统文件窗口补齐英文适配。
- 增加 Linux/macOS 浏览器发现与直接登录态导入、系统密钥存储适配；多个来源可选择并独立保存。
- 增加 Linux/macOS 文件夹选择和另存为适配。
- 修复视频完整时长、短片和低帧率视频的尾点取帧。
- 修复临时存储错误后的重试、文件窗口取消提示，以及同步路径资源的处理。

安装来源：`github:Tests4gptplay/dsh-video-vision#v0.9.2`

运行依赖与平台说明见 [README](https://github.com/Tests4gptplay/dsh-video-vision#readme)。Linux 文件窗口需要 Zenity 或 KDialog，加密存储需要 Secret Service。macOS 实机验证待补，内置浏览器共享尚未适配。

[验证记录](https://github.com/Tests4gptplay/dsh-video-vision/blob/main/docs/testing-0.9.2.md)
