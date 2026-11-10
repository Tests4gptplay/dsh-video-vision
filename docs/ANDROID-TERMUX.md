# Android / Termux：Video Vision 附件接入

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
