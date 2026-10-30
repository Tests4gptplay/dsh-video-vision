import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
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
  // Independently frozen *published package*, never hash the mutable worktree to
  // manufacture the expected allowlist. Historical code is copied, NOT executed.
  const packageUrl = new URL('../test-artifacts/dsh-video-vision-0.9.3-audit.6-copyclarity.tgz', import.meta.url);
  const packageBytes = await fs.readFile(packageUrl);
  assert.equal(hash(packageBytes), '27e3fa6b3cf452c5c2dedd1834969f0aca706f34da8567b88d4b62b221ea74c9');
  const names = ['sync.cjs','protocol.cjs','snapshot.cjs','discovery.cjs',
    'platform/index.cjs','platform/linux.cjs','platform/darwin.cjs','platform/windows.cjs'];
  const known=JSON.parse(await fs.readFile(new URL('../tools/legacy-exit-known-runtime.json',import.meta.url)));
  assert.deepEqual(Object.keys(known).sort(), [...names].sort());
  const published = {};
  for (const name of names) {
    published[name] = execFileSync('tar', ['-xzOf', packageUrl.pathname, 'package/browser-session/' + name]);
    assert.equal(known[name], hash(published[name]), 'published audit.6 runtime mismatch: ' + name);
  }
  const installer = execFileSync('tar', ['-xzOf', packageUrl.pathname, 'package/browser-session/install-desktop.cjs']).toString();
  assert(installer.includes("for (const name of ['sync.cjs', 'protocol.cjs', 'snapshot.cjs', 'discovery.cjs']) fs.copyFileSync(join(__dirname, name), join(runtime, name))"));
  assert(installer.includes("fs.cpSync(join(__dirname, 'platform'), join(runtime, 'platform'), { recursive: true })"));
  const realResources=join(root,'published-resources'), realState=join(root,'published-state');
  const realRuntime=join(realResources,'dsh-browser-session');
  await fs.mkdir(join(realRuntime,'platform'),{recursive:true});await fs.mkdir(realState);
  await fs.writeFile(join(realResources,'app.asar'),original);
  await fs.writeFile(join(realResources,'unrelated.txt'),'unrelated-resource');
  await fs.writeFile(join(realState,'session-state.bin'),'opaque-preserved');
  for (const name of names) await fs.writeFile(join(realRuntime,name),published[name]);
  assert.equal(Object.keys(await runtimeState(realRuntime,known)).length,8);
  // Unknown modified bytes are not admitted. As in the reported partial exit,
  // authorization and hook may already be retired, but runtime stays intact.
  await fs.appendFile(join(realRuntime,'protocol.cjs'),'\n// unknown modification');
  const partial=await run({resources:realResources,state:realState,apply:true,hostStopped:true,expectedSha:hash(original)});
  assert.equal(partial.complete,false);assert.match(partial.failures[0].message,/Unknown runtime.*protocol/);
  assert(partial.steps.includes('authorization_disabled_and_verified'));
  assert(partial.steps.includes('current_archive_has_no_bridge_hook'));
  for(const name of names) await fs.access(join(realRuntime,name));
  const recovery=await fs.readFile(partial.recoveryContainer);
  assert.equal(hash(Buffer.from(JSON.parse(recovery).bytesBase64,'base64')),hash(original));
  // Restore only this synthetic test's modified bytes, then retry against the
  // current archive, not a stale pre-exit hash. No user file repair is performed.
  await fs.writeFile(join(realRuntime,'protocol.cjs'),published['protocol.cjs']);
  const resumed=await run({resources:realResources,state:realState,apply:true,hostStopped:true,expectedSha:partial.afterSha256});
  assert.equal(resumed.complete,true);
  const savedRuntime=JSON.parse(await fs.readFile(join(realState,'legacy-exit-runtime-data.json')));
  for(const name of names){
    assert.equal(savedRuntime.files[name],published[name].toString('base64'));
    await assert.rejects(fs.access(join(realRuntime,name)),{code:'ENOENT'});
  }
  assert.deepEqual(await fs.readFile(partial.recoveryContainer),recovery);
  assert.equal(await fs.readFile(join(realResources,'unrelated.txt'),'utf8'),'unrelated-resource');
  assert.equal(await fs.readFile(join(realState,'session-state.bin'),'utf8'),'opaque-preserved');
  const recoveryBefore=await fs.readFile(join(realState,'legacy-exit-runtime-data.json'));
  assert.equal((await run({resources:realResources,state:realState,apply:true,hostStopped:true,expectedSha:resumed.afterSha256})).complete,true);
  assert.deepEqual(await fs.readFile(join(realState,'legacy-exit-runtime-data.json')),recoveryBefore);
  // Partially removed known runtime can resume from existing recovery evidence.
  await fs.writeFile(join(realRuntime,'snapshot.cjs'),published['snapshot.cjs']);
  await fs.writeFile(join(realRuntime,'unrelated.cjs'),'do not delete');
  const refused=await run({resources:realResources,state:realState,apply:true,hostStopped:true,expectedSha:resumed.afterSha256});
  assert.equal(refused.complete,false);assert.equal(await fs.readFile(join(realRuntime,'unrelated.cjs'),'utf8'),'do not delete');
  assert.deepEqual(await fs.readFile(join(realRuntime,'snapshot.cjs')),published['snapshot.cjs']);
  await fs.unlink(join(realRuntime,'unrelated.cjs')); // synthetic fixture only
  assert.equal((await run({resources:realResources,state:realState,apply:true,hostStopped:true,expectedSha:resumed.afterSha256})).complete,true);
  assert.deepEqual(await fs.readFile(join(realState,'legacy-exit-runtime-data.json')),recoveryBefore);
  console.log('legacy-exit: frozen published audit.6 8-file layout/allowlist, unknown bytes refusal, partial-exit retry, preserved recovery/unrelated data, exact ASAR patch and failure boundaries passed');
} finally {await fs.rm(root,{recursive:true,force:true});}
