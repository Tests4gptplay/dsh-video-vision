import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, writeFile, readFile, rm, chmod } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { BudgetExceededError, budgetRecovery, timeoutRecovery, budgetSignal } from '../lib/budgets.js';
import { VideoVision, DEFAULTS } from '../lib/engine.js';
import { run } from '../lib/process.js';
import { runMethod, MethodNeeded, ensureConfiguration } from '../lib/extensions.js';
import { invokeResolver, downloadWeb } from '../lib/ytdlp.js';
import { inspectAudio } from '../lib/audio.js';
import { makeTool } from '../index.js';

const signal = () => new AbortController().signal;
const eightBytes = 8 / 1024 / 1024;
async function workspace(t) {
  const root = await mkdtemp(join(tmpdir(), 'vv-budget-recovery-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}
function budget(error, setting, value) {
  const recovery = budgetRecovery(error);
  assert.equal(recovery?.state, 'budget_exceeded');
  assert.equal(recovery.code, 'VIDEO_VISION_BUDGET_EXCEEDED');
  assert.deepEqual(recovery.budget, { setting, value, unit: setting === 'maxDownloadMB' ? 'MiB' : 'ms' });
  assert.match(recovery.settings_path, /Settings.*Video Vision.*Optional processing budgets/);
  assert.match(recovery.next_action, /0 \(unlimited\).*save.*retry/);
  assert(!/select resolver|try a site resolver/.test(recovery.next_action));
  assert.equal(timeoutRecovery(error), null);
  return true;
}

test('size budget identifies its exact setting for declared and streaming bytes; increasing/0 recovers', async t => {
  const root = await workspace(t), engine = new VideoVision(root, { maxDownloadMB: eightBytes });
  let requests = 0;
  for (const declared of [true, false]) {
    engine.mediaFetch = async () => { requests++; return new Response(Buffer.alloc(16, 7), declared ? { headers: { 'content-length': '16' } } : {}); };
    const before = requests;
    await assert.rejects(engine.download(['https://fixture.invalid/one', 'https://fixture.invalid/two'], join(root, `size-${declared}.bin`), 'https://fixture.invalid/', signal()), error => budget(error, 'maxDownloadMB', eightBytes));
    assert.equal(requests, before + 1, 'A configured budget failure is not retried as a CDN/resolver failure');
  }
  engine.config.maxDownloadMB = 16 / 1024 / 1024;
  await engine.download(['https://fixture.invalid/one'], join(root, 'raised.bin'), 'https://fixture.invalid/', signal());
  assert.equal((await readFile(join(root, 'raised.bin'))).length, 16);
  engine.config.maxDownloadMB = 0;
  await engine.download(['https://fixture.invalid/one'], join(root, 'unlimited.bin'), 'https://fixture.invalid/', signal());
  assert.equal((await readFile(join(root, 'unlimited.bin'))).length, 16);
});

test('configured download timeout survives fetch and pipeline AbortError; cancellation stays cancellation', async t => {
  const root = await workspace(t), engine = new VideoVision(root, { downloadTimeoutMs: 25 });
  engine.mediaFetch = async (_url, { signal }) => { await delay(10000, undefined, { signal }); return new Response('late'); };
  await assert.rejects(engine.download(['https://fixture.invalid/slow'], join(root, 'fetch.bin'), 'https://fixture.invalid/', signal()), error => budget(error, 'downloadTimeoutMs', 25));
  engine.mediaFetch = async (_url, { signal }) => new Response(new ReadableStream({
    async pull(controller) { try { await delay(10000, undefined, { signal }); controller.enqueue(new Uint8Array([1])); } catch (error) { controller.error(error); } }
  }));
  await assert.rejects(engine.download(['https://fixture.invalid/slow-body'], join(root, 'body.bin'), 'https://fixture.invalid/', signal()), error => budget(error, 'downloadTimeoutMs', 25));
  const stop = new AbortController(), reason = new Error('synthetic explicit user cancellation');
  engine.config.downloadTimeoutMs = 0;
  engine.mediaFetch = async (_url, { signal }) => { stop.abort(reason); signal.throwIfAborted(); };
  await assert.rejects(engine.download(['https://fixture.invalid/cancel'], join(root, 'cancel.bin'), 'https://fixture.invalid/', stop.signal), error => error === reason);
  engine.mediaFetch = async () => new Response('recovered');
  await engine.download(['https://fixture.invalid/retry'], join(root, 'retry.bin'), 'https://fixture.invalid/', signal());
});

test('real owned child-process deadline has process setting and original timeout cause; retry and cancellation recover', async t => {
  const root = await workspace(t);
  await assert.rejects(run(process.execPath, ['-e', 'setInterval(()=>{},1000)'], root, signal(), 25, 'process-budget'), error => {
    budget(error, 'processTimeoutMs', 25);
    assert(error.cause instanceof BudgetExceededError); assert.equal(error.cause.cause.name, 'TimeoutError'); return true;
  });
  assert.equal((await run(process.execPath, ['-e', 'console.log("recovered")'], root, signal(), 0, 'process-retry')).trim(), 'recovered');
  const stop = new AbortController(), reason = new Error('synthetic process cancellation');
  const pending = run(process.execPath, ['-e', 'setInterval(()=>{},1000)'], root, stop.signal, 0, 'process-cancel');
  setTimeout(() => stop.abort(reason), 25);
  await assert.rejects(pending, error => error === reason);
});

test('site method combined video/audio size and deadline identify download settings, not resolver replacement', async t => {
  const root = await workspace(t), modulePath = join(root, 'method.mjs');
  const method = { modulePath, id: 'synthetic', revision: '1', name: 'Synthetic method' };
  const config = { ...DEFAULTS, nodePath: process.execPath, maxDownloadMB: eightBytes };
  await writeFile(modulePath, `import {writeFile} from 'node:fs/promises';export default async ({outputDirectory})=>{await writeFile(outputDirectory+'/video.mp4','12345');await writeFile(outputDirectory+'/audio.m4a','67890');return {mediaPath:'video.mp4',audioPath:'audio.m4a'};}`);
  await assert.rejects(runMethod(method, 'https://fixture.invalid/', root, config, signal()), error => budget(error, 'maxDownloadMB', eightBytes));
  assert.equal((await runMethod(method, 'https://fixture.invalid/', root, { ...config, maxDownloadMB: 0 }, signal())).downloadBytes, 10);
  await writeFile(modulePath, 'export default async()=>{await new Promise(()=>{setInterval(()=>{},1000)});}');
  await assert.rejects(runMethod(method, 'https://fixture.invalid/', root, { ...config, downloadTimeoutMs: 25 }, signal()), error => budget(error, 'downloadTimeoutMs', 25));
});

test('yt-dlp budget classification requires its actual measured-size diagnostic and matching supplied limit', async t => {
  const root = await workspace(t), config = { ...DEFAULTS, ytDlpPath: process.execPath, maxDownloadMB: eightBytes };
  const diagnostic = '[download] File is larger than max-filesize (16 bytes > 8 bytes). Aborting.';
  for (const exit of [0, 1]) {
    await assert.rejects(invokeResolver(['-e', `console.error(${JSON.stringify(diagnostic)});process.exit(${exit})`, '--', '--max-filesize', '8'], root, config, signal(), `yt-size-${exit}`), error => {
      budget(error, 'maxDownloadMB', eightBytes); assert(error.cause); assert.match(error.cause.message, /larger than max-filesize/); return true;
    });
  }
  await assert.rejects(invokeResolver(['-e', `console.log(${JSON.stringify(diagnostic)});console.error('unrelated diagnostic');`, '--', '--max-filesize', '8'], root, config, signal(), 'yt-stdout-size'), error => {
    budget(error, 'maxDownloadMB', eightBytes); assert.equal(error.cause.message, diagnostic); return true;
  });
  const ordinary = await invokeResolver(['-e', 'console.log("ordinary text says timeout or max-filesize")'], root, config, signal(), 'yt-ordinary');
  assert.match(ordinary, /ordinary text/);
  await assert.rejects(invokeResolver(['-e', `console.error(${JSON.stringify(diagnostic)});process.exit(1)`, '--', '--max-filesize', '9'], root, config, signal(), 'yt-mismatch'), error => {
    assert.equal(budgetRecovery(error), null); assert.equal(timeoutRecovery(error), null); return true;
  });
  await assert.rejects(invokeResolver(['-e', 'setInterval(()=>{},1000)'], root, { ...config, downloadTimeoutMs: 25 }, signal(), 'yt-time'), error => budget(error, 'downloadTimeoutMs', 25));
});

test('yt-dlp measured file size is typed while empty output is not guessed to be a budget failure', async t => {
  const root = await workspace(t), executable = join(root, 'synthetic-resolver');
  await writeFile(executable, `#!${process.execPath}\nconst fs=require('node:fs'),p=require('node:path'),a=process.argv.slice(2);if(a.includes('--dump-single-json'))console.log(JSON.stringify({id:'synthetic',title:'synthetic'}));else{const f=p.join(a[a.indexOf('--paths')+1],'video.mp4');fs.writeFileSync(f,'1234567890123456');console.log(f);}`);
  await chmod(executable, 0o700);
  const config = { ...DEFAULTS, ytDlpPath: executable, maxDownloadMB: eightBytes };
  await assert.rejects(downloadWeb('https://fixture.invalid/', root, config, signal()), error => budget(error, 'maxDownloadMB', eightBytes));
  assert.equal((await downloadWeb('https://fixture.invalid/', root, { ...config, maxDownloadMB: 0 }, signal())).downloadBytes, 16);
  await writeFile(executable, `#!${process.execPath}\nif(process.argv.includes('--dump-single-json'))console.log(JSON.stringify({id:'synthetic'}));`);
  await assert.rejects(downloadWeb('https://fixture.invalid/', root, config, signal()), error => {
    assert.equal(budgetRecovery(error), null); assert.match(error.message, /no specific budget failure/); return true;
  });
});

test('upstream typed timeout preserves cause and never becomes a configured budget; ordinary strings are not classified', async t => {
  const root = await workspace(t), engine = new VideoVision(root, { downloadTimeoutMs: 10000 });
  const timeout = new DOMException('synthetic upstream deadline', 'TimeoutError');
  const original = new TypeError('fetch failed', { cause: timeout });
  engine.mediaFetch = async () => { throw original; };
  await assert.rejects(engine.download(['https://fixture.invalid/'], join(root, 'upstream.bin'), 'https://fixture.invalid/', signal()), error => {
    assert.equal(error, original); assert.equal(budgetRecovery(error), null);
    assert.equal(timeoutRecovery(error).state, 'upstream_timeout'); assert.equal(timeoutRecovery(error).cause.message, timeout.message); return true;
  });
  assert.equal(timeoutRecovery(new Error('timeout mentioned by an unrelated failure')), null);
  assert.equal(timeoutRecovery(Object.assign(new Error('connect'), { cause: Object.assign(new Error('socket'), { code: 'ETIMEDOUT' }) })).state, 'upstream_timeout');
  const canceled = new AbortController(); canceled.abort(timeout);
  assert.equal(budgetSignal(canceled.signal, 0), canceled.signal);
});

test('engine and tool boundaries report exact recovery instead of needs_method; generic failures retain cause', async t => {
  const root = await workspace(t), config = { ...DEFAULTS, configDirectory: join(root, 'config'), cacheDirectory: join(root, 'cache'), maxDownloadMB: eightBytes, nodePath: process.execPath };
  const directory = await ensureConfiguration(config), methodDirectory = join(directory, 'resolvers', 'synthetic');
  await mkdir(methodDirectory);
  await writeFile(join(methodDirectory, 'manifest.json'), JSON.stringify({ name: 'Synthetic', enabled: true, hosts: ['fixture.invalid'] }));
  const modulePath = join(methodDirectory, 'resolve.mjs');
  await writeFile(modulePath, `import {writeFile} from 'node:fs/promises';export default async({outputDirectory})=>{await writeFile(outputDirectory+'/video.mp4','1234567890123456');return {mediaPath:'video.mp4'};}`);
  const engine = new VideoVision(root, config);
  await assert.rejects(engine.open('https://fixture.invalid/', signal()), error => { assert(!(error instanceof MethodNeeded)); return budget(error, 'maxDownloadMB', eightBytes); });
  const tool = makeTool({ workingDirectory: { ensure: async () => root }, get: () => undefined }, config);
  const result = await tool.execute({ action: 'open', source: 'https://fixture.invalid/', audio_mode: 'off' }, { agent: {}, signal: signal() });
  assert.equal(result.state, 'budget_exceeded'); assert.equal(result.budget.setting, 'maxDownloadMB'); assert(result.method_guidance);
  assert(!/select resolver|try a site resolver/.test(result.next_action));
  await writeFile(modulePath, 'export default async()=>{throw new Error("synthetic unrelated resolver failure");}');
  await assert.rejects(engine.open('https://fixture.invalid/other', signal()), error => { assert(error instanceof MethodNeeded); assert(error.cause); assert.match(error.cause.message, /synthetic unrelated resolver failure/); return true; });
  const fetchOriginal = globalThis.fetch, upstream = new DOMException('synthetic upstream deadline', 'TimeoutError');
  try {
    globalThis.fetch = async () => { throw upstream; };
    const timeoutResult = await tool.execute({ action: 'open', source: 'BV1GTn66pEi3' }, { agent: {}, signal: signal() });
    assert.equal(timeoutResult.state, 'upstream_timeout'); assert.equal(timeoutResult.cause.message, upstream.message);
    const canceled = new AbortController(); canceled.abort(upstream);
    await assert.rejects(tool.execute({ action: 'open', source: 'BV1GTn66pEi3' }, { agent: {}, signal: canceled.signal }), error => error === upstream);
  } finally { globalThis.fetch = fetchOriginal; }
});

test('audio failure exposes budget recovery without relabeling no-audio or user cancellation', async () => {
  const asset = { duration: 5 }, args = {}, limit = new BudgetExceededError('processTimeoutMs', 500);
  const audio = await inspectAudio({ audioClip: async () => { throw limit; } }, asset, args, undefined, {}, signal());
  assert.equal(audio.state, 'budget_exceeded'); assert.equal(audio.budget.setting, 'processTimeoutMs'); assert.equal(audio.reason, limit.message);
  const missing = await inspectAudio({ audioClip: async () => { throw Object.assign(new Error('missing'), { code: 'NO_AUDIO' }); } }, asset, args, undefined, {}, signal());
  assert.equal(missing.state, 'no-audio');
  const stop = new AbortController(), reason = new Error('synthetic audio cancel');
  await assert.rejects(inspectAudio({ audioClip: async () => { stop.abort(reason); throw limit; } }, asset, args, undefined, {}, stop.signal), error => error === reason);
});

test('actual watch/audio/transcribe tool paths preserve action and configured process recovery', async t => {
  const root = await workspace(t), executable = join(root, 'synthetic-slow-process');
  await writeFile(executable, `#!${process.execPath}\nsetInterval(()=>{},1000);`); await chmod(executable, 0o700);
  const config = { ...DEFAULTS, configDirectory: join(root, 'config'), cacheDirectory: join(root, 'cache'), ffmpegPath: executable, processTimeoutMs: 25 };
  const engine = new VideoVision(root, config), id = 'synthetic-cached', folder = engine.folder(id), mediaPath = join(folder, 'video.mp4');
  await mkdir(folder, { recursive: true }); await writeFile(mediaPath, 'synthetic fixture, not actual media');
  await engine.save({ id, title: 'Synthetic', source: 'local', mediaPath, duration: 1, width: 1, height: 1, hasAudio: true, cursor: 0, captions: { state: 'none', cues: [] } });
  const tool = makeTool({ workingDirectory: { ensure: async () => root }, get: () => undefined }, config);
  const watch = await tool.execute({ video_id: id, timestamps: [0], audio_mode: 'off' }, { agent: {}, signal: signal() });
  assert.equal(watch.action, 'watch'); assert.equal(watch.state, 'budget_exceeded'); assert.equal(watch.budget.setting, 'processTimeoutMs');
  for (const action of ['audio', 'transcribe']) {
    const result = await tool.execute({ action, video_id: id, start_seconds: 0, end_seconds: 1 }, { agent: {}, signal: signal() });
    assert.equal(result.action, action); assert.equal(result.audio.state, 'budget_exceeded'); assert.equal(result.audio.budget.setting, 'processTimeoutMs');
    assert.match(result.audio.settings_path, /Optional processing budgets/);
  }
});
