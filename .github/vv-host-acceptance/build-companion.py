"""Build the pinned DSH attachment fix as an installable candidate; no registry publication."""
from pathlib import Path
import json,subprocess,os,shutil,tarfile,hashlib
root=Path(os.environ['GITHUB_WORKSPACE']);dsh=root/'dsh';out=root/'out'
pkg=dsh/'packages/attachment/attachment-local'
def run(args,cwd=dsh):subprocess.run(args,cwd=cwd,check=True)
config=dsh/'attachment-candidate.tsdown.config.ts'
config.write_text("export default { entry: ['packages/attachment/attachment-local/lib/types/index.js'], outDir: 'packages/attachment/attachment-local/lib', format: ['esm'], platform: 'node', target: 'es2024', fixedExtension: false, dts: false, clean: false, external: [/^[^./]/] };\n")
run(['pnpm','exec','tsdown','--config','attachment-candidate.tsdown.config.ts','--config-loader','native'])
base=out/'attachment-base';base.mkdir(exist_ok=True)
run(['pnpm','pack','--pack-destination',str(base)],pkg)
staged=out/'attachment-staged';staged.mkdir(exist_ok=True)
with tarfile.open(next(base.glob('*.tgz'))) as t:t.extractall(staged,filter='data')
manifest=staged/'package/package.json';j=json.loads(manifest.read_text())
j['version']='0.2.2-rc.1.termux.1';j['dependencies']['@img/sharp-wasm32']=j['dependencies']['sharp']
j['repository']={'type':'git','url':'git+https://github.com/Tests4gptplay/deepseek-harness.git','directory':'packages/attachment/attachment-local'}
j['dshCandidate']={'sourceCommit':'562d10a963a41f31a7793441ab0f20ef521dcc24','fixCommit':'aa0d59b6a095cae326e69ba59e2fe0a1a3c3b208','issues':['Tests4gptplay/dsh-video-vision#2','Tests4gptplay/dsh-video-vision#3']}
manifest.write_text(json.dumps(j,indent=2)+'\n')
assert not any('workspace:' in str(v) for section in ['dependencies','peerDependencies'] for v in j.get(section,{}).values())
run(['npm','pack','--ignore-scripts','--pack-destination',str(out)],staged/'package')
final=next(out.glob('deepseek-ai-dsh-attachment-local-*.tgz'))
checked=out/'attachment-unpacked';checked.mkdir(exist_ok=True)
with tarfile.open(final) as t:t.extractall(checked,filter='data')
rows=[]
for f in sorted((checked/'package').rglob('*')):
 if not f.is_file():continue
 r=f.relative_to(checked/'package');assert 'tests' not in r.parts and 'node_modules' not in r.parts
 assert f.read_bytes()==(staged/'package'/r).read_bytes(),r
 rows.append({'path':str(r),'sha256':hashlib.sha256(f.read_bytes()).hexdigest(),'bytes':f.stat().st_size})
(out/'attachment-manifest.json').write_text(json.dumps(rows,indent=2)+'\n')
run(['git','fetch','--no-tags','--depth=1','origin','fcc0ad462172522aaf5c93a7b2e01f6b9f0b0159'])
patch=subprocess.check_output(['git','diff','fcc0ad462172522aaf5c93a7b2e01f6b9f0b0159','562d10a963a41f31a7793441ab0f20ef521dcc24','--','packages/attachment/attachment-local/src/store.ts'],cwd=dsh)
(out/'dsh-android-attachment-source.patch').write_bytes(patch)
clean=root/'clean-install';clean.mkdir(exist_ok=True)
(clean/'package.json').write_text(json.dumps({'private':True,'type':'module','dependencies':{'@deepseek-ai/dsh-attachment-local':'file:'+str(final),'@tests4gptplay/dsh-video-vision':'file:'+str(next(out.glob('tests4gptplay-dsh-video-vision-*.tgz')))}},indent=2)+'\n')
run(['npm','install','--ignore-scripts','--omit=optional'],clean)
shutil.copyfile(root/'controller/.github/vv-host-acceptance/companion-smoke.mjs',clean/'smoke.mjs')
run(['node','smoke.mjs'],clean)
print('COMPANION_PACK_AND_CLEAN_INSTALL_PASS',final.name,len(rows))
