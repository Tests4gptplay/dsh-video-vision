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
factory(()=>React).apply({effect:f=>f(),locale,slots:{inject:(_n,f)=>f(),register:(o,c)=>{component=c;inject=o.inject;}},connection:{rpc:{call:async(_p,m,p)=>{calls.push(p);return {ok:true,value:listing};}}}});
states[0]=listing;
function render(){index=0;const nodes=[];function walk(n){if(!n||typeof n!=='object')return;nodes.push(n);for(const c of n.children||[])Array.isArray(c)?c.forEach(walk):walk(c);}walk(component(inject()));return nodes;}
const text=nodes=>nodes.filter(n=>n.type!=='style').flatMap(n=>n.children.filter(c=>typeof c==='string')).join('\n');
for(const language of ['en','zh','en']) {
 active=language;const nodes=render();const output=text(nodes);
 assert(output.includes(language==='en'?'Browser session authorization':'浏览器登录态授权'));
 assert(output.includes('用户视频标题'),'user content unchanged');
 if(language==='en') assert(!/[\u3400-\u9fff]/.test(output.replace('用户视频标题','')), output);
 for (const node of nodes) for (const key of ['aria-label','placeholder']) if (language === 'en' && typeof node.props[key] === 'string') assert(!/[\u3400-\u9fff]/.test(node.props[key]));
 await nodes.find(n=>n.type==='button'&&n.children[0]===(language==='en'?'Cache folder':'缓存文件夹')).props.onClick();assert.equal(calls.at(-1).uiLanguage,language);
 const refresh=nodes.find(n=>n.type==='button'&&n.children[0]===(language==='en'?'Refresh':'刷新'));await refresh.props.onClick();
 assert.equal(calls.at(-1).uiLanguage,language);
}
active='en'; let nodes=render();await nodes.find(n=>n.type==='button'&&n.children[0]==='Delete cache').props.onClick();
assert(text(render()).includes('Delete all cached files for “用户视频标题”?'));
active='zh';assert(text(render()).includes('删除「用户视频标题」的全部缓存？'));
active='en';assert(text(render()).includes('Delete all cached files for “用户视频标题”?'));
assert.equal(uiText('请确认删除。','en'),'Confirm deletion.');
assert.equal(uiText('请确认删除。','zh'),'请确认删除。');
assert.equal(uiText('用户内容','en'),'用户内容');
assert.equal(browserStatusUI({browser:'当前平台',componentMessage:'本地组件已安装，等待 Desktop 载入。'},'en').browser,'Current platform');
const html=await readFile(new URL('../browser-session/extension/popup.html',import.meta.url),'utf8');
for(const language of ['en-US','zh-CN']) {
 const nodes=[...html.matchAll(/data-i18n="([^"]+)"/g)].map(m=>({dataset:{i18n:m[1]},textContent:''}));const state={textContent:''},connect={};const document={documentElement:{},querySelectorAll:()=>nodes,getElementById:id=>id==='state'?state:connect};
 vm.runInNewContext(await readFile(new URL('../browser-session/extension/popup.js',import.meta.url),'utf8'),{navigator:{language},document,chrome:{runtime:{sendMessage:async()=>({connected:true})}}});await new Promise(resolve=>setImmediate(resolve));
 assert.equal(document.documentElement.lang,language.startsWith('zh')?'zh':'en');assert(nodes.every(n=>n.textContent));assert(state.textContent.includes(language.startsWith('zh')?'已连接':'connected'));
}
console.log('PASS: en/zh/en labels, preserved user content, request language, runtime error/status localization, extension en/zh.');
const { registerCacheTransport } = await import('../lib/settings.js');
const routes = new Map();let extractedLanguage;
const manager = { config:{}, browserSessions:{status:async()=>({browser:'当前平台',componentMessage:'本地组件已安装，等待 Desktop 载入。'})}, extract:async(_id,_file,_signal,lang)=>{extractedLanguage=lang;return {canceled:true};}, remove:async()=>{throw new Error('缓存文件不存在，请刷新列表。');} };
const dispose=registerCacheTransport({fetch:{register:({path,fetch})=>{routes.set(path,fetch);return()=>routes.delete(path);}}},manager);
async function request(endpoint,payload){const method='video-vision/cache/'+endpoint;const response=await routes.get('/api/'+method)(new Request('http://localhost/api/'+method,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({type:'client-request',rpcId:'test',method,payload})}));return (await response.json()).result;}
assert.equal((await request('remove',{confirm:true,uiLanguage:'en'})).error.message,'The cached file does not exist. Refresh the list.');
assert.equal((await request('remove',{confirm:true,uiLanguage:'zh'})).error.message,'缓存文件不存在，请刷新列表。');
assert.equal((await request('remove',{confirm:true,uiLanguage:'en'})).error.code,'video_vision_cache');
await request('extract',{uiLanguage:'en'});assert.equal(extractedLanguage,'en');
assert.equal((await request('browser-status',{uiLanguage:'en'})).value.browser,'Current platform');
dispose();assert.equal(routes.size,0);
console.log('PASS: actual transport handler preserves error codes/Chinese and forwards English to extraction dialog.');
