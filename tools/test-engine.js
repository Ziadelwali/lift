/* node tools/test-engine.js - scripted histories through the suggestion engine */
'use strict';
var E = require('../engine.js');
var fails = 0;
function eq(name, got, want) {
  var ok = JSON.stringify(got) === JSON.stringify(want);
  console.log((ok ? 'ok   ' : 'FAIL ') + name + (ok ? '' : '  got ' + JSON.stringify(got) + ' want ' + JSON.stringify(want)));
  if (!ok) fails++;
}
var cfg = { id: 'X', sets: 3, reps: [8, 12], inc: 2.5 };
function h(sets) { return { date: '2026-01-01', sets: sets.map(function (s) { return { kg: s[0], reps: s[1], rir: s[2], done: true }; }) }; }

eq('calibrate', E.suggest(cfg, []).state, 'calibrate');
eq('calibrate sets', E.suggest(cfg, [], { calibration: true }).sets, 2);
eq('push', E.suggest(cfg, [h([[40, 10, 2], [40, 9, 1], [40, 9, 1]])]), { kg: 40, reps: 10, sets: 3, state: 'push', note: 'Same weight. Beat last time: 10 reps on every set.' });
eq('up', E.suggest(cfg, [h([[40, 12, 2], [40, 12, 1], [40, 12, 0]])]).kg, 42.5);
eq('up reps', E.suggest(cfg, [h([[40, 12, 2], [40, 12, 1], [40, 12, 0]])]).reps, 8);
eq('hold', E.suggest(cfg, [h([[42.5, 8, 1], [42.5, 7, 0], [42.5, 6, 0]])]).state, 'hold');
eq('drop', E.suggest(cfg, [h([[42.5, 7, 0], [42.5, 7, 0]]), h([[42.5, 8, 1], [42.5, 7, 0]])]).kg, 37.5);
eq('deload', E.suggest(cfg, [h([[40, 10, 2]])], { deload: true }), { kg: 35, reps: 8, sets: 2, state: 'deload', note: 'Deload: lighter, fewer sets, stop with 3–4 reps in reserve. Recovery is the point.' });
eq('ramp', E.rampSets(80), [{ kg: 40, reps: 8 }, { kg: 55, reps: 5 }, { kg: 67.5, reps: 2 }]);

var prof = { sex: 'm', age: 38, height: 186, weight: 112, activity: 'feet', phase: 'lean', priority: ['shoulders', 'back'], sched: { 1: '16:00', 3: '16:00', 5: '16:00' }, wake: '06:30', bed: '22:30' };
var m = E.macros(prof);
eq('bmr', m.bmr, 2098);
eq('protein high-bmi', m.protein, 179);
console.log('macros', m);

var st = { profile: prof, sessions: {}, weight: {}, daily: {}, settings: {} };
var p = E.plan('2026-09-21', st); // Monday
eq('plan monday A', [p.training, p.day, p.calibration, p.week], [true, 'A', true, 1]);
eq('plan tuesday rest', E.plan('2026-09-22', st).training, false);
eq('exercises A count', p.exercises.length, 9);
eq('exercises A no prio', E.exercisesFor('A', { priority: [] }).length, 8);
eq('exercises A default prio', E.exercisesFor('A', {}).length, 9);
var ses = E.buildSession(p, st);
eq('session sets calib', ses.ex[0].sets.length, 2);
// complete 3 sessions → week 2, day B next
['2026-09-21', '2026-09-23', '2026-09-25'].forEach(function (d, i) {
  var pp = E.plan(d, st), s = E.buildSession(pp, st);
  s.ex.forEach(function (e) { e.sets.forEach(function (x) { x.kg = 40; x.reps = 12; x.rir = 1; x.done = true; }); });
  s.done = true; st.sessions[d] = s;
});
var p4 = E.plan('2026-09-28', st);
eq('week 2 day B', [p4.day, p4.week, p4.calibration], ['B', 2, false]);
var s4 = E.buildSession(p4, st);
eq('week 2 hack squat up', s4.ex[0].suggest.state, 'up');
eq('week 2 hack squat kg', s4.ex[0].suggest.kg, 45);

var tl = E.timeline(prof, E.plan('2026-09-21', st), m).map(function (s) { return s.time + ' ' + s.label; });
console.log(tl.join('\n'));
eq('timeline morning protein 07:30', tl.indexOf('07:30 Morning protein') >= 0, true);
eq('timeline lunch at 11:30', tl.indexOf('11:30 Meal 1 (lunch)') >= 0, true);
eq('nothing after 19:30 (bed 22:30)', E.timeline(prof, E.plan('2026-09-21', st), m).concat(E.timeline(prof, E.plan('2026-09-22', st), m)).filter(function (x) { return x.t > E.hm('19:30'); }).length, 0);
eq('timeline shake at 17:10', tl.indexOf('17:10 Protein shake') >= 0, true);
eq('timeline meal 2 at 18:45', tl.indexOf('18:45 Meal 2 (dinner)') >= 0, true);
eq('timeline 2 meals + 2 shakes', tl.filter(function (x) { return /Meal \d|shake|Morning protein/i.test(x); }).length, 4);

// simple eating: every portion reaches the meal's protein; 3 cooks cover 12 of 14 meals a week
var tgt = E.mealTargets(m);
eq('portions reach protein', E.RECIPES.filter(function (r) { return E.portion(r, tgt.P, tgt.kcal).P < tgt.P; }).map(function (r) { return r.key; }), []);
eq('portions near kcal', E.RECIPES.filter(function (r) { return Math.abs(E.portion(r, tgt.P, tgt.kcal).kcal - tgt.kcal) > 120; }).map(function (r) { return r.key; }), []);
var nocook = 0, keys = {};
for (var dd = 0; dd < 14; dd++) { var di = E.isoDate(new Date(2026, 8, 27 + dd)); [1, 2].forEach(function (ml) { var bb = E.batchFor(prof, di, ml); if (!bb) nocook++; else if (bb.cookToday) keys[di] = bb.recipe.key; }); }
eq('no-cook meals in 2 weeks', nocook, 4);
eq('cook days rotate recipes', Object.keys(keys).length === 6 && Object.keys(keys).map(function (k) { return keys[k]; }).slice(0, 3).filter(function (v, i, a) { return a.indexOf(v) === i; }).length, 3);

// weight trend
var w = {}; for (var i = 0; i < 21; i++) { var d = new Date(2026, 8, 1 + i); w[E.isoDate(d)] = 112 - i * 0.07; }
st.weight = w;
var ta = E.trendAdvice(st);
eq('trend rate ~-0.49', Math.round(ta.rate * 100) / 100, -0.49);
eq('trend in band', ta.adj, 0);


// ---- REST codec ----
(function(){
 var E2=require('../engine.js'),fails2=0;
 function eq2(n,g,w){var ok=JSON.stringify(g)===JSON.stringify(w);console.log((ok?'ok   ':'FAIL ')+n+(ok?'':'  got '+JSON.stringify(g)+' want '+JSON.stringify(w)));if(!ok)fails2++;}
 var obj={a:1,b:1.5,c:'x',d:null,e:true,f:[1,'y',{g:2}],h:{'2026-09-21':{kg:112.5}}};
 eq2('codec roundtrip',E2.fromFs(E2.toFs(obj)),obj);
 eq2('seg plain',E2.fsSeg('profile'),'profile');
 eq2('seg date',E2.fsSeg('2026-09-21'),'`2026-09-21`');
 var p=E2.restPatch({profile:{age:38,weight:112},weight:{'2026-09-21':112}},{profile:{age:38,height:186},weight:{}},['profile','weight']);
 eq2('patch mask',p.mask,['data.profile.weight','data.profile.height','data.weight.`2026-09-21`','v','at']);
 eq2('patch fields',Object.keys(p.fields.data.mapValue.fields),['profile','weight']);
 eq2('patch no change',E2.restPatch({profile:{a:1}},{profile:{a:1}},['profile']),null);
 if(fails2){console.log(fails2+' FAILED');process.exit(1);}console.log('codec ok');
})();

// dumbbell cap: no suggestion above the heaviest dumbbell in the gym
var db = E.findCfg('Dumbbell_Bench_Press');
eq('db up below cap', E.suggest(db, [h([[28, 10, 2], [28, 10, 2], [28, 10, 2]])]).kg, 30);
var mx = E.suggest(db, [h([[30, 10, 2], [30, 10, 2], [30, 10, 2]])]);
eq('db maxed', [mx.kg, mx.reps, mx.state], [30, 11, 'maxed']);
eq('db maxed names swap', /Machine Bench Press/.test(mx.note), true);
eq('db owned', E.suggest(db, [h([[30, 15, 2], [30, 15, 2], [30, 15, 2]])]).reps, 15);
eq('machine not capped', E.suggest(E.findCfg('Leg_Press'), [h([[100, 10, 2], [100, 10, 2], [100, 10, 2]])]).kg, 105);

// every exercise the app can show has a plain name and where/form text
var allIds = [];
E.PROGRAM.A.concat(E.PROGRAM.B).forEach(function (c) { allIds.push(c.id); (c.alts || []).forEach(function (a) { allIds.push(a); }); });
eq('all have where/form', allIds.filter(function (id) { var i = E.info(id); return !(i && i.where && i.tip); }), []);
eq('all have plain names', allIds.filter(function (id) { return !E.LABEL[id]; }), []);

var warm = [E.WARMUP.general].concat(E.WARMUP.A, E.WARMUP.B);
eq('warm-ups explain how', warm.filter(function (w) { return !(w.how && w.how.length); }).map(function (w) { return w.id; }), []);

// weekly shopping: 3 cooks, 2 no-cook meals, daily shakes; family scales the pots only
var wk = E.weekShopping(prof, '2026-09-23', m);
eq('shop: 3 cooks, 2 no-cook', [wk.cooks.length, wk.nocook], [3, 2]);
function qty(w, name) { var q = 0; w.groups.forEach(function (g) { g.items.forEach(function (it) { if (it.name === name) q += it.qty; }); }); return q; }
eq('shop: whey for 7 shakes (+ whey mornings)', qty(wk, 'whey protein') >= 280, true);
var fam = Object.assign({}, prof, { family: { adults: 1, kids: 1 } });
eq('family servings 6.4', E.batchServings(fam), 6.4);
var wkf = E.weekShopping(fam, '2026-09-23', m);
var meat = function (w) { return w.groups.filter(function (g) { return g.cat === 'meat'; })[0].items.reduce(function (s, it) { return s + (it.unit === 'g' ? it.qty : 0); }, 0); };
eq('family: more meat, same whey', [meat(wkf) > meat(wk), qty(wkf, 'whey protein') === qty(wk, 'whey protein')], [true, true]);

// variety: 8 weeks of the default cook days
var groups = [], keysByWeek = [], fishWeeks = 0, redWeeks = 0, sameTasteInARow = 0, prevMeal = null;
for (var wkn = 0; wkn < 8; wkn++) {
  var ks = [], gs = [];
  for (var dd2 = 0; dd2 < 7; dd2++) {
    var dx = E.isoDate(new Date(2026, 9, 4 + wkn * 7 + dd2));   // weeks starting Sunday 4 Oct
    [1, 2].forEach(function (ml) {
      var bb = E.batchFor(prof, dx, ml), tag = bb ? bb.recipe.key + '/' + bb.flavour : 'nocook-' + dx + ml;
      if (tag === prevMeal) sameTasteInARow++; prevMeal = tag;
      if (bb && bb.cookToday) { ks.push(bb.recipe.key); gs.push(bb.recipe.group); }
    });
  }
  keysByWeek.push(ks); if (gs.indexOf('fish') >= 0) fishWeeks++; if (gs.indexOf('red') >= 0) redWeeks++;
  groups.push(ks.filter(function (k, i) { return ks.indexOf(k) !== i; }).length);
}
eq('no recipe twice in a week', groups.filter(Boolean).length, 0);
eq('fish every week', fishWeeks, 8);
eq('red meat every other week', redWeeks, 4);
eq('never the same taste twice in a row', sameTasteInARow, 0);
var used = {}; keysByWeek.forEach(function (ks) { ks.forEach(function (k) { used[k] = 1; }); });
eq('all 9 recipes used within 8 weeks', Object.keys(used).length, 9);
eq('morning protein changes daily', E.morningFor('2026-10-05').short !== E.morningFor('2026-10-06').short, true);
eq('every recipe reaches meal protein', E.RECIPES.filter(function (r) { return E.portion(r, tgt.P, tgt.kcal).P < tgt.P; }).map(function (r) { return r.key; }), []);

console.log(fails ? fails + ' FAILED' : 'all ok');
process.exit(fails ? 1 : 0);
