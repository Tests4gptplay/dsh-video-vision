import { mkdir, readFile, writeFile, readdir, stat, unlink } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, resolve, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';
import { run } from './process.js';
import { nodeRuntime } from './dependencies.js';

export function configurationDirectory(config = {}) {
  const home = process.env.DSH_HOME || join(homedir(), '.dsh');
  return resolve(home, config.configDirectory || 'video-vision');
}
export async function ensureConfiguration(config = {}) {
  const root = configurationDirectory(config);
  await mkdir(join(root, 'resolvers'), { recursive: true });
  await mkdir(join(root, 'notes'), { recursive: true });
  for (const [target, resource] of [
    ['GUIDANCE.md', 'GUIDANCE.md'], ['README.md', 'configuration.md'],
    ['resolvers/README.md', 'resolvers.md'], ['resolvers/example.mjs.txt', 'example.mjs.txt']
  ]) {
    const text = await readFile(new URL('../resources/' + resource, import.meta.url), 'utf8');
    await writeFile(join(root, target), text, { flag: 'wx' }).catch(error => {
      if (error.code !== 'EEXIST') throw error;
    });
  }
  return root;
}
export async function listMethods(config = {}, source) {
  const root = await ensureConfiguration(config);
  const hostname = source ? new URL(source).hostname.toLowerCase() : null;
  const pathname = source ? new URL(source).pathname : null;
  const methods = [], errors = [];
  for (const entry of await readdir(join(root, 'resolvers'), { withFileTypes: true })) {
    if (!entry.isDirectory() || !/^[a-z0-9][a-z0-9._-]*$/i.test(entry.name)) continue;
    try {
      const directory = join(root, 'resolvers', entry.name);
      const manifest = JSON.parse(await readFile(join(directory, 'manifest.json'), 'utf8'));
      if (!Array.isArray(manifest.hosts) || !manifest.hosts.length ||
          !manifest.hosts.every(host => typeof host === 'string' && host.trim())) {
        throw new Error('manifest.json needs a non-empty hosts list.');
      }
      const modulePath = join(directory, 'resolve.mjs');
      const code = await readFile(modulePath);
      const matches = !hostname || manifest.hosts.some(value => {
        const host = value.toLowerCase();
        return host.startsWith('*.') ? hostname === host.slice(2) || hostname.endsWith(host.slice(1)) : hostname === host;
      }) && (!manifest.pathPrefix || pathname.startsWith(manifest.pathPrefix));
      methods.push({ id: entry.name, name: String(manifest.name || entry.name),
        hosts: manifest.hosts, enabled: manifest.enabled !== false, matches,
        directory, modulePath, revision: createHash('sha256').update(code).update(JSON.stringify(manifest)).digest('hex').slice(0, 16) });
    } catch (error) { errors.push({ id: entry.name, message: error.message }); }
  }
  methods.sort((a, b) => a.id.localeCompare(b.id));
  return { directory: root, guidancePath: join(root, 'GUIDANCE.md'), resolversDirectory: join(root, 'resolvers'),
    notesDirectory: join(root, 'notes'), methods, errors };
}
export class MethodNeeded extends Error {
  constructor(source, message, config) {
    super(message);
    this.source = source;
    this.guidancePath = join(configurationDirectory(config), 'GUIDANCE.md');
  }
}
export async function runMethod(method, source, folder, config, signal) {
  const input = join(folder, 'resolver-' + randomUUID() + '.json');
  await writeFile(input, JSON.stringify({ modulePath: method.modulePath, source, outputDirectory: folder,
    maxHeight: config.maxHeight, maxDownloadMB: config.maxDownloadMB,
    ffmpegPath: config.ffmpegPath, ffprobePath: config.ffprobePath,
    timeoutMs: config.downloadTimeoutMs }));
  let output;
  try {
    const text = await run(nodeRuntime(config),
      [fileURLToPath(new URL('../bin/resolver.mjs', import.meta.url)), input],
      folder, signal, config.downloadTimeoutMs, 'resolver', true);
    output = JSON.parse(text);
  } finally {
    await unlink(input).catch(error => { if (error.code !== 'ENOENT') throw error; });
  }
  if (!output || typeof output.mediaPath !== 'string') throw new Error('The resolver must return mediaPath.');
  const mediaPath = resolve(folder, output.mediaPath);
  const rel = relative(folder, mediaPath);
  if (!rel || isAbsolute(rel) || rel === '..' || rel.startsWith('../') || rel.startsWith('..\\')) {
    throw new Error('The resolver mediaPath must be inside its outputDirectory.');
  }
  const file = await stat(mediaPath);
  if (!file.isFile() || !file.size) throw new Error('The resolver returned an empty video.');
  if (file.size > config.maxDownloadMB * 1024 * 1024) throw new Error('The resolved video exceeds maxDownloadMB.');
  const cues = (output.captions?.cues || []).map(cue => ({
    start: Number(cue.start), end: Number(cue.end), text: String(cue.text)
  })).filter(cue => Number.isFinite(cue.start) && Number.isFinite(cue.end) && cue.end >= cue.start);
  return { source: new URL(source).hostname, sourceUrl: source, title: String(output.title || method.name),
    mediaPath, downloadBytes: file.size, resolver_id: method.id, resolver_revision: method.revision,
    captions: { state: cues.length ? 'available' : 'none', cues, tracks: [],
      ...(output.captions?.language ? { language: String(output.captions.language) } : {}) } };
}
