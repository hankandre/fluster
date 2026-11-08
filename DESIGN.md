# Fluster design system

Status: **proposal, awaiting approval** (2026-11-08). Nothing here is wired into the app yet. The token block in §8 is the proposed content of `src/styles/tokens.css`. The audit behind it is [`docs/design/audit.md`](docs/design/audit.md). The work to adopt it is in [`docs/design/rework-plan.md`](docs/design/rework-plan.md).

## 1. The idea

**House lights down.** Fluster's screens behave like a cinema. While you choose, the lights are half up: quiet warm-black chrome, the artwork at full size, one clear action. When you press Play the lights go out and only the picture remains. Chrome comes back only when you reach for it, like an usher's torch.

The chrome itself is colourless. It is warm black with warm off-white text. **Colour comes only from the artwork**: each title tints its own screen with an accent taken from its artwork's BlurHash (§3.2). Two films never look the same, and the app never looks like a brand fighting the poster.

The scene: an evening, a dimmed living room or a desk, eyes already adjusted to the dark. On the TV it is the same room seen from three metres away with a remote. Dark is chosen for that room, not by habit.

## 2. Principles

1. **The artwork is the interface.** Backdrops, posters, stills, and logos carry identity and hierarchy. The chrome never adds a decorative colour, texture, or illustration that competes with them. If a screen has no artwork, it stays quiet. It does not invent some.
2. **One obvious next action.** Every screen has exactly one primary action, and it is what most people want: Resume, Play next episode, Play. Everything else is one step away, never in the way. Resume from Home takes one activation.
3. **Lights follow intent.** The chrome fades as the content takes over. It is half-lit while browsing and dark while playing, and it comes back on input, pause, or a prompt that needs an answer. It never hides while it holds focus or while the video is paused.
4. **Focus is the cursor.** Every screen works with arrow keys, Enter, and Back alone, from a keyboard or a remote. The focused thing is unmistakable: it lifts and gets a warm-white ring. Hover only previews focus. It never replaces it.
5. **Honest, then quiet.** Say what is really happening (original file, repackaging, converting, refused, and why) in plain words at the moment it matters, then get out of the way. Technical depth lives one key away (`i`), not on the main surface.
6. **One system from desk to sofa.** The same tokens and components serve a 1440 px window and a 10-foot TV. Only scale, density, and input change. A component that works only with a mouse is unfinished.
7. **Calm under failure.** Loading, empty, error, and refused states are designed screens with the item's own artwork, a clear sentence, and a way forward. Nothing ever shows a raw status code or a blank page.

## 3. Colour

### 3.1 Chrome palette

Warm neutrals, tuned so that text never sits on pure black and never on blue-black (today's `#080a0f`). Contrast ratios are measured against `--surface-0` (`#0b0c0e`).

| Token | Value | Use | Contrast |
|---|---|---|---|
| `--void` | `#060708` | Behind artwork, player letterbox | n/a |
| `--surface-0` | `#0b0c0e` | App background | n/a |
| `--surface-1` | `#131417` | Sheets, menus, dialogs | n/a |
| `--surface-2` | `#1b1c20` | Control fill, inputs, skeletons | n/a |
| `--surface-3` | `#25262b` | Hovered control fill | n/a |
| `--line` | `rgb(242 239 233 / .10)` | Hairlines, dividers | n/a |
| `--line-strong` | `rgb(242 239 233 / .20)` | Input borders, secondary button border | 3.1:1 on surface-2 |
| `--text-1` | `#f2efe9` | Titles, body, primary labels | 17.0:1 |
| `--text-2` | `#a9a59d` | Overview, secondary labels | 8.0:1 |
| `--text-3` | `#8a867f` | Meta, placeholders, disabled hints | 5.1:1 on surface-1 |
| `--on-light` | `#0b0c0e` | Text on primary (light) buttons | 17.0:1 on text-1 |
| `--focus` | `#fff4dc` | Focus ring (only focus) | 17.9:1 |
| `--danger` | `#ff8a6b` | Errors, destructive confirm | 8.5:1 |
| `--notice` | `#f0b65a` | "Converting on server", warnings | 10.8:1 |
| `--ok` | `#8fd1a8` | Success toasts, "Original file" | 11.1:1 |

Rules:

- **Primary buttons are light, not coloured.** `--text-1` fill with `--on-light` text. This is the projector beam. It reads at any distance and never clashes with the artwork.
- **`--focus` is used only for focus.** Not for selection, progress, or links.
- **State colours appear only with an icon and words.** Colour is never the only signal (WCAG 1.4.1).

### 3.2 Artwork-derived accent

Every item screen (Detail, Series, Player loading, Up Next) and the Home hero set three custom properties from the item's artwork:

| Token | Derived as | Use |
|---|---|---|
| `--art-accent` | The DC colour of the Backdrop BlurHash (falling back to Primary), converted to OKLCH, with lightness clamped to 0.72–0.82 and chroma capped at 0.14, hue kept | Progress fill, selected-tab bar, ambient glow tint |
| `--art-glow` | `--art-accent` at 22% alpha | Radial ambient light behind the hero scrim |
| `--art-shade` | The same hue at lightness 0.16 and chroma ≤ 0.04 | Tint of the scrim's dark end, so the art bleeds into the chrome |

How:

- The BlurHash format stores the average colour directly. Characters 2–5 are the DC term, a base-83 24-bit sRGB value ([blurhash spec](https://github.com/woltapp/blurhash/blob/master/Algorithm.md)). There is no image decoding and no canvas, and it is available before the image loads. Fluster already receives `ImageBlurHashes` (`src/lib/jellyfin/cards.ts`).
- A pure function `artTint(blurHash) → { accent, glow, shade } | undefined` lives in `src/features/shared/` (presentation, not domain). It is unit-tested with fixed hashes.
- If chroma is below 0.02 (grey art) or there is no hash, the defaults apply: `--art-accent: #e8c48a` (warm brass, 11.8:1), `--art-shade: #141210`.
- The clamp keeps `--art-accent` at 3:1 or more against `--surface-0` and the progress track (WCAG 1.4.11). **Never use it for text under 24 px, for focus, or as a button fill.**
- Changing items crossfades the three properties over `--dur-slow`. Reduced motion swaps them instantly.

## 4. Typography

**Faces** (self-hosted woff2 under `src/assets/fonts/`, with no font CDN, per PRODUCT.md principle 6):

- **Atkinson Hyperlegible Next**, variable 200–800. All UI and body. It was designed by the Braille Institute for legibility, with distinct `Il1` and `O0` and open apertures, which pays off on a TV at three metres and for low-vision viewers.
- **Atkinson Hyperlegible Mono.** Timecodes, Quick Connect codes, server addresses, and technical values (codec, bitrate) only. These are measurements, not decoration.
- **The title's own Logo image** is the display face. When Jellyfin has a `Logo` image (`ImageTags.Logo`, or `ParentLogoImageTag` for episodes), the hero shows it instead of set type, with `alt` set to the title. Without one, the title is set in Atkinson Hyperlegible Next 700.
- Fallback stack: `"Atkinson Hyperlegible Next", system-ui, -apple-system, "Segoe UI", sans-serif`.
- **[unverified]** Check the release, the OFL licence text, and tabular-figure support of both Atkinson faces before bundling. If Next lacks `tnum`, timecodes already use Mono.

**Scale** (rem at `--ui-scale: 1`, root 16 px; see §6 for TV):

| Token | Size / line height | Weight | Tracking | Use |
|---|---|---|---|---|
| `--type-hero` | `clamp(2.5rem, 1.5rem + 2.6vw, 4.5rem)` / 1.02 | 700 | -0.02em | Hero and detail title without a logo |
| `--type-title` | 2rem / 1.15 | 650 | -0.01em | Page titles (library, Settings), dialog titles at 1.5rem |
| `--type-heading` | 1.375rem / 1.25 | 600 | 0 | Row and section titles, sentence case |
| `--type-body-lg` | 1.125rem / 1.55 | 400 | 0 | Overview (max 62ch) |
| `--type-body` | 1rem / 1.5 | 400 | 0 | Body, settings descriptions |
| `--type-label` | 0.9375rem / 1.3 | 600 | 0 | Buttons, card titles, tabs |
| `--type-meta` | 0.8125rem / 1.35 | 500 | 0.01em | Card subtitles, facts line, badges |
| `--type-mono` | 0.875rem / 1.3 | 500 | 0 | Timecodes, codes, technical values (`tnum`) |

Rules: sentence case everywhere (no uppercase-tracked labels, no eyebrow or kicker labels). Text is never smaller than 13 px on desktop or 22 px on TV. Titles truncate to one line in cards and two lines in headers, with the full title in the accessible name.

## 5. Space, shape, depth, motion

**Spacing** is on a 4 px grid: `--space-1` 4 · `-2` 8 · `-3` 12 · `-4` 16 · `-5` 24 · `-6` 32 · `-7` 48 · `-8` 64 · `-9` 96. Groups are tight and separations are generous, with more space above a heading than below it. The page gutter is `--gutter: clamp(24px, 4vw, 72px)`.

**Radii** are soft but not bubbly:

| Token | Value | Use |
|---|---|---|
| `--radius-xs` | 4px | Badges, progress track |
| `--radius-art` | 6px | Posters, thumbs, stills |
| `--radius-control` | 10px | Buttons, inputs, menus |
| `--radius-sheet` | 16px | Dialogs, side sheets, Up Next |
| `--radius-pill` | 999px | Chips, Skip, scrubber thumb, tabs bar |

**Elevation** is shadow plus surface, never coloured glows:

| Token | Value | Use |
|---|---|---|
| `--shadow-lift` | `0 14px 32px -10px rgb(0 0 0 / .65)` | Focused card |
| `--shadow-sheet` | `0 28px 72px -16px rgb(0 0 0 / .75)` | Sheets, dialogs, Up Next |
| `--scrim-hero` | `linear-gradient(90deg, rgb(11 12 14 / .94) 0%, rgb(11 12 14 / .72) 38%, rgb(11 12 14 / 0) 72%)` | Text side of backdrops |
| `--scrim-floor` | `linear-gradient(0deg, var(--surface-0) 0%, rgb(11 12 14 / 0) 40%)` | Backdrop fading into the page |
| `--scrim-player-top` | `linear-gradient(180deg, rgb(0 0 0 / .72), rgb(0 0 0 / 0))` (160 px) | Player title zone |
| `--scrim-player-bottom` | `linear-gradient(0deg, rgb(0 0 0 / .85), rgb(0 0 0 / 0))` (240 px) | Player controls zone |

Player overlays use scrims and opaque surfaces, **never `backdrop-filter`**. The native video surface sits under a transparent WebView (`ARCHITECTURE.md` "Desktop composition"), so a blur has no video pixels to sample. This is inferred from the architecture and needs checking on the desktop build. Elsewhere, blur is allowed only on the nav bar over artwork.

**Motion.** One authored behaviour, light changing level. Things fade and lift. They never bounce, slide across the screen, or spin decoratively.

| Token | Value | Use |
|---|---|---|
| `--dur-instant` | 80ms | Press feedback |
| `--dur-quick` | 160ms | Focus lift, hover, toggles |
| `--dur-base` | 240ms | Chrome in and out, sheets, toasts |
| `--dur-slow` | 480ms | Backdrop and art-tint crossfade |
| `--ease-out` | `cubic-bezier(.16, 1, .3, 1)` | Entrances, focus |
| `--ease-in-out` | `cubic-bezier(.65, 0, .35, 1)` | Crossfades |
| `--lift` | `scale(1.04)` (TV `1.08`) | Focused art |

Reduced motion (`prefers-reduced-motion: reduce`):

- No scale, translate, or parallax. Focus still shows ring and shadow.
- Crossfades of 120 ms or less on opacity only, or instant.
- Spinners become a static ring with "Loading…" text. The Up Next countdown shows only as text ("Playing in 8 seconds"), not as a fill animation.
- Chrome still auto-hides (that is a function, not an animation) and appears without a fade.

## 6. Layout

### Desktop and laptop (the Tauri window)

- Twelve fluid columns with `--space-5` gutters and `--gutter` margins. Content width is unlimited because the artwork wants the full window. Text blocks cap at 62ch.
- Window classes: **compact** under 720 px, **medium** 720–1279 px, **expanded** 1280–1919 px, **wide** 1920 px and up.
- Card widths come from tokens, not from the grid, so rows and grids share sizes:

  | Class | `--poster-w` (2:3) | `--thumb-w` (16:9) | Visible posters at full width |
  |---|---|---|---|
  | compact | 112px | 240px | ~3 |
  | medium | 140px | 280px | ~5 |
  | expanded | 168px | 320px | ~7 |
  | wide | 200px | 384px | ~8 |

- Rows bleed to the right edge. The first card aligns to the gutter, and a partly visible card at the right edge signals that more is there. Grids use `repeat(auto-fill, var(--poster-w))` with `justify-content: space-between` and a minimum column gap of `--space-5`.
- Hero: `height: min(78vh, 56.25vw)`. The detail header is `min(82vh, 60vw)`. Text sits in the left 5 of 12 columns, bottom-aligned, `--space-8` from the floor.

### 10-foot (TV shell, M6)

- Logical canvas 1920×1080, which the shell scales to the panel. **Title-safe inset** is 5%: 96 px left and right, 54 px top and bottom. Nothing focusable or textual goes outside it, except artwork bleeding to the edges.
- `--ui-scale: 1.5` (root 24 px). The type scale multiplies with it, and `--type-meta` is raised to `0.9375rem` (22.5 px rendered).
- Posters are 248 px (6 visible). Thumbs are 416 px (4 visible). Row gap is 48 px. Focus lift is `scale(1.08)` with `--shadow-lift`.
- **No hover and no pointer.** All functions work with D-pad, OK, Back, Play/Pause, and Menu or Info. Text entry happens only in search, through the shell's on-screen keyboard.
- Navigation is a top tab row that is hidden while a content row has focus and appears when focus moves up from the first row. Back from any root tab returns focus to the tab row, and Back on Home exits (after a confirmation in the shell).

## 7. Components

Each component lists its anatomy, variants, states, and accessibility notes. All of them live under `src/features/shared/ui/` (proposed), use tokens only, and have a Testing Library test plus a screenshot in the design review.

### 7.1 App shell and nav (`AppShell`, `AppNav`)

- A top bar, 64 px desktop or 96 px TV. Left: the Fluster wordmark (text, `--type-label` 700), which goes to Home. Then: Home, one entry per library (from `UserViews`), and Search (icon plus label). Right: Settings (gear icon) with the user's initial.
- It is transparent over a hero, then `--surface-0` at 92% with a blur once content scrolls under it (the only allowed blur). On desktop it hides on scroll down and returns on scroll up.
- It is hidden in the player and in sign-in.
- Accessibility: `<nav aria-label="Main">`, the current page marked `aria-current="page"`, and a skip link "Skip to content" as the first Tab stop.

### 7.2 Ambient backdrop (`AmbientBackdrop`)

- A fixed layer behind each screen: the current item's backdrop at 100% (Detail) or 35% (Home, following the focused card after a 300 ms dwell), under `--scrim-hero` and `--scrim-floor`, tinted by `--art-glow`.
- It crossfades over `--dur-slow`. It loads `maxWidth=1920` (TV) or the window width. The BlurHash shows first.

### 7.3 Hero (`Hero`)

- Home's first viewport. It shows the first Continue Watching item, or else Next Up, or else the newest item.
- Contents: the Logo or title, one facts line (`S2 · E4 · 38 min left`, or `2023 · 2 h 3 min · 4K · Dolby Vision`), at most two lines of overview, and the `ActionBar` (compact: Resume or Play, plus "More info").
- With no candidate (empty library), no hero is shown and the first row moves up.

### 7.4 Media row (`MediaRow`)

- Title (`--type-heading`, sentence case) with an optional "See all" link to the library or filter. Below it, a horizontal list of `MediaCard`s.
- Desktop pointer: a previous or next arrow button appears on the row's edge on hover, and pages one viewport.
- Keyboard: Left and Right move within the row (roving tabindex, as today). Up and Down move to the nearest card in the adjacent row by horizontal centre (spatial). The focused card scrolls so it keeps `--gutter` from the edge.
- States: skeleton (cards of the right variant), error (`InlineError` in place of cards), and hidden when empty (as today).

### 7.5 Media card (`MediaCard`)

| Variant | Frame | Under the art | Primary action (Enter or click) |
|---|---|---|---|
| `poster` | 2:3, `--poster-w` | Title (1 line), year or "3 new" | Open detail or series |
| `thumb` (Continue Watching, Next Up) | 16:9, `--thumb-w`, Thumb, then Backdrop, then Primary | Series or title, then "S1 · E2 · 38 min left" | **Resume or play** (one activation). The `i` key, Menu on TV, or right-click opens details. Needs user approval (rework plan open question 1) |
| `episode` | 16:9 inside `EpisodeRow` | n/a | Play the episode |
| `library` | 16:9, library image | Library name | Open the library |

- Marks (top right, 24 px disc on `--scrim`): a check for played, a count for unplayed episodes, a heart for favourite (only in Favorites views). The progress bar sits at the bottom of the frame: a 4 px track `rgb(255 255 255 / .22)` with an `--art-accent` fill (the card's own tint, otherwise the default).
- Focus: the frame lifts by `--lift` with `--shadow-lift`, plus a 3 px `--focus` ring at a 3 px offset with a 1 px `rgb(0 0 0 / .6)` outer line so the ring reads on bright posters. The title goes from `--text-2` to `--text-1`. Hover gets the same treatment at half strength (no scale).
- Missing image: `--surface-2` with the title in `--type-label`, centred. Never a broken image.
- Accessibility: one link or button per card. The accessible name joins the title, subtitle, and progress ("Harbor Lights, S1 E2 The Keeper's Log, 38 minutes left"). Decorative text is `aria-hidden` (as today).

### 7.6 Episode row (`EpisodeRow`)

- Grid columns are `var(--thumb-w)` and `minmax(0, 1fr)`. The thumb has progress and a played check. Text: "2 · The Keeper's Log" (`--type-label`), the runtime or "22 min left" (`--type-meta`), and a two-line overview (`--type-body`, `--text-2`).
- Enter plays. A trailing "Details" icon button opens the episode detail.
- On TV, the season's episodes become a horizontal row of `thumb` cards with the overview under the focused one.

### 7.7 Detail header (`DetailHeader`)

- A full-bleed `AmbientBackdrop` at full strength. Over it, in the left five columns: the Logo or title (`h1`), a facts line, `MediaBadges`, the `ActionBar`, and a three-line overview with a "More" disclosure.
- Variants:
  - **movie**
  - **series**: facts are year range, seasons, and rating. The primary action is "Resume S1 · E2" or "Play S1 · E3". Season tabs and the episode list sit below.
  - **episode**: the series name is a link above the title. Facts read "S1 · E2 · 45 min". The episode still replaces the backdrop when the episode has no backdrop. A "More from Season 1" episode strip sits below.
- Compact windows stack poster (or still), then title, then actions, then overview.

### 7.8 Action bar (`ActionBar`)

- Order: **Primary** (`Resume 41:00` with a small progress ring, or `Play`), then `Start over` (secondary, only when resuming), then icon toggles `Watched` and `Favorite` (each `aria-pressed`, label visible on desktop, tooltip plus accessible name on TV), then `More` (menu: Version, File and streams, Go to series, Mark season watched).
- The primary button gets initial focus when the screen opens (TV and keyboard). On desktop, focus goes to the `h1` first for screen readers (as today), and one Tab reaches Play.
- When the player cannot start (`usePlayerStatus` unavailable), the primary button stays enabled. An `InlineNotice` under the bar explains, and "Check again" sits beside it (as today, restyled).

### 7.9 Media badges and file details (`MediaBadges`, `FileAndStreams`)

- Badges are text-only tags on `--surface-2` at `--radius-xs` in `--type-meta`: `4K`, `Dolby Vision`, `HDR10`, `TrueHD 7.1`, `Atmos` (only when the stream title says so), and `PGS · ASS` when there are image or styled subtitles. At most five. No logos of third-party brands.
- `FileAndStreams` is a section at the bottom of Detail: the version picker plus the current `MediaInfo` definition list in two columns, values in Mono.

### 7.10 Pickers (`Picker`, used for Version, Audio, and Subtitles)

- A trigger button shows the current value ("4K HDR ▾", "English · TrueHD 7.1 ▾"). It opens an anchored menu on desktop or a right-side sheet on TV and in the player.
- The list is a `role="listbox"` (or `radiogroup`) of rows with a check on the selected row and a two-line label (name, then codec, channels, and default or external flags).
- Arrow keys move, Enter selects and closes, Escape or Back closes without change. Never a native `<select>` (it opens an OS popup the TV shell cannot style or focus).

### 7.11 Segmented tabs (`SegmentedTabs`)

- Used for seasons and for Settings sections on wide screens. `role="tablist"`. The selected tab is `--text-1` with a 2 px `--art-accent` bar under it. The others are `--text-2`. Left and Right move and select (automatic activation, since season lists are cheap). Specials go last.

### 7.12 Toolbar (`BrowseToolbar`)

- Sticky under the nav: Sort (menu button "Name ↑"), filter chips (Unwatched, Favorites, In progress) as `aria-pressed` toggle chips with a check icon when on, and the item count on the right.

### 7.13 Search (`SearchField`, `SearchSuggestion`)

- A large field (`--type-title` text, 64 px tall, search icon, clear button), autofocused. The suggestions list sits under it with a 40 px poster, title, year, and type.
- Choosing a suggestion opens the item or series directly.
- Results are grouped rows (Movies, Shows, Episodes) using the same `MediaRow` and `MediaCard` variants.

### 7.14 Player chrome

Pure video by default. The chrome is three zones, shown together and hidden together:

1. **Top bar** (`PlayerTopBar`, over `--scrim-player-top`): Back (icon button), then the title block. Episodes show the series name (`--type-meta`, `--text-2`) above the episode title ("S1 · E2 The Keeper's Log", `--type-heading`). On the right, a `ConversionChip` only when the play method is not direct play: "Converting on server · bitrate limit" in `--notice` with an icon. It opens the Info sheet. Nothing is shown for direct play (PRODUCT.md: "no indicator beyond the player information panel").
2. **Scrubber** (`Scrubber`, full width inside the gutter): a 4 px track that grows to 8 px when hovered or focused. Elapsed time sits left and remaining time right ("−1:21:40"), in `--type-mono`. "Ends at 22:41" appears beside the remaining time when there is room. Chapters are 2 px gaps cut into the track, not ticks above it. The buffered range shows at 35% white. The fill is `--art-accent`. The thumb is a 16 px `--text-1` disc that appears on hover or focus.
   - `ScrubPreview`: a frame sized to the trickplay tile (320×180 desktop, 384×216 TV) at `--radius-art`, with time and chapter name inside its lower edge on a scrim, clamped within the gutter. Keyboard focus on the scrubber shows the preview at the playhead, and Left and Right step 10 s with the preview following.
3. **Control row** (`TransportControls`). Desktop: Play or Pause (56 px light disc, the only light-filled control), back 10, forward 10, then Volume (icon plus slider revealed on hover or focus), then a spacer. Right side: "Audio & Subtitles" (speech icon), Chapters (list icon, when there are chapters), Info (`i` icon), Fullscreen. TV: transport is centred (back 10, Play or Pause, forward 10) and the rest sits right. Volume is the TV's.

Panels:

- **`TrackPanel`**: a right side sheet (`--surface-1`, 420 px, or 33% on TV) with Audio and Subtitles lists (see `Picker`). Video keeps playing. It closes on Back or Escape, and focus returns to the trigger.
- **`InfoSheet`** (the P3-18 content): a right side sheet with sections Playback (method, reason, "Original file" in `--ok`), Video, Audio, Decoder, and Renderer. Values are Mono. It never shows URLs, IDs, or tokens (existing redaction rules).
- **`ChapterList`**: a right sheet of chapter thumbnails (trickplay at the chapter start) and names.

OSD (`Osd`): a transient pill at top centre, under the top bar's position, visible for 1.2 s, for actions taken by key while the chrome is hidden: "Subtitles: English (SDH)", "Volume 65%", "Muted", "+10 s". Today `c`, `m`, and the arrow keys give no visible feedback. `role="status"`, and reduced motion makes it appear without a fade.

Status (`PlayerStatus`): loading, buffering, and seeking show a centred 64 px disc on `--scrim` with a ring and one line of text ("Opening the original file…", "Buffering…"). It is visible regardless of chrome. Before the first frame, `PlayerLoading` shows the item's backdrop at 40% with the title and the status, plus Back. Controls are not drawn until there is a snapshot.

Idle: the chrome hides 3 s after the last input while playing. It never hides while paused, while a panel or menu is open, while a chrome control has focus, or while a skip or Up Next prompt has focus. The cursor hides with it (as today).

### 7.15 Skip and Up Next

- **`SkipButton`**: a pill (`--text-1` at 92% fill, `--on-light` text, skip icon) at the bottom right, above the scrubber's position. It sits higher when the chrome is visible. It appears with a fade when an Intro or Outro segment is active and stays until the segment ends. Desktop: never takes focus (as today), and the `s` key (proposed) activates it. TV: while the chrome is hidden, OK activates the visible Skip and arrows wake the chrome. This needs user approval (open question 4).
- **`UpNextCard`**: bottom right, 400 px (TV 560), `--surface-1` at 96% with `--shadow-sheet` and `--radius-sheet`. It shows the next episode's 16:9 still (with series poster fallback), "Up next · S1 · E2", the title, then **Play now** (primary, with the countdown drawn as a fill sweeping the button over the remaining seconds) and **Hide** (quiet; cancels autoplay, as today's Cancel). Text is announced once on appear ("Up next: The Keeper's Log, playing in 10 seconds") and again at 5 s, not every second.

### 7.16 Notices, dialogs, toasts

- **`Dialog`**: a centred `--surface-1` panel (max 560 px, `--radius-sheet`, `--shadow-sheet`) over a `rgb(0 0 0 / .6)` veil. Icon, title (`--type-title` at 1.5rem, at most two lines), body, and actions at the bottom right (primary last). It traps focus and restores it on close. The safe action gets initial focus for risky confirms (the unencrypted connection).
- **`Notice`** (full-screen state: refusal, player cannot start, not found): the item's backdrop at 30% under scrims. Left-aligned at five columns: the item title (`--type-meta`), the notice title (`--type-title`), the explanation (`--type-body-lg`), "What you can do" as a separate paragraph led by a bold phrase, then actions. Refusal follows P10-11 copy.
- **`Toast`**: bottom left, `--surface-1`, icon plus one sentence plus an optional action, 5 s (errors stay until dismissed). It is used for "Couldn't update watched state", "Marked as watched", and "Signed out". `role="status"` (`alert` for errors).
- **`InlineError`**: an icon, one sentence ("Couldn't load Latest in Movies."), and a secondary Retry. It replaces the content it failed to load.

### 7.17 Empty, loading, skeleton

- **`EmptyState`**: a centred column, 48 px line icon in `--text-3`, a title (`--type-heading`), one sentence, and at most one action. Copy for each case is in §10.
- **`Skeleton`**: `--surface-2` blocks shaped exactly like the content they stand in for, including row titles. A shimmer sweep of `--surface-3` at 1.6 s is turned off under reduced motion. Skeletons show only after 150 ms, so fast loads don't flash.

### 7.18 Settings (`SettingsPage`, `SettingsSection`, `SettingsRow`)

- Layout: section list on the left (desktop or TV) and section content on the right. Compact windows use a single list that drills in.
- Sections:
  - **Playback**: streaming limit, local and remote (P10-05), shown as a choice row with "No limit" and presets plus custom Mbps; auto-play next episode (on or off, countdown 5, 10, or 15 s); skip intros (offer button or never). Audio passthrough (P5-03) joins later.
  - **Subtitles**: read-only display of the Jellyfin language preferences with a link-out note. Styling comes in M2.
  - **Account**: server name and address (Mono), user, stay signed in (P3-02), sign out, change server.
  - **About & diagnostics**: version, player and libmpv version, renderer, and "Copy diagnostics" (redacted).
- `SettingsRow` is a 64 px row with a label and description on the left and a control on the right (switch, value plus chevron opening a `Picker`, or button). The whole row is the focus and hit target. Changes save immediately and confirm with a toast where the effect is invisible.

### 7.19 Buttons and fields

| Variant | Look | Use |
|---|---|---|
| `primary` | `--text-1` fill, `--on-light` text, 48 px (TV 72), `--radius-control` | One per screen |
| `secondary` | `rgb(242 239 233 / .12)` fill, `--text-1` text | Start over, Retry next to a primary |
| `quiet` | Transparent, `--text-2` text that becomes `--text-1` on hover or focus | Hide, Change server |
| `icon` | 44 px (TV 64) circle, `rgb(242 239 233 / .10)` fill | Watched, Favorite, player controls |
| `danger` | `secondary` with `--danger` text | Sign out confirm |

- All buttons have a `--dur-quick` hover fill change, `--dur-instant` press (scale .98, none with reduced motion), and the shared focus ring.
- `TextField`: a 52 px `--surface-2` field with a `--line-strong` border and `--radius-control`, label above in `--type-label` and `--text-2` (never tiny tracked capitals), helper and error text below, with the error linked via `aria-describedby`.

## 8. Tokens (proposed `src/styles/tokens.css`)

```css
/* Fluster design tokens. Proposal: not yet imported by src/styles.css. */
@font-face { font-family: "Atkinson Hyperlegible Next"; src: url("../assets/fonts/AtkinsonHyperlegibleNext-Variable.woff2") format("woff2"); font-weight: 200 800; font-display: swap; }
@font-face { font-family: "Atkinson Hyperlegible Mono"; src: url("../assets/fonts/AtkinsonHyperlegibleMono-Variable.woff2") format("woff2"); font-weight: 200 800; font-display: swap; }

:root {
  color-scheme: dark;

  /* Chrome palette */
  --void: #060708;
  --surface-0: #0b0c0e;
  --surface-1: #131417;
  --surface-2: #1b1c20;
  --surface-3: #25262b;
  --line: rgb(242 239 233 / 0.10);
  --line-strong: rgb(242 239 233 / 0.20);
  --text-1: #f2efe9;
  --text-2: #a9a59d;
  --text-3: #8a867f;
  --on-light: #0b0c0e;
  --focus: #fff4dc;
  --focus-edge: rgb(0 0 0 / 0.6);
  --danger: #ff8a6b;
  --notice: #f0b65a;
  --ok: #8fd1a8;
  --fill-secondary: rgb(242 239 233 / 0.12);
  --fill-icon: rgb(242 239 233 / 0.10);
  --track: rgb(255 255 255 / 0.22);
  --veil: rgb(0 0 0 / 0.6);

  /* Artwork tint: overridden per item by artTint() as inline custom properties */
  --art-accent: #e8c48a;
  --art-glow: rgb(232 196 138 / 0.22);
  --art-shade: #141210;

  /* Type */
  --font-ui: "Atkinson Hyperlegible Next", system-ui, -apple-system, "Segoe UI", sans-serif;
  --font-mono: "Atkinson Hyperlegible Mono", ui-monospace, "SFMono-Regular", monospace;
  --ui-scale: 1;
  --type-hero: 700 clamp(2.5rem, 1.5rem + 2.6vw, 4.5rem) / 1.02 var(--font-ui);
  --type-title: 650 2rem / 1.15 var(--font-ui);
  --type-heading: 600 1.375rem / 1.25 var(--font-ui);
  --type-body-lg: 400 1.125rem / 1.55 var(--font-ui);
  --type-body: 400 1rem / 1.5 var(--font-ui);
  --type-label: 600 0.9375rem / 1.3 var(--font-ui);
  --type-meta: 500 0.8125rem / 1.35 var(--font-ui);
  --type-mono: 500 0.875rem / 1.3 var(--font-mono);
  --tracking-hero: -0.02em;
  --measure: 62ch;

  /* Space */
  --space-1: 4px; --space-2: 8px; --space-3: 12px; --space-4: 16px; --space-5: 24px;
  --space-6: 32px; --space-7: 48px; --space-8: 64px; --space-9: 96px;
  --gutter: clamp(24px, 4vw, 72px);
  --safe-x: var(--gutter);
  --safe-y: 0px;

  /* Sizes */
  --poster-w: 112px;
  --thumb-w: 240px;
  --nav-h: 64px;
  --control-h: 48px;
  --icon-button: 44px;
  --hit-min: 44px;

  /* Shape */
  --radius-xs: 4px;
  --radius-art: 6px;
  --radius-control: 10px;
  --radius-sheet: 16px;
  --radius-pill: 999px;

  /* Depth */
  --shadow-lift: 0 14px 32px -10px rgb(0 0 0 / 0.65);
  --shadow-sheet: 0 28px 72px -16px rgb(0 0 0 / 0.75);
  --scrim-hero: linear-gradient(90deg, rgb(11 12 14 / 0.94) 0%, rgb(11 12 14 / 0.72) 38%, rgb(11 12 14 / 0) 72%);
  --scrim-floor: linear-gradient(0deg, var(--surface-0) 0%, rgb(11 12 14 / 0) 40%);
  --scrim-player-top: linear-gradient(180deg, rgb(0 0 0 / 0.72), rgb(0 0 0 / 0));
  --scrim-player-bottom: linear-gradient(0deg, rgb(0 0 0 / 0.85), rgb(0 0 0 / 0));

  /* Motion */
  --dur-instant: 80ms;
  --dur-quick: 160ms;
  --dur-base: 240ms;
  --dur-slow: 480ms;
  --ease-out: cubic-bezier(0.16, 1, 0.3, 1);
  --ease-in-out: cubic-bezier(0.65, 0, 0.35, 1);
  --lift: scale(1.04);
  --chrome-idle-ms: 3000;

  /* Focus */
  --focus-ring: 0 0 0 3px var(--focus), 0 0 0 4px var(--focus-edge);
  --focus-offset: 3px;

  /* Layers */
  --z-backdrop: 0; --z-content: 1; --z-nav: 10; --z-player-chrome: 20; --z-prompt: 30; --z-sheet: 40; --z-dialog: 50; --z-toast: 60;
}

@media (min-width: 720px)  { :root { --poster-w: 140px; --thumb-w: 280px; } }
@media (min-width: 1280px) { :root { --poster-w: 168px; --thumb-w: 320px; } }
@media (min-width: 1920px) { :root { --poster-w: 200px; --thumb-w: 384px; } }

/* 10-foot: set by the TV shell on <html data-form="tv"> */
:root[data-form="tv"] {
  --ui-scale: 1.5;
  font-size: calc(16px * var(--ui-scale));
  --safe-x: 96px;
  --safe-y: 54px;
  --gutter: var(--safe-x);
  --poster-w: 248px;
  --thumb-w: 416px;
  --nav-h: 96px;
  --control-h: 72px;
  --icon-button: 64px;
  --type-meta: 500 0.9375rem / 1.35 var(--font-ui);
  --lift: scale(1.08);
}

@media (prefers-reduced-motion: reduce) {
  :root { --dur-quick: 0ms; --dur-base: 0ms; --dur-slow: 120ms; --lift: none; }
}

@media (forced-colors: active) {
  :root { --focus-ring: 0 0 0 3px Highlight; }
}
```

## 9. Interaction rules

**Focus model**

- One focus at a time, always visible when it came from a keyboard or remote (`:focus-visible`). On TV, focus is always visible.
- Containers are one Tab stop with arrows inside (roving tabindex, as in `roving-focus.ts`). Up and Down across rows and sections are spatial: they go to the nearest item by horizontal centre.
- Opening a screen focuses its primary action (TV) or its `h1` (desktop, for screen readers), with the primary action as the next Tab. Returning with Back restores the previously focused card.
- Focus is never obscured: rows scroll the focused card to at least `--gutter` from any edge, and the sticky nav never covers it (WCAG 2.4.11).

**Hover and focus.** Hover previews (half-strength lift, row arrows, scrubber thickening) but never moves focus. Every hover-revealed control is also reachable and visible on focus.

**Back.** Back or Escape closes the topmost layer: menu, then sheet, then dialog, then fullscreen, then player, then screen (browser history). Backspace does the same outside text fields (proposed).

**Keyboard map**

| Where | Key | Action | Status |
|---|---|---|---|
| Anywhere | Arrows, Enter, Escape | Move, activate, back | Exists (partly) |
| Anywhere | `/` | Focus search | Proposed |
| Anywhere outside fields | Backspace | Back | Proposed |
| Card | `i` or Menu | Open details (when Enter resumes) | Proposed |
| Player | Space or `k` | Play or pause | Exists |
| Player | Left / Right or `j` / `l` | Seek ∓10 s | Exists |
| Player | Up / Down | Volume ±5 | Exists |
| Player | `m` / `f` / `c` | Mute / fullscreen / cycle subtitles | Exists, gains OSD feedback |
| Player | `i` | Info sheet | Exists, restyled |
| Player | `a` | Audio & Subtitles panel | Proposed |
| Player | `s` | Activate the visible Skip | Proposed |
| Player | `n` | Play now on the Up Next card | Proposed |
| Player | Home / End, 0–9 | Start / end, jump to 0–90% | Proposed |

**Idle hiding.** See §7.14. Home's ambient backdrop follows focus only after a 300 ms dwell, so fast scrolling doesn't flicker.

**Prefetch.** When focus rests on a card for 300 ms, prefetch its detail query and backdrop at the needed width. Play stays one activation.

## 10. Voice and copy

Fluster talks like a knowledgeable friend running the projector: calm, brief, plain, and honest about the file.

- Sentence case. No exclamation marks. No "Oops". No blame ("you entered" becomes "That address didn't answer").
- Controls name the action: "Resume", "Start over", "Play S1 · E3", "Mark as watched", "Hide".
- Times are human: "38 min left", "Ends at 22:41", "Resume from 41:00". Episodes are "S1 · E2".
- Errors name the problem and the way out: "Couldn't reach Hearth at 192.168.50.10. Check that the server is on, then try again."
- Honest playback words: "Original file", "Repackaging on server, original quality: {reason}", "Converting on server: {reason}" (PRODUCT.md). Never imply quality is kept when it isn't.
- Technical terms (HEVC, TrueHD, Direct play) appear in badges, File and streams, and Info, never in a primary sentence.

| State | Title | Body | Action |
|---|---|---|---|
| Home, empty | Nothing to watch yet | Your libraries on {server} don't have any movies or shows. Add media in Jellyfin, then come back. | Open settings |
| Search, start | Search your libraries | Movies, shows, and episodes. | n/a |
| Search, no results | No matches for "{term}" | Check the spelling, or try part of the title. | n/a |
| Library, filtered empty | Nothing matches these filters | n/a | Clear filters |
| Row error | n/a | Couldn't load {row}. | Retry |
| Sign-in, 401 | n/a | That username and password didn't work. | n/a |
| Sign-in, unreachable | n/a | Couldn't reach {address}. Check the address and that the server is running. | n/a |
| Item gone | This item is no longer on the server | It may have been removed or renamed. | Go home |
| Player loading | n/a | Opening the original file… | Back |

## 11. Accessibility rules (WCAG 2.2 AA)

1. Text contrast is 4.5:1 or more (3:1 for 24 px and up or 18.66 px bold and up). Non-text UI (progress, borders that convey state, focus) is 3:1 or more against its neighbours. Text over artwork always sits on a scrim that guarantees this. Check it on the brightest art in the fixtures.
2. Focus is visible (ring plus lift), never obscured (2.4.11), and the ring is 3 px or more with 3:1 or more contrast against both the art and the page (two-tone ring).
3. Targets are 44 px or more on desktop (above the 24 px minimum of 2.5.8) and 64 px or more on TV.
4. State is never colour alone: pressed toggles change icon (empty or filled) and accessible state (`aria-pressed`, `aria-selected`, `aria-current`).
5. Motion: honour `prefers-reduced-motion` everywhere (§5). Nothing flashes more than 3 times a second. The countdown never auto-advances without a visible, focusable Hide.
6. Every screen has one `h1` naming its content. Landmarks are `nav`, `main`, and the player's `region` "Player". Live regions are announced once per change, never every second.
7. Keyboard: everything reachable and operable without a pointer (P3-14). No keyboard traps except modal dialogs, which close on Escape.
8. Text scales to 200% without loss. Layouts reflow at 320 px CSS width (compact class).
9. Forced colours: the focus ring uses `Highlight`, and icons use `currentColor`.
10. Images: art is decorative (`alt=""`) when the title is in text nearby. A Logo used as the title has `alt="{title}"`.

## 12. What changes from today

| Today | Proposed |
|---|---|
| Acid lime `#c8ff3d` for primary, focus, progress, kicker, slider | Neutral light primary, warm-white focus only, artwork-tinted progress |
| Blue-black `#080a0f` with a fixed radial glow | Warm black, plus ambient light from the current item's art |
| Uppercase tracked 10–14 px labels and "STEP 01" kickers | Sentence-case headings, no eyebrows, 13 px minimum |
| Route-named pages ("Details", "Series", "Browse") | Content-named pages with artwork headers |
| No navigation; developer links in flows | App shell nav with Home, libraries, Search, Settings |
| Fixed 180 px card art | Width tokens per window class and TV, with aspect-ratio frames |
| Native selects, radios, and checkboxes | `Picker`, `SegmentedTabs`, filter chips |
| Decode chip and floating "Info" in the player | Title-only top bar, `ConversionChip` only when converting, Info sheet |
| Silent key actions in the player | OSD feedback |
| Raw errors; giant refusal headline | Copy table; `Notice` over the dimmed backdrop |
| No Settings | Settings with Playback, Subtitles, Account, About |

## 13. Open decisions for the owner

1. **One-activation resume**: Continue Watching and Next Up cards play on Enter, and details move to `i` or Menu. This changes the e2e journeys that click a card and then Play.
2. **Typeface**: Atkinson Hyperlegible Next and Mono (self-hosted). The alternative is the system UI stack, as today.
3. **Logo images as titles**: needs `Logo` in the image fields the gateway requests (`ARCHITECTURE.md` §3 `enableImageTypes`).
4. **TV Skip on OK**: while the chrome is hidden, OK activates a visible Skip. This differs from desktop, where Skip never takes focus.
5. **Ambient backdrop on Home focus**: a richer feel at the cost of extra image loads on dwell. Off on a metered connection (later).
