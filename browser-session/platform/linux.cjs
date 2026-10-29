const fs = require('node:fs/promises');
const { join, basename } = require('node:path');
const { homedir } = require('node:os');
const { promisify } = require('node:util');
const exec = promisify(require('node:child_process').execFile);
const readFile = fs.readFile;
function argument(command, name) {
  if (Array.isArray(command)) {
    const key = '--' + name;
    const at = command.findIndex(item => item === key || item.startsWith(key + '='));
    if (at < 0) return undefined;
    return command[at] === key ? command[at + 1] : command[at].slice(key.length + 1);
  }
  const match = String(command).match(new RegExp('(?:^|\\s)--' + name + '(?:=|\\s+)("[^"]*"|[^\\s]+)'));
  return match?.[1].replace(/^"|"$/g, '');
}
async function linuxBrowserCommands({ procDirectory = '/proc', readFile = fs.readFile, readdir = fs.readdir, stat = fs.stat, readlink = fs.readlink, uid = process.getuid?.() } = {}) {
  const commands = [];
  for (const pid of await readdir(procDirectory)) {
    if (!/^\d+$/.test(pid)) continue;
    const base = join(procDirectory, pid);
    try {
      if (uid !== undefined && (await stat(base)).uid !== uid) continue;
      const name = String(await readFile(join(base, 'comm'), 'utf8')).trim();
      if (!/^(?:chrome|chromium|chromium-browse|msedge|brave|brave-browser)$/.test(name)) continue;
      const argv = String(await readFile(join(base, 'cmdline'), 'utf8')).split('\0').filter(Boolean);
      if (argument(argv, 'type') || (argv.length === 1 && /(?:^|\s)--type(?:=|\s)/.test(argv[0]))) continue;
      // Keep only connection metadata; never return unrelated process arguments.
      const command = [name];
      for (const key of ['user-data-dir', 'remote-debugging-port', 'profile-directory']) {
        const value = argument(argv, key);
        if (value) command.push('--' + key + '=' + value);
      }
      if (!argument(argv, 'remote-debugging-port')) {
        // Some launchers expose a rewritten one-string argv. Use only socket
        // metadata owned by this same-user browser process, never port scanning.
        try {
          const inodes = new Set();
          for (const fd of await readdir(join(base, 'fd'))) {
            try { const match = (await readlink(join(base, 'fd', fd))).match(/^socket:\[(\d+)\]$/); if (match) inodes.add(match[1]); } catch {}
          }
          const ports = new Set();
          for (const table of ['tcp', 'tcp6']) {
            try {
              for (const line of String(await readFile(join(base, 'net', table), 'utf8')).trim().split('\n').slice(1)) {
                const fields = line.trim().split(/\s+/);
                const [address, hex] = (fields[1] || '').split(':');
                if (fields[3] !== '0A' || !inodes.has(fields[9]) || !['0100007F', '00000000000000000000000001000000'].includes(address)) continue;
                const port = parseInt(hex, 16);
                if (port > 0 && port <= 65535) ports.add(port);
              }
            } catch {}
          }
          for (const port of ports) commands.push([...command, '--remote-debugging-port=' + port]);
          if (ports.size) continue;
        } catch {}
      }
      if (command.length) commands.push(command);
    } catch {}
  }
  return commands;
}
async function defaultBrowser({ execute = exec, read = readFile, environment = process.env, home = homedir() } = {}) {
  try {
    const { stdout } = await execute('xdg-settings', ['get', 'default-web-browser']);
    const desktopId = stdout.trim();
    if (!desktopId || basename(desktopId) !== desktopId) return { supported: false, label: '未识别' };
    const roots = [environment.XDG_DATA_HOME || join(home, '.local', 'share'),
      ...(environment.XDG_DATA_DIRS || '/usr/local/share:/usr/share').split(':').filter(Boolean)];
    for (const root of roots) {
      const file = join(root, 'applications', desktopId);
      try {
        const text = await read(file, 'utf8');
        const section = text.split('[Desktop Entry]')[1]?.split(/\n\[/)[0] || '';
        const label = section.match(/^Name=(.*)$/m)?.[1]?.trim() || desktopId;
        return { id: desktopId, label, executable: 'gio', arguments: ['launch', file], supported: true };
      } catch {}
    }
    return { id: desktopId, supported: false, label: '未识别' };
  } catch { return { supported: false, label: '未识别' }; }
}

function defaultPortFiles() {
 const config = process.env.XDG_CONFIG_HOME || join(homedir(), '.config');
 return ['google-chrome', 'google-chrome-beta', 'google-chrome-unstable', 'chromium', 'microsoft-edge', 'microsoft-edge-beta', 'BraveSoftware/Brave-Browser'].map(name => join(config,name,'DevToolsActivePort'));
}
module.exports = { runningBrowsers: linuxBrowserCommands, defaultBrowser, defaultPortFiles };
