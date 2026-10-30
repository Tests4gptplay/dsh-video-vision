// Synthetic-only regression; no browser processes, native secrets or network.
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Snapshot from '../browser-session/snapshot.cjs';
import { BrowserSessions } from '../lib/browser-session.js';
const root = await mkdtemp(join(tmpdir(), 'vv-unified-'));
const cookie = { name: 'fixture', value: 'synthetic', domain: '.example.test', path: '/', secure: true };
const storage = { isEncryptionAvailable: () => true, encryptString: text => Buffer.from(text), decryptString: bytes => bytes.toString(), getSelectedStorageBackend: () => 'synthetic-only' };
const services = [];
async function fixture(name, options = {}) {
 const directory = join(root, name); await mkdir(directory, {recursive:true});
 await writeFile(join(directory,'vv-plugin-authorization-v1.json'), JSON.stringify({enabled:true}));
 const service = Snapshot.createSnapshotService({directory,safeStorage:storage,capture:async()=>[cookie],...options});
 services.push(service);return {directory,service,file:join(directory,'session-state.bin')};
}
try {
 let f = await fixture('states');
 assert.equal((await f.service.status()).snapshotState,'absent');
 await f.service.dispatch({op:'import'});
 assert.equal((await f.service.status()).snapshotState,'ready');
 assert.deepEqual((await f.service.dispatch({op:'cookies',url:'https://example.test/'})).cookies,[cookie]);
 assert.deepEqual((await f.service.dispatch({op:'cookies',url:'https://other.test/'})).cookies,[]);
 const empty = await fixture('empty',{capture:async()=>[]});
 await empty.service.dispatch({op:'import'});
 const emptyState=await empty.service.status();assert.equal(emptyState.snapshotState,'empty');assert.equal(emptyState.imported,true);assert.equal(emptyState.cookieCount,0);
 const bad = await fixture('decrypt',{safeStorage:{...storage,decryptString:()=>{throw Error('synthetic locked store');}}});
 await writeFile(bad.file,'synthetic unreadable cipher');
 let state=await bad.service.status();assert.equal(state.snapshotState,'decrypt_failed');assert.equal(state.imported,null);assert.equal(state.cookieCount,null);
 await assert.rejects(bad.service.dispatch({op:'cookies',url:'https://example.test/'}),e=>e.code==='decrypt_failed');
 assert.equal(await readFile(bad.file,'utf8'),'synthetic unreadable cipher');
 const unreadable = await fixture('read');await mkdir(unreadable.file);await writeFile(join(unreadable.file,'keep'),'synthetic sentinel');
 state=await unreadable.service.status();assert.equal(state.snapshotState,'read_failed');assert.equal(state.imported,null);assert.equal(state.cookieCount,null);
 await assert.rejects(unreadable.service.dispatch({op:'cookies',url:'https://example.test/'}),e=>e.code==='read_failed');
 const partial=await unreadable.service.clear();assert.equal(partial.cleared,false);assert(partial.failures.length>0);
 assert.equal(await readFile(join(unreadable.file,'keep'),'utf8'),'synthetic sentinel');
 const restarted=Snapshot.createSnapshotService({directory:unreadable.directory,safeStorage:storage});services.push(restarted);
 assert.equal((await restarted.status()).connected,false);
 await assert.rejects(restarted.dispatch({op:'cookies',url:'https://example.test/'}),e=>e.code==='no_snapshot');
 let entered,release;const started=new Promise(resolve=>{entered=resolve;});
 const late=await fixture('late',{capture:async()=>{entered();return new Promise(resolve=>{release=resolve;});}});
 const importing=late.service.dispatch({op:'import'});const rejected=assert.rejects(importing,e=>e.code==='disabled');await started;
 const clearing=late.service.clear();release([cookie]);await rejected;
 assert.equal((await clearing).cleared,true);assert.equal((await late.service.status()).connected,false);
 await assert.rejects(access(late.file),e=>e.code==='ENOENT');
 const lateRestart=Snapshot.createSnapshotService({directory:late.directory,safeStorage:storage});services.push(lateRestart);
 await assert.rejects(lateRestart.dispatch({op:'cookies',url:'https://example.test/'}),e=>e.code==='no_snapshot');
 await assert.rejects(Snapshot.captureCookies({discover:()=>{throw Error('must not auto discover');}}),e=>e.code==='browser_source_required');
 // A status refresh during explicit re-import must not re-latch the old clear marker.
 let enteredAgain,releaseAgain;const againStarted=new Promise(r=>enteredAgain=r);
 const again=await fixture('reimport',{capture:async()=>{enteredAgain();return new Promise(r=>releaseAgain=r);}});
 await writeFile(again.file+'.cleared','synthetic revocation');
 const reimport=again.service.dispatch({op:'import'});await againStarted;
 const pendingState=await again.service.status();assert.equal(pendingState.importing,true);assert.ok(['unknown','cleared'].includes(pendingState.snapshotState));
 releaseAgain([cookie]);const restored=await reimport;
 assert.equal(restored.snapshotState,'ready');assert.equal(restored.connected,true);
 assert.deepEqual((await again.service.dispatch({op:'cookies',url:'https://example.test/'})).cookies,[cookie]);
 console.log('PASS: absent/ready/empty/read-failed/decrypt-failed, unchanged failed bytes, partial clear retained evidence, restart revoke, late-import clear, explicit capture source.');
 for(const platform of ['win32','linux','darwin']) {
  const calls=[];const directory=join(root,platform);
  const localSession={ request:async(op)=>{calls.push(op);return op==='status'?{ready:true,sourceId:'synthetic',sources:[],snapshotState:'ready',source:'Synthetic'}:op==='cookies'?{cookies:[cookie]}:{imported:true};}, select:async id=>{calls.push('select:'+id);return {sourceId:id};},cancel:()=>calls.push('cancel'),clear:async()=>{calls.push('clear');return {cleared:true,failures:[]};},close:async()=>calls.push('close')};
  const browser=new BrowserSessions({browserSessionAuthorized:true},{directory,platform,localSession,fetch:async(_url,options)=>{assert.equal(options.headers.get('cookie'),'fixture=synthetic');return new Response('fixture');}});
  try {
   assert.equal((await browser.status()).localCapture,true);await browser.selectSource('synthetic');await browser.setup();
   assert.equal(await (await browser.fetch('https://example.test/')).text(),'fixture');
   assert.equal((await browser.clear()).cleared,true);assert.equal(browser.enabled(),false);
   assert.deepEqual(JSON.parse(await readFile(join(directory,'vv-plugin-authorization-v1.json'))),{enabled:false});
   await assert.rejects(browser.fetch('https://example.test/'),/授权已关闭/);
   assert(calls.includes('import')&&calls.includes('cookies')&&calls.includes('clear'));
  }finally{await browser.dispose();}
 }
 console.log('PASS: win32/linux/darwin same injected local-session import/select/auth HTTP/clear contract. Synthetic dependency logic, not real OS keyring/browser proof.');
}finally{await Promise.allSettled(services.map(s=>s.close()));await rm(root,{recursive:true,force:true});}
