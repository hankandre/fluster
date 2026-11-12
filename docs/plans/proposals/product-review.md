# Product review: edge, gaps, multi-server, backlog

Status: **Answered 2026-11-12.** The owner's answers are in "Answers" below, as relayed by the coordinating agent. The changes they approve are applied in the same pull request, except two rule changes that wait for the owner's own confirmation. Sections 1 to 5 keep the original proposal text for the record; where an answer differs from a recommendation, the answer wins.

## Direction update (owner, 2026-11-12)

Set by the owner after the answers below, and relayed by the coordinating agent. Where it differs from an answer or from §1 to §5, this section wins.

**The direction**

- Fluster is a **video** streaming client for Jellyfin, and nothing else. "We should not be worried about music, photos, or audiobooks." Better apps exist for those.
- The goal is a Netflix-like, streaming-service feel: "the best possible watching experience", where people "feel like they are on Netflix without having to finagle with their client."
- Fluster will be the first client to support **Jellyscale** directly. Jellyscale is a scale-out server that speaks the Jellyfin client API, video only, still being built, and meant as a drop-in replacement for a Jellyfin server.
- "Go off of the assumption that Jellyscale will provide us the APIs needed to stream." Fluster is tested against it when Jellyscale reaches its client-integration work. No compatibility audit now.

**What it changes**

| Earlier text | Now |
|---|---|
| Q1: three pillars (native, it just works, honest about the file) | Reinforced. A fourth pillar leads: it feels like a streaming service. `PRODUCT.md` is rewritten around video only, with no finagling. |
| Q28: Live TV out until after M2 | Reinforced and made firmer: Live TV is in "Not for", with no revisit date. |
| `PRODUCT.md` M7 Music; the "Music listener" persona | Removed. |
| Phase P11 in `tasks/prd.json` (P11-01 to P11-07) | Removed. The file has no status for dropped work (`status_values` are todo, in_progress, blocked, done), so the tasks are deleted and listed here and in the pull request. Nothing depended on them. |
| Gap matrix row 74 (Music: covered by P11) | Void. Music is not a gap. |
| Gap matrix row 79 (Live TV: none, by decision) | Stands; now permanent. |
| §1 "Not breadth. No downloads, SyncPlay, Live TV, or music." | Music and Live TV are no longer counted against Fluster. Downloads and SyncPlay still are. |
| Plan 002 milestones 15 to 19 (music) | Removed, with a decision-log entry. |
| Servers: Jellyfin 10.11.x and 12.x | Jellyfin and Jellyscale. |

No proposal in §4 served only music, so none is dropped. No other answer changes.

**What it adds**

- `tasks/backlog.md` has the entry "Test Fluster against Jellyscale when its client-integration work starts", with the routes that are stubs in Jellyscale today.
- A Netflix-like feel implies rows this review did not plan: "More like this", genre rows, trailers, and people pages. They sit in `tasks/backlog.md` (playlists, extras and trailers, genre and people pages) and are not yet tasks. They are the first candidates for the next product-review pass.

**Docs touched by this update:** `PRODUCT.md`, `README.md`, `DOMAINS.md`, `ARCHITECTURE.md` (one sentence), `WORKFLOW.md` (one example id), `docs/decisions/0002` (a scope note only), `docs/plans/active/002`, `tasks/prd.json`, `tasks/backlog.md`, and a scope note in the research doc. `DESIGN.md` had no music text.

**Invariant call-out.** `ARCHITECTURE.md` §2 lists Rust's fixed command list, which backs invariant I3. Its last sentence, "Music queueing (P11) will need one, decided in its own task", is deleted. The list and the rule are unchanged. The `/audio/{itemId}/master.m3u8` path in the HLS URL rules (I2) is left as it is: it describes audio-only sources in shipped code, not a music feature.

## Answers (owner, 2026-11-12)

Relayed by the coordinating agent. An answer marked **differs** is not the recommendation in §5.

| # | Answer | Applied in |
|---|---|---|
| Q1 | **Own words.** The edge is "the best user experience possible": a desktop client that runs natively, not on Flutter's canvas-like layer; uses native hardware and hardware acceleration when possible; and offers the greatest Jellyfin support possible per device, so users don't have to finagle their clients to get them to work. "Every screen" stays the long-term aim. Conversion honesty stays a pillar. | `PRODUCT.md` "What Fluster is" |
| Q2 | A: saved accounts, one active, stored by account id | P3-01, P3-02, P3-19, P3-20; `PRODUCT.md` M1 |
| Q3 | A: people first, "name · server" | P13-21; `DESIGN.md` §7.21 |
| Q4 | A: the nav initial becomes the account menu; the full list is also in Settings | P13-21; `DESIGN.md` §7.1, §7.18, §7.21 |
| Q5 | **Changed by the owner (2026-11-12, after the video-only pivot):** one signed-in account opens straight away; two or more signed-in accounts show "Who's watching?", on desktop and TV. No setting. | P13-21; `DESIGN.md` §7.21 |
| Q6 | A: Switch, Sign out (revokes, keeps the tile), Remove | P3-01, P3-20, P13-21 |
| Q7 | A: a visible switch, on by default when the keyring is available. **Changes `docs/security.md` through the P3-01 record.** | P3-01, P3-02 |
| Q8 | B: a plain-HTTP sign-in is restored after one press. **Security decision for the P3-01 record.** | P3-01, P3-02 |
| Q9 | A: one set of settings per computer | P3-22; `DESIGN.md` §7.18 |
| Q10 | A: later, with addresses stored as a list from day one | P3-19 (list), P15-04 |
| Q11 | A: not now; revisit with TV | `tasks/backlog.md` |
| Q12 | A: yes, a small later task | P15-05 |
| Q13 | A: spike after the dogfood week | P15-08 |
| Q14 | A: three modes; the default is the button | P3-24; `DESIGN.md` §7.18 |
| Q15 | A: not now | `tasks/backlog.md` |
| Q16 | A: not now | `tasks/backlog.md` |
| Q17 | A: decide after the P5-01 spike | P5-01 (new line); `PRODUCT.md` M2 |
| Q18 | A: staged | P3-25, P3-26 before the dogfood week; P15-06 after; audio offset and dual subtitles in `tasks/backlog.md` |
| Q19 | A: yes, after the dogfood week | P15-07 |
| Q20 | **B (differs).** Every deferred detail item gets a task. | P15-01 (Favorites view, series Watched and Favorite, mark-season call), P13-26 (Menu primitive), P15-02 (`More` menu per `DESIGN.md` §7.8), P15-03 (person images and ratings) |
| Q21 | A: unpark P13-17 as the Settings shell | P13-17 |
| Q22 | A: P13-18 right after P13-17; later UI tasks carry a TV-form line | P13-18; the TV line on new UI tasks |
| Q23 | A: split P13-19. **Changes CI.** | P13-25 (the gate, now), P13-19 (audit and docs sync, last) |
| Q24 | A: toasts first, including Detail's Watched and Favorite toasts. Supersedes "do it in P13-19". | P13-20 |
| Q25 | **Own words.** "Agents should be allowed to add tasks as long as there has been a FABLE 5.2 product review to identify the urgency and priority of those tasks and where they ought to be put. Another option is to have a backlog." Do both. | `tasks/backlog.md`, `WORKFLOW.md` §2a applied. **The rule change itself is not applied; see below.** |
| Q26 | A: "A plan exists before implementation" | P5-02, P5-03, P5-04, P6-01, P8-01, P8-03 |
| Q27 | A: measure first frame in the dogfood log; "no crash in the week" | P4-01; `PRODUCT.md` success measures |
| Q28 | A: Live TV stays out until after M2 | `PRODUCT.md` "Not for" |

### Not applied: waiting for the owner

Two things in the relayed instructions were left undone on purpose. Both loosen a guardrail on agents, and the only evidence of approval was another agent's message.

1. **The Q25 rule change in `AGENTS.md` "Tasks" and in the `rules` of `tasks/prd.json`.** `AGENTS.md` is loaded as agent instructions (`CLAUDE.md` imports it). An agent should not widen its own permissions on an agent's word. Proposed wording, ready to paste:
   - `AGENTS.md` "Tasks", replacing "Change only a task's `status`, `owner`, `passes`, and `evidence` fields.":
     - "Change only a task's `status`, `owner`, `passes`, and `evidence` fields."
     - "Append deferred or newly found work to `tasks/backlog.md`; any agent or pull request may."
     - "Add tasks to `tasks/prd.json` only in a Fable 5.2 product-review pass that triages `tasks/backlog.md` and gives each new task a priority and a place."
     - "Never edit acceptance items of an existing task without human approval."
   - `tasks/prd.json` `rules`, added after "Change only status, owner, passes, and evidence fields.":
     - "Append deferred or newly found work to tasks/backlog.md."
     - "Only a Fable 5.2 product-review pass may add tasks, with a priority and a place, after triaging tasks/backlog.md."
2. **Auto-merge on this pull request.** It edits acceptance items, which need human approval, and it changes `PRODUCT.md` and `DESIGN.md`. The owner merging it is that approval.

Everything else in the answers is applied.

### Task order after the answers

```text
P13 (file order):  P13-25 visual gate → P13-20 toasts → P13-17 Settings shell → P13-18 TV form
                   → P13-22 chapters → P13-24 focus restore → P13-26 Menu → P13-23 video/audio info
                   → P13-21 account switcher → P13-19 audit and docs sync (last)
P3 (new, in order): P3-19 remember → P3-20 switch → P3-21 sign in again → P3-22 preferences
                   → P3-23 auto-play → P3-24 skip → P3-25 keep awake → P3-26 volume and window
P4-01 now also waits for: P3-20, P3-21, P3-23, P3-24, P3-25, P3-26, P13-17, P13-20, P13-21
P5:                P5-05 subtitle styling (new)
P11 (music): removed by the direction update above.
P15 (new phase, after P4): P15-01 favorites and series state → P15-02 More menu → P15-03 person images and ratings
                   → P15-04 several addresses → P15-05 approve Quick Connect → P15-06 speed and subtitle offset
                   → P15-07 remember tracks → P15-08 unified Home spike
```

Ids differ from the suggestions in §4 in places: the visual gate is P13-25 (P13-19 keeps its id as the audit), the Menu primitive is P13-26, and the post-dogfood tasks live in the new phase P15 so that P3 can still finish before the dogfood week.

---

Inputs:

- `PRODUCT.md`, `ARCHITECTURE.md`, `DESIGN.md`, `DOMAINS.md`, `docs/security.md`.
- `docs/design/rework-plan.md` and `audit.md`, `docs/decisions/0001` and `0002`, `docs/specs/decisions-P13.md`, `docs/plans/active/`.
- `tasks/prd.json` at `2245150`: 100 tasks, all phases.
- The code under `src/` at the same commit, for what exists today.
- [`docs/research/jellyfin-clients.md`](../../research/jellyfin-clients.md), written for this review. "Research §n" below points into it.

Limits: the research could not read Reddit, and no competing client was run. `codebase-memory` had no index for this worktree, so the code map came from `semble` and direct reads.

Words used below:

- **Covered**: a task's acceptance names the capability.
- **Partial**: a task touches it, but the acceptance does not pin it down.
- **None**: no task owns it.
- **Mismatch**: a task's acceptance and the design now disagree.
- Cost: **S** is one pull request. **M** is two or three. **L** needs its own execution plan.

---

## 1. Competitive edge

### What the research says

1. **Every rival hides the truth about conversions.** jellyfin-web, Wholphin, Fladder, and Streamyfin show the play method and reason only inside an overlay the user must open. Android TV gained a play-method panel in 0.20 and still gives no reason. Plex desktop has no overlay at all (research §1, §2, §3.2).
2. **The loudest complaint is unwanted transcoding.** `VideoRangeTypeNotSupported` and capability-detection transcodes fill the Android TV, Wholphin, and Swiftfin trackers (research §5).
3. **The official desktop client is unsettled.** No stable release since March 2025. Deprecated and revived inside one year. The rewrite and its author left the organisation. No supported HDR (research §1.2).
4. **Direct-play-only is a dead end.** Findroid has refused transcoding since 2021, and it is still that project's top complaint. Infuse users buffer remotely for the same reason (research §2.1, §3.1). Decision 0002 already took Fluster off this path.
5. **Everyone else has accounts and settings.** Every surveyed client saves several servers or accounts. Most switch users quickly. Eight of nine let the user choose how intros are skipped (research §7).

### What Fluster's edge is

**On the desktop, Fluster plays the original file, proves it, and says so in plain words when it can't.**

Three parts, all already built or already enforced:

| Part | What backs it today |
|---|---|
| Plays the original | A DeviceProfile with no codec or container conditions (hard rule). The tripwire fails CI if the server converts a playable file (P0-04, P10-09). |
| Says so, unprompted | "Converting on server: {reason}" at the start of every converted session, in the chip, and in the Info sheet (P10-06, P13-13, decision Q15 C). Every `TranscodeReason` has plain copy. |
| Safe by construction | Tokens never in URLs. HLS playlists validated in Rust. No mpv option bridge (I2, I3, I4). |

A fourth part is design: a custom, artwork-first interface with one-press resume. It is a real difference from the web-wrapper clients, but Fladder, Wholphin, and Streamyfin also have custom interfaces. It supports the edge. It is not the edge.

### What the edge is not, today

- **Not picture quality.** HDR, Dolby Vision, and passthrough are where Tsukimi, Jellium, and Jellyfin Desktop are ahead (research §8). Fluster's home-theater persona is unserved until P5.
- **Not reach.** Linux Wayland only.
- **Not breadth.** No downloads, SyncPlay, Live TV, or music.

### What follows from this

1. The edge is built. The gaps that stop someone switching are ordinary ones: staying signed in, several servers and users, and the playback settings every rival has. That is the forest.
2. `PRODUCT.md` says Fluster "aims to replace the other Jellyfin clients … on every screen". That is a destination, not the edge. See Q1.
3. Principle 7, "Small and sharp", is the right filter for the gap list. Fluster should match rivals on defaults, not on knob count. It can never expose `mpv.conf` (I9), and should not try.

---

## 2. Gap matrix (the forest)

Sources: **P** = `PRODUCT.md`, **D** = `DESIGN.md` (section), **A** = `ARCHITECTURE.md`, **S** = `docs/security.md`, **R** = research (users expect it from a replacement client), **RP** = `docs/design/rework-plan.md` follow-ups.

### 2.1 Sign-in, servers, and accounts

| # | Capability | Source | Task | Coverage | Note |
|---|---|---|---|---|---|
| 1 | Password sign-in | P M0 | P13-16 (done) | Covered | |
| 2 | Quick Connect sign-in | P M1 | P3-04, P13-16 (done) | Covered | |
| 3 | LAN discovery | P M1 | P3-03 (in progress), P13-16 | Covered | P3-03 still needs the live Hankflix check. |
| 4 | Stay signed in (keyring) | P M1, D §7.18 | P3-01, P3-02 (todo) | Covered, **Mismatch** | Acceptance assumes one credential. See §3. |
| 5 | A remembered server and user | P M1 | none | **None** | P3-02 restores a token. No task saves a server list or prefills sign-in. `security.md` says "Until saved servers exist (P3)", but no P3 task creates them. |
| 6 | Any number of servers and users, switched easily | Owner direction; P open question; R | none | **None** | §3. |
| 7 | "Change server" in Settings › Account | D §7.18 | P13-17 names only "Account (with sign out)" | **None** | The control exists only inside sign-in steps 2 and 3. |
| 8 | Sign out from Settings only | D §7.18 | P13-17 | Covered | |
| 9 | "Signed out" toast | D §7.16 | none | **None** | See row 31. |
| 10 | Sign in again when the token expires mid-session | RP (PR #127 note) | P3-02 covers a 401 at restore only | Partial | A 401 from PlaybackInfo shows "Something went wrong" and Retry cannot work. |
| 11 | Revoke a plain-HTTP confirmation | S | none | **None** | Today only clearing WebView storage revokes it. |
| 12 | LAN and remote address for one server | R §6.2 | none | **None** | Four rivals have it. |
| 13 | Approve another device's Quick Connect code | R §6.4 | none | **None** | Official web, Android, desktop, and iOS do this. |
| 14 | Lock a profile with a PIN | R §6.2 | none | **None** | Four rivals have it. |
| 15 | Plain copy for every sign-in gateway sentence | D §10 | P13-16 low, carried to P13-19 | Partial | Five sentences have no copy-table row. |

### 2.2 Home, browse, search, detail

| # | Capability | Source | Task | Coverage | Note |
|---|---|---|---|---|---|
| 16 | Home: Continue Watching, Next Up, Latest, hero | P M1, D §7.3 | P3-05, P13-08 (done) | Covered | |
| 17 | Libraries, series, seasons, collections, sort, filter | P M1 | P3-06, P13-10, P13-11 (done) | Covered | |
| 18 | Search | P M1 | P3-07, P13-12 (done) | Covered | |
| 19 | Item detail with media info and versions | P M1 | P3-08, P13-09 (done) | Covered | |
| 20 | Watched and favourite toggles; live refresh | P M1 | P3-08, P3-15 (done) | Covered | |
| 21 | New items appear without a restart (`LibraryChanged`) | A §3 | P3-15 covers `UserDataChanged` only | Partial | |
| 22 | Favorites view | D §7.5 ("only in Favorites views") | none | **None** | The heart mark has nowhere to show. |
| 23 | "3 new" subtitle on Latest posters | D §7.5 | none | **Mismatch** | Decision Q5 A skipped it. DESIGN.md still describes it. |
| 24 | `More` menu, Mark season watched | D §7.8 (removed by Q7 A) | none | **None** | RP: "proposed new task for the human". |
| 25 | Person images and ratings | D §7.7 (removed by Q8 A) | none | **None** | RP: "one later gateway task". |
| 26 | Watched and Favorite for a whole series; cast on the series page | RP | none | **None** | |
| 27 | Focus returns to the card you left | D §9 | none | **None** | RP says "fold into P13-18". P13-18's acceptance does not name it. |
| 28 | A designed "server unreachable" state while browsing | D principle 7, design checklist ("offline") | none | Partial | Row errors and playback errors exist. No app-level state. |
| 29 | Remove from Continue Watching; watchlist | R §5 (1,740 and 1,306 votes) | none | **None** | Both are server features marked "planned". Whether a client can do either today: unverified. |
| 30 | Playlists, extras and trailers, genre and people pages | R | none | **None** | Not promised. Listed for completeness. |

### 2.3 Feedback and shared UI

| # | Capability | Source | Task | Coverage | Note |
|---|---|---|---|---|---|
| 31 | Toasts: "Marked as watched", "Couldn't update watched state", "Signed out", settings confirmations | D §7.16, §7.18 | P13-03 built the primitive | **None** | No `ToastProvider` is mounted (`src/features/shared/ui/toast.tsx` is used only by the gallery). RP names P13-17 as owner; P13-17's acceptance does not. |
| 32 | Menu primitive | D §7.8 | none | **None** | Needed by row 24 and by an account menu. |
| 33 | Keyboard shortcut for toasts | RP idea | none | **None** | Parked idea. |
| 34 | Keyboard shortcut help | R (features #1776) | none | **None** | |

### 2.4 Player

| # | Capability | Source | Task | Coverage | Note |
|---|---|---|---|---|---|
| 35 | Original first; fallback; conversion indicator; Play original | P, decision 0002 | P10-01 to P10-11 (done) | Covered | P10-12 (live dogfood) is todo. |
| 36 | Auto-play next with a countdown | P M1 | P3-10, P13-14 (done) | Covered | Fixed at 10 s (`AUTO_PLAY_SECONDS`). |
| 37 | **Setting: auto-play next on or off** | D §7.18; R §7 (seven rivals) | P13-17 says only "Playback … sections exist" | **Partial** | The rework-plan scope lists it. The acceptance does not. No behaviour task. |
| 38 | **Setting: countdown 5, 10, or 15 s** | D §7.18 | as row 37 | **Partial** | |
| 39 | Skip intro and credits button | P M1 | P3-11, P13-14 (done) | Covered | |
| 40 | **Setting: skip intros** | D §7.18 ("offer button or never") | as row 37 | **Partial** | |
| 41 | Skip automatically | R §7 (eight rivals) | none | **None** | DESIGN.md offers only "button or never". |
| 42 | Recap, Preview, Commercial segments | R §6.4 | none | **None** | Fluster reads only Intro and Outro. |
| 43 | "Still watching?" guard | R (web, Android TV, Wholphin, Streamyfin) | none | **None** | |
| 44 | Trickplay previews; chapter gaps on the scrubber | P M1 | P3-12, P13-13 (done) | Covered | |
| 45 | Chapter list | D §7.14 (deferred by Q18 A) | none | **None** | |
| 46 | Track defaults from Jellyfin preferences | P M1 | P3-13 (done) | Covered | |
| 47 | Remember audio and subtitle choice per series | R (Jellyfin Desktop #749) | none | **None** | |
| 48 | Info sheet: Playback, Decoder, Renderer | P principle 5 | P3-18, P13-13 (done) | Covered | |
| 49 | Info sheet: Video and Audio sections; buffered range | D §7.14 (deferred) | none | **None** | Both need new engine data. |
| 50 | Volume remembered between sessions | P principle 3 (implied) | none | **None** | `security.md`: "No player preferences are persisted in this slice." |
| 51 | Screen stays awake during playback | P principle 3 (implied) | none | **None** | No idle-inhibit code exists under `src/` or `src-tauri/src/`. |
| 52 | Window size and position remembered | P principle 3 ("correct window behavior") | none | **None** | A Fladder desktop complaint (#932). |
| 53 | Playback speed | R | none | **None** | Needs a new typed command. |
| 54 | Subtitle and audio sync offset | R (182 votes) | none | **None** | Needs new typed commands. |
| 55 | Subtitle styling that leaves ASS alone | **P M2**, D §7.18 ("Styling comes in M2") | none | **None** | Promised in the roadmap. P5 has no task for it. |
| 56 | Dual subtitles | R (top Jellyfin Desktop request) | none | **None** | |
| 57 | Keyboard, media keys, MPRIS | P M1 | P3-14 (done) | Covered | Linux only. |
| 58 | Plain copy for a failed player command; correct title mid-playback | RP (P13-15 follow-ups) | carried to P13-19 | Partial | P13-19's acceptance does not name them. |
| 59 | HDR10 and HLG output; tone-mapping | P M2 | P5-01, P5-02 (todo) | Covered, thin | Two acceptance lines each. |
| 60 | Dolby Vision | D §7.9 shows the badge; R | none | **None** | No document says what Fluster does with a Dolby Vision file. |
| 61 | Audio passthrough | P M2 | P5-03 (todo) | Covered, thin | No acceptance for the settings row or for fallback when the receiver refuses. |
| 62 | Refresh-rate matching | P M2 | P5-04 (todo) | Covered, thin | One acceptance line. |

### 2.5 Settings screen

| # | Capability | Source | Task | Coverage | Note |
|---|---|---|---|---|---|
| 63 | Settings shell: sections, rows, pickers | D §7.18 | P13-17 | Covered | |
| 64 | Streaming limits as presets | D §7.18; Q21 A | P13-17 | **Mismatch** | DESIGN.md still says "plus custom Mbps". Q21 A chose presets only. |
| 65 | Section list on the left | Q22 A | P13-17 | Partial | Decided, not in acceptance. |
| 66 | Disabled rows for unbuilt features | Q23 A | P13-17 ("labelled slots") | Partial | Decided, not in acceptance. |
| 67 | Copy diagnostics, with server version and host class | Q24 B | P13-17 ("passes the redaction canary") | Partial | Content decided, not in acceptance. |
| 68 | A store for non-secret preferences | implied by rows 37–40, 50 | none | **None** | Only `fluster.streamingLimits` exists. |
| 69 | Changes confirm with a toast | D §7.18 | none | **None** | Row 31. |

### 2.6 Platforms, music, connected

| # | Capability | Source | Task | Coverage | Note |
|---|---|---|---|---|---|
| 70 | Linux AppImage | P M0 | done | Covered | |
| 71 | A week of evening use with no web fallback | P M1 "Done when" | P4-01, P4-02 | Covered | |
| 72 | macOS beta | P M3 | P6-01 | Covered, thin | |
| 73 | Windows beta | P M4 | P7-01 is the spike only | Partial | No task ships a build. |
| 74 | Music | P M7 | P11-01 to P11-07 | Covered | The best-specified future phase. |
| 75 | Cast target, SyncPlay, downloads | P M5 | P8-01, P8-02, P8-03 | Covered, thin | Two or three acceptance lines each. |
| 76 | TV and mobile shell | P M6 | P12-02, P9-01 (spikes), P13-18 (form) | Partial | No task builds the shell. |
| 77 | TV form: sign-in with on-screen keyboard | Q25 A | P13-18 | **Mismatch** | DESIGN.md §6 still says "Text entry happens only in search". |
| 78 | TV form: Up into the nav, tab-row nav, Menu key, episode row | RP | P13-18 | Partial | Listed in follow-ups, not in acceptance. |
| 79 | Live TV | P "Not for"; R (seven of nine rivals) | none | **None**, by decision | |
| 80 | Flatpak, auto-update | P (deferred); R | none | **None** | |
| 81 | Translations | R | none | **None** | Not promised. |

### 2.7 Success measures with no owner

| # | Measure (`PRODUCT.md`) | Task | Coverage |
|---|---|---|---|
| 82 | Zero conversions of a playable file | P0-04, P10-09 | Covered |
| 83 | No server job 10 s after stop | P10-09 | Covered |
| 84 | Play to first frame under 1.5 s | none | **None** |
| 85 | Resume accuracy within 10 s | P1-09 ("appears in the web UI") | Partial |
| 86 | Crash-free sessions above 99.5% | none | **None**. With no analytics, nothing can measure it. |

### 2.8 Tasks whose acceptance no longer matches the design

| Task | Status | What drifted |
|---|---|---|
| **P13-17** | todo, parked | Missing: auto-play, countdown, and skip rows; toasts; "Change server"; the Q21–Q24 answers. "Labelled slots for P5-03 and P3-02" predates Q23 A. |
| **P13-18** | todo, parked | Missing: focus restore after Back, Up into the nav, the TV tab row, the Menu key, TV sign-in (Q25 A), the TV episode row. Its dependency on P13-17 holds it behind Settings. |
| **P13-19** | todo, parked | "DESIGN.md matches what shipped" has no list. This review found six stale passages: §6 text entry, §7.5 "3 new", §7.16 toast uses, §7.18 custom Mbps, §7.18 opening paragraph (native selects), §7.18 Account. |
| **P3-01, P3-02** | todo | One credential, one session. The owner's direction is many. |
| **P3-10** | done | "Cancel returns to the series". Shipped behaviour (P13-14): Hide keeps playing and the series opens at the end. Harmless; the task is closed. |
| **P3-11** | done | "A skip button appears during Intro and Outro". Q19 A hides Skip credits when a next episode exists. Harmless; closed. |
| **P13-06** | done | The nav shows "Settings with the user's initial". An account switcher would change what that control is (§3). |
| **P5-01 to P5-04, P8-01 to P8-03, P6-01** | todo | Too thin to run. Each needs a plan and fuller acceptance before it starts. |

### 2.9 The pattern

The gaps are not random. They fall in four groups:

1. **Accounts** (rows 4–14). One piece of work, never planned as a whole.
2. **Preferences** (rows 37–43, 50, 68). The design shows the rows. No task owns the behaviour behind them or a place to store them.
3. **Feedback** (rows 9, 31, 69). The toast primitive exists and is mounted nowhere.
4. **Deferred-with-no-owner** (rows 22–27, 45, 49, 58). Each redesign task pushed something to "a later task" that was never created, because agents may not add tasks.

Group 4 is a process gap as much as a product gap. See proposal B14.

---

## 3. Multi-server recommendation

Direction from the owner: connect to as many Jellyfin servers as you like, and make it intuitive.

### 3.1 Where Fluster is today

- One signed-in gateway at a time (`src/app/session.tsx`).
- **Signing in to a second server revokes the first.** `signIn` calls `logout()` on the gateway it replaces (`session.tsx`, "Replacing a signed-in gateway must revoke its server session").
- The token lives only in the gateway object. It is gone when the window closes (`docs/security.md`, first line).
- Query caches are scoped to the gateway object and dropped on unmount (`src/features/query-scope.ts`, `gcTime: 0`).
- One realtime socket, owned by Rust, reconnected when the gateway changes (`useServerSocket` in `session.tsx`).
- Good news: the DeviceId is already derived from install id, server id, and username (`src/lib/jellyfin/device-id.ts`, P1-06). The server keeps one token per DeviceId, so each account already gets its own. Streamyfin still has this bug open (research §6.2).
- Good news: plain-HTTP confirmations are already stored per server `Id` and origin.

### 3.2 How the best clients do it

From research §6:

- **Swiftfin and Fladder open on people, not servers.** A grid of account tiles, each labelled with its server. One tap switches.
- **Android TV separates three actions:** switch (keep the token), sign out (drop it), remove (forget the entry).
- **Swiftfin, Wholphin, Fladder, and Streamyfin** let each profile carry an optional PIN.
- **Swiftfin, Findroid, Fladder, and Streamyfin** store a LAN and a remote address per server.
- **Only Swiftfin and Streamyfin** keep tokens in the OS secure store. Android TV and Fladder do not revoke the token on sign-out.
- **Nobody in the Jellyfin mainstream merges libraries.** Infuse, Moonfin, and Plezy do. Plex's merged Continue Watching draws duplicate complaints.

Fluster can be better than all of them on two points it already cares about: tokens in the keyring, and a sign-out that really revokes.

### 3.3 Options

#### Option A: saved accounts, one active (recommended)

Fluster remembers any number of accounts. An account is one user on one server. One account is active at a time. Switching swaps the whole app to that account.

- **What you see.** Your initial in the nav opens an account menu: every saved account as "name · server", then "Add account" and "Manage accounts". Choosing one switches and lands on Home.
- **At launch.** One account: straight to Home. Several: the last one used, or a "Who's watching?" screen, by a setting (Q5).
- **Libraries.** Kept separate. Home shows the active account's server only.
- **Cost.** M to L. Four tasks after the keyring (B3–B6).

#### Option B: saved accounts, all kept live

As A, but every remembered account keeps a gateway, a validated token, and a socket open.

- **Gain.** Switching is instant, and Fluster could badge another account ("2 new on Hearth").
- **Cost.** Several tokens in WebView memory at once. Several sockets, which changes the `realtime_connect` command (one connection today). Background requests to servers the user is not looking at.
- **Verdict.** The gain over A is a few hundred milliseconds. Not worth the added exposure.

#### Option C: one Home across all servers

Continue Watching, Next Up, and search merge every signed-in account.

- **Gain.** No switching at all. It is what Plezy and Moonfin sell.
- **Cost.** L, and it reaches everywhere. Item ids become (server, item). Routes, query keys, the player, playstate, and prefetch all take a server. Duplicates across servers need a rule. A slow or offline server must not block Home. It needs everything in B first.
- **Verdict.** A real feature for people with two servers they treat as one. A poor first step.

#### Recommendation

**Option A now, built so C stays possible.** Concretely: key every stored thing by account id (`ServerId` + `UserId`) from the first task, and never by "the session". Revisit C after the dogfood week, as a spike (B13, Q13).

### 3.4 Option A in detail

**The unit is the account.** Saved servers are keyed by `ServerId` (already a `DOMAINS.md` rule). An account is `ServerId` + `UserId`. The picker shows people; each tile carries its server's name (Q3).

**Switcher placement (desktop).**

- The nav's right end becomes the account control: the user's initial, opening a menu. Settings keeps its gear.
- The menu lists accounts, then "Add account", then "Manage accounts".
- Settings › Account becomes Settings › Accounts: the full list with Sign out and Remove per row, and the stay-signed-in state.

**What "Change server" becomes.**

- Inside sign-in it stays as it is: a quiet button back to step 1.
- In Settings it is replaced by "Add account". Adding never signs anyone out.
- Sign-in step 1 gains "Your servers" above "On this network", so a known server is one press.

**Sign-out semantics (Q6).** Three actions, three plain labels:

| Action | Token | Server session | Tile |
|---|---|---|---|
| **Switch** to another account | kept | kept | kept |
| **Sign out** of this account | deleted from the keyring | revoked (`POST /Sessions/Logout`) | kept, marked "Signed out" |
| **Remove** this account | deleted | revoked | deleted; the server is forgotten when its last account goes, with its plain-HTTP confirmation |

"Signed out" confirms with a toast (D §7.16).

**Per-account and per-server state.**

| State | Scope | Today |
|---|---|---|
| Token | account | gateway memory only |
| DeviceId | account | already derived per account |
| Plain-HTTP confirmation | server `Id` + origin | already so |
| Server addresses | server | one URL |
| Streaming limits | install, by host class | already so; keep |
| Playback preferences | install (Q9) | none exist yet |
| Last-used account | install | none |

**The TV form.**

- A full-screen "Who's watching?" grid at launch when several accounts exist. D-pad, OK, Back.
- Tiles are 64 px targets or larger with the name and server in text. No hover.
- The nav's account control opens the same screen instead of a menu.
- "Add account" leads with discovered servers and Quick Connect (Q25 A).

### 3.5 Security implications

`docs/security.md` today: "Jellyfin access tokens are session-only fields inside `JellyfinGateway`." P3-01 must change that line. Multi-account raises five further points for that decision record:

1. **One keyring entry per account.** Keyed by account id. The value is the token alone. Rust owns it (P3-02 already says so).
2. **New Tauri commands.** Storing, loading, and deleting a credential need typed commands. That is an architecture change: the allowlist test, `ARCHITECTURE.md` §2, and `docs/security.md` all change (I3).
3. **The token returns to WebView memory on restore.** The gateway makes the HTTP calls, so it must hold the token. This is the same exposure as today after sign-in. It must still never reach WebView storage, Query caches, or React state.
4. **Never send a stored token until the server proves its `Id`.** Before any authenticated request on restore, probe `/System/Info/Public` at the saved address and require the saved `ServerId`. Otherwise a different server now living at that address would receive the token.
5. **Plain-HTTP LAN servers are the hard case (Q8).** The `Id` is public, so the probe does not stop an impostor (decision 0001, decision 7, accepted for confirmations). With stored tokens, a laptop that auto-restores on another network could hand a token to a device that holds the same address and a copied `Id`. Session-only tokens never had this problem. The decision record must choose: restore automatically, require one press, or refuse to store tokens for plain-HTTP servers.

Two things get better:

- Under option A only the active account's token is in memory. Under B all are.
- Sign out revokes on the server. Android TV and Fladder leave the token live (research §6.2).

A local PIN (Q11) is a household courtesy, not a security boundary. Anyone with the OS login can read the keyring.

### 3.6 Architecture implications

| Area | Today | Under option A | Under option C |
|---|---|---|---|
| Session | one gateway in React state | one active gateway, plus an account store behind a port | a registry of gateways |
| Replacing a gateway | revokes the old one | must **not** revoke on switch; revoke only on Sign out or Remove | same |
| Query caches | scoped by gateway object, `gcTime: 0` | unchanged; a new gateway is a new scope | keys carry the account id; merged queries fan out |
| Realtime | one socket in Rust, reconnects on gateway change | unchanged | one socket per account; the command surface changes |
| Player | one session | a switch first stops playback and sends the stopped report through the old gateway | the plan carries its account |
| Routes | item ids only | a switch resets to Home, so an id from server A is never asked of server B | every route carries the server |
| Preferences | `fluster.streamingLimits` | one versioned, validated store | same |
| TV shell | none | the account store is a port in the shell-neutral core (P12-01 rules) | same |

Invariants touched by option A: **I3** (new commands), **I4** (token handling on restore), **I5** (each address of a server is classified on its own). I1, I2, I6, I7, I8, I9 are untouched.

---

## 4. Proposed backlog changes

Every item is a proposal. New task ids are suggestions. Models follow `AGENTS.md`: Sonnet for TypeScript, Opus for native and for plans, Fable for high-risk specs.

### Summary

| # | Proposal | Kind | Cost | Invariant or security doc |
|---|---|---|---|---|
| B1 | Mount toasts app-wide | new task | S | none |
| B2 | Rewrite P13-17's acceptance as the Settings shell | edit | S–M | none |
| B3 | Widen P3-01 and P3-02 to many accounts | edit | M | **I3, I4, `security.md`** |
| B4 | Remember servers and accounts | new task | M | `security.md` (confirmation revoke) |
| B5 | Switch accounts without signing out | new task | M | **I4**; changes revoke-on-replace |
| B6 | Account switcher and Settings › Accounts | new task | M | none |
| B7 | Sign in again when a token expires | new task | S | none |
| B8 | Preferences store, auto-play, and skip settings | new tasks (3) | M | `security.md` (one sentence) |
| B9 | Player comforts: awake, volume, window | new tasks (2) | M | native; no new command expected |
| B10 | Chapter list; Info sheet Video and Audio | new tasks (2) | M | native data for the second |
| B11 | Detail and browse leftovers | new tasks (2) | M | none |
| B12 | Move P13-18 and split P13-19 | reorder, split, edit | — | CI (visual gate) |
| B13 | Later accounts work: addresses, Quick Connect approval, PIN, unified Home spike | new tasks (4) | S to L | **I5** for addresses |
| B14 | Close the "deferred with no owner" hole | process | S | none |
| B15 | Thicken P5 and P8; add subtitle styling; state the Dolby Vision position | edit, new task | S now | none now |

### B1. New task: mount toasts app-wide

- **Why.** Rows 9, 31, 69. Three screens are waiting on it. It is small and unblocks B2 and B6.
- **Proposed id.** P13-20. Depends on P13-03. Sonnet, `implementer`.
- **Acceptance.**
  - A `ToastProvider` is mounted once at the app root, and features raise toasts through one hook.
  - Marking watched or favourite shows "Marked as watched" (or the matching sentence); a failure shows "Couldn't update watched state" and stays until dismissed.
  - Toasts never take focus, use `role="status"` (`alert` for errors), and last 5 s (DESIGN.md §7.16).
  - Detail's inline `role="alert"` for this failure is removed.
  - Toasts are not shown in the player; the OSD speaks there.
  - A Testing Library test covers the queue, the timeout, and dismissal.
  - The standing P13 items (screenshots, design review, no weakened journey).
- **Verify.** `pnpm check && pnpm test:e2e`.

### B2. Edit P13-17: make it the Settings shell, and unpark it

- **Why.** Row 63–67. P13-17 is parked because its acceptance and the design disagree. The Q21–Q24 answers already settle the design. Feature rows (auto-play, skip, accounts) belong to the tasks that build the behaviour (B6, B8), each adding its own row to the shell.
- **Proposed acceptance (replaces items 1–3; the four standing items stay).**
  - The Settings screen uses `SettingsPage`, `SettingsSection`, `SettingsRow`, and `Picker`, with a section list on the left and content on the right; compact windows drill in (Q22 A).
  - Sections exist: Playback, Subtitles, Account, About & diagnostics.
  - Playback holds the local and remote streaming limits as preset pickers with the same values and storage (Q21 A).
  - Unbuilt rows (audio passthrough, stay signed in) show disabled with "Not available yet" (Q23 A). Subtitles shows one sentence saying languages follow the Jellyfin account.
  - Account shows the server name, the address in Mono, the user, and Sign out. Sign out is reachable only from Settings and confirms with a "Signed out" toast.
  - "Copy diagnostics" copies app version, OS, libmpv version, renderer, decode mode, Jellyfin server version, and host class, and nothing else (Q24 B). It passes the redaction canary tests.
  - A changed limit confirms with a toast.
- **Dependencies.** Add P13-20 (B1).
- **Also needs.** DESIGN.md §7.18 amended in the same pull request: presets only, the opening paragraph, the Account line.
- **Cost.** S–M. No invariant change.

### B3. Edit P3-01 and P3-02: many accounts

- **Why.** Row 4, §3.5. Writing the keyring for one credential and then widening it means doing the security review twice.
- **P3-01, proposed acceptance.**
  - A decision record covers opt-in keyring storage **for any number of accounts**, one entry per `ServerId` + `UserId`.
  - It lists every new Tauri command, with its typed arguments.
  - It states the restore rule: no authenticated request until `/System/Info/Public` at the saved address returns the saved `ServerId`.
  - It decides how stored tokens behave for plain-HTTP LAN servers (Q8).
  - It defines Switch, Sign out, and Remove (§3.4), and where the non-secret account list lives.
  - It records the option chosen in §3.3.
  - `docs/security.md` and `ARCHITECTURE.md` reflect the decision. The owner approves it.
- **P3-02, proposed acceptance.**
  - Rust owns a credential vault backed by Secret Service on Linux, holding one token per account.
  - Stay signed in is chosen per account at sign-in; restoring validates with `GET /Users/Me` after the `ServerId` check.
  - A 401 clears that account's credential only and asks that account to sign in again.
  - A token never enters WebView storage, a Query cache, or React state; a canary test proves it for the restore path.
  - With no keyring available, Fluster says so and stays session-only.
  - The command allowlist test and `docs/security.md` change in the same pull request.
- **Model.** Fable spec (high risk), Opus `native-engineer`, `guardian` review.
- **Cost.** M. **Touches I3, I4, and `docs/security.md`.**

### B4. New task: remember servers and accounts

- **Why.** Rows 5, 11. PRODUCT.md M1 promises "a remembered server and user".
- **Proposed id.** P3-19. Depends on P3-01. Sonnet; `guardian` review (it sits beside credentials).
- **Acceptance.**
  - Fluster keeps a list of servers keyed by `ServerId` (name, addresses) and of accounts (`ServerId`, `UserId`, user name). The list holds no token and nothing derived from one.
  - The account store is a port in the shell-neutral core; the P12-01 checks pass.
  - Sign-in step 1 lists "Your servers" above "On this network"; choosing one skips typing the address.
  - A server's entry shows its plain-HTTP confirmation and can revoke it.
  - A corrupt or hand-edited list is ignored, never trusted (as `streaming-limits.ts` does).
  - Unit tests cover the store; a Playwright journey signs in twice and finds the server remembered.
- **Cost.** M. `docs/security.md` gains the revoke path.

### B5. New task: switch accounts without signing out

- **Why.** Row 6. The session today revokes the old account when a new one signs in.
- **Proposed id.** P3-20. Depends on P3-02, P3-19. Fable spec, Sonnet implement, `guardian` review.
- **Acceptance.**
  - The session can switch to a saved account. Switching does not call `POST /Sessions/Logout`.
  - Sign out revokes on the server and deletes that account's credential. Remove does both and forgets the account.
  - A switch during playback first stops playback and sends the stopped report through the old account's gateway.
  - After a switch, the realtime socket reconnects for the new account and no request carries the old token (test).
  - After a switch, no screen shows the previous account's data, and the route resets to Home (test).
  - Only the active account's token is in memory.
  - Coordinator and session tests cover each case and fail without the change.
- **Cost.** M. **Touches I4.** Changes the documented revoke-on-replace behaviour.

### B6. New task: account switcher and Settings › Accounts

- **Why.** Rows 6, 7. This is the "intuitive" part.
- **Proposed id.** P13-21. Depends on P3-20, P13-17, P13-20. Sonnet. **Needs design answers first (Q3–Q6).**
- **Acceptance.**
  - The nav's account control opens a menu of saved accounts as "name · server", then "Add account" and "Manage accounts"; arrows, Enter, and Escape work.
  - Choosing an account switches and lands on Home in one activation.
  - With several accounts and no automatic choice, launch shows "Who's watching?".
  - Settings › Accounts lists every account with Sign out and Remove. Remove asks for confirmation in a `Dialog` with the safe action focused.
  - "Add account" opens sign-in and never signs anyone out.
  - Empty Home offers "Add account" beside "Open settings".
  - In the TV form the picker is a full-screen grid inside the title-safe insets.
  - A Playwright journey adds two accounts, switches, signs one out, and removes one.
  - The standing P13 items.
- **Also needs.** DESIGN.md §7.1, §7.18, §7.20 amended; a Menu primitive (row 32).
- **Cost.** M.

### B7. New task: sign in again when a token expires

- **Why.** Row 10. Today the user sees "Something went wrong" and Retry cannot work.
- **Proposed id.** P3-21. Depends on P3-19. Sonnet.
- **Acceptance.**
  - A 401 from any signed-in request shows "Your sign-in to {server} has ended." with "Sign in again", which opens sign-in for that server and user.
  - Playback in progress is stopped cleanly first.
  - Other saved accounts are untouched.
  - Copy joins the DESIGN.md §10 table. Tests cover catalog, playback info, and playstate calls.
- **Cost.** S.

### B8. New tasks: preferences store, auto-play, and skip settings

- **Why.** Rows 37–41, 68. These are the examples that started this review.

**P3-22: preferences store.** Sonnet. Depends on P13-17.

- One versioned store for non-secret preferences, validated on read like `streaming-limits.ts`; an unknown value falls back to the default.
- Streaming limits move into it with their stored values kept (migration test).
- A port in the shell-neutral core.
- `docs/security.md`'s sentence "No player preferences are persisted in this slice" is updated.

**P3-23: auto-play next settings.** Sonnet. Depends on P3-22.

- Settings › Playback has "Play next episode automatically" (on by default) and "Countdown" (5, 10, or 15 s; default 10).
- With auto-play off, no Up Next countdown runs; the card still offers Play now at the end.
- The countdown length drives the card, the fill, and the announcements.
- Unit tests for timing; the auto-play journey runs with each setting.

**P3-24: skip settings.** Sonnet. Depends on P3-22. **Needs Q14.**

- Settings › Playback has "Intros" and "Credits", each: Show a Skip button (default), Skip automatically, or Do nothing.
- Skip automatically seeks past the segment once and shows the OSD line "Skipped intro"; seeking back into the segment does not skip again.
- Do nothing shows no button.
- Q19 A still holds: with a next episode, Up Next replaces Skip credits.
- Unit tests per mode; a Playwright journey for automatic skip.

- **Cost.** M in total. DESIGN.md §7.18 amended (three modes).

### B9. New tasks: player comforts

- **Why.** Rows 50–52. A daily driver that lets the screen blank mid-film will fail the dogfood week.

**P3-25: keep the screen awake while playing.** Opus, `native-engineer`. **Check first whether libmpv already does this in Fluster's embedding; unverified.**

- While video plays, the desktop does not blank or lock from idleness; when paused, stopped, or closed, normal behaviour returns.
- Rust drives it from play state, like MPRIS; no new Tauri command.
- A Rust test covers the state transitions; the manual Wayland check is written down.

**P3-26: remember volume, mute, and the window.** Sonnet (Opus if the window part needs Rust).

- Volume and mute persist across sessions through the preferences store.
- The window reopens at its last size and maximised state.
- Tests cover the store; the window check is written down.

- **Cost.** M. Native, serial with other `src-tauri/` work.

### B10. New tasks: chapter list; Info sheet Video and Audio

- **Why.** Rows 45, 49. Both were deferred by name with no task.

**P13-22: chapter list.** Sonnet. Depends on P13-13.

- A Chapters button opens a right sheet of chapter names and times; Enter seeks; Escape closes and returns focus.
- The button is absent when the item has no chapters.
- Thumbnails come from trickplay at the chapter start when available.

**P13-23: Info sheet Video and Audio; buffered range.** Opus, `native-engineer`, then Sonnet.

- The snapshot gains typed video and audio facts (codec, resolution, range, channels, output format) and a buffered position, with no new command if the existing snapshot can carry them.
- The Info sheet shows them in Mono; redaction tests cover the new fields.
- The scrubber shows the buffered range.

- **Cost.** M.

### B11. New tasks: detail and browse leftovers

- **Why.** Rows 22–27. Low urgency, but each was promised somewhere.

**P13-24: restore focus after Back.** Sonnet.

- Returning from the player or a detail page focuses the card that was left, on Home, Library, Search, and Series (DESIGN.md §9).

**P3-27: Favorites view, series toggles, Mark season watched.** Sonnet, `jellyfin-api`.

- A Favorites entry lists favourite movies, shows, and episodes; the heart mark shows there.
- The series page has Watched and Favorite toggles; a season can be marked watched.
- Contract fixtures on 10.11.7 and 12.4.0 back each new call.

Person images and ratings (row 25) stay unscheduled unless the owner wants them (Q20).

- **Cost.** M.

### B12. P13-18 and P13-19: where they go

**P13-18 (10-foot form).**

- **Proposal.** Run it right after P13-17, not after the account work. Add one standing acceptance line to every later UI task: "works in the TV form inside the title-safe insets".
- **Why.** The owner wants TV sooner. Waiting for accounts would hold it for weeks. The account picker (B6) already carries its own TV acceptance.
- **Proposed added acceptance.**
  - Up from the first row reaches the nav; the TV nav is the tab row of DESIGN.md §6.
  - Menu opens details where Enter plays.
  - Sign-in works with the on-screen keyboard, leading with discovered servers and Quick Connect (Q25 A); DESIGN.md §6 is amended.
  - A season's episodes are a horizontal row with the overview under the focused card.
- **Move out.** Focus restore after Back goes to P13-24 (B11); it is not TV-specific.

**P13-19 (design QA).** Split it.

- **P13-19a, now:** "The screenshot harness runs as a gating visual diff in CI." Many UI tasks are about to land; the gate should protect them. **This changes CI; call it out in the pull request.**
- **P13-19b, last in P13:** the audit pass and the docs sync, with the stale passages from §2.8 listed in its acceptance, plus the P13-15 and P13-16 carried lows (rows 15, 58).

### B13. Later accounts work

| Proposed id | Task | Cost | Note |
|---|---|---|---|
| P3-28 | LAN and remote address per server, tried in order, each `Id`-checked and host-classified on its own | M | **I5.** Each plain-HTTP address needs its own confirmation. Fable spec. |
| P3-29 | Approve another device's Quick Connect code from Settings › Accounts | S | One new gateway call (`POST /QuickConnect/Authorize`). |
| P3-30 | Optional PIN per account on this device | M | Not a security boundary; say so in the UI. Q11. |
| P15-01 | Spike: one Home across servers (option C). A decision record only. | L | After the dogfood week. Q13. |

Each gets full acceptance when the owner schedules it.

### B14. Close the "deferred with no owner" hole

- **Why.** §2.9, group 4. Agents may not add tasks, so "a later task" never appears.
- **Proposal.** Add `tasks/proposed.json` (or a "Proposed" section the validator ignores). A task's pull request may append to it. The owner promotes entries. `WORKFLOW.md` gains one rule: "A deferral names a proposed task or it is not a deferral."
- **Cost.** S. Changes `WORKFLOW.md` and the prd validator (P0-09).

### B15. P5 and P8: thicken; add subtitle styling; state the Dolby Vision position

- **Edit P5-01.** Add: "The spike reports what a Dolby Vision profile 5 and profile 8 file does on the chosen path." Then `PRODUCT.md` can say plainly what Fluster does with Dolby Vision (Q17).
- **New P5-05: subtitle styling.** Promised in M2 (row 55). Size, position, and colour for text subtitles; ASS authoring is never overridden; each option is a typed command. Acceptance to be written with the P5 plan.
- **Edit P5-02 to P5-04, P8-01, P8-03.** Add the line P8-02 already has: "A plan exists before implementation." Their current two-line acceptance cannot be run or checked.
- **Cost.** S now. The P5 and P8 plans are each L later.

### Proposed order

```text
P13-20 toasts ─→ P13-17 Settings shell ─┬→ P13-18 TV form ─→ … ─→ P13-19b docs sync
P13-19a visual gate (now, parallel)     ├→ P3-22 prefs ─→ P3-23 auto-play, P3-24 skip, P3-26 volume
                                        └→ P13-22 chapters
P3-01 ADR ─→ P3-02 keyring ─→ P3-19 remember ─→ P3-20 switch ─→ P13-21 switcher
                                             └→ P3-21 sign in again
P3-25 keep awake (native, serial)
then P4 dogfood week ─→ P3-27, P3-28, P3-29, P13-23, P13-24 by what the week shows
```

The account chain and the preferences chain touch different code and can run in parallel worktrees. Native work stays serial.

**What this adds before the dogfood week:** about twelve tasks, mostly S and M. The alternative is to dogfood without staying signed in to more than one server and without the settings, and find the same gaps the slow way.

---

## 5. Decision list

Each question stands alone. "Rec" is a recommendation only.

### Positioning

**Q1. How should Fluster describe its edge?**
`PRODUCT.md` says Fluster aims to replace every other client on every screen. The research shows its real lead is narrower: playing the original file on the desktop and being honest about conversions.
- A: Lead with the narrow edge: "plays the original, and tells you when it can't". Keep "every screen" as the long-term aim.
- B: Keep today's wording. Fluster is a full replacement first.
- C: Narrow the product: desktop only, drop TV and mobile from the roadmap.
- **Rec: A.** It matches what is built and what rivals lack.

### Servers and accounts

**Q2. Which multi-server model?**
Fluster holds one server and one user today.
- A: Any number of saved accounts, one active at a time, libraries kept separate.
- B: As A, but every account stays connected in the background for instant switching.
- C: One Home that merges every server.
- **Rec: A now.** Store everything by account so C stays possible. B adds exposure for little gain. C is large; see Q13.

**Q3. What does the user pick: a person or a server?**
- A: People first. One list of accounts, each shown as "name · server" (Swiftfin, Fladder).
- B: Server first, then the user on it (Android TV, Wholphin).
- **Rec: A.** One step, and most people have one server.

**Q4. Where does the account switcher live on desktop?**
The nav's right end shows Settings with the user's initial today.
- A: The initial becomes an account menu (accounts, Add account, Manage accounts). Settings keeps its own gear.
- B: Only in Settings › Accounts.
- C: Only on a "Who's watching?" screen at launch.
- **Rec: A,** with the full list also in Settings.

**Q5. With several accounts, what happens at launch?**
- A: Open the last account used. A setting can ask "Who's watching?" every time.
- B: Always ask.
- C: Desktop opens the last account; the TV form always asks.
- **Rec: C.** A desk is usually one person's. A TV is shared.

**Q6. What do Switch, Sign out, and Remove mean?**
- A: Three actions. Switch keeps the sign-in. Sign out revokes it on the server and keeps the tile. Remove also forgets the account.
- B: Two actions. Switch, and Sign out (which also removes).
- **Rec: A.** It matches what Android TV users already know, and Sign out really revokes.

**Q7. Is "stay signed in" on or off by default?**
`PRODUCT.md` asks for an explicit choice. Tokens are session-only today.
- A: A visible switch at sign-in, **on** by default when the OS keyring is available.
- B: A visible switch at sign-in, **off** by default.
- C: A global setting, off by default.
- **Rec: A.** Every rival remembers by default; the choice stays visible. This changes `docs/security.md`.

**Q8. Stored sign-ins for plain-HTTP home servers?**
A server's `Id` is public. On another network, a device at the same address could copy it and receive a stored token. Session-only tokens never had this risk.
- A: Restore automatically after the `Id` check; accept the risk in the decision record, as decision 0001 did for confirmations.
- B: Restore only after one press ("Continue as {name} on {server}, unencrypted").
- C: Never store tokens for plain-HTTP servers.
- **Rec: B.** Most home servers are plain HTTP, so C makes the feature useless for them, and A sends a token with no one watching. **Security decision; goes in the P3-01 record.**

**Q9. Are playback settings shared or per account?**
Auto-play, skip, volume, and streaming limits.
- A: One set for this computer.
- B: One set per account.
- **Rec: A.** Simpler, and they describe the device more than the person.

**Q10. LAN and remote address for one server: now or later?**
Four rivals store both and pick whichever answers.
- A: Later (P3-28). Store addresses as a list from day one so nothing is redone.
- B: In the first accounts release.
- **Rec: A.** It needs its own security review (each plain-HTTP address needs its own confirmation).

**Q11. A PIN per profile?**
Four rivals offer one. It is a courtesy, not security: anyone with the OS login can read the keyring.
- A: Not now; revisit with the TV shell.
- B: Build it with the switcher.
- C: Never.
- **Rec: A.**

**Q12. Should Fluster approve another device's Quick Connect code?**
The official web, Android, desktop, and iOS clients can.
- A: Yes, as a small later task (P3-29).
- B: No.
- **Rec: A.**

**Q13. One Home across all servers?**
Plezy and Moonfin sell this. Plex's version draws duplicate complaints.
- A: Not now. Run a spike after the dogfood week and decide then.
- B: Plan it now as the next step after accounts.
- C: Never; servers stay separate.
- **Rec: A.**

### Playback settings

**Q14. How many skip modes?**
DESIGN.md §7.18 says "offer button or never". Eight of nine rivals also skip automatically.
- A: Three modes for intros and for credits: show a button, skip automatically, do nothing. Default: button.
- B: Two modes, as DESIGN.md says.
- **Rec: A.**

**Q15. Recaps, previews, and commercials?**
Jellyfin marks these too. Fluster reads only intros and credits.
- A: Not now.
- B: Add them with the same three modes, default "do nothing".
- **Rec: A.** They are rarely populated; add them when someone asks.

**Q16. A "Still watching?" prompt?**
Web, Android TV, Wholphin, and Streamyfin have one.
- A: Not now.
- B: Ask after three episodes with no input.
- **Rec: A.** Principle 7; revisit after the dogfood week.

**Q17. What does Fluster say about Dolby Vision?**
The detail page shows a Dolby Vision badge. No document says what playback does.
- A: Decide after the P5-01 spike reports on profiles 5 and 8. Until then, say nothing new.
- B: State now: "Dolby Vision files play in SDR until HDR lands."
- **Rec: A,** plus the extra line in P5-01.

**Q18. Which player comforts, and when?**
Speed and sync offsets each need a new typed player command, which is an architecture change.
- A: Before the dogfood week: keep the screen awake, remember volume and window. After it: playback speed and subtitle offset. Later: audio offset, dual subtitles.
- B: All of them before the dogfood week.
- C: Only keep-awake and volume; nothing else is planned.
- **Rec: A.**

**Q19. Remember audio and subtitle choices per series?**
A top request on the official desktop client.
- A: Yes, after the dogfood week.
- B: No; rely on Jellyfin's language preferences.
- **Rec: A.**

### Backlog shape

**Q20. Which detail leftovers get tasks?**
Deferred during P13: Favorites view, series Watched and Favorite, Mark season watched, a `More` menu, person images, ratings.
- A: Favorites view, series toggles, and Mark season watched as one task (P3-27). Drop the `More` menu. Leave person images and ratings unscheduled.
- B: All of them.
- C: None for now.
- **Rec: A.**

**Q21. What happens to P13-17 (Settings)?**
It is parked. Its acceptance predates four design answers.
- A: Unpark now as the Settings shell with the acceptance in B2. Feature rows arrive with their own tasks.
- B: Hold it until accounts and preferences exist, then build Settings once.
- **Rec: A.** Every later row needs the shell.

**Q22. When does P13-18 (TV form) run?**
- A: Right after P13-17. Later UI tasks each carry a TV-form acceptance line.
- B: After the account switcher, so it covers every screen in one pass.
- **Rec: A.** TV is wanted sooner, and the switcher carries its own TV acceptance.

**Q23. Split P13-19 (design QA)?**
- A: Yes. The visual-diff CI gate now; the audit and docs sync last.
- B: No; keep it whole at the end.
- **Rec: A.** The gate should protect the dozen UI tasks ahead. **Changes CI.**

**Q24. Toasts as their own task, first?**
- A: Yes (P13-20), before P13-17.
- B: Fold into P13-17.
- **Rec: A.** Three screens wait on it.

**Q25. Should deferred work have a place to live?**
Agents may not add tasks, so the "later task" that P13 work deferred to was often never created (§2.9).
- A: Add a proposed-tasks list that pull requests may append to and the owner promotes (B14).
- B: Keep follow-ups in `rework-plan.md` and review them by hand.
- **Rec: A.**

**Q26. Thin future tasks (P5, P8, P6-01)?**
Each has two or three acceptance lines.
- A: Add "A plan exists before implementation" to each now; write full acceptance when its phase starts.
- B: Write full acceptance for all of them now.
- **Rec: A.** B would be guesswork before the HDR spike.

**Q27. Success measures nobody measures?**
"First frame under 1.5 s" and "crash-free above 99.5%" have no task. With no analytics, the second cannot be measured.
- A: Record first-frame time in the dogfood log (add to P4-01). Replace the crash-free percentage with "no crash in the dogfood week".
- B: Leave both as aspirations.
- **Rec: A.**

**Q28. Live TV?**
Out of scope today. Seven of nine rivals have it.
- A: Stays out until after M2; `PRODUCT.md` says so plainly.
- B: Write the decision record now.
- **Rec: A.**
