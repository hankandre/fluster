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
