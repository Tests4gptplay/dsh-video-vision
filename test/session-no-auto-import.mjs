// Synthetic source/storage/network only; real session routing, no credentials/browser.
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import Source from '../browser-session/cdp-source.cjs';
import Session from '../browser-session/cdp-session.cjs';
import {BrowserSessions} from '../lib/browser-session.js';
import {NativeSession} from '../lib/native-session.js';
import {makeTool} from '../index.js';
const directory=await mkdtemp(join(tmpdir(),'vv-no-auto-import-'));
let captures=0, available=true, failDecrypt=false;
const sourceInfo={kind:'playwright-extension',identity:'synthetic-browser-confirmed',label:'Synthetic Chrome',extension:{channel:'chrome',executablePath:'/synthetic/never-opened'}};
const storage={isEncryptionAvailable:()=>true,encryptString:x=>Buffer.from(x),decryptString:x=>{if(failDecrypt)throw Error('synthetic locked keyring');return x.toString();},getSelectedStorageBackend:()=> 'synthetic-only'};
const make=()=>{
 const source=Source.createCdpSource({directory,discover:async()=>[],discoverExtensions:async()=>available?[sourceInfo]:[],inspectExtension:async()=>({state:'unknown'}),captureExtension:async()=>{captures++;return [{name:'synthetic',value:'fixture',domain:'.bilibili.com',path:'/',secure:true}];}});
 const localSession=Session.createCdpSession({directory,source,createStorage:async()=>storage});
 const network=async url=>new Response(JSON.stringify({code:0,data:[],url:String(url)}),{status:200});
 const sessions=new BrowserSessions({browserSessionAuthorized:true},{directory,localSession,fetch:network});
 return {source,sessions,native:new NativeSession(sessions,network)};
};
let f;
try {
 f=make();await f.sessions.selectSource((await f.source.list())[0].id);
 await f.native.api('/x/player/pagelist',{bvid:'synthetic'});assert.equal(captures,0,'No snapshot must not trigger import');
 await f.sessions.setup();assert.equal(captures,1,'Only explicit setup captures');
 for(let i=0;i<3;i++){
  await f.native.api('/x/player/pagelist',{bvid:'synthetic'});
  await (await f.native.fetch('https://media.example.test/clip')).text();
  await f.sessions.status();await f.sessions.status({checkExtension:true});
 }
 const tool=makeTool({workingDirectory:{ensure:async()=>directory},get:()=>undefined},
  {browserSessionAuthorized:true,configDirectory:join(directory,'synthetic-methods')},f.native);
 const execution={agent:{},signal:new AbortController().signal};
 for(const action of ['status','methods','status']) {
  const output=await tool.execute({action},execution);
  assert.equal(output.browser_session.imported,true);
 }
 assert.equal(captures,1,'Media, API, status/install-check and actual conversation status/methods tools never capture');
 available=false;await f.sessions.dispose();f=make();
 await f.native.api('/x/player/pagelist',{bvid:'synthetic'});
 await (await f.native.fetch('https://media.example.test/clip')).text();
 assert.equal(captures,1,'Browser unavailable and service restart still read saved copy');
 await f.sessions.dispose();failDecrypt=true;f=make();
 await assert.rejects(f.native.api('/x/player/pagelist',{}),{code:'decrypt_failed'});
 assert.equal(captures,1,'Unreadable snapshot fails instead of reconnecting');
 console.log('PASS real source/session/snapshot/HTTP routing: no capture for absent, saved, offline/restarted or unreadable snapshots, media/API/status/install-check; synthetic boundaries only.');
} finally {await f?.sessions.dispose();await rm(directory,{recursive:true,force:true});}
