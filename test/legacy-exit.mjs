import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { retireArchive, hash, run, runtimeState } from '../tools/legacy-exit.mjs';
const source = `// DSH_LOCAL_BROWSER_SESSION_BRIDGE
const dshLocalBrowserSession = createRequire(import.meta.url)(join(process.resourcesPath, "dsh-browser-session", "sync.cjs"));
//#region lib/types/browser-guests.js
class Guest {
\tmethod(browserSession) {
\t\tbrowserSession.webRequest.onBeforeRequest((details, callback) => {
\t\t\tconst url = new URL(details.url);
\t\t\tconst cancel = [
"file:", "chrome:"
\t\t\t].includes(url.protocol);
            if (cancel || !["http:", "https:"].includes(url.protocol)) callback({ cancel });
            else dshLocalBrowserSession.beforeRequest(browserSession, url.href).then(() => callback({ cancel: false }), () => callback({ cancel: false }));
\t\t});
\t}
\tallowedNavigation() {}
}
//#endregion
`;
function asar(main = source) {
  const bytes = Buffer.from(main), digest = hash(bytes);
  const header = Buffer.from(JSON.stringify({ files: {lib:{files:{'main.js':{size:bytes.length,offset:'0',integrity:{algorithm:'SHA256',hash:digest,blockSize:4194304,blocks:[digest]}}}}} }));
  const prefix = Buffer.alloc(16); prefix.writeUInt32LE(header.length + 8,4);prefix.writeUInt32LE(header.length,12);
  return Buffer.concat([prefix,header,bytes,Buffer.from('UNRELATED-TAIL')]);
}
const original = asar(), fixed = retireArchive(original);
assert.equal(fixed.changed,true);assert(!fixed.main.includes('dshLocalBrowserSession'));assert(fixed.main.includes('callback({ cancel: ['));
assert.equal(retireArchive(fixed.bytes).changed,false);assert.equal(original.length,fixed.bytes.length);
assert.throws(()=>retireArchive(asar(source.replace('else dshLocalBrowserSession', 'else unknown'))),/Unknown/);
assert.throws(()=>retireArchive(asar(source + '// DSH_LOCAL_BROWSER_SESSION_BRIDGE')),/Unknown/);
const bad = Buffer.from(original);bad[bad.length-20]^=1;assert.throws(()=>retireArchive(bad));
const root=await fs.mkdtemp(join(tmpdir(),'vv-exit-test-'));
try {
  const resources=join(root,'resources'),state=join(root,'state');await fs.mkdir(resources);await fs.mkdir(state);await fs.writeFile(join(resources,'app.asar'),original);
  await fs.writeFile(join(state,'session-state.bin'),'opaque-safeStorage-ciphertext');
  const dry=await run({resources,state});assert.equal(dry.dryRun,true);assert.equal(hash(await fs.readFile(join(resources,'app.asar'))),hash(original));
  await assert.rejects(run({resources,state,apply:true,expectedSha:hash(original)}),/host-stopped/);
  const failure=await run({resources,state,apply:true,hostStopped:true,expectedSha:hash(original)}, {...fs,rename:async()=>{throw Object.assign(Error('denied'),{code:'EACCES'});}});
  assert.equal(failure.complete,false);assert.equal(failure.failures[0].code,'EACCES');assert.equal(hash(await fs.readFile(join(resources,'app.asar'))),hash(original));
  const done=await run({resources,state,apply:true,hostStopped:true,expectedSha:hash(original)});
  assert.equal(done.complete,true);assert.equal(JSON.parse(await fs.readFile(join(state,'authorization.json'))).syncToNative,false);
  assert.equal(await fs.readFile(join(state,'session-state.bin'),'utf8'),'opaque-safeStorage-ciphertext');
  assert.equal(retireArchive(await fs.readFile(join(resources,'app.asar'))).changed,false);
  const again=await run({resources,state,apply:true,hostStopped:true,expectedSha:done.afterSha256});assert.equal(again.complete,true);
  await fs.mkdir(join(resources,'dsh-browser-session'));await fs.writeFile(join(resources,'dsh-browser-session','unknown.cjs'),'do not delete');
  const unknown=await run({resources,state,apply:true,hostStopped:true,expectedSha:done.afterSha256});assert.equal(unknown.complete,false);assert.match(unknown.failures[0].message,/Unknown runtime/);assert.equal(await fs.readFile(join(resources,'dsh-browser-session','unknown.cjs'),'utf8'),'do not delete');
  await fs.unlink(join(resources,'dsh-browser-session','unknown.cjs'));
  const synthetic = Buffer.from('synthetic runtime, never executed');
  await fs.writeFile(join(resources,'dsh-browser-session','fixture.cjs'), synthetic);
  assert.deepEqual(await runtimeState(join(resources,'dsh-browser-session'), {'fixture.cjs': hash(synthetic)}), {'fixture.cjs': synthetic.toString('base64')});
  await fs.unlink(join(resources,'dsh-browser-session','fixture.cjs'));
  await fs.rmdir(join(resources,'dsh-browser-session'));
  await fs.symlink(state, join(resources,'dsh-browser-session'));
  await assert.rejects(runtimeState(join(resources,'dsh-browser-session'), {}), /symlink/);
  await fs.unlink(join(resources,'dsh-browser-session'));
  // Exercise the exact standalone code with an isolated synthetic allowlist.
  const toolDir=join(root,'synthetic-tool');await fs.mkdir(toolDir);
  await fs.copyFile(new URL('../tools/legacy-exit.mjs',import.meta.url),join(toolDir,'legacy-exit.mjs'));
  await fs.writeFile(join(toolDir,'legacy-exit-known-runtime.json'),JSON.stringify({'fixture.cjs':hash(synthetic)}));
  await fs.mkdir(join(resources,'dsh-browser-session'));await fs.writeFile(join(resources,'dsh-browser-session','fixture.cjs'),synthetic);
  const fixtureTool=await import(pathToFileURL(join(toolDir,'legacy-exit.mjs')).href);
  const retired=await fixtureTool.run({resources,state,apply:true,hostStopped:true,expectedSha:done.afterSha256});
  assert.equal(retired.complete,true);await assert.rejects(fs.access(join(resources,'dsh-browser-session','fixture.cjs')),{code:'ENOENT'});
  assert.equal(JSON.parse(await fs.readFile(join(state,'legacy-exit-runtime-data.json'))).files['fixture.cjs'],synthetic.toString('base64'));
  // Standalone package includes trusted fixture hashes only; existing binaries and cookies never used.
  const known=JSON.parse(await fs.readFile(new URL('../tools/legacy-exit-known-runtime.json',import.meta.url)));assert(Object.keys(known).length>=4);
  console.log('legacy-exit: exact patch, unrelated bytes, refusal, revocation failure/retry, idempotence, opaque old-store preservation passed');
} finally {await fs.rm(root,{recursive:true,force:true});}
