# Browse baseline in Compose for TV: results

Throwaway native baseline for decision 0003/0004, never merged. It is the React Native spike's
Home screen (`spike/tv-browse/`, see its `RESULTS.md`) rebuilt in Jetpack Compose for TV, measured
with the **same driver and oracle** (`spike/tv-browse/run-falsifier.sh` and
`scripts/falsifier.py`) on 2026-11-20.

## Verdict so far

On the **emulator** the first-pass Compose screen:

- **Focus:** 297–299 of 299 single presses scored correct and **0 of 12 bursts diverged in all
  four clean runs**, against the React Native spike's 294–298/299 and 3–6/12 bursts with 12–77
  presses misrouted. No recycled-cell jumps, no Right-past-the-end escapes, no Left stuck at
  column 0, and every row reached column 49 in the memory pass. But the oracle is lenient on
  Up/Down, and three defects remain: Up drifts 2–6 columns sideways and per-row focus memory does
  not work; Left enters the rail at its bottom item; and Down from that item leaves the rail
  (2 of 2 times it was pressed). The drift also kept the plan's rail rounds from reaching the rail
  in three of four runs, so rail coverage is thin.
- **Frames:** with the libraries' baseline profiles compiled (speed-profile), 2–6 % janky on
  held Right and held Down. As installed by adb (no AOT code), held Down stayed at 3–6 % but held
  Right was 35 %, 2.6 % and 65 % janky in three runs, with slow-UI-thread frames. Frame times are
  higher than React Native's on swiftshader (p50 16–24 ms against 15–16 ms); emulator frame times
  say little about a Shield.
- **Memory:** 49–61 MB PSS, flat after loading ~455 images through all 20 rows. Graphics reads 0
  on swiftshader and Coil uses hardware bitmaps, so the image share is invisible here.
- **Cold start:** slower than React Native on the emulator: 410–459 ms `TotalTime` median, or
  345–410 ms once compiled with the shipped baseline profiles, against 125–157 ms.

On the **Shield** only frames and a provisional cold start could be measured before the 16:00
blackout, because two other agents held the device: **held Right 25.9 % janky (React Native
1.1–1.7 %) and held Down 46.2 % (React Native 30–33 %)**, one run each, and 554 ms cold start.
Focus and memory on the Shield are still needed; the exact commands are at the end of the Shield
section.

## What was built

`app/src/main/java/dev/fluster/spike/browsecompose/BrowseScreen.kt` is the whole screen. It
matches the React Native app's content one for one:

- **Rows.** A `LazyColumn` of 20 rows, each a `LazyRow` of 50 tv-material `Card`s (keys on both).
  Posters are 248 px on the 1920 canvas, 2:3, 24 px gap; row height and type sizes are the same
  design units as `spike/tv-browse/src/tokens.ts`, scaled to the window the same way.
- **Hero.** Full-bleed backdrop under a 55 % scrim, title and the same facts line. Card focus
  writes a `HeroState`; only the hero reads it, through `snapshotFlow { … }.collectLatest {
  delay(300) }`, so rows never recompose on focus and only the last focus in a 300 ms dwell
  updates the hero. The backdrop changes with `Crossfade(tween(300))`.
- **Focus lift.** tv-material `CardDefaults.scale(focusedScale = 1.08f)` plus a 3 px focus border.
- **Rail (owner decision 2026-11-20).** tv-material `ModalNavigationDrawer`: collapsed it is
  88 px wide at 1080p (icons only), it expands to 300 px with labels when it holds focus, and it
  overlays the rows (with the drawer's scrim) instead of pushing them. Initial focus is rail item 0
  through a `FocusRequester`, as the React Native rail's `autoFocus` gives.
- **Focus memory.** `focusRestorer()` on the `LazyColumn`, on every `LazyRow`, and on the rail
  column. Right from the rail returns to the last focused card (1 of 1 in every run); the row and
  rail restorers did not take effect on 2D-search entry (defects 2 and 3).
- **Images.** Coil 3.6.3 (`coil-compose` + `coil-network-okhttp`), defaults otherwise. Posters
  request the same 300 px variant as React Native and are decoded at the card's size
  (`ImageRequest.size(w, h)`, ~248×372 px); backdrops request the 1920 px file at the window size.
- **Instrumentation.** `FOCUS r,c` / `BLUR r,c` and `FOCUS rail,i` / `BLUR rail,i` to logcat tag
  `FlusterBrowse`, logged from `onFocusChanged` on real transitions only (the attach-time callback
  is ignored, so new cells do not log a false `BLUR`). BLUR is logged before FOCUS in every move
  (checked in the first logcat). `BOOT … window=` is logged from a root `LaunchedEffect`, the
  closest analogue of the React Native app's first-commit line.

**Not built:** the React Native perf overlay (it was off in every React Native measurement too).

### What a first pass included, and what was tuned

Applied, because an experienced Compose for TV developer would on a first pass:

- release build with R8 (`isMinifyEnabled`, `isShrinkResources`); no custom baseline profile, so
  only the profiles that Compose, tv-material and Coil ship are in the APK;
- `key()` around the rail items, because `focusRestorer` tells children apart by composite key hash;
- `focusRestorer` on the column, rows and rail, and a `FocusRequester` for initial focus.

**Changed to make the harness work, not for speed:**

- `android:configChanges` includes `touchscreen` (and the usual keyboard, navigation, orientation,
  size, uiMode and density). `monkey`, which the driver uses for held keys, flips the
  configuration's touchscreen field (`Config changes=8` in ActivityTaskManager). Without this the
  activity was recreated at the first burst of each run and focus jumped back to rail item 0
  (runs `tv-try1`/`tv-try2`, discarded). A real remote does not do this. The React Native app's
  generated manifest declares `keyboard|keyboardHidden|orientation|screenSize|screenLayout|uiMode|
  smallestScreenSize|assetsPaths` but not `touchscreen`; its burst paths show no reset to the rail,
  and why it escapes the relaunch is **unverified**.

**Not done** (would be optimisation, not a first pass): row-end and rail-end focus traps, a custom
`BringIntoViewSpec`, an app-specific baseline profile, image prefetching, `Crossfade` replaced by a
painter swap that waits for the new backdrop.

## Versions

| Piece | Version |
|---|---|
| Compose BOM | 2026.11.01 (foundation, ui, animation 1.13.0) |
| androidx.tv:tv-material | 1.1.0 (`ModalNavigationDrawer` is stable, no opt-in) |
| activity-compose | 1.13.0 |
| material-icons-core | 1.7.8 (from the BOM) |
| Coil | 3.6.3 (`coil-compose`, `coil-network-okhttp`) |
| AGP / Gradle | 9.5.2 / 9.6.0 (AGP 9.5 requires Gradle ≥ 9.6.0) |
| Kotlin | built-in Kotlin, KGP raised to 2.4.21 (AGP 9.5.2 ships 2.2.10; Coil 3.6.3 is built with 2.4.10) |
| compileSdk / minSdk / targetSdk | 37.1 / 24 / 36 |
| JDK | Temurin 17.0.21 (mise, `mise.toml`) |

**compileSdk 37.1.** Compose 1.13.0's AAR metadata requires compileSdk 37.1, which was not
installed (only 36 and 37.0). `platforms;android-37.1` was added with `sdkmanager`. targetSdk stays 36.

## APK

`dist/browse-compose.apk` (gitignored, on disk only): release, R8, 1.2 MB, `minSdkVersion:'24'`,
`targetSdkVersion:'36'`, `native-code: 'arm64-v8a' 'x86_64'` (`aapt2 dump badging`), signed with the
local debug key. sha256 prefix `bcf90f380ada36dc`.

To rebuild: `cd spike/tv-browse-compose && mise exec -- ./gradlew assembleRelease` with
`local.properties` or `ANDROID_HOME` pointing at the SDK.

## Method

The same driver, oracle, press plan (500 presses: 299 singles, 12 bursts), frame segments, memory
pass and cold-start loop as the React Native spike. `spike/tv-browse-compose/run-falsifier.sh`
calls `spike/tv-browse/run-falsifier.sh` with environment switches added for this baseline; their
defaults leave the React Native runs unchanged:

- `FALSIFIER_PKG=dev.fluster.spike.browsecompose`, `FALSIFIER_TAG=FlusterBrowse` (new `--tag` in
  `falsifier.py`; it was hard-coded to `ReactNativeJS` in the logcat filter and cold start);
- art on device port **8738** (React Native uses 8737), so both spikes can share a device and a
  host without sharing a tunnel; `FALSIFIER_HOST_PORT` moves the host side when two of this app's
  runs overlap;
- results in `spike/tv-browse-compose/results/`;
- `FALSIFIER_SKIP_INSTALL=1` keeps an installed, compiled APK.

**Art.** `spike/tv-browse/art/` was copied from the React Native worktree, not regenerated
(`generate-art.mjs` adds random noise, so a rerun would not be byte-identical). Same 400 posters
(300 px variant requested) and 60 backdrops, served by the same `serve-art.mjs` over `adb reverse`.

**Two compilation arms.**

- **As installed:** `adb install`, as the React Native runs did. ART leaves the app at
  `status=verify` (`dumpsys package dexopt`): no AOT code, so Compose runs interpreted and JIT.
  Hermes bytecode is precompiled, so this arm is harder on Compose than on React Native.
- **speed-profile:** install, launch once so `profileinstaller` writes the baseline profiles the
  libraries ship (`assets/dexopt/baseline.prof` is in the APK), then
  `cmd package compile -m speed-profile -f`. This is roughly the state a Play install reaches;
  it adds no profile of our own.

**Emulator.** `fluster_tv_compose`: a copy of `fluster_tv`'s `config.ini` (Android TV, API 36,
x86_64, 2 GB, 1920×1080 at 320 dpi, 4 cores), booted with `-wipe-data -gpu swiftshader_indirect`
on port 5560. A separate instance was needed because the React Native agent was driving
`emulator-5554` (the `fluster_tv` instance this run booted) at the same time: in `tv-try3` and
`tv-try4` the two agents' press scripts interleaved on one device and both runs were discarded.
The AVD is `~/.android/avd/fluster_tv_compose.{avd,ini}`; delete both to remove it.

## Results: emulator

### Focus (500 presses per run)

| Run | Compile | Single presses ok | Single failures | Bursts diverged | Presses after divergence | Recycled-cell BLURs | Burst gap |
|---|---|---|---|---|---|---|---|
| tv-run1 | as installed | 299/299 | 0 | 0/12 | 0 | 0 | 54 ms |
| tv-run2 | as installed | 297/299 | 2 (2 wrong: rail Down → card) | 0/12 | 0 | 0 | 51 ms |
| tv-run3 | as installed | 299/299 | 0 | 0/12 | 0 | 0 | 51 ms |
| tv-speedprofile-run1 | speed-profile | 299/299 | 0 | 0/12 | 0 | 0 | 55 ms |
| tv-speedprofile-run2 | speed-profile | 299/299 | 0 | 0/12 | 0 | 0 | 52 ms |
| *React Native, flag off (5 runs)* | — | *294–297/299* | *2–5* | *6/12* | *69–70* | *4–5* | *64–67 ms* |

- **The oracle is lenient on Up/Down** (any card in the adjacent row is "ok"), so 299/299 does not
  mean the column held. Split by plan step:
  - first Down pass (presses 102–121, rows never focused before): 19 of 19 on column 0 in every run;
  - first Up pass (presses 122–140, every row focused at column 0 moments earlier): the **same
    path in all four runs**, `18,0 → 17,6 → 16,2 → … → 8,2 → 7,6 → 6,6 → 5,6 → 4,2 → … → 0,2`.
    Up neither keeps the column nor restores the card last focused in that row (see defect 2);
  - overall 41–49 of 91–95 row changes kept the column, against React Native's 86 of 95.
- **Rail coverage.** The plan's eight rail rounds (step 3, presses 141–268) assume each round
  starts at column 0. After the Up pass leaves focus on column 2, Left×5 then Left lands on a card,
  not the rail: step 3 reached the rail **0 times** in tv-run1 and both speed-profile runs, and
  2 times in tv-run2. So in three of four runs the rail was only exercised by step 1 (press 100)
  and the step-4 Left bursts. Left from column 0 reached the rail every time it was tried, and
  Right from the rail returned to the last card (1 of 1 per run).

**Defects found** (no workarounds applied):

1. **Down on the last rail item leaves the rail.** Left from a row enters the rail at `rail,4`
   (defect 3), and Down from `rail,4` moved to a card in **every case observed**: 2 of 2 in tv-run2
   (presses 250 and 266, to `14,0` and `15,0`), plus the manual smoke test and the discarded
   shared-emulator runs. The other three runs never pressed Down on `rail,4`. The drawer is a focus
   group with no exit rule, so 2D search finds the card below. Fix cost: on the rail column,
   `focusProperties { onExit = { if (requestedFocusDirection == FocusDirection.Down || requestedFocusDirection == FocusDirection.Up) cancelFocusChange() } }`
   (**unverified**).
2. **Up drifts sideways and row memory does not work.** Every Up in the first Up pass landed 2 or
   6 columns to the right of the column the row was left on (above). Each `LazyRow` has
   `focusRestorer()`, but entering a row by 2D search did not restore its last focused card here,
   just as the rail's restorer did not (defect 3). Down did keep the column on rows never
   focused. Cause **unverified** (no layout inspection); the up-row is partly scrolled out of the
   column's viewport when the search runs, which is a candidate. Fix cost: likely an explicit
   `focusProperties { up = …; down = … }` per row or a `BringIntoViewSpec` that keeps the next row
   fully visible; neither tried.
3. **Left enters the rail at the geometrically nearest item, not the remembered one.** Left from a
   row lands on `rail,4` (the item nearest the rows), although rail item 0 was focused last. The
   `focusRestorer` on the rail column did not take effect on a 2D search entry into the
   `ModalNavigationDrawer`'s focus group. The oracle and the owner's rule ("Left reaches the rail")
   accept it; a Google TV-style rail would land on the current page's item. Fix cost: a
   `FocusRequester` per rail item and `focusProperties { onEnter = { selected.requestFocus() } }`
   on the rail (**unverified**).
4. **React Native's defects 1–4 did not reproduce:** no recycled-cell jumps, Left on the rail stays
   on the rail, Left at column 0 always reached the rail, and Right at column 49 stays in the row
   (all 20 rows reached column 49 in every memory pass). Its defect 5 (a row's scroll offset
   leaking into other rows) did not either: rows keep their own scroll state. Rail coverage in
   these runs was thin (above), so "Left on the rail stays" rests on the step-4 Left bursts.

### Frames (`dumpsys gfxinfo`, held key via monkey, ~51–83 ms per press)

| Run | Compile | Segment | Frames | Janky | p50 / p90 / p95 / p99 |
|---|---|---|---|---|---|
| tv-run1 | as installed | hold Right, row 0 → col 49 | 195 | 35.38 % | 46 / 65 / 77 / 129 ms |
| tv-run1 | as installed | hold Down, row 0 → row 19 | 94 | 30.85 % | 34 / 65 / 69 / 150 ms |
| tv-run2 | as installed | hold Right | 191 | 2.62 % | 24 / 29 / 30 / 44 ms |
| tv-run2 | as installed | hold Down | 104 | 5.77 % | 24 / 32 / 36 / 42 ms |
| tv-run3 | as installed | hold Right | 178 | **65.17 %** | 69 / 93 / 97 / 150 ms |
| tv-run3 | as installed | hold Down | 102 | 3.92 % | 16 / 27 / 31 / 40 ms |
| tv-speedprofile-run1 | speed-profile | hold Right | 207 | 5.80 % | 23 / 36 / 44 / 61 ms |
| tv-speedprofile-run1 | speed-profile | hold Down | 97 | 3.09 % | 16 / 24 / 25 / 46 ms |
| tv-speedprofile-run2 | speed-profile | hold Right | 187 | 2.14 % | 16 / 26 / 28 / 53 ms |
| tv-speedprofile-run2 | speed-profile | hold Down | 97 | 3.09 % | 16 / 24 / 26 / 40 ms |
| *React Native, deliverable* | — | *hold Right / hold Down* | *208 / 96* | *1.92 / 3.12 %* | *16 / 16 / 16 / 16 ms* |

- Each segment's focus path was checked: hold Right logs 49 card events (plus the next launch's
  `rail,0`, which this app focuses at boot before the driver's `seg launch` marker), hold Down 19
  events ending on `19,0`.
- **As installed, held Right is unstable**: 35 %, 2.6 % and 65 % janky in three runs, with 51,
  0 and 95 "slow UI thread" frames; in tv-run3 the held Right also slowed to a 100 ms median gap.
  With speed-profile code it was 5.8 % and 2.1 % with 3 and 0 slow UI frames. This points at
  interpreted/JIT code on the UI thread (status `verify`), but which methods is **unverified**.
- **tv-run1**: 51 "slow UI thread" frames. Its cause is **unverified**: it was the
  first run about a minute after a `-wipe-data` boot (background dexopt and first-boot jobs), and
  the host was also running the React Native agent's emulators; but tv-speedprofile-run2 overlapped
  the other agent's emulator run and was fine. tv-run2, with the same APK, had 0 slow UI frames.
- Janky frames in the other runs are "slow issue draw commands" / "frame deadline missed". On
  swiftshader every draw runs on the host CPU, so these numbers say little about a Tegra X1.

### Memory (`dumpsys meminfo`, MB)

| Run | Phase | Total PSS | Java heap | Native heap | Code | Private other | Graphics | ~Anon+Swap | Images served |
|---|---|---|---|---|---|---|---|---|---|
| tv-run1 | idle after launch | 54 | 4 | 37 | 3 | 2 | 0* | 43 | |
| tv-run1 | after the scroll pass | 55 | 8 | 31 | 3 | 2 | 0* | 41 | 457 |
| tv-run2 | idle / after | 49 / 52 | 4 / 4 | 33 / 31 | 3 / 3 | 2 / 2 | 0* | 39 / 37 | 456 |
| tv-run3 | idle / after | 45 / 56 | 4 / 5 | 29 / 36 | 3 / 3 | 2 / 2 | 0* | 35 / 43 | 458 |
| tv-speedprofile-run1 | idle / after | 53 / 60 | 4 / 8 | 33 / 35 | 6 / 6 | 2 / 2 | 0* | 39 / 45 | 455 |
| tv-speedprofile-run2 | idle / after | 61 / 55 | 4 / 6 | 41 / 31 | 6 / 6 | 2 / 2 | 0* | 47 / 39 | 458 |
| *React Native, deliverable* | *after* | *155* | *10* | *88* | | *23* | *0** | *121* | *365* |

\* Graphics is 0 because swiftshader draws on the host.

- **Not like for like.** The Compose memory pass reached column 49 in **all 20 rows** (~455 images
  served per run, including those from the cold-start and frame phases). React Native's pass
  skipped row 4 and only loaded the last ~6 posters of rows 6–19.
- Coil decodes to **hardware bitmaps** on API 26+ (its default), so decoded posters live in
  graphics memory, not the Java or native heap: "Bitmap (malloced)" shows 5 bitmaps, 0 MB. On the
  emulator that memory is invisible. React Native's expo-image held ~50 MB of malloced bitmaps.

### Cold start (`am start -W`, 5 runs each)

| Run | Compile | TotalTime median (min–max) | Process start → `BOOT` (first composition), median |
|---|---|---|---|
| tv-run1 | as installed | 459 ms (406–541) | 447 ms |
| tv-run2 | as installed | 456 ms (452–495) | 441 ms |
| tv-run3 | as installed | 389 ms (367–438) | 375 ms |
| tv-speedprofile-run1 | speed-profile | 345 ms (340–431) | 333 ms |
| tv-sp-wrappercheck (cold start only) | speed-profile | 352 ms (351–358) | 338 ms |
| tv-speedprofile-run2 | speed-profile | 410 ms (355–487) | 392 ms |
| *React Native, deliverable* | — | *133 ms (121–156)* | *125 ms (first React commit)* |

React Native's `TotalTime` stops at the activity's first frame, which is the empty root; its first
React commit comes after. Compose's first frame already contains the composed screen, so the
`BOOT` column is the fairer comparison. Compose is still ~3× slower to first content on the
emulator. Why (class loading, Compose initialisation, `ModalNavigationDrawer`'s first measure)
is **unverified**; no trace was taken.

## Results: Nvidia Shield TV

The device is the owner's SHIELD Android TV (`darcy`): Android 11 (API 30), arm64-v8a, 3 GB, a
3840×2160 panel with a 1920×1080 UI override at 320 dpi, so the window is 960×540 dp as on the
emulator. It was reached over network adb (address not recorded), with `svc power stayon true`
during runs and false afterwards.

**Only one valid Shield measurement was possible before the 16:00 blackout.** Two other agents
(the React Native optimisation pass and a playback spike) drove the Shield almost continuously
from 13:47 to 15:31. Each attempt here waited until no other spike app was in front and no other
agent's driver was running for a minute, and aborted as soon as another spike app took the
foreground:

| Run (results folder) | Started | Outcome |
|---|---|---|
| `shield-INVALID-foreign-app-*` | 14:07 | `dev.fluster.spike.play` took the foreground at press 62; focus, frames and memory invalid. Cold start in it (643 ms median) also discarded. |
| `shield-coldstart-only-aborted-*` | 14:22 | Cold start finished (5 runs), then the React Native app took the foreground; aborted. |
| aborted, folder deleted | 14:26 | React Native app took the foreground within 20 s. |
| `shield-frames-*` | 15:28 | **Valid** (both segments' focus paths check out, see below). |
| `shield-memory-aborted-*` | 15:30 | React Native app took the foreground at 15:31; aborted, loop stopped. |

**Compilation on the Shield.** `adb install` on this Android 11 device compiled the app at
install time: `dumpsys package dexopt` reports `status=speed-profile [reason=install]`
(`shield-frames-*/dexopt.txt`), unlike the emulator's `verify`. So the Shield's "as installed" arm
already runs the libraries' baseline-profile code; no separate speed-profile arm is needed there.

### Focus

**Not measured** (aborted twice). Still needed; see "Shield runs still needed".

### Frames (`dumpsys gfxinfo`, held key via monkey)

| Run | Segment | Frames | Janky | p50 / p90 / p95 / p99 | Slow UI thread | Missed vsync | Focus path |
|---|---|---|---|---|---|---|---|
| shield-frames | hold Right, row 0 → col 49 | 216 | **25.93 %** | 10 / 26 / 32 / 38 ms | 10 | 6 | 49 card events, 65 ms median gap |
| shield-frames | hold Down, row 0 → row 19 | 91 | **46.15 %** | 14 / 81 / 121 / 150 ms | 19 | 18 | 19 events to `19,0`, **112 ms** median gap |

One run only. Holding Down, focus fell behind the 50 ms key repeat (112 ms between focus events
against the 65 ms injected). "Slow issue draw commands" is 1 in each segment, so the cost is on
the UI thread, not the GPU. What on the UI thread (composition of a new `LazyRow`, image decode
callbacks, the hero `Crossfade`) is **unverified**; no trace was taken.

### Memory

**Not measured** (aborted). The 14:07 invalid run's memory pass ran with the app in the background
(Graphics 0 afterwards), so it is not reported.

### Cold start (`am start -W`, 5 runs)

| Run | TotalTime median (min–max) | Process start → `BOOT` (first composition), median |
|---|---|---|
| shield-coldstart-only-aborted (14:22) | **554 ms** (535–859) | **523 ms** |

**Provisional:** the device was checked for other spike apps in front, not for other agents'
drivers, before this run.

### Side by side with React Native on the Shield

The React Native numbers are the committed ones in `spike/tv-browse/RESULTS.md` (flag-off
deliverable APK, FlashList rows, **its old 300 px expanded rail, before the collapsed rail and
before the optimisation pass** the React Native agent was running today).

| Measure | React Native (deliverable) | Compose baseline (first pass) |
|---|---|---|
| Focus, single presses ok | 296/299 | not measured on the Shield (emulator: 297–299/299, lenient on Up/Down) |
| Focus, bursts diverged / presses misrouted | 6/12 / 70 | not measured (emulator: 0/12 / 0) |
| Recycled-cell jumps | 4 | not measured (emulator: 0) |
| Hold Right: janky, p90 / p99 | 1.12–1.69 %, 13–14 / 17 ms | **25.93 %**, 26 / 38 ms (1 run) |
| Hold Down: janky, p90 / p99 | 30.23–32.91 %, 29–30 / 69–73 ms | **46.15 %**, 81 / 150 ms (1 run) |
| Hold Down: focus kept up with the key | yes (19 events) | lagged: 112 ms per move against 65 ms injected |
| Memory after the scroll pass: PSS / Graphics incl. mtrack | 312 MB / 91 MB (rows 0–5 mostly) | not measured |
| Cold start: TotalTime median | 387 ms | 554 ms (provisional) |
| Cold start: process start → first content | 555 ms (first React commit) | 523 ms (first composition, provisional) |
| APK | 49 MB | 1.2 MB |

On this evidence the first-pass Compose screen is **not** smoother than React Native on the
Shield: it is worse on held Right and on held Down. It is better on focus correctness on the
emulator and much smaller. Both frame results are single or double runs on one device; the React
Native optimisation pass and this baseline's untried fixes (below) could move either.

### Shield runs still needed (for the coordinator, after 23:00)

From `spike/tv-browse-compose/` in this worktree, with the Shield's serial in `$S` and no other
agent on the device:

```
adb -s "$S" shell svc power stayon true
./run-falsifier.sh "$S" dist/browse-compose.apk all shield-run1     # coldstart, focus, frames, memory
./run-falsifier.sh "$S" dist/browse-compose.apk frames shield-run2  # second frames sample
adb -s "$S" shell am force-stop dev.fluster.spike.browsecompose
adb -s "$S" shell input keyevent KEYCODE_HOME
adb -s "$S" shell svc power stayon false
```

Each takes about 11 minutes (`all`) or 1 minute (`frames`). The art server binds host port 8738;
set `FALSIFIER_HOST_PORT` if a React Native run uses the same host at the same time. Check
`results/<label>-*/dexopt.txt` says `speed-profile`; `FALSIFIER_COMPILE=speed-profile` forces it.
Then fill the Focus, Memory and Cold start tables above from `focus.json`, `memory.json` and
`coldstart.json` (or `python3 ../tv-browse/scripts/summarize.py results/<label>-*` for a one-line row).

## What is verified and what is not

**Verified** (command output or logcat in `results/`):

- the build chain, the APK's ABIs and SDK levels;
- that the falsifier drives and scores this app with only package, tag and port switches;
- focus results above on the emulator, in four runs, with every burst's path checked;
- that `monkey` flips the touchscreen configuration and recreated the activity before
  `configChanges` covered it (ActivityTaskManager `Config changes=8`, `wm_relaunch_resume_activity`);
- that `adb install` leaves the app at `status=verify` and the arm's compile reaches
  `status=speed-profile`.

**Unverified:**

- what costs Compose's slower cold start;
- whether the `ModalNavigationDrawer` rail would honour `focusRestorer` with an `onEnter` rule;
- how a real remote's key repeat compares with injected presses;
- low-RAM boxes, Google TV Streamer, Fire TV.

## Files

- `app/`: the app. `BrowseScreen.kt` is the screen; `Data.kt` and `Tokens.kt` mirror the React
  Native spike's `data.ts` and `tokens.ts`.
- `run-falsifier.sh`: runs the shared driver against this app.
- `results/*/`: per-run JSON, `summary.txt` and raw focus logcat. `shield-INVALID-*` and
  `shield-*-aborted-*` are kept as evidence of runs another agent's app interrupted.
