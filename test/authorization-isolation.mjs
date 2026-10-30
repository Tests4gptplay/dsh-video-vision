import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {BrowserSessions} from '../lib/browser-session.js';
import Session from '../browser-session/cdp-session.cjs';
import Protocol from '../browser-session/protocol.cjs';
// Exact historical modules are materialized only inside this test's temporary
// directory. They never enter the product or run start()/Desktop IPC.
const baseline='cde7de6d8a83695291b7c6492805fe04d442f5c0';
const history=resolve(process.env.VV_LEGACY_TEST_SOURCE || '.');
const root=await fs.mkdtemp(join(tmpdir(),'vv-authorization-isolation-'));
const fixture=join(root,'historical');await fs.mkdir(fixture);
const storage={isEncryptionAvailable:async()=>true,encryptString:async s=>Buffer.from(s),decryptString:async b=>b.toString()};
const cookies=value=>[{name:'fixture',value,domain:'example.test',path:'/',secure:true}];
try{
 for(const name of ['protocol.cjs','snapshot.cjs'])await fs.writeFile(join(fixture,name),execFileSync('git',['show',baseline+':browser-session/'+name],{cwd:history}));
 await fs.writeFile(join(fixture,'discovery.cjs'),"module.exports={discoverBrowserEndpoints(){throw Error('Forbidden historical discovery');},endpointFromPortFile(){throw Error('Forbidden historical discovery');}};");
 const require=createRequire(import.meta.url),Old=require(join(fixture,'snapshot.cjs')),OldProtocol=require(join(fixture,'protocol.cjs'));
 const directory=join(root,'state');await fs.mkdir(directory);const oldFile=join(directory,'authorization.json');
 const disabled=Buffer.from('{"enabled":false,"syncToNative":false}');await fs.writeFile(oldFile,disabled);
 const old=Old.createSnapshotService({directory,safeStorage:storage,capture:async()=>cookies('old')});
 const id='a'.repeat(64),source={selected:async()=>({id,storageId:id,label:'Synthetic'}),list:async()=>[{id,label:'Synthetic',available:true}],select:async()=>{},capture:async()=>cookies('new')};
 const local=Session.createCdpSession({directory,source,createStorage:async()=>storage});
 const modern=new BrowserSessions({browserSessionAuthorized:true},{directory,localSession:local,fetch:async(_url,options)=>{assert.equal(options.headers.get('cookie'),'fixture=new');return new Response('authenticated synthetic request');}});
 try{
  await modern.status();assert.deepEqual(await fs.readFile(oldFile),disabled,'Constructor true must not reopen retired authorization');
  for(const enabled of [false,true,true]){
   await modern.setAuthorization({enabled});assert.deepEqual(await fs.readFile(oldFile),disabled);
   assert.equal(OldProtocol.authorization(directory).enabled,false);
   for(const op of ['cookies','import'])await assert.rejects(old.dispatch({op,url:'https://example.test/'}),{code:'disabled'});
  }
  assert.notEqual(Protocol.authorizationFilename,'authorization.json');await modern.setup();
  assert.equal(await(await modern.fetch('https://example.test/')).text(),'authenticated synthetic request');
  assert.equal((await modern.clear()).cleared,true);assert.deepEqual(await fs.readFile(oldFile),disabled);
  // Isolation does not pretend that an already-enabled external legacy runtime
  // has been revoked. Only the separately authorized exit tool owns that step.
  const active=Buffer.from('{"enabled":true,"syncToNative":true}');await fs.writeFile(oldFile,active);
  await modern.setAuthorization({enabled:false});assert.deepEqual(await fs.readFile(oldFile),active);assert.equal(OldProtocol.authorization(directory).enabled,true);
 }finally{await modern.dispose();await old.close();}
 console.log('PASS exact historical dispatch stays disabled after new constructor true/toggle/clear; new CDP snapshot+HTTP works; pre-existing old true is unchanged and requires explicit exit.');
}finally{await fs.rm(root,{recursive:true,force:true});}
