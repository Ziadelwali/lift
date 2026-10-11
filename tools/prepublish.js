/* Runs before every publish:
   1. LEAK SCAN - no Google API key (AIza...) or firebase-config.json content may be
      in any file that would be committed. The repo is public.
   2. fbconfig.js must hold the v2 sealed config (node tools/seal-config.js).
   3. tools/test-engine.js and tools/test-sync.js must pass.
   4. sw.js gets a fresh random cache version so phones pick up the new build, and the list of
      photos to keep offline (everything under img/ that is committed). */
const fs=require('fs'),p=require('path'),c=require('crypto'),cp=require('child_process');
const root=p.join(__dirname,'..');
const files=cp.execSync('git ls-files --cached --others --exclude-standard',{cwd:root}).toString().split(/\r?\n/).filter(Boolean);
const bad=files.filter(f=>/\.(html|js|css|json|md|cmd|txt|webmanifest)$/.test(f)&&/AIza[0-9A-Za-z_-]{30,}/.test(fs.readFileSync(p.join(root,f),'utf8')));
if(bad.length){console.error('LEAK: plaintext API key in '+bad.join(', ')+'. Nothing published.');process.exit(1);}
if(files.includes('firebase-config.json')){console.error('LEAK: firebase-config.json would be committed. Nothing published.');process.exit(1);}
const fbc=p.join(root,'fbconfig.js');
if(!fs.existsSync(fbc)||!/FB_SEALED2=/.test(fs.readFileSync(fbc,'utf8'))){console.error('fbconfig.js has no v2 sealed config. Run: node tools\\seal-config.js');process.exit(1);}
['test-engine.js','test-sync.js'].forEach(function(t){
 try{cp.execFileSync(process.execPath,[p.join(__dirname,t)],{cwd:root,stdio:'pipe'});}
 catch(e){console.error(String(e.stdout||'')+String(e.stderr||'')+'\n'+t+' FAILED. Nothing published.');process.exit(1);}
});
const f=p.join(root,'sw.js');
const ver='v-'+c.randomBytes(5).toString('hex');
fs.writeFileSync(f,fs.readFileSync(f,'utf8').replace(/const VERSION = '[^']*';/,"const VERSION = '"+ver+"';"));
const photos=files.filter(x=>/^img\/.+\.(jpg|png)$/.test(x)).sort().map(x=>'./'+x);
fs.writeFileSync(f,fs.readFileSync(f,'utf8').replace(/const PHOTOS = \[[^\]]*\];/,'const PHOTOS = '+JSON.stringify(photos)+';'));
const ix=p.join(root,'index.html');
fs.writeFileSync(ix,fs.readFileSync(ix,'utf8').replace(/<meta name="build" content="[^"]*">/,'<meta name="build" content="'+ver.slice(2)+'">'));
console.log('leak scan OK, fbconfig.js present, tests pass, '+photos.length+' photos, build '+ver.slice(2));
