#!/usr/bin/env node
import { makeTool } from '../index.js';
import { writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';

const argv = process.argv.slice(2);
if (!argv.length || argv.includes('--help')) {
  console.log(`Usage:
  node bin/video-vision.mjs open --source <URL/BV/file> [--frames 6]
  node bin/video-vision.mjs watch --video-id <id> --timestamps 12,45,120
  node bin/video-vision.mjs transcript --video-id <id>
  node bin/video-vision.mjs status
Options:
  --cwd <workspace> --cache <cache directory> --output <JSON path>
  --start <seconds> --end <seconds> --language <speech language>
  --ffmpeg <path> --ffprobe <path> --ytdlp <path> --node <path>
  --max-height <pixels> --max-download <MB> --download-timeout <ms>
  --cookies <explicit cookie file> --proxy <proxy URL>`);
  process.exit(0);
}
const args = { action: argv.shift() }, config = {};
let cwd = process.cwd(), output;
const values = { '--source': 'source', '--video-id': 'video_id', '--language': 'language' };
const numbers = { '--frames': 'frames', '--start': 'start_seconds', '--end': 'end_seconds' };
const paths = { '--ffmpeg': 'ffmpegPath', '--ffprobe': 'ffprobePath', '--ytdlp': 'ytDlpPath',
  '--node': 'nodePath', '--cache': 'cacheDirectory', '--cookies': 'cookieFile', '--proxy': 'proxy' };
const settings = { '--max-height': 'maxHeight', '--max-download': 'maxDownloadMB', '--download-timeout': 'downloadTimeoutMs' };
for (let i = 0; i < argv.length; i += 2) {
  const key = argv[i], value = argv[i + 1];
  if (value === undefined) throw new Error('Missing value for ' + key);
  if (values[key]) args[values[key]] = value;
  else if (numbers[key]) args[numbers[key]] = Number(value);
  else if (paths[key]) config[paths[key]] = value;
  else if (settings[key]) config[settings[key]] = Number(value);
  else if (key === '--timestamps') args.timestamps = value.split(',').map(Number);
  else if (key === '--cwd') cwd = resolve(value);
  else if (key === '--output') output = resolve(value);
  else throw new Error('Unknown option ' + key);
}
const stop = new AbortController();
const interrupt = () => stop.abort(new Error('Cancelled by user.'));
process.once('SIGINT', interrupt);
process.once('SIGTERM', interrupt);
const ctx = { workingDirectory: { ensure: async () => cwd }, get: () => undefined };
try {
  const value = await makeTool(ctx, config).execute(args, { agent: {}, signal: stop.signal });
  const result = { ...value, cli_note: 'Frame paths are ready to open. DSH delivers these frames as native image attachments.' };
  if (output) { await mkdir(dirname(output), { recursive: true }); await writeFile(output, JSON.stringify(result, null, 2)); }
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  process.removeListener('SIGINT', interrupt);
  process.removeListener('SIGTERM', interrupt);
}
