import { readdir, readFile, writeFile, lstat, mkdir, rm, copyFile, cp } from 'node:fs/promises';
import { resolve, join, relative, isAbsolute, dirname, basename, extname, sep } from 'node:path';
import { revealFolder, chooseSaveFile } from './native-ui.js?v=0.5.2';

const ID = /^(?:BV[A-Za-z0-9]+-p\d+|web-[a-f0-9]{20}|local-[a-f0-9]{16})$/;
export const cacheMarker = '.video-vision.json';
export function liveConfig(config) {
  return Object.fromEntries(Object.entries(config).map(([k, v]) => [k, v && typeof v.get === 'function' ? v.get() : v]));
}
function inside(root, path) {
  const rel = relative(root, path);
  return rel === '' || (!isAbsolute(rel) && rel !== '..' && !rel.startsWith('..' + sep));
}
async function info(path) {
  return lstat(path).catch(e => { if (e.code === 'ENOENT') return null; throw e; });
}
async function json(path) {
  const s = await info(path);
  if (!s || !s.isFile() || s.isSymbolicLink()) return null;
  try { return JSON.parse(await readFile(path, 'utf8')); } catch (e) { if (e instanceof SyntaxError) return null; throw e; }
}
async function filesIn(root, prefix = '') {
  const result = [];
  for (const entry of await readdir(join(root, prefix), { withFileTypes: true }).catch(e => {
    if (e.code === 'ENOENT') return []; throw e;
  })) {
    const name = prefix ? prefix + '/' + entry.name : entry.name;
    const s = await lstat(join(root, name));
    if (s.isSymbolicLink()) result.push({ name, bytes: 0, link: true });
    else if (s.isDirectory()) result.push(...await filesIn(root, name));
    else if (s.isFile()) result.push({ name, bytes: s.size, modified: s.mtime.toISOString() });
  }
  return result;
}
function safeFilename(text) {
  return String(text).replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/[. ]+$/g, '').slice(0, 100) || 'video';
}
export class CacheManager {
  constructor({ config, cwd, persist, openFolder = revealFolder, saveFile = chooseSaveFile }) {
    this.config = config;
    this.cwd = cwd;
    this.persist = persist;
    this.openFolder = openFolder;
    this.saveFile = saveFile;
    this.readers = 0;
    this.writing = false;
  }
  root() { return resolve(this.cwd, liveConfig(this.config).cacheDirectory || '.dsh-video-vision'); }
  // Video jobs and settings mutations share this gate, so files cannot be moved mid-decode.
  async use(cwd, task) {
    if (this.writing) throw new Error('缓存正在整理，请完成后再查看视频。');
    this.readers++;
    this.cwd = cwd;
    try { return await task(); } finally { this.readers--; }
  }
  async change(task) {
    if (this.writing || this.readers) throw new Error('视频任务正在使用缓存，请稍后重试。');
    this.writing = true;
    try { return await task(); } finally { this.writing = false; }
  }
  async entry(id, root = this.root()) {
    if (!ID.test(id)) throw new Error('无效的视频缓存 ID。');
    const current = join(root, 'videos', id);
    const folder = await info(current) ? current : join(root, id);
    const s = await info(folder);
    if (!s?.isDirectory() || s.isSymbolicLink()) throw new Error('缓存目录不存在或是链接。');
    const manifest = await json(join(folder, 'manifest.json'));
    const marker = await json(join(folder, cacheMarker));
    const files = await filesIn(folder);
    // Accept existing v0.2 manifests and empty failed-download folders.
    if (manifest?.id !== id && marker?.id !== id && files.length) throw new Error('此目录不是可管理的视频缓存。');
    const media = manifest?.mediaPath;
    const mediaFile = media && inside(folder, resolve(media)) ? relative(folder, resolve(media)).split(sep).join('/') : null;
    const videoFile = files.find(f => !f.link && f.name === mediaFile);
    return { id, folder, title: manifest?.title || id, source: manifest?.source || '未完成',
      sourceUrl: /^https?:\/\//i.test(manifest?.sourceUrl || '') ? manifest.sourceUrl : null,
      duration: manifest?.duration || 0, width: manifest?.width, height: manifest?.height,
      openedAt: manifest?.openedAt, videoOnly: Boolean(manifest?.videoOnly && !manifest?.hasAudio),
      localSource: manifest?.source === 'local', mediaFile: videoFile?.name || null,
      bytes: files.reduce((n, f) => n + f.bytes, 0), files, manifest,
      incomplete: !manifest || (manifest.source !== 'local' && !videoFile) };
  }
  async list() {
    const root = this.root();
    const rootInfo = await info(root);
    if (rootInfo && (!rootInfo.isDirectory() || rootInfo.isSymbolicLink())) throw new Error('请选择普通文件夹作为缓存目录。');
    const entries = [];
    const seen = new Set();
    for (const parent of [join(root, 'videos'), root]) {
      for (const d of await readdir(parent, { withFileTypes: true }).catch(e => { if (e.code === 'ENOENT') return []; throw e; })) {
        if (!d.isDirectory() || !ID.test(d.name) || seen.has(d.name)) continue;
        try { entries.push(await this.entry(d.name, root)); seen.add(d.name); }
        catch (e) { if (e.code === 'EACCES' || e.code === 'EPERM') throw e; }
      }
    }
    entries.sort((a, b) => String(b.openedAt || '').localeCompare(String(a.openedAt || '')));
    const bytes = (await filesIn(root)).reduce((n, f) => n + f.bytes, 0);
    return { root, videoDirectory: join(root, 'videos'), configuredPath: liveConfig(this.config).cacheDirectory, bytes,
      managedBytes: entries.reduce((n, e) => n + e.bytes, 0),
      busy: Boolean(this.readers || this.writing),
      entries: entries.map(({ manifest, ...e }) => e) };
  }
  async file(id, name) {
    const entry = await this.entry(id);
    const f = entry.files.find(f => f.name === name && !f.link);
    if (!f) throw new Error('缓存文件不存在，请刷新列表。');
    return { entry, file: f, path: join(entry.folder, f.name) };
  }
  async forgetLatest(ids, root = this.root()) {
    const latest = await json(join(root, 'latest.json'));
    if (ids.includes(latest?.id)) await rm(join(root, 'latest.json'), { force: true });
  }
  async remove(id, file) {
    return this.change(async () => {
      const e = await this.entry(id);
      if (file) {
        if (['manifest.json', cacheMarker].includes(file)) throw new Error('索引文件随整项缓存一起删除。');
        const target = await this.file(id, file);
        await rm(target.path);
        return { removed: 1, bytes: target.file.bytes };
      }
      if (e.files.some(f => f.link)) throw new Error('此缓存含目录链接，请先在文件管理器中处理。');
      await rm(e.folder, { recursive: true });
      await this.forgetLatest([id]);
      return { removed: 1, bytes: e.bytes };
    });
  }
  async clear() {
    return this.change(async () => {
      const { entries } = await this.list();
      if (entries.some(e => e.files.some(f => f.link))) throw new Error('列表中含目录链接，请先在文件管理器中处理。');
      let bytes = 0;
      for (const e of entries) { await rm(e.folder, { recursive: true }); bytes += e.bytes; }
      await this.forgetLatest(entries.map(e => e.id));
      return { removed: entries.length, bytes };
    });
  }
  async extract(id, file, signal) {
    const entry = await this.entry(id);
    const fileName = file || entry.mediaFile;
    const target = await this.file(id, fileName);
    const name = file ? safeFilename(entry.id + '-' + file.replaceAll('/', '-')) :
      safeFilename(entry.title) + extname(target.path);
    // Picking a destination does not lock the cache or block video jobs.
    const chosen = await this.saveFile(name, signal);
    if (chosen.canceled) return { canceled: true };
    return this.use(this.cwd, async () => {
      const current = await this.file(id, fileName);
      const path = resolve(chosen.path);
      if (path.toLowerCase() === current.path.toLowerCase()) throw new Error('请选择与缓存源文件不同的保存位置。');
      await copyFile(current.path, path);
      return { path, bytes: current.file.bytes, canceled: false };
    });
  }
  async relocate(destination) {
    return this.change(async () => {
      if (!this.persist) throw new Error('DSH 设置服务尚未就绪。');
      if (typeof destination !== 'string' || !isAbsolute(destination.trim())) throw new Error('请填写缓存文件夹的完整路径。');
      const oldRoot = this.root(), newRoot = resolve(destination.trim());
      if (newRoot === oldRoot) return { root: oldRoot, moved: 0 };
      if (inside(oldRoot, newRoot) || inside(newRoot, oldRoot)) throw new Error('新旧缓存目录不能互相包含。');
      const entries = await Promise.all((await this.list()).entries.map(e => this.entry(e.id)));
      const existing = await info(newRoot);
      if (existing && (!existing.isDirectory() || existing.isSymbolicLink())) throw new Error('请选择普通文件夹作为缓存目录。');
      for (const e of entries) {
        if (e.files.some(f => f.link)) throw new Error('缓存含目录链接，请先在文件管理器中处理。');
        if (await info(join(newRoot, 'videos', e.id))) throw new Error('目标目录已有同名缓存：' + e.title);
      }
      await mkdir(join(newRoot, 'videos'), { recursive: true });
      const copied = [];
      try {
        for (const e of entries) {
          const dest = join(newRoot, 'videos', e.id);
          // Copy first, commit the setting, then remove only the completed old entries.
          copied.push(dest);
          await cp(e.folder, dest, { recursive: true, errorOnExist: true, force: false });
          if (e.manifest) {
            for (const key of ['mediaPath', 'audioPath']) {
              const value = e.manifest[key];
              if (value && inside(e.folder, resolve(value))) e.manifest[key] = join(dest, relative(e.folder, resolve(value)));
            }
            await writeFile(join(dest, 'manifest.json'), JSON.stringify(e.manifest, null, 2));
          }
        }
        const latest = await json(join(oldRoot, 'latest.json'));
        if (entries.some(e => e.id === latest?.id) && !await info(join(newRoot, 'latest.json'))) {
          await writeFile(join(newRoot, 'latest.json'), JSON.stringify(latest));
          copied.push(join(newRoot, 'latest.json'));
        }
        await this.persist(newRoot);
      } catch (error) {
        for (const path of copied.reverse()) await rm(path, { recursive: true, force: true }).catch(() => {});
        throw error;
      }
      const retained = [];
      for (const e of entries) {
        try { await rm(e.folder, { recursive: true }); }
        catch { retained.push(e.folder); }
      }
      await this.forgetLatest(entries.map(e => e.id), oldRoot);
      return { root: newRoot, moved: entries.length, retained };
    });
  }
  async reveal(id, videos, signal) {
    const path = id ? (await this.entry(id)).folder : videos ? join(this.root(), 'videos') : this.root();
    await mkdir(id ? path : join(this.root(), 'videos'), { recursive: true });
    await this.openFolder(path, signal);
    return { path };
  }
}
