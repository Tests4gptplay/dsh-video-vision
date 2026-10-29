const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {resolve,join}=require('node:path');
const {createRequire}=require('node:module');
const root=resolve(process.argv[2]||'.');
const localRequire=createRequire(join(root,'browser-session/sync.cjs'));
const originalP=localRequire('./protocol.cjs');
let enabled=true;
const moduleObject={exports:{}};
vm.runInNewContext(fs.readFileSync(join(root,'browser-session/sync.cjs'),'utf8'),{
 module:moduleObject,exports:moduleObject.exports,process:{versions:{},type:undefined},
 require:name=>name==='node:fs'?{existsSync:()=>false}:name==='./protocol.cjs'?{...originalP,authorization:()=>({enabled,syncToNative:enabled})}:localRequire(name),
});
const {createSync}=moduleObject.exports;
const key=c=>[c.domain,c.path||'/',c.name].join('|');
const cookie=(name,value,path='/',domain='example.test')=>({name,value,path,domain,secure:true,httpOnly:true});
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return{resolve,promise};};
function browser(initial){const jar=new Map(initial.map(c=>[key(c),{...c}]));let setHook;
 return{jar,setHook:fn=>setHook=fn,session:{cookies:{
 get:async({url})=>originalP.scopedCookies([...jar.values()],url).map(c=>({...c})),
 set:async c=>{const url=new URL(c.url);const stored={...c,domain:c.domain||url.hostname,path:c.path||'/'};delete stored.url;
 if(setHook){const fn=setHook;setHook=null;await fn(stored);}jar.set(key(stored),stored);},
 remove:async(url,name)=>{const u=new URL(url);for(const[k,c]of jar)if(c.name===name&&c.domain.replace(/^\./,'')===u.hostname&&c.path===u.pathname)jar.delete(k);},
 }}};
}
const failures=[];
async function test(name,fn){enabled=true;try{await fn();console.log('PASS:',name);}catch(error){failures.push({name,error:error.message});console.error('FAIL:',name,error.message);}}
(async()=>{
 await test('same-session concurrent sites and paths remain isolated',async()=>{
 const b=browser([cookie('session','nativeA','/a'),cookie('session','nativeB','/b'),cookie('untouched','native')]);
 const incoming=[cookie('session','importA','/a'),cookie('session','importB','/b'),cookie('other','importOther','/','other.test')];
 const sync=createSync({watch:false,request:async(_op,{url})=>({cookies:originalP.scopedCookies(incoming,url)})});
 try{await Promise.all(['https://example.test/a/page','https://example.test/b/page','https://other.test/'].map(url=>sync.beforeRequest(b.session,url)));
 assert.equal(b.jar.get(key(incoming[0])).value,'importA');assert.equal(b.jar.get(key(incoming[1])).value,'importB');assert.equal(b.jar.get(key(incoming[2])).value,'importOther');
 assert.equal(b.jar.get(key(cookie('untouched',''))).value,'native');
 }finally{await sync.dispose();}
 assert.equal(b.jar.get(key(incoming[0])).value,'nativeA');assert.equal(b.jar.get(key(incoming[1])).value,'nativeB');assert.ok(!b.jar.has(key(incoming[2])));
 });
 await test('OFF while request waits restores old values and prevents new keys',async()=>{
 const b=browser([cookie('session','native')]);let wait=false;const entered=deferred(),release=deferred();
 const sync=createSync({watch:false,request:async()=>{if(wait){entered.resolve();await release.promise;}return{cookies:[cookie('session','imported'),cookie('new','imported')]};}});
 try{await sync.beforeRequest(b.session,'https://example.test/');wait=true;
 const pending=sync.beforeRequest(b.session,'https://example.test/');await entered.promise;enabled=false;const changed=sync.changed();release.resolve();await Promise.all([pending,changed]);
 assert.equal(b.jar.get(key(cookie('session',''))).value,'native');assert.ok(!b.jar.has(key(cookie('new',''))));
 }finally{await sync.dispose();}
 });
 await test('OFF during asynchronous cookie write restores originals',async()=>{
 const b=browser([cookie('session','native')]);const entered=deferred(),release=deferred();
 b.setHook(async()=>{entered.resolve();await release.promise;});
 const sync=createSync({watch:false,request:async()=>({cookies:[cookie('session','imported'),cookie('new','imported')]})});
 try{const pending=sync.beforeRequest(b.session,'https://example.test/');await entered.promise;enabled=false;const changed=sync.changed();release.resolve();await Promise.all([pending,changed]);
 assert.equal(b.jar.get(key(cookie('session',''))).value,'native');assert.ok(!b.jar.has(key(cookie('new',''))));
 }finally{await sync.dispose();}
 });
 await test('source deletion restores only corresponding scoped native keys',async()=>{
 const a=cookie('session','importA','/a'),bb=cookie('session','importB','/b');const b=browser([cookie('session','nativeA','/a'),cookie('session','nativeB','/b'),cookie('untouched','native')]);let source=[a,bb,cookie('new','imported','/a')];
 const sync=createSync({watch:false,request:async(_op,{url})=>({cookies:originalP.scopedCookies(source,url)})});
 try{await sync.beforeRequest(b.session,'https://example.test/a/page');await sync.beforeRequest(b.session,'https://example.test/b/page');source=[bb];await sync.beforeRequest(b.session,'https://example.test/a/page');
 assert.equal(b.jar.get(key(a)).value,'nativeA');assert.equal(b.jar.get(key(bb)).value,'importB');assert.ok(!b.jar.has(key(cookie('new','','/a'))));assert.equal(b.jar.get(key(cookie('untouched',''))).value,'native');
 }finally{await sync.dispose();}
 });
 console.log(JSON.stringify({tests:4,failed:failures.length,failures,scope:'VM createSync + synthetic session/request/grant; no Electron service, cookies, sockets or network'}));if(failures.length)process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1;});
