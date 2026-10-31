# Video Vision 0.10.0-candidate.5

本候选增加 AI 工具 `open` 的 `refresh` 与 `max_height` 参数；默认仍复用缓存，不增加设置页按钮。

- `refresh: true` 重新获取，在媒体校验成功后整项切换，旧派生帧、音轨和转写不混用。
- `max_height` 仅本次采集生效，0 不限；不改全局设置，不保证源站提供指定质量。返回实际尺寸和 `cache.state`。
- 采集失败或提交前取消保留旧缓存及进度；合法旧进度独立于旧媒体可解码性。新时长较短时截到新末尾。
- 同盘完整临时 journal 经 rename 发布，再切换目录；失败恢复、恢复异常保留证据。提交后清理失败明确 `cleanup_pending`。使用现有缓存实例互斥，不宣称跨进程锁或多文件原子性，不要求硬链接支持。
- `duration_seconds` 是本地文件时长，不是已分析范围或完整来源证明。沿用 `sampled_range_seconds` 与音频分析范围；源站时长仅有真实元数据时报告。

相关云端测试使用合成媒体/故障注入及既有音频测试，不代表本次刷新已经在用户机器验收。candidate.4 的既有实机结果不冒充新刷新功能通过。不读取真实凭据，不重新安装扩展。

安装与定点验收见本候选 `test-artifacts/unified-0.10.0-candidate.5/LOCAL-ACCEPTANCE.md`（仓库文件，随交付提供固定下载链接）。
