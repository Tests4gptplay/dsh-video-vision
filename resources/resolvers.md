# 站点解析扩展接口 v1

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
    captions: {
      language: "zh",
      cues: [{ start: 0, end: 2, text: "字幕内容" }]
    }
  };
}
```

mediaPath 必须指向本次 outputDirectory 内的已下载文件，可以是相对路径。title 和 captions 可省略。对于分离音视频或 HLS/DASH，可在方法中使用传入的 ffmpegPath 生成完整视频，再返回文件路径。

模块在独立 Node 进程执行；下载超时和取消沿用插件现有任务设置，取消时结束本次进程树。日志请用 console.error；返回值应能序列化为 JSON。插件随后读取真实媒体信息、抽帧并交给当前 AI。

修改模块或 manifest 后，下一次请求读取新内容。显式指定 resolver 的试用缓存与代码版本关联；正常自动模式继续复用已有视频缓存。
