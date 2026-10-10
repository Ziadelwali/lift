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
    warmupMinutes: 10,
    proteinPerKg: { lean: 2.0, high: 2.0 }, // 2 g per kg body weight: the top of the useful range, for maximum muscle while losing fat
    fatShare: 0.25,
    phase: { lean: 0.90, maintain: 1.0, bulk: 1.10 },  // lean = −10 %: small enough that muscle gain is barely slowed
    activity: { desk: 1.35, feet: 1.5, active: 1.65 },
    trendTarget: { lean: [-0.5, -0.2], maintain: [-0.2, 0.2], bulk: [0.2, 0.45] }, // kg/week
    creatineG: 5,
    volumeBand: { normal: [10, 16], priority: [14, 20] },
    dumbbellMaxKg: 30 // heaviest dumbbell at B1973 Fitness (per hand)
  };

  /* ---------- program ---------- */
  var PROGRAM = {
    A: [
      { id: 'Leg_Press', sets: 3, reps: [6, 10], inc: 5, rest: 120, ramp: true,
        where: 'Nautilus leg press.',
        tip: 'Feet mid-plate. Knees to 90°, lower back stays on the pad.',
        alts: ['Smith_Machine_Squat', 'Leg_Extensions'] },
      { id: 'Dumbbell_Bench_Press', sets: 3, reps: [6, 10], inc: 2, rest: 120, ramp: true,
        where: 'Flat bench, two dumbbells.',
        tip: 'Shoulder blades back. Lower to the chest, press up.',
        alts: ['Machine_Bench_Press', 'Smith_Machine_Bench_Press'] },
      { id: 'Wide-Grip_Lat_Pulldown', sets: 3, reps: [8, 12], inc: 2.5, rest: 100,
        where: 'Nautilus lat pulldown.',
        tip: 'Lean back a little, pull the elbows down to your sides.',
        alts: ['Close-Grip_Front_Lat_Pulldown'] },
      { id: 'Seated_Leg_Curl', sets: 3, reps: [10, 15], inc: 5, rest: 75,
        where: 'Nautilus leg curl.',
        tip: 'Curl all the way, let it back up slowly.',
        alts: ['Smith_Machine_Stiff-Legged_Deadlift'] },
      { id: 'Dumbbell_Shoulder_Press', sets: 3, reps: [8, 12], inc: 2, rest: 100,
        where: 'Upright bench, two dumbbells.',
        tip: 'From the ears up to almost straight arms. No arching.',
        alts: ['Leverage_Shoulder_Press', 'Smith_Machine_Overhead_Shoulder_Press'] },
      { id: 'Seated_Cable_Rows', sets: 3, reps: [8, 12], inc: 2.5, rest: 100,
        where: 'Cable row bench, two handles.',
        tip: 'Chest tall, pull to the belly, squeeze the shoulder blades.',
        alts: ['One-Arm_Dumbbell_Row', 'Dumbbell_Incline_Row'] },
      { id: 'Side_Lateral_Raise', sets: 3, reps: [12, 15], inc: 1, rest: 60, prio: 'shoulders',
        where: 'Light dumbbells, standing.',
        tip: 'Lead with the elbows up to shoulder height. No swinging.',
        alts: ['Seated_Side_Lateral_Raise', 'Cable_Seated_Lateral_Raise'] },
      { id: 'Incline_Dumbbell_Curl', sets: 3, reps: [10, 15], inc: 1, rest: 60, prio: 'arms',
        where: 'Bench tilted back, arms hanging down.',
        tip: 'Elbows stay back. Curl up, lower all the way.',
        alts: ['Dumbbell_Bicep_Curl', 'Standing_Biceps_Cable_Curl'] },
      { id: 'Triceps_Pushdown_-_Rope_Attachment', sets: 2, reps: [10, 15], inc: 2.5, rest: 60,
        where: 'Cable tower, high pulley, rope.',
        tip: 'Elbows at your sides, push down, split the rope.',
        alts: ['Triceps_Pushdown', 'Standing_Dumbbell_Triceps_Extension'] },
      { id: 'Ab_Crunch_Machine', sets: 2, reps: [10, 15], inc: 2.5, rest: 60,
        where: 'Nautilus ab crunch.',
        tip: 'Curl ribs to hips with the belly, not the arms.',
        alts: ['Cable_Crunch', 'Plank'] }
    ],
    B: [
      { id: 'Smith_Machine_Squat', sets: 3, reps: [6, 10], inc: 5, rest: 120, ramp: true,
        where: 'Smith machine, bar on your upper back.',
        tip: 'Feet a bit forward. Down to parallel, stand up. Safety stops just below.',
        alts: ['Leg_Press', 'Goblet_Squat'] },
      { id: 'Stiff-Legged_Dumbbell_Deadlift', sets: 3, reps: [8, 12], inc: 2, rest: 120, ramp: true,
        where: 'Two dumbbells, standing.',
        tip: 'Soft knees, hips back, flat back. Down until the back of the thigh stretches.',
        alts: ['Smith_Machine_Stiff-Legged_Deadlift', 'Hyperextensions_Back_Extensions'] },
      { id: 'Incline_Dumbbell_Press', sets: 3, reps: [8, 12], inc: 2, rest: 120,
        where: 'Bench at ~30°, two dumbbells.',
        tip: 'Lower to the upper chest, press up.',
        alts: ['Smith_Machine_Incline_Bench_Press', 'Dumbbell_Bench_Press'] },
      { id: 'One-Arm_Dumbbell_Row', sets: 3, reps: [8, 12], inc: 2, rest: 100,
        where: 'Bench and one dumbbell, knee and hand on the bench.',
        tip: 'Flat back, pull toward the hip, lower slowly.',
        alts: ['Seated_Cable_Rows', 'Dumbbell_Incline_Row'] },
      { id: 'Seated_Side_Lateral_Raise', sets: 3, reps: [12, 15], inc: 1, rest: 60,
        where: 'End of a bench, light dumbbells.',
        tip: 'Raise to shoulder height, lower slowly.',
        alts: ['Side_Lateral_Raise', 'Cable_Seated_Lateral_Raise'] },
      { id: 'Straight-Arm_Pulldown', sets: 2, reps: [10, 15], inc: 2.5, rest: 60, prio: 'back',
        where: 'Cable tower, high pulley, bar or rope.',
        tip: 'Straight arms, sweep down to the thighs.',
        alts: ['Rope_Straight-Arm_Pulldown'] },
      { id: 'Dumbbell_Bicep_Curl', sets: 2, reps: [10, 15], inc: 1, rest: 60,
        where: 'Two dumbbells.',
        tip: 'Elbows at your sides, curl up, lower slowly.',
        alts: ['Preacher_Curl', 'Hammer_Curls', 'Standing_Biceps_Cable_Curl'] },
      { id: 'Cable_Rope_Overhead_Triceps_Extension', sets: 3, reps: [10, 15], inc: 2.5, rest: 60, prio: 'arms',
        where: 'Cable tower, low pulley, rope. Face away.',
        tip: 'Elbows forward and still. Straighten overhead, then let the rope go deep behind the head.',
        alts: ['Standing_Dumbbell_Triceps_Extension', 'Triceps_Pushdown_-_Rope_Attachment'] },
      { id: 'Calf_Press_On_The_Leg_Press_Machine', sets: 3, reps: [10, 15], inc: 5, rest: 60,
        where: 'Leg press, balls of the feet on the plate edge.',
        tip: 'Heels down for a stretch, pause, up on the toes. No bouncing.',
        alts: ['Smith_Machine_Calf_Raise', 'Standing_Dumbbell_Calf_Raise'] },
      { id: 'Face_Pull', sets: 2, reps: [12, 15], inc: 2.5, rest: 60,
        where: 'Cable tower, face height, rope.',
        tip: 'Pull to the face, hands by the ears, elbows high.',
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
    Smith_Machine_Incline_Bench_Press: 'Tilted bench press in the Smith machine',
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
    Standing_Biceps_Cable_Curl: 'Curl with the cable', Incline_Dumbbell_Curl: 'Dumbbell curl lying back on a tilted bench',
    Cable_Rope_Overhead_Triceps_Extension: 'Overhead rope extension', Standing_Dumbbell_Triceps_Extension: 'Overhead extension with one dumbbell',
    Ab_Crunch_Machine: 'Ab crunch machine', Hyperextensions_Back_Extensions: 'Back extension bench', Cable_Crunch: 'Kneeling crunch with the cable', Plank: 'Plank (hold on elbows)',
    Bicycling_Stationary: 'Exercise bike', Rowing_Stationary: 'Rowing machine', Standing_Hip_Circles: 'Hip circles',
    Bodyweight_Squat: 'Squat, no weight', Arm_Circles: 'Arm circles', Cat_Stretch: 'Cat–cow back stretch',
    Single_Leg_Glute_Bridge: 'One-leg hip lift', External_Rotation: 'Arm rotation with a light dumbbell'
  };

  /* Where / form text for exercises that are only swap options (main lifts carry theirs in PROGRAM). */
  var ALT_INFO = {
    Leg_Extensions: { where: 'Nautilus leg extension.',
      tip: 'Straighten fully, squeeze 1 s, lower slowly.' },
    Machine_Bench_Press: { where: 'Nautilus chest press.',
      tip: 'Handles at mid-chest. Press, return slowly.' },
    Smith_Machine_Bench_Press: { where: 'Smith machine, flat bench.',
      tip: 'Bar to the lower chest. Safety stops just above the chest.' },
    'Close-Grip_Front_Lat_Pulldown': { where: 'Nautilus lat pulldown, hands close.',
      tip: 'Pull to the upper chest, elbows down.' },
    'Smith_Machine_Stiff-Legged_Deadlift': { where: 'Smith machine, bar at mid-thigh.',
      tip: 'Soft knees, hips back, flat back. Bar to mid-shin.' },
    Hyperextensions_Back_Extensions: { where: '45° back extension bench (Nautilus).',
      tip: 'Hips on the pad, flat back. Lower slowly, rise to a straight line.' },
    Leverage_Shoulder_Press: { where: 'Nautilus shoulder press.',
      tip: 'Press up, lower to shoulder height. Back on the pad.' },
    Smith_Machine_Overhead_Shoulder_Press: { where: 'Smith machine, upright bench.',
      tip: 'From chin height, press up. No arching.' },
    Dumbbell_Incline_Row: { where: 'Chest down on a tilted bench, two dumbbells.',
      tip: 'Pull beside the ribs, squeeze, lower.' },
    Cable_Seated_Lateral_Raise: { where: 'Cable tower, low pulley, one handle.',
      tip: 'Raise out to shoulder height, lower slowly.' },
    Triceps_Pushdown: { where: 'Cable tower, high pulley, straight bar.',
      tip: 'Elbows at your sides, push down.' },
    Cable_Crunch: { where: 'Kneel at the cable tower, rope behind the head.',
      tip: 'Curl ribs to hips; hips stay still.' },
    Plank: { where: 'Floor mat.',
      tip: 'Elbows under shoulders, body straight. Hold.' },
    Goblet_Squat: { where: 'One dumbbell at your chest.',
      tip: 'Sit down between the heels, chest up.' },
    Smith_Machine_Incline_Bench_Press: { where: 'Smith machine, bench at ~30°.',
      tip: 'Bar to the upper chest. Safety stops just above.' },
    'Rope_Straight-Arm_Pulldown': { where: 'Cable tower, high pulley, rope.',
      tip: 'Straight arms, sweep down to the thighs.' },
    Preacher_Curl: { where: 'Preacher bench, curl bar.',
      tip: 'Elbows stay on the pad. Lower until almost straight.' },
    Standing_Dumbbell_Triceps_Extension: { where: 'One dumbbell overhead, both hands.',
      tip: 'Elbows forward, lower behind the head, straighten.' },
    Hammer_Curls: { where: 'Dumbbells, thumbs up.',
      tip: 'Elbows at your sides, curl, lower slowly.' },
    Standing_Biceps_Cable_Curl: { where: 'Cable tower, low pulley, straight bar.',
      tip: 'Elbows at your sides, curl. No swinging.' },
    Smith_Machine_Calf_Raise: { where: 'Smith machine, toes on a step.',
      tip: 'Heels down, pause, up high. No bouncing.' },
    Standing_Dumbbell_Calf_Raise: { where: 'Dumbbell in one hand, toes on a step.',
      tip: 'Heels down, pause, up high.' },
    Cable_Rear_Delt_Fly: { where: 'Cable tower, shoulder height, one handle.',
      tip: 'Straight arm, pull out and back, return slowly.' },
    Reverse_Flyes: { where: 'Light dumbbells, bent forward.',
      tip: 'Raise out to the sides, squeeze, lower.' }
  };
  /* Where / form text for any exercise id (main lift or swap option). */
  function info(id) { var c = findCfg(id); return c ? { where: c.where, tip: c.tip } : ALT_INFO[id] || null; }

  /* Exercises loaded with dumbbells: capped at RULES.dumbbellMaxKg. */
  var DUMBBELL = ['Dumbbell_Bench_Press', 'Incline_Dumbbell_Press', 'Dumbbell_Shoulder_Press', 'Side_Lateral_Raise',
    'Seated_Side_Lateral_Raise', 'Stiff-Legged_Dumbbell_Deadlift', 'One-Arm_Dumbbell_Row', 'Dumbbell_Incline_Row',
    'Dumbbell_Bicep_Curl', 'Hammer_Curls', 'Incline_Dumbbell_Curl', 'Standing_Dumbbell_Triceps_Extension', 'Goblet_Squat', 'Reverse_Flyes', 'Standing_Dumbbell_Calf_Raise'];

  /* Muscles each priority tag covers (free-exercise-db names). */
  var PRIORITY = {
    shoulders: { label: 'Shoulders (side delts)', muscles: ['shoulders'] },
    back: { label: 'Upper back / lats', muscles: ['lats', 'middle back'] },
    chest: { label: 'Chest', muscles: ['chest'] },
    arms: { label: 'Arms', muscles: ['biceps', 'triceps'] }
  };

  var SQUAT_HOW = ['Feet shoulder-width apart, arms straight out in front.', 'Sit down slowly as if onto a low chair, chest up, heels on the floor.', 'Stand back up. 10 slow ones.'];
  var WARMUP = {
    // Walking: easy on the knees at this body weight. Incline warms up faster than walking longer.
    general: { id: 'treadmill', photo: 'img/gym/treadmill.jpg', label: 'Uphill walk on the treadmill', amount: '6–8 min',
      note: 'Like walking longer? Add the extra 5–10 min after training.',
      how: ['Walk at 5.0–5.5 km/h.', 'After 2 min, raise the incline to 5–8 %.', 'A little out of breath, still able to talk.'] },
    A: [
      { id: 'Standing_Hip_Circles', label: 'Hip circles', reps: '8 each way, each leg',
        how: ['Stand on one leg and hold on to something.', 'Lift the other knee up to hip height.', 'Draw big, slow circles with that knee, out to the side and back. 8 each way, then switch legs.'] },
      { id: 'Bodyweight_Squat', label: 'Bodyweight squats', reps: '10 slow', how: SQUAT_HOW },
      { id: 'Face_Pull', label: 'Light rope pull to the face', reps: '15',
        how: ['Cable tower at face height, rope, very light weight.', 'Pull the rope to your face, elbows high.', 'Squeeze the shoulder blades, return slowly.'] },
      { id: 'Arm_Circles', label: 'Arm circles', reps: '10 each way',
        how: ['Stand tall, arms straight out to the sides at shoulder height.', 'Draw small circles with your hands, slowly getting bigger.', '10 circles forwards, then 10 backwards.'] }
    ],
    B: [
      { id: 'Cat_Stretch', label: 'Cat–cow', reps: '8 slow',
        how: ['Get on your hands and knees (use a mat).', 'Round your back up toward the ceiling and let your head drop (the cat).', 'Then let your belly sink and lift your head (the cow). Move slowly between the two, 8 times.'] },
      { id: 'Single_Leg_Glute_Bridge', label: 'Single-leg glute bridge', reps: '8 each side',
        how: ['Lie on your back, knees bent, feet flat on the floor.', 'Pull one knee toward your chest and keep it there.', 'Push through the heel of the other foot and lift your hips up, squeeze your buttocks, lower slowly. 8, then switch sides.'] },
      { id: 'Bodyweight_Squat', label: 'Bodyweight squats', reps: '10 slow', how: SQUAT_HOW },
      { id: 'External_Rotation', label: 'Light dumbbell external rotation', reps: '12 each arm',
        how: ['Lie on your side on a bench, a very light dumbbell (1–3 kg) in your top hand.', 'Bend that elbow to 90° and keep it glued to your side, forearm across your belly.', 'Rotate the forearm up toward the ceiling, keep the elbow in place, lower slowly. 12, then the other arm.'] }
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
        if (sets.length) out.push({ date: k, sets: sets, calib: !!ses.calibration });
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
        note: 'First time: a weight you can lift ' + hi + ' times with 3 to spare.' };
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
        state: 'deload', note: 'Deload week: lighter, fewer sets, 3–4 reps to spare.' };
    }
    var cap = DUMBBELL.indexOf(cfg.id) !== -1 ? RULES.dumbbellMaxKg : null;
    if (hist[hist.length - 1].calib) {
      // Calibration weights are guesses. Estimate the weight for the middle of the rep range
      // with 2 reps in the tank from the best calibration set (Epley; no tank logged = 2).
      var e1 = Math.max.apply(null, last.map(function (s) { return epley(s.kg, s.reps + Math.min(3, s.rir == null ? 2 : s.rir)); }));
      var mid = Math.round((lo + hi) / 2), est = roundTo(e1 / (1 + (mid + 2) / 30), cfg.inc);
      if (cap) est = Math.min(cap, est);
      if (est > 0) return { kg: est, reps: mid, sets: sets, state: 'set',
        note: 'From your test sets. Too easy? Go heavier next set.' };
    }
    if (allTop && cap && kg + cfg.inc > cap) {
      // Out of heavier dumbbells: keep the heaviest pair, earn progress with reps, then move to a machine.
      var alt = (cfg.alts || []).filter(function (a) { return DUMBBELL.indexOf(a) === -1; })[0];
      var swapTo = alt ? ' Next: swap to the ' + (LABEL[alt] || alt).toLowerCase() + '.' : '';
      var more = Math.min(hi + 5, minReps + 1);
      if (minReps >= hi + 5) {
        return { kg: cap, reps: hi + 5, sets: sets, state: 'maxed',
          note: cap + ' kg is the top dumbbell and you own it.' + (swapTo || ' Lower in 3–4 s.') };
      }
      return { kg: cap, reps: more, sets: sets, state: 'maxed',
        note: cap + ' kg is the top dumbbell: go for ' + more + ' reps, lower in 3 s.' + swapTo };
    }
    if (allTop) {
      return { kg: roundTo(kg + cfg.inc, cfg.inc), reps: lo, sets: sets, state: 'up',
        note: 'Up ' + cfg.inc + ' kg. Aim for ' + lo + '+ reps.' };
    }
    if (anyBelow) {
      var prev = hist.length > 1 ? hist[hist.length - 2].sets : null;
      var prevBelow = prev && prev.some(function (s) { return s.kg >= kg && s.reps < lo; });
      if (prevBelow) {
        return { kg: roundTo(kg * RULES.stallDrop, cfg.inc), reps: lo, sets: sets, state: 'drop',
          note: 'Two sessions under ' + lo + ' reps: 10 % lighter and rebuild. Normal.' };
      }
      return { kg: kg, reps: lo, sets: sets, state: 'hold',
        note: 'Same weight, get every set to ' + lo + '.' };
    }
    var target = Math.min(hi, minReps + 1);
    return { kg: kg, reps: target, sets: sets, state: 'push',
      note: 'Same weight, ' + target + ' reps on every set.' };
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
  /* A session moved to another day: settings.moves = { fromISO: toISO }; '' = skipped. */
  function movedFrom(state, dateISO) {
    var mv = (state.settings && state.settings.moves) || {};
    for (var k in mv) if (mv[k] === dateISO) return k;
    return null;
  }
  /* Move a session from one day to another and push the rest of that week along, so two
     sessions never land on back-to-back days (Mon→Tue makes Wed→Thu and Fri→Sat). A push
     never crosses into next week: Monday always starts the normal schedule again.
     Returns { moves, auto } — auto maps each pushed day to the move that caused it (for undo). */
  function shiftWeek(state, fromISO, toISO) {
    var st = state.settings || {}, moves = Object.assign({}, st.moves || {}), auto = Object.assign({}, st.autoMoves || {});
    moves[fromISO] = toISO;
    if (!toISO) return { moves: moves, auto: auto };
    var sched = (state.profile && state.profile.sched) || { 1: '16:00', 3: '16:00', 5: '16:00' };
    function add(iso, n) { var d = parseISO(iso); d.setDate(d.getDate() + n); return isoDate(d); }
    function trains(iso) { if (iso in moves) return false; for (var k in moves) if (moves[k] === iso) return true; return sched[parseISO(iso).getDay()] != null; }
    var cur = toISO;
    while (true) {
      var next = add(cur, 1);
      if (parseISO(next).getDay() === 1) break;                        // next week: back to normal
      var ses = state.sessions && state.sessions[next];
      if (!trains(next) || (ses && ses.done)) break;                  // a rest day in between: done
      var to = add(next, 1);
      if (parseISO(to).getDay() === 1) break;                          // would spill into next week
      moves[next] = to; auto[next] = fromISO; cur = to;
    }
    return { moves: moves, auto: auto };
  }
  /* Trained on a Sunday: Monday rests and the week moves a day (Tue/Thu/Sat), so there are never
     two days in a row. Returns { from, to } for shiftWeek, or null. settings.keepMon[mon] = the user
     undid it and wants Monday as normal. */
  function sundayShift(state, todayISO) {
    var st = state.settings || {}, mv = st.moves || {}, ss = state.sessions || {};
    var sched = (state.profile && state.profile.sched) || { 1: '16:00', 3: '16:00', 5: '16:00' };
    var t = parseISO(todayISO); t.setDate(t.getDate() + (8 - t.getDay()) % 7);   // today if Monday, else next Monday
    var mon = isoDate(t); t.setDate(t.getDate() - 1); var sun = isoDate(t); t.setDate(t.getDate() + 2); var tue = isoDate(t);
    if (sched[1] == null || mon in mv || movedFrom(state, mon) || (st.keepMon || {})[mon] || ss[mon]) return null;
    if (!(ss[sun] && ss[sun].done)) return null;
    var tueTrains = !(tue in mv) && (sched[2] != null || !!movedFrom(state, tue));
    return { from: mon, to: tueTrains ? '' : tue };
  }
  /* Undo a move and every push it caused. */
  function unshiftWeek(state, fromISO) {
    var st = state.settings || {}, moves = Object.assign({}, st.moves || {}), auto = Object.assign({}, st.autoMoves || {});
    delete moves[fromISO]; delete auto[fromISO];
    Object.keys(auto).forEach(function (k) { if (auto[k] === fromISO) { delete moves[k]; delete auto[k]; } });
    return { moves: moves, auto: auto };
  }
  function hasDoneSet(ses) { return (ses.ex || []).some(function (e) { return (e.sets || []).some(function (s) { return s.done; }); }); }
  function plan(dateISO, state, todayISO) {
    var profile = state.profile || {}, sched = profile.sched || { 1: '16:00', 3: '16:00', 5: '16:00' };
    var d = parseISO(dateISO), wd = d.getDay();
    var existing = state.sessions && state.sessions[dateISO];
    // a session opened on a past day but never trained is ignored
    if (existing && todayISO && dateISO < todayISO && !existing.done && !hasDoneSet(existing)) existing = null;
    var mv = (state.settings && state.settings.moves) || {}, from = movedFrom(state, dateISO);
    var done = completedSessions(state);
    var n = done.length;                       // sessions completed before today (if today not done)
    if (existing && existing.done) n = done.indexOf(dateISO);
    var week = Math.floor(n / 3) + 1;          // training week number, 1-based
    var calibration = n < RULES.calibrationSessions;
    var deloadUntil = (state.settings && state.settings.deloadUntil) || 0;
    var deload = !calibration && (week % RULES.deloadEvery === 0 || n < deloadUntil);
    var day = existing ? existing.day : (n % 2 === 0 ? 'A' : 'B');
    var movedAway = dateISO in mv, fromTime = from ? sched[parseISO(from).getDay()] || '16:00' : null;
    var training = !!existing || (sched[wd] != null && !movedAway) || !!from;
    return {
      date: dateISO, training: training, movedAway: movedAway && !existing ? mv[dateISO] : null, movedFrom: from,
      time: existing && existing.time || (sched[wd] != null && !movedAway ? sched[wd] : fromTime),
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

  /* ---------- simple eating: 2 meals + 3 shakes, nothing to cook or weigh ----------
     Total daily protein matters most. The shakes are the measured part (a scoop);
     the two meals are whatever you eat, built with the hand as the portion guide. */
  var SHAKES = {
    post: { label: 'Protein shake', short: 'Shake: whey 40 g + 500 ml milk + banana', P: 50, kcal: 420, how: 'Whey 40 g + 500 ml skimmed milk + 1 banana. Right after training (or mid-afternoon on rest days).' },
    morning: { label: 'Morning protein', short: 'Whey shake: 30 g whey in 300 ml milk', P: 35, kcal: 225, how: 'Whey 30 g in 300 ml skimmed milk. No cooking; at home or on the way.' },
    bed: { label: 'Bedtime shake', short: 'Shake: whey 30 g + 300 ml milk', P: 35, kcal: 225, how: 'Whey 30 g in 300 ml skimmed milk, ~45 min before bed. The milk protein feeds the muscles through the night.' }
  };
  var MORNING_ALT = ['skyr 400 g + a handful of berries', 'Greek yoghurt 2 % 400 g + berries', 'skyr 400 g with cinnamon', '4 boiled eggs + a glass of milk'];
  var MORNING = MORNING_ALT.map(function (alt) { return { short: SHAKES.morning.short, swap: alt, P: SHAKES.morning.P, kcal: SHAKES.morning.kcal }; });
  function mod(a, n) { return ((a % n) + n) % n; }
  function dayNo(iso) { return Math.round(parseISO(iso).getTime() / 864e5); }
  function morningFor(iso) { return MORNING[mod(dayNo(iso), MORNING.length)]; }
  var LATTE = { kcal: 95, P: 9 };   // ~250 ml mini-mælk (0.5 % fat) + sweetener
  function lattes(profile) { return Math.max(0, Math.min(3, +(profile && profile.lattes) || 0)); }
  function mealTargets(mac, profile) {
    var P = mac ? mac.protein : 160, K = mac ? mac.kcal : 2400, n = lattes(profile) * 5 / 7;
    P -= Math.round(n * LATTE.P); K -= Math.round(n * LATTE.kcal);
    return { P: Math.round((P - SHAKES.post.P - SHAKES.morning.P - SHAKES.bed.P) / 2), kcal: Math.round((K - SHAKES.post.kcal - SHAKES.morning.kcal - SHAKES.bed.kcal) / 20) * 10 };
  }
  /* A plate built with the hand: one palm of meat or fish ≈ 30 g protein. */
  function palms(P) { var n = Math.max(1, Math.round(P / 30 * 2) / 2); return n === 1 ? 'a palm' : n === 1.5 ? 'a palm and a half' : n === 2 ? 'two palms' : n + ' palms'; }
  function handPlate(P) {
    return [{ k: 'protein', amount: palms(P), what: 'of protein', eg: 'chicken, fish, beef, lamb, eggs, lentils' },
      { k: 'veg', amount: 'a fist', what: 'of vegetables', eg: 'any kind, more is fine' },
      { k: 'carb', amount: 'a cupped hand', what: 'of carbs', eg: 'rice, potatoes, pasta or bread' },
      { k: 'fat', amount: 'a thumb', what: 'of fat', eg: 'oil, nuts or cheese' }];
  }
  function mealText(profile, iso, meal, tgt) {
    var t = palms(tgt.P).replace(/^a /, 'A ');
    return { what: meal === 1 ? 'Lunch' : 'Dinner', detail: t + ' of protein, a fist of vegetables, a cupped hand of rice, potatoes or bread.' };
  }

  /* Clock-time eating schedule for a date: 2 meals + 2 shakes (+ creatine). */
  function timeline(profile, p, mac) {
    var wake = hm(profile.wake || '06:30'), bed = hm(profile.bed || '22:30');
    if (bed <= wake) bed += 1440;
    var tgt = mealTargets(mac, profile), iso = p.date, slots = [];
    function slot(t, key, label, why, P, kcal, foods, extra) {
      slots.push(Object.assign({ t: t, time: fmtHM(t), key: key, label: label, why: why, protein: P, kcal: kcal ? Math.round(kcal / 10) * 10 : 0, foods: foods ? [foods] : null }, extra || {}));
    }
    var m1 = mealText(profile, iso, 1, tgt), m2 = mealText(profile, iso, 2, tgt), mo = morningFor(iso);
    var lunch = hm(profile.lunch || '11:30'), last = bed - 180;   // meals end 3 h before bed; only the bedtime shake comes later
    if (p.training && p.time) {
      var T = hm(p.time); if (T < wake) T += 1440;
      var end = T + RULES.sessionMinutes;
      slot(wake + 60, 'sh2', SHAKES.morning.label, 'Protein feed 1 — starts the day without cooking.', mo.P, mo.kcal, mo.short, { what: 'Shake · ' + mo.P + ' g protein', detail: 'Whey 30 g in 300 ml milk. Or instead: ' + mo.swap + ' — same protein.' });
      slot(lunch, 'm1', 'Meal 1 (lunch)', T - lunch >= 60 ? 'Carbs + protein — also the fuel for the afternoon session.' : 'Recovery meal after the morning session.', tgt.P, tgt.kcal, null, { what: m1.what, detail: m1.detail });
      slot(T - 15, 'cr', 'Creatine 5 g + water', 'Every day. Timing barely matters — consistency does. A banana now helps if lunch feels long ago.', 0, 0, null, { what: 'Creatine', detail: '5 g in water. A banana too, if lunch feels long ago.' });
      slot(T, 'train', 'Train', 'Session ' + p.day + ' · ~' + RULES.sessionMinutes + ' min incl. warm-up.', 0, 0, null, { what: 'Train', detail: '~' + RULES.sessionMinutes + ' min incl. warm-up.' });
      slot(Math.min(end + 5, last), 'sh1', SHAKES.post.label, 'Straight after training: fast protein while you head home.', SHAKES.post.P, SHAKES.post.kcal, SHAKES.post.how, { what: 'Shake · ' + SHAKES.post.P + ' g protein', detail: 'Whey 40 g + 500 ml milk + a banana. Or instead: skyr 400 g + a banana.' });
      slot(Math.min(end + 100, last), 'm2', 'Meal 2 (dinner)', 'The big meal: protein + carbs + veg. Last food of the day.', tgt.P, tgt.kcal, null, { what: m2.what, detail: m2.detail });
    } else {
      slot(wake + 60, 'sh2', SHAKES.morning.label + ' + creatine', 'Protein feed 1. Creatine every day, training or not.', mo.P, mo.kcal, mo.short, { what: 'Shake · ' + mo.P + ' g protein + creatine', detail: 'Whey 30 g in 300 ml milk, creatine 5 g. Or instead: ' + mo.swap + ' — same protein.' });
      slot(lunch, 'm1', 'Meal 1 (lunch)', 'Protein + carbs + veg.', tgt.P, tgt.kcal, null, { what: m1.what, detail: m1.detail });
      slot(Math.min(lunch + 240, last - 180), 'sh1', SHAKES.post.label, 'Mid-afternoon on rest days — keeps protein coming.', SHAKES.post.P, SHAKES.post.kcal, SHAKES.post.how, { what: 'Shake · ' + SHAKES.post.P + ' g protein', detail: 'Whey 40 g + 500 ml milk + a banana. Or instead: skyr 400 g + a banana.' });
      slot(Math.min(wake + 720, last), 'm2', 'Meal 2 (dinner)', 'Protein + carbs + veg. Last food of the day.', tgt.P, tgt.kcal, null, { what: m2.what, detail: m2.detail });
    }
    slot(bed - 45, 'sh3', SHAKES.bed.label, 'Protein for the night: muscle keeps building while you sleep. A drink, not a meal.', SHAKES.bed.P, SHAKES.bed.kcal, SHAKES.bed.how, { what: 'Shake · ' + SHAKES.bed.P + ' g protein', detail: 'Whey 30 g + 300 ml milk. Or instead: skyr 400 g.' });
    var wd = parseISO(iso).getDay(), nl = lattes(profile);
    if (wd >= 1 && wd <= 5) for (var li = 0; li < nl; li++) {
      var lt = li === 0 ? wake + 150 : li === 1 ? Math.min(lunch + 120, hm('14:45')) : Math.min(lunch + 60, hm('14:45'));
      slot(lt, 'la' + (li + 1), 'Caffe latte', 'Counted in your day: less food in the meals to make room. Last one before 15:00 for sleep.', LATTE.P, LATTE.kcal, null, { what: 'Caffe latte', detail: 'Last one before 15:00, for sleep.' });
    }
    slots.sort(function (a, b) { return a.t - b.t; });
    return slots;
  }

  /* ---------- calendar reminders ----------
     Repeating weekly events for the phone's calendar, so reminders work with the app closed.
     Same time on several weekdays = one event with BYDAY. Floating local times. */
  var BYDAY = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
  function reminderEvents(profile, mac, fromIso, withMeals) {
    var sched = profile.sched || { 1: '16:00', 3: '16:00', 5: '16:00' }, groups = {};
    function add(key, title, t, mins, wd, note) {
      var k = key + '|' + t; if (!groups[k]) groups[k] = { key: key, title: title, time: fmtHM(t), mins: mins, days: [], note: note };
      if (groups[k].days.indexOf(wd) < 0) groups[k].days.push(wd);
    }
    for (var wd = 0; wd < 7; wd++) {
      var training = sched[wd] != null;
      var p = { training: training, time: training ? sched[wd] : null, day: 'A', date: fromIso };
      timeline(profile, p, mac).forEach(function (s) {
        if (s.key === 'train') add('train', 'Lift: training', s.t, RULES.sessionMinutes, wd, 'Open Lift → Train.');
        else if (withMeals && s.key === 'sh2') add('morning', 'Lift: morning shake', s.t, 10, wd, 'Whey 30 g + 300 ml milk (or skyr). Open Lift → Today.');
        else if (withMeals && s.key === 'm1') add('m1', 'Lift: lunch', s.t, 20, wd, 'A palm of protein, a fist of veg, a cupped hand of carbs.');
        else if (withMeals && s.key === 'sh1') add('shake', 'Lift: protein shake', s.t, 10, wd, 'Whey 40 g + 500 ml milk + banana.');
        else if (withMeals && s.key === 'sh3') add('bedshake', 'Lift: bedtime shake', s.t, 10, wd, 'Whey 30 g + 300 ml milk.');
        else if (withMeals && s.key === 'm2') add('m2', 'Lift: dinner', s.t, 30, wd, 'A palm of protein, a fist of veg, a cupped hand of carbs.');
      });
    }
    var d0 = parseISO(fromIso);
    return Object.keys(groups).map(function (k) {
      var g = groups[k], first = new Date(d0);
      for (var i = 0; i < 7 && g.days.indexOf(first.getDay()) < 0; i++) first.setDate(first.getDate() + 1);
      g.days.sort(); g.firstDate = isoDate(first); g.rrule = 'FREQ=WEEKLY;BYDAY=' + g.days.map(function (x) { return BYDAY[x]; }).join(',');
      return g;
    }).sort(function (a, b) { return a.time < b.time ? -1 : 1; });
  }
  function icsStamp(iso, hhmm, plusMin) {
    var d = parseISO(iso), m = hm(hhmm) + (plusMin || 0); d.setMinutes(m);
    return d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + 'T' + pad(d.getHours()) + pad(d.getMinutes()) + '00';
  }
  function calendarICS(profile, mac, fromIso, withMeals) {
    var ev = reminderEvents(profile, mac, fromIso, withMeals), now = new Date();
    var stamp = now.getUTCFullYear() + pad(now.getUTCMonth() + 1) + pad(now.getUTCDate()) + 'T' + pad(now.getUTCHours()) + pad(now.getUTCMinutes()) + '00Z';
    var L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Lift//reminders//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:Lift'];
    ev.forEach(function (g) {
      L.push('BEGIN:VEVENT', 'UID:lift-' + g.key + '-' + g.time.replace(':', '') + '@lift', 'DTSTAMP:' + stamp,
        'DTSTART:' + icsStamp(g.firstDate, g.time), 'DTEND:' + icsStamp(g.firstDate, g.time, g.mins), 'RRULE:' + g.rrule,
        'SUMMARY:' + g.title, 'DESCRIPTION:' + g.note,
        'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + g.title, 'TRIGGER:PT0M', 'END:VALARM', 'END:VEVENT');
    });
    L.push('END:VCALENDAR');
    return L.join('\r\n') + '\r\n';
  }
  function googleCalLink(g) {
    return 'https://calendar.google.com/calendar/render?action=TEMPLATE&text=' + encodeURIComponent(g.title) +
      '&dates=' + icsStamp(g.firstDate, g.time) + '/' + icsStamp(g.firstDate, g.time, g.mins) +
      '&recur=' + encodeURIComponent('RRULE:' + g.rrule) + '&details=' + encodeURIComponent(g.note);
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
    if (t.length < 8) return { rate: null, text: 'Weigh in most mornings. After about 2 weeks the trend tells you whether to eat a bit more or a bit less.' };
    var last = t[t.length - 1], back = null;
    for (var i = t.length - 1; i >= 0; i--) {
      if (parseISO(last.date).getTime() - parseISO(t[i].date).getTime() >= 7 * 864e5) { back = t[i]; break; }
    }
    if (!back) return { rate: null, text: 'Keep weighing in — not enough spread of dates yet.' };
    var days = (parseISO(last.date).getTime() - parseISO(back.date).getTime()) / 864e5;
    var rate = (last.avg - back.avg) / days * 7;
    var phase = (state.profile && state.profile.phase) || 'lean', band = RULES.trendTarget[phase];
    var text, adj = 0;
    if (rate < band[0]) { text = 'Losing faster than ' + Math.abs(band[0]) + ' kg a week — that risks muscle. Eat a bit more: a bigger handful of rice, potatoes or bread at lunch and dinner, or a banana with the shake.'; adj = 150; }
    else if (rate > band[1]) { text = phase === 'bulk' ? 'Gaining faster than planned — a bit less rice, potatoes or bread.' : 'Weight is not coming down. Make the rice, potatoes or bread a bit smaller and skip snacks — keep the protein. Or walk 2,000 more steps a day.'; adj = -150; }
    else text = 'On track (' + band[0] + ' to ' + band[1] + ' kg a week). Keep eating the way you do.';
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
    RULES: RULES, PROGRAM: PROGRAM, DUMBBELL: DUMBBELL, LABEL: LABEL, ALT_INFO: ALT_INFO, info: info, PRIORITY: PRIORITY, WARMUP: WARMUP, SHAKES: SHAKES, reminderEvents: reminderEvents, calendarICS: calendarICS, googleCalLink: googleCalLink, LATTE: LATTE, lattes: lattes, MORNING: MORNING, morningFor: morningFor, mealTargets: mealTargets, handPlate: handPlate, palms: palms,
    roundTo: roundTo, isoDate: isoDate, parseISO: parseISO, hm: hm, fmtHM: fmtHM, epley: epley,
    exercisesFor: exercisesFor, findCfg: findCfg, completedSessions: completedSessions, history: history,
    suggest: suggest, recentStalls: recentStalls, plan: plan, movedFrom: movedFrom, shiftWeek: shiftWeek, sundayShift: sundayShift, unshiftWeek: unshiftWeek, buildSession: buildSession, rampSets: rampSets,
    macros: macros, timeline: timeline, weightSeries: weightSeries, weightTrend: weightTrend,
    trendAdvice: trendAdvice, weeklyVolume: weeklyVolume, bestSets: bestSets
  };
});
