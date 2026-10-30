import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import Snapshot from '../browser-session/snapshot.cjs';
const root=await fs.mkdtemp(join(tmpdir(),'vv-transactions-'));
const cookie=value=>({name:'fixture',value,domain:'example.test'});
const bytes=value=>Buffer.from(JSON.stringify({version:1,cookies:[cookie(value)]}));
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return{promise,resolve};};
const storage={isEncryptionAvailable:()=>true,encryptString:async s=>Buffer.from(s),decryptString:async b=>b.toString()};
const realRename=fs.rename,realRead=fs.readFile;
try{
 for(const present of [false,true]){
  const directory=join(root,String(present));await fs.mkdir(directory);await fs.writeFile(join(directory,'vv-plugin-authorization-v1.json'),'{"enabled":true}');
  const file=join(directory,'session-state.bin');if(present)await fs.writeFile(file,bytes('old'));
  const entered=deferred(),release=deferred();
  fs.rename=async(from,to)=>{if(to===file&&from.endsWith('.tmp')){entered.resolve();await release.promise;}return realRename(from,to);};
  const service=Snapshot.createSnapshotService({directory,safeStorage:storage,capture:async()=>[cookie('new')]});
  const controller=new AbortController(),pending=service.dispatch({op:'import'},controller.signal);const rejected=assert.rejects(pending,{code:'disabled'});
  await entered.promise;controller.abort();release.resolve();await rejected;
  if(present)assert.deepEqual(await fs.readFile(file),bytes('old'));else await assert.rejects(fs.access(file),{code:'ENOENT'});
  await service.close();fs.rename=realRename;
 }
 const directory=join(root,'loads');await fs.mkdir(directory);await fs.writeFile(join(directory,'vv-plugin-authorization-v1.json'),'{"enabled":true}');
 const file=join(directory,'session-state.bin');await fs.writeFile(file,bytes('old'));
 const entered=deferred(),release=deferred();
 const service=Snapshot.createSnapshotService({directory,capture:async()=>[cookie('new')],safeStorage:{...storage,decryptString:async b=>{entered.resolve();await release.promise;return b.toString();}}});
 const stale=service.status();await entered.promise;const imported=await service.dispatch({op:'import'});assert.equal(imported.committed,true);release.resolve();await stale;
 assert.equal((await service.dispatch({op:'cookies',url:'https://example.test/'})).cookies[0].value,'new');
 await service.close();
 // A stale ENOENT result must not publish absent after a successful import.
 const missing=join(root,'missing-race');await fs.mkdir(missing);await fs.writeFile(join(missing,'vv-plugin-authorization-v1.json'),'{"enabled":true}');
 const missingFile=join(missing,'session-state.bin'),missingHit=deferred(),missingRelease=deferred();let first=true;
 fs.readFile=async(path,...args)=>{if(path===missingFile&&first){first=false;missingHit.resolve();await missingRelease.promise;throw Object.assign(Error('missing'),{code:'ENOENT'});}return realRead(path,...args);};
 const empty=Snapshot.createSnapshotService({directory:missing,safeStorage:storage,capture:async()=>[cookie('new')]});const emptyStatus=empty.status();await missingHit.promise;
 await empty.dispatch({op:'import'});missingRelease.resolve();await emptyStatus;assert.equal((await empty.status()).snapshotState,'ready');await empty.close();fs.readFile=realRead;
 // While rename has exposed uncommitted bytes, status cannot decrypt/publish them.
 const interim=join(root,'interim');await fs.mkdir(interim);await fs.writeFile(join(interim,'vv-plugin-authorization-v1.json'),'{"enabled":true}');const interimFile=join(interim,'session-state.bin');await fs.writeFile(interimFile,bytes('old'));
 const renameHit=deferred(),renameRelease=deferred();let decrypts=0;
 fs.rename=async(from,to)=>{const result=await realRename(from,to);if(from.endsWith('.tmp')&&to===interimFile){renameHit.resolve();await renameRelease.promise;}return result;};
 const intermediary=Snapshot.createSnapshotService({directory:interim,safeStorage:{...storage,decryptString:async b=>{decrypts++;return b.toString();}},capture:async()=>[cookie('new')]});const cancel=new AbortController();const active=intermediary.dispatch({op:'import'},cancel.signal);const cancelled=assert.rejects(active,{code:'disabled'});await renameHit.promise;
 assert.equal((await intermediary.status()).importing,true);assert.equal(decrypts,0);cancel.abort();renameRelease.resolve();await cancelled;assert.equal((await intermediary.dispatch({op:'cookies',url:'https://example.test/'})).cookies[0].value,'old');await intermediary.close();fs.rename=realRename;
 // Failed rollback never reports success or allows the late new snapshot to read.
 const broken=join(root,'rollback');await fs.mkdir(broken);await fs.writeFile(join(broken,'vv-plugin-authorization-v1.json'),'{"enabled":true}');const target=join(broken,'session-state.bin');await fs.writeFile(target,bytes('old'));
 const c=new AbortController();fs.rename=async(from,to)=>{if(from.endsWith('.rollback'))throw Object.assign(Error('denied'),{code:'EACCES'});const value=await realRename(from,to);if(to===target)c.abort();return value;};
 const failure=Snapshot.createSnapshotService({directory:broken,safeStorage:storage,capture:async()=>[cookie('new')]});
 await assert.rejects(failure.dispatch({op:'import'},c.signal),{code:'rollback_failed'});
 assert.deepEqual(await fs.readFile(target+'.rollback'),bytes('old'));await assert.rejects(failure.dispatch({op:'cookies',url:'https://example.test/'}),{code:'no_snapshot'});await failure.close();fs.rename=realRename;
 const restart=Snapshot.createSnapshotService({directory:broken,safeStorage:storage,capture:async()=>[cookie('again')]});assert.equal((await restart.status()).connected,false);await assert.rejects(restart.dispatch({op:'import'}),{code:'rollback_failed'});assert.deepEqual(await fs.readFile(target+'.rollback'),bytes('old'));await restart.close();
 console.log('PASS cancellation during rename restores old or absent state; failed rollback retains evidence and blocks reads; stale decrypt cannot overwrite newer committed import.');
}finally{fs.rename=realRename;fs.readFile=realRead;await fs.rm(root,{recursive:true,force:true});}
