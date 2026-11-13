# Streaming wish list: where Fluster could go beyond

Status: **proposal, 2026-11-12. D1 to D12 are open.** One task was added to `tasks/prd.json` (P16-11); it records server facts and shows a viewer nothing. Everything else waits for the owner.

This is a Fable 5.2 product-review pass under the `AGENTS.md` "Tasks" rule. It triages `tasks/backlog.md` against new research and recommends. The owner decides.

## The owner's request (2026-11-12)

"Look on forums and elsewhere for wish list items that people wish they had in their video watching apps, so that we can actually not only take features that exist today in different apps and hopefully improve upon them, but also look for new features that could put our app above and beyond."

## Inputs and limits

- Research: [`docs/research/streaming-wishlist.md`](../../research/streaming-wishlist.md), cited as **Wishes** with its numbers (W1 to W46). It completes [`streaming-ux-gripes.md`](../../research/streaming-ux-gripes.md) and [`streaming-ux-loves.md`](../../research/streaming-ux-loves.md).
- Settled answers: `product-review.md` (Q1 to Q28), `discovery-and-profiles.md` (Q1 to Q16), `streaming-loves.md` (D1 to D8). Every one is treated as settled.
- `PRODUCT.md`, `ARCHITECTURE.md` §4, `DESIGN.md`, `tasks/prd.json` and `tasks/backlog.md` at `1c9f6b7`.
- Jellyscale's `compat/endpoints.yaml` and `docs/status.md` at `93a0f3f`, read only.
- Limits, in full in Wishes "Method and limits": Reddit, Kodi's forum and wiki, and app-store reviews were not read; nothing was observed in a running app; vote boards count people who vote; nearly every "does any app do it" answer rests on documents and threads, not on use.
- No code was read in depth for this pass. Statements about what Fluster's player can already do are marked where they are unverified.

---

## 1. What the evidence says

1. **The most-voted wishes are already decided.** A watch list, clearing Continue Watching, watch together, and a history account for the largest counts, and each has an owner's answer. This pass found nothing that overturns one (§3).
2. **The best openings are in the player, not on Home.** The widest evidence is about hearing dialogue (Wishes W1). The one personal-media answer is paid and makes the server convert the audio. Fluster decodes on the device, so it can do this with the original file. That is the single clearest place to go "above and beyond" while staying inside the four pillars.
3. **Three small, old, unsolved requests suit Fluster exactly**: captions for the line you missed (W3), a series page that cannot spoil (W13), and two accounts watching on one screen (W23). Each has modest votes, years of persistence, and no good answer in any personal-media client found.
4. **Several attractive ideas have no evidence**: recaps, pickers by mood or time, a year in review. They are cheap guesses. This proposal says so where it recommends any.
5. **Some wishes cannot be met privately** (missing episodes, alternate orders, profanity filters, subtitle search). They need outside data and are left out.

---

## 2. Recommendations

Tied to the verdicts in Wishes §1. Each becomes a task only through its decision in §7.

| # | Recommendation | Verdict behind it | Decision |
|---|---|---|---|
| R1 | **Try voice clarity and night mode on the device**, as a spike that reports before anything ships. | W1: strong unmet need for the problem; use of remedies unmeasured. W2: real but niche. | D1 |
| R2 | **Show captions for the stretch a viewer skips back over, and start a resume a few seconds early.** | W3: solved by one vendor, absent in personal media. W4: real but niche. | D2 |
| R3 | **Offer a spoiler-safe setting that covers every surface.** | W13: real but niche; unsolved for 14 years. | D3 |
| R4 | **Check the server first, then decide on "watching with".** | W23: real but niche; unsolved everywhere. | D5; P16-11 |
| R5 | **Label audio description, let it be preferred, and audit the app with a screen reader.** | W27, W29: need without votes. | D6 |
| R6 | **A sleep timer in episode units**, low priority. | W36: real but niche; weak evidence, small cost. | D4 |
| R7 | **Leave recaps, a time-based picker, the cast overlay, and dual subtitles in the backlog** until the dogfood week says otherwise. | W14, W19: unproven. W41, W5: niche. | D7, D8, D10, D12 |
| R8 | **Carry five additive requests to Jellyscale.** | W23, W27, W2, W19, W14 | D11 |
| R9 | **Do not build**: a shuffle button, a year in review, scene-timed cast, casting out from the desktop, anything needing an outside source. | W38: loud wish, little use. Loves L29. W40, W46: do not fit. | None |

---

## 3. New evidence that bears on settled answers

Nothing here reopens an answer. Each line says what was decided, what was found, and whether it agrees.

| Settled answer | New evidence | Bearing |
|---|---|---|
| Product review Q9 A: one set of settings per computer | "Global defaults across clients" has 260 votes and "import/export of settings" was completed with 899 on Jellyfin's tracker (W43). Jellyfin and Jellyscale both implement a per-account preferences record. | **Tension, medium.** The votes are about not configuring every device again, which matters once a second device exists. Worth revisiting with the TV shell, not before. |
| Loves L28 and the M5 placement of watch together (P8-02) | The largest count in this pass: 2,906 Plex votes to restore it, and 603 more (W24). | **Mild tension.** The count shows that people who had it miss it. It still shows no usage, and it is a protest at a removal. The placement stands. |
| Discovery Q4: items age out of Continue Watching; no remove button | The 1,740-vote request is still open; Jellyfin declined a newer request for a button; Emby completed "Forget a series in Next Up" (W35). | **Agrees on the need; neutral on the remedy.** The backlog already holds a remove button "if ageing proves not enough". |
| Discovery Q10 A: Favorites stands in for a watch list | 1,306 votes, unchanged (W32). | **No change.** |
| Loves D2 A: no watch history for now | 835 votes, unchanged; no usage figure for any history or year-in-review page (W38). | **Agrees.** |
| Loves D6 A: no dismiss control | "Hide a movie or show" has 131 votes (W22). | **Mild tension**, as before. |
| Product review Q16 A: no "Still watching?" prompt | An open post with 111 votes and a completed one with 496 (W18). | **Mild tension.** A sleep timer (D4) gives the same protection as a choice the viewer makes. |
| Product review Q15 A: Recap segments not now | A vendor now generates recaps; no demand or use evidence (W14). | **Agrees** by absence. |
| Product review Q18 A: dual subtitles and audio offset in the backlog | 134 likes on Infuse and 93 thumbs-up across three Jellyfin clients for dual subtitles (W5). | **Mild tension.** A steady niche. Asked as D12. |
| Product review Q11 and discovery Q11 D: a PIN with the TV shell | Child mode 77, profile PIN 62, library PIN 60 votes (W25). | **No change.** |
| Discovery Q1 A: one fixed Home order | A study of viewers aged 65 and over found predictable layouts cut barriers by almost half (W30). | **Agrees.** |
| Loves "don't adopt": a shuffle button | No request for a random pick is in Jellyfin's top 300 (W19). | **Agrees.** |
| Loves L26: no thumbs or ratings | Personal ratings: 461 votes, planned by Jellyfin (W33). | **Mild tension**, on Jellyfin only; Jellyscale has no ratings by decision. |
| Discovery §3.3 rule 1: no household-wide profile | "Watching with" (D5) writes watched state to two accounts that both chose it. It builds no shared profile. | **Compatible**, if built as D5 describes. |

---

## 4. Invariants and rules this proposal touches

None is changed. Each task below must hold them.

| Rule | Where | How this proposal meets it |
|---|---|---|
| No generic mpv bridge; every new Tauri command is an architecture change (I3) | `AGENTS.md`, `ARCHITECTURE.md` §4 | Voice clarity and night mode (D1) need a typed command each. The spike adds none to the shipped build; the feature task changes the allowlist test, `ARCHITECTURE.md`, and `docs/security.md` in one pull request, with a `guardian` review. |
| Original first; never convert what can be direct played (I1) | `ARCHITECTURE.md` §4 | Audio filters run on the device. No playback request changes, and the tripwire must still pass. This is the point of doing it in the client. |
| libmpv user config and scripts stay disabled (I9) | `ARCHITECTURE.md` §4 | Filters are set by Fluster's own typed commands, never from a user file. |
| Only the gateway talks to the server (I8) | `ARCHITECTURE.md` §4 | "Watching with" (D5) and P16-11 use ordinary authenticated calls through `src/lib/jellyfin/gateway.ts`. |
| Tokens and play-session ids are never logged or shown (I4) | `AGENTS.md` | P16-11's fixtures are scrubbed. D5 handles a second account's token: it stays in the keyring and is used only by the gateway. |
| Private by default; nothing from outside | `PRODUCT.md` principle 6; "Better than a streaming service" 6 | Nothing proposed calls an outside service. Wishes that need one are rejected in R9. |
| Your account is yours | "Better than a streaming service" 5 | D5 writes to a second account only when that account is signed in on this device and was chosen for this viewing. A private account (P13-27) can never be added. |
| Nothing plays by itself unless you turn it on | "Better than a streaming service" 7 | Captions on skip-back (D2) show text only, for a stretch the viewer chose to replay. Whether it is on by default is asked. |
| The owner makes design calls | owner's standing instruction | Every control, setting, and screen here is a decision. Only the fixture task was added. |
| Audio passthrough (P5-03) | `PRODUCT.md` M2 | Filters cannot apply to audio passed to a receiver untouched. D1's spike must say what the control does then. |

---

## 5. Tasks

### 5.1 Added to `tasks/prd.json`

One task. It needs no design choice and changes nothing a viewer sees.

**P16-11. Record wish-list contract fixtures for 10.11 and 12.x.** Priority: low to medium. Size S. Sonnet, `jellyfin-api`. Domain: Catalog.

- **Place:** the end of phase P16, after P16-09, so it does not move ahead of planned discovery work. If the owner answers D5 or D6 with "yes", it should run before the task that answer creates.
- **Depends on:** P0-02, P0-03, P16-01 (the fixture conventions and the sample-set additions it extends).
- **Why:** five decisions below rest on server behaviour marked unverified in Wishes. This settles them from the real servers.
- **Acceptance:** in `tasks/prd.json`, which is the source of truth. In short: what adding a second user to a session does to that user's watched state; how audio-description and hard-of-hearing tracks appear; whether a Recap segment can exist without a plugin; sorting by runtime and at random; a round trip of a per-account preference; and what a second full play does to the play count. It writes `docs/research/wishlist-api.md` with Jellyscale's status beside each route.
- **Verify:** `pnpm test -- fixtures && ls docs/research/wishlist-api.md`

### 5.2 Proposed, waiting for decisions

Not in `tasks/prd.json`. Ids are provisional and avoid the provisional ids of earlier proposals. Each is written so it can be added as it stands if its decision is answered with the recommended option.

Every UI task also carries the four standard lines (the TV form; screenshots at 1440×900 and 1920×1080; a fresh-context design review; no journey skipped, deleted, or weakened) and "`DESIGN.md` matches what ships". Verify for each UI task: `pnpm check && pnpm test:e2e && pnpm test:visual`.

**P5-06. Spike voice clarity and night mode in mpv** (D1). Priority: medium. Size S to M. Opus, `native-player`. Domain: Player Engine. Place: phase P5, before P5-03. Depends on P2-04.

1. On a development branch, the spike plays the stereo, 5.1, and 7.1 samples with at least three candidate treatments for clearer voices (a centre-channel lift before downmix, and two speech or dynamics filters) and two for night mode, each set through mpv's audio filter option.
2. `docs/research/voice-clarity.md` reports, for each: whether dialogue is audibly clearer on stereo output, artefacts heard, added CPU, added delay between picture and sound, and behaviour on a stereo source with no centre channel.
3. It states what happens with passthrough (P5-03) and recommends what the control should show then.
4. It confirms from the server's session record that the play method stays direct play with each treatment, and the tripwire passes.
5. It recommends one treatment and strength steps for each control, or recommends against shipping.
6. No Tauri command, setting, or UI is merged; the command allowlist test is unchanged.

Verify: `ls docs/research/voice-clarity.md && cargo test --manifest-path src-tauri/Cargo.toml`.

**P5-07. Add Clear voices and Night mode** (D1, after P5-06 reports and the owner approves its recommendation). Priority: medium. Size M. Opus, `native-player`, with a `guardian` review. Domain: Player Engine and Playback Session. Place: P5, after P5-06. Depends on P5-06, P3-22.

1. A plan exists before implementation.
2. The player's audio menu offers "Clear voices" (off and the steps P5-06 recommends) and "Night mode" (off, on), each with OSD feedback.
3. Each is a typed command with a closed set of values, not an mpv option bridge; the command allowlist test, `ARCHITECTURE.md`, and `docs/security.md` change in the same pull request.
4. Neither changes a playback request: the play method stays what it was, and the tripwire passes with each on.
5. With passthrough active the controls are shown as unavailable with the reason, as P5-06 recommends.
6. Whether a choice is kept between titles is as the owner chose in D1; the Info sheet states when either is active.
7. Rust tests cover both commands and their rejected values; a Playwright journey turns each on and off.

**P15-11. Show captions for the line you missed, and resume a little early** (D2 B). Priority: medium. Size S to M. Sonnet for the rule, Opus (`native-player`) if a command is needed. Domain: Playback Session. Place: P15, after P15-06. Depends on P15-06, P3-22.

1. When subtitles are off and the viewer skips back by 30 seconds or less, the preferred subtitle track is shown from the new position until playback passes the point the skip started from, then hidden again; an OSD line says so.
2. It does nothing when subtitles are already on, when no text or image subtitle track exists, or when the viewer turns subtitles on or off during the stretch (their choice then stands).
3. The track shown is the one P3-13's preferences would pick; no playback request changes, and during a server conversion the rule applies only if the subtitle can be shown without restarting the stream.
4. Resume starts earlier than the stored position by the amount the owner chose in D2, never before the start, and never on "Start over".
5. Settings › Playback has a switch for each, with the defaults the owner chose in D2.
6. If selecting a subtitle track for a stretch needs a player command that does not exist, the spec stops and asks; otherwise the command allowlist test is unchanged.
7. Unit tests cover the rule's edges (repeated skips, a skip across a chapter, a seek by scrubbing does not trigger it); a Playwright journey skips back and sees the caption appear and leave.

**P15-12. Keep unwatched episodes from spoiling** (D3 B). Priority: medium. Size M. Sonnet. Domain: Catalog and App Shell & Presentation. Place: P15, after P15-11. Depends on P3-22, P13-18.

1. Settings › Home and browsing has "Hide spoilers", with the default the owner chose in D3.
2. When on, an episode the account has not played shows a neutral tile in place of its still and no description, on the series page, the Up Next card, Continue watching and Next up, search results, the Home hero, and the detail page; whether its title is replaced by "Episode N" is as the owner chose in D3.
3. Series, season, and film artwork and descriptions are unchanged.
4. An episode in progress or played shows everything.
5. The scrub preview and chapter names are unchanged while playing, since the viewer is watching that episode.
6. The neutral tile uses design tokens and reads as intended, not as a missing image; `DESIGN.md` gains the state.
7. A test renders every listed surface with the setting on and asserts no still URL is requested and no description text is present for an unplayed episode; a Playwright journey turns it on and walks the surfaces.

**P15-13. Add a sleep timer** (D4 B). Priority: low. Size S. Sonnet. Domain: Playback Session. Place: P15, after P15-12. Depends on P3-23.

1. The player's menu offers "Stop after this episode" (for a film, "at the end") and stops after 15, 30, 45, or 60 minutes.
2. When the timer ends, playback pauses, the position is reported, the session is stopped as an ordinary stop (so no server job outlives it), and the screen may sleep.
3. With "Stop after this episode" the Up Next countdown does not start the next episode.
4. A visible mark shows a timer is set, and it can be cancelled from the same menu; the timer never carries over to the next launch.
5. No Tauri command is added.
6. Unit tests cover the timer; a Playwright journey sets "Stop after this episode" and sees no next episode start.

**P16-12. Watch with another signed-in account** (D5, after P16-11 reports and the owner chooses). Priority: decided then. Size M. Opus for the spec, with a `guardian` review, because it writes to a second account. Domain: Playback Session and Server Connection & Identity. Place: P16, after P16-11. Depends on P16-11, P3-20, P13-21, P13-27.

1. A plan exists before implementation, and says which of the two server methods P16-11 found to work.
2. The player and the detail page offer "Watching with…", listing only accounts signed in on this device, on the same server, that are not marked private (P13-27).
3. While set, the added account's watched state and position for this title follow the session, on Jellyfin 10.11 and 12.x.
4. The choice lasts for the current title and, in a series, for the episodes auto-played after it; it never persists to the next launch.
5. Nothing is written to an account that was not chosen, and the second account's token is used only by the gateway; the redaction canary tests cover the new calls.
6. A visible mark names who the viewing is being recorded for.
7. Gateway tests assert the calls against P16-11's fixtures; a Playwright journey with two accounts finishes an episode and finds it played for both.

**P15-14. Label audio description and let it be preferred** (D6 B). Priority: medium. Size S. Sonnet, `jellyfin-api`. Domain: Playback Session. Place: P15, after P15-07. Depends on P16-11, P15-07.

1. An audio track that P16-11's findings identify as audio description is labelled "Audio description" in the audio menu and on the detail page's media facts.
2. Settings › Playback has "Prefer audio description"; when on, such a track in the preferred language is chosen first.
3. A hard-of-hearing subtitle track is labelled as such.
4. No playback request changes beyond the track indexes already sent; tests cover track choice with and without the setting.
5. A note is added to P5-05's spec (not its acceptance): the caption style settings show a live sample and can be reached from the player's subtitle menu.

**P13-28. Audit Fluster with a screen reader** (D6 C). Priority: medium. Size S. Sonnet, `verify`. Domain: App Shell & Presentation. Place: P13, before P13-19, which closes or files what it finds.

1. `docs/research/screen-reader-audit.md` records, for Home, a library, search, a detail page, the series page, the player chrome, Settings, and sign-in: whether Orca on the dogfood desktop announces each control's name, role, and state, and whether every action can be reached and performed.
2. An automated accessibility check runs over the same screens in the Playwright suite and its findings are listed.
3. Each failure is appended to `tasks/backlog.md` with a size; nothing is fixed in this task.
4. No test is weakened.

**P16-13. Filter films by running time** (D7 B). Priority: low. Size S. Sonnet, `jellyfin-api`. Domain: Catalog. Place: P16, after P16-06. Depends on P16-06, P16-11.

1. The film library's filter bar gains running-time choices: under 90 minutes, 90 to 120, over 120.
2. The filter combines with the others and is part of the URL.
3. How it is applied (a server parameter, or a sort by runtime with the range cut in the client) follows P16-11's findings, and a library too large to filter in the client says so plainly instead of showing a partial answer.
4. A gateway test asserts the request against a fixture from each server version.

**P15-15. Choose the skip step** (D9 B). Priority: low. Size S. Sonnet. Domain: Playback Session. Place: P15, after P15-13. Depends on P3-22.

1. Settings › Playback offers the skip step: 5, 10 (default), 15, or 30 seconds, used by the arrow keys, `j` and `l`, and the on-screen buttons.
2. The OSD and the button labels show the chosen step.
3. No Tauri command is added; unit tests cover the mapping.

### 5.3 Proposed order

```text
In tasks/prd.json now:   P16-11 wish-list fixtures (end of P16)
After D2 (if B):         P15-11 captions on skip-back and early resume (after P15-06)
After D3 (if B):         P15-12 hide spoilers (after P15-11)
After D6 (if B or C):    P15-14 audio description (after P15-07); P13-28 screen-reader audit (before P13-19)
After D1 (if B or C):    P5-06 voice clarity spike (before P5-03), then P5-07 with the owner's approval
After D4 (if B):         P15-13 sleep timer
After D9 (if B):         P15-15 skip step
After P16-11 and D5:     P16-12 watching with
After D7 (if B):         P16-13 running-time filter
Carried by the owner:    D11, to Jellyscale
```

---

## 6. Backlog triage

Entries in `tasks/backlog.md` at `1c9f6b7` that the research bears on.

| Backlog entry | Outcome | Why |
|---|---|---|
| A sleep timer, picture-in-picture, and a dialogue-boost or night-mode audio option | **Stays; split by D1 and D4.** | W1 now has survey evidence for the problem; W36 has weak evidence. Picture-in-picture stays (W42). |
| Audio sync offset and dual subtitles | **Stays; D12 asks.** | W5: 134 likes and 93 thumbs-up. |
| Recap, Preview, and Commercial segments | **Stays.** | W14: no demand evidence. |
| A "Still watching?" prompt | **Stays, with a note.** | W18; D4 offers the viewer-set form. |
| Playlists | **Stays, with a note.** | W20: 1,425 and 588 votes are for smarter playlists, a server feature. |
| Remember a library's sort and filters | **Stays, with a note.** | W20: the client-side cousin of a smart playlist. |
| A "private session" that plays without reporting | **Stays, with a note.** | W26: 88 votes for guest access. |
| A "Watched" view | **Stays.** | W38; D2 A stands. |
| "Not this one" on a suggestion | **Stays.** | W22; D6 A stands. |
| Remove from Continue Watching | **Stays.** | W35. |
| Marks on cards for what is new | **Stays.** | W16: the part of "new episodes" that needs no outside data. |
| A PIN per profile | **Stays** with the TV shell. | W25. |
| Test Fluster against Jellyscale | **Stays. Notes added.** | D11. |

Added to the backlog by this pass: see "Wish list" at the end of `tasks/backlog.md`.

---

## 7. Decision list

Twelve decisions in three batches of four. Each stands alone. "Rec" is a recommendation; the owner decides.

### Batch 1: while watching

**D1. Should Fluster make dialogue easier to hear?**
In a survey of 1,265 US viewers, half usually watch with subtitles, 55% find dialogue harder to hear than it used to be, and most blame loud music. Plex added "Boost Dialog" and "Normalize Loudness" in 2025, but they need a paid pass and make the server convert the audio. Fluster decodes on the device, so it could lift voices or soften loud scenes while still playing the original file. Nobody has tried the candidate filters in Fluster, and no figure exists for how many people use such a control. It needs new typed player commands and cannot apply to audio passed straight to a receiver.
- A: Leave it in the backlog.
- B: Run a spike now (proposed P5-06): try the treatments on the sample files and report, shipping nothing. You then approve or drop the feature (P5-07).
- C: The same spike, placed in the cinema-quality phase before passthrough (P5-03), after the dogfood week.
- D: Skip the spike and plan the feature directly.
- **Rec: C.** The evidence for the problem is the widest in this research, and the fix suits what Fluster is. A spike costs one report and keeps the decision yours. Native work runs one task at a time, so it should not go ahead of the daily-driver tasks; if you want it sooner, B.

**D2. Should skipping back show captions for the line you missed?**
Apple TV turns subtitles on when you skip back 10 seconds, for the stretch you replay. Two forum threads ask for it in personal-media apps and none was found doing it. A related small request (55 votes on Jellyfin's tracker) is to resume a few seconds before where you stopped.
- A: Neither.
- B: Both, on by default, each with a switch in Settings; resume starts 3 seconds early (proposed P15-11).
- C: Both, off by default.
- D: Captions on skip-back only; resume stays exact.
- **Rec: B.** It is small, it serves the habit half of viewers already have, and it shows text only for a stretch you chose to replay. Three seconds stays inside the "resume within 10 s" measure. If you would sooner nothing appears unasked, C.

**D3. Should unwatched episodes be able to hide their spoilers?**
People have asked since 2012 for episode stills and descriptions to be hidden until watched: 120 votes on Jellyfin's tracker, 118 and 49 on Plex. Infuse blurs them, with one switch for everything; Jellyfin's own clients and Plex have nothing. Fluster could do it on every surface, which is where the others fall short.
- A: No.
- B: A "Hide spoilers" setting, off by default: unwatched episodes show a neutral tile and no description everywhere; titles stay (proposed P15-12).
- C: The same, and titles become "Episode 5".
- D: The same as B, with a per-series switch as well.
- **Rec: B.** Stills and descriptions are what the requests name. Titles are needed to find an episode, and a per-series switch can follow if you miss it.

**D4. Should the player have a sleep timer?**
Evidence is weak: 23 thumbs-up on Jellyfin's Android app, 7 votes on Plex, and YouTube added one in 2024. It is cheap, it ends the session cleanly so no server job is left running, and "Stop after this episode" gives what a "Still watching?" prompt gives without the app deciding for you (your answer Q16 A).
- A: Leave it in the backlog.
- B: "Stop after this episode" and 15, 30, 45, or 60 minutes, in the player menu (proposed P15-13).
- C: "Stop after this episode" only.
- **Rec: B, at low priority.** If you want to hold to evidence strictly, A is the consistent answer; nothing here shows it is widely wanted.

### Batch 2: households, access, and choosing

**D5. Should two signed-in people be able to watch together on one screen and both be marked as having watched?**
A couple watch an episode; only the signed-in account gets the progress. It has 164 votes on Jellyfin's tracker and a Plex request open since 2016, and no app found does it. Fluster will already hold several signed-in accounts. Jellyfin has an "add user to session" call whose effect on the second account is unverified; P16-11 checks it. It writes to a second person's account, so it must only ever include someone who is signed in here and was chosen for this viewing.
- A: No.
- B: Wait for P16-11's findings, then decide with the facts (proposed P16-12).
- C: Plan it now.
- **Rec: B.** It is the most distinctive idea here for a household, and the one with the most to get wrong.

**D6. Should Fluster do more for blind and deaf viewers now?**
A survey of 483 blind and low-vision viewers found description hard to find and rated its availability 2.84 out of 7 on streaming apps. No vote board mentions it; people who cannot use an app do not vote on it. Jellyfin has no flag for a description track, so a client must read the track's title. Fluster has never been tried with a screen reader.
- A: Nothing now.
- B: Label audio-description and hard-of-hearing tracks, add "Prefer audio description", and note for the subtitle styling task that styles show a live sample and can be reached from the player (proposed P15-14).
- C: B, and audit the app with a screen reader, filing what it finds (proposed P13-28).
- **Rec: C.** Both are small. The audit only reports; what to fix stays your call.

**D7. Should the film library filter by running time?**
Viewers spend 14 minutes a session choosing and one in five give up. A personal library knows every running time, so "under 90 minutes" is an easy question to answer. Nobody asks for it on any tracker, and Netflix dropped its "Play Something" button for lack of use.
- A: No.
- B: Three running-time choices in the film library's filter bar (proposed P16-13).
- C: A "Tonight" row or control on Home.
- **Rec: A for now.** The problem is real and this remedy is a guess. It is cheap to add after the dogfood week if you find yourself wanting it.

**D8. Should Fluster help you back into a series after a long gap?**
Amazon generates recaps for a few of its own series. No vote or usage evidence was found for recaps anywhere. A plain form needs nothing new: after some weeks away, the series page says which episode you last saw and when, shows its description, and offers to replay its last minutes or the file's own recap segment.
- A: No. Leave recap segments in the backlog (your answer Q15 A).
- B: The plain form, on the series page.
- C: Wait for a generated "story so far" on the operator's own hardware, as stage 3 of the viewer profile.
- **Rec: A.** Unproven. Note it during the dogfood week: if you return to a series and feel lost, B is small.

### Batch 3: smaller controls and the server

**D9. Should the skip step be adjustable?**
A Plex request to choose the skip-back length has 454 votes. Fluster skips 10 seconds.
- A: Keep 10 seconds.
- B: A setting: 5, 10, 15, or 30 seconds (proposed P15-15).
- **Rec: B, at low priority.** One setting, no design risk.

**D10. Should the paused player show the cast?**
"Who is that?" has 39 votes on Jellyfin's tracker and a few threads elsewhere. Knowing who is on screen at a given moment needs timed data a personal library does not have; a plain cast list for the title does not.
- A: No. People pages (P16-07) cover it.
- B: A cast strip on the paused player, opening a person's titles.
- **Rec: A.** Weak evidence, and a paused player is a quiet place worth keeping quiet.

**D11. Should these requests go to Jellyscale?**
Five things this research would want from the server, each additive and none needed for playback (details in §8): a way for one viewing to count for two accounts; a flag on audio-description tracks; a loudness figure per audio track; a running-time range on item queries; and Recap as a segment type.
- A: Carry all five, in that order.
- B: Carry the first two only.
- C: None until the decisions above are answered.
- **Rec: B now, the rest when their decisions land.** The first two serve D5 and D6, which have the better evidence.

**D12. Should two subtitle tracks at once become a task?**
It is in the backlog (your answer Q18 A). Language learners ask steadily: 134 likes on Infuse's forum and 93 thumbs-up across three Jellyfin clients, none of which has built it. mpv supports a second track.
- A: Leave it in the backlog until after the dogfood week.
- B: Make it a task after playback speed and subtitle offset (P15-06).
- **Rec: A.** A real niche, and not yours unless you learn languages this way. It would be a point of difference among native Jellyfin clients if you want one.

---

## 8. Jellyscale requests

For the coordinator to file, if the owner agrees (D11). Each is additive and worded generally. Status is from `compat/endpoints.yaml` and `docs/status.md` at `93a0f3f`.

1. **Let one playback session count for more than one account.** Jellyfin's API has "add user to session" and "remove user from session" (`POST` and `DELETE /Sessions/{sessionId}/User/{userId}`). Neither is in the route list. Wanted: progress and played state from a session also reach the added accounts, and only an account that authorised it can be added.
2. **Mark audio-description and hard-of-hearing tracks.** Jellyfin's stream record has `IsHearingImpaired` and nothing for audio description. Wanted: both read from the file's own stream markers at scan, the second as an additive field, so a client need not guess from a track's title.
3. **A loudness figure per audio track**, measured at scan by a worker. It lets a client level volume between titles without analysing the file itself. Jellyfin has `NormalizationGain` on items; whether it is filled for video is unverified.
4. **A running-time range on item queries**, and confirmation that sorting by runtime and at random work. Jellyfin's query has neither a minimum nor a maximum runtime.
5. **Recap and Preview as segment types** when media segments are built, read from chapter names or operator data as already decided. This asks for nothing beyond that decision.

Already on the owner's carry-over list and not repeated: Next Up, Similar, Genres and Persons, trailers, filters, media segments, Quick Connect, trickplay, the session Capabilities routes, and (as a design sketch) the recommendation route. Collections and playlists are "not built, in scope" there; the vote counts in W20 are a reason to keep them in scope, not a new request.

---

## 9. What this pass did not do

- It did not edit an existing task's acceptance or `depends_on`.
- It did not change `PRODUCT.md`, `DESIGN.md`, `ARCHITECTURE.md`, or `AGENTS.md`.
- It did not add any task that shows a viewer something new.
- It did not touch the Jellyscale repository.
- It did not set this pull request to merge by itself.
