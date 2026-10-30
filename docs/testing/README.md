> 本文保留此前0.9.x测试记录；本次0.10统一架构与全量验收以 [UNIFIED-CANDIDATE.md](UNIFIED-CANDIDATE.md) 为准。旧同步/安装器步骤已退役，勿据本文执行。

# 候选测试资料

本轮已执行云端冻结矩阵通过，无新增产品缺陷。修复已选离线浏览器来源显示及主题/皮肤颜色覆盖，保留显式选择和授权语义。实际用户公开视频通过同一冻结插件工具完成解析、下载和六帧输出；不是预先下载种入缓存，也不是合成模型理解声明。

- [安装与精确包](../../test-artifacts/INSTALL.md)
- [验收范围与实机实机验证要求](ACCEPTANCE.md)
- [修正依据](CHANGES.md)
- [机器可读覆盖摘要](../../test-artifacts/cloud-evidence-summary.json)

云端已过项直接采用；本机只补剩余平台/真实提供方绑定。纯介绍文字改动不触发功能重跑。

`test/audit-host-pruner.mjs` 是外部Host集成检查，使用 `VV_OFFICIAL_PRUNER` 指定已安装的官方裁剪器模块。交付源码移除了云端临时绝对路径；产品包不包含该外部测试脚本。

真实音轨与官方SenseVoice 0–15秒转写补测已完成，见[验收记录](ACCEPTANCE.md)及[净化ASR结果](../../test-artifacts/real-asr-summary.json)。

- [实机验证要求：操作与验收标准](LOCAL-VALIDATION.md)
