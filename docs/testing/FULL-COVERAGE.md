# 全量测试覆盖清单

候选：`0.10.0-candidate.1`。基线 `cde7de6d8a83695291b7c6492805fe04d442f5c0` 已包含 main `507d5874a2a27a7f01b8fa6e98679b6256dc2582`。基线37套中7套专属旧IPC/同步/安装器测试随对应功能退出，其覆盖迁移见下表，不保留产品旧运行路径。保留30套并新增7套，共37套；聚合runner不重复计数。

环境：Linux云端、Node 24.22.1、ffmpeg 7.1.5。浏览器/密钥库和故障条件使用合成夹具；媒体编解码实际运行ffmpeg。真实网络与官方ASR另列，不能代替真实Windows/macOS或宿主GUI验收。

## 基线逐项映射

| 基线 suite（test/） | 本轮源码状态 | 实际覆盖/替代边界 |
|---|---|---|
| `audio.mjs` | PASS | 合成 PCM 与真实 ffmpeg；A/V、mock ASR、缓存、部分失败、取消、独立音轨 |
| `audit-audio-tail.mjs` | PASS | 音频末尾/极短区间、空/非法区间、恢复与摘要截断提示 |
| `audit-budget-recovery.mjs` | PASS | 下载/进程/解析器/音频预算、错误归因、恢复及取消 |
| `audit-budgets.mjs` | PASS | 显式预算、零值无限制、取消、无隐藏工具时限 |
| `audit-cache-recovery.mjs` | PASS | 损坏 manifest/下载恢复、权限失败保留、源文件不变 |
| `audit-frame-precision.mjs` | PASS | 真实 ffmpeg 100fps、VFR、非零开始、最终 PTS、像素参考与重试 |
| `audit-host-pruner.mjs` | PASS（源码+packed） | 已补装官方 @deepseek-ai/dsh-compaction-tool-result-pruner 0.0.1-rc.3，实际官方组件默认裁剪策略验证通过；非GUI |
| `audit-response-lifecycle.mjs` | PASS | 响应头后/流中撤权取消、EOF/cancel/error/null-body 清理、重定向 |
| `audit-service-locale.mjs` | PASS | 服务边界 zh/en、并发响应撤权、保留上游错误 identity |
| `audit-session-protocol.mjs` | 退役（不运行） | 旧 IPC framing/native pipe 已退出；其运行边界由 unified-runtime/browser-session/audit-response-lifecycle 覆盖；IPC特有大帧/拆包不再适用 |
| `audit-session-snapshot.mjs` | 退役（不运行） | 含旧 sync 执行，退役；空快照/失败保存由 unified-runtime、snapshot-recovery 覆盖；旧同步撤销缺陷仅独立退出说明，不保留旧代码 |
| `audit-theme.mjs` | PASS | 静态主题 token/CSS/原生 select；不是 computed style 或 GUI 验收 |
| `browser-session.mjs` | PASS | mock HTTP 授权、POST、跨域重定向、CDN 备用 URL |
| `browser-ui.mjs` | PASS | VM 导入/刷新状态与清副本确认/取消/部分失败/重试；无内置同步入口 |
| `cache.mjs` | PASS | 媒体缓存列表、提取、迁移、删除范围、busy、原文件与 RPC |
| `cdp-session.mjs` | PASS | 显式单/多来源、来源隔离、切换取消、离线保存与授权恢复 |
| `cdp-source.mjs` | PASS（契约修正后） | 稳定来源、显式选择、重启保存、无fallback、迟到结果/取消；新增字段按契约断言 |
| `cdp-ui.mjs` | PASS | VM Web/Desktop能力显示、来源选择、离线/重现、状态、本地化；非真实 GUI |
| `desktop-hook-upgrade.cjs` | 退役（不运行） | 旧hook升级/安装退役；替代 legacy-exit 的精确退出/拒绝测试 |
| `desktop-integration.mjs` | 退役（不运行） | 旧安装/自动恢复退役；替代 legacy-exit，包内入口清单另验 |
| `extensions.mjs` | PASS | 站点方法草稿/激活/修订、合成子进程、回退、指导文本持久化 |
| `frame-endpoints.mjs` | PASS | 真实 ffmpeg 时长端点、短片、低帧率、EOF 与非法区间 |
| `keyring-snapshot-dispatch.mjs` | PASS | mock keyring+真实快照核心导入/刷新、加密文件、重启、授权；无真实keyring |
| `keyring-storage.mjs` | PASS | mock 后端惰性初始化/nonce/篡改/AAD命名空间/并发prepare/无效key |
| `linux-default-browser.mjs` | PASS | 注入 XDG desktop/gio 元数据与argv；未启动浏览器 |
| `linux-discovery.mjs` | PASS | 注入proc同UID/主进程过滤、空格argv、Windows参数解析 |
| `linux-listener-discovery.mjs` | PASS（补传 root 重跑） | 注入proc LISTEN inode/IPv4/IPv6环回与排除通配/其他UID/renderer |
| `macos-discovery.mjs` | PASS | macOS适配合成发现；非真实macOS执行 |
| `native-session.mjs` | 退役（不运行） | 旧native-host/pipe/sync退役；HTTP/授权/重定向由 browser-session+unified-runtime；独立退出由 legacy-exit |
| `native-ui.mjs` | PASS | 方法文件夹RPC、宿主头部不改、原生picker保留；mock spawn |
| `platform-native-ui.mjs` | PASS | 各OS对话框argv/中英文/取消/错误/ENOENT fallback；非真实GUI |
| `prepare.mjs` | PASS | mock官方resolver资产/checksum/reuse/失败保留；未下载网络资产 |
| `smoke.mjs` | PASS | 站点URL、字幕、流选择、时间采样、渲染、工具注册、转写区间 |
| `snapshot-recovery.cjs` | PASS（5/5） | 暂时存储/解密失败恢复、缺失、损坏状态、撤权；文件原样保留且无隐式写入 |
| `snapshot.mjs` | 退役（不运行） | 旧快照pipe/sync混合suite退役；CDP与快照用 cdp-session、keyring-snapshot-dispatch、unified-runtime |
| `sync-concurrency.cjs` | 退役（不运行） | 旧同步执行并发suite退役；不重新维护已删功能。旧撤销失败事实保留在审计/退出说明；新清副本并发用 unified-runtime |
| `ui-locale.mjs` | PASS | VM中英文切换、用户文本保留、RPC语言和错误码 |

## 新增7套

| suite | 验证范围 |
|---|---|
| `legacy-exit.mjs` | 独立一次性退出工具：精确hook逆补丁、无关字节保留、未知版本/符号链接拒绝、撤权失败重试、幂等与原密文保留；不进入生产包 |
| `unified-runtime.mjs` | absent/empty/read/decrypt失败、清理失败/重启禁读、晚到导入、三平台统一依赖路径 |
| `source-identity.mjs` | profile稳定身份、WS/端口重启、旧storageId跨来源切换保留、未知旧来源不猜测、未验证profile端口重用不混同 |
| `session-concurrency.mjs` | 服务端授权/清理/选源串行、双客户端RPC、40次重叠授权写、dispose及排队操作取消 |
| `product-surface.mjs` | 无旧sync/IPC/installer动态入口，保存状态错误不静默匿名，安装命令不指回旧候选 |
| `snapshot-transactions.mjs` | rename取消安全回滚、失败留证据、重启禁读、陈旧decrypt/ENOENT不覆盖新提交、未提交磁盘不被读取发布 |
| `authorization-isolation.mjs` | 从明确git基线临时载入真实旧protocol/snapshot，仅合成dispatch；新构造true/开关/clear不重开旧false，新路径正常；旧true仍需独立退出 |

## 最终验收范围

- 源码37套；实际生产TGZ解包运行36套产品相关测试。独立退出工具仅在源码中单独验证，明确不随插件执行。实际最终结果、包SHA和每套状态见 `FINAL-EVIDENCE.json` 与 `PACKED-MANIFEST.json`。
- 官方Host pruner使用官方 `@deepseek-ai/dsh-compaction-tool-result-pruner@0.0.1-rc.3`实际组件，不再以缺模块跳过。
- 运行 `npm test`；packed测试需提供已核验的 `VV_OFFICIAL_PRUNER` 与只读历史夹具仓库 `VV_LEGACY_TEST_SOURCE`。旧模块只在临时测试目录加载，不启动旧IPC，测试结束清除。
- B站用户提供视频：真实匿名新下载211.875秒、852×480、3帧、独立音轨；继续观看与末尾音频使用此次新下载缓存，明确不是重复网络下载。
- 官方SenseVoice模型按官方固定尺寸与SHA校验，真实VV工具识别有非缓存结果；空识别片段也如实记录，不声称歌词逐字正确。测试模型/媒体/完整转写不在Git补丁或插件包。
- YouTube匿名官方解析器遇HTTP429/登录挑战，未取得媒体；已登录平台浏览器未被本执行器VV正常发现（count=0），未进行插件账户Cookie导入。
- 未实机验证：Windows/macOS keyring/CDP、完整DSH GUI、用户安装中的旧桥退出；必须按用户授权流程验证，不把合成测试当实机通过。

## 一致性和清理边界

import期间不从正在提交的磁盘文件加载，只呈现最后提交内存状态（未加载时unknown+importing）。提交前取消安全还原；提交点后返回committed及原sourceId。恢复失败留证据并阻止读取/覆盖。

清理只针对VV活动副本，不改变源浏览器、内置浏览器独立登录态、媒体缓存或人工备份。系统加密键保留以避免使备份不可解密；不承诺所有秘密或内存安全擦除。新授权文件与旧Desktop桥分离，但这不代表原已开启的旧进程已停止；旧桥仍须独立退出。
