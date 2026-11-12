# UX audit of the current UI

Date: 2026-11-08. Branch `design/system`. Captured at `109c948` and updated after rebasing onto `c10ad9c`, which added the P10-05 Settings screen and the Play original button.
Scope: every screen under `src/features/` and `src/components/PlayerView.tsx`, in browser development mode.
Direction: the cinematic, artwork-first design system proposed in [`DESIGN.md`](../../DESIGN.md).

## How the screens were captured

A scratch Playwright script (not committed) started Vite on port 1490 and used route mocks copied from `e2e/*.spec.ts`. It added synthetic abstract art from ImageMagick (no real posters), a fake video frame painted behind the browser `<video>`, and the media-element stubs the e2e tests use. The shots are 1440×900, plus 1920×1080 for Home, Detail, and Player and 390×844 for phone.

Screenshots: `/tmp/claude-1000/-home-handre-Code-fluster/cc6e1dda-3185-41ee-b3d1-b11a72718b39/scratchpad/design/current/`. The script is `capture.cjs` in the folder above. Filenames below refer to that directory. The screenshots are not committed. They are scratch evidence and can be regenerated.

Capture caveats:

- **"Buffering…" in every player shot is a stub artifact.** The browser engine never gets real media. Check the native buffering overlay on the desktop build before acting on that part of findings P-3 and P-4.
- **Settings was captured before it existed.** The screenshots predate P10-05. Settings (`#/next/settings`) was reviewed from `src/features/settings/settings-view.tsx` after the rebase. See S-1.
- **LAN discovery appears only in the desktop shell.** Browser mode hides it (`e2e/sign-in.spec.ts`, "browser mode hides Find servers"). Its findings come from reading `server-discovery.tsx`.

Severity: **P0** means a user gets lost, misreads state, or cannot finish a task. **P1** means needless friction or a broken visual. **P2** is polish.

## Top 10 findings (ranked by user impact)

| # | Sev | Finding | Evidence | Fix |
|---|---|---|---|---|
| 1 | P0 | **There is no app navigation.** Home links only to Search, a developer "Back to features" page, and Sign out. Browse (libraries) can be reached only from the developer feature index (`#/next`). No screen has a persistent way home. | `11-home-fullpage.png`, `13-home-empty.png`, `60-features-index.png`; `home-view.tsx` | Add an app shell with Home, one entry per library, Search, and Settings. Remove every "Back to features" link from user flows. |
| 2 | P0 | **16:9 cards overlap their neighbours, and episode art covers the episode text.** `.card-art` has a fixed 180 px height with an aspect ratio, inside a 280 px card or a 150 px grid column, so 320 px of art spills out. | `10-home.png` (Next Up), `23-series-episodes-fullpage.png`, `32-search-results.png` | Size cards by width from one card-size token, with the aspect ratio on the frame. Give thumbs and posters separate card variants and grid tracks. |
| 3 | P0 | **Pages are titled by route, not by content.** The headings read "Details", "Series", "Browse", and "Collection". The series page never names the series and has no art, overview, or play button. The item title is an `h2` under a generic `h1`. | `22-series-episodes.png`, `40-detail-movie.png`, `21-library-grid.png` | Make the item, series, or library name the `h1` and show it with artwork. Give the series page a header, a Play Next Up button, and season tabs. |
| 4 | P0 | **Pressed and selected states are invisible or shown only by colour.** Season buttons use `aria-pressed` with no style. Watched and Favorite change only text colour, with no icon or shape. The selected version is a native blue radio button. | `22-series-episodes.png`, `43-detail-played-favorite.png`, `41-detail-movie-fullpage.png` | Give every toggle an icon state (empty or filled) plus a label. Use segmented tabs with a visible selection bar for seasons and a pill picker for versions. |
| 5 | P1 | **Resuming takes more steps than it should.** A Continue Watching card opens Detail, then Resume plays, so that is two activations plus a page load. A series offers no Play Next Up: the user opens the series, finds the right episode, opens it, then presses Play. | `10-home.png`, `22-series-episodes.png`, `42-detail-resume.png` | Make Resume the default action of a Continue Watching or Next Up card (one activation), with details one key away. Add "Play S1 E3" to the series header. |
| 6 | P1 | **Global form styles leak into every control.** The `label` rule (10 px, tracked, `#717782`, 4.09:1 on the card) and the `input` rule (100% width, 52 px tall) also hit checkboxes and radios. The "In progress" filter renders as a 32 px white square. | `21-library-grid.png`, `41-detail-movie-fullpage.png`, `styles.css` lines 31–33 | Scope form styles to named components (`.field`, `.text-input`). Build checkbox, radio, and select components, and never style bare `label` or `input`. |
| 7 | P1 | **Closed in P13-13.** **The player chrome fights the picture.** An unstyled "Info" text button floats beside a decode chip that repeats the same facts. Audio and subtitle choice uses native `<select>` menus. Time labels are 10 px. The trickplay preview overflows its frame. Spinner text has no scrim (2.4:1 on a bright frame). | `50-player-controls.png`, `52-player-info-panel.png`, `53-player-seek-preview.png` | Rebuild the player chrome per DESIGN.md: top bar with title only, a scrubber with an inline preview, one "Audio & Subtitles" panel, an Info sheet, and a scrim behind every text overlay. |
| 8 | P1 | **Errors leak transport text, and the refusal screen shouts.** A wrong password shows "Request failed with status code 401". The refusal title runs five lines at 70 px with plain buttons and no artwork. | `06-signin-password-error.png`, `58-player-refusal.png` | Map errors to plain sentences in one copy table. Show refusals over the item's dimmed backdrop, with a title of at most two lines, the reason, "What you can do", and Retry and Back buttons. |
| 9 | P1 | **Home has no hierarchy.** "Home" takes the prime spot. Row titles are small tracked grey capitals. At 1920 px the content fills the left third and two-thirds of the screen is empty. Empty Home shows only the heading and three run-together links. | `10-home@1920.png`, `13-home-empty.png` | Open Home on a hero backdrop of what to watch next. Make rows full width with edge-bleed scrolling and sentence-case titles. Give empty Home a "Your libraries are empty" state with a pointer to the server. |
| 10 | P1 | **Nothing is ready for the 10-foot screen.** Sizes are fixed in px (180 px art, 10 px labels). Hover drives seek preview and row discovery. Native `<select>` menus open OS popups. Focus is a 2 px ring with no scale or elevation. One accent colour marks focus, progress, primary buttons, kicker labels, and sliders, so focus stops standing out. | `14-home-keyboard-focus.png`, `50-player-controls@1920.png` | Adopt the token scale (`--ui-scale`), the focus model (ring plus lift), and focus-only interaction from DESIGN.md. Reserve the focus colour for focus alone. |

## Findings by screen

### App shell and cross-cutting

| Sev | Problem | Evidence | Recommended fix |
|---|---|---|---|
| P0 | No navigation (see Top 1). | `11`, `13`, `20`, `60` | App shell `AppNav`. Hide it in the player. |
| P1 | Footer links render without spacing: "SearchBack to featuresSign out". | `11-home-fullpage.png`, `20-browse-libraries.png`, `33-search-no-results.png` | Remove them. Sign out moves to Settings › Account. |
| P1 | Three button systems: the acid `primary-button`, `text-button`, and unstyled browser buttons (Retry, Load more, Season, Watched, Up next). | `21`, `22`, `55`, `58` | One `Button` component with `primary`, `secondary`, `quiet`, and `icon` variants. |
| P1 | The acid accent `#c8ff3d` marks focus, primary buttons, progress, kickers, sliders, and pressed state. Focus loses meaning, and the neon-on-black look fights the artwork. | `40`, `50`, `14` | Keep the chrome neutral and warm, take colour from artwork, and reserve `--focus` for focus. |
| P1 | Reduced motion covers only `.card-skeleton`. Player chrome slides, spinners spin, and the header translates. | `styles.css` | Apply the reduced-motion rules in DESIGN.md › Motion to every transition. |
| P2 | The background radial gradient is painted on `body` and on `.app-shell` at different heights, which leaves a visible band on short pages. | `13-home-empty.png`, `20-browse-libraries.png` | Paint one fixed ambient layer per screen (`AmbientBackdrop`). |
| P2 | The browser-mode label covers the player's fullscreen button. This only happens in development. | `50-player-controls.png` | Move the label top-centre in the player, or hide it there. |

### Sign-in (`src/features/sign-in/`)

| Sev | Problem | Evidence | Recommended fix |
|---|---|---|---|
| P1 | Raw error "Request failed with status code 401". `errorMessage()` passes `Error.message` through. | `06-signin-password-error.png`, `sign-in-shell.tsx` | Map known failures (401, network, timeout, version) to plain copy. Keep raw text out of the UI. |
| P1 | The "STEP 01 / CONNECTION" kicker and 70 px headings make a three-word question look like a poster. The "Signing in to" line collides with the heading's descenders (line-height .98, no margin). | `01`, `04`, `05` | Use one quiet question per step at `--type-title`, with the server origin as a chip under it. |
| P1 | "Back to features" sits on the first screen a new user sees. | `01-signin-server.png` | Remove it. |
| P1 | Quick Connect makes **Cancel** the primary button and shows the code as one string of six spaced digits. | `04-signin-quick-connect.png` | Make the code the hero, grouped as "482 913" in mono digits. Primary action: none (it is waiting). Secondary: "Use password". Quiet: "Change server". |
| P2 | The unencrypted-connection warning is a giant headline. Cancel is rightly the default. | `03-signin-unencrypted-confirm.png` | Keep the copy and the safe default. Make it a `Dialog` with a warning icon, a 2-line title, and the origin in mono. |
| P2 | The discovery panel (native only) shows "Advertised by", conflict, and refused-reply lines all at once in small text. | `server-discovery.tsx` | List discovered servers first, as large selectable rows (name, address). Fold warnings into the row they concern. Put manual entry below. |

### Home (`src/features/home/`)

| Sev | Problem | Evidence | Recommended fix |
|---|---|---|---|
| P0 | Next Up cards overlap (see Top 2). | `10-home.png` | `MediaCard` variants with width tokens. |
| P1 | No hero and no hierarchy (see Top 9). | `10-home@1920.png` | `Hero` from the first Continue Watching item, or else the newest item. |
| P1 | Continue Watching mixes 2:3 posters and 16:9 thumbs in one row, so the rhythm breaks. | `10-home.png` | Continue Watching and Next Up use 16:9 thumbs only (Jellyfin `Thumb`, then `Backdrop`, then the episode `Primary`). Latest rows use posters. |
| P1 | Progress is a 4 px acid bar. The card's accessible name says "42% watched", but nothing visible says how long is left. | `10-home.png`, `media-row.tsx` | Show the progress bar and "38 min left" under the title. Put the same text in the accessible name. |
| P1 | Loading shows six portrait skeletons per row, and the Latest skeleton has no title. Rows then reflow into thumbs. | `12-home-loading.png` | Skeletons match the variant and title of the row they stand in for. |
| P1 | Empty Home is a heading and run-together links. | `13-home-empty.png` | Empty state "Nothing to watch yet", explaining that libraries on {server} have no items, with Open Settings and Sign in to another server. |
| P2 | A row error reads "Could not load Latest in Movies." with a grey "Retry" text button. | `home-view.tsx` | `InlineError` with an icon, the sentence "Couldn't load Latest in Movies.", and a `secondary` Retry. |
| P2 | Focus draws two rings: the outline on the whole link and a box-shadow on the art, misaligned. | `14-home-keyboard-focus.png` | One focus treatment on the art frame (ring plus lift). The title brightens. |

### Browse and library grid (`src/features/browse/`)

| Sev | Problem | Evidence | Recommended fix |
|---|---|---|---|
| P0 | Libraries are listed as bare text links: "Movies Shows". | `20-browse-libraries.png` | Libraries live in the nav. A Libraries page, if kept, shows library tiles with art. |
| P1 | The page is titled "Browse". The library name shows as small body text. | `21-library-grid.png` | `h1` = library name, with the item count. |
| P1 | Sort, order, and filter controls are two native selects and three tiny checkboxes, and one checkbox is broken (see Top 6). | `21-library-grid.png` | `Toolbar`: a sort menu button ("Name ↑"), filter chips (Unwatched, Favorites, In progress) as toggle chips, sticky under the nav. |
| P1 | "Load more" is a plain button at the end of the grid. | `library-grid.tsx` | Load automatically when the last row nears the viewport. Keep a focusable "Load more" fallback for keyboard users and screen readers, and announce counts as today. |
| P2 | Grid cards carry no watched or favourite marks. | `21-library-grid.png` | Corner marks: a check for played, an unplayed-episode count for series. |

### Series, seasons, and episodes (`series-view.tsx`)

| Sev | Problem | Evidence | Recommended fix |
|---|---|---|---|
| P0 | No series identity: no name, art, overview, or play action (see Top 3). | `22-series-episodes.png` | `DetailHeader` (series variant) with Play Next Up. |
| P0 | Episode art overlaps the overview text, which is cut off ("e keeper's daughter…"). | `23-series-episodes-fullpage.png` | `EpisodeRow`: thumb 16:9 at a fixed width token, text column `minmax(0,1fr)`. |
| P0 | The selected season is not shown. | `22-series-episodes.png` | `SegmentedTabs` with a selection bar and `aria-selected` on `role="tab"`. |
| P1 | Episodes show only "Episode 1", with no runtime, played mark, or air date. | `22-series-episodes.png` | "1 · Landfall", runtime or time left, a played check, and two lines of overview. |
| P2 | "Back to libraries" goes to the developer browse index. | `series-view.tsx` | Back goes through history. Nav covers the rest. |

### Search (`src/features/search/`)

| Sev | Problem | Evidence | Recommended fix |
|---|---|---|---|
| P1 | Choosing a movie hint runs a text search instead of opening the movie. The comment says "until the detail view exists (P3-08)", but P3-08 is done. | `search-box.tsx` `choose()` | Movie and episode hints open `itemRoute`. Series hints open `seriesRoute`. |
| P1 | Episode results overlap (see Top 2). | `32-search-results.png` | Episode results use the thumb grid track. |
| P1 | The empty search page is a label and a field. No results is plain text with run-together links. | `30-search-start.png`, `33-search-no-results.png` | The search field is big and autofocused. Empty state: "Search your libraries". No results: "No matches for "zzzz"" with a hint to check spelling or search by title. |
| P2 | Hints show "(2023) Movie" with no art. Hints with active descendant are good. | `31-search-hints.png` | `SearchSuggestion` row: small poster, title, year, and type. |

### Item detail (`src/features/detail/`)

| Sev | Problem | Evidence | Recommended fix |
|---|---|---|---|
| P0 | The `h1` is "Details" and the title is an `h2` (see Top 3). | `40-detail-movie.png` | The title is the `h1` (or the Logo image with alt text). |
| P1 | The backdrop sits in a 960 px box above a separate poster. The two images say the same thing, and the action sits below the fold on short windows. | `40-detail-movie.png`, `40-detail-movie@1920.png` | Full-bleed backdrop with a left scrim. Title, facts, and actions sit over the art. No poster on wide layouts; poster plus backdrop on narrow ones. |
| P1 | Watched and Favorite are unstyled text buttons whose state shows only as colour (see Top 4). "Watched" reads as a state, not an action. | `43-detail-played-favorite.png` | Icon toggles: "Mark as watched" or "Watched ✓", and an empty or filled heart for Favorite, with `aria-pressed`. |
| P1 | An episode thumb (16:9) is cropped into the 2:3 poster frame. The series name is grey text, not a link. There is no next or previous episode. | `44-detail-episode.png` | The episode variant uses the episode still in the header, a series link, "S1 · E2", and an episode strip for the season below. |
| P1 | The version picker uses native radios with 10 px labels (style leak), and the choice sits far from Play. | `41-detail-movie-fullpage.png` | `VersionPicker` pill beside Play ("4K HDR ▾") that opens a `Picker` sheet. |
| P2 | Media info is a dense `dl` at the bottom. That suits enthusiasts, but nothing summarises it near the title. | `41-detail-movie-fullpage.png` | `MediaBadges` in the facts line (4K · Dolby Vision · TrueHD 7.1). The full `dl` moves to a "File and streams" section. |
| P2 | Cast is a plain list of "Name as Role". | `40-detail-movie.png` | A `PersonRow` of compact cards (image or initials, name, role). |
| P2 | Not found shows a sentence with an inline link. | `45-detail-not-found.png` | `EmptyState`: "This item is no longer on the server" with Go home. |

### Player (`src/components/PlayerView.tsx`, `src/features/player/`)

| Sev | Problem | Evidence | Recommended fix |
|---|---|---|---|
| P1 | P-1 (closed in P13-13). Chrome hierarchy (see Top 7): the "NOW PLAYING" acid kicker, a decode chip always present while the controls show, and the floating "Info" text. | `50-player-controls.png` | Top bar: back, then title (series small above episode). No decode chip. Show a "Converting on server" chip only when converting (P10-06). Info opens from the control row or `i`. |
| P1 | P-2 (closed in P13-13). Track choice uses two native `<select>` menus, hidden to a 42 px icon on narrow screens with an invisible select. This is unusable on TV. | `50-player-controls.png`, `styles.css` mobile block | One `TrackPanel` (side sheet): Audio and Subtitles columns, radio rows with language, codec, and channels. Keys stay `c` to cycle subtitles and `a` to open the panel (proposed). |
| P1 | P-3 (closed in P13-13). Spinner text over video has no scrim (2.4:1 on a bright frame). The spinner stays visible when the chrome hides. | `51-player-idle.png` (stub artifact; verify natively) | `PlayerStatus` centre badge on a `--scrim-strong` disc. Respect reduced motion (static ring with a pulse). |
| P1 | P-4 (closed in P13-13). The seek preview thumbnail (320 px) overflows its 220 px frame. The time and chapter sit under the frame, not with it. | `53-player-seek-preview.png` | `ScrubPreview`: the frame sized to the trickplay tile, with the time and chapter inside its lower edge, clamped to the screen. |
| P1 | P-5. The Up Next card is plain text with unstyled buttons and no artwork. "Playing in 9 s" changes text every second, so `role="status"` announces it every second. | `55-player-next-episode.png`, `next-episode-card.tsx` | `UpNextCard`: next-episode thumb, "Up next · S1 E2", title, Play now (with the countdown as a fill on the button), and Hide. Announce once, then at 5 s. |
| P1 | P-6. The error panel says "Back to library" but goes to the item's details. | `57-player-error.png` | "Back to details". Error panel restyled per `Dialog`. |
| P2 | P-7. Skip intro is a square bordered button. It is fine, but it sits 150 px up regardless of chrome state. | `54-player-skip-intro.png` | `SkipButton` pill anchored above the scrubber and moved up when the chrome is visible. On TV, OK activates it while the chrome is hidden (see DESIGN.md › Player). |
| P2 | P-8 (closed in P13-13). The Info panel is a black box of label and value pairs. Its content is honest and right. | `52-player-info-panel.png` | `InfoSheet` with sections Playback (method, reason), Video, Audio, and Decoder, in mono values. |
| P2 | P-9 (closed in P13-13). Loading shows the full chrome over black with "--:--". | `56-player-loading.png` | `PlayerLoading`: the item backdrop dimmed, the title, "Opening the original file…" (or the conversion reason), and Back. No disabled controls. |
| P2 | P-10 (closed in P13-13). On Wayland the video is a native surface under a transparent WebView (`ARCHITECTURE.md` line 75), so `backdrop-filter: blur()` on the controls has no video pixels to blur. This is inferred and needs checking on the desktop build. | `styles.css` `.player-*` | Player overlays use opaque scrims and gradients, never backdrop blur. |

### Refusal (`RefusalScreen` in `player/index.tsx`)

| Sev | Problem | Evidence | Recommended fix |
|---|---|---|---|
| P1 | A 70 px five-line title, unstyled buttons, and no item context. | `58-player-refusal.png` | `Notice` layout over the dimmed backdrop: the item title small, a 2-line reason title, the explanation, "What you can do", and primary Retry with secondary Back to details. |
| P1 | The copy still says Fluster "won't ask the server to convert" in several reasons. Decision 0002 changed that. | `refusal-copy.ts` | Already owned by **P10-11**. The design system only supplies the layout and voice. |

### Settings (`src/features/settings/`, added by P10-05)

| Sev | Problem | Evidence | Recommended fix |
|---|---|---|---|
| P1 | S-1. Settings holds only the two streaming limits, as native selects inside the leaking global `label` and `select` styles. It ends in Home and "Back to features" links. It has no Account or About sections, so Sign out stays scattered across page footers. P5-03 (passthrough) and P3-02 (stay signed in) have no slot. | `settings-view.tsx` | Restyle and extend it (P13-17): Playback, Subtitles, Account, and About & diagnostics sections built from `SettingsRow` and `Picker` (see DESIGN.md §7.18). Keep the P10-05 values and storage. |
| P2 | S-2 (closed in P13-13). P10-05's Play original is a plain button fixed at the bottom right of the player, separate from the conversion indicator and the Info panel. | `player/index.tsx`, `styles.css` `.play-original` | Move it into the Info sheet's Playback section and the `ConversionChip` (DESIGN.md §7.14). |

## Keyboard and focus status (P3-14)

What works today: roving focus in rows, grids, and episode lists (`roving-focus.ts`); focus moves to the page heading on route change; the combobox search uses `aria-activedescendant`; Escape leaves the player; the skip button never steals focus; `:focus-visible` gives one ring everywhere.

Gaps:

1. No key reaches navigation (there is none).
2. Rows do not scroll the focused card into a comfortable position (edge padding). The browser scrolls it just into view and it can sit flush against the edge.
3. Up and Down between rows go through Tab, not arrows. TV needs spatial up and down between rows.
4. The native selects in the player and browse take over arrow keys and open OS popups.
5. The focused card has a double ring and no lift.

## What to keep

- The honesty in copy: "Preparing original file…", reasons on refusals, and the Info panel showing only verified facts.
- Roving focus, heading focus on navigation, and live-region announcements for loaded counts and search results.
- Blurhash placeholders. They also feed the artwork-derived accent proposed in DESIGN.md.
- The safe default in the unencrypted-connection warning (Cancel focused).
- Skip and Up Next behaviour: they offer, never force.
