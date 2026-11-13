# Streaming loves: what to adopt from what viewers praise

Status: **D1 to D8 answered 2026-11-12, all as recommended.** The owner's answers are in "Answers" below, as relayed by the coordinating agent. The tasks they settle are in `tasks/prd.json` (P3-28, P15-09). One answer, D4 B, changes an existing task (P8-01) and is not applied by this pass; the coordinating agent applies it. Sections 1 to 8 keep the original proposal text for the record. The owner merging the pull request is the approval of the relayed answers.

This is a Fable 5.2 product-review pass under the `AGENTS.md` "Tasks" rule. It triages `tasks/backlog.md` against new research and recommends. The owner decides.

## Answers (owner, 2026-11-12)

Relayed by the coordinating agent. Every answer is the recommended option in §7.

| # | Answer | Applied in |
|---|---|---|
| D1 | B: one Favorites row on Home, directly after Continue watching and before "Because you watched", up to 12 cards and a "See all" tile, hidden when empty. | **P15-09**, added |
| D2 | A: no watch history for now. | `tasks/backlog.md` (the entry stays) |
| D3 | B: after P3-28 reports, its numbers come back to the owner with proposed targets for `PRODUCT.md` success measures. No target is set until then. | P3-28 (unchanged; its item 7 already says so); `tasks/backlog.md` |
| D4 | B: P8-01 becomes part of the TV shell's plan. | **Not applied here.** See below. |
| D5 | A: playback speed resets to normal for every title; the range is 0.5x to 2x. | A note for P15-06's spec, below and in `tasks/backlog.md`. P15-06's acceptance is not edited. |
| D6 | A: no dismiss control; wait for the server-side profile. | `tasks/backlog.md` (the entry stays) |
| D7 | A: wait for P3-28's measurement of the gap between episodes, then decide. | `tasks/backlog.md` (the entry stays) |
| D8 | A: carry four items into Jellyscale's backlog, in this order after Next Up: media segments, Quick Connect, trickplay, the session Capabilities routes. | The Jellyscale carry-over list in `tasks/backlog.md`. The owner carries it; Fluster has no task. |

### Task added after the answers

**P15-09. Show Favorites as a row on Home** (D1 B). Priority: medium. Size S. Sonnet, `jellyfin-api`. Domain: Catalog.

- **Place:** phase P15, directly after P15-01, which builds the Favorites view the row's "See all" tile opens.
- **Depends on:** P15-01 (the view), P16-02 (Home's fixed order and the merged Continue watching row it follows), P16-01 (the contract-fixture set it adds to).
- **Acceptance:** in `tasks/prd.json`, which is the source of truth. It is §5.2's text with the owner's choices filled in: the place (after Continue watching, before "Because you watched"), 12 cards, and the "See all" tile.
- Two things changed from §5.2 as first written. The order is stated as "the Favorites view's own order" only, because whether the server reports when a title was favourited is unverified and the row must agree with the view. And the task depends on P16-01 for its fixture.
- With this row Home's fixed order is: the hero, Continue watching, Favorites, "Because you watched", then "Latest in {library}".

### Applied: the edit to P8-01 (D4 B)

P8-01 is an existing task, and the `rules` in `tasks/prd.json` allow an agent to change only `status`, `owner`, `passes`, and `evidence`. The owner approved D4 B in the coordinating agent's session, so that agent applies the change. What this pass proposed to it:

1. Move the P8-01 object, unchanged, from phase P8 ("Connected") to phase P9 ("Living room and mobile"), directly after P9-01.
2. Add `"P9-01"` to the end of its `depends_on`, which becomes `["P3-15", "P9-01"]`.
3. Leave its acceptance as it is. Whether a phone can also send typed text to Fluster, which is the survey's reason for wanting a phone as the remote, depends on which remote-control commands Jellyfin's apps send. That is unverified, and it is a question for P8-01's plan, which its first acceptance item already requires.

### A note for P15-06's spec (D5 A)

When P15-06 is specified: playback speed resets to normal at the start of every title, including the next episode of a series, and the range offered is 0.5x to 2x. The owner chose this on 2026-11-12 (D5 A). P15-06's acceptance is unchanged; its spec records the answer.

### What comes back to the owner (D3 B)

When P3-28 passes, its report (`docs/research/startup-timing.md`) goes to the owner with a proposed line for each measure in `PRODUCT.md` "Success measures": launch to a usable Home, Resume to first frame, and the gap between episodes. Two seconds is the outside reference (Loves L2). `PRODUCT.md` changes only after the owner approves the numbers. The same report settles D7.

## The owner's request (2026-11-12)

Relayed by the coordinating agent:

> "it might be worth having Fable also doing some research into what users love about Netflix or any streaming service, what features they like. If they make statements about, hey, I really like this streaming application because of this feature, or any evidence of users preferring features they see in other applications over another one, we should evaluate that evidence, look for research on that evidence, and then determine if that's something that we should adopt."

The owner's standing method applies: "we shouldn't just follow the loudest malcontents." This pass applies it to praise as well. A feature is recommended for what people use and choose by, not for how warmly it is described.

## Inputs and limits

- [`docs/research/streaming-ux-loves.md`](../../research/streaming-ux-loves.md), written for this proposal. "Loves L*n*" and "Loves §*n*" point into it. Every claim there has a URL.
- [`docs/research/streaming-ux-gripes.md`](../../research/streaming-ux-gripes.md), [`discovery-and-profiles.md`](discovery-and-profiles.md) with its answers, [`docs/research/jellyfin-clients.md`](../../research/jellyfin-clients.md), and [`product-review.md`](product-review.md) with its answers and direction update.
- `PRODUCT.md`, `DESIGN.md`, `tasks/backlog.md`, and `tasks/prd.json` at `4330e34`.
- Jellyscale at `93a0f3f`: `compat/endpoints.yaml` and `docs/status.md`.

Limits:

- Reddit and app-store review text were not read. Most figures are stated answers to a survey, not behaviour. The research document says which is which.
- No Jellyfin or Jellyscale route was called for this proposal. What a route returns is as the earlier documents left it.
- No competing app was run.
- `codebase-memory` was not used; the few code facts here come from direct reads and are cited by path.

Sizes: **S** is one pull request, **M** is two or three, **L** needs its own execution plan.

---

## 1. What the evidence says

The research weighed 32 loved features and gave each a verdict (Loves §1). In one paragraph:

The features people choose apps by are plain. The app opens fast on what you were watching (L1, L2), remembers your place and your sign-in (L3), and plays without stalling (L2). Among people who own their media, playing the file as it is stored is worth paying for (L5). Skip intro, subtitles, and the next-episode countdown are heavily used (L6 to L8). Most of what services advertise, such as Top 10 lists, shuffle buttons, watch parties, voice search, and social features, is praised more than it is used (L27 to L31).

Two readings now agree. The gripes study found that the best-supported complaints were about the viewer's own things: where Continue Watching sits and what clutters it. This study finds that the best-supported praise is for the same things done well. Fluster's plan was already built around them.

| Verdict | Features |
|---|---|
| **Drives choice** | L1 Continue watching first; L2 fast and reliable; L3 remembers place and sign-in; L5 plays the file as it is (among personal-media users) |
| **Used and liked** | L4 saved titles; L6 skip intro; L7 subtitles and track memory; L8 next-episode countdown; L9 suggestions from what you finish; L10 phone as remote; L11 polish; L12 hiding rows; L13 grouped rows; L14 trailers on the page; L15 sign-in without typing |
| **Nice but not decisive** | L17 HDR and passthrough (decisive for a small group); L18 honest labels; L19 scrubbing thumbnails; L20 playback speed; L21 ratings shown; L22 "why recommended"; L23 watch history; L24 custom lists; L25 profiles and kids' controls; L26 thumbs |
| **Loud praise, little use** | L28 watch together; L29 shuffle; L30 voice search; L31 social features; L16 downloads away from phones |
| **Not applicable** | L27 Top 10 (needs a crowd) |

---

## 2. Recommendations

Each is tied to a verdict. None is applied except R1's task.

**R1. Measure startup, then decide a target.** *(L2: drives choice.)*
`PRODUCT.md` principle 3 promises "fast startup", and the success measures count only Play to first frame. The one large measurement of behaviour in the research says viewers begin to leave after two seconds of waiting. Fluster has no analytics and never will, so the only way to know is to time it on the owner's machine. **Task P3-28 does that and sets no target** (§5.1). The target is decision D3.

**R2. Put saved titles on Home.** *(L4: used and liked.)*
A pinned watch list came second of 13 tested features on every measure, and "hard to find my watch list" was one of the two most damaging design problems. The owner's answer stands that Favorites is Fluster's watch list (Q10 A). Under the current plan the Favorites view is a nav entry (P15-01), which is exactly where the survey says a saved list gets lost. A Favorites row on Home, in a fixed place, is the cheap answer. It is a new row, so it is decision D1. The caution: three-quarters of saved titles are never touched on services, so the row should stay small and never lead.

**R3. Ship the phone-as-remote work with the TV shell, not after it.** *(L10: used and liked, on intent.)*
A phone as the remote and keyboard was third of 13, and in the top tier for viewers aged 35 and over. Fluster needs to write no phone app for it: once Fluster accepts Jellyfin's remote-control commands (P8-01), any Jellyfin app on a phone can drive it. P8-01 sits in the last milestone. Where it goes is decision D4.

**R4. Ask Jellyscale for the routes the most-used features need.** *(L6, L15, L19.)*
Skip intro is pressed 136 million times a day on Netflix and sold as a paid feature by Plex and Emby. On Jellyscale it has no data: media segments are "not built". Quick Connect and trickplay are also "not built". The discovery proposal's list for Jellyscale (§3.4 A there) does not name these three. Carrying them over is decision D8.

**R5. Keep the plan's order for subtitles, speed, downloads, and watch together.** *(L7, L20, L16, L28.)*
Nothing found argues for moving them. Subtitles are used in about half of viewing, and their tasks exist (P15-07, P5-05, P15-06). Speed is a minority feature on a TV. Downloads do not reach the brief's bar of overwhelming evidence for a desktop. Watch together is loud and little used. One note for later: offline is the most-voted request for a phone client, so it should lead the phone shell's list when that list is written.

**R6. Do not build the service-shaped features.** *(L26 to L31.)*
Top 10, shuffle, voice search, social features, and thumbs ratings. The reasons are in Loves §5.3.

**R7. Let a viewer say "not this one".** *(L9: used and liked.)*
"Recommendations repeat over and over" and "can't hide unwanted content" are among the most frequent problems in the survey. Fluster's one suggestion row (P16-05) is stable by design, which means a title the viewer does not want stays there until the anchor changes. A dismiss control fixes that and raises a storage question, so it is decision D6.

**R8. Treat the rest as backlog.** A watch history (L23, decision D2), status marks on cards, a sleep timer, picture-in-picture, and dialogue boost have little or no usage evidence. They go to `tasks/backlog.md` (§6).

---

## 3. New evidence that bears on settled answers

Nothing here reopens an answer. Each line says what the owner decided, what was found since, and whether it agrees. The owner may want to revisit a few after the dogfood week.

| Settled answer | New evidence | Bearing |
|---|---|---|
| Discovery Q2 B: one merged row, first | Pinned Continue Watching is first of 13 on all five measures (L1). 209 votes on Jellyfin's tracker ask to combine Next Up and Continue Watching. | **Agrees.** The best-supported decision in the plan. |
| Discovery Q6 A: one suggestion row, anchored on what was finished | Respondents were shown "based on what you finish, not shows you sampled but abandoned" and ranked it third (L9). | **Agrees**, including the anchor rule in P16-05. |
| Product review Q14 A: Skip is a button by default | 45% of US viewers enjoy title sequences (L6). | **Agrees.** |
| Product review Q18 A: speed after the dogfood week | 11% have watched faster than normal; use is lowest on TVs (L20). | **Agrees.** |
| Discovery Q9 A: local trailers only, low priority | 37% of viewers who want more information watch the trailer on the service (L14). | **Mild tension.** Trailers are used more than "low priority" suggests. They matter less when the viewer chose the library, and the answer stands unless the dogfood week says otherwise. |
| Discovery Q10 A: Favorites stands in for a watch list | A pinned watch list is second of 13; a hard-to-find list is among the two most damaging design problems (L4). | **Agrees on the substitute; questions the place.** Raised as D1, which keeps Q10 A. |
| Discovery Q1 A: one fixed Home order; hiding rows stays in the backlog | 47% would "absolutely" use hiding rows they do not use, fourth of 13 on use (L12). | **Tension, weak.** The rows respondents imagined hiding are promotional ones Fluster does not have. Added as a note to the backlog entry. |
| Discovery Q7 A: no genre rows on Home | 82% of subscribers said they would use groupings of similar content (2020, intent) (L13). | **Tension, weak.** The backlog already says to revisit after the dogfood week; this is one more reason. |
| Product review Q19 A: track memory after the dogfood week | Subtitles are on for about half of viewing hours; Plex shipped per-series subtitle control after 701 votes (L7). | **Tension on timing only.** The feature is settled; the evidence says it will be missed during the dogfood week. |
| Product review Q15 A and Q16 A: recap segments and "Still watching?" not now | No usage data was found for either. | **Agrees** by absence. |
| Discovery "principles after weighing", N9: the profile is visible and resettable | "Why is this recommended?" is tenth of 13 on use (L22). | **Agrees** with keeping N9 a privacy rule and not a selling point. |
| Product review Q11 and discovery Q11 D: a PIN with the TV shell | No usage data on profile locks was found. | **No bearing.** |
| M5 placement of downloads (P8-03) and SyncPlay (P8-02) | Stated intent for downloads is far above measured use; a large service removed its watch-party feature (L16, L28). | **Agrees.** |

---

## 4. Invariants and rules this proposal touches

None is changed. Each task below must hold them.

| Rule | Where | How this proposal meets it |
|---|---|---|
| Private by default: no analytics, no third-party services | `PRODUCT.md` principle 6 | P3-28 records timings on the device, behind a development flag, and nothing leaves. No recommendation here adds an outside service. |
| Tokens, authenticated URLs, and play-session ids are never logged or shown (I4) | `AGENTS.md` | P3-28's record holds durations and names only, and the redaction canary tests cover it. |
| Every new Tauri command is an architecture change (I3) | `AGENTS.md` | P3-28 adds none, or its spec stops and asks. Accepting remote commands (P8-01) and a local dismiss list (D6 B) are called out where they arise. |
| Only the gateway talks to Jellyfin (I8); media URLs are built only in Playback Negotiation (I1, I2) | `ARCHITECTURE.md` §4 | A Favorites row and a history view are catalog calls through `src/lib/jellyfin/gateway.ts`. Loading the next episode early (D7) would touch Playback Negotiation and needs a plan and a `guardian` review. |
| What Fluster learns about a viewer stays on that viewer's server | `PRODUCT.md` "Better than a streaming service" 5; discovery §3.3 | D6 asks whether a dismiss list may live on the device. The recommended answer keeps it off the device. |
| The owner makes design calls | owner's standing instruction | Every new row, screen, and control is a decision in §7. Only the measurement task was added without one. |
| Home has one fixed order (discovery Q1 A) | `PRODUCT.md` "Better than a streaming service" 2 | D1 adds one row at a fixed place. It does not make the order adjustable. |

---

## 5. Tasks

### 5.1 Added to `tasks/prd.json`

One task. It needs no design choice, changes nothing a viewer sees, and sets no target.

**P3-28. Measure startup and the gap between episodes.** Priority: medium to high. Size S. Model: Sonnet (`implementer`, `verify`). Domain: App Shell & Presentation.

- **Place:** the end of phase P3, after P3-27. It is about the daily driver, so it sits with the daily driver. P4-01's dependency list is not edited, so the dogfood week does not wait for it; running it first means the week starts with numbers.
- **Depends on:** P13-08, P3-10, P0-06, P0-10 (all done).
- **Acceptance:**
  1. A development-only timing record gives, for each launch, the time from the WebView time origin to Home showing its first row and to the hero primary action being focusable; the launcher script times process start to that origin from outside.
  2. The record also gives the time from Resume on Home to the first frame, and from the Up Next card starting the next episode to that episode's first frame, read from the player snapshots that exist today.
  3. A record holds durations, the screen or step name, and the play method only: no URL, item id, token, or play-session id; the redaction canary tests cover it.
  4. Nothing leaves the computer and nothing is recorded unless a development flag is set; `PRODUCT.md` principle 6 holds.
  5. No Tauri command is added, or the spec stops and asks the human; the command allowlist test is unchanged, and no playback request changes.
  6. `docs/research/startup-timing.md` reports the median and the worst of ten launches and ten episode changes on this computer, direct play, against the Jellyfin 10.11.7 and 12.4.0 dogfood servers, and says how to repeat the run.
  7. No target is set and `PRODUCT.md` is unchanged; a target is the owner's decision (D3).
  8. Unit tests cover the record's shape and that it is off by default.
- **Verify:** `pnpm check && ls docs/research/startup-timing.md`

Why the gap between episodes is in it: "Begin buffering the next episode" has 223 votes on Jellyfin's tracker (Loves L8). Whether Fluster needs that depends on how long the gap is, which nobody has measured. D7 waits for this number.

### 5.2 Proposed, waiting for decisions

Not in `tasks/prd.json`. Ids are provisional. Each is written so that it can be added as it stands if its decision is answered with the recommended option; a different answer changes it.

Every UI task also carries the four standard lines (the TV form; screenshots at 1440×900 and 1920×1080; a fresh-context design review; no journey skipped, deleted, or weakened) and "`DESIGN.md` matches what ships". Verify for each UI task: `pnpm check && pnpm test:e2e && pnpm test:visual`.

**P15-09. Show Favorites as a row on Home** (D1 B). Priority: medium. Size S. Sonnet, `jellyfin-api`. Domain: Catalog. Place: P15, directly after P15-01. Depends on P15-01, P16-02.

1. Home shows one "Favorites" row of the viewer's favourite movies and shows, in the place the owner chose in D1, on every visit.
2. The row holds at most the number of cards the owner chose in D1 and ends with a "See all" tile that opens the Favorites view (P15-01).
3. The order is most recently favourited first if the server reports it, and otherwise the Favorites view's own order; a test loads Home twice with the same fixtures and asserts the same cards in the same order.
4. A title leaves the row when it is unfavourited, on this client or another (P3-15's refresh applies), and the row is hidden when there are no favourites, including on a server that returns none.
5. The request carries only the fields a card needs; a gateway test asserts it against a contract fixture from 10.11.7 and 12.4.0; no playback request changes.
6. A Playwright journey marks a title Favorite on its page and finds it on Home.
7. `DESIGN.md` §7.4 lists the row in Home's fixed order.

**P15-10. Show what you watched** (D2 B). Priority: low. Size M. Sonnet, `jellyfin-api`. Domain: Catalog. Place: P15, after P15-09. Depends on P16-01, P13-24.

1. A "Watched" view, reached from the place the owner chose in D2, lists the titles the server marks played for this account, most recently played first, as the library grid does.
2. Each card shows the date it was last played; an episode shows its series and number.
3. The view states what it is: one entry per title with its last play, not a list of every session.
4. The view is per account and shows nothing from another account on this device.
5. The route is part of the URL, so Back and focus restore work.
6. A gateway test asserts the request against a fixture from each server version; a Playwright journey finishes a title and finds it first in the view.

**P16-10. Dismiss a suggestion** (D6 B). Priority: low. Size S to M. Sonnet. Domain: Catalog. Place: P16, after P16-05. Depends on P16-05, P3-22.

1. A card in the "Because you watched" row and in "More like this" offers "Not this one" from the same place details open (the `i` key, Menu on TV, right-click), and the title leaves both rows for this account.
2. Where the dismissal is kept is as the owner chose in D6; it is never sent to a third party.
3. Settings › Home can clear all dismissals.
4. A dismissed title stays in the library, in search, and on its own page.
5. Unit tests cover the filter; a Playwright journey dismisses a title and reloads Home.

**P3-29. Start the next episode without a wait** (D7 B). Priority: decided after P3-28 reports. Size M. Opus for the spec and a `guardian` review, because it changes when Playback Negotiation runs. Domain: Playback Session. Place: the end of P3. Depends on P3-28, P3-23.

1. A plan exists before implementation.
2. While the Up Next countdown runs, Fluster prepares the next episode's playback through Playback Negotiation, with the same request it would send at the end.
3. Nothing is prepared when the plan for the next episode is a conversion: no server job starts before the viewer has reached the episode.
4. Hide, Back, and turning auto-play off cancel the preparation, and no play session is left open on the server; the "no server job 10 s after stop" measure still holds.
5. The gap measured by P3-28's method is reported before and after.
6. The tripwire still passes, and no Tauri command is added.

**D4 needs no new task.** If the owner chooses B, P8-01 is carried into the TV shell's plan when that plan is written (the backlog has "A task that builds the TV shell after the P9-01 spike"). P8-01's acceptance and `depends_on` are not edited by this pass.

**D8 needs no Fluster task.** It is a list for the owner to carry into Jellyscale's own backlog, as §3.4 of the discovery proposal was.

### 5.3 Proposed order

```text
In tasks/prd.json now:   P3-28 measure startup and the episode gap (end of P3)
After D1 (if B):         P15-09 Favorites row on Home (after P15-01)
After D2 (if B):         P15-10 Watched view (after P15-09)
After D6 (if B):         P16-10 dismiss a suggestion (after P16-05)
After P3-28 and D7:      P3-29 prepare the next episode early (end of P3)
After D4 (if B):         P8-01 joins the TV shell's plan
Carried by the owner:    D8, to Jellyscale
```

---

## 6. Backlog triage

Entries in `tasks/backlog.md` at `4330e34` that the research bears on.

| Backlog entry | Outcome | Why |
|---|---|---|
| Remove an item from Continue Watching, and a watchlist | **Stays.** The watch-list half is addressed by D1 without changing Q10 A. | L4. Favorites stays the substitute; D1 asks only where it shows. |
| Let the viewer reorder or hide Home rows | **Stays, with a note.** | L12: 47% would use hiding rows. The rows people imagined hiding are promotional ones. |
| Revisit genre rows on Home after the dogfood week | **Stays, with a note.** | L13: 82% said they would use groupings of similar content (2020, intent). |
| Recap, Preview, and Commercial segments | **Stays.** | No usage data for skip recap was found. |
| A "Still watching?" prompt | **Stays.** | No new evidence. |
| Audio sync offset and dual subtitles | **Stays.** | Plex's "automatic subtitle synchronisation" has 687 votes, which supports the offset already in P15-06. Nothing found on dual subtitles. |
| Playlists | **Stays.** | L24: custom boards are near the bottom of the survey. |
| A PIN per profile | **Stays** with the TV shell. | L25: no usage data. |
| Test Fluster against Jellyscale | **Stays. Notes added.** | D8: media segments, Quick Connect, trickplay, and the Capabilities routes. |
| An end-of-film card that offers "More like this" | **Stays.** | L9 supports suggestions after finishing; P16-05 already puts one on Home. |
| A "private session" that plays without reporting | **Stays.** | No evidence found. |
| A row for a collection on Home | **Stays.** | L24. |
| A task that builds the TV shell | **Stays. Note added.** | D4: the phone-as-remote work belongs with it. |

Added to the backlog by this pass: see the "Loves" section at the end of `tasks/backlog.md`.

---

## 7. Decision list

D1 to D8 were answered on 2026-11-12; see "Answers" at the top. Their text is kept as asked. Eight decisions in two batches of four. Each stands alone. "Rec" is a recommendation; the owner decides.

### Batch 1: Home and what it measures

**D1. Should saved titles show on Home?**
A US survey of 3,000 viewers tested 13 app features. A watch list pinned to the home page came second on every measure (39% love it, 56% would "absolutely" use it), and a watch list that is hard to find was one of the two most damaging design problems. Fluster's watch list is Favorites (your answer Q10 A), and the plan puts it in the nav only (P15-01). On services about three-quarters of saved titles are never played.
- A: No row. Favorites stays a nav entry.
- B: One "Favorites" row on Home, directly after Continue watching and before "Because you watched", up to 12 cards and a "See all" tile, hidden when empty.
- C: The same row, placed after "Because you watched" and before the Latest rows.
- D: Decide after the dogfood week, once P15-01 exists to try.
- **Rec: B, built after P15-01 (proposed P15-09).** It is the second-best-supported feature in the research and costs one small row. It keeps Home's order fixed. The row sits with the viewer's own things, which is where the survey says people look. If you would sooner see the Favorites view in use first, D costs nothing.

**D2. Should Fluster show what you have watched?**
"Watched history" has 835 votes on Jellyfin's tracker, fifth among client requests. No usage figure for any service's history page was found. Jellyfin keeps one last-played date per title, not a list of sessions, so the view would be "titles you finished, newest first".
- A: No. Leave it in the backlog.
- B: A "Watched" view reached from the account menu, per account (proposed P15-10).
- C: A "Watch again" row on Home in place of a view.
- **Rec: A for now.** One vote board is thin evidence, and the view shows a viewer's habits to whoever is at the screen, which you have been careful about (Q11 D). Revisit after the dogfood week if you miss it.

**D3. Should "fast startup" have a target?**
`PRODUCT.md` promises fast startup and measures only Play to first frame (under 1.5 s). A study of 23 million video views found that viewers start leaving after 2 seconds of waiting, and each further second loses 5.8% more. Task P3-28 will time launch to a usable Home, Resume to first frame, and the gap between episodes on your computer, and sets no target.
- A: No target. Keep the numbers as a record.
- B: After P3-28 reports, add targets to `PRODUCT.md` success measures, set from what it measures. I will bring the numbers and a proposed line for your approval.
- C: Set targets now: Home usable within 2 s of launch and the next episode's first frame within 2 s, both at the median on the home network.
- **Rec: B.** A target chosen before any measurement is a guess, and Fluster cannot gather numbers from other users. Two seconds is the best outside reference when the time comes.

**D4. When should a phone be able to act as Fluster's remote?**
In the same survey, using a phone as the remote and keyboard came third of 13 (49% would "absolutely" use it) and in the top tier for viewers aged 35 and over. Typing with a TV remote is a known pain. Fluster needs no phone app for this: once it accepts Jellyfin's remote-control commands (P8-01, "Act as a Jellyfin cast target"), any Jellyfin app on a phone can drive it. P8-01 is in the last milestone, M5.
- A: Leave P8-01 in M5.
- B: Make P8-01 part of the TV shell's plan, so the first TV build can be driven from a phone.
- C: Do P8-01 right after the dogfood week, on the desktop.
- **Rec: B.** The evidence is about TVs, where typing hurts; a desktop has a keyboard. It moves an existing task, so it is yours to decide, and nothing is edited until you do. On Jellyscale the two Capabilities routes it needs are stubs today.

### Batch 2: suggestions, the player, and Jellyscale

**D5. Should playback speed be remembered?**
Speed is already a task for after the dogfood week (P15-06). This decides one thing its spec needs. 11% of US viewers have watched TV faster than normal, and on TVs people who change speed mostly stay at normal or 1.25x. Netflix resets speed for every title and offers 0.5x to 1.5x; deaf and hard-of-hearing viewers asked for slower speeds.
- A: Speed resets to normal for every title, with a range of 0.5x to 2x.
- B: Speed is remembered for the rest of a series and resets for films.
- C: Speed is remembered until changed.
- **Rec: A.** A film played at the wrong speed by surprise is a worse failure than choosing a speed twice. P15-06's acceptance is not edited; its spec would record your answer.

**D6. Should a viewer be able to dismiss a suggestion?**
"Recommendations repeat over and over" and "can't hide unwanted content" are among the most frequent problems in the survey. Fluster's one suggestion row (P16-05) stays the same until you finish something else, so an unwanted title stays too. A dismissal has to be kept somewhere, and your rule is that what Fluster learns about a viewer stays on that viewer's server.
- A: No dismiss control. Wait for the server-side profile, which has "not this one" in its design (discovery §3.4 C).
- B: A "Not this one" action now, kept on the server in the account's display preferences where the server supports them, and nowhere when it does not (proposed P16-10).
- C: The same action, kept on this device per account.
- **Rec: A.** The row is one row, the survey's complaint is about services that repeat promotions, and B needs a server check nobody has run. If the dogfood week shows the row sticking on something unwanted, choose B then.

**D7. Should Fluster prepare the next episode before the countdown ends?**
"Begin buffering the next episode" has 223 votes on Jellyfin's tracker, and waiting is the best-measured reason people abandon video. Nobody has measured how long Fluster takes between episodes; on a home network with the original file it may already be about a second. Preparing early changes when Playback Negotiation runs, and must never start a server conversion the viewer has not reached.
- A: Wait for P3-28's measurement, then decide.
- B: Plan it now, for direct play only (proposed P3-29, with a plan and a `guardian` review).
- C: Never; keep episode starts simple.
- **Rec: A.** If the gap is under two seconds there is nothing to fix.

**D8. Should Jellyscale's list gain the routes the most-used features need?**
The discovery proposal gave you a list to carry into Jellyscale's backlog (Next Up, Similar, Genres and Persons, trailers, filters). This research adds four that list does not name, each "not built" or a stub in Jellyscale today: media segments (Skip intro, pressed 136 million times a day on Netflix and a paid feature on Plex and Emby); Quick Connect (signing in on a TV without typing; Fluster's sign-in leads with it); trickplay (scrubbing thumbnails); and the session Capabilities routes (a phone as the remote, D4).
- A: Carry all four over, in this order after Next Up: media segments, Quick Connect, trickplay, Capabilities.
- B: Carry only media segments and Quick Connect.
- C: Carry none now; wait for the Jellyscale test pass in the backlog.
- **Rec: A.** The order follows how much each is used. Jellyscale decided that segments come only from operator data or chapter markers; this does not ask to change that, only to rank the work.

---

## 8. What this pass did not do

- It did not edit an existing task's acceptance or `depends_on`.
- It did not change `PRODUCT.md`, `DESIGN.md`, or `AGENTS.md`.
- It did not add any task that shows a viewer something new.
- It did not set this pull request to merge by itself.
