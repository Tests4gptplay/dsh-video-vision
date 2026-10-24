import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, basename } from 'node:path';

export const toolDirectory = join(process.env.DSH_HOME || join(homedir(), '.dsh'), 'tools', 'dsh-video-vision');
export const resolverName = process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp';

export function resolverPath(config = {}) {
  if (config.ytDlpPath) return config.ytDlpPath;
  const prepared = join(toolDirectory, resolverName);
  return existsSync(prepared) ? prepared : 'yt-dlp';
}
export function nodeRuntime(config = {}) {
  if (config.nodePath) return config.nodePath;
  return /^node(?:\.exe)?$/i.test(basename(process.execPath)) ? process.execPath : 'node';
}
