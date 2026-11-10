from pathlib import Path
import os
root=Path(os.environ['GITHUB_WORKSPACE']);p=root/'candidate'
def replace(name,old,new):
 f=p/name;s=f.read_text();assert old in s,(name,old);f.write_text(s.replace(old,new))
replace('lib/engine.js','!exact && options.frames === undefined && options.start_seconds === undefined','!exact && options.start_seconds === undefined')
replace('lib/engine.js','const times = unique ?? [...new Set(sampleTimes(start, end, count))];','const times = unique ?? (end === start && count !== 1 ? [] : [...new Set(sampleTimes(start, end, count))]);')
replace('index.js','      const frames = await engine.frames(asset,','      const previousCursor = asset.cursor;\n      const frames = await engine.frames(asset,')
replace('index.js',"      if (action === 'watch' && frames.length) await engine.save(asset);","      exec.signal.throwIfAborted();\n      if (action === 'watch' && frames.length && attachments) await engine.save(asset);\n      else if (!attachments) asset.cursor = previousCursor;")
replace('lib/host-images.js','  frame.attachment_delivery = {','  signal.throwIfAborted();\n  frame.attachment_delivery = {')
replace('index.js',"    if (frame.image) blocks.push({ type: 'image', attachment: frame.image });","    if (frame.attachment_delivery?.adapted_to_host) blocks.push({ type: 'text', text: `DSH image: ${frame.image.width}×${frame.image.height}; cached source frame: ${frame.attachment_delivery.source_dimensions.width}×${frame.attachment_delivery.source_dimensions.height}.` });\n    if (frame.image) blocks.push({ type: 'image', attachment: frame.image });")
replace('test/audit-audio-tail.mjs','assert.equal(a.quiet_ranges.length,32);assert.equal(a.quiet_ranges_truncated,true);','assert.equal(a.quiet_ranges.length,a.quiet_range_count);assert.equal(a.quiet_ranges_truncated,false);\nconst capped=analyzePcm(pcm,0,16000,{audio_detail_limit:32});assert.equal(capped.quiet_ranges.length,32);assert.equal(capped.quiet_ranges_truncated,true);')
replace('test/audit-source-resolution.mjs','assert.equal(DEFAULTS.frameWidth, 1280); // Source limit must not silently change frame sizing.',"assert.equal(DEFAULTS.frameWidth, 0); // Host delivery adapts separately.\nassert.equal(new VideoVision('.', { frameWidth: 1280 }).config.frameWidth, 1280);")
replace('test/cache.mjs',"readFile(join(configuration, 'GUIDANCE.md'), 'utf8')).includes('needs_method')","readFile(join(configuration, 'BUILTIN_GUIDANCE.md'), 'utf8')).includes('needs_method')")
replace('test/native-ui.mjs',"assert.equal(moduleId, 'dsh-video-vision');","assert.equal(moduleId, '@tests4gptplay/dsh-video-vision');")
f=p/'test/host-contract-regression.mjs'
f.write_text(f.read_text()+'''

test('EOF does not replay the last frame and cancellation during admission preserves progress',async()=>{
  const e=makeEngine();const a=await e.open(source,signal);
  await e.frames(a,{start_seconds:0,end_seconds:a.duration,frames:3},signal);
  assert.equal((await e.frames(a,{frames:3},signal)).length,0);
  assert.equal((await e.frames(a,{start_seconds:0,end_seconds:0,frames:3},signal)).length,0);
  const engine=makeEngine();const asset=await engine.open(source,signal);const stop=new AbortController();
  const store=pngStore();const save=store.saveImage.bind(store);
  store.saveImage=async input=>{const ref=await save(input);stop.abort(new Error('cancel-during-admission'));return ref;};
  await assert.rejects(make(engine,store).execute({action:'watch',video_id:asset.id,timestamps:[1],frame_format:'png',audio_mode:'off'},
    {agent:{},signal:stop.signal}),/cancel-during-admission/);
  assert.equal((await engine.load(asset.id)).cursor,0);
});
''')
print('REGRESSION_ALIGNMENT_APPLIED')
