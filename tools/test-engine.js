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
eq('deload', E.suggest(cfg, [h([[40, 10, 2]])], { deload: true }), { kg: 35, reps: 8, sets: 2, state: 'deload', note: 'Deload week: lighter, fewer sets, 3–4 reps to spare.' });
eq('ramp', E.rampSets(80), [{ kg: 40, reps: 8 }, { kg: 55, reps: 5 }, { kg: 67.5, reps: 2 }]);

var prof = { sex: 'm', age: 38, height: 186, weight: 112, activity: 'feet', phase: 'lean', priority: ['shoulders', 'back'], sched: { 1: '16:00', 3: '16:00', 5: '16:00' }, wake: '06:30', bed: '22:30' };
var m = E.macros(prof);
eq('bmr', m.bmr, 2098);
eq('protein 2 g/kg', m.protein, 224);
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
eq('after calibration: weight set from the best set', s4.ex[0].suggest.state, 'set');
eq('week 2 hack squat kg', s4.ex[0].suggest.kg, 45);

// calibration estimate from real week-1 numbers (bench 50×14, no tank logged → 2)
var cb = { id: 'Machine_Bench_Press', sets: 3, reps: [6, 10], inc: 2 };
eq('calibration estimate bench', E.suggest(cb, [{ date: 'x', calib: true, sets: [{ kg: 44, reps: 10, rir: 2, done: true }, { kg: 50, reps: 14, done: true }] }]).kg, 58);
eq('calibration estimate capped at 30 kg dumbbells', E.suggest({ id: 'Dumbbell_Shoulder_Press', sets: 3, reps: [8, 12], inc: 2 }, [{ date: 'x', calib: true, sets: [{ kg: 30, reps: 15, done: true }] }]).kg, 30);
eq('normal progression after a normal session', E.suggest(cfg, [h([[40, 12, 2], [40, 12, 1]])]).state, 'up');
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
var dt = E.weightTrend({ weight: dw });
eq('7-day mean over the autumn change has 7 days', dt.filter(function (x) { return x.date === '2026-10-28'; })[0].avg, 105);
var sw7 = {}; for (var dj = 0; dj < 10; dj++) sw7[E.addDaysISO('2026-03-25', dj)] = 100 + dj;
eq('7-day mean over the spring change has 7 days', E.weightTrend({ weight: sw7 }).filter(function (x) { return x.date === '2026-04-01'; })[0].avg, 104);
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
