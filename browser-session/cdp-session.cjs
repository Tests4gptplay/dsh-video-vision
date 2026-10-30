const {join}=require('node:path');
const fs=require('node:fs/promises');
const {createCdpSource}=require('./cdp-source.cjs');
const {createSnapshotService}=require('./snapshot.cjs');
const {createKeyringStorage}=require('./keyring-storage.cjs');
function createCdpSession({directory,source=createCdpSource({directory}),createStorage=createKeyringStorage,createService=createSnapshotService}={}) {
 const services=new Map(),controllers=new Set();let closed=false, clearing=false;
 async function chosen(){return source.selected();}
 async function serviceFor(value){const key=value.storageId || value.id;if(!services.has(key)){const dir=join(directory,'cdp',value.storageId || value.id);const task=(async()=>{await fs.mkdir(dir,{recursive:true,mode:0o700});const safeStorage=await createStorage({directory:dir});return createService({directory:dir,authorizationDirectory:directory,filename:'session-state-keyring.bin',source:value.label,safeStorage,capture:async options=>{const current=await source.selected();if((current?.storageId || current?.id)!==key)throw Error('浏览器来源已切换，请重试。');options.signal?.throwIfAborted();return source.capture(options);}});})();services.set(key,task);task.catch(()=>services.delete(key));}return services.get(key);}
 function cancel(){for(const c of controllers)c.abort(new Error('浏览器来源已切换或授权已关闭。'));controllers.clear();}
 async function select(id){if(clearing)throw Error('Login-state cleanup is in progress.');cancel();await source.select(id);return status();}
 async function status(){let items=[],discoveryError;try{items=await source.list();}catch(error){discoveryError=error.code||'source_discovery_failed';}const value=await chosen();const state=value?await(await serviceFor(value)).status():{ready:true,connected:false,imported:false,importedAt:null,snapshotState:'absent'};return {...state,discoveryError:discoveryError||null,sourceAvailable:items.some(item=>item.id===value?.id && item.available!==false),localCapture:true,sourceId:value?.id||null,source:value?.label||'',sources:items};}
 async function request(op,payload={},options={}){
  if(clearing)throw Error('Login-state cleanup is in progress.');
  if(closed)throw Error('浏览器会话服务已关闭。');
  if(op==='status')return status();
  const controller=new AbortController();controllers.add(controller);
  const signal=AbortSignal.any([controller.signal,...(options.signal?[options.signal]:[])]);
  try{signal.throwIfAborted();const value=await chosen();signal.throwIfAborted();if(!value)throw Error('请选择来源浏览器连接。');const service=await serviceFor(value);signal.throwIfAborted();if((await source.selected())?.id!==value.id)throw Error('浏览器来源已切换，请重试。');const result=await service.dispatch({...payload,op},signal);if(result?.committed)return {...result,committedSourceId:value.id};signal.throwIfAborted();if((await source.selected())?.id!==value.id)throw Error('浏览器来源已切换，请重试。');return result;}
  finally{controllers.delete(controller);}
 }
 async function clear(){
  if(clearing)throw Error('Login-state cleanup is in progress.');
  clearing=true; cancel(); const failures=[];
  await Promise.all([...services.values()].map(async p=>{try{const result=await(await p).clear();failures.push(...result.failures);}catch(error){failures.push({code:error.code||'clear_failed'});}}));
  const files=[join(directory,'session-state.bin'),join(directory,'session-state.bin.tmp'),join(directory,'session-state.bin.rollback')];
  try{for(const entry of await fs.readdir(join(directory,'cdp'),{withFileTypes:true})){
    if(entry.isDirectory() && /^[0-9a-f]{64}$/.test(entry.name)) for(const name of ['session-state-keyring.bin','session-state-keyring.bin.tmp','session-state-keyring.bin.rollback'])files.push(join(directory,'cdp',entry.name,name));
  }}catch(error){if(error.code!=='ENOENT')failures.push({code:error.code||'list_failed'});}
  for(const file of files){try{if(!file.endsWith('.tmp')&&!file.endsWith('.rollback'))await fs.writeFile(file+'.cleared','VV snapshot reads revoked\n',{mode:0o600});await fs.rm(file,{force:true});try{await fs.access(file);throw Error('File still exists');}catch(error){if(error.code!=='ENOENT')throw error;}}catch(error){failures.push({file:require('node:path').relative(directory,file),code:error.code||'delete_failed'});}}
  clearing=false; return {cleared:failures.length===0,failures};
 }
 async function close(){closed=true;cancel();await source.close?.();await Promise.allSettled([...services.values()].map(async p=>(await p).close()));services.clear();}
 return {request,status,select,cancel,clear,close};
}
module.exports={createCdpSession};
