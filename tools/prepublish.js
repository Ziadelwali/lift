/* Runs before every publish:
   1. LEAK SCAN - no Google API key (AIza…) or firebase-config.json content may be
      in any file that would be committed. The repo is public.
   2. fbconfig.js must exist (node tools/seal-config.js "<passphrase>").
   3. sw.js gets a fresh random cache version so phones pick up the new build. */
const fs=require('fs'),p=require('path'),c=require('crypto'),cp=require('child_process');
const root=p.join(__dirname,'..');
const files=cp.execSync('git ls-files --cached --others --exclude-standard',{cwd:root}).toString().split(/\r?\n/).filter(Boolean);
const bad=files.filter(f=>/\.(html|js|json|md|cmd|txt|webmanifest)$/.test(f)&&/AIza[0-9A-Za-z_-]{30,}/.test(fs.readFileSync(p.join(root,f),'utf8')));
if(bad.length){console.error('LEAK: plaintext API key in '+bad.join(', ')+'. Nothing published.');process.exit(1);}
if(files.includes('firebase-config.json')){console.error('LEAK: firebase-config.json would be committed. Nothing published.');process.exit(1);}
if(!fs.existsSync(p.join(root,'fbconfig.js'))){console.error('fbconfig.js missing. Run: node tools\seal-config.js "<passphrase>"');process.exit(1);}
const f=p.join(root,'sw.js');
fs.writeFileSync(f,fs.readFileSync(f,'utf8').replace(/const VERSION = '[^']*';/,"const VERSION = 'v-"+c.randomBytes(5).toString('hex')+"';"));
console.log('leak scan OK, fbconfig.js present, sw.js stamped');
