import { createHash } from 'node:crypto';
import { openSync, closeSync } from 'node:fs';
import { mkdir, readFile, unlink } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { spawn } from 'node:child_process';

// Use file-backed stdio for compatibility with Windows process sandboxes.
export async function run(executable, args, directory, signal, timeoutMs, stem = 'process', transient = false) {
  signal.throwIfAborted();
  await mkdir(directory, { recursive: true });
  const key = createHash('sha1').update(JSON.stringify(args)).digest('hex').slice(0, 12);
  const outPath = join(directory, `${stem}-${key}.stdout`);
  const errPath = join(directory, `${stem}-${key}.stderr`);
  let stdout, stderr;
  const timeout = AbortSignal.timeout(timeoutMs);
  const combined = AbortSignal.any([signal, timeout]);
  try {
    stdout = openSync(outPath, 'w');
    stderr = openSync(errPath, 'w');
    await new Promise((accept, reject) => {
      let failure;
      const child = spawn(executable, args, {
        cwd: directory, windowsHide: true, shell: false,
        env: { ...process.env, TEMP: directory, TMP: directory, TMPDIR: directory },
        detached: process.platform !== 'win32', stdio: ['ignore', stdout, stderr]
      });
      // yt-dlp can spawn FFmpeg/Node: cancellation ends this owned process tree.
      const cancel = () => {
        failure = combined.reason;
        if (!child.pid) return;
        if (process.platform === 'win32') {
          const killer = spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'],
            { windowsHide: true, stdio: 'ignore' });
          killer.once('error', () => child.kill('SIGKILL'));
          killer.once('close', code => { if (code) child.kill('SIGKILL'); });
        } else {
          try { process.kill(-child.pid, 'SIGKILL'); } catch { child.kill('SIGKILL'); }
        }
      };
      combined.addEventListener('abort', cancel, { once: true });
      child.once('error', error => { failure = error; });
      child.once('close', code => {
        combined.removeEventListener('abort', cancel);
        if (failure) reject(failure);
        else if (code !== 0) reject(new Error(`${basename(executable)} exited with ${code}.`));
        else accept();
      });
      if (combined.aborted) cancel();
    });
    return await readFile(outPath, 'utf8');
  } catch (error) {
    signal.throwIfAborted();
    const details = await readFile(errPath, 'utf8').catch(() => '');
    const result = new Error(`${error.message}${details ? '\n' + details.slice(-6000) : ''}`, { cause: error });
    result.code = error.code;
    throw result;
  } finally {
    if (stdout !== undefined) closeSync(stdout);
    if (stderr !== undefined) closeSync(stderr);
    // Resolver metadata includes expiring media URLs; retain only our sanitized manifest.
    if (transient) await Promise.all([outPath, errPath].map(p => unlink(p).catch(e => {
      if (e.code !== 'ENOENT') throw e;
    })));
  }
}
