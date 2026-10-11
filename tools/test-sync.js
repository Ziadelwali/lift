/* node tools/test-sync.js - sync v2: keys, encryption, merge, guard, a fake Firestore with
   preconditions, migration from v1 with a crash at every step, password change. Node 20+. */
'use strict';
var S = require('../sync.js');
var nc = require('crypto');
var fails = 0;
function eq(name, got, want) {
  var ok = S.stable(got) === S.stable(want);
  console.log((ok ? 'ok   ' : 'FAIL ') + name + (ok ? '' : '  got ' + JSON.stringify(got) + ' want ' + JSON.stringify(want)));
  if (!ok) fails++;
}
function clone(v) { return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); }
var ITER = 1000;   // fast keys for the scenario tests; the real count is checked once below

/* what tools/seal-config.js does, in node crypto */
function nodeKeys(pass, iter) {
  var master = nc.pbkdf2Sync(Buffer.from(S.norm(pass)), 'lift-sync/v2/salt', iter, 32, 'sha256');
  function hk(info) { return Buffer.from(nc.hkdfSync('sha256', master, 'lift-sync/v2/hkdf', info, 32)); }
  return { docId: hk('lift/v2/doc').toString('hex'), cfgKey: hk('lift/v2/cfg') };
}
function sealCfg(pass, iter, cfg) {
  var k = nodeKeys(pass, iter).cfgKey, iv = nc.randomBytes(12), c = nc.createCipheriv('aes-256-gcm', k, iv);
  c.setAAD(Buffer.from('lift/v2/cfg'));
  var data = Buffer.concat([c.update(Buffer.from(JSON.stringify(cfg))), c.final(), c.getAuthTag()]);
  return { iv: iv.toString('base64'), data: data.toString('base64') };
}

/* Firestore stand-in: whole-document writes with updateTime / exists=false preconditions */
function FakeFS() {
  var docs = {}, t = 0, f = { docs: docs, gets: 0, writes: 0 };
  f.get = async function (id, opt) {
    f.gets++; await null;
    var d = docs[id]; if (!d) return { status: 404 };
    return { status: 200, doc: { fields: opt && opt.mask ? (d.fields.v ? { v: d.fields.v } : {}) : clone(d.fields), updateTime: d.ut } };
  };
  f.write = async function (id, fields, pre) {
    await null; var d = docs[id];
    if (pre && pre.exists === false && d) return { conflict: true };
    if (pre && pre.updateTime && (!d || d.ut !== pre.updateTime)) return { conflict: true };
    f.writes++; docs[id] = { fields: clone(fields), ut: 't' + (++t) };
    return { status: 200, doc: { updateTime: docs[id].ut } };
  };
  return f;
}
function memStore() { var m = {}; return { m: m, get: function (k) { return m[k] === undefined ? null : clone(m[k]); }, set: function (k, v) { m[k] = clone(v); }, del: function (k) { delete m[k]; } }; }
function memKV() { var m = {}; return { m: m, get: async function (k) { return m[k] || null; }, set: async function (k, v) { m[k] = v; }, del: async function (k) { delete m[k]; } }; }

var CFG = { projectId: 'p', apiKey: 'k' };
var SEALED = { v: 2, entries: [sealCfg('correct horse', ITER, CFG)] };
/* a device: local state + localStorage + IndexedDB; engine() builds a fresh engine on them (= a relaunch) */
function device(fs, name) {
  var dv = { name: name, state: S.shape({}), store: memStore(), kv: memKV(), timers: 0, moved: 0, crashAt: null, logs: [] };
  dv.engine = function () {
    dv.eng = S.createSync({
      transport: function () { return fs; }, kv: dv.kv, store: dv.store, dev: name, iter: ITER,
      getLocal: function () { return dv.state; }, setLocal: function (s) { dv.state = clone(s); },
      log: function (t) { dv.logs.push(t); }, status: function (t) { dv.status = t; }, notice: function (t) { dv.notice = t; },
      sleep: function () { return Promise.resolve(); }, every: function () { dv.timers++; },
      onMoved: function () { dv.moved++; }, loadSealed: async function () { return SEALED; },
      crash: function (st) { if (dv.crashAt === st) { dv.crashAt = null; return true; } return false; }
    });
    return dv.eng;
  };
  return dv;
}
async function login(dv, pass) {
  var k = await S.deriveKeys(pass, ITER), cfg = await S.openConfig(SEALED, k.cfgKey);
  var rec = { docId: k.docId, dataKey: k.dataKey, cfg: cfg, v1Id: k.v1Id };
  await dv.kv.set('keys', rec); dv.store.set('mig', 'M2');
  return rec;
}
async function serverData(fs, rec) { var d = fs.docs[rec.docId]; var b = S.parseDoc({ fields: d.fields }); return (await S.open(rec.dataKey, rec.docId, b.iv, b.ct)).data; }
function rnd(seed) { return function () { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; }; }

(async function () {
  /* ---- keys ---- */
  var real = await S.deriveKeys('Correct, Horse!');
  eq('docId is 64 hex', /^[0-9a-f]{64}$/.test(real.docId), true);
  eq('same id as node crypto (seal-config)', real.docId, nodeKeys('correct horse', S.ITER).docId);
  eq('"Correct, Horse!" = "correct horse"', (await S.deriveKeys('correct horse')).docId, real.docId);
  eq('v1 id unchanged', real.v1Id, nc.createHash('sha256').update('lift-sync:correct horse').digest('hex'));
  eq('other password, other id', (await S.deriveKeys('battery staple', ITER)).docId !== (await S.deriveKeys('correct horse', ITER)).docId, true);

  /* ---- config ---- */
  var kA = await S.deriveKeys('correct horse', ITER), kB = await S.deriveKeys('battery staple', ITER);
  eq('config opens with the password', await S.openConfig(SEALED, kA.cfgKey), CFG);
  eq('config refuses another password', await S.openConfig(SEALED, kB.cfgKey).then(function () { return 'opened'; }, function () { return 'refused'; }), 'refused');
  var two = { v: 2, entries: [sealCfg('battery staple', ITER, CFG), SEALED.entries[0]] };
  eq('--add: either password opens', [await S.openConfig(two, kA.cfgKey), await S.openConfig(two, kB.cfgKey)], [CFG, CFG]);

  /* ---- encryption ---- */
  var obj = { fmt: 2, data: { weight: { '2026-10-01': 112.4 } } };
  var box = await S.seal(kA.dataKey, kA.docId, obj);
  eq('round trip', await S.open(kA.dataKey, kA.docId, box.iv, box.ct), obj);
  function fails2(p) { return p.then(function () { return 'opened'; }, function () { return 'refused'; }); }
  eq('wrong key refused', await fails2(S.open(kB.dataKey, kA.docId, box.iv, box.ct)), 'refused');
  eq('wrong doc (AAD) refused', await fails2(S.open(kA.dataKey, kB.docId, box.iv, box.ct)), 'refused');
  var flip = box.ct.slice(); flip[5] ^= 1;
  eq('flipped bit refused', await fails2(S.open(kA.dataKey, kA.docId, box.iv, flip)), 'refused');
  eq('doc fields round trip', S.parseDoc({ fields: S.docFields(box) }).ct.length, box.ct.length);
  var big = { data: { daily: {} } }; for (var i = 0; i < 2000; i++) big.data.daily['d' + i] = { sleep: 7.5, steps: 8000 };
  eq('gzip keeps a year small', (await S.seal(kA.dataKey, kA.docId, big)).ct.length < JSON.stringify(big).length / 4, true);

  /* ---- merge ---- */
  var M = S.merge3;
  eq('only local changed', M({ a: 1 }, { a: 2 }, { a: 1 }), { a: 2 });
  eq('only remote changed', M({ a: 1 }, { a: 1 }, { a: 3 }), { a: 3 });
  eq('both changed: local wins', M({ a: 1 }, { a: 2 }, { a: 3 }), { a: 2 });
  eq('both changed objects merge per key', M({ s: { x: 1, y: 1 } }, { s: { x: 2, y: 1 } }, { s: { x: 1, y: 3 } }), { s: { x: 2, y: 3 } });
  eq('delete vs unchanged: deleted', M({ a: 1, b: 2 }, { a: 1 }, { a: 1, b: 2 }), { a: 1 });
  eq('remote delete vs unchanged: deleted', M({ a: 1, b: 2 }, { a: 1, b: 2 }, { a: 1 }), { a: 1 });
  eq('delete vs modified: modified stays', M({ a: 1, b: 2 }, { a: 1 }, { a: 1, b: 5 }), { a: 1, b: 5 });
  eq('modified vs delete: modified stays', M({ a: 1, b: 2 }, { a: 1, b: 5 }, { a: 1 }), { a: 1, b: 5 });
  eq('both added different keys', M({}, { a: 1 }, { b: 2 }), { a: 1, b: 2 });
  eq('key order does not matter', M({ a: { x: 1, y: 2 } }, { a: { y: 2, x: 1 } }, { a: { x: 1, y: 2 } }), { a: { x: 1, y: 2 } });

  /* ---- guard ---- */
  function st(sessions, weight) { return S.shape({ sessions: sessions || {}, weight: weight || {} }); }
  function many(n, p) { var o = {}; for (var j = 0; j < n; j++) o[(p || 'k') + j] = j; return o; }
  var g = S.guard(st(null, many(12)), st(null, {}), st(null, many(12)));
  eq('empty local section is replaced by base', Object.keys(g.local.weight).length, 12);
  g = S.guard(st(null, many(12)), { profile: {} }, st(null, many(12)));
  eq('missing local section is replaced by base', Object.keys(g.local.weight).length, 12);
  g = S.guard(st(null, many(12)), st(null, many(6)), st(null, many(12)));
  eq('more than 5 local deletions are undone', [Object.keys(g.local.weight).length, g.kept], [12, 6]);
  g = S.guard(st(null, many(12)), st(null, many(7)), st(null, many(12)));
  eq('5 local deletions go through', [Object.keys(g.local.weight).length, g.kept], [7, 0]);
  g = S.guard(st(null, many(12)), st(null, many(12)), st(null, many(5)));
  eq('remote lost over half of 10+: deletions ignored', Object.keys(g.remote.weight).length, 12);
  g = S.guard(st(null, many(8)), st(null, many(8)), st(null, many(2)));
  eq('small base: remote deletions stand', Object.keys(g.remote.weight).length, 2);
  eq('base {} never deletes', S.merge3({}, st(null, many(3, 'a')), st(null, many(3, 'b'))).weight, Object.assign(many(3, 'a'), many(3, 'b')));

  /* ---- two devices against the fake server ---- */
  var fs = FakeFS(), A = device(fs, 'A'), B = device(fs, 'B');
  var recA = await login(A, 'correct horse'); await login(B, 'correct horse');
  A.state.weight['2026-10-01'] = 112; A.engine(); await A.eng.start(recA); await A.eng.idle();
  B.engine(); await B.eng.start(await B.kv.get('keys')); await B.eng.idle();
  eq('B gets A\'s data', B.state.weight, { '2026-10-01': 112 });
  eq('server holds only v, iv, ct', Object.keys(fs.docs[recA.docId].fields).sort(), ['ct', 'iv', 'v']);
  B.eng.start(await B.kv.get('keys')); await B.eng.idle();
  eq('start twice: one poll timer', B.timers, 1);
  A.state.weight['2026-10-02'] = 111.8; B.state.daily['2026-10-02'] = { sleep: 7 };
  await Promise.all([A.eng.syncNow(), B.eng.syncNow()]); await A.eng.syncNow(); await B.eng.syncNow();
  eq('both edits survive a clash', [A.state, B.state, await serverData(fs, recA)].map(function (x) { return [x.weight, x.daily]; }),
    [0, 1, 2].map(function () { return [{ '2026-10-01': 112, '2026-10-02': 111.8 }, { '2026-10-02': { sleep: 7 } }]; }));

  // 404 after a sync: recreated with everything, nothing deleted
  delete fs.docs[recA.docId]; await A.eng.syncNow();
  eq('404 after sync recreates the full doc', (await serverData(fs, recA)).weight, { '2026-10-01': 112, '2026-10-02': 111.8 });
  // broken local copy: base fills it in
  A.state = S.shape({}); await A.eng.syncNow();
  eq('emptied local copy is refilled, server untouched', [A.state.weight, (await serverData(fs, recA)).weight], [{ '2026-10-01': 112, '2026-10-02': 111.8 }, { '2026-10-01': 112, '2026-10-02': 111.8 }]);
  // decrypt failure: stop, never write
  var keep = clone(fs.docs[recA.docId]), w0 = fs.writes;
  var bad = S.parseDoc({ fields: fs.docs[recA.docId].fields }); bad.ct[3] ^= 1; fs.docs[recA.docId].fields = S.docFields(bad); fs.docs[recA.docId].ut = 'tx';
  A.state.weight['2026-10-03'] = 111; await A.eng.syncNow().catch(function () {});
  await A.eng.syncNow().catch(function () {});
  eq('decrypt failure: no writes, sync stopped', [fs.writes - w0, A.eng.info().stopped], [0, true]);
  fs.docs[recA.docId] = keep;

  /* ---- fuzz: two clients, random edits and syncs, interleaved ---- */
  var fuzzBad = 0;
  for (var run = 0; run < 200; run++) {
    var r = rnd(run + 1), F = FakeFS(), C = [device(F, 'A'), device(F, 'B')], alive = {}, gone = {}, dels = [0, 0];
    for (var c = 0; c < 2; c++) { var rec = await login(C[c], 'correct horse'); C[c].engine(); await C[c].eng.start(rec); }
    for (var step = 0; step < 25; step++) {
      var who = r() < 0.5 ? 0 : 1, dv = C[who], x = r();
      if (x < 0.45) { var k = dv.name + Math.floor(r() * 8); dv.state.weight[k] = Math.round(r() * 100); alive[k] = 1; delete gone[k]; }
      else if (x < 0.55) { dv.state.profile.weight = Math.round(r() * 100); }
      else if (x < 0.62 && dels[who] < 5) { var own = Object.keys(dv.state.weight).filter(function (q) { return q[0] === dv.name; }); if (own.length > 1) {   // never the last one: an emptied section counts as broken and is refilled
 var kd = own[Math.floor(r() * own.length)]; delete dv.state.weight[kd]; delete alive[kd]; gone[kd] = 1; dels[who]++; } }
      else if (x < 0.8) { await dv.eng.syncNow(); dels[who] = 0; }
      else { await Promise.all([C[0].eng.syncNow(), C[1].eng.syncNow()]); dels = [0, 0]; }
    }
    for (var round = 0; round < 2; round++) { await C[0].eng.syncNow(); await C[1].eng.syncNow(); }
    var server = await serverData(F, await C[0].kv.get('keys'));
    var ok = S.stable(C[0].state) === S.stable(C[1].state) && S.stable(C[0].state) === S.stable(server) &&
      Object.keys(alive).every(function (q) { return q in server.weight; }) && Object.keys(gone).every(function (q) { return !(q in server.weight); });
    if (!ok) { fuzzBad++; if (fuzzBad === 1) console.log('fuzz run ' + run, JSON.stringify(C[0].state.weight), JSON.stringify(C[1].state.weight), JSON.stringify(server.weight), alive, gone); }
  }
  eq('200 fuzz runs converge, nothing lost', fuzzBad, 0);

  /* ---- migration from v1, with a crash at every step ---- */
  async function v1Setup() {
    var fs1 = FakeFS(), D = device(fs1, 'P'), k = await S.deriveKeys('correct horse', ITER);
    var server1 = S.shape({ weight: { '2026-10-01': 112 }, sessions: { '2026-10-06': { day: 'A', done: true, ex: [] } } });
    fs1.docs[k.v1Id] = { fields: { v: { integerValue: '1' }, data: S.toFs(server1) }, ut: 'v1a' };
    D.store.set('v1base', server1);
    D.state = clone(server1); D.state.weight['2026-10-02'] = 111.5;            // pending edit from the old app
    return { fs: fs1, D: D, k: k };
  }
  var want = { weight: { '2026-10-01': 112, '2026-10-02': 111.5 }, sessions: { '2026-10-06': { day: 'A', done: true, ex: [] } } };
  for (var ci = 0, steps = ['M3', 'M4', 'sweep', 'done', null]; ci < steps.length; ci++) {
    var V = await v1Setup(), rec2 = await login(V.D, 'correct horse');
    V.D.crashAt = steps[ci]; V.D.engine(); await V.D.eng.start(rec2).catch(function () {}); await V.D.eng.idle();
    V.D.engine(); await V.D.eng.start(rec2); await V.D.eng.idle();           // relaunch resumes
    var sd = await serverData(V.fs, rec2);
    eq('migration, crash at ' + (steps[ci] || 'none') + ': v2 has everything, v1 empty, done',
      [sd.weight, sd.sessions, Object.keys(V.fs.docs[rec2.v1Id].fields).length, V.D.store.get('mig'), V.D.store.get('v1base')],
      [want.weight, want.sessions, 0, 'done', null]);
  }
  // an old app version writes to v1 after the move: the next launch copies it over
  var O = await v1Setup(), recO = await login(O.D, 'correct horse');
  O.D.engine(); await O.D.eng.start(recO); await O.D.eng.idle();
  O.fs.docs[recO.v1Id] = { fields: { v: { integerValue: '1' }, data: S.toFs({ daily: { '2026-10-03': { sleep: 6 } } }) }, ut: 'v1b' };
  O.D.engine(); await O.D.eng.start(recO); await O.D.eng.idle();
  var so = await serverData(O.fs, recO);
  eq('old-version write after the move reaches v2, v1 emptied again', [so.daily, so.weight['2026-10-02'], Object.keys(O.fs.docs[recO.v1Id].fields).length], [{ '2026-10-03': { sleep: 6 } }, 111.5, 0]);
  // a second device migrating later merges instead of overwriting
  var D2 = device(O.fs, 'Q'), rec3 = await login(D2, 'correct horse');
  D2.state.weight['2026-10-04'] = 110.9; D2.engine(); await D2.eng.start(rec3); await D2.eng.idle();
  eq('second device keeps both', Object.keys((await serverData(O.fs, rec3)).weight).sort(), ['2026-10-01', '2026-10-02', '2026-10-04']);

  /* ---- password change ---- */
  for (var pc = 0, cs = ['C5', 'C6', null]; pc < cs.length; pc++) {
    var fsP = FakeFS(), PA = device(fsP, 'A'), PB = device(fsP, 'B'), rp = await login(PA, 'correct horse');
    await login(PB, 'correct horse'); PA.state.weight['2026-10-05'] = 110;
    PA.engine(); await PA.eng.start(rp); await PA.eng.idle(); PB.engine(); await PB.eng.start(await PB.kv.get('keys')); await PB.eng.idle();
    SEALED.entries.push(sealCfg('battery staple', ITER, CFG));
    PA.crashAt = cs[pc];
    await PA.eng.changePassword('correct horse', 'battery staple').catch(function () {});
    if (cs[pc]) { PA.engine(); await PA.eng.start(await PA.kv.get('keys')); await PA.eng.idle(); }
    var nk = await S.deriveKeys('battery staple', ITER), ka = await PA.kv.get('keys');
    await PB.eng.syncNow();
    eq('password change' + (cs[pc] ? ', crash after ' + cs[pc] : '') + ': new doc, old says moved, other device notices',
      [ka.docId === nk.docId, (await serverData(fsP, ka)).weight, PB.moved > 0, await PA.kv.get('pending')],
      [true, { '2026-10-05': 110 }, true, null]);
    SEALED.entries.pop();
  }
  var fsW = FakeFS(), W = device(fsW, 'W'), rw = await login(W, 'correct horse'); W.engine(); await W.eng.start(rw); await W.eng.idle();
  eq('wrong current password', await W.eng.changePassword('wrong one', 'battery staple').then(function () { return 'ok'; }, function (e) { return e.code; }), 'wrong');
  eq('new password not sealed yet', await W.eng.changePassword('correct horse', 'battery staple').then(function () { return 'ok'; }, function (e) { return e.code; }), 'seal');

  console.log(fails ? fails + ' FAILED' : 'all ok');
  process.exit(fails ? 1 : 0);
})().catch(function (e) { console.error(e); process.exit(1); });
