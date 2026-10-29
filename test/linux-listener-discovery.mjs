// Synthetic /proc adapter test. All filesystem entry points are injected.
// Run: node linux-listener-discovery.mjs /path/to/product/root
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { resolve, join } from 'node:path';
const require = createRequire(import.meta.url);
const root = process.argv[2];
if (!root) throw new Error('Pass the candidate product root as argv[2].');
const { runningBrowsers } = require(join(resolve(root), 'browser-session/platform/linux.cjs'));
const PROC = '/synthetic-proc';
const files = new Map(), folders = new Map(), owners = new Map(), links = new Map(), accesses = [];
const missing = path => Object.assign(new Error('Synthetic missing: ' + path), { code: 'ENOENT' });
const readFile = async path => { accesses.push(['read', path]); if (!files.has(path)) throw missing(path); return files.get(path); };
const readdir = async path => { accesses.push(['list', path]); if (!folders.has(path)) throw missing(path); return folders.get(path); };
const stat = async path => { accesses.push(['stat', path]); if (!owners.has(path)) throw missing(path); return { uid: owners.get(path) }; };
const readlink = async path => { accesses.push(['link', path]); if (!links.has(path)) throw missing(path); return links.get(path); };
function processFixture(pid, { uid = 1000, name = 'chrome', argv = ['chrome'], inodes = [] } = {}) {
 const base = `${PROC}/${pid}`; owners.set(base, uid);
 files.set(base + '/comm', name + '\n'); files.set(base + '/cmdline', argv.join('\0') + '\0');
 folders.set(base + '/fd', inodes.map((inode, index) => String(index + 3)));
 inodes.forEach((inode, index) => links.set(`${base}/fd/${index + 3}`, `socket:[${inode}]`));
 return base;
}
const row = (local, port, state, inode, uid = 1000) => `  0: ${local}:${port.toString(16).toUpperCase().padStart(4, '0')} 00000000:0000 ${state} 00000000:00000000 00:00000000 00000000 ${uid} 0 ${inode} 1 0000000000000000 100 0 0 10 0`;
const table = rows => '  sl  local_address rem_address st tx_queue rx_queue tr tm->when retrnsmt uid timeout inode\n' + rows.join('\n') + '\n';
folders.set(PROC, ['100', '101', '102', '103', '104', '105', 'self', 'net']);
const main = processFixture('100', { argv: ['chrome', '--user-data-dir=/synthetic-profile', '--unrelated=do-not-return'], inodes: ['500', '501', '502', '503', '504', '500'] });
files.set(main + '/net/tcp', table([
 row('0100007F', 43123, '0A', '500'), // owned IPv4 loopback listener
 row('0100007F', 43124, '01', '501'), // connected, not LISTEN
 row('00000000', 43125, '0A', '502'), // wildcard, excluded
 row('0101A8C0', 43126, '0A', '503'), // LAN bind, excluded
 row('0100007F', 43127, '0A', '999'), // another process inode, excluded
]));
files.set(main + '/net/tcp6', table([
 row('00000000000000000000000001000000', 43128, '0A', '504'), // owned ::1 LISTEN
 row('00000000000000000000000000000000', 43129, '0A', '504'), // wildcard, excluded
 row('00000000000000000000000001000000', 43130, '0A', '999'), // other process
]));
const renderer = processFixture('101', { argv: ['chrome', '--type=renderer'], inodes: ['600'] });
files.set(renderer + '/net/tcp', table([row('0100007F', 43201, '0A', '600')]));
const otherUser = processFixture('102', { uid: 1001, inodes: ['700'] });
files.set(otherUser + '/net/tcp', table([row('0100007F', 43202, '0A', '700', 1001)]));
const unrelated = processFixture('103', { name: 'node', inodes: ['800'] });
files.set(unrelated + '/net/tcp', table([row('0100007F', 43203, '0A', '800')]));
processFixture('104', { argv: ['chromium', '--remote-debugging-port=43300'], name: 'chromium' });
processFixture('105', { inodes: ['900'] }); // process raced away / tables unavailable
const commands = await runningBrowsers({ procDirectory: PROC, readFile, readdir, stat, readlink, uid: 1000 });
const values = commands.flatMap(command => command).filter(arg => arg.startsWith('--remote-debugging-port='));
const ports = values.map(arg => Number(arg.split('=')[1])).sort((a, b) => a - b);
assert.deepEqual(ports, [43123, 43128, 43300], 'Only owned loopback listeners + explicit existing browser port');
assert.ok(commands.flat().includes('--user-data-dir=/synthetic-profile'));
assert.ok(!commands.flat().some(value => value.includes('unrelated')));
assert.ok(!accesses.some(([, path]) => path.startsWith(renderer + '/fd') || path.startsWith(renderer + '/net/')), 'Renderer has no fd/network inspection');
assert.ok(!accesses.some(([op, path]) => op !== 'stat' && path.startsWith(otherUser + '/')), 'Other UID never read');
assert.ok(!accesses.some(([, path]) => path.startsWith(unrelated + '/fd') || path.startsWith(unrelated + '/net/')));
assert.ok(accesses.every(([, path]) => path === PROC || path.startsWith(PROC + '/')), 'All reads remain in injected synthetic proc tree');
console.log('PASS: synthetic proc owned LISTEN inode matching, IPv4/IPv6 loopback, excludes wildcard/nonloopback/other inode/renderer/other UID; no real proc, sockets or network.');
