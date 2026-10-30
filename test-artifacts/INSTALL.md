# Video Vision 候选安装

候选版本 `0.9.3-audit.6`，尚未作为正式 Release 发布。安装本目录 [dsh-video-vision-0.9.3-audit.6-copyclarity.tgz](dsh-video-vision-0.9.3-audit.6-copyclarity.tgz)。

SHA-256：`27e3fa6b3cf452c5c2dedd1834969f0aca706f34da8567b88d4b62b221ea74c9`

DSH Desktop：插件 → 添加插件，填写下载后的 `.tgz` 完整本地路径。Web 在自己的对应profile执行：

```bash
dsh plugin --profile web add '/完整路径/dsh-video-vision-0.9.3-audit.6-copyclarity.tgz'
```

正常重新加载插件。依赖与功能说明见[README](../README.md)。

## 采用现有云端证据

本包与已完成云端验收的冻结包仅README、package.description和两条中英文介绍文字不同；其余42文件完全一致，client去除这两条文字后字节一致。版本、index运行身份、ui17显示均为audit.6；纯文案不要求重跑功能。

[云端验收](../docs/testing/ACCEPTANCE.md)的已过结果直接采用，不要求本机再做整套。后续仅补实际需实机验证的操作系统绑定、DSH Desktop挂接、真实识别提供方等报告列明范围；若改功能，仅回归受影响项。不要把独立Electron组件当成实际Desktop已验收。

下一步见[实机验证要求](../docs/testing/LOCAL-VALIDATION.md)，已完成云端结果直接采用。
