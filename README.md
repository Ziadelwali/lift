# Lift

Phone-first training + diet app. One HTML page on GitHub Pages, installable as a PWA, works offline in the gym, syncs through one Firestore document keyed by a passphrase (plain REST + polling — no Firebase SDK).

Live: https://ziadelwali.github.io/lift/

## Files

| file | what |
|---|---|
| `index.html` | the whole app: screens, sync, service-worker registration |
| `engine.js` | the rules as pure functions (program, progression, calories, meal timeline). Testable in node. |
| `exercises.js` | generated — exercise names, muscles, instructions, image paths |
| `img/ex/<id>/0.jpg, 1.jpg` | exercise photos (free-exercise-db, public domain) |
| `sw.js`, `manifest.webmanifest`, `icon-*.png` | offline cache + home-screen install |
| `tools/gym-inventory.json` | equipment at B1973 Fitness (Herlev), from the club's list + what the user confirmed; the program only uses what is here |
| `tools/fetch-exercises.js` | re-download exercise data/images for the ids in `tools/program-ids.js` |
| `tools/test-engine.js` | `node tools/test-engine.js` — scripted progression / plan / timeline checks |
| `tools/make-icons.js` | regenerates the icons |
| `tools/seal-config.js` | encrypts `firebase-config.json` (local, never committed) with the passphrase → `fbconfig.js` |
| `tools/prepublish.js` | leak scan for API keys, checks fbconfig.js exists, stamps sw.js |
| `publish.cmd` | prepublish, commit, push |

## One-time setup

**Seal the Firebase config.** The web API key is never committed in plaintext. Put the web-app config from the Firebase console in `firebase-config.json` next to `index.html` (it is git-ignored), then:

```
node tools/seal-config.js "your four words"
```

That writes `fbconfig.js` (ciphertext only). The same words are what you type on the phone; a wrong passphrase is rejected at the gate because it cannot decrypt the config. Changing the passphrase = re-run seal + publish.

**Restrict the API key** (Google Cloud console → APIs & Services → Credentials → the Browser key): Application restrictions → Websites → `https://ziadelwali.github.io/*`; API restrictions → Cloud Firestore API. Defence in depth — Firestore rules are what actually protect the data.

**Firestore rules** (Firebase console → Firestore → Rules). Add the `lift` block next to the existing `trips` one:

```
match /lift/{doc} {
  allow read, write: if true;
}
```

The document id is `sha256('lift-sync:' + passphrase)`; the passphrase is the secret, same scheme as the trip page.

**GitHub Pages**: repo Settings → Pages → Deploy from branch `main`, folder `/ (root)`.

**Phone**: open the URL in Safari/Chrome → Share → Add to Home Screen. Type your passphrase once. Fill in Profile.

## Local preview

```
node .claude/serve.js
```
then http://localhost:4322/ — the service worker is skipped on localhost so edits show on reload.

## What the app does, and why

Goal: an athletic, defined physique — **muscle first, with the diet set so fat comes off alongside**.

**Training** (engine.js `PROGRAM`, `suggest`, `plan`)
- Full body, sessions A/B alternating, 3 days/week (Mon/Wed/Fri 16:00 by default). Every muscle 2–3×/week, about 9–15 hard sets/muscle/week (Pelland 2025: more sets still add growth, with diminishing returns); priority muscles (default: side delts + upper back) get ~4 extra sets. Session A has a leg extension (2×10–15) for the front of the thigh, which leg press and squats barely grow (Maeo 2018).
- Compounds 6–10 reps, isolation 10–15. Big lifts and free weights stop 1–2 reps short; machine and cable isolation goes to no clean rep on the last set (Robinson 2024). Stretch cues on the leg curl, overhead rope extension, incline curl and lat pull-down; half reps at the bottom on the last calf set (`cue`). Rest 2 min on the big compounds, 60–100 s on the rest (cut by at most 30 s to keep sessions near 65 min; sets unchanged).
- Finding weights is per exercise: the first time on an exercise (also a swap) is 2 sets; the next time sets the weight from the best of them (Epley, capped at 12 reps, aiming mid-range with ~2 reps in reserve).
- Then double progression steered by "How was it?" (Easy / About right / Hard ≈ 3 / 2 / 0 reps left): all sets at the top of the range → up 2 / 1 / 1 steps (dumbbells 1), aiming 2 under the top (Hard: the bottom); in the range → +2 / +1 / same reps; under the bottom two sessions running → −10 %. Next weight = last weight + step, rounded to 0.5 kg; the kg −/+ buttons use the same step.
- Easy week (−10 % load, half the sets) only after two stalled lifts or when asked ("Feeling run down?" on Today), not on a fixed rota (Coleman 2024). Afterwards progression carries on from the last normal session.
- After 14+ days off the first session back is 10 % lighter (same sets); after 42+ days the weights are found again.
- Fitted to the gym (`tools/gym-inventory.json`, mostly Nautilus One machines, dumbbells up to 30 kg). Dumbbell lifts stop adding weight at 30 kg (`RULES.dumbbellMaxKg`): the app asks for more reps, then points to the machine swap.
- Priority muscles add exercises: side delts (side raise), upper back (straight-arm pull-down), arms (incline dumbbell curl in A, overhead rope extension in B — stretched-position exercises, which grow the arm more than curls/pushdowns alone).
- Busy gym: any order is fine. Tap a picture in the top bar to jump, or "⏭ Busy — later" sends an exercise to the end. After the last set of an exercise there is no rest timer (walking to the next machine is the rest); the bar only asks "<exercise> done ✓ — how was it? Easy / About right / Hard" (stored as rir 3 / 2 / 0 on the sets, `ex.feel`); it stays on screen until answered.
- Life moves a day: `settings.moves = {fromISO: toISO}` ('' = skipped). Moving a session pushes the rest of that week one day along so two sessions are never back to back (Mon→Tue makes Wed→Thu, Fri→Sat), never into next week (`shiftWeek`; pushed days in `settings.autoMoves`, undone together). The day after a session, Today offers "rest today, train tomorrow"; the day after a missed one it offers "train today". Empty sessions left open on a past day are ignored.
- Swaps: every exercise has 1–3 alternatives on the same muscles, shown as photo tiles. "Just today" (default) swaps this session only; "From now on" saves it in `settings.swaps`. Main lifts keep their where/form text in `PROGRAM`; swap-only exercises in `ALT_INFO`.
- Warm-up about 10 min: 6–8 min uphill treadmill walk, 4 dynamic moves for the day, ramp sets (50/70/85 %, dumbbells in 2 kg steps) on the first compound only. No static stretching.

**Made for someone who doesn't know the names** (index.html)
- Plain names as titles (`LABEL` in engine.js), the official name small underneath; muscles as body parts ("front of thigh"); photos everywhere a choice is made. `node tools/test-engine.js` fails if an exercise lacks a plain name or where/form text.
- Training screen: big −/+ and ✓, "How was it?" once per exercise, sticky progress with a photo per exercise, finished exercises fold, rest timer ±30 s. Comma or dot decimals.
- Light ("clear day") and dark ("clear night") themes; Auto follows the phone. Colours are CSS tokens on `:root` / `:root[data-theme=light]`; the theme is applied before first paint from `localStorage['lift.theme']`.

**Diet** (engine.js `macros`, `timeline`)
- Mifflin-St Jeor × activity = expenditure; phase multiplier (build & lean 0.90, i.e. −10 %, kept under the ~500 kcal/day deficit where lean-mass gain is seen to slow / maintain 1.0 / lean bulk 1.10).
- Protein 2.2 g per kg of the goal weight (`RULES.proteinPerGoalKg`, ~200 g at 93 kg ≈ 2.5 g/kg lean mass; Morton 2018 plateau ~1.6 g/kg, more helps while dieting), 2.0 g/kg body weight without a goal. Food targets use the trend weight, not one weigh-in; fat 25 % of kcal; carbs the rest. Calories stay fixed — extra protein replaces carbs.
- No cooking plan or shopping list, nothing to weigh: lunch and dinner are the user's own plate, built with the hand (`handPlate`: a palm of protein per ~30 g, a fist of veg, a cupped hand of carbs, a thumb of fat). Only the daily protein number is shown; kcal is used internally for the trend band.
- Clock-time schedule anchored on the session: 2 meals + 3 whey shakes (morning, after training, ~45 min before bed; skyr/yoghurt/eggs are the alternatives). Meals end 3 h before bed; only the bedtime shake comes later. Creatine 5 g daily.
- Weight trend: a time-aware moving average (half-life 7 days, so gaps are fine); rate = slope of the last 3 weeks (needs 10 weigh-ins over 2+ weeks). Portion advice (a bit more or less rice, potatoes or bread) only when two weekly checks in a row are outside the band; one off week says wait. Lean band −0.2 to −0.5 kg a week ≈ a 300–550 kcal/day deficit, where lean mass can still grow (Murphy & Koehler 2022).
- Timeline: lunch 2–5 h before training; the shake and dinner always after the session (a late session gets a light dinner).

Evidence: Pelland et al. 2025 (volume/frequency dose–response), Robinson et al. 2024 (proximity to failure), Haugen et al. 2023 (machines vs free weights), ISSN position stands (protein; creatine 2025), warm-up reviews. Not medical advice.
