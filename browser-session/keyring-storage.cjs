const { createHash, randomBytes, createCipheriv, createDecipheriv } = require('node:crypto');
const { resolve } = require('node:path');

const MAGIC = Buffer.from('VVKR1');
const SERVICE = 'dsh-video-vision.browser-session';

// The snapshot service owns writes. This adapter never enumerates credentials,
// creates keys during status/load, or migrates Electron's separate snapshot file.
async function createKeyringStorage({ directory, keyringModule } = {}) {
  if (typeof directory !== 'string' || !directory) throw new TypeError('A browser-session directory is required.');
  const account = createHash('sha256').update(resolve(directory)).digest('hex');
  const aad = Buffer.from(`${SERVICE}:${account}:v1`);
  let entry, key, preparing;
  function getEntry() {
    if (!entry) {
      const binding = keyringModule || require('@napi-rs/keyring');
      const Entry = binding.AsyncEntry || binding.Entry;
      // Accepted on all platforms; only Linux uses this option. Never use the
      // library's volatile keyutils fallback for an encrypted on-disk snapshot.
      entry = new Entry(SERVICE, account, { linux: { store: 'secret-service' } });
    }
    return entry;
  }
  async function readKey() {
    const value = await getEntry().getPassword();
    if (value === null) return null;
    if (typeof value !== 'string' || !/^[A-Za-z0-9+/]{43}=$/.test(value)) throw new Error('Browser-session encryption key is invalid.');
    const bytes = Buffer.from(value, 'base64');
    if (bytes.length !== 32) throw new Error('Browser-session encryption key is invalid.');
    return bytes;
  }
  async function prepare() {
    if (key) return;
    preparing ||= (async () => {
      const existing = await readKey();
      if (existing) { key = existing; return; }
      const candidate = randomBytes(32);
      await getEntry().setPassword(candidate.toString('base64'));
      key = candidate;
    })().finally(() => { preparing = undefined; });
    await preparing;
  }
  return {
    prepare,
    isEncryptionAvailable() {
      // Backend construction only: no password reads/writes. Runtime operations
      // still report a locked/inaccessible store through their original error.
      try { getEntry(); return true; } catch { return false; }
    },
    getSelectedStorageBackend() {
      return process.platform === 'linux' ? 'secret-service' : process.platform === 'darwin' ? 'keychain' : process.platform === 'win32' ? 'windows-credential-manager' : 'system-keyring';
    },
    async encryptString(text) {
      if (typeof text !== 'string') throw new TypeError('Expected a string.');
      await prepare();
      const nonce = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', key, nonce);
      cipher.setAAD(aad);
      const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
      return Buffer.concat([MAGIC, nonce, cipher.getAuthTag(), encrypted]);
    },
    async decryptString(input) {
      const bytes = Buffer.from(input);
      if (bytes.length < MAGIC.length + 28 || !bytes.subarray(0, MAGIC.length).equals(MAGIC)) throw new Error('Invalid keyring browser-session snapshot.');
      const stored = key || await readKey();
      if (!stored) throw new Error('Browser-session encryption key was not found. Import the browser session again.');
      const decipher = createDecipheriv('aes-256-gcm', stored, bytes.subarray(5, 17));
      decipher.setAAD(aad);
      decipher.setAuthTag(bytes.subarray(17, 33));
      const text = Buffer.concat([decipher.update(bytes.subarray(33)), decipher.final()]).toString('utf8');
      key = stored;
      return text;
    },
  };
}

module.exports = { createKeyringStorage };
