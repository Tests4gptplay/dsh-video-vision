import { createHash } from 'node:crypto';
import { existsSync, createWriteStream } from 'node:fs';
import { mkdir, rename, chmod, writeFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { toolDirectory, resolverName } from './dependencies.js';

export async function prepareResolver({ directory = toolDirectory, update = false, signal } = {}, fetcher = fetch) {
  const executable = join(directory, resolverName);
  if (existsSync(executable) && !update) return executable;
  const names = { win32: 'yt-dlp.exe', linux: 'yt-dlp_linux', darwin: 'yt-dlp_macos' };
  const assetName = names[process.platform];
  if (!assetName || (process.platform !== 'darwin' && process.arch !== 'x64')) {
    throw new Error('Install the official yt-dlp build for your platform and set ytDlpPath.');
  }
  const timeout = AbortSignal.timeout(180000);
  const downloadSignal = signal ? AbortSignal.any([signal, timeout]) : timeout;
  const headers = { 'User-Agent': 'DSH-Video-Vision', Accept: 'application/vnd.github+json' };
  async function get(url) {
    const r = await fetcher(url, { headers, signal: downloadSignal });
    if (!r.ok) throw new Error('Download HTTP ' + r.status + ': ' + url);
    return r;
  }
  const release = await (await get('https://api.github.com/repos/yt-dlp/yt-dlp/releases/latest')).json();
  const asset = release.assets.find(a => a.name === assetName);
  if (!asset) throw new Error('Official release has no ' + assetName);
  let expected = asset.digest?.replace(/^sha256:/, '');
  if (!/^[a-f\d]{64}$/i.test(expected ?? '')) {
    const sums = release.assets.find(a => a.name === 'SHA2-256SUMS');
    if (!sums) throw new Error('Official release has no checksum list.');
    const line = (await (await get(sums.browser_download_url)).text()).split('\n').find(l => l.trim().split(/\s+/).at(-1)?.replace(/^\*/, '') === assetName);
    expected = line?.trim().split(/\s+/)[0];
  }
  if (!/^[a-f\d]{64}$/i.test(expected ?? '')) throw new Error('No valid SHA-256 for ' + assetName);
  await mkdir(directory, { recursive: true });
  const partial = executable + '.part';
  const hash = createHash('sha256');
  try {
    const response = await get(asset.browser_download_url);
    await pipeline(Readable.fromWeb(response.body),
      new Transform({ transform(chunk, _enc, cb) { hash.update(chunk); cb(null, chunk); } }),
      createWriteStream(partial, { flags: 'wx' }), { signal: downloadSignal });
    const actual = hash.digest('hex');
    if (actual !== expected.toLowerCase()) throw new Error('yt-dlp checksum mismatch.');
    // The verified partial and destination are fixed files in the chosen tools folder.
    await rename(partial, executable);
    if (process.platform !== 'win32') await chmod(executable, 0o755);
    await writeFile(join(directory, 'yt-dlp-release.json'), JSON.stringify({
      version: release.tag_name, sha256: actual, source: asset.browser_download_url
    }, null, 2));
    return executable;
  } catch (error) {
    // Only remove this invocation's temporary file, never an existing executable.
    if (error.code !== 'EEXIST') await unlink(partial).catch(() => {});
    throw error;
  }
}
