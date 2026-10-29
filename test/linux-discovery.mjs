import assert from 'node:assert/strict';
import Discovery from '../browser-session/discovery.cjs';
import Linux from '../browser-session/platform/linux.cjs';
const calls=[];
const records={
 '1':{uid:7,comm:'chrome\n',args:['chrome','--user-data-dir=/qa/profile with spaces','--remote-debugging-port=43123','--irrelevant=not-returned']},
 '2':{uid:7,comm:'chrome\n',args:['chrome','--type=renderer','--remote-debugging-port=43124']},
 '3':{uid:8,comm:'chrome\n',args:['chrome','--remote-debugging-port=43125']},
 '4':{uid:7,comm:'node\n',args:['node','private']},
 '5':{uid:7,comm:'chromium\n',args:['chromium','--user-data-dir','/qa/second','--remote-debugging-port','0']}
};
const commands=await Linux.runningBrowsers({procDirectory:'/qa/proc',uid:7,
 readdir:async()=>Object.keys(records),stat:async p=>({uid:records[p.split('/').at(-1)].uid}),
 readFile:async p=>{calls.push(p);const [pid,file]=p.split('/').slice(-2);return file==='comm'?records[pid].comm:records[pid].args.join('\0')+'\0';}});
assert.equal(commands.length,2);assert.equal(Discovery.argument(commands[0],'user-data-dir'),'/qa/profile with spaces');
assert(!JSON.stringify(commands).includes('irrelevant'));assert(!calls.includes('/qa/proc/3/cmdline'));assert(!calls.includes('/qa/proc/4/cmdline'));
const seen=[];
const endpoints=await Discovery.discoverBrowserEndpoints({commands,portFiles:[],fetch:async u=>({ok:true,json:async()=>({webSocketDebuggerUrl:'ws://127.0.0.1:43123/devtools/browser/qa'})}),readFile:async p=>{seen.push(p);return '43123\n/devtools/browser/qa\n';}});
assert.equal(endpoints.length,1);assert(seen.includes('/qa/profile with spaces/DevToolsActivePort'));
assert.equal(Discovery.argument('"C:\\Chrome\\chrome.exe" --user-data-dir="C:\\qa profile"','user-data-dir'),'C:\\qa profile');
console.log('PASS synthetic Linux proc discovery, spaced argv, browser main-process filtering, same-user metadata, Windows argument parsing; no real browser read.');
