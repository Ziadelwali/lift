# Lift

Phone-first training + diet app. A static site on GitHub Pages, installable as a PWA, works offline in the gym. Data lives on the phone and syncs, end-to-end encrypted, through one Firestore document per password (plain REST + polling, no Firebase SDK).

Live: https://ziadelwali.github.io/lift/

## Files

| file | what |
|---|---|
| `index.html` | page shell: the screens' containers, Content-Security-Policy, loads the scripts |
| `app.js` | the screens (Today, Train, Eat, Progress, Profile), local storage, sync wiring, service-worker registration |
| `engine.js` | the rules as pure functions (program, progression, plan, food timeline, trend, motivation). Testable in node. |
| `sync.js` | sync v2: key derivation, encryption, three-way merge, deletion guard. Testable in node. |
| `styles.css`, `theme.js` | look; light/dark theme applied before first paint |
| `exercises.js` | generated: exercise names, muscles, image paths |
| `img/ex/<id>/0.jpg, 1.jpg, t.jpg` | exercise photos (free-exercise-db, public domain) and small thumbnails |
| `img/gym/*.jpg` | the user's own photos of the machines at the gym ("At your gym") |
| `fonts/` | DM Sans and DM Mono, self-hosted (OFL, `fonts/LICENSE.txt`) |
| `sw.js`, `manifest.webmanifest`, `icon-*.png` | offline cache, update pill, home-screen install |
| `tools/gym-inventory.json` | equipment at B1973 Fitness (Herlev), from the club's list + what the user confirmed; the program only uses what is here |
| `tools/test-engine.js` | `node tools/test-engine.js`: progression, plan, breaks, food, trend, backup, weeks on track, missed sessions, bests |
| `tools/test-sync.js` | `node tools/test-sync.js`: encryption round trip, merge, deletion guard, migration (node 20+) |
| `tools/seal-config.js` | encrypts `firebase-config.json` (local, never committed) with the password → `fbconfig.js` |
| `tools/prepublish.js` | leak scan, checks the sealed config, runs both test files, stamps `sw.js` and the build number |
| `tools/fetch-exercises.js` | re-download exercise data/images for the ids in `tools/program-ids.js` |
| `tools/make-thumbs.ps1` | makes the `t.jpg` thumbnails (Windows PowerShell) |
| `tools/make-icons.js` | regenerates the icons |
| `publish.cmd` | prepublish, commit, push (pauses at the end) |

Text files are UTF-8 with CRLF line endings. Windows PowerShell 5.1 shows them garbled unless read as UTF-8 (`Get-Content -Encoding utf8`).

## One-time setup

**Seal the Firebase config.** The web API key is never committed in plaintext. Put the web-app config from the Firebase console in `firebase-config.json` next to `index.html` (it is git-ignored), then:

```
node tools/seal-config.js
```

It asks for the password twice and writes `fbconfig.js` (ciphertext only). The password the phone types derives the key that opens it; a wrong password is rejected at the gate. Changing the password: `node tools/seal-config.js --add` (lets the new password open it too), publish, then Profile → Change password on a phone.

**Restrict the API key** (Google Cloud console → APIs & Services → Credentials → the Browser key): Application restrictions → Websites → `https://ziadelwali.github.io/*`; API restrictions → Cloud Firestore API. Defence in depth: the Firestore rules and the encryption are what protect the data.

**Firestore rules** (Firebase console → Firestore → Rules), next to the existing `trips` block:

```
match /lift/{doc} {
  function okId() { return doc.matches('^[0-9a-f]{64}$'); }
  function okShape() { let d = request.resource.data;
    return d.keys().hasOnly(['v','iv','ct']) && d.keys().hasAll(['v','iv','ct']) && d.v == 2
      && d.iv is bytes && d.iv.size() == 12 && d.ct is bytes && d.ct.size() > 16 && d.ct.size() <= 900000; }
  allow get: if okId();
  allow create, update: if okId() && okShape();
  allow list, delete: if false;
}
```

**GitHub Pages**: repo Settings → Pages → Deploy from branch `main`, folder `/ (root)`.

**Phone**: open the URL. Android: browser menu → Install app (or Add to Home screen). iPhone: Safari → Share → Add to Home Screen. Type the password once (or "Use this device only, no sync"). Fill in Profile.

## Sync (v2)

- From the password: PBKDF2-SHA256 (600 000 rounds) → HKDF → the document id (64 hex), the data key and the key that opens `fbconfig.js`. The password itself is never stored; the device keeps the derived keys.
- The document holds only `{v: 2, iv, ct}`: AES-GCM over the gzipped data. Firestore sees no names, weights or dates.
- Merge is three-way per record (base = what this device last agreed with the server). A guard refuses anything that looks like mass deletion. Writes use an update-time precondition; on a clash the device pulls, merges and tries again.
- Profile → Backup: Export a JSON file; Import checks it is a Lift backup, then adds it (this device wins on a clash) or replaces everything. Wipe needs the word WIPE typed.

## Publish and local preview

```
node .claude/serve.js
```
then http://localhost:4322/ (the preview tool picks another port when that one is taken). The service worker is skipped on localhost, so edits show on reload.

To publish: on `main`, `node tools/prepublish.js`, commit "Publish build", push (or `publish.cmd`). Phones get a "New version ready" pill; the app never reloads by itself during a session or while typing.

## What the app does, and why

Goal: an athletic, defined physique: **muscle first, with the diet set so fat comes off alongside**.

**Training** (engine.js `PROGRAM`, `suggest`, `plan`)
- Full body, sessions A/B alternating, 3 days a week (Mon/Wed/Fri 16:00 by default). Every muscle 2–3× a week, about 9–15 hard sets per muscle per week (Pelland 2025: more sets still add growth, with diminishing returns); priority muscles (default: shoulders + arms) get extra sets. Session A has a leg extension (2×10–15) for the front of the thigh, which leg press and squats barely grow (Maeo 2018).
- Compounds 6–10 reps, isolation 10–15. Big lifts and free weights stop 1–2 reps short; machine and cable isolation goes to no clean rep on the last set (Robinson 2024). Stretch cues on the leg curl, overhead rope extension, incline curl and lat pull-down; half reps at the bottom on the last calf set (`cue`). Rest 2 min on the big compounds, 60–100 s on the rest.
- Finding weights is per exercise: the first time on an exercise (also a swap) is 2 sets; the next time sets the weight from the best of them (Epley, capped at 12 reps, aiming mid-range with ~2 reps in reserve).
- Then double progression steered by "How was it?" (Easy / About right / Hard ≈ 3 / 2 / 0 reps left): all sets at the top of the range → up 2 / 1 / 1 steps (dumbbells 1), aiming 2 under the top (Hard: the bottom); in the range → +2 / +1 / same reps; under the bottom two sessions running → −10 %. Next weight = last weight + step, rounded to 0.5 kg; the kg −/+ buttons use the same step.
- Easy week (−10 % load, half the sets) only after two stalled lifts or when asked ("Feeling run down?" on Today), not on a fixed rota (Coleman 2024). Afterwards progression carries on from the last normal session.
- After 14+ days off the first session back is 10 % lighter (same sets); after 42+ days the weights are found again.
- Fitted to the gym (`tools/gym-inventory.json`, mostly Nautilus One machines, dumbbells up to 30 kg). Dumbbell lifts stop adding weight at 30 kg (`RULES.dumbbellMaxKg`): the app asks for more reps, then points to the machine swap. Dumbbell kg is one dumbbell (per hand): two-dumbbell moves show "2 × 20 kg" and "kg each hand", and "kg moved" counts both.
- Busy gym: any order is fine. Tap a picture in the top bar to jump, or "Busy? Pick another". After the last set of an exercise there is no rest timer (walking to the next machine is the rest); "How was it?" comes first (with Undo), then the next exercise.
- Life moves a day: `settings.moves = {fromISO: toISO}` ('' = skipped). Moving a session pushes the rest of that week one day along so two sessions are never back to back (Mon→Tue makes Wed→Thu, Fri→Sat), never into next week (`shiftWeek`). Trained on a Sunday: Monday's session moves to Tuesday and the week follows (`sundayShift`, undo keeps Monday). Sessions left open on a past day are finished automatically, or ignored when empty.
- Swaps: every exercise has 1–3 alternatives on the same muscles, shown as photo tiles. "Just today" (default) swaps this session only; "From now on" saves it in `settings.swaps`.
- Warm-up about 10 min: 6–8 min uphill treadmill walk, 4 moves for the day, warm-up sets (50/70/85 %, dumbbells in 2 kg steps) on the first big lift only. No static stretching.

**Staying with it** (engine.js `weeksOnTrack`, `missedSessions`, `bestKind`, `sinceStart`)
- Weeks on track: a week with 2+ sessions. Today shows the run ("9 weeks on track"), 12 dots and the rolling count ("11 of the last 12 weeks"), so one bad week never shows as 0. This week only counts once it has 2. Habits take a median of about two months to form, with a wide spread (Lally 2010; Singh 2024): weekly consistency beats a fragile daily streak.
- Welcome back: after a missed session (not a moved one) Today shows a calm card: one miss changes nothing, coming back is what counts. Train today, or a short version (the main lifts with all their sets, ~40 min, that session only). After 14+ days away it explains the lighter first session. Rewarding the return after a missed workout was the strongest of 54 nudges in a 61 000-member gym study (Milkman 2021); one missed day doesn't undo a habit (Lally 2010).
- New bests: heavier, more reps at the same weight, or a higher estimated strength. A ★ on the tick with "+2.5 kg" / "+1 rep", the finish screen lists them with photos and a short buzz (none with reduced motion), and every exercise card shows "Since you started: +12 kg". Seeing progress supports the feeling of competence (Teixeira 2012); recorded progress helps people reach goals (Harkin 2016).

**Made for someone who doesn't know the names**
- Plain names as titles (`LABEL` in engine.js), the official name small underneath; muscles as body parts ("front of thigh"); photos wherever a choice is made, including "At your gym" photos of the real machines. `node tools/test-engine.js` fails if an exercise lacks a plain name or where/form text.
- Train screen: the card opens with a small picture strip (exercise, muscles, gym photo; tap to enlarge), then the sets; Where/Form/Last time sit in a fold. Big −/+ and ✓, rest timer ±30 s, comma or dot decimals. Finish opens a sheet listing what isn't ticked, then a finish screen (sets, minutes, bests, weeks on track, next session). Important news stays as a card until dismissed; toasts sit above the tabs.
- Progress: bodyweight trend, weekly waist, lifts picked by photo with the top set and bests marked, past sessions (tap to view, "Fix a number" to correct one), hard sets per muscle.
- Calendar reminders: Profile → a `.ics` file with the training sessions (and meals if wanted). No push notifications.
- Light and dark themes; Auto follows the phone. Tap targets at least 44 px, screen-reader labels on sets, toggles, charts and the body map.

**Diet** (engine.js `macros`, `timeline`, `weightTrend`)
- Protein 2.2 g per kg of the goal weight (`RULES.proteinPerGoalKg`, ~200 g at 93 kg ≈ 2.5 g/kg of lean mass; Morton 2018 plateau ~1.6 g/kg, more helps while dieting), 2.0 g per kg of body weight without a goal. Uses the trend weight, not one weigh-in. "Protein so far" fills as meals are ticked.
- Nothing to weigh or cook to a recipe: lunch and dinner are the user's own plate, built with the hand (`handPlate`: a palm of protein per ~30 g, a fist of veg, a cupped hand of carbs, a thumb of fat). Only the daily protein number is shown. Calories are worked out inside (Mifflin-St Jeor × activity, lean phase −10 %) but are not shown and do not drive the advice.
- Clock-time schedule anchored on the session: 2 meals + 3 whey shakes (morning, after training, ~45 min before bed; skyr/yoghurt/eggs are the alternatives). Lunch 2–5 h before training; the shake and dinner always after the session (a late session gets a light dinner). Meals end 3 h before bed; only the bedtime shake comes later. Creatine 5 g daily. Up to 3 caffe lattes on workdays are counted in the day (`lattes`), the last before 15:00.
- Weigh-in each morning (the weekly waist once a week). Trend: a time-aware moving average (half-life 7 days, so gaps are fine); rate = slope of the last 3 weeks (needs 10 weigh-ins over 2+ weeks). The band is in kg a week, not calories: lean −0.2 to −0.5 kg a week ≈ a 300–550 kcal/day deficit, where lean mass can still grow (Murphy & Koehler 2022). Portion advice (a bit more or less rice, potatoes or bread) only when two weekly checks in a row are outside the band; one off week says wait.

**Evidence**
- Training: Pelland et al. 2025 (volume and frequency dose–response), Robinson et al. 2024 (closeness to failure), Maeo et al. 2018 and Zabaleta-Korta et al. 2021 (leg extension and the front of the thigh), Coleman et al. 2024 (deload weeks), Halperin et al. 2021 (guessing reps in reserve), Haugen et al. 2023 (machines vs free weights).
- Food: Morton et al. 2018 and Helms et al. 2014 (protein), ISSN position stands (protein; creatine 2025), Murphy & Koehler 2022 (energy deficit and lean mass).
- Habits: Milkman et al. 2021 (gym megastudy), Lally et al. 2010 and Singh et al. 2024 (habit formation), Teixeira et al. 2012 (self-determination and exercise), Harkin et al. 2016 (progress monitoring).

Not medical advice.
