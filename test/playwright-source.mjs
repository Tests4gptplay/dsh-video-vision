import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import Extension from '../browser-session/playwright-source.cjs';
import {createCdpSource} from '../browser-session/cdp-source.cjs';
import {createCdpSession} from '../browser-session/cdp-session.cjs';
const linux=Extension.extensionSources({platform:'linux',home:'/synthetic/home',env:{}})[0];
assert.equal(linux.extension.userDataDir,'/synthetic/home/.config/google-chrome');
assert.equal(linux.extension.profileDirectory,'Default');
assert.match(Extension.extensionSources({platform:'win32',home:'C:\\Users\\Synthetic',env:{LOCALAPPDATA:'C:\\Synthetic'}})[0].extension.userDataDir,/Google\\Chrome\\User Data$/);
assert.match(Extension.extensionSources({platform:'darwin',home:'/synthetic/home',env:{}})[0].extension.userDataDir,/Library\/Application Support\/Google\/Chrome$/);
assert.throws(()=>Extension.extensionSources({profileDirectory:'../other'}));
let probes=[];
const io={lstat:async path=>{probes.push(path);return{isDirectory:()=>true,isSymbolicLink:()=>false};}};
assert.equal((await Extension.inspectInstallation(linux,{io})).state,'installed');
assert.deepEqual(probes,[join(linux.extension.userDataDir,'Default','Extensions',Extension.EXTENSION_ID)]);
assert.equal((await Extension.inspectInstallation(linux,{io:{lstat:async()=>{throw Object.assign(Error(),{code:'ENOENT'});}}})).state,'not_installed');
assert.equal((await Extension.inspectInstallation(linux,{io:{lstat:async()=>{throw Object.assign(Error(),{code:'EACCES'});}}})).state,'unknown');
const dir=await fs.mkdtemp(join(tmpdir(),'vv-extension-source-'));
try{
 let inspections=0,captures=0;
 const source=createCdpSource({directory:dir,discover:async()=>[{identity:'profile:/synthetic/cdp',endpoint:'ws://127.0.0.1:1/test',label:'CDP fixture'}],discoverExtensions:()=>[linux],
  inspectExtension:async s=>{assert.equal(s.extension.profileDirectory,'Default');inspections++;return{state:'unknown'};},
  captureExtension:async(s,{signal})=>{signal.throwIfAborted();assert.equal(s.extension.profileDirectory,'Default');captures++;return[];}});
 const items=await source.list();assert.equal(items.length,2);assert.equal(inspections,0);
 await source.select(items[1].id);await source.selected();await source.list();assert.equal(inspections,0,'list/select/status metadata never scans extension installation');
 const session=createCdpSession({directory:dir,source,createStorage:async()=>({}),createService:({capture})=>({status:async()=>({ready:true}),dispatch:async(message,signal)=>message.op==='import'?{cookies:await capture({signal})}:{},close:async()=>{}})});
 await session.status();assert.equal(inspections,0);
 await session.status({checkExtension:true});assert.equal(inspections,1);
 await session.status();assert.equal(inspections,1);
 await session.request('import');assert.equal(inspections,2);assert.equal(captures,1,'unknown installation does not block an actual connection attempt');
 await source.select(items[0].id);await session.status({checkExtension:true});assert.equal(inspections,2,'CDP source does not inspect another browser profile');
 await session.close();
 console.log('PASS selected-profile fixed-ID installation checks only on explicit check/import; cached status, no profile enumeration, unknown does not gate capture; CDP compatibility retained.');
}finally{await fs.rm(dir,{recursive:true,force:true});}

// Browser-confirmed entry checks application files only, never assumes Default.
for (const platform of ['win32','darwin','linux']) {
 const checked=[];const entries=await Extension.browserConfirmedSources({platform,env:{LOCALAPPDATA:'C:\\Users\\Fixture\\AppData\\Local'},home:'/synthetic/home',io:{stat:async file=>{checked.push(file);return{isFile:()=>true}}}});
 assert.equal(entries.length,1);assert.equal(entries[0].extension.userDataDir,undefined);assert.equal(entries[0].extension.profileDirectory,undefined);assert.ok(entries[0].extension.executablePath);assert.ok(checked.every(p=>!p.includes('User Data')&&!p.includes('Profile')));
 let probes=0;assert.equal((await Extension.inspectInstallation(entries[0],{io:{lstat:async()=>{probes++;throw Error('must not inspect unknown profile')}}})).state,'unknown');assert.equal(probes,0);
}
console.log('PASS browser-confirmed save slot: application-only discovery, no assumed profile or profile scan, unknown installation does not trigger filesystem checks.');
{
 const {EventEmitter}=await import('node:events');let args;
 await Extension.openStore({sources:async()=>[{extension:{executablePath:'/synthetic/Chrome'}}],spawn:(exe,argv,options)=>{args={exe,argv,options};const child=new EventEmitter();child.unref=()=>{};queueMicrotask(()=>child.emit('spawn'));return child;}});
 assert.equal(args.exe,'/synthetic/Chrome');assert.deepEqual(args.argv,[Extension.STORE_URL]);assert.equal(args.options.shell,false);
 await assert.rejects(Extension.openStore({sources:async()=>[]}),/Chrome/);
 console.log('PASS store opens only a known Chrome executable on explicit action; no profile argument or installation assumption.');
}
for(const cleanupFails of [false,true]) {
 const root=await fs.mkdtemp(join(tmpdir(),'vv-extension-cancel-'));let started,finish;const begins=new Promise(r=>started=r),finishes=new Promise(r=>finish=r);
 try {
  const src=createCdpSource({directory:root,discover:async()=>[],discoverExtensions:()=>[linux],captureExtension:async(_s,{signal})=>{started();await finishes;if(cleanupFails)throw Object.assign(Error('synthetic cleanup failed'),{code:'cleanup_failed'});signal.throwIfAborted();return[]}});
  await src.select((await src.list())[0].id);const controller=new AbortController();let settled=false;
  const pending=src.capture({signal:controller.signal});pending.then(()=>settled=true,()=>settled=true);
  await begins;controller.abort();await new Promise(r=>setImmediate(r));assert.equal(settled,false,'Extension cancellation waits for worker cleanup');
  const rejected=assert.rejects(pending,cleanupFails?{code:'cleanup_failed'}:{name:'AbortError'});finish();await rejected;
 }finally{await fs.rm(root,{recursive:true,force:true})}
}
console.log('PASS extension cancellation waits for cleanup and preserves cleanup_failed instead of hiding it as cancellation.');
