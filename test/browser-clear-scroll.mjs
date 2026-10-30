// React-shaped VM regression, including the confirmation effect/ref lifecycle.
// Not pixel-level GUI or browser scroll anchoring proof.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
const script = await readFile(process.argv[2] || new URL('../client.js',import.meta.url),'utf8');
let factory,Component,inject,dictionaries,language='zh',stateIndex=0,effectIndex=0;
const states=[],refs=[],effects=[],pending=[],calls=[],scrolls=[];
let refIndex=0;
const listing={entries:[{id:'fixture',title:'Synthetic',source:'fixture',bytes:0,files:[]}],bytes:0,root:'/synthetic',browser_session:{enabled:true,sourceId:'A',sourceAvailable:true,localCapture:true,sources:[{id:'A',label:'A',available:true}],imported:true,connected:true,snapshotState:'ready'}};
const React={useSyncExternalStore:(_s,g)=>g(),createElement:(type,props,...children)=>({type,props:props||{},children}),useState:value=>{const i=stateIndex++;if(!(i in states))states[i]=value;return[states[i],v=>states[i]=typeof v==='function'?v(states[i]):v];},useRef:value=>{const i=refIndex++;return refs[i]||=( {current:value});},useEffect:(callback,deps)=>{const i=effectIndex++;if(!effects[i]||deps.some((v,j)=>v!==effects[i][j]))pending.push(callback);effects[i]=deps;}};
const window={addEventListener(){},removeEventListener(){},__ModuleLoader__:{load:m=>factory=m.factory}};
vm.runInNewContext(script,{window});
factory(()=>React).apply({effect:f=>f(),locale:{register:(_n,d)=>{dictionaries=d;return()=>{};},bind:()=>key=>dictionaries[language][key],getSnapshot:()=>({active:language}),subscribe:()=>()=>{}},slots:{inject:(_n,f)=>f(),register:(o,c)=>{Component=c;inject=o.inject;}},connection:{rpc:{call:async(_path,method)=>{calls.push(method);return{ok:true,value:method.endsWith('/browser-clear')?{cleared:true,failures:[]}:listing};}}}});
states[0]=listing;
function render(){stateIndex=effectIndex=refIndex=0;const nodes=[];for(const ref of refs)ref.current=null;
 const walk=(node,parents=[])=>{if(!node||typeof node!=='object')return;nodes.push({...node,parents});if(node.props?.ref)node.props.ref.current={scrollIntoView:options=>scrolls.push({node,options})};for(const child of node.children||[])Array.isArray(child)?child.forEach(c=>walk(c,[...parents,node])):walk(child,[...parents,node]);};
 walk(Component(inject()));for(const fn of pending.splice(0))fn();return nodes;}
const button=(nodes,label)=>nodes.find(n=>n.type==='button'&&n.children[0]===label);
let nodes=render();await new Promise(r=>setImmediate(r));nodes=render();calls.length=0;scrolls.length=0;
// Baseline-compatible lookup demonstrates the old implementation's scroll failure first.
const clearButton=button(nodes,dictionaries.zh.sessionClear);clearButton.props.onClick();nodes=render();
assert.equal(scrolls.length,0,'Opening login-state confirmation must not call scrollIntoView toward storage/cache cards');
assert.equal(calls.length,0,'Opening confirmation does not send cleanup or reload RPC');
const dialog=nodes.find(n=>n.props.role==='alertdialog');
assert.equal(nodes.filter(n=>n.props.role==='alertdialog').length,1);
assert(dialog.parents.some(n=>n.props.className==='vv-card'&&n.children.some(c=>c?.type==='h3'&&c.children.includes('浏览器登录态授权'))),'Confirmation is inside browser-session card');
assert(!dialog.parents.some(n=>n.children.some(c=>c?.type==='h3'&&c.children.includes('存储位置'))));
assert.equal(clearButton.children[0],'清理登录态');
assert.equal(dictionaries.en.sessionClear,'Clear login state');
button(nodes,'取消').props.onClick();nodes=render();assert.equal(scrolls.length,0);assert(!nodes.some(n=>n.props.role==='alertdialog'));
button(nodes,'清理登录态').props.onClick();nodes=render();await button(nodes,'确认删除').props.onClick();nodes=render();assert.equal(scrolls.length,0,'Confirmed clear/reload must not scroll');
assert.equal(calls.filter(c=>c.endsWith('/browser-clear')).length,1);assert(!calls.some(c=>c.endsWith('/clear')));
button(nodes,'清空全部缓存').props.onClick();nodes=render();assert.equal(scrolls.length,1,'Existing media-cache confirmation scrolling is preserved');
assert.equal(scrolls[0].node.props['aria-label'],'确认删除缓存');
console.log('PASS: inline login-state confirmation, zero scroll on open/cancel/confirm+reload, short zh/en labels, no premature cleanup; media confirmation scrolling preserved. VM only.');
