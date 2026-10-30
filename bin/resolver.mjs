#!/usr/bin/env node
import { budgetSignal } from '../lib/budgets.js';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const request = JSON.parse(await readFile(process.argv[2], 'utf8'));
const { modulePath, timeoutMs, ...context } = request;
// Keep stdout reserved for the structured result. The parent owns cancellation and process-tree cleanup.
console.log = (...values) => console.error(...values);
const { default: resolver } = await import(pathToFileURL(modulePath));
if (typeof resolver !== 'function') throw new Error('resolve.mjs must export a default async function.');
// JSON has no Infinity value; restore the optional budget for existing resolver arithmetic.
if (context.maxDownloadMB === null) context.maxDownloadMB = Infinity;
const result = await resolver({ ...context, signal: budgetSignal(new AbortController().signal, timeoutMs) });
process.stdout.write(JSON.stringify(result));
