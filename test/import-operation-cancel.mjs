import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';import {join} from 'node:path';
import Session from '../browser-session/cdp-session.cjs';
const directory=await mkdtemp(join(tmpdir(),'vv-scoped-cancel-'));
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
let started=deferred(), pending;
const source={selected:async()=>({id:'synthetic',label:'Synthetic'}),list:async()=>[{id:'synthetic',label:'Synthetic'}],capture:({signal})=>new Promise((resolve,reject)=>{pending={signal,resolve};signal.addEventListener('abort',()=>reject(signal.reason),{once:true});started.resolve();})};
const storage={isEncryptionAvailable:()=>true,encryptString:x=>Buffer.from(x),decryptString:x=>x.toString()};
const session=Session.createCdpSession({directory,source,createStorage:async()=>storage});
try {
 await writeFile(join(directory,'vv-plugin-authorization-v1.json'),JSON.stringify({enabled:true}));
 const a=session.request('import');await started.promise;
 const aid=(await session.status()).importOperationId;assert.equal(typeof aid,'string');
 pending.resolve([{name:'synthetic',value:'old-copy',domain:'example.test',path:'/'}]);await a;
 assert.equal((await session.status()).importOperationId,null);
 started=deferred();const b=session.request('import');const rejected=assert.rejects(b);await started.promise;
 const bid=(await session.status()).importOperationId;assert.notEqual(aid,bid);
 assert.equal(session.cancelImport(aid),0);assert.equal(pending.signal.aborted,false,'Stale displayed operation cannot cancel a newer import');
 assert.equal(session.cancelImport(bid),1);await rejected;
 assert.equal((await session.request('cookies',{url:'https://example.test/'})).cookies[0].value,'old-copy','Cancellation preserves committed snapshot');
 started=deferred();const c=session.request('import');const earlyRejected=assert.rejects(c);await started.promise;
 assert.equal(session.cancelImport(),1,'Original explicit cancellation remains compatible');await earlyRejected;
 console.log('PASS in-memory operation ids: stale cancel cannot stop newer import, matching cancel preserves old snapshot, original explicit cancellation compatible. Synthetic only.');
} finally {await session.close();await rm(directory,{recursive:true,force:true});}
