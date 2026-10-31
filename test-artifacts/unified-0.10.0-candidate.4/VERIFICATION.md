# Video Vision candidate.4 定向验证

实际生产 TGZ 解包后执行以下 15 个脚本，全部通过；未将它们计作旧候选全量实机复测。

- `ui-locale.mjs`：PASS
- `browser-ui.mjs`：PASS
- `cdp-ui.mjs`：PASS
- `native-ui.mjs`：PASS
- `platform-native-ui.mjs`：PASS
- `audit-source-resolution.mjs`：PASS
- `audit-budget-recovery.mjs`：PASS
- `browser-session.mjs`：PASS
- `cdp-session.mjs`：PASS
- `session-concurrency.mjs`：PASS
- `snapshot-transactions.mjs`：PASS
- `playwright-capture.mjs`：PASS
- `playwright-no-confirm-cancel.mjs`：PASS
- `import-operation-cancel.mjs`：PASS
- `session-no-auto-import.mjs`：PASS

45 个包内文件与源码逐字节一致，版本与 Markdown 本地链接检查通过。包内没有旧宿主桥、安装器或独立退出工具。

协议、存储及网络边界采用合成数据；官方 core 无确认取消测试拦截浏览器启动，不安装扩展、不读取真实登录态。未新增真实机器通过声明。普通观看弹授权页根因仍未确定。
