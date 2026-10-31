// Source metadata is constructed without inspecting profiles. Installation is
// checked only for the explicitly selected source on a user-requested action.
const fs = require('node:fs/promises');
const { join, win32 } = require('node:path');
const { homedir } = require('node:os');
const EXTENSION_ID = 'mmlmfjhmonkocbjadbfplnigmagldckm';
const STORE_URL = 'https://chromewebstore.google.com/detail/playwright/' + EXTENSION_ID;
function extensionSources({ platform = process.platform, env = process.env, home = homedir(), userDataDir, profileDirectory = 'Default' } = {}) {
  if (!['win32', 'darwin', 'linux'].includes(platform)) return [];
  const path = platform === 'win32' ? win32 : require('node:path');
  const root = userDataDir || (platform === 'win32' ? path.join(env.LOCALAPPDATA || path.join(home, 'AppData', 'Local'), 'Google', 'Chrome', 'User Data')
    : platform === 'darwin' ? path.join(home, 'Library', 'Application Support', 'Google', 'Chrome') : path.join(env.XDG_CONFIG_HOME || path.join(home, '.config'), 'google-chrome'));
  if (!profileDirectory || profileDirectory === '.' || profileDirectory === '..' || /[\\/\0]/.test(profileDirectory)) throw Error('Invalid browser profile selection.');
  return [{ kind: 'playwright-extension', identity: 'playwright-extension:chrome:' + path.resolve(root) + ':' + profileDirectory,
    label: 'Google Chrome · ' + profileDirectory + ' (Playwright)',
    extension: { channel: 'chrome', userDataDir: path.resolve(root), profileDirectory } }];
}
// This explicit save slot is browser-confirmed, not a claimed physical profile.
// Only known Chrome executable locations are checked; no profile enumeration.
async function browserConfirmedSources({ platform = process.platform, env = process.env, home = homedir(), io = fs } = {}) {
  const path = platform === 'win32' ? win32 : require('node:path');
  const candidates = platform === 'win32'
    ? [env.LOCALAPPDATA && path.join(env.LOCALAPPDATA, 'Google', 'Chrome', 'Application', 'chrome.exe'),
       env.ProgramFiles && path.join(env.ProgramFiles, 'Google', 'Chrome', 'Application', 'chrome.exe'),
       env['ProgramFiles(x86)'] && path.join(env['ProgramFiles(x86)'], 'Google', 'Chrome', 'Application', 'chrome.exe')]
    : platform === 'darwin' ? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', path.join(home, 'Applications/Google Chrome.app/Contents/MacOS/Google Chrome')]
    : platform === 'linux' ? ['/opt/google/chrome/chrome', '/usr/bin/google-chrome-stable', '/usr/bin/google-chrome'] : [];
  for (const executablePath of candidates.filter(Boolean)) {
    try { if (!(await io.stat(executablePath)).isFile()) continue; } catch { continue; }
    return [{kind:'playwright-extension', identity:'playwright-extension:browser-confirmed-slot:chrome',
      label:'Google Chrome（浏览器内确认）', extension:{channel:'chrome', executablePath}}];
  }
  return [];
}
async function openStore({sources = browserConfirmedSources, spawn = require('node:child_process').spawn} = {}) {
  const [source] = await sources();
  if (!source?.extension?.executablePath) throw Error('未找到 Google Chrome，请在 Chrome 中打开 ' + STORE_URL);
  await new Promise((resolve, reject) => {
    const child = spawn(source.extension.executablePath, [STORE_URL], {detached:true, stdio:'ignore', shell:false});
    child.once('error', reject); child.once('spawn', () => {child.unref(); resolve();});
  });
  return {settingsUrl: STORE_URL};
}
async function inspectInstallation(source, { io = fs } = {}) {
  if (source?.kind !== 'playwright-extension') return { state: 'not_applicable' };
  if (!source.extension.userDataDir || !source.extension.profileDirectory) return {state: 'unknown', reason: 'browser_confirmed_profile'};
  // Only this selected profile and fixed extension ID; never enumerate profiles,
  // open Preferences/Secure Preferences, or read any browser credential database.
  const directory = join(source.extension.userDataDir, source.extension.profileDirectory, 'Extensions', EXTENSION_ID);
  try {
    const stat = await io.lstat(directory);
    if (!stat.isDirectory() || stat.isSymbolicLink()) return { state: 'unknown', reason: 'unexpected_extension_entry' };
    return { state: 'installed', evidence: 'selected_profile_extension_directory', connection: 'not_verified' };
  } catch (error) {
    return error.code === 'ENOENT' ? { state: 'not_installed' } : { state: 'unknown', reason: 'installation_check_failed' };
  }
}
async function captureExtension(source, options) {
  const cookies = await require('./playwright-capture.cjs').captureCookies({ ...source.extension, ...options });
  return require('./snapshot.cjs').normalizeCookies(cookies);
}
module.exports = { EXTENSION_ID, STORE_URL, extensionSources, browserConfirmedSources, openStore, inspectInstallation, captureExtension };
