// Discover published connections of running Chromium browsers; no browser launch.
const fs = require('node:fs/promises');
const { join } = require('node:path');

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
function endpointFromPortFile(text) {
  const [port, path] = String(text).trim().split(/\r?\n/).map(s => s.trim());
  const number = Number(port);
  if (!Number.isInteger(number) || number < 1 || number > 65535 || !path?.startsWith('/'))
    throw new Error('浏览器连接信息不完整。');
  return new URL(path, 'ws://127.0.0.1:' + number).href;
}
const { runningBrowsers, defaultPortFiles } = require('./platform/index.cjs');
async function discoverBrowserEndpoints({ signal, commands, portFiles, readFile = fs.readFile, fetch = globalThis.fetch } = {}) {
  signal?.throwIfAborted();
  commands ??= await runningBrowsers().catch(() => []);
  const files = new Set(portFiles ?? defaultPortFiles());
  const ports = new Set(), endpoints = new Set();
  for (const command of commands) {
    const profile = argument(command, 'user-data-dir');
    if (profile) files.add(join(profile, 'DevToolsActivePort'));
    const port = Number(argument(command, 'remote-debugging-port'));
    if (Number.isInteger(port) && port > 0 && port <= 65535) ports.add(port);
  }
  // Explicit published ports work without a DevToolsActivePort file (e.g. CAH).
  for (const port of ports) {
    signal?.throwIfAborted();
    try {
      const requestSignal = signal ? AbortSignal.any([signal, AbortSignal.timeout(2000)]) : AbortSignal.timeout(2000);
      const response = await fetch('http://127.0.0.1:' + port + '/json/version', { signal: requestSignal });
      const info = await response.json();
      if (response.ok && info.webSocketDebuggerUrl) {
        const endpoint = new URL(info.webSocketDebuggerUrl);
        // The endpoint belongs to the same local browser that supplied metadata.
        if (['ws:', 'wss:'].includes(endpoint.protocol) && ['127.0.0.1', 'localhost', '[::1]'].includes(endpoint.hostname))
          endpoints.add(endpoint.href);
      }
    } catch { signal?.throwIfAborted(); }
  }
  for (const file of files) {
    signal?.throwIfAborted();
    try { endpoints.add(endpointFromPortFile(await readFile(file, 'utf8'))); }
    catch { signal?.throwIfAborted(); }
  }
  return [...endpoints];
}
module.exports = { argument, endpointFromPortFile, discoverBrowserEndpoints };
