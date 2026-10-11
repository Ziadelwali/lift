/* engine.js - the rules of the app as pure functions. No DOM. Loaded by
   index.html and by tools/test-engine.js (node). Everything here follows the
   evidence summarised in README.md: about 9-15 hard sets per muscle per week,
   1-3 reps in reserve, double progression, an easy week only when lifts stall, protein spread
   over 5 feeds (2 meals + 3 shakes), creatine daily. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ENGINE = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var RULES = {
    findSets: 2,                // first time on an exercise: 2 sets to find the weight
    epleyMaxReps: 12,           // Epley guesses badly above ~12 reps
    // Easy week (deload): after two stalled lifts or when you ask for one, not on a fixed rota
    // (Coleman 2024: a planned deload week didn't help growth and cost a little strength).
    deloadLoad: 0.9, deloadSets: 0.5,
    breakDays: 14, breakLoad: 0.9, // 2+ weeks off: the first session back is 10 % lighter
    refindDays: 42,             // 6+ weeks off: find the weights again
    stallDrop: 0.9,             // cut load 10 % after two failed sessions
    sessionMinutes: 65,
    warmupMinutes: 10,          // 6–8 min uphill walk + ~2 min of moves
    // Protein from the GOAL weight, not today's weight: 2.2 g × 93 kg ≈ 200 g ≈ 2.5 g per kg of lean mass,
    // the top of what helps dieting lifters (Morton 2018: gains plateau near 1.6 g/kg; Helms 2014).
    proteinPerGoalKg: 2.2,
    proteinPerKg: 2.0, // fallback when no goal weight is set
    fatShare: 0.25,
    phase: { lean: 0.90, maintain: 1.0, bulk: 1.10 },  // lean = −10 %: small enough that muscle gain is barely slowed
    activity: { desk: 1.35, feet: 1.5, active: 1.65 },
    // kg/week. Lean −0.2 to −0.5 ≈ a 300–550 kcal/day deficit, where lean mass can still grow (Murphy & Koehler 2022).
    trendTarget: { lean: [-0.5, -0.2], maintain: [-0.2, 0.2], bulk: [0.2, 0.45] },
    trendHalfLife: 7,           // days: the trend line moves halfway to a new weigh-in after a week, gaps or not
    rateDays: 21, rateMinDays: 14, rateMinCount: 10, // rate = slope of the last 3 weeks; needs 10 weigh-ins over 2+ weeks
    creatineG: 5,
    volumeBand: { normal: [9, 15], priority: [12, 20] },   // hard sets a week (Pelland 2025: more still helps, less each time)
    dumbbellMaxKg: 30 // heaviest dumbbell at B1973 Fitness (per hand)
  };

  /* ---------- program ---------- */
  var PROGRAM = {
    A: [
      { id: 'Leg_Press', sets: 3, reps: [6, 10], inc: 5, rest: 120, ramp: true,
        where: 'Nautilus leg press.',
        tip: 'Feet mid-plate. Knees to 90°, lower back stays on the pad.',
        alts: ['Smith_Machine_Squat'] },
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
      // Leg press and squats barely grow the front-of-thigh muscle that crosses the hip (rectus
      // femoris); leg extensions do (Maeo 2018, Zabaleta-Korta 2021). Quads: 9 → 11–13 sets a week.
      { id: 'Leg_Extensions', sets: 2, reps: [10, 15], inc: 5, rest: 60,
        where: 'Nautilus leg extension.',
        tip: 'Straighten fully, squeeze 1 s, lower slowly.',
        alts: ['Goblet_Squat'] },
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

  /* How hard to go, one short line per card. Growth rises as sets get closer to failure (Robinson
     2024), and machines and cables make that safe: their last set goes until no clean rep is left.
     Free weights and big lifts stop with 1–2 reps left. Where the stretch matters, slow down there;
     for calves, half reps at the bottom (lengthened partials) once full reps stop. */
  var TO_FAILURE = ['Leg_Extensions', 'Seated_Leg_Curl', 'Calf_Press_On_The_Leg_Press_Machine', 'Smith_Machine_Calf_Raise',
    'Triceps_Pushdown_-_Rope_Attachment', 'Triceps_Pushdown', 'Cable_Rope_Overhead_Triceps_Extension', 'Standing_Biceps_Cable_Curl',
    'Straight-Arm_Pulldown', 'Rope_Straight-Arm_Pulldown', 'Cable_Seated_Lateral_Raise', 'Face_Pull', 'Cable_Rear_Delt_Fly',
    'Ab_Crunch_Machine', 'Cable_Crunch'];
  var STRETCH = {
    Seated_Leg_Curl: 'Slow down, pause 1 s in the stretch.',
    Cable_Rope_Overhead_Triceps_Extension: 'Slow down, pause 1 s in the stretch.',
    Incline_Dumbbell_Curl: 'Slow down, pause 1 s in the stretch.',
    'Wide-Grip_Lat_Pulldown': 'Slow down, pause 1 s in the stretch.',
    Calf_Press_On_The_Leg_Press_Machine: 'Last set: when full reps stop, keep doing half reps at the bottom.'
  };
  function cue(id) {
    if (BODYWEIGHT.indexOf(id) !== -1) return '';
    var s = STRETCH[id];
    if (/^Last set/.test(s || '')) return s;
    return (s ? s + ' ' : '') + (TO_FAILURE.indexOf(id) !== -1 ? 'Last set: until no clean rep is left.' : 'Stop with 1–2 reps left in the tank.');
  }

  /* Exercises loaded with dumbbells: capped at RULES.dumbbellMaxKg. */
  var DUMBBELL = ['Dumbbell_Bench_Press', 'Incline_Dumbbell_Press', 'Dumbbell_Shoulder_Press', 'Side_Lateral_Raise',
    'Seated_Side_Lateral_Raise', 'Stiff-Legged_Dumbbell_Deadlift', 'One-Arm_Dumbbell_Row', 'Dumbbell_Incline_Row',
    'Dumbbell_Bicep_Curl', 'Hammer_Curls', 'Incline_Dumbbell_Curl', 'Standing_Dumbbell_Triceps_Extension', 'Goblet_Squat', 'Reverse_Flyes', 'Standing_Dumbbell_Calf_Raise'];

  /* Exercises done with body weight only: ticked with kg = 0, progressed by reps. */
  var BODYWEIGHT = ['Plank'];

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
  function roundHalf(kg) { return Math.round(kg * 2) / 2; }
  /* About a fraction f of kg, in whole steps of inc down from kg (at least one step; never 0). */
  function lighter(kg, f, inc) {
    if (!kg) return kg;
    var v = roundHalf(kg - Math.max(1, Math.round(kg * (1 - f) / inc)) * inc);
    return v > 0 ? v : kg;
  }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function isoDate(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function parseISO(s) { var p = s.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function hm(t) { var p = (t || '00:00').split(':'); return (+p[0]) * 60 + (+p[1]); }
  function fmtHM(m) { m = ((m % 1440) + 1440) % 1440; return pad(Math.floor(m / 60)) + ':' + pad(m % 60); }
  function epley(kg, reps) { return reps >= 1 ? kg * (1 + reps / 30) : 0; }
  /* Calendar-day arithmetic on 'YYYY-MM-DD' strings: safe across daylight-saving changes. */
  function addDaysISO(iso, n) { var d = parseISO(iso); d.setDate(d.getDate() + n); return isoDate(d); }
  function daysBetween(a, b) { return Math.round((parseISO(b) - parseISO(a)) / 864e5); }

  /* Training days: weekday (0 = Sun) -> 'HH:MM'. Mon/Wed/Fri 16:00 until the profile says otherwise. */
  function schedOf(profile) { return (profile && profile.sched) || { 1: '16:00', 3: '16:00', 5: '16:00' }; }
  function mondayOf(iso) { var d = parseISO(iso); d.setDate(d.getDate() - (d.getDay() + 6) % 7); return isoDate(d); }
  function freshSets(sg) { var sets = []; for (var i = 0; i < sg.sets; i++) sets.push({ kg: sg.kg, reps: sg.reps, rir: null, done: false }); return sets; }

  function exercisesFor(day, profile) {
    var prio = (profile && profile.priority) || ['shoulders', 'back'];
    return PROGRAM[day].filter(function (e) { return !e.prio || prio.indexOf(e.prio) !== -1; });
  }
  /* The exercise done for a program slot: the saved swap ("from now on") if it is still an option. */
  function idFor(state, cfg) {
    var swap = state.settings && state.settings.swaps && state.settings.swaps[cfg.id];
    return swap && (cfg.alts || []).indexOf(swap) !== -1 ? swap : cfg.id;
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
    var keys = completedSessions(state), out = [], bw = BODYWEIGHT.indexOf(exId) !== -1;
    keys.forEach(function (k) {
      var ses = state.sessions[k];
      (ses.ex || []).forEach(function (e) {
        if (e.id !== exId) return;
        var sets = (e.sets || []).filter(function (s) { return s.done && s.reps > 0 && (s.kg > 0 || (bw && s.kg === 0)); });
        // calib = these sets were finding the weight (the exercise's first time; older data: the first sessions)
        var st = e.suggest && e.suggest.state;
        // light = lighter on purpose (easy week, first session after a break): not a base for progression
        if (sets.length) out.push({ date: k, sets: sets, feel: e.feel || null, calib: st ? st === 'calibrate' : !!ses.calibration,
          light: st ? st === 'deload' || st === 'back' : !!ses.deload });
      });
    });
    return out;
  }

  /* "How was it?" as reps left in the tank. Not answered: the last set's logged rir, else about right. */
  function feelOf(h) {
    if (h.feel) return h.feel;
    var s = h.sets[h.sets.length - 1], r = s && s.rir;
    return r >= 3 ? 'easy' : r === 0 ? 'hard' : 'right';
  }

  /* Double progression, steered by "How was it?" (Easy / About right / Hard = 3 / 2 / 0 reps left).
     People guess about one rep too few left (Halperin 2021), so Easy is a safe sign to move faster.
     All sets at the top of the range: up 2 steps when easy (1 for dumbbells), else 1 step.
     In the range: +2 reps when easy, +1 about right, same again when hard. Below: hold, then drop.
     Returns {kg, reps, sets, note, state}: 'calibrate' (find the weight), 'set' (weight from the
     finding sets), 'up', 'push', 'again', 'hold', 'drop', 'maxed', 'deload', 'back' (after a break).
     opts: { deload, back: 'light' | 'refind' }. */
  function suggest(cfg, hist, opts) {
    opts = opts || {};
    // after an easy week (or a light first session back) carry on from the last normal session,
    // so stall and easy-week cuts never stack
    var normal = (hist || []).filter(function (h) { return !h.light; });
    hist = normal.length ? normal : hist || [];
    var lo = cfg.reps[0], hi = cfg.reps[1], sets = cfg.sets, inc = cfg.inc;
    var bw = BODYWEIGHT.indexOf(cfg.id) !== -1, cap = DUMBBELL.indexOf(cfg.id) !== -1 ? RULES.dumbbellMaxKg : null;
    if (!hist.length || opts.back === 'refind') {
      // first time on this exercise (also after a swap), or 6+ weeks off: 2 sets to find the weight
      return { kg: bw ? 0 : null, reps: hi, sets: Math.min(sets, RULES.findSets), state: 'calibrate',
        note: (hist.length ? 'Long break: find it again, ' : 'First time: ') + (bw ? hi + ' reps' : 'a weight you can lift ' + hi + ' times') + ' with 3 to spare.' };
    }
    var lastH = hist[hist.length - 1], last = lastH.sets, feel = feelOf(lastH);
    var kg = Math.max.apply(null, last.map(function (s) { return s.kg; }));
    var atKg = last.filter(function (s) { return s.kg === kg; });
    var minReps = Math.min.apply(null, atKg.map(function (s) { return s.reps; }));
    var allTop = atKg.length >= Math.min(sets, 2) && atKg.every(function (s) { return s.reps >= hi; });
    var anyBelow = atKg.some(function (s) { return s.reps < lo; });
    var addReps = feel === 'easy' ? 2 : feel === 'hard' ? 0 : 1;

    if (bw) {
      var r = Math.max(lo, minReps + addReps);
      return addReps ? { kg: 0, reps: r, sets: sets, state: 'push', note: r + ' reps on every set.' }
        : { kg: 0, reps: minReps, sets: sets, state: 'again', note: 'Same again. Make it feel easier.' };
    }
    if (opts.deload) {
      return { kg: lighter(kg, RULES.deloadLoad, inc), reps: lo, sets: Math.max(1, Math.round(sets * RULES.deloadSets)),
        state: 'deload', note: 'Easy week: lighter, fewer sets, 3–4 reps to spare.' };
    }
    if (opts.back === 'light') {
      // 2+ weeks off: strength mostly stays, so the same sets at 10 % less; normal weights next time
      return { kg: lighter(lastH.calib ? suggest(cfg, hist).kg : kg, RULES.breakLoad, inc), reps: Math.max(lo, Math.min(hi, minReps)), sets: sets,
        state: 'back', note: 'First time back after a break: 10 % lighter. Normal weights next time.' };
    }
    if (lastH.calib) {
      // Finding weights are guesses. Estimate the weight for the middle of the rep range with
      // 2 reps in the tank from the best finding set (Epley, at most 12 reps: it guesses badly above).
      var e1 = Math.max.apply(null, last.map(function (s) { return epley(s.kg, Math.min(RULES.epleyMaxReps, s.reps + Math.min(3, s.rir == null ? 2 : s.rir))); }));
      var mid = Math.round((lo + hi) / 2), est = roundTo(e1 / (1 + (mid + 2) / 30), inc);
      if (cap) est = Math.min(cap, est);
      if (est > 0) return { kg: est, reps: mid, sets: sets, state: 'set',
        note: 'From your test sets. Too easy? Go heavier next set.' };
    }
    if (allTop && cap && kg + inc > cap) {
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
      // one step up from what you lifted (25 + 2 = 27, not 28); two when it was easy, except dumbbells
      var up = roundHalf(kg + (feel === 'easy' && !cap ? 2 : 1) * inc);
      if (cap) up = Math.min(cap, up);
      var aim = feel === 'hard' ? lo : Math.max(lo, hi - 2);
      return { kg: up, reps: aim, sets: sets, state: 'up',
        note: 'Up ' + roundHalf(up - kg) + ' kg. ' + (feel === 'hard' ? 'Aim for ' + lo + ' reps; the bottom of the range is fine.' : 'Aim for ' + aim + ' reps.') };
    }
    if (anyBelow) {
      var prev = hist.length > 1 ? hist[hist.length - 2].sets : null;
      var prevBelow = prev && prev.some(function (s) { return s.kg >= kg && s.reps < lo; });
      if (prevBelow) {
        return { kg: lighter(kg, RULES.stallDrop, inc), reps: lo, sets: sets, state: 'drop',
          note: 'Two sessions under ' + lo + ' reps: 10 % lighter and rebuild. Normal.' };
      }
      return { kg: kg, reps: lo, sets: sets, state: 'hold',
        note: 'Same weight, get every set to ' + lo + '.' };
    }
    if (!addReps) {
      return { kg: kg, reps: minReps, sets: sets, state: 'again',
        note: 'Hard last time: same weight, ' + minReps + ' reps again. Make them cleaner.' };
    }
    var target = Math.min(hi, minReps + addReps);
    return { kg: kg, reps: target, sets: sets, state: 'push',
      note: 'Same weight, ' + target + ' reps on every set.' };
  }

  /* Was the exercise stalled (dropped) in the recent sessions? */
  function recentStalls(state, lookback) {
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
    var sched = schedOf(state.profile);
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
    var sched = schedOf(state.profile);
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
    var profile = state.profile || {}, sched = schedOf(profile);
    var d = parseISO(dateISO), wd = d.getDay();
    var existing = state.sessions && state.sessions[dateISO];
    // a session opened on a past day but never trained is ignored
    if (existing && todayISO && dateISO < todayISO && !existing.done && !hasDoneSet(existing)) existing = null;
    var mv = (state.settings && state.settings.moves) || {}, from = movedFrom(state, dateISO);
    var done = completedSessions(state);
    var n = done.length;                       // sessions completed before today (if today not done)
    if (existing && existing.done) n = done.indexOf(dateISO);
    var week = Math.floor(n / 3) + 1;          // training week number, 1-based
    var deloadUntil = (state.settings && state.settings.deloadUntil) || 0;
    var deload = n < deloadUntil;
    // a break: days since the last session before this one
    var prevISO = null;
    for (var i = done.length - 1; i >= 0; i--) if (done[i] < dateISO) { prevISO = done[i]; break; }
    var gap = prevISO ? daysBetween(prevISO, dateISO) : 0;
    var back = existing ? existing.back || null : gap >= RULES.refindDays ? 'refind' : gap >= RULES.breakDays ? 'light' : null;
    if (existing) deload = !!existing.deload;
    var day = existing ? existing.day : (n % 2 === 0 ? 'A' : 'B');
    var movedAway = dateISO in mv, fromTime = from ? sched[parseISO(from).getDay()] || '16:00' : null;
    var training = !!existing || (sched[wd] != null && !movedAway) || !!from;
    // weights are found per exercise; the session is a "finding" one when every exercise is new
    var calibration = existing ? !!existing.calibration
      : training && exercisesFor(day, profile).every(function (c) { return !history(state, idFor(state, c)).length; });
    if (calibration) deload = false;
    return {
      date: dateISO, training: training, movedAway: movedAway && !existing ? mv[dateISO] : null, movedFrom: from,
      time: existing && existing.time || (sched[wd] != null && !movedAway ? sched[wd] : fromTime),
      day: training ? day : null, week: week, n: n, calibration: calibration, deload: deload, back: back, gap: gap,
      exercises: training ? exercisesFor(day, profile) : []
    };
  }

  /* The suggestion for cfg (cfg.id = the exercise done) inside a session or plan. */
  function suggestIn(state, ses, cfg) {
    return suggest(cfg, history(state, cfg.id), { deload: !!ses.deload, back: ses.back });
  }
  /* Build the session object for a plan (suggestions filled in). */
  function buildSession(p, state) {
    var ex = p.exercises.map(function (cfg) {
      var id = idFor(state, cfg);
      var sg = suggestIn(state, p, Object.assign({}, cfg, { id: id }));
      return { id: id, base: cfg.id, suggest: sg, sets: freshSets(sg) };
    });
    return { date: p.date, day: p.day, time: p.time, week: p.week, calibration: p.calibration, deload: p.deload, back: p.back || null,
      started: null, finished: null, done: false, warm: {}, ex: ex };
  }

  /* Warm-up sets before the first big lift, in weights that exist: dumbbells go in 2 kg steps. */
  function rampSets(kg, id) {
    if (!kg) return [];
    var step = DUMBBELL.indexOf(id) !== -1 ? 2 : 2.5;
    return WARMUP.ramp.map(function (r) { return { kg: Math.max(step, roundTo(kg * r[0], step)), reps: r[1] }; });
  }

  /* ---------- nutrition ---------- */
  function bmi(p) { return p.height ? p.weight / Math.pow(p.height / 100, 2) : 0; }
  /* Daily protein in g: 2.2 × goal weight rounded to 10 (about 200 g), else 2 × body weight. */
  function proteinFor(p) {
    var g = +p.goal2;
    if (g >= 40 && g <= 250) return Math.round(g * RULES.proteinPerGoalKg / 10) * 10;
    return Math.round(p.weight * RULES.proteinPerKg);
  }
  function macros(p) {
    if (!p || !p.weight || !p.height || !p.age) return null;
    var bmr = 10 * p.weight + 6.25 * p.height - 5 * p.age + (p.sex === 'f' ? -161 : 5);
    var tdee = bmr * (RULES.activity[p.activity] || 1.5);
    var phase = p.phase || 'lean';
    var kcal = Math.round(tdee * RULES.phase[phase] / 10) * 10;
    var protein = proteinFor(p);
    var fat = Math.round(kcal * RULES.fatShare / 9);
    var carbs = Math.max(0, Math.round((kcal - protein * 4 - fat * 9) / 4));
    return { bmr: Math.round(bmr), tdee: Math.round(tdee), kcal: kcal, protein: protein, fat: fat, carbs: carbs, phase: phase, bmi: bmi(p) };
  }

  /* Food targets from the trend weight, not one morning's number (a salty dinner moves the scale a kilo). */
  function macrosFor(state) {
    var p = state && state.profile, tw = trendWeight(state || {});
    return macros(p && tw ? Object.assign({}, p, { weight: tw }) : p);
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

  /* Clock-time eating schedule for a date: 2 meals + 3 shakes (+ creatine). */
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
    var sched = schedOf(profile), groups = {};
    function add(key, title, t, mins, wd, note) {
      var w = wrapDay(t, wd); t = w.t; wd = w.wd;
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
  /* a slot past midnight (or before it) belongs to the next (previous) weekday */
  function wrapDay(t, wd) {
    if (t >= 1440) return { t: t - 1440, wd: (wd + 1) % 7 };
    if (t < 0) return { t: t + 1440, wd: (wd + 6) % 7 };
    return { t: t, wd: wd };
  }
  function icsStamp(iso, hhmm, plusMin) {
    var d = parseISO(iso), m = hm(hhmm) + (plusMin || 0); d.setMinutes(m);
    return d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + 'T' + pad(d.getHours()) + pad(d.getMinutes()) + '00';
  }
  function icsText(s) { return String(s).replace(/[\\;,]/g, function (c) { return '\\' + c; }).replace(/\n/g, '\\n'); }
  function calendarICS(profile, mac, fromIso, withMeals) {
    var ev = reminderEvents(profile, mac, fromIso, withMeals), now = new Date();
    var stamp = now.getUTCFullYear() + pad(now.getUTCMonth() + 1) + pad(now.getUTCDate()) + 'T' + pad(now.getUTCHours()) + pad(now.getUTCMinutes()) + '00Z';
    var L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Lift//reminders//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:Lift'];
    ev.forEach(function (g) {
      L.push('BEGIN:VEVENT', 'UID:lift-' + g.key + '-' + g.time.replace(':', '') + '@lift', 'DTSTAMP:' + stamp,
        'DTSTART:' + icsStamp(g.firstDate, g.time), 'DTEND:' + icsStamp(g.firstDate, g.time, g.mins), 'RRULE:' + g.rrule,
        'SUMMARY:' + icsText(g.title), 'DESCRIPTION:' + icsText(g.note),
        'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + icsText(g.title), 'TRIGGER:PT0M', 'END:VALARM', 'END:VEVENT');
    });
    L.push('END:VCALENDAR');
    return L.join('\r\n') + '\r\n';
  }
  function googleCalLink(g) {
    return 'https://calendar.google.com/calendar/render?action=TEMPLATE&text=' + encodeURIComponent(g.title) +
      '&dates=' + icsStamp(g.firstDate, g.time) + '/' + icsStamp(g.firstDate, g.time, g.mins) +
      '&recur=' + encodeURIComponent('RRULE:' + g.rrule) + '&details=' + encodeURIComponent(g.note);
  }

  /* ---------- data hygiene ----------
     Synced data comes from other devices (and older app versions): keep only well-formed values so
     nothing odd reaches the screen. Mutates state; returns true if anything changed. */
  var DATE_RE = /^\d{4}-\d{2}-\d{2}$/, HM_RE = /^\d{2}:\d{2}$/, ID_RE = /^[A-Za-z0-9_-]+$/;
  function sanitize(state) {
    var ch = false;
    function n(v) { return v == null || v === '' ? null : (typeof v === 'number' && isFinite(v) ? v : (isFinite(+v) && String(v).trim() !== '' ? +v : NaN)); }
    function numField(o, k) { if (!(k in o)) return; var v = n(o[k]); if (v !== o[k]) { if (v == null || isNaN(v)) delete o[k]; else o[k] = v; ch = true; } }
    function timeField(o, k) { if (k in o && !(typeof o[k] === 'string' && HM_RE.test(o[k]))) { delete o[k]; ch = true; } }
    function dateMap(m) { Object.keys(m || {}).forEach(function (k) { if (!DATE_RE.test(k)) { delete m[k]; ch = true; } }); }
    var p = state.profile || {};
    ['age', 'height', 'weight', 'goal1', 'goal2', 'lattes'].forEach(function (k) { numField(p, k); });
    ['wake', 'lunch', 'bed'].forEach(function (k) { timeField(p, k); });
    if (p.sched) Object.keys(p.sched).forEach(function (d) { if (!/^[0-6]$/.test(d)) { delete p.sched[d]; ch = true; } else timeField(p.sched, d); });
    if (p.priority && !Array.isArray(p.priority)) { delete p.priority; ch = true; }
    if (p.priority) { var pr = p.priority.filter(function (k) { return PRIORITY[k]; }); if (pr.length !== p.priority.length) { p.priority = pr; ch = true; } }
    dateMap(state.weight);
    Object.keys(state.weight || {}).forEach(function (k) { numField(state.weight, k); });
    dateMap(state.daily);
    Object.keys(state.daily || {}).forEach(function (k) { var d = state.daily[k]; if (!d || typeof d !== 'object') { delete state.daily[k]; ch = true; return; } ['waist', 'sleep', 'steps'].forEach(function (f) { numField(d, f); }); });
    dateMap(state.sessions);
    Object.keys(state.sessions || {}).forEach(function (k) {
      var s = state.sessions[k];
      if (!s || typeof s !== 'object' || !Array.isArray(s.ex)) { delete state.sessions[k]; ch = true; return; }
      if (s.day !== 'A' && s.day !== 'B') { s.day = 'A'; ch = true; }
      if (s.back != null && s.back !== 'light' && s.back !== 'refind') { delete s.back; ch = true; }
      timeField(s, 'time');
      ['week', 'started', 'finished'].forEach(function (f) { numField(s, f); });
      s.ex = s.ex.filter(function (e) { var ok = e && typeof e.id === 'string' && ID_RE.test(e.id) && typeof e.base === 'string' && ID_RE.test(e.base) && Array.isArray(e.sets); if (!ok) ch = true; return ok; });
      s.ex.forEach(function (e) {
        if (e.feel != null && ['easy', 'right', 'hard'].indexOf(e.feel) < 0) { delete e.feel; ch = true; }
        e.sets.forEach(function (x) { ['kg', 'reps', 'rir'].forEach(function (f) { numField(x, f); }); });
      });
    });
    var sw = (state.settings || {}).swaps || {};
    Object.keys(sw).forEach(function (k) { if (!ID_RE.test(k) || typeof sw[k] !== 'string' || !ID_RE.test(sw[k])) { delete sw[k]; ch = true; } });
    return ch;
  }

  /* ---------- progress ---------- */
  function weightSeries(state) {
    var w = state.weight || {};
    return Object.keys(w).sort().map(function (k) { return { date: k, kg: +w[k] }; }).filter(function (x) { return x.kg > 0; });
  }
  /* Trend weight: a time-aware moving average. Each weigh-in pulls the line toward it by an amount
     that grows with the days since the last one (half-life RULES.trendHalfLife), so gaps are fine. */
  function weightTrend(state) {
    var s = weightSeries(state), avg = null, prev = null;
    return s.map(function (pt) {
      if (avg == null) avg = pt.kg;
      else avg += (1 - Math.pow(0.5, daysBetween(prev, pt.date) / RULES.trendHalfLife)) * (pt.kg - avg);
      prev = pt.date;
      return { date: pt.date, kg: pt.kg, avg: Math.round(avg * 100) / 100 };
    });
  }
  /* The latest trend weight, or null without weigh-ins. Used for the food targets instead of a single day. */
  function trendWeight(state) { var t = weightTrend(state); return t.length ? t[t.length - 1].avg : null; }
  /* kg/week: least-squares slope of the weigh-ins in the RULES.rateDays up to endIso.
     null when there are too few weigh-ins or they span too few days. */
  function weightRate(state, endIso) {
    var s = weightSeries(state).filter(function (p) { return p.date <= endIso && daysBetween(p.date, endIso) < RULES.rateDays; });
    if (s.length < RULES.rateMinCount || daysBetween(s[0].date, s[s.length - 1].date) < RULES.rateMinDays) return null;
    var xs = s.map(function (p) { return daysBetween(s[0].date, p.date); }), n = s.length;
    var mx = xs.reduce(function (a, b) { return a + b; }, 0) / n, my = s.reduce(function (a, p) { return a + p.kg; }, 0) / n, num = 0, den = 0;
    s.forEach(function (p, i) { num += (xs[i] - mx) * (p.kg - my); den += (xs[i] - mx) * (xs[i] - mx); });
    return den ? num / den * 7 : null;
  }
  /* Advice for the phase. Weekly checks (the latest weigh-in, and a week before): the portions
     change only when two checks in a row are outside the band. One bad week = wait and see. */
  function trendAdvice(state) {
    var s = weightSeries(state);
    var wait = { rate: null, state: 'wait', text: 'Weigh in most mornings. After about 2 weeks the trend tells you whether to eat a bit more or a bit less.' };
    if (!s.length) return wait;
    var end = s[s.length - 1].date, rate = weightRate(state, end);
    if (rate == null) return wait;
    var phase = (state.profile && state.profile.phase) || 'lean', band = RULES.trendTarget[phase];
    function side(r) { return r == null ? 0 : r < band[0] ? -1 : r > band[1] ? 1 : 0; }
    var now = side(rate), before = side(weightRate(state, addDaysISO(end, -7))), text, st;
    if (!now) { st = 'ok'; text = 'On track (' + band[0] + ' to ' + band[1] + ' kg a week). Keep eating the way you do.'; }
    else if (now !== before) { st = 'watch'; text = now < 0 ? 'Losing a bit fast this week. Change nothing yet — if next week is the same, eat a bit more.' : 'Weight barely moved this week — that happens. Change nothing yet; if next week is the same, eat a bit less.'; }
    else if (now < 0) { st = 'low'; text = 'Losing faster than ' + Math.abs(band[0]) + ' kg a week two weeks running — that risks muscle. Eat a bit more: a bigger handful of rice, potatoes or bread at lunch and dinner, or a banana with the shake.'; }
    else { st = 'high'; text = phase === 'bulk' ? 'Gaining faster than planned two weeks running — a bit less rice, potatoes or bread.' : 'Weight not coming down two weeks running. Make the rice, potatoes or bread a bit smaller and skip snacks — keep the protein.'; }
    return { rate: rate, state: st, text: text };
  }

  function weeklyVolume(state, exdb, weekEndISO) {
    var end = weekEndISO || isoDate(new Date()), start = addDaysISO(end, -6), vol = {};
    completedSessions(state).forEach(function (k) {
      if (k < start || k > end) return;
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


  return {
    RULES: RULES, PROGRAM: PROGRAM, DUMBBELL: DUMBBELL, BODYWEIGHT: BODYWEIGHT, LABEL: LABEL, ALT_INFO: ALT_INFO, info: info, cue: cue, PRIORITY: PRIORITY, WARMUP: WARMUP, SHAKES: SHAKES, reminderEvents: reminderEvents, calendarICS: calendarICS, googleCalLink: googleCalLink, LATTE: LATTE, lattes: lattes, MORNING: MORNING, morningFor: morningFor, mealTargets: mealTargets, proteinFor: proteinFor, handPlate: handPlate, palms: palms,
    sanitize: sanitize, wrapDay: wrapDay, icsText: icsText, addDaysISO: addDaysISO, daysBetween: daysBetween,
    roundTo: roundTo, roundHalf: roundHalf, lighter: lighter, isoDate: isoDate, parseISO: parseISO, hm: hm, fmtHM: fmtHM, epley: epley,
    schedOf: schedOf, mondayOf: mondayOf, freshSets: freshSets,
    exercisesFor: exercisesFor, idFor: idFor, findCfg: findCfg, completedSessions: completedSessions, history: history,
    suggest: suggest, suggestIn: suggestIn, feelOf: feelOf, recentStalls: recentStalls, plan: plan, movedFrom: movedFrom, shiftWeek: shiftWeek, sundayShift: sundayShift, unshiftWeek: unshiftWeek, buildSession: buildSession, rampSets: rampSets,
    macros: macros, timeline: timeline, weightSeries: weightSeries, weightTrend: weightTrend,
    trendAdvice: trendAdvice, trendWeight: trendWeight, weightRate: weightRate, macrosFor: macrosFor, weeklyVolume: weeklyVolume, bestSets: bestSets
  };
});
