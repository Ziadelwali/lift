#!/usr/bin/env node
/* seal-config.js - encrypt firebase-config.json with the sync passphrase and
   write fbconfig.js (committed). The plaintext config never enters the repo.

   Usage:  node tools/seal-config.js "<passphrase>"

   Scheme (must match unseal() in index.html):
     passphrase normalised: lowercase, runs of non-letters -> one space, trimmed
     PBKDF2-SHA256, 150000 iterations, random 16-byte salt
     AES-256-GCM, random 12-byte IV, ciphertext||tag, base64
   Round-trip check runs before anything is written. Re-run after changing the
   passphrase or the Firebase config. */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = path.join(__dirname, '..');
const ITER = 150000;
const pass = String(process.argv[2] || '').toLowerCase().replace(/[^a-z]+/g, ' ').trim();
if (!pass) { console.error('usage: node tools/seal-config.js "<passphrase>"'); process.exit(1); }

const srcPath = path.join(root, 'firebase-config.json');
if (!fs.existsSync(srcPath)) {
  console.error('firebase-config.json not found next to index.html. Create it with the web app config from the Firebase console:\n' +
    '{ "apiKey": "...", "authDomain": "...", "projectId": "...", "storageBucket": "...", "messagingSenderId": "...", "appId": "..." }');
  process.exit(1);
}
const plain = Buffer.from(JSON.stringify(JSON.parse(fs.readFileSync(srcPath, 'utf8'))), 'utf8');

const salt = crypto.randomBytes(16), iv = crypto.randomBytes(12);
const key = crypto.pbkdf2Sync(Buffer.from(pass, 'utf8'), salt, ITER, 32, 'sha256');
const c = crypto.createCipheriv('aes-256-gcm', key, iv);
const payload = Buffer.concat([c.update(plain), c.final(), c.getAuthTag()]);

const d = crypto.createDecipheriv('aes-256-gcm', key, iv);
d.setAuthTag(payload.subarray(payload.length - 16));
const back = Buffer.concat([d.update(payload.subarray(0, payload.length - 16)), d.final()]);
if (!back.equals(plain)) { console.error('ROUND TRIP FAILED. Nothing written.'); process.exit(1); }

const out = { salt: salt.toString('base64'), iv: iv.toString('base64'), iter: ITER, data: payload.toString('base64') };
fs.writeFileSync(path.join(root, 'fbconfig.js'),
  '/* Firebase config sealed with the sync passphrase (tools/seal-config.js). Ciphertext only. */\n' +
  'window.FB_SEALED=' + JSON.stringify(out) + ';\n');
const leak = fs.readFileSync(path.join(root, 'fbconfig.js'), 'utf8');
if (/AIza[0-9A-Za-z_-]{30,}/.test(leak)) { console.error('LEAK: plaintext key in output. Nothing kept.'); fs.unlinkSync(path.join(root, 'fbconfig.js')); process.exit(1); }
console.log('fbconfig.js written (round trip OK, no plaintext key). Commit it; keep firebase-config.json local.');
