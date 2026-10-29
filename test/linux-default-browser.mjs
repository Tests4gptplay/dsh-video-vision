import assert from 'node:assert/strict';
import Linux from '../browser-session/platform/linux.cjs';
const linuxDefaultBrowser = Linux.defaultBrowser;
const reads=[];
const browser=await linuxDefaultBrowser({home:'/qa/home',environment:{XDG_DATA_HOME:'/qa/apps'},execute:async(cmd,args)=>{assert.equal(cmd,'xdg-settings');assert.deepEqual(args,['get','default-web-browser']);return {stdout:'google-chrome.desktop\n'};},read:async p=>{reads.push(p);return '[Desktop Entry]\nName=Google Chrome\nExec=/opt/google/chrome/google-chrome %U\n[Other]\nName=Other';}});
assert.equal(browser.label,'Google Chrome');assert.equal(browser.executable,'gio');assert.deepEqual(browser.arguments,['launch','/qa/apps/applications/google-chrome.desktop']);assert.equal(browser.supported,true);
const missing=await linuxDefaultBrowser({execute:async()=>({stdout:'missing.desktop'}),read:async()=>{throw new Error('missing')}});assert.equal(missing.supported,false);assert.equal(missing.label,'未识别');assert.equal(missing.id,'missing.desktop');
console.log('PASS Linux XDG desktop metadata and gio launch arguments; no browser started.');
