# UX audit: Fluster against the evidence

Status: **proposal, 2026-11-12. Nothing here is decided.** The owner makes the design decisions; this document researches, weighs, audits, and recommends. Section 7 is the decision list.

This is a Fable 5.2 product-review pass under the `AGENTS.md` "Tasks" rule. It audits Fluster as it stands against [`docs/research/video-app-ux.md`](../../research/video-app-ux.md) (cited as **Research §n**), and against the three feature studies: **Gripes** ([`streaming-ux-gripes.md`](../../research/streaming-ux-gripes.md)), **Loves** ([`streaming-ux-loves.md`](../../research/streaming-ux-loves.md)), and **Clients** ([`jellyfin-clients.md`](../../research/jellyfin-clients.md)). The wish-list study (**Wishes**) was read from its open pull request (#137) late in this pass; where the two overlap this document points to its decisions and does not ask them again.

## The owner's requests (2026-11-12)

1. "We should probably also do some UX research since we want our app to be superior to all that have preceded it."
2. Added the same day: "we should also have some research into what we already have built because we need to make sure that what we have built actually meets what people would find enjoyable." This is §3, the built-features scorecard.

Both were relayed by the coordinating agent.

## Inputs and limits

- **Design docs:** `DESIGN.md` (accepted 2026-11-08), `docs/design/audit.md`, `docs/design/rework-plan.md`, the design checklist, `PRODUCT.md`, and the three proposals with the owner's answers. Settled answers are treated as settled; where new evidence bears on one, §5 says so and changes nothing.
- **Code:** `src/features/` and the player modules it uses, read only, at `1c9f6b7`. File and line references are to that commit.
- **Screenshots:** all 106 scenarios at 1440×900 and 1920×1080 (and the phone-width set), generated in this worktree with `pnpm test:visual`. Capture names below are files in `visual-captures/<size>/`.
- **What the captures cannot show.** They run the browser development engine against a mock server with synthetic artwork (soft colour gradients). So they show layout, copy, and focus. They do not show real video, real posters, text over a bright or busy picture, timing, or anything on Wayland, a GPU, or a TV.
- **Nothing was run on a real server or real hardware in this pass.** §3.3 lists what that leaves unjudged.
- **Evidence strength** is the research document's: strong, medium, weak, none.
- **Not done:** no edit to `DESIGN.md`, `PRODUCT.md`, or any code; no existing task's acceptance or `depends_on` changed; the Jellyscale repository was not touched.

## 1. Where Fluster already meets or beats the evidence

Said plainly, because most of the audit is about gaps. On the things with the best evidence, the design is right more often than it is wrong.

| # | What Fluster does | Evidence it meets | Where |
|---|---|---|---|
| 1 | **Resume takes one press, with no question.** A Continue watching card and the hero both play on Enter. | Apple: "Avoid asking people if they want to resume playback." Loves L1 and L3, both strong. | `src/features/card-view.ts:74-79`; `10-home.png` |
| 2 | **Navigation is visible and small.** Home, one entry per library, Search, Settings. | NN/g: hidden navigation was used 27% of the time against 48% and was at least 39% slower (strong). Research §2.1. | `src/features/shared/ui/app-nav.tsx:95-113`; `10-home.png` |
| 3 | **Every conversion says so, with its reason, and direct play says nothing.** | No other client found does this (Clients §8). Loves L18. It is also what the NN/g rubric calls "explain how the system works". | `src/features/player/conversion-copy.ts:6-70` |
| 4 | **Skip intro appears only inside the intro and takes one key.** | Netflix's own design rule for a control pressed 136 million times a day: appear "only when needed" and "work with a single click". Research §5.9. | `src/features/player/chrome/skip-button.tsx`; `54-player-skip-intro.png` |
| 5 | **The next episode starts after a countdown you can see, hide, and pause.** Hide stays hidden. | The evidence on auto-play is about control (Research §5.9; Gripes §5 row 9). | `src/features/player/auto-play-next.ts:3-13`; `55-player-next-episode.png` |
| 6 | **The focus ring is a 3 px two-tone ring plus a lift, never a glow alone.** | Exceeds WCAG 2.4.13 (AAA): a 2 px perimeter with 3:1 contrast, where glow does not count. Research §3.2. | `src/styles/tokens.css:127`; `src/styles/base.css:153`; `14-home-keyboard-focus.png` |
| 7 | **Scrubbing shows a frame and the chapter name before the seek happens,** with the keyboard as well as the pointer. | Lab studies: a preview cut seek time by up to 72%. Roku requires it. Research §5.3. | `src/features/player/chrome/scrubber.tsx:34`, `:101`; `53-player-seek-preview.png` |
| 8 | **Errors say what happened and what to do, in words, with a way out.** No codes, no blame, no raw transport text. | Passes most of NN/g's twelve points. Research §10.1. | `src/features/player/error-copy.ts:9-25`; `src/features/player/refusal-copy.ts:21-66`; `58-player-refusal.png` |
| 9 | **Nothing plays by itself, and reduced motion is honoured everywhere.** | WCAG 2.2.2; Apple's reduce-motion guidance. Research §9.2. | `src/styles/base.css:138`; `55b-player-next-episode-reduced-motion.png` |
| 10 | **Images never shift the page and never flash.** Fixed-ratio frames, a BlurHash first, and no skeleton for the first 150 ms. | Layout-shift guidance; NN/g's "no indicator for a fast load". Research §4.2, §4.3. | `src/features/shared/ui/media.css:27-57`; `src/features/shared/ui/feedback.css:53-98` |
| 11 | **Sign-in leads with the network's servers and a code, and has no tour.** | Every TV platform says to authenticate elsewhere; NN/g says skip the tutorial. Research §8. | `src/features/sign-in/`; `04-signin-quick-connect.png` |
| 12 | **Watched and Favorite change at once and roll back with a sentence if the server refuses.** | The practitioner rule for optimistic updates. Research §4.4. | `src/features/detail/use-flag-mutation.ts:31-41`; `43b-detail-watched-error.png` |
| 13 | **Settings are few, apply at once, and confirm what would otherwise be invisible.** | NN/g on switches and defaults. Research §10.2. | `src/features/settings/playback-section.tsx:30`; `70-settings.png` |
| 14 | **Targets are 44 px, text is never under 13 px, and state is never colour alone.** | 44 px is WCAG's stricter 2.5.5; the required size is 24 px. | `src/styles/tokens.css:73` |
| 15 | **The player waits with the title's own artwork, its name, and a way back.** | Apple: show content at once, no intro. Research §5.7. | `src/features/player/chrome/player-loading.tsx`; `56-player-loading.png` |

Two of these are places Fluster is ahead of every app the research could describe: the conversion honesty (3) and the focus treatment (6). Neither is something viewers were found to choose an app for (Loves rates honest labels "nice but not decisive"), so they are quality, not a selling point.

## 2. Gaps, ranked by user impact and evidence strength

Each gap gives the screen, the code or capture, the research it rests on, and a fix. "Covered by" names an existing task. Fixes that need an owner choice point to a decision in §7.

### High

**G1. Back loses your place.** *Evidence: medium to strong.*
- **What happens.** Every browse screen drops its data when you leave it (`gcTime: 0` in `src/features/home/home-data.ts:23-24`, `src/features/browse/library-grid.tsx:56`, `src/features/browse/series-queries.ts:11-28`, `src/features/detail/item-detail-view.tsx:37`, `src/features/search/search-results.tsx:38`). Coming back fetches again from nothing: a skeleton, then the page at the top. A library scrolled to its fourth page returns to its first. The library's sort and filters are component state (`src/features/browse/library-grid.tsx:46-47`), so choosing "Newest added first", opening a film, and pressing Back returns to "Name A to Z". No code restores scroll or focus.
- **Why it is there.** `src/features/query-scope.ts:3-5`: data is dropped "so one user's data is never shown to the next". It is a privacy guard, which is why the fix is a decision.
- **Research.** Baymard: returning to the top of a list "directly caused site abandonments"; users expect Back to respect sort and filter changes (Research §2.2). tvOS and Android both restore focus (Research §3.2). It is a filed complaint against Jellyfin's Android TV client.
- **Covered by.** P13-24 restores *focus* after Back. It does not mention scroll position, the library's page, or sort and filters, and it cannot restore focus to a card that has not been fetched yet. The backlog has "write the sort into the URL".
- **Fix.** Keep each account's browse data while that account is active and purge it on switch, sign-out, and close; put sort and filters in the route; restore scroll and focus from the kept data. **D1.** Proposed task P13-31.

**G2. Retry after a playback failure starts again from where the session was launched, not from where it failed.** *Evidence: medium.*
- **What happens.** The error panel's Retry calls `retry()` with no position (`src/features/player/index.tsx:223`, `:241`), and the coordinator then reuses the original start choice (`src/lib/player/coordinator.ts:106-111`, `:143-145`). A viewer forty minutes past their resume point who hits a network error and presses Retry goes back forty minutes. Read from the code; not reproduced in a running player.
- **Research.** NN/g: an error must preserve the user's work. Fire TV's rules: "seek back to the last known position". Research §5.8.
- **Fix.** Retry from the last reported position once a first frame has been shown. No owner choice. **Task P3-30, added.**

**G3. Home's first screen shows one title twice and hides the row.** *Evidence: strong for where attention goes; the fix is a design call.*
- **What happens.** The hero is the first Continue watching item (`src/features/home/hero-pick.ts:28-34`), and the row below starts with the same item. At 1440×900 the hero fills the window and the row's artwork is cut at the fold, with no titles visible (`10-home.png`). At 1920×1080 the row fits (`11-home-fullpage.png`). So on the smaller window the first screen offers one thing to resume, and the two most-looked-at places on the page are the same title.
- **Research.** Eye tracking: the first card of the first row is looked at on 91% of screens, and almost nobody looks past what is visible (Research §3.4). Loves L1: the pinned row is the best-evidenced feature there is.
- **Covered by.** P16-02 merges the rows and makes the hero and the row agree. It does not say whether the hero's title is repeated in the row, or how tall the hero is.
- **Fix.** **D2.**

**G4. On a series page the episodes are below the fold.** *Evidence: medium.*
- **What happens.** At 1440×900 the header takes the whole window (`--detail-header-h: min(82vh, 60vw)`, `src/styles/tokens.css:67`). The season tabs sit at the very bottom and no episode is visible (`22-series-episodes.png`). The primary action is right, and it is the only thing on screen; anyone who came to pick an episode scrolls first. Logged as a low in the P13-10 review ("the header height at 1440×900").
- **Research.** NN/g on tabs: the list goes above its panel, and both should be seen together (Research §7.1). The eye tracking above.
- **Fix.** **D3.**

**G5. The track panel does not say what a track is.** *Evidence: weak to medium; `DESIGN.md` already asks for it.*
- **What happens.** `DESIGN.md` §7.10 specifies a two-line row: the name, then codec, channels, and default or external flags. The panel shows one line (`OptionList` has a `description` field, `src/features/shared/ui/option-list.tsx:9`, that the track panel never fills). Forced, hard-of-hearing, default, and external tracks are not marked. Two English subtitle tracks look the same.
- **Research.** Netflix treats forced subtitles as their own kind; blind and deaf viewers report not finding the right track (Research §5.5). Wishes W27 asks for audio-description labels and has its own decision (its D6).
- **Fix.** Fill the second line from the stream data the playback plan already carries. Which flags Jellyfin reports for each track was not checked in this pass; the task shows the ones it has. No owner choice, because the design is already approved. **Task P13-29, added** (with G9).

**G6. Subtitles cannot be resized or restyled.** *Evidence: strong for use, medium for the controls.*
- **What happens.** There is no subtitle setting and no mpv subtitle option is set, so text subtitles use mpv's defaults (`src-tauri/src/player/controller.rs:153-161`). The Settings section says only that languages follow the Jellyfin account (`71-settings-subtitles.png`).
- **Research.** About half of viewing hours use subtitles; the BBC and the US device rule both expect the viewer to control size (Research §5.6).
- **Covered by.** P5-05, in M2. Whether one size control should come sooner is **D17**. Wishes W28 adds a note for P5-05's spec.

**G7. The choice of audio and subtitles does not carry to the next episode.** *Evidence: medium to strong.*
- **What happens.** The next episode starts with no stream selection (`src/features/player/use-auto-play-next.ts:31`). Whatever the server's defaults pick is what plays.
- **Research.** "Real friction" in Gripes §5 row 11. The US rule: settings stay "until changed by the user".
- **Covered by.** P15-07, after the dogfood week by the owner's answer (product review Q19 A). Settled; the dogfood protocol watches for it (§8).

### Medium

**G8. Seeking a long way is slow.** *Evidence: weak to medium (platform convention).*
- **What happens.** Every seek key moves 10 s (`src/components/player-keymap.ts:29`). Holding the key repeats 10 s steps at the keyboard's repeat rate. There is no larger step, no acceleration, and no key for the next or previous chapter. The digits jump by tenths.
- **Research.** Apple TV and Android TV both turn a held key into a fast scrub; YouTube has chapter keys; Jellyfin's web client and Plex pair a short step back with a longer one forward (Research §5.4). No research picks a step.
- **Related.** Wishes D9 asks whether the step should be a setting. This gap is about distance, not the step.
- **Fix.** **D5**, and **D16** for the TV.

**G9. The scrubber speaks seconds.** *Evidence: medium (BBC; WCAG name and value).*
- `src/features/player/chrome/scrubber.tsx:62-70` is a range input with no `aria-valuetext`, so a screen reader announces a raw number such as "2479". The BBC's pattern speaks "41 minutes 19 seconds".
- **Fix.** No owner choice. **In task P13-29, added.**

**G10. "Buffering…" appears the instant mpv waits.** *Evidence: medium.*
- `src/components/PlayerView.tsx:249` shows the status with no delay. NN/g: no indicator under a second. Apple: a spinner after two seconds (Research §5.7). A brief stall after a seek flashes a spinner. Unknown how often this happens on real media: the captures cannot show it.
- **Fix.** **D6.**

**G11. Search gives up when nothing matches.** *Evidence: medium.*
- **What happens.** No results shows "Check the spelling, or try part of the title." (`33-search-no-results.png`). Full results are sorted by name, not by relevance (`src/lib/jellyfin/gateway.ts:547`), so searching "the" lists every title containing it in alphabetical order. Nothing tolerates a typo.
- **Research.** Half of users give up after one failed search. Baymard: "Spelling tips alone are not enough." Research §6.1. Wishes W21.
- **Fix.** Mostly the server's: **Jellyscale request 1**. The client part is **D11**.

**G12. The password cannot be shown.** *Evidence: weak to medium.*
- `src/features/sign-in/password-step.tsx:65` is a plain password field. Baymard rates a show-password control "Essential"; WCAG recommends one. On a TV it matters more. **D9.**

**G13. Text over the video uses the dimmest grey.** *Evidence: medium.*
- "Ends at 02:03 PM" is `--text-3` (`src/features/player/chrome/player.css:91`) over the bottom scrim, and behind the scrim is whatever the film is showing (`50-player-controls.png`). `DESIGN.md` limits `--text-3` to surface-0 through surface-2. NN/g: test text over images against the worst image. The W3C's contrast group says the present formula overstates contrast between dark colours (non-normative). Research §9.3.
- **Fix.** **D8**, and task P13-30 so that the captures can show the problem.

**G14. The captures cannot find a contrast problem.** *Evidence: medium.*
- Every fixture image is a soft gradient. `DESIGN.md` §11 rule 1 says to check contrast "on the brightest art in the fixtures", and no fixture is bright or busy. No owner choice. **Task P13-30, added.**

**G15. Nothing teaches the shortcuts.** *Evidence: weak.*
- The `i` key on a card is announced to screen readers only (`src/features/home/home-view.tsx:83`). `/`, `s`, `n`, `a`, `c`, and the digits appear nowhere on screen. A shortcut help sheet is in the backlog. **D12.**

**G16. Clicking the picture does nothing.** *Evidence: none found; convention only.*
- No handler for click, double-click, or the wheel on the video (`src/components/NativeVideoSurface.tsx:116-118`). Click to pause and double-click for fullscreen are what desktop players do; no source for that was found, so it is marked unverified. **D7**, and a dogfood question.

### Low

- **G17. Skeletons appear after 150 ms.** NN/g would show nothing for a full second (`src/features/shared/ui/feedback.css:97`). The evidence that skeletons help at all is weak (Research §4.2). Fixing G1 removes most of the skeletons a viewer sees. In **D6**.
- **G18. Pause and play by key give no on-screen answer of their own.** Pausing brings the controls up, which is feedback enough; resuming hides them after 3 s. Left as it is.
- **G19. No recent searches.** Apple and NN/g recommend them; they also show a viewer's habits to whoever is at the screen. **D10.**
- **G20. No letter jump in a large library.** No evidence for or against. **D18.**
- **G21. The library nav entries vanish while libraries load or fail,** with no placeholder or error (`src/features/shell/signed-in-chrome.tsx:19`). Home shows the error, so the gap is small. Backlog.
- **G22. Quick Connect cannot be approved by scanning.** It asks the person to read a code and type it elsewhere, which is the transcription WCAG 3.3.8 asks apps to avoid. The flow is Jellyfin's. **Jellyscale request 3.**

Already owned by tasks, so not counted as gaps here: staying signed in (P3-02, P3-19), sign-in again when a sign-in ends (P3-21), volume memory (P3-26), keeping the screen awake (P3-25), the buffered range (P13-23), sign-in and player-command copy (P13-19), an unreachable server while browsing (backlog).

## 3. Built-features scorecard

Every user-facing feature Fluster has shipped: tasks marked `done` in `tasks/prd.json`, checked in the code and the captures.

Verdicts:

- **Delights**: meets or beats the best evidence found.
- **Meets**: matches common practice.
- **Falls short**: the evidence points to friction. The row says why.
- **Unknown**: no evidence either way, or nothing but mocks to judge by. The dogfood week must judge.

**A verdict is about the design as built and tested against mocks.** §3.3 says what real hardware could overturn.

### 3.1 The scorecard

| # | Feature (tasks) | Loved behaviour delivered; gripe avoided or repeated | Verdict | Strength | Where |
|---|---|---|---|---|---|
| **Playback** | | | | | |
| 1 | Plays the original file (P1-03, P10-03, P10-09) | Loves L5: what personal-media users pay Infuse for. | Delights | Medium | `src/lib/jellyfin/` policy; tripwire test |
| 2 | Says when the server converts, and why; Play original (P10-06, P10-08) | Loves L18. No other client does it. | Delights | Medium | `conversion-copy.ts:6-70`; UI gallery capture |
| 3 | Explains a refusal and what to do (P3-09, P10-11) | NN/g rubric: human words, a next step, how the system works. | Delights | Medium | `refusal-copy.ts:21-66`; `58-player-refusal.png` |
| 4 | Resume in one press (P3-05, P13-08) | Loves L1, L3. Apple: do not ask. | Delights | Strong | `card-view.ts:74-79`; `10-home.png` |
| 5 | Continue watching on Home (P3-05, P13-08) | Loves L1 delivered. Repeats Gripes 4 (the row fills with abandoned things) until P16-02. Shows one title twice and sits under the fold at 1440×900 (G3). | **Falls short** | Strong | `hero-pick.ts:28-34`; `10-home.png` |
| 6 | Saves and reports your position (P1-10, P2-05) | Loves L3. Reports every 10 s. | Meets | Strong (need); untested live | `playstate-reporter.ts:8` |
| 7 | Skip intro and credits (P3-11, P13-14) | Loves L6; Netflix's own design rule. | Delights | Medium to strong | `skip-button.tsx`; `54-player-skip-intro.png` |
| 8 | Next episode after a countdown (P3-10, P13-14) | Loves L8. Avoids Gripes 9: visible, hideable, pausable. No off switch until P3-23. | Meets | Medium | `auto-play-next.ts:3-13`; `55-player-next-episode.png` |
| 9 | Audio and subtitle panel (P13-13, P10-08) | Stays open; switches without leaving. One-line labels, no flags (G5); the choice is not carried on (G7, Gripes 11). | **Falls short** | Medium | `track-panel.tsx`; `59-player-track-panel.png` |
| 10 | Subtitle and audio defaults from the account (P3-13) | Loves L7. | Meets | Strong (use) | `src-tauri/src/player/track_list.rs:33-38` |
| 11 | How subtitles look | mpv renders styled and image subtitles as authored (Loves L7). No size or style control (G6). | **Falls short** | Strong (use) | `controller.rs:153-161`; `71-settings-subtitles.png` |
| 12 | Scrubber, trickplay, chapters (P3-12, P13-13) | Loves L19; lab evidence for previews. Speaks seconds (G9). Without trickplay on the server there is no picture. | Meets | Medium | `scrubber.tsx:34-101`; `53-player-seek-preview.png` |
| 13 | Seek keys and on-screen feedback (P3-14, P13-13) | Netflix's and YouTube's keys. One step size (G8). | Meets | Weak | `player-keymap.ts:54-95`; `59a-player-osd.png` |
| 14 | Controls that hide (P13-13) | 3 s, as Android TV and Jellyfin's web client; stays while paused. | Meets | None for the delay | `chrome/timing.ts:2`; `51-player-idle.png` |
| 15 | Waiting for the first frame | Loves L2, the second-best-evidenced need. The wait screen is right. The time is unmeasured. | **Unknown** | Strong (need) | `player-loading.tsx`; P3-28 |
| 16 | Player errors and Retry (P13-15) | Clear copy. Retry loses the position (G2). A failure mid-film is titled "Playback could not start" (P13-19 owns the title). | **Falls short** | Medium | `player/index.tsx:223`; `57-player-error.png` |
| 17 | Info sheet (P3-18) | Loves L18, for the enthusiast persona. Honest diagnostics. | Delights | Medium | `52-player-info-panel.png` |
| 18 | Leaving the player | Returns through history. On the owner's Wayland and NVIDIA computer the window stops drawing after Back (P0-13, in progress). Focus and place are not restored (G1). | **Falls short** | Medium to strong | `routes.ts:136-146`; P0-13 evidence |
| 19 | Media keys, MPRIS, fullscreen (P3-14) | Expected desktop behaviour. Only checked in tests. | **Unknown** | None | `src-tauri/src/media_controls.rs` |
| **Sign-in** | | | | | |
| 20 | Server address and discovery (P3-03 in progress, P13-16) | Loves L15. Discovery found nothing from the owner's own workstation, on another subnet (P3-03 evidence). | **Unknown** | Medium | `07a-signin-discovery-states.png` |
| 21 | Quick Connect (P3-04) | Loves L15: sign in without typing a password. | Meets | Medium | `04-signin-quick-connect.png` |
| 22 | Password sign-in, and staying signed in | Repeats the opposite of Loves L3: every launch signs in again until P3-02 and P3-19. No way to see the password (G12). | **Falls short** | Strong | `password-step.tsx:65`; `72-settings-account.png` |
| **Browsing** | | | | | |
| 23 | Navigation (P13-06) | Visible, few, current page marked. | Delights | Strong | `app-nav.tsx:95-113` |
| 24 | Home's other rows (P13-08) | "Latest in" rows, a See all tile, a backdrop that follows focus after a pause. | Meets | Medium | `11-home-fullpage.png` |
| 25 | Detail page (P3-08, P13-09) | One action; format facts before Play (Loves L18); versions (Loves 5.2). | Delights | Medium | `40-detail-movie.png` |
| 26 | Series page (P3-06, P13-10) | Opens on the season you are in; the action names the episode. Episodes under the fold (G4). Unwatched stills and summaries always shown (Wishes W13). | **Falls short** | Medium | `22-series-episodes.png` |
| 27 | Library grid, sort, filters (P3-06, P13-11) | Loads as you scroll, with a Load more control and a count, as NN/g advises. Loses sort, filters, and place on Back (G1). | **Falls short** | Medium to strong | `library-grid.tsx:46-56`; `21-library-grid.png` |
| 28 | Search (P3-07, P13-12) | Visible field, label above, eight suggestions, results kept in the address. Avoids Gripes 12 (never answers with something else). Weak when nothing matches (G11). | Meets | Medium | `31-search-hints.png`; `33-search-no-results.png` |
| 29 | Settings (P10-05, P13-17) | Few, immediate, confirmed. Two rows say "Not available yet." | Meets | Medium | `70-settings.png` |
| 30 | Toasts, inline errors, notices (P13-15, P13-20) | Near the source, by more than colour, never blaming; errors stay until dismissed. | Delights | Medium | `43b-detail-watched-error.png`; `21d-library-error.png` |
| 31 | Watched and Favorite; changes from other clients (P3-15) | Immediate, with a visible rollback. | Meets | Weak | `use-flag-mutation.ts:31-41` |
| 32 | Keyboard everywhere; focus (P3-14, P13-03) | Exceeds WCAG's stricter focus rule; 44 px targets. | Delights | Medium | `14-home-keyboard-focus.png`; `29a-series-row-focus.png` |
| 33 | Loading and empty states (P13-03) | Shaped placeholders, no flash, no shift. The evidence that this feels faster is weak. | Meets | Weak | `12-home-loading.png`; `13-home-empty.png` |

### 3.2 Counts

| Verdict | Count | Rows |
|---|---|---|
| Delights | 10 | 1, 2, 3, 4, 7, 17, 23, 25, 30, 32 |
| Meets | 12 | 6, 8, 10, 12, 13, 14, 21, 24, 28, 29, 31, 33 |
| Falls short | 8 | 5, 9, 11, 16, 18, 22, 26, 27 |
| Unknown | 3 | 15, 19, 20 |

The reading: **what Fluster shows is in good shape; what it loses is the problem.** Five of the eight "falls short" rows are about forgetting something the viewer had: their place in a list (27), their place in a film after an error (16), their place on the way out of the player (18), their track choice (9), and their sign-in (22). The research's best-evidenced rules are the same ones (Research §1).

### 3.3 Untested on a real server or real hardware

Plainly: **most of what is scored above has only run against mocks.**

- **Real playback.** P1-09 (first dogfood play), P1-08 (the codec matrix on NVIDIA and AMD), and P10-12 (conversions on the dogfood server) are all `todo`. P0-01 (the NVIDIA driver mismatch) is `blocked` on a reboot. Rows 1, 2, 6, 7, 10, 11, 12, and 15 are judged from code and tests, not from watching a film.
- **The one thing known from real hardware is bad.** P0-13: on the owner's computer (Wayland, NVIDIA) the window stops drawing after leaving the player. A fix is implemented and not yet confirmed. Until it is, every session ends badly, and row 18 outweighs everything else on this page.
- **The player's controls over real video.** P13-13's evidence lists "Wayland/hwdec/macOS/AppImage chrome over real video" as untested. `DESIGN.md` §5 says its own rule about blur over video "needs checking on the desktop build". Contrast over a real picture (G13) is unknown.
- **Live Jellyfin responses.** The backlog lists unverified response checks for P13-07 to P13-12 on Jellyfin 10.11 and 12.4, and WebKitGTK checks beside them. The captures use Chromium; the desktop app uses WebKitGTK.
- **Skip intro and trickplay need the server to have the data.** A server without media segments shows no Skip button, and one without trickplay shows no preview frame. Whether the owner's library has either is unknown here.
- **Discovery** did not work from the owner's workstation (P3-03).
- **The TV form does not exist yet.** P13-18 is `todo`. The tokens are in `src/styles/tokens.css:138-158` and nothing sets `data-form="tv"`. Nothing about a remote, a three-metre distance, or a TV's colour can be judged. §4 is written for P13-18's spec.
- **Timing.** No number exists for launch, for Play to first frame, or for the gap between episodes (P3-28).
- **A screen reader** has never been tried under WebKitGTK (Wishes proposes an audit).
- **Jellyscale:** nothing is verified against it (`PRODUCT.md`).

Enjoyment cannot be judged for any of these until the dogfood week. §8 turns each into something to watch for.

### 3.4 "Falls short", as ranked fixes

| Rank | Row | Fix | How |
|---|---|---|---|
| 1 | 18 | Finish P0-13 and confirm it on the owner's computer. | Existing task, in progress |
| 2 | 22 | Stay signed in; remember servers. | Existing tasks P3-01, P3-02, P3-19 (already before the dogfood week) |
| 3 | 27, 18 | Back restores the place, the sort, and the focus. | **D1**; proposed P13-31; P13-24 |
| 4 | 16 | Retry from where it stopped. | **P3-30, added** |
| 5 | 5 | One merged row that ages; no duplicate; the row visible on the first screen. | P16-02 (existing); **D2** |
| 6 | 26 | Episodes on the first screen; spoilers as a setting. | **D3**; Wishes D3 |
| 7 | 9 | Say what each track is; carry the choice on. | **P13-29, added**; P15-07 (existing) |
| 8 | 11 | A subtitle size control. | P5-05 (existing); **D17** |

## 4. TV findings, for P13-18's spec or a follow-up

P13-18 is being specified now. These are findings and options, not instructions; four are decisions (D13 to D16). Nothing below edits P13-18's acceptance.

| # | Finding | Evidence | For P13-18 |
|---|---|---|---|
| T1 | **TV body text is at the platforms' minimum, not their body size.** `--ui-scale: 1.5` makes body 24 px and labels and meta 22.5 px (`src/styles/tokens.css:140-156`). tvOS body is 29 pt with a 23 pt floor; Fire TV body is 28 px; Xbox 30 px with a 24 px floor. Card titles and buttons are below two of the three floors. | Research §3.1. Medium. | **D13.** The acceptance's "no rendered text under 22 px" is met either way. |
| T2 | **The safe inset is right for Android TV, Fire TV, and Xbox** (96 px and 54 px). tvOS wants 80 pt at the sides, which 96 covers, and 60 pt top and bottom, which 54 does not. Roku wants 192 px and 106 px for text. | Research §3.1. | Note in `DESIGN.md` §6 that the inset is per platform (A3 below). No change for Android TV. |
| T3 | **`DESIGN.md` §6 confirms before exit; Android TV forbids it** ("Avoid exit gating"), Samsung requires it, and Roku and Fire TV allow it. | Research §2.3. | **D14.** |
| T4 | **Details on a resume card need a Menu key, and Android's quality rules say not to depend on one.** Many remotes have none. P13-18's acceptance says "Menu opens details where Enter plays". Without a second way in, a Continue watching card on such a remote can only play. | Android TV-DM. Research §2.3, §5.1. | **D15.** |
| T5 | **Holding a direction should scrub, not repeat 10 s.** Apple and Android both do this, and both commit with OK. Fluster's held key repeats one step (`src/components/player-keymap.ts:97-107`). At 10 s a press, crossing a two-hour film is 720 presses. | Research §5.3. Medium. | **D16.** |
| T6 | **Up and Down in the player have no job on a TV.** `DESIGN.md` §7.14 says volume is the TV's. Android: up or down "peeks up controls but does not pause". | Research §5.1. | **D16.** |
| T7 | **Back with the nav hidden.** `DESIGN.md` §6 matches Android's rule for top navigation: Back returns focus to the tab row. Netflix's 2025 interface does the same. | Research §2.3. | Meets. Keep. |
| T8 | **Focus scale 1.08 is inside Android's range** (1.025 to 1.1), and the ring is not glow-only. Six posters across matches tvOS's six-column width. | Research §3.2, §3.4. | Meets. Keep. |
| T9 | **Ends stop; they do not wrap** (`src/features/roving-focus.ts:26-29`). Android, Samsung, and tvOS agree; Fire TV wraps lists. Season tabs do wrap (`segmented-tabs.tsx:31`). | Research §3.3. | Meets on Android TV. One rule for tabs and rows would be more predictable; a spec note. |
| T10 | **A held direction in a row moves one card per repeat with no acceleration and no paging.** Samsung accelerates; NN/g counted 245 presses to cross one service's list. | Research §3.3. Weak. | Follow-up, with D18. |
| T11 | **Typing costs about half a second a press.** Suggestions already update as you type. Recent searches would save the most presses. | Research §6.2. Strong. | **D10** (option C is TV only). P8-01 (the phone as keyboard) is the larger answer. |
| T12 | **Sign-in order is right:** discovered servers, then a code, then typing. Keeping the sign-in (P3-02) matters more on a TV than anywhere. | Research §8. | Meets. |
| T13 | **Colour.** The palette is already unsaturated and its white is warm, not pure. Whether `--void` and `--surface-0` band or crush on a TV panel cannot be known without one. | Research §3.1. | A real-hardware check for the shell spike (P9-01). |
| T14 | **Input delay is what costs browsing on TV hardware.** One service halved it and card views doubled. Fluster renders every loaded card (no windowing) and refetches on every return (G1). | Research §3.3. Strong, one vendor. | Not P13-18. A note for P9-01: measure the time from a key press to the focus moving. |
| T15 | **A screen reader on a TV speaks the focused card.** Fluster's card names already carry title, episode, and time left. A hint for the row is missing. | Research §9.3. | Follow-up after the Wishes screen-reader audit. |
| T16 | **Hover.** P13-18 requires that nothing depend on it. Two things do today: the volume slider appears on focus-within only (fine), and row paging arrows are pointer-only by design. | Code facts. | Meets. |

## 5. Proposed `DESIGN.md` amendments

Proposals only. `DESIGN.md` is not edited by this pass. Each waits for the decision named.

| # | Section | Proposed text | Waits for |
|---|---|---|---|
| A1 | §9 "Back" | Add: "Back returns to the screen as it was left: the same scroll position, sort, filters, loaded pages, and focused card. A screen's data is kept while its account is active and dropped when the account changes, signs out, or the app closes." | D1 |
| A2 | §6 Hero; §7.3 | Add a rule that the first row's cards and titles are fully visible under the hero at 1440×900, and that the hero's title is not repeated as the row's first card. | D2 |
| A3 | §6 "10-foot" | Replace "Back on Home exits (after a confirmation in the shell)" with "Back on Home leaves the app the way the platform requires: without a question on Android TV, after a confirmation where the platform's rules ask for one." Add that the safe inset is a per-platform value with 5% as the default. | D14 |
| A4 | §6 "10-foot"; §8 | Raise TV body text to 28 px and the smallest text to 24 px, by scale or by token. | D13 |
| A5 | §7.5; §13 decision 1 | Add: "On TV, holding OK also opens details, so a remote without a Menu key can reach them." | D15 |
| A6 | §7.14; §9 keyboard map | Add held-key seeking, chapter keys, and the TV scrub model (hold to scrub with the preview, OK commits, Back returns to where you were; Up and Down show the controls). | D5, D16 |
| A7 | §7.14 "Status" | Add: "Buffering shows only after a wait of 500 ms." | D6 |
| A8 | §7.14; §3.1 | Add: "Text over video is `--text-1` or `--text-2`, never `--text-3`." | D8 |
| A9 | §7.7 series | Add a rule that the season tabs and the first episode row are visible at 1440×900 when the page opens. | D3 |
| A10 | §7.20 | Add a "Show password" control to step 3. | D9 |
| A11 | §11 | Add: "The scrubber and every slider speak a human value (a time, a percentage)." Needs no decision; it restates rule 6's intent and P13-29 implements it. | Owner's approval of the wording |

## 6. Tasks

### 6.1 Added to `tasks/prd.json`

Three tasks that need no owner choice. Full acceptance is in the file, which is the source of truth.

| Id | Title | Place | Priority | Why no choice is needed |
|---|---|---|---|---|
| **P3-30** | Retry playback from where it stopped | P3, last (after P3-28) | High | A behaviour fix. `DESIGN.md` is silent on it and no one would choose to lose the position. Opus, with a `guardian` review, because it changes what the coordinator asks Playback Negotiation for. |
| **P13-29** | Label tracks fully and speak the scrubber's time | P13, before P13-19 | Medium | Implements `DESIGN.md` §7.10 as approved, and an accessibility fix. Sonnet. |
| **P13-30** | Add a worst-case artwork fixture to the visual captures | P13, before P13-19 | Medium | Test tooling that `DESIGN.md` §11 rule 1 already assumes. Sonnet. It reports what it finds; it fixes nothing. |

None is added to P4-01's `depends_on`; that edits an existing task and is **D4**.

Ids avoid the ones the wish-list pass reserves in pull request #137 (P13-28, P15-11 to P15-15, P16-11 to P16-13, P5-06, P5-07).

### 6.2 Proposed, waiting for decisions

Not in `tasks/prd.json`. Each is in `tasks/backlog.md`.

**P13-31. Restore the place after Back** (D1). High. M. Sonnet; a `guardian` review for the cache rule.
- Home, library, collection, series, detail, and search results keep their data while their account is active; a test proves it is gone after a switch, a sign-out, and a restart.
- A library's sort and filters are in the route, so Back and a reload restore them.
- Returning to any of those screens shows it at the scroll position it was left at, with every page that was loaded, and without a skeleton.
- A change made elsewhere still appears: the kept data refreshes in the background.
- No token, URL, or play-session id is kept in a query cache (the `AGENTS.md` rule is unchanged).
- Works with P13-24 (focus), which this task does not replace.
- A Playwright journey: sort a library, scroll to the third page, open a title, press Back, and find the same sort, position, and focused card.
- The usual TV-form, screenshot, and design-review lines.

**P13-32. Bring the first row and the episodes onto the first screen** (D2, D3). Medium. S. Sonnet. After P16-02.
- At 1440×900 Home shows the hero and the whole first row, titles included.
- The hero's title is not also the first card of the row below it.
- At 1440×900 a series page shows the season tabs and at least one whole episode row.
- 1920×1080 and the TV form are unchanged or better; before and after captures at both sizes.

**P15-16. Seek further with a held key, and jump by chapter** (D5). Medium. S. Sonnet. After the dogfood week.
- Holding a seek key moves in growing steps with the preview following, and commits on release.
- Two keys move to the previous and next chapter when the file has chapters; the OSD names the chapter.
- The step for a single press is unchanged (Wishes D9 decides whether it becomes a setting).
- Unit tests for the step rule; a journey for the chapter keys.

**P13-33. Wait before showing Buffering, and brighten text over video** (D6, D8). Low to medium. S. Sonnet.
- "Buffering…" appears only after the wait the owner chooses; a test covers a stall shorter than that.
- No player text over video uses `--text-3`; the P13-30 capture shows the result.

**P15-17. Show the password; a shortcut sheet** (D9, D12). Low. S. Sonnet.
- Sign-in's password step has a control that shows and hides the password, labelled in words, reachable by keyboard.
- `?` opens a sheet listing the keys for the current screen; it closes on Escape.

**P13-34. TV form follow-ups** (D13 to D16). Medium. M. Opus. After P13-18.
- Whatever D13 to D16 decide that P13-18's spec does not already take.

### 6.3 Proposed order

```text
Now:            P0-13 (finish and confirm on the owner's computer)
Before P4-01:   P3-30 (retry position) → P13-29 (track labels, scrubber time) → P13-30 (worst-case art)
                → P13-31 (Back restores the place; after D1) → P13-32 (first screen; after D2, D3, and P16-02)
With P13-18:    D13 to D16 feed its spec; P13-34 takes the rest
After P4-01:    P13-33, P15-16, P15-17
```

### 6.4 Added to the backlog

See `tasks/backlog.md`, "UX audit". It holds the proposed tasks above, G21, the Jellyscale requests, and the notes for P13-18, P9-01, P5-05, and P4-01.

## 7. Decision list

Twenty decisions in five batches of four. Each stands alone. "Rec" is a recommendation; the owner decides. Spoilers and the size of the skip step are already asked by the wish-list proposal (its D3 and D9) and are not asked again; this audit's evidence on them is in Research §7.2 and §5.4.

### Batch 1: keeping your place

**D1. Should Back return you to exactly where you were?**
Today every browse screen forgets its data when you leave, so Back reloads it from the top: a library you had sorted and scrolled returns unsorted at its first page. It was built that way so one account's data can never be shown to the next. In Baymard's testing, being sent to the top of a list after opening one item "directly caused site abandonments".
- A: Leave it. Privacy first; pages reload on Back.
- B: Keep each account's browse data while that account is active, and erase it when the account switches, signs out, or the app closes. Back restores position, sort, filters, and focus.
- C: B, and also keep it across a restart so the app opens where it was left.
- **Rec: B (proposed P13-31).** It is the best-evidenced fix in this audit and keeps the privacy rule's intent: nothing outlives the account being in use. C starts storing viewing data on disk, which you have been careful about.

**D2. What should the first screen of Home show at 1440×900?**
The hero is your most recent title, and it fills the window. The Continue watching row under it starts with the same title and is cut off at the bottom edge. Eye tracking of row-based pages found the first card of the first row is looked at on 91% of screens and almost nothing below the visible area is.
- A: Leave it. The hero is the one thing to resume, and it is the design's signature.
- B: Make the hero shorter on small windows so the whole first row shows, and leave the hero's title out of the row.
- C: B without removing the duplicate.
- D: No hero when there is something to continue; the row leads.
- **Rec: B (proposed P13-32, after P16-02).** It keeps the cinematic hero and gives the first screen more than one thing to resume. On a 1920×1080 window the row already fits.

**D3. Should a series page show its episodes without scrolling?**
At 1440×900 the artwork header fills the window; the season tabs are at the very bottom and no episode is visible. The Resume button is right there, so anyone continuing is served. Anyone choosing an episode scrolls first.
- A: Leave it.
- B: Shorten the series header on small windows so the tabs and the first episode row show.
- **Rec: B (in proposed P13-32).** It was already logged as a review finding on P13-10.

**D4. Should the dogfood week wait for the two fixes that most affect it?**
P4-01 is an existing task and agents may not edit it. Without P3-30, a network error mid-film sends you back to where you started. Without P13-31, every Back reloads the page.
- A: No. Log both as dogfood findings if they bite.
- B: Add P3-30 to P4-01's `depends_on`.
- C: Add P3-30 and P13-31 (if D1 is B).
- **Rec: C.** Both are small, and a week spent noting "lost my place again" teaches nothing new.

### Batch 2: the player

**D5. Should seeking a long way be faster?**
Every seek key moves 10 seconds, held or not. Apple TV and Android TV both turn a held key into a fast scrub, and YouTube has keys for the next and previous chapter. No research says which step is best.
- A: Leave it. The digits already jump by tenths, and the scrubber takes a click.
- B: Holding a key seeks in growing steps with the preview following; two keys jump by chapter.
- C: B, and a longer forward step than back (10 and 30), as Jellyfin's web client and Plex do.
- **Rec: B (proposed P15-16), after the dogfood week.** Convention-level evidence; see whether you miss it first. Plex's uneven steps are a standing complaint, so not C.

**D6. Should "Buffering…" and loading placeholders wait before appearing?**
"Buffering…" shows the instant the player waits, and placeholders show after 150 ms. NN/g says to show nothing for waits under a second; Apple says two seconds for a spinner. The evidence that placeholders feel faster at all is weak and mixed.
- A: Leave both.
- B: Show "Buffering…" only after 500 ms. Leave placeholders at 150 ms.
- C: B, and placeholders after 500 ms too.
- **Rec: B (in proposed P13-33).** A flash of spinner after every short seek is the likelier annoyance. With D1 B most placeholders disappear anyway.

**D7. Should clicking the picture pause, and double-clicking go fullscreen?**
Today the picture ignores the mouse. Desktop players commonly do both; no source for that was found, so this is convention, marked unverified.
- A: Leave it.
- B: Click pauses and plays; double-click toggles fullscreen.
- C: Decide after the dogfood week.
- **Rec: C.** With no evidence, your own reflexes in the first evening are the best test. The protocol in §8 watches for it.

**D8. Should text over the video be brighter?**
"Ends at 22:41" uses the dimmest grey over a gradient, and behind the gradient is whatever the film is showing. `DESIGN.md` reserves that grey for solid surfaces.
- A: Leave it. It is secondary information and meant to be quiet.
- B: Text over video is never the dimmest grey.
- **Rec: B (in proposed P13-33), checked with the new worst-case capture (P13-30).**

### Batch 3: sign-in, search, and help

**D9. Should sign-in let you see your password?**
The field is always masked. Baymard rates a show-password control "Essential", and typing a masked password with a remote is the worst case.
- A: No.
- B: A "Show password" control beside the field.
- **Rec: B (in proposed P15-17).**

**D10. Should search remember recent searches?**
Apple and NN/g recommend showing them before you type. They also show what was searched to whoever sits down next, which you have been careful about (your Q11 D). On a TV each letter costs about half a second.
- A: No.
- B: Yes, per account on this computer, with a Clear control.
- C: Only in the TV form.
- **Rec: A on the desktop, and decide C when the TV shell exists.** A keyboard makes retyping cheap; a remote does not.

**D11. What should search do when nothing matches?**
Today it suggests checking the spelling. Half of users give up after one failed search. Jellyfin's search matches text exactly, and results come back in name order.
- A: Leave it, and ask Jellyscale for tolerant, ranked search (Jellyscale request 1).
- B: A, and the client retries once with a looser query (the longest word typed) and says "Showing results for …".
- **Rec: A.** A retry in the client is a guess at what the server should do properly. Revisit if the dogfood week shows misspellings.

**D12. Should there be a sheet that lists the keyboard shortcuts?**
Keys such as `/`, `s`, `n`, `a`, and `i` are not shown anywhere. NN/g: shortcuts should never be the only way, and should be taught where they are used. A help sheet is already in the backlog.
- A: Leave it in the backlog.
- B: `?` opens a sheet of the keys for the current screen.
- **Rec: B, low priority (in proposed P15-17).** Everything is reachable without the shortcuts, so this is polish.

### Batch 4: the TV form (for P13-18)

**D13. How large should text be on a TV?**
The TV form makes body text 24 px and labels 22.5 px. tvOS uses 29 for body and 23 as its floor; Fire TV 28; Xbox 30 and 24. Fluster's body text is at the others' minimum.
- A: Keep 24 and 22.5. Six posters across stays as designed.
- B: Body 28 px and nothing under 24 px, by raising the tokens. Poster count unchanged.
- C: Raise the whole scale to 1.75. Everything grows; five posters across.
- **Rec: B.** It follows the platforms where they agree and leaves the layout alone. A TV in hand may change this; treat it as the starting point.

**D14. Should leaving the app from Home ask first?**
`DESIGN.md` says Back on Home exits after a confirmation. Android TV's guidelines say not to ask; Samsung's require asking; Roku and Fire TV allow it.
- A: Always ask.
- B: Follow each platform: no question on Android TV, a question where the platform requires one.
- **Rec: B.** Android TV is the first TV target, and its rule is explicit.

**D15. How do you open details from a resume card on a remote with no Menu key?**
Enter plays a Continue watching card; Menu opens its details. Many remotes have no Menu key, and Android's quality rules say not to depend on one.
- A: Menu only. The hero's "More info" covers the first title.
- B: Holding OK also opens details.
- C: A "More info" control appears beside the focused card.
- **Rec: B.** One press still plays (your decision 1), and no remote is locked out.

**D16. How should seeking work with a remote?**
Today Left and Right move 10 seconds each. Apple TV and Android TV: a press moves a step, holding scrubs with the preview, OK commits, and Back returns to where you were. Up and Down have no job in Fluster's TV player, because volume is the TV's.
- A: 10 seconds a press only.
- B: Press for 10 seconds; hold to scrub with the preview; OK commits and Back cancels; Up or Down shows the controls without pausing.
- **Rec: B.** It is the one model both major platforms share.

### Batch 5: later, the server, and the protocol

**D17. Should a subtitle size control come before M2?**
About half of viewing hours use subtitles, and Fluster has no control over how they look until P5-05 in M2. mpv's default size is close to the BBC's recommendation, which nobody has checked on your screen. A size control needs a new typed player command, which is an architecture change.
- A: Wait for P5-05.
- B: Bring one "Subtitle size" setting forward, before the dogfood week.
- C: Decide after the first dogfood evening.
- **Rec: C.** If mpv's default reads well on your screen, A costs nothing. The protocol asks on day one.

**D18. Should a large library have a way to jump by letter?**
Reaching "T" in a library of two thousand films means scrolling through many pages. No evidence for or against a letter jump was found.
- A: No.
- B: When sorted by name, typing a letter jumps to it.
- C: Decide with the TV shell, where it matters most.
- **Rec: C.** Search covers it on a desktop.

**D19. Should these requests go to Jellyscale?**
See §9: tolerant and ranked search; remembered track choices honoured per account; a way to approve Quick Connect by scanning; resume and next-up filtered by last-played date.
- A: Yes, carry all four.
- B: Carry the first two.
- C: None for now.
- **Rec: A.** They extend the carry-over list you already approved (loves D8).

**D20. Should the dogfood week use the protocol in §8?**
P4-01 asks for a daily log, the time to first frame, and crashes. §8 adds eleven short tasks timed once, a two-line note after each evening, and seven things to notice.
- A: Use it as written.
- B: Use only the timed tasks on day one and day seven.
- C: Keep P4-01 as it is.
- **Rec: A.** It is about ten minutes on the first day and two minutes a day after that, and it is the only source of evidence for everything §3 marks unknown.

## 8. Usability testing for the dogfood week (P4-01)

A protocol for one person, with no telemetry. Nothing leaves the computer; everything is written by hand into `docs/dogfood/YYYY-MM-DD.md`, which P4-01 already requires.

### 8.1 Why this shape

- With one user there is no statistics. What one person can produce is **a list of moments of friction, caught when they happen**. Memory rewrites them by the next morning.
- Timing a task once at the start and once at the end shows whether the app is learnable and whether anything got in the way.
- NN/g's limits give the pass marks: 0.1 s feels instant, 1 s keeps your thought, 2 s is where video viewers start to leave (Research §4.1, §4.5).

### 8.2 Day one and day seven: eleven timed tasks

Use a phone's stopwatch. Start when you reach for the keyboard or mouse; stop when the result is on screen. Write the seconds, the number of key presses or clicks if you can, and one word: **easy**, **ok**, or **stuck**. Say what you expected whenever it differed from what happened.

| # | Task | Start | Stop | Watch for |
|---|---|---|---|---|
| 1 | Launch to Home | Click the launcher | The first row is on screen | Over 2 s; any blank window |
| 2 | Resume what you were watching | Home is on screen | The picture is moving | One press? Over 2 s to the first frame? |
| 3 | Leave the player and get back to where you were | Press Back while playing | You know where you are | P0-13; is focus on the card you left? |
| 4 | Find a film you have not watched, by browsing | Home | Its page is open | Sort or filter used? Scrolling felt long? |
| 5 | Open that film, look, press Back | Its page | The library again | The same place, sort, and focus? (G1) |
| 6 | Find a title by search, typing it slightly wrong | Press `/` | Its page is open | Did the misspelling return anything? (G11) |
| 7 | Play episode 3 of a show's second season | Home | The picture is moving | Did you scroll to find the episodes? (G4) |
| 8 | Turn on English subtitles and change the audio track | While playing | Both are applied | Could you tell the tracks apart? (G5) Can you read the subtitles from your seat? (G6) |
| 9 | Jump to roughly the middle of the film, then back 30 s | While playing | You are there | Which control did you reach for first? (G8, G16) |
| 10 | Let an episode end and the next one start | The Up next card appears | The next picture is moving | The gap; did your subtitles carry over? (G7) |
| 11 | Sign out and sign in again | Settings | Home is on screen | Typing; discovery; the code |

On day seven, do the same eleven and compare.

### 8.3 Every evening: two lines and a tally

After each session, in the day's file:

- **Stopped me:** anything that made you stop, repeat a step, or reach for the web UI. One line each: screen, what you did, what you expected, what happened.
- **Liked:** anything you noticed working well. One line.
- **Tally** (a count for the evening): times you lost your place; times you saw "Buffering…"; times a control was not where you looked; seconds from Play to the first frame for each title, which P4-01 already asks for.

Write a "stopped me" line **at the moment it happens**, by pausing, not at the end of the evening. A paper note beside the keyboard is enough.

### 8.4 Seven things to notice, from the "unknown" verdicts

Each is a question the research could not answer and one evening can.

1. **The first frame** (scorecard 15). Does Play feel instant, short, or long? Write the seconds. Over 2 s, note the title and its format.
2. **Media keys** (19). Do the keyboard's play, pause, and next keys work, and does the desktop's media widget show the title?
3. **Discovery** (20). Did sign-in find the server unprompted? If not, which network were you on?
4. **Reflexes** (G16, D7). Each time you click or double-click the picture and nothing happens, add to a tally.
5. **Subtitles from your seat** (G6, D17). Readable at your normal distance? Too small, too large, or hard against a bright scene?
6. **Text over the picture** (G13). Any moment the time or the title was hard to read over a bright scene: note the title and the time, and take a screenshot.
7. **Things that depend on the server** (§3.3). Did Skip intro appear on shows you expected it for? Did the scrubber show pictures? Each "no" is a server finding, not a Fluster one, and belongs in the log as such.

### 8.5 At the end

- P4-02 turns the log into tasks. A "stopped me" line that appears on three or more days is high priority, whatever it is.
- Day one against day seven: any task that did not get faster, or went from "easy" to "stuck", gets a line.
- Each of the seven questions gets an answer in a sentence, and each open decision above that says "after the dogfood week" (D5, D7, D11, D17) is asked again with that answer beside it.

### 8.6 What this cannot tell you

One viewer, one library, one computer. It finds friction; it does not measure how common the friction is. A second person at the same computer for twenty minutes, doing tasks 2, 4, 7, and 8 while saying aloud what they are looking for, would find things the owner no longer sees. That is optional, and worth more than any number of extra days alone.

## 9. Jellyscale requests

For the owner to carry over if D19 says so. Nothing here was sent, and the Jellyscale repository was not read or touched in this pass.

1. **Search that tolerates a typo and ranks by relevance,** on `/Search/Hints` and on `/Items?searchTerm=`. Fluster's full results are sorted by name because the server offers no relevance order (G11).
2. **Honour remembered audio and subtitle selections per account** (Jellyfin's `RememberAudioSelections` and `RememberSubtitleSelections`), so a track choice carries to the next episode on every client. P15-07 does this on one computer only.
3. **A Quick Connect approval link** that a phone can open from a QR code, so the code need not be read and typed (G22). Whether Jellyfin's own web client can open its approval page from a link is unverified.
4. **A last-played date filter on Resume and Next Up,** so the 14-day window (P16-02) is the server's work. P16-01 checks what Jellyfin offers.

Media segments, Quick Connect itself, and trickplay are already on the carry-over list (loves D8). The audit adds weight to them: Skip intro and scrub previews are two of the ten "delights" in §3 and both show nothing without the server's data.

## 10. Invariants and rules this proposal touches

Flagged so that nothing here is mistaken for a neutral change.

| Rule | Where it is touched |
|---|---|
| "Never store tokens in WebView storage, Query caches, or React state" (`AGENTS.md`) | D1 keeps browse data longer. It keeps no token, URL, or id; P13-31's acceptance says so. |
| The per-account cache scope (`src/features/query-scope.ts`) and `PRODUCT.md` rule 5, "Your account is yours" | D1 replaces "dropped on leaving the screen" with "dropped on leaving the account". A `guardian` review is asked for. |
| Playback Negotiation: "Build media URLs only in Playback Negotiation"; direct play first | P3-30 changes only the start position a retry asks for. Its acceptance forbids any other request change and keeps the tripwire. |
| "Treat every new Tauri command as an architecture change" | D17 B would need one. P3-30, P13-29, and P13-30 add none. |
| "Show every server conversion and its reason" | Untouched. P13-33 must not delay or dim the conversion notice. |
| `DESIGN.md` is owner-approved | §5 is proposals only. P13-29 implements §7.10 as written. |
| "Never edit acceptance items without human approval" | No existing task is edited. D4 asks. |
| `PRODUCT.md` principle 6, "Private by default" | The protocol in §8 records by hand. D10 and D1 C are flagged for what they would store. |

## 11. What this pass did not do

- It did not run Fluster against a real server, real video, a GPU, or a TV.
- It did not try a screen reader.
- It did not measure any time.
- It did not install or run any competing app.
- It did not review the wish-list proposal beyond avoiding its ids and its decisions.
- It did not edit `DESIGN.md`, `PRODUCT.md`, any code, or any existing task.
