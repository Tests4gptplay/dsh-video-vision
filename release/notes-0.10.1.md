## Video Vision 0.10.1

### 稳定性修复
- 修复接近满幅的音频在峰值、响度等结果中产生负零，导致宿主以 `value is not lossless JSON` 拒收整个工具结果的问题。
- 保持原有分析精度与功能；无需关闭音频分析规避错误。
- 新增负零、静音、满幅及舍入边界回归。真实在线视频的 30 秒与 60 秒音频范围已通过官方无损 JSON 校验组件；`watch` 音频仍按既有设计最多分析 30 秒，较长范围用 `audio`。

### English
Fix near-full-scale audio measurements returning negative zero and causing the host to reject the entire tool result as non-lossless JSON. Analysis precision and existing features are unchanged. Added regression coverage for negative zero, silence, full scale and rounding boundaries. Real online-video audio ranges of 30 and 60 seconds passed the official lossless-JSON validation component. `watch` still limits automatic audio coverage to 30 seconds; use `audio` for longer ranges.

[安装与使用](https://github.com/Tests4gptplay/dsh-video-vision/blob/v0.10.1/README.md) · [验证范围](https://github.com/Tests4gptplay/dsh-video-vision/blob/v0.10.1/docs/testing/RELEASE-0.10.1.md)
