import assert from 'node:assert/strict';import {mkdtemp,readFile} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';import {createHash} from 'node:crypto';
import {VideoVision} from '../lib/engine.js';import {run} from '../lib/process.js';
const root=await mkdtemp(join(tmpdir(),'vv-frame-precision-')),signal=new AbortController().signal;
const file=join(root,'highfps.mp4');await run('ffmpeg',['-v','error','-f','lavfi','-i',"nullsrc=s=32x32:r=100,geq=lum='N*10':cb=128:cr=128",'-t','0.2','-c:v','libx264','-pix_fmt','yuv420p','-y',file],root,signal,0);
const e=new VideoVision(root),asset=await e.open(file,signal);const frames=await e.frames(asset,{timestamps:[0.15,0.19]},signal);assert.deepEqual(frames.map(f=>f.seconds),[0.15,0.19]);const hashes=await Promise.all(frames.map(async f=>createHash('sha256').update(await readFile(f.path)).digest('hex')));assert.notEqual(hashes[0],hashes[1],'Distinct requested times decode distinct changing test frames');
const eof=await e.frames(asset,{timestamps:[0.195,0.2]},signal);assert.deepEqual(eof.map(f=>f.seconds),[0.19]);
delete asset.frameRate;const unknown=await e.frames(asset,{timestamps:[0.2]},signal);assert.deepEqual(unknown.map(f=>f.seconds),[0.19]);
console.log('PASS 100fps exact final-window points, distinct decoded frames, after-last-frame/EOF actual final PTS, missing FPS');
// Compare decoded pixels against an independent sequential frame selection.
for (const [i,frame] of frames.entries()) {
  const expected=join(root,'reference-'+i+'.rgb'),actual=join(root,'actual-'+i+'.rgb');
  await run('ffmpeg',['-v','error','-i',file,'-vf',`select=eq(n\\,${i===0?15:19})`,'-frames:v','1','-f','rawvideo','-pix_fmt','rgb24','-y',expected],root,signal,0);
  await run('ffmpeg',['-v','error','-i',frame.path,'-frames:v','1','-f','rawvideo','-pix_fmt','rgb24','-y',actual],root,signal,0);
  const want=await readFile(expected),got=await readFile(actual);assert.equal(want.length,got.length);
  const mean=b=>b.reduce((sum,n)=>sum+n,0)/b.length;assert.ok(Math.abs(mean(want)-mean(got))<4,'Decoded gray corresponds to requested sequential frame');
}
const offset=join(root,'offset.mp4');await run('ffmpeg',['-v','error','-i',file,'-c','copy','-output_ts_offset','7','-y',offset],root,signal,0);
const shifted=await e.open(offset,signal);assert.ok(shifted.timelineStart>=7);
const shiftedFrames=await e.frames(shifted,{timestamps:[.15,.19,.2]},signal);assert.equal(shiftedFrames.length,2);assert.ok(Math.abs(shiftedFrames[0].seconds-.15)<1e-6);assert.ok(Math.abs(shiftedFrames[1].seconds-.19)<1e-6);
const vfr=join(root,'vfr.mp4');await run('ffmpeg',['-v','error','-i',file,'-vf',"select='eq(n,0)+eq(n,3)+eq(n,11)+eq(n,19)'",'-fps_mode','vfr','-c:v','libx264','-y',vfr],root,signal,0);
const variable=await e.open(vfr,signal);const vf=await e.frames(variable,{timestamps:[.03,.11,.19,variable.duration]},signal);assert.deepEqual(vf.map(f=>Number(f.seconds.toFixed(6))),[.03,.11,.19]);
const {stat,writeFile,chmod}=await import('node:fs/promises');const previous=await Promise.all(vf.map(async f=>({mtime:(await stat(f.path)).mtimeMs,bytes:await readFile(f.path)})));const again=await e.frames(variable,{timestamps:[.03,.11,.19,variable.duration]},signal);for(let i=0;i<again.length;i++){assert.equal((await stat(again[i].path)).mtimeMs,previous[i].mtime);assert.deepEqual(await readFile(again[i].path),previous[i].bytes);}
// A readable track may end before the advertised timeline; use actual final PTS.
variable.duration+=.5;assert.ok((await e.frames(variable,{timestamps:[variable.duration]},signal)).every(f=>Math.abs(f.seconds-.19)<1e-6));
const realProbe=e.config.ffprobePath,emptyProbe=join(root,'empty-probe.mjs'),calls=join(root,'probe-calls');await writeFile(emptyProbe,`#!/usr/bin/env node\nimport {appendFileSync} from 'node:fs';appendFileSync(${JSON.stringify(calls)},'x');console.log('{"frames":[],"streams":[]}');`);await chmod(emptyProbe,0o700);e.config.ffprobePath=emptyProbe;
await assert.rejects(e.frames({...asset,duration:10,lastFrameSeconds:undefined},{timestamps:[10]},signal),/no readable final frame/);assert.equal((await readFile(calls)).length,5,'1,2,4,8,16 second windows terminate at full clip');
const slowProbe=join(root,'slow-probe.mjs');await writeFile(slowProbe,'#!/usr/bin/env node\nsetInterval(()=>{},1000);');await chmod(slowProbe,0o700);e.config.ffprobePath=slowProbe;const stop=new AbortController();setTimeout(()=>stop.abort(new Error('tail-probe-stop')),100);await assert.rejects(e.frames({...asset,lastFrameSeconds:undefined},{timestamps:[asset.duration]},stop.signal),/tail-probe-stop/);e.config.ffprobePath=realProbe;assert.ok((await e.frames(asset,{timestamps:[asset.duration]},signal)).length===1);
console.log('PASS sequential pixel reference, VFR, nonzero stream start, cache reuse, shorter decoded tail, bounded empty-tail search, cancellation/recovery');
