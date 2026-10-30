# 0.10.0-candidate.1 全量候选验收

本地云草稿，尚未提交远端/正式tag/npm市场。基线 `cde7de6d8a83695291b7c6492805fe04d442f5c0` 已含最新 main `507d5874a2a27a7f01b8fa6e98679b6256dc2582`；不回退其文档新增。前一包0.9.3-audit.6留作历史证据，不是新运行fallback。

## 变更

- Windows/Linux/macOS 统一实际 CDP→加密快照→URL过滤→VV HTTP；不只是包住两套旧实现。
- 用户明确保留保存副本方案：只有导入/刷新需开来源浏览器，日常HTTP不要求它常开。没有实现实时Cookie链接方案。
- 官方rc.5插件链未公开合法Cookie/session导入接口，故删除向内置浏览器同步。无内置清理按钮，不触碰源浏览器/内置独立登录态。
- 清理仅VV活动登录态副本；关闭授权、取消读取和待提交导入，逐项报告失败，持久撤销失败残留读取。媒体缓存与人工备份不在范围。
- 显式选源、稳定资料身份、保留旧storageId密钥命名空间；未知旧来源不猜测迁移。empty/absent/read/decrypt失败及source不可用分开。
- 已装宿主hook/旧运行文件需独立一次性退出工具：[LEGACY-EXIT.md](LEGACY-EXIT.md)。插件升级本身不假称已移除宿主残留。旧safeStorage密文不伪装成keyring数据，不暗中迁移。

## 全量测试

以 [FULL-COVERAGE.md](FULL-COVERAGE.md) 原suite映射为准，执行 `npm test`。runner遇任何失败返回非零；官方Host pruner缺依赖明确not-run，不把可选遗漏涂成PASS。另在实际npm pack解包后的runtime中运行相同suite（只加入test文件，依赖从已安装同版本环境提供）；独立退出工具故意不在生产TGZ，不将其缺失当产品失败。

测试覆盖：正常视频/音频/字幕/继续观看/导出/缓存/解析扩展/预算与恢复/帧端点及高帧率/默认UI风格/双语/HTTP重定向及取消/多来源与重启/旧store映射/清理失败与并发/dispose/原生平台适配。真实第三方站点、真实GUI和真实OS keyring必须单列，不得用mock替代。

## 用户机器仍需验证（仅通过用户明确授权的本地执行流程）

1. 在旧宿主尚有hook时，先运行独立工具inspect。审核scope/hash后另行授权apply，按说明完全退出宿主；未知版本不尝试旧整asar覆盖。
2. 安装候选，Windows也应显示同一明确选源；选择实际登录的来源profile，导入并检查错误状态。不要用全站Cookie数量证明B站已登录。
3. 关闭来源浏览器，重启DSH；VV特定站点认证HTTP仍应使用保存副本（在站点未撤销/过期的前提下）。Bili此前失败根因未定，这一步不是声称根因已修。
4. 单一来源、多个来源、离线保存来源切回、源浏览器重启后刷新分别验证；不允许自动换源。
5. 对可删除的VV测试副本执行清理：确认授权关闭、无晚到导入重建、失败明确可重试；源Chrome和内置独立登录态、媒体缓存不受影响。不要删除私人人工备份。
6. 真实Windows Credential Manager/macOS Keychain/Linux Secret Service分别验证；合成依赖测试不能代替。

无真实用户Cookie被用于本轮云合成回归，不调用付费ASR。外站真实网络、免费官方ASR及账户接入结果另列证据，不把缓存继续读取写成新下载。

### 清理范围补充

本按钮清理活动登录态密文副本并停止读取，不等同于“擦除全部秘密”。系统密钥库中属于VV各storageId的随机AES加密键以及当前adapter中的键引用仍保留；键本身不含Cookie/账号信息，不能独立用于网站认证。保留键是为避免使用户明确保留的加密备份失去解密能力；没有枚举或删除其他系统凭据，也没有承诺安全内存擦除。另行彻底销毁密钥需明确知晓备份不可恢复的范围授权。

### 旧授权反弹修复

新版授权文件独立为 `vv-plugin-authorization-v1.json`，构造器加载true以及用户OFF/ON/清理都不改旧 `authorization.json`。真实旧基线protocol/snapshot的合成dispatch回归证明旧false仍disabled，新CDP/快照/HTTP正常。旧true保持不动；隔离不冒充旧runtime已停止，旧退出仍需独立工具。测试仅临时加载明确git基线旧模块且不start IPC，不将旧运行代码重新加入产品包。packed测试通过 `VV_LEGACY_TEST_SOURCE` 指定只读历史夹具仓库。
