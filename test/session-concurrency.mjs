import assert from 'node:assert/strict';
import { mkdtemp,readFile,rm } from 'node:fs/promises';
import { join } from 'node:path';import { tmpdir } from 'node:os';
import { BrowserSessions } from '../lib/browser-session.js';
import { registerCacheTransport } from '../lib/settings.js';
const deferred=()=>{let resolve;return {promise:new Promise(r=>resolve=r),resolve};};
const directory=await mkdtemp(join(tmpdir(),'vv-concurrency-'));
const entered=deferred(),release=deferred();let selects=0;
const localSession={request:async op=>op==='status'?{ready:true,snapshotState:'absent'}:{cookies:[]},cancel(){},close:async()=>{},select:async()=>{selects++;return{};},clear:async()=>{entered.resolve();await release.promise;return{cleared:true,failures:[]};}};
const service=new BrowserSessions({browserSessionAuthorized:true},{directory,localSession});
try {
 await service.status();
 const clear=service.clear();await entered.promise;
 const enable=service.setAuthorization({enabled:true});const select=service.selectSource('synthetic');
 await new Promise(r=>setImmediate(r));
 assert.equal(service.enabled(),false);assert.equal(selects,0);
 assert.deepEqual(JSON.parse(await readFile(join(directory,'vv-plugin-authorization-v1.json'))),{enabled:false});
 await assert.rejects(service.fetch('https://example.test/'),/授权已关闭/);
 release.resolve();await Promise.all([clear,enable,select]);assert.equal(service.enabled(),true);assert.equal(selects,1);
 // Stress the actual shared-temp authorization writer, not just a mock lock.
 await Promise.all(Array.from({length:40},(_,i)=>service.setAuthorization({enabled:i%2===0})));
 assert.equal(service.enabled(),false);assert.deepEqual(JSON.parse(await readFile(join(directory,'vv-plugin-authorization-v1.json'))),{enabled:false});
 console.log('PASS: runtime clear blocks concurrent ON/select until completion; HTTP revoked; 40 overlapping authorization writes preserve final state.');
 const disposeEntered=deferred(),disposeRelease=deferred();let closeCount=0;
 const disposingService=new BrowserSessions({browserSessionAuthorized:true},{directory:join(directory,'dispose'),localSession:{...localSession,clear:async()=>{disposeEntered.resolve();await disposeRelease.promise;return{cleared:true,failures:[]};},close:async()=>{closeCount++;}}});
 await disposingService.status();const pendingClear=disposingService.clear();await disposeEntered.promise;
 const queuedEnable=assert.rejects(disposingService.setAuthorization({enabled:true}),/服务已关闭/);
 const queuedSelect=assert.rejects(disposingService.selectSource('synthetic'),/服务已关闭/);
 const disposed=disposingService.dispose();assert.equal(disposingService.enabled(),false);
 await assert.rejects(disposingService.fetch('https://example.test/'),/服务已关闭/);
 await assert.rejects(disposingService.setup(),/服务已关闭/);
 disposeRelease.resolve();await Promise.all([pendingClear,queuedEnable,queuedSelect,disposed]);
 await disposingService.dispose();assert.equal(closeCount,1);assert.equal(disposingService.enabled(),false);
 assert.deepEqual(JSON.parse(await readFile(join(directory,'dispose','vv-plugin-authorization-v1.json'))),{enabled:false});
 console.log('PASS: dispose immediately blocks reads, rejects queued ON/select and waits for pending clear; repeated dispose closes once.');

 const routes=new Map(),events=[];const persistEntered=deferred(),persistRelease=deferred(),clearEntered=deferred(),clearRelease=deferred();
 const manager={persistAuthorization:async({enabled})=>{events.push('persist:'+enabled);if(!enabled){persistEntered.resolve();await persistRelease.promise;}return{};},browserSessions:{clear:async()=>{events.push('clear');clearEntered.resolve();await clearRelease.promise;return{cleared:true,failures:[]};}}};
 const dispose=registerCacheTransport({fetch:{register:route=>{routes.set(route.path,route.fetch);return()=>{};}}},manager);
 async function call(endpoint,payload){const method='video-vision/cache/'+endpoint;const response=await routes.get('/api/'+method)(new Request('http://fixture/api/'+method,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({type:'client-request',rpcId:'fixture',method,payload})}));return(await response.json()).result;}
 const cleaning=call('browser-clear',{confirm:true});await persistEntered.promise;
 const enabling=call('browser-authorization',{enabled:true});await new Promise(r=>setImmediate(r));assert.deepEqual(events,['persist:false']);
 persistRelease.resolve();await clearEntered.promise;assert.deepEqual(events,['persist:false','clear']);
 clearRelease.resolve();assert.equal((await cleaning).ok,true);assert.equal((await enabling).ok,true);assert.deepEqual(events,['persist:false','clear','persist:true']);
 dispose();console.log('PASS: actual RPC serializes host persistence + runtime cleanup against another client authorization request.');
}finally{release.resolve();await service.dispose();await rm(directory,{recursive:true,force:true});}
