# 可查验用例与结果

候选 `0.9.3-audit.6`，2026-10-30；自有云端 Linux、官方 DSH Web Host、独立空 profile。受控媒体和浏览器用合成夹具驱动真实插件工具；真实公开视频和官方 ASR 另走实际插件 CLI，未冒称 GUI 或模型已理解视频。包身份见 [manifest](../../test-artifacts/manifest.json)。

| 用例 | 操作/预期 | 实际观察及证据 |
|---|---|---|
| 默认摘要裁剪 | 生成含音频事件的摘要，继续真实会话触发 Host 默认裁剪；预期保留计数、截断和详情引导 | 同一 callId 05:40:43 时8534字符→06:18:00时5159；五个元数据标志均true。见公开JSON第1项 `first/firstPruned`。 |
| 两阶段撤权 | 同时启动响应头前等待与已发部分响应体的受保护请求，UI关闭授权；预期两请求取消，不留完整下载 | 08:55:07与08:55:37实际请求；后一请求已收1024B，08:56:34两连接均closed/completed=false；英中文错误正确。见第2项。 |
| 缓存清理保护 | 对本插件缓存确认清空，保留目录内无关文件及外部媒体/方法/导出/备份 | 09:10核expectedFiles=actualFiles=1；missing/extra/changed及外部变化均空。见第3项；保留文件为合成75B sentinel。单帧/整项Cancel和Confirm另见[范围报告](ACCEPTANCE.md)。 |
| 真实公网音视频 | 输入用户公开视频BV1GTn66pEi3，由冻结插件解析/下载/6帧；再获取独立音轨并对0–15秒调用官方SenseVoice | 视频211.875秒、640×360、6实际JPEG；音轨1741905B，16kHz WAV480044B。09:42:45–46真实转写available/cached=false，28词。第4项含媒体与转写hash，不公开歌词；歌唱识别有漏词/错词，链路成功不等于识别准确率100%。 |

[公开结果片段 JSON](../../test-artifacts/public-evidence.json)直接包含实际状态和时间，不要求读者访问私有 Library。每项附原报告SHA256用于对应保全版本；hash本身不是结果证明，应与片段和代码一起查阅。

补充入口：[真实ASR详细净化回执](../../test-artifacts/real-asr-summary.json)、[A–G覆盖与范围](ACCEPTANCE.md)、[实机验证要求](LOCAL-VALIDATION.md)、[源码测试](../../test/)。以上用例为已执行结果，不要求用户重新整套复测。
