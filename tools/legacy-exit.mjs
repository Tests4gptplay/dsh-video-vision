#!/usr/bin/env node
// Standalone, explicitly invoked retirement utility. Never imported by the plugin.
import fs from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
export const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const marker = 'DSH_LOCAL_BROWSER_SESSION_BRIDGE';
const injected = '// ' + marker + '\nconst dshLocalBrowserSession = createRequire(import.meta.url)(join(process.resourcesPath, "dsh-browser-session", "sync.cjs"));\n';
const hooked = `\t\t\t].includes(url.protocol);
            if (cancel || !["http:", "https:"].includes(url.protocol)) callback({ cancel });
            else dshLocalBrowserSession.beforeRequest(browserSession, url.href).then(() => callback({ cancel: false }), () => callback({ cancel: false }));
\t\t});
\t}
\tallowedNavigation`;
const original = `\t\t\t].includes(url.protocol) });
\t\t});
\t}
\tallowedNavigation`;
const occurrences = (text, part) => text.split(part).length - 1;
export function retireArchive(input) {
  const bytes = Buffer.from(input);
  if (bytes.length < 16) throw Error('Invalid ASAR header.');
  const headerSize = bytes.readUInt32LE(4), jsonSize = bytes.readUInt32LE(12);
  if (jsonSize > bytes.length - 16 || headerSize < jsonSize + 8) throw Error('Invalid ASAR bounds.');
  const header = JSON.parse(bytes.subarray(16, 16 + jsonSize));
  const entry = header.files?.lib?.files?.['main.js'];
  const offset = 8 + headerSize + Number(entry?.offset);
  if (!entry || entry.unpacked || !Number.isSafeInteger(offset) || offset < 16 + jsonSize || !Number.isSafeInteger(entry.size) || entry.size < 0 || offset + entry.size > bytes.length) throw Error('Invalid main.js entry.');
  const mainBytes = bytes.subarray(offset, offset + entry.size);
  const main = mainBytes.toString('utf8');
  if (!Buffer.from(main).equals(mainBytes)) throw Error('main.js is not UTF-8.');
  if (!main.includes(marker)) {
    if (main.includes('dshLocalBrowserSession') || main.includes('dsh-browser-session')) throw Error('Unrecognized residual bridge references.');
    return { bytes, changed: false, main };
  }
  if (occurrences(main, marker) !== 1 || occurrences(main, injected) !== 1 || occurrences(main, hooked) !== 1 || occurrences(main, 'dshLocalBrowserSession') !== 2) throw Error('Unknown or multiple host hooks; no ASAR modification.');
  const start = main.indexOf('//#region lib/types/browser-guests.js');
  const end = main.indexOf('//#endregion', start);
  if (start < 0 || end < 0) throw Error('Unknown host region.');
  const region = main.slice(start, end);
  const opening = '\t\t\tconst cancel = [';
  if (occurrences(region, opening) !== 1 || !region.includes(hooked)) throw Error('Unknown host callback.');
  let replacement = Buffer.from(main.replace(injected, '').replace(region, region.replace(opening, '\t\t\tcallback({ cancel: [').replace(hooked, original)));
  if (replacement.includes(marker) || replacement.includes('dshLocalBrowserSession') || replacement.length > entry.size) throw Error('Residual hook or invalid replacement.');
  replacement = Buffer.concat([replacement, Buffer.alloc(entry.size - replacement.length, 32)]);
  if (entry.integrity?.algorithm !== 'SHA256' || hash(mainBytes) !== entry.integrity.hash || !Array.isArray(entry.integrity.blocks) || entry.integrity.blocks.length !== 1 || entry.integrity.blocks[0] !== entry.integrity.hash) throw Error('Unsupported or mismatched main integrity metadata.');
  entry.integrity.hash = hash(replacement); entry.integrity.blocks = [entry.integrity.hash];
  const updated = Buffer.from(JSON.stringify(header));
  if (updated.length !== jsonSize) throw Error('ASAR header size changed.');
  updated.copy(bytes, 16); replacement.copy(bytes, offset);
  if (!bytes.subarray(0, 16).equals(input.subarray(0, 16)) || !bytes.subarray(16 + jsonSize, offset).equals(input.subarray(16 + jsonSize, offset)) || !bytes.subarray(offset + entry.size).equals(input.subarray(offset + entry.size))) throw Error('Unrelated archive bytes changed.');
  return { bytes, changed: true, main: replacement.toString() };
}
async function atomic(file, bytes) {
  const tmp = file + '.vv-exit.tmp';
  await fs.writeFile(tmp, bytes, { flag: 'wx', mode: 0o600 });
  await fs.rename(tmp, file);
}
export async function runtimeState(directory, known) {
  try { if ((await fs.lstat(directory)).isSymbolicLink()) throw Error('Runtime root symlink refused.'); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  const found = {};
  async function walk(dir, prefix = '') {
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      const key = prefix + entry.name;
      if (entry.isSymbolicLink()) throw Error('Runtime symlink refused: ' + key);
      if (entry.isDirectory()) await walk(join(dir, entry.name), key + '/');
      else if (entry.isFile()) {
        const bytes = await fs.readFile(join(dir, entry.name));
        if (known[key] !== hash(bytes)) throw Error('Unknown runtime file; leave intact: ' + key);
        found[key] = bytes.toString('base64');
      } else throw Error('Unsupported runtime entry.');
    }
  }
  try { await walk(directory); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  return found;
}
export async function run({ resources, state, expectedSha, apply = false, hostStopped = false }, io = fs) {
  // io injection is limited to report/authorization failure tests, not cookie access.
  resources = resolve(resources); state = resolve(state);
  const archive = join(resources, 'app.asar'), runtime = join(resources, 'dsh-browser-session');
  const current = await fs.readFile(archive);
  const plan = retireArchive(current);
  const report = { schema: 1, archive, beforeSha256: hash(current), afterSha256: hash(plan.bytes), hookFound: plan.changed, applied: false, complete: false, hostStoppedAttested: hostStopped, cookieCleanup: 'not_attempted_ownership_unverifiable', oldEncryptedSnapshot: 'retained_no_format_conversion', steps: [], failures: [] };
  if (!apply) return { ...report, dryRun: true };
  if (!hostStopped || expectedSha !== hash(current)) throw Error('Apply requires --host-stopped and matching --expect-sha256 from a fresh inspection.');
  await fs.mkdir(state, { recursive: true });
  const reportFile = join(state, 'legacy-exit-report.json');
  try {
    // Fail closed before touching the host. No snapshots or cookie databases are read.
    await io.writeFile(join(state, 'authorization.json.vv-exit.tmp'), JSON.stringify({ enabled: false, syncToNative: false }), { mode: 0o600 });
    await io.rename(join(state, 'authorization.json.vv-exit.tmp'), join(state, 'authorization.json'));
    const revoked = JSON.parse(await io.readFile(join(state, 'authorization.json'), 'utf8'));
    if (revoked.enabled !== false || revoked.syncToNative !== false) throw Error('Authorization revocation readback failed.');
    report.steps.push('authorization_disabled_and_verified');
    const check = spawnSync(process.execPath, ['--input-type=module', '--check'], { input: plan.main, encoding: 'utf8' });
    if (check.status !== 0) throw Error('Replacement syntax check failed: ' + check.stderr);
    if (plan.changed) {
      // A non-executable recovery container, never used as an automatic rollback.
      const recovery = join(state, 'legacy-exit-archive-' + hash(current) + '.json');
      try { await fs.writeFile(recovery, JSON.stringify({ sha256: hash(current), bytesBase64: current.toString('base64') }), { flag: 'wx', mode: 0o600 }); } catch (e) { if (e.code !== 'EEXIST') throw e; const saved = JSON.parse(await fs.readFile(recovery)); if (hash(Buffer.from(saved.bytesBase64, 'base64')) !== hash(current)) throw Error('Existing recovery container mismatches.'); }
      report.recoveryContainer = recovery;
      if (hash(await fs.readFile(archive)) !== expectedSha) throw Error('Host archive changed during inspection.');
      await atomic(archive, plan.bytes);
      if (hash(await fs.readFile(archive)) !== hash(plan.bytes)) throw Error('Host archive verification failed.');
    }
    report.steps.push('current_archive_has_no_bridge_hook');
    const known = JSON.parse(await fs.readFile(new URL('./legacy-exit-known-runtime.json', import.meta.url)));
    const files = await runtimeState(runtime, known);
    if (Object.keys(files).length) {
      const backup = join(state, 'legacy-exit-runtime-data.json');
      // Repeated attempts must not overwrite the first retry/recovery evidence.
      try { await fs.writeFile(backup, JSON.stringify({ schema: 1, files }), { flag: 'wx', mode: 0o600 }); } catch (e) { if (e.code !== 'EEXIST') throw e; const saved = JSON.parse(await fs.readFile(backup)); for (const [name, content] of Object.entries(files)) if (saved.files?.[name] !== content) throw Error('Runtime recovery data differs; do not delete.'); }
      const saved = JSON.parse(await fs.readFile(backup));
      for (const [name, content] of Object.entries(files)) {
        if (saved.files?.[name] !== content || hash(await fs.readFile(join(runtime, name))) !== known[name]) throw Error('Runtime changed; retain remaining files.');
        await fs.unlink(join(runtime, name));
      }
      report.runtimeRecoveryContainer = backup;
    }
    // Leave empty directories; never recursive-delete a possibly unrelated file.
    report.steps.push('known_runtime_files_retired');
    report.applied = true; report.complete = true;
  } catch (error) { report.failures.push({ message: error.message, code: error.code || null }); }
  await io.writeFile(reportFile, JSON.stringify(report, null, 2), { mode: 0o600 });
  return report;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), value = name => args[args.indexOf(name) + 1];
  if (!args.includes('--resources') || !args.includes('--state')) throw Error('Usage: node legacy-exit.mjs --resources DIR --state VV_HOME [--apply --host-stopped --expect-sha256 HASH]');
  const result = await run({ resources: value('--resources'), state: value('--state'), expectedSha: args.includes('--expect-sha256') ? value('--expect-sha256') : null, apply: args.includes('--apply'), hostStopped: args.includes('--host-stopped') });
  console.log(JSON.stringify(result, null, 2));
  if (result.failures.length) process.exitCode = 1;
}
