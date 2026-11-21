# Product Owner log

One dated section per Product Owner pass, appended by the pass in the same commit that carries its `Product-Owner-Pass:` trailer. One line per decision: what, the backlog entry it came from, the owner approval path when `human`, `verify` or the wording, look or direction in `acceptance` changed, or "scope edit" for a scope-only acceptance edit, and why. The owner can veto any decision; the next pass reverts it and logs the veto.

## 2026-11-20

First pass: 98 backlog entries had no `taken_by`. Entries are named by their line number in `tasks/backlog.jsonl` and their `what`. `scripts/task-owner.mjs` marks an entry taken only through an add, so an entry an existing task already covers stays untaken and is listed below.

- Edited T2-04, acceptance item 2: on Android the header is built in Kotlin, and the core's builder serves the reference transport. Entry 88 ("Reword the acceptance items that conflict with decision 0005"). Approval: `docs/decisions/0005-token-boundary.md`. Why: the accepted decision says so in its own words, and T2-04 is two tasks from being picked.
- Edited T3-11, acceptance item 1: the image view also takes a session id. Entry 88. Approval: `docs/decisions/0005-token-boundary.md`. Why: the decision's registry gives the image view its authority by session id.
- Left T8-01's acceptance for the owner. Entry 88. Why: decision 0005 says both that the four session methods live in a session module of their own so `modules/player` keeps exactly the port's methods, and that T8-01's allowlist includes them; the two do not give one wording.
- No edit for T2-01's "docs/security.md updated in the same PR". Entry 88. Why: the task is done and the clean-slate PR met the item.
- Added T3-16 after T3-05 (the native request refusals, the echoed-token filter, the Kotlin header vector, the log-call source check, the release inspector check). Takes entry 88, because it gives `kotlin_header_matches_the_recorded_vector` its home; it also covers the half of entry 87 whose code exists once T3-05 lands. Why: `docs/security.md` lists these tests as planned with no owning task.
- Added T4-08 after T4-05 (sign-in result without a token field, a confirmed 401, an unreadable record, no canary in JavaScript state). Takes entry 87 ("Write the decision 0005 tests that no task's acceptance covers yet"). Why: these need the encrypted store and a sign-in flow, so one task after T3-05 could not be picked; entry 87 is split by where the code under test lands.
- Added T3-15 after T3-03 (app-wide cleartext on Android, the classifier as the only gate). Takes entry 89. Why: decision 0001 on Android needs it and no task built it; a private-LAN HTTP server cannot be reached without it.
- Added T2-10 after T2-04 (core boundary checks). Takes entries 103, 104, 105 and 51 ("Make scripts/lint-boundaries.mjs exit 1 for any violation count"). Why: four small gaps in the same check; after T2-04 the core's dependency list is short enough for an allowlist.
- Added T9-07 before T9-06 (gaps in safeReason and the text filters). Takes entries 66, 67, 68 and 69. Why: each has an example that shows a host, a path or a credential on screen, and T9-06 is the first screen that shows redacted diagnostics.
- Left entry 65 ("Redact a secret with no digit and under 20 characters after a space"). Why: the entry itself says the rule would also redact "token expired"; no rule separates the two yet.
- Left entry 101 (repoint the T2-06, T3-03 and T8-08 acceptance items to `packages/core/tests/fixtures/`) for the owner. Why: no approval file names those tasks; `docs/specs/decisions-T2-02.md` names T2-02 only. The owner's approval file lets the next pass make the edit.
- Left entry 102 (refresh the vector files' description strings). Why: it waits for the next vector regeneration, by its own wording.
- Left entries 92 and 98 (prd rules 16 and 9) for the owner. Why: a pass has no operation for `rules`.
- Left entries 96 and 97 (who writes specs; who approves scope-level acceptance edits) for the owner. Why: both change the process the owner set.
- Left entries 94, 95, 99 and 100 (test-first flow gaps in CI) for a later pass. Why: a todo in phase T1 would be picked before T2-03; entry 94 waits on in-flight branches whose state this pass did not verify, entry 95 needs the PR body in a merge_group run, and the task run already pins the frozen blobs. Revisit at the first reopened task or when T2 is done.
- Left entries 83, 84 and 85 (task workflow gates) and 93 (GitHub's conflict check and merge=union) for a later pass. Why: small workflow fixes that block no task today; they can share a task with the entries above.
- Left the feature wishes for phase T12: entries 2, 4, 5, 7, 8, 10 to 19, 22 to 24, 26 to 30, 32 to 38, 40, 41, 44, 74, 77, 79 and 80. Why: PRODUCT.md and T12's goal build later items from use and evidence after release; nothing before T11 depends on them, and several need look or wording decisions that are the owner's.
- Left entries an existing task already covers: 9 (server unreachable: T5-04, T10-04), 21 (Favorites row: T12-02), 39 (settings follow the account: T9-01), 45 (TV platform rules: T11-02), 46 (key-to-focus time: T3-12). Why: no new task is needed and the tool cannot mark them taken; each task's spec should read its entry.
- Left the accessibility entries 31, 47 and 48 (TalkBack audit, spoken slider values, row hints). Why: they need screens that do not exist yet; T11-02 already requires a screen reader to announce each screen, and the audit belongs after T10-05.
- Left the Jellyscale requests, entries 20 and 63. Why: neither blocks a task before T12-06 or T9-04, and a request is filed only with evidence of a near-term need.
- Left the mpv entries 90 and 91 for phase T13. Why: libmpv returns in T13 and no task before it loads a stream through mpv.
- Left the fixture recorder and server-fact entries: 53 to 62, 70 to 73, 75, 76, 78, 81, 82 and 86. Why: each is a low finding from a desktop task about recorders or server behaviour that T2-08, T2-09, T8-10, T8-12 or T9-04 will touch; several name `src/lib/` paths that moved, so the task that next touches the code should re-check them first.
- Left entries 49, 50 and 52 (400-line check, the typescript-6 alias, account reset on a shared gateway). Why: 49 is a process check with no evidence yet of large files in the new layout (unverified; the entry's example is the desktop gateway), 50 waits on upstream releases, and 52 depends on how T2-04 and T4-06 key a gateway to a user, so their specs should read it.
- No reorder and no drop of an existing task.

## 2026-11-21

Owner-approved edits, applied directly in one pull request (not a Fable pass). The owner approved each of them on 2026-11-21. Entries are named by their line number in `tasks/backlog.jsonl`.

- Edited T3-03, acceptance item 6, and T8-08, acceptance items 1 and 3: the shared vectors are `packages/core/tests/fixtures/hls-master-urls.json`, `hls-playlists.json` and `host-classes.json`. Entry 101, marked taken by T3-03. Scope edit. Why: T2-02 moved the files unchanged and the root folder is gone. T2-06 is done and keeps its wording.
- Edited T8-01, acceptance item 1: two allowlists, one per native module; the player module's is exactly the PlayerEngine port's methods, the session module's is exactly `signIn`, `request`, `restoreSessions`, `endSession` and `sessionEnded`. Entry 88's T8-01 part, which the 2026-11-20 pass left for the owner. Approval: `docs/decisions/0005-token-boundary.md` (amendment of 2026-11-21). Why: decision 0005 contradicted itself; the owner chose two lists.
- Edited prd rule 8: the Product Owner approves scope-only acceptance edits and logs the reason; wording, look or direction edits need an owner approval file; the owner can veto any of it. `scripts/task-owner.mjs` gained `scope` for this. Entry 97 decided, marked taken by T1-12. Why: the owner adopted it.
- Edited prd rules 9 and 16: dropped "(the Product Owner flow, T1-12)" and "(tasks/backlog.jsonl once T1-10 lands)". Entries 92 and 98, marked taken by T1-12. Why: both flows have landed; a pass has no operation for `rules`, so the owner made the edit.
- Decided: the refiner keeps writing every task spec (Fable 5.2 for high-risk tasks, Opus 5.5 otherwise); `WORKFLOW.md` §2a says so. Entry 96, marked taken by T1-12. Why: the owner's call.
- Appended a backlog entry for the F4 browse look follow-up (decision 0004, addendum 2026-11-21) for the next pass to place. No T0 status changed; those tasks are the owner's.
