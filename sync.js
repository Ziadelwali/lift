/* Lift sync v2: end-to-end encrypted, one Firestore document per password.

   Keys:  master  = PBKDF2-SHA256(norm(password), "lift-sync/v2/salt", 600k)
          HKDF(master) -> docId (64 hex), dataKey (AES-GCM), cfgKey (AES-GCM, opens fbconfig.js)
   Doc:   {v:2, iv:bytes(12), ct:bytes}; ct = AES-GCM(flag byte + gzip(JSON payload)), AAD "lift/v2/"+docId
          payload {fmt:2, at, dev, data, mig?, moved?}
   Merge: three-way per record (base = what this device last agreed with the server), after guard()
          has refused anything that looks like mass deletion.
   Push:  whole document with an updateTime precondition; on a clash pull, merge, try again.

   Pure parts are tested in node (tools/test-sync.js). Loaded before engine.js. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SYNC2 = factory();
})(this, function () {
  'use strict';
  var G = typeof globalThis !== 'undefined' ? globalThis : self;
  var SUB = G.crypto && G.crypto.subtle;
  var te = new TextEncoder(), td = new TextDecoder();
  var SECTIONS = ['profile', 'sessions', 'weight', 'daily', 'settings'];
  var ITER = 600000, SALT = 'lift-sync/v2/salt', HKDF_SALT = 'lift-sync/v2/hkdf';
  var MAX_CT = 900000;

  /* ---------- small helpers ---------- */
  function norm(s) { return String(s || '').toLowerCase().replace(/[^a-z]+/g, ' ').trim(); }
  function hex(u8) { return Array.prototype.map.call(u8, function (b) { return ('0' + b.toString(16)).slice(-2); }).join(''); }
  function b64(u8) { var s = ''; for (var i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); }
  function unb64(s) { var r = atob(s), u = new Uint8Array(r.length); for (var i = 0; i < r.length; i++) u[i] = r.charCodeAt(i); return u; }
  function isObj(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
  /* JSON with sorted keys: equal data gives an equal string whatever the key order */
  function stable(v) {
    if (v === undefined) return undefined;
    if (!isObj(v)) return Array.isArray(v) ? '[' + v.map(function (x) { var s = stable(x); return s === undefined ? 'null' : s; }).join(',') + ']' : JSON.stringify(v);
    return '{' + Object.keys(v).sort().filter(function (k) { return v[k] !== undefined; }).map(function (k) { return JSON.stringify(k) + ':' + stable(v[k]); }).join(',') + '}';
  }
  function same(a, b) { return stable(a) === stable(b); }
  function clone(v) { return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); }
  /* the five sections, each a plain object; anything else dropped */
  function shape(st) { var o = {}; SECTIONS.forEach(function (s) { o[s] = st && isObj(st[s]) ? st[s] : {}; }); return o; }
  async function sha256hex(txt) { return hex(new Uint8Array(await SUB.digest('SHA-256', te.encode(txt)))); }
  function hash32(txt) { var h = 0x811c9dc5; for (var i = 0; i < txt.length; i++) { h ^= txt.charCodeAt(i); h = Math.imul(h, 0x01000193); } return (h >>> 0).toString(36); }

  /* ---------- keys ---------- */
  async function deriveKeys(pass, iter) {
    var p = norm(pass);
    var base = await SUB.importKey('raw', te.encode(p), 'PBKDF2', false, ['deriveBits']);
    var master = await SUB.deriveBits({ name: 'PBKDF2', salt: te.encode(SALT), iterations: iter || ITER, hash: 'SHA-256' }, base, 256);
    var hk = await SUB.importKey('raw', master, 'HKDF', false, ['deriveBits', 'deriveKey']);
    function info(i) { return { name: 'HKDF', hash: 'SHA-256', salt: te.encode(HKDF_SALT), info: te.encode(i) }; }
    var id = await SUB.deriveBits(info('lift/v2/doc'), hk, 256);
    var dataKey = await SUB.deriveKey(info('lift/v2/data'), hk, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    var cfgKey = await SUB.deriveKey(info('lift/v2/cfg'), hk, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
    return { docId: hex(new Uint8Array(id)), dataKey: dataKey, cfgKey: cfgKey, v1Id: await sha256hex('lift-sync:' + p) };
  }
  /* fbconfig.js: FB_SEALED2 = {v:2, entries:[{iv,data}]}; any entry the password opens will do
     (two entries while a password change is being rolled out) */
  async function openConfig(sealed, cfgKey) {
    if (!sealed || sealed.v !== 2 || !Array.isArray(sealed.entries)) throw new Error('no sealed config');
    for (var i = 0; i < sealed.entries.length; i++) {
      try {
        var e = sealed.entries[i];
        var buf = await SUB.decrypt({ name: 'AES-GCM', iv: unb64(e.iv), additionalData: te.encode('lift/v2/cfg') }, cfgKey, unb64(e.data));
        return JSON.parse(td.decode(buf));
      } catch (err) { /* next entry */ }
    }
    throw new Error('config did not open');
  }

  /* ---------- payload encryption ---------- */
  async function pipe(u8, stream) { return new Uint8Array(await new Response(new Blob([u8]).stream().pipeThrough(stream)).arrayBuffer()); }
  async function pack(obj) {
    var raw = te.encode(JSON.stringify(obj)), body = raw, flag = 0;
    if (typeof CompressionStream === 'function') { body = await pipe(raw, new CompressionStream('gzip')); flag = 1; }
    var out = new Uint8Array(body.length + 1); out[0] = flag; out.set(body, 1); return out;
  }
  async function unpack(u8) {
    var body = u8.subarray(1);
    if (u8[0] === 1) body = await pipe(body, new DecompressionStream('gzip'));
    else if (u8[0] !== 0) throw new Error('unknown payload format');
    return JSON.parse(td.decode(body));
  }
  async function seal(dataKey, docId, obj) {
    var iv = G.crypto.getRandomValues(new Uint8Array(12));
    var ct = new Uint8Array(await SUB.encrypt({ name: 'AES-GCM', iv: iv, additionalData: te.encode('lift/v2/' + docId) }, dataKey, await pack(obj)));
    return { iv: iv, ct: ct };
  }
  async function open(dataKey, docId, iv, ct) {
    var buf = await SUB.decrypt({ name: 'AES-GCM', iv: iv, additionalData: te.encode('lift/v2/' + docId) }, dataKey, ct);
    return unpack(new Uint8Array(buf));
  }
  function docFields(box) { return { v: { integerValue: '2' }, iv: { bytesValue: b64(box.iv) }, ct: { bytesValue: b64(box.ct) } }; }
  function parseDoc(doc) {
    var f = doc && doc.fields || {};
    if (!f.v || +f.v.integerValue !== 2 || !f.iv || !f.ct) return null;
    return { iv: unb64(f.iv.bytesValue || ''), ct: unb64(f.ct.bytesValue || '') };
  }

  /* ---------- Firestore REST values (the v1 document is stored this way) ---------- */
  function toFs(v) {
    if (v === null || v === undefined) return { nullValue: null };
    if (typeof v === 'boolean') return { booleanValue: v };
    if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
    if (typeof v === 'string') return { stringValue: v };
    if (Array.isArray(v)) return { arrayValue: { values: v.map(toFs) } };
    var f = {}; Object.keys(v).forEach(function (k) { if (v[k] !== undefined) f[k] = toFs(v[k]); });
    return { mapValue: { fields: f } };
  }
  function fromFs(v) {
    if (!v || 'nullValue' in v) return null;
    if ('booleanValue' in v) return v.booleanValue;
    if ('integerValue' in v) return +v.integerValue;
    if ('doubleValue' in v) return v.doubleValue;
    if ('stringValue' in v) return v.stringValue;
    if ('timestampValue' in v) return v.timestampValue;
    if ('arrayValue' in v) return (v.arrayValue.values || []).map(fromFs);
    if ('mapValue' in v) { var o = {}, f = v.mapValue.fields || {}; Object.keys(f).forEach(function (k) { o[k] = fromFs(f[k]); }); return o; }
    return null;
  }
  function v1Data(doc) { var f = doc && doc.fields; return f && f.data ? shape(fromFs(f.data)) : null; }

  /* ---------- merge ---------- */
  /* One side changed: take it. Both changed: plain objects are merged key by key, otherwise this
     device wins. Deleted vs unchanged: deleted. Deleted vs changed: the changed value stays. */
  function merge3(base, local, remote, log, path) {
    path = path || '';
    if (same(local, remote)) return clone(local);
    if (same(local, base)) return clone(remote);
    if (same(remote, base)) return clone(local);
    if (isObj(local) && isObj(remote)) {
      var b = isObj(base) ? base : {}, out = {}, keys = Object.keys(local);
      Object.keys(remote).forEach(function (k) { if (keys.indexOf(k) < 0) keys.push(k); });
      keys.forEach(function (k) { var v = merge3(b[k], local[k], remote[k], log, path + '/' + k); if (v !== undefined) out[k] = v; });
      return out;
    }
    if (local === undefined) { if (log) log('kept ' + path + ' (changed elsewhere)'); return clone(remote); }
    if (remote !== undefined && log) log('both changed ' + path + ': this device wins');
    return clone(local);
  }
  /* Before merging, refuse what looks like breakage rather than intent:
     - an empty or broken local section is replaced by base
     - more than 5 local deletions at once are undone ("kept N records")
     - a remote section holding under half of a base of 10+ records has its deletions ignored
     A base of {} never deletes anything (merge3 then simply unites both sides). */
  function guard(base, local, remote) {
    base = shape(base); var L = shape(clone(local)), R = shape(clone(remote)), notes = [], kept = 0;
    SECTIONS.forEach(function (s) {
      var b = base[s], nb = Object.keys(b).length;
      if (!(local && isObj(local[s])) || (!Object.keys(L[s]).length && nb)) { if (nb) { L[s] = clone(b); notes.push('local ' + s + ' was empty: kept'); } }
      var still = Object.keys(b).filter(function (k) { return k in R[s]; }).length;
      if (nb >= 10 && still < nb * 0.5) {
        Object.keys(b).forEach(function (k) { if (!(k in R[s])) R[s][k] = clone(b[k]); });
        notes.push('remote ' + s + ' lost ' + (nb - still) + ' of ' + nb + ': ignored');
      }
    });
    var dels = [];
    SECTIONS.forEach(function (s) { Object.keys(base[s]).forEach(function (k) { if (!(k in L[s])) dels.push([s, k]); }); });
    if (dels.length > 5) { dels.forEach(function (d) { L[d[0]][d[1]] = clone(base[d[0]][d[1]]); }); kept = dels.length; notes.push('kept ' + kept + ' records'); }
    return { local: L, remote: R, kept: kept, notes: notes };
  }
  function recordHashes(data) { var h = {}; SECTIONS.forEach(function (s) { Object.keys(data[s] || {}).forEach(function (k) { h[s + '/' + k] = hash32(stable(data[s][k])); }); }); return h; }

  /* ---------- the sync engine ----------
     o.transport(cfg) -> {get(id,{mask}), write(id, fields, pre)}; responses {status, doc, conflict}
     o.kv: async get/set/del (IndexedDB; holds the keys)   o.store: sync get/set/del (localStorage; no secrets)
     o.getLocal() / o.setLocal(state)   o.status(text, live)   o.log(text)   o.notice(text)
     o.onMoved()   o.every(ms, fn)   o.sleep(ms)   o.dev   o.loadSealed(fresh)   o.iter */
  function createSync(o) {
    var S = { keys: null, t: null, q: Promise.resolve(), queued: false, started: null, stopped: false, mig: null };
    var sleep = o.sleep || function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
    function log(t) { if (o.log) o.log(t); }
    function status(t, live) { if (o.status) o.status(t, live); }
    function enqueue(fn) {
      var p = S.q.then(function () { if (!S.stopped) return fn(); });
      S.q = p.catch(function (e) { log('error: ' + (e && e.message)); handleError(e); });
      return p;
    }
    function handleError(e) {
      if (e && e.code === 'decrypt') { S.stopped = true; status('Can’t read the synced copy — sync stopped, nothing sent', false); }
      else if (e && e.code === 'http') status('Sync rejected (' + e.status + ') — saved here', false);
      else if (e && e.code === 'big') status('Too much data to sync — saved here', false);
      else status('Offline — syncs later', false);
    }
    function httpErr(r) { var e = new Error('HTTP ' + r.status); e.code = 'http'; e.status = r.status; return e; }
    async function readDoc(id, key) {
      var r = await S.t.get(id, {});
      if (r.status === 404) return { exists: false };
      if (r.status !== 200) throw httpErr(r);
      var box = parseDoc(r.doc), payload;
      if (!box) return { exists: true, ut: r.doc.updateTime, payload: null };
      try { payload = await open(key || S.keys.dataKey, id, box.iv, box.ct); }
      catch (err) { var e = new Error('decrypt failed'); e.code = 'decrypt'; throw e; }
      return { exists: true, ut: r.doc.updateTime, payload: payload };
    }
    async function writeDoc(id, key, payload, pre) {
      var box = await seal(key || S.keys.dataKey, id, payload);
      if (box.ct.length > MAX_CT) { var e = new Error('too big'); e.code = 'big'; throw e; }
      var r = await S.t.write(id, docFields(box), pre);
      if (r.conflict) return null;
      if (r.status !== 200) throw httpErr(r);
      return r.doc.updateTime;
    }
    function payloadOf(data, extra) { var p = { fmt: 2, at: new Date().toISOString(), dev: o.dev || '', data: data }; if (S.mig) p.mig = S.mig; return Object.assign(p, extra || {}); }
    function base2() { return shape(o.store.get('base2')); }
    /* take the merged copy in, keeping edits made on this device while the network was busy */
    function adopt(snap, merged) {
      var cur = shape(o.getLocal());
      if (!same(cur, snap)) { o.setLocal(merge3(snap, cur, merged)); kick(); }
      else if (!same(cur, merged)) o.setLocal(clone(merged));
    }

    /* pull, merge, push - repeated when another device wrote in between */
    async function syncOnce(force, changing) {
      for (var attempt = 0; attempt < 5; attempt++) {
        var snap = clone(shape(o.getLocal())), base = base2(), ut = o.store.get('ut') || null, remote, rut = null, exists = true;
        var m = await S.t.get(S.keys.docId, { mask: true });
        if (m.status === 404) { exists = false; remote = base; }              // gone or new: recreate, never "delete everything"
        else if (m.status !== 200) throw httpErr(m);
        else if (m.doc.updateTime === ut && !force) { remote = base; rut = ut; }   // unchanged since we last saw it
        else {
          var d = await readDoc(S.keys.docId);
          if (!d.exists) { exists = false; remote = base; }
          else {
            rut = d.ut;
            if (d.payload && d.payload.moved) { if (changing) return 'moved'; S.stopped = true; status('Password changed on another device', false); if (o.onMoved) o.onMoved(); return; }
            if (d.payload && d.payload.mig) S.mig = d.payload.mig;
            remote = d.payload ? shape(d.payload.data) : base;
          }
        }
        var g = guard(base, snap, remote);
        g.notes.forEach(log); if (g.kept && o.notice) o.notice('Kept ' + g.kept + ' records');
        var merged = merge3(base, g.local, g.remote, log);
        if (force || !exists || !same(merged, remote)) {
          var nut = await writeDoc(S.keys.docId, null, payloadOf(merged), exists ? { updateTime: rut } : { exists: false });
          if (!nut) { log('clash, retrying'); await sleep(Math.min(8000, 500 * Math.pow(2, attempt)) * (0.5 + Math.random() / 2)); continue; }
          rut = nut; log('pushed');
        }
        o.store.set('base2', merged); o.store.set('ut', rut);
        adopt(snap, merged);
        status('Live sync on', true);
        return true;
      }
      status('Busy — will sync later', false);
      return false;
    }

    /* ---- one-time move from the v1 (plaintext) document; every step can be repeated ---- */
    function setMig(st) { o.store.set('mig', st); log('migration: ' + st); if (o.crash && o.crash(st)) throw new Error('crash at ' + st); }
    async function migrate() {
      var st = o.store.get('mig');
      if (st === 'M2' || st === 'M3' || st === 'M4') {
        setMig('M3');
        for (var attempt = 0; ; attempt++) {
          var v2 = await readDoc(S.keys.docId);                                   // M3
          if (v2.exists && v2.payload && v2.payload.moved) { S.stopped = true; if (o.onMoved) o.onMoved(); return; }
          var v1 = S.keys.v1Id ? await S.t.get(S.keys.v1Id, {}) : { status: 404 };
          if (v1.status !== 200 && v1.status !== 404) throw httpErr(v1);
          var v1d = v1.status === 200 ? v1Data(v1.doc) : null;
          var remote = v2.exists && v2.payload ? shape(v2.payload.data) : (v1d || shape({}));
          var base = shape(o.store.get('v1base')), snap = clone(shape(o.getLocal()));
          var g = guard(base, snap, remote), merged = merge3(base, g.local, g.remote, log);
          if (!(v2.exists && v2.payload && v2.payload.mig)) S.mig = { t1: v1.status === 200 ? v1.doc.updateTime : null, h: v1d ? recordHashes(v1d) : {} };
          setMig('M4');
          var nut = await writeDoc(S.keys.docId, null, payloadOf(merged), v2.exists ? { updateTime: v2.ut } : { exists: false });
          if (!nut) { if (attempt >= 4) throw new Error('migration clash'); await sleep(500 * Math.pow(2, attempt)); setMig('M3'); continue; }
          o.store.set('base2', merged); o.store.set('ut', nut); o.store.del('v1base');   // M5
          adopt(snap, merged);
          setMig('sweep');
          break;
        }
      }
    }
    /* Old app versions still write to v1. Copy anything new there into v2 (records whose hash
       differs from what v2 already took in), then empty v1 - only if nobody wrote in between. */
    async function sweep() {
      if (!S.keys.v1Id) { o.store.set('mig', 'done'); return; }
      for (var attempt = 0; attempt < 5; attempt++) {
        var v1 = await S.t.get(S.keys.v1Id, {});
        if (v1.status === 404) { setMig('done'); return; }
        if (v1.status !== 200) throw httpErr(v1);
        var d = v1Data(v1.doc);
        if (!d || !SECTIONS.some(function (s) { return Object.keys(d[s]).length; })) { setMig('done'); return; }
        var h = (S.mig && S.mig.h) || {}, cur = shape(clone(o.getLocal())), n = 0;
        SECTIONS.forEach(function (s) { Object.keys(d[s]).forEach(function (k) { if (h[s + '/' + k] !== hash32(stable(d[s][k]))) { cur[s][k] = d[s][k]; n++; } }); });
        if (n) { log('sweep: ' + n + ' records from an old app version'); o.setLocal(cur); }
        S.mig = { t1: v1.doc.updateTime, h: recordHashes(d) };                     // taken in: a retry only copies what changes after this
        if (!(await syncOnce(true))) return;                                       // in v2 before v1 is emptied
        var r = await S.t.write(S.keys.v1Id, {}, { updateTime: v1.doc.updateTime });
        if (r.conflict) { log('sweep: old version wrote meanwhile'); continue; }
        if (r.status !== 200) throw httpErr(r);
        S.mig = { t1: v1.doc.updateTime, h: {} };                                  // v1 is empty: anything that shows up there later is new
        setMig('done'); return;
      }
    }

    /* ---- password change: every step can be resumed after a crash ---- */
    async function finishChange(p) {
      var ok = await syncOnce(false, true);                                        // 4. current data in the old doc
      if (ok === 'moved') return swapKeys(p);                                      // steps 5 and 6 were done before a crash
      if (!ok) throw new Error('busy');
      var data = base2();
      for (var attempt = 0; attempt < 5; attempt++) {                              // 5. the new doc
        var nd = await readDoc(p.docId, p.dataKey);
        var merged = nd.exists && nd.payload && !nd.payload.moved ? merge3({}, data, shape(nd.payload.data)) : data;
        var nut = await writeDoc(p.docId, p.dataKey, payloadOf(merged), nd.exists ? { updateTime: nd.ut } : { exists: false });
        if (nut) break; if (attempt === 4) throw new Error('busy');
      }
      if (o.crash && o.crash('C5')) throw new Error('crash at C5');
      for (attempt = 0; attempt < 5; attempt++) {                                  // 6. old doc says "moved"
        var od = await readDoc(S.keys.docId);
        if (od.exists && od.payload && od.payload.moved) break;
        if (od.exists && od.payload && !same(shape(od.payload.data), data)) {
          // another device wrote to the old doc meanwhile: take that along to the new one first
          data = merge3(base2(), data, shape(od.payload.data));
          var nd2 = await readDoc(p.docId, p.dataKey);
          var w2 = await writeDoc(p.docId, p.dataKey, payloadOf(merge3({}, data, shape(nd2.payload && nd2.payload.data))), nd2.exists ? { updateTime: nd2.ut } : { exists: false });
          if (!w2) continue;
        }
        var mv = await writeDoc(S.keys.docId, null, { fmt: 2, at: new Date().toISOString(), moved: true }, od.exists ? { updateTime: od.ut } : { exists: false });
        if (mv) break; if (attempt === 4) throw new Error('busy');
      }
      if (o.crash && o.crash('C6')) throw new Error('crash at C6');
      return swapKeys(p);
    }
    async function swapKeys(p) {
      var rec = { docId: p.docId, dataKey: p.dataKey, cfg: p.cfg, v1Id: S.keys.v1Id };   // old app versions keep using the old v1 doc
      await o.kv.set('keys', rec); await o.kv.del('pending');
      S.keys = rec; o.store.del('ut');
      await syncOnce();
    }
    async function changePassword(cur, nw) {
      var kc = await deriveKeys(cur, o.iter);
      if (kc.docId !== S.keys.docId) { var e = new Error('wrong'); e.code = 'wrong'; throw e; }
      var kn = await deriveKeys(nw, o.iter), cfg;
      try { cfg = await openConfig(await o.loadSealed(true), kn.cfgKey); }
      catch (err) { var e2 = new Error('not sealed'); e2.code = 'seal'; throw e2; }
      if (kn.docId === kc.docId) return;
      var p = { docId: kn.docId, dataKey: kn.dataKey, cfg: cfg };
      await o.kv.set('pending', p);
      return enqueue(function () { return finishChange(p); });
    }

    function kick() { if (S.queued || !S.keys) return; S.queued = true; enqueue(function () { S.queued = false; return syncOnce(); }); }
    function start(keys) {
      if (S.started) return S.started;                                             // once: a second call would double the polling
      S.keys = keys; S.t = o.transport(keys.cfg);
      S.started = enqueue(async function () {
        var p = o.kv && await o.kv.get('pending');
        if (p) { log('finishing a password change'); await finishChange(p); }
        await migrate();
        await syncOnce();
        if (o.store.get('mig') !== 'done' || !S.swept) { S.swept = true; await sweep(); }
      });
      if (o.every) o.every(45000, function () { kick(); });
      return S.started;
    }
    return {
      start: start, kick: kick, changePassword: changePassword,
      syncNow: function (force) { return enqueue(function () { return syncOnce(force); }); },
      idle: function () { return S.q; }, stop: function () { S.stopped = true; },
      info: function () { return { mig: o.store.get('mig'), stopped: S.stopped }; }
    };
  }

  return {
    SECTIONS: SECTIONS, ITER: ITER, norm: norm, deriveKeys: deriveKeys, openConfig: openConfig, seal: seal, open: open,
    docFields: docFields, parseDoc: parseDoc, toFs: toFs, fromFs: fromFs, merge3: merge3, guard: guard, stable: stable,
    shape: shape, recordHashes: recordHashes, createSync: createSync, b64: b64, unb64: unb64
  };
});
