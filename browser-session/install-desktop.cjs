// Local Desktop integration. Preserves every ASAR offset and keeps an original backup.
const fs = require('node:fs');
const { join, resolve } = require('node:path');
const { createHash } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const P = require('./protocol.cjs');
const resources = resolve(process.argv[2] || '');
if (!process.argv[2]) throw new Error('Pass the Desktop resources directory.');
const archive = join(resources, 'app.asar');
const bytes = fs.readFileSync(archive);
const headerSize = bytes.readUInt32LE(4), jsonSize = bytes.readUInt32LE(12);
const header = JSON.parse(bytes.subarray(16, 16 + jsonSize).toString());
const entry = header.files.lib.files['main.js'];
const offset = 8 + headerSize + Number(entry.offset);
const main = bytes.subarray(offset, offset + entry.size).toString('utf8');
const marker = 'DSH_LOCAL_BROWSER_SESSION_BRIDGE';
const runtime = join(resources, 'dsh-browser-session');
const hash = value => createHash('sha256').update(value).digest('hex');
function installRuntime() {
  fs.mkdirSync(runtime, { recursive: true });
  for (const name of ['sync.cjs', 'protocol.cjs', 'snapshot.cjs', 'discovery.cjs']) fs.copyFileSync(join(__dirname, name), join(runtime, name));
}
function saveMarker(backup) {
  const file = fs.statSync(archive);
  fs.mkdirSync(P.root(), { recursive: true });
  fs.writeFileSync(join(P.root(), 'desktop-integration.json'), JSON.stringify({
    archive, archiveSize: file.size, archiveMtimeMs: file.mtimeMs, backup, version: '0.9.0'
  }, null, 2));
}
if (main.includes(marker)) {
  installRuntime(); saveMarker(JSON.parse(fs.readFileSync(join(P.root(), 'desktop-integration.json'), 'utf8')).backup);
  console.log('Desktop local bridge already integrated; runtime updated.'); process.exit(0);
}
const exe = fs.readFileSync(join(resources, '..', 'DeepSeek Harness.exe'));
const sentinel = Buffer.from('dL7pKGdnNz796PbbjQWNKmHXBZaB9tsX');
const fuse = exe.indexOf(sentinel) + sentinel.length;
if (fuse < sentinel.length || exe[fuse] !== 1 || exe[fuse + 1] < 5 || exe[fuse + 2 + 4] !== 48)
  throw new Error('Desktop integrity settings do not permit this local integration; no files changed.');
const start = main.indexOf('//#region lib/types/browser-guests.js');
const end = main.indexOf('//#endregion', start);
if (start < 0 || end < 0) throw new Error('Unsupported Desktop browser implementation.');
let region = main.slice(start, end);
const old = `\t\t\tcallback({ cancel: [`;
const tail = `\t\t\t].includes(url.protocol) });
\t\t});
\t}
\tallowedNavigation`;
if (!region.includes(old) || !region.includes(tail)) throw new Error('Desktop browser request hook changed; no files changed.');
region = region.replace(old, '\t\t\tconst cancel = [').replace(tail, `\t\t\t].includes(url.protocol);
            if (cancel || details.resourceType !== "mainFrame" || !["http:", "https:"].includes(url.protocol)) callback({ cancel });
            else dshLocalBrowserSession.beforeRequest(browserSession, url.href).then(() => callback({ cancel: false }), () => callback({ cancel: false }));
\t\t});
\t}
\tallowedNavigation`);
region = region.replace(/\/\*\*[\s\S]*?\*\//g, '');
const injected = '// ' + marker + '\nconst dshLocalBrowserSession = createRequire(import.meta.url)(join(process.resourcesPath, "dsh-browser-session", "sync.cjs"));\n';
let replacement = Buffer.from(main.slice(0, start) + injected + region + main.slice(end));
if (replacement.length > entry.size) throw new Error('Fixed-size integration budget exceeded; no files changed.');
replacement = Buffer.concat([replacement, Buffer.alloc(entry.size - replacement.length, 32)]);
const checkFile = join(P.root(), 'desktop-syntax-check.mjs');
fs.mkdirSync(P.root(), { recursive: true });
fs.writeFileSync(checkFile, replacement);
const check = spawnSync(process.execPath, ['--check', checkFile], { stdio: 'inherit' });
fs.unlinkSync(checkFile);
if (check.status !== 0) throw new Error('Desktop syntax check failed; no files changed.');
const oldHash = entry.integrity.hash;
if (hash(bytes.subarray(offset, offset + entry.size)) !== oldHash) throw new Error('Desktop main integrity mismatch.');
entry.integrity.hash = hash(replacement);
entry.integrity.blocks = [entry.integrity.hash];
const updatedHeader = Buffer.from(JSON.stringify(header));
if (updatedHeader.length !== jsonSize) throw new Error('Header size changed; no files changed.');
const backup = join(P.root(), 'backups', 'app-' + hash(bytes).slice(0, 16) + '.asar');
fs.mkdirSync(join(P.root(), 'backups'), { recursive: true });
if (!fs.existsSync(backup)) fs.copyFileSync(archive, backup, fs.constants.COPYFILE_EXCL);
installRuntime();
const fd = fs.openSync(archive, 'r+');
try { fs.writeSync(fd, updatedHeader, 0, updatedHeader.length, 16); fs.writeSync(fd, replacement, 0, replacement.length, offset); fs.fsyncSync(fd); }
finally { fs.closeSync(fd); }
const installed = fs.readFileSync(archive);
if (!installed.subarray(0, 16).equals(bytes.subarray(0, 16)) ||
    !installed.subarray(16 + jsonSize, offset).equals(bytes.subarray(16 + jsonSize, offset)) ||
    !installed.subarray(offset + entry.size).equals(bytes.subarray(offset + entry.size)) ||
    hash(installed.subarray(offset, offset + entry.size)) !== entry.integrity.hash) throw new Error('Installed archive verification failed; restore backup.');
saveMarker(backup);
console.log(JSON.stringify({ integrated: true, restartRequired: true, backup, changed: ['lib/main.js', 'main integrity hash'], allOtherArchiveBytesPreserved: true }));
