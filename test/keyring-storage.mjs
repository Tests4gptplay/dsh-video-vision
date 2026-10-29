import assert from 'node:assert/strict';
import { createKeyringStorage } from '../browser-session/keyring-storage.cjs';

// In-memory injected store only. No native binding is loaded by this suite.
function fake() {
  const values = new Map(), calls = [];
  class AsyncEntry {
    constructor(service, account, options) { this.id = `${service}:${account}`; calls.push(['entry', service, account, options]); }
    async getPassword() { calls.push(['read', this.id]); return values.get(this.id) ?? null; }
    async setPassword(value) { calls.push(['write', this.id]); values.set(this.id, value); }
  }
  return { values, calls, module: { AsyncEntry } };
}
const f = fake(), options = { directory: '/synthetic/vv-qa', keyringModule: f.module };
const a = await createKeyringStorage(options);
assert.equal(f.calls.length, 0);
assert.equal(a.isEncryptionAvailable(), true);
assert.equal(f.calls.length, 1);
assert.deepEqual(f.calls[0][3], { linux: { store: 'secret-service' } });
const sealed = await a.encryptString('合成测试 only');
assert.equal(f.calls.filter(x => x[0] === 'write').length, 1);
assert.equal(await a.decryptString(sealed), '合成测试 only');
assert.notDeepEqual(await a.encryptString('合成测试 only'), sealed);
const b = await createKeyringStorage(options);
assert.equal(await b.decryptString(sealed), '合成测试 only');
assert.equal(f.calls.filter(x => x[0] === 'write').length, 1);
for (const index of [0, 5, 17, 33]) {
  const changed = Buffer.from(sealed); changed[index] ^= 1;
  await assert.rejects(b.decryptString(changed));
}
await assert.rejects(b.decryptString(Buffer.from('old Electron snapshot')));
const c = await createKeyringStorage({ ...options, directory: '/synthetic/other' });
await assert.rejects(c.decryptString(sealed), /key was not found/);
assert.equal(f.calls.filter(x => x[0] === 'write').length, 1);
await Promise.all([c.prepare(), c.prepare(), c.encryptString('parallel')]);
assert.equal(f.calls.filter(x => x[0] === 'write').length, 2);
await assert.rejects(c.decryptString(sealed));
const broken = fake();
const d = await createKeyringStorage({ directory: '/synthetic/bad', keyringModule: broken.module });
d.isEncryptionAvailable(); broken.values.set(broken.calls[0].slice(1, 3).join(':'), 'broken');
await assert.rejects(d.prepare(), /key is invalid/);
assert.equal(broken.calls.filter(x => x[0] === 'write').length, 0);
let attempts = 0;
class Unavailable { constructor() { attempts++; throw new Error('Secret Service unavailable'); } }
const e = await createKeyringStorage({ directory: '/synthetic/unavailable', keyringModule: { Entry: Unavailable } });
assert.equal(attempts, 0); assert.equal(e.isEncryptionAvailable(), false);
await assert.rejects(e.prepare(), /Secret Service unavailable/);
assert.equal(attempts, 2);
console.log('keyring adapter synthetic tests passed: lazy/status, persistent reopen, unique nonce, tamper, namespace, concurrent prepare, invalid key, unavailable store');
