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

- A PIN per profile on this device. Four other clients have one. Revisit with the TV shell (Q11). M.
- Recap, Preview, and Commercial segments with the same three skip modes (Q15). S.
- A "Still watching?" prompt (Q16). S.
- Audio sync offset and dual subtitles; each needs a typed player command (Q18). M.
- Live TV. Out until after M2; needs a decision record (Q28). L.

No decision yet.

- Remove an item from Continue Watching, and a watchlist. Top-voted Jellyfin requests; whether a client can do either on 10.11 or 12.x is unverified. S to check.
- New items appear without a restart (`LibraryChanged` on the server socket; P3-15 handles `UserDataChanged` only). S.
- A designed "server unreachable" state while browsing, with a way back when the server returns. M.
- A keyboard shortcut help sheet. S.
- A key that moves focus to the newest toast (`docs/design/rework-plan.md`, "Idea: a keyboard shortcut for toasts"). S.
- Playlists, extras and trailers, genre and people pages. M each.
- Remember a library's sort and filters between visits; write the sort into the URL. S.
- Hide filter chips a library cannot match (`/Items/Filters2`). S.
- The Home hero for a series plays its first episode; use `seriesNextUp` so it agrees with the series page (P13-10 follow-up). S.
- Cast (`PersonRow`) on the series page (P13-10 follow-up). S.
- A task that ships the Windows build after the P7-01 spike. L.
- A task that builds the TV shell after the P9-01 spike. L.
- Flatpak packaging and in-app updates. M each.
- Translations. L.

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
