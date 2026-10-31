import assert from 'node:assert/strict';
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rename, rm, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { createRefreshStage, commitRefresh, recoverRefresh } from '../lib/cache-refresh.js';
const root = await mkdtemp(join(tmpdir(), 'video-refresh-test-')), id = 'web-12345678901234567890', folder = join(root,id);
const exists = p => readFile(p).then(()=>true,()=>false);
async function old() { await mkdir(folder,{recursive:true}); await writeFile(join(folder,'manifest.json'),JSON.stringify({id,cursor:17})); await writeFile(join(folder,'video.mp4'),'old'); await writeFile(join(folder,'speech-old.json'),'old transcript'); }
async function stage() { const s=await createRefreshStage(folder,id); await writeFile(join(s,'manifest.json'),JSON.stringify({id,cursor:17})); await writeFile(join(s,'video.mp4'),'new'); return s; }
async function journal(s, token) { const r={version:1,id,token,stage:s.split('/').at(-1),backup:'.refresh-backup-'+id+'-'+token,hadOld:true}; await writeFile(folder+'.refresh.json',JSON.stringify(r)); return join(root,r.backup); }
try {
 await old(); let s=await stage(); assert.equal((await commitRefresh(s,folder,id)).committed,true); assert.equal(await readFile(join(folder,'video.mp4'),'utf8'),'new'); assert.equal(await exists(join(folder,'speech-old.json')),false); assert.equal(await exists(folder+'.refresh.json'),false);
 await rm(folder,{recursive:true}); await old(); s=await stage(); let token=randomUUID(), b=await journal(s,token); await writeFile(join(s,'.refresh-commit.json'),JSON.stringify({id,token})); await rename(folder,b);
 assert.equal((await recoverRefresh(folder,id)).committed,false); assert.equal(await readFile(join(folder,'video.mp4'),'utf8'),'old'); assert.equal(JSON.parse(await readFile(join(folder,'manifest.json'))).cursor,17);
 s=await stage(); token=randomUUID(); b=await journal(s,token); await writeFile(join(s,'.refresh-commit.json'),JSON.stringify({id,token})); await rename(folder,b); await rename(s,folder);
 assert.equal((await recoverRefresh(folder,id)).committed,true); assert.equal(await readFile(join(folder,'video.mp4'),'utf8'),'new');
 // Actual production module with narrowly injected filesystem failures.
 s=await stage(); const realLink=fs.promises.link;
 fs.promises.link=async ()=>{ throw Object.assign(new Error('synthetic unsupported hard links'),{code:'ENOTSUP'}); }; syncBuiltinESMExports();
 try { assert.equal((await commitRefresh(s,folder,id)).committed,true); } finally { fs.promises.link=realLink; syncBuiltinESMExports(); }
 assert.equal(await readFile(join(folder,'video.mp4'),'utf8'),'new');

 s=await stage(); const realWrite=fs.promises.writeFile;
 fs.promises.writeFile=async (path,data,...args)=>{ if(String(path).includes('.refresh.json.') && String(path).endsWith('.tmp')) { await realWrite(path,'{',...args); throw Object.assign(new Error('synthetic partial journal ENOSPC'),{code:'ENOSPC'}); } return realWrite(path,data,...args); }; syncBuiltinESMExports();
 try { await assert.rejects(commitRefresh(s,folder,id),/partial journal ENOSPC/); } finally { fs.promises.writeFile=realWrite; syncBuiltinESMExports(); }
 assert.equal(await exists(folder+'.refresh.json'),false); assert.equal((await recoverRefresh(folder,id)).recovered,false); assert.equal(await readFile(join(folder,'video.mp4'),'utf8'),'new'); await rm(s,{recursive:true});

 s=await stage(); const realRename=fs.promises.rename;
 fs.promises.rename=async (from,to)=>{ if(String(from).includes('.refresh.json.') && String(from).endsWith('.tmp')) throw Object.assign(new Error('synthetic journal publication failure'),{code:'EIO'}); return realRename(from,to); }; syncBuiltinESMExports();
 try { await assert.rejects(commitRefresh(s,folder,id),/journal publication failure/); } finally { fs.promises.rename=realRename; syncBuiltinESMExports(); }
 assert.equal(await exists(folder+'.refresh.json'),false); assert.equal((await recoverRefresh(folder,id)).recovered,false); assert.equal(await readFile(join(folder,'video.mp4'),'utf8'),'new'); await rm(s,{recursive:true});
 s=await stage();
 fs.promises.rename=async (from,to)=>{ if(from===s) throw Object.assign(new Error('synthetic rename failure'),{code:'EIO'}); return realRename(from,to); }; syncBuiltinESMExports();
 try { await assert.rejects(commitRefresh(s,folder,id),/synthetic rename failure/); } finally { fs.promises.rename=realRename; syncBuiltinESMExports(); }
 assert.equal(await readFile(join(folder,'video.mp4'),'utf8'),'new'); assert.equal(await exists(folder+'.refresh.json'),false);
 s=await stage(); await writeFile(join(s,'video.mp4'),'newest'); const realRm=fs.promises.rm;
 fs.promises.rm=async (path,...args)=>{ if(String(path).includes('.refresh-backup-') && String(path).endsWith('video.mp4')) throw Object.assign(new Error('synthetic cleanup failure'),{code:'EACCES'}); return realRm(path,...args); }; syncBuiltinESMExports();
 try { const result=await commitRefresh(s,folder,id); assert.equal(result.committed,true); assert.equal(result.cleanupPending,true); } finally { fs.promises.rm=realRm; syncBuiltinESMExports(); }
 assert.equal(await readFile(join(folder,'video.mp4'),'utf8'),'newest'); assert.equal(await exists(folder+'.refresh.json'),true);
 assert.equal((await recoverRefresh(folder,id)).cleanupPending,false); assert.equal(await exists(folder+'.refresh.json'),false);
 await writeFile(join(folder,'video.mp4'),'new');
 s=await stage();
 fs.promises.rename=async (from,to)=>{ if(from===s || String(from).includes('.refresh-backup-')) throw Object.assign(new Error('synthetic rollback failure'),{code:'EIO'}); return realRename(from,to); }; syncBuiltinESMExports();
 try { await assert.rejects(commitRefresh(s,folder,id),/automatic recovery could not finish/); } finally { fs.promises.rename=realRename; syncBuiltinESMExports(); }
 assert.equal(await exists(folder+'.refresh.json'),true); assert.equal((await recoverRefresh(folder,id)).committed,false); assert.equal(await readFile(join(folder,'video.mp4'),'utf8'),'new');
 s=await stage(); const realRead=fs.promises.readFile;
 fs.promises.readFile=async (path,...args)=>{ if(String(path)===join(folder,'.refresh-commit.json')) throw Object.assign(new Error('synthetic postcommit read failure'),{code:'EACCES'}); return realRead(path,...args); }; syncBuiltinESMExports();
 try { const result=await commitRefresh(s,folder,id); assert.equal(result.committed,true); assert.equal(result.cleanupPending,true); } finally { fs.promises.readFile=realRead; syncBuiltinESMExports(); }
 assert.equal(await exists(folder+'.refresh.json'),true); assert.equal((await recoverRefresh(folder,id)).committed,true);
 s=await stage(); await symlink('/tmp',join(s,'unsafe')); await assert.rejects(commitRefresh(s,folder,id),/links/); assert.equal(await readFile(join(folder,'video.mp4'),'utf8'),'new'); await rm(s,{recursive:true});
 s=await stage(); await writeFile(folder+'.refresh.json',JSON.stringify({version:1,id,token:randomUUID(),stage:'../outside',backup:'bad'})); await assert.rejects(recoverRefresh(folder,id),/Invalid cache refresh/); assert.equal(await readFile(join(folder,'video.mp4'),'utf8'),'new');
 console.log('PASS cache refresh: committed replacement, crash-before/after-switch recovery, cursor preservation, stale derivatives removed, links/invalid journal refused');
} finally { await rm(root,{recursive:true,force:true}); }
