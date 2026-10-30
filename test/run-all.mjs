import {readdir,writeFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
const files=(await readdir(new URL('./',import.meta.url))).filter(x=>/\.(mjs|cjs)$/.test(x)&&x!=='run-all.mjs').sort();
const results=[];
for(const file of files){
 if(file==='audit-host-pruner.mjs'&&!process.env.VV_OFFICIAL_PRUNER){results.push({file,status:'not-run',reason:'Official host pruner module not provided'});continue;}
 if(file==='legacy-exit.mjs'&&process.env.VV_PACKED_RUNTIME==='1'){results.push({file,status:'not-in-package',reason:'Separate explicitly invoked exit tool is source-tested, intentionally excluded from product'});continue;}
 const result=spawnSync(process.execPath,['test/'+file,...(file==='linux-listener-discovery.mjs'?['.']:[])],{encoding:'utf8',stdio:'pipe'});
 process.stdout.write(`\n=== ${file}: ${result.status===0?'PASS':'FAIL'} ===\n`+(result.stdout||'')+(result.stderr||''));
 results.push({file,status:result.status===0?'pass':'fail',exitCode:result.status});
}
const summary={scope:process.env.VV_PACKED_RUNTIME==='1'?'packed-runtime':'source',results};
if(process.env.VV_TEST_REPORT)await writeFile(process.env.VV_TEST_REPORT,JSON.stringify(summary,null,2)+'\n');
console.log(JSON.stringify(summary,null,2));
if(results.some(r=>r.status==='fail'))process.exitCode=1;
