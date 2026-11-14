# Fluster design system

Status: **Accepted 2026-11-08.** The owner approved this system and the five decisions in §13. The app adopts it through phase P13 in `tasks/prd.json`. Until P13-02 lands, the token block in §8 is the planned content of `src/styles/tokens.css`. The audit behind it is [`docs/design/audit.md`](docs/design/audit.md). The work to adopt it is in [`docs/design/rework-plan.md`](docs/design/rework-plan.md).

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
| `--line-strong` | `rgb(242 239 233 / .37)` | Input borders, secondary button border | 3.06 to 3.17:1 on surface-0 to surface-3 |
| `--text-1` | `#f2efe9` | Titles, body, primary labels | 17.0:1 |
| `--text-2` | `#a9a59d` | Overview, secondary labels | 8.0:1 |
| `--text-3` | `#8a867f` | Meta, placeholders, disabled hints (surface-0 to surface-2 only; 4.17:1 on surface-3) | 5.1:1 on surface-1 |
| `--on-light` | `#0b0c0e` | Text on primary (light) buttons | 17.0:1 on text-1 |
| `--focus` | `#fff4dc` | Focus ring (only focus) | 17.9:1 |
| `--danger` | `#ff8a6b` | Errors, destructive confirm | 8.5:1 |
| `--notice` | `#f0b65a` | "Converting on server", warnings | 10.8:1 |
| `--ok` | `#8fd1a8` | Success toasts, "Original file" | 11.1:1 |

Correction 2026-11-08 (P13-02): `--line-strong` was first written as `/ .20` with a claimed 3.1:1. Measured, that is 1.8:1 on `--surface-2`. At `/ .37` it reaches 3:1 or more against every surface (3.11 / 3.17 / 3.16 / 3.06 on surface-0 to 3). `--line` stays a decorative divider and is exempt from 1.4.11.

Rules:

- **Primary buttons are light, not coloured.** `--text-1` fill with `--on-light` text. This is the projector beam. It reads at any distance and never clashes with the artwork.
- **`--focus` is used only for focus.** Not for selection, progress, or links.
- **State colours appear only with an icon and words.** Colour is never the only signal (WCAG 1.4.1).
- **Text over video is `--text-1` or `--text-2`, never `--text-3`.** A scrim over a moving picture is not a surface, so the dimmest grey has no guaranteed contrast there (UX audit D8 B; P13-33).

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
- **Verified 2026-11-08.**
  - Licence: both faces are under the SIL Open Font License 1.1. Sources: the `license` field of the GitHub repositories [googlefonts/atkinson-hyperlegible-next](https://github.com/googlefonts/atkinson-hyperlegible-next) and [googlefonts/atkinson-hyperlegible-next-mono](https://github.com/googlefonts/atkinson-hyperlegible-next-mono) (`OFL-1.1`), and the README of the first.
  - Next: `fonts/variable/AtkinsonHyperlegibleNext[wght].ttf` has a `wght` axis of 200–800 and GSUB features `tnum` and `pnum`, so timecodes and counts can use `font-variant-numeric: tabular-nums`.
  - Mono: `fonts/variable/AtkinsonHyperlegibleMono[wght].ttf` is fixed-pitch (`post.isFixedPitch` = 1), so every glyph is tabular, and it has a slashed-zero `zero` feature.
  - These checks parsed the font tables directly.
  - The Mono repository is archived. P13-02 vendors both woff2 files with `OFL.txt` under `src/assets/fonts/`.

**Scale** (rem at `--ui-scale: 1`, root 16 px; see §6 for TV):

| Token | Size / line height | Weight | Tracking | Use |
|---|---|---|---|---|
| `--type-hero` | `clamp(2.5rem, 1.5rem + 2.6vw, 4.5rem)` / 1.02 | 700 | -0.02em | Hero and detail title without a logo |
| `--type-code` | the `--type-hero` size / 1.02, in Mono | 700 | 0 | The Quick Connect code (`tnum`) |
| `--type-title` | 2rem / 1.15 | 650 | -0.01em | Page titles (library, Settings), dialog titles at 1.5rem |
| `--type-heading` | 1.375rem / 1.25 | 600 | 0 | Row and section titles, sentence case |
| `--type-body-lg` | 1.125rem / 1.55 | 400 | 0 | Overview (max 62ch) |
| `--type-body` | 1rem / 1.5 | 400 | 0 | Body, settings descriptions |
| `--type-label` | 0.9375rem / 1.3 | 600 | 0 | Buttons, card titles, tabs |
| `--type-meta` | 0.8125rem / 1.35 | 500 | 0.01em | Card subtitles, facts line, badges |
| `--type-mono` | 0.875rem / 1.3 | 500 | 0 | Timecodes, codes, technical values (`tnum`) |

Rules: sentence case everywhere (no uppercase-tracked labels, no eyebrow or kicker labels). Text is never smaller than 13 px on desktop or 24 px on TV. Titles truncate to one line in cards and two lines in headers, with the full title in the accessible name.

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
| `--skip-fill` | `color-mix(in srgb, var(--text-1) 92%, transparent)` | SkipButton pill |
| `--up-next-surface` | `color-mix(in srgb, var(--surface-1) 96%, transparent)` | Up Next card |
| `--up-next-fill` | `color-mix(in srgb, var(--on-light) 14%, transparent)` | Countdown fill on Play now |
| `--surface-0-glass` | `color-mix(in srgb, var(--surface-0) 92%, transparent)` | Nav bar fill (blur is `--blur-nav`, P13-08) |
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
- **The first screen shows more than the header.** On a 1440×900 window the Home hero is short enough that the whole first row shows beneath it, card titles included (UX audit D2 B), and a series header is short enough that the season tabs and the first episode row show (UX audit D3 B). P13-32 sets the token values; until it lands the heights above apply at every size.

### 10-foot (TV shell, M6)

- Logical canvas 1920×1080, which the shell scales to the panel. **Title-safe inset** is 5%: 96 px left and right, 54 px top and bottom. Nothing focusable or textual goes outside it, except artwork bleeding to the edges.
- `--ui-scale: 1.5` (root 24 px). The type scale multiplies with it. The TV block raises `--type-body` to `1.1667rem` (28 px), `--type-body-lg` to `1.3125rem` (31.5 px), and `--type-label`, `--type-meta`, and `--type-mono` to `1rem` (24 px), so body text is 28 px and labels, timecodes, and codes meet the 24 px floor; the TV `body` takes `--type-body`. The root size is set in the base layer, after the `font` shorthand, so rem scales with it.
- **TV body text is 28 px and no TV text is under 24 px** (UX audit D13 B): the sizes tvOS, Fire TV, and Xbox agree on. The type tokens are raised for the TV form; the scale, and six posters across, stay. The tokens are raised in the §8 block (P13-34).
- Posters are 248 px (6 visible). Thumbs are 416 px (4 visible). Row gap is 48 px. Focus lift is `scale(1.08)` with `--shadow-lift`.
- **No hover and no pointer.** All functions work with D-pad, OK, Back, Play/Pause, and Menu or Info. Text entry happens only in search and sign-in, through the shell's on-screen keyboard; sign-in leads with discovered servers and Quick Connect, so typing is the fallback (Q25 A).
- Navigation is a top tab row inside the safe inset that is hidden while focus is in the content and appears when Up from the first row reaches it. Down returns to the page. Back (Escape or Backspace) on a root tab focuses the tab row, and Back on Home leaves the app the way the platform requires: without a question on Android TV, whose guidelines say not to gate exit, and after a confirmation where a platform's rules ask for one (UX audit D14 B; P13-34): on Tizen, Back on Home asks "Leave Fluster?" with Stay focused and Leave primary, and Back closes it. The browser TV form follows the Android TV rule. The platform comes from `<html data-tv-platform>`, set by the TV shell. Up from the first row reaches the nav on every form.
- Opening a screen focuses its primary action. Screens without one keep their heading, search field, or section list.
- There is no Tab key: where no roving list takes an arrow key, a geometric fallback moves focus to the nearest control in that direction, inside the topmost dialog or sheet.
- Development: `?form=tv` turns the form on in browser mode (`applyFormFlag`, development builds only). The TV shell sets `data-form="tv"` itself.

## 7. Components

Each component lists its anatomy, variants, states, and accessibility notes. All of them live under `src/features/shared/ui/`, use tokens only, and have a Testing Library test plus a screenshot in the design review.

### 7.1 App shell and nav (`AppShell`, `AppNav`)

- A top bar, 64 px desktop or 96 px TV. Left: the Fluster wordmark (text, `--type-label` 700), which goes to Home. Then: Home, one entry per library (from `UserViews`), and Search (icon plus label). Right: Settings (gear icon), then the account control, the user's initial. Until P13-21 the initial is only a label. From P13-21 it opens the account menu (§7.21).
- It is transparent over a hero, then `--surface-0` at 92% with a `--blur-nav` blur once content scrolls under it (the only allowed blur). On desktop it hides on scroll down and returns on scroll up.
- It is hidden in the player and in sign-in.
- There is no Libraries page: each library is a nav entry (`#/next/browse` alone is Not found). Where the entries overflow, the list scrolls and the clipped edge fades over `--nav-fade-w` (a mask, no animation); a focused or current entry scrolls clear of the fade.
- Accessibility: `<nav aria-label="Main">`, the current page marked `aria-current="page"`, and a skip link "Skip to content" as the first Tab stop.

### 7.2 Ambient backdrop (`AmbientBackdrop`)

- A fixed layer behind each screen: the current item's backdrop at 100% (Detail) or 35% (Home, following the focused card after a 300 ms dwell), under `--scrim-hero` and `--scrim-floor`, tinted by `--art-glow`.
- It crossfades over `--dur-slow`. It loads `maxWidth=1920` (TV) or the window width. The BlurHash shows first.

### 7.3 Hero (`Hero`)

- Home's first viewport. It shows the first Continue Watching item, or else Next Up, or else the newest item.
- Contents: the Logo or title, one facts line (`S2 · E4 · 38 min left`, or `2023 · 2 h 3 min · 4K · Dolby Vision`), at most two lines of overview, and the `ActionBar` (compact: Resume or Play, plus "More info").
- With no candidate (empty library), no hero is shown and the first row moves up.
- The title the hero shows is not repeated as the first card of the row below it; the row starts with the next item (UX audit D2 B; P13-32).
- On compact windows the hero's text sits below the art.

### 7.4 Media row (`MediaRow`)

- Title (`--type-heading`, sentence case). Below it, a horizontal list of `MediaCard`s. A "Latest in {library}" row ends with a "See all" tile (not a card: bordered, no art, the size of the row's cards) that opens the library sorted "Newest added first". It is the last item of the row, reached with Right past the last card or End; its accessible name is "See all in {library}". Continue watching and Next up have none. There is no title-line link, so Up and Down between rows stay unchanged.
- Desktop pointer: a previous or next arrow button appears on the row's edge on hover, and pages one viewport.
- Keyboard: Left and Right move within the row (roving tabindex, as today). Up and Down move to the nearest card in the adjacent row by horizontal centre (spatial). The focused card scrolls so it keeps `--gutter` from the edge.
- States: skeleton (cards of the right variant), error (`InlineError` in place of cards), and hidden when empty (as today).

### 7.5 Media card (`MediaCard`)

| Variant | Frame | Under the art | Primary action (Enter or click) |
|---|---|---|---|
| `poster` | 2:3, `--poster-w` | Title (1 line), year | Open detail or series |
| `thumb` (Continue Watching, Next Up) | 16:9, `--thumb-w`, Thumb, then Backdrop, then Primary | Series or title, then "S1 · E2 · 38 min left" | **Resume or play** (one activation). The `i` key, Menu on TV, or right-click opens details (decision 1). On TV, holding OK also opens details, so a remote with no Menu key can reach them (UX audit D15 B; P13-34) |
| `episode` | 16:9 inside `EpisodeRow` | n/a | Play the episode |
| `library` | 16:9, library image | Library name | Open the library |

- Marks (top right, 24 px disc on `--scrim`): a check for played, a count for unplayed episodes, a heart for favourite (only in Favorites views). The progress bar sits at the bottom of the frame: a 4 px track `rgb(255 255 255 / .22)` with an `--art-accent` fill (the card's own tint, otherwise the default).
- Focus: the frame lifts by `--lift` with `--shadow-lift`, plus a 3 px `--focus` ring at a 3 px offset with a 1 px `rgb(0 0 0 / .6)` outer line so the ring reads on bright posters. The title goes from `--text-2` to `--text-1`. Hover gets the same treatment at half strength (no scale).
- Missing image: `--surface-2` with the title in `--type-label`, centred. Never a broken image.
- Accessibility: one link or button per card. The accessible name joins the title, subtitle, and progress ("Harbor Lights, S1 E2 The Keeper's Log, 38 minutes left"). Decorative text is `aria-hidden` (as today).

### 7.6 Episode row (`EpisodeRow`)

- Grid columns are `var(--thumb-w)` and `minmax(0, 1fr)`. The thumb has progress and a played check. Text: "2 · The Keeper's Log" (`--type-label`), the runtime or "22 min left" (`--type-meta`), and a two-line overview (`--type-body`, `--text-2`).
- The row is one link that plays: click or Enter anywhere on the art, title, or overview. Its accessible name is the card rule's ("The Keeper's Log, Episode 2, 23 minutes left"); the runtime and overview are its description. A trailing "Details" icon link and the `i` key open the episode detail. On compact windows the text stacks under the art.
- On TV, the season's episodes become a horizontal row of `thumb` cards (art, "2 · Title", time left) with one overview paragraph under the row that follows focus. The cards carry no Details link; Menu or `i` opens details.

### 7.7 Detail header (`DetailHeader`)

- A full-bleed `AmbientBackdrop` at full strength. Over it, in the left five columns: the Logo or title (`h1`), a facts line (genres join it; the rating joins it when the server has one, from P15-03), `MediaBadges`, the `ActionBar`, and a three-line overview with a "More" disclosure.
- `PersonRow` cards show the name and the role, with initials in place of a picture (Q8 A). From P15-03 they show the person's image, with initials as the fallback. They are not interactive.
- Variants:
  - **movie**
  - **series**: facts are the year range, the season count, and genres (no rating). The primary action is "Resume S1 · E2" or "Play S1 · E3". Season tabs and the episode list sit below.
  - **episode**: the series name is a link above the title. Facts read "S1 · E2 · 45 min". The episode still replaces the backdrop when the episode has no backdrop. A "More from Season 1" episode strip sits below and opens positioned at the current episode.
- Compact windows stack poster (or still), then title, then actions, then overview.

### 7.8 Action bar (`ActionBar`)

- Order: **Primary** (`Resume 41:00` with a small progress ring, or `Play`), then the version `Picker` pill (only with two or more versions), then `Start over` (secondary, only when resuming), then icon toggles `Watched` and `Favorite` (each `aria-pressed`, label visible on desktop, tooltip plus accessible name on TV). Last comes `More` (from P15-02; Q7 A left it out of P13-09): a `Menu` (§7.10) holding File and streams, Go to series (on episodes), and Mark season watched. The version picker is not in it (Q6 A).
- The primary button gets initial focus when the screen opens (TV and keyboard). On desktop, focus goes to the `h1` first for screen readers (as today), and one Tab reaches Play.
- When the player cannot start (`usePlayerStatus` unavailable), the primary button stays enabled. An `InlineNotice` under the bar explains, and "Check again" sits beside it (as today, restyled).

### 7.9 Media badges and file details (`MediaBadges`, `FileAndStreams`)

- Badges are text-only tags on `--surface-2` at `--radius-xs` in `--type-meta`: `4K`, `Dolby Vision`, `HDR10`, `TrueHD 7.1`, `Atmos` (only when the stream title says so), and `PGS · ASS` when there are image or styled subtitles. At most five. No logos of third-party brands.
- `FileAndStreams` is a section at the bottom of Detail: the chosen version's `MediaInfo` definition list in two columns, values in Mono. The version picker lives in the action bar (Q6 A).

### 7.10 Pickers (`Picker`, used for Version, Audio, and Subtitles)

- A trigger button shows the current value ("4K HDR ▾", "English · TrueHD 7.1 ▾"). It opens an anchored menu on desktop or a right-side sheet on TV and in the player. The TV sheet is `--player-sheet-w` wide inside the safe inset and uses the same listbox, keys, and focus return.
- The list is a `role="listbox"` (or `radiogroup`) of rows with a check on the selected row and a two-line label (name, then codec, channels, and default or external flags).
- Arrow keys move, Enter selects and closes, Escape or Back closes without change. Never a native `<select>` (it opens an OS popup the TV shell cannot style or focus).
- **`Menu`** (P13-26) is the same trigger and anchored list for actions instead of a value: the trigger is the Picker's pill (label and chevron) or a round icon button (§7.19) for the nav's account control, and on TV the list is the same right-side sheet. Rows are `role="menu"` rows with no check; a row that marks the current choice among actions, such as the active account (§7.21), is a `menuitemradio` with a check. Arrows move, Home and End jump, typing jumps by label, Enter activates and closes, and Escape or Back closes and returns focus to the trigger. It serves the `More` menu (§7.8) and the account menu (§7.21).

### 7.11 Segmented tabs (`SegmentedTabs`)

- Used for seasons. `role="tablist"`. The selected tab is `--text-1` with a 2 px `--art-accent` bar under it. The others are `--text-2`. Left and Right move and select (automatic activation, since season lists are cheap). Specials go last. The tab bar scrolls sideways when the tabs overflow, with room inside the scroll box for the focus ring.

### 7.12 Toolbar (`BrowseToolbar`)

- The page title is the library (or collection) name, an `h1` in `--type-title` that takes focus when the page opens. Under it, the toolbar sticks under the nav and follows it up when the nav hides.
- Sort is one `Picker` (pill) with each field and direction spelled out: Name A to Z (default), Name Z to A, Newest added first, Oldest added first, Newest release first, Oldest release first, Highest rated first, Lowest rated first. The trigger reads "Sort Name A to Z".
- Filter chips (Unwatched, Favorites, In progress) are `aria-pressed` toggle chips with a check icon when on. The item count sits on the right ("248 items"); it is plain text from the first page's total, not a live region. On compact windows Sort and the count share the first line and the chips wrap below.
- The toolbar is one Tab stop (`role="toolbar"`); Left and Right move between controls, Down moves into the grid.
- Paging: the next page loads when the end of the grid is within one viewport. A "Load more" button stays under the grid as the keyboard and screen-reader fallback; Down from the last row reaches it, and when a load finishes while it has focus, focus moves to the first new card. "{n} more items loaded" is announced. Sort and filters are not remembered between visits.
- States: first-page skeleton (12 poster placeholders), empty library, filtered empty (below), first-page error, later-page error ("Couldn't load more items." with Retry, cards stay and automatic paging stops until Retry succeeds), and library not available.

### 7.13 Search (`SearchField`, `SearchSuggestion`)

- A large field (`--type-title` text, 64 px tall, search icon, clear button). It takes focus when the page opens (the §9 rule to focus the `h1` does not apply on Search). The label sits above the field (§7.19 `TextField`). The suggestions list sits under it with a 40 px poster, title, and a meta line, "{year} · {type}" with the types "Movie", "Show", and "Episode". An episode shows "{series} · S1 · E2 · Episode" instead of the year, and its 16:9 still takes the same 40 px column.
- Choosing a suggestion opens the item or series directly. Results appear on Enter (Q13 A), not while typing.
- Escape closes the list; with the list closed it clears the text, and the clear button does the same without changing the route.
- Down from the field moves into the first result row only when no suggestion list is available (`hints.length === 0`). With hints loaded but the list closed by Escape or blur, Down reopens the list instead. Up from the first row returns to the field.
- Results are grouped rows (Movies, Shows, Episodes) using the same `MediaRow` and `MediaCard` variants. Episode results open the episode's detail (Q9 A). "Load more" sits at the end of the results (Q14 A) and moves focus to the first new card.

### 7.14 Player chrome

Pure video by default. The chrome is three zones, shown together and hidden together:

1. **Top bar** (`PlayerTopBar`, over `--scrim-player-top`): Back (icon button), then the title block. Episodes show the series name (`--type-meta`, `--text-2`) above the episode title ("S1 · E2 The Keeper's Log", `--type-heading`). On the right, a `ConversionChip` only when the play method is not direct play: the PRODUCT.md sentence ("Converting on server: the file is over your streaming limit") in `--notice` with an icon. It hides with the chrome; the OSD line at the start of the session, the `PlayerLoading` text, and the Info sheet carry the invariant while it is hidden. It opens the Info sheet with focus on Play original. Nothing is shown for direct play (PRODUCT.md: "no indicator beyond the player information panel"). The **Play original** action that P10-05 added as a floating button moves into the Info sheet's Playback section. The chip also offers it when the user's own streaming limit is the only reason.
2. **Scrubber** (`Scrubber`, full width inside the gutter): a 4 px track that grows to 8 px when hovered or focused. Elapsed time sits left and remaining time right ("−1:21:40"), in `--type-mono`. "Ends at 22:41" appears beside the remaining time when there is room. Chapters are 2 px gaps cut into the track, not ticks above it. The buffered range is a lighter `--track-buffered` bar under the fill, from the start to the engine's buffered position, drawn only ahead of the playhead. The fill is `--art-accent`. The thumb is a 16 px `--text-1` disc that appears on hover or focus.
   - `ScrubPreview`: a frame sized to the trickplay tile (320×180 desktop, 384×216 TV) at `--radius-art`, with time and chapter name inside its lower edge on `--veil`, clamped within the gutter. Keyboard focus on the scrubber shows the preview at the playhead, and Left and Right step 10 s with the preview following. Holding Left or Right seeks in growing steps with the preview following and commits on release; a single press stays 10 s both ways (UX audit D5 B; P15-16, after the dogfood week). On TV the hold pauses and scrubs a pending position instead (below).
3. **Control row** (`TransportControls`). Desktop: Play or Pause (56 px light disc, the only light-filled control), back 10, forward 10, then Volume (icon plus slider revealed on hover or focus), then a spacer. Right side: "Chapters" (list icon, only when the item has chapters), "Audio & Subtitles" (speech icon), Info (`i` icon), Fullscreen. TV: transport is centred (back 10, Play or Pause, forward 10) and Chapters (when present), Audio & Subtitles, and Info sit right. There is no volume control and no Fullscreen: the TV owns both. Everything sits inside the safe inset, and the Play disc is `--player-play-disc` (84 px). **Seeking with a remote** (UX audit D16 B; P13-34): a press of Left or Right moves 10 s; holding for half a second scrubs in growing steps (10 s per 200 ms tick, then 20, 60, and 120 s as the key stays down, never more than a fiftieth of the duration) with the preview following and the picture held by pausing; OK commits the new position and Back returns to where playback was. Up or Down shows the controls without pausing.

Panels:

- **`TrackPanel`**: a right side sheet (`--surface-1`, 420 px, or 33% on TV) with Audio and Subtitles lists (see `Picker`). Video keeps playing. It stays open after a choice and closes on Escape, Close, or `a`; focus returns to the trigger.
- **`InfoSheet`** (restyles the existing P3-18 `PlayerInfoPanel` and keeps its redaction tests): a right side sheet with sections Playback (method, reason, "Original file" in `--ok` once the plan says direct play, Play original), Decoder, and Renderer. Video (Codec, Resolution, Range) and Audio (Codec, Channels, Output) come between Playback and Decoder: Range reads "HDR (PQ)", "HDR (HLG)", or "Dolby Vision, profile 8" (the track's signalling), Output reads "PCM, 7.1" or "Passthrough (E-AC-3)", and a fact the engine did not report reads "Unknown". The body is a focus stop that scrolls with the arrow keys. Values are Mono. It never shows URLs, IDs, or tokens (existing redaction rules).
- **`ChapterList`**: a right sheet (the same `PlayerSheet` as the other panels) with one row per chapter: its name, its start time, and, when the version has trickplay, the picture at the chapter start (`--chapter-thumb-w` wide; 192 px in the TV form). Without trickplay the rows are text only. The chapter playing now is marked and holds focus on open. Enter or Space seeks to a chapter and closes the sheet, and focus returns to the Chapters button. Escape closes the sheet and returns focus to the button too, without leaving the player.

OSD (`Osd`): a transient pill at top centre, under the top bar's position, visible for 1.2 s, for actions taken by key, whether or not the chrome is visible: "Subtitles: English (SDH)", "Volume 65%", "Muted", "+10 s", "Start", "End", "30%". It also shows the conversion line for five seconds when a converted session starts. Today `c`, `m`, and the arrow keys give no visible feedback. `role="status"`, and reduced motion makes it appear without a fade.

Status (`PlayerStatus`): loading, buffering, and seeking show a centred 64 px disc on `--veil` with a ring and one line of text ("Opening the original file…", "Buffering…"). It is visible regardless of chrome. "Buffering…" appears only after a wait of 500 ms, so a short stall after a seek shows nothing (UX audit D6 B; P13-33). Before the first frame, `PlayerLoading` shows the item's backdrop at 40% with the title and the status, plus Back. Controls are not drawn until there is a snapshot.

Idle: the chrome hides 3 s after the last input while playing. It never hides while paused, while a panel or menu is open, while a chrome control has focus, or while a skip or Up Next prompt has focus. The cursor keeps its own 3 s timer (as today): it hides when it stops moving unless it rests on a visible control, whether or not the chrome is pinned. The desktop player is the one screen where the arrow keys seek and change volume and Tab reaches the controls (Q17 A).

**TV form** (Q17 A, with the answer to the open question on idle). An arrow wakes the chrome with focus on the scrubber and does not seek. Left and Right then seek 10 s on the scrubber; Up and Down move between the top bar (Back, then the conversion chip), the scrubber, and the control row, and then to a visible Up Next card. Each zone remembers its last control. A sheet keeps its own arrows. While playing, the chrome hides 3 s after the last key even with a control focused, and focus moves to the player, so the next arrow wakes it. OK with no Skip or Up Next wakes the chrome with focus on Play or Pause. Paused, an open sheet, or a focused prompt still keep the chrome up. This is a TV exception to the focus rule above.

### 7.15 Skip and Up Next

- **`SkipButton`**: a pill (`--text-1` at 92% fill, `--on-light` text, skip icon) at the bottom right, above the scrubber's position. It sits higher when the chrome is visible. It appears with a fade when an Intro or Outro segment is active and stays until the segment ends. Desktop: never takes focus (as today), and the `s` key activates it. The Outro's Skip credits is not offered when a next episode exists; Up Next takes its place (Q19 A). TV: while the chrome is hidden, OK activates the visible Skip, else Play now on a visible Up Next card; arrows wake the chrome (decision 4, P13-18).
- **`UpNextCard`**: bottom right, 400 px (TV 560), `--surface-1` at 96% with `--shadow-sheet` and `--radius-sheet`. It shows the next episode's 16:9 still (with series poster fallback), "Up next · S1 · E2", the title, then **Play now** (primary, with the countdown drawn as a fill sweeping the button over the remaining seconds) and **Hide** (quiet; dismisses the card for this session and cancels autoplay while playback continues; at the end of the file the player opens the series page). Text is announced once on appear ("Up next: The Keeper's Log, playing in 10 seconds") and again at 5 s, not every second. `n` activates Play now. With reduced motion, Play now has no fill and the card shows "Playing in N seconds".

### 7.16 Notices, dialogs, toasts

- **`Dialog`**: a centred `--surface-1` panel (max 560 px, `--radius-sheet`, `--shadow-sheet`) over a `rgb(0 0 0 / .6)` veil. Icon, title (`--type-title` at 1.5rem, at most two lines), body, and actions at the bottom right (primary last). It traps focus and restores it on close. The safe action gets initial focus for risky confirms (the unencrypted connection).
- **`Notice`** (full-screen state: refusal, player cannot start, not found): the item's backdrop at 30% under scrims. Left-aligned at five columns: the item title (`--type-meta`), the notice title (`--type-title`), the explanation (`--type-body-lg`), "What you can do" as a separate paragraph led by a bold phrase, then actions. Refusal follows P10-11 copy.
- **`Toast`**: bottom left, `--surface-1`, icon plus one sentence plus an optional action, 5 s (errors stay until dismissed). It is used for "Couldn't update watched state", "Marked as watched", "Signed out", and settings changes whose effect is invisible. A `ToastProvider` at the app root shows them (P13-20). No toast is shown in the player; the `Osd` speaks there. `role="status"` (`alert` for errors).
- **`InlineError`**: an icon, one sentence ("Couldn't load Latest in Movies."), and a secondary Retry. It replaces the content it failed to load.

### 7.17 Empty, loading, skeleton

- **`EmptyState`**: a centred column, 48 px line icon in `--text-3`, a title (`--type-heading`), one sentence, and at most one action. Copy for each case is in §10.
- **`Skeleton`**: `--surface-2` blocks shaped exactly like the content they stand in for, including row titles. A shimmer sweep of `--surface-3` at 1.6 s is turned off under reduced motion. Skeletons show only after 150 ms, so fast loads don't flash.

### 7.18 Settings (`SettingsPage`, `SettingsSection`, `SettingsRow`)

A Settings screen exists since P10-05 (`#/next/settings`, `src/features/settings/settings-view.tsx`). P13-17 rebuilt it as the shell below and ships Playback (the streaming limits, with Audio passthrough as an unavailable row), Subtitles, Account, and About & diagnostics. Each later row arrives with the task that builds its behaviour: the preferences store (P3-22), auto-play (P3-23), skip (P3-24), accounts (P13-21), subtitle styling (P5-05), and audio passthrough (P5-03). Settings are one set per computer, not per account.

- Layout: a vertical `role="tablist"` of sections on the left (`--settings-nav-w`) and the selected section's panel on the right (`--settings-panel-max`). Up and Down select a section (Home and End jump), Right enters the rows, and Left returns to the section list. Escape does nothing here. Under 720 px a list of sections drills in: Enter opens one and focuses its heading, and Escape or "Back to settings" returns with focus on that section. The route stays `#/next/settings`; the section is screen state.
- Sections:
  - **Playback**: streaming limit, local and remote (same values and storage as P10-05), each a `Picker` of "No limit" and presets (Q21 A; no custom value). A changed limit confirms with a toast, because the change is otherwise invisible. Play next episode automatically (on by default) and its countdown (5, 10, or 15 s; default 10) arrive with P3-23. Intros and Credits, each with three choices: "Show a Skip button" (default), "Skip automatically", or "Do nothing", arrive with P3-24. Audio passthrough shows as unavailable until P5-03.
  - **Subtitles**: one sentence saying that languages follow the Jellyfin account (Q23 A; no link, no server read, nothing focusable). Styling comes in M2 (P5-05).
  - **Account** (P13-17): server name, address (Mono), and user. Stay signed in shows as unavailable until P3-02, P13-21, and P13-27 (per-account stay-signed-in in Settings > Accounts). Sign out is a `danger` button that signs out at once and ends on the sign-in screen with a "Signed out" toast; there is no confirm. From P13-21 the section becomes **Accounts**: every saved account as "name · server" with its stay-signed-in state, Sign out, and Remove, then "Add account". There is no launch setting: two or more signed-in accounts always show "Who's watching?" (§7.21). There is no "Change server" in Settings; adding an account never signs anyone out.
  - **About & diagnostics**: version, player and libmpv version, renderer, Jellyfin server version, and "Copy diagnostics" (redacted). The copy is seven lines: the app version, OS, player and libmpv version, renderer, decode mode, Jellyfin server version, and host class, and nothing else (Q24 B). It goes to the clipboard with a "Diagnostics copied" toast. If the clipboard refuses, an alert says so and the same text shows in a focused, selected block to copy by hand.
- Rows for features that are not built yet show disabled with "Not available yet." (Q23 A): no control and nothing focusable. The state is in words and `aria-disabled`, never colour alone.
- `SettingsRow` is a `--settings-row-h` row with a label and description on the left and a control on the right (switch, value plus chevron opening a `Picker`, or button; the switch arrives with P3-23). The whole row is the hit target and the row takes a `--surface-2` fill while its control has keyboard focus. Up and Down move between the rows' controls; Enter or Space opens a `Picker`. Changes save immediately and confirm with a toast where the effect is invisible.

### 7.19 Buttons and fields

| Variant | Look | Use |
|---|---|---|
| `primary` | `--text-1` fill, `--on-light` text, 48 px (TV 72), `--radius-control` | One per screen |
| `secondary` | `rgb(242 239 233 / .12)` fill, `--text-1` text | Start over, Retry next to a primary |
| `quiet` | Transparent, `--text-2` text that becomes `--text-1` on hover or focus | Hide, Change server |
| `icon` | 44 px (TV 64) circle, `rgb(242 239 233 / .10)` fill | Watched, Favorite, player controls |
| `danger` | `secondary` with `--danger` text | Sign out, destructive confirms |

- All buttons have a `--dur-quick` hover fill change, `--dur-instant` press (scale .98, none with reduced motion), and the shared focus ring.
- `TextField`: a 52 px `--surface-2` field with a `--line-strong` border and `--radius-control`, label above in `--type-label` and `--text-2` (never tiny tracked capitals), helper and error text below, with the error linked via `aria-describedby`.

### 7.20 Sign-in

Three steps in one centred `--surface-1` card (`--sign-in-w`, `--radius-sheet`). Each step has one `h1` in `--type-title` that asks one question, and no eyebrow.

1. **Where is your Jellyfin server?** From P3-19, "Your servers" lists remembered servers first, as the same large rows; choosing one skips the address. On desktop the search runs once when the screen opens, and "On this network" lists the servers found above the address field as large rows: name, address in `--type-mono`, "Advertised by {ip}", and the conflict warning in `--danger`. The list is one Tab stop with Up and Down between rows; "Search again" is a quiet button. Below it, a "Server URL" `TextField` and a primary "Connect". Browser mode has no list. TV form: with discovery, the server step opens on the first found server (else "Search again"), and "Enter address" (secondary) reveals the Server URL field. Without discovery, the field shows. Back on steps 2 and 3 is "Change server". Fields take input from `input` events and carry `enterKeyHint`, so the shell's on-screen keyboard can type and submit; Enter in Username moves to Password.
2. **Approve this code in Jellyfin.** A chip under the heading shows the server origin in Mono. The code is the hero in `--type-code`, grouped ("482 913"). No primary button: "Use password" is secondary and "Change server" is quiet. The heading takes focus on arrival.
3. **Who is signing in?** The same origin chip, "Username" and "Password" fields, "Change server" (quiet) and "Sign in" (primary). A "Show password" control sits beside the password field, labelled in words and `aria-pressed`; the password is masked again when the step is left (UX audit D9 B; P15-17).

The unencrypted-connection warning is a `Dialog` with `role="alertdialog"` over step 1. Cancel is primary, last, and focused; Escape cancels; the veil does nothing.

### 7.21 Accounts (`AccountMenu`, `AccountPicker`) (P13-21)

Fluster remembers any number of accounts. An account is one user on one server. One account is active at a time, and each server's libraries stay separate.

- **Account menu.** The nav's account control opens a `Menu` (§7.10): every saved account as "name · server" with a check on the active one, then "Add account" and "Manage accounts" (Settings › Accounts). Choosing an account switches to it and lands on Home in one activation.
- **Launch.** With one signed-in account, Fluster opens it. With two or more signed-in accounts, it shows the `AccountPicker` first ("Who's watching?"), on desktop and on TV. Signed-out tiles do not count.
- **`AccountPicker`.** "Who's watching?" as the `h1`, then a grid of account tiles: the user's initial, the name, and the server name in `--type-meta`. A signed-out account is marked "Signed out" in words and says that it needs the password; choosing it opens sign-in for that user and server, by password or Quick Connect (P13-27). The last tile is "Add account". On TV the account control opens this screen instead of a menu.
- **Three actions, three labels.** *Switch* keeps the sign-in. *Sign out* revokes it on the server, keeps the tile, and shows the "Signed out" toast. *Remove* also forgets the account, after a `Dialog` with the safe action focused.
- **Privacy (owner, 2026-11-12).** "Stay signed in" is the privacy control. An account with it off is signed out whenever Fluster closes, shows as "Signed out", and does not count towards showing the picker, so nobody else at this computer can open it. Sign-in and Settings › Accounts say so in words, and Settings › Accounts can change it for a saved account (P13-27). A PIN per account comes with the TV shell's account picker, not before.
- A plain-HTTP account says "unencrypted" on its tile, and resuming it takes one press that names the user and the server (P3-01).
- Empty Home offers "Add account" beside "Open settings".

## 8. Tokens (`src/styles/tokens.css`)

```css
/* Fluster design tokens (DESIGN.md §8). Imported by src/styles.css from P13-02. */
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
  --line-strong: rgb(242 239 233 / 0.37);
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
  --track-buffered: rgb(255 255 255 / 0.40);
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
  --type-code: 700 clamp(2.5rem, 1.5rem + 2.6vw, 4.5rem) / 1.02 var(--font-mono);
  --tracking-hero: -0.02em;
  --measure: 62ch;

  /* Space */
  --space-1: 4px; --space-2: 8px; --space-3: 12px; --space-4: 16px; --space-5: 24px;
  --space-6: 32px; --space-7: 48px; --space-8: 64px; --space-9: 96px;
  --gutter: clamp(24px, 4vw, 72px);
  --safe-x: var(--gutter);
  --safe-y: 0px;

  /* Sizes */
  --sign-in-w: min(560px, 100%);
  --poster-w: 112px;
  --thumb-w: 240px;
  --nav-h: 64px;
  --nav-fade-w: var(--space-7);
  --hero-h: min(78vh, 56.25vw);
  --hero-logo-max-w: min(480px, 32vw);
  --hero-logo-max-h: 160px;
  --detail-header-h: min(82vh, 60vw);
  --skeleton-title-w: min(360px, 100%); --skeleton-line-w: min(240px, 100%); --skeleton-action-w: 160px;
  --control-h: 48px;
  --icon-button: 44px;
  --hit-min: 44px;
  --search-field-h: 64px;
  --suggestion-art-w: 40px;
  --settings-row-h: 4rem; --settings-nav-w: 16rem; --settings-panel-max: 46rem; /* rem, so the TV scale applies */
  --player-sheet-w: 420px; --player-play-disc: 56px; --player-status-disc: 64px;
  --up-next-w: 400px; /* TV 560px */
  --player-prompt-inset: var(--space-8); /* Skip and Up Next, chrome hidden */
  --player-prompt-inset-chrome: calc(var(--space-5) * 2 + var(--hit-min) * 2 + var(--space-3) * 2); /* chrome visible: clears the footer */
  --scrub-track-h: 4px; --scrub-track-h-active: 8px; --scrub-thumb: 16px; --scrub-gap: 2px;
  --scrub-preview-w: 320px; --volume-slider-w: 110px;
  --scrim-player-top-h: 160px; --scrim-player-bottom-h: 240px;

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
  --surface-0-glass: color-mix(in srgb, var(--surface-0) 92%, transparent);
  --scrim-nav: linear-gradient(180deg, rgb(11 12 14 / 0.85) 0%, rgb(11 12 14 / 0.85) 50%, rgb(11 12 14 / 0) 100%);
  --blur-nav: 16px;
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
  --ui-scale: 1.5; /* root font-size: calc(16px * var(--ui-scale)), set in base.css */
  --safe-x: 96px;
  --safe-y: 54px;
  --gutter: var(--safe-x);
  --poster-w: 248px;
  --thumb-w: 416px;
  --nav-h: 96px;
  --control-h: 72px;
  --icon-button: 64px;
  --hit-min: 64px;
  --search-field-h: 96px;
  --suggestion-art-w: 60px;
  --player-sheet-w: 33vw;
  --up-next-w: 560px;
  --scrub-preview-w: 384px;
  --type-body: 400 1.1667rem / 1.5 var(--font-ui);
  --type-body-lg: 400 1.3125rem / 1.55 var(--font-ui);
  --type-label: 600 1rem / 1.3 var(--font-ui);
  --type-meta: 500 1rem / 1.35 var(--font-ui);
  --type-mono: 500 1rem / 1.3 var(--font-mono);
  --player-play-disc: 84px;
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
- Opening a screen focuses its primary action (TV) or its `h1` (desktop, for screen readers), with the primary action as the next Tab. Returning with Back restores the previously focused card or episode row; when it is gone, focus lands on the card now at the same place in the same row, and when the row is gone too, on the screen's opening focus. A fresh visit never restores.
- Focus is never obscured: rows scroll the focused card to at least `--gutter` from any edge, and the sticky nav never covers it (WCAG 2.4.11).

**Hover and focus.** Hover previews (half-strength lift, row arrows, scrubber thickening) but never moves focus. Every hover-revealed control is also reachable and visible on focus.

**Back.** Back or Escape closes the topmost layer: menu, then sheet, then dialog, then fullscreen, then player, then screen (browser history). In the TV form Backspace does the same outside text fields; on desktop Backspace does nothing outside text fields, and Escape and the Back button remain (owner, 2026-11-13; P13-34). Up from the first row reaches the nav and Down returns, on every form. Back (Escape, or Backspace in the TV form) on a non-root screen goes back (browser history, else Home); on a root tab it does nothing on desktop and focuses the tab row on TV, and Back on Home from the tab row leaves the app by the platform's rule (D14 B).

**Back restores the place** (UX audit D1 B; P13-31). Back returns to the screen as it was left: the same scroll position, sort, filters, loaded pages, and focused card, with no skeleton. A screen's data is kept while its account is the active one and dropped when the account changes, signs out, or the app closes. Nothing is written to disk. A library's sort and filters live in the route.

**Keyboard map**

| Where | Key | Action | Today |
|---|---|---|---|
| Anywhere | Arrows, Enter, Escape | Move, activate, back | Exists (partly) |
| Anywhere | `/` | Focus search; opens Search from other signed-in screens. Not in the player or sign-in. | P13-12 |
| Anywhere outside fields (TV form) | Backspace | Back; does nothing on desktop (owner, 2026-11-13) | Exists (P13-18); TV only from P13-34 |
| Settings | Up / Down, Right, Left, Escape | Up and Down move in the section list or between rows; Right enters the rows from the list; Left returns to the list; Escape returns to the list on compact windows only | P13-17 |
| Card, hero primary, TV episode card | `i` or Menu | Open details (when Enter resumes or plays) | Exists (P13-18 adds the hero and TV episode cards) |
| Player | Space or `k` | Play or pause | Exists |
| Player | Left / Right or `j` / `l` | Seek ∓10 s | Exists |
| Player | Up / Down | Volume ±5 | Exists |
| Player | `m` / `f` / `c` | Mute / fullscreen / cycle subtitles | Exists, gains OSD feedback |
| Player | `i` | Info sheet | Exists, restyled |
| Player | `a` | Audio & Subtitles panel | P13-13 |
| Player | `s` | Activate the visible Skip | Exists (P13-14) |
| Player | `n` | Play now on the Up Next card | Exists (P13-14) |
| Player (TV form) | Enter (OK) | Skip, else Play now, while the chrome is hidden | P13-14 |
| Player | Home / End, 0–9 | Start / end, jump to 0–90% | P13-13 |
| Player (TV form) | Arrows | Wake the chrome on the scrubber; Up and Down move between zones; Left and Right seek on the scrubber | P13-18 |
| Player | Hold Left / Right | Seek in growing steps with the preview; commits on release (D5 B) | P15-16 |
| Player | Previous and next chapter (keys set in P15-16's spec) | Jump by chapter; the OSD names it (D5 B) | P15-16 |
| Player (TV form) | Hold Left / Right, then OK or Back | Scrub with the preview; OK commits, Back returns to where playback was (D16 B) | Exists (P13-34) |
| Player (TV form) | Up / Down | Show the controls without pausing (D16 B) | Exists (P13-34) |
| Card (TV form) | Hold OK | Open details where Enter plays (D15 B) | Exists (P13-34) |
| Anywhere outside fields | `?` | A sheet of the keys for this screen (D12 B) | P15-17 |

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
| Library, empty | Nothing in this library yet | Add media in Jellyfin, then come back. | n/a |
| Library, filtered empty | Nothing matches these filters | n/a | Clear filters |
| Library, not available | This library isn't available | It may have been removed, or this account can't see it. | Go home |
| Libraries, error | n/a | Couldn't load your libraries. | Retry |
| Library, later page error | n/a | Couldn't load more items. | Retry |
| Row error | n/a | Couldn't load {row}. | Retry |
| Search, error | n/a | Couldn't load search results. | Retry |
| Search, more results error | n/a | Couldn't load more results. | Retry |
| Sign-in, 401 | n/a | That username and password didn't work. | n/a |
| Sign-in, unreachable | n/a | Couldn't reach {address}. Check the address and that the server is running. | n/a |
| Sign-in, refused plain HTTP | n/a | This address uses plain HTTP on the internet, so Fluster will not connect. Use HTTPS, or HTTP only for this device or a private home-network address such as 192.168.x.x, a name.local name, or a name.home.arpa name. | n/a |
| Sign-in, anything else | n/a | Something went wrong. Try again. | n/a |
| Series, no episodes | n/a | This series has no episodes yet. | n/a |
| Next episode error | n/a | Couldn't load your next episode. | Retry |
| Detail, watched or favorite toast | n/a | Marked as watched. / Marked as unwatched. / Added to favorites. / Removed from favorites. | n/a |
| Detail, watched or favorite failed | n/a | Couldn't update watched state. Try again. / Couldn't update favorite. Try again. | n/a |
| Settings, limit changed | n/a | {Local network or Remote} limit set to {n} Mbps. / {Local network or Remote} limit removed. | n/a |
| Settings, Subtitles | n/a | Subtitle languages follow your Jellyfin account; change them in Jellyfin. | n/a |
| Settings, unavailable row | n/a | Not available yet. | n/a |
| Settings, signed out | n/a | Signed out | n/a |
| Settings, copy diagnostics | n/a | Diagnostics copied | Copy |
| Settings, copy failed | n/a | Couldn't copy. Select the text below and copy it. | n/a |
| Item gone | This item is no longer on the server | It may have been removed or renamed. | Go home |
| Player loading | n/a | Opening the original file… | Back |
| Player loading, converting | n/a | Converting on server: {reason}… | Back |
| Player loading, before the server answers | n/a | Loading… | Back |
| Playback error, server unreachable (no response, network error, timeout) | Playback could not start | Couldn't reach {server}. Check that the server is on, then try again. | Retry, Back to details |
| Playback error, server error (HTTP 5xx) | Playback could not start | {server} had a problem starting playback. Try again in a moment. | Retry, Back to details |
| Playback error, other request failure | Playback could not start | Something went wrong starting playback. Try again. | Retry, Back to details |
| Progress report failed | n/a | Couldn't save your progress to {server}. Playback continues. | n/a |

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

| Today | New in P13 |
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
| STEP kickers, giant sign-in headings, and raw sign-in errors | One question per step in `--type-title`, copy table, `Dialog` for the unencrypted warning |
| Raw errors; giant refusal headline | Copy table; `Notice` over the dimmed backdrop |
| Settings with two native selects and developer links (P10-05) | Settings with Playback, Subtitles, Account, About & diagnostics, built from `SettingsRow` and `Picker` (done in P13-17) |

## 13. Decisions (accepted 2026-11-08)

1. **One-press resume.** Continue Watching and Next Up cards play on Enter, and details open on `i` or Menu. The e2e journeys that click a card and then Play change in P13-08.
2. **Typeface.** Atkinson Hyperlegible Next and Mono, self-hosted. Licence and tabular figures are verified in §4. If either check had failed, the system UI stack would have stood.
3. **Logo and Thumb images.** The gateway requests Jellyfin `Logo` and `Thumb` images (P13-05). The Logo becomes the title in heroes and detail headers.
4. **TV Skip on OK.** While the chrome is hidden, OK activates a visible Skip. On desktop, Skip still never takes focus.
5. **Ambient Home backdrop.** It follows the focused card after a 300 ms dwell (§7.2). Reduced motion swaps it without a crossfade.

### Added 2026-11-12 (UX audit)

The owner answered the twenty decisions in [`docs/plans/proposals/ux-audit.md`](docs/plans/proposals/ux-audit.md) on 2026-11-12, relayed by the coordinating agent. The ones that change this document, and where:

| Decision | Answer | Section | Task |
|---|---|---|---|
| D1 B | Back restores the place; data is kept per active account | §9 | P13-31 |
| D2 B | A shorter hero on small windows; the hero's title is not repeated in the row | §6, §7.3 | P13-32 |
| D3 B | Season tabs and the first episode row show at 1440×900 | §6 | P13-32 |
| D5 B | A held key seeks further; chapter keys | §7.14, §9 | P15-16 |
| D6 B | "Buffering…" after 500 ms | §7.14 | P13-33 |
| D8 B | No `--text-3` over video | §3.1 | P13-33 |
| D9 B | Show password | §7.20 | P15-17 |
| D12 B | A shortcut sheet on `?` | §9 | P15-17 |
| D13 B | TV body text 28 px, nothing under 24 px | §6 | P13-34 |
| D14 B | Exit follows each platform's rule | §6 | P13-34 |
| D15 B | Holding OK opens details on TV | §7.5, §9 | P13-34 |
| D16 B | Press to step, hold to scrub, OK commits, Back cancels; Up or Down shows the controls | §7.14, §9 | P13-34 |

The token block in §8 is unchanged: it mirrors `src/styles/tokens.css`, and each task above changes both together.
