# Video Vision review.6：零帧视觉范围修复验收

本次修复仅修改零帧结果的 sampled_range_seconds：无帧返回 null；有帧仍返回真实采样时间范围。音频 analyzed_range_seconds 由音频处理结果提供。

回归测试覆盖音频-only watch(frames=0)、关闭音频的 open(frames=0)、普通两帧取样。

- CI Run：https://github.com/Tests4gptplay/dsh-video-vision/actions/runs/42826778005
- 源码测试：未完成通过
- 新增/既有 Host 契约测试：未完成通过
- 已打包候选再次验证：未完成通过
- 候选 TGZ SHA-256：未生成
- 该操作只在开发分支执行，未执行正式发布。
