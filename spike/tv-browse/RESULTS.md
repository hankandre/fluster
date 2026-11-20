# Browse falsifier: results

Throwaway spike for decision 0003 (`docs/decisions/0003-tv-and-mobile-shell.md`), "Order" item 8: does a
react-native-tvos browse screen hold up on Android TV? This file records what was measured on
emulators on 2026-11-20. **No real TV hardware has been measured yet.** The Shield numbers come from
`run-falsifier.sh` on the owner's device.

## Verdict so far (emulator only)

Frame time passes on the emulator, and memory is within Google's targets *excluding Graphics*, which the emulator cannot measure, so memory stays unverified until the Shield run. **Focus does not pass.** The canonical implementation has
five reproducible focus defects; all appear with the clipped-element flag both on and off.

- Rows are react-native-tvos 0.88.1-0 + FlashList v2.3.3 + Reanimated 4.7.1.
- The worst defect, a focused cell recycled under the user, which snaps the row back ~20–34
  columns, comes from FlashList and went away in one run with its `maintainVisibleContentPosition`
  turned off.
- The rest need explicit focus work: a rail trap, row-end traps, and per-row scroll restoration.

That is ordinary TV engineering, not a dead end, but it is real cost the decision should price in.

## What was built

`src/App.tsx` is the Home screen, matching DESIGN.md §6 (10-foot) and §7.2–7.5:

- **Rail.** A left rail with 5 items inside `TVFocusGuideView autoFocus`.
- **Hero.** A full-bleed backdrop that crossfades (expo-image `transition` 300 ms) to the focused
  card's art after a 300 ms dwell. Hero updates go through a module-level setter, so rows never
  re-render on focus.
- **Rows.** 20 rows × 50 poster cards, built as a vertical FlashList of horizontal FlashLists.
  Posters are 248 px on the 1920 canvas (6 visible) and 2:3.
- **Images.** expo-image with `recyclingKey` and `cachePolicy="memory-disk"`. The app requests the
  300 px poster variant (the UI-size advice in Google's TV memory guidance) and 1920 px backdrops.
- **Focus lift.** Scale 1.08 plus a 3 px ring. Reanimated 4 shared values are driven from
  `onFocus`/`onBlur`, with no React state on cards.
- **Instrumentation.**
  - Every focus change is logged as `FOCUS r,c` / `BLUR r,c`, and rail changes as `rail,i`, to
    logcat tag `ReactNativeJS` (this works in the release Hermes build; verified).
  - `FLUSTER_FLAG` logs the effective value of `enableCustomFocusSearchOnClippedElementsAndroid`
    at startup.
  - Play/Pause toggles an overlay with JS FPS and JS stalls over 50 ms (`src/PerfOverlay.tsx`). It
    is off by default and off in every measurement.
- **Canonical on purpose.** No `nextFocus*`, no extra focus guides, no traps. Every workaround
  below is listed as a cost, not applied.

**Art.**
- `scripts/generate-art.mjs` (ImageMagick) makes 400 synthetic 2:3 posters (1000×1500 JPEG plus a
  300×450 variant) and 60 backdrops (1920×1080). Nothing copyrighted. Output is in `art/`
  (gitignored).
- `scripts/serve-art.mjs` serves it on 127.0.0.1:8737, and `adb reverse` tunnels the device's
  127.0.0.1:8737 to it. So the APK, the scripts and this file contain no host or LAN address, and
  the same APK works on the emulator and the Shield.

**Clipped-focus flag.**
- `plugins/with-focus-flag.js` adds a Gradle switch: `assembleRelease -PfocusClipped=true` makes
  `MainApplication` call `ReactNativeFeatureFlags.dangerouslyForceOverride` with the stable
  overrides plus `enableCustomFocusSearchOnClippedElementsAndroid = true`.
- The log line proves which arm ran:
  - `results/tv-flagon-*/focus-logcat.txt` shows `=true`;
  - the stock arm shows `=false`, the shipped default
    (`ReactNativeFeatureFlagsDefaults.kt:58` in react-native-tvos 0.88.1-0).

## Versions (installed, from `node_modules/*/package.json`)

| Package | Version |
|---|---|
| expo | 58.0.23 |
| react-native | npm:react-native-tvos@0.88.1-0 |
| react | 19.3.0 |
| @react-native-tvos/config-tv | 0.1.7 |
| @shopify/flash-list | 2.3.3 |
| react-native-reanimated / react-native-worklets | 4.7.1 / 0.13.1 |
| expo-image | 58.0.18 (built from source, as Streamyfin does) |
| expo-build-properties | 58.0.12 |
| hermes-compiler | 260318099.0.5 |
| Gradle / AGP / Kotlin | 9.4.1 / 9.2.1 / 2.2.0 |
| NDK | 27.1.12297006 |
| JDK | Temurin 17.0.21 (mise) |
| Node | 26.13.0 |

**Where the pins come from.** They copy Streamyfin's `package.json` on GitHub (master, read
2026-11-20): expo 58.0.23, react 19.3.0, reanimated 4.7.1, worklets 0.13.1, flash-list 2.3.3, and
config-tv 0.1.7. Its `expo.install.exclude` and `autolinking.android.buildFromSource: ["expo-image"]`
are copied too.

**Peer-range workaround.** `.npmrc` sets `legacy-peer-deps=true` because reanimated's peer range
`0.86 - 0.88` does not match the prerelease `0.88.1-0` under npm semver. Streamyfin uses bun, which
does not enforce this.

## APKs

`dist/` is gitignored, so the APKs are on disk in the worktree but **not committed**.

| File | What | sha256 (prefix) |
|---|---|---|
| `dist/browse-falsifier.apk` | Stock: flag at its default (off) | 656473b7f5a93887 |
| `dist/browse-falsifier-clippedfocus-on.apk` | Same build with the flag forced on | 6436f42ebd9e2c20 |
| `dist/experiment-row-mvcp-off.apk` | Experiment only: rows with `maintainVisibleContentPosition={{disabled:true}}` | c4480f8e5859681e |

The two stock APKs were rebuilt at the end after one type fix (`StyleSheet.absoluteFillObject` → `absoluteFill`, the same style at runtime). Runs 1–3 and the 1 GB run used the earlier builds. The `tv-flagoff-deliverable` and `tv-oneshot` runs used the rebuilt flag-off APK. **The rebuilt flag-on APK has never been launched.**

All three are release builds, Hermes, new architecture, 49 MB, and minSdk 24 / targetSdk 36 (so
they run on the Shield's API 30). The ABIs are `arm64-v8a` and `x86_64` (`aapt2 dump badging`). They
are signed with the Expo template's public debug keystore, `CN=Android Debug`.

**To rebuild:**

```
mise exec -- npm install
EXPO_TV=1 npx expo prebuild --clean --platform android --no-install
cd android && ./gradlew assembleRelease [-PfocusClipped=true]
```

Set `ANDROID_HOME`. For the experiment, add `EXPO_PUBLIC_ROW_MVCP=off`. The app's `BOOT` log line
prints `rowMvcpOff=` so the arm can be checked.

## Method

`run-falsifier.sh <serial> [apk] [what] [label]` does the following:

- installs the APK;
- clears the app's data, so the image cache starts cold;
- starts the art server and runs `adb reverse`;
- runs `scripts/falsifier.py` (stdlib only);
- writes `results/<label or model>-<apk>-<time>/`. The serial is never written to disk.

**Focus test (500 presses).**
- Before each press the device logs `FLUSTER_PRESS "<n> ..."`. The app's `FOCUS`/`BLUR` lines
  between two markers belong to that press, so no timing guesses are needed.
- Single presses wait 0.6 s.
- Bursts imitate a held key: one press every 50 ms, which achieved a 66 ms median gap between focus
  events.
- The sequence:
  1. Right through row 0 and one past the end, Left back, Left into the rail.
  2. Down through all 20 rows and one past the bottom, then Up.
  3. Eight rounds of rail in and out at increasing depth.
  4. Clipped jumps: 20 or 15 Rights in a burst, Down and Up across rows scrolled to different
     offsets, then Left bursts of 10 and 30.
- The oracle uses the *actual* state after each press, so one failure does not cascade:
  - Right/Left: column ±1.
  - Left at column 0: the rail.
  - Up/Down: any card in the adjacent row (rows scroll independently).
  - Right from the rail: any card.
  - Rail Up/Down: ±1.
  - Edges: stay.
- A press is **wrong** (unexpected place), **nowhere** (BLUR with no FOCUS) or **stuck** (no
  event).
- Bursts are reported as incidents (bursts whose focus path left the ideal path) plus the presses
  after the first divergence. That is not a percentage.
- `scripts/reanalyse.py` re-derives the JSON from raw logcat when the oracle changes. Run 1 was
  re-analysed after an oracle bug was fixed: a Left burst longer than the column count should end on
  the rail.

**Frames.**
- From a fresh launch, `dumpsys gfxinfo <pkg> reset`, then hold Right 49 times along row 0 (50 ms
  per press). Then, from a fresh launch, hold Down 19 times.
- Each segment logs its focus path, which shows the segment did what it claims (49 and 19 events).
  In the committed `frames.json` files, hold-Right shows 50 events ending on `rail,0`: the 50th is
  the next launch's priming press, logged before the next marker. The driver now logs a `seg launch`
  marker first, so new runs show 49.
  The first two runs held Left as well; Left jumps (below) polluted those segments, so they are
  shown separately.

**Memory.**
- `dumpsys meminfo` 8 s after launch, and again after a scroll pass: hold Right 49 times in each
  row, then Down.
- Counting every FOCUS event, rows 0, 1, 2, 3 and 5–19 were focused and **row 4 never was**.
  Defect 4 (Right past a row's end leaves the row) skipped it.
- Rows 0–3 and 5 were traversed fully. Rows 6–19 opened already scrolled to their end (defect 5),
  so only their last ~6 posters loaded.
- The tables call this phase "after the scroll pass".
- The art server counted 297 images served in that run (368 in the flag-on run).

**Cold start.** 5 × (`am force-stop`, `am start -W`). It reports `TotalTime` plus the time from
ActivityManager's "Start proc" to the app's first React commit (the `BOOT` log in a `useEffect`).

## Results: `fluster_tv` emulator

The emulator is Android TV, API 36, x86_64, 2 GB RAM, 1920×1080 at 320 dpi (960×540 dp, the same
as the Shield's UI), using `-gpu swiftshader_indirect` on a 16-core host.

### Focus (500 presses per run)

| Run | Clipped flag | Single presses ok | Single failures | Bursts diverged | Presses after divergence | Recycled-cell BLURs |
|---|---|---|---|---|---|---|
| flag off, run 1 | false | 297/299 | 2 (1 wrong, 1 stuck) | 6/12 | 70 | 4 |
| flag off, run 2 | false | 296/299 | 3 (2 nowhere, 1 stuck) | 6/12 | 70 | 5 |
| flag on, run 1 | true | 295/299 | 4 (1 wrong, 2 nowhere, 1 stuck) | 6/12 | 77 | 5 |
| flag on, run 2 | true | 297/299 | 2 (1 nowhere, 1 stuck) | 6/12 | 77 | 4 |
| flag off, deliverable APK | false | 294/299 | 5 (1 wrong, 2 nowhere, 2 stuck) | 6/12 | 69 | 5 |
| experiment: row MVCP off (1 run) | false | 298/299 | 1 (1 stuck) | 3/12 | 12 | **0** |

**Repeatability.**
- The same press indices fail in every stock and flag-on run (five runs on 2 GB and one on 1 GB): 153, plus the bursts at 290, 292,
  299, 301, 308 and 310.
- The recycled-cell single-press failures move around: presses 9, 20, 27, 42, 50, 61 and 64
  across runs.
- Up/Down landed on the same column 86 of 95 times (mean offset 1.9–2.4 columns).
- Left into the rail then Right back returned to the last card 1 of 1 time (one sample only).

**Defects found** (with no workarounds applied):

1. **The focused cell is recycled; the row snaps back.**
   - Seen in every stock and flag-on run (five on 2 GB, one on 1 GB), 4–5 times per run. Rapid presses hit it most.
   - Holding Left along a row: at about column 26–36, as the next card scrolls in at the left edge,
     the row snaps to its start. The native view that still has focus now shows column 2–9's
     poster, with no focus or blur event for the change.
   - The user sees a jump of ~20–34 columns. Or, on Right, focus "goes nowhere": BLUR with no
     FOCUS, and the next press starts from the wrong card.
   - **Verified by screenshot** in a manual replay on row 3.
     - Before the press, the focus was on column 27, with the row showing columns 26–31.
     - The press logged a normal move (`BLUR 3,27`, `FOCUS 3,26`), and the hero updated to column
       26.
     - But the screen showed the row snapped to columns 0–5, with the ring on column 4's poster.
     - The next Left logged `BLUR 3,4`.
   - **Cause (partly verified).** It disappeared (0 recycled-cell BLURs) in the single run with FlashList's
     `maintainVisibleContentPosition` disabled on the rows. That option is on by default in FlashList
     v2 (`FlashListProps.d.ts:294`). One run is not proof.
2. **Left on the rail escapes into the content.**
   - Every run, both flags, and also with MVCP off. 3 bursts per run.
   - With a row scrolled to column ~25, Left from a rail item goes *right*, to that row's
     off-screen cards at negative x under the rail (for example `rail,0 → 0,29`).
   - Fix cost: `trapFocusLeft` on the rail's guide.
3. **Left at column 0 sometimes does not reach the rail.** It is stuck at press 153 (row 2) in
   every stock and flag-on run, and at press 100 (row 0) with MVCP off.
4. **Right past the end of a row leaves the row.**
   - Holding Right after column 49 moves focus to the row above at column 49, then to the next row
     (`1,49 → 0,49 → 2,5`). Seen in the memory pass and in a replay.
   - Fix cost: trap Right on each row's last card, or a row-level focus guide.
5. **A row's horizontal scroll position leaks into other rows.**
   - After rows 0–4 were scrolled to their ends, rows 6–10, which had never been scrolled, opened
     at columns 44–49. **Verified by screenshot.**
   - The vertical FlashList recycles each row's native horizontal scroll view along with its
     offset. A Netflix-style "each row remembers its own position" behaviour needs explicit
     per-row offset state.
6. **No initial focus after `am start`.** The window starts in touch mode and the first D-pad press
   only focuses rail item 0. This is standard Android behaviour; whether launching from the TV
   launcher with a remote avoids it is **unverified**. The driver sends one uncounted priming press.

**On #1087 / #1183, this run does not settle the flag question.**
- FlashList v2 hard-codes `removeClippedSubviews={false}` on its scroll view
  (`@shopify/flash-list/src/recyclerview/RecyclerView.tsx:574`), so its rows never have clipped
  subviews.
- The on/off comparison therefore exercises the flag's `focusSearch` branch
  (`ReactHorizontalScrollView.kt:1013`), not the clipped-subview case that PR #1183 describes. PR
  #1183 is still **open and unmerged**; issue #1087 is open.
- Result: no measurable difference here. Flag on had 2–4 single failures against 2–3 off, 6/12 bursts
  diverged in both, and 70–77 presses after divergence.
- This does **not** clear #1087 for lists that clip, such as FlatList or ScrollView with
  `removeClippedSubviews`.

### Frames (`dumpsys gfxinfo`, held key at ~66 ms per press)

| Run | Segment | Frames | Janky | p50 / p90 / p95 / p99 |
|---|---|---|---|---|
| flag off, run 3 (validated path) | hold Right, row 0 → col 49 | 207 | 1.45 % | 15 / 16 / 16 / 16 ms |
| flag off, run 3 (validated path) | hold Down, row 0 → row 19 | 97 | 3.09 % | 16 / 16 / 16 / 16 ms |
| flag off, deliverable APK | hold Right | 208 | 1.92 % | 16 / 16 / 16 / 16 ms |
| flag off, deliverable APK | hold Down | 96 | 3.12 % | 16 / 16 / 16 / 16 ms |
| flag on, run 2 (validated path) | hold Right | 206 | 1.46 % | 16 / 16 / 16 / 16 ms |
| flag on, run 2 (validated path) | hold Down | 98 | 3.06 % | 16 / 16 / 16 / 16 ms |
| runs 1–2, Right+Left (path polluted by defect 1) | row | 318–332 | 2.1–2.5 % | p90/p99 16 / 16 ms |
| runs 1–2, Down+Up (path polluted) | rows | 174–176 | 5.7–6.3 % | p90/p99 16–23 / 16–28 ms |

All janky frames are "slow issue draw commands" or "frame deadline missed", none "slow UI thread".
**The emulator draws with swiftshader on a 16-core desktop CPU, so these say nothing about a Shield's
Tegra X1 or a 1 GB box.** They show only that the JS and UI threads are not the bottleneck.

### Memory (`dumpsys meminfo`, MB)

| Run | Phase | Total PSS | Java heap | Native heap | Private other | Graphics | Bitmaps (malloced) | ~Anon+Swap |
|---|---|---|---|---|---|---|---|---|
| flag off, run 3 | idle after launch | 113 | 14 | 46 | 20 | 0* | 21 (41 bitmaps) | 80 |
| flag off, run 3 | after the scroll pass (297 images served) | 155 | 9 | 89 | 24 | 0* | 50 (59) | 122 |
| flag off, deliverable APK | after the scroll pass (365 served) | 155 | 10 | 88 | 23 | 0* | 49 (57) | 121 |
| flag on, run 2 | after the scroll pass (368 served) | 158 | 12 | 89 | 24 | 0* | 50 (58) | 125 |
| runs 1–2 (polluted traversal, rows 0–2 only) | after | 181–184 | 7–10 | 102 | 38 | 0* | 45–46 (90–91) | 147–150 |

\* Graphics reads 0 because swiftshader draws on the host, so GPU memory is not attributed to the
app. **The Graphics figure and the "≤200 MB Anon+Swap plus Graphics" target stay unverified until the
Shield run.**

~Anon+Swap is approximated as Java + Native + Private Other + swap PSS. That is an approximation of
Google's definition, not the same counter.

Against Google's 1 GB TV targets:
- **280 MB total:** 155–184 MB PSS *excluding Graphics*, which is part of Total PSS on a real
  device but reads 0 here. Within target only if Graphics adds less than ~95 MB (**unverified**).
- **≤200 MB Anon+Swap plus Graphics:** 122–150 MB before Graphics, so it is met only if Graphics
  stays under ~50–78 MB (**unverified**).
- **30–40 MB Graphics:** unmeasured.

Decoded posters at 300 px are ~0.53 MB each (46.9 MB / 90 bitmaps), plus 8.3 MB for each 1920
backdrop held.

### Cold start (`am start -W`, 5 runs each)

| Run | TotalTime median (min–max) | Process start → first React commit, median |
|---|---|---|
| flag off, run 1 | 157 ms (147–170) | n/a (metric added later) |
| flag off, run 2 | 125 ms (121–152) | 130 ms |
| flag on, run 1 | 152 ms (134–164) | 155 ms |
| flag on, run 2 | 130 ms (111–131) | 128 ms |
| flag off, deliverable APK | 133 ms (121–156) | 125 ms |

On a 16-core host these are a floor, not an estimate for a Shield.

## Results: `fluster_tv_lowram` (1 GB)

This is a clone of `fluster_tv` with `hw.ramSize=1024`, booted with `-memory 1024 -lowram
-wipe-data`. MemTotal is 988164 kB, but `ro.config.low_ram` stayed unset, so this is a **1 GB-RAM
device, not an Android low-RAM (Go-style) configuration**. The AVD is at
`~/.android/avd/fluster_tv_lowram.avd`; delete it with that folder and `fluster_tv_lowram.ini`.

| Measure | Result |
|---|---|
| Focus | 297/299 single presses ok. 2 single failures (1 wrong, 1 stuck), 6/12 bursts diverged, 70 presses after divergence, 4 recycled-cell BLURs. Same press indices as on 2 GB (64, 153, 290–310). |
| Frames, hold Right row 0 | 220 frames, 1.36 % janky, p50/p90/p95/p99 15/16/16/16 ms |
| Frames, hold Down 19 rows | 100 frames, 2.0 % janky, 16/16/16/16 ms |
| Memory, idle | PSS 132 MB (Java 13, Native 46, Code 40, Private other 14, swap 1), bitmaps 21 MB |
| Memory, after the scroll pass (371 images served) | **PSS 156 MB** (Java 11, Native 79, Code 15, Private other 26, **swap PSS 12**), bitmaps 50 MB (58), ~Anon+Swap 128 MB, Graphics 0* |
| Cold start | TotalTime median **273 ms** (138–407); process start → first React commit median **304 ms** |

At 1 GB the system starts swapping the app (12 MB swap PSS) and paging out code (Code PSS falls
from 40 to 15 MB). Cold start roughly doubles. PSS, excluding Graphics, stays under the 280 MB target.

## One-call bursts (stress, not a held key)

With `FALSIFIER_BURST=oneshot`, on `fluster_tv` with the deliverable APK, a burst is sent as one
`input keyevent 22 22 22 …` call (`results/tv-oneshot-stress-*`).

- 49 back-to-back Rights produced only **19 focus events, ending in another row** (`2,9`).
- 19 Downs produced **3**.
- Frames: 35 and 31, at 11.4 % and 19.4 % janky.
- Focus: 10 of 12 bursts diverged, with 128 presses after divergence.

Under a key flood with no gaps, focus cannot keep up and leaves the row. No remote sends keys that
fast, so this is a stress datum only. An earlier draft of the driver fell back to this mode
automatically on slow injectors; it no longer does.

The driver as committed was validated by `results/tv-final-driver-frames`:
- hold Right: 49 focus events ending on `0,49`, 66 ms median gap, 212 frames, 2.36 % janky,
  p90/p99 16/16 ms;
- hold Down: 19 events ending on `19,0`, 98 frames, 4.08 % janky, 16/16 ms.

## Results: `fluster_googletv`

Not run (time). `run-falsifier.sh emulator-XXXX dist/browse-falsifier.apk all googletv` runs it.

## What is verified and what is not

**Verified** (by command output or screenshot in this worktree):
- the build chain;
- that release logcat carries the focus lines;
- the Play/Pause perf overlay (JS fps 61, 1 stall over 50 ms, worst 72 ms while pressing Right at 10/s; screenshot);
- that the APK has arm64-v8a, with minSdk 24;
- that the flag's effective value is set per arm;
- that art comes over `adb reverse` with no address baked in;
- defects 1, 4 and 5 by screenshot or log in a manual replay;
- defects 1–3 at the same press indices across runs.

**Partly verified:** that FlashList's default `maintainVisibleContentPosition` causes defect 1 (one
run).

**Unverified:**
- anything about real hardware: frame pacing, Graphics memory, cold start, and how D-pad key repeat
  on a real remote compares with the injected 50 ms bursts;
- whether `input keyevent` on API 30 is fast enough to imitate a held key.
  - Bursts are always paced: one call per key, then 50 ms. On a slow injector they run slower
    than a held key.
  - The driver warns when one injection takes over 100 ms, and records the achieved gap
    (`burst_achieved_median_gap_ms`, `median_gap_ms` per segment), which should be compared before
    comparing devices.
  - `FALSIFIER_BURST=oneshot` sends a whole burst in one call. That is a stress test, not a held
    key (see "One-call bursts" below), and its results are not comparable with paced ones;
- that the APK runs on arm64 or API 30. Neither the arm64 slice nor API 30 has ever been launched;
  only the x86_64 slice ran, on API 36;
- `adb reverse` over network adb (the Shield's connection). It was only used over the emulator's
  local transport;
- whether the Google TV image behaves the same;
- whether a Compose for TV client avoids these defects. The decision's "feel" comparison is the
  owner's to make;
- `ro.config.low_ram` behaviour. The emulator's `-lowram` flag did not set it on this image.

## Costs to carry into decision 0004 (if React Native stays)

- Rail: `trapFocusLeft`, and Right should restore the last-focused card.
- Rows: trap Right and Left at the ends, so Left at column 0 always reaches the rail.
- FlashList rows: disable `maintainVisibleContentPosition`, or move off FlashList for rows; then
  re-test defect 1 on hardware.
- Per-row scroll-offset state, so recycled rows don't inherit other rows' positions.
- Initial focus (`hasTVPreferredFocus`) once launched from the TV launcher.
- An automated focus regression test like this one in CI on an Android TV emulator: it caught all
  of the above in about 4 minutes per run.

## Files

- `src/`: the app.
- `plugins/with-focus-flag.js`: the flag switch.
- `scripts/generate-art.mjs` and `scripts/serve-art.mjs`: synthetic art and the art server.
- `scripts/falsifier.py`: the driver and oracle.
- `scripts/reanalyse.py` and `scripts/summarize.py`: re-analysis and the summary table.
- `run-falsifier.sh`: the entry point.
- `results/*/`: per-run JSON, `summary.txt`, and raw focus logcat for the runs quoted here.
