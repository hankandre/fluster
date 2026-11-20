# Octave design system

Status: **Draft for the owner's approval** (T1-08). The owner approved the earlier system on 2026-11-08 for the desktop app (kept in the tag `desktop-tauri-final`). This draft makes the 10-foot TV form the reference form, applies the owner's decisions of 2026-11-20 and the UX synthesis of the same day, and drops the desktop window. No screen task starts before the owner approves it. The owner's named calls are: the collapsed side rail's look and entries, how many posters show beside the rail, what Back does on Home, and the sign-in screen with its QR code. Every look or wording choice this draft made is listed in the clean-slate pull request.

**Awaiting a TV design pass.** The token values in §8 are carried over from the desktop system's TV form and have not been checked on a TV. T3-06 turns them into TypeScript and checks them on the 1920×1080 canvas; the owner confirms them on the Shield.

## 1. The idea

**House lights down.** Octave's screens behave like a cinema. While you choose, the lights are half up: quiet warm-black chrome, the artwork at full size, one clear action. When you press Play the lights go out and only the picture remains. Chrome comes back only when you reach for it, like an usher's torch.

The chrome itself is colourless. It is warm black with warm off-white text. **Colour comes only from the artwork**: each title tints its own screen with an accent taken from its artwork's BlurHash (§3.2).

The scene: an evening, a dimmed living room, a remote in hand, three metres from the screen. Dark is chosen for that room, not by habit.

## 2. Principles

1. **The artwork is the interface.** Backdrops, posters, stills, and logos carry identity and hierarchy. The chrome never adds a decorative colour, texture, or illustration that competes with them.
2. **One obvious next action.** Every screen has exactly one primary action, and it is what most people want: Resume, Play next episode, Play. Focus starts on it. Resume from Home takes one press.
3. **Lights follow intent.** The chrome fades as the content takes over. It never hides while it holds focus or while the video is paused.
4. **Focus is the cursor.** Every screen works with the D-pad, select, and Back alone. The focused thing is unmistakable: it lifts and gets a warm-white ring. There is no pointer.
5. **Honest, then quiet.** Say what is really happening (original file, repackaging, converting, refused, and why) in plain words at the moment it matters, then get out of the way. Technical depth lives one press away, in the info sheet.
6. **TV first; other forms derive from it.** The TV is the reference form. Phones, tablets (T15), and the desktop (T16) take its tokens and components and change scale, density, and input. A component that needs a pointer is unfinished.
7. **Calm under failure.** Loading, empty, error, and refused states are designed screens with the item's own artwork, a clear sentence, and a way forward. Nothing ever shows a raw status code or a blank page.
8. **Nothing moves under you.** Navigation entries, Home's rows, and their order never change by themselves. Burying a library behind a sub-menu, or moving it, is the most damaging navigation fault on TV (UX synthesis §2.1).

## 3. Colour

### 3.1 Chrome palette

Warm neutrals, tuned so that text never sits on pure black and never on blue-black. Contrast ratios are measured against `surface0` (`#0b0c0e`).

| Token | Value | Use | Contrast |
|---|---|---|---|
| `void` | `#060708` | Behind artwork, player letterbox | n/a |
| `surface0` | `#0b0c0e` | App background | n/a |
| `surface1` | `#131417` | Sheets, menus, dialogs, the open rail | n/a |
| `surface2` | `#1b1c20` | Control fill, inputs, skeletons | n/a |
| `surface3` | `#25262b` | Focused control fill | n/a |
| `line` | `rgb(242 239 233 / .10)` | Hairlines, dividers | n/a |
| `lineStrong` | `rgb(242 239 233 / .37)` | Input borders, secondary button border | 3.06 to 3.17:1 on surface0 to surface3 |
| `text1` | `#f2efe9` | Titles, body, primary labels | 17.0:1 |
| `text2` | `#a9a59d` | Overview, secondary labels | 8.0:1 |
| `text3` | `#8a867f` | Meta, placeholders (surface0 to surface2 only) | 5.1:1 on surface1 |
| `onLight` | `#0b0c0e` | Text on primary (light) buttons | 17.0:1 on text1 |
| `focus` | `#fff4dc` | Focus ring (only focus) | 17.9:1 |
| `danger` | `#ff8a6b` | Errors, destructive confirm | 8.5:1 |
| `notice` | `#f0b65a` | "Converting on server", warnings | 10.8:1 |
| `ok` | `#8fd1a8` | Success, "Original file" | 11.1:1 |

Rules:

- **Primary buttons are light, not coloured.** `text1` fill with `onLight` text. It reads at any distance and never clashes with the artwork.
- **`focus` is used only for focus.** Not for selection, progress, or links.
- **State colours appear only with an icon and words.** Colour is never the only signal.
- **Text over video is `text1` or `text2`, never `text3`.**

### 3.2 Artwork-derived accent

Every item screen (Detail, Series, Player loading, Up Next) and the Home hero take three colours from the item's artwork:

| Token | Derived as | Use |
|---|---|---|
| `artAccent` | The DC colour of the Backdrop BlurHash (falling back to Primary), converted to OKLCH, with lightness clamped to 0.72–0.82 and chroma capped at 0.14, hue kept | Progress fill, selected-tab bar, ambient glow tint |
| `artGlow` | `artAccent` at 22% alpha | Radial ambient light behind the hero scrim |
| `artShade` | The same hue at lightness 0.16 and chroma ≤ 0.04 | Tint of the scrim's dark end |

- The BlurHash stores the average colour in characters 2–5 (the DC term), so no image decoding is needed and the colour is ready before the image loads.
- A pure function `artTint(blurHash) → { accent, glow, shade } | undefined` computes it and is unit-tested with fixed hashes.
- Grey art (chroma below 0.02) or no hash uses the defaults: `artAccent` `#e8c48a` (warm brass, 11.8:1), `artShade` `#141210`.
- The clamp keeps `artAccent` at 3:1 or more against `surface0` and the progress track. **Never use it for text under 24 px, for focus, or as a button fill.**
- Changing items crossfades the three colours over `durSlow`. Reduced motion swaps them instantly.

## 4. Typography

**Faces** (bundled with the app, no font service, per PRODUCT.md principle 6):

- **Atkinson Hyperlegible Next**, variable 200–800, for all UI and body. Designed by the Braille Institute for legibility, with distinct `Il1` and `O0` and open apertures, which pays off at three metres.
- **Atkinson Hyperlegible Mono** for timecodes, Quick Connect codes, server addresses, and technical values only.
- **The title's own Logo image** is the display face when the server has one, with the title as its accessible label; otherwise the title is set in Atkinson Hyperlegible Next 700.
- Licence: both faces are SIL Open Font License 1.1 (verified 2026-11-08 from the `license` fields of `googlefonts/atkinson-hyperlegible-next` and `googlefonts/atkinson-hyperlegible-next-mono`). The Mono repository is archived; the font files are complete and need no maintenance, but the maintenance rule is re-checked when T3-06 bundles them.

**Scale** (px on the 1920×1080 canvas):

| Token | Size / line height | Weight | Use |
|---|---|---|---|
| `typeHero` | 72 / 1.02, tracking −0.02em | 700 | Hero and detail title without a logo |
| `typeCode` | 72 / 1.02, Mono | 700 | The Quick Connect code (tabular figures) |
| `typeTitle` | 48 / 1.15 | 650 | Page titles, dialog titles at 36 |
| `typeHeading` | 33 / 1.25 | 600 | Row and section titles, sentence case |
| `typeBodyLg` | 31.5 / 1.55 | 400 | Overview (at most 62 characters a line) |
| `typeBody` | 28 / 1.5 | 400 | Body, settings descriptions |
| `typeLabel` | 24 / 1.3 | 600 | Buttons, card titles, tabs, rail entries |
| `typeMeta` | 24 / 1.35 | 500 | Card subtitles, facts line, badges |
| `typeMono` | 24 / 1.3, Mono | 500 | Timecodes, codes, technical values |

Rules: **body text is 28 px and no text is under 24 px** (the sizes tvOS, Fire TV, and Xbox agree on; UX audit D13 B). Sentence case everywhere: no uppercase-tracked labels, no eyebrow or kicker labels. Titles truncate to one line in cards and two lines in headers, with the full title in the accessible label.

## 5. Space, shape, depth, motion

**Spacing** is on a 4 px grid: `space1` 4 · `space2` 8 · `space3` 12 · `space4` 16 · `space5` 24 · `space6` 32 · `space7` 48 · `space8` 64 · `space9` 96.

**Radii:** `radiusXs` 4 (badges, progress track) · `radiusArt` 6 (posters, thumbs, stills) · `radiusControl` 10 (buttons, inputs, menus) · `radiusSheet` 16 (dialogs, sheets, Up Next) · `radiusPill` 999 (chips, Skip, scrubber thumb).

**Elevation** is shadow plus surface, never coloured glows:

| Token | Value | Use |
|---|---|---|
| `shadowLift` | offset 0 14, blur 32, spread −10, black at .65 | Focused card |
| `shadowSheet` | offset 0 28, blur 72, spread −16, black at .75 | Sheets, dialogs, Up Next |
| `scrimHero` | horizontal gradient, `surface0` at .94 (0%), .72 (38%), 0 (72%) | Text side of backdrops |
| `scrimFloor` | vertical gradient, `surface0` (0%) to transparent (40%) | Backdrop fading into the page |
| `scrimPlayerTop` | black at .85 to 55%, then to 0; 360 px tall | Player title zone |
| `scrimPlayerBottom` | black at .85 to 55%, then to 0; 440 px tall | Player controls zone |

Player overlays use scrims and opaque surfaces, never blur.

**Motion.** One authored behaviour, light changing level. Things fade and lift. They never bounce, slide across the screen, or spin decoratively.

| Token | Value | Use |
|---|---|---|
| `durInstant` | 80 ms | Press feedback |
| `durQuick` | 160 ms | Focus lift, toggles, the rail opening |
| `durBase` | 240 ms | Chrome in and out, sheets, toasts |
| `durSlow` | 480 ms | Backdrop and art-tint crossfade |
| `easeOut` | cubic-bezier(.16, 1, .3, 1) | Entrances, focus |
| `easeInOut` | cubic-bezier(.65, 0, .35, 1) | Crossfades |
| `lift` | scale 1.08 | Focused art |

The lift's cost is measured (decision 0004: an animated lift cost frames and memory on the Shield). Whether a device gets the animated lift, a static one, or each by available memory is the owner's choice in decision 0004 (choice 2), made after the cheap box arrives (T0-06, T3-12).

Reduced motion (the system's "remove animations" setting):

- No scale, translate, or parallax. Focus still shows ring and shadow.
- Crossfades of 120 ms or less on opacity only, or instant.
- Spinners become a static ring with "Loading…" text. The Up Next countdown shows only as text.
- Chrome still auto-hides and appears without a fade.

## 6. Layout

- **Canvas.** A logical 1920×1080 canvas, scaled to the panel. All sizes in this document are px on that canvas. React Native measures in dp; on a 1080p Android TV device one dp is usually two px, so T3-06 converts every token for the device's density **[unverified per device]**.
- **Title-safe inset** is 5%: 96 px left and right, 54 px top and bottom. Nothing focusable or textual goes outside it, except artwork bleeding to the edges.
- **The rail.** Collapsed, the rail is an icon column inside the left safe inset (`railCollapsedW`, 96 px). Open, it is `railOpenW` (400 px) over the content on `surface1`. Content starts after the collapsed rail. Six posters show beside the collapsed rail at 248 px each; how many show is the owner's call.
- **Cards.** Posters are `posterW` 248 px (2:3). Thumbs are `thumbW` 416 px (16:9). Row gap is 48 px. Rows bleed to the right edge, and a partly visible card at the edge signals that more is there.
- **Hero.** Home's hero is short enough that the whole Continue watching row shows beneath it on the first screen, card titles included; the owner checks this on the Shield (T5-06).
- **No hover and no pointer.** Every function works with the D-pad, select, Back, Play/Pause, and Menu or Info where the remote has them. Text entry happens only in search and sign-in, through the system keyboard and voice; sign-in leads with found servers and Quick Connect, so typing is the fallback.
- **Back.** Back closes the topmost layer, then returns to the previous screen. On a root screen (Home, Search, a library, Settings), Back opens the rail with focus on that screen's entry. Back on Home with the rail open leaves the app without a question, as Android TV's guidelines ask. What Back does on Home is the owner's call.
- **Opening a screen focuses its primary action.** Screens without one focus their first card, field, or section.

## 7. Components

Each component lists its anatomy, states, and accessibility notes. They are built once (T3-06 and the screen tasks), use tokens only, and have a component test and a captured image (T3-07).

### 7.1 App shell and the side rail (`AppShell`, `SideRail`)

- **Collapsed** (the default): a column of icons inside the left safe inset, with the current screen's icon marked by a 4 px `text1` bar. No labels. It takes no focus while focus is in the content.
- **Open**: Left from the first card or control of a screen opens it with focus on the current screen's entry. Each entry shows its icon and label in `typeLabel`. Right, or select on the current entry, closes it and returns focus to where it was. Opening and closing take `durQuick`; with reduced motion they are instant.
- **Entries, top to bottom, always in this order:** Search, Home, one entry per library (in the server's library order, from `UserViews`), then Settings and the account (the user's initial) at the bottom. Entries never move, never reorder by use, and never hide behind a sub-menu. Many libraries scroll within the rail; Search, Settings, and the account stay in place.
- **Search is the first entry**, so it is always Left, Up to the top, select.
- The rail is hidden in the player and in sign-in.
- Accessibility: the rail is a navigation region labelled "Main"; the current entry is marked selected.
- Owner's call: the rail's look (icons only when collapsed, the bar, the open width) and its entries.

### 7.2 Ambient backdrop (`AmbientBackdrop`)

- A layer behind each screen: the current item's backdrop at 100% (Detail) or 35% (Home, following the focused card after a 300 ms dwell), under `scrimHero` and `scrimFloor`, tinted by `artGlow`.
- It crossfades over `durSlow`. It is requested at 1280 or 1920 px wide as the memory budget allows (T3-12). The BlurHash shows first.

### 7.3 Hero (`Hero`)

- Home's first view. The hero is the Up next pick, by the first rule that matches:
  1. The first card of the Continue watching row.
  2. With that row empty and a title finished recently: the next unplayed film after it in its collection (where the server can list a film's collections).
  3. Otherwise the first unplayed title the server lists as similar to that finished title.
  4. Otherwise the newest addition: the first card of the Recently added row.
- Contents: the Logo or title, one facts line (`S2 · E4 · 38 min left`, or `2023 · 2 h 3 min · 4K · Dolby Vision`), at most two lines of overview, and the action bar (Resume or Play, plus "More info").
- Focus opens on Resume. The title the hero shows is not repeated as the first card of the row below it.
- With no candidate (empty library), no hero is shown and the first row moves up.

### 7.4 Home and its rows (`MediaRow`)

- **Home, in this order on every visit and for every account:** the hero, **Continue watching**, then one **Recently added** row. There is no row of library tiles and no per-library Latest rows; libraries live in the rail. An empty row is hidden and the others keep their order. Later rows (My list, T12-02) take places their own tasks set.
- **Continue watching** is one row: in-progress films and episodes together with each series' next episode, most recently played first, at most 16 cards. Cards play in one press. Removing a title from the row, and whether titles leave by themselves after a window, wait for the owner (T5-01).
- **Recently added** is one row of movies and shows, newest first. A series with new episodes shows once, as the series, and opens the series page. The row ends with a "See all" tile that opens the newest additions as a grid.
- A row is a title (`typeHeading`, sentence case) over a horizontal list of cards. Left and Right move within the row. Up and Down move to the adjacent row, to the card nearest by horizontal centre. The focused card keeps 96 px from the edge. Left from the first card opens the rail. Each row remembers its scroll position in app state, so a recycled row never inherits another row's place (decision 0004, condition 6).
- States: skeleton (cards of the right variant), error (`InlineError` in place of cards), and hidden when empty.

### 7.5 Media card (`MediaCard`)

| Variant | Frame | Under the art | Select |
|---|---|---|---|
| `poster` | 2:3, `posterW` | Title (1 line), year | Open detail or series |
| `thumb` (Continue watching) | 16:9, `thumbW`; Thumb, then Backdrop, then Primary | Series or title, then "S1 · E2 · 38 min left" | **Resume or play** in one press. Holding select, or Menu or Info where the remote has one, opens details |
| `episode` | 16:9 | "2 · Title", time left | Play the episode |

- Marks (top right, 24 px disc on a scrim): a check for played, a count for unplayed episodes. The progress bar sits at the bottom of the frame: a 4 px track at white .22 with an `artAccent` fill.
- Focus: the frame lifts by `lift` with `shadowLift`, plus a 3 px `focus` ring at a 3 px offset with a 1 px black .6 outer line so the ring reads on bright posters. The title goes from `text2` to `text1`.
- Missing image: `surface2` with the title in `typeLabel`, centred. Never a broken image.
- Images are requested at the drawn size, through the authenticated native client, never wider than 400 px for a poster.
- Accessibility: the label joins the title, subtitle, and progress ("Harbor Lights, S1 E2 The Keeper's Log, 38 minutes left").

### 7.6 Episodes on the series page

- A season's episodes are a horizontal row of `episode` cards, with one overview paragraph under the row that follows focus. Select plays; holding select or Info opens the episode's details.

### 7.7 Detail header (`DetailHeader`)

- A full-bleed backdrop at full strength. Over it, in the left five twelfths of the canvas: the Logo or title, a facts line ("2023 · 2 h 3 min · 7.8 audience · 91% critics · Drama", each score labelled by its source and shown only when the server has it), `MediaBadges`, the action bar, and a three-line overview with "More".
- **movie**: the genres in the facts line open the title's library filtered to that genre.
- **series**: facts are the year range, the season count, the scores, and genres. The primary action is "Resume S1 · E2" or "Play S1 · E3". Season tabs and the episode row sit below.
- **episode**: the series name above the title opens the series. Facts read "S1 · E2 · 45 min". A "More from Season 1" row sits below, positioned at the current episode.
- The cast is one horizontal row of round portraits (200 px) with the name and role under each, up to 20 people in the server's order; focus moves across it, and select does nothing.

### 7.8 Action bar (`ActionBar`)

- Order: **Primary** (`Resume 41:00` with a small progress ring, or `Play`), then the version picker (only with two or more versions), then the audio picker (only with two or more audio tracks), then `Start over` (only when resuming), then `Watched` and `Favorite` icon toggles (each with its state in words in the label), then `More`.
- The primary button takes focus when the screen opens.
- **The audio pill never shortens its label** (owner decision, 2026-11-16): the bar wraps to a second row rather than cut a label.
- When the player cannot start, the primary stays enabled and an `InlineNotice` under the bar explains.

### 7.9 Media badges and file details (`MediaBadges`, `FileAndStreams`)

- Badges are text-only tags on `surface2` at `radiusXs` in `typeMeta`: `4K`, `Dolby Vision`, `HDR10`, `TrueHD 7.1`, `Atmos` (only when the stream title says so), and `PGS · ASS` for image or styled subtitles. At most five. No third-party brand logos.
- `FileAndStreams` sits at the bottom of Detail: the chosen version's media info in two columns, values in Mono.
- Subtitles list only the tracks in the account's subtitle language, then "Show all {N} subtitles"; with no language set, the file's default track, then a count line ("51 more in 32 languages"), then the button.

### 7.10 Pickers and menus (`Picker`, `Menu`)

- A trigger shows the current value ("4K HDR", "English · TrueHD 7.1"). It opens a right-side sheet inside the safe inset (`playerSheetW`, a third of the canvas) with a list of rows; the selected row has a check and a two-line label.
- Up and Down move, select chooses and closes, Back closes without change and returns focus to the trigger. Never a platform picker the D-pad cannot style or focus.
- **Audio on a title's page.** The picker opens on the track in the account's audio language, or the one the server would start; that language's tracks come first. The pick holds while the title's page is open and is never saved.
- `Menu` is the same sheet for actions instead of a value (the `More` menu, the account menu).

### 7.11 Segmented tabs (`SegmentedTabs`)

- Used for seasons. The selected tab is `text1` with a 2 px `artAccent` bar under it; the others are `text2`. Left and Right move and select. Specials go last.

### 7.12 Library (`LibraryGrid`, `SortPicker`, `LetterRail`)

- **A library opens on its full grid**, with focus on the first card. There is no landing page of rows. The title is the library name in `typeTitle`.
- **Sort** is one picker above the grid: Name A to Z, Name Z to A, Newest added, Oldest added, Newest release, Oldest release, Highest rated, Lowest rated. **The sort is remembered per library and per account** (stored on the server's display preferences, so it follows the account). The trigger reads "Sort: Newest added".
- **Filters** (Unwatched, Favorites) are toggle chips beside Sort, with a check and the state in words. A remembered filter that is on is always visible on the first screen of the grid.
- **The letter rail** sits on the right edge of the grid, inside the safe inset, only when the sort is Name A to Z or Z to A. It lists `#` and A to Z; letters with no titles are dimmed and skipped. Right from the last column of the grid enters it at the letter of the focused card; Up and Down move between letters, and the grid scrolls to each as focus moves; select returns focus to the first card of that letter; Left returns without moving. While a key is held, a large letter shows in the centre of the grid. The owner may prefer the rail elsewhere; this is its specified place.
- Page keys, where the remote has them, move a page. While Down is held in the grid, a readout ("312 of 1,048") shows at the top right.
- Paging loads the next page before the end of the grid comes into view; random access by letter loads the page that letter needs.
- States: first-page skeleton (12 poster placeholders), empty library, filtered empty, first-page error, later-page error ("Couldn't load more items." with Retry), and library not available.

### 7.13 Search (`SearchField`, results)

- A large field (`typeTitle` text, 96 px tall, search icon) that takes focus when the screen opens, and a **mic button** beside it that starts the system's voice input.
- **Results show as each letter is typed**, after a short pause, grouped into rows (Movies, Shows, Episodes) of the same cards. An episode result opens the episode's details.
- Down from the field moves into the first row of results; Up from the first row returns to the field.
- Recent searches are not shown until the owner decides (T12-05).

### 7.14 Player chrome

Pure video by default. The chrome is three zones, shown together and hidden together. The player screen is native per platform (decision 0003); it follows these rules.

1. **Top bar** (over `scrimPlayerTop`): Back, then the title block. Episodes show the series name (`typeMeta`, `text2`) above "S1 · E2 The Keeper's Log" (`typeHeading`). On the right, a **conversion chip** only when the play method is not direct play: "Converting on server: {reason}" in `notice` with an icon. It opens the info sheet with focus on Play original. Nothing is shown for direct play.
2. **Scrubber**: a 4 px track that grows to 8 px when focused, elapsed time left and remaining time right ("−1:21:40") in `typeMono`, chapters as 2 px gaps, the buffered range as a lighter bar ahead of the playhead, an `artAccent` fill, and a 16 px `text1` thumb when focused. The scrub preview is a 384×216 frame from trickplay, with the time and chapter name inside its lower edge.
3. **Control row**: transport centred (back 10, Play or Pause, forward 10; the Play disc is 84 px), then Chapters (when present), Audio & Subtitles, Settings, and Info on the right. There is no volume control and no fullscreen; the TV owns both.

**Remote keys.** An arrow wakes the chrome with focus on the scrubber and does not seek. Left and Right then seek 10 s. Holding Left or Right for half a second pauses and scrubs a pending position in growing steps (10 s per 200 ms tick, then 20, 60, and 120 s, never more than a fiftieth of the duration) with the preview following; select commits and Back returns to where playback was. Up and Down move between the top bar, the scrubber, and the control row, then to a visible Up Next card. Each zone remembers its last control. Select with the chrome hidden activates a visible Skip, else Play now on a visible Up Next card, else wakes the chrome on Play or Pause. Play/Pause on the remote always toggles.

**Idle.** While playing, the chrome hides 3 s after the last key even with a control focused, and the next arrow wakes it. Paused, an open sheet, or a focused prompt keep it up.

Panels (right-side sheets, a third of the canvas, the video keeps playing; Back closes them and returns focus):

- **Audio & Subtitles**: two lists, as `Picker` rows.
- **Info sheet**: Playback (method, reason, "Original file" in `ok` when direct playing, Play original), Video (codec, resolution, range: "HDR (PQ)", "Dolby Vision, profile 8"), Audio (codec, channels, output: "PCM, 7.1" or "Passthrough (E-AC-3)"), and Decoder (engine and hardware decoder). A fact the engine did not report reads "Unknown". Values in Mono. It never shows URLs, IDs, or tokens.
- **Settings**: the Settings screen's own sections in a compact list (§7.18). Every change applies at once and confirms in its row with "✓ Saved" for 2 s.
- **Chapters**: one row per chapter with its name, start time, and a trickplay picture when the version has trickplay.

**OSD**: a transient pill at top centre for 1.2 s, for actions taken by key ("Subtitles: English (SDH)", "+10 s") and three lines from no key: "Skipped intro" or "Skipped credits", the conversion line for five seconds when a converted session starts, and the audio-pick line.

**Status**: loading, buffering, and seeking show a centred 64 px disc with a ring and one line of text ("Opening the original file…", "Buffering…"). "Buffering…" appears only after 500 ms. Before the first frame, the item's backdrop shows at 40% with the title and the status, plus Back.

### 7.15 Skip and Up Next

- **Skip**: a pill (`text1` at 92% fill, `onLight` text, skip icon) at the bottom right, above the scrubber's place, while an Intro or Outro segment is active. Select activates it while the chrome is hidden. "Skip automatically" seeks past the segment once per title and says so in the OSD; "Do nothing" offers nothing. With a next episode, the credits are never skipped; Up Next takes their place.
- **Up Next card**: bottom right, 560 px, `surface1` at 96% with `shadowSheet`. The next episode's still, "Up next · S1 · E2", the title, then **Play now** (primary, with the countdown drawn as a fill over the remaining seconds) and **Hide** (dismisses the card and cancels auto-play for this session). With auto-play off, the same card has no fill and nothing advances. With reduced motion, Play now has no fill and the card says "Playing in N seconds".

### 7.16 Notices, dialogs, toasts

- **Dialog**: a centred `surface1` panel (max 840 px, `radiusSheet`, `shadowSheet`) over a black .6 veil: icon, title, body, actions (primary last). Focus is trapped and restored on close. The safe action gets initial focus for risky confirms (the unencrypted connection, Remove account).
- **Notice** (full-screen state: refusal, player cannot start, not found): the item's backdrop at 30% under scrims, then the item title, the notice title, the explanation, "What you can do", and actions.
- **Toast**: bottom left inside the safe inset, `surface1`, icon plus one sentence, 5 s (errors stay until dismissed). No toast in the player; the OSD speaks there.
- **InlineError**: an icon, one sentence ("Couldn't load Recently added."), and Retry. It replaces the content it failed to load.

### 7.17 Empty, loading, skeleton

- **EmptyState**: a centred column, a 72 px line icon in `text3`, a title (`typeHeading`), one sentence, and at most one action.
- **Skeleton**: `surface2` blocks shaped like the content, shown only after 150 ms. No shimmer under reduced motion.

### 7.18 Settings

A short surface: a list of sections on the left and the selected section's rows on the right. Up and Down move in the list, Right enters the rows, Left and Back return to the list.

- **Playback**: streaming limits (local and remote, each "No limit" or a preset), Play next episode automatically, Countdown (5, 10, or 15 seconds), Intros and Credits (Show a Skip button, Skip automatically, Do nothing), and Audio passthrough (unavailable until it is built).
- **Home**: the Continue watching window, once the owner decides it (T5-01).
- **Languages**: the account's audio and subtitle languages, saved to the server account.
- **Subtitles**: subtitle style (unavailable until it is built).
- **Accounts**: every saved account as "name · server", with Switch, Sign out, and Remove, then "Add account".
- **About & diagnostics**: versions, licences, and "Copy diagnostics" (redacted).
- Which settings follow the account and which stay on the device waits for the owner (T9-01).
- Rows for features not built yet show "Not available yet." and take no focus.
- **Switch**: a pill track (64×36 px) with a round thumb and the words "On" or "Off" beside it, so the state is never colour alone.

### 7.19 Buttons and fields

| Variant | Look | Use |
|---|---|---|
| `primary` | `text1` fill, `onLight` text, 72 px tall, `radiusControl` | One per screen |
| `secondary` | `text1` at .12 fill, `text1` text | Start over, Retry beside a primary |
| `quiet` | Transparent, `text2` text that becomes `text1` on focus | Hide, Change server |
| `icon` | 64 px circle, `text1` at .10 fill | Watched, Favorite, player controls |
| `danger` | `secondary` with `danger` text | Sign out, destructive confirms |

- Every button has a `durInstant` press (scale .98, none with reduced motion) and the shared focus ring and lift.
- **TextField**: a 72 px `surface2` field with a `lineStrong` border, the label above in `typeLabel` and `text2`, helper and error text below. Text comes from the system keyboard or voice.

### 7.20 Sign-in

Each step asks one question in `typeTitle`, with no eyebrow.

1. **Where is your server?** Saved servers first, then "On this network": servers found on the home network as large rows (name, address in `typeMono`, "Advertised by {ip}", and any conflict in `danger`), with focus on the first. "Enter address" (secondary) reveals the Server URL field; "Search again" is quiet. Without any found server, the field shows.
2. **Approve this sign-in on your phone.** The origin chip (the server's address in Mono) under the heading. The Quick Connect code is the hero in `typeCode`, grouped ("482 913"), and **a QR code beside it** that opens the server's approval page on a phone that is already signed in. The step says what to do in one sentence: "Scan the code with your phone, or enter the code in Quick Connect." No primary button: "Use a password" is secondary (hidden when the server has no password sign-in) and "Change server" is quiet. The screen updates by itself when the phone approves.
3. **Who is signing in?** (the fallback) The same origin chip, Username and Password fields, "Show password", "Change server", and "Sign in" (primary).

The unencrypted-connection warning is a dialog over step 1. Cancel is primary and focused; Back cancels.

The QR code's content, its size, and the sign-in screen's layout are the owner's call. What the QR code links to depends on the server: Jellyscale issue #118 tracks its approval link (T10-06).

### 7.21 Accounts (`AccountPicker`)

Octave remembers any number of accounts. An account is one user on one server. One is active at a time, and each server's libraries stay separate.

- **Launch.** With one signed-in account, Octave opens it. With two or more, it shows "Who's watching?" first.
- **`AccountPicker`**: "Who's watching?" as the heading, then account tiles (the user's initial, the name, and the server name in `typeMeta`). A signed-out account is marked "Signed out" in words. The last tile is "Add account". The rail's account entry opens this screen.
- **Three actions, three labels.** *Switch* keeps the sign-in. *Sign out* revokes it on the server and keeps the tile. *Remove* also forgets the account, after a dialog with the safe action focused.
- A PIN per account waits for the owner (T12-01); when it comes it is entered with the D-pad and never shown in clear.

## 8. Tokens

Tokens are TypeScript constants (T3-06), not CSS. A test fails when a value here and the code differ. Values are px on the 1920×1080 canvas (§6) and await the TV design pass.

| Group | Tokens |
|---|---|
| Colour | `void` `#060708`, `surface0` `#0b0c0e`, `surface1` `#131417`, `surface2` `#1b1c20`, `surface3` `#25262b`, `line` `rgb(242 239 233 / .10)`, `lineStrong` `rgb(242 239 233 / .37)`, `text1` `#f2efe9`, `text2` `#a9a59d`, `text3` `#8a867f`, `onLight` `#0b0c0e`, `focus` `#fff4dc`, `focusEdge` `rgb(0 0 0 / .6)`, `danger` `#ff8a6b`, `notice` `#f0b65a`, `ok` `#8fd1a8`, `fillSecondary` `rgb(242 239 233 / .12)`, `fillIcon` `rgb(242 239 233 / .10)`, `track` `rgb(255 255 255 / .22)`, `trackBuffered` `rgb(255 255 255 / .40)`, `veil` `rgb(0 0 0 / .6)` |
| Artwork defaults | `artAccent` `#e8c48a`, `artGlow` `rgb(232 196 138 / .22)`, `artShade` `#141210` |
| Type | §4: `typeHero` 72, `typeCode` 72 Mono, `typeTitle` 48, `typeHeading` 33, `typeBodyLg` 31.5, `typeBody` 28, `typeLabel` 24, `typeMeta` 24, `typeMono` 24 Mono; `measure` 62 characters |
| Space | `space1` 4, `space2` 8, `space3` 12, `space4` 16, `space5` 24, `space6` 32, `space7` 48, `space8` 64, `space9` 96; `safeX` 96, `safeY` 54 |
| Sizes | `railCollapsedW` 96, `railOpenW` 400, `posterW` 248, `thumbW` 416, `rowGap` 48, `controlH` 72, `iconButton` 64, `hitMin` 64, `switchW` 64, `switchH` 36, `searchFieldH` 96, `textFieldH` 72, `personDisc` 200, `playerSheetW` 640 (a third of the canvas), `playerPlayDisc` 84, `playerStatusDisc` 64, `upNextW` 560, `scrubTrackH` 4, `scrubTrackHActive` 8, `scrubThumb` 16, `scrubGap` 2, `scrubPreviewW` 384, `scrimPlayerTopH` 360, `scrimPlayerBottomH` 440, `posterRequestMaxW` 400 |
| Shape | `radiusXs` 4, `radiusArt` 6, `radiusControl` 10, `radiusSheet` 16, `radiusPill` 999 |
| Depth | `shadowLift`, `shadowSheet`, `scrimHero`, `scrimFloor`, `scrimPlayerTop`, `scrimPlayerBottom` (§5) |
| Motion | `durInstant` 80 ms, `durQuick` 160 ms, `durBase` 240 ms, `durSlow` 480 ms, `easeOut`, `easeInOut`, `lift` 1.08, `chromeIdleMs` 3000, `savedMs` 2000, `dwellMs` 300, `bufferingDelayMs` 500, `skeletonDelayMs` 150 |
| Focus | `focusRingWidth` 3, `focusEdgeWidth` 1, `focusOffset` 3 |
| Reduced motion | `durQuick` 0, `durBase` 0, `durSlow` 120, `lift` none |

## 9. Interaction rules

**Focus model**

- One focus at a time, always visible.
- Rows and grids move focus within themselves with Left and Right; Up and Down across rows go to the nearest item by horizontal centre. Left from the first item of a screen opens the rail; Right from the rail returns to where focus was.
- Opening a screen focuses its primary action. Returning with Back restores the previously focused card; when it is gone, focus lands on the card now at the same place in the same row, and when the row is gone too, on the screen's opening focus. A fresh visit never restores.
- Focus is never hidden: rows scroll the focused card to at least 96 px from any edge, and the rail never covers it.
- Focus never jumps: the scripted focus test (T3-10) runs 500 presses, singles and held bursts, through Home with the rail and fails on any wrong, missing, or stuck move.

**Back.** Back closes the topmost layer: menu, then sheet, then dialog, then player, then screen. On a root screen it opens the rail on that screen's entry; on Home with the rail open it leaves the app (§6, the owner's call).

**Back restores the place.** Returning to a screen restores its scroll position, sort, filters, loaded pages, and focused card, with no skeleton. A screen's data is kept while its account is active and dropped when the account changes, signs out, or the app closes.

**Remote keys**

| Where | Key | Action |
|---|---|---|
| Anywhere | D-pad, select, Back | Move, activate, back |
| A screen's first column | Left | Open the rail |
| Rail | Right, or select on the current entry | Close the rail, return focus |
| Card that plays, hero primary | Hold select, or Menu or Info | Open details |
| Library grid, A to Z | Right from the last column | Enter the letter rail |
| Library grid | Page keys, where the remote has them | Move a page |
| Search | Mic button, or the remote's voice key | Voice input |
| Player | Play/Pause | Play or pause |
| Player | Arrows | Wake the chrome on the scrubber; then Left and Right seek 10 s, Up and Down move between zones |
| Player | Hold Left or Right, then select or Back | Scrub with the preview; select commits, Back returns |
| Player, chrome hidden | Select | Skip, else Play now, else show the controls |

Keyboard-only keys of the desktop app (`/`, `?`, `i`, `a`, `s`, `n`, `m`, `f`, `c`, number keys) are not TV rules. They belong to the desktop phase (T16), which decides which return.

**Prefetch.** When focus rests on a card for 300 ms, prefetch its detail and backdrop at the needed width. Play stays one press.

## 10. Voice and copy

Octave talks like a knowledgeable friend running the projector: calm, brief, plain, and honest about the file.

- Sentence case. No exclamation marks. No "Oops". No blame ("you entered" becomes "That address didn't answer").
- Controls name the action: "Resume", "Start over", "Play S1 · E3", "Mark as watched", "Hide".
- Times are human: "38 min left", "Ends at 22:41", "Resume from 41:00". Episodes are "S1 · E2".
- Errors name the problem and the way out: "Couldn't reach Hearth. Check that the server is on, then try again."
- Honest playback words: "Original file", "Repackaging on server, original quality: {reason}", "Converting on server: {reason}" (PRODUCT.md). Never imply quality is kept when it isn't.
- Technical terms (HEVC, TrueHD, Direct play) appear in badges, file details, and the info sheet, never in a primary sentence.

| State | Title | Body | Action |
|---|---|---|---|
| Home, empty | Nothing to watch yet | Your libraries on {server} don't have any movies or shows. Add media on your server, then come back. | Open settings |
| Search, start | Search your libraries | Movies, shows, and episodes. | n/a |
| Search, no results | No matches for "{term}" | Check the spelling, or try part of the title. | n/a |
| Library, empty | Nothing in this library yet | Add media on your server, then come back. | n/a |
| Library, filtered empty | Nothing matches these filters | n/a | Clear filters |
| Library, not available | This library isn't available | It may have been removed, or this account can't see it. | Go home |
| Libraries, error | n/a | Couldn't load your libraries. | Retry |
| Library, later page error | n/a | Couldn't load more items. | Retry |
| Row error | n/a | Couldn't load {row}. For the merged row, "Couldn't load Continue watching." when either of its lists fails. | Retry |
| Search, error | n/a | Couldn't load search results. | Retry |
| Sign-in, Quick Connect | Approve this sign-in on your phone | Scan the code with your phone, or enter the code in Quick Connect. | Use a password |
| Sign-in, Quick Connect off | n/a | Quick Connect is off on this server. Ask its owner to turn it on, or use a password. | Use a password |
| Sign-in, 401 | n/a | That username and password didn't work. | n/a |
| Sign-in, unreachable | n/a | Couldn't reach {address}. Check the address and that the server is running. | n/a |
| Sign-in, refused plain HTTP | n/a | This address uses plain HTTP on the internet, so Octave will not connect. Use HTTPS, or HTTP only for this device or a private home-network address such as 192.168.x.x, a name.local name, or a name.home.arpa name. | n/a |
| Sign-in, anything else | n/a | Something went wrong. Try again. | n/a |
| Series, no episodes | n/a | This series has no episodes yet. | n/a |
| Next episode error | n/a | Couldn't load your next episode. | Retry |
| Detail, watched or favorite toast | n/a | Marked as watched. / Marked as unwatched. / Added to favorites. / Removed from favorites. | n/a |
| Detail, subtitles after the default track | n/a | {n} more in {m} languages; 1 more in 1 language; {n} more with no language | Show all {N} subtitles |
| Detail, subtitles with no default track | n/a | {n} in {m} languages; 1 in 1 language; {n} with no language | Show all {N} subtitles |
| Detail, subtitles expanded | n/a | (every track) | Show fewer subtitles |
| Detail, facts line scores | n/a | {n.n} audience; {n}% critics. Each is labelled by its source and shows only when the server has it. | n/a |
| Detail, watched or favorite failed | n/a | Couldn't update watched state. Try again. / Couldn't update favorite. Try again. | n/a |
| Settings, limit changed | n/a | {Local network or Remote} limit set to {n} Mbps. / {Local network or Remote} limit removed. | n/a |
| Settings, changes in the player | n/a | ✓ Saved | n/a |
| Settings, Languages intro | n/a | Saved to your account on the server, so your other apps for this server use them too. | n/a |
| Settings, Languages refused | n/a | Your server didn't accept this change from Octave. Change it in your server's web app. | n/a |
| Settings, unavailable row | n/a | Not available yet. | n/a |
| Settings, signed out | n/a | Signed out | n/a |
| Settings, copy diagnostics | n/a | Diagnostics copied | Copy |
| Item gone | This item is no longer on the server | It may have been removed or renamed. | Go home |
| Player loading | n/a | Opening the original file… | Back |
| Player loading, converting | n/a | Converting on server: {reason}… | Back |
| Player, this device can't play the original | n/a | Converting on server: this device can't play the original file. | n/a |
| Player, picked audio track not applied | n/a | Couldn't switch to the audio track you picked. Playing the default track. | n/a |
| Playback error, server unreachable | Playback could not start | Couldn't reach {server}. Check that the server is on, then try again. | Retry, Back to details |
| Playback error, server error (HTTP 5xx) | Playback could not start | {server} had a problem starting playback. Try again in a moment. | Retry, Back to details |
| Playback error, the player did not stop | Couldn't stop playback | The player didn't close properly. Go back to try again. | Back to details |
| Playback error, unsafe stream | Playback could not start | Your server offered a stream address Octave won't use. | Back to details |
| Playback error, other request failure | Playback could not start | Something went wrong starting playback. Try again. | Retry, Back to details |
| Progress report failed | n/a | Couldn't save your progress to {server}. Playback continues. | n/a |

## 11. Accessibility rules

1. Text contrast is 4.5:1 or more (3:1 for 24 px bold and up). Non-text UI (progress, borders that convey state, focus) is 3:1 or more against its neighbours. Text over artwork always sits on a scrim that guarantees this.
2. Focus is visible (ring plus lift) and never hidden, and the ring is 3 px or more with 3:1 or more contrast against both the art and the page (two-tone ring).
3. Targets are 64 px or more.
4. State is never colour alone: toggles change icon and state in words.
5. Motion: honour the system's reduced-motion setting everywhere (§5). Nothing flashes more than 3 times a second. The countdown never advances without a visible, focusable Hide.
6. Every screen has one heading naming its content, read by TalkBack. Announcements are made once per change, never every second.
7. Everything works with the D-pad, select, and Back. No focus traps except dialogs, which close on Back.
8. Images: art is decorative when the title is in text nearby. A Logo used as the title has the title as its label.

## 12. Decisions

### Carried from the desktop system (accepted 2026-11-08)

1. **One-press resume.** Continue watching cards play on select; details open on a held select or Info.
2. **Typeface.** Atkinson Hyperlegible Next and Mono.
3. **Logo and Thumb images.** The Logo becomes the title in heroes and detail headers.
4. **Skip on select.** While the chrome is hidden, select activates a visible Skip.
5. **Ambient Home backdrop.** It follows the focused card after a 300 ms dwell.

Also carried: TV body text 28 px and nothing under 24 px (D13 B), exit by the platform's rule (D14 B), a held select opens details (D15 B), press to step and hold to scrub (D16 B), Back restores the place (D1 B), "Buffering…" after 500 ms (D6 B), no `text3` over video (D8 B).

### Owner decisions, 2026-11-20

- The TV is the reference form.
- Navigation is a collapsed side rail.
- Home has one Recently added row of movies and shows, with episodes grouped by series.
- Libraries open on the full grid, with a remembered sort that includes "Newest added", and a letter rail when sorted A to Z.
- Sign-in is by QR code and Quick Connect, so single sign-on works.

### Awaiting the owner

- The rail's look and entries; how many posters show beside it; what Back does on Home; the sign-in screen with its QR code (T1-08).
- The token values after the TV design pass (T3-06), and the lift and memory choice (decision 0004, choice 2).
- Continue watching removal and its window (T5-01); which settings follow the account (T9-01); a profile PIN (T12-01); recent searches (T12-05).
