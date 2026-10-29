const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const { join, resolve } = require('node:path');
const { tmpdir } = require('node:os');
const { createSnapshotService } = require(join(resolve(process.argv[2] || '.'), 'browser-session/snapshot.cjs'));
(async () => {
 const root = await fs.mkdtemp(join(tmpdir(), 'vv-snapshot-recovery-'));
 const services = [], failures = [];
 const fixture = { version: 1, importedAt: '2026-10-29T00:00:00.000Z', cookies: [
  { name: 'synthetic', value: 'synthetic-value', domain: 'example.test', path: '/', secure: true },
 ] };
 const bytes = Buffer.from('TEST:' + JSON.stringify(fixture));
 const make = async name => {
  const directory = join(root, name); await fs.mkdir(directory);
  await fs.writeFile(join(directory, 'authorization.json'), JSON.stringify({ enabled: true, syncToNative: true }));
  let available = true, decryptFails = false, encrypts = 0, captures = 0;
  const safeStorage = {
   isEncryptionAvailable: async () => available,
   getSelectedStorageBackend: () => 'synthetic-only',
   decryptString: async data => {
    if (decryptFails) throw new Error('synthetic temporary decryption failure');
    if (!data.toString().startsWith('TEST:')) throw new Error('synthetic corrupt snapshot');
    return data.toString().slice(5);
   },
   encryptString: async value => { encrypts++; return Buffer.from('TEST:' + value); },
  };
  const service = createSnapshotService({ directory, safeStorage, capture: async () => { captures++; return fixture.cookies; } });
  services.push(service);
  return { service, directory, file: join(directory, 'session-state.bin'),
   available: value => { available = value; }, decryptFails: value => { decryptFails = value; },
   checkNoWrites: () => { assert.equal(encrypts, 0); assert.equal(captures, 0); },
  };
 };
 const run = async (name, fn) => { try { await fn(); console.log('PASS:', name); } catch (error) { failures.push({ name, error: error.message }); console.error('FAIL:', name, error.message); } };
 const readCookies = test => test.service.dispatch({ op: 'cookies', url: 'https://example.test/' });
 try {
  await run('existing snapshot recovers after storage unavailable', async () => {
   const test = await make('storage'); await fs.writeFile(test.file, bytes); test.available(false);
   assert.equal((await test.service.status()).imported, false);
   test.available(true);
   assert.equal((await readCookies(test)).cookies[0].value, 'synthetic-value');
   assert.equal((await test.service.status()).imported, true);
   assert.deepEqual(await fs.readFile(test.file), bytes); test.checkNoWrites();
  });
  await run('existing snapshot recovers after transient decrypt failure', async () => {
   const test = await make('decrypt'); await fs.writeFile(test.file, bytes); test.decryptFails(true);
   assert.equal((await test.service.status()).imported, false);
   test.decryptFails(false);
   assert.equal((await readCookies(test)).cookies[0].value, 'synthetic-value');
   assert.deepEqual(await fs.readFile(test.file), bytes); test.checkNoWrites();
  });
  await run('missing snapshot reports empty without creating one', async () => {
   const test = await make('missing');
   assert.equal((await test.service.status()).imported, false);
   await assert.rejects(readCookies(test), { code: 'no_snapshot' });
   await assert.rejects(fs.readFile(test.file), { code: 'ENOENT' }); test.checkNoWrites();
  });
  await run('corrupt snapshot reports empty without rewriting it', async () => {
   const test = await make('corrupt'); const corrupt = Buffer.from('synthetic damaged data');
   await fs.writeFile(test.file, corrupt);
   assert.equal((await test.service.status()).imported, false);
   await assert.rejects(readCookies(test), { code: 'no_snapshot' });
   assert.deepEqual(await fs.readFile(test.file), corrupt); test.checkNoWrites();
  });
  await run('authorization revoke blocks cookie use and retains snapshot', async () => {
   const test = await make('grant'); await fs.writeFile(test.file, bytes);
   assert.equal((await readCookies(test)).cookies.length, 1);
   await fs.writeFile(join(test.directory, 'authorization.json'), JSON.stringify({ enabled: false, syncToNative: false }));
   await assert.rejects(readCookies(test), { code: 'disabled' });
   assert.deepEqual(await fs.readFile(test.file), bytes); test.checkNoWrites();
  });
 } finally { await Promise.all(services.map(service => service.close())); await fs.rm(root, { recursive: true, force: true }); }
 console.log(JSON.stringify({ tests: 5, failed: failures.length, failures, scope: 'real snapshot core with synthetic storage/files; no sockets, browser, keyring or real credentials' }));
 if (failures.length) process.exitCode = 1;
})().catch(error => { console.error(error); process.exitCode = 1; });
