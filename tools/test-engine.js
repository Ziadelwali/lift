/* node tools/test-engine.js - scripted histories through the suggestion engine */
'use strict';
process.env.TZ = 'Europe/Copenhagen';   // the DST tests need a zone with daylight-saving changes
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
eq('push', E.suggest(cfg, [h([[40, 10, 2], [40, 9, 1], [40, 9, 1]])]), { kg: 40, reps: 10, sets: 3, state: 'push', note: 'Same weight, 10 reps on every set.' });
eq('up', E.suggest(cfg, [h([[40, 12, 2], [40, 12, 1], [40, 12, 0]])]).kg, 42.5);
eq('up reps', E.suggest(cfg, [h([[40, 12, 2], [40, 12, 1], [40, 12, 0]])]).reps, 8);
eq('hold', E.suggest(cfg, [h([[42.5, 8, 1], [42.5, 7, 0], [42.5, 6, 0]])]).state, 'hold');
eq('drop', E.suggest(cfg, [h([[42.5, 7, 0], [42.5, 7, 0]]), h([[42.5, 8, 1], [42.5, 7, 0]])]).kg, 37.5);
eq('deload', E.suggest(cfg, [h([[40, 10, 2]])], { deload: true }), { kg: 35, reps: 8, sets: 2, state: 'deload', note: 'Easy week: lighter, fewer sets, 3–4 reps to spare.' });
eq('ramp', E.rampSets(80), [{ kg: 40, reps: 8 }, { kg: 55, reps: 5 }, { kg: 67.5, reps: 2 }]);
eq('ramp on dumbbells uses real dumbbells (2 kg steps)', E.rampSets(27, 'Dumbbell_Bench_Press').map(function (r) { return r.kg; }), [14, 18, 22]);
// weight steps: one step up from what was lifted, only rounded to 0.5 kg
eq('25 + 2 = 27, not 28', E.suggest({ id: 'Incline_Dumbbell_Press', sets: 3, reps: [8, 12], inc: 2 }, [h([[25, 12, 2], [25, 12, 2], [25, 12, 2]])]).kg, 27);
eq('lighter: whole steps down', [E.lighter(42.5, 0.9, 2.5), E.lighter(25, 0.9, 2), E.lighter(2, 0.9, 2), E.lighter(0, 0.9, 2)], [37.5, 23, 2, 0]);
eq('bodyweight sets count with kg 0', E.history({ sessions: { '2026-10-01': { done: true, ex: [{ id: 'Plank', sets: [{ kg: 0, reps: 30, done: true }] }, { id: 'Leg_Press', sets: [{ kg: 0, reps: 10, done: true }] }] } } }, 'Plank').length, 1);

var prof = { sex: 'm', age: 38, height: 186, weight: 112, activity: 'feet', phase: 'lean', priority: ['shoulders', 'back'], sched: { 1: '16:00', 3: '16:00', 5: '16:00' }, wake: '06:30', bed: '22:30' };
var m = E.macros(prof);
eq('bmr', m.bmr, 2098);
eq('protein 2 g/kg', m.protein, 224);
eq('protein from goal weight: 2.2 × 93 ≈ 200 g, rounded to 10', [E.macros(Object.assign({}, prof, { goal2: 93 })).protein, E.proteinFor({ weight: 112, goal2: 85 }), E.proteinFor({ weight: 112, goal2: 'x' })], [200, 190, 224]);
eq('meals with 200 g: about 40 g each', E.mealTargets(E.macros(Object.assign({}, prof, { goal2: 93 })), {}).P, 40);
console.log('macros', m);

var st = { profile: prof, sessions: {}, weight: {}, daily: {}, settings: {} };
var p = E.plan('2026-09-21', st); // Monday
eq('plan monday A', [p.training, p.day, p.calibration, p.week], [true, 'A', true, 1]);
eq('plan tuesday rest', E.plan('2026-09-22', st).training, false);
eq('exercises A count', p.exercises.length, 10);
eq('exercises A no prio', E.exercisesFor('A', { priority: [] }).length, 9);
eq('exercises A default prio', E.exercisesFor('A', {}).length, 10);
eq('leg extension 2×10–15 right after the leg curl in A', (function () { var a = E.PROGRAM.A.map(function (c) { return c.id; }), i = a.indexOf('Leg_Extensions'); return [a[i - 1], E.PROGRAM.A[i].sets, E.PROGRAM.A[i].reps]; })(), ['Seated_Leg_Curl', 2, [10, 15]]);
var quads = function (d) { return E.exercisesFor(d, prof).filter(function (c) { return ['Leg_Press', 'Smith_Machine_Squat', 'Leg_Extensions'].indexOf(c.id) >= 0; }).reduce(function (a, c) { return a + c.sets; }, 0); };
eq('front of thigh: 11–13 hard sets a week (A-B-A / B-A-B)', [2 * quads('A') + quads('B'), quads('A') + 2 * quads('B')], [13, 11]);
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
eq('after calibration: weight set from the best set', s4.ex[0].suggest.state, 'set');
eq('week 2 squat kg (40×12 +1 in the tank, Epley capped at 12)', s4.ex[0].suggest.kg, 40);

// calibration estimate from real week-1 numbers (bench 50×14, no tank logged → 2)
var cb = { id: 'Machine_Bench_Press', sets: 3, reps: [6, 10], inc: 2 };
eq('calibration estimate bench (50×14 counts as 12 reps)', E.suggest(cb, [{ date: 'x', calib: true, sets: [{ kg: 44, reps: 10, rir: 2, done: true }, { kg: 50, reps: 14, done: true }] }]).kg, 52);
eq('calibration estimate capped at 30 kg dumbbells', E.suggest({ id: 'Dumbbell_Shoulder_Press', sets: 3, reps: [8, 12], inc: 2 }, [{ date: 'x', calib: true, sets: [{ kg: 30, reps: 15, done: true }] }]).kg, 30);
eq('normal progression after a normal session', E.suggest(cfg, [h([[40, 12, 2], [40, 12, 1]])]).state, 'up');
// "How was it?" drives progression (Easy / About right / Hard)
function hf(sets, feel) { var x = h(sets); x.feel = feel; return x; }
var top = [[40, 12], [40, 12], [40, 12]], mid = [[40, 10], [40, 10], [40, 9]], low = [[40, 7], [40, 8], [40, 8]];
function kr(sg) { return [sg.kg, sg.reps, sg.state]; }
eq('top + easy: up 2 steps', kr(E.suggest(cfg, [hf(top, 'easy')])), [45, 10, 'up']);
eq('top + about right: up 1 step', kr(E.suggest(cfg, [hf(top, 'right')])), [42.5, 10, 'up']);
eq('top + hard: up 1 step, bottom of the range', kr(E.suggest(cfg, [hf(top, 'hard')])), [42.5, 8, 'up']);
eq('top + easy on dumbbells: 1 step only', E.suggest(E.findCfg('Incline_Dumbbell_Press'), [hf([[20, 12], [20, 12], [20, 12]], 'easy')]).kg, 22);
eq('in range + easy: +2 reps', kr(E.suggest(cfg, [hf(mid, 'easy')])), [40, 11, 'push']);
eq('in range + about right: +1 rep', kr(E.suggest(cfg, [hf(mid, 'right')])), [40, 10, 'push']);
eq('in range + hard: same reps again', kr(E.suggest(cfg, [hf(mid, 'hard')])), [40, 9, 'again']);
eq('+2 reps stops at the top', E.suggest(cfg, [hf([[40, 11], [40, 11], [40, 12]], 'easy')]).reps, 12);
['easy', 'right', 'hard'].forEach(function (f) { eq('below range + ' + f + ': hold', E.suggest(cfg, [hf(low, f)]).state, 'hold'); });
eq('below range twice: drop, whatever the feel', E.suggest(cfg, [hf(low, 'easy'), hf(low, 'easy')]).state, 'drop');
eq('no answer: the last set rir (3 = easy)', E.suggest(cfg, [h([[40, 10, null], [40, 10, null], [40, 9, 3]])]).reps, 11);
eq('feel is read from the session', E.history({ sessions: { '2026-10-01': { done: true, ex: [{ id: 'X', feel: 'easy', suggest: { state: 'push' }, sets: [{ kg: 40, reps: 10, done: true }] }] } } }, 'X')[0].feel, 'easy');
// bodyweight (plank): kg stays 0, progress by reps
eq('plank first time: kg 0', E.suggest({ id: 'Plank', sets: 2, reps: [10, 15], inc: 2.5 }, []).kg, 0);
eq('plank: never adds weight', kr(E.suggest({ id: 'Plank', sets: 2, reps: [10, 15], inc: 2.5 }, [hf([[0, 30], [0, 30]], 'right')])), [0, 31, 'push']);

// finding weights is per exercise, not "the first 3 sessions"
eq('first time on an exercise: 2 sets', E.suggest(cfg, []).sets, 2);
var fst = { profile: prof, sessions: {}, settings: {} };
['2026-09-21', '2026-09-23'].forEach(function (d) {
  var s = E.buildSession(E.plan(d, fst), fst);
  s.ex.forEach(function (e) { e.sets.forEach(function (x) { x.kg = 30; x.reps = 12; x.done = true; }); });
  s.done = true; fst.sessions[d] = s;
});
var p3 = E.plan('2026-09-25', fst), s3 = E.buildSession(p3, fst);
eq('3rd session (A again): not a finding session', p3.calibration, false);
eq('3rd session: weights set from the finding sets, all sets', [s3.ex[0].suggest.state, s3.ex[0].sets.length], ['set', 3]);
fst.settings.swaps = { Leg_Press: 'Smith_Machine_Squat' };
fst.sessions['2026-09-23'].ex[0].id = 'Goblet_Squat';   // B's squat was swapped that day: Smith squat is still new
var s3b = E.buildSession(E.plan('2026-09-25', fst), fst);
eq('a swap to a new exercise finds its weight (2 sets)', [s3b.ex[0].id, s3b.ex[0].suggest.state, s3b.ex[0].sets.length], ['Smith_Machine_Squat', 'calibrate', 2]);
s3b.ex[0].sets.forEach(function (x) { x.kg = 60; x.reps = 12; x.done = true; }); s3b.done = true; fst.sessions['2026-09-25'] = s3b;
eq('next time, the swapped exercise gets its weight from those sets', E.suggest(E.findCfg('Smith_Machine_Squat'), E.history(fst, 'Smith_Machine_Squat')).state, 'set');

// easy week (deload): only after stalls or on request; afterwards back to the pre-deload weights
function hs(sets, state, feel) { var x = { id: 'X', feel: feel, suggest: { state: state }, sets: sets.map(function (s) { return { kg: s[0], reps: s[1], done: true }; }) }; return x; }
function sesOn(d, x, extra) { return Object.assign({ day: 'A', done: true, ex: [x] }, extra || {}); }
var dl = { sessions: {
  '2026-10-05': sesOn('', hs([[50, 10], [50, 10], [50, 10]], 'push', 'right')),
  '2026-10-07': sesOn('', hs([[45, 8], [45, 8]], 'deload', 'easy'), { deload: true }),
  '2026-10-09': sesOn('', hs([[45, 8], [45, 8]], 'deload', 'easy'), { deload: true }) } };
eq('after an easy week: from the last normal session (50 kg), not the easy-week 45', kr(E.suggest(cfg, E.history(dl, 'X'))), [50, 11, 'push']);
eq('old data: a session flagged deload counts as light', E.history({ sessions: { '2026-10-07': { done: true, deload: true, ex: [{ id: 'X', sets: [{ kg: 45, reps: 8, done: true }] }] } } }, 'X')[0].light, true);
var dst = { profile: prof, sessions: {}, settings: {} }, dd = '2026-09-07';
var allEx = E.PROGRAM.A.concat(E.PROGRAM.B).map(function (c) { return { id: c.id, base: c.id, suggest: { state: 'push' }, sets: [{ kg: 20, reps: 10, done: true }] }; });
for (var di2 = 0; di2 < 18; di2++) { dst.sessions[dd] = { day: di2 % 2 ? 'B' : 'A', done: true, ex: allEx }; dd = E.addDaysISO(dd, di2 % 3 === 2 ? 3 : 2); }
eq('no fixed easy week every 6th week', E.plan(dd, dst).deload, false);
dst.settings.deloadUntil = 18 + 3;
eq('stall/asked easy week: the next 3 sessions', E.plan(dd, dst).deload, true);
// coming back after a break
var brk = { profile: prof, settings: {}, sessions: { '2026-09-02': sesOn('', hs([[50, 10], [50, 10], [50, 10]], 'push', 'right')) } };
eq('13 days off: normal', E.plan('2026-09-15', brk).back, null);
eq('14 days off: light first session', E.plan('2026-09-16', brk).back, 'light');
eq('42 days off: find weights again', E.plan('2026-10-14', brk).back, 'refind');
var bs = E.suggest(cfg, E.history(brk, 'X'), { back: 'light' });
eq('first session back: 10 % lighter, same sets', [bs.kg, bs.sets, bs.state], [45, 3, 'back']);
var rf = E.suggest(cfg, E.history(brk, 'X'), { back: 'refind' });
eq('6+ weeks off: 2 finding sets', [rf.state, rf.sets], ['calibrate', 2]);
brk.sessions['2026-09-16'] = sesOn('', hs([[45, 10], [45, 10], [45, 10]], 'back', 'easy'), { back: 'light' });
eq('after the light session: back to the old weight', E.suggest(cfg, E.history(brk, 'X')).kg, 50);
var bses = E.buildSession(E.plan('2026-09-30', { profile: prof, settings: {}, sessions: { '2026-09-02': { day: 'B', done: true, ex: [{ id: 'Smith_Machine_Squat', base: 'Smith_Machine_Squat', suggest: { state: 'push' }, sets: [{ kg: 100, reps: 8, done: true }, { kg: 100, reps: 8, done: true }] }] } } }), { profile: prof, settings: {}, sessions: { '2026-09-02': { day: 'B', done: true, ex: [{ id: 'Smith_Machine_Squat', base: 'Smith_Machine_Squat', suggest: { state: 'push' }, sets: [{ kg: 100, reps: 8, done: true }, { kg: 100, reps: 8, done: true }] }] } } });
eq('a session after a break remembers it', [bses.back, bses.ex[0].suggest.kg], ['light', 90]);

// moved and skipped sessions
var mst = { profile: prof, sessions: {}, weight: {}, daily: {}, settings: { moves: { '2026-09-25': '2026-09-26', '2026-09-28': '' } } };
eq('moved away: Friday rests', E.plan('2026-09-25', mst).training, false);
eq('moved here: Saturday trains at Friday time', [E.plan('2026-09-26', mst).training, E.plan('2026-09-26', mst).time], [true, '16:00']);
eq('skipped Monday rests', E.plan('2026-09-28', mst).training, false);
mst.sessions['2026-09-23'] = { day: 'A', done: false, ex: [{ id: 'Leg_Press', sets: [{ kg: null, reps: 10, done: false }] }] };
eq('empty unfinished past session is ignored (still scheduled)', E.plan('2026-09-23', mst, '2026-09-25').training, true);
mst.sessions['2026-09-22'] = mst.sessions['2026-09-23'];
eq('empty unfinished past session on a rest day is not training', E.plan('2026-09-22', mst, '2026-09-25').training, false);
eq('empty session today still counts', E.plan('2026-09-22', mst, '2026-09-22').training, true);
eq('arms priority adds a curl to A and an overhead extension to B', [E.exercisesFor('A', { priority: ['arms'] }).some(function (c) { return c.id === 'Incline_Dumbbell_Curl'; }), E.exercisesFor('B', { priority: ['arms'] }).some(function (c) { return c.id === 'Cable_Rope_Overhead_Triceps_Extension'; })], [true, true]);

var tl = E.timeline(prof, E.plan('2026-09-21', st), m).map(function (s) { return s.time + ' ' + s.label; });
console.log(tl.join('\n'));
eq('timeline morning protein 07:30', tl.indexOf('07:30 Morning protein') >= 0, true);
eq('timeline lunch at 11:30', tl.indexOf('11:30 Meal 1 (lunch)') >= 0, true);
eq('only the bedtime shake after 19:30 (bed 22:30)', E.timeline(prof, E.plan('2026-09-21', st), m).concat(E.timeline(prof, E.plan('2026-09-22', st), m)).filter(function (x) { return x.t > E.hm('19:30'); }).map(function (x) { return x.key; }), ['sh3', 'sh3']);
eq('timeline shake at 17:10', tl.indexOf('17:10 Protein shake') >= 0, true);
eq('timeline meal 2 at 18:45', tl.indexOf('18:45 Meal 2 (dinner)') >= 0, true);
function tlAt(time) { return E.timeline(prof, { date: '2026-09-21', training: true, time: time, day: 'A' }, m).map(function (s) { return s.time + ' ' + s.label; }); }
eq('17:00 session: shake and dinner after it', tlAt('17:00').filter(function (x) { return /Protein shake|Meal 2/.test(x); }), ['18:10 Protein shake', '19:30 Meal 2 (dinner)']);
eq('18:00 session: light dinner after it, bedtime shake stays', tlAt('18:00').filter(function (x) { return /Protein shake|Meal 2|Bedtime/.test(x); }), ['19:10 Protein shake', '19:50 Meal 2 (light)', '21:45 Bedtime shake']);
eq('19:00 session: nothing before it ends, no shake right after the light dinner', tlAt('19:00').filter(function (x) { return x > '19:00'; }), ['19:00 Train', '20:10 Protein shake', '20:50 Meal 2 (light)']);
eq('lunch 4.5 h before training says 2–5 h', /2–5 h/.test(E.timeline(prof, E.plan('2026-09-21', st), m).filter(function (s) { return s.key === 'm1'; })[0].why), true);
eq('creatine amount from RULES', tl.indexOf('15:45 Creatine ' + E.RULES.creatineG + ' g + water') >= 0, true);
eq('timeline 2 meals + 3 shakes', tl.filter(function (x) { return /Meal \d|shake|Morning protein/i.test(x); }).length, 5);
eq('bedtime shake 45 min before bed', tl.indexOf('21:45 Bedtime shake') >= 0, true);

// simple eating: meals are a hand-built plate, no cooking plan
var tgt = E.mealTargets(m, prof);
eq('meal protein ~1 palm or more', tgt.P >= 25, true);
eq('palms wording', [E.palms(30), E.palms(45), E.palms(60)], ['a palm', 'a palm and a half', 'two palms']);
eq('hand plate: protein, veg, carb, fat', E.handPlate(35).map(function (x) { return x.k; }), ['protein', 'veg', 'carb', 'fat']);
eq('meals say nothing about cooking', E.timeline(prof, E.plan('2026-09-21', st), m).filter(function (s) { return /cook today|cook,|box|fridge|shopping/i.test((s.what || '') + (s.detail || '')); }).length, 0);

// a moved session pushes the rest of the week (never two days in a row, never into next week)
var sw = E.shiftWeek({ profile: prof, sessions: {}, settings: {} }, '2026-09-28', '2026-09-29');
eq('Mon→Tue pushes Wed→Thu and Fri→Sat', sw.moves, { '2026-09-28': '2026-09-29', '2026-09-30': '2026-10-01', '2026-10-02': '2026-10-03' });
var swst = { profile: prof, sessions: {}, settings: { moves: sw.moves, autoMoves: sw.auto } };
eq('week after the push: Tue, Thu, Sat train', ['2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03'].map(function (d) { return E.plan(d, swst).training; }), [true, false, true, false, true]);
eq('undo removes the pushes too', E.unshiftWeek(swst, '2026-09-28').moves, {});
eq('Fri→Sat pushes nothing', E.shiftWeek({ profile: prof, sessions: {}, settings: {} }, '2026-10-02', '2026-10-03').moves, { '2026-10-02': '2026-10-03' });
eq('Wed→Thu pushes Fri→Sat', E.shiftWeek({ profile: prof, sessions: {}, settings: {} }, '2026-09-30', '2026-10-01').moves, { '2026-09-30': '2026-10-01', '2026-10-02': '2026-10-03' });
eq('skip (no new day) pushes nothing', E.shiftWeek({ profile: prof, sessions: {}, settings: {} }, '2026-09-28', '').moves, { '2026-09-28': '' });

// trained on Sunday: Monday rests, the week moves to Tue/Thu/Sat
var sun = { profile: prof, sessions: { '2026-10-04': { day: 'A', done: true, ex: [] } }, settings: {} };
eq('Sunday trained → Mon moves to Tue', E.sundayShift(sun, '2026-10-04'), { from: '2026-10-05', to: '2026-10-06' });
eq('still applies on the Monday itself', E.sundayShift(sun, '2026-10-05'), { from: '2026-10-05', to: '2026-10-06' });
var ssw = E.shiftWeek(sun, '2026-10-05', '2026-10-06');
eq('pushes Wed→Thu and Fri→Sat', ssw.moves, { '2026-10-05': '2026-10-06', '2026-10-07': '2026-10-08', '2026-10-09': '2026-10-10' });
eq('not again once moved', E.sundayShift({ profile: prof, sessions: sun.sessions, settings: { moves: ssw.moves } }, '2026-10-04'), null);
eq('not when the user kept Monday', E.sundayShift({ profile: prof, sessions: sun.sessions, settings: { keepMon: { '2026-10-05': 1 } } }, '2026-10-04'), null);
eq('not without a Sunday session', E.sundayShift({ profile: prof, sessions: {}, settings: {} }, '2026-10-04'), null);
eq('a Sunday a week back moves nothing', E.sundayShift(sun, '2026-10-08'), null);

// weight trend
var w = {}; for (var i = 0; i < 21; i++) { var d = new Date(2026, 8, 1 + i); w[E.isoDate(d)] = 112 - i * 0.07; }
st.weight = w;
var ta = E.trendAdvice(st);
eq('trend rate ~-0.49', Math.round(ta.rate * 100) / 100, -0.49);
eq('trend in band', /^On track/.test(ta.text), true);
function days(n, f) { var o = {}; for (var i = 0; i < n; i++) o[E.addDaysISO('2026-09-01', i)] = Math.round(f(i) * 100) / 100; return o; }
function adv(wt) { return E.trendAdvice({ profile: { phase: 'lean' }, weight: wt }); }
eq('trend: a 3-week gap moves the line 7/8 of the way (half-life 7 days)', E.weightTrend({ weight: { '2026-09-01': 100, '2026-09-22': 94 } })[1].avg, 94.75);
eq('trend weight = last trend point', E.trendWeight({ weight: { '2026-09-01': 100, '2026-09-22': 94 } }), 94.75);
eq('rate needs 10 weigh-ins', adv(days(21, function (i) { return i % 3 ? 0 : 112 - i * 0.1; })).rate, null);
var spaced = {}; for (var si = 0; si < 12; si++) spaced[E.addDaysISO('2026-09-01', si)] = 112;
eq('rate needs 14 days of spread', adv(spaced).state, 'wait');
eq('rate with gaps: slope of what is there', Math.round(adv(days(22, function (i) { return i % 2 ? 0 : 112 - i * 0.05; })).rate * 100) / 100, -0.35);
eq('one fast week = wait and see', adv(days(28, function (i) { return i < 21 ? 112 - i * 0.05 : 111 - (i - 20) * 0.3; })).state, 'watch');
eq('two fast weeks = eat more', adv(days(28, function (i) { return 112 - i * 0.15; })).state, 'low');
eq('two flat weeks = eat less', adv(days(28, function () { return 112; })).state, 'high');
eq('food targets use the trend weight', E.macrosFor({ profile: prof, weight: { '2026-09-01': 112, '2026-09-02': 112, '2026-09-03': 115 } }).kcal < E.macros(Object.assign({}, prof, { weight: 115 })).kcal, true);


// dumbbell cap: no suggestion above the heaviest dumbbell in the gym
var db = E.findCfg('Dumbbell_Bench_Press');
eq('db up below cap', E.suggest(db, [h([[28, 10, 2], [28, 10, 2], [28, 10, 2]])]).kg, 30);
var mx = E.suggest(db, [h([[30, 10, 2], [30, 10, 2], [30, 10, 2]])]);
eq('db maxed', [mx.kg, mx.reps, mx.state], [30, 11, 'maxed']);
eq('db maxed names swap', /chest press machine/.test(mx.note), true);
eq('db owned', E.suggest(db, [h([[30, 15, 2], [30, 15, 2], [30, 15, 2]])]).reps, 15);
eq('machine not capped', E.suggest(E.findCfg('Leg_Press'), [h([[100, 10, 2], [100, 10, 2], [100, 10, 2]])]).kg, 105);

// every exercise the app can show has a plain name and where/form text
var allIds = [];
E.PROGRAM.A.concat(E.PROGRAM.B).forEach(function (c) { allIds.push(c.id); (c.alts || []).forEach(function (a) { allIds.push(a); }); });
eq('all have where/form', allIds.filter(function (id) { var i = E.info(id); return !(i && i.where && i.tip); }), []);
eq('all have plain names', allIds.filter(function (id) { return !E.LABEL[id]; }), []);

eq('effort: machines to no clean rep on the last set, big lifts 1–2 left', [E.cue('Leg_Extensions'), E.cue('Leg_Press')], ['Last set: until no clean rep is left.', 'Stop with 1–2 reps left in the tank.']);
eq('stretch cue on the leg curl', E.cue('Seated_Leg_Curl'), 'Slow down, pause 1 s in the stretch. Last set: until no clean rep is left.');
eq('calves: half reps at the bottom', /half reps/.test(E.cue('Calf_Press_On_The_Leg_Press_Machine')), true);
eq('effort lines stay short', allIds.filter(function (id) { return E.cue(id).length > 80; }), []);
var warm = [E.WARMUP.general].concat(E.WARMUP.A, E.WARMUP.B);
eq('warm-ups explain how', warm.filter(function (w) { return !(w.how && w.how.length); }).map(function (w) { return w.id; }), []);

var lat = Object.assign({}, prof, { lattes: 2 });
eq('2 lattes: meals give way (~65 kcal each)', E.mealTargets(m, prof).kcal - E.mealTargets(m, lat).kcal >= 60, true);
eq('lattes show on a work day, not on Sunday', [E.timeline(lat, E.plan('2026-09-21', st), m).filter(function (s) { return /^la/.test(s.key); }).length, E.timeline(lat, E.plan('2026-09-27', st), m).filter(function (s) { return /^la/.test(s.key); }).length], [2, 0]);
eq('morning is a shake; the alternative changes daily', [/Whey shake/.test(E.morningFor('2026-10-05').short), E.morningFor('2026-10-05').swap !== E.morningFor('2026-10-06').swap], [true, true]);


// calendar reminders
var rev = E.reminderEvents(prof, m, '2026-09-24', true);
eq('training reminder Mon/Wed/Fri 16:00', rev.filter(function (g) { return g.key === 'train'; }).map(function (g) { return g.time + ' ' + g.rrule; }), ['16:00 FREQ=WEEKLY;BYDAY=MO,WE,FR']);
eq('training-only file has just the training event', (E.calendarICS(prof, m, '2026-09-24', false).match(/BEGIN:VEVENT/g) || []).length, 1);
eq('first training date is a training day (Fri 25 Sep)', rev.filter(function (g) { return g.key === 'train'; })[0].firstDate, '2026-09-25');
eq('ics lines end in CRLF', E.calendarICS(prof, m, '2026-09-24', true).slice(-2), '\r\n');

// after midnight: the next weekday
eq('23:30 + 70 min on Friday is 00:40 Saturday', E.wrapDay(1440 + 40, 5), { t: 40, wd: 6 });
eq('00:40 on Saturday wraps to Sunday', E.wrapDay(1440 + 40, 6), { t: 40, wd: 0 });
eq('before midnight goes back a day', E.wrapDay(-30, 0), { t: 1410, wd: 6 });
eq('same day stays', E.wrapDay(600, 3), { t: 600, wd: 3 });
var late = Object.assign({}, prof, { bed: '01:30' });
eq('bedtime shake after midnight is still every day', E.reminderEvents(late, E.macros(late), '2026-09-24', true).filter(function (g) { return g.key === 'bedshake'; }).map(function (g) { return g.time + ' ' + g.days.length; }), ['00:45 7']);
eq('calendar text escaped', E.icsText('a,b;c\\d\ne'), 'a\\,b\\;c\\\\d\\ne');

// DST: day windows count calendar days (Europe: clocks back 25 Oct 2026, forward 29 Mar 2026)
var dw = {}; for (var di = 0; di < 14; di++) dw[E.addDaysISO('2026-10-20', di)] = 100 + di;
eq('addDaysISO over the autumn change', E.addDaysISO('2026-10-24', 2), '2026-10-26');
eq('addDaysISO over the spring change', E.addDaysISO('2026-03-28', 2), '2026-03-30');
eq('daysBetween over both changes', [E.daysBetween('2026-10-24', '2026-10-27'), E.daysBetween('2026-03-28', '2026-03-31')], [3, 3]);
var sameShape = {}; for (var dk = 0; dk < 14; dk++) sameShape[E.addDaysISO('2026-09-01', dk)] = 100 + dk;
var avgs = function (wt) { return E.weightTrend({ weight: wt }).map(function (x) { return x.avg; }); };
eq('trend over the autumn change = same days without it', avgs(dw), avgs(sameShape));
var sw7 = {}; for (var dj = 0; dj < 14; dj++) sw7[E.addDaysISO('2026-03-22', dj)] = 100 + dj;
eq('trend over the spring change = same days without it', avgs(sw7), avgs(sameShape));
var vst = { sessions: { '2026-10-20': { done: true, ex: [{ id: 'Leg_Press', sets: [{ kg: 1, reps: 1, done: true }] }] }, '2026-10-26': { done: true, ex: [{ id: 'Leg_Press', sets: [{ kg: 1, reps: 1, done: true }] }] } } };
var vdb = { Leg_Press: { primary: ['quadriceps'], secondary: [] } };
eq('weekly volume: 7 calendar days back over the change', [E.weeklyVolume(vst, vdb, '2026-10-26').quadriceps, E.weeklyVolume(vst, vdb, '2026-10-27').quadriceps], [2, 1]);

// sanitize: odd synced values are cleaned, good ones kept
var dirty = {
  profile: { age: '38', height: 'tall', wake: '<b>', bed: '22:30', sched: { 1: '16:00', 3: 'x', 9: '10:00' }, priority: ['arms', 'nope'] },
  weight: { '2026-10-01': '112.4', 'bad': 1, '2026-10-02': 'heavy' },
  daily: { '2026-10-01': { waist: '108', sleep: 'lots' }, '2026-10-02': 'x' },
  sessions: {
    '2026-10-01': { day: 'C', time: '16:00', ex: [{ id: 'Leg_Press', base: 'Leg_Press', feel: 'meh', sets: [{ kg: '40', reps: 10, done: true }] }, { id: '<img onerror=x>', base: 'Leg_Press', sets: [] }] },
    '2026-10-02': { ex: 'nope' }, '<x>': { ex: [] }
  },
  settings: { swaps: { Leg_Press: 'Smith_Machine_Squat', 'a b': 'x', Ok: 5 } }
};
eq('sanitize reports a change', E.sanitize(dirty), true);
eq('sanitize profile', dirty.profile, { age: 38, bed: '22:30', sched: { 1: '16:00' }, priority: ['arms'] });
eq('sanitize weight', dirty.weight, { '2026-10-01': 112.4 });
eq('sanitize daily', dirty.daily, { '2026-10-01': { waist: 108 } });
eq('sanitize sessions', Object.keys(dirty.sessions), ['2026-10-01']);
var ds = dirty.sessions['2026-10-01'];
eq('sanitize session', [ds.day, ds.ex.length, ds.ex[0].feel, ds.ex[0].sets[0].kg], ['A', 1, undefined, 40]);
eq('sanitize swaps', dirty.settings.swaps, { Leg_Press: 'Smith_Machine_Squat' });
eq('sanitize leaves clean data alone', E.sanitize(dirty), false);

console.log(fails ? fails + ' FAILED' : 'all ok');
process.exit(fails ? 1 : 0);
