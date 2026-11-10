import { beforeAll, afterAll, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import * as NativeToolExecutor from '@deepseek-ai/dsh-tool-executor-native'
import { executeToolFixture } from '@deepseek-ai/dsh-tool-testkit'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import LocalAttachmentStore from '../src/index.ts'
import SpeechToText from '../../../experimental/speech-to-text/src/index.ts'
import { validateInput } from '../../../experimental/speech-to-text-sensevoice/src/input.ts'
import { prepareImages, inlineImages } from '../../../llm/llm-deepseek/src/images.ts'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { execFileSync } from 'node:child_process'

const signal = new AbortController().signal
const vv = await import(/* @vite-ignore */ pathToFileURL(join(process.env.VV_TARGET_ROOT!, 'index.js')).href)
const audio = await import(/* @vite-ignore */ pathToFileURL(join(process.env.VV_TARGET_ROOT!, 'lib/audio.js')).href)
const { VideoVision } = await import(/* @vite-ignore */ pathToFileURL(join(process.env.VV_TARGET_ROOT!, 'lib/engine.js')).href)
let root: string, source: string, ctx: Context, service: LocalAttachmentStore
let sequence = 0
beforeAll(async () => {
 root = await mkdtemp(join(tmpdir(), 'vv-real-dsh-'))
 process.env.DSH_HOME = join(root, 'home')
 source = join(root, 'source.mkv')
 execFileSync('ffmpeg',['-nostdin','-v','error','-y','-f','lavfi','-i','testsrc2=s=322x186:r=13','-t','3','-c:v','ffv1','-threads','1',source])
 ctx = new Context()
 await ctx.plugin(SystemPrompt)
 await ctx.plugin(ToolRuntime)
 await ctx.plugin(NativeToolExecutor)
 // This fixture supplies only an isolated working path. Tools, attachment storage,
 // schema validation, content rendering and provider image preparation are DSH source.
 ctx.provide('workingDirectory', { defaultDirectory: root, ensure: async () => root })
 await ctx.plugin(LocalAttachmentStore,{ dshHome: join(root,'home'), maxImageBytes:20000,
  maxImagePixels:3000, maxImageDimension:75, maxImagesPerMessage:1, maxMessageImageBytes:30000 })
 service = ctx.attachments as LocalAttachmentStore
 await ctx.plugin(vv, {cacheDirectory:join(root,'cache'),configDirectory:join(root,'config')})
})
afterAll(async()=>{ await ctx?.fiber.dispose(); if(root) await rm(root,{recursive:true,force:true}) })
const call = (args: object) => executeToolFixture(ctx,{signal,callId:ToolCallId('vv-'+(++sequence)),name:'video_vision',arguments:args})

describe('packed Video Vision on DSH source services',()=>{
 it('mounts the actual package and publishes its tool schema and system guidance',async()=>{
  expect(ctx.tools.schemas().some(x=>x.name==='video_vision')).toBe(true)
  const assembled=await ctx.systemPrompt.assemble()
  expect(assembled.tools.some(x=>x.name==='video_vision')).toBe(true)
 })
 it('converts only the host input, persists real attachments and reaches model image preparation',async()=>{
  const result=await call({action:'open',source,frames:3,frame_format:'png',audio_mode:'off'})
  expect(result.isError).toBe(false)
  if(result.isError) throw new Error(JSON.stringify(result))
  const frames=result.value.frames
  expect(frames).toHaveLength(3)
  expect(result.content.filter(x=>x.type==='image')).toHaveLength(3)
  for(const frame of frames){
   expect(frame.attachment_delivery.adapted_to_host).toBe(true)
   expect((await readFile(frame.path)).readUInt32BE(16)).toBe(322)
   expect(frame.image.width*frame.image.height).toBeLessThanOrEqual(3000)
   const saved=await service.readImage(frame.image)
   expect(saved.data.byteLength).toBe(frame.image.bytes)
  }
  const connection={models:[{id:'fixture-vision',inputModalities:['text','image']}],maxRequestFilesBytes:10000000,
   maxInlineRequestImageBytes:10000000,maxImagesPerRequest:30,imageOffloadByteQuantum:1,
   inlineImageOffloadByteQuantum:1,imageOffloadCountQuantum:1}
  const history=[{role:'tool',toolCallId:'vv',content:result.content}]
  const prepared=await prepareImages(history,connection,'fixture-vision',service,()=>undefined,signal)
  expect(prepared.versions.size).toBeGreaterThan(0)
  for(const version of prepared.versions.values()) expect(version.data.byteLength).toBeGreaterThan(0)
  expect(inlineImages(prepared.messages,prepared.versions,connection)).toHaveLength(1)
  await expect(prepareImages(history,{...connection,maxImagesPerRequest:1},'fixture-vision',service,()=>undefined,signal)).rejects.toThrow(/route budget/)
 })
 it('uses actual source rejection and adaptation rather than suppressing the host image policy',async()=>{
  const engine=new VideoVision(root,{cacheDirectory:join(root,'raw')})
  const asset=await engine.open(source,signal)
  const [frame]=await engine.frames(asset,{frames:1,frame_format:'png'},signal)
  await expect(service.saveImage({data:await readFile(frame.path),mediaType:'image/png'})).rejects.toMatchObject({code:'IMAGE_TOO_MANY_PIXELS'})
  const result=await call({action:'open',source,frames:1,frame_format:'png',audio_mode:'off'})
  expect(result.isError).toBe(false)
 })
 it('retains a requested batch larger than the former plugin cap through the real tool executor',async()=>{
  const result=await call({action:'open',source,frames:19,audio_mode:'off'})
  expect(result.isError).toBe(false)
  if(result.isError) throw new Error(JSON.stringify(result))
  expect(result.content.filter(x=>x.type==='image')).toHaveLength(19)
 })
 it('calls a real DSH speech registry and its WAV admission, preserving all accepted samples',async()=>{
  const speechCtx=new Context()
  const speech=new SpeechToText(speechCtx,{defaultProvider:{get:()=> 'fixture'},language:{get:()=> 'auto'}})
  let accepted=0, rejects=0
  const dispose=speech.register({info:{id:'fixture',name:'Fixture',languages:['auto']},transcribe:async(input)=>{
   try{validateInput(input.audio,'auto',12044)}catch(error){rejects++;throw error}
   accepted+=input.audio.length-44
   return{text:'controlled recognition through real DSH registry'}
  }})
  try{
   const engine=new VideoVision(root,{cacheDirectory:join(root,'speech')})
   const asset=await engine.open(source,signal)
   const pcm=Buffer.alloc(96000);let seed=7
   for(let i=0;i<pcm.length;i+=2){seed=(Math.imul(seed,1664525)+1013904223)>>>0;pcm.writeInt16LE((seed>>>16)-32768,i)}
   const result=await audio.transcribeClip(engine,asset,{pcm,sampleRate:16000,start:0,end:3},speech,
    {available:true,state:'preparing',provider:'fixture'},'auto',signal)
   expect(result.state).toBe('available');expect(rejects).toBeGreaterThan(0);expect(accepted).toBe(pcm.length)
   expect(result.segments[0].start_seconds).toBe(0);expect(result.segments.at(-1).end_seconds).toBe(3)
   for(let i=1;i<result.segments.length;i++)expect(result.segments[i-1].end_seconds).toBe(result.segments[i].start_seconds)
  }finally{await dispose();await speechCtx.fiber.dispose()}
 })
})
