# Browse falsifier: results

Throwaway spike for decision 0003 (`docs/decisions/0003-tv-and-mobile-shell.md`), "Order" item 8: does a
react-native-tvos browse screen hold up on Android TV? This file records what was measured on
emulators and on the owner's **Nvidia Shield TV** on 2026-11-20 (see "Results: Nvidia Shield"
below).

## Verdict so far

**Update (optimisation pass, same day; see "React Native optimisation pass" below).** Focus
is fixable, vertical jank is fixable once the code is compiled, and memory reaches Google's
targets only with design concessions. The text after this table is the state before that pass.

| Arm | What it changes | Focus (500 presses) | Frames, held Down, compiled | Memory vs the 1 GB targets |
|---|---|---|---|---|
| **F1** | Focus fixes, RGB_565 posters. **Design unchanged.** | **Clean** (0 failures, 0/12 bursts) | 3.4–7.9 % janky, p99 23–31 ms | **Not met**: PSS 328, Anon+Swap+Graphics 253, Graphics 62 |
| F5 (one run) | F1 + no image memory cache + RGB_565 backdrop. Design unchanged except 16-bit art. | not run | not run | **Not met**: PSS 303, 230, Graphics 41 |
| **F4** | F1 + static lift, row `drawDistance` 0, no image memory cache, RGB_565 1280 px backdrop | 0 single failures, but **4/12 bursts lost one press** | **0 % janky, p99 13 ms** | **Met**: PSS 242–246, 169–172, Graphics 33 |

**No single measured arm passes all three.** F1 is the like-for-like comparison with the
Compose build; F4 changes the content (no animated lift, 16-bit art, 1280 px backdrop).

On the **Shield**, the canonical implementation has three problems.

1. **Focus.** Five focus defects reproduce exactly as on the emulator, with the clipped-element flag
   both on and off.
2. **Vertical frame pacing.** Holding Down through the rows is janky: 30–33 % janky frames, p90
   29–30 ms, p99 69–73 ms. The cost is on the UI thread; GPU p99 stays at 11–12 ms. Holding Right
   along a row is smooth: 1.1–1.7 % janky, p99 17 ms.
3. **Memory.** It is over Google's 1 GB-box targets.
   - PSS is 312 MB after the scroll pass, against the 280 MB total.
   - Graphics, including the driver's "Other mtrack", is ~91 MB, against 30–40.
   - Anon+Swap+Graphics is ~262 MB, against ≤200.
   - The Shield has 3 GB, so this does not hurt it, but it would on a 1 GB box.

On the emulator, frames were fine and memory looked lower, because the emulator cannot see GPU
memory.

- Rows are react-native-tvos 0.88.1-0 + FlashList v2.3.3 + Reanimated 4.7.1.
- The worst defect, a focused cell recycled under the user, which snaps the row back ~20–34
  columns, comes from FlashList and went away in one run with its `maintainVisibleContentPosition`
  turned off.
- The rest need explicit focus work: a rail trap, row-end traps, and per-row scroll restoration.

The focus defects are ordinary TV engineering, not a dead end. The vertical jank and the memory
figure are the open questions for decision 0004: neither has been tried with fixes (smaller row
windows, fewer rows mounted, image downsizing, `drawDistance`).

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
| `dist/browse-optpass-v5.apk` (= `dist/browse-optpass.apk`) | Optimisation pass: collapsed rail, every arm switchable at launch (stock unless served an arm) | 54539d87442dd634 |

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
- Bursts imitate a held key: one press every 50 ms. The emulator runs used a paced `input` loop, and
  the Shield runs a `monkey` script (now the default). Both achieved a 64–67 ms median gap between
  focus events.
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

## Results: Nvidia Shield TV (owner's device)

The device is a SHIELD Android TV (`darcy`): Android 11 (API 30), arm64-v8a, 3 GB RAM. The panel is
3840×2160 with a 1920×1080 UI override at 320 dpi, so the app's window is 960×540 dp, the same as
the emulator's. It was connected over network adb (address not recorded), with `svc power stayon
true` during the runs, reset to false afterwards. All runs used the flag-off deliverable APK,
except the experiment.

**Why the coordinator's first two runs were invalid** (`results/shield-INVALID-*`, kept as
evidence):
- The driver chose `cmd input keyevent`. On Android 11 that prints "No shell command implementation."
  to stderr and exits 0 **without injecting anything**.
- The detector read only stdout, so it accepted it.
- Every scripted press was lost: 152 single-press failures, null burst gaps.
- gfxinfo reported 0 frames simply because nothing moved, so nothing redrew. gfxinfo works on the
  Shield once input works (`results/shield-fixcheck-frames`).
- The fix:
  - the probe now merges stderr and rejects any tool that prints anything;
  - single presses use `input`, which costs ~700 ms per call on the Shield because it starts a JVM;
  - bursts and holds use a `monkey -f` script (DispatchPress plus UserWait 50 ms), which achieved
    a 64–73 ms median gap, the same cadence as the emulator's 65–67 ms.
- `adb reverse` over network adb worked (183–297 images served per run).

### Focus (500 presses)

| Run | Single presses ok | Single failures | Bursts diverged | Presses after divergence | Recycled-cell BLURs | Burst gap |
|---|---|---|---|---|---|---|
| Shield, flag off (deliverable) | 296/299 | 3 (1 nowhere, 2 stuck) | 6/12 | 70 | 4 | 64.5 ms |
| Shield, experiment: row MVCP off | 298/299 | 1 (1 stuck) | 3/12 | 12 | **0** | 64.5 ms |

The failing presses are the **same indices as on the emulator**:
- 153 stuck;
- bursts 290, 292, 299, 301, 308 and 310;
- recycled-cell jumps at 42, 292, 301 and 310.

In the experiment, the rail escape (bursts 290, 299 and 308) and stuck press 100 remain, again
matching the emulator. So defects 1–3 are verified on hardware, and so is "MVCP off removes defect
1" (two runs: one emulator, one Shield). Up/Down landed on the same column 86 of 95 times.

### Frames (`dumpsys gfxinfo`, held key via monkey at ~65 ms per press)

| Run | Segment | Frames | Janky | p50 / p90 / p95 / p99 | GPU p50 / p90 / p99 | Slow UI thread |
|---|---|---|---|---|---|---|
| fixcheck | hold Right, row 0 → col 49 (49 events) | 178 | 1.12 % | 9 / 13 / 15 / 17 ms | 2 / 3 / 11 ms | 1 |
| fixcheck | hold Down, row 0 → row 19 (19 events) | 79 | **32.91 %** | 10 / 29 / 36 / 73 ms | 2 / 7 / 11 ms | 15 |
| run 1 | hold Right | 177 | 1.69 % | 9 / 14 / 15 / 17 ms | 2 / 7 / 12 ms | 1 |
| run 1 | hold Down | 86 | **30.23 %** | 10 / 30 / 34 / 69 ms | 2 / 10 / 11 ms | 13 |

Moving down a row mounts a new horizontal FlashList with about 7 posters, starts their loads, and
runs the hero dwell. On the Shield's Tegra X1 that blows the 16 ms budget on roughly one frame in
three, on the UI thread. Which part costs most (layout, image decode, list mount) is **unverified**;
no profiler was run.

### Memory (`dumpsys meminfo`, MB; 297 images served)

| Phase | Total PSS | Java | Native | Code | Graphics (EGL mtrack) | Other mtrack (GPU, in Private Other) | ~Anon+Swap | Graphics incl. mtrack |
|---|---|---|---|---|---|---|---|---|
| idle after launch | 196 | 6 | 94 | 23 | 8 | 31 | 114 | 39 |
| after the scroll pass | **312** | 10 | 137 | 24 | 8 | 83 | 171 | **91** |

- Rows 0–3 and 5–19 were focused; row 4 was skipped by defect 4, as on the emulator.
- Android 11 prints no "Bitmap (malloced)" line, so the decoded-image share of the 137 MB native
  heap is **unverified**.
- ~Anon+Swap = Java + Native + (Private Other − Other mtrack) + swap. This is an approximation of
  Google's counter, not the same counter.

Against Google's 1 GB TV targets:
- **280 MB total: exceeded** (312).
- **≤200 MB Anon+Swap plus Graphics: exceeded** (~171 + ~91 = ~262).
- **30–40 MB Graphics: exceeded** (~91, of which 83 is the Tegra driver's "Other mtrack").

The Shield is a 3 GB device, so none of this is a problem there. It is the figure to fix before a
1 GB box.

### Cold start (`am start -W`, 5 runs)

TotalTime median **387 ms** (373–398). Process start to first React commit, median **555 ms**. The
first React commit lands after the activity's first frame, so the user briefly sees the empty dark
root. The time to first poster is **unverified** (not instrumented).

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
- defects 1–3 at the same press indices across runs, **including on the Shield**;
- on the Shield: arm64-v8a on API 30 launches and renders, `adb reverse` works over network adb,
  and gfxinfo and meminfo work;

**Partly verified:** that FlashList's default `maintainVisibleContentPosition` causes defect 1. It
is absent with it disabled in two runs (emulator and Shield) and present in all ten runs without
that change.

**Unverified:**
- on hardware other than the Shield: low-RAM boxes, Google TV Streamer, Fire TV;
- how key repeat on a real remote compares with the injected ~65 ms monkey presses. The owner's
  sofa test is still the "feel" verdict;
- (Answered on the Shield: `input` costs ~700 ms per call on API 30, too slow to imitate a held
  key, so bursts and holds now use `monkey -f` scripts by default on every device.
  `FALSIFIER_BURST=paced` restores the `input` loop, and `oneshot` is a key-flood stress test whose
  results are not comparable.)
- what costs the vertical jank on the Shield (answered by the optimisation pass's profile:
  expo-image and Fabric prop updates on the UI thread, slow under JIT);
- the decoded-image share of the Shield's native heap;
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

## React Native optimisation pass (2026-11-20)

Goal: find out whether the Shield problems above are fixable in React Native or are React
Native limits. A Compose for TV build of the same screen is the native baseline (other
worktree).

### What changed in the screen (all arms)

- **Collapsed rail (owner decision 2026-11-20).** Icons only, **88 px** wide on the 1920
  canvas (44 dp at 960×540 dp), expanding to **300 px** with labels while it holds focus. It
  is an overlay (absolute, `zIndex` 2): the rows start at x = 88 and never reflow. Item: 56 px
  square icon cell, 12 px gap, 10 px radius; top padding 94 px. The open rail is 92 %
  opaque. The hero text starts at x = 112. Rail item 0 has `hasTVPreferredFocus`, so the
  first press lands on the rail as before. **The Compose build should copy this geometry.**
- Everything else (20 rows × 50 posters, 248 px posters, 300 px poster files, 1920 backdrops,
  300 ms dwell and crossfade, 1.08 lift with a 160 ms ring) is unchanged.
- With the rail 212 px narrower, about 6.7 posters are visible per row instead of 6, so the
  old 300 px-rail numbers are not directly comparable. Row a0 below is the new baseline.

### Method

- **One APK, many arms.** `src/arm.ts` fetches `/config.json` from the art server at launch
  (`FLUSTER_ARM` on the host, through `adb reverse`). The `BOOT` log line prints the arm, and
  every run's logcat was checked for it.
- **ART compile state is a harness condition.** Every earlier run reinstalled the APK, so the
  app ran JIT-only: the a0 trace shows 645 ms of JIT compiling in a 6 s Down hold.
  `FALSIFIER_COMPILE=speed-profile` warms the app up (3 rounds of row and rail traffic), then
  runs `cmd package compile -m speed-profile -f`. `dumpsys package dexopt`, recorded in each
  run's `device.json`, shows `reason=unknown` after that compile and `reason=install` after
  an `adb install`. The status reads `speed-profile` in both cases, because the install
  compiles against a nearly empty profile, so only the reason tells them apart. This stands in for what a device reaches after use, or
  what a shipped Baseline Profile gives at install from Play. **The Compose build must be
  measured in the same two states.**
- **"JIT"** in the tables means "as installed by `adb install`" (`reason=install`).
- **Frames:** three runs per arm, reported as a range. A difference inside the a0 range is
  "no effect".
- **Memory:** as before, plus a third reading after `am send-trim-memory <pkg>
  RUNNING_CRITICAL`, to separate caches from the floor. The untrimmed reading is the headline.
- **Profiling:** Perfetto (`perfetto --txt -c`, atrace with app tracing, `-a` is not supported
  on Android 11) plus `dumpsys gfxinfo framestats` in the same run. A Hermes sampling
  profile was not taken (not exposed in the release build): **unverified**, but the cost is
  on the UI thread, not the JS thread.

### What the profile showed (stock, JIT, held Down)

One traced run (Perfetto plus framestats, `results/` does not keep the trace) reproduced the
problem: 45 % janky, p99 61 ms, 14 slow-UI-thread frames.

- **Janky frames are long on the main thread, or start late because it is busy.** In
  framestats the long phase is ANIMATION (12–22 ms); draw, sync and GPU stay at 1–3 ms.
- **The animation phase is Fabric mounting.** Under it, `MountItemDispatcher::mountViews` →
  `IntBufferBatchMountItem::mountInstructions::UPDATE_PROPS numInstructions=15` takes
  13–18 ms. That is one recycled row: FlashList hands a row view to a new row, and ~15
  views get new props.
- **Most of that is expo-image on the main thread.** `[ExpoImage] rerenderIfNeeded` (a Glide
  request per poster) was 140 of the 186 ms of row-update mounting, and
  `[ExpoImage] onResourceReady` added 104 ms more (up to 26 ms in one call). Text updates
  added 12 ms.
- **The app was JIT-only.** The JIT thread compiled for 645 ms of the 6 s window, including
  `BaseViewManager.setTransformProperty` and `ExpoImageViewWrapper.rerenderIfNeeded`.
  Interpreted and freshly JIT-compiled Java is what makes those mounts slow on the Tegra X1.
- **Ruled out:** the hero and backdrop. With a 300 ms dwell that resets on every focus, they
  never update during a 65 ms-cadence hold, so a "throttle during held keys" change has nothing
  to remove. The JS thread (`mqt_v_js`, 689 ms of 6 s) is busy but is not where frames are lost.
- `Choreographer#doFrame` ran 342 times for 90 draws, and `BatchEventDispatchedListeners`
  also ran 342 times, so something registers a frame callback on every vsync. It may be React
  Native's own per-frame event dispatch, Reanimated, or both: **unverified**. It costs
  ~0.3 ms per frame (p50).

### Frames (Shield, held key at ~65 ms; three runs per arm, range shown)

Down = hold Down 19 rows (19 focus events every run). Right = hold Right 49 cards. Changes are
cumulative from a1. The "a" rows used the APK before the final focus fixes (the rail return
guide, later replaced); the frame segments do not touch the rail, and every segment's focus
path was complete (19 and 49 events).

| Arm | Compile | Down janky | Down p90 | Down p99 | Down slow UI | Right janky | Right p99 |
|---|---|---|---|---|---|---|---|
| Old stock, 300 px rail (earlier section) | JIT | 30.2–32.9 % | 29–30 | 69–73 | 13–15 | 1.1–1.7 % | 17 |
| **a0** stock, collapsed rail | JIT | 33.3–34.1 % | 28–34 | 48–65 | 12–17 | 0.6–3.5 % | 16–19 |
| **a0** stock, collapsed rail | **speed-profile** | 5.5–17.1 % | 14–21 | 20–38 | 1–2 | 0.6–1.2 % | 16–17 |
| a1 + row MVCP off | speed-profile | 4.6–9.0 % | 14–15 | 22–26 | 1–2 | 1.2–2.3 % | 16–18 |
| a2 + focus traps | speed-profile | 5.8–11.4 % | 15–17 | 21–25 | 2–5 | 2.3–5.8 % | 17–24 |
| a3 + per-row offsets | speed-profile | 1.1–6.7 % | 13–14 | 19–27 | 1–2 | 1.1–2.3 % | 16–18 |
| a4 + RGB_565 posters | speed-profile | 5.6–5.8 % | 15 | 25–28 | 2 | 0–0.6 % | 15–16 |
| a5 + lift without Reanimated | speed-profile | 1.6–3.2 % | 12–13 | 17–24 | 1 | 0 % | 9–10 |
| a6 + lazy posters while held | speed-profile | 3.3–4.4 % | 7–11 | 25–53 | 1–2 | 0 % | 9–12 |
| a7 + row `drawDistance` 0 | speed-profile | 0–1.6 % | 7–8 | 14–18 | 0–1 | 0–0.8 % | 10–12 |
| **F1** = a4 (focus fixes + RGB_565, design unchanged) | speed-profile | 3.4–7.9 % | 14–15 | 23–31 | 2 | 0.6–1.2 % | 15–18 |
| **F2** = F1 + plain lift + row `drawDistance` 0 | **speed-profile** | **0 %** | 9–10 | **13–15** | 0 | **0 %** | 10–11 |
| **F2** | **JIT** | 12.9–18.8 % | 17–20 | 25–27 | 5–9 | 0 % | 12–13 |
| **F4** = F2 + no image memory cache + RGB_565 1280 px backdrop | speed-profile | **0 %** | 9–10 | **13** | 0 | **0 %** | 11 |

How to read it:
- **Compilation is the biggest lever by far.** The same stock build drops from ~33 % to
  5–17 % janky and from 48–65 ms to 20–38 ms p99 once ART has compiled it. A user's device
  reaches that after some use, and a Play install with a cloud or shipped Baseline Profile
  starts closer to it. A fresh `adb install` does not.
- **a1–a4 are inside the a0 noise.** MVCP off, the traps, per-row offsets and RGB_565 are
  focus or memory fixes; they neither help nor hurt frames measurably.
- **The Reanimated lift was the second cost.** Replacing the 160 ms `withTiming` scale and
  ring with a static focused style (a5) cut Right's p99 from 16–17 to 9–10 ms and the frame
  count from ~175 to ~120. **This changes the design:** the lift is no longer animated. An
  animated lift without Reanimated (for example a native-driven `Animated` value, or a
  single moving focus frame) was **not tried**.
- **Lazy posters (a6) did not help** and lost a press in one run, so it is not in F2.
- **Row `drawDistance` 0 (a7)** mounts fewer off-screen posters per recycled row (about 7
  instead of 9). It looks slightly better for frames, but it drops the occasional press in a
  fast Right hold (see Focus below), and blank cards during a hold were **not checked by
  screenshot**.
- **F2 meets the frame bar when compiled:** 0 janky frames in 6 holds, p99 ≤ 15 ms. Under JIT
  it is still 13–19 % janky on Down, against 33–34 % for stock.

### Memory (Shield, MB, `dumpsys meminfo`, after the scroll pass)

All rows: speed-profile compiled. "Images" is what the art server served in the run; "rows"
is rows focused / rows traversed to column 49. ~Anon+Swap and Graphics are computed as in the
Shield section above (Graphics = EGL mtrack + Other mtrack).

| Arm | Images, rows | Idle PSS | **PSS** | Java | Native | Code | Graphics | ~Anon+Swap | Anon+Swap+Graphics | PSS after critical trim |
|---|---|---|---|---|---|---|---|---|---|---|
| Old stock, 300 px rail, JIT (earlier) | 297, 19/5 | 196 | 312 | 10 | 137 | 24 | 91 | 171 | 262 | n/a |
| stock, collapsed rail | 304, 19/19 | 231 | 345 | 14 | 139 | 48 | 93 | 178 | 271 | 331 |
| F1 (focus fixes, RGB_565 posters) | 424, 20/20 | 212 | 328 | 13 | 140 | 48 | 62 | 191 | 253 | 321 |
| F2 (+ plain lift, row `drawDistance` 0) | 419, 20/19 | 197 | 288 | 14 | 117 | 48 | 58 | 155 | 213 | 280 |
| F3 (F2 + no decoded-image memory cache) | 415, 20/20 | 198 | 276 | 13 | 113 | 48 | 52 | 150 | 202 | 264 |
| F4b (F3 + RGB_565 backdrop, still 1920 px) | 415, 20/20 | 189 | **248** | 12 | 104 | 48 | **37** | 140 | **177** | 247 |
| **F4** (F3 + RGB_565 backdrop at 1280 px) | 417, 20/20 | 185 | **246** | 14 | 102 | 48 | **33** | 139 | **172** | 240 |
| F4, repeat | 417, 20/19 | 185 | 242 | 11 | 103 | 48 | 33 | 136 | 169 | 241 |
| stock, repeat | 301, 19/19 | 233 | 350 | 15 | 140 | 48 | 93 | 180 | 273 | 334 |
| F4, after reinstall (`reason=install`) | 420, 20/20 | 183 | 244 | 12 | 102 | 48 | 33 | 138 | 171 | 239 |
| F5 = F1 + no image memory cache + RGB_565 backdrop (lift and `drawDistance` stock), one run | 432, 20/20 | 249* | 303 | 16 | 133 | 48 | 41 | 189 | 230 | 291 |

\* F5's idle reading is unusually high (Java 19 MB). It started at 15:31, just after the
Compose agent's aborted launch on the Shield (15:30–15:31). Its after-pass figures are in line
with F1 and F3, but it is a single run.

How to read it:
- **The focus fixes raise the workload.** With rows that keep their place and a trap at the
  row's end, the scroll pass really visits every row's 50 cards: 415–424 images against 304.
  The stock rows 6–19 open already scrolled to the end (defect 5), so only ~6 posters each
  load.
- **Code is 48 MB of PSS in every run of this APK**, compiled or freshly reinstalled,
  against 24 MB for the earlier APK. The cause is **unverified** (the new APK adds only the
  arm code and the `profileable` tag). It is inside every figure here.
- **RGB_565 posters cut GPU memory by about a third** (Other mtrack 85 → 54 MB) even with 40 %
  more images loaded. expo-image's `decodeFormat="rgb"` did take effect on Tegra (the drop
  is only explained by 16-bit textures), but the decoded-bitmap size was not inspected
  directly: **partly verified**.
- **Plain lift and row `drawDistance` 0 cut native heap by ~23 MB** (fewer mounted cards and
  posters per row, no per-card Reanimated state).
- **The RGB_565 backdrop is what brings Graphics into range** (52 → 37 MB): the hero holds
  two full-screen bitmaps during a crossfade, 8.3 MB each at ARGB_8888. Dropping it to
  1280 px saves only 4 MB more. In an emulator screenshot the 16-bit backdrop under the 55 %
  scrim shows no visible banding; on the Shield's panel it is **unverified** (owner's eye).
- **Dropping the decoded-image memory cache (F3)** saves 12 MB, at the cost of re-decoding
  posters from disk when a row comes back. Frames with it (F4) stayed at 0 % janky.
- **The critical trim frees only 1–16 MB.** Most memory is held by mounted views and their
  bitmaps, not by caches.

### Focus (Shield, 500 presses, compiled)

| Run | Single presses ok | Single failures | Bursts diverged | Presses after divergence | Recycled-cell BLURs | Rail → Right returns to the card left |
|---|---|---|---|---|---|---|
| Old stock, 300 px rail (earlier) | 296/299 | 3 | 6/12 | 70 | 4 | (1 of 1, emulator) |
| stock, collapsed rail | 296/299 | 3 (recycled-cell jumps 61–63) | 6/12 | 72 | 12 | 1 of 9 |
| **F1** (focus fixes) | **299/299** | **0** | **0/12** | **0** | **0** | **9 of 9** |
| F4 (F1 + the memory and frame arms) | 299/299 | 0 | 4/12 | 4 | 0 | 9 of 9 |
| emulator, stock, paced bursts | 287/299 | 12 | 6/12 | 69 | 11 | 1 of 9 |
| emulator, F1, paced bursts | 299/299 | 0 | 0/12 | 0 | 0 | 9 of 9 |

Burst cadence 58–67 ms. Up/Down landed on the same column 70 of 79 times with F1 and F4.

**F4's four diverged bursts each lost one press.** A held Right of 15 or 20 presses ended
one card short (`0,19` instead of `0,20`, `0,33` instead of `0,34`); the oracle shows one
focus event fewer, not where in the burst it was lost. The likely cause is row
`drawDistance` 0 (no card mounted past the screen edge, so a fast press can find no card to
the right), but F4 differs from F1 in five flags and the F2/F4 hold-Right frame runs lost
nothing, so the cause is **unverified**. A `drawDistance` of about one card (~150 dp) was not
tried.

The focus fixes that made it clean (all in the `traps`, `mvcpOff` and `rowMemory` arms):
1. `maintainVisibleContentPosition={{ disabled: true }}` on the row FlashLists: no recycled
   focused cell, no row snap-back (defect 1).
2. Rail `TVFocusGuideView` with `trapFocusLeft`, `trapFocusUp` and `trapFocusDown`: Left,
   Up or Down on the rail no longer reach the off-screen cards under it (defect 2). The Up
   and Down traps were added after the emulator showed Down from `rail,0` landing on
   `0,30`.
3. A 2 px `TVFocusGuideView` at the content's left edge whose destination is the last rail
   item used, plus scrolling a row fully home when its first card takes focus. Without the
   scroll, Android spends the next Left on scrolling the row's 24 px left padding, which was
   defect 3 ("Left at column 0 is stuck").
4. Each row wrapped in `TVFocusGuideView trapFocusRight`: Right past the end stays (defect 4).
5. Per-row offsets saved from `onScroll` and restored with `scrollToOffset` when a row view
   is recycled for another row (defect 5).
6. Right from the rail goes back to the card the user left: the rail items get
   `nextFocusRight` set to that card's native tag while the rail is open, only if the card's
   view still shows it. A return guide right of the open rail was tried first; together with
   the edge guide it bounced focus between the rail and the card on every Right.

### Verdict

| Arm | What it changes | Focus (500 presses) | Frames, held Down, compiled | Memory vs the 1 GB targets |
|---|---|---|---|---|
| **F1** | Focus fixes, RGB_565 posters. **Design unchanged.** | **Clean** (0 failures, 0/12 bursts) | 3.4–7.9 % janky, p99 23–31 ms | **Not met**: PSS 328, Anon+Swap+Graphics 253, Graphics 62 |
| F5 (one run) | F1 + no image memory cache + RGB_565 backdrop. Design unchanged except 16-bit art. | not run | not run | **Not met**: PSS 303, 230, Graphics 41 |
| **F4** | F1 + static lift, row `drawDistance` 0, no image memory cache, RGB_565 1280 px backdrop | 0 single failures, but **4/12 bursts lost one press** | **0 % janky, p99 13 ms** | **Met**: PSS 242–246, 169–172, Graphics 33 |

**No single measured arm passes all three.** F1 is the like-for-like comparison with the
Compose build; F4 changes the content (no animated lift, 16-bit art, 1280 px backdrop).

Taken one test at a time, React Native can meet each Shield target, but not out of the box,
and not all of them with the design unchanged.

- **Focus: fixed.** Six explicit fixes (about 60 lines) take the 500-press test from
  3 failures, 6 diverged bursts and 12 recycled-cell jumps to zero, on the Shield and the
  emulator (F1). F4's row `drawDistance` 0 brings back a lost last press in 4 of 12 Right
  bursts. That is the ordinary TV focus work the earlier sections predicted.
- **Vertical jank: fixable, but it depends on compiled code.** The cost is expo-image and
  Fabric prop updates on the UI thread when a row view is recycled, made slow by JIT-only
  code. Compiled, with a static lift and fewer mounted posters, holding Down is 0 % janky
  with p99 13–15 ms (from 33 % and 48–65 ms). **Uncompiled it is still 13–19 % janky.**
  A shipped Baseline Profile covering the browse paths is therefore a hard requirement, and
  the first sessions after install will still be worse. Whether a Baseline Profile alone
  reaches the speed-profile result was **not tested**.
- **Memory: met on the Shield with F4, with design costs.** PSS 242–246 MB (target 280),
  Anon+Swap+Graphics 169–172 MB (target ≤200), Graphics 33 MB (target 30–40), from
  345–350 / 271–273 / 93 for stock, while loading 40 % more images. It needs RGB_565 for
  posters *and* backdrop, no decoded-image memory cache, the static lift and fewer mounted
  posters per row. The same numbers hold after a reinstall (244 MB).
  With the lift and `drawDistance` left as designed (F5, one run) it is **not met**: PSS 303,
  Anon+Swap+Graphics 230, Graphics 41.
- **What remains:**
  - The memory margins are thin and depend on design costs: 16-bit art everywhere, no
    decoded-image cache, a static lift. Graphics at 33 MB is inside the 30–40 MB band with
    little room; 15 MB of it is there at idle, before any poster.
  - Native heap of 113–117 MB with no breakdown on Android 11 (no "Bitmap (malloced)" line);
    the share held by Hermes, Glide and decoded bitmaps is **unverified**.
  - The static lift is a design change; an animated lift that does not cost a UI-thread frame
    callback per card is untried.
  - The 1 GB-box result is **unverified**: Glide sizes its caches from the device's memory
    class, and the 3 GB Shield gets larger ones.
  - The Compose build must be measured in both ART states (JIT after `adb install`, and
    speed-profile after warm-up), or the comparison is confounded.

### Shield runs still needed

1. F5 (F1 + no image memory cache + RGB_565 backdrop): memory again and frames ×3, to settle
   whether the design-preserving arm can get under 280 MB.
2. F4 with row `drawDistance` ≈ 150 dp instead of 0: focus, memory and frames ×3, to test
   whether that removes the lost press and keeps the memory result.
3. Recycling pools (`rowPool`) and the vertical list's `drawDistance`: memory and frames.
4. An animated lift without Reanimated (needs code), frames.
5. A Baseline Profile build installed fresh (no warm-up compile), frames, to see how close a
   shipped profile gets to the speed-profile result.

### Each suggested fix and what happened to it

| Suggested fix | Outcome |
|---|---|
| `maintainVisibleContentPosition` off on rows | Done (a1). Removes the recycled-cell jumps; frames unchanged. |
| `trapFocusLeft` / focus guides for the rail | Done (a2), plus Up/Down traps, an edge guide and `nextFocusRight` return. |
| Per-row remembered focus | Done (a3) as per-row scroll offsets; with it, Rail → Right returns to the card left 9 of 9 times. |
| Smaller poster decode (UI size) | Already in effect: the trace shows posters decoded at 244×366 (expo-image downscaling). Nothing to change. |
| RGB_565 | Done for posters (a4) and backdrop (F4b/F4). The big memory win. |
| Throttle backdrop and hero during held keys | Ruled out by reasoning, not measured: the 300 ms dwell already resets on each focus, so neither updates during a 65 ms hold. A "lazy posters while held" variant (a6) was measured and dropped. |
| Memoised rows | Already in place (memo rows and cards, stable `renderItem`). The remaining per-row cost is inherent to recycling: each card's props change. |
| FlashList `drawDistance` tuning | Row `drawDistance` 0 tried (a7): frames slightly better, memory lower, possibly a lost press in fast bursts. The vertical list's `drawDistance` was **not tried**. |
| Recycling pools | **Not tried** (`rowPool` exists as an arm but was never run). |

Memory and focus were measured only for stock and the F arms, not after each step.

### Cold start (Shield, `am start -W`, 5 runs, compiled)

TotalTime median 340–369 ms across the compiled runs (`opt-compile-a0`, `-v2`, `-v3`).
Process start to first React commit 472–480 ms. The `opt-compile-v4` cold start (348 ms) is
excluded: the Compose agent was sending keys to the Shield during it (14:22–14:28). The commit now waits for the arm
fetch from the art server, so it is not comparable to the earlier 555 ms.

### Files and how to rerun

- `src/arm.ts`: the arms. `src/Rail.tsx`: the collapsed rail and its focus work.
- `run-falsifier.sh`: `FLUSTER_ARM='{"traps":true,...}'` picks the arm;
  `FALSIFIER_COMPILE=speed-profile` warms up and compiles first. An APK path that does not
  exist skips the install, which keeps the compiled state between runs.
- `results/opt-*`: every Shield run in the tables (a0–a7, F1–F4, `opt-focus-*`,
  `opt-mem-*`, `opt-compile-*` with their cold starts). `results/emu-*`: the emulator focus
  runs. `emu-a3*` and `emu-F1b-paced` are invalid: the first used monkey bursts on the
  emulator, which restarted the React root 25 times (the Compose build shares this emulator
  and was running at the same time), and the second could not reach its art server (port
  clash with the Compose worktree's server).
- APK: `dist/browse-optpass-v5.apk` (all arms; stock unless an arm is served).

## Files

- `src/`: the app.
- `plugins/with-focus-flag.js`: the flag switch.
- `scripts/generate-art.mjs` and `scripts/serve-art.mjs`: synthetic art and the art server.
- `scripts/falsifier.py`: the driver and oracle.
- `scripts/reanalyse.py` and `scripts/summarize.py`: re-analysis and the summary table.
- `run-falsifier.sh`: the entry point.
- `results/*/`: per-run JSON, `summary.txt`, and raw focus logcat for the runs quoted here.
