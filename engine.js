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
    creatineG: 5,
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

  var SQUAT_HOW = ['Feet shoulder-width apart, arms straight out in front.', 'Sit down slowly as if onto a low chair, chest up, heels on the floor.', 'Stand back up. 10 slow ones.'];
  var WARMUP = {
    general: { id: 'Bicycling_Stationary', label: 'Easy bike or rower', secs: 210, note: 'Conversational pace. Just warm, not tired.',
      how: ['Sit on an exercise bike (or the rowing machine).', 'Pedal easily, slow enough that you could talk.', 'Aim to feel warm, not tired.'] },
    A: [
      { id: 'Standing_Hip_Circles', label: 'Hip circles', reps: '8 each way, each leg',
        how: ['Stand on one leg and hold on to something.', 'Lift the other knee up to hip height.', 'Draw big, slow circles with that knee, out to the side and back. 8 each way, then switch legs.'] },
      { id: 'Bodyweight_Squat', label: 'Bodyweight squats', reps: '10 slow', how: SQUAT_HOW },
      { id: 'Reverse_Flyes', label: 'Light dumbbell reverse fly', reps: '15',
        how: ['Take very light dumbbells (2–5 kg).', 'Lie chest-down on a bench tilted up, arms hanging down.', 'Lift the arms out to the sides until level with your body, squeeze the shoulder blades together, lower slowly.'] },
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

  /* ---------- simple eating: 2 meals + 2 shakes, cook 3× a week ----------
     Total daily protein matters most; 4 feeds (2 meals + 2 shakes) covers the
     "spread it out" bonus without cooking 4 times. Each cook makes 4 portions:
     dinner that day, lunch + dinner the next day, lunch the day after. Three cooks
     = 12 of 14 weekly meals; the 2 left are no-cook meals. */
  var SHAKES = {
    post: { label: 'Protein shake', short: 'Shake: whey 40 g + 500 ml milk + banana', P: 50, kcal: 420, how: 'Whey 40 g + 500 ml skimmed milk + 1 banana. Right after training (or mid-afternoon on rest days).' },
    morning: { label: 'Morning protein', short: 'Skyr 400 g (or a whey shake)', P: 40, kcal: 250, how: 'Skyr 400 g — or whey 30 g in 300 ml milk. No cooking; at home or on the way.' }
  };
  /* per 100 g raw/dry */
  var FOOD = {
    chicken: { name: 'chicken breast (raw)', P: 23, kcal: 110, cat: 'meat' },
    turkey: { name: 'turkey mince 7 % (raw)', P: 20, kcal: 140, cat: 'meat' },
    beef: { name: 'beef mince 5 % (raw)', P: 21, kcal: 125, cat: 'meat' },
    beefstrips: { name: 'lean beef strips (raw)', P: 22, kcal: 120, cat: 'meat' },
    salmon: { name: 'salmon fillet (raw)', P: 20, kcal: 200, cat: 'meat' },
    cod: { name: 'cod fillet (raw or frozen)', P: 18, kcal: 80, cat: 'meat' },
    brownrice: { name: 'brown rice (dry)', P: 8, kcal: 360, cat: 'carb' },
    potato: { name: 'potatoes (raw)', P: 2, kcal: 77, cat: 'veg' },
    sweetpotato: { name: 'sweet potatoes (raw)', P: 1.6, kcal: 86, cat: 'veg' },
    pasta: { name: 'wholegrain pasta (dry)', P: 13, kcal: 350, cat: 'carb' },
    bulgur: { name: 'bulgur (dry)', P: 12, kcal: 350, cat: 'carb' },
    couscous: { name: 'wholegrain couscous (dry)', P: 13, kcal: 360, cat: 'carb' }
  };
  /* Nine recipes in three groups. The week rotates poultry → fish → (red meat one week,
     poultry the next), so there is fish every week and lean red meat only every other
     week. Each batch is seasoned two ways, so lunch and dinner in a row never taste the same. */
  var RECIPES = [
    { key: 'chicken-rice', group: 'poultry', name: 'Chicken, brown rice & wok veg', protein: 'chicken', carb: 'brownrice', flavours: ['paprika & garlic', 'mild curry'],
      buy: [['veg', 'frozen wok vegetables', 1000, 'g'], ['veg', 'garlic', 1, 'bulb'], ['cupboard', 'paprika', 1, 'jar'], ['cupboard', 'mild curry powder', 1, 'jar']],
      extra: { name: 'frozen wok vegetables', g: 250, P: 5, kcal: 75 }, oil: 10,
      steps: ['Rice: boil all of it in one big pot (brown rice ~25 min).', 'Chicken: cut in strips, spread on two oven trays at 200 °C for 20–25 min.', 'Veg: fry in a pan 8 min with a little oil, garlic and salt.'] },
    { key: 'chicken-bulgur', group: 'poultry', name: 'Shawarma chicken, bulgur & salad', protein: 'chicken', carb: 'bulgur', flavours: ['shawarma spice', 'lemon & herbs'],
      buy: [['veg', 'tomatoes', 4, 'pcs'], ['veg', 'cucumber', 1, 'pcs'], ['veg', 'red onion', 2, 'pcs'], ['veg', 'lemon', 1, 'pcs'], ['dairy', 'Greek yoghurt', 200, 'g'], ['cupboard', 'shawarma spice', 1, 'jar']],
      extra: { name: 'tomato, cucumber, onion & a spoon of yoghurt dressing', g: 250, P: 5, kcal: 80 }, oil: 10,
      steps: ['Bulgur: pour boiling water over it (twice its volume), lid on, 15 min.', 'Chicken: thin strips, fry hot in a pan in two rounds.', 'Salad: chop tomato, cucumber and onion; keep it separate so it stays crisp; add the yoghurt when you eat.'] },
    { key: 'chicken-sweetpotato', group: 'poultry', name: 'Chicken, sweet potato & green beans', protein: 'chicken', carb: 'sweetpotato', flavours: ['harissa', 'lemon & garlic'],
      buy: [['veg', 'frozen green beans', 1000, 'g'], ['veg', 'lemon', 1, 'pcs'], ['veg', 'garlic', 1, 'bulb'], ['cupboard', 'harissa', 1, 'jar']],
      extra: { name: 'green beans', g: 250, P: 5, kcal: 75 }, oil: 10,
      steps: ['Sweet potatoes in cubes on an oven tray, 200 °C for 30 min with a little oil and salt.', 'Chicken on a second tray for the last 20–25 min.', 'Green beans: boil 5 min.'] },
    { key: 'turkey-pasta', group: 'poultry', name: 'Turkey meatballs, tomato sauce & wholegrain pasta', protein: 'turkey', carb: 'pasta', flavours: ['basil', 'oregano & chili'],
      buy: [['cupboard', 'chopped tomatoes', 2, 'can'], ['veg', 'fresh spinach', 300, 'g'], ['veg', 'onion', 1, 'pcs'], ['veg', 'garlic', 1, 'bulb'], ['cupboard', 'dried basil or oregano', 1, 'jar']],
      extra: { name: 'tomato sauce with spinach', g: 250, P: 4, kcal: 90 }, oil: 5,
      steps: ['Meatballs: mix the mince with salt, pepper and grated onion, roll small balls, oven 200 °C for 15 min.', 'Sauce: garlic in a pot, 2 cans chopped tomatoes, simmer 10 min, stir in the spinach at the end.', 'Pasta in one big pot; keep sauce and pasta in the same box.'] },
    { key: 'salmon-potato', group: 'fish', name: 'Salmon, potatoes & broccoli', protein: 'salmon', carb: 'potato', flavours: ['lemon & dill', 'garlic & paprika'],
      buy: [['veg', 'broccoli', 1000, 'g'], ['veg', 'lemon', 1, 'pcs'], ['cupboard', 'dried dill', 1, 'jar']],
      extra: { name: 'broccoli', g: 250, P: 7, kcal: 85 }, oil: 0,
      steps: ['Potatoes in wedges, oven 200 °C for 35 min.', 'Salmon on the same tray for the last 15 min.', 'Broccoli: steam 5 min. Eat the salmon boxes within 2 days.'] },
    { key: 'cod-curry', group: 'fish', name: 'Cod curry with peas & brown rice', protein: 'cod', carb: 'brownrice', flavours: ['mild curry', 'tomato & ginger'],
      buy: [['veg', 'frozen peas', 500, 'g'], ['cupboard', 'chopped tomatoes', 2, 'can'], ['veg', 'onion', 2, 'pcs'], ['veg', 'fresh ginger', 1, 'pcs'], ['cupboard', 'curry paste', 1, 'jar']],
      extra: { name: 'peas, tomato & onion sauce', g: 250, P: 8, kcal: 110 }, oil: 10,
      steps: ['Sauce: fry onion and ginger, add curry paste and 2 cans chopped tomatoes, simmer 10 min.', 'Add the cod in chunks and the peas, 8 min on low heat.', 'Brown rice in one big pot (~25 min).'] },
    { key: 'salmon-couscous', group: 'fish', name: 'Oven salmon, couscous & roasted veg', protein: 'salmon', carb: 'couscous', flavours: ['lemon & herbs', 'harissa'],
      buy: [['veg', 'squash (zucchini)', 2, 'pcs'], ['veg', 'bell pepper', 2, 'pcs'], ['veg', 'red onion', 2, 'pcs'], ['veg', 'lemon', 1, 'pcs']],
      extra: { name: 'roasted squash, pepper & onion', g: 250, P: 3, kcal: 70 }, oil: 10,
      steps: ['Veg in chunks on an oven tray, 200 °C for 25 min.', 'Salmon on a second tray for 15 min.', 'Couscous: boiling water over it, lid on, 5 min. Eat the salmon boxes within 2 days.'] },
    { key: 'chili', group: 'red', name: 'Chili con carne with beans & brown rice', protein: 'beef', carb: 'brownrice', flavours: ['classic chili', 'smoky paprika'],
      buy: [['cupboard', 'kidney beans', 1, 'can'], ['cupboard', 'chopped tomatoes', 2, 'can'], ['veg', 'onion', 2, 'pcs'], ['veg', 'bell pepper', 2, 'pcs'], ['cupboard', 'chili spice', 1, 'jar']],
      extra: { name: 'beans, chopped tomatoes, onion & pepper', g: 250, P: 7, kcal: 110 }, oil: 5,
      steps: ['Fry onion and pepper, add the mince and brown it.', 'Add the beans and 2 cans chopped tomatoes; simmer 20 min.', 'Brown rice in one big pot (~25 min).'] },
    { key: 'beef-bulgur', group: 'red', name: 'Kebab-style beef strips, bulgur & salad', protein: 'beefstrips', carb: 'bulgur', flavours: ['kebab spice', 'cumin & lemon'],
      buy: [['veg', 'tomatoes', 4, 'pcs'], ['veg', 'cucumber', 1, 'pcs'], ['veg', 'red onion', 2, 'pcs'], ['veg', 'lemon', 1, 'pcs'], ['dairy', 'Greek yoghurt', 200, 'g'], ['cupboard', 'kebab spice (or cumin + paprika)', 1, 'jar']],
      extra: { name: 'tomato, cucumber, onion & a spoon of yoghurt dressing', g: 250, P: 5, kcal: 80 }, oil: 10,
      steps: ['Bulgur: pour boiling water over it (twice its volume), lid on, 15 min.', 'Beef strips: fry hot in a pan in two rounds.', 'Salad: chop tomato, cucumber and onion; keep it separate; add the yoghurt when you eat.'] }
  ];
  function byGroup(g) { return RECIPES.filter(function (r) { return r.group === g; }); }
  function mod(a, n) { return ((a % n) + n) % n; }
  /* Recipe for cook slot `slot` (0, 1, 2 = 1st, 2nd, 3rd cook day of the week) in week `wk`. */
  function pickRecipe(slot, wk) {
    var poultry = byGroup('poultry'), fish = byGroup('fish'), red = byGroup('red');
    var redWeek = mod(wk, 2) === 0, base = wk + Math.floor(wk / 2);   // poultry batches before this week
    if (slot === 1) return fish[mod(wk, fish.length)];
    if (slot === 2 && redWeek) return red[mod(Math.floor(wk / 2), red.length)];
    return poultry[mod(base + (slot === 2 ? 1 : 0), poultry.length)];
  }
  /* Morning protein changes every day (no cooking in any of them). */
  var MORNING = [
    { short: 'Skyr 400 g + a handful of frozen berries', P: 42, kcal: 290, buy: [['dairy', 'skyr (400 g tubs)', 1, 'pcs'], ['veg', 'frozen berries', 80, 'g']] },
    { short: 'Whey shake: 30 g whey in 300 ml milk', P: 35, kcal: 225, buy: [['shake', 'whey protein', 30, 'g'], ['dairy', 'skimmed milk', 300, 'ml']] },
    { short: 'Cottage cheese 300 g + cucumber', P: 36, kcal: 270, buy: [['dairy', 'cottage cheese', 300, 'g'], ['veg', 'cucumber', 0.5, 'pcs']] },
    { short: 'Skyr 400 g with cinnamon', P: 40, kcal: 250, buy: [['dairy', 'skyr (400 g tubs)', 1, 'pcs']] }
  ];
  function dayNo(iso) { return Math.round(parseISO(iso).getTime() / 864e5); }
  function morningFor(iso) { return MORNING[mod(dayNo(iso), MORNING.length)]; }
  var NOCOOK = [
    'Rugbrød 3 slices + 1 can tuna + cottage cheese 200 g + cucumber',
    'Half a grilled chicken + 2 wraps + salad',
    '4 eggs + 3 slices rugbrød + skyr 200 g',
    'Smoked mackerel or salmon 150 g + rugbrød 3 slices + cottage cheese 150 g',
    'Wholegrain wrap with 125 g chicken slices, hummus & salad',
    'Canned mackerel in tomato + 3 slices rugbrød + carrot sticks'
  ];
  /* What each no-cook meal needs, same order as NOCOOK. */
  var NOCOOK_BUY = [
    [['meat', 'tuna in water', 1, 'can'], ['carb', 'rugbrød', 3, 'slices'], ['dairy', 'cottage cheese', 200, 'g'], ['veg', 'cucumber', 1, 'pcs']],
    [['meat', 'grilled chicken (ready-made)', 0.5, 'pcs'], ['carb', 'wraps', 2, 'pcs'], ['veg', 'salad bag', 1, 'pcs']],
    [['dairy', 'eggs', 4, 'pcs'], ['carb', 'rugbrød', 3, 'slices'], ['dairy', 'skyr', 200, 'g']],
    [['meat', 'smoked mackerel', 150, 'g'], ['carb', 'rugbrød', 3, 'slices'], ['dairy', 'cottage cheese', 150, 'g']],
    [['carb', 'wholegrain wraps', 2, 'pcs'], ['meat', 'chicken slices (cold cuts)', 125, 'g'], ['cupboard', 'hummus', 100, 'g'], ['veg', 'salad bag', 1, 'pcs']],
    [['meat', 'mackerel in tomato', 1, 'can'], ['carb', 'rugbrød', 3, 'slices'], ['veg', 'carrots', 2, 'pcs']]
  ];
  /* People who eat the cooked dinners too. Their plates are estimated smaller than the
     user's (adult ~70 %, child ~50 %). A batch covers 2 dinners, so each extra person
     adds 2 of their portions to the pot. */
  var FAMILY_SHARE = { adults: 0.7, kids: 0.5 };
  function family(profile) { var f = (profile && profile.family) || {}; return { adults: f.adults || 0, kids: f.kids || 0 }; }
  function batchServings(profile) { var f = family(profile); return 4 + 2 * (f.adults * FAMILY_SHARE.adults + f.kids * FAMILY_SHARE.kids); }
  function batchBuy(recipe, pt, profile) {
    var n = batchServings(profile), k = n / 4, pf = FOOD[recipe.protein], cf = FOOD[recipe.carb], out = [];
    function r(q, unit) { return unit === 'g' || unit === 'ml' ? Math.round(q / 10) * 10 : Math.ceil(q - 1e-9); }
    out.push({ cat: pf.cat, name: pf.name, qty: r(pt.items[0].g * n, 'g'), unit: 'g' });
    out.push({ cat: cf.cat, name: cf.name, qty: r(pt.items[1].g * n, 'g'), unit: 'g' });
    pt.items.forEach(function (it) { if (it.slices) out.push({ cat: 'carb', name: 'rugbrød', qty: it.slices * 4, unit: 'slices' }); });   // bread is only in the user's boxes
    if (recipe.oil) out.push({ cat: 'cupboard', name: 'olive or rapeseed oil', qty: r(recipe.oil * n, 'ml'), unit: 'ml' });
    (recipe.buy || []).forEach(function (x) { out.push({ cat: x[0], name: x[1], qty: x[3] === 'jar' ? 1 : r(x[2] * k, x[3]), unit: x[3] }); });
    return out;
  }
  var SHOP_CATS = [['meat', 'Meat & fish'], ['carb', 'Rice, bulgur & bread'], ['veg', 'Vegetables & fruit'], ['dairy', 'Dairy & eggs'], ['shake', 'Shakes & creatine'], ['cupboard', 'Cupboard']];
  /* Everything to buy for the 7 days from fromIso: the cook days' batches, the no-cook
     meals, the daily shakes, skyr and creatine. Same items are added together. */
  function weekShopping(profile, fromIso, mac) {
    var tgt = mealTargets(mac), d0 = parseISO(fromIso), items = {}, cooks = [], nocook = 0;
    function add(cat, name, qty, unit) { var k = cat + '|' + name + '|' + unit; if (!items[k]) items[k] = { key: k, cat: cat, name: name, qty: 0, unit: unit }; items[k].qty += qty; }
    for (var i = 0; i < 7; i++) {
      var dt = new Date(d0); dt.setDate(d0.getDate() + i); var iso = isoDate(dt);
      var b = batchFor(profile, iso, 2);
      if (b && b.cookToday) {
        var pt = portion(b.recipe, tgt.P, tgt.kcal);
        cooks.push({ date: iso, name: b.recipe.name });
        batchBuy(b.recipe, pt, profile).forEach(function (x) { if (x.unit === 'jar') { if (!items[x.cat + '|' + x.name + '|jar']) add(x.cat, x.name, 1, 'jar'); } else add(x.cat, x.name, x.qty, x.unit); });
      }
      morningFor(iso).buy.forEach(function (x) { add(x[0], x[1], x[2], x[3]); });
      [1, 2].forEach(function (m) { if (!batchFor(profile, iso, m)) { nocook++; NOCOOK_BUY[mod(dayNo(iso) * 2 + m, NOCOOK.length)].forEach(function (x) { add(x[0], x[1], x[2], x[3]); }); } });
    }
    add('shake', 'whey protein', 7 * 40, 'g'); add('dairy', 'skimmed milk', 7 * 500, 'ml'); add('veg', 'bananas', 7, 'pcs');
    add('shake', 'creatine monohydrate', 7 * 5, 'g');
    var groups = SHOP_CATS.map(function (c) {
      return { cat: c[0], label: c[1], items: Object.keys(items).map(function (k) { return items[k]; }).filter(function (it) { return it.cat === c[0]; })
        .sort(function (a, b) { return a.name < b.name ? -1 : 1; }) };
    }).filter(function (g) { return g.items.length; });
    var to = new Date(d0); to.setDate(d0.getDate() + 6);
    return { from: fromIso, to: isoDate(to), cooks: cooks, nocook: nocook, groups: groups };
  }
  function fmtQty(it) {
    var q = it.qty, u = it.unit;
    if (u === 'g') return q >= 1000 ? (Math.round(q / 100) / 10) + ' kg' : Math.round(q) + ' g';
    if (u === 'ml') return q >= 1000 ? (Math.round(q / 100) / 10) + ' L' : Math.round(q) + ' ml';
    if (u === 'slices') return q + ' slices' + (q >= 12 ? ' (~' + Math.ceil(q / 16) + ' loaf' + (Math.ceil(q / 16) > 1 ? 's' : '') + ')' : '');
    if (u === 'can') return q + (q > 1 ? ' cans' : ' can');
    if (u === 'jar') return '1 jar (if you have none)';
    if (u === 'bulb') return q + ' bulb' + (q > 1 ? 's' : '');
    return (q % 1 ? q.toFixed(1).replace('.5', '½').replace(/^0/, '') : q) + '';
  }

  function r10(g) { return Math.max(0, Math.round(g / 10) * 10); }
  /* One portion: enough protein food to reach the meal's protein, carbs up to a sensible
     plate size for the remaining kcal, and rugbrød on the side if still short. */
  var CARB_CAP = { brownrice: 150, pasta: 150, bulgur: 150, couscous: 150, potato: 600, sweetpotato: 600 };
  function portion(recipe, mealP, mealK) {
    var pf = FOOD[recipe.protein], cf = FOOD[recipe.carb], ex = recipe.extra, oilK = recipe.oil * 9;
    var y = r10(Math.max(120, (mealP - ex.P) / pf.P * 100));
    var left = mealK - ex.kcal - oilK - pf.kcal * y / 100;
    var x = r10(Math.min(CARB_CAP[recipe.carb], Math.max(0, left / cf.kcal * 100)));
    left -= cf.kcal * x / 100;
    var bread = Math.max(0, Math.min(3, Math.round(left / 110)));   // rugbrød slice ≈ 50 g, 110 kcal, 3 g protein
    var items = [{ name: pf.name, g: y }, { name: cf.name, g: x }, { name: ex.name, g: ex.g }];
    if (recipe.oil) items.push({ name: 'oil', g: recipe.oil });
    if (bread) items.push({ name: 'rugbrød', g: bread * 50, slices: bread });
    return { items: items, P: Math.round(pf.P * y / 100 + cf.P * x / 100 + ex.P + bread * 3), kcal: Math.round(pf.kcal * y / 100 + cf.kcal * x / 100 + ex.kcal + oilK + bread * 110) };
  }
  function mealTargets(mac) {
    var P = mac ? mac.protein : 160, K = mac ? mac.kcal : 2400;
    return { P: Math.round((P - SHAKES.post.P - SHAKES.morning.P) / 2), kcal: Math.round((K - SHAKES.post.kcal - SHAKES.morning.kcal) / 20) * 10 };
  }
  /* Which batch feeds meal 1 (lunch) / meal 2 (dinner) on a date. */
  var COOK_DEFAULT = [0, 2, 4];   // Sun, Tue, Thu
  function cookDays(profile) { var c = profile && profile.cookDays; return (c && c.length ? c : COOK_DEFAULT).slice().sort(); }
  function batchFor(profile, iso, meal) {
    var d = parseISO(iso), days = cookDays(profile);
    // a batch cooked on day c covers: c dinner, c+1 lunch+dinner, c+2 lunch
    var offs = meal === 2 ? [0, 1] : [1, 2];
    for (var i = 0; i < offs.length; i++) {
      var c = new Date(d); c.setDate(d.getDate() - offs[i]);
      var idx = days.indexOf(c.getDay());
      if (idx >= 0) {
        var wk = Math.floor(Math.round((c.getTime() - new Date(2026, 0, 4).getTime()) / 864e5) / 7); // weeks since a Sunday (round: DST)
        var box = meal === 2 ? (offs[i] === 0 ? 0 : 2) : (offs[i] === 1 ? 1 : 3), recipe = pickRecipe(idx, wk);
        return { recipe: recipe, cookedOn: isoDate(c), cookToday: offs[i] === 0, box: box, flavour: recipe.flavours[box % 2] };
      }
    }
    return null;
  }
  function mealText(profile, iso, meal, tgt) {
    var b = batchFor(profile, iso, meal);
    if (!b) { var nc = NOCOOK[mod(dayNo(iso) * 2 + meal, NOCOOK.length)];
      return { text: 'No-cook meal: ' + nc, what: 'No-cook meal', detail: nc, cook: false }; }
    var pt = portion(b.recipe, tgt.P, tgt.kcal);
    var amounts = pt.items.map(function (it) { return (it.slices ? it.slices + ' slice' + (it.slices > 1 ? 's' : '') : it.g + ' g') + ' ' + it.name; }).join(', ');
    return { text: (b.cookToday ? 'Cook today (4 boxes): ' : 'From the fridge: ') + b.recipe.name + ' — ' + amounts,
      what: (b.cookToday ? 'Cook, then eat: ' : 'Box from the fridge: ') + b.recipe.name + ' · ' + b.flavour, detail: b.cookToday ? 'Make 4 boxes; one box = ' + amounts : amounts,
      cook: b.cookToday, recipe: b.recipe.key };
  }

  /* Clock-time eating schedule for a date: 2 meals + 2 shakes (+ creatine). */
  function timeline(profile, p, mac) {
    var wake = hm(profile.wake || '06:30'), bed = hm(profile.bed || '22:30');
    if (bed <= wake) bed += 1440;
    var tgt = mealTargets(mac), iso = p.date, slots = [];
    function slot(t, key, label, why, P, kcal, foods, extra) {
      slots.push(Object.assign({ t: t, time: fmtHM(t), key: key, label: label, why: why, protein: P, kcal: kcal ? Math.round(kcal / 10) * 10 : 0, foods: foods ? [foods] : null }, extra || {}));
    }
    var m1 = mealText(profile, iso, 1, tgt), m2 = mealText(profile, iso, 2, tgt), mo = morningFor(iso);
    var lunch = hm(profile.lunch || '11:30'), last = bed - 180;   // nothing in the last 3 h before bed
    if (p.training && p.time) {
      var T = hm(p.time); if (T < wake) T += 1440;
      var end = T + RULES.sessionMinutes;
      slot(wake + 60, 'sh2', SHAKES.morning.label, 'Protein feed 1 — starts the day without cooking.', mo.P, mo.kcal, mo.short, { what: mo.short, detail: 'No cooking — at home or on the way.' });
      slot(lunch, 'm1', 'Meal 1 (lunch)', T - lunch >= 60 ? 'Carbs + protein — also the fuel for the afternoon session.' : 'Recovery meal after the morning session.', tgt.P, tgt.kcal, m1.text, { cook: m1.cook, what: m1.what, detail: m1.detail });
      slot(T - 15, 'cr', 'Creatine 5 g + water', 'Every day. Timing barely matters — consistency does. A banana now helps if lunch feels long ago.', 0, 0, null, { what: 'Creatine 5 g in water', detail: 'A banana too, if lunch feels long ago.' });
      slot(T, 'train', 'Train', 'Session ' + p.day + ' · ~' + RULES.sessionMinutes + ' min incl. warm-up.', 0, 0, null, { what: 'Train · session ' + p.day, detail: '~' + RULES.sessionMinutes + ' min incl. warm-up.' });
      slot(Math.min(end + 5, last), 'sh1', SHAKES.post.label, 'Straight after training: fast protein while you head home.', SHAKES.post.P, SHAKES.post.kcal, SHAKES.post.how, { what: SHAKES.post.short, detail: SHAKES.post.how });
      slot(Math.min(end + 100, last), 'm2', 'Meal 2 (dinner)', 'The big meal: protein + carbs + veg. Last food of the day.', tgt.P, tgt.kcal, m2.text, { cook: m2.cook, what: m2.what, detail: m2.detail });
    } else {
      slot(wake + 60, 'sh2', SHAKES.morning.label + ' + creatine', 'Protein feed 1. Creatine every day, training or not.', mo.P, mo.kcal, mo.short, { what: mo.short + ' + creatine 5 g', detail: 'No cooking — at home or on the way.' });
      slot(lunch, 'm1', 'Meal 1 (lunch)', 'Protein + carbs + veg.', tgt.P, tgt.kcal, m1.text, { cook: m1.cook, what: m1.what, detail: m1.detail });
      slot(Math.min(lunch + 240, last - 180), 'sh1', SHAKES.post.label, 'Mid-afternoon on rest days — keeps protein coming.', SHAKES.post.P, SHAKES.post.kcal, SHAKES.post.how, { what: SHAKES.post.short, detail: SHAKES.post.how });
      slot(Math.min(wake + 720, last), 'm2', 'Meal 2 (dinner)', 'Protein + carbs + veg. Last food of the day.', tgt.P, tgt.kcal, m2.text, { cook: m2.cook, what: m2.what, detail: m2.detail });
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
    RULES: RULES, PROGRAM: PROGRAM, DUMBBELL: DUMBBELL, LABEL: LABEL, ALT_INFO: ALT_INFO, info: info, PRIORITY: PRIORITY, WARMUP: WARMUP, SHAKES: SHAKES, FOOD: FOOD, RECIPES: RECIPES, NOCOOK: NOCOOK, portion: portion, weekShopping: weekShopping, MORNING: MORNING, morningFor: morningFor, pickRecipe: pickRecipe, fmtQty: fmtQty, family: family, batchServings: batchServings, batchBuy: batchBuy, mealTargets: mealTargets, cookDays: cookDays, batchFor: batchFor,
    roundTo: roundTo, isoDate: isoDate, parseISO: parseISO, hm: hm, fmtHM: fmtHM, epley: epley,
    exercisesFor: exercisesFor, findCfg: findCfg, completedSessions: completedSessions, history: history,
    suggest: suggest, recentStalls: recentStalls, plan: plan, buildSession: buildSession, rampSets: rampSets,
    macros: macros, timeline: timeline, weightSeries: weightSeries, weightTrend: weightTrend,
    trendAdvice: trendAdvice, weeklyVolume: weeklyVolume, bestSets: bestSets
  };
});
