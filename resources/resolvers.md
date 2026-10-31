# 站点解析扩展接口 v1（含独立音轨）
<!-- 内置接口说明随插件更新。已有仅返回 mediaPath 的方法继续可用。 -->

安全规则见 `../NATIVE_SESSION_GUIDANCE.md`：站点扩展和 yt-dlp 备用方式只使用匿名数据。严禁读取、导出或接收用户浏览器 Cookie、登录 Token、密码及其他站点资料；UI 的原生授权不授予第三方解析器凭据访问权限。

每个方法放在一个独立子目录，目录名使用字母、数字、点、短横线或下划线。例如：

```text
resolvers/
  example-site/
    manifest.json
    resolve.mjs
```

manifest.json：

```json
{
  "name": "Example 视频",
  "hosts": ["example.org", "*.example.org"],
  "pathPrefix": "/watch/",
  "enabled": false
}
```

hosts 是网址的主机名；pathPrefix 可省略。启用的方法按目录名排序，优先使用首个匹配项。通过 `video_vision methods` 查看路径和错误；通过 `resolver: "example-site"` 可明确试用尚未启用的方法。

resolve.mjs 默认导出异步函数：

```js
export default async function resolveVideo({
  source, outputDirectory, signal,
  maxHeight, maxDownloadMB, ffmpegPath, ffprobePath
}) {
  // 根据 source 请求站点数据，将视频下载到 outputDirectory。
  // 使用 signal 传递取消信号，并按 maxDownloadMB 限制下载大小。
  return {
    title: "视频标题",
    mediaPath: "video.mp4",
    audioPath: "audio.m4a", // 可选：独立下载的声音；合并视频省略此项。
    captions: {
      language: "zh",
      cues: [{ start: 0, end: 2, text: "字幕内容" }]
    }
  };
}
```

mediaPath 和可选的 audioPath 必须指向本次 outputDirectory 内的已下载文件，可以是相对路径；视频与独立音频合计遵守用户设置的 maxDownloadMB；未设置总预算时该值为 Infinity。title 和 captions 可省略。对于分离音视频或 HLS/DASH，可分别下载后返回 mediaPath 与 audioPath，也可使用传入的 ffmpegPath 合并后返回 mediaPath。声音与视频使用同一时间轴。

有声视频的方法要保留声音。试用后同时查看返回画面与 audio.state / audio.analyzed_range_seconds；歌词和节奏指导见 ../AUDIO_GUIDANCE.md。

模块在独立 Node 进程执行；下载超时和取消沿用插件现有任务设置，取消时结束本次进程树。日志请用 console.error；返回值应能序列化为 JSON。插件随后读取真实媒体信息、抽帧并交给当前 AI。

修改模块或 manifest 后，下一次请求读取新内容。显式指定 resolver 的试用缓存与代码版本关联；正常自动模式继续复用已有视频缓存。

`maxHeight: 0` 表示不限制源视频高度；方法应按站点可用质量选择，不应使用 `height <= 0` 过滤。正数表示用户设定的高度上限。已有自定义方法由其作者确认兼容这一约定，插件不会重写用户方法。
