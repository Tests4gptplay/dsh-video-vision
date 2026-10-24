import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { prepareResolver } from '../lib/prepare.js';
import { invokeResolver } from '../lib/ytdlp.js';

const base = resolve('test/.cache-tests');
await mkdir(base, { recursive: true });
const root = await mkdtemp(join(base, 'prepare-'));
const payload = Buffer.from('official-resolver-fixture');
const digest = createHash('sha256').update(payload).digest('hex');
const assetName = { win32: 'yt-dlp.exe', linux: 'yt-dlp_linux', darwin: 'yt-dlp_macos' }[process.platform];
let calls = 0, checksum = digest;
const fetcher = async url => {
  calls++;
  if (url.endsWith('/releases/latest')) return Response.json({
    tag_name: 'fixture', assets: [{ name: assetName, digest: 'sha256:' + checksum,
      browser_download_url: 'https://example.test/resolver' }]
  });
  assert.equal(url, 'https://example.test/resolver');
  return new Response(payload);
};
try {
  const executable = await prepareResolver({ directory: root }, fetcher);
  assert.deepEqual(await readFile(executable), payload);
  assert.equal(calls, 2);
  assert.equal(await prepareResolver({ directory: root }, fetcher), executable);
  assert.equal(calls, 2);
  checksum = '0'.repeat(64);
  await assert.rejects(prepareResolver({ directory: root, update: true }, fetcher), /checksum mismatch/);
  assert.deepEqual(await readFile(executable), payload);
  await assert.rejects(stat(executable + '.part'), { code: 'ENOENT' });
  await assert.rejects(invokeResolver(['--version'], root,
    { ytDlpPath: join(root, 'missing.exe'), downloadTimeoutMs: 1000 },
    new AbortController().signal, 'missing'), /configured ytDlpPath was not found/);
  console.log('PASS: resolver preparation, reuse, checksum preservation and explicit executable settings.');
} finally {
  if (!root.startsWith(base + '\\')) throw new Error('Unexpected test directory');
  await rm(root, { recursive: true, force: true });
}
