import { uiText } from './ui-locale.js';
import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { join } from 'node:path';

async function windowsUI(action, values = {}, signal) {
  const script = await readFile(new URL('./windows-ui.ps1', import.meta.url), 'utf8');
  const executable = join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  return new Promise((resolve, reject) => {
    const child = spawn(executable, ['-NoProfile', '-NonInteractive', '-STA', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], {
      windowsHide: true, shell: false, stdio: ['ignore', 'pipe', 'pipe'], signal,
      env: { ...process.env, DSH_VV_LANGUAGE: values.language || 'zh', DSH_VV_ACTION: action, DSH_VV_PATH: values.path || '', DSH_VV_NAME: values.name || '' }
    });
    let stdout = '', stderr = '';
    child.stdout.setEncoding('utf8').on('data', text => { stdout += text; });
    child.stderr.setEncoding('utf8').on('data', text => { stderr += text; });
    child.once('error', reject);
    child.once('close', code => {
      if (code !== 0) { reject(new Error(stderr.trim() || uiText('Windows 文件窗口未能打开。', values.language))); return; }
      try { resolve(JSON.parse(stdout.trim())); }
      catch { reject(new Error(uiText('Windows 文件窗口未返回结果。', values.language))); }
    });
  });
}
export async function revealFolder(path, signal, launch = spawn) {
  const executable = process.platform === 'win32' ? 'explorer.exe' : process.platform === 'darwin' ? 'open' : 'xdg-open';
  await new Promise((resolve, reject) => {
    const child = launch(executable, [path], { shell: false, stdio: 'ignore', detached: true, windowsHide: false });
    child.once('error', reject);
    child.once('spawn', () => { child.unref(); resolve(); });
  });
  return { path };
}
export async function chooseDirectory(path, signal, language = 'zh') {
  return windowsUI('directory', { path, language }, signal);
}
export async function chooseSaveFile(name, signal, language = 'zh') {
  if (process.platform === 'win32') return windowsUI('save', { name, language }, signal);
  throw new Error(uiText('系统另存为窗口用于 Windows。', language));
}
