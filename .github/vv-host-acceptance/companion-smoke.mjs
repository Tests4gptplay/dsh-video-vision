import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {Context} from '@deepseek-ai/cordis';
import LocalAttachmentStore from '@deepseek-ai/dsh-attachment-local';
import {makeTool,renderVideo} from '@tests4gptplay/dsh-video-vision';
const require=createRequire(import.meta.url);
const localRequire=createRequire(require.resolve('@deepseek-ai/dsh-attachment-local'));
const sharp=localRequire('sharp');
const png=await sharp({create:{width:37,height:23,channels:3,background:'#f09020'}}).png().toBuffer();
const jpeg=await sharp(png).resize(17,11).jpeg().toBuffer();
assert.equal((await sharp(jpeg).metadata()).width,17);
assert(Object.keys(require.cache).some(x=>x.includes('sharp-wasm32')),'WASM backend must actually load with native optional binaries omitted');
const root=await mkdtemp(join(tmpdir(),'vv-installed-companion-'));const ctx=new Context();
try{
 const store=new LocalAttachmentStore(ctx,{dshHome:root,maxImagePixels:3000,maxImageDimension:75,maxImageBytes:20000});
 const ref=await store.saveImage({data:png,mediaType:'image/png'});
 assert.equal((await store.readImage(ref)).ref.attachmentId,ref.attachmentId);
 const path=join(root,'clip.mkv');execFileSync('ffmpeg',['-nostdin','-v','error','-y','-f','lavfi','-i','testsrc2=s=322x186:r=13','-t','2','-c:v','ffv1','-threads','1',path]);
 const tool=makeTool({workingDirectory:{ensure:async()=>root},get:key=>key==='attachments'?store:undefined},{cacheDirectory:join(root,'cache')});
 const result=await tool.execute({action:'open',source:path,frames:3,frame_format:'png',audio_mode:'off'},{agent:{},signal:new AbortController().signal});
 assert.equal(renderVideo({},result).filter(x=>x.type==='image').length,3);
 for(const frame of result.frames){assert(frame.image.width*frame.image.height<=3000);await store.readImage(frame.image);assert.equal((await readFile(frame.path)).readUInt32BE(16),322);}
 console.log('CLEAN_INSTALL_PASS: exact VV and attachment TGZs; real WASM PNG/JPEG; persisted/read-back images; rendered three model image blocks');
}finally{await ctx.fiber.dispose();await rm(root,{recursive:true,force:true});}
