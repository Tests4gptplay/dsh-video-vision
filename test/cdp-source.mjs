import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import Sources from '../browser-session/cdp-source.cjs';
const directory = await mkdtemp(join(tmpdir(), 'vv-cdp-source-'));
const A = 'ws://127.0.0.1:43123/devtools/browser/aaaaaaaa-1111';
const B = 'ws://127.0.0.1:43124/devtools/browser/bbbbbbbb-2222';
const id = endpoint => createHash('sha256').update(endpoint).digest('hex');
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
let endpoints = [A, B], hold, fail = false;
const calls = [];
const options = { directory,
  discover: async () => endpoints,
  capture: async ({ endpoint, signal }) => {
    calls.push(endpoint);
    if (hold) { const current = hold; hold = null; current.started.resolve(); await current.release.promise; }
    if (fail) throw new Error('synthetic endpoint failed');
    return [{ name: 'fixture', value: endpoint === A ? 'synthetic-A' : 'synthetic-B' }];
  },
};
try {
  let source = Sources.createCdpSource(options);
  assert.equal(await source.selected(), null);
  const list = await source.list();
  assert.equal(list.length, 2);
  assert.ok(list.every(item => Object.keys(item).join(',') === 'id,label'));
  assert.ok(!JSON.stringify(list).includes('ws://'));
  assert.equal(list[0].id, id(A));
  await assert.rejects(source.capture(), { code: 'browser_source_required' });
  endpoints = [A]; await assert.rejects(source.capture(), { code: 'browser_source_required' });
  endpoints = [A, B];
  await source.select(id(A));
  assert.equal((await source.capture())[0].value, 'synthetic-A');
  const pendingHold = { started: deferred(), release: deferred() }; hold = pendingHold;
  const pending = source.capture();
  const rejection = assert.rejects(pending, { code: 'browser_source_changed' });
  await pendingHold.started.promise;
  await source.select(id(B)); await rejection;
  assert.equal((await source.capture())[0].value, 'synthetic-B');
  pendingHold.release.resolve(); await new Promise(resolve => setImmediate(resolve));
  assert.equal((await source.capture())[0].value, 'synthetic-B');
  assert.deepEqual(JSON.parse(await readFile(join(directory, 'cdp-selected-source.json'), 'utf8')), { id: id(B), label: list[1].label });
  source = Sources.createCdpSource(options);
  assert.equal((await source.capture())[0].value, 'synthetic-B');
  endpoints = [A];
  assert.deepEqual(await source.selected(), { id: id(B), label: list[1].label }, 'Offline selection remains available for snapshot reads');
  const previousCalls = calls.length;
  await assert.rejects(source.capture(), { code: 'browser_source_unavailable' });
  assert.equal(calls.length, previousCalls, 'Missing selected endpoint does not try another browser');
  endpoints = [A, B]; fail = true;
  await assert.rejects(source.capture(), /synthetic endpoint failed/);
  assert.equal(calls.at(-1), B);
  fail = false; assert.equal((await source.capture())[0].value, 'synthetic-B');
  const cancelling = { started: deferred(), release: deferred() }; hold = cancelling;
  const controller = new AbortController();
  const cancelled = source.capture({ signal: controller.signal });
  const cancelledRejection = assert.rejects(cancelled, /synthetic stop/);
  await cancelling.started.promise;
  controller.abort(new Error('synthetic stop')); await cancelledRejection;
  cancelling.release.resolve(); await new Promise(resolve => setImmediate(resolve));
  assert.equal((await source.capture())[0].value, 'synthetic-B');
  await writeFile(join(directory, 'cdp-selected-source.json'), '{invalid');
  source = Sources.createCdpSource(options);
  await assert.rejects(source.capture(), { code: 'browser_source_unavailable' });
  await source.select(id(A));
  assert.equal((await source.capture())[0].value, 'synthetic-A');
  console.log('PASS: hashed endpoint list, explicit selection, persistence, no fallback, source switching, late-result discard, cancellation and retry; injected synthetic discovery/capture only.');
} finally { await rm(directory, { recursive: true, force: true }); }
