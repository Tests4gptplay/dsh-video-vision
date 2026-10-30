import assert from 'node:assert/strict';
import {readFile,readdir,access} from 'node:fs/promises';
import {NativeSession} from '../lib/native-session.js';
const forbidden=['browser-session/sync.cjs','browser-session/native-host.cjs','browser-session/install-desktop.cjs','lib/desktop-integration.js','browser-session/extension'];
for(const file of forbidden)await assert.rejects(access(file),{code:'ENOENT'});
async function scan(path){const entries=await readdir(path,{withFileTypes:true});for(const entry of entries){const file=path+'/'+entry.name;if(entry.isDirectory())await scan(file);else if(/\.(?:cjs|mjs|js)$/.test(file)){const text=await readFile(file,'utf8');for(const token of ['syncToNative','startDesktopService','restoreDesktopIntegration','DSH_LOCAL_BROWSER_SESSION_BRIDGE',"require('electron')",'net.createServer'])assert.ok(!text.includes(token),file+' must not retain '+token);}}}
await scan('browser-session');await scan('lib');await scan('bin');
let anonymous=0;
for(const snapshotState of ['unknown','read_failed','decrypt_failed']){
 const session=new NativeSession({status:async()=>({enabled:true,connected:false,snapshotState})},async()=>{anonymous++;});
 await assert.rejects(session.fetch('https://example.test'),{code:snapshotState});
}
assert.equal(anonymous,0,'Read failure is not silently presented as anonymous/empty');
const readme=await readFile('README.md','utf8');assert.ok(!/dsh plugin[^\n]*0\.9\./.test(readme),'Install command must not point to retired candidate');
const pkg=JSON.parse(await readFile('package.json','utf8'));
assert.ok(pkg.files.every(path=>!path.startsWith('tools/')),'One-off exit tool stays outside the plugin');
console.log('PASS no retired executable/IPC/sync/installer surfaces, no dynamic Electron import; snapshot errors never silently fall back to anonymous.');
