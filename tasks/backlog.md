# Backlog

Work that someone found and no task owns yet.

## Rules

- Any agent or pull request may append an entry. Appending never needs approval.
- An entry is one line: what, why, where it came from (task id, PR, or doc), and a rough size (S, M, L).
- Never delete another entry. Strike it through when a task takes it, and name the task.
- A deferral names a task or a backlog entry, or it is not a deferral.
- Entries become tasks in `tasks/prd.json` only by the rules in `AGENTS.md` "Tasks". Today that means the owner adds them. The owner said on 2026-11-12 that a Fable 5.2 product-review pass may also triage this file and add tasks with a priority and a place; that takes effect when `AGENTS.md` and the `rules` in `tasks/prd.json` say so (see `docs/plans/proposals/product-review.md`, "Answers").

## Product (from the 2026-11-12 product review)

Decided "not now" by the owner. Revisit dates are in the review.

- A PIN per profile on this device. Four other clients have one. Revisit with the TV shell (Q11). M. The owner decided on 2026-11-12 that it ships with the TV shell's account picker; until then "Stay signed in" off is the privacy control (P13-27). It needs a decision record, because it adds a Tauri command.
- Recap, Preview, and Commercial segments with the same three skip modes (Q15). S.
- A "Still watching?" prompt (Q16). S.
- Audio sync offset and dual subtitles; each needs a typed player command (Q18). M.
- ~~Live TV.~~ Out of scope since the direction update of 2026-11-12 (`PRODUCT.md` "Not for"). Not a backlog item any more.

Jellyscale (direction update, 2026-11-12).

- **Test Fluster against Jellyscale when its client-integration work starts.** Jellyscale is a scale-out video server that speaks the Jellyfin client API (`~/Code/jellyscale`). Fluster assumes it will provide the APIs needed to stream; no compatibility audit has been done. Notes for whoever runs the test, from Jellyscale's `compat/endpoints.yaml` and `README.md` on 2026-11-12:
  - Routes a Netflix-like UI needs that are stubs there today: `/Items/{id}/Similar`, `/Genres`, `/Persons`, `/Items/{id}/LocalTrailers`, `/Items/Filters2`.
  - Quick Connect and user management are not built (`/QuickConnect/Enabled` is a stub; the README's Identity row says "not built"). Fluster's sign-in leads with Quick Connect.
  - Trickplay and library and metadata work are also listed as not built.
  - Found on 2026-11-12 by the discovery pass (`docs/plans/proposals/discovery-and-profiles.md` §3.4), from `compat/endpoints.yaml` and `docs/status.md` at `93a0f3f`: `/Shows/NextUp` is a stub, so Fluster's Next up row is empty there; `/Search/Hints` answers 404 and Fluster's search suggestions call it; media segments are not built, so Skip intro has no data; likes and ratings answer 404; `/Items/Suggestions` is "implemented" in one file and "not built" in the other.
  - Size: M for the test pass; fixes are separate tasks.
  - 2026-11-15: the pinned jellyscale fixture server and its CI job are P17-04, and the tripwire against it is in P17-06. The compatibility test pass across sign-in, browse, and the routes above stays here.

No decision yet.

- Remove an item from Continue Watching, and a watchlist. Top-voted Jellyfin requests; whether a client can do either on 10.11 or 12.x is unverified. S to check. The owner chose on 2026-11-12 to age items out of the row instead of a remove button for now (proposed P16-02), and to let Favorites stand in for a watchlist (P15-01). Both remain here for later; P16-01 records what a position reset does.
- New items appear without a restart (`LibraryChanged` on the server socket; P3-15 handles `UserDataChanged` only). S.
- A designed "server unreachable" state while browsing, with a way back when the server returns. M.
- A keyboard shortcut help sheet. S.
- A key that moves focus to the newest toast (`docs/design/rework-plan.md`, "Idea: a keyboard shortcut for toasts"). S.
- Playlists, extras and trailers, genre and people pages. M each. Extras and trailers are taken by P16-08, genre pages by P16-06, and people pages by P16-07. Playlists remain here.
- Remember a library's sort and filters between visits; write the sort into the URL. S.
- Hide filter chips a library cannot match (`/Items/Filters2`). S.
- ~~The Home hero for a series plays its first episode; use `seriesNextUp` so it agrees with the series page (P13-10 follow-up). S.~~ Taken by P3-27.
- ~~Cast (`PersonRow`) on the series page (P13-10 follow-up). S.~~ Taken by P16-07.
- A task that ships the Windows build after the P7-01 spike. L.
- A task that builds the TV shell after the P9-01 spike. L.
- Flatpak packaging and in-app updates. M each.
- Translations. L.

## Discovery (from the 2026-11-12 discovery pass)

Triage, the owner's answers of 2026-11-12, and the open questions are in `docs/plans/proposals/discovery-and-profiles.md`.

- Tasks now: P3-27, P16-01, P16-04 (More like this), P16-05 (Because you watched), P16-06 (genres), P16-07 (people pages and cast on the series page), P16-08 (local trailers and extras), P13-27 (private accounts).
- Also tasks, after the owner's Batch 4 answers: P16-02 (the fixed Home order, the merged row, and a 14-day window with a setting) and P16-09 (previews, off by default).
- Waiting for the owner: adding P16-02 to P4-01's `depends_on` (Q16). It edits an existing task.

- A "private session" that plays without reporting, for watching on someone else's account. Touches Playstate Reporting (§4.2). M.
- An end-of-film card that offers "More like this" after the credits finish, never over them. Needs "More like this" (proposed P16-04). S.
- Use the time of day and the runtime to rank suggestions (§2.3). Needs a viewer profile. M.
- Let the viewer reorder or hide Home rows (Q1; the owner chose a fixed order for now). M.
- ~~Previews while browsing, if Q13 allows them: a local trailer, muted, opt-in. Needs P16-08. M.~~ Taken by P16-09.
- A remove button for Continue watching, if ageing proves not enough (Q4). S.
- Revisit genre rows on Home after the dogfood week; the case against them was an inference, not evidence. S.
- A row for a collection on Home (`docs/research/streaming-ux-gripes.md` §3). S.

## Review lows carried from P13

Each line points at its full text in `docs/design/rework-plan.md` ("Decision log" and "Follow-ups"). P13-19 closes these, turns them into tasks, or leaves them here.

- P13-16 sign-in lows: the abort check before `onConfirmed`, the expired Quick Connect code left as the hero, `aria-disabled` not dimmed, literals in `sign-in.css`, the missing full server-step capture, and the plain-HTTP consent lows.
- P13-15 notices lows: Escape on the item-gone screen, the `role="alert"` scope, focus after a failed retry, the straight apostrophe.
- P13-13 player lows: `OptionList` calling `onChange` for the selected row, a key OSD replacing the conversion notice, the empty audio list, literals in `player.css`, the buffering live region.
- P13-14: the Up Next image fit for a series Backdrop.
- P13-12 search lows: Down never reaching results after an edit, the missing captures, the stale pending-focus ref, the empty-state alignment.
- P13-11 library lows: the clipped sort menu, the stale `near` flag, `routes.ts` importing a browse module, the browse view states.
- P13-10 series lows: the header height at 1440×900, the phone layout, the empty-fallback path.
- P13-09 detail lows: the strip error copy, hard-coded sizes, `defaultPrevented` in roving focus, danger contrast over art, the stale Home prefetch.
- P13-08 Home lows: the dwell timer not cancelled, the hero at 720–1000 px, the `playerFromDetail` name.
- P13-07 card lows: the accessible name without `remainingTicks`, `RowError` still in Home rows, the media mark in RTL, no e2e for the row position after Down.
- P13-06: the "Browser development mode" label overlapping content on phone captures.
- Error stripping (PR #128): the four test gaps.
- Unverified on the dogfood server (`FLUSTER_DOGFOOD_SERVER`): the Jellyfin 10.11 and 12.4 response checks listed under P13-07, P13-08, P13-09, P13-10, P13-11, and P13-12, and the WebKitGTK checks listed beside them.

## Loves (from the 2026-11-12 loves pass)

Research, verdicts, and the eight open decisions are in `docs/research/streaming-ux-loves.md` and `docs/plans/proposals/streaming-loves.md`.

- Tasks now: P3-28 (measure startup and the gap between episodes) and P15-09 (the Favorites row on Home).
- The owner answered D1 to D8 on 2026-11-12, all as recommended; the answers are at the top of the proposal.
- Applied by the coordinating agent: moving P8-01 into the TV shell's phase (D4 B). It edits an existing task.
- When P3-28 passes, its numbers go back to the owner with proposed targets for `PRODUCT.md` (D3 B), and they settle D7.
- Note for P15-06's spec (D5 A): playback speed resets to normal for every title, and the range is 0.5x to 2x.

**Jellyscale carry-over list (D8 A, owner, 2026-11-12).** For the owner to carry into Jellyscale's own backlog. It extends the list in `docs/plans/proposals/discovery-and-profiles.md` §3.4 A, whose first item is `GET /Shows/NextUp`. After Next Up, in this order:

1. Media segments (`GET /MediaSegments/{itemId}`), from operator data or chapter markers as Jellyscale already decided. Skip intro has no data without it.
2. Quick Connect (`/QuickConnect/Enabled` is a stub). Fluster's sign-in leads with it.
3. Trickplay, for scrub previews.
4. `POST /Sessions/Capabilities` and `/Sessions/Capabilities/Full` (stubs), for remote control from a phone (P8-01).

Status of each is from `compat/endpoints.yaml` and `docs/status.md` at `93a0f3f`.

- ~~A Favorites row on Home (D1; proposed P15-09). A pinned watch list came second of 13 features in a survey of 3,000; Favorites is the watch list (Q10 A). S.~~ Taken by P15-09.
- A "Watched" view of finished titles, newest first (D2; proposed P15-10). 835 votes on Jellyfin's tracker; no usage data. M. The owner chose "not for now" on 2026-11-12 (D2 A).
- "Not this one" on a suggested title (D6; proposed P16-10). Where the dismissal is kept is the open question. S to M. The owner chose to wait for the server-side profile (D6 A).
- Prepare the next episode during the Up Next countdown, direct play only (D7; proposed P3-29). 223 votes; decide after P3-28 measures the gap. Touches Playback Negotiation. M. The owner chose to wait for the measurement (D7 A).
- Carry P8-01 (cast target) into the TV shell's plan so a phone running any Jellyfin app can be the remote and keyboard (D4). Third of 13 features in the same survey. The owner chose this on 2026-11-12 (D4 B); the coordinating agent applies the move.
- Jellyscale notes for the test pass and for the owner's carry-over list (D8): media segments, Quick Connect, and trickplay are "not built", and `/Sessions/Capabilities` and `/Sessions/Capabilities/Full` are stubs (`compat/endpoints.yaml` and `docs/status.md` at `93a0f3f`). Skip intro, sign-in by code, scrub previews, and remote control depend on them.
- Lead the phone shell's task list with offline downloads when that list is written: the most-voted Jellyfin client request (1,827). Not a reason to move P8-03 on the desktop. Note only.
- Note for "Let the viewer reorder or hide Home rows": 47% of 3,000 surveyed viewers would "absolutely" use hiding rows they do not use; the rows they were shown are promotional ones.
- Note for "Revisit genre rows on Home": 82% of 1,362 subscribers said in 2020 that they would use groupings of similar content (intent).
- Marks on cards for what is new since the last visit (Netflix added status tags in 2025; no usage data found). S.
- A sleep timer, picture-in-picture, and a dialogue-boost or night-mode audio option. No usage data was found for any of them; the last needs a typed player command. S, M, M.

## Wish list (from the 2026-11-12 wish-list pass)

Research, verdicts, and the twelve decisions are in `docs/research/streaming-wishlist.md` and `docs/plans/proposals/streaming-wishlist.md`. The owner answered D1 to D12 on 2026-11-12; the answers are at the top of the proposal.

- Tasks now: P16-11 (wish-list contract fixtures), P5-06 (voice clarity and night mode spike, D1 C), P15-11 (captions on skip-back and a resume 3 s early, D2 B), P15-12 (audio-description and hard-of-hearing labels and a preference, D6 C), P13-28 (screen-reader audit, D6 C), P16-12 (running-time filter chips, D7 B), P15-13 (skip step setting, D9 B).
- **Standing principle (owner, D3):** what mainstream media platforms do is the default; a few hundred tracker votes is not enough to depart from it. Entries in this file that rest on tracker counts alone should be read with that.
- ~~"Hide spoilers" for unwatched episodes (D3). 120 votes on Jellyfin's tracker, 118 and 49 on Plex.~~ Declined by the owner (D3). Episode descriptions stay, kept short.
- ~~"Watching with": a second signed-in account is marked as having watched too (D5). 164 votes on Jellyfin's tracker.~~ Declined by the owner (D5).
- ~~Captions for the stretch a viewer skips back over, and an early resume (D2).~~ Taken by P15-11.
- ~~Label audio-description and hard-of-hearing tracks, and "Prefer audio description" (D6).~~ Taken by P15-12.
- ~~Audit the app with a screen reader (D6).~~ Taken by P13-28. It cannot listen; a listening pass with Orca by a person follows from its report.
- ~~A running-time filter for films (D7).~~ Taken by P16-12.
- ~~A setting for the skip step (D9).~~ Taken by P15-13.
- Clear voices and night mode as shipped controls (provisional P5-07). Waits for P5-06's report and the owner's approval of its recommendation. Needs typed player commands and a `guardian` review; does not apply with passthrough. M.
- A sleep timer with "Stop after this episode" (D4 A: stays here). Weak evidence. S. It replaces the sleep-timer part of the Loves entry above.
- "Where you left off" on the series page after a long gap (D8 A: stays here). No demand evidence. S.
- A cast strip on the paused player (D10 A: stays here). 39 votes on Jellyfin's tracker. S.
- Note for "Audio sync offset and dual subtitles" (D12 A: stays): dual subtitles have 134 likes on Infuse's forum and 93 thumbs-up across three Jellyfin clients.
- Note for P5-05's spec (D6 C): caption style settings show a live sample and can be reached from the player's subtitle menu. P5-05's acceptance is not edited.
- Proposed `DESIGN.md` amendment, waiting for the owner: §7.6's TV form gives no line limit for the overview under the focused episode card; add "at most two lines", to match the owner's "very succinct" condition (D3). S.
- Check in the dogfood week: captions on skip-back are on by default (D2 B), which most platforms do not do. If it surprises, the default is the thing to change.
- Note for "Playlists" and "Remember a library's sort and filters": smart playlists have 1,425 votes on Plex and 588 on Jellyfin; they are a server feature, and a remembered filter is the client-side part.
- Note for the product review's Q9 A (one set of settings per computer): "global defaults across clients" has 260 votes and Jellyfin and Jellyscale both implement a per-account preferences record. Revisit with the TV shell; the answer stands.
- Note for a "private session": "anonymous, guest access" has 88 votes on Jellyfin's tracker.
- Jellyscale (D11): the coordinator files two requests, marking audio-description and hard-of-hearing tracks, and a running-time range with sorting by runtime on item queries. Not filed: a loudness figure per audio track, and Recap and Preview as segment types. Dropped with D5: one session counting for more than one account.

## UX audit (from the 2026-11-12 UX research pass)

Research is in `docs/research/video-app-ux.md`. The audit, the built-features scorecard, and the twenty decisions are in `docs/plans/proposals/ux-audit.md`. The owner answered D1 to D20 on 2026-11-12, all as recommended; the answers are at the top of the proposal.

- Tasks now: P3-30 (retry playback from where it stopped), P13-29 (two-line track labels and a spoken scrubber time), P13-30 (a worst-case artwork fixture and a contrast report).
- Also tasks, after the answers: P13-31 (Back restores the place; D1 B), P13-32 (the first row and the episodes on the first screen; D2 B, D3 B), P13-33 (Buffering after 500 ms and no `--text-3` over video; D6 B, D8 B), P13-34 (TV form decisions; D13 B to D16 B), P15-16 (held-key seeking and chapter keys; D5 B), P15-17 (show password and the shortcut sheet; D9 B, D12 B).
- Applied by the coordinating agent: adding P3-30 and P13-31 to P4-01's `depends_on` (D4 C). It edits an existing task.
- The dogfood protocol is `docs/dogfood-protocol.md` (D20 A). P4-01's spec should point to it.
- ~~Back restores the place.~~ Taken by P13-31. It also takes the URL half of "Remember a library's sort and filters between visits; write the sort into the URL" above; remembering them between visits stays there.
- ~~The first row under the Home hero and the episodes on a series page at 1440×900.~~ Taken by P13-32.
- ~~Seek further with a held key, and jump by chapter.~~ Taken by P15-16.
- ~~Wait before showing "Buffering…", and never use `--text-3` over video.~~ Taken by P13-33.
- ~~A "Show password" control on sign-in, and a `?` sheet of keyboard shortcuts.~~ Taken by P15-17, which also takes "A keyboard shortcut help sheet" above.
- ~~TV form follow-ups after P13-18.~~ Taken by P13-34.
- Click the picture to pause and double-click for fullscreen (D7 C: decide after the dogfood week). A mainstream convention, so by the owner's standing principle of 2026-11-12 the default is to add it; the week checks for a reason not to. S.
- Recent searches, per account, with a Clear control (D10: not on the desktop; decide with the TV shell whether the TV form gets them). Shows what was searched to the next person at the screen. S.
- A letter jump in a library sorted by name (D18 C: decide with the TV shell). No evidence either way. S.
- A subtitle size control before M2 (D17 C: decide after the first dogfood evening). P5-05 owns subtitle styling; bringing one control forward needs a typed player command. S to M.
- Notes for P13-18's spec, which edit nothing: Android TV's quality rules say not to depend on a Menu key and not to confirm exit; tvOS wants 60 pt top and bottom where `--safe-y` is 54 px, and Roku wants more for text, so the inset may need to be per platform; season tabs wrap at their ends and rows stop. Details are in the audit's §4.
- Notes for P9-01 (the TV shell spike): measure the time from a key press to the focus moving, because one service halved it and card views doubled; check `--void` and `--surface-0` for banding on a real panel; a library grid renders every loaded card with no windowing.
- Note for P5-05's spec: the BBC sizes subtitles at 7 to 8% of picture height in at most two lines on a box drawn per line; a US device rule lists size from 50% to 200%, colour, background, and edge style.
- A spoken value for every slider as a `DESIGN.md` §11 rule (the audit's A11). P13-29 builds it for the scrubber and the volume slider; the rule's wording waits for the owner. S.
- Library entries in the nav show nothing while libraries load or fail (`src/features/shell/signed-in-chrome.tsx`). Home shows the error, so this is small. S.
- Row hints for a screen reader on TV ("row 2 of 5, Continue watching"), after the screen-reader audit the wish-list pass proposes. S.
- Jellyscale requests (D19 A: carry all four). Filed by the coordinator, by its report: #116 search that tolerates a typo and ranks by relevance; #117 remembered audio and subtitle selections honoured per account; #118 a Quick Connect approval link a phone can open from a QR code; a comment on #101 for a last-played date filter on Resume and Next Up. This pass did not touch the Jellyscale repository.

## PR #142 guardian review lows (2026-11-13)

- The Authorization header is now read at launch, not when the plan is made. If the user signs out mid-negotiation, `readAuthorization()` throws and the launch fails with plain copy; no token leaks, and this is safer than before. No test covers it; add one (`native-player.ts:44`, `coordinator.ts:248`). S.
- The launch reader reaches every engine; only convention stops the browser and e2e engines from calling it. Add a test that `BrowserPlayerEngine.launch` and the e2e engine never call a spy reader (`coordinator.ts:248`). S.

## Code quality review (2026-11-13)

The review is `docs/research/code-quality-review-2026-11-13.md` (commit `fb8d071`, read-only). The verdict on each finding, the tasks, and decisions D1 to D6 are in `docs/plans/proposals/code-quality-triage.md`.

- In progress, no task: problem 1, the Authorization header on the plan held in React state. Branch `fix/plan-without-token`.
- The owner answered D1 to D6 on 2026-11-13, all as recommended; the answers are at the top of the proposal.
- Tasks after the answers: P0-14 (the boundary lint reads the code again; runs next), P0-15 (the missing guards in CI), P0-16 (a hooks lint and unused-code flags), P0-17 (the macOS surface compiled in CI).
- Tasks now: P3-31 (the native player's reason reaches the viewer), P2-07 (the gateway's small inconsistencies), P2-08 (split `gateway.ts`), P2-09 (move the player view out of `src/components/`), P2-10 (routes and the sign-in guard in one place), P2-11 (typed errors from the native commands), P2-12 (a typed track selector and poisoned locks), P2-13 (the session lifecycle as an explicit state).
- Waiting for the coordinating agent: appending P3-31 to P4-01's `depends_on` (D5 A). It edits an existing task.

- ~~Run `pnpm typecheck:core`, `pnpm typecheck:integration`, and `pnpm test:no-test-engine` in CI (D1). `pnpm check` runs them; `.github/workflows/ci.yml` does not, so the shell-neutral core's DOM check and the test-engine guard hold only when someone runs `pnpm check`. Problem 4. S.~~ Taken by P0-15.
- ~~A TypeScript lint for hook dependencies (D2). No linter is configured, yet two `eslint-disable-next-line react-hooks/exhaustive-deps` comments exist (`src/features/player/chrome/player-sheet.tsx:37`, `src/features/shared/ambient-backdrop.tsx:61`). Problem 4. S to M; the number of findings on the first run is unverified.~~ Taken by P0-16.
- ~~Turn on `noUnusedLocals` and `noUnusedParameters` in `tsconfig.app.json` (D3). `tsconfig.integration.json` has both. Problem 4. S; the number of findings is unverified.~~ Taken by P0-16.
- ~~Compile and lint `src-tauri/src/surface/macos.rs` in CI (D4). Every job runs on `ubuntu-22.04`, so its 331 lines and its `unsafe` blocks are never compiled, while `src-tauri/Cargo.toml` says "for Linux and macOS". Problem 4. S if it compiles today, which is unverified.~~ Taken by P0-17.
- Add P3-31 to P4-01's `depends_on` (D5). It edits an existing task, so the owner or the coordinating agent applies it.
- `src/app/compose.ts:15` imports the e2e engine from `src/test/` into the composition root. The guard that keeps it out of a build (`pnpm test:no-test-engine`) runs in `release-appimage.yml` and in `pnpm check` only. D1 A covers it; if D1 is declined, load the engine so the composition root does not import test code. Problem 6. S.
- `ensure_numeric_locale` accepts a data race in its `SAFETY` comment (`src-tauri/src/player/version.rs:25-32`): `setlocale` runs after other threads exist. Check whether the call can become a read that only fails the launch when the locale is wrong. Smaller points. S.
- A check that fails on a source file over about 400 lines (`WORKFLOW.md`, Mechanical enforcement backlog, "File size"). The review found `gateway.ts` at 955, `coordinator.ts` at 476, and `use-playback-session.ts` at 434. Goes with the linter if D2 adds one. S.
- Drop the `#/next` prefix from every route once P2-10 has put the routes in one module. The proof-of-concept screens it kept apart are deleted. Not a finding of the review; noted by the triage. It moves every e2e journey and deep link. S to M.
- Check `docs/security.md` lines 9 and 30 against the code when `fix/plan-without-token` lands: line 9 does not say the plan was held in component state, and line 30 says the browser player "never receives the header" while it was handed the whole plan. Problem 1. S.
- ~~`pnpm lint:boundaries` cruises 0 modules and still exits 0 (D6). dependency-cruiser 18.7.2 supports TypeScript below 7, and `7cfa705` (2026-11-12) moved the app to 7.0.2, so the lint for invariant I8 and the `DOMAINS.md` layer rules has read no file since. Found by the triage when it ran `pnpm check`; the review lists the lint under "done well". Make it fail on zero modules, then give it a compiler it can use. Do it before P2-08 and P2-09, which rely on it. S to M.~~ Taken by P0-14.
- Review what the first pass did not read: the catalog views, the shared UI primitives, the HLS validator, the surface code, the e2e specs, and the CSS. The review ran nothing, so a second pass should also run the checks. M.

- `.ui-dialog-title` sets a literal `font-size: 1.5rem` (`src/features/shared/ui/overlays.css:56`; 36 px on TV, documented in DESIGN.md §4 and §7.16); move it to a token. Found in P13-34. S.
- Drop the `typescript-6` alias, `scripts/depcruise-typescript-6.mjs`, and the Dependabot ignore once a dependency-cruiser release supports the app's TypeScript 7 minor; 18.8.0-beta-2 supports `>=7.1.0 <8`, the app is on `~7.0.2`. P0-14. S.

## Flaky e2e: Back keys (found 2026-11-13)

- ~~`e2e/back-keys.spec.ts` fails intermittently in full `pnpm test:e2e` runs, on task branches and on main (different tests each time: ":89 Backspace closes the unencrypted-connection dialog", ":20 Backspace and Escape go back from item detail"). Each passes 5/5 alone with `--repeat-each 5`. It looks load-dependent; the cause is unverified. Find the race (as P13-14 did for three journeys) and make each test wait for the state it depends on; never weaken an assertion. Evidence: the P0-14 runs in `tasks/prd.json`. S to M.~~ Taken by P0-18.
- ~~Also from the P0-14 runs: `FLUSTER_E2E_PORT` collides when port+1 is taken, because the web server uses both ports. Pick both ports free, or document it. S.~~ Taken by P0-18.
- From the P0-14 review (lows): `scripts/lint-boundaries.mjs:82` passes the violation count as the exit code, so exactly 256 violations exit 0 (use `exitCode > 0 ? 1 : 0`). The success line's `n/n source files` restates the coverage check rather than measuring it. Whether the Dependabot ignore for the `typescript-6` alias applies is unverified. S each.

## From P13-23 (Player Engine stream facts)

- libmpv2 5.0.3 drops a `PropertyChange` whose format is `MPV_FORMAT_NONE` (`libmpv2-5.0.3/src/mpv/events.rs:267-270`), so an observed property that becomes unavailable (audio disabled, `demuxer-cache-time` after a cache reset) keeps its last value in the snapshot. The existing diagnostics already behave this way. Decide whether to clear stale values on `AudioReconfig`/`VideoReconfig` or patch the binding. S.
- `diagnostics.videoCodec` (the long description) and the new `video.codec` (short name) overlap; so do `diagnostics.width`, `height`, and `bitDepth` against `video`. Merge them without breaking `src/lib/player/last-decode.test.ts`. S.
- Show the Dolby Vision gamma next to the profile in the Info sheet if the human wants to tell "DV signalled" from "DV rendered". P13-23. S.

- P13-24 follow-ups: restore focus to the hero's Resume or More info, the series header's primary action, and the detail action bar's buttons after Back (they open as today). S.
- P13-24 follow-up: restore focus after auto-play next. `use-auto-play-next.ts` replaces the player entry and drops its state, so leaving a second episode replaces the route with its detail page instead of going Back. S.
- P13-24 follow-up: restore scroll position for screens that have no restorable card. S.
- P13-24 note: a card restored on a TV screen can sit inside the bottom title-safe inset when the page scrolls to it, because scrolling content has no bottom scroll padding. The TV journeys therefore bound the vertical position by the window, as `expectTitleSafe` does. Needs a design call on a scroll inset. S.
- P13-24 review low: `e2e/tv/browse.spec.ts` (Home) and `e2e/tv/detail.spec.ts` (Series) replaced two existing assertions (hero primary focused after Back; series primary focused plus two ArrowDown presses) with assertions on the restored card or row. This is the specified new behaviour, but the diff is not additions only; the human should confirm. S.
- P13-24 review low: `src/features/shell/focus-return.ts` `remember()` deletes the entry's record on any focusin in main that is not a restorable item. If a screen focuses a non-card element during a pending return, a second Back to that entry restores nothing. Safe failure, unlikely. S.
- P13-24 review low: `src/features/shell/use-focus-return.ts` gives up after 10s and forces focus to the same index or the deferred default. No test covers the slow-network path end to end (unverified); manual WebKitGTK checks are untested. S.

## From P3-22 (preferences store)

- P3-22 review low: `src/lib/browser-preference-store.ts:49-62` (`migrate`) and `:73-85` (`update`): when `setItem` throws and the legacy key is present, the subscriber's `get()` re-runs `migrate()` and overwrites a just-set limit with the legacy values. Add a migrated or dirty flag so `migrate()` skips the legacy key once memory has been written. S.
- P3-22 review low: with blocked storage, `update()` writes only the changed key to memory while `get()` reads other keys from the memory defaults. Add a two-field, blocked-storage test when P3-23, P3-24, or P3-26 add a second preference. S.

## From P13-30 (contrast report)

Measured by the worst-case artwork captures; see `docs/design/contrast-report.md` for every ratio. The measurement removes text shadows, so a failure may be text that a text-shadow keeps legible; check that before adding a scrim (P13-33). The Home hero, Home card, detail, and series captures have no failing text run. All failures are in the player (`104-worst-art-player`, `105-worst-art-up-next`) at both sizes, where the chrome text sits on the bright still without a scrim.

- ~~Player header series name ("Harbor Lights", 13 px): 2.02:1 at 1440x900 and 1.88:1 at 1920x1080 against 4.5:1 needed. Give the player's top chrome a scrim that guarantees 4.5:1 over bright art (DESIGN.md section 11 rule 1). S.~~ Taken by P13-33.
- ~~Player header episode line ("S1 · E2 The Keeper's Log", 22 px, below the 24 px large-text size): 2.64:1 and 2.60:1 (104), 2.60:1 and 2.55:1 (105, "S1 · E1 Landfall"), against 4.5:1. Same top scrim as above. S.~~ Taken by P13-33.
- ~~Player scrub bar times (elapsed and remaining, 14 px): 1.27:1 to 1.82:1 across 104 and 105 at both sizes, against 4.5:1. The bar sits above the bottom controls with no scrim behind the times. Same fix as the top scrim, for the bottom chrome. S.~~ Taken by P13-33.
- ~~Player "Ends at" label and clock ("Ends at", "01:41 PM" / "12:00 PM", 14 px): 1.01:1 to 1.38:1 at both sizes, against 4.5:1. This is the `--text-3` line in P13-33 ("brighten text over video", `docs/plans/proposals/ux-audit.md:405`); no new task, check the P13-33 result against these captures. S.~~ Taken by P13-33.
- P13-33 low: `PlayerLoading` text over the item's backdrop at 40% opacity on `--void` (`player.css` loading rules): over white art `--text-2` is about 2.2:1. Not video, no worst-art capture. S.
- P13-33 low: scrub preview chapter name (`--text-2`) on `--veil` (0.6) over a bright trickplay tile is about 2.3:1 over white. Needs a darker caption veil or `--text-1`. S.

## PR #165 guardian lows (fullscreen-exit resize, 2026-11-14)

- The GTK layout test uses a `DrawingArea` in place of the real `WebKitWebView`. If WebKitGTK ever reports a non-zero minimum size, the WebView could overflow again with no failing test. Manual check F3 covers it for now. S.
- For about one frame after the window shrinks, the video `GLArea` keeps its old size until the frontend's ResizeObserver sends the new frame; GTK clips it. Cosmetic. S.
- `PlayerSurfaceFrame::validate` (`src-tauri/src/model.rs:92-104`) has no upper bound. A frame near `i32::MAX` overflows `allocated_width().max(1) * scale` (`linux.rs:111-112`): debug builds panic in a GTK callback, release builds wrap. Only the trusted WebView sends frames, so bound the frame in `validate`. S.
- Leaving fullscreen or maximize relies on GTK's saved or default window size (1280×820). Untested on compositors other than the owner's (umbriel). S.

## From P13-29 (track labels and spoken time)

- The `Picker` trigger and rows elsewhere (the "English · TrueHD 7.1 ▾" trigger of DESIGN.md §7.10); there is no track Picker trigger in the player today. (P13-29)
- The OSD line for `c` (`Subtitles: {title}`, `use-player-keys.ts`) still uses the raw title; it could use `trackRow().name` and detail. (P13-29)
- ~~Carry the audio and subtitle choice to the next episode (P15-07). (P13-29)~~ Already P15-07.
- DESIGN.md §11 wording for spoken slider values (audit A11); waits for the owner. (P13-29)
- Add DESIGN.md §10 copy rows for "Loading tracks…" and "No audio tracks to choose from." for the docs sync. (P13-29)
- Add codec, channels, and flags to `PlayerTrack` in Rust for unmapped mpv tracks (a native change). (P13-29)
- ~~Audio-description labels (wishes W27, decision D6). (P13-29)~~ Already P15-12.
- After a converted track choice renegotiates, keyboard focus does not return to the Audio & Subtitles trigger on Escape (seen in the TV e2e). (P13-29)

## Post-merge guardian review of #158 (P3-31), 2026-11-14: verdict sound, three lows

- ~~`src/lib/player/coordinator.ts:336`: a failed stop after "ended" stores `redactedErrorMessage(error)` (only `redactText`) in session state, so file paths and hosts can reach state. That contradicts P3-31 acceptance 5. The screen stays safe (`playbackErrorCopy` applies `safeReason`), and today's native stop errors are fixed strings. Fix: `errorReason(error, "The player did not finish shutting down.")`. The native "error" event path (`:304`) has the same issue, predating P3-31. S.~~ Taken by P0-19.
- ~~**Tighten the text filters, with canary tests.** Now that more native text reaches the screen, `redactText` and `safeReason` should catch these forms, all proven with a probe:~~ Taken by P0-19, with the four forms listed below.
  - credentials separated by a space (`PlaySessionId abc123`, `X-Emby-Token abc123`, `Authorization MediaBrowser Token abc123`; `src/lib/redact.ts:24-27` needs `:` or `=`);
  - bare `host:port`;
  - single-segment paths, Windows paths with forward slashes, and UNC paths (`src/features/player/safe-reason.ts:4-7`);
  - IPv6 URLs, which leave the port and route visible.

  Rust's `safe_error` collapses these on the native side today, but non-native engines and future native text can reach the filters. S to M.

## Visual baseline accept script (found in P13-24, 2026-11-14)

- ~~`pnpm test:visual:accept <run-id>` also rewrote three captures that had not failed (`14-home-keyboard-focus`, `15-nav-keyboard-focus`, `85-ui-gallery-dialog-picker`); the agent reverted them by hand. Either the script copies every capture instead of only the failing ones, or those three render slightly differently between runs. Make accept copy only the failed captures, and investigate determinism for the three. S.~~ Taken by P0-18.

## Dependabot alert 34: glib 0.18 unsoundness (RUSTSEC-2024-0429), 2026-11-14

- `glib 0.18.5` is pulled in by `gtk`, `gdk` and `webkit2gtk` 0.18 (Tauri 2's GTK3 stack on Linux). The fix is in glib 0.20, which needs the GTK4 stack; Fluster cannot bump it alone. Fluster does not call `glib::VariantStrIter` (grep of `src-tauri/src`, 2026-11-14), so the unsound path is not reached by our code; reach through Tauri or WebKitGTK is unverified. Revisit when Tauri moves to GTK4; decide whether to dismiss the alert with this reason (owner call). S.

## Flaky `rust-audit` on a Dependabot PR (#149, 2026-11-14)

- `rustsec/audit-check` found no vulnerabilities but failed with `Not Found - https://docs.github.com/rest/checks/runs#update-a-check-run` while posting its check run. A rerun of the same job passed. If it recurs, run `cargo audit` directly in the job instead of the action, which needs no check-run API. S.

- Cap kept browse data per account if memory grows; every visited screen is kept for the whole session (P13-31).
- After sign-in, return to the route that sent the visitor to sign-in, so a reload keeps the place (P13-31).
- A card restored from kept data that leaves in the background refetch moves focus to the same place in its row; a screen whose first card is a hero or a tile has no such fallback yet (P13-31).
- A fresh nav-bar visit to a library shows every default-sort page that was loaded earlier, at the top; confirm in the design review that this fits DESIGN.md section 9 "A fresh visit never restores" (P13-31).
- Kept queries never expire (`ACCOUNT_GC_TIME = Infinity`): search terms, deep infinite libraries, and per-title detail grow without bound in a long session, and a stale kept infinite query refetches every loaded page on Back. Cap or expire them (P13-31 review).
- `dropOtherAccounts` also removes active unscoped queries such as `["player","server-name",origin]` and `["media-segments",...]` if an account change lands while one is mounted; the effect is a brief refetch. Scope those keys or exempt them (P13-31 review).
- `useAccountChanged` resets in an effect after the new gateway renders, so a direct account A to B swap briefly renders B's screens with A's data still cached (B uses its own scope, so nothing crosses; read, not run). Reset before render (P13-31 review).
- The account reset runs only when the gateway object changes. A future re-auth or switcher path (P3-02, P3-20, P13-21) that logs in another user on the same gateway would skip it; document that a gateway is single-user or also key the drop on the user id (P13-31 review).
- `window.scrollTo({ behavior: "instant" })` in `focus-return.ts:141`: WebKitGTK support is unverified and a TypeError would lose the remembered scroll. Use `"auto"`, which behaves the same under `base.css:154` (P13-31 review).
- ~~Re-check `e2e/tv/detail.spec.ts:46`, which failed in two earlier full e2e runs under load and passed alone and in a third run; it may be a real race (P13-31 review).~~ Taken by P0-18.
- Run the design checklist against fresh captures and compare them with the PR's before and after screenshots; the diff changes no markup or styles (P13-31 review).
- A server event refetch can flicker an in-flight optimistic flag, because `markAccountDataStale` refetches the open detail while a toggle is pending (`use-flag-mutation.ts:55-56`) (P13-31 guardian).
- An exact-card return falls back to the row index when the page is shorter after a resize; the card's own id is then not found until the pages load (P13-31 guardian).
- `useFocusReturn` waits on `useIsFetching()`, which counts every query, so settling can wait up to `RETURN_WAIT_MS` behind an unrelated fetch (P13-31 design review).
- Sort and filter changes use `replaceState`, so Back leaves the library instead of undoing a filter. Intentional; noted in the PR text (P13-31 design review).
- ~~Local `pnpm test:visual` runs flake when the host network changes mid-run (Docker adds or removes a veth interface): Chromium aborts in-flight dev-server requests with `net::ERR_NETWORK_CHANGED`, the sign-in page never renders, and a random scenario times out at `e2e/visual/scenario-helpers.ts:28`, then passes on retry. Seen in three full runs on task/P13-31; traces and `journalctl` confirm. Consider launching the visual and e2e Chromium with network-change notification off, or running against a built preview. S (P13-31 verify).~~ Taken by P0-18.

## Discovery fixtures follow-ups (P16-01, 2026-11-15)

- Record `nextUpDateCutoff` for a series that gains a whole new season, not only a new episode in an existing season; P16-01 recorded the second case only. S (P16-01).
- On 12.4.0 `POST /Collections?ids=` creates an empty collection; a client or recorder must follow it with `POST /Collections/{id}/Items`. Re-check on newer 12.x images and carry it into any collection-creating gateway code. S (P16-01).
- 10.11.7 has no `GET /Items/{itemId}/Collections` (404); the sequel rule needs a client-side join of collections and their members there. Plan it in the sequel task (P16-01).
- Make the recorders' numbered `id-N` fakes stable across recordings (seed them in a fixed order), so a re-record diffs cleanly. S (P16-01).
- `pnpm test -- fixtures` runs the whole Vitest suite, because vitest receives `-- fixtures` as an argument it does not treat as a filter; the task's `verify` string passes but proves less than it reads. Use `pnpm exec vitest run <file>` or fix the script. S (P16-01).
- Jellyfin's NFO reader skips season and episode numbers for an episode added under a series that has `lockdata`; Fluster's own library tests may meet the same. Unverified outside the fixture servers (P16-01).
- Review lows (P16-01): add a `Path` allow-list (`/media/`) to the fixture scrubbing test; `tests/fixtures/jellyfin/*/discovery-suggestions.json`, `discovery-local-trailers.json`, `discovery-special-features.json` keep the CI container's sample paths. S (P16-01).
- Review lows (P16-01): `docs/research/discovery-api.md` §1 rows marked "Same." compare item names and counts, not field shape; a later gateway task must not rely on identical fields across versions without a diff. S (P16-01).
- Review lows (P16-01): `tests/integration/record-fixtures.mjs` was refactored onto `fixture-recording.mjs` and checked only with `node --check`; re-run it against both servers to confirm behavior. S (P16-01).
- Review lows (P16-01): `record-discovery-fixtures.mjs:334` `makeSave()` builds a new scrubber and resets the `id-N` counter mid-recording, so the Next Up new-episode files reuse numbers (`id-57` vs `id-1`, and `id-1` is an image tag in `discovery-similar-movie.json:25`). Keep one scrubber or add `item-episode-3` to its known-id map. S (P16-01).
- Review lows (P16-01): `src/lib/jellyfin/discovery-fixtures.test.ts:100` credential scan is weaker than `fixture-recording.mjs:107`; match the saver's pattern with the `i` flag and `(?:=|%3D)`. S (P16-01).
- Review lows (P16-01): `record-discovery-fixtures.mjs:338-342` `finally` calls `waitFor` unguarded and the final `resetUser()` at line 344 sits outside any `finally`; a killed run leaves `Synthetic Show S01E03.mkv` in `tests/samples/shows/` and watch state on `fluster-discovery`. Remove a leftover copy at recorder start. S (P16-01).

## Hooks lint follow-ups (P0-16)

- The `typescript-6` alias and `scripts/typescript-6-resolve.mjs` now also serve `@typescript-eslint/parser` (peer `typescript <6.1.0` at 8.72.2); drop them only when both dependency-cruiser and typescript-eslint support the app's TypeScript 7 minor. Supersedes the P0-14 entry's condition. S (P0-16).

## Detail page: cut the subtitle list down to the viewer's language (owner, 2026-11-15)

- ~~Seen on the dogfood server: "File and streams" (`src/features/detail/file-and-streams.tsx`) lists every subtitle track on its own line; a film with 52 subtitle tracks fills the screen.~~ Taken by P17-02.
- Owner decisions:
  - ~~Show only the subtitle tracks in the viewer's Jellyfin preferred subtitle language (the user configuration's `SubtitleLanguagePreference`; Fluster does not read it today, so the gateway needs it, e.g. from `/Users/Me`).~~ Taken by P17-02 (the read) and P17-03 (setting it in Fluster).
  - ~~When no preference is set, or the file has no track in that language: show the file's default subtitle track if it has one, plus a line like "51 more in 32 languages"; with no default either, only the count line.~~ Taken by P17-02.
  - ~~A "Show all 52 subtitles" button expands the full list in place (keyboard and TV form included).~~ Taken by P17-02.
- Open: whether the audio list gets the same rule (not asked yet). M. Asked as L1 in the 2026-11-15 product-review pass and answered the same day: an audio dropdown on the page that Play uses. Taken by P17-08.

## Product review pass (2026-11-15)

The triage of every entry added since 2026-11-13, issue #178, and the detail-page subtitle decisions is in `docs/plans/proposals/product-review.md`, "Product review pass, 2026-11-15".

- Tasks now: P0-18 (repeatable end-to-end and visual runs), P0-19 (text filters and a failed stop's reason), P17-01 (account-language fixtures), P17-02 (the detail page's subtitle list), P17-08 (an audio Picker on a title's page that Play uses; owner, L1), P17-03 (languages in Settings; owner, L3 A and L4 A).
- Tasks that wait: P17-04 (a pinned jellyscale server; jellyscale's JS-116 to JS-120 and a published image), then P17-05, P17-06, and P17-07 behind it (P17-07 also waits for L5 and L7).
- Notes for specs, which edit no task. Each stays an entry above until its task's pull request closes it:
  - P3-20 (switch accounts): the account reset runs only when the gateway object changes, and `dropOtherAccounts` and `useAccountChanged` have the three P13-31 review lows above. P3-20's acceptance already says no screen shows the previous account's data; its spec should name these.
  - P2-06 (libmpv2 7): re-check whether a `PropertyChange` with `MPV_FORMAT_NONE` is still dropped before deciding the P13-23 entry above.
  - P2-12 (track selector and poisoned lock): bound `PlayerSurfaceFrame::validate` in the same native pass (PR #165 low above), and consider the unmapped-track fields from P13-29.
  - P13-19 (design audit and docs sync): the `.ui-dialog-title` literal size, the two P13-33 contrast lows, the DESIGN.md §10 rows from P13-29, the spoken-slider wording, and the P13-31 "fresh visit" check are all its kind of finding.
  - P16-11 (wish-list fixtures): it uses the same recorder; take the P16-01 recorder lows above (one scrubber, stable `id-N`, the `finally` cleanup, the `Path` allow-list) while it is open. Its `verify` string has the `pnpm test -- fixtures` weakness; the new fixture tasks name their test file instead.
  - P15-07 (remember tracks per series) and P15-12 (audio description): both read "the preferred language". After P17-03 that is the language set in Fluster; on jellyscale a remembered or described track may be hidden, and P17-07 always lists the playing track. P15-07's acceptance says "Jellyfin account preferences"; that wording still holds, because P17-03 saves to the account.
- Found by this pass:
  - Ask jellyscale for a partial update of the user configuration, or a version check that refuses a stale save. `POST /Users/Configuration` replaces the whole object, so two apps saving at once can overwrite each other; P17-03 narrows the window with a fresh read but cannot close it. Asked in a comment on hankandre/fluster#178; not yet filed in jellyscale's tracker. S (P17-03).
  - Ask jellyscale for a published, versioned image and the Babel Film fixture in a form Fluster's CI can fetch or generate. `scripts/generate-samples.sh` cannot make its PGS track, because ffmpeg cannot encode PGS (P0-03). Not yet filed. S (P17-04).
  - ~~If the owner answers L1 with "the same rule for audio", the detail page's audio list needs a follow-up task; P17-02 does subtitles only. S.~~ Answered 2026-11-15 in the owner's own words: an audio dropdown that Play uses. Taken by P17-08. The audio lines in "File and streams" stay whole.
  - How long an audio pick on a title's page lasts is question L8; P17-08 is written for "while the page is open". S.
  - The glib 0.18 alert (entry above) was dismissed by the owner on 2026-11-14; only the revisit when Tauri moves to GTK4 remains.
  - P17-02 fixes a problem the owner saw on the dogfood server. Adding it to P4-01's `depends_on` edits an existing task, so it is the owner's or the coordinator's call. S.

## Home window follow-ups (P16-02, 2026-11-15)

- Jellyfin 10.11 has no `GET /Items/{id}/Collections`, so Home's sequel rule (Up next rule 2) is skipped there and the hero falls to Similar. Add a client-side join (list collections, fetch each one's members until the finished film is found; up to N + 1 extra requests on an empty-row Home, one more recorded fixture). S (P16-02, owner Q3 A).

## Player sheet focus fix (#174) review lows, 2026-11-15

- `player-sheet.tsx:47`: the TV-form Up/Down step calls `next.focus()` without `preventScroll`; pressing Down within the slide-in could repeat the sideways jump. A scrolling focus may be what brings the next row into view, so check before changing. S.
- `info-sheet.tsx:89`: `closeButton.current?.focus()` after "Play original" has no `preventScroll`; harmless after the slide, but inconsistent. S.
- `player-sheet.test.tsx`: the test checks that some focus call used `preventScroll`, so a second, scrolling `focus()` would not fail it; the `initialFocus` ref path is untested. A Playwright check that `.player-page` `scrollLeft` stays 0 while a sheet opens would cover the real jump. S.
- The UI gallery page (`88-ui-gallery-player`) is 1754 px wide at a 1440 px viewport, so it overflows sideways. The old baseline also showed the sheet focus scrolling it 59 px (the fixed "Browser development mode" badge moved); #174 accepted the corrected capture. S.
## Text filter follow-ups (P0-19, 2026-11-15)

- A secret with no digit and under 20 characters after a space (`password hunter`) is not redacted; redacting it would also redact "token expired". S (P0-19).
- Over-redaction by the new filters: "Invalid token (401)" becomes "Invalid token [redacted]", and any `word:NNNN` or `word:NNNNN` becomes `[address]` (`pts:12345`, `bitrate:8000`, `code:12345`, `Failed to open file.mkv:1234`). A single-label host with a one- to three-digit port (`nas:80`) stays visible. S (P0-19).
- `safeReason` does not hide a bare host or IP address with no port, or a path that follows a colon with no space (`open failed:/home/u/x`). S (P0-19).
- The reporting warning reaches state through `redactText` only (`use-playback-session.ts:209`); the screen filters it with `safeReason`. Route it through `errorReason`. S (P0-19).
- The `core-is-shell-neutral` rule's `from` list in `.dependency-cruiser.cjs` names neither `src/lib/safe-reason.ts` nor `src/lib/redact.ts`, so lint would not stop a later shell import there. S (P0-19).
- `safeReason` shows part of an IPv6 zone-id address or a credential: `connect [fe80::1%eth0]:8096 failed` is unchanged (the bracket class has no letters past hex, so `eth0` cannot match); a bare `fe80::1%eth0:8096` becomes `fe80::1%[address]`; a bare `user:pass@host:8096` with no scheme becomes `user:pass@[address]`, still showing the credential. S (P0-19).
- `safeReason` hides only part of a path that contains a space: `cannot open /home/u/My Movie.mkv now` becomes `cannot open [path] Movie.mkv now`, and `c:\Program Files\x` becomes `[path] Files\x`, so filename fragments reach the screen. `origin/main` already behaved this way. S (P0-19).


## E2E and visual repeatability follow-ups (P0-18, 2026-11-16)

- Check the Chromium source for revision 1254 (158.0.8127.18) for a switch or feature that stops `NetworkChangeNotifier` from aborting loopback requests, so local runs would not need `scripts/netns.sh`. The binary's strings show no such switch; this is unverified. S (P0-18).
- The visual `results.json` records `config.argv` and attachment paths, which are runner-local paths. They hold no tokens, but strip them in `scripts/visual-accept.mjs` consumers or the reporter if the artifact is ever shared outside the repo. S (P0-18).
- Harden the e2e and visual tooling lows from the P0-18 review: confirm every `openItem` caller in `e2e/back-keys.spec.ts` passes its item's title; make `scripts/visual-accept.mjs` refuse positional-file, `--project`, and two-token `--grep-invert` runs; probe `::1` and `0.0.0.0` in `scripts/e2e-ports.mjs`; clear `FLUSTER_E2E_PORTS_CHECKED` after the config's first use and ignore an inherited value. S (P0-18).

## Player page clip fix and Home checkmark follow-ups (2026-11-16)

- CI cannot run Playwright WebKit (the host lacks libicu74 and libxml2), so `e2e/player-sheet-scroll.spec.ts` runs in Chromium and imitates WebKit's late scroll-to-focus. Add a WebKit project, or a WebKitGTK smoke job, so the real engine is checked. S.
- `player-sheet.tsx:58` returns focus to the opener with a plain `focus()`; with `.player-page` clipped it can no longer scroll the page, but other scroll containers on that path would still be scrolled. Consider `preventScroll` there too. S.
- `e2e/` is outside ESLint's scope ("File ignored because no matching configuration"), so specs are never linted. S.
- The e2e mock marks every episode 1 played (`e2e/support/mock-server.ts:185`), so Home's Next up card for "Perigee" shows a played checkmark in `19g-home-continue-merged`. Fix the fixture, and decide whether Continue watching cards should ever show the played badge (a Next up episode marked played can come from a rewatch). S (P16-02).

## Account-language fixtures follow-ups (P17-01, 2026-11-16)

- Split `scripts/generate-samples.sh` (about 470 lines) by sample family (movies, shows, staging, verify) so CI's sample step stays readable. S (P17-01).
- `record-fixtures.mjs` and `record-discovery-fixtures.mjs` do not reproduce the committed fixtures on a fresh server (numbered `id-N` values, online-matched titles, `DateCreated`); even two runs in a row differ in `DateCreated` of the staged episode and in the online-matched title of the HEVC film (`discovery-suggestions`, because that film has no locked NFO). Lock the HEVC sample with an NFO or normalize the dates in the scrubber so a re-record can be diffed. S (P17-01).
- The recorders log a user in on a fixed device id, so a second login as the same user ends the first token (seen when the language recorder logged `fluster-test` in twice). Note it in `tests/integration/` or give each login its own device id. S (P17-01).
- `ARCHITECTURE.md` §3 line 187 holds on both versions (recorded A2); no change needed. It could add that `OriginalLanguage` gives the file's default audio track on plain Jellyfin and that a `ger` preference matches audio tagged `deu`. S (P17-01).

## Detail subtitle list follow-ups (P17-02, 2026-11-16)

- Mark hearing-impaired tracks in the detail labels: `SubtitleInfo` has no hearing-impaired flag, so such tracks match by language and read like any other. The player's two-line labels (P13-29) already say "hard of hearing". S (P17-02).
- Add a "Show fewer" control after the full subtitle list is expanded. Not asked for. S (P17-02).
- Split `src/lib/jellyfin/gateway.ts` along domain lines; it was over 1000 lines before P17-02 and gained two short reads. S (P17-02).
- Tracks that jellyscale hides (L6) are covered by P17-05 to P17-07; the detail list counts only the tracks the server listed (P17-02).
- Detail subtitle list design lows: the expanded list's focus ring is a viewport-tall box; the quiet "Show all N subtitles" button's padding misaligns it by about 25px; the unreachable "Show 1 subtitle" branch in `format.ts`; no test for a failed `/Localization/Cultures` read in `account-languages.ts`. S (P17-02, see its spec "Review follow-ups").

## P17-02 follow-up review lows (#192, 2026-11-16)

- `.ui-button`'s 1px transparent border (`controls.css:14`) has no token, so `detail-page.css` repeats `1px` to align the quiet subtitles button. Add a border-width token and use it in both places. S.
- `e2e/tv/detail.spec.ts`: after collapsing and expanding the subtitle list again, the test does not re-run `expectTitleSafe`. S.
- Drop the dead `"components"` entry from the scanned directories in `src/features/sign-out-reach.test.ts:20` and the `src/components/` path in `.claude/skills/change-review/SKILL.md:22` (P2-09 removed the directory; agent-config pass).
- `.dependency-cruiser.cjs:53-75`: the three `no-components-*` rules overlap (import into, import out of, orphan). Collapse them if one rule can cover all three; probes show each fails `lint:boundaries` today, so there is no defect. S (P2-09).
- P17-01 recorder: add a "no matching track" cell for audio and subtitles (a chosen language the file lacks; `PlayDefaultAudioTrack: false` with no language; Smart or Always with no language). Settings shows those reads as "Set in another Jellyfin app" until recorded. S (P17-03).
- TV Picker sheet: page-wise jumps (PageUp/PageDown or letter rows) for the 486-language list on 12.4.0 and the doubled subtitle list. S (P17-03).

## Settings in the player (owner request, 2026-11-16)

- Owner: changing a client setting today means leaving playback, going Home, opening Settings, then starting again. Add a Settings sheet to the player beside Info, Audio & Subtitles, and Chapters. When a change affects the stream, Fluster refreshes the stream and resumes at the same position, keeping the current audio and subtitle tracks. Findings from 2026-11-16:
  - The streaming limits already renegotiate mid-playback while keeping the position and tracks (`use-playback-session.ts` `checkLimit`, `coordinator.ts` `renegotiate`/`restart`, `track-choice.ts` merge). The sheet can reuse that path.
  - The account audio and subtitle languages (P17-03) shape the server's starting tracks (P17-01 fixtures), so a change made in the player would need a renegotiation to take effect. Nothing applies them mid-playback today. Decide whether a language change in the player also switches the current tracks, or only applies from the next title.
  - The Continue watching window only affects Home and does not belong in the player sheet. Auto-play next and skip intros have no Settings rows yet (P3-23, P3-24). Once they exist they apply live, with no refresh.
  - Open design questions for the owner: which settings appear in the sheet, how it opens (button, key, TV remote), what the viewer sees during a refresh, and whether the full Settings page stays as it is.
  - Depends on P3-23 and P3-24 for the live settings. M to L.
