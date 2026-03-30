#!/usr/bin/env node
// Usage: node scripts/gen-password-hash.mjs <password>
const pass = process.argv[2];
if (!pass) { console.error('Usage: node scripts/gen-password-hash.mjs <password>'); process.exit(1); }

const salt = crypto.getRandomValues(new Uint8Array(16));
const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveBits']);
const derived = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', iterations: 100000, salt }, key, 256);
const hex = b => Array.from(new Uint8Array(b)).map(x => x.toString(16).padStart(2, '0')).join('');
console.log('pbkdf2:sha256:100000:' + hex(salt.buffer) + ':' + hex(derived));
