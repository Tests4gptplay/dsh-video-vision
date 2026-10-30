# 0.10.0-candidate.1 发布准备候选

此目录只提供测试候选，不是正式市场发布。版本仍为private候选；不改main、不自动打tag或发布市场。

- `dsh-video-vision-0.10.0-candidate.1.tgz`：当前插件包。
- `vv-legacy-exit-0.10.0-candidate.1.zip`：独立旧桥退出工具，默认只检查；执行前阅读其说明并核当前宿主版本与范围。它不自动随插件运行。
- `SHA256SUMS.txt`：两份下载文件校验。

完整测试覆盖见仓库 `docs/testing/FULL-COVERAGE.md`；剩余实机要求见 `docs/testing/UNIFIED-CANDIDATE.md`。源码37套、实际解包36套产品测试通过；退出工具另1独立通过，官方ASR真实非缓存验证通过。真实Windows/macOS系统密钥库/CDP、完整DSH GUI和已安装旧桥退出仍需实机，不能把云合成验证当作实机通过。

新授权独立，不会重新开启已关闭的旧桥授权；原本仍开启的旧服务仍须退出。清理只清VV活动副本，不清来源/内置浏览器独立登录态或媒体缓存。保留系统加密键以免破坏人工加密备份，不宣称全部秘密擦除。

旧 `test-artifacts/` 中0.9.x包是历史证据，不是本次候选，不应安装替代本目录包。
