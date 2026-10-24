#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const request = JSON.parse(await readFile(process.argv[2], 'utf8'));
const { modulePath, timeoutMs, ...context } = request;
// Keep stdout reserved for the structured result. The parent owns cancellation and process-tree cleanup.
console.log = (...values) => console.error(...values);
const { default: resolver } = await import(pathToFileURL(modulePath));
if (typeof resolver !== 'function') throw new Error('resolve.mjs must export a default async function.');
const result = await resolver({ ...context, signal: AbortSignal.timeout(timeoutMs) });
process.stdout.write(JSON.stringify(result));
