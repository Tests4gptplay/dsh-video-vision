import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { mkdtemp, mkdir, writeFile, rm } = createRequire(import.meta.url)(process.versions.electron ? 'original-fs' : 'node:fs').promises;
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { desktopIntegrationInstalled, BrowserSessions } from '../lib/browser-session.js';

const root = await mkdtemp(join(tmpdir(), 'dsh-video-integration-'));
const directory = join(root, 'session'), resources = join(root, 'resources');
const archive = join(resources, 'app.asar');
async function fixture(main) {
  const content = Buffer.from(main);
  const header = Buffer.from(JSON.stringify({ files: { lib: { files: { 'main.js': { offset: '0', size: content.length } } } } }));
  const prefix = Buffer.alloc(16);
  prefix.writeUInt32LE(header.length + 8, 4); prefix.writeUInt32LE(header.length, 12);
  await writeFile(archive, Buffer.concat([prefix, header, content]));
}
let session;
try {
  await mkdir(directory, { recursive: true }); await mkdir(resources, { recursive: true });
  await writeFile(join(directory, 'desktop-integration.json'), JSON.stringify({ archive }));
  assert.equal(await desktopIntegrationInstalled(directory), false, 'A surviving receipt is not an installed component');
  await mkdir(join(resources, 'dsh-browser-session'));
  for (const name of ['sync.cjs', 'protocol.cjs', 'snapshot.cjs', 'discovery.cjs']) await writeFile(join(resources, 'dsh-browser-session', name), '// fixture');
  await fixture('// original Desktop');
  assert.equal(await desktopIntegrationInstalled(directory), false, 'Runtime files alone do not provide the startup hook');
  await fixture('// DSH_LOCAL_BROWSER_SESSION_BRIDGE');
  assert.equal(await desktopIntegrationInstalled(directory), true);
  await rm(join(resources, 'dsh-browser-session', 'snapshot.cjs'));
  assert.equal(await desktopIntegrationInstalled(directory), false, 'A missing runtime file is detected');
  session = new BrowserSessions({}, { directory, request: async () => { throw new Error('offline'); } });
  const status = await session.status();
  assert.equal(status.ready, false); assert.equal(status.desktopIntegration, false);
  assert.equal(status.imported, null, 'An unreadable service must not report that no snapshot exists');
  assert.match(status.componentMessage, /组件缺失/);
  assert.doesNotMatch(status.componentMessage, /重启/);
  console.log('PASS: stale receipt, missing hook/runtime and unavailable session status.');
} finally { await session?.dispose(); await rm(root, { recursive: true, force: true }); }
