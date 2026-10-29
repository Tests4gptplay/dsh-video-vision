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
const macDialog = `on run argv
  set actionName to item 1 of argv
  set initialValue to item 2 of argv
  set promptText to item 3 of argv
  try
    if actionName is "directory" then
      if initialValue is "" then
        set chosen to choose folder with prompt promptText
      else
        set chosen to choose folder with prompt promptText default location (POSIX file initialValue)
      end if
    else
      set chosen to choose file name with prompt promptText default name initialValue
    end if
    return "PATH" & linefeed & POSIX path of chosen
  on error errorMessage number errorNumber
    if errorNumber is -128 then return "CANCEL"
    error errorMessage number errorNumber
  end try
end run`;

function runDialog(command, args, { signal, launch, input }) {
  signal?.throwIfAborted();
  return new Promise((resolve, reject) => {
    const child = launch(command, args, { shell: false, stdio: ['pipe', 'pipe', 'pipe'], signal });
    let stdout = '', stderr = '';
    child.stdout.setEncoding('utf8').on('data', value => { stdout += value; });
    child.stderr.setEncoding('utf8').on('data', value => { stderr += value; });
    child.once('error', reject);
    child.stdin.on('error', reject);
    child.once('close', (code, terminationSignal) => {
      if (signal?.aborted) { reject(signal.reason); return; }
      resolve({ code, terminationSignal, stdout, stderr });
    });
    child.stdin.end(input || '');
  });
}

export async function platformDialog(action, value, signal, language = 'zh', { platform = process.platform, launch = spawn } = {}) {
  const title = action === 'directory'
    ? language === 'en' ? 'Select video cache directory' : '选择视频缓存目录'
    : language === 'en' ? 'Save As' : '另存为';
  let result;
  if (platform === 'darwin') {
    result = await runDialog('osascript', ['-', action, value || '', title], { signal, launch, input: macDialog });
    if (result.code === 0) {
      const output = result.stdout.replace(/\r?\n$/, '');
      if (output === 'CANCEL') return { canceled: true };
      if (output.startsWith('PATH\n')) return { path: output.slice(5), canceled: false };
      throw new Error(language === 'en' ? 'File dialog returned no path.' : '文件窗口未返回路径。');
    }
  } else if (platform === 'linux') {
    const args = ['--file-selection', '--title=' + title, '--filename=' + (value || '')];
    args.push(...(action === 'directory' ? ['--directory'] : ['--save', '--confirm-overwrite']));
    try { result = await runDialog('zenity', args, { signal, launch }); }
    catch (error) {
      if (error.code !== 'ENOENT') throw error;
      try { result = await runDialog('kdialog', ['--title', title, action === 'directory' ? '--getexistingdirectory' : '--getsavefilename', value || ''], { signal, launch }); }
      catch (fallback) {
        if (fallback.code !== 'ENOENT') throw fallback;
        throw new Error(language === 'en' ? 'Install zenity or kdialog on the DSH host to open file dialogs.' : '请在 DSH 所在机器安装 zenity 或 kdialog，以打开文件窗口。', { cause: fallback });
      }
    }
    // Zenity/KDialog use exit 1 for Cancel; GTK warnings do not change that outcome.
    if (result.code === 1) return { canceled: true };
    if (result.code === 0) {
      const selected = result.stdout.replace(/\r?\n$/, '');
      if (selected) return { path: selected, canceled: false };
    }
  } else throw new Error(language === 'en' ? 'File dialogs are unavailable on this platform.' : '此平台没有可用的文件窗口。');
  throw new Error(result.stderr.trim() || (language === 'en' ? 'File dialog failed.' : '文件窗口未能打开。'));
}
export async function chooseDirectory(path, signal, language = 'zh') {
  if (process.platform === 'win32') return windowsUI('directory', { path, language }, signal);
  return platformDialog('directory', path, signal, language);
}
export async function chooseSaveFile(name, signal, language = 'zh') {
  if (process.platform === 'win32') return windowsUI('save', { name, language }, signal);
  return platformDialog('save', name, signal, language);
}
