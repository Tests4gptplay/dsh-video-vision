import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { uiText, browserStatusUI } from '../lib/ui-locale.js';
let active = 'zh', factory, component, inject, dictionary, index = 0;
const states = [], calls = [];
const listing = { entries: [{ id: 'sample', title: '用户视频标题', source: 'fixture', files: [{ name:'frame.png',bytes:12 }], bytes:12, duration:5 }],bytes:12,root:'/tmp/ui-fixture',browser_session:{ enabled:false,ready:true,browser:'Chrome' } };
const locale = { register(_ns,d) { dictionary=d; return ()=>{}; }, bind:()=>key=>dictionary[active][key], getSnapshot:()=>({active}),subscribe:()=>()=>{} };
const React = { createElement:(type,props,...children)=>({type,props:props||{},children}), useState(value) { const i=index++; if(!(i in states)) states[i]=value; return [states[i],v=>states[i]=typeof v==='function'?v(states[i]):v]; },useRef:()=>({current:null}),useEffect(){},useSyncExternalStore:(_s,g)=>g() };
vm.runInNewContext(await readFile(new URL('../client.js',import.meta.url),'utf8'),{window:{__ModuleLoader__:{load:m=>factory=m.factory}}});
factory(()=>React).apply({effect:f=>f(),locale,slots:{inject:(_n,f)=>f(),register:(o,c)=>{component=c;inject=o.inject;}},connection:{rpc:{call:async(_p,m,p)=>{calls.push(p);if(m.endsWith('/source-quality'))listing.maxHeight=p.maxHeight;return {ok:true,value:listing};}}}});
states[0]=listing;
for(const language of ['en','zh']) for(const value of Object.values(dictionary[language])) assert(!/vv/i.test(value), 'User-visible translations use the full product name');
function render(){index=0;const nodes=[];function walk(n){if(!n||typeof n!=='object')return;nodes.push(n);for(const c of n.children||[])Array.isArray(c)?c.forEach(walk):walk(c);}walk(component(inject()));return nodes;}
const text=nodes=>nodes.filter(n=>n.type!=='style').flatMap(n=>n.children.filter(c=>typeof c==='string')).join('\n');
for(const language of ['en','zh','en']) {
 active=language;const nodes=render();const output=text(nodes);
 assert(output.includes(language==='en'?'Browser session authorization':'浏览器登录态授权'));
 assert(output.includes('用户视频标题'),'user content unchanged');
 const guidance=nodes.find(n=>n.type==='div'&&n.children.includes(dictionary[language].ui64));
 const preservation=nodes.find(n=>n.type==='div'&&n.children.includes(dictionary[language].methodsPreserved));
 assert(guidance&&preservation&&guidance!==preservation,'Methods guidance and preservation are separate block lines');
 assert(nodes.some(n=>n.props.className==='vv-sub'&&n.children.includes(guidance)&&n.children.includes(preservation)),'Both lines retain the same inherited secondary text style');

 if(language==='en') assert(!/[\u3400-\u9fff]/.test(output.replace('用户视频标题','')), output);
 for (const node of nodes) for (const key of ['aria-label','placeholder']) if (language === 'en' && typeof node.props[key] === 'string') assert(!/[\u3400-\u9fff]/.test(node.props[key]));
 await nodes.find(n=>n.type==='button'&&n.children[0]===(language==='en'?'Cache folder':'缓存文件夹')).props.onClick();assert.equal(calls.at(-1).uiLanguage,language);
 const refresh=nodes.find(n=>n.type==='button'&&n.children[0]===(language==='en'?'Refresh':'刷新'));await refresh.props.onClick();
 assert.equal(calls.at(-1).uiLanguage,language);
}
// Persisted candidate.3 labels must follow the active locale without reimport,
// including retained unavailable sources and locale switches before any RPC reload.
for (const savedLabel of ['Google Chrome（浏览器内确认）', 'Google Chrome (confirm in browser)']) {
 for (const missing of [false, true]) {
  listing.browser_session = {enabled:true,ready:true,localCapture:true,imported:true,connected:true,
   snapshotState:'readable',browser:savedLabel,sourceId:'saved-source',sourceAvailable:!missing,
   sources:missing ? [{id:'other',label:'My 浏览器 profile',available:true}] : [{id:'saved-source',label:savedLabel,available:true}]};
  const original=JSON.stringify(listing); const before=calls.length;
  for (const language of ['en','zh','en']) {
   active=language; const nodes=render(); const label=dictionary[language].browserConfirmedChrome;
   const summary=nodes.find(n=>n.type==='div'&&n.children.some(c=>typeof c==='string'&&c.startsWith(dictionary[language].sourceLabel)));
   assert(summary.children[0].includes(label), 'Status summary uses current language');
   const option=nodes.find(n=>n.type==='option'&&n.props.value==='saved-source');
   assert(option.children[0].startsWith(label), 'Available and retained-source options use current language');
   if(missing) assert(text(nodes).includes('My 浏览器 profile'),'Custom source label is not translated');
   assert.equal(JSON.stringify(listing),original,'Rendering never migrates or mutates saved source data');
  }
  assert.equal(calls.length,before,'Locale-only rerenders do not import, clear, or query credentials');
 }
}
listing.browser_session={enabled:false,ready:true,browser:'Chrome'};
// User-owned titles/paths are data, not branding: never rewrite their spelling.
listing.entries[0].title='My VV video';listing.root='/synthetic/vv-cache';
assert(text(render()).includes('My VV video'));
listing.entries[0].title='用户视频标题';listing.root='/tmp/ui-fixture';

const restored={...listing,browser_session:{enabled:true,ready:true,imported:true,connected:true,localCapture:true,sourceId:'synthetic',sourceAvailable:true,browser:'Chrome',importing:true,importOperationId:'operation-A'}};
states[0]=restored;active='en';const restoredNodes=render();
const restoredCancel=restoredNodes.find(n=>n.type==='button'&&n.children[0]===dictionary.en.cancelImport);
assert(restoredCancel&&!restoredCancel.props.disabled,'Reopened page shows an enabled scoped cancel');
assert(restoredNodes.find(n=>n.type==='button'&&n.children[0]===dictionary.en.ui41).props.disabled,'Pending backend import disables repeat refresh');
assert(text(restoredNodes).includes(dictionary.en.ui45),'Backend pending is visibly explained');
assert.equal(restoredNodes.find(n=>n.type==='button'&&n.children[0]===dictionary.en.ui43).props.disabled,false,'Restored page can explicitly check completion without background polling');
states[0]={...restored,browser_session:{...restored.browser_session,importOperationId:'operation-B'}};
await restoredCancel.props.onClick();assert(calls.some(p=>p.operationId==='operation-A'),'Stale rendered cancel sends its displayed id, never the replacement id');
states[0]=listing;
listing.maxHeight=720;
active='en';await render().find(n=>n.type==='button'&&n.children[0]===dictionary.en.ui19).props.onClick();let qualityNodes=render();
assert.equal(qualityNodes.find(n=>n.props['aria-label']===dictionary.en.sourceHeight).props.value,720,'Existing positive limit is shown, not silently migrated');
qualityNodes.find(n=>n.props['aria-label']===dictionary.en.sourceHeight).props.onChange({target:{value:'0'}});
await render().find(n=>n.type==='button'&&n.children[0]===dictionary.en.sourceQualitySave).props.onClick();
assert.equal(listing.maxHeight,0,'Save sends and reloads zero without a 720 fallback');
assert.equal(render().find(n=>n.props['aria-label']===dictionary.en.sourceHeight).props.value,0);
active='zh';assert.equal(render().find(n=>n.props['aria-label']===dictionary.zh.sourceHeight).props.value,0);
active='en'; let nodes=render();await nodes.find(n=>n.type==='button'&&n.children[0]==='Delete cache').props.onClick();
assert(text(render()).includes('Delete all cached files for “用户视频标题”?'));
active='zh';assert(text(render()).includes('删除「用户视频标题」的全部缓存？'));
active='en';assert(text(render()).includes('Delete all cached files for “用户视频标题”?'));
assert.equal(uiText('请确认删除。','en'),'Confirm deletion.');
assert.equal(uiText('请确认删除。','zh'),'请确认删除。');
assert.equal(uiText('用户内容','en'),'用户内容');
assert.equal(browserStatusUI({browser:'当前平台',componentMessage:'所选浏览器连接不可用。'},'en').browser,'Current platform');
console.log('PASS: en/zh/en labels, preserved user content, request language, runtime error/status localization.');
const { registerCacheTransport } = await import('../lib/settings.js');
const routes = new Map();let extractedLanguage, cleared = 0;
const clearResult = { cleared: false, failures: [{ path: 'synthetic-copy', code: 'EACCES' }] };
const manager = { config:{maxHeight:720}, list:async()=>({entries:[],bytes:0}), persistSourceQuality:async({maxHeight})=>{manager.config.maxHeight=maxHeight;return {maxHeight};}, persistAuthorization:async state=>{assert.equal(state.enabled,false);}, browserSessions:{clear:async()=>{cleared++;return clearResult;},status:async()=>({browser:'当前平台',componentMessage:'所选浏览器连接不可用。'})}, extract:async(_id,_file,_signal,lang)=>{extractedLanguage=lang;return {canceled:true};}, remove:async()=>{throw new Error('缓存文件不存在，请刷新列表。');} };
const dispose=registerCacheTransport({fetch:{register:({path,fetch})=>{routes.set(path,fetch);return()=>routes.delete(path);}}},manager);
async function request(endpoint,payload){const method='video-vision/cache/'+endpoint;const response=await routes.get('/api/'+method)(new Request('http://localhost/api/'+method,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({type:'client-request',rpcId:'test',method,payload})}));return (await response.json()).result;}
assert.equal((await request('remove',{confirm:true,uiLanguage:'en'})).error.message,'The cached file does not exist. Refresh the list.');
assert.equal((await request('remove',{confirm:true,uiLanguage:'zh'})).error.message,'缓存文件不存在，请刷新列表。');
assert.equal((await request('remove',{confirm:true,uiLanguage:'en'})).error.code,'video_vision_cache');
await request('extract',{uiLanguage:'en'});assert.equal(extractedLanguage,'en');
assert.equal((await request('browser-status',{uiLanguage:'en'})).value.browser,'Current platform');
assert.equal((await request('browser-clear',{uiLanguage:'en'})).error.message,'Confirm clearing Video Vision session copies.');
assert.equal(cleared,0);
assert.deepEqual((await request('browser-clear',{confirm:true,uiLanguage:'en'})).value,clearResult);
assert.equal(cleared,1);
assert.equal((await request('list',{uiLanguage:'en'})).value.maxHeight,720);
assert.equal((await request('source-quality',{maxHeight:0,uiLanguage:'en'})).value.maxHeight,0);
assert.equal((await request('list',{uiLanguage:'en'})).value.maxHeight,0);
for(const maxHeight of [-1,1.5,'720',null]) assert.equal((await request('source-quality',{maxHeight,uiLanguage:'en'})).error.message,'Source video height must be 0 (unlimited) or a positive integer.');
assert.equal(manager.config.maxHeight,0,'Invalid inputs do not alter saved value');
dispose();assert.equal(routes.size,0);
console.log('PASS: actual transport handler preserves error codes/Chinese and forwards English to extraction dialog.');

for (const file of ['README.md','resources/GUIDANCE.md','resources/native-session.md']) {
 const prose=(await readFile(new URL('../'+file,import.meta.url),'utf8')).replaceAll('vv-plugin-authorization-v1.json','');
 assert(!/vv/i.test(prose), file+' has no abbreviated product prose, even adjacent to Chinese');
}
const metadata=JSON.parse(await readFile(new URL('../package.json',import.meta.url),'utf8'));
assert(!/vv/i.test(metadata.name+' '+metadata.description));
console.log('PASS full product names in locale values, package metadata and current packaged guidance; user titles remain untouched.');
