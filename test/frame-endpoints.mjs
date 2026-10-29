import assert from 'node:assert/strict';import {mkdtemp,rm,stat} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';import {execFileSync} from 'node:child_process';import {VideoVision} from '../lib/engine.js';
const root=await mkdtemp(join(tmpdir(),'vv-endpoints-')),signal=new AbortController().signal;
try{
 const engine=new VideoVision(root,{cacheDirectory:join(root,'cache')});
 for(const [name,rate,duration] of [['normal',12,6],['short',25,0.04],['slow',1,3]]){
  const path=join(root,name+'.mp4');execFileSync('ffmpeg',['-nostdin','-hide_banner','-loglevel','error','-y','-f','lavfi','-i',`testsrc=size=64x64:rate=${rate}`,'-t',String(duration),'-c:v','libx264','-pix_fmt','yuv420p','-threads','1',path]);
  const asset=await engine.open(path,signal);const frames=await engine.frames(asset,{start_seconds:Math.max(0,asset.duration-1),end_seconds:asset.duration,frames:3},signal);assert.ok(frames.length);for(const frame of frames){assert.ok((await stat(frame.path)).size>0);assert.ok(frame.seconds>=0&&frame.seconds<asset.duration);}assert.equal(asset.cursor,asset.duration);assert.deepEqual(await engine.frames(asset,{frames:3},signal),[]);
  const point=await engine.frames(asset,{timestamps:[asset.duration],frames:1},signal);assert.equal(point.length,1);assert.ok((await stat(point[0].path)).size);assert.equal(asset.cursor,asset.duration);
  assert.deepEqual(await engine.frames(asset,{start_seconds:asset.duration,end_seconds:asset.duration,frames:3},signal),[]);
  assert.deepEqual(await engine.frames(asset,{start_seconds:0,end_seconds:0,frames:3},signal),[]);
  await assert.rejects(engine.frames(asset,{start_seconds:asset.duration,end_seconds:0},signal),/end_seconds/);
  await assert.rejects(engine.frames(asset,{timestamps:[asset.duration+1]},signal),/timestamp/);
  if(name==='short')assert.equal(frames.length,1,'Clamped same-frame short clip is not repeated');
 }
 console.log('PASS real ffmpeg: duration endpoint, short <0.1s clip, low fps tail, point endpoint, zero interval, EOF and invalid range preservation.');
}finally{await rm(root,{recursive:true,force:true});}
