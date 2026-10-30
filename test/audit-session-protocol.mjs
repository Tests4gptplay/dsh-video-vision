import assert from 'node:assert/strict';
import test from 'node:test';
import { PassThrough, Duplex, Writable } from 'node:stream';
import { once } from 'node:events';
import { endianness, tmpdir } from 'node:os';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import net from 'node:net';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import P from '../browser-session/protocol.cjs';

const packet = (value, order = 'LE') => {
  const body = Buffer.from(JSON.stringify(value)), header = Buffer.alloc(4);
  header[`writeUInt32${order}`](body.length);
  return Buffer.concat([header, body]);
};
const lengthHeader = (size, order = 'LE') => {
  const header = Buffer.alloc(4); header[`writeUInt32${order}`](size); return header;
};
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
const large = { cookies: Array.from({ length: 1300 }, (_, i) => ({ name: `synthetic_${i}`, value: 'v'.repeat(4096), domain: 'example.test', path: '/', secure: true })) };
assert(Buffer.byteLength(JSON.stringify(large)) > 4 * 1024 * 1024);

function decode(chunks, read = P.frames) {
  const stream = new PassThrough(), values = [], failures = [];
  read(stream, value => values.push(value), error => failures.push(error));
  for (const chunk of chunks) stream.write(chunk);
  return { stream, values, failures };
}

test('local IPC sends and receives complete >4 MiB cookie messages without truncation', async () => {
  const stream = new PassThrough(), values = [], failures = [];
  P.frames(stream, value => values.push(value), error => failures.push(error));
  P.send(stream, large); stream.end(); await once(stream, 'end');
  assert.deepEqual(values, [large]); assert.deepEqual(failures, []);
});

test('large sends remain complete when the writable applies backpressure', async () => {
  const chunks = [], stream = new Writable({
    highWaterMark: 1,
    write(chunk, _encoding, done) { chunks.push(Buffer.from(chunk)); setImmediate(done); }
  });
  assert.equal(P.send(stream, large), false, 'Backpressure is not a truncation/error');
  stream.end(); await once(stream, 'finish');
  const result = decode(chunks); result.stream.end(); await once(result.stream, 'end');
  assert.deepEqual(result.values, [large]); assert.equal(result.failures.length, 0);
});

test('all header, UTF-8 body, multi-frame boundaries and fragmented >4 MiB payloads survive', async () => {
  const first = { text: '汉字🙂' }, second = { text: 'next' }, wire = Buffer.concat([packet(first), packet(second)]);
  for (let boundary = 1; boundary < wire.length; boundary++) {
    const result = decode([wire.subarray(0, boundary), wire.subarray(boundary)]);
    result.stream.end(); await once(result.stream, 'end');
    assert.deepEqual(result.values, [first, second], `split ${boundary}`); assert.equal(result.failures.length, 0);
  }
  const wireLarge = Buffer.concat([packet(large), packet(second)]), chunks = [];
  // Deliberately use unequal byte chunks rather than a message size/timeout policy.
  for (let offset = 0; offset < wireLarge.length; offset += 8191) chunks.push(wireLarge.subarray(offset, offset + 8191));
  const result = decode(chunks); result.stream.end(); await once(result.stream, 'end');
  assert.deepEqual(result.values, [large, second]); assert.equal(result.failures.length, 0);
});

test('malformed, zero, invalid UTF-8 and truncated frames fail once; a new stream recovers', async () => {
  const invalidJson = Buffer.from('{!}');
  const malformed = [Buffer.alloc(4), Buffer.concat([lengthHeader(invalidJson.length), invalidJson]), Buffer.concat([lengthHeader(3), Buffer.from([0x22, 0xff, 0x22])])];
  for (const wire of malformed) {
    const result = decode([wire, packet({ ignored: true })]); result.stream.resume(); result.stream.end(); await once(result.stream, 'end');
    assert.equal(result.values.length, 0); assert.equal(result.failures.length, 1);
  }
  for (const wire of [Buffer.from([0x01, 0x00]), Buffer.concat([lengthHeader(10), Buffer.from('{}')]), lengthHeader(0xffffffff)]) {
    const result = decode([wire]); assert.equal(result.failures.length, 0, 'Incomplete advertised size is not an invented budget rejection');
    result.stream.end(); await once(result.stream, 'end'); assert.equal(result.failures.length, 1);
  }
  const recovered = decode([packet({ recovered: true })]); recovered.stream.end(); await once(recovered.stream, 'end');
  assert.deepEqual(recovered.values, [{ recovered: true }]); assert.equal(recovered.failures.length, 0);
});

test('Chrome native messaging keeps its real asymmetric limits separately from local IPC', async () => {
  const order = endianness();
  const native = decode([packet(large, order)], P.framesNative); native.stream.end(); await once(native.stream, 'end');
  assert.deepEqual(native.values, [large]); assert.equal(native.failures.length, 0);
  const allowedHeader = decode([lengthHeader(64 * 1024 * 1024, order)], P.framesNative);
  assert.equal(allowedHeader.failures.length, 0); allowedHeader.stream.end(); await once(allowedHeader.stream, 'end');
  assert.equal(allowedHeader.failures.length, 1, 'Allowed boundary with missing body is a truncated frame');
  const rejected = decode([lengthHeader(64 * 1024 * 1024 + 1, order)], P.framesNative);
  assert.equal(rejected.failures.length, 1); rejected.stream.resume(); rejected.stream.end(); await once(rejected.stream, 'end');
  const chunks = [], target = { write(chunk) { chunks.push(chunk); return true; } };
  P.sendNative(target, 'x'.repeat(1024 * 1024 - 2));
  assert.equal(chunks[0][`readUInt32${order}`](0), 1024 * 1024); assert.equal(chunks[1].length, 1024 * 1024);
  assert.throws(() => P.sendNative(target, 'x'.repeat(1024 * 1024 - 1)), { code: 'invalid_browser_session_frame' });
  assert.equal(chunks.length, 2, 'Oversize native output writes no partial header');
});

test('real local socket large request/response, malformed-connection retry and cancellation recover', { timeout: 15000 }, async t => {
  if (process.env.VV_SKIP_SOCKET_TEST === '1') {
    t.skip('Explicit VV_SKIP_SOCKET_TEST=1 after observed Unix socket listen EPERM; real IPC/cancellation not verified.');
    return;
  }
  // The test deadline detects hangs; it is not a production message/operation limit.
  const directory = await mkdtemp(join(tmpdir(), 'vv-ipc-audit-')), accepted = deferred(), canceled = deferred(), peers = new Set();
  let server;
  try {
    await writeFile(join(directory, 'bridge.key'), 'a'.repeat(64), { mode: 0o600 });
    server = net.createServer(socket => {
      peers.add(socket); socket.once('close', () => peers.delete(socket)); socket.on('error', () => {});
      P.frames(socket, message => {
        if (message.op === 'slow') { socket.once('close', canceled.resolve); accepted.resolve(); socket.write(lengthHeader(200)); socket.write(Buffer.from('{')); return; }
        if (message.op === 'bad') { socket.end(Buffer.concat([lengthHeader(3), Buffer.from('{!}')])); return; }
        P.send(socket, { ok: true, value: message.body ?? { recovered: true } });
      }, () => socket.destroy());
    });
    server.listen(P.socketPath(directory));
    try { await once(server, 'listening'); }
    catch (error) { if (error.code === 'EPERM') { t.skip('Environment denies Unix socket listen (EPERM); real IPC/cancellation not verified.'); return; } throw error; }
    assert.deepEqual(await P.request('echo', { body: large }, { directory }), large);
    await assert.rejects(P.request('bad', {}, { directory }), /响应无效/);
    assert.deepEqual(await P.request('retry', {}, { directory }), { recovered: true });
    const controller = new AbortController(), pending = P.request('slow', {}, { directory, signal: controller.signal });
    await accepted.promise; controller.abort(new Error('synthetic cancellation'));
    await assert.rejects(pending, /synthetic cancellation/); await canceled.promise;
    assert.deepEqual(await P.request('retry', {}, { directory }), { recovered: true });
    const circular = {}; circular.self = circular;
    await assert.rejects(P.request('invalid-encode', { body: circular }, { directory }), /circular/i);
    assert.deepEqual(await P.request('retry', {}, { directory }), { recovered: true });
  } finally {
    for (const socket of peers) socket.destroy();
    if (server?.listening) await new Promise(resolve => server.close(resolve));
    await rm(directory, { recursive: true, force: true });
  }
});

test('request state machine over in-memory duplex: full large messages, bad reply retry, cancellation and encode failure', async () => {
  // This isolates request/decoder cleanup. It does not substitute for the real socket test.
  const directory = await mkdtemp(join(tmpdir(), 'vv-request-memory-')), accepted = deferred(), canceled = deferred();
  const peers = new Set();
  class MemorySocket extends Duplex {
    _read() {}
    _write(chunk, _encoding, done) { if (!this.peer.destroyed) this.peer.push(Buffer.from(chunk)); done(); }
    _destroy(error, done) { queueMicrotask(() => this.peer.destroy()); done(error); }
  }
  const connect = () => {
    const socket = new MemorySocket(), peer = new MemorySocket(); socket.peer = peer; peer.peer = socket;
    peers.add(peer); peer.on('error', () => {}); peer.once('close', () => peers.delete(peer));
    P.frames(peer, message => {
      if (message.op === 'slow') { peer.once('close', canceled.resolve); accepted.resolve(); peer.write(lengthHeader(200)); peer.write(Buffer.from('{')); return; }
      if (message.op === 'bad') { peer.write(Buffer.concat([lengthHeader(3), Buffer.from('{!}')])); return; }
      P.send(peer, { ok: true, value: message.body ?? { recovered: true } });
    }, () => peer.destroy());
    queueMicrotask(() => socket.emit('connect'));
    return socket;
  };
  const localRequire = createRequire(import.meta.url), module = { exports: {} };
  vm.runInNewContext(readFileSync(new URL('../browser-session/protocol.cjs', import.meta.url), 'utf8'), {
    require: name => name === 'node:net' ? { connect } : localRequire(name), module, Buffer, TextDecoder, process, setTimeout, clearTimeout
  });
  const request = module.exports.request;
  try {
    await writeFile(join(directory, 'bridge.key'), 'b'.repeat(64), { mode: 0o600 });
    assert.equal(JSON.stringify(await request('echo', { body: large }, { directory })), JSON.stringify(large));
    await assert.rejects(request('bad', {}, { directory }), /响应无效/);
    assert.equal((await request('retry', {}, { directory })).recovered, true);
    const controller = new AbortController(), pending = request('slow', {}, { directory, signal: controller.signal });
    await accepted.promise; controller.abort(new Error('synthetic cancellation'));
    await assert.rejects(pending, /synthetic cancellation/); await canceled.promise;
    assert.equal((await request('retry', {}, { directory })).recovered, true);
    const circular = {}; circular.self = circular;
    await assert.rejects(request('invalid-encode', { body: circular }, { directory }), /circular/i);
    assert.equal((await request('retry', {}, { directory })).recovered, true);
  } finally { for (const peer of peers) peer.destroy(); await rm(directory, { recursive: true, force: true }); }
});
