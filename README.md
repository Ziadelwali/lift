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
- Full body, sessions A/B alternating, 3 days/week (Mon/Wed/Fri 16:00 by default). Every muscle 3×/week, 10–20 hard sets/muscle/week; priority muscles (default: side delts + upper back) get ~4 extra sets.
- Compounds 6–10 reps, isolation 10–15, all with 1–3 reps in reserve. Rest 2–3 min on compounds.
- Week 1 = calibration (2 sets, find loads). The first session after calibration sets each weight from the best calibration set (Epley, aiming mid-range with ~2 reps in reserve). Then double progression: all sets at the top of the rep range → weight goes up by the exercise's increment; under the bottom of the range two sessions running → −10 %.
- Every 6th week, or after two stalled lifts, a deload (−10 % load, half the sets).
- Fitted to the gym (`tools/gym-inventory.json`, mostly Nautilus One machines, dumbbells up to 30 kg). Dumbbell lifts stop adding weight at 30 kg (`RULES.dumbbellMaxKg`): the app asks for more reps, then points to the machine swap.
- Priority muscles add exercises: side delts (side raise), upper back (straight-arm pull-down), arms (incline dumbbell curl in A, overhead rope extension in B — stretched-position exercises, which grow the arm more than curls/pushdowns alone).
- Busy gym: any order is fine. Tap a picture in the top bar to jump, or "⏭ Busy — later" sends an exercise to the end. After each set the rest bar asks "reps left in the tank?".
- Life moves a day: `settings.moves = {fromISO: toISO}` ('' = skipped). The day after a session, Today offers "rest today, train tomorrow"; the day after a missed one it offers "train today". Empty sessions left open on a past day are ignored.
- Swaps: every exercise has 1–3 alternatives on the same muscles, shown as photo tiles. Main lifts keep their where/form text in `PROGRAM`; swap-only exercises in `ALT_INFO`.
- Warm-up ≤ 8 min: easy bike, 3–4 dynamic moves for the day, ramp sets (50/70/85 %) on the first compound only. No static stretching.

**Made for someone who doesn't know the names** (index.html)
- Plain names as titles (`LABEL` in engine.js), the official name small underneath; muscles as body parts ("front of thigh"); photos everywhere a choice is made. `node tools/test-engine.js` fails if an exercise lacks a plain name or where/form text.
- Training screen: big −/+ and ✓, "reps left in the tank 0/1/2/3+" after each set, sticky progress with a photo per exercise, finished exercises fold, rest timer ±30 s. Comma or dot decimals.
- Light ("clear day") and dark ("clear night") themes; Auto follows the phone. Colours are CSS tokens on `:root` / `:root[data-theme=light]`; the theme is applied before first paint from `localStorage['lift.theme']`.

**Diet** (engine.js `macros`, `timeline`)
- Mifflin-St Jeor × activity = expenditure; phase multiplier (build & lean 0.90, i.e. −10 %, kept under the ~500 kcal/day deficit where lean-mass gain is seen to slow / maintain 1.0 / lean bulk 1.10).
- Protein 1.6 g/kg at BMI ≥ 30, else 2.0 g/kg; fat 25 % of kcal; carbs the rest.
- Cooking: each cook shows a suggested dish; the user can tap their own protein / carb / veg and the box amounts and shopping follow (`profile.cookPicks`). Shopping list defaults to the next cook (2 days), or the whole week.
- Clock-time meal schedule anchored on the session: 4 protein feeds ~3–4 h apart, pre-workout meal 2.5 h before, post-workout meal ~20 min after, skyr/casein an hour before bed. Creatine 5 g daily.
- 7-day weight trend vs the phase's target band → ±150 kcal advice.

Evidence: Pelland et al. 2025 (volume/frequency dose–response), Robinson et al. 2024 (proximity to failure), Haugen et al. 2023 (machines vs free weights), ISSN position stands (protein; creatine 2025), warm-up reviews. Not medical advice.
