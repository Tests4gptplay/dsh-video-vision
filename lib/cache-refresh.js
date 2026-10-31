// A same-filesystem directory replacement. The journal distinguishes committed
// media from an interrupted rename; it is not a claim of multi-rename atomicity.
import { lstat, readdir, readFile, writeFile, mkdir, mkdtemp, rename, rm, rmdir } from 'node:fs/promises';
import { resolve, dirname, basename, join } from 'node:path';
import { randomUUID } from 'node:crypto';

const marker = '.refresh-commit.json';
const missing = e => e.code === 'ENOENT';
async function info(path) { try { return await lstat(path); } catch (e) { if (missing(e)) return null; throw e; } }
async function json(path) {
  const s = await info(path);
  if (!s) return null;
  if (!s.isFile() || s.isSymbolicLink()) throw new Error('Unsafe refresh metadata: ' + basename(path));
  return JSON.parse(await readFile(path, 'utf8'));
}
async function checkedDirectory(path, id, allowEmpty = false) {
  const s = await info(path);
  if (!s) return false;
  if (!s.isDirectory() || s.isSymbolicLink()) throw new Error('Refresh requires an ordinary managed cache directory.');
  if (allowEmpty && (await readdir(path)).length === 0) return true;
  const manifest = await json(join(path, 'manifest.json'));
  const ownership = await json(join(path, '.video-vision.json'));
  if (manifest?.id !== id && ownership?.id !== id) throw new Error('Refresh refused an unidentified cache directory.');
  async function noLinks(dir) {
    for (const e of await readdir(dir, { withFileTypes: true })) {
      if (e.isSymbolicLink()) throw new Error('Refresh refused a cache containing links.');
      if (e.isDirectory()) await noLinks(join(dir, e.name));
    }
  }
  await noLinks(path);
  return true;
}
async function cleanupOwned(path, id) {
  const entries = await readdir(path);
  if (!entries.length) return rmdir(path);
  await writeFile(join(path, '.video-vision.json'), JSON.stringify({ id, version: 1 }));
  for (const name of entries) if (name !== '.video-vision.json') await rm(join(path, name), { recursive: true });
  await rm(join(path, '.video-vision.json'));
  await rmdir(path);
}
function locations(folder, id) {
  folder = resolve(folder);
  if (!/^[A-Za-z0-9_-]+$/.test(id) || basename(folder) !== id) throw new Error('Invalid refresh cache identity.');
  return { folder, parent: dirname(folder), journal: folder + '.refresh.json' };
}
function validateRecord(record, id) {
  if (record?.version !== 1 || record.id !== id || typeof record.hadOld !== 'boolean' || !/^[0-9a-f-]{36}$/.test(record.token) ||
      typeof record.stage !== 'string' || !record.stage.startsWith('.refresh-' + id + '-') ||
      basename(record.stage) !== record.stage || record.stage.includes('\\') ||
      record.backup !== '.refresh-backup-' + id + '-' + record.token)
    throw new Error('Invalid cache refresh recovery record; no files were changed.');
}
export async function createRefreshStage(folder, id) {
  const p = locations(folder, id);
  await mkdir(p.parent, { recursive: true });
  const stage = await mkdtemp(join(p.parent, '.refresh-' + id + '-'));
  await writeFile(join(stage, '.video-vision.json'), JSON.stringify({ id, version: 1 }));
  return stage;
}
export async function recoverRefresh(folder, id) {
  const p = locations(folder, id), record = await json(p.journal);
  if (!record) return { recovered: false, cleanupPending: false };
  validateRecord(record, id);
  const stage = join(p.parent, record.stage), backup = join(p.parent, record.backup);
  const current = await checkedDirectory(p.folder, id);
  const backedUp = await checkedDirectory(backup, id, true);
  const staged = await checkedDirectory(stage, id, true);
  const installed = current ? await json(join(p.folder, marker)) : null;
  const committed = Boolean(current && installed?.id === id && installed.token === record.token);
  if (!committed) {
    if (current && backedUp) throw new Error('Ambiguous cache refresh recovery; both copies were retained.');
    if (backedUp) await rename(backup, p.folder);
    else if (!current && record.hadOld) throw new Error('Previous cache is unavailable; refresh recovery evidence was retained.');
  }
  try {
    if (committed && backedUp) await cleanupOwned(backup, id);
    if (staged) await cleanupOwned(stage, id);
    await rm(p.journal);
  } catch (error) {
    return { recovered: true, committed: Boolean(committed), cleanupPending: true, cleanupError: error.code || error.message };
  }
  return { recovered: true, committed: Boolean(committed), cleanupPending: false };
}
export async function commitRefresh(stage, folder, id) {
  const p = locations(folder, id);
  stage = resolve(stage);
  if (dirname(stage) !== p.parent || !basename(stage).startsWith('.refresh-' + id + '-')) throw new Error('Refresh staging must be a private sibling directory.');
  if (await info(p.journal)) throw new Error('Previous refresh recovery must finish before replacing this cache again.');
  if (!await checkedDirectory(stage, id)) throw new Error('Refresh staging is missing.');
  const hadOld = await checkedDirectory(p.folder, id), token = randomUUID();
  const record = { version: 1, id, token, stage: basename(stage), backup: '.refresh-backup-' + id + '-' + token, hadOld };
  const backup = join(p.parent, record.backup);
  await writeFile(join(stage, marker), JSON.stringify({ id, token }), { flag: 'wx' });
  // Publish complete JSON with a same-directory rename. The caller holds the
  // existing cache mutation gate; this does not claim cross-process locking.
  const temporaryJournal = p.journal + '.' + token + '.tmp';
  try {
    await writeFile(temporaryJournal, JSON.stringify(record), { flag: 'wx' });
    await rename(temporaryJournal, p.journal);
  } finally {
    await rm(temporaryJournal, { force: true });
  }
  try {
    if (hadOld) await rename(p.folder, backup);
    await rename(stage, p.folder);
  } catch (error) {
    try {
      const recovery = await recoverRefresh(p.folder, id);
      if (recovery.cleanupPending) error.cleanupPending = true;
    } catch (recoveryError) {
      throw new Error('Refresh failed and automatic recovery could not finish; retained copies must not be removed.', { cause: recoveryError });
    }
    throw error;
  }
  try {
    const result = await recoverRefresh(p.folder, id);
    return { ...result, committed: true };
  } catch (error) {
    // The new directory is already committed. Never report this as an
    // acquisition failure, nor roll it back because disposal encountered trouble.
    return { committed: true, cleanupPending: true, cleanupError: error.code || error.message };
  }
}
