import assert from 'node:assert/strict';
import fs from 'node:fs';
const source = fs.readFileSync(new URL('../client.js', import.meta.url), 'utf8');
const css = source.match(/const css = `([\s\S]*?)`;/)[1];
assert.equal((css.match(/{/g)||[]).length,(css.match(/}/g)||[]).length);
let depth=0; for(const c of css){if(c==='(')depth++;if(c===')')depth--;assert(depth>=0);} assert.equal(depth,0);
for(const name of ['hover-bg','focus-color','primary-bg','primary-hover-bg','primary-border','primary-label','danger-color','danger-border','select-label','select-bg','select-border','badge-bg','notice-bg','error-color','error-bg','confirm-border']) assert(css.includes(`var(--vv-${name},`),name);
for(const name of ['button-primary-fill','label-primary-foreground','interactive-bg-hover','state-error-primary','state-error-secondary','interactive-bg-hover-danger','bg-layer-2']) assert(css.includes(`var(--dsw-alias-${name},`),name);
for(const match of css.matchAll(/(?:^|[;{])(?:background|color|border-color|outline|border):([^;}]+)/g)) {
 const value=match[1]; if(/#|rgba?\(|\bwhite\b/.test(value)) assert(value.includes('var('),value);
}
assert(css.includes('.vv-settings select:focus-visible'));
assert(css.includes('color-scheme:inherit'));
assert(!css.includes('!important'));
assert(!css.includes('appearance:none'));
console.log('PASS: theme override hooks, verified Host token chains, legacy fallbacks, balanced CSS, inherited native select. Static only; actual computed styles/skin/native popup remain GUI tests.');
