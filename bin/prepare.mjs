#!/usr/bin/env node
import { resolve } from 'node:path';
import { prepareResolver } from '../lib/prepare.js';

const argv = process.argv.slice(2);
const options = {};
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--directory' && argv[i + 1]) options.directory = resolve(argv[++i]);
  else if (argv[i] === '--update') options.update = true;
  else if (argv[i] === '--help') {
    console.log('Prepare the official yt-dlp executable.\nnode bin/prepare.mjs [--directory <tools folder>] [--update]');
    process.exit(0);
  } else throw new Error('Unknown option: ' + argv[i]);
}
console.log('yt-dlp is ready: ' + await prepareResolver(options));
