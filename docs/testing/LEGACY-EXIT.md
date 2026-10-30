# 一次性退出旧 Desktop 会话桥（独立工具；非插件功能）

## 范围与事实

官方 DSH rc.5 已核查的 preload/main IPC/SDK/provider 链没有向内置浏览器导入 Cookie/session 的合法插件接口，因此 VV 移除内置同步及其旧 Desktop 注入路径。此决定不代表 B 站登录失败根因已查明，也不将宿主的接口边界描述为已证实漏洞。

仅卸载旧插件**不会**自动撤销 `authorization.json`、结束 Desktop 已加载服务、移除旧 ASAR hook。新主包也不会运行此退出工具或自动恢复旧桥。

工具只处理用户明确指定的：
- VV 状态目录中的旧桥授权（写入 `enabled:false, syncToNative:false` 并读回验证）。
- 当前宿主 `app.asar` 中严格匹配的已知 hook：局部恢复原 callback，保留当前宿主其余字节，不把历史整个 ASAR 覆盖 rc.5。
- `resources/dsh-browser-session` 中与随工具清单逐文件 SHA256 相符的旧运行文件。先存成单一 base64 JSON 恢复数据，核验后逐文件移除；未知文件、改动版本或符号链接拒绝处理。不递归删除目录。

**不读取/删除任何 Chrome 或 DSH 内置浏览器 Cookie 数据库，不清媒体缓存，不删除历史 snapshot 密文，不改 exe fuse/安全策略，不绕过签名检查。** 工具不提供后台、IPC 服务或新的同步能力，也不属于 npm 插件运行包。

## 必须知道的边界

1. 先完全退出 DSH Desktop，再执行任何 apply。`--host-stopped` 仅记录操作者已确认退出，工具不能证明进程真的终止，也不强杀进程。已载入的旧服务只能随宿主退出终止，不能靠磁盘改动宣称服务已停止。
2. 旧同步跟踪只存在旧进程内存，且旧实现会吞掉 remove/set 失败并丢弃跟踪。此工具不能恢复丢失的归属证据。因此**不尝试删除任何内置 Cookie**，不把 `session-state.bin` 或某文件名存在当作全部 Cookie 归属证据。报告明确为 `not_attempted_ownership_unverifiable`。退出桥不等于已清掉旧内置副本。
3. 旧 Electron safeStorage 的 `session-state.bin` 与 keyring 的 `VVKR1` 不是可直接互换的格式。工具保留密文，不解密、不重命名成新格式、不自动迁移。后续登录态功能以最终产品设计为准；如需保存新副本，应由用户从明确选择的来源重新导入。这里没有凭空提供宿主解密接口。
4. 已知 runtime 清单固定对应历史交付包 `test-artifacts/dsh-video-vision-0.9.3-audit.6-copyclarity.tgz`，包 SHA256 为 `27e3fa6b3cf452c5c2dedd1834969f0aca706f34da8567b88d4b62b221ea74c9`。旧安装器逐字节复制四个根目录模块及 `platform` 的四个模块，共八个文件；清单逐项由冻结归档验证，并与 Git 基线 `7faf92f9a3e3f801d1b4d17d0f8d7d234c785d3b`、`cde7de6d8a83695291b7c6492805fe04d442f5c0` 相符。实机曾修复过桥、文件不同或宿主 hook 形状不同，必须停止对应步骤并重新审查，不能扩大匹配来强行通过。
5. 如果宿主启用要求完整签名的 ASAR 校验，本工具不修改其校验政策。由宿主官方修复/重装当前同版本安装包处理，不恢复过时整包。不要为工具关安全设置。

## 独立交付与命令

独立交付两文件，保持同目录：
- `tools/legacy-exit.mjs`
- `tools/legacy-exit-known-runtime.json`

以下只是实机步骤，**本轮云端没有执行**。执行实际主机改动前须由用户批准指定目标和范围。

1. 确定当前 Desktop 的 `resources` 目录及**旧 VV 实际使用的状态根目录**（可依据原安装记录核对；不能猜测其他账户路径）。退出全部 Desktop 窗口并确认进程已停止。
2. 在支持的 Node.js 环境纯检查，输出包含本次当前 ASAR SHA256：

   ```powershell
   node .\legacy-exit.mjs --resources "<当前Desktop resources>" --state "<旧VV状态根目录>"
   ```

3. 审核 `hookFound`、输入目录及 SHA256；若 unknown/mismatch 报错，不应用。不需也不应把完整 ASAR/密文上传给助手。用户批准后显式执行：

   ```powershell
   node .\legacy-exit.mjs --resources "<当前Desktop resources>" --state "<旧VV状态根目录>" --apply --host-stopped --expect-sha256 "<刚检查得到的beforeSha256>"
   ```

4. 检查 JSON 报告 `complete:true` 和 `failures:[]`。该结果只表示磁盘操作已完成，不证明内置 Cookie 已清除或新功能实机通过。启动 Desktop，确认普通浏览器导航正常、新 VV 无旧桥连接/恢复入口；若仍有旧服务，先停止宿主并核实运行的是同一个安装目录。
5. 可再次纯检查确认无 hook。重复 apply 必须使用新检查得到的当前 SHA256，不能复用旧 SHA。工具可幂等完成；恢复数据不会被重试覆盖。

## 部分失败、重试和恢复

- 工具严格识别 ASAR 后才允许 apply。未知 hook 在修改前拒绝。
- apply 会先禁授权并验证，再改当前 ASAR，最后核验/封存/移除已知 runtime。因此若 runtime 不匹配，授权与 hook 可能已经退出但旧文件还在，报告 `complete:false`，保留对应失败和已完成步骤。**不要将部分成功描述为全部清理完成。**
- `legacy-exit-report.json` 记录最新结果；退出码非零或写报告本身报错也视为未完成。保存终端输出。文件操作失败不会被吞掉。
- `legacy-exit-archive-<SHA256>.json` 是当前 apply 前 ASAR 的非可执行恢复数据，`legacy-exit-runtime-data.json` 为原运行文件的非可执行恢复数据。均位于指定 VV 状态目录，不能作为任何自动执行 fallback。
- 本工具不自动恢复整 ASAR，也不提供一键回滚重新启用旧服务。需恢复时，先审查精确当前版本与目标，并另行获得授权；优先使用官方当前安装包修复。不要把旧备份直接盖在已升级宿主上。
- 清理恢复数据属于另一次明确范围的删除操作；未核实成功且未获用户确认，不删除它们。

## 云端合成验收

`node test/legacy-exit.mjs` 覆盖：已知 hook 逆补丁/固定长度、其余 ASAR 字节不变、未知/多 hook 拒绝、完整性失败拒绝、默认无写入、apply 前置条件、授权失败可见及可重试、重复退出幂等、旧密文原字节保留、未知 runtime 和符号链接拒绝。还直接读取上述冻结旧 TGZ，先验证包 SHA256，再验证八文件及旧安装器复制布局，使用真实旧运行文件与交付清单测试退出、未知改动拒绝、授权及 hook 已退出后的重试、部分文件已移除后的继续退出、恢复数据及无关文件不变。旧模块只复制不执行；宿主 ASAR 与状态目录为临时合成夹具，无真实凭据或用户机器操作；不替代 rc.5 实机退出验证。该源码回归依赖仓库中的历史 TGZ 及 `tar` 命令，不要求用户在实机运行此测试。

## 退出清单修订（不改变 VV 产品包）

首版独立退出 ZIP 的 `protocol.cjs`、`snapshot.cjs` 两项哈希错误：生成清单误读开发中工作树，未绑定历史归档；原合成测试也未覆盖交付清单与实际旧包一致性。这是工具交付缺陷，不是用户修改文件或权限问题。

修订只替换这两项为冻结旧包的已核验值，不放宽未知文件、符号链接或宿主 hook 检查。已尝试旧工具的安装可能处于授权已禁用、hook 已退出、八个 runtime 文件仍保留的部分完成状态；无需恢复旧 hook，重新检查当前 ASAR 并以当前哈希重试修订工具即可。仍有任何未知文件时保持拒绝，不能手工把未审查哈希加入清单。
