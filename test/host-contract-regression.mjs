import { register } from 'node:module';
if (process.env.VV_TEST_STUB_SCHEMA === '1') register('./fixtures/schema-loader.mjs', import.meta.url);
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, mkdir, stat, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
const target = resolve(process.env.VV_TARGET_ROOT || fileURLToPath(new URL('..', import.meta.url)));
const load = path => import(pathToFileURL(join(target, path)));
const { VideoVision, DEFAULTS } = await load('lib/engine.js');
const { run } = await load('lib/process.js');
const { makeTool, renderVideo } = await load('index.js');
const { analyzePcm, automaticAudioRange, transcribeClip, inspectAudio, wavFromPcm } = await load('lib/audio.js');
const { parseBilibili, selectStreams, api } = await load('lib/bilibili.js');
const { ensureConfiguration } = await load('lib/extensions.js');
const root = await mkdtemp(join(tmpdir(), 'vv-host-contract-'));
process.env.DSH_HOME = join(root, 'home');
const signal = new AbortController().signal;
const source = join(root, 'clip.mkv');
const longSource = join(root, 'long.mkv');
await run('ffmpeg', ['-nostdin','-v','error','-y','-f','lavfi','-i','testsrc2=s=322x186:r=13',
  '-t','3','-c:v','ffv1','-threads','1',source],root,signal,0,'fixture');
await run('ffmpeg', ['-nostdin','-v','error','-y','-f','lavfi','-i','color=s=48x32:r=1',
  '-f','lavfi','-i','sine=frequency=300:sample_rate=16000','-t','73','-c:v','ffv1',
  '-af','volume=0.0004','-c:a','pcm_s16le','-threads','1',longSource],root,signal,0,'long-fixture');
let counter = 0;
const makeEngine = config => new VideoVision(root,{cacheDirectory:join(root, 'cache-'+(++counter)), ...config});
const make = (engine, attachments, speech) => makeTool({workingDirectory:{ensure:async()=>root},
  get:key=>key==='attachments'?attachments:key==='speechToText'?speech:undefined},engine.config);
const exec={agent:{},signal};
after(async()=>{await rm(root,{recursive:true,force:true});});

test('unselected plugin budgets are off; source dimensions are not a resolution tier',()=>{
  assert.equal(DEFAULTS.maxFrames,0);assert.equal(DEFAULTS.maxAudioSeconds,0);assert.equal(DEFAULTS.frameWidth,0);
});
test('exact timestamps bypass the omitted six-frame default and de-duplicate before budget',async()=>{
  const e=makeEngine({maxFrames:3});const a=await e.open(source,signal);
  const frames=await e.frames(a,{timestamps:Array(13).fill(0.5)},signal);
  assert.equal(frames.length,1);
});
test('single-frame and explicit zero-frame requests',async()=>{
  const e=makeEngine();const a=await e.open(source,signal);
  assert.equal((await e.frames(a,{frames:1,start_seconds:1,end_seconds:1},signal)).length,1);
  assert.equal((await e.frames(a,{frames:0,start_seconds:1,end_seconds:2},signal)).length,0);
});
test('a requested batch can exceed the old twelve-frame default',async()=>{
  const e=makeEngine();const a=await e.open(source,signal);
  assert.equal((await e.frames(a,{frames:19,start_seconds:0,end_seconds:2},signal)).length,19);
});
test('a user-selected frame budget is still honored',async()=>{
  const e=makeEngine({maxFrames:2});const a=await e.open(source,signal);
  await assert.rejects(e.frames(a,{frames:3,start_seconds:0,end_seconds:2},signal),{code:'VIDEO_VISION_BUDGET_EXCEEDED'});
});
test('sub-millisecond request identities do not share a frame cache path',async()=>{
  const e=makeEngine();const a=await e.open(source,signal);
  const f=await e.frames(a,{timestamps:[0.0001,0.0004]},signal);assert.notEqual(f[0].path,f[1].path);
});
test('non-standard source dimensions remain available; PNG and explicit width work',async()=>{
  const wide=join(root,'wide.mkv');
  await run('ffmpeg',['-nostdin','-v','error','-y','-f','lavfi','-i','color=s=11000x16:r=1','-t','1','-c:v','ffv1','-threads','1',wide],root,signal,0,'wide');
  const e=makeEngine();const a=await e.open(wide,signal);
  const [f]=await e.frames(a,{frames:1,frame_format:'png'},signal);
  const b=await readFile(f.path);assert.equal(b.readUInt32BE(16),11000);assert.equal(b.readUInt32BE(20),16);
  const [g]=await e.frames(a,{timestamps:[0],frame_format:'png',frame_width:5500},signal);
  assert.equal((await readFile(g.path)).readUInt32BE(16),5500);
});
test('explicit audio interval is not truncated at 30 or 60 seconds',async()=>{
  const e=makeEngine();const a=await e.open(longSource,signal);
  assert.deepEqual(automaticAudioRange(a,{start_seconds:0,end_seconds:73},[{seconds:0}]),{start:0,end:73});
  const clip=await e.audioClip(a,0,73,signal);assert.equal(clip.end,73);assert.equal(clip.pcm.length,73*16000*2);
});
test('the optional audio duration budget remains a user choice',async()=>{
  const e=makeEngine({maxAudioSeconds:1});const a=await e.open(longSource,signal);
  await assert.rejects(e.audioClip(a,0,2,signal),{code:'VIDEO_VISION_BUDGET_EXCEEDED'});
});
test('quiet audio still reaches the recognizer and cached preparation does not gate a capable provider',async()=>{
  const e=makeEngine();const a=await e.open(longSource,signal);let calls=0;
  const speech={resolve:x=>x,transcribe:async()=>{calls++;return{text:'controlled recognition'};}};
  const audio=await inspectAudio(e,a,{start_seconds:0,end_seconds:1},speech,{available:true,state:'preparing',provider:'test'},signal);
  assert.equal(audio.analysis.silent,true);assert.equal(audio.transcript.state,'available');assert(calls>0);
});
test('provider byte rejection splits the exact interval without gaps or duplicated accepted samples',async()=>{
  const e=makeEngine();const a=await e.open(longSource,signal);const clip=await e.audioClip(a,0,3,signal);
  let seed=7;for(let i=0;i<clip.pcm.length;i+=2){seed=(Math.imul(seed,1664525)+1013904223)>>>0;clip.pcm.writeInt16LE((seed>>>16)-32768,i);}
  let accepted=0,rejected=0;
  const speech={resolve:x=>x,transcribe:async spec=>{
    if(spec.audio.length>12044){rejected++;throw new Error('outer',{cause:new Error('Speech audio exceeds the worker byte limit')});}
    accepted+=spec.audio.length-44;return{text:'segment'};
  }};
  const t=await transcribeClip(e,a,clip,speech,{available:true,state:'ready',provider:'bounded'},'auto',signal);
  assert.equal(accepted,clip.pcm.length);assert(rejected>0);assert(t.provider_byte_limit_adapted);
  assert.equal(t.segments[0].start_seconds,0);assert.equal(t.segments.at(-1).end_seconds,3);
  for(let i=1;i<t.segments.length;i++)assert.equal(t.segments[i-1].end_seconds,t.segments[i].start_seconds);
});
test('non-capacity recognizer errors are not blindly retried',async()=>{
  const e=makeEngine();const a=await e.open(longSource,signal);const clip=await e.audioClip(a,0,1,signal);let calls=0;
  await assert.rejects(transcribeClip(e,a,clip,{resolve:x=>x,transcribe:async()=>{calls++;throw new Error('provider crashed');}},
    {available:true,state:'ready',provider:'broken'},'auto',signal),/provider crashed/);assert.equal(calls,1);
});
function pngStore(limits={}){
  const data=new Map();return {imageLimits:{maxImageBytes:20000,maxImagePixels:3000,maxImageDimension:75,mediaTypes:['image/png'],maxImagesPerMessage:1,maxMessageImageBytes:30000,...limits},
    async saveImage(input){
      const b=input.data;assert.equal(input.mediaType,'image/png');const width=b.readUInt32BE(16),height=b.readUInt32BE(20);
      assert(b.length<=this.imageLimits.maxImageBytes);assert(width*height<=this.imageLimits.maxImagePixels);assert(Math.max(width,height)<=this.imageLimits.maxImageDimension);
      const attachmentId='sha256:'+createHash('sha256').update(b).digest('hex');data.set(attachmentId,b);
      return{attachmentId,mediaType:input.mediaType,bytes:b.length,width,height};
    },async readImage(ref){return{ref,data:data.get(ref.attachmentId)};}};
}
test('host limits generate a compatible delivered copy while preserving the cached source frame',async()=>{
  const e=makeEngine();const store=pngStore();const tool=make(e,store);
  const v=await tool.execute({action:'open',source,frames:1,frame_format:'png',audio_mode:'off'},exec);
  const f=v.frames[0];assert(f.image);assert(f.attachment_delivery.adapted_to_host);
  const original=await readFile(f.path);assert.equal(original.readUInt32BE(16),322);
  assert.equal(original.readUInt32BE(20),186);assert(f.image.width<=75);assert(f.image.width*f.image.height<=3000);
  assert((await store.readImage(f.image)).data.length>0);assert.equal(renderVideo({},v).filter(x=>x.type==='image').length,1);
});
test('byte capacity adaptation is based on measured encoded bytes, not a resolution constant',async()=>{
  const e=makeEngine();const store=pngStore({maxImageBytes:500,maxImagePixels:1000000,maxImageDimension:2000});
  const v=await make(e,store).execute({action:'open',source,frames:1,frame_format:'png',audio_mode:'off'},exec);
  assert(v.frames[0].image.bytes<=500);assert.equal((await readFile(v.frames[0].path)).readUInt32BE(16),322);
});
test('upload-only count limits do not become invented tool frame limits',async()=>{
  const e=makeEngine();const store=pngStore();const v=await make(e,store).execute({action:'open',source,frames:3,frame_format:'png',audio_mode:'off'},exec);
  assert.equal(v.frames.filter(f=>f.image).length,3);
});
test('storage failure remains a failure and does not consume the viewing cursor',async()=>{
  const e=makeEngine();const a=await e.open(source,signal);const initial=a.cursor;
  const store={imageLimits:{},saveImage:async()=>{throw Object.assign(new Error('real disk error'),{code:'ATTACHMENT_WRITE_FAILED'});}};
  await assert.rejects(make(e,store).execute({action:'watch',video_id:a.id,start_seconds:1,end_seconds:2,frames:1,audio_mode:'off'},exec),{code:'ATTACHMENT_WRITE_FAILED'});
  assert.equal((await e.load(a.id)).cursor,initial);
});
test('actual impossible host capacity terminates with a concrete error',async()=>{
  const e=makeEngine();const store=pngStore({maxImageBytes:1});
  await assert.rejects(make(e,store).execute({action:'open',source,frames:1,frame_format:'png',audio_mode:'off'},exec),{code:'IMAGE_TOO_LARGE'});
});
test('Bilibili URLs not handled by the BV parser remain eligible for another resolver',async()=>{
  assert.equal(await parseBilibili('https://www.bilibili.com/video/av123456/',signal),null);
});
test('available video frame rate and audio bitrate are not deliberately selected downward',()=>{
  const play={dash:{video:[{baseUrl:'high',height:1080,width:1920,frameRate:'60/1',bandwidth:5e6,codecs:'avc1'},
    {baseUrl:'low',height:1080,width:1920,frameRate:'30/1',bandwidth:2e6,codecs:'avc1'}],
    audio:[{baseUrl:'audio-low',bandwidth:64000},{baseUrl:'audio-high',bandwidth:320000}]}};
  const selected=selectStreams(play,0);assert.equal(selected.video,'high');assert.equal(selected.audio,'audio-high');
});
test('native network requests retain caller cancellation without a hidden plugin deadline',async()=>{
  const original=globalThis.fetch;let observed;
  globalThis.fetch=async(_url,options)=>{observed=options.signal;return new Response(JSON.stringify({code:0,data:{ok:true}}));};
  try{await api('/test',{},signal);assert.equal(observed,signal);}finally{globalThis.fetch=original;}
});
test('all computed audio events are available and optional detail selection is explicit',()=>{
  const pcm=Buffer.alloc(16*16000*2);for(let i=0;i<pcm.length/2;i++)if(i%4000<600)pcm.writeInt16LE(Math.round(Math.sin(i*.4)*20000),i*2);
  const all=analyzePcm(pcm);assert(all.onset_count>32);assert.equal(all.prominent_onsets_seconds.length,all.onset_count);
  const limited=analyzePcm(pcm,0,16000,{audio_detail_limit:3});assert.equal(limited.prominent_onsets_seconds.length,3);assert(limited.prominent_onsets_truncated);
});
test('generated legacy guidance is migrated without deleting appended user notes',async()=>{
  const dir=join(root,'guidance');await mkdir(join(dir,'resolvers'),{recursive:true});
  const base=process.env.VV_LEGACY_ROOT;
  if(!base) return;
  const old=await readFile(join(base,'resources/GUIDANCE.md'));
  const note=Buffer.from('\nMY USER NOTE\n');await writeFile(join(dir,'GUIDANCE.md'),Buffer.concat([old,note]));
  await ensureConfiguration({configDirectory:dir});const actual=await readFile(join(dir,'GUIDANCE.md'),'utf8');
  assert(actual.endsWith(note.toString()));assert(!actual.includes('最多 30 秒音频'));
  await writeFile(join(dir,'GUIDANCE.md'),'USER EDITED THROUGHOUT\n');await ensureConfiguration({configDirectory:dir});
  assert.equal(await readFile(join(dir,'GUIDANCE.md'),'utf8'),'USER EDITED THROUGHOUT\n');
});
test('user cancellation still stops work',async()=>{
  const e=makeEngine();const a=await e.open(source,signal);const c=new AbortController();c.abort(new Error('stop'));
  await assert.rejects(e.frames(a,{timestamps:[0]},c.signal),/stop/);
});


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
