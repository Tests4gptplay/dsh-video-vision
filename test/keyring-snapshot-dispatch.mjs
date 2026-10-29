import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import Snapshot from '../browser-session/snapshot.cjs';
import Store from '../browser-session/keyring-storage.cjs';
const root=await mkdtemp(join(tmpdir(),'vv-keyring-dispatch-'));const values=new Map();let writes=0,captures=0;
class Entry{constructor(service,account){this.id=service+account;}getPassword(){return values.get(this.id)??null;}setPassword(v){writes++;values.set(this.id,v);}}
const storage=()=>Store.createKeyringStorage({directory:root,keyringModule:{Entry}});
const capture=async()=>{captures++;return [{name:'qa',value:'fictional-only',domain:'.example.test',path:'/',secure:true,httpOnly:true,sameSite:'lax'}];};
let service;
try{
 await writeFile(join(root,'authorization.json'),JSON.stringify({enabled:false,syncToNative:false}));
 await writeFile(join(root,'session-state.bin'),'existing-electron-fixture');
 service=Snapshot.createSnapshotService({directory:root,safeStorage:await storage(),capture,filename:'session-state-keyring.bin',source:'browser-extension'});
 assert.equal((await service.status()).imported,false);assert.equal(writes,0);assert.equal(captures,0);
 await assert.rejects(service.dispatch({op:'import'}),e=>e.code==='disabled');
 await writeFile(join(root,'authorization.json'),JSON.stringify({enabled:true,syncToNative:false}));
 assert.equal((await service.dispatch({op:'import'})).imported,true);assert.equal(writes,1);assert.equal(captures,1);
 const bytes=await readFile(join(root,'session-state-keyring.bin'));assert(!bytes.includes(Buffer.from('fictional-only')));assert.equal((await stat(join(root,'session-state-keyring.bin'))).mode&0o777,0o600);
 assert.equal(await readFile(join(root,'session-state.bin'),'utf8'),'existing-electron-fixture');
 assert.equal((await service.dispatch({op:'cookies',url:'https://example.test/'})).cookies.length,1);
 await assert.rejects(service.dispatch({op:'sync',url:'https://example.test/'}),e=>e.code==='sync_disabled');
 await service.close();
 service=Snapshot.createSnapshotService({directory:root,safeStorage:await storage(),capture,filename:'session-state-keyring.bin'});
 assert.equal((await service.status()).imported,true);assert.equal(writes,1);
 await service.dispatch({op:'import'});assert.equal(captures,2);assert.equal(writes,1);
 await writeFile(join(root,'authorization.json'),JSON.stringify({enabled:false,syncToNative:false}));
 await assert.rejects(service.dispatch({op:'cookies',url:'https://example.test/'}),e=>e.code==='disabled');
 await service.close();
 let finishPrepare; const preparing = new Promise(resolve => { finishPrepare = resolve; });
 await writeFile(join(root,'authorization.json'),JSON.stringify({enabled:true,syncToNative:false}));
 service=Snapshot.createSnapshotService({directory:root,safeStorage:{prepare:()=>preparing,isEncryptionAvailable:()=>true},capture});
 const beforeCaptures=captures; const revoked=service.dispatch({op:'import'});
 await writeFile(join(root,'authorization.json'),JSON.stringify({enabled:false,syncToNative:false}));
 finishPrepare();await assert.rejects(revoked,e=>e.code==='disabled');assert.equal(captures,beforeCaptures);
 console.log('PASS new keyring adapter/core dispatch: explicit import/refresh, encrypted isolated file, restart load, grants; no socket or real keyring/browser.');
}finally{await service?.close();await rm(root,{recursive:true,force:true});}
