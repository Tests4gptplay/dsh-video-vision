const {join}=require('node:path');
const fs=require('node:fs/promises');
const {createCdpSource}=require('./cdp-source.cjs');
const {createSnapshotService}=require('./snapshot.cjs');
const {createKeyringStorage}=require('./keyring-storage.cjs');
function createCdpSession({directory,source=createCdpSource({directory}),createStorage=createKeyringStorage,createService=createSnapshotService}={}) {
 const services=new Map(),controllers=new Set();let closed=false;
 async function chosen(){let value=await source.selected();if(!value){const items=await source.list();if(items.length===1){await source.select(items[0].id);value=await source.selected();}}return value;}
 async function serviceFor(value){if(!services.has(value.id)){const dir=join(directory,'cdp',value.id);const task=(async()=>{await fs.mkdir(dir,{recursive:true,mode:0o700});const safeStorage=await createStorage({directory:dir});return createService({directory:dir,authorizationDirectory:directory,filename:'session-state-keyring.bin',source:value.label,safeStorage,capture:async options=>{if((await source.selected())?.id!==value.id)throw Error('浏览器来源已切换，请重试。');options.signal?.throwIfAborted();return source.capture(options);}});})();services.set(value.id,task);task.catch(()=>services.delete(value.id));}return services.get(value.id);}
 function cancel(){for(const c of controllers)c.abort(new Error('浏览器来源已切换或授权已关闭。'));controllers.clear();}
 async function select(id){cancel();await source.select(id);return status();}
 async function status(){const items=await source.list();const value=await chosen();const state=value?await(await serviceFor(value)).status():{ready:true,connected:false,imported:false,importedAt:null};return {...state,localCapture:true,sourceId:value?.id||null,source:value?.label||'',sources:items};}
 async function request(op,payload={},options={}){
  if(closed)throw Error('浏览器会话服务已关闭。');
  if(op==='status')return status();
  const controller=new AbortController();controllers.add(controller);
  const signal=AbortSignal.any([controller.signal,...(options.signal?[options.signal]:[])]);
  try{signal.throwIfAborted();const value=await chosen();signal.throwIfAborted();if(!value)throw Error('请选择来源浏览器连接。');const service=await serviceFor(value);signal.throwIfAborted();if((await source.selected())?.id!==value.id)throw Error('浏览器来源已切换，请重试。');const result=await service.dispatch({...payload,op},signal);signal.throwIfAborted();if((await source.selected())?.id!==value.id)throw Error('浏览器来源已切换，请重试。');return result;}
  finally{controllers.delete(controller);}
 }
 async function close(){closed=true;cancel();await source.close?.();await Promise.allSettled([...services.values()].map(async p=>(await p).close()));services.clear();}
 return {request,status,select,cancel,close};
}
module.exports={createCdpSession};
