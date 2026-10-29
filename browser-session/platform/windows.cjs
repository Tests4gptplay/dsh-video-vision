const fs = require('node:fs/promises');
const { join, basename } = require('node:path');
const { homedir } = require('node:os');
const { promisify } = require('node:util');
const exec = promisify(require('node:child_process').execFile);
const readFile = fs.readFile;
const { existsSync } = require('node:fs');
async function defaultBrowser() {
  try {
    const { stdout } = await exec('reg.exe', ['query', 'HKCU\\Software\\Microsoft\\Windows\\Shell\\Associations\\UrlAssociations\\https\\UserChoice', '/v', 'ProgId'], { windowsHide: true });
    const progId = stdout.match(/ProgId\s+REG_SZ\s+(\S+)/)?.[1] || '';
    const browser = progId.startsWith('ChromeHTML') ? { id: 'chrome', label: 'Google Chrome' } :
      progId.startsWith('MSEdgeHTM') ? { id: 'edge', label: 'Microsoft Edge' } : null;
    if (!browser) return { supported: false, label: progId || '未识别' };
    const command = await exec('reg.exe', ['query', 'HKCR\\' + progId + '\\shell\\open\\command', '/ve'], { windowsHide: true });
    const executable = command.stdout.match(/REG_SZ\s+"([^"]+)"/)?.[1];
    return { ...browser, executable, supported: Boolean(executable && existsSync(executable)) };
  } catch { return { supported: false, label: '未识别' }; }
}
async function runningBrowsers() {
  const command = `Get-CimInstance Win32_Process -Filter "Name = 'chrome.exe' OR Name = 'msedge.exe' OR Name = 'chromium.exe' OR Name = 'brave.exe'" | Where-Object { $_.CommandLine -notmatch '(?:^|\\s)--type=' } | Select-Object -ExpandProperty CommandLine | ConvertTo-Json -Compress`;
  const { stdout } = await exec('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], { windowsHide: true });
  const value = JSON.parse(stdout.trim() || '[]');
  return Array.isArray(value) ? value : [value];
}
function defaultPortFiles() {
 if (!process.env.LOCALAPPDATA) return [];
 return ['Google/Chrome', 'Microsoft/Edge', 'Chromium', 'BraveSoftware/Brave-Browser'].map(name => join(process.env.LOCALAPPDATA,name,'User Data','DevToolsActivePort'));
}
module.exports = { defaultBrowser, runningBrowsers, defaultPortFiles };
