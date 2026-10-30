# 0.10.0-candidate.2 UI 修订候选

修复清理按钮文案、就地确认不滚动、方法说明指定换行，并将公开界面及错误提示中的私有测试工具简称改为通用浏览器来源说明。没有增加迁移工具或改变采集协议。

UI逻辑完成时源码38套及实际TGZ解包37套产品测试通过；最终四个说明字符串调整后，最终源码与实际TGZ解包各5套UI回归通过，并核其余字节不变。另1套独立退出工具不在产品包内。完整记录见 `UI-VALIDATION.json`，包清单见 `PACKED-MANIFEST.json`。真实宿主GUI仍需核验，不将VM作为实机通过。

旧退出工具继续使用 [fix1](https://raw.githubusercontent.com/Tests4gptplay/dsh-video-vision/ae1825a014d8e8ffa504e0ed4eac7688584bd320/test-artifacts/unified-0.10.0-candidate.1/vv-legacy-exit-0.10.0-candidate.1-fix1.zip)，SHA256 `edb1406e9e5cec50f8cd71d016f0bc6e393758a53b54170fbfb87951229531ee`，字节未变。此前已成功退出旧桥者不因UI升级重新执行退出。

candidate.1保留为历史，不用同版本换包；本候选未发布市场。
