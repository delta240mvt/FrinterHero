// Run: npx tsx scripts/gen-pbkdf2-hash.ts
// Paste password when prompted, copies hash to stdout.
// Then: wrangler secret put ADMIN_PASSWORD_HASH
import * as readline from 'node:readline';

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
rl.question('Password: ', async (password) => {
  rl.close();

  function hexToBytes(hex: string): Uint8Array {
    const arr = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) arr[i / 2] = parseInt(hex.slice(i, i + 2), 16);
    return arr;
  }
  function bytesToHex(buf: ArrayBuffer): string {
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  const { webcrypto } = await import('node:crypto');
  const subtle = webcrypto.subtle;
  const getRandomValues = webcrypto.getRandomValues.bind(webcrypto);
  const salt = getRandomValues(new Uint8Array(16));
  const key = await subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const derived = await subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', iterations: 100000, salt }, key, 256);
  const hash = `pbkdf2:sha256:100000:${bytesToHex(salt.buffer)}:${bytesToHex(derived)}`;
  console.log('\nHash (copy this to wrangler secret):\n');
  console.log(hash);
});
