import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import Source from '../browser-session/cdp-source.cjs';
import Discovery from '../browser-session/discovery.cjs';
const hash=s=>createHash('sha256').update(s).digest('hex');
const directory=await mkdtemp(join(tmpdir(),'vv-identity-'));
const endpoint='ws://127.0.0.1:9123/devtools/browser/old-token';
let endpoints=[{identity:'profile:/synthetic/a',endpoint,label:'A'},{identity:'profile:/synthetic/b',endpoint:'ws://127.0.0.1:9124/devtools/browser/b',label:'B'}];
const make=()=>Source.createCdpSource({directory,discover:async()=>endpoints,capture:async({endpoint})=>[{endpoint}]});
try {
 const legacy=hash(endpoint),a=hash(endpoints[0].identity),b=hash(endpoints[1].identity);
 await writeFile(join(directory,'cdp-selected-source.json'),JSON.stringify({id:legacy,label:'Old A'}));
 let source=make(); await source.select(a);assert.equal((await source.selected()).storageId,legacy);assert.ok(!(await source.list()).some(item=>item.id===legacy));
 await source.select(b);await source.select(a);source=make();assert.equal((await source.selected()).storageId,legacy);
 endpoints[0]={...endpoints[0],endpoint:'ws://127.0.0.1:9856/devtools/browser/restarted-token'};
 assert.equal((await source.selected()).id,a);assert.equal((await source.capture())[0].endpoint,endpoints[0].endpoint);
 endpoints=[];assert.equal((await source.list()).find(s=>s.id===a).available,false);
 await source.select(b);await source.select(a);assert.equal((await source.selected()).storageId,legacy);
 await assert.rejects(source.capture(),{code:'browser_source_unavailable'});
 // Old unknown restarted endpoint is never silently rebound or overwritten.
 const old=hash('unknown-old-endpoint');await writeFile(join(directory,'cdp-selected-source.json'),JSON.stringify({id:old,label:'Old unknown'}));
 source=make();assert.equal((await source.selected()).storageId,old);
 const found=await Discovery.discoverBrowserEndpoints({commands:[['chrome','--user-data-dir=/synthetic/a','--remote-debugging-port=9123']],portFiles:[],readFile:async()=>{throw Object.assign(Error(),{code:'ENOENT'});},fetch:async()=>({ok:true,json:async()=>({webSocketDebuggerUrl:endpoint})})});
 assert.equal(found[0].identity,'profile:/synthetic/a');
 const temporary=async token=>(await Discovery.discoverBrowserEndpoints({commands:[['chrome','--remote-debugging-port=9123']],portFiles:[],fetch:async()=>({ok:true,json:async()=>({webSocketDebuggerUrl:'ws://127.0.0.1:9123/devtools/browser/'+token})})}))[0];
 assert.notEqual((await temporary('A')).identity,(await temporary('B')).identity,'Reused port without proven profile must not reuse storage identity');
 console.log('PASS stable profile identity across port/token restart; legacy storage namespace retained across A/B/A/reload; offline saved sources; unknown legacy kept, not guessed.');
}finally{await rm(directory,{recursive:true,force:true});}
