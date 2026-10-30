import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import Source from '../browser-session/cdp-source.cjs';
import Session from '../browser-session/cdp-session.cjs';
const directory = await mkdtemp(join(tmpdir(), 'vv-cdp-session-'));
const A = 'ws://127.0.0.1:43123/devtools/browser/aaaaaaaa-test';
const B = 'ws://127.0.0.1:43124/devtools/browser/bbbbbbbb-test';
const id = endpoint => createHash('sha256').update('unverified-endpoint:' + endpoint).digest('hex');
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
const safeStorage = {
 prepare: async () => {}, isEncryptionAvailable: async () => true,
 getSelectedStorageBackend: () => 'synthetic-test-only',
 encryptString: async value => Buffer.from('TEST:' + value),
 decryptString: async value => value.toString().slice(5),
};
let endpoints = [A], pendingHold, captures = 0;
const sessions = [];
const make = root => {
 const source = Source.createCdpSource({ directory: root, discover: async () => endpoints,
  capture: async ({ endpoint }) => {
   captures++;
   if (pendingHold) { const hold = pendingHold; pendingHold = null; hold.started.resolve(); await hold.release.promise; }
   return [{ name: 'fixture', value: endpoint === A ? 'synthetic-A' : 'synthetic-B', domain: 'example.test', path: '/', secure: true }];
  },
 });
 const session = Session.createCdpSession({ directory: root, source, createStorage: async () => safeStorage });
 sessions.push(session); return session;
};
const grant = (root, enabled) => writeFile(join(root, 'vv-plugin-authorization-v1.json'), JSON.stringify({ enabled, syncToNative: enabled }));
const cookies = session => session.request('cookies', { url: 'https://example.test/' });
try {
 const one = join(directory, 'one'); await mkdir(one); await grant(one, true);
 const single = make(one);
 assert.equal((await single.status()).sourceId, null, 'Even one endpoint requires explicit selection');
 await single.select(id(A));
 await single.request('import'); assert.equal((await cookies(single)).cookies[0].value, 'synthetic-A');
 const many = join(directory, 'many'); await mkdir(many); await grant(many, true); endpoints = [A, B];
 let session = make(many);
 assert.equal((await session.status()).sourceId, null, 'Multiple endpoints require explicit selection');
 await assert.rejects(session.request('import'), /选择/);
 await session.select(id(A)); await session.request('import');
 const aFile = join(many, 'cdp', id(A), 'session-state-keyring.bin');
 const aSaved = await readFile(aFile);
 await session.select(id(B)); assert.equal((await session.status()).imported, false);
 await assert.rejects(cookies(session), { code: 'no_snapshot' });
 await session.request('import');
 const bFile = join(many, 'cdp', id(B), 'session-state-keyring.bin');
 const bSaved = await readFile(bFile);
 assert.equal((await cookies(session)).cookies[0].value, 'synthetic-B');
 await session.select(id(A)); assert.equal((await cookies(session)).cookies[0].value, 'synthetic-A');
 const hold = { started: deferred(), release: deferred() }; pendingHold = hold;
 const pending = session.request('import'); const rejection = assert.rejects(pending);
 await hold.started.promise; await session.select(id(B)); await rejection;
 hold.release.resolve(); await new Promise(resolve => setImmediate(resolve));
 assert.deepEqual(await readFile(aFile), aSaved, 'Cancelled A refresh does not overwrite its snapshot');
 assert.deepEqual(await readFile(bFile), bSaved, 'Cancelled A capture never writes B snapshot');
 assert.equal((await cookies(session)).cookies[0].value, 'synthetic-B');
 endpoints = []; const count = captures;
 assert.equal((await session.status()).sourceId, id(B));
 assert.equal((await cookies(session)).cookies[0].value, 'synthetic-B');
 await session.close(); session = make(many);
 assert.equal((await cookies(session)).cookies[0].value, 'synthetic-B', 'Offline snapshot survives session recreation');
 assert.equal(captures, count);
 await assert.rejects(session.request('import'), { code: 'browser_source_unavailable' });
 assert.deepEqual(await readFile(bFile), bSaved);
 await grant(many, false);
 for (const op of ['import', 'cookies', 'sync']) await assert.rejects(session.request(op, { url: 'https://example.test/' }), { code: 'disabled' });
 assert.deepEqual(await readFile(aFile), aSaved); assert.deepEqual(await readFile(bFile), bSaved);
 await grant(many, true);
 assert.equal((await cookies(session)).cookies[0].value, 'synthetic-B');
 // Force a selection change before chosen() resolves to the request.
 let currentId = id(A), firstSelection = true;
 const selectionRead = deferred(), releaseSelection = deferred(), writes = [];
 const fakeSource = {
  selected: async () => {
   const savedId = currentId;
   if (firstSelection) { firstSelection = false; selectionRead.resolve(); await releaseSelection.promise; }
   return { id: savedId, label: 'Synthetic race' };
  },
  list: async () => [{ id: id(A), label: 'A' }, { id: id(B), label: 'B' }],
  select: async selectedId => { currentId = selectedId; },
  capture: async () => [{ name: 'fixture', value: currentId }],
 };
 const raced = Session.createCdpSession({ directory: join(directory, 'race'), source: fakeSource,
  createStorage: async () => safeStorage,
  createService: ({ directory: target, capture }) => ({
   status: async () => ({}), close: async () => {},
   dispatch: async () => { writes.push({ target, captured: await capture() }); },
  }),
 });
 sessions.push(raced);
 const racedRequest = raced.request('import'); const raceRejection = assert.rejects(racedRequest);
 await selectionRead.promise;
 await raced.select(id(B)); releaseSelection.resolve(); await raceRejection;
 assert.deepEqual(writes, [], 'Selection change while chosen() awaits must stop before any target snapshot dispatch');
 console.log('PASS: single explicit selection, multiple explicit selection, isolated snapshots, switching capture cancellation, offline persistence, grant disable/reenable with files preserved; real core with injected synthetic storage/discovery/capture, no sockets.');
} finally { await Promise.all(sessions.map(session => session.close())); await rm(directory, { recursive: true, force: true }); }
