import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BrowserSessions } from '../lib/browser-session.js';
const directory=await mkdtemp(join(tmpdir(),'vv-service-locale-'));
let mode='body', seen=[], requestError; const upstream=new Error('Raw upstream custom error');upstream.code='UPSTREAM';
const service=new BrowserSessions({browserSessionAuthorized:false},{directory,request:async op=>{if(op!=='status'&&requestError)throw requestError;return op==='status'?{ready:true,connected:true}:{cookies:[]};},fetch:async(_url,options)=>{seen.push(options);if(mode==='upstream')throw upstream;return new Response(new ReadableStream({start(c){c.enqueue(new Uint8Array([1]));}}));}});
try {
 await assert.rejects(service.fetch('https://example.test',{uiLanguage:'en'}),/Default browser authorization is off/);
 await assert.rejects(service.fetch('https://example.test',{uiLanguage:'zh'}),/默认浏览器授权已关闭/);
 await service.setAuthorization({enabled:true});
 const [en,zh]=await Promise.all(['en','zh'].map(uiLanguage=>service.fetch('https://example.test',{uiLanguage})));
 const enBody=en.arrayBuffer(),zhBody=zh.arrayBuffer();
 const checks=[assert.rejects(enBody,/Default browser authorization has been disabled or updated/),assert.rejects(zhBody,/默认浏览器授权已关闭或更新/)];
 await service.setAuthorization({enabled:false});await Promise.all(checks);
 assert.ok(seen.every(options=>!Object.hasOwn(options,'uiLanguage')));
 await service.setAuthorization({enabled:true});mode='upstream';
 await assert.rejects(service.fetch('https://example.test',{uiLanguage:'en'}),error=>error===upstream&&error.code==='UPSTREAM');
 mode='body';requestError=Object.assign(new Error('所选浏览器连接不可用。'),{code:'browser_source_unavailable'});
 await assert.rejects(service.fetch('https://example.test',{uiLanguage:'en'}),error=>error.cause===requestError&&error.code==='browser_source_unavailable'&&!/[\u4e00-\u9fff]/.test(error.message));
 requestError=new Error('Untouched arbitrary upstream failure');
 await assert.rejects(service.fetch('https://example.test',{uiLanguage:'en'}),error=>error===requestError);requestError=undefined;
 const again=await service.fetch('https://example.test',{uiLanguage:'en'});await again.body.cancel();
 console.log('PASS explicit zh/en immediate OFF, concurrent localized body OFF, no locale forwarded to network, upstream identity preserved, ON retry');
}finally{await service.dispose();await rm(directory,{recursive:true,force:true});}
