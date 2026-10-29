import assert from 'node:assert/strict';
import { defaultPortFiles, runningBrowsers, defaultBrowser } from '../browser-session/platform/darwin.cjs';
const calls = [];
const execute = async (command, args) => {
  calls.push({ command, args });
  if (args[0] === '-U') return { stdout: '1 /Applications/Google Chrome.app/Contents/MacOS/Google Chrome\n2 /usr/bin/unrelated\n3 /Applications/Chromium.app/Contents/MacOS/Chromium\n4 /Applications/Google Chrome.app/Contents/MacOS/Google Chrome\n5 /Applications/Brave Browser.app/Contents/MacOS/Brave Browser\n' };
  return { stdout: ({
    1: '501 /Applications/Google Chrome.app/Contents/MacOS/Google Chrome --user-data-dir=/Users/test/Library/Application Support/Chrome QA --remote-debugging-port=9222 --secret=never-return',
    3: '501 Chromium --type=renderer --remote-debugging-port=9000',
    4: '502 Google Chrome --user-data-dir=/other-user',
    5: '501 Brave Browser --profile-directory="Profile 2" --remote-debugging-port 9333'
  })[args[1]] };
};
assert.deepEqual(await runningBrowsers({ execute, uid: 501 }), [
  ['Google Chrome', '--user-data-dir=/Users/test/Library/Application Support/Chrome QA', '--remote-debugging-port=9222'],
  ['Brave Browser', '--profile-directory=Profile 2', '--remote-debugging-port=9333']
]);
assert.equal(calls.length, 5);
assert.ok(calls.every(c => c.command === '/bin/ps'));
const chosen = await defaultBrowser({ home: '/Users/test', exists: async p => p === '/Users/test/Applications/Chromium.app/Contents/MacOS/Chromium' });
assert.equal(chosen.isDefault, false);
assert.deepEqual(chosen.arguments, ['-a', '/Users/test/Applications/Chromium.app']);
assert.equal(chosen.executable, '/usr/bin/open');
assert.equal((await defaultBrowser({ exists: async () => false })).supported, false);
const files = defaultPortFiles({ home: '/Users/test' });
assert.ok(files.includes('/Users/test/Library/Application Support/Google/Chrome/DevToolsActivePort'));
assert.ok(files.every(p => p.endsWith('/DevToolsActivePort')));
console.log('macOS adapter synthetic tests passed; no macOS runtime or real process/browser profile used.');
