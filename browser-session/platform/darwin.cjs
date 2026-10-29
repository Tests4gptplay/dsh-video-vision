const { join, basename } = require('node:path');
const { homedir } = require('node:os');
const { access } = require('node:fs/promises');
const { promisify } = require('node:util');
const exec = promisify(require('node:child_process').execFile);
const applications = ['Google Chrome', 'Google Chrome Beta', 'Google Chrome Canary', 'Google Chrome for Testing', 'Microsoft Edge', 'Microsoft Edge Beta', 'Brave Browser', 'Chromium'];

function connectionArguments(command) {
  const found = [];
  // ps renders argv as text, not a lossless argument array. Only publish
  // explicitly recognized connection flags, never page URLs or unrelated args.
  const re = /(?:^|\s)--(user-data-dir|remote-debugging-port|profile-directory)(?:=|\s+)("[^"]*"|'[^']*'|.*?)(?=\s+--[\w-]+(?:=|\s|$)|$)/g;
  for (const match of command.matchAll(re)) {
    let value = match[2].trim();
    if (/^["']/.test(value) && value.at(-1) === value[0]) value = value.slice(1, -1);
    // A positional page following a flag is not part of a profile path.
    if (/\s(?:https?:\/\/|chrome:\/\/)/.test(value)) continue;
    if (match[1] === 'remote-debugging-port' && !/^\d+$/.test(value)) continue;
    if (value) found.push('--' + match[1] + '=' + value);
  }
  return found;
}
async function runningBrowsers({ execute = exec, uid = process.getuid?.(), signal } = {}) {
  if (!Number.isInteger(uid)) return [];
  const { stdout } = await execute('/bin/ps', ['-U', String(uid), '-ww', '-o', 'pid=', '-o', 'comm='], { signal });
  const result = [];
  for (const line of stdout.split('\n')) {
    const match = line.trim().match(/^(\d+)\s+(.+)$/);
    if (!match || !applications.includes(basename(match[2]))) continue;
    try {
      // Query uid again with args so a recycled PID cannot expose another user's command.
      const detail = await execute('/bin/ps', ['-p', match[1], '-ww', '-o', 'ruid=', '-o', 'args='], { signal });
      const fields = detail.stdout.trim().match(/^(\d+)\s+(.+)$/);
      if (!fields || Number(fields[1]) !== uid || /(?:^|\s)--type(?:=|\s)/.test(fields[2])) continue;
      result.push([basename(match[2]), ...connectionArguments(fields[2])]);
    } catch { signal?.throwIfAborted(); }
  }
  return result;
}
function defaultPortFiles({ home = homedir() } = {}) {
  const root = join(home, 'Library', 'Application Support');
  return ['Google/Chrome', 'Google/Chrome Beta', 'Google/Chrome Canary', 'Google/ChromeForTesting', 'Chromium', 'Microsoft Edge', 'Microsoft Edge Beta', 'BraveSoftware/Brave-Browser']
    .map(name => join(root, name, 'DevToolsActivePort'));
}
async function defaultBrowser({ home = homedir(), exists = async path => { try { await access(path); return true; } catch { return false; } } } = {}) {
  // This selects a browser capable of opening chrome://inspect; it does not
  // claim to identify or modify the user's system default (possibly Safari).
  for (const label of applications) {
    for (const root of ['/Applications', join(home, 'Applications')]) {
      const app = join(root, label + '.app');
      if (await exists(join(app, 'Contents', 'MacOS', label))) return {
        supported: true, id: label, label, executable: '/usr/bin/open', arguments: ['-a', app],
        selection: 'installed-chromium', isDefault: false
      };
    }
  }
  return { supported: false, label: '未找到 Chromium 浏览器', selection: 'installed-chromium', isDefault: false };
}
module.exports = { defaultPortFiles, runningBrowsers, defaultBrowser };
