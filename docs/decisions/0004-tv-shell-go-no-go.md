# 0004: Go or no-go on React Native as Octave's TV shell

- Status: **Accepted: go with React Native** (the owner, 2026-11-20: "I'm willing to go with React Native"). The conditions below become tasks (T0-06, T3-13, T3-14, T11-08). Still open and decided later, without blocking the go: the focus-lift and memory variant (choice 2), and the owner's sofa trial (choice 3). The night Shield runs of 2026-11-20 are added as evidence when they land.
- Date: 2026-11-20 (drafted about 15:40 CST, before the serial Shield run planned for after 23:00)
- Task: T0-05. It closes phase T0 (T0-01 to T0-04) and gates T1 onward.
- Follows: decision 0003, "Decision (accepted)" item 8: "The owner's go or no-go becomes decision 0004."
- Touches: nothing yet. A go confirms 0003 item 1. A no-go replaces it and sends phases T2 onward back to the Product Owner.
- Evidence: three throwaway spikes measured on 2026-11-20 on emulators and on the owner's Nvidia Shield TV (Android 11, 3 GB). Each is a `RESULTS.md` on an unmerged branch:

| Short name | File | Branch | Commit |
|---|---|---|---|
| RN | `spike/tv-browse/RESULTS.md` | `spike/tv-browse-falsifier` | `cbc565a` |
| Compose | `spike/tv-browse-compose/RESULTS.md` | `spike/tv-browse-compose` | `effa363` |
| Play | `spike/tv-play/RESULTS.md` | `spike/tv-play-falsifier` | `af75d28` |

The UX synthesis (2026-11-20) is an uncommitted working note; it is used only for what the TV app must get right. **[unverified]** marks a claim no measurement or source backs. **[pending]** marks a number the night run should supply.

## The question

Decision 0003 chose React Native (Expo SDK 58, react-native-tvos 0.88.x) as the shell and ordered two falsifiers before any real work:

- **Browse:** do react-native-tvos rows and focus hold up on the Shield, compared with a Compose for TV build for feel?
- **Play:** can Media3 direct-play an HDR10 file from Jellyscale with the Authorization header on every request?

The question for the owner: **did either falsifier show a reason to drop React Native, and if not, on what conditions does the work go ahead?**

## What was measured

### Browse: React Native on the Shield

The screen is Home: a collapsed rail, a hero, and 20 rows of 50 posters. Google's targets for a 1 GB TV box are 280 MB in total, 200 MB of anonymous plus graphics memory, and 30–40 MB of graphics.

Three builds matter. All are one APK with settings switched at launch.

- **Stock:** the screen as first written, with no fixes.
- **F1:** six focus fixes and 16-bit posters. The design is unchanged: the focused card still lifts with an animation.
- **F4:** F1 plus a lift that does not animate, fewer posters kept ready beside each row, no in-memory cache of decoded images, and a 16-bit backdrop at 1280 px.

"Compiled" means Android has compiled the app's code after some use, which is the state a shipped Baseline Profile aims for. "As installed" means straight after `adb install`, with almost nothing compiled.

| Measure | Stock | F1 | F4 |
|---|---|---|---|
| Focus, 500 presses: single presses correct | 296/299 | **299/299** | 299/299 |
| Focus: held-key bursts that went wrong | 6 of 12 | **0 of 12** | **4 of 12**, each one press short |
| Hold Down, as installed: janky frames | 33–34 % | not measured | not measured (F2, which is F4 without its last two memory changes: 13–19 %) |
| Hold Down, compiled: janky frames, 99th-percentile frame | 5.5–17.1 %, 20–38 ms | 3.4–7.9 %, 23–31 ms | **0 %, 13 ms** |
| Hold Right, compiled: janky frames | 0.6–1.2 % | 0.6–1.2 % | 0 % |
| Memory after a scroll pass: total | 345–350 MB | 328 MB | **242–246 MB** |
| Memory: anonymous plus graphics | 271–273 MB | 253 MB | **169–172 MB** |
| Memory: graphics | 93 MB | 62 MB | **33 MB** |
| Meets the 1 GB targets (measured on the 3 GB Shield) | no | no | yes |

Frames are three runs per build, shown as a range. Source: RN, "React Native optimisation pass".

What the table says:

- **Focus is fixed.** Six fixes of about 60 lines took the test from 3 failures and 6 bad bursts to none, on the Shield and the emulator.
- **Compiling the code is the biggest lever.** The same stock build falls from about 33 % to 5–17 % janky once compiled.
- **The animated lift costs frames and memory, but it is not the whole gap.** Removing the animation alone left Down at 1.6–3.2 % janky. 0 % appeared only when fewer posters were also kept ready beside each row. That second setting is the suspected cause of F4's lost press, so fixing the press may give back some frames and memory.
- **No single build passes all three tests.** F1 passes focus only. F4 passes frames and memory, but loses one press in 4 of 12 fast Right bursts. The likely cause is the "fewer posters kept ready" setting **[unverified]**; a middle value was not tried.
- **F4's memory result has thin margins.** Graphics is 33 MB against a 30–40 MB band, and 15 MB of that is there before any poster loads.

### Browse: React Native against Compose on the Shield

| Measure | React Native | Compose, first pass | Is the comparison fair? |
|---|---|---|---|
| Hold Right: janky frames | 0.6–3.5 % as installed; 0–1.2 % compiled | 25.9 % (one run) | **No.** See the two notes below. |
| Hold Down: janky frames | 33–34 % as installed; 0–17 % compiled, by build | 46.2 % (one run) | **No.** Same notes. |
| Hold Down: did focus keep up with the key? | Yes (65 ms a move) | No (112 ms a move) | One Compose run. |
| Focus, 500 presses | F1: 299/299, 0 of 12 bursts | not measured **[pending]** | Emulator only for Compose: 297–299/299, 0 of 12 bursts. |
| Memory after a scroll pass | F1 328 MB, F4 242–246 MB | not measured **[pending]** | Emulator only for Compose: 49–61 MB, with image memory invisible there. |
| Cold start to first content | 472–480 ms compiled; 555 ms as installed | 523 ms (provisional) | No. The Compose run was not checked for other agents' key presses, and React Native's compiled figure includes a wait for the build settings. |
| APK size | 49 MB | 1.2 MB | Yes. |

Where the comparison is unfair:

1. **Compilation state.** The Compose file reads `status=speed-profile [reason=install]` as "already compiled". The RN file found that the same reading after `adb install` means a nearly empty profile, which it calls "as installed". The two files disagree, and nobody checked which is true for the Compose build **[unverified]**. If the RN reading is right, Compose's 26 % and 46 % belong beside React Native's as-installed 33–34 %, not beside its compiled 0 %.
2. **Single runs.** Compose has one valid Shield frames run. React Native's own three-run ranges are wide (5.5–17.1 % for one build), so one run proves little.
3. **Effort.** Compose is a first pass with no tuning. React Native has had a full optimisation pass. The Compose file's own side-by-side table still uses React Native's numbers from before that pass and before the collapsed rail.
4. **Collisions.** Three agents shared the Shield from 13:47 to 15:31. Runs that another app interrupted are kept as `shield-INVALID-*` and `*-aborted-*` and are not used here. One React Native memory run (F5) and one cold start were taken beside another agent's activity and are marked in the RN file.

On the emulator, Compose's focus is better than stock React Native's (0 bad bursts against 6) but it has its own defects: Up drifts 2–6 columns sideways, a row does not remember its card, Left enters the rail at the bottom item, and Down from that item leaves the rail. Compose starts about three times slower there.

### Play

Source: Play, "Verdict" and "Verified vs unverified".

| Claim | Result |
|---|---|
| Media3 1.11.1 direct-played Alien (4K HEVC Main10, tagged as HDR10) from Jellyscale on the Shield | Played 128 s; 3 of 3,081 frames dropped, all at the start; no rebuffer |
| Decoder | `OMX.Nvidia.h265.decode`, the hardware decoder |
| Start-up | 2.48 s from process start to first frame |
| Header on every request, token on every non-public request, no credential in any URL | PASS on every run, Shield and emulator |
| Redirects followed | 0. Probe redirects were answered and not followed |
| A request with no token, sent straight to Jellyscale | 401 |
| A redirect on the stream itself stops playback and is not followed | Verified on the emulator only |
| The TypeScript core runs unchanged under Hermes | Yes, with three additions: a URL polyfill, SHA-256 from `expo-crypto`, and a transport over `expo/fetch` |
| HDR10 reaches the screen | **Unproven.** The Shield reported no HDR display, its video layer carried no HDR tag, and whether the TV was on an HDR input is unknown |
| Lossless audio | **Unproven.** Alien's DTS-HD track was opened as plain DTS (the core). The AVR was not checked |
| Dolby Vision | Dune (profile 7) went to the Dolby Vision decoder and played 40 s with no drops. Output not checked. Spider-Man (profile 8.6) did not play on the Shield: the title lookup failed, since fixed **[pending]** |

One Shield attempt failed with a prepare error after playback had started. The trigger is unknown; another tool may have been active on the device. The fix was verified on the emulator and has not run on the Shield.

## Did 0003's conditions for changing the stack fire?

**Decision 0003 does not list numbered conditions for dropping React Native.** Its "Revisit if" section was written for the earlier WebView proposal. What it does give is the reasons React Native was chosen, the falsifier order, and a risk row. Each is tested here.

| What 0003 says | Fired? | Evidence |
|---|---|---|
| Browse falsifier: rows and focus must hold up on the Shield (item 8) | **No.** | Focus is clean with F1. Frames reach 0 % janky compiled. Memory meets the targets with F4. No one build does all three (RN, "Verdict"). |
| Browse falsifier: judged "against an installed Compose client for feel" (item 8) | **Not answered.** | The feel verdict is the owner's and has not been given. The one Compose frames run was worse, not better, and is not a fair comparison. |
| Play falsifier: Media3 direct-plays an HDR10 file from Jellyscale with the header on every request (item 8) | **No**, for the wiring. **Open** for HDR. | Proxy PASS, hardware decoder, 401 control. HDR output unproven. |
| Risk: "Android TV focus regressions (#1087, #1162)" (Finding 3) | **No** on the Shield. **Open** on Fire OS. | #1087's flag made no measurable difference here, but FlashList never clips views, so the case #1087 describes was not exercised. #1162 is reported on Fire TV devices only; none was tested. Both issues are open upstream (read 2026-11-20). |
| Reason: the TypeScript core is reused after polyfills (Finding 3) | **Held.** | The core ran unchanged under Hermes (Play). |
| Reason: React Native is the only option that reaches Android TV and Apple TV with one UI (item 1) | **Unchanged.** | Nothing measured bears on it. |
| Risk: "the player chrome ends up native anyway" | **Accepted already.** | 0003 item 1 makes the player screen native. The play spike was built that way. |

Nothing measured is a reason to change the stack. Two of the tests are not finished.

## Proven and unproven

**Proven on the Shield:**

- React Native browse can have clean focus, and can hold 0 % janky frames once compiled.
- React Native browse can meet Google's 1 GB memory targets, at a design cost.
- Media3 plays the original 4K file from Jellyscale on the hardware decoder with the header on every request and no credential in any URL.
- The core runs unchanged under Hermes.

**Unproven:**

- **Low-end hardware.** No cheap box was tested. The 1 GB emulator is not an Android low-RAM device (`ro.config.low_ram` stayed unset), and it cannot see graphics memory. The image library sizes its caches from the device's memory, so the Shield's F4 figures may not carry over. The UX synthesis ranks "smooth on cheap sticks" twelfth of fifteen, on thin evidence.
- **Whether a Baseline Profile is enough.** The compiled results came from Android's own compile after a warm-up. A build with a shipped profile, installed fresh, was not measured. The first sessions after install will be worse either way.
- **Where the remaining frame cost sits.** One trace of the stock build, as installed, put most of it in expo-image starting image loads on the main thread (140 of 186 ms of row updates). The fixed builds were not traced.
- **HDR output**, Dolby Vision output, and lossless passthrough to an AVR.
- **Fire OS focus (#1162)**, and any device other than the Shield.
- **An animated lift that is cheap.** Only the Reanimated version and a static style were tried.
- **Compose on the Shield:** focus, memory, a second frames run, and its true compilation state.
- **The owner's sofa verdict.** Injected key presses stand in for a remote in every number here.

## Recommendation

**Go, with conditions. Confidence: medium.**

- Neither falsifier found a wall. Every browse problem found on the Shield had a fix that was measured.
- The alternative did not look better. Compose's first pass was worse on frames in its only Shield run and has focus defects of its own. That run is weak evidence, so it does not prove React Native is better; it only fails to show Compose is.
- The reasons 0003 gave for React Native (Apple TV from one UI, one copy of the TypeScript rules) still stand, and the play spike confirmed the second.
- Confidence is medium and not high because the cheap-box case is untested, the fair Compose comparison is pending, and nobody has yet used either build from the sofa.

**What would lower this to no-go:** the night run shows Compose clearly ahead on the Shield in the same compilation state, across more than one run; or the owner finds the React Native build feels wrong from the sofa in a way F1 and F4 do not fix; or a cheap box cannot hold the memory targets with any acceptable design.

**If the answer is no-go:** the replacement is native Kotlin with Compose for TV. 0003 calls it "the lowest-risk route to a TV-native feel on Android alone". It has no Apple TV path, and the TypeScript core (about 5.3k lines and 595 tests) must be ported or bridged. The Product Owner revises phases T2 onward before any of their tasks starts (T0-05).

## Conditions attached to a go

1. **A Baseline Profile is required** in every release build, covering the browse paths. Add a fresh-install measurement to show how close it gets to the compiled result. No task names this yet.
2. **A performance budget, set by the owner and enforced** (T3-12): cold start, key press to focus change, janky frames while a key is held, and memory after a scroll pass.
3. **Buy a cheap Google TV box before the browse screens are built**, and run the same script on it. The lift is built in T3-06 and T3-08 and the budget is set in T3-12, so the box is wanted by then. T11-06 checks a 1 GB device profile, but only at release, which is too late to change the design.
4. **Fix the expo-image main-thread cost.** T3-11 builds a native image view; that view must start loads off the main thread, and a trace must show it.
5. **Carry the focus work** (T3-08, T3-09): rail traps, row-end traps, Left at the first card always reaching the rail, Right from the rail returning to the card left.
6. **Keep each row's scroll position in app state**, so a recycled row does not inherit another row's place.
7. **Choose the list library on evidence** (T3-01's maintenance check). FlashList rows need `maintainVisibleContentPosition` off, and a draw distance that neither wastes memory nor drops presses.
8. **Run the 500-press focus test in CI** on an emulator, as a required check (T3-10). It found every defect here in about four minutes a run.
9. **Prove HDR10 output and passthrough before the playback phase (T8) is called done**, with the TV and AVR reporting what they receive.
10. **Test one Fire TV device for #1162** before promising Fire OS.

## What the owner decides

**1. Go or no-go** on React Native as the shell.

**2. The lift and the memory budget.** This is a look decision.

- **A. F1.** Keep the animated lift and full-colour backdrop. About 328 MB on the Shield, over the 1 GB targets, and 3–8 % janky frames holding Down. Fine on a Shield; likely not on a 1 GB box. One run kept the lift and lightened memory with 16-bit art and no image cache (F5): 303 MB in total, 230 MB anonymous plus graphics, 41 MB graphics. That still misses all three targets, so no build that keeps the lift has met them yet.
- **B. F4.** The focused card changes without animating, and art is 16-bit. 0 % janky, 242–246 MB, meets the targets. The lost press in fast bursts must be fixed first. Whether 16-bit backdrops show banding on the owner's panel is unchecked.
- **C. Both.** F1 where the device has memory to spare, F4 when the device reports low memory. The best look on good hardware, at the cost of two paths to test, and the low-memory path is the one no device has proven.

Recommended: **C**, decided for certain only after the cheap box arrives. A fourth route, an animated lift that does not cost a frame per card, is untried and would make A cheaper.

**3. Is the owner's own sofa trial required before go?** 0003 item 8 and the acceptance of T0-01 to T0-03 each ask for it. Recommended: **yes**. It takes about ten minutes and is the only test of feel.

To try it, from `spike/tv-browse` on branch `spike/tv-browse-falsifier`, with the Shield's adb serial in `$S`. These steps are read from `run-falsifier.sh` and were not run as written **[unverified]**:

```
adb -s "$S" install -r dist/browse-optpass-v5.apk
adb -s "$S" reverse tcp:8737 tcp:8737
FLUSTER_ARM='<arm>' node scripts/serve-art.mjs 8737
```

Open the app, browse for a minute, then compile it once so it runs as it would after real use, and open it again:

```
adb -s "$S" shell am force-stop dev.fluster.spike.browse
adb -s "$S" shell cmd package compile -m speed-profile -f dev.fluster.spike.browse
```

To change build, stop the art server, start it with another `FLUSTER_ARM`, and force-stop and reopen the app. The values, from the runs' own boot lines:

- Stock: `{}`
- F1: `{"name":"F1","mvcpOff":true,"traps":true,"rowMemory":true,"rgb":true}`
- F4: `{"name":"F4","mvcpOff":true,"traps":true,"rowMemory":true,"rgb":true,"diskOnly":true,"backdropW":1280,"rgbBackdrop":true,"rowDrawDistance":0,"plainLift":true}`

The Compose build is `dist/browse-compose.apk` in `spike/tv-browse-compose` on branch `spike/tv-browse-compose`. It uses the same art server on port 8738 (`adb reverse tcp:8738 tcp:8738`, then `node ../tv-browse/scripts/serve-art.mjs 8738`) and takes no `FLUSTER_ARM`. That folder's `run-falsifier.sh` has the exact steps; these were not run as written either **[unverified]**.

## Pending: the serial night run (after 23:00 CST)

One agent at a time on the Shield. This record should be updated with the results before the owner decides.

- Compose on the Shield: focus, memory, cold start and a second frames run, with the compilation state checked.
- React Native follow-ups: F5 (design kept, lighter memory) for memory and frames; F4 with a draw distance of about one card, to see whether the lost press goes; a Baseline Profile build installed fresh.
- Play: Alien with the TV reporting HDR10; Spider-Man with the fixed lookup; Dune for two minutes with Dolby Vision output on.

## Notes for the record

- T0-01 to T0-04 are still `in_progress`. Each has an owner Shield check that is not done.
- T1-01 and T1-02 are marked done in the draft task list, although T0-05 says no task in T1 or later starts before this record is accepted. The owner may want to say whether that stands.
- This record contains no address, serial, token or play-session ID. The spikes reached their servers through `adb reverse` on loopback.
