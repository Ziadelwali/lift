/* Lift app: screens, sync, service-worker registration. Loaded after fbconfig.js, exercises.js, engine.js. */
(function(){
"use strict";
var E=window.ENGINE, EX=window.EXDB;
function esc(t){return String(t==null?'':t).replace(/[&<>"]/g,function(m){return({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'})[m];});}
function $(s,el){return (el||document).querySelector(s);}
function $$(s,el){return Array.prototype.slice.call((el||document).querySelectorAll(s));}
function todayISO(){return E.isoDate(new Date());}
function nowMin(){var d=new Date();return d.getHours()*60+d.getMinutes();}
var DOW=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'], MON=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function niceDate(iso){var d=E.parseISO(iso);return DOW[d.getDay()]+' '+d.getDate()+' '+MON[d.getMonth()];}
function toast(t){var el=$('#toast');el.textContent=t;el.classList.add('on');clearTimeout(toast._t);toast._t=setTimeout(function(){el.classList.remove('on');},3000);}
/* Important news (easy week, stalls) stays as a card on Today and Train until dismissed, instead of a toast. */
function notice(){try{return JSON.parse(localStorage.getItem('lift.notice')||'null');}catch(e){return null;}}
function setNotice(t){try{if(t)localStorage.setItem('lift.notice',JSON.stringify({text:t,at:Date.now()}));else localStorage.removeItem('lift.notice');}catch(e){}}
function noticeCard(){var n=notice();return n&&n.text?'<div class="card notice" role="status"><p class="sm">'+esc(n.text)+'</p><button class="btn small ghost" data-act="noticeoff">OK</button></div>':'';}
function fmtSec(s){s=Math.max(0,Math.round(s));return Math.floor(s/60)+':'+(s%60<10?'0':'')+(s%60);}

/* ---------------- persistent state ----------------
   Local first: every change lands in localStorage at once. With a password, sync.js keeps one
   encrypted Firestore document per password in step with it (plain REST - the SDK's realtime
   channel is rejected for this project). Offline, changes wait and go out when the network is back;
   other devices' changes are picked up by polling while the app is open. */
var LS='lift.v1', PK='lift.pp';
var SYNC_SECTIONS=['profile','sessions','weight','daily','settings'];
var state={profile:{},sessions:{},weight:{},daily:{},settings:{}};
var saveT=null,lsErr=null,SYNC={log:[],eng:null,on:false};
function slog(t){var d=new Date();SYNC.log.push(d.toTimeString().slice(0,8)+' '+t);if(SYNC.log.length>8)SYNC.log.shift();var el=$('#synclog');if(el)el.textContent=SYNC.log.join(String.fromCharCode(10));}
// an unreadable copy is kept aside for a look; the synced copy fills this device in again
try{var raw=localStorage.getItem(LS);if(raw){var parsed=JSON.parse(raw);SYNC_SECTIONS.forEach(function(s){if(parsed[s])state[s]=parsed[s];});}}
catch(e){try{localStorage.setItem(LS+'.bad',raw);}catch(e2){}}
/* every localStorage write goes through here, so a full or blocked storage shows in the sync line */
function writeLS(k,v){
 try{localStorage.setItem(k,v);if(lsErr){lsErr=null;setSyncLine($('#syncline').textContent.replace(/^Not saved on this device.*? · /,''),null);}return true;}
 catch(e){lsErr=(e&&e.name)||'error';slog('localStorage: '+lsErr);setSyncLine($('#syncline').textContent,false);return false;}
}
/* Taps come fast during training: the copy in localStorage is written 300 ms after the last change,
   and at once when the app is hidden or closed. A wipe stops it for good. */
var lsT=null,lsOff=false;
function flushLS(){clearTimeout(lsT);lsT=null;if(!lsOff)writeLS(LS,JSON.stringify(state));}
addEventListener('pagehide',function(){if(lsT)flushLS();});
document.addEventListener('visibilitychange',function(){if(document.hidden&&lsT)flushLS();});
function save(){
 clearTimeout(lsT);lsT=setTimeout(flushLS,300);
 clearTimeout(saveT);saveT=setTimeout(function(){if(SYNC.eng)SYNC.eng.kick();},600);
}
function setSyncLine(txt,live){
 txt=txt.replace(/^Not saved on this device.*? · /,'');
 if(lsErr){txt='Not saved on this device ('+lsErr+') · '+txt;live=false;}
 slog(txt);$('#syncline').textContent=txt;var d=$('#syncdot');d.className=live===true?'live':live===false?'off':'';
 var si=$('#syncinfo');if(si)si.textContent=txt;
}
/* what the sync engine keeps in localStorage - nothing secret; the keys live in IndexedDB */
var SYNC_LS={base2:'lift.base2',ut:'lift.ut',mig:'lift.mig',v1base:'lift.base'};
var syncStore={get:function(k){try{var v=localStorage.getItem(SYNC_LS[k]);return v==null?null:JSON.parse(v);}catch(e){return null;}},
 set:function(k,v){writeLS(SYNC_LS[k],JSON.stringify(v));},del:function(k){try{localStorage.removeItem(SYNC_LS[k]);}catch(e){}}};
/* IndexedDB 'lift'/'kv' holds the keys (CryptoKeys that can't be read back out). Without IndexedDB
   they live in memory only, so the password is asked on every launch. */
var kv=(function(){var dbp=null,mem={};
 function db(){if(!dbp)dbp=new Promise(function(res,rej){if(!window.indexedDB)return rej(new Error('no IndexedDB'));var r=indexedDB.open('lift',1);
  r.onupgradeneeded=function(){r.result.createObjectStore('kv');};r.onsuccess=function(){res(r.result);};r.onerror=function(){rej(r.error);};});return dbp;}
 function tx(mode,fn){return db().then(function(d){return new Promise(function(res,rej){var t=d.transaction('kv',mode),q=fn(t.objectStore('kv'));
  t.oncomplete=function(){res(q&&q.result);};t.onerror=t.onabort=function(){rej(t.error);};});});}
 return {get:function(k){return tx('readonly',function(s){return s.get(k);}).then(function(v){return v==null?(mem[k]||null):v;},function(){return mem[k]||null;});},
  set:function(k,v){mem[k]=v;return tx('readwrite',function(s){s.put(v,k);}).catch(function(e){slog('IndexedDB: '+(e&&e.message));});},
  del:function(k){delete mem[k];return tx('readwrite',function(s){s.delete(k);}).catch(function(){});},
  clear:function(){mem={};return tx('readwrite',function(s){s.clear();}).catch(function(){});}};})();
function restTransport(cfg){
 var base='https://firestore.googleapis.com/v1/projects/'+encodeURIComponent(cfg.projectId)+'/databases/(default)/documents/lift/',key='?key='+encodeURIComponent(cfg.apiKey);
 function call(method,id,qs,body){
  if(!navigator.onLine)return Promise.reject(new Error('offline'));
  var ac=('AbortController' in window)?new AbortController():null,t=ac&&setTimeout(function(){ac.abort();},12000);
  return fetch(base+id+key+qs,{method:method,headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined,signal:ac?ac.signal:undefined})
   .then(function(r){clearTimeout(t);slog(method+(/mask/.test(qs)?' check ':' ')+r.status);return r.text().then(function(x){var j=null;try{j=JSON.parse(x);}catch(e){}return {status:r.status,doc:j};});},
    function(e){clearTimeout(t);throw e;});
 }
 return {get:function(id,o){return call('GET',id,o&&o.mask?'&mask.fieldPaths=v':'');},
  write:function(id,fields,pre){
   var qs=pre&&pre.exists===false?'&currentDocument.exists=false':pre&&pre.updateTime?'&currentDocument.updateTime='+encodeURIComponent(pre.updateTime):'';
   return call('PATCH',id,qs,{fields:fields}).then(function(r){var st=r.doc&&r.doc.error&&r.doc.error.status;
    // someone wrote in between (or the doc went away): pull, merge, try again
    if(r.status===409||r.status===412||st==='FAILED_PRECONDITION'||st==='ALREADY_EXISTS'||(r.status===404&&pre&&pre.updateTime))r.conflict=true;return r;});}};
}
/* The Firebase config is committed only as ciphertext (tools/seal-config.js); the password opens it.
   The device may hold an old fbconfig.js (offline cache), so the live one is fetched once if needed. */
function sealedNow(fresh){
 if(!fresh&&window.FB_SEALED2)return Promise.resolve(window.FB_SEALED2);
 return fetch('./fbconfig.js?fresh='+Date.now(),{cache:'no-store'}).then(function(r){return r.ok?r.text():Promise.reject(new Error(r.status));})
 .then(function(t){var m=t.match(/FB_SEALED2=(\{.*\});/);if(!m)throw new Error('no sealed config');window.FB_SEALED2=JSON.parse(m[1]);return window.FB_SEALED2;});
}
function unlock(pass){
 return SYNC2.deriveKeys(pass).then(function(k){
  function tryOpen(fresh){return sealedNow(fresh).then(function(s){return SYNC2.openConfig(s,k.cfgKey);});}
  return tryOpen(false).catch(function(){slog('config did not open — fetching the live copy');return tryOpen(true);})
  .then(function(cfg){return {docId:k.docId,dataKey:k.dataKey,cfg:cfg,v1Id:k.v1Id};});
 });
}
function devName(){var d=null;try{d=localStorage.getItem('lift.dev');if(!d){d=Math.random().toString(36).slice(2,8);localStorage.setItem('lift.dev',d);}}catch(e){}return d||'';}
/* another device's copy (merged with ours) arrives */
function adopt(s){
 state=SYNC2.shape(s);migrate();writeLS(LS,JSON.stringify(state));
 var a=document.activeElement;
 if(a&&/^(INPUT|SELECT|TEXTAREA)$/.test(a.tagName))a.addEventListener('blur',function(){render();},{once:true});else render();
}
function engine(){
 if(SYNC.eng)return SYNC.eng;
 SYNC.eng=SYNC2.createSync({transport:restTransport,kv:kv,store:syncStore,dev:devName(),
  getLocal:function(){return state;},setLocal:adopt,log:slog,status:setSyncLine,notice:toast,loadSealed:sealedNow,
  every:function(ms,fn){setInterval(function(){if(!document.hidden)fn();},ms);
   document.addEventListener('visibilitychange',function(){if(!document.hidden)fn();});
   addEventListener('online',fn);addEventListener('offline',function(){setSyncLine('Offline — syncs later',false);});},
  onMoved:function(){kv.del('keys');syncStore.del('ut');SYNC.eng=null;SYNC.on=false;showGate('Password changed on another device.');}});
 return SYNC.eng;
}
/* rec: keys from IndexedDB; pp: a password the old app version kept in localStorage */
function startSync(rec,pp){
 if(SYNC.on)return;SYNC.on=true;   // once: a second call would double the polling
 if(pp==='-'||!(window.crypto&&crypto.subtle&&window.SYNC2)){setSyncLine('Saved on this device only',null);return;}
 setSyncLine('Connecting…',null);
 var got=rec?Promise.resolve(rec):
  // first start after the update: derive the keys, store them, read them back, then forget the password
  unlock(pp).then(function(r){return kv.set('keys',r).then(function(){return kv.get('keys');}).then(function(back){
   if(back&&back.docId===r.docId){try{localStorage.removeItem(PK);}catch(e){}}
   if(!syncStore.get('mig'))syncStore.set('mig','M2');return r;});});
 got.then(function(r){return engine().start(r);})
 .catch(function(e){slog('start failed: '+(e&&e.message));if(!rec)setSyncLine('Password not accepted — saved on this device',false);});
}

/* ---------------- service worker ---------------- */
/* A new version takes over in the background. The page never reloads by itself (not mid-session,
   not while typing): a small pill offers it, and a tap reloads. The first install is not news. */
var swHad=false;
function updateReady(){var u=$('#updpill');if(u)u.hidden=false;}
$('#updpill').addEventListener('click',function(){location.reload();});
if('serviceWorker' in navigator&&location.hostname!=='localhost'){
 swHad=!!navigator.serviceWorker.controller;
 navigator.serviceWorker.addEventListener('controllerchange',function(){if(swHad)updateReady();swHad=true;});
 navigator.serviceWorker.register('sw.js').then(function(r){try{r.update();}catch(e){}}).catch(function(){});
}

/* ---------------- theme ---------------- */
var ICON_SUN='<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
var ICON_LIFT='<svg viewBox="0 0 24 24"><path d="M2 12h3M19 12h3M6 8v8M18 8v8M9 6v12M15 6v12M9 12h6"/></svg>';
var ICON_CHECK='<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
/* Hand portions: open palm, fist, cupped hand, thumb. */
var HAND={
 protein:'<svg viewBox="0 0 24 24"><path d="M7 21v-5l-2.5-3.5a1.5 1.5 0 0 1 2.4-1.8L8 12V5a1.3 1.3 0 0 1 2.6 0v6M10.6 11V3.8a1.3 1.3 0 0 1 2.6 0V11M13.2 11V4.6a1.3 1.3 0 0 1 2.6 0V11M15.8 11V6.8a1.3 1.3 0 0 1 2.6 0V15a6 6 0 0 1-3 5.2V21"/></svg>',
 veg:'<svg viewBox="0 0 24 24"><rect x="5" y="6" width="14" height="13" rx="4"/><path d="M5 11h14M9 6v5M13 6v5M5 14.5c2 0 3 1.5 3 3.5"/></svg>',
 carb:'<svg viewBox="0 0 24 24"><path d="M3 11h18a9 9 0 0 1-18 0z"/><path d="M8 11c0-2 1.5-3 4-3s4 1 4 3"/></svg>',
 fat:'<svg viewBox="0 0 24 24"><path d="M10 21h6a3 3 0 0 0 3-3v-6a2 2 0 0 0-2-2h-4V5.5a2.5 2.5 0 0 0-5 0V14"/><path d="M8 13v8"/></svg>'
};
var ICON_MOON='<svg viewBox="0 0 24 24"><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/></svg>';
function themeMode(){try{return localStorage.getItem('lift.theme')||'auto';}catch(e){return 'auto';}}
function isDark(){return document.documentElement.getAttribute('data-theme')==='dark';}
function applyTheme(){
 var m=themeMode(),dark=m==='dark'||(m==='auto'&&!!window.matchMedia&&matchMedia('(prefers-color-scheme: dark)').matches);
 document.documentElement.setAttribute('data-theme',dark?'dark':'light');
 // both media variants get the chosen colour, so a forced light/dark wins over the phone setting
 $$('meta[name=theme-color]').forEach(function(mc){mc.content=dark?'#0A1322':'#4F9FE0';});
 $('#themebtn').innerHTML=dark?ICON_SUN:ICON_MOON;
}
function setTheme(m){try{localStorage.setItem('lift.theme',m);}catch(e){}applyTheme();if(view==='profile')renderProfile();}
$('#themebtn').addEventListener('click',function(){setTheme(isDark()?'light':'dark');});
if(window.matchMedia){var mq=matchMedia('(prefers-color-scheme: dark)');(mq.addEventListener?mq.addEventListener.bind(mq,'change'):mq.addListener.bind(mq))(function(){if(themeMode()==='auto')applyTheme();});}
applyTheme();

/* ---------------- install as an app (Android: Chrome, Brave, Samsung Internet) ---------------- */
var installEvt=null;
function isInstalled(){return (window.matchMedia&&matchMedia('(display-mode: standalone)').matches)||navigator.standalone===true;}
addEventListener('beforeinstallprompt',function(e){e.preventDefault();installEvt=e;if(typeof render==='function'&&view!=='train')render();});
addEventListener('appinstalled',function(){installEvt=null;toast('Installed — open Lift from your home screen');if(view!=='train')render();});
function remindersCard(){
 var mac=E.macrosFor(state);if(!mac)return '';
 var ev=E.reminderEvents(state.profile,mac,todayISO(),true),DN=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
 return '<div class="card"><h2>Reminders</h2><p class="sm" style="margin-top:6px">Put your training and meal times in your phone\'s calendar — it reminds you even when Lift is closed.</p>'+
  '<div class="row" style="margin-top:12px;gap:8px;flex-wrap:wrap"><button class="btn small" data-act="ics" data-meals="1">Training + meals</button><button class="btn small ghost" data-act="ics" data-meals="0">Training only</button></div>'+
  '<p class="xs" style="margin-top:8px">Downloads one file. Tip: put it in its own calendar called “Lift”, so you can hide or delete all reminders in one go — Google: calendar.google.com → Settings → Create new calendar “Lift” → Import the file into it. Samsung Calendar: create a “Lift” calendar and pick it when saving. No luck? Use the Google Calendar links below (one tap each).</p>'+
  '<details class="fold" style="margin-top:8px"><summary><span class="eyebrow">Add one by one to Google Calendar</span></summary><ul class="shop">'+
  ev.map(function(g){return '<li><a href="'+E.googleCalLink(g)+'" target="_blank" rel="noopener">'+esc(g.time+' '+g.title.replace('Lift: ',''))+'</a> <span class="xs">'+g.days.map(function(d){return DN[d];}).join(' ')+'</span></li>';}).join('')+'</ul></details>'+
  '<p class="xs" style="margin-top:6px">Changed your training days or times? Add them again (and delete the old ones in the calendar).</p></div>';
}
/* iPhone/iPad (an iPad asks for the desktop site, so it shows up as a Mac with a touch screen) */
function isIOS(){return /iPhone|iPad|iPod/.test(navigator.userAgent)||(/Macintosh/.test(navigator.userAgent)&&navigator.maxTouchPoints>1);}
var ICON_SHARE='<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15V3M8 7l4-4 4 4M6 11H5v10h14V11h-1"/></svg>';
function installCard(where){
 if(isInstalled())return where==='profile'?'<div class="card"><h2>App</h2><p class="sm" style="margin-top:6px">Installed ✓ — you are using Lift as an app.</p></div>':'';
 if(where==='today'){try{if(localStorage.getItem('lift.installLater')===todayISO().slice(0,7))return '';}catch(e){}}
 return '<div class="card install"><h2>Install Lift as an app</h2><p class="sm" style="margin-top:6px">Full screen, its own icon on your home screen, screen stays on during training, and updates arrive more reliably. No app store needed.</p>'+
  (installEvt?'<button class="btn wide" data-act="install" style="margin-top:12px">Install app</button>':isIOS()?
   '<p class="sm" style="margin-top:10px"><b>iPhone / iPad:</b> open Lift in <b>Safari</b>, tap <b>Share</b> '+ICON_SHARE+' at the bottom → <b>Add to Home Screen</b> → <b>Add</b>.</p>':
   '<p class="sm" style="margin-top:10px"><b>Android:</b> tap the browser menu <b>⋮</b> →<b>Install app</b> or <b>Add to Home screen</b> → <b>Install</b>.</p>')+
  (where==='today'?'<button class="btn small ghost" data-act="installlater" style="margin-top:8px">Not now</button>':'')+'</div>';
}

/* ---------------- body map ---------------- */
/* Plain words for everything the user sees: exercise names, muscles, equipment. */
var MUSCLE_WORDS={abdominals:'belly',abductors:'outer hip',adductors:'inner thigh',biceps:'front of upper arm',calves:'calves',chest:'chest',
 forearms:'forearms',glutes:'buttocks',hamstrings:'back of thigh',lats:'sides of the back',
 'lower back':'lower back','middle back':'middle of the back',neck:'neck',quadriceps:'front of thigh',shoulders:'shoulders',
 traps:'top of the shoulders',triceps:'back of upper arm'};
var EQUIP_WORDS={machine:'machine',dumbbell:'dumbbells',cable:'cable pulley',barbell:'bar','e-z curl bar':'curl bar','body only':'no equipment',kettlebells:'one dumbbell',bands:'band'};
function mw(m){return MUSCLE_WORDS[m]||m;}
function nm(id){return E.LABEL[id]||(EX[id]?EX[id].name:id);}
var GYM_EQUIP={'Wide-Grip_Lat_Pulldown':'machine','Close-Grip_Front_Lat_Pulldown':'machine',Seated_Cable_Rows:'machine'}; // cable in the photo, Nautilus machine at the gym
/* Your own gym: one cropped photo per machine (B1973 Fitness, Oct 2026), shown under Where. */
var GYM_PHOTO=(function(){var m={'leg-extension':['Leg_Extensions'],'leg-press':['Leg_Press','Calf_Press_On_The_Leg_Press_Machine'],'leg-curl':['Seated_Leg_Curl'],
 smith:['Smith_Machine_Squat','Smith_Machine_Bench_Press','Smith_Machine_Incline_Bench_Press','Smith_Machine_Overhead_Shoulder_Press','Smith_Machine_Calf_Raise','Smith_Machine_Stiff-Legged_Deadlift'],
 preacher:['Preacher_Curl'],bench:['Dumbbell_Bench_Press','Incline_Dumbbell_Press','Dumbbell_Incline_Row','Incline_Dumbbell_Curl'],'cable-row':['Seated_Cable_Rows'],
 cables:['Triceps_Pushdown','Triceps_Pushdown_-_Rope_Attachment','Straight-Arm_Pulldown','Rope_Straight-Arm_Pulldown','Face_Pull','Cable_Crunch','Cable_Seated_Lateral_Raise','Cable_Rear_Delt_Fly','Standing_Biceps_Cable_Curl','Cable_Rope_Overhead_Triceps_Extension'],
 'ab-crunch':['Ab_Crunch_Machine'],'back-extension':['Hyperextensions_Back_Extensions'],'shoulder-press':['Leverage_Shoulder_Press'],'chest-press':['Machine_Bench_Press'],rower:['Rowing_Stationary'],bike:['Bicycling_Stationary']},o={};
 Object.keys(m).forEach(function(f){m[f].forEach(function(id){o[id]='img/gym/'+f+'.jpg';});});return o;})();
function equipWord(id){var x=EX[id];if(GYM_EQUIP[id])return GYM_EQUIP[id];return x&&x.equipment?(EQUIP_WORDS[x.equipment]||x.equipment):'no equipment';}
/* An exercise this app version doesn't know (synced from a newer one, or removed) still draws. */
function exOf(id){return EX[id]||{name:String(id),images:['icon-192.png','icon-192.png'],primary:[],secondary:[],equipment:''};}
var CFG0={sets:3,reps:[8,12],inc:2.5,rest:90,alts:[]};
function cfgOf(e){return E.findCfg(e.base)||E.findCfg(e.id)||Object.assign({},CFG0,{id:e.base});}
/* small picture (img/ex/<id>/t.jpg, tools/make-thumbs.ps1) for thumbnails and tiles; the big photos stay for the strip and zoom */
function thumbSrc(id){var x=EX[id];return x?x.images[0].replace(/0\.jpg$/,'t.jpg'):'icon-192.png';}
function thumb(id){return EX[id]?'<img class="th" src="'+thumbSrc(id)+'" alt="" loading="lazy" decoding="async">':'';}
function exRow(id,extra,cls){return '<div class="exrow'+(cls?' '+cls:'')+'">'+thumb(id)+'<span style="flex:1;min-width:0">'+esc(nm(id))+'</span>'+(extra||'')+'</div>';}
function bodyMap(primary,secondary){
 var P={},S={};(primary||[]).forEach(function(m){P[m]=1;});(secondary||[]).forEach(function(m){if(!P[m])S[m]=1;});
 function m(name,shape){return '<g class="m'+(P[name]?' p':S[name]?' s':'')+'">'+shape+'</g>';}
 function el(cx,cy,rx,ry){return '<ellipse cx="'+cx+'" cy="'+cy+'" rx="'+rx+'" ry="'+ry+'"/>';}
 function mir(cx,cy,rx,ry){return el(cx,cy,rx,ry)+el(110-cx,cy,rx,ry);}
 function poly(pts){return '<polygon points="'+pts+'"/>';}
 function outline(){return '<g class="o"><circle cx="55" cy="20" r="13"/><rect x="48" y="31" width="14" height="10"/>'+
  '<path d="M30 46 Q55 38 80 46 L84 120 L70 124 L68 140 L42 140 L40 124 L26 120 Z"/>'+
  '<path d="M20 50 Q30 42 34 50 L30 128 L18 128 Z"/><path d="M90 50 Q80 42 76 50 L80 128 L92 128 Z"/>'+
  '<path d="M40 140 L54 140 L52 270 L40 270 Z"/><path d="M56 140 L70 140 L70 270 L58 270 Z"/></g>';}
 var front=outline()+
  m('neck',poly('49,32 61,32 62,42 48,42'))+
  m('traps',poly('36,46 55,40 74,46 55,50'))+
  m('shoulders',mir(31,54,9,8))+
  m('chest','<path d="M38 50 Q55 48 55 52 L55 76 Q42 80 36 70 Z"/><path d="M72 50 Q55 48 55 52 L55 76 Q68 80 74 70 Z"/>')+
  m('abdominals','<rect x="46" y="80" width="18" height="40" rx="5"/>')+
  m('biceps',mir(27,82,5,14))+
  m('forearms',mir(24,114,4.5,15))+
  m('abductors',mir(37,132,4,10))+
  m('adductors',mir(50,138,4,14))+
  m('quadriceps',mir(46,180,7,34))+
  m('calves',mir(46,240,5,26));
 var back=outline()+
  m('neck',poly('49,32 61,32 62,42 48,42'))+
  m('traps',poly('55,40 35,58 55,78 75,58'))+
  m('shoulders',mir(31,54,9,8))+
  m('middle back',poly('44,58 66,58 66,88 44,88'))+
  m('lats','<path d="M38 60 L44 62 L44 100 L40 108 Z"/><path d="M72 60 L66 62 L66 100 L70 108 Z"/>')+
  m('lower back','<rect x="46" y="92" width="18" height="24" rx="4"/>')+
  m('triceps',mir(27,82,5,14))+
  m('forearms',mir(24,114,4.5,15))+
  m('glutes',mir(47,130,9,12))+
  m('hamstrings',mir(46,178,7,32))+
  m('calves',mir(46,240,5,26));
 var said=(primary||[]).map(mw).join(', ');
 return '<svg class="bm" viewBox="0 0 230 280" role="img" aria-label="'+esc(said?'Muscles worked: '+said:'Body map')+'"><g>'+front+'</g><g transform="translate(120 0)">'+back+'</g></svg>';
}

/* ---------------- audio + haptics ---------------- */
var AC=null;
function unlockAudio(){try{AC=AC||new (window.AudioContext||window.webkitAudioContext)();if(AC.state==='suspended')AC.resume();}catch(e){}}
function beep(){try{AC=AC||new (window.AudioContext||window.webkitAudioContext)();var o=AC.createOscillator(),g=AC.createGain();o.connect(g);g.connect(AC.destination);o.frequency.value=880;g.gain.value=.15;o.start();o.stop(AC.currentTime+.18);var o2=AC.createOscillator();o2.connect(g);o2.frequency.value=1175;o2.start(AC.currentTime+.22);o2.stop(AC.currentTime+.45);}catch(e){}}
function buzz(p){try{navigator.vibrate&&navigator.vibrate(p||[150,80,150]);}catch(e){}}
/* A short happy buzz for a new best; none with reduced motion. */
function cheer(){if(!(window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches))buzz([60,40,60,40,160]);}

/* ---------------- rest timer ---------------- */
/* {end,total} live in sessionStorage, so a reload mid-rest keeps the timer. */
var rest={end:0,total:0,t:null,ask:null},RK='lift.rest';
function keepRest(){try{if(rest.end>0)sessionStorage.setItem(RK,JSON.stringify({end:rest.end,total:rest.total}));else sessionStorage.removeItem(RK);}catch(e){}}
function runRest(){
 clearInterval(rest.t);
 var el=$('#rest');el.classList.add('on');el.classList.toggle('over',rest.end<=Date.now());
 rest.t=setInterval(tickRest,250);tickRest();restPad();
}
function startRest(sec){$('#restsay').textContent='';rest.total=sec;rest.end=Date.now()+sec*1000;keepRest();runRest();}
function restoreRest(){
 var r=null;try{r=JSON.parse(sessionStorage.getItem(RK)||'null');}catch(e){}
 if(r&&r.end>Date.now()-600e3&&r.total>0&&activeSession()){rest.end=r.end;rest.total=r.total;runRest();}else{rest.end=0;keepRest();}
}
function tickRest(){
 var left=(rest.end-Date.now())/1000,el=$('#rest');
 $('.t',el).textContent=left<0?'Go +'+fmtSec(-left):fmtSec(left);
 $('.bar i',el).style.width=Math.max(0,Math.min(100,left/rest.total*100))+'%';
 // beep only when it runs out with the app on screen, not late when coming back to it
 if(left<=0&&!el.classList.contains('over')){el.classList.add('over');if(!document.hidden&&left>-2){beep();buzz();$('#restsay').textContent='Rest over. Next set.';}}
 if(left<-600)stopRest();
}
function stopRest(){clearInterval(rest.t);rest.end=0;keepRest();$('#rest').classList.remove('on');restRir();}
/* room under the content for the rest bar, so it never covers the last set row */
function restPad(){var el=$('#rest');document.documentElement.style.setProperty('--rh',(el.classList.contains('on')?el.offsetHeight+8:0)+'px');}
/* "How was it?" once per exercise, after its last set. It stays on the bar (also after the
   rest timer ends) until answered, because it is easy to forget. */
function restRir(){
 var el=$('#restrir'),bar=$('#rest'),ses=activeSession();
 if(ses&&(rest.ask==null||!ses.ex[rest.ask]||ses.ex[rest.ask].feel))for(var i=ses.ex.length-1;i>=0;i--){if(exDone(ses.ex[i])&&!ses.ex[i].feel){rest.ask=i;break;}}
 var e=ses&&rest.ask!=null&&ses.ex[rest.ask];
 if(!e||e.feel||!exDone(e)){rest.ask=null;el.hidden=true;bar.classList.remove('askonly');if(!(rest.end>0))bar.classList.remove('on');restPad();return;}
 el.hidden=false;el.innerHTML='<span><b>'+esc(nm(e.id))+'</b> done ✓ — how was it?</span>'+feelButtons(rest.ask,e);
 bar.classList.add('on');bar.classList.toggle('askonly',!(rest.end>0));restPad();
}
$('#restskip').addEventListener('click',stopRest);

/* ---------------- wake lock ---------------- */
/* Screen stays on for the whole session, on every tab. The browser drops the lock when the app is
   hidden, so it is asked for again on return. lockPending stops a second request while one is out,
   and a lock that arrives after the session ended is given straight back. */
var lock=null,lockPending=false,lockWanted=false;
function keepAwake(on){
 lockWanted=on;if(!('wakeLock' in navigator))return;
 if(on&&!lock&&!lockPending&&document.visibilityState==='visible'){lockPending=true;
  navigator.wakeLock.request('screen').then(function(l){lockPending=false;
   if(!lockWanted){l.release().catch(function(){});return;}
   lock=l;l.addEventListener('release',function(){if(lock===l)lock=null;});
  }).catch(function(){lockPending=false;});}
 if(!on&&lock){var l=lock;lock=null;l.release().catch(function(){});}
}
document.addEventListener('visibilitychange',function(){if(document.visibilityState==='visible')keepAwake(!!activeSession());});

/* ---------------- sessions ---------------- */
/* The session being trained: today's, or one started under 6 h ago (training past midnight).
   withDone: also a finished one, for "Fix a mistake". */
var ACTIVE_MS=6*3600e3;
function sessionKey(withDone){
 var today=todayISO(),now=Date.now(),best=null;
 Object.keys(state.sessions).forEach(function(k){var s=state.sessions[k];if(!s||(s.done&&!withDone))return;
  if((k===today||(s.started>now-ACTIVE_MS&&k<today))&&(!best||k>best))best=k;});
 return best;
}
function activeKey(){return sessionKey(false);}
function activeSession(){var k=activeKey();return k?state.sessions[k]:null;}
function planFor(iso){return E.plan(iso,state,todayISO());}
function addDays(iso,n){var d=E.parseISO(iso);d.setDate(d.getDate()+n);return E.isoDate(d);}
function trainedOn(iso){var s=state.sessions[iso];return !!(s&&s.done);}
/* Move a session (to '' = skip) and push the rest of the week along; old moves are tidied away.
   Returns how many later sessions were pushed. The caller saves. */
function moveSession(from,to){
 var moves=Object.assign({},state.settings.moves||{}),old=addDays(todayISO(),-21);
 Object.keys(moves).forEach(function(k){if(k<old)delete moves[k];});state.settings.moves=moves;
 var sh=E.shiftWeek(state,from,to);state.settings.moves=sh.moves;state.settings.autoMoves=sh.auto;
 return Object.keys(sh.auto).filter(function(k){return sh.auto[k]===from;}).length;
}
/* Start (or continue) today's session. short = the main lifts only, for this session. */
function startSession(short){
 trainFocus=null;var iso=activeKey()||todayISO();
 if(!state.sessions[iso]){var p=planFor(iso);
  if(!p.training){p.training=true;p.day=p.n%2===0?'A':'B';p.exercises=E.exercisesFor(p.day,state.profile);p.time=E.fmtHM(nowMin());}
  if(short)p.exercises=E.shortExercises(p.exercises);
  var s2=E.buildSession(p,state);if(short)s2.short=true;s2.started=Date.now();state.sessions[iso]=s2;save();}
 show('train');
}
function profileReady(){var p=state.profile;return p.weight&&p.height&&p.age;}

/* ---------------- rendering ---------------- */
var view='today';
function show(v){
 view=v;$$('nav.tabs button').forEach(function(b){b.classList.toggle('on',b.dataset.v===v);});
 $$('.view').forEach(function(s){s.classList.toggle('on',s.id==='v-'+v);});
 $('#title').textContent={today:'Today',train:'Train',eat:'Eat',progress:'Progress',profile:'Profile'}[v];
 keepAwake(!!activeSession());
 window.scrollTo(0,0);render();measureBars();
}
$$('nav.tabs button').forEach(function(b){b.addEventListener('click',function(){show(b.dataset.v);});});
/* Data upkeep, run at start and whenever another device's copy arrives.
   settings.schema counts the one-off migrations already applied to this data. */
var SCHEMA=1;
function migrate(){
 SYNC_SECTIONS.forEach(function(s){if(!state[s]||typeof state[s]!=='object'||Array.isArray(state[s]))state[s]={};});
 var st=state.settings,ch=E.sanitize(state);
 if((st.schema||0)<1){
  // moves made before the week was pushed along automatically: push them now
  var mv=st.moves||{},au=st.autoMoves||{},mon=E.mondayOf(todayISO());
  Object.keys(mv).sort().forEach(function(k){if(k<mon||!mv[k]||au[k])return;var sh=E.shiftWeek(state,k,mv[k]);st.moves=sh.moves;st.autoMoves=sh.auto;au=sh.auto;});
  delete st.swapFix1;st.schema=1;ch=true;
 }
 // exercises that left the program (e.g. the dip machine, Oct 2026): drop saved swaps to them and
 // put the plan exercise back in an open session that hasn't used it yet
 Object.keys(st.swaps||{}).forEach(function(k){if(!EX[st.swaps[k]]||!EX[k]){delete st.swaps[k];ch=true;}});
 var ses=activeSession();
 if(ses)ses.ex.forEach(function(e){if(!EX[e.id]&&EX[e.base]&&!e.sets.some(function(x){return x.done;})){
  e.id=e.base;e.suggest=E.suggestIn(state,ses,cfgOf(e));e.sets=E.freshSets(e.suggest);ch=true;}});
 // forgot Finish: a past session with ticked sets counts (for progression and the streak) as it was left
 var act=activeKey(),saved=[];
 Object.keys(state.sessions).sort().forEach(function(k){var s=state.sessions[k];
  if(k>=todayISO()||k===act||s.done||!s.ex.some(function(e){return e.sets.some(function(x){return x.done;});}))return;
  var last=0;s.ex.forEach(function(e){e.sets=e.sets.filter(function(x){return x.done;});e.sets.forEach(function(x){if(x.at>last)last=x.at;});});
  s.done=true;delete s.reopened;if(!s.finished)s.finished=last||s.started||null;saved.push(k);ch=true;});
 // coaching notes only matter while training: finished sessions don't carry (or sync) them
 Object.keys(state.sessions).forEach(function(k){var s=state.sessions[k];if(s.done)s.ex.forEach(function(e){if(e.suggest&&e.suggest.note!=null){delete e.suggest.note;ch=true;}});});
 if(saved.length)setTimeout(function(){toast(saved.length>1?saved.length+' unfinished sessions saved':DAYNAME[E.parseISO(saved[0]).getDay()]+'’s session saved');},300);
 if(ch)save();
}
var DAYNAME=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
/* Trained on Sunday: Monday rests and the week moves along by itself (undo keeps Monday). */
function fixSunday(){
 var st=state.settings;if(!st)return;var sh=E.sundayShift(state,todayISO());if(!sh)return;
 var r=E.shiftWeek(state,sh.from,sh.to);st.moves=r.moves;st.autoMoves=r.auto;save();
}
/* every screen draws with the per-render cache (E.withMemo) */
/* Redrawing a screen replaces its buttons; the one that had focus (keyboard, screen reader) gets it
   back, found again by its id or first data- attribute. */
function focusKey(el){
 if(!el||el===document.body||!el.closest||!el.closest('.view'))return null;
 if(el.id)return '#'+el.id;
 for(var i=0;i<el.attributes.length;i++){var at=el.attributes[i];if(/^data-/.test(at.name))return el.tagName.toLowerCase()+'['+at.name+'="'+at.value.replace(/["\\]/g,'')+'"]';}
 return null;
}
function memoView(f){return function(){
 var a=arguments,prev=document.activeElement,k=focusKey(prev),r=E.withMemo(function(){return f.apply(null,a);});
 if(k&&!document.contains(prev)){try{var n=document.querySelector(k);if(n)n.focus({preventScroll:true});}catch(e){}}
 return r;};}
renderToday=memoView(renderToday);renderTrain=memoView(renderTrain);renderEat=memoView(renderEat);renderProgress=memoView(renderProgress);renderProfile=memoView(renderProfile);
function render(){
 fixSunday();keepAwake(!!activeSession());
 if(!profileReady()&&view!=='profile'){show('profile');return;}
 ({today:renderToday,train:renderTrain,eat:renderEat,progress:renderProgress,profile:renderProfile})[view]();
}

/* ---- Today ---- */
function renderToday(){
 var iso=todayISO(),p=planFor(iso),mac=E.macrosFor(state),ses=state.sessions[iso]||activeSession();
 var h='<p class="eyebrow" style="margin-top:6px">'+niceDate(iso)+' · week '+p.week+'</p>';
 h+=noticeCard()+welcomeCard(iso,p,ses)+weighCard(iso);
 var sesCard='';
 if(p.training){
  var exs=(ses?ses.ex.map(function(e){var c=E.findCfg(e.base)||{};return {id:e.id,prio:c.prio};}):p.exercises);
  sesCard='<div class="card t-train"><div class="hero"><span class="restico'+(ses&&ses.done?' done':'')+'">'+(ses&&ses.done?ICON_CHECK:ICON_LIFT)+'</span><div class="cap"><b>'+(ses&&ses.done?'Session done':'Training · '+esc(p.time||'—'))+'</b><span>'+exs.length+' exercises · ~'+(ses&&ses.short?E.estMinutes(E.shortExercises(p.exercises))+' min · short version':E.RULES.sessionMinutes+' min')+' <small class="ab">session '+p.day+'</small></span></div></div><div class="sunline"></div>'+
   '<div class="row between" style="margin-top:8px"><span class="eyebrow">Today\'s plan</span>'+
   (p.calibration?'<span class="badge calib">finding your weights</span>':p.deload?'<span class="badge deload">easy week</span>':'<span class="badge">week '+p.week+'</span>')+'</div>'+
   '<p class="sm" style="margin:6px 0 10px">'+(p.calibration?'All new: 2 sets each to find your weights. Stop with 3 reps in the tank and log honestly. Next time the app sets the weights.':p.back==='refind'?'Long break: 2 sets each to find your weights again. Stop with 3 reps in the tank.':p.back?'First time back after a break: 10 % lighter, same sets. Normal weights next time.':p.deload?'Easy week: lighter loads, fewer sets. Afterwards you pick up where you left off.':'Full body, big lifts first. “How was it?” after each exercise sets the next weights.')+'</p>'+
   moveNote(iso,p,ses)+easyLink(p,ses)+
   (ses&&ses.done?'':'<details class="fold"><summary><span class="eyebrow">'+exs.length+' exercises</span></summary><div class="exlist" style="margin-top:6px">'+exs.map(function(c){return exRow(c.id,'',c.prio?'prio':'');}).join('')+'</div></details>')+
   (ses&&ses.done?'<p class="sm" style="margin-top:10px">'+sessionSummary(ses)+'</p>'+FIXLINK:'<button class="btn wide" data-act="start" style="margin-top:14px">'+(ses?'Continue session':'Start session')+'</button>')+
   '</div>';
 }else{
  sesCard='<div class="card t-train"><div class="hero"><span class="restico">'+ICON_MOON+'</span><div class="cap"><b>Rest day</b><span>Muscle grows today</span></div></div><div class="sunline"></div><p class="sm" style="margin-top:10px">Muscle is built between sessions. Walk 8–10k steps, sleep 7–9 h, hit the protein. Nothing heroic.</p>'+restNote(iso,p)+nextSessionLine(iso)+
   (ses&&ses.done?'<p class="sm" style="margin-top:10px">'+sessionSummary(ses)+'</p>':ses?'<button class="btn wide" data-act="start" style="margin-top:14px">Continue session</button>':/data-move=/.test(restNote(iso,p))?'':ANYWAY)+'</div>';
 }
 // what comes first: the session when it is close (or running), otherwise the next food
 var soon=p.training&&!(ses&&ses.done)&&(ses||nowMin()>=E.hm(p.time||'16:00')-90);
 h+=soon?sesCard+foodCard(iso,p,mac):foodCard(iso,p,mac)+sesCard;
 h+=weekCard(mac)+trackCard(iso)+dailyCard(iso,mac)+installCard('today');
 $('#v-today').innerHTML=h;
}
function foodCard(iso,p,mac){
 if(!mac)return '';
 var sl=E.timeline(state.profile,p,mac).filter(function(s){return s.key!=='train';}),ml=(state.daily[iso]||{}).meals||{},nd=sl.filter(function(s){return ml[s.key];}).length;
 var tail='';if(nd===sl.length||!sl.some(function(s){return !ml[s.key]&&s.t+45>=nowMin();})){var ti=addDays(iso,1),first=E.timeline(state.profile,planFor(ti),mac).filter(function(s){return s.key!=='train';})[0];
  if(first)tail='<p class="xs" style="margin-top:8px">Tomorrow first: <b>'+first.time+' · '+esc(first.what||first.label)+'</b></p>';}
 return '<div class="card eatnext t-food"><div class="row between"><h2>Eating today</h2><span class="chip'+(nd===sl.length?' acc':'')+'">'+nd+' of '+sl.length+' done</span></div>'+proteinSoFar(iso,mac)+'<p class="xs" style="margin:2px 0 4px">Tap a row when you have had it.</p>'+timelineHTML(iso,p,mac,true,true)+tail+yesterdayHTML(iso,mac)+'</div>';
}
/* "Protein so far: 120 of 200 g" from the rows ticked today, with a small bar. */
function proteinSoFar(iso,mac){
 if(!mac)return '';var got=E.proteinDone(E.timeline(state.profile,planFor(iso),mac),((state.daily[iso]||{}).meals));
 return '<div class="psofar"><p class="sm">Protein so far: <b class="mono">'+got+'</b> of '+mac.protein+' g</p><span class="pbar"><i style="width:'+Math.min(100,Math.round(got/mac.protein*100))+'%"></i></span></div>';
}
/* Forgot to tick something? Yesterday's list stays open for ticking all of today. */
var keepY=false;
function yesterdayHTML(iso,mac){
 var y=addDays(iso,-1),yp=planFor(y),sl=E.timeline(state.profile,yp,mac).filter(function(s){return s.key!=='train';}),ml=(state.daily[y]||{}).meals||{},nd=sl.filter(function(s){return ml[s.key];}).length;
 if(nd===sl.length||!Object.keys(state.daily).some(function(k){return k<=y;}))return '';
 var open=keepY;keepY=false;
 return '<details class="fold yday"'+(open?' open':'')+'><summary><span class="xs">Yesterday: '+nd+' of '+sl.length+' ticked. Forgot one?</span></summary>'+timelineHTML(y,yp,mac,true,true)+'</details>';
}
/* Follow the clock: redraw Today every minute and whenever the app comes back to the front
   (a phone app is often left open for hours or overnight). Skipped while typing or with a fold open. */
var lastDay=todayISO();
function clockTick(force){
 if(document.hidden)return;
 var dayChanged=todayISO()!==lastDay;lastDay=todayISO();
 if(view==='today'){var v=$('#v-today'),busy=v&&(v.contains(document.activeElement)&&document.activeElement.tagName==='INPUT'||v.querySelector('details[open]'));if(busy&&!force&&!dayChanged)return;var y=scrollY;renderToday();if(!dayChanged)scrollTo(0,y);}
 else if(dayChanged&&view!=='train')render();
}
setInterval(clockTick,60000);
document.addEventListener('visibilitychange',function(){if(!document.hidden)clockTick(true);});
/* Week view: 7 days at a glance (training days), tap a day for its plan. Up to 4 weeks ahead. */
var wkv={off:0,sel:null};
function dayPlan(iso){
 var today=todayISO(),p=planFor(iso),ses=state.sessions[iso];
 if(iso>today&&p.training){   // which session (A/B) it will be: count scheduled sessions from today
  var k=0,d=E.parseISO(today);var t=state.sessions[today];
  for(;E.isoDate(d)<iso;d.setDate(d.getDate()+1)){var pi=planFor(E.isoDate(d));if(pi.training&&!(E.isoDate(d)===today&&t&&t.done))k++;}
  p=Object.assign({},p,{day:(p.n+k)%2===0?'A':'B'});
 }
 return {p:p,done:!!(ses&&ses.done)};
}
function weekCard(mac){
 if(!mac)return '';
 var today=todayISO(),m=addDays(E.mondayOf(today),wkv.off*7);
 var days=[];for(var i=0;i<7;i++)days.push(addDays(m,i));
 var sel=wkv.sel&&days.indexOf(wkv.sel)>=0?wkv.sel:null;
 var DN=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
 var strip=days.map(function(di){var dp=dayPlan(di),d=E.parseISO(di);
  return '<button class="wkday'+(di===sel?' on':'')+(di<today?' past':'')+(di===today?' today':'')+'" data-wkday="'+di+'" aria-pressed="'+(di===sel)+'" aria-label="'+niceDate(di)+(dp.p.training?(dp.done?', trained':di<today?', not trained':', training'):', rest day')+'"><span class="dn">'+DN[d.getDay()]+'</span><b>'+d.getDate()+'</b>'+
   '<span class="tags">'+(dp.p.training&&(dp.done||di>=today)?'<i class="tg train" title="training">'+(dp.done?'✓':dp.p.day)+'</i>':dp.p.training?'<i class="tg miss" title="not trained"></i>':'<i class="tg rest" title="rest day">'+ICON_MOON+'</i>')+'</span></button>';}).join('');
 var missed=days.some(function(di){var dp=dayPlan(di);return di<today&&dp.p.training&&!dp.done;});
 var ws=niceDate(days[0])+' – '+niceDate(days[6]),detail='<p class="xs" style="margin-top:10px">Tap a day to see its plan.</p>';
 if(sel&&sel!==today){var dp=dayPlan(sel),slots=E.timeline(state.profile,dp.p,mac).filter(function(s){return s.key!=='cr';});
 var head=dp.p.training?(dp.done?'Session done ✓':'Training at '+esc(dp.p.time))+' <small class="ab">session '+dp.p.day+'</small>':'Rest day';
 detail='<div class="wkdetail"><p class="eyebrow">'+niceDate(sel)+(sel===today?' · today':'')+'</p><h3 style="margin-top:4px">'+head+'</h3>'+
  '<ul class="wklist">'+slots.map(function(s){return '<li><span class="mono">'+s.time+'</span><span>'+esc(s.what||s.label)+'</span></li>';}).join('')+'</ul></div>';}
 return '<div class="card weekcard"><div class="row between"><h2>Week ahead</h2><div class="row" style="gap:4px"><button class="wknav" data-wknav="-1"'+(wkv.off<=0?' disabled':'')+' aria-label="Previous week">‹</button><span class="xs mono">'+(wkv.off===0?'this week':wkv.off===1?'next week':'in '+wkv.off+' weeks')+'</span><button class="wknav" data-wknav="1"'+(wkv.off>=3?' disabled':'')+' aria-label="Next week">›</button></div></div>'+
  '<p class="xs" style="margin:2px 0 8px">'+ws+' · <i class="tg train">A</i> training'+(missed?' · <i class="tg miss"></i> not trained':'')+'</p>'+
  '<div class="wkstrip">'+strip+'</div>'+detail+'</div>';
}
/* Life moves a day: rest after yesterday's session, move to tomorrow, or catch up a missed one. */
function moveNote(iso,p,ses){
 var h=p.movedFrom?'<p class="xs" style="margin-top:4px">Moved here from '+niceDate(p.movedFrom)+' · <button class="linkbtn" data-unmove="'+esc(p.movedFrom)+'">undo</button></p>':'';
 if(ses)return h;
 var t=addDays(iso,1),free=!planFor(t).training,dn=DOW[E.parseISO(t).getDay()];
 var go=free?'<button class="btn small" data-move="'+iso+'|'+t+'">Rest today, train '+dn+'</button>':'<button class="btn small" data-move="'+iso+'|">Rest today</button>';
 if(E.parseISO(iso).getDay()===1&&trainedOn(addDays(iso,-1)))return h+'<p class="xs" style="margin-top:6px">New week — back to your normal days. (Trained yesterday? Fine: today’s session still counts.)</p>';
 if(trainedOn(addDays(iso,-1)))return h+'<div class="movebox"><b>You trained yesterday.</b> Muscles grow in the ~48 h between full-body sessions, so two days in a row gives less. '+(free?'Rest today and train tomorrow instead?':'Tomorrow is already a training day, so skip today — the order simply continues.')+'<div class="row" style="margin-top:8px;gap:8px">'+go+'</div></div>';
 return h+'<p class="xs" style="margin-top:6px">Can\'t make it today? <button class="linkbtn" data-move="'+iso+'|'+(free?t:'')+'">'+(free?'Move to '+dn:'Skip today')+'</button></p>';
}
function restNote(iso,p){
 if(p.movedAway!=null)return '<p class="xs" style="margin-top:8px">'+(trainedOn(addDays(iso,-1))?'You trained yesterday, so t':'T')+(p.movedAway?'Today\'s session moved to '+niceDate(p.movedAway):'Today\'s session skipped')+' · <button class="linkbtn" data-unmove="'+iso+'">undo</button></p>';
 var y=addDays(iso,-1),yp=planFor(y);
 if(yp.training&&!trainedOn(y)&&!state.sessions[iso]&&!E.missedSessions(state,iso))return '<div class="movebox"><b>Missed yesterday\'s session?</b> Do it today instead — the plan shifts with you.<div class="row" style="margin-top:8px"><button class="btn small" data-move="'+y+'|'+iso+'">Train today</button></div></div>';
 return '';
}
/* Welcome back after a miss: calm, no streak lost, and a way back in today. The best-working nudge
   in a 61 000-member gym study rewarded coming back after a missed workout (Milkman 2021); one
   missed day doesn't undo a habit (Lally 2010). The short version is the main lifts only, opt-in. */
var DAYNAME=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
function welcomeCard(iso,p,ses){
 if(ses)return '';var mi=E.missedSessions(state,iso);if(!mi)return '';
 var hid=null;try{hid=localStorage.getItem('lift.wbhide');}catch(e){}if(hid===iso)return '';
 var y=addDays(iso,-1),from=!p.training&&mi.dates[mi.dates.length-1]===y?y:'';   // yesterday's session moves to today, the week moves along
 var exs=p.training?p.exercises:E.exercisesFor(p.n%2===0?'A':'B',state.profile),wks=Math.round(mi.gap/7),n=mi.dates.length,head,txt;
 if(mi.back){head='Welcome back';txt=wks+' weeks away. '+(mi.back==='refind'?'Today: 2 sets each to find your weights again. They come back fast.':'Strength mostly stays for about 3 weeks, so today is 10 % lighter with the same sets. Normal weights next time.');}
 else{head=n===1?'Missed '+DAYNAME[E.parseISO(mi.dates[0]).getDay()]:'Missed '+n+' sessions';txt=(n===1?'One miss changes nothing.':'A few misses change nothing.')+' Coming back is what counts.';}
 return '<div class="card welcome" role="status"><h2>'+head+'</h2><p class="sm" style="margin-top:4px">'+txt+'</p>'+
  '<div class="row" style="gap:8px;margin-top:10px;flex-wrap:wrap"><button class="btn small" data-act="welcome" data-from="'+from+'">Train today</button><button class="btn small ghost" data-act="welcome" data-short="1" data-from="'+from+'">Short version (~'+E.estMinutes(E.shortExercises(exs))+' min)</button></div>'+
  '<p class="xs" style="margin-top:8px">Short: the main lifts with all their sets; the extras wait until next time. <button class="linkbtn" data-act="wbhide">Not today</button></p></div>';
}
function nextSessionLine(iso){
 var d=E.parseISO(iso);for(var i=1;i<=7;i++){d.setDate(d.getDate()+1);var n=E.isoDate(d),pp=planFor(n);if(pp.training)return '<p class="xs" style="margin-top:8px">Next session: '+niceDate(n)+' '+esc(pp.time)+'</p>';}
 return '';
}
/* An easy week (lighter, fewer sets) when you ask for one; undo while today's session is untouched. */
function easyLink(p,ses){
 if(p.calibration||(ses&&(ses.done||ses.ex.some(function(e){return e.sets.some(function(x){return x.done;});}))))return '';
 return '<p class="xs" style="margin:-4px 0 8px">'+(p.deload?'Easy week. <button class="linkbtn" data-act="easyoff">Back to normal weights</button>':'Feeling run down? <button class="linkbtn" data-act="easy">Take an easy week</button>')+'</p>';
}
var ANYWAY='<p class="xs" style="margin-top:10px">Want to train anyway? <button class="linkbtn" data-act="start">Start a session</button></p>';
var FIXLINK='<p class="xs" style="margin-top:6px">Wrong number or a forgotten set? <button class="linkbtn" data-act="reopen">Fix a mistake</button></p>';
/* In-app sheet (instead of confirm()): slides up from the bottom; tap outside to close. */
function openSheet(html){closeSheet();var w=document.createElement('div');w.className='sheetwrap';w.innerHTML='<div class="sheet" role="dialog" aria-modal="true">'+html+'</div>';
 w.addEventListener('click',function(ev){if(ev.target===w)closeSheet();});document.body.appendChild(w);var f=w.querySelector('button');if(f)f.focus();}
function closeSheet(){var w=$('.sheetwrap');if(w)w.remove();}
/* Finish screen: what you did, new bests with the step up, weeks on track, the next session. */
function finishBody(s,k){
 var sets=0,vol=0;s.ex.forEach(function(e){e.sets.forEach(function(x){if(x.done){sets++;vol+=E.liftedKg(e.id,x.kg)*(x.reps||0);}});});
 var mins=s.started&&s.finished?Math.round((s.finished-s.started)/60000):null;
 var bests=[];s.ex.forEach(function(e){var b=e.sets.filter(function(x){return x.pr&&x.done;})[0];if(!b)return;
  var up=E.bestUp(E.history(state,e.id).filter(function(hh){return hh.date<k;}),e.id,b.kg,b.reps)||'new best';
  bests.push('<li class="best">'+thumb(e.id)+'<span><b>'+esc(nm(e.id))+'</b><br><span class="mono">'+esc(E.setText(e.id,b.kg,b.reps))+'</span></span><span class="chip ok">'+up+'</span></li>');});
 var t=E.weeksOnTrack(state,k);
 return '<div class="grid3" style="margin-top:12px"><div class="stat"><div class="v">'+sets+'</div><div class="l">sets</div></div><div class="stat"><div class="v">'+(mins||'–')+'</div><div class="l">minutes</div></div><div class="stat"><div class="v">'+E.fmtNum(vol,0)+'</div><div class="l">kg moved</div></div></div>'+
  (bests.length?'<p class="eyebrow" style="margin-top:14px">★ New best'+(bests.length>1?'s':'')+'</p><ul class="bests">'+bests.join('')+'</ul>':'')+
  '<p class="eyebrow" style="margin-top:14px">'+trackHead(t)+'</p>'+trackDots(t)+'<p class="xs" style="margin-top:6px">'+trackLine(t)+'</p>'+nextSessionLine(k);
}
/* Weeks on track: a week with 2+ sessions. The headline is the run of weeks; the rolling count
   ("11 of the last 12") never drops to 0 after one bad week. This week stays open until it has 2. */
function trackHead(t){return t.streak?t.streak+(t.streak===1?' week':' weeks')+' on track':'Weeks on track';}
function trackLine(t){
 var a=t.total?t.on+' of '+(t.total>=12?'the last 12 weeks':t.total+(t.total===1?' week':' weeks')+' so far'):'';
 return [a,t.thisWeek>=2?'this week done ✓':'this week '+t.thisWeek+' of 2'].filter(Boolean).join(' · ');
}
function trackDots(t){
 return '<div class="wdots" role="img" aria-label="'+esc(trackHead(t)+'. '+trackLine(t))+'">'+t.weeks.map(function(w){
  return '<i class="wdot'+(w.on?' on':w.open?' open':'')+'" title="'+niceDate(w.mon)+': '+w.count+(w.count===1?' session':' sessions')+'"></i>';}).join('')+'</div>';
}
function trackCard(iso){
 var t=E.weeksOnTrack(state,iso);if(!t.weeks.length)return '';
 return '<div class="card ontrack"><div class="row between"><h2>'+trackHead(t)+'</h2><span class="xs">2+ sessions a week</span></div>'+trackDots(t)+'<p class="xs" style="margin-top:6px">'+trackLine(t)+'</p></div>';
}
function sessionSummary(s){
 var sets=0,vol=0,up=0,pr=0;s.ex.forEach(function(e){e.sets.forEach(function(x){if(x.done){sets++;vol+=E.liftedKg(e.id,x.kg)*(x.reps||0);}if(x.pr)pr++;});if(e.suggest&&e.suggest.state==='up')up++;});
 var mins=s.started&&s.finished?Math.round((s.finished-s.started)/60000):null;
 return sets+(sets===1?' set · ':' sets · ')+E.fmtNum(vol,0)+' kg moved'+(mins?' · '+mins+' min':'')+(up?' · '+up+' exercises went up':'')+(pr?' · ★ '+pr+' new best'+(pr>1?'s':''):'');
}
/* Morning weigh-in (and the weekly waist) first thing on Today, until it is filled in. */
function waistDue(iso){var ks=Object.keys(state.daily).filter(function(k){return state.daily[k]&&state.daily[k].waist>0&&k<iso;}).sort(),l=ks[ks.length-1];return !(state.daily[iso]||{}).waist&&(!l||l<=addDays(iso,-7));}
/* Saved with the Save button (or Enter) only; leaving the field empty never removes anything.
   Once saved it folds to one line, so the screen doesn't jump. */
var weighEdit=false;
function weighCard(iso){
 var w=state.weight[iso],due=waistDue(iso),skip=false;try{skip=localStorage.getItem('lift.wskip')===iso;}catch(e){}
 if(w&&(!due||skip)&&!weighEdit)return '<div class="card weigh done"><div class="row between"><span><b class="mono">'+esc(w)+' kg</b> <span style="color:var(--ok)">✓</span></span><button class="linkbtn xs" data-act="wedit">edit</button></div></div>';
 if(skip&&!weighEdit)return '';
 var askW=!w||weighEdit,morning=new Date().getHours()<12;
 return '<form class="card weigh" data-weigh="1"><div class="row between"><h2>'+(askW?(morning?'Good morning — weigh in':'Weigh in'):'Waist this week')+'</h2>'+(weighEdit?'':'<button type="button" class="linkbtn xs" data-act="wskip">not today</button>')+'</div>'+
  '<div class="grid2" style="margin-top:10px">'+(askW?'<label class="field" style="margin:0"><span class="l">Weight kg</span><input type="text" inputmode="decimal" autocomplete="off" name="kg" value="'+esc(w||'')+'" placeholder="'+esc(state.profile.weight||'')+'"></label>':'')+
  (due?'<label class="field" style="margin:0"><span class="l">Waist cm (weekly)</span><input type="text" inputmode="decimal" autocomplete="off" name="waist" placeholder="e.g. 108"></label>':'')+'</div>'+
  '<button class="btn wide" type="submit" style="margin-top:10px">Save</button>'+
  '<p class="xs" style="margin-top:8px">'+(askW?'After the toilet, before breakfast. ':'')+(due?'Waist: tape at the belly button, relaxed, once a week. ':'')+'Single days mean nothing; the 7-day trend decides.</p></form>';
}
/* 40–250 kg; far from the recent trend (> 8 %) asks first. Returns true when saved. */
function saveWeight(iso,kg){
 if(!(kg>=40&&kg<=250)){toast('Weight between 40 and 250 kg');return false;}
 var t=E.weightTrend(state).filter(function(x){return x.date<iso;}),ref=t.length?t[t.length-1].avg:null;
 if(ref&&Math.abs(kg-ref)/ref>0.08&&!confirm(kg+' kg is far from your usual ~'+ref.toFixed(1)+' kg. Save it anyway?'))return false;
 state.weight[iso]=kg;return true;   // profile.weight stays the start weight; targets follow the trend (E.macrosFor)
}
function saveWaist(iso,cm){
 if(!(cm>=50&&cm<=200)){toast('Waist between 50 and 200 cm');return false;}
 state.daily[iso]=state.daily[iso]||{};state.daily[iso].waist=cm;return true;
}
document.addEventListener('submit',function(ev){var f=ev.target;if(!f.dataset||!f.dataset.weigh)return;ev.preventDefault();
 var iso=todayISO(),kgIn=f.elements.kg,wIn=f.elements.waist,kg=kgIn&&num(kgIn.value),cm=wIn&&num(wIn.value);
 if(kg==null&&cm==null){toast(kgIn?'Type your weight first':'Type your waist first');return;}
 if(kg!=null&&!saveWeight(iso,kg))return;
 if(cm!=null&&!saveWaist(iso,cm))return;
 weighEdit=false;save();if(document.activeElement)document.activeElement.blur();renderToday();toast('Saved ✓');});
/* Change password: the data moves to the new password's document; other devices then ask for it */
document.addEventListener('submit',function(ev){var f=ev.target;if(f.id!=='pwform')return;ev.preventDefault();
 var msg=$('#pwmsg'),btn=f.querySelector('button'),cur=f.elements.cur.value,nw=f.elements.nw.value;
 if(!SYNC2.norm(nw)){msg.textContent='Type the new password.';return;}
 if(SYNC2.norm(nw)!==SYNC2.norm(f.elements.nw2.value)){msg.textContent='The new passwords don’t match.';return;}
 if(!SYNC.eng){msg.textContent='Sync is not on.';return;}
 btn.disabled=true;btn.textContent='Changing…';msg.textContent='';
 SYNC.eng.changePassword(cur,nw).then(function(){f.reset();f.hidden=true;toast('Password changed');renderProfile();},function(e){
  msg.textContent=e&&e.code==='wrong'?'Wrong password.':e&&e.code==='seal'?'This password isn’t set up yet: run seal-config --add, publish, then try again.':'Not changed (offline?). Try again.';})
 .then(function(){btn.disabled=false;btn.textContent='Change password';});});
function dailyCard(iso,mac){
 var d=state.daily[iso]||{},w=state.weight[iso];
 return '<details class="card fold"><summary><h2>Check-in</h2><span class="xs">'+(w?w+' kg':'')+(d.sleep?' · '+d.sleep+' h sleep':'')+(d.steps?' · '+d.steps+' steps':'')+'</span></summary><div class="grid2" style="margin-top:10px">'+
  '<label class="field" style="margin:0"><span class="l">Weight kg</span><input type="text" inputmode="decimal" autocomplete="off" data-daily="weight" value="'+esc(w||'')+'" placeholder="'+esc(state.profile.weight||'')+'"></label>'+
  '<label class="field" style="margin:0"><span class="l">Waist cm</span><input type="text" inputmode="decimal" autocomplete="off" data-daily="waist" value="'+esc(d.waist||'')+'" placeholder="weekly"></label>'+
  '<label class="field" style="margin:0"><span class="l">Sleep h</span><input type="text" inputmode="decimal" autocomplete="off" data-daily="sleep" value="'+esc(d.sleep||'')+'" placeholder="7.5"></label>'+
  '<label class="field" style="margin:0"><span class="l">Steps</span><input type="number" inputmode="numeric" step="500" data-daily="steps" value="'+esc(d.steps||'')+'" placeholder="8000"></label></div>'+
  '</div><p class="xs" style="margin-top:8px">Sleep and steps are optional — they help explain a bad week.</p></details>';
}
/* The one thing to eat next, big, with a Done button. */
function plateRule(s){return (s.key==='m1'||s.key==='m2')&&s.protein?plateHTML(s.protein,true):'';}
/* Your own plate, measured with your hand: nothing to weigh or cook to a recipe. */
function plateHTML(P,small){
 return '<div class="plate'+(small?' small':'')+'">'+E.handPlate(P).map(function(x){return '<div class="pl pl-'+x.k+'"><span class="hand">'+HAND[x.k]+'</span><div><b>'+esc(x.amount)+'</b> '+esc(x.what)+(small?'':'<div class="xs">'+esc(x.eg)+'</div>')+'</div></div>';}).join('')+'</div>';
}
function timelineHTML(iso,p,mac,live,simple){
 var slots=E.timeline(state.profile,p,mac),now=nowMin(),d=state.daily[iso]||{},meals=d.meals||{},nextDone=false;
 var isToday=iso===todayISO();
 return '<ul class="tl" data-day="'+esc(iso)+'">'+slots.map(function(s){
  var done=!!meals[s.key],past=isToday&&s.t+45<now,next=isToday&&!nextDone&&!done&&!past;if(next)nextDone=true;
  var cd=next?(s.t>now?'in '+fmtDur(s.t-now):'now'):'';
  // a row you can tick is one <label>: tapping anywhere on it ticks the box, and a screen reader reads the row
  var box=live&&s.key!=='train'&&!(simple&&next),cls=' class="'+(s.key==='train'?'train ':'')+(done?'done ':past?'past ':'')+(next?'next':'')+'"';
  function row(inner){return '<li'+cls+'>'+(box?'<label class="tlrow">'+inner+'<input type="checkbox" data-meal="'+s.key+'"'+(done?' checked':'')+'></label>':inner+(simple&&next?'':'<span></span>'))+'</li>';}
  if(simple)return row('<span class="t">'+s.time+'</span><div><div class="l">'+esc(s.what||s.label)+(cd?' <span class="cd">'+cd+'</span>':'')+'</div>'+
   (next&&s.detail?'<div class="foods">'+esc(s.detail)+'</div>':'')+(next?plateRule(s):'')+(next&&s.protein?'<div class="macro">~'+s.protein+' g protein</div>':'')+
   (next&&live?'<button class="btn small" data-mealdone="'+s.key+'" style="margin-top:8px">Done ✓</button>':'')+'</div>');
  return row('<span class="t">'+s.time+'</span><div><div class="l">'+esc(s.label)+(cd?' <span class="cd">'+cd+'</span>':'')+'</div><div class="why">'+esc(s.why)+'</div>'+
   (s.foods?'<div class="foods">'+esc(s.foods[(hashDay(iso)+slots.indexOf(s))%s.foods.length])+'</div>':'')+
   (s.protein?'<div class="macro">~'+s.protein+' g protein</div>':'')+'</div>');
 }).join('')+'</ul>';
}
function fmtDur(m){return m>=60?Math.floor(m/60)+' h '+(m%60?(m%60)+' min':''):m+' min';}
function hashDay(iso){return iso.split('-').reduce(function(a,b){return a+ +b;},0);}

/* ---- Train ---- */
function renderTrain(){
 var iso=todayISO(),ses=activeSession(),p=planFor(iso);
 var h='';
 if(!ses){
  var dk=sessionKey(true),ds=dk&&state.sessions[dk],done=!!(ds&&ds.done);
  h='<div class="card" style="margin-top:14px"><h2>'+(done?'Session done ✓':p.training?'Training today':'Rest day')+(done||p.training?' <small class="ab">session '+(done?ds.day:p.day)+'</small>':'')+'</h2>'+
   '<p class="sm" style="margin-top:6px">'+(done?'':p.training?'Warm-up, then '+p.exercises.length+' exercises. Phone stays awake while you train.':'No session planned. You can still train if life moved a day — it becomes the next session in the rotation.')+'</p>'+
   (done?finishBody(ds,dk)+FIXLINK:p.training?'<button class="btn wide" data-act="start" style="margin-top:14px">Start session</button>':ANYWAY)+'</div>'+programCard();
  $('#v-train').innerHTML=h;return;
 }
 h+=trackBar(ses)+noticeCard()+(ses.short?'<p class="xs" style="margin:10px 2px 0">Short version: the main lifts only. The extras are back next time.</p>':'')+(ses.reopened?'<div class="card notice"><p class="sm"><b>Fixing a mistake.</b> Change what was wrong, then tap Finish session again.</p></div>':'');
 /* warm-up */
 var wl=E.WARMUP,firstRamp=null;
 for(var i=0;i<ses.ex.length;i++){var c=E.findCfg(ses.ex[i].base);if(c&&c.ramp&&ses.ex[i].sets[0]&&ses.ex[i].sets[0].kg){firstRamp=ses.ex[i];break;}}
 var wdone=ses.warm||{},anySet=ses.ex.some(function(e){return e.sets.some(function(x){return x.done;});});
 h+='<details class="card fold" id="warmup"'+(anySet||ses.warmShut?'':' open')+'><summary><h2>Warm-up</h2><span class="xs">about '+E.RULES.warmupMinutes+' min</span></summary>'+
  '<p class="xs" style="margin-top:2px">Tap a move to see how it\'s done. Tick the box when you\'ve done it.</p>'+
  warmItem('gen',wl.general,wl.general.amount,wdone)+
  wl[ses.day].map(function(w){return warmItem(w.id,w,w.reps,wdone);}).join('')+
  (firstRamp?'<p class="ramp" style="margin-top:8px">Warm-up sets on '+esc(nm(firstRamp.id))+': '+E.rampSets(firstRamp.sets[0].kg,firstRamp.id).map(function(r){return '<b>'+r.kg+'</b>×'+r.reps;}).join(' → ')+(E.pair(firstRamp.id)?' (kg each hand)':'')+' — then working sets.</p>':'<p class="xs" style="margin-top:8px">First exercise: do 1–2 light feeler sets before the working weight. No static stretching.</p>')+
  '</details>';
 /* one exercise at a time; the others are a tap away */
 var f=focusOf(ses),others=ses.ex.map(function(e,i){return i;}).filter(function(i){return i!==f&&!exDone(ses.ex[i]);});
 openCards={};openCards[f]=true;
 h+=exerciseCard(ses.ex[f],f,ses);
 var pv=stepUndone(ses,f,-1),nx=stepUndone(ses,f,1);
 h+='<div class="row between exnav"><button class="btn small ghost" data-jump="'+pv+'"'+(pv>=0?'':' disabled')+'>‹ Back</button>'+
  (others.length?'<button class="btn small ghost" data-pickother="1">⇆ Busy? Pick another</button>':'')+
  '<button class="btn small ghost" data-jump="'+nx+'"'+(nx>=0?'':' disabled')+'>Next ›</button></div>'+
  (nx>=0&&!swipeKnown()?'<p class="xs hint">Tip: swipe the card left or right to change exercise. <button class="linkbtn" data-act="hintoff">Got it</button></p>':'')+
  (others.length?'<div class="card" id="others" hidden><h2>What is free?</h2><p class="xs" style="margin:2px 0 8px">Order barely matters for growth — do whichever machine is free.</p><div class="swaps">'+others.map(function(i){var a=ses.ex[i].id;
   return '<button class="tile" data-jump="'+i+'"><img src="'+thumbSrc(a)+'" alt="" loading="lazy" decoding="async"><span>'+esc(nm(a))+'</span><small>'+esc(equipWord(a))+(ses.ex[i].sets.some(function(x){return x.done;})?' · started':'')+'</small></button>';}).join('')+'</div></div>':'');
 h+='<div class="card"><button class="btn wide" data-act="finish">Finish session</button>'+(ses.reopened?'':'<button class="btn wide ghost" data-act="abandon" style="margin-top:8px">Discard session</button>')+'</div>';
 $('#v-train').innerHTML=h;
 measureBars();restRir();
 clearInterval(renderTrain._t);renderTrain._t=setInterval(function(){var el=$('#elapsed');if(el&&activeSession())el.textContent=fmtSec((Date.now()-ses.started)/1000);else clearInterval(renderTrain._t);},1000);
}
(function(){var x0=null,y0=null;
 document.addEventListener('touchstart',function(e){var c=e.target.closest('#v-train .card.ex');if(!c||e.target.closest('input,button,.strip,summary'))return;x0=e.touches[0].clientX;y0=e.touches[0].clientY;},{passive:true});
 document.addEventListener('touchend',function(e){if(x0==null)return;var dx=e.changedTouches[0].clientX-x0,dy=e.changedTouches[0].clientY-y0;x0=null;var ses=activeSession();
  if(!ses||Math.abs(dx)<70||Math.abs(dy)>Math.abs(dx))return;var f=stepUndone(ses,focusOf(ses),dx<0?1:-1);if(f>=0){swipeKnown(true);goEx(ses,f);}},{passive:true});})();
/* One-time hint that swiping changes exercise; gone after the first swipe or "Got it". */
function swipeKnown(set){try{if(set)localStorage.setItem('lift.swipe','1');return localStorage.getItem('lift.swipe')==='1';}catch(e){return true;}}
/* Warm-up move: tick box + tap-to-open picture and plain steps. */
var openWarm={};
function warmItem(key,w,amount,wdone){
 var ex=EX[w.id],open=!!openWarm[key],pics=w.photo?[w.photo]:ex?ex.images:null;
 return '<div class="wuwrap" id="wu-'+key+'"><div class="wu'+(open?' open':'')+'"><label class="wubox"><input type="checkbox" data-warm="'+key+'"'+(wdone[key]?' checked':'')+' aria-label="'+esc(w.label)+' done"></label>'+
  '<button class="wuhead" data-wuopen="'+key+'">'+(w.photo?'<img class="th" src="'+w.photo+'" alt="" loading="lazy" decoding="async">':thumb(w.id))+'<span class="wut"><b>'+esc(w.label)+'</b><span class="xs">'+esc(amount)+(open?'':' · how?')+'</span></span><i class="chev"></i></button></div>'+
  (open&&pics?'<div class="wuhow"><div class="wumedia">'+(pics.length>1?'<img src="'+pics[0]+'" alt="" decoding="async"><img class="f1" src="'+pics[1]+'" alt="">':'<img class="still" src="'+pics[0]+'" alt="">')+'</div>'+
   '<ol>'+(w.how||[]).map(function(t){return '<li>'+esc(t)+'</li>';}).join('')+'</ol>'+(w.note?'<p class="xs" style="margin-top:4px">'+esc(w.note)+'</p>':'')+'</div>':'')+'</div>';
}
/* Sticky session progress: picture per exercise, tap to jump. */
var SMOOTH=!(window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches)?'smooth':'auto';
var trainFocus=null;
function focusOf(ses){if(trainFocus==null||trainFocus<0||trainFocus>=ses.ex.length){var n=nextUndone(ses,0);trainFocus=n<0?ses.ex.length-1:n;}return trainFocus;}
function nextUndone(ses,from){for(var k=0;k<ses.ex.length;k++){var i=(from+k)%ses.ex.length;if(!exDone(ses.ex[i]))return i;}return -1;}
/* Next/Back (and swipe) step through unfinished exercises only, wrapping round; -1 if none. Done ones: tap their picture up top. */
function stepUndone(ses,f,dir){var n=ses.ex.length;for(var k=1;k<n;k++){var i=((f+dir*k)%n+n)%n;if(!exDone(ses.ex[i]))return i;}return -1;}
/* Show exercise ei with its first set that isn't done in view (below the sticky bars). */
function goEx(ses,ei){ses.warmShut=true;trainFocus=ei;renderTrain();var c=$('#ex-'+ei),r=c&&(c.querySelector('.setrow:not(.done)')||c.querySelector('.feel')||c);
 if(!c)return;c.scrollIntoView({block:'start'});if(r!==c&&r.getBoundingClientRect().bottom>innerHeight-150)r.scrollIntoView({block:'center'});}
function exDone(e){return e.sets.length>0&&e.sets.every(function(s){return s.done;});}
function trackBar(ses){
 var n=ses.ex.filter(exDone).length,cur=focusOf(ses);   /* highlight the exercise on screen */
 return '<div class="trackbar" id="trackbar"><div class="row between"><span class="eyebrow">'+(ses.calibration?'Finding your weights':ses.deload?'Easy week':'Week '+ses.week)+' · '+ses.day+'</span><span class="xs mono"><b>'+n+'</b>/'+ses.ex.length+' done · <span id="elapsed">'+fmtSec((Date.now()-ses.started)/1000)+'</span></span></div>'+
  '<div class="track"><i style="width:'+Math.round(n/ses.ex.length*100)+'%"></i></div>'+
  '<div class="dots">'+ses.ex.map(function(e,ei){return '<button class="dot'+(exDone(e)?' done':e.sets.some(function(s){return s.done;})?' part':'')+(ei===cur?' cur':'')+'" data-jump="'+ei+'" aria-label="'+esc(nm(e.id))+'">'+thumb(e.id)+'</button>';}).join('')+'</div></div>';
}
function updateTrack(){var ses=activeSession(),el=$('#trackbar');if(ses&&el){el.outerHTML=trackBar(ses);}}
function measureBars(){
 var hh=$('header.top'),tb=$('#trackbar'),st=document.documentElement.style;
 if(hh)st.setProperty('--hh',hh.offsetHeight+'px');if(tb)st.setProperty('--th',tb.offsetHeight+'px');
}
addEventListener('resize',measureBars);
var openCards={};   /* finished exercises the user re-opened */
var justDone=null;  /* exercise whose last set was just ticked: moves on after "How was it?" */
function exerciseCard(e,ei,ses){
 var collapsed=exDone(e)&&!openCards[ei];
 return '<div class="card ex'+(collapsed?' collapsed':'')+'" id="ex-'+ei+'" data-ei="'+ei+'">'+exInner(e,ei,ses,collapsed)+'</div>';
}
function exHead(e,ei,ses){
 var ex=exOf(e.id),cfg=cfgOf(e),d=exDone(e);
 return '<div class="head"'+(d?' data-toggle="'+ei+'"':'')+'><div class="row between"><h2>'+(d?'<span style="color:var(--ok)">✓</span> ':(ei+1)+'. ')+esc(nm(e.id))+'</h2>'+(cfg.prio?'<span class="chip prio">priority</span>':'')+'</div>'+
  '<p class="official">'+esc(ex.name)+' · '+esc(equipWord(e.id))+'</p>'+
  '<p class="muscles">Works: '+ex.primary.map(function(m){return '<b>'+mw(m)+'</b>';}).join(', ')+(ex.secondary.length?' · also '+ex.secondary.map(mw).join(', '):'')+'</p>'+sinceLine(e.id)+
  (d?'<p class="exsum">'+e.sets.length+' sets · '+e.sets.map(function(s){return esc(s.kg)+'×'+esc(s.reps);}).join(', ')+' <span class="xs">· '+(E.pair(e.id)?'kg each hand · ':'')+(openCards[ei]?'tap to fold':'tap to open')+'</span></p>':'')+'</div>';
}
/* "Since you started: +12 kg" — progress you can see on every card. */
function sinceLine(id){var s=E.sinceStart(state,id);return s?'<p class="since">Since you started: <b>'+esc(s.text)+'</b></p>':'';}
function exInner(e,ei,ses,collapsed){
 return exHead(e,ei,ses)+(collapsed?'':exStrip(e,ei)+'<div class="body">'+exBody(e,ei,ses)+'</div>');
}
/* Compact picture strip: the moving exercise picture, the muscles, and the machine at the gym.
   Tap one to see it big. Keeps the set rows on the first screen. */
function exStrip(e,ei){
 var ex=exOf(e.id),g=GYM_PHOTO[e.id];
 return '<div class="strip'+(g?'':' two')+'"><button class="sp pic" data-zoom="pic:'+ei+'" aria-label="Show the exercise bigger"><img src="'+ex.images[0]+'" alt="" loading="lazy" decoding="async"><img class="f1" src="'+ex.images[1]+'" alt="" loading="lazy" decoding="async"></button>'+
  '<button class="sp map" data-zoom="map:'+ei+'" aria-label="Show the muscles bigger">'+bodyMap(ex.primary,ex.secondary)+'</button>'+
  (g?'<button class="sp" data-zoom="gym:'+ei+'" aria-label="Show the machine at your gym bigger"><img src="'+g+'" alt="" loading="lazy" decoding="async"><span>At your gym</span></button>':'')+'</div>';
}
function zoom(kind,ei){
 var ses=activeSession(),e=ses&&ses.ex[ei];if(!e)return;var ex=exOf(e.id),z=document.createElement('div');
 z.className='zoom';z.setAttribute('role','dialog');z.setAttribute('aria-label','Picture, tap to close');
 z.innerHTML=kind==='pic'?'<div class="zpic"><img src="'+ex.images[0]+'" alt=""><img class="f1" src="'+ex.images[1]+'" alt=""></div>':kind==='map'?'<div class="zmap">'+bodyMap(ex.primary,ex.secondary)+'</div>':'<img class="zgym" src="'+GYM_PHOTO[e.id]+'" alt="">';
 z.innerHTML+='<p class="xs">'+esc(nm(e.id))+' · tap to close</p>';
 z.addEventListener('click',function(){z.remove();});document.body.appendChild(z);
}
/* One question per exercise instead of reps-in-reserve per set: easy = 3+ left, about right = 2,
   hard = 0. The answer (e.feel) sets the weight for next time and reps; it is also stored as rir on the sets. */
var FEEL=[['easy','Easy',3],['right','About right',2],['hard','Hard',0]];
function feelButtons(ei,e){return FEEL.map(function(o){return '<button data-feel="'+ei+':'+o[0]+'" aria-pressed="'+(e.feel===o[0])+'"'+(e.feel===o[0]?' class="on"':'')+'>'+o[1]+'</button>';}).join('');}
function setFeel(e,k){var o=FEEL.filter(function(x){return x[0]===k;})[0],done=e.sets.filter(function(x){return x.done;});if(!o||!done.length)return;
 e.feel=k;done.forEach(function(x,i){if(i===done.length-1||k==='easy')x.rir=o[2];else if(x.rir===0||x.rir===3)x.rir=null;});}
function exBody(e,ei,ses){
 var cfg=cfgOf(e),sg=e.suggest||{};
 var alts=(cfg.alts||[]).concat(e.id!==e.base?[e.base]:[]).filter(function(a){return a!==e.id&&EX[a];});
 var inf=E.info(e.id)||cfg,lt=lastTxt(e.id);
 return '<div class="note '+(sg.state||'')+'"><b>'+(sg.kg?esc(E.setText(e.id,sg.kg,sg.reps)):'reps '+cfg.reps[0]+'–'+cfg.reps[1])+'</b> · '+sg.sets+' sets · rest '+fmtSec(cfg.rest)+'<br>'+esc(sg.note||'')+
   (E.cue(e.id)?'<br><span class="xs">'+esc(E.cue(e.id))+'</span>':'')+'</div>'+
  '<div class="sethead"><span></span><span>'+(E.pair(e.id)?'kg each hand':'kg')+'</span><span>reps</span><span></span></div>'+
  e.sets.map(function(s,si){
   return '<div class="setrow'+(s.done?' done':'')+'"><span class="sn mono">'+(si+1)+'</span>'+stepper('kg',ei,si,s.kg,cfg.inc||1,nm(e.id)+', set '+(si+1))+stepper('reps',ei,si,s.reps,1,nm(e.id)+', set '+(si+1))+
    '<button class="tick'+(s.done?' on':'')+'" data-tick="'+ei+':'+si+'" aria-pressed="'+!!s.done+'" aria-label="'+esc(nm(e.id))+', set '+(si+1)+' done'+(s.pr?', new best':'')+'">'+(s.pr?'★':'✓')+'</button></div>';
  }).join('')+
  (exDone(e)?'<div class="rirrow feel'+(e.feel?'':' ask')+'"><span>How was it?</span>'+feelButtons(ei,e)+'</div>'+(e.feel?'':'<p class="xs" style="margin-top:6px">Your answer sets the weight for next time. Ticked by mistake? <button class="linkbtn" data-undo="'+ei+'">Undo last set</button></p>'):'')+
  '<div class="row between" style="margin-top:10px;flex-wrap:wrap;gap:8px"><span class="row" style="gap:8px">'+(e.sets.length>1&&!e.sets[e.sets.length-1].done?'<button class="btn small ghost" data-delset="'+ei+'">− set</button>':'')+'<button class="btn small ghost" data-addset="'+ei+'">+ set</button></span>'+(alts.length?'<button class="btn small ghost" data-swapopen="'+ei+'">⇄ Other options ('+alts.length+')</button>':'')+'</div>'+
  (alts.length?'<div id="swaps-'+ei+'" hidden><div class="seg" style="margin-top:10px">'+[['today','Just today'],['always','From now on']].map(function(o){return '<button data-swapkeep="'+o[0]+'" aria-pressed="'+(swapKeep===o[0])+'"'+(swapKeep===o[0]?' class="on"':'')+'>'+o[1]+'</button>';}).join('')+'</div><p class="xs" style="margin-top:6px">'+(swapKeep==='always'?'Replaces it in every session.':'Only today. Good when a machine is busy.')+'</p><div class="swaps">'+alts.map(function(a){return '<button class="tile'+(a===e.base?' back':'')+'" data-swapto="'+ei+':'+a+'"><img src="'+thumbSrc(a)+'" alt="" loading="lazy" decoding="async"><span>'+esc(nm(a))+'</span><small>'+(a===e.base?'back to the plan · ':'')+esc(equipWord(a))+'</small></button>';}).join('')+'</div></div>':'')+
  '<details class="how" data-how="'+esc(e.id)+'"'+(openHow[e.id]?' open':'')+'><summary><b>How to do it</b>'+(lt?'<span class="xs">Last: '+esc(lt.txt)+'</span>':'')+'</summary>'+
   '<p class="sm"><b>Where:</b> '+esc(inf.where)+'</p><p class="sm" style="margin-top:4px"><b>Form:</b> '+esc(inf.tip)+'</p>'+lastTime(e.id)+'</details>';
}
var openHow={};   /* "How to do it" folds the user opened, by exercise */
document.addEventListener('toggle',function(ev){var d=ev.target;if(d.dataset&&d.dataset.how)openHow[d.dataset.how]=d.open;},true);
/* Update one exercise card without redrawing the screen (keeps the photo running). */
function refreshCard(ei){
 var ses=activeSession(),el=$('#ex-'+ei);if(!ses||!el)return;
 var e=ses.ex[ei],collapsed=exDone(e)&&!openCards[ei],media=el.querySelector('.strip');
 el.className='card ex'+(collapsed?' collapsed':'');
 if(!collapsed&&media){el.querySelector('.head').outerHTML=exHead(e,ei,ses);el.querySelector('.body').innerHTML=exBody(e,ei,ses);}
 else el.innerHTML=exInner(e,ei,ses,collapsed);
 updateTrack();
}
/* "Last time" line: what you did the previous time you did this exercise. */
function lastTxt(id){
 var hs=E.history(state,id),l=hs[hs.length-1];
 if(!l)return null;
 var same=l.sets.every(function(s){return s.kg===l.sets[0].kg;});
 var reps=l.sets.map(function(s){return s.reps;}).join(', '),p=E.pair(id);
 var txt=same?(p?E.kgText(id,l.sets[0].kg)+': '+reps+' reps':l.sets[0].kg+' kg × '+reps):l.sets.map(function(s){return s.kg+'×'+s.reps;}).join(' · ')+(p?' (kg each hand)':'');
 return {date:l.date,txt:txt};
}
function lastTime(id){var l=lastTxt(id);return l?'<p class="lasttime"><span>Last time · '+niceDate(l.date)+'</span><b class="mono">'+esc(l.txt)+'</b></p>':'';}
function num(v){v=String(v==null?'':v).trim().replace(',','.');return v===''||isNaN(+v)?null:+v;}
/* who: "Leg press, set 2", so a screen reader says what each control belongs to */
function stepper(kind,ei,si,val,inc,who){
 var kg=kind==='kg';
 return '<span class="step"><button data-step="'+kind+':'+ei+':'+si+':-'+inc+'" aria-label="'+esc(who)+': '+(kg?'less weight':'fewer reps')+'">−</button><input type="text" inputmode="'+(kg?'decimal':'numeric')+'" autocomplete="off" data-val="'+kind+':'+ei+':'+si+'" value="'+esc(val==null?'':val)+'" placeholder="'+(kg?'kg':'reps')+'" aria-label="'+esc(who)+', '+(kg?'kg':'reps')+'"><button data-step="'+kind+':'+ei+':'+si+':'+inc+'" aria-label="'+esc(who)+': '+(kg?'more weight':'more reps')+'">+</button></span>';
}
function programCard(){
 var pr=state.profile;
 return '<div class="card"><h2>The program</h2><p class="sm" style="margin:6px 0 10px">Full body, 3 days a week, two sessions taking turns. Every muscle 2–3× a week, about '+E.RULES.volumeBand.normal.join('–')+' hard sets (more for priority muscles). Big lifts 6–10 reps, small ones 10–15. Reps first, then weight; “How was it?” sets the pace. An easy week only when lifts stall, or when you ask for one.</p>'+
  ['A','B'].map(function(d){return '<p class="eyebrow" style="margin-top:8px">'+(d==='A'?'First':'Second')+' session <small class="ab">'+d+'</small></p><div class="exlist">'+E.exercisesFor(d,pr).map(function(c){return exRow(c.id,'<span class="mono xs">'+c.sets+'×'+c.reps[0]+'–'+c.reps[1]+'</span>',c.prio?'prio':'');}).join('')+'</div>';}).join('')+'</div>';
}

/* ---- Eat ---- */
var PHASE_WORDS={lean:'Lose fat slowly, keep muscle',maintain:'Keep my weight',bulk:'Gain slowly, mostly muscle'};
function renderEat(){
 var mac=E.macrosFor(state),p=state.profile,iso=todayISO();
 if(!mac){$('#v-eat').innerHTML='<div class="card"><p>Fill in your profile first.</p></div>';return;}
 var ta=E.trendAdvice(state);
 var tgt=E.mealTargets(mac,p),sh=E.SHAKES.morning.P+E.SHAKES.post.P+E.SHAKES.bed.P;
 var h='<div class="card" style="margin-top:14px"><h2>Protein a day</h2><p class="xs" style="margin-top:2px">Goal: '+esc((PHASE_WORDS[mac.phase]||'').toLowerCase())+'</p>'+
  '<div class="grid2" style="margin-top:10px"><div class="stat"><div class="v">'+mac.protein+' g</div><div class="l">protein a day</div></div><div class="stat"><div class="v">'+sh+' g</div><div class="l">from the 3 shakes</div></div></div>'+proteinSoFar(iso,mac)+
  '<p class="xs" style="margin-top:10px">'+(+p.goal2?'2.2 g per kg of your goal weight ('+p.goal2+' kg)':'About 2 g per kg of bodyweight')+' — the one number that matters for muscle, and it keeps muscle while fat comes off. The shakes cover '+sh+' g; lunch and dinner bring the rest, about '+tgt.P+' g each. Nothing else to count.</p></div>';
 h+='<div class="card"><h2>Your plate</h2><p class="xs" style="margin:4px 0 10px">Eat what you like — just build lunch and dinner like this. Your hand is the measure, so there is nothing to weigh.</p>'+plateHTML(tgt.P)+'<p class="xs" style="margin-top:10px">Still hungry? More vegetables first. Protein is the part not to skip.</p></div>';
 h+='<div class="card"><h2>Eating vs your weight</h2><p class="sm" style="margin-top:6px">'+esc(ta.text)+(ta.rate!=null?' <span class="xs">(trend on the Progress tab)</span>':'')+'</p></div>';
 var pt=planFor(iso),pTrain=Object.assign({},pt,{training:true,time:pt.time||(p.sched&&p.sched[1])||'16:00',day:pt.day||'A'}),pRest=Object.assign({},pt,{training:false});
 h+=shakeCard();
 h+='<div class="card"><h2>Training day</h2><p class="xs" style="margin:4px 0 6px">What a training day looks like: morning shake, lunch, a shake after training, dinner, and a shake before bed. Meals end 3 hours before bed; the bedtime shake is just a drink. Tick things off on the <b>Today</b> tab.</p>'+timelineHTML(iso,pTrain,mac,false)+'</div>';
 h+='<div class="card"><h2>Rest day</h2><p class="xs" style="margin:4px 0 6px">What a rest day looks like: same protein, the after-training shake moves to the afternoon, creatine still. Tick things off on the <b>Today</b> tab.</p>'+timelineHTML(iso,pRest,mac,false)+'</div>';
 h+='<details class="card fold"><summary><h2>Supplements — what earns its place</h2></summary><div class="stack sm" style="margin-top:8px">'+
  '<p><b>Creatine monohydrate, '+E.RULES.creatineG+' g every day.</b> The best-evidenced supplement there is: more reps per set, faster gains. No loading phase needed; any time of day; mix into anything. Cheapest own-brand is identical to expensive ones.</p>'+
  '<p><b>Whey protein.</b> Just convenient milk protein — your three shakes are your no-cook protein. Any plain whey works; price and taste decide. Skyr, Greek yoghurt or eggs are the alternatives.</p>'+
  '<p><b>A shake before bed.</b> About 35–40 g milk protein before sleep keeps muscle building through the night. It is a drink, not an extra meal, and it does not make you fat.</p>'+
  '<p><b>Caffeine 1–3 mg/kg, 30–60 min pre-session</b> if you want it. A coffee. Not after 15:00 if sleep suffers — sleep beats caffeine.</p>'+
  '<p><b>Vitamin D 20–40 µg/day Oct–Apr</b> at Danish latitude. Fish oil only if you eat no oily fish.</p>'+
  '<p class="xs">Skip: BCAAs (pointless with enough protein), fat burners, test boosters, pre-workouts beyond caffeine.</p></div></details>';
 h+='<details class="card fold"><summary><h2>The rules behind it</h2></summary><div class="stack sm" style="margin-top:8px">'+
  '<p>• Protein: about 2.2 g per kg of your goal weight. Muscle gain levels off near 1.6 g/kg; while losing fat, a bit more keeps muscle. Total per day matters most; 2 meals + 3 shakes spreads it over 5 feeds.</p>'+
  '<p>• Last meal 2–5 h before training: carbs + protein. Post-workout meal within ~2 h. The "anabolic window" is hours wide, not minutes.</p>'+
  '<p>• Weigh most mornings; the trend line decides, not one morning. Portions change only when two weekly checks in a row are off — a bit more or a bit less rice, potatoes or bread. Aim: '+E.RULES.trendTarget.lean.map(Math.abs).reverse().join('–')+' kg a week down, slow enough to keep building muscle.</p>'+
  '<p>• Sleep 7–9 h. Under 6 h measurably cuts muscle gain and raises fat gain — it is a training variable.</p></div></details>';
 $('#v-eat').innerHTML=h;
}

function shakeCard(){
 var S=E.SHAKES;
 return '<div class="card"><h2>Shakes</h2><p class="xs" style="margin:4px 0 8px">Three a day — morning, after training, before bed — are your no-cook protein. Whey is plain milk protein — safe for healthy kidneys; total daily protein is what matters.</p>'+
  '<div class="grid2"><div class="stat"><div class="v">'+S.post.P+' g</div><div class="l">after training / afternoon</div><p class="xs" style="margin-top:4px;text-transform:none;letter-spacing:0">'+esc(S.post.how)+'</p></div>'+
  '<div class="stat"><div class="v">'+S.morning.P+' g</div><div class="l">morning + before bed</div><p class="xs" style="margin-top:4px;text-transform:none;letter-spacing:0">'+esc(S.bed.how)+' Instead, if you like: '+E.MORNING.map(function(m){return esc(m.swap);}).join(' · ')+'.</p></div></div></div>';
}

/* ---- Progress ---- */
function renderProgress(){
 var h='',done=E.completedSessions(state);
 var wk=weekSessions(),streak=E.weeksOnTrack(state,todayISO()).streak;
 var wb=weekBests();
 h+='<div class="grid3" style="margin-top:14px"><div class="stat"><div class="v">'+wk+'/3</div><div class="l">sessions this week</div></div><div class="stat"><div class="v">'+streak+'</div><div class="l">weeks on track</div></div><div class="stat"><div class="v">'+done.length+'</div><div class="l">sessions in total</div></div></div>'+
  (wb.length?'<div class="card"><h2>★ '+wb.length+' new best'+(wb.length>1?'s':'')+' this week</h2><ul class="shop" style="margin-top:6px">'+wb.map(function(b){return '<li>★ <b>'+esc(nm(b.id))+'</b> <span class="mono">'+esc(E.setText(b.id,b.kg,b.reps))+'</span> <span class="xs">'+niceDate(b.date)+'</span></li>';}).join('')+'</ul></div>':'');
 h+='<div class="card"><h2>Bodyweight</h2>'+weightChart()+'</div>'+waistCard();
 var ids=[];E.PROGRAM.A.concat(E.PROGRAM.B).forEach(function(c){if(ids.indexOf(c.id)<0)ids.push(c.id);});
 Object.keys(state.sessions).forEach(function(k){(state.sessions[k].ex||[]).forEach(function(e){if(ids.indexOf(e.id)<0)ids.push(e.id);});});
 var withHist=ids.filter(function(id){return E.history(state,id).length;});
 var sel=withHist.indexOf(renderProgress.sel)>=0?renderProgress.sel:withHist[0];renderProgress.sel=sel;
 // pick a lift by its picture
 h+='<div class="card"><h2>Lifts</h2>'+(sel?'<div class="lifts" role="list">'+withHist.map(function(id){return '<button class="lift'+(id===sel?' on':'')+'" data-lift="'+esc(id)+'" aria-pressed="'+(id===sel)+'"><img src="'+thumbSrc(id)+'" alt="" loading="lazy" decoding="async"><span>'+esc(nm(id))+'</span></button>';}).join('')+'</div>'+
  '<h3 style="margin-top:10px">'+esc(nm(sel))+'</h3>'+sinceLine(sel)+liftChart(sel):'<p class="xs" style="margin-top:6px">Finish a session to see your lifts here.</p>')+'</div>';
 h+=historyCard();
 h+='<div class="card"><h2>Hard sets per muscle, last 7 days</h2><p class="xs" style="margin:4px 0 8px">Target about '+E.RULES.volumeBand.normal.join('–')+' (priority muscles '+E.RULES.volumeBand.priority.join('–')+'). Secondary muscles count half.</p>'+volumeChart()+'</div>';
 $('#v-progress').innerHTML=h;
}
/* Past sessions, newest first: tap one to see it, and fix a wrong number in it. */
var histAll=false;
function historyCard(){
 var ks=E.completedSessions(state).reverse();if(!ks.length)return '';
 return '<div class="card"><h2>Sessions</h2><ul class="hist">'+(histAll?ks:ks.slice(0,6)).map(function(k){var s=state.sessions[k],n=0,pr=0,mins=s.started&&s.finished?Math.round((s.finished-s.started)/60000):null;
  s.ex.forEach(function(e){e.sets.forEach(function(x){if(x.done){n++;if(x.pr)pr++;}});});
  return '<li><button data-hist="'+k+'"><span class="hd"><b>'+niceDate(k)+'</b> <small class="ab">session '+esc(s.day)+'</small></span><span class="xs">'+n+(n===1?' set':' sets')+(mins&&mins<300?' · '+mins+' min':'')+(pr?' · ★ '+pr:'')+'</span><i class="chev"></i></button></li>';}).join('')+'</ul>'+
  (ks.length>6?'<button class="linkbtn xs" data-act="histall" style="margin-top:8px">'+(histAll?'Show fewer':'Show all '+ks.length)+'</button>':'')+'</div>';
}
function histSheet(k,edit,msg){
 var s=state.sessions[k];if(!s||!s.done)return;
 var h='<h2>'+niceDate(k)+' <small class="ab">session '+esc(s.day)+'</small></h2><p class="sm" style="margin-top:4px">'+sessionSummary(s)+'</p>',exs=s.ex.map(function(e,ei){return {e:e,ei:ei};}).filter(function(o){return o.e.sets.length;});
 if(!edit)h+='<ul class="bests" style="margin-top:10px">'+exs.map(function(o){var e=o.e;return '<li>'+thumb(e.id)+'<span><b>'+esc(nm(e.id))+'</b><br><span class="mono xs">'+e.sets.map(function(x){return esc(x.kg)+'×'+esc(x.reps)+(x.pr?' ★':'');}).join(', ')+(E.pair(e.id)?' · kg each hand':'')+'</span></span></li>';}).join('')+'</ul>'+
  '<button class="btn wide ghost" data-histedit="'+k+'" style="margin-top:14px">Fix a number</button><button class="btn wide" data-act="sheetclose" style="margin-top:8px">Close</button>';
 else h+='<form id="histform" data-k="'+k+'" autocomplete="off"><p class="xs" style="margin-top:6px">Change what was wrong. × removes a set.</p>'+exs.map(function(o){var e=o.e;
   return '<p class="hxname">'+thumb(e.id)+'<b>'+esc(nm(e.id))+'</b>'+(E.pair(e.id)?' <span class="xs">kg each hand</span>':'')+'</p>'+e.sets.map(function(x,si){
    return '<div class="hxrow" data-ei="'+o.ei+'" data-si="'+si+'"><span class="sn mono">'+(si+1)+'</span><label><input inputmode="decimal" name="kg" value="'+esc(x.kg)+'" aria-label="'+esc(nm(e.id))+', set '+(si+1)+', kg"><span class="xs">kg</span></label><label><input inputmode="numeric" name="reps" value="'+esc(x.reps)+'" aria-label="'+esc(nm(e.id))+', set '+(si+1)+', reps"><span class="xs">reps</span></label><button type="button" class="hxdel" data-hxdel="1" aria-label="Remove set '+(si+1)+'" aria-pressed="false">×</button></div>';}).join('');}).join('')+
  '<p class="sm" id="histmsg" style="min-height:18px;margin-top:8px;color:var(--bad)">'+esc(msg||'')+'</p><button class="btn wide" type="submit">Save</button><button type="button" class="btn wide ghost" data-hist="'+k+'" style="margin-top:8px">Cancel</button></form>';
 openSheet(h);
}
document.addEventListener('submit',function(ev){var f=ev.target;if(f.id!=='histform')return;ev.preventDefault();
 var k=f.dataset.k,s=state.sessions[k];if(!s)return;
 var rows=$$('.hxrow',f).map(function(r){return {ei:+r.dataset.ei,si:+r.dataset.si,kg:r.querySelector('[name=kg]').value,reps:r.querySelector('[name=reps]').value,del:r.classList.contains('gone')};});
 var bad=E.editSets(s,rows);
 if(bad){var m=$('#histmsg',f),e=s.ex[bad.ei];$$('.hxrow input',f).forEach(function(i){i.classList.remove('err');});
  if(bad.field==='empty'){m.textContent='Keep at least one set.';return;}
  m.textContent=bad.field==='kg'?'Check the kg: '+nm(e.id)+', set '+(bad.si+1)+'.':'Reps are a whole number: '+nm(e.id)+', set '+(bad.si+1)+'.';
  var bi=$('.hxrow[data-ei="'+bad.ei+'"][data-si="'+bad.si+'"] [name='+bad.field+']',f);if(bi){bi.classList.add('err');bi.focus();}return;}
 save();closeSheet();renderProgress();toast('Saved ✓');});
function weekBests(){var m=E.mondayOf(todayISO()),out=[];Object.keys(state.sessions).filter(function(k){return k>=m;}).sort().forEach(function(k){(state.sessions[k].ex||[]).forEach(function(e){e.sets.forEach(function(x){if(x.pr&&x.done)out.push({id:e.id,kg:x.kg,reps:x.reps,date:k});});});});return out;}
function weekSessions(){var m=E.mondayOf(todayISO());return E.completedSessions(state).filter(function(k){return k>=m;}).length;}
function lineChart(pts,opts){
 /* pts: [{x:Date ms, y, y2?}], opts.band [lo,hi] */
 var W=340,H=160,L=34,R=8,T=10,B=22;
 if(pts.length<2)return '<p class="xs" style="padding:10px 0">Not enough data yet — '+(opts.empty||'log a few more.')+'</p>';
 var xs=pts.map(function(p){return p.x;}),ys=pts.map(function(p){return p.y;}).concat(pts.map(function(p){return p.y2;}).filter(function(v){return v!=null;}));
 (opts.goals||[]).forEach(function(g){ys.push(g.y);});
 var x0=Math.min.apply(null,xs),x1=Math.max.apply(null,xs),y0=Math.min.apply(null,ys),y1=Math.max.apply(null,ys);
 var pad=(y1-y0)*0.15||1;y0-=pad;y1+=pad;
 var st=opts.step,ticks=[];   // opts.step: round labels (95, 100, 105…) instead of 4 even splits
 if(st){y0=Math.floor(y0/st)*st;y1=Math.ceil(y1/st)*st;while((y1-y0)/st>6)st*=2;for(var v=y0;v<=y1+1e-9;v+=st)ticks.push(v);}
 else for(var i=0;i<=3;i++)ticks.push(y0+(y1-y0)*i/3);
 function X(v){return L+(v-x0)/((x1-x0)||1)*(W-L-R);}function Y(v){return T+(1-(v-y0)/(y1-y0))*(H-T-B);}
 var first=pts[0],lastp=pts[pts.length-1],yv=function(p){return E.fmtNum(p.y2!=null?p.y2:p.y);};
 var h='<svg class="chart" viewBox="0 0 '+W+' '+H+'" role="img" aria-label="'+esc((opts.title||'Chart')+': '+opts.fmtX(first.x)+' '+yv(first)+', '+opts.fmtX(lastp.x)+' '+yv(lastp))+'">';
 ticks.forEach(function(yv){h+='<line class="grid" x1="'+L+'" x2="'+(W-R)+'" y1="'+Y(yv)+'" y2="'+Y(yv)+'"/><text x="0" y="'+(Y(yv)+3)+'">'+yv.toFixed(st?0:opts.dec==null?1:opts.dec)+'</text>';});
 (opts.goals||[]).forEach(function(g){h+='<line class="goal" x1="'+L+'" x2="'+(W-R)+'" y1="'+Y(g.y)+'" y2="'+Y(g.y)+'"/><text class="goaltext" x="'+(W-R)+'" y="'+(Y(g.y)-4)+'" text-anchor="end">'+esc(g.label)+'</text>';});
 // x labels: month names at month starts once the chart spans a few weeks, otherwise the first and last date
 var ms=[];if(opts.months&&x1-x0>40*864e5){var md=new Date(x0);md=new Date(md.getFullYear(),md.getMonth()+1,1);for(;md.getTime()<=x1;md.setMonth(md.getMonth()+1))ms.push(md.getTime());}
 if(ms.length){var lx=-99;ms.forEach(function(t){var xx=X(t);h+='<line class="grid" x1="'+xx+'" x2="'+xx+'" y1="'+T+'" y2="'+(H-B)+'"/>';if(xx-lx>=30&&xx<=W-R-12){lx=xx;h+='<text x="'+xx+'" y="'+(H-6)+'" text-anchor="middle">'+MON[new Date(t).getMonth()]+'</text>';}});}
 else h+='<text x="'+L+'" y="'+(H-6)+'">'+opts.fmtX(x0)+'</text><text x="'+(W-R)+'" y="'+(H-6)+'" text-anchor="end">'+opts.fmtX(x1)+'</text>';
 pts.forEach(function(p){h+='<circle class="dot'+(p.best?' best':'')+'" cx="'+X(p.x)+'" cy="'+Y(p.y)+'" r="'+(p.best?3.6:2.2)+'"/>';});
 var line=pts.filter(function(p){return p.y2!=null;});
 if(line.length>1)h+='<path class="line" d="'+line.map(function(p,i){return (i?'L':'M')+X(p.x).toFixed(1)+' '+Y(p.y2).toFixed(1);}).join(' ')+'"/>';
 else h+='<path class="line" d="'+pts.map(function(p,i){return (i?'L':'M')+X(p.x).toFixed(1)+' '+Y(p.y).toFixed(1);}).join(' ')+'"/>';
 // p.label: a short text over the point (e.g. the top set "105 kg × 8"), kept inside the chart
 pts.forEach(function(p){if(!p.label)return;var px=X(p.x),py=Y(p.y),an=px>W-R-50?'end':px<L+50?'start':'middle';
  h+='<text class="plabel" x="'+px.toFixed(1)+'" y="'+(py-9<T+10?py+18:py-9).toFixed(1)+'" text-anchor="'+an+'">'+esc(p.label)+'</text>';});
 return h+'</svg>';
}
function fmtX(ms){var d=new Date(ms);return d.getDate()+' '+MON[d.getMonth()];}
function goals(){var p=state.profile;return {g1:p.goal1||100,g2:p.goal2||93,waist:Math.round((p.height||186)/2)};}
function weightChart(){
 var t=E.weightTrend(state).slice(-60),pts=t.map(function(p){return {x:E.parseISO(p.date).getTime(),y:p.kg,y2:p.avg};});
 var last=t[t.length-1],g=goals(),cur=last?last.avg:state.profile.weight,next=cur>g.g1?g.g1:g.g2,ta=E.trendAdvice(state),line='';
 if(cur){var left=Math.round((cur-next)*10)/10;
  line=left>0?'<b class="mono">'+left+' kg</b> to '+(next===g.g1?'your first goal':'your goal')+' ('+next+' kg)'+(ta.rate!=null&&ta.rate<-0.05?' · at your pace ~'+Math.ceil(left/-ta.rate)+' weeks':''):'Goal reached — '+next+' kg. Set the next one under Profile.';}
 return (last?'<p class="sm" style="margin:4px 0 2px"><b class="mono" style="font-size:22px">'+E.fmtNum(last.avg)+' kg</b> trend'+(ta.rate!=null?' · <b class="mono">'+(ta.rate>0?'+':'')+E.fmtNum(ta.rate,2)+' kg/week</b>':'')+'</p>':'')+
  (line?'<p class="sm" style="margin:0 0 6px">'+line+'</p>':'')+
  lineChart(pts,{title:'Bodyweight trend in kg',fmtX:fmtX,step:5,months:true,empty:'weigh in on the Today tab.',goals:[{y:g.g1,label:'first goal '+g.g1},{y:g.g2,label:'goal '+g.g2}]});
}
function waistCard(){
 var iso=todayISO(),g=goals(),rows=Object.keys(state.daily).sort().filter(function(k){return state.daily[k]&&state.daily[k].waist>0;}),
  pts=rows.map(function(k){return {x:E.parseISO(k).getTime(),y:state.daily[k].waist};}),first=rows[0],last=rows[rows.length-1],today=(state.daily[iso]||{}).waist;
 var info=last?'<b class="mono" style="font-size:22px">'+state.daily[last].waist+' cm</b>'+(first!==last?' · '+(state.daily[last].waist-state.daily[first].waist>0?'+':'')+E.fmtNum(state.daily[last].waist-state.daily[first].waist)+' cm since '+niceDate(first):'')+' · goal under <b class="mono">'+g.waist+' cm</b>':'Goal: under <b class="mono">'+g.waist+' cm</b> (half your height).';
 return '<div class="card"><h2>Waist</h2><p class="xs" style="margin:4px 0 8px">Once a week, same morning — Today asks for it. Better than the scale when you are also building muscle.</p>'+
  '<p class="sm" style="margin:4px 0 6px">'+info+'</p>'+lineChart(pts,{title:'Waist in cm',fmtX:fmtX,dec:0,months:true,empty:'measure again next week to see the line.',goals:[{y:g.waist,label:'goal '+g.waist}]})+'</div>';
}
/* Strength over time; the dots are each session's top set. Bests are marked; the latest top set and
   the best one carry their kg × reps. */
function liftChart(id){
 var bs=E.liftPoints(state,id),last=bs[bs.length-1],top=null;
 bs.forEach(function(b){if(b.best)top=b;});
 function lbl(b){return E.pair(id)?'2×'+b.kg+'×'+b.reps:b.kg+'×'+b.reps;}
 var pts=bs.map(function(b){return {x:E.parseISO(b.date).getTime(),y:b.e1rm,best:b.best&&bs.length>1,label:b===last||b===top?lbl(b):null};});
 return (last?'<p class="sm" style="margin:4px 0 6px">Best set '+esc(E.setText(id,last.kg,last.reps))+' · strength <b class="mono">'+E.fmtNum(last.e1rm,0)+'</b> kg'+(E.pair(id)?' each hand':'')+' <span class="xs">(about what you could lift once)</span></p>':'')+lineChart(pts,{title:'Strength of '+nm(id)+' in kg',fmtX:fmtX,dec:0,months:true,empty:'complete a session with this lift.'})+
  (bs.length>1?'<p class="xs" style="margin-top:4px"><i class="lgd best"></i> new best · labels: kg × reps</p>':'');
}
function volumeChart(){
 var vol=E.weeklyVolume(state,EX),prio=[];(state.profile.priority||[]).forEach(function(k){prio=prio.concat(E.PRIORITY[k].muscles);});
 var order=['chest','shoulders','lats','middle back','triceps','biceps','quadriceps','hamstrings','glutes','calves','abdominals','lower back','traps','forearms'];
 var rows=order.filter(function(m){return vol[m]!=null||prio.indexOf(m)>=0||['chest','shoulders','lats','quadriceps','hamstrings'].indexOf(m)>=0;});
 if(!Object.keys(vol).length)return '<p class="xs">No completed sessions in the last 7 days.</p>';
 var W=340,rh=24,L=142,H=rows.length*rh+4,max=24;   // room for 12 px labels like "middle of the back"
 var h='<svg class="chart" viewBox="0 0 '+W+' '+H+'" role="img" aria-label="'+esc('Hard sets per muscle, last 7 days: '+rows.map(function(m){return mw(m)+' '+E.fmtNum(vol[m]||0);}).join(', '))+'">';
 rows.forEach(function(m,i){
  var v=vol[m]||0,isP=prio.indexOf(m)>=0,band=isP?E.RULES.volumeBand.priority:E.RULES.volumeBand.normal,y=i*rh+2;
  function X(n){return L+Math.min(n,max)/max*(W-L-30);}
  h+='<text x="'+(L-6)+'" y="'+(y+14)+'" text-anchor="end">'+esc(mw(m))+'</text>';
  h+='<rect class="band" x="'+X(band[0])+'" y="'+y+'" width="'+(X(band[1])-X(band[0]))+'" height="'+(rh-4)+'"/>';
  h+='<rect class="bar'+(isP?' prio':v<band[0]?' low':'')+'" x="'+L+'" y="'+(y+4)+'" width="'+Math.max(0,X(v)-L)+'" height="'+(rh-12)+'" rx="3"/>';
  h+='<text x="'+(X(v)+4)+'" y="'+(y+14)+'">'+E.fmtNum(v)+'</text>';
 });
 return h+'</svg>';
}

/* ---- Profile ---- */
function renderProfile(){
 var p=state.profile,sched=E.schedOf(p),prio=p.priority||['shoulders','back'];
 function opt(list,cur){return list.map(function(o){return '<option value="'+o[0]+'"'+(o[0]===cur?' selected':'')+'>'+o[1]+'</option>';}).join('');}
 var h=(profileReady()?'':'<div class="card" style="margin-top:14px;border-color:var(--acc)"><h2>Welcome</h2><p class="sm" style="margin-top:6px">Fill this in once. It sets your calories, protein, and the training calendar. Everything is private to your password.</p></div>');
 h+='<div class="card"><h2>You</h2><div class="grid2">'+
  '<label class="field"><span class="l">Sex</span><select data-p="sex">'+opt([['m','Male'],['f','Female']],p.sex||'m')+'</select></label>'+
  '<label class="field"><span class="l">Age</span><input type="number" inputmode="numeric" data-p="age" value="'+esc(p.age||'')+'"></label>'+
  '<label class="field"><span class="l">Height cm</span><input type="number" inputmode="numeric" data-p="height" value="'+esc(p.height||'')+'"></label>'+
  '<label class="field"><span class="l">Weight kg</span><input type="text" inputmode="decimal" autocomplete="off" data-p="weight" value="'+esc(p.weight||'')+'"></label></div>'+
  '<div class="grid2"><label class="field"><span class="l">First goal kg</span><input type="text" inputmode="decimal" autocomplete="off" data-p="goal1" value="'+esc(p.goal1||100)+'"></label><label class="field"><span class="l">Final goal kg</span><input type="text" inputmode="decimal" autocomplete="off" data-p="goal2" value="'+esc(p.goal2||93)+'"></label></div>'+
  '<label class="field"><span class="l">Caffe lattes on work days</span><select data-p="lattes">'+opt([['0','None'],['1','1 a day'],['2','2 a day'],['3','3 a day']],String(p.lattes||0))+'</select></label>'+
  '<label class="field"><span class="l">Daily activity outside the gym</span><select data-p="activity">'+opt([['desk','Mostly sitting (desk job)'],['feet','On my feet a fair bit'],['active','Physically active job']],p.activity||'feet')+'</select></label>'+
  '<label class="field"><span class="l">Goal</span><select data-p="phase">'+opt([['lean',PHASE_WORDS.lean],['maintain',PHASE_WORDS.maintain],['bulk',PHASE_WORDS.bulk]],p.phase||'lean')+'</select></label>'+
  '</div>';
 h+='<div class="card"><h2>Priority muscles</h2><p class="xs" style="margin:4px 0 6px">Each gets ~4 extra hard sets a week on top of the full-body base. Two at most.</p>'+
  Object.keys(E.PRIORITY).map(function(k){return '<label class="check"><input type="checkbox" data-prio="'+k+'"'+(prio.indexOf(k)>=0?' checked':'')+'><span>'+E.PRIORITY[k].label+'</span></label>';}).join('')+'</div>';
 var tt=sched[Object.keys(sched)[0]]||'16:00';
 h+='<div class="card"><h2>Your day</h2><p class="xs" style="margin:4px 0 6px">Meals are timed around these. Training days move by themselves.</p>'+
  '<label class="field"><span class="l">Training at</span><input type="time" data-time="all" value="'+esc(tt)+'"></label>'+
  '<div class="grid3"><label class="field"><span class="l">Wake</span><input type="time" data-p="wake" value="'+esc(p.wake||'06:30')+'"></label><label class="field"><span class="l">Lunch</span><input type="time" data-p="lunch" value="'+esc(p.lunch||'11:30')+'"></label><label class="field"><span class="l">Bed</span><input type="time" data-p="bed" value="'+esc(p.bed||'22:30')+'"></label></div></div>';
 var tm=themeMode();
 h+='<div class="card"><h2>Appearance</h2><p class="xs" style="margin:4px 0 10px">Auto follows your phone\'s light/dark setting.</p><div class="seg">'+[['auto','Auto'],['light','Light'],['dark','Dark']].map(function(o){return '<button data-themeset="'+o[0]+'" aria-pressed="'+(tm===o[0])+'"'+(tm===o[0]?' class="on"':'')+'>'+o[1]+'</button>';}).join('')+'</div></div>';
 h+=installCard('profile')+remindersCard();
 h+='<div class="card"><h2>Sync</h2><p class="sm" style="margin-top:6px" id="syncinfo">'+esc($('#syncline').textContent)+'</p>'+(storeKept===false?'<p class="xs" style="margin-top:4px">The browser may clear this data when the phone is low on space. Installing Lift as an app (and exporting a backup now and then) keeps it safe.</p>':'')+'<p class="xs mono" style="margin-top:4px">build '+esc((document.querySelector('meta[name=build]')||{}).content||'?')+' · online '+navigator.onLine+(SYNC.eng?' · v2'+(syncStore.get('mig')==='done'?' · migrated':' · moving from v1'):'')+'</p><div class="row" style="margin-top:10px;flex-wrap:wrap"><button class="btn small ghost" data-act="update">Check for update</button>'+(SYNC.eng?'<button class="btn small ghost" data-act="pwopen">Change password</button>':'<button class="btn small ghost" data-act="forget">Sync with a password</button>')+'</div>'+
  '<details class="fold" style="margin-top:10px"><summary><span class="xs">Details</span></summary><pre id="synclog" class="xs mono" style="white-space:pre-wrap;margin:6px 0 0;color:var(--ink3)">'+esc(SYNC.log.join(String.fromCharCode(10)))+'</pre></details>'+
  '<form id="pwform" hidden style="margin-top:12px"><label class="field"><span class="l">Current password</span><input type="password" name="cur" autocomplete="current-password"></label>'+
  '<label class="field"><span class="l">New password</span><input type="password" name="nw" autocomplete="new-password"></label><label class="field"><span class="l">New password again</span><input type="password" name="nw2" autocomplete="new-password"></label>'+
  '<button class="btn wide" type="submit">Change password</button><p class="sm" id="pwmsg" style="min-height:18px;margin-top:8px;color:var(--bad)"></p></form></div>';
 h+='<div class="card"><h2>Backup</h2><p class="xs" style="margin:4px 0 10px">Save everything to a file now and then. Import puts a saved file back.</p><div class="row" style="flex-wrap:wrap;gap:8px"><button class="btn small ghost" data-act="export">Export to a file</button><button class="btn small ghost" data-act="import">Import a file</button></div>'+
  '<input type="file" id="importfile" accept=".json,application/json" hidden></div>';
 h+='<div class="card danger"><h2>Danger zone</h2><p class="xs" style="margin:4px 0 10px">Removes all Lift data from this phone. '+(SYNC.eng?'The synced copy stays; your password brings it back.':'Nothing is synced, so export a backup first.')+'</p><button class="btn small danger" data-act="wipe">Wipe this device…</button></div>';
 h+='<p class="xs" style="padding:0 4px 10px">Exercise photos and descriptions: free-exercise-db (public domain). Training and nutrition rules: Pelland 2025, Robinson 2024, Schoenfeld, ISSN position stands. This is a tool, not medical advice.</p>';
 $('#v-profile').innerHTML=h;
}

/* ---------------- events (delegated) ---------------- */
document.addEventListener('click',function(ev){
 var b=ev.target.closest('[data-act],[data-step],[data-tick],[data-addset],[data-delset],[data-swapopen],[data-swapto],[data-themeset],[data-toggle],[data-jump],[data-feel],[data-swapkeep],[data-rest],[data-wuopen],[data-mealdone],[data-wkday],[data-wknav],[data-move],[data-unmove],[data-pickother],[data-zoom],[data-undo],[data-lift],[data-hist],[data-histedit],[data-hxdel]');if(!b)return;
 if(b.dataset.hist){histSheet(b.dataset.hist,false);return;}
 if(b.dataset.histedit){histSheet(b.dataset.histedit,true);return;}
 if(b.dataset.hxdel){var hr=b.closest('.hxrow'),gone=hr.classList.toggle('gone');b.setAttribute('aria-pressed',String(gone));b.textContent=gone?'↺':'×';b.setAttribute('aria-label',(gone?'Keep set ':'Remove set ')+(+hr.dataset.si+1));return;}
 if(b.dataset.lift){var lr=$('.lifts'),sl=lr?lr.scrollLeft:0,py=scrollY;renderProgress.sel=b.dataset.lift;renderProgress();scrollTo(0,py);lr=$('.lifts');if(lr)lr.scrollLeft=sl;return;}
 if(b.dataset.zoom){var zz=b.dataset.zoom.split(':');zoom(zz[0],+zz[1]);return;}
 if(b.dataset.wkday){wkv.sel=wkv.sel===b.dataset.wkday||b.dataset.wkday===todayISO()?null:b.dataset.wkday;var wy=scrollY;renderToday();scrollTo(0,wy);return;}
 if(b.dataset.wknav){wkv.off=Math.max(0,Math.min(3,wkv.off+(+b.dataset.wknav)));wkv.sel=null;var wy2=scrollY;renderToday();scrollTo(0,wy2);return;}
 if(b.dataset.mealdone){var di=todayISO();state.daily[di]=state.daily[di]||{};state.daily[di].meals=state.daily[di].meals||{};state.daily[di].meals[b.dataset.mealdone]=1;save();renderToday();toast('Nice — ticked off');return;}
 if(b.dataset.wuopen){var wk=b.dataset.wuopen;openWarm[wk]=!openWarm[wk];var wses=activeSession();if(!wses)return;var ww=wk==='gen'?E.WARMUP.general:E.WARMUP[wses.day].filter(function(x){return x.id===wk;})[0];var wel=$('#wu-'+wk);if(ww&&wel)wel.outerHTML=warmItem(wk,ww,wk==='gen'?ww.amount:ww.reps,wses.warm||{});return;}
 if(b.dataset.rest){rest.end+=(+b.dataset.rest)*1000;rest.total=Math.max(1,rest.total+(+b.dataset.rest));keepRest();if(rest.end>Date.now())$('#rest').classList.remove('over');tickRest();return;}
 if(b.dataset.jump){var jses=activeSession();if(jses){if(!jses.warmShut){jses.warmShut=true;save();}goEx(jses,+b.dataset.jump);}return;}
 if(b.dataset.pickother){var ob=$('#others');if(ob){ob.hidden=!ob.hidden;if(!ob.hidden)ob.scrollIntoView({behavior:SMOOTH,block:'start'});}return;}
 if(b.dataset.toggle){var tg=+b.dataset.toggle;openCards[tg]=!openCards[tg];refreshCard(tg);return;}
 if(b.dataset.move!=null){var mv=b.dataset.move.split('|'),pushed=moveSession(mv[0],mv[1]);save();wkv.sel=null;renderToday();
  toast(mv[1]===todayISO()?'Today is a training day now'+(pushed?' — the rest of the week moved along':''):mv[1]?'Moved to '+niceDate(mv[1])+(pushed?' — the rest of the week moved along':''):'Rest today — the order just continues');return;}
 if(b.dataset.unmove){var au=state.settings.autoMoves||{},uk=au[b.dataset.unmove]||b.dataset.unmove,un=E.unshiftWeek(state,uk);
  if(E.parseISO(uk).getDay()===1){var km=state.settings.keepMon||{},old2=addDays(todayISO(),-21);Object.keys(km).forEach(function(k){if(k<old2)delete km[k];});km[uk]=1;state.settings.keepMon=km;}state.settings.moves=un.moves;state.settings.autoMoves=un.auto;save();renderToday();return;}
 if(b.dataset.themeset){setTheme(b.dataset.themeset);return;}
 if(b.dataset.swapkeep){swapKeep=b.dataset.swapkeep;var sbox=b.closest('[id^="swaps-"]'),sei=sbox&&sbox.id.slice(6);refreshCard(+sei);var nb=$('#swaps-'+sei);if(nb)nb.hidden=false;return;}
 if(b.dataset.swapopen){var box=$('#swaps-'+b.dataset.swapopen);if(box)box.hidden=!box.hidden;return;}
 if(b.dataset.swapto){var sw=b.dataset.swapto.split(':');doSwap(+sw[0],sw.slice(1).join(':'));return;}
 var ses=activeSession();
 if(b.dataset.feel){var fe=b.dataset.feel.split(':'),fi=+fe[0],fx=ses.ex[fi];setFeel(fx,fe[1]);save();refreshCard(fi);if(rest.ask===fi)rest.ask=null;restRir();
  if(justDone===fi){justDone=null;var nx=nextUndone(ses,fi+1);
   if(nx>=0)setTimeout(function(){goEx(ses,nx);toast('Next: '+nm(ses.ex[nx].id));},400);
   else{var fb=$('[data-act="finish"]');if(fb)fb.scrollIntoView({behavior:SMOOTH,block:'center'});toast('All exercises done — tap Finish session');}}
  return;}
 if(b.dataset.undo){var ui=+b.dataset.undo,ux=ses.ex[ui],us=ux.sets.filter(function(x){return x.done;}).pop();if(!us)return;
  us.done=false;delete us.pr;delete us.at;delete ux.feel;justDone=null;if(rest.ask===ui)rest.ask=null;openCards[ui]=true;save();refreshCard(ui);restRir();return;}
 if(b.dataset.step){var a=b.dataset.step.split(':'),e=ses.ex[+a[1]],si=+a[2],s=e.sets[si],inc=+a[3];var cur=+s[a[0]]||0;s[a[0]]=Math.max(0,Math.round((cur+inc)*100)/100);
  var inp=$('[data-val="'+a[0]+':'+a[1]+':'+si+'"]');if(inp)inp.value=s[a[0]];
  if(a[0]==='kg'&&!s.done)e.sets.forEach(function(x,i){if(i>si&&!x.done&&(x.kg==null||x.kg===cur)){x.kg=s.kg;var q=$('[data-val="kg:'+a[1]+':'+i+'"]');if(q)q.value=x.kg;}});
  save();return;}
 if(b.dataset.tick){unlockAudio();var t=b.dataset.tick.split(':'),ex=ses.ex[+t[0]],st=ex.sets[+t[1]];
  if(!st.done){if(!(st.kg>0||(st.kg===0&&E.BODYWEIGHT.indexOf(ex.id)>=0))||!(st.reps>0)){toast('Enter kg and reps first');return;}st.done=true;st.at=Date.now();
   // a new best: heavier, more reps at this weight, or stronger than every finished session (one ★ per exercise)
   var bh=E.history(state,ex.id),up=E.bestUp(bh,ex.id,st.kg,st.reps),beat=ex.sets.some(function(x){return x!==st&&x.pr;});
   if(up&&!beat){st.pr=true;setTimeout(function(){toast('★ New best on '+nm(ex.id)+': '+(up==='stronger'?E.setText(ex.id,st.kg,st.reps):up));cheer();},50);}ex.sets.forEach(function(x){if(!x.done&&x.kg==null)x.kg=st.kg;});
   var cfg=cfgOf(ex);var lastSet=exDone(ex);// last set: no timer over the next exercise (walking to the next machine is the rest), only the question
   if(lastSet){clearInterval(rest.t);rest.end=0;keepRest();if(!ex.feel)rest.ask=+t[0];}else startRest(cfg.rest);restRir();
   var ei=+t[0];if(lastSet)openCards[ei]=true;save();refreshCard(ei);
   if(lastSet){var fr=$('#ex-'+ei+' .feel');if(fr&&fr.getBoundingClientRect().bottom>innerHeight-150)fr.scrollIntoView({behavior:SMOOTH,block:'center'});}
   if(lastSet)justDone=ei;   // no auto-jump: "How was it?" (or Undo) first, then on to the next one
   return;}
  else{st.done=false;delete st.pr;delete st.at;}
  save();refreshCard(+t[0]);return;}
 if(b.dataset.delset){var dei=+b.dataset.delset,dex=ses.ex[dei],dl=dex.sets.length-1;if(dl<1||dex.sets[dl].done)return;dex.sets.pop();save();refreshCard(dei);return;}
 if(b.dataset.addset){var exx=ses.ex[+b.dataset.addset],lastS=exx.sets[exx.sets.length-1];exx.sets.push({kg:lastS?lastS.kg:null,reps:lastS?lastS.reps:null,rir:null,done:false});save();refreshCard(+b.dataset.addset);return;}
 var act=b.dataset.act;
 if(act==='start'){startSession(false);return;}
 if(act==='welcome'){if(b.dataset.from)moveSession(b.dataset.from,todayISO());startSession(b.dataset.short==='1');return;}
 if(act==='wbhide'){try{localStorage.setItem('lift.wbhide',todayISO());}catch(e){}renderToday();return;}
 if(act==='sheetclose'){closeSheet();return;}
 if(act==='histall'){histAll=!histAll;renderProgress();return;}
 if(act==='finish'){if(!ses)return;var n=0;ses.ex.forEach(function(e){e.sets.forEach(function(x){if(x.done)n++;});});if(!n){toast('No sets logged yet');return;}
  var skipped=0,miss=ses.ex.map(function(e){var k=e.sets.filter(function(x){return !x.done;}).length;if(k&&k===e.sets.length){skipped++;return '';}return k?'<li><b>'+esc(nm(e.id))+'</b> <span class="xs">'+k+' of '+e.sets.length+' sets</span></li>':'';}).join('');
  if(skipped)miss+='<li>'+skipped+(skipped===1?' exercise':' exercises')+' not started</li>';
  openSheet('<h2>Finish session?</h2><p class="sm" style="margin-top:6px">'+n+(n===1?' set':' sets')+' ticked.</p>'+(miss?'<p class="sm" style="margin-top:10px">Not ticked, so not saved:</p><ul class="shop" style="margin-top:4px">'+miss+'</ul>':'')+
   '<button class="btn wide" data-act="finishyes" style="margin-top:14px">Finish</button><button class="btn wide ghost" data-act="sheetclose" style="margin-top:8px">Keep training</button>');return;}
 if(act==='finishyes'){closeSheet();if(!ses)return;
  var again=!!ses.reopened;delete ses.reopened;
  ses.ex.forEach(function(e){e.sets=e.sets.filter(function(x){return x.done;});});ses.done=true;if(!again||!ses.finished)ses.finished=Date.now();
  if(!again&&E.recentStalls(state,3)>=2&&!ses.deload){state.settings.deloadUntil=E.completedSessions(state).length+3;setNotice('Two lifts stalled, so the next 3 sessions are an easy week: lighter weights, fewer sets. After that the weights go back up.');}
  save();stopRest();keepAwake(false);show('train');scrollTo(0,0);
  if(ses.ex.some(function(e){return e.sets.some(function(x){return x.pr;});}))cheer();return;}
 if(act==='easy'||act==='easyoff'){var on=act==='easy',es=activeSession()||state.sessions[todayISO()];
  state.settings.deloadUntil=on?E.completedSessions(state).length+3:0;
  // today's session not started yet: redo its weights now
  if(es&&!es.done&&!es.ex.some(function(e){return e.sets.some(function(x){return x.done;});})){es.deload=on;
   es.ex.forEach(function(e){e.suggest=E.suggestIn(state,es,Object.assign({},cfgOf(e),{id:e.id}));e.sets=E.freshSets(e.suggest);});}
  save();renderToday();toast(on?'Easy week: the next 3 sessions are lighter':'Back to normal weights');return;}
 if(act==='reopen'){var rk=sessionKey(true),rs=rk&&state.sessions[rk];if(!rs||!rs.done)return;rs.done=false;rs.reopened=true;trainFocus=0;save();show('train');return;}
 if(act==='abandon'){if(!ses||ses.reopened)return;if(!confirm('Discard this session? Nothing will be saved.'))return;delete state.sessions[activeKey()];save();stopRest();keepAwake(false);renderTrain();return;}
 if(act==='ics'){downloadBlob(E.calendarICS(state.profile,E.macrosFor(state),todayISO(),b.dataset.meals==='1'),'text/calendar','lift-reminders.ics');toast('Saved lift-reminders.ics — open it to add to your calendar');return;}
 if(act==='install'){if(installEvt){installEvt.prompt();installEvt.userChoice.then(function(c){if(c&&c.outcome==='accepted')installEvt=null;render();});}return;}
 if(act==='hintoff'){swipeKnown(true);var hn=$('.hint');if(hn)hn.remove();return;}
 if(act==='noticeoff'){setNotice(null);render();return;}
 if(act==='wedit'){weighEdit=true;renderToday();var wi=$('.weigh input');if(wi)wi.focus();return;}
 if(act==='wskip'){try{localStorage.setItem('lift.wskip',todayISO());}catch(e){}renderToday();return;}
 if(act==='installlater'){try{localStorage.setItem('lift.installLater',todayISO().slice(0,7));}catch(e){}renderToday();return;}
 if(act==='update'){if(!('serviceWorker' in navigator)||!navigator.serviceWorker.controller){location.reload();return;}toast('Checking…');
  navigator.serviceWorker.getRegistration().then(function(r){return r?r.update():null;}).then(function(){setTimeout(function(){if($('#updpill').hidden)toast('You have the latest version');},4000);},function(){toast('Offline? Try again later');});return;}
 if(act==='forget'){try{localStorage.removeItem(PK);}catch(e){}location.reload();return;}
 if(act==='pwopen'){var pf=$('#pwform');if(pf){pf.hidden=!pf.hidden;if(!pf.hidden)pf.elements.cur.focus();}return;}
 if(act==='export'){downloadBlob(JSON.stringify(state,null,1),'application/json','lift-'+todayISO()+'.json');return;}
 if(act==='import'){var fi2=$('#importfile');if(fi2){fi2.value='';fi2.click();}return;}
 if(act==='impmerge'||act==='impreplace'){closeSheet();var imp=pendingImport;pendingImport=null;if(!imp)return;
  // add: what is on this device wins where both have the same day; replace: the file becomes this device's data
  state=act==='impmerge'?SYNC2.merge3({},state,imp.state):SYNC2.shape(imp.state);migrate();save();render();toast(act==='impmerge'?'Backup added ✓':'Replaced with the backup ✓');return;}
 // wipe: typed confirmation in a sheet first
 if(act==='wipe'){openSheet('<h2>Wipe this device?</h2><p class="sm" style="margin-top:6px">All Lift data on this phone is removed. '+(SYNC.eng?'The synced copy stays.':'Nothing is synced: without a backup it is gone.')+'</p>'+
  '<label class="field"><span class="l">Type WIPE to confirm</span><input id="wipeword" autocomplete="off" autocapitalize="characters" spellcheck="false"></label>'+
  '<button class="btn wide danger" data-act="wipeyes" id="wipeyes" disabled>Wipe this device</button><button class="btn wide ghost" data-act="sheetclose" style="margin-top:8px">Cancel</button>');return;}
 if(act==='wipeyes'){var ww2=$('#wipeword');if(!ww2||ww2.value.trim().toUpperCase()!=='WIPE')return;closeSheet();if(SYNC.eng)SYNC.eng.stop();clearTimeout(saveT);lsOff=true;clearTimeout(lsT);   // never pushes, and nothing is written back
  try{[LS,PK,LS+'.bad','lift.dev'].concat(Object.keys(SYNC_LS).map(function(k){return SYNC_LS[k];})).forEach(function(k){localStorage.removeItem(k);});}catch(e){}
  kv.clear().then(function(){location.reload();});return;}
});
function downloadBlob(text,type,name){var u=URL.createObjectURL(new Blob([text],{type:type})),a=document.createElement('a');a.href=u;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(function(){URL.revokeObjectURL(u);},5000);}
/* A swap is for this session only unless 'From now on' is chosen. */
var swapKeep='today';
function doSwap(ei,id){
 var ses=activeSession();if(!ses)return;var e=ses.ex[ei],cfg=Object.assign({},cfgOf(e),{id:id});
 e.id=id;e.suggest=E.suggestIn(state,ses,cfg);
 var fresh=E.freshSets(e.suggest);e.sets=e.sets.map(function(x,i){return x.done?x:fresh[i]||fresh[0];});
 if(swapKeep==='always'){state.settings.swaps=state.settings.swaps||{};if(id===e.base)delete state.settings.swaps[e.base];else state.settings.swaps[e.base]=id;}
 save();renderTrain();toast((id===e.base?'Back to ':'Swapped to ')+nm(id)+(swapKeep==='always'?' from now on':' for today'));
}
document.addEventListener('input',function(ev){if(ev.target.id==='wipeword'){var wb=$('#wipeyes');if(wb)wb.disabled=ev.target.value.trim().toUpperCase()!=='WIPE';}});
/* Import: read the chosen file, check it, then ask: add to what is here, or replace it. */
var pendingImport=null;
document.addEventListener('change',function(ev){var t=ev.target;if(t.id!=='importfile'||!t.files||!t.files[0])return;var file=t.files[0];
 if(file.size>20e6){toast('That file is too big for a Lift backup');return;}
 file.text().then(function(txt){var b=E.readBackup(txt);if(!b){toast('This file is not a Lift backup');return;}pendingImport=b;
  var have=E.completedSessions(state).length+Object.keys(state.weight).length;
  openSheet('<h2>Import backup?</h2><p class="sm" style="margin-top:6px">'+esc(file.name)+': '+b.sessions+(b.sessions===1?' session':' sessions')+', '+b.weighins+(b.weighins===1?' weigh-in':' weigh-ins')+'.</p>'+
   '<button class="btn wide" data-act="impmerge" style="margin-top:14px">Add to what is here</button><p class="xs" style="margin-top:4px">Missing days are filled in. Where both have the same day, this phone’s copy stays.</p>'+
   (have?'<button class="btn wide danger" data-act="impreplace" style="margin-top:12px">Replace everything here</button><p class="xs" style="margin-top:4px">This phone’s data becomes the file’s.</p>':'')+
   '<button class="btn wide ghost" data-act="sheetclose" style="margin-top:12px">Cancel</button>');},function(){toast('Could not read the file');});});
document.addEventListener('focusin',function(ev){var t=ev.target;if(t.dataset&&t.dataset.val)setTimeout(function(){try{t.select();}catch(e){}},0);});
document.addEventListener('change',function(ev){
 var t=ev.target,ses=activeSession();
 if(t.dataset.val){var a=t.dataset.val.split(':'),ex0=ses.ex[+a[1]],s=ex0.sets[+a[2]],old=s[a[0]],nv=num(t.value);s[a[0]]=nv;
  if(a[0]==='kg'&&nv!=null)ex0.sets.forEach(function(x,i){if(i>+a[2]&&!x.done&&(x.kg==null||x.kg===old)){x.kg=nv;var inp=$('[data-val="kg:'+a[1]+':'+i+'"]');if(inp)inp.value=nv;}});
  save();return;}
 if(t.dataset.warm){ses.warm=ses.warm||{};ses.warm[t.dataset.warm]=t.checked?1:0;
  var wall=['gen'].concat(E.WARMUP[ses.day].map(function(w){return w.id;})).every(function(k){return ses.warm[k];});
  if(wall){ses.warmShut=true;var wd=$('#warmup');if(wd)wd.open=false;}save();return;}
 if(t.dataset.daily){var iso=todayISO(),dv=num(t.value),k=t.dataset.daily,d0=state.daily[iso]||{};
  // an empty or impossible value puts the saved one back instead of deleting it
  var ok=k==='weight'?dv!=null&&saveWeight(iso,dv):k==='waist'?dv!=null&&saveWaist(iso,dv):(dv==null||dv>=0);
  if(!ok){t.value=k==='weight'?(state.weight[iso]||''):(d0[k]==null?'':d0[k]);return;}
  if(k!=='weight'&&k!=='waist'){state.daily[iso]=d0;if(dv==null)delete d0[k];else d0[k]=dv;}
  save();return;}
 if(t.dataset.meal){var dl=t.closest('[data-day]'),iso2=dl?dl.dataset.day:todayISO();if(iso2!==todayISO())keepY=true;state.daily[iso2]=state.daily[iso2]||{};state.daily[iso2].meals=state.daily[iso2].meals||{};state.daily[iso2].meals[t.dataset.meal]=t.checked?1:0;save();renderToday();return;}
 if(t.dataset.p){var v=t.value;if(['age','height','weight','goal1','goal2','lattes'].indexOf(t.dataset.p)>=0)v=num(v);state.profile[t.dataset.p]=v;save();return;}
 if(t.dataset.prio){var list=(state.profile.priority||['shoulders','back']).slice();if(t.checked){if(list.length>=2){t.checked=false;toast('Two at most');return;}list.push(t.dataset.prio);}else list=list.filter(function(x){return x!==t.dataset.prio;});state.profile.priority=list;save();return;}
 if(t.dataset.time==='all'){if(!t.value)return;var sched=Object.assign({},E.schedOf(state.profile));Object.keys(sched).forEach(function(d){sched[d]=t.value;});
  state.profile.sched=sched;save();renderProfile();return;}
});

/* ---------------- boot ---------------- */
function boot(){
 var pp=null;try{pp=localStorage.getItem(PK);}catch(e){}
 kv.get('keys').then(function(rec){
  if(!rec&&!pp){showGate('');return;}
  $('#gate').classList.add('hidden');$('#app').classList.remove('hidden');
  migrate();
  startSync(rec,pp);keepStorage();
  // the home-screen shortcut "Start session" opens ./?go=train
  var ses=activeSession(),go=/[?&]go=train(&|$)/.test(location.search);
  if(go)try{history.replaceState(null,'',location.pathname);}catch(e){}
  show(ses||(go&&profileReady())?'train':(profileReady()?'today':'profile'));
  restoreRest();
 });
}
/* Ask the browser to keep Lift's data even when the phone runs low on space (every start, also
   device-only; the answer can change, e.g. after installing). Shown on Profile → Sync. */
var storeKept=null;
function keepStorage(){
 try{var s=navigator.storage;if(!s||!s.persisted)return;
  s.persisted().then(function(p){return p||(s.persist?s.persist():false);}).then(function(p){storeKept=!!p;},function(){});}catch(e){}
}
function showGate(msg){$('#app').classList.add('hidden');$('#gate').classList.remove('hidden');$('#gatemsg').textContent=msg||'';try{$('#gatep').focus();}catch(e){}}
$('#gateform').addEventListener('submit',function(e){e.preventDefault();var v=$('#gatep').value;if(!SYNC2.norm(v)){toast('Type your password');return;}
 if(!(window.crypto&&crypto.subtle)){$('#gatemsg').textContent='This browser can’t sync. Use this device only.';return;}
 var btn=$('#gateform button'),msg=$('#gatemsg');btn.disabled=true;btn.textContent='Checking…';msg.textContent='';
 unlock(v).then(function(rec){return kv.set('keys',rec).then(function(){return rec;});},function(){return null;}).then(function(rec){
  btn.disabled=false;btn.textContent='Continue';
  if(!rec){msg.textContent='Wrong password.';return;}
  // never synced with v2 on this device: take in the old v1 copy too; otherwise a normal sync against the last agreed copy
  if(!syncStore.get('mig'))syncStore.set('mig','M2');syncStore.del('ut');
  try{localStorage.removeItem(PK);}catch(e2){}
  $('#gatep').value='';boot();});});
$('#gateskip').addEventListener('click',function(){try{localStorage.setItem(PK,'-');}catch(e){}boot();});
boot();
})();
