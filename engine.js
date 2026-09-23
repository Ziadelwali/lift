/* engine.js - the rules of the app as pure functions. No DOM. Loaded by
   index.html and by tools/test-engine.js (node). Everything here follows the
   evidence summarised in README.md: 10-20 hard sets per muscle per week,
   1-3 reps in reserve, double progression, periodic deloads, protein spread
   over ~4 feeds, creatine daily. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ENGINE = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var RULES = {
    rirTarget: [1, 3],          // reps in reserve on working sets
    calibrationSessions: 3,     // first week: 2 sets, find loads
    deloadEvery: 6,             // every 6th training week
    deloadLoad: 0.9, deloadSets: 0.5,
    stallDrop: 0.9,             // cut load 10 % after two failed sessions
    sessionMinutes: 65,
    warmupMinutes: 8,
    proteinPerKg: { lean: 2.0, high: 1.6 }, // high = BMI >= 30
    fatShare: 0.25,
    phase: { lean: 0.85, maintain: 1.0, bulk: 1.10 },
    activity: { desk: 1.35, feet: 1.5, active: 1.65 },
    trendTarget: { lean: [-0.6, -0.3], maintain: [-0.2, 0.2], bulk: [0.2, 0.45] }, // kg/week
    creatineG: 5, presleepProteinG: 35,
    volumeBand: { normal: [10, 16], priority: [14, 20] },
    dumbbellMaxKg: 30 // heaviest dumbbell at B1973 Fitness (per hand)
  };

  /* ---------- program ---------- */
  var PROGRAM = {
    A: [
      { id: 'Leg_Press', sets: 3, reps: [6, 10], inc: 5, rest: 150, ramp: true,
        where: 'Nautilus leg press: sit and push the footplate away with your feet.',
        tip: 'Feet shoulder-width, mid-platform. Lower until knees are ~90°, never let the lower back curl off the pad.',
        alts: ['Smith_Machine_Squat', 'Leg_Extensions'] },
      { id: 'Dumbbell_Bench_Press', sets: 3, reps: [6, 10], inc: 2, rest: 150, ramp: true,
        where: 'Flat bench in the free-weight area, one dumbbell in each hand (the rack goes up to 30 kg).',
        tip: 'Shoulder blades pinned back and down, elbows ~45° from the body. Lower to chest level, press up and slightly in.',
        alts: ['Machine_Bench_Press', 'Smith_Machine_Bench_Press'] },
      { id: 'Wide-Grip_Lat_Pulldown', sets: 3, reps: [8, 12], inc: 2.5, rest: 120,
        where: 'Nautilus lat pulldown: seat, knee pad and two separate handles overhead.',
        tip: 'Lean back slightly, pull the handles down to the upper chest with the elbows, pause, control the way up.',
        alts: ['Close-Grip_Front_Lat_Pulldown'] },
      { id: 'Seated_Leg_Curl', sets: 3, reps: [10, 15], inc: 5, rest: 90,
        where: 'Machine where you sit and curl a pad down with the backs of your legs.',
        tip: 'Hips pinned by the lap pad. Curl all the way, then control the return for 2–3 seconds.',
        alts: ['Smith_Machine_Stiff-Legged_Deadlift'] },
      { id: 'Dumbbell_Shoulder_Press', sets: 3, reps: [8, 12], inc: 2, rest: 120,
        where: 'Upright bench (back at ~85°), dumbbells at shoulder height.',
        tip: 'Start with dumbbells beside the ears, press up until arms are nearly straight. Ribs down, no arching.',
        alts: ['Leverage_Shoulder_Press', 'Smith_Machine_Overhead_Shoulder_Press'] },
      { id: 'Seated_Cable_Rows', sets: 3, reps: [8, 12], inc: 2.5, rest: 120,
        where: 'Nautilus row machine: seated, chest tall, two separate handles.',
        tip: 'Chest tall, pull the handles to the belly button squeezing the shoulder blades, let the arms go fully long on the return.',
        alts: ['One-Arm_Dumbbell_Row', 'Dumbbell_Incline_Row'] },
      { id: 'Side_Lateral_Raise', sets: 3, reps: [12, 15], inc: 1, rest: 75, prio: 'shoulders',
        where: 'Light dumbbells, standing.',
        tip: 'Lead with the elbows, raise to shoulder height with a slight forward lean. Light weight, no swinging.',
        alts: ['Seated_Side_Lateral_Raise', 'Cable_Seated_Lateral_Raise'] },
      { id: 'Triceps_Pushdown_-_Rope_Attachment', sets: 2, reps: [10, 15], inc: 2.5, rest: 75,
        where: 'High pulley on the multi-station, rope attachment.',
        tip: 'Elbows glued to the sides, push down and split the rope at the bottom.',
        alts: ['Triceps_Pushdown', 'Dip_Machine'] },
      { id: 'Ab_Crunch_Machine', sets: 2, reps: [10, 15], inc: 2.5, rest: 60,
        where: 'Nautilus abdominal crunch machine.',
        tip: 'Crunch the ribs toward the hips, let the abs do it, not the arms. Slow on the way back.',
        alts: ['Cable_Crunch', 'Plank'] }
    ],
    B: [
      { id: 'Smith_Machine_Squat', sets: 3, reps: [6, 10], inc: 5, rest: 150, ramp: true,
        where: 'Smith machine: the bar that slides up and down on two rails. Bar across the upper back.',
        tip: 'Feet slightly in front of the bar, squat until thighs pass parallel, drive through the whole foot. Set the safety stops just below your bottom position.',
        alts: ['Leg_Press', 'Goblet_Squat'] },
      { id: 'Stiff-Legged_Dumbbell_Deadlift', sets: 3, reps: [8, 12], inc: 2, rest: 150, ramp: true,
        where: 'Two dumbbells, standing. This is the Romanian deadlift done with dumbbells.',
        tip: 'Soft knees, push the hips back, dumbbells slide down the thighs until you feel the hamstrings stretch. Flat back always.',
        alts: ['Smith_Machine_Stiff-Legged_Deadlift', 'Hyperextensions_Back_Extensions'] },
      { id: 'Incline_Dumbbell_Press', sets: 3, reps: [8, 12], inc: 2, rest: 150,
        where: 'Bench set to ~30° incline, dumbbells.',
        tip: 'Same as flat press but the bench is tilted — upper chest does more. Lower to the upper chest.',
        alts: ['Smith_Machine_Incline_Bench_Press', 'Dumbbell_Bench_Press'] },
      { id: 'One-Arm_Dumbbell_Row', sets: 3, reps: [8, 12], inc: 2, rest: 120,
        where: 'Flat bench and one dumbbell: one knee and hand on the bench, row with the other arm.',
        tip: 'Back flat, pull the dumbbell toward the hip (not the chest) so the lat does the work, squeeze, slow return. Weight shown is per dumbbell.',
        alts: ['Seated_Cable_Rows', 'Dumbbell_Incline_Row'] },
      { id: 'Seated_Side_Lateral_Raise', sets: 3, reps: [12, 15], inc: 1, rest: 75,
        where: 'Sit on the end of a bench with light dumbbells.',
        tip: 'Seated removes the leg swing. Raise to shoulder height, pause, lower slowly.',
        alts: ['Side_Lateral_Raise', 'Cable_Seated_Lateral_Raise'] },
      { id: 'Straight-Arm_Pulldown', sets: 2, reps: [10, 15], inc: 2.5, rest: 75, prio: 'back',
        where: 'High pulley on the multi-station with a straight bar or rope, standing.',
        tip: 'Arms almost straight, sweep the bar down to the thighs using the lats, not the triceps.',
        alts: ['Rope_Straight-Arm_Pulldown'] },
      { id: 'Dumbbell_Bicep_Curl', sets: 2, reps: [10, 15], inc: 1, rest: 75,
        where: 'Dumbbells, standing or seated.',
        tip: 'Elbows stay at the sides, curl all the way up, lower for 2–3 seconds.',
        alts: ['Preacher_Curl', 'Hammer_Curls', 'Standing_Biceps_Cable_Curl'] },
      { id: 'Calf_Press_On_The_Leg_Press_Machine', sets: 3, reps: [10, 15], inc: 5, rest: 75,
        where: 'Leg press, only the balls of your feet on the bottom edge of the footplate.',
        tip: 'Legs almost straight, let the heels drop for a full stretch (pause 1 s), push up onto the toes. No bouncing.',
        alts: ['Smith_Machine_Calf_Raise', 'Standing_Dumbbell_Calf_Raise'] },
      { id: 'Face_Pull', sets: 2, reps: [12, 15], inc: 2.5, rest: 60,
        where: 'Multi-station pulley at face height with the rope.',
        tip: 'Pull the rope toward the face, hands finish beside the ears, elbows high. Keeps shoulders healthy.',
        alts: ['Cable_Rear_Delt_Fly', 'Reverse_Flyes'] }
    ]
  };

  /* Plain-language names shown in the app (the official name is shown small underneath). */
  var LABEL = {
    Leg_Press: 'Leg press machine', Leg_Extensions: 'Leg extension machine', Seated_Leg_Curl: 'Leg curl machine',
    Smith_Machine_Squat: 'Squat in the Smith machine', Goblet_Squat: 'Squat holding one dumbbell',
    'Stiff-Legged_Dumbbell_Deadlift': 'Dumbbell hip hinge', 'Smith_Machine_Stiff-Legged_Deadlift': 'Hip hinge in the Smith machine',
    Calf_Press_On_The_Leg_Press_Machine: 'Calf push on the leg press', Smith_Machine_Calf_Raise: 'Calf raise in the Smith machine',
    Standing_Dumbbell_Calf_Raise: 'Calf raise holding dumbbells',
    Dumbbell_Bench_Press: 'Dumbbell chest press, flat bench', Incline_Dumbbell_Press: 'Dumbbell chest press, tilted bench',
    Machine_Bench_Press: 'Chest press machine', Smith_Machine_Bench_Press: 'Bench press in the Smith machine',
    Smith_Machine_Incline_Bench_Press: 'Tilted bench press in the Smith machine', Dip_Machine: 'Dip machine',
    'Wide-Grip_Lat_Pulldown': 'Lat pulldown machine, wide', 'Close-Grip_Front_Lat_Pulldown': 'Lat pulldown machine, narrow',
    Seated_Cable_Rows: 'Row machine', 'One-Arm_Dumbbell_Row': 'One-arm dumbbell row', Dumbbell_Incline_Row: 'Dumbbell row, chest on tilted bench',
    'Straight-Arm_Pulldown': 'Straight-arm pull-down, bar', 'Rope_Straight-Arm_Pulldown': 'Straight-arm pull-down, rope',
    Dumbbell_Shoulder_Press: 'Dumbbell shoulder press', Leverage_Shoulder_Press: 'Shoulder press machine',
    Smith_Machine_Overhead_Shoulder_Press: 'Shoulder press in the Smith machine',
    Side_Lateral_Raise: 'Side raise with dumbbells', Seated_Side_Lateral_Raise: 'Side raise with dumbbells, seated',
    Cable_Seated_Lateral_Raise: 'Side raise with the cable',
    Face_Pull: 'Rope pull to the face', Cable_Rear_Delt_Fly: 'Rear-shoulder fly with the cable', Reverse_Flyes: 'Rear-shoulder fly with dumbbells',
    'Triceps_Pushdown_-_Rope_Attachment': 'Push-down with the rope', Triceps_Pushdown: 'Push-down with the bar',
    Dumbbell_Bicep_Curl: 'Dumbbell curl', Hammer_Curls: 'Hammer curl (thumbs up)', Preacher_Curl: 'Preacher bench curl',
    Standing_Biceps_Cable_Curl: 'Curl with the cable',
    Ab_Crunch_Machine: 'Ab crunch machine', Hyperextensions_Back_Extensions: 'Low back machine', Cable_Crunch: 'Kneeling crunch with the cable', Plank: 'Plank (hold on elbows)',
    Bicycling_Stationary: 'Exercise bike', Rowing_Stationary: 'Rowing machine', Standing_Hip_Circles: 'Hip circles',
    Bodyweight_Squat: 'Squat, no weight', Arm_Circles: 'Arm circles', Cat_Stretch: 'Cat–cow back stretch',
    Single_Leg_Glute_Bridge: 'One-leg hip lift', External_Rotation: 'Arm rotation with a light dumbbell'
  };

  /* Where / form text for exercises that are only swap options (main lifts carry theirs in PROGRAM). */
  var ALT_INFO = {
    Leg_Extensions: { where: 'Nautilus leg extension: sit, roller in front of your lower shins.',
      tip: 'Straighten the legs fully, squeeze the front of the thigh for a second, lower slowly. Back stays against the pad.' },
    Machine_Bench_Press: { where: 'Nautilus chest press: sit, handles at chest height.',
      tip: 'Seat so the handles line up with mid-chest. Press forward without locking the elbows, return slowly until you feel a chest stretch.' },
    Smith_Machine_Bench_Press: { where: 'Smith machine with a flat bench under the bar.',
      tip: 'Bar lowers to the lower chest, elbows ~45° from the body. Set the safety stops just above your chest.' },
    'Close-Grip_Front_Lat_Pulldown': { where: 'Nautilus lat pulldown, hands closer together.',
      tip: 'Pull the handles to the upper chest, elbows down and back. Control the way up until the arms are long.' },
    'Smith_Machine_Stiff-Legged_Deadlift': { where: 'Smith machine, bar starting at mid-thigh.',
      tip: 'Soft knees, push the hips back, slide the bar down to mid-shin until the back of the thigh stretches. Flat back always.' },
    Hyperextensions_Back_Extensions: { where: 'Nautilus low back machine: sit, pad behind your upper back. (The photo shows the bench version of the same movement.)',
      tip: 'Lean back slowly against the pad by extending the hips and lower back, pause, come forward with control. Smooth, no jerking.' },
    Leverage_Shoulder_Press: { where: 'Nautilus shoulder press: sit, handles beside the shoulders.',
      tip: 'Press up until the arms are nearly straight, ribs down, back against the pad. Lower to shoulder height.' },
    Smith_Machine_Overhead_Shoulder_Press: { where: 'Smith machine with an upright bench under the bar.',
      tip: 'Bar starts at chin height. Press up just in front of the face, lower under control. No arching.' },
    Dumbbell_Incline_Row: { where: 'Bench tilted ~30°, lie chest-down, a dumbbell in each hand.',
      tip: 'Pull the dumbbells up beside the ribs, squeeze the shoulder blades together, lower until the arms are long.' },
    Cable_Seated_Lateral_Raise: { where: 'Low pulley on the multi-station, single handle, sit or stand side-on.',
      tip: 'Raise the arm out to the side up to shoulder height, lead with the elbow, lower slowly. Light weight.' },
    Triceps_Pushdown: { where: 'High pulley on the multi-station, straight bar.',
      tip: 'Elbows glued to the sides, push the bar down until the arms are straight, control it back up.' },
    Dip_Machine: { where: 'Nautilus dip machine: sit, handles beside your hips.',
      tip: 'Push the handles down until the arms are straight, slight lean forward, return slowly to about 90° at the elbow.' },
    Cable_Crunch: { where: 'Kneel under the multi-station high pulley holding the rope behind your head.',
      tip: 'Crunch the ribs toward the hips, hips stay still. Slow on the way up.' },
    Plank: { where: 'On the floor (a mat from the group room).',
      tip: 'Elbows under shoulders, body straight from head to heels, squeeze the belly and buttocks. Hold, breathe.' },
    Goblet_Squat: { where: 'One dumbbell held upright against your chest.',
      tip: 'Feet shoulder-width, sit down between the heels, chest up, elbows inside the knees. Stand through the whole foot.' },
    Smith_Machine_Incline_Bench_Press: { where: 'Smith machine with the bench tilted ~30° under the bar.',
      tip: 'Bar lowers to the upper chest. Set the safety stops just above your chest.' },
    'Rope_Straight-Arm_Pulldown': { where: 'High pulley on the multi-station, rope, standing.',
      tip: 'Arms almost straight, sweep the rope down to the thighs using the sides of the back, not the arms.' },
    Preacher_Curl: { where: 'Preacher bench with the curl bar; upper arms resting on the angled pad.',
      tip: 'Curl up without lifting the elbows off the pad, lower slowly until the arms are almost straight.' },
    Hammer_Curls: { where: 'Dumbbells, thumbs pointing up.',
      tip: 'Elbows stay at the sides, curl up with the thumbs up, lower for 2–3 seconds.' },
    Standing_Biceps_Cable_Curl: { where: 'Low pulley on the multi-station, straight bar, standing.',
      tip: 'Elbows at the sides, curl the bar up, lower slowly. No swinging.' },
    Smith_Machine_Calf_Raise: { where: 'Smith machine, bar on the upper back, balls of the feet on a step or plate.',
      tip: 'Let the heels drop for a full stretch (pause 1 s), rise high onto the toes. No bouncing.' },
    Standing_Dumbbell_Calf_Raise: { where: 'Dumbbell in one hand, balls of the feet on a step, other hand holding on.',
      tip: 'Full stretch at the bottom (pause 1 s), full rise onto the toes. One leg at a time makes it harder.' },
    Cable_Rear_Delt_Fly: { where: 'Multi-station pulley at shoulder height, single handle.',
      tip: 'Arm almost straight, pull out and back to the side at shoulder height, squeeze the back of the shoulder, return slowly.' },
    Reverse_Flyes: { where: 'Light dumbbells, bent forward at the hips (or chest on a tilted bench).',
      tip: 'Arms slightly bent, raise out to the sides until level with the body, squeeze, lower slowly.' }
  };
  /* Where / form text for any exercise id (main lift or swap option). */
  function info(id) { var c = findCfg(id); return c ? { where: c.where, tip: c.tip } : ALT_INFO[id] || null; }

  /* Exercises loaded with dumbbells: capped at RULES.dumbbellMaxKg. */
  var DUMBBELL = ['Dumbbell_Bench_Press', 'Incline_Dumbbell_Press', 'Dumbbell_Shoulder_Press', 'Side_Lateral_Raise',
    'Seated_Side_Lateral_Raise', 'Stiff-Legged_Dumbbell_Deadlift', 'One-Arm_Dumbbell_Row', 'Dumbbell_Incline_Row',
    'Dumbbell_Bicep_Curl', 'Hammer_Curls', 'Goblet_Squat', 'Reverse_Flyes', 'Standing_Dumbbell_Calf_Raise'];

  /* Muscles each priority tag covers (free-exercise-db names). */
  var PRIORITY = {
    shoulders: { label: 'Shoulders (side delts)', muscles: ['shoulders'] },
    back: { label: 'Upper back / lats', muscles: ['lats', 'middle back'] },
    chest: { label: 'Chest', muscles: ['chest'] },
    arms: { label: 'Arms', muscles: ['biceps', 'triceps'] }
  };

  var WARMUP = {
    general: { id: 'Bicycling_Stationary', label: 'Easy bike or rower', secs: 210, note: 'Conversational pace. Just warm, not tired.' },
    A: [
      { id: 'Standing_Hip_Circles', label: 'Hip circles', reps: '8 each way, each leg' },
      { id: 'Bodyweight_Squat', label: 'Bodyweight squats', reps: '10 slow' },
      { id: 'Reverse_Flyes', label: 'Light dumbbell reverse fly', reps: '15' },
      { id: 'Arm_Circles', label: 'Arm circles', reps: '10 each way' }
    ],
    B: [
      { id: 'Cat_Stretch', label: 'Cat–cow', reps: '8 slow' },
      { id: 'Single_Leg_Glute_Bridge', label: 'Single-leg glute bridge', reps: '8 each side' },
      { id: 'Bodyweight_Squat', label: 'Bodyweight squats', reps: '10 slow' },
      { id: 'External_Rotation', label: 'Light dumbbell external rotation', reps: '12 each arm' }
    ],
    ramp: [[0.5, 8], [0.7, 5], [0.85, 2]]   // fraction of working load × reps, first compound only
  };

  /* ---------- helpers ---------- */
  function roundTo(kg, inc) { return Math.round(kg / inc) * inc; }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function isoDate(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function parseISO(s) { var p = s.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function hm(t) { var p = (t || '00:00').split(':'); return (+p[0]) * 60 + (+p[1]); }
  function fmtHM(m) { m = ((m % 1440) + 1440) % 1440; return pad(Math.floor(m / 60)) + ':' + pad(m % 60); }
  function epley(kg, reps) { return reps >= 1 ? kg * (1 + reps / 30) : 0; }

  function exercisesFor(day, profile) {
    var prio = (profile && profile.priority) || ['shoulders', 'back'];
    return PROGRAM[day].filter(function (e) { return !e.prio || prio.indexOf(e.prio) !== -1; });
  }
  function findCfg(id) {
    var all = PROGRAM.A.concat(PROGRAM.B);
    for (var i = 0; i < all.length; i++) if (all[i].id === id) return all[i];
    return null;
  }

  /* ---------- sessions ---------- */
  function completedSessions(state) {
    var s = state.sessions || {};
    return Object.keys(s).filter(function (k) { return s[k] && s[k].done; }).sort();
  }
  /* history of one exercise: array (oldest → newest) of arrays of logged sets */
  function history(state, exId) {
    var keys = completedSessions(state), out = [];
    keys.forEach(function (k) {
      var ses = state.sessions[k];
      (ses.ex || []).forEach(function (e) {
        if (e.id !== exId) return;
        var sets = (e.sets || []).filter(function (s) { return s.done && s.kg > 0 && s.reps > 0; });
        if (sets.length) out.push({ date: k, sets: sets });
      });
    });
    return out;
  }

  /* Double progression. Returns {kg, reps, sets, note, state:'calibrate'|'up'|'hold'|'push'|'drop'} */
  function suggest(cfg, hist, opts) {
    opts = opts || {};
    var lo = cfg.reps[0], hi = cfg.reps[1], sets = cfg.sets;
    if (opts.calibration) sets = Math.max(2, Math.round(sets * 0.67));
    if (!hist || !hist.length) {
      return { kg: null, reps: hi, sets: sets, state: 'calibrate',
        note: 'First time: pick a weight you could do about ' + hi + ' reps with, with 3 left in the tank. Log what you actually did.' };
    }
    var last = hist[hist.length - 1].sets;
    var kg = Math.max.apply(null, last.map(function (s) { return s.kg; }));
    var atKg = last.filter(function (s) { return s.kg === kg; });
    var minReps = Math.min.apply(null, atKg.map(function (s) { return s.reps; }));
    var maxRir = Math.max.apply(null, atKg.map(function (s) { return s.rir == null ? 2 : s.rir; }));
    var allTop = atKg.length >= Math.min(sets, 2) && atKg.every(function (s) { return s.reps >= hi && (s.rir == null || s.rir <= 3); });
    var anyBelow = atKg.some(function (s) { return s.reps < lo; });

    if (opts.deload) {
      return { kg: roundTo(kg * RULES.deloadLoad, cfg.inc), reps: lo, sets: Math.max(1, Math.round(sets * RULES.deloadSets)),
        state: 'deload', note: 'Deload: lighter, fewer sets, stop with 3–4 reps in reserve. Recovery is the point.' };
    }
    var cap = DUMBBELL.indexOf(cfg.id) !== -1 ? RULES.dumbbellMaxKg : null;
    if (allTop && cap && kg + cfg.inc > cap) {
      // Out of heavier dumbbells: keep the heaviest pair, earn progress with reps, then move to a machine.
      var alt = (cfg.alts || []).filter(function (a) { return DUMBBELL.indexOf(a) === -1; })[0];
      var swapTo = alt ? ' Swap to ' + alt.replace(/_/g, ' ') + ' to keep adding weight.' : '';
      var more = Math.min(hi + 5, minReps + 1);
      if (minReps >= hi + 5) {
        return { kg: cap, reps: hi + 5, sets: sets, state: 'maxed',
          note: cap + ' kg is the heaviest dumbbell here and you own it.' + (swapTo || ' Slow the lowering to 3–4 s to keep it hard.') };
      }
      return { kg: cap, reps: more, sets: sets, state: 'maxed',
        note: cap + ' kg is the heaviest dumbbell here. Stay at ' + cap + ' kg and go for ' + more + ' reps, lowering in 3 s.' + swapTo };
    }
    if (allTop) {
      return { kg: roundTo(kg + cfg.inc, cfg.inc), reps: lo, sets: sets, state: 'up',
        note: 'All sets hit ' + hi + ' last time — up ' + cfg.inc + ' kg. Aim for ' + lo + '+ reps.' };
    }
    if (anyBelow) {
      var prev = hist.length > 1 ? hist[hist.length - 2].sets : null;
      var prevBelow = prev && prev.some(function (s) { return s.kg >= kg && s.reps < lo; });
      if (prevBelow) {
        return { kg: roundTo(kg * RULES.stallDrop, cfg.inc), reps: lo, sets: sets, state: 'drop',
          note: 'Two sessions under ' + lo + ' reps — drop 10 % and rebuild. That is normal, not failure.' };
      }
      return { kg: kg, reps: lo, sets: sets, state: 'hold',
        note: 'Under ' + lo + ' reps last time. Same weight, get every set to ' + lo + '.' };
    }
    var target = Math.min(hi, minReps + 1);
    return { kg: kg, reps: target, sets: sets, state: 'push',
      note: 'Same weight. Beat last time: ' + target + ' reps on every set' + (maxRir >= 3 ? ' — you had reps left.' : '.') };
  }

  /* Was the exercise stalled (dropped) in the recent sessions? */
  function recentStalls(state, profile, lookback) {
    var keys = completedSessions(state).slice(-(lookback || 3)), count = 0, seen = {};
    keys.forEach(function (k) {
      (state.sessions[k].ex || []).forEach(function (e) {
        if (e.suggest && e.suggest.state === 'drop' && !seen[e.id]) { seen[e.id] = 1; count++; }
      });
    });
    return count;
  }

  /* What does the calendar say for a date? */
  function plan(dateISO, state) {
    var profile = state.profile || {}, sched = profile.sched || { 1: '16:00', 3: '16:00', 5: '16:00' };
    var d = parseISO(dateISO), wd = d.getDay();
    var existing = state.sessions && state.sessions[dateISO];
    var done = completedSessions(state);
    var n = done.length;                       // sessions completed before today (if today not done)
    if (existing && existing.done) n = done.indexOf(dateISO);
    var week = Math.floor(n / 3) + 1;          // training week number, 1-based
    var calibration = n < RULES.calibrationSessions;
    var deloadUntil = (state.settings && state.settings.deloadUntil) || 0;
    var deload = !calibration && (week % RULES.deloadEvery === 0 || n < deloadUntil);
    var day = existing ? existing.day : (n % 2 === 0 ? 'A' : 'B');
    var training = !!existing || sched[wd] != null;
    return {
      date: dateISO, training: training, time: existing && existing.time || sched[wd] || null,
      day: training ? day : null, week: week, n: n, calibration: calibration, deload: deload,
      exercises: training ? exercisesFor(day, profile) : []
    };
  }

  /* Build the session object for a plan (suggestions filled in). */
  function buildSession(p, state) {
    var ex = p.exercises.map(function (cfg) {
      var swap = state.settings && state.settings.swaps && state.settings.swaps[cfg.id];
      if (swap && (cfg.alts || []).indexOf(swap) === -1) swap = null; // alt removed from the program
      var id = swap || cfg.id;
      var useCfg = Object.assign({}, cfg, { id: id });
      var sg = suggest(useCfg, history(state, id), { calibration: p.calibration, deload: p.deload });
      var sets = [];
      for (var i = 0; i < sg.sets; i++) sets.push({ kg: sg.kg, reps: sg.reps, rir: null, done: false });
      return { id: id, base: cfg.id, suggest: sg, sets: sets };
    });
    return { date: p.date, day: p.day, time: p.time, week: p.week, calibration: p.calibration, deload: p.deload,
      started: null, finished: null, done: false, warm: {}, ex: ex };
  }

  function rampSets(kg) {
    if (!kg) return [];
    return WARMUP.ramp.map(function (r) { return { kg: Math.max(0, roundTo(kg * r[0], 2.5)), reps: r[1] }; });
  }

  /* ---------- nutrition ---------- */
  function bmi(p) { return p.height ? p.weight / Math.pow(p.height / 100, 2) : 0; }
  function macros(p) {
    if (!p || !p.weight || !p.height || !p.age) return null;
    var bmr = 10 * p.weight + 6.25 * p.height - 5 * p.age + (p.sex === 'f' ? -161 : 5);
    var tdee = bmr * (RULES.activity[p.activity] || 1.5);
    var phase = p.phase || 'lean';
    var kcal = Math.round((tdee * RULES.phase[phase] + (p.kcalAdj || 0)) / 10) * 10;
    var perKg = bmi(p) >= 30 ? RULES.proteinPerKg.high : RULES.proteinPerKg.lean;
    var protein = Math.round(p.weight * perKg);
    var fat = Math.round(kcal * RULES.fatShare / 9);
    var carbs = Math.max(0, Math.round((kcal - protein * 4 - fat * 9) / 4));
    return { bmr: Math.round(bmr), tdee: Math.round(tdee), kcal: kcal, protein: protein, fat: fat, carbs: carbs, phase: phase, bmi: bmi(p) };
  }

  var FOODS = {
    breakfast: ['Skyr 300 g + oats 60 g + berries', '4 eggs + 2 slices rugbrød + tomato', 'Protein oats: oats 70 g, whey 30 g, banana'],
    snack: ['Whey shake 30 g + a piece of fruit', 'Skyr 250 g + nuts 20 g', 'Cottage cheese 200 g + rugbrød'],
    pre: ['Chicken 150 g + rice (80 g dry) + veg', 'Rugbrød 3 slices + tuna + cottage cheese', 'Pasta 90 g dry + lean mince 150 g'],
    post: ['Lean beef or chicken 200 g + potatoes 300 g + veg', 'Salmon 180 g + rice + broccoli', 'Big wrap: chicken 180 g, rice, beans, salsa'],
    dinner: ['Chicken 180 g + potatoes + big salad', 'Fish 200 g + rice + veg', 'Lean mince 180 g + wholegrain pasta + veg'],
    presleep: ['Skyr or quark 300 g', 'Casein shake 35 g', 'Cottage cheese 250 g']
  };

  /* Clock-time eating schedule for a date. */
  function timeline(profile, p, mac) {
    var wake = hm(profile.wake || '06:30'), bed = hm(profile.bed || '22:30');
    if (bed <= wake) bed += 1440;
    var P = mac ? mac.protein : 160, K = mac ? mac.kcal : 2400;
    var feedP = Math.round((P - RULES.presleepProteinG) / 4);
    var slots = [];
    function slot(t, key, label, why, pShare, kShare, foods) {
      slots.push({ t: t, time: fmtHM(t), key: key, label: label, why: why, protein: pShare, kcal: Math.round(K * kShare / 10) * 10, foods: FOODS[foods] });
    }
    if (p.training && p.time) {
      var T = hm(p.time); if (T < wake) T += 1440;
      var pre = T - 150, post = T + RULES.sessionMinutes + 20;
      slot(wake + 30, 'b', 'Breakfast', 'Protein feed 1. Start the day\'s protein early.', feedP, 0.2, 'breakfast');
      if (pre - (wake + 30) >= 150) {
        slot(Math.round(((wake + 30) + pre) / 2), 's', 'Snack', 'Protein feed 2, keeps feeds ~3–4 h apart.', feedP, 0.15, 'snack');
        slot(pre, 'pre', 'Pre-workout meal', 'Carbs + protein 2–3 h before training — fuel for hard sets.', feedP, 0.25, 'pre');
      } else {
        slots[0].label = 'Breakfast = pre-workout meal'; slots[0].why = 'Training is early: carbs + protein now, 1–2 h before.'; slots[0].kcal = Math.round(K * 0.3 / 10) * 10;
      }
      slot(T - 15, 'cr', 'Creatine 5 g + water', 'Timing barely matters — daily consistency does. Shaker, coffee, anything.', 0, 0, null);
      slot(T, 'train', 'Train', 'Session ' + p.day + ' · ~' + RULES.sessionMinutes + ' min incl. warm-up.', 0, 0, null);
      slot(post, 'post', 'Post-workout meal', 'Biggest meal of the day: protein + carbs within ~2 h. Recovery starts here.', feedP, 0.3, 'post');
      if (bed - 60 - post >= 180) slot(post + 180, 'd', 'Light dinner / snack', 'Only if the gap to bed is long. Protein-led.', Math.round(feedP / 2), 0.0, 'snack');
      slot(bed - 60, 'ps', 'Pre-sleep protein', 'Skyr/casein 30–40 g: overnight muscle protein synthesis.', RULES.presleepProteinG, 0.1, 'presleep');
    } else {
      slot(wake + 30, 'b', 'Breakfast', 'Protein feed 1.', feedP, 0.25, 'breakfast');
      slot(wake + 30 + 210, 's', 'Lunch', 'Protein feed 2.', feedP, 0.25, 'pre');
      slot(wake + 30 + 420, 'sn', 'Afternoon snack', 'Protein feed 3. Rest day: carbs a bit lower, fat a bit higher.', feedP, 0.15, 'snack');
      slot(Math.min(wake + 30 + 660, bed - 180), 'd', 'Dinner', 'Protein feed 4.', feedP, 0.25, 'dinner');
      slot(wake + 60, 'cr', 'Creatine 5 g', 'Every day, training or not.', 0, 0, null);
      slot(bed - 60, 'ps', 'Pre-sleep protein', 'Skyr/casein 30–40 g.', RULES.presleepProteinG, 0.1, 'presleep');
    }
    slots.sort(function (a, b) { return a.t - b.t; });
    return slots;
  }

  /* ---------- progress ---------- */
  function weightSeries(state) {
    var w = state.weight || {};
    return Object.keys(w).sort().map(function (k) { return { date: k, kg: +w[k] }; }).filter(function (x) { return x.kg > 0; });
  }
  /* 7-day trailing average per point */
  function weightTrend(state) {
    var s = weightSeries(state);
    return s.map(function (pt, i) {
      var from = parseISO(pt.date).getTime() - 6 * 864e5, vals = [];
      for (var j = i; j >= 0 && parseISO(s[j].date).getTime() >= from; j--) vals.push(s[j].kg);
      return { date: pt.date, kg: pt.kg, avg: vals.reduce(function (a, b) { return a + b; }, 0) / vals.length };
    });
  }
  /* kg/week over the last 14 days of trend, and advice for the phase */
  function trendAdvice(state) {
    var t = weightTrend(state);
    if (t.length < 8) return { rate: null, text: 'Weigh in most mornings; after ~2 weeks the trend tells us whether to adjust calories.' };
    var last = t[t.length - 1], back = null;
    for (var i = t.length - 1; i >= 0; i--) {
      if (parseISO(last.date).getTime() - parseISO(t[i].date).getTime() >= 7 * 864e5) { back = t[i]; break; }
    }
    if (!back) return { rate: null, text: 'Keep weighing in — not enough spread of dates yet.' };
    var days = (parseISO(last.date).getTime() - parseISO(back.date).getTime()) / 864e5;
    var rate = (last.avg - back.avg) / days * 7;
    var phase = (state.profile && state.profile.phase) || 'lean', band = RULES.trendTarget[phase];
    var text, adj = 0;
    if (rate < band[0]) { text = 'Losing faster than ' + Math.abs(band[0]) + ' kg/week — that risks muscle. Add ~150 kcal (carbs around training).'; adj = 150; }
    else if (rate > band[1]) { text = phase === 'bulk' ? 'Gaining faster than planned — trim ~150 kcal.' : 'Weight is not drifting down. Trim ~150 kcal, or add 2k steps a day.'; adj = -150; }
    else text = 'Trend is in the target band (' + band[0] + ' to ' + band[1] + ' kg/week). Lifts progressing? Change nothing.';
    return { rate: rate, text: text, adj: adj };
  }

  function weeklyVolume(state, exdb, weekEndISO) {
    var end = weekEndISO ? parseISO(weekEndISO) : new Date(); end.setHours(23, 59, 59, 999);
    var start = end.getTime() - 7 * 864e5, vol = {};
    completedSessions(state).forEach(function (k) {
      var t = parseISO(k).getTime(); if (t < start || t > end.getTime()) return;
      (state.sessions[k].ex || []).forEach(function (e) {
        var n = (e.sets || []).filter(function (s) { return s.done && s.reps > 0; }).length;
        var ex = exdb[e.id]; if (!ex) return;
        ex.primary.forEach(function (m) { vol[m] = (vol[m] || 0) + n; });
        ex.secondary.forEach(function (m) { vol[m] = (vol[m] || 0) + n * 0.5; });
      });
    });
    return vol;
  }

  function bestSets(state, exId) {
    return history(state, exId).map(function (h) {
      var best = h.sets.reduce(function (b, s) { return epley(s.kg, s.reps) > epley(b.kg, b.reps) ? s : b; }, h.sets[0]);
      return { date: h.date, kg: best.kg, reps: best.reps, e1rm: Math.round(epley(best.kg, best.reps) * 10) / 10 };
    });
  }


  /* ---------- Firestore REST value codec ----------
     The app talks to Firestore over plain REST (the SDK realtime channel is
     blocked for this project). Firestore values are typed JSON. */
  function toFs(v) {
    if (v === null || v === undefined) return { nullValue: null };
    if (typeof v === "boolean") return { booleanValue: v };
    if (typeof v === "number") return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
    if (typeof v === "string") return { stringValue: v };
    if (Array.isArray(v)) return { arrayValue: { values: v.map(toFs) } };
    var f = {}; Object.keys(v).forEach(function (k) { if (v[k] !== undefined) f[k] = toFs(v[k]); });
    return { mapValue: { fields: f } };
  }
  function fromFs(v) {
    if (!v || "nullValue" in v) return null;
    if ("booleanValue" in v) return v.booleanValue;
    if ("integerValue" in v) return +v.integerValue;
    if ("doubleValue" in v) return v.doubleValue;
    if ("stringValue" in v) return v.stringValue;
    if ("timestampValue" in v) return v.timestampValue;
    if ("arrayValue" in v) return (v.arrayValue.values || []).map(fromFs);
    if ("mapValue" in v) { var o = {}, f = v.mapValue.fields || {}; Object.keys(f).forEach(function (k) { o[k] = fromFs(f[k]); }); return o; }
    return null;
  }
  /* field path segment: backtick-quote anything that is not a plain identifier */
  function fsSeg(k) { return /^[A-Za-z_][A-Za-z_0-9]*$/.test(k) ? k : '`' + k.replace(/[`\\]/g, '\\$&') + '`'; }
  /* diff two {section:{key:value}} states into a REST PATCH: mask paths + document fields.
     Removed keys appear in the mask only, which deletes them. */
  function restPatch(cur, base, sections) {
    var mask = [], data = {}, any = false;
    sections.forEach(function (sec) {
      var c = cur[sec] || {}, o = base[sec] || {};
      Object.keys(c).forEach(function (k) {
        if (JSON.stringify(c[k]) !== JSON.stringify(o[k])) { mask.push("data." + sec + "." + fsSeg(k)); data[sec] = data[sec] || {}; data[sec][k] = c[k]; any = true; }
      });
      Object.keys(o).forEach(function (k) { if (!(k in c)) { mask.push("data." + sec + "." + fsSeg(k)); any = true; } });
    });
    if (!any) return null;
    var fields = { v: toFs(1), at: toFs(new Date().toISOString()), data: toFs(data) };
    mask.push("v", "at");
    return { mask: mask, fields: fields };
  }

  return {
    toFs: toFs, fromFs: fromFs, fsSeg: fsSeg, restPatch: restPatch,
    RULES: RULES, PROGRAM: PROGRAM, DUMBBELL: DUMBBELL, LABEL: LABEL, ALT_INFO: ALT_INFO, info: info, PRIORITY: PRIORITY, WARMUP: WARMUP, FOODS: FOODS,
    roundTo: roundTo, isoDate: isoDate, parseISO: parseISO, hm: hm, fmtHM: fmtHM, epley: epley,
    exercisesFor: exercisesFor, findCfg: findCfg, completedSessions: completedSessions, history: history,
    suggest: suggest, recentStalls: recentStalls, plan: plan, buildSession: buildSession, rampSets: rampSets,
    macros: macros, timeline: timeline, weightSeries: weightSeries, weightTrend: weightTrend,
    trendAdvice: trendAdvice, weeklyVolume: weeklyVolume, bestSets: bestSets
  };
});
