#!/usr/bin/env node
/* seal-config.js - encrypt firebase-config.json with the sync password and write fbconfig.js
   (committed). The plaintext config never enters the repo.

   Usage:  node tools/seal-config.js          seal for one password (asks twice)
           node tools/seal-config.js --add    also let a second password open it (during a password change)

   The password is typed at a prompt, so it never lands in the shell history.
   Scheme (must match deriveKeys/openConfig in sync.js):
     norm(password): lowercase, runs of non-letters -> one space, trimmed
     master = PBKDF2-SHA256(norm, "lift-sync/v2/salt", 600000) ; cfgKey = HKDF-SHA256(master, salt "lift-sync/v2/hkdf", info "lift/v2/cfg")
     entry  = AES-256-GCM(cfgKey, random 12-byte IV, AAD "lift/v2/cfg"), ciphertext||tag, base64
   fbconfig.js: window.FB_SEALED2 = {v:2, entries:[{iv,data}, ...]} */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const readline = require('readline');

const root = path.join(__dirname, '..');
const ITER = 600000;
const add = process.argv.includes('--add');
const out = path.join(root, 'fbconfig.js');
function norm(s) { return String(s || '').toLowerCase().replace(/[^a-z]+/g, ' ').trim(); }

function ask(q) {
  return new Promise(function (resolve) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl._writeToOutput = function (s) { if (s.indexOf(q) === 0) rl.output.write(q); };   // hide what is typed
    rl.question(q, function (a) { rl.close(); process.stdout.write('\n'); resolve(a); });
  });
}
function cfgKey(pass) {
  const master = crypto.pbkdf2Sync(Buffer.from(pass, 'utf8'), 'lift-sync/v2/salt', ITER, 32, 'sha256');
  return Buffer.from(crypto.hkdfSync('sha256', master, 'lift-sync/v2/hkdf', 'lift/v2/cfg', 32));
}

(async function () {
  const srcPath = path.join(root, 'firebase-config.json');
  if (!fs.existsSync(srcPath)) {
    console.error('firebase-config.json not found next to index.html. Create it with the web app config from the Firebase console:\n' +
      '{ "apiKey": "...", "authDomain": "...", "projectId": "...", "storageBucket": "...", "messagingSenderId": "...", "appId": "..." }');
    process.exit(1);
  }
  const plain = Buffer.from(JSON.stringify(JSON.parse(fs.readFileSync(srcPath, 'utf8'))), 'utf8');
  let entries = [];
  if (add) {
    const cur = fs.existsSync(out) && fs.readFileSync(out, 'utf8').match(/FB_SEALED2=(\{.*\});/);
    if (!cur) { console.error('No FB_SEALED2 in fbconfig.js to add to. Run without --add first.'); process.exit(1); }
    entries = JSON.parse(cur[1]).entries;
  }
  const pass = norm(await ask(add ? 'Extra password: ' : 'Password: '));
  if (!pass) { console.error('Empty password. Nothing written.'); process.exit(1); }
  if (norm(await ask('Same password again: ')) !== pass) { console.error('The two did not match. Nothing written.'); process.exit(1); }
  console.log('Deriving the key (a few seconds)…');
  const key = cfgKey(pass), iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key, iv); c.setAAD(Buffer.from('lift/v2/cfg'));
  const payload = Buffer.concat([c.update(plain), c.final(), c.getAuthTag()]);

  const d = crypto.createDecipheriv('aes-256-gcm', key, iv); d.setAAD(Buffer.from('lift/v2/cfg'));
  d.setAuthTag(payload.subarray(payload.length - 16));
  const back = Buffer.concat([d.update(payload.subarray(0, payload.length - 16)), d.final()]);
  if (!back.equals(plain)) { console.error('ROUND TRIP FAILED. Nothing written.'); process.exit(1); }

  entries.push({ iv: iv.toString('base64'), data: payload.toString('base64') });
  const text = '/* Firebase config sealed with the sync password (tools/seal-config.js). Ciphertext only. */\n' +
    'window.FB_SEALED2=' + JSON.stringify({ v: 2, entries: entries }) + ';\n';
  if (/AIza[0-9A-Za-z_-]{30,}/.test(text)) { console.error('LEAK: plaintext key in output. Nothing written.'); process.exit(1); }
  fs.writeFileSync(out, text);
  console.log('fbconfig.js written with ' + entries.length + ' password' + (entries.length > 1 ? 's' : '') + ' (round trip OK, no plaintext key). Commit it; keep firebase-config.json local.');
})();
