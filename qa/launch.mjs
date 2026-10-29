import {chooseDirectory,chooseSaveFile} from '../lib/native-ui.js';
const [action,lang,path,abort]=process.argv.slice(2);
const controller=new AbortController();
if(abort) setTimeout(()=>controller.abort(),3000);
try {console.log(JSON.stringify(await (action==='directory'?chooseDirectory(path,controller.signal,lang):chooseSaveFile(path,controller.signal,lang))));}
catch(e){console.log(JSON.stringify({error:e.message,code:e.code,name:e.name}));process.exitCode=2;}
