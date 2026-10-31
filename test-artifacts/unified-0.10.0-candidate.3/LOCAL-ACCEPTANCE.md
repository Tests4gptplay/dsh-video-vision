# VV 0.10.0-candidate.3 实机验证

这是测试分支候选，不是正式市场版。用户尚未验收合成 HTML 界面；云端测试不代表真实 Chrome、Windows 密钥库或 DSH GUI 已通过。

候选文件：`dsh-video-vision-0.10.0-candidate.3.tgz`

SHA-256：`178044e27ce60628cb6407242a31457d883eeaa707ad19804b47d11d93410a36`

[下载候选 TGZ（固定提交）](https://raw.githubusercontent.com/Tests4gptplay/dsh-video-vision/4a186300c04dfac64365e9ad8aec667b9d40950b/test-artifacts/unified-0.10.0-candidate.3/dsh-video-vision-0.10.0-candidate.3.tgz)

源码提交：`4a186300c04dfac64365e9ad8aec667b9d40950b`，原测试分支；匿名下载已核 HTTP 200、84152 字节、上述 SHA-256。main 与市场未变。该提交未发现 CI workflow run 或 status，不把云端自测称作 GitHub CI 通过。

安装说明已按官方 rc5 新来源保配置升级路径核实。

## 从 Git 下载、安装并确认版本

**主安装来源是上面的固定 Git 提交下载链接。附件 ZIP 只作备用，不替代本次从 Git 下载的步骤。**

1. 在本地已获准的工作目录下载 TGZ；不要复用旧缓存包。Windows PowerShell 示例（目录可换为自己的工作区）：

```powershell
New-Item -ItemType Directory -Force 'E:\VV-candidate3-test' | Out-Null
Invoke-WebRequest 'https://raw.githubusercontent.com/Tests4gptplay/dsh-video-vision/4a186300c04dfac64365e9ad8aec667b9d40950b/test-artifacts/unified-0.10.0-candidate.3/dsh-video-vision-0.10.0-candidate.3.tgz' -OutFile 'E:\VV-candidate3-test\dsh-video-vision-0.10.0-candidate.3.tgz'
(Get-FileHash 'E:\VV-candidate3-test\dsh-video-vision-0.10.0-candidate.3.tgz' -Algorithm SHA256).Hash
```

2. 将结果与上方 SHA-256 逐字核对；不一致就停止安装并报告，不跳过校验。
3. 打开 DSH **插件 → 添加插件**（或 **安装第三方插件**），在 **包名或地址** 填入刚下载的 TGZ 完整路径，点击 **安装**。升级使用这个新版本来源，保留设置和用户文件；只有宿主明确提示时才处理对应旧插件条目，不删除设置、登录态、缓存或目录。
4. 安装后 **立即启用**；本次重启验证前完全退出并重新打开 DSH。到插件列表及 **设置 → 视频视觉** 核对实际版本为 **0.10.0-candidate.3**，再开始以下测试。仍显示旧版则停止，不把旧版结果记入本候选。
5. 不重复已完成的旧桥退出；独立 fix1 工具未变。不要清理浏览器数据、复制 profile、读取密码库或把 Cookie/账号资料发到日志、聊天或测试报告。

## 只需补测以下实际边界

1. **安装入口与来源**：设置中看到“安装 Chrome 扩展”。点击后进入微软官方 Playwright 扩展商店页，核对扩展 ID `mmlmfjhmonkocbjadbfplnigmagldckm`，由用户自行安装并确认权限。不拖装、不开开发者模式、不改远程调试设置。打开商店不能直接显示“已安装”；安装情况未知时不应阻止导入。
2. **浏览器内确认**：明确选择“Google Chrome（浏览器内确认）”。用用户自愿选择的测试登录态，点击导入后在 Chrome 官方扩展页确认来源。确认成功后验证 VV 的一个实际登录态请求；Cookie 总数、按钮成功或浏览器网页已登录都不能单独当网站认证成功证据。该入口是 VV 保存槽，不承诺自动识别多个物理 profile。
3. **取消与重试**：在等待浏览器确认时取消一次；若条件允许，在采集过程中再取消一次。界面应恢复可操作，源浏览器及其标签仍在，旧可读副本和授权保留，不能出现晚到结果覆盖。随后重新显式导入可用。若报告临时资源清理失败，保留无敏感错误码，不宣称清理成功。
4. **关闭来源与重启**：成功导入后关闭来源 Chrome，用同一 VV 保存副本请求；完全退出并重启 DSH 后再次检查可读与请求。网站主动过期、撤销或风控需单列，不能当加密读取成功或失败的替代证据。验证真实 Windows Credential Manager 或相应 OS keyring 是否能保存和读取。
5. **来源稳定与按需检查**：普通切页/回焦不得后台读取 Cookie 或遍历其他 profile。只有用户导入/刷新读取登录态。点击检查只检查当前明确来源；未知保持未知。切换到已保存的另一来源不能被自动刷新悄悄改回。再次导入是明确更新当前保存槽。
6. **界面定点**：核对中英安装状态、取消按钮、清理按钮短文案；清理确认留在登录态区域，不跳到下方缓存区；方法说明的保留提示另起一行。用户愿意实际清理时，只清 VV 活动副本并撤销其读取，不退出源 Chrome 或 DSH 内置浏览器独立登录态、不清媒体缓存。

## 回报格式

每项写“通过 / 失败 / 未执行”，附 DSH 版本、OS、Chrome 与扩展版本、可复现步骤及不含账号/凭据的错误信息。失败截图遮盖账号、URL 中的秘密参数和私人内容。不要导出或提交 Cookie、密码库、控制连接地址、完整转写或媒体素材。

不要求重做已通过的全部云端视频/音频/字幕/缓存/导出回归；发现本轮相关新回归则记录具体功能和步骤。真实扩展未通过前，不宣称日常 Chrome 导入已打通。
