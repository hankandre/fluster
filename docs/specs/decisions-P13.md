# P13 design decisions for the human (P13-08 to P13-19)

Status: **answered 2026-11-10** (every answer is the human's choice; treat as settled). Prepared 2026-11-10 from `tasks/prd.json` (phase P13), `DESIGN.md`, `docs/design/rework-plan.md`, `docs/design/audit.md`, the Decisions sections of `docs/specs/P13-06.md` and `docs/specs/P13-07.md`, and the code under `src/features/` at `b2108c6`.

Each question is a product or design choice that those documents do not settle, or settle in two conflicting ways. Recommendations are the planner's framing only; the human decides. Confirmed decisions from P13-06 and P13-07 are not reopened.

P13-15 (playback notices) and P13-19 (design QA) raise no open design choice. See "Not asked" at the end.

## P13-08 Home

### Q1 (P13-08): What the hero's artwork does when focus moves to a card
DESIGN.md §7.3 fixes the hero to the first Continue Watching item, while §7.2 and §13.5 make Home's backdrop follow the focused card at 35% after 300 ms. Neither says how the two layers relate while the hero is on screen.
- A: Hero keeps its own art; ambient layer shows behind the rows only — hero stays stable, but the followed backdrop is barely visible until the user scrolls past the hero.
- B: One layer: hero art swaps to the focused card's art, hero text stays — the follow effect is visible, but the hero's title and its picture can disagree.
- C: Hero art and text both follow the focused card (preview pane) — strongest on TV, but changes §7.3 and what "Resume" in the hero plays.
Recommendation: A — matches §7.3 and §7.2 as written with no new behaviour.
Answer: A (human, 2026-11-10)

### Q2 (P13-08): Home's `h1`
DESIGN.md §11.6 wants one `h1` "naming its content" and the checklist rejects route names; Home today renders `<h1>Home</h1>` (`src/features/home/home-view.tsx:19`). With a hero, the visible title is the hero item's.
- A: Visually hidden `h1` "Home"; the hero title is an `h2` — stable landmark for screen readers, but the largest text is not the `h1`.
- B: The hero's Logo or title is the `h1` — matches Detail, but Home's `h1` changes with what was last watched and vanishes on empty Home.
Recommendation: A — Home is a collection, not one item.
Answer: A (human, 2026-11-10)

### Q3 (P13-08): Hero item also in its row
The hero shows the first Continue Watching (or Next Up) item (§7.3); the row below still lists it first.
- A: Keep it in the row too — rows stay complete and predictable; the same title appears twice in the first viewport.
- B: Drop the hero's item from its row — no repeat, but the row shifts when the hero changes and a one-item row disappears.
Recommendation: A — simpler, and the card offers `i` for details while the hero offers "More info".
Answer: A (human, 2026-11-10)

### Q4 (P13-08): "The newest item" when nothing is in progress
§7.3 falls back to "the newest item", but the gateway only has per-library latest (`latestInLibrary`, `src/lib/jellyfin/gateway.ts:459`), and the newest item may be a series, which has no single file to play.
- A: First item of the first library's Latest row; a series hero's primary button is "Play S1 · E1" (or its Next Up) — no new request shape beyond resolving the episode; "newest" is per first library, not global.
- B: Same source; a series hero's primary button is "Open" (goes to the series page) — no episode lookup, but breaks "primary is Resume or Play".
- C: Add a global newest-across-libraries request — truly newest, but a new gateway query to review and test.
Recommendation: A — keeps one Play action and avoids a new request type.
Answer: A (human, 2026-11-10)

### Q5 (P13-08, P13-11): "See all" links and the "3 new" subtitle on Home rows
§7.4 allows an optional "See all" link and §7.5 a "3 new" poster subtitle; rework-plan.md Follow-ups leave both open ("needs a server field").
- A: "See all" on Latest rows only, opening the library sorted by date added; skip "3 new" — useful link, needs the sort in the library route; no server-field work.
- B: Neither in P13 — smallest scope; the nav already reaches each library.
- C: Both, with the gateway change for the count — full §7.5, but a request change inside a design task.
Recommendation: A — the link is cheap; the count needs unverified server data.
Answer: A (human, 2026-11-10)

## P13-09 Item detail

### Q6 (P13-09): Where the version picker lives
Three documents place it differently: beside Play as a pill (audit.md, Item detail, "VersionPicker pill beside Play"), inside the `More` menu (DESIGN.md §7.8), and in File and streams (§7.9). Today it sits at the bottom (`src/features/detail/item-detail-view.tsx:110`).
- A: Pill beside Play, shown only when there are 2+ versions; File and streams shows the chosen version's info — the choice sits next to the action it changes; one more control in the action bar.
- B: In File and streams only — cleanest action bar, but the choice is far below Play (the audit's complaint).
- C: In the `More` menu — hidden until asked for; two activations to see which version will play.
Recommendation: A — fixes the audit finding and keeps Play honest about what it plays.
Answer: A (human, 2026-11-10)

### Q7 (P13-09, P13-10): The `More` menu in the action bar
§7.8 lists `More` (Version, File and streams, Go to series, Mark season watched). No Menu primitive exists in `src/features/shared/ui/`, "Mark season watched" needs a new server call, and the series link already sits above the episode title (§7.7).
- A: No `More` menu in P13; record it as a follow-up task — nothing is lost that exists today; §7.8 gets amended.
- B: Build a Menu primitive and ship `More` with Go to series and File and streams (a scroll link) only — matches §7.8's shape; the menu duplicates visible links.
- C: Full §7.8 including Mark season watched — new feature and gateway call inside a redesign task.
Recommendation: A — every remaining entry is either placed elsewhere or new scope.
Answer: A (human, 2026-11-10)

### Q8 (P13-09, P13-10): Detail data the catalog does not carry yet
`PersonRow` wants "image or initials" and series facts want "rating" (§7.7, audit.md), but `CastMember` has only name and role (`src/domain/catalog.ts:200`) and `ItemDetail` has no rating. Genres are shown today (`item-detail-view.tsx:90`) and are absent from §7.7.
- A: Use today's fields: initials-only cast cards (not interactive), no rating, genres appended to the facts line — no request change; `PersonRow` looks plainer.
- B: Extend the detail request with person images and ratings — richer header and cast; a gateway change with tests in each task.
Recommendation: A — ship the layout now; add images and ratings as one later gateway task.
Answer: A (human, 2026-11-10)

### Q9 (P13-09, P13-12): What Enter does on an episode card outside Continue Watching and Next Up
§7.5 says `thumb` cards resume or play and `episode` cards play, but it names only Home rows and `EpisodeRow`. The "More from Season 1" strip (§7.7) and Episode search results (§7.13) also use 16:9 cards.
- A: Both open the episode's detail — search and the strip stay "browse" surfaces; playing takes two activations there.
- B: Both play, with `i` or Menu for details — consistent "16:9 means play", but a search click starts playback unexpectedly.
- C: Strip plays (like `EpisodeRow`), search opens detail — each matches its neighbour, at the cost of one more rule.
Recommendation: A — one-press play stays reserved for "what I was watching" and the series page.
Answer: A (human, 2026-11-10)

## P13-10 Series page

### Q10 (P13-10): Which season tab opens selected
Today the first regular season is selected (`src/features/browse/series-view.tsx:34`). The new header plays the next episode, which may be in a later season.
- A: The season of the Next Up or resumable episode, else the first regular season — the list shows where the user is; needs the Next Up result before the tabs settle.
- B: Always the first regular season — no dependency, but a viewer on season 4 lands on season 1 every time.
Recommendation: A — the header and the list then agree.
Answer: A (human, 2026-11-10)

## P13-11 Library browsing

### Q11 (P13-11, P13-06 follow-up): The Libraries page and nav overflow
P13-06 Decision 6 kept `#/next/browse` (a tile page, `src/features/browse/browse-view.tsx:59`) "until P13-11", and rework-plan.md Follow-ups ask P13-11 to decide between the scrolling nav and a "More" menu or Libraries entry. audit.md says "A Libraries page, if kept, shows library tiles".
- A: Remove the Libraries page; the nav keeps scrolling (confirmed P13-06 Decision 4) and gains an edge fade — fewest screens; many-library servers scroll the nav.
- B: Keep the page as art tiles and add a "Libraries" nav entry only when the entries overflow — a clear overview for big servers; a conditional nav entry to build and test.
- C: Keep the page reachable by URL only — no work, but an orphan screen stays in the app.
Recommendation: A — libraries already live in the nav; revisit if a real server overflows.
Answer: A (human, 2026-11-10)

### Q12 (P13-11): How the sort control sets direction
§7.12 shows one menu button, "Name ↑"; today there are two selects, field and order (`src/features/browse/library-grid.tsx:78`, `:84`). `Picker` exists; a menu does not.
- A: One `Picker` listing fields; choosing the current field again flips the direction, shown by the arrow — one control as drawn; the flip is not obvious.
- B: One `Picker` with each pair spelled out ("Name A to Z", "Newest added first", ...) — nothing hidden; eight rows and no arrow.
- C: `Picker` for the field plus an icon button for direction — explicit, but two controls where §7.12 draws one.
Recommendation: B — plain words, one control, works identically on TV.
Answer: B (human, 2026-11-10)

## P13-12 Search

### Q13 (P13-12): When results appear
Today typing shows suggestions and Enter navigates to `#/next/search/<term>` for results (`src/features/search/search-box.tsx:55`). §7.13 describes a large field with suggestions under it and grouped results, without saying whether results update as you type. Acceptance keeps the combobox semantics.
- A: Keep today's flow: suggestions while typing, results on Enter — no behaviour change, e2e journey stays; one extra step to see artwork results.
- B: Results update live under the field (debounced); the suggestion list is kept only as the combobox popup — faster on desktop; two lists compete, and the route changes on every pause.
Recommendation: A — "behaviour stays put unless a task says otherwise" (rework-plan.md, Approach 3).
Answer: A (human, 2026-11-10)

### Q14 (P13-12): Result layout and paging
§7.13 says results are grouped `MediaRow`s (horizontal); today they are grouped grids with one "Load more" for the mixed result set (`src/features/search/search-results.tsx:49`, `:63`).
- A: Horizontal rows per group; the first page (40) only, with a "See all" style "Load more" at the end of the section — matches §7.13 and Home; long result sets need sideways scrolling.
- B: Keep grouped grids, restyled, with automatic paging like the library grid — everything visible by scrolling down; departs from §7.13.
Recommendation: A — follows the accepted design; say so if grids are preferred and §7.13 gets amended.
Answer: A (human, 2026-11-10)

## P13-13 Player chrome

### Q15 (P13-13): Is the conversion chip visible while the chrome is hidden?
Invariant: "Show every server conversion and its reason in the player" (AGENTS.md hard rules). Today the chip is "shown for the whole session" (`src/features/player/conversion-chip.tsx`), but §7.14 puts it in the top bar, which hides after 3 s of playback.
- A: Chip lives in the top bar and hides with it; the reason is also shown on `PlayerLoading` and in the Info sheet — pure picture while watching; the conversion is not on screen most of the time. Changes how the invariant is met, so it needs explicit approval.
- B: Chip stays on screen for the whole session, outside the hiding chrome — strictest reading of the invariant; a permanent mark over the picture.
- C: As A, plus an OSD line with the reason for a few seconds when playback starts and after each renegotiation — the user is always told once; slightly more to build.
Recommendation: C — honest at the moment it matters, then quiet (DESIGN.md principle 5); needs the human's sign-off as an invariant reading.
Answer: C (human, 2026-11-10)

### Q16 (P13-13): How the chip "offers" Play original
§7.14 moves Play original into the Info sheet and says "the chip also offers it"; PRODUCT.md line 57 says "the indicator offers Play original". Today it is a separate floating button (`src/features/player/index.tsx:215`). The chip itself opens the Info sheet.
- A: The chip opens the Info sheet with focus on Play original — one control in the top bar; two activations.
- B: A second "Play original" button beside the chip in the top bar, plus the one in the Info sheet — one activation; a wider top bar and two places to keep in sync.
Recommendation: A — keeps the top bar to title and one chip.
Answer: A (human, 2026-11-10)

### Q17 (P13-13, P13-18): Arrow keys when the player chrome is visible
The keymap keeps Left/Right as seek and Up/Down as volume even when a button has focus (`src/components/player-keymap.ts:88`), and acceptance says bindings are unchanged; yet DESIGN.md principle 4 wants every screen usable with arrows, Enter, and Back alone, and §7.15 says on TV "arrows wake the chrome".
- A: Desktop unchanged (arrows always seek and change volume; Tab reaches controls). TV form: arrows wake the chrome with focus on the scrubber, Left/Right seek there, Up/Down move between the top bar, scrubber, and control row — both forms keep their habits; the player is the one desktop screen that needs Tab.
- B: Both forms use the TV model: once the chrome is visible, arrows move focus — one rule; breaks "bindings unchanged" and changes Up/Down volume on desktop.
Recommendation: A — honours the acceptance item; record the desktop Tab exception in DESIGN.md §9.
Answer: A (human, 2026-11-10)

### Q18 (P13-13): `ChapterList` panel
§7.14 lists a Chapters button and a `ChapterList` sheet with trickplay thumbnails, but the P13-13 acceptance split does not name it.
- A: Defer to a new task; show chapters only as scrubber gaps and preview names — P13-13 stays a restyle; §7.14 keeps one unbuilt panel.
- B: Build it in P13-13 as a names-and-times list, thumbnails later — chapters reachable by keyboard now; more scope in the largest task.
Recommendation: A — the acceptance list is the contract; track the panel separately.
Answer: A (human, 2026-11-10)

## P13-14 Skip and Up Next

### Q19 (P13-14, P13-18): Skip credits and Up Next at the same moment
The Up Next countdown starts at the credits when the server marks an outro (`src/features/player/auto-play-next.ts:12`), which is exactly when "Skip credits" appears; §7.15 puts both at the bottom right, and on TV OK activates "the visible Skip" while the chrome is hidden.
- A: Up Next replaces Skip credits when a next episode exists; Skip credits shows only when there is none — one prompt, one meaning for OK and `n`; no way to skip to post-credit scenes during the countdown.
- B: Stack them (Skip above the card); on TV OK means Play now — both available; two prompts and a rule to remember.
Recommendation: A — one prompt at a time; Hide brings back plain playback.
Answer: A (human, 2026-11-10)

## P13-16 Sign-in

### Q20 (P13-16): Does LAN discovery run by itself?
Acceptance wants "discovered servers listed first", but today the user must press "Find servers on this network" (`src/features/sign-in/server-discovery.tsx:61`), and `docs/security.md` describes the broadcast as one fixed datagram per search. Running it on open changes when Fluster sends on the network.
- A: Search automatically once when the server step opens (desktop only), with "Search again" — servers really are first; a UDP broadcast leaves on every sign-in screen visit without a click. Touches `docs/security.md`, so it needs the human's approval.
- B: Keep it manual: the "Find servers" button comes first, the list appears above the address field after a search — no change to network behaviour; "listed first" holds only after a click.
Recommendation: A — it is what the acceptance item implies, and the datagram carries no user data; flag the `docs/security.md` edit in the PR.
Answer: A (human, 2026-11-10)

## P13-17 Settings

### Q21 (P13-17): Custom streaming limit
§7.18 says "No limit and presets plus custom Mbps"; acceptance says "keeping the streaming-limit values and storage", and the store deliberately accepts only the preset list so "a hand-edited or corrupt record can never send an odd bitrate" (`src/lib/streaming-limits.ts:33`). The value goes into PlaybackInfo as `MaxStreamingBitrate`.
- A: Presets only, in a `Picker` — matches acceptance and the validation; §7.18 loses "custom".
- B: Add a custom Mbps field with range validation — matches §7.18; changes storage and a PlaybackInfo input, so it needs a `jellyfin-api` review.
Recommendation: A — acceptance outranks the older design text; amend §7.18.
Answer: A (human, 2026-11-10)

### Q22 (P13-17): Section navigation on desktop
§7.18 draws a section list on the left with content on the right; §7.11 says `SegmentedTabs` serve "Settings sections on wide screens". Four sections exist.
- A: Left section list (a vertical tablist), content right; compact windows drill in — matches §7.18 and the TV layout; a new vertical pattern to build.
- B: `SegmentedTabs` across the top, content below — reuses a finished primitive; differs from §7.18 and scales worse as sections grow.
- C: One scrolling page with four headed sections, no tabs — simplest for four short sections; departs from both.
Recommendation: A — §7.18 is the component's own spec and carries to TV.
Answer: A (human, 2026-11-10)

### Q23 (P13-17): Rows that cannot do anything yet
Acceptance wants "labelled slots for P5-03 and P3-02" (audio passthrough, stay signed in; both `todo`) and a Subtitles section that §7.18 describes as a read-only view of Jellyfin's language preferences "with a link-out note" (no such gateway read exists, and user flows have no external links).
- A: Show them as disabled rows with a one-line "Not available yet" description; Subtitles shows a sentence saying languages follow the Jellyfin account, with no link and no server read — the shape is visible and honest; some dead rows on screen.
- B: Hide unbuilt rows (slots exist in code only); Subtitles as in A — nothing inert on screen; "labelled slots" is met only in code.
- C: As A, and read the user's subtitle language preference from the server for display — fuller §7.18; a new gateway read.
Recommendation: A — meets "labelled slots" literally without new server calls.
Answer: A (human, 2026-11-10)

### Q24 (P13-17): What "Copy diagnostics" contains and how it reaches the clipboard
§7.18 lists version, player and libmpv version, renderer, and "Copy diagnostics (redacted)". Nothing in `src/` or `src-tauri/` uses the clipboard today, and "treat every new Tauri command as an architecture change" applies if a plugin is needed.
- A: App version, OS, libmpv version, renderer, decode mode; no server name, address, or user. Copy through the WebView's `navigator.clipboard`, with a selectable text fallback — no new command; clipboard support in WebKitGTK is unverified.
- B: As A, plus the Jellyfin server version and host class (local or remote), never the address — more useful for bug reports; one more field to guard in the canary test.
- C: Either content, copied through a Tauri clipboard plugin — reliable on desktop; a new capability that needs architecture approval.
Recommendation: B — server version matters for triage; avoid a new command unless the WebView path fails.
Answer: B (human, 2026-11-10)

## P13-18 10-foot form

### Q25 (P13-18, P13-16): Sign-in on TV
§6 says on TV "text entry happens only in search", yet sign-in needs a server address and, without Quick Connect, a username and password. P13-18 must give sign-in a keyboard-only TV journey.
- A: TV form leads with discovered servers and Quick Connect; "Enter address" and "Use password" stay as secondary actions using the same on-screen keyboard — every server can still be reached; amends the §6 sentence.
- B: TV form offers only discovered servers and Quick Connect — holds §6 as written; servers off the LAN or with Quick Connect off cannot sign in from the TV.
Recommendation: A — B locks out common setups; update §6 to "search and sign-in".
Answer: A (human, 2026-11-10)

## Not asked (settled, or left to the spec)

- Settled by DESIGN.md: one-press resume and `i`/Menu/right-click for details (§13.1), hero precedence (§7.3), nav transparency, blur, and hide-on-scroll arriving with P13-08 (§7.1; P13-06 Decisions 3 and 11), sentence-case row titles, toast copy for watched state (§7.16), `EpisodeRow` Enter plays with a trailing Details button (§7.6), filter chip set (§7.12), "Shows" as the search group name (§7.13), Notice layout and copy for every playback notice (§7.16, P10-11), Quick Connect layout (audit.md, Sign-in), sign-out only in Settings, user's initial in the nav (P13-06 Decision 2).
- Left to the spec with an obvious default: a fully watched series offers "Play S1 · E1"; many seasons scroll the tab bar like the nav (P13-06 Decision 4); a collection page is titled by the collection's name and uses the library layout; sort and filters are not remembered between visits (rework-plan.md Approach 3); refused plain-HTTP copy joins the §10 table.
- Ownership gaps to assign, not design choices: the keymap rows "New in P13" for `/`, Backspace, Home/End, and 0–9 (DESIGN.md §9) are in no task's acceptance. Suggested: `/` in P13-12, Home/End and 0–9 in P13-13, Backspace in P13-18.
- Token fix for P13-18: `--type-mono` is 0.875rem, which renders at 21 px in the TV form, under the 22 px floor (§4, §8). The spec should raise it in the `data-form="tv"` block as §6 does for `--type-meta`.
- P13-19: whether the screenshot harness becomes a gating visual diff is a process choice outside the task's acceptance (rework-plan.md P13-01: "not gating diffs yet").

## Loose ends approved (human, 2026-11-10)

- Unowned keys assigned as acceptance items: `/` to P13-12, Home/End and 0–9 to P13-13, Backspace to P13-18.
- P13-18 raises `--type-mono` in the TV form to meet the 22 px floor.
- P13-19 makes the screenshot harness a gating visual diff in CI.
