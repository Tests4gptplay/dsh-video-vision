import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import P from '../browser-session/protocol.cjs';

const require = createRequire(import.meta.url);
// Electron's normal fs treats app.asar as a virtual directory; inspect its raw bytes here.
const { access, open, readFile } = require(process.versions.electron ? 'original-fs' : 'node:fs').promises;
const runtimeFiles = ['sync.cjs', 'protocol.cjs', 'snapshot.cjs', 'discovery.cjs'];
const exec = promisify(execFile);

// Inspect the installed entry and runtime files, not a surviving installation receipt.
export async function desktopIntegrationState(directory = P.root()) {
  let resources, file;
  try {
    const receipt = JSON.parse(await readFile(join(directory, 'desktop-integration.json'), 'utf8'));
    if (typeof receipt.archive !== 'string') return { installed: false };
    resources = dirname(receipt.archive);
    await Promise.all(runtimeFiles.map(name => access(join(resources, 'dsh-browser-session', name))));
    const discovery = await readFile(join(resources, 'dsh-browser-session', 'discovery.cjs'), 'utf8');
    if (discovery.includes('./platform/index.cjs')) await Promise.all(['index.cjs', 'windows.cjs'].map(name => access(join(resources, 'dsh-browser-session', 'platform', name))));
    file = await open(receipt.archive, 'r');
    const { size } = await file.stat();
    const prefix = Buffer.alloc(16);
    if ((await file.read(prefix, 0, 16, 0)).bytesRead !== 16) return { installed: false, resources };
    const jsonSize = prefix.readUInt32LE(12);
    if (jsonSize > size - 16) return { installed: false, resources };
    const bytes = Buffer.alloc(jsonSize);
    await file.read(bytes, 0, bytes.length, 16);
    const header = JSON.parse(bytes.toString('utf8'));
    const entry = header.files?.lib?.files?.['main.js'];
    const offset = 8 + prefix.readUInt32LE(4) + Number(entry?.offset);
    if (!entry || !Number.isSafeInteger(offset) || offset < 16 || !Number.isSafeInteger(entry.size) || entry.size < 0 || offset + entry.size > size)
      return { installed: false, resources };
    const main = Buffer.alloc(entry.size);
    await file.read(main, 0, main.length, offset);
    return { installed: main.includes('DSH_LOCAL_BROWSER_SESSION_BRIDGE'), resources };
  } catch {
    return { installed: false, resources };
  } finally { await file?.close(); }
}

// Run only for an explicit import/refresh after its connection failed.
export async function restoreDesktopIntegration(directory = P.root(), { signal } = {}) {
  const state = await desktopIntegrationState(directory);
  if (state.installed || !state.resources) return false;
  try {
    await exec(process.execPath, [fileURLToPath(new URL('../browser-session/install-desktop.cjs', import.meta.url)), state.resources], {
      windowsHide: true, signal, env: { ...process.env, DSH_BROWSER_SESSION_HOME: directory }
    });
  } catch (error) {
    signal?.throwIfAborted();
    const detail = error.stderr?.split(/\r?\n/).find(line => /^\w*Error:/.test(line.trim()))?.trim() || String(error.code || '安装程序未完成');
    throw new Error('本地会话组件恢复失败：' + detail, { cause: error });
  }
  return true;
}
