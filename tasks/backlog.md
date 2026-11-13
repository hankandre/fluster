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
