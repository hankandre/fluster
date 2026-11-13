# Video app UX: what the evidence says about how things should work

Researched 2026-11-12 for [`docs/plans/proposals/ux-audit.md`](../plans/proposals/ux-audit.md). The owner asked for it the same day: "We should probably also do some UX research since we want our app to be superior to all that have preceded it."

This document is about **how** things should work. Which features to build is covered by three earlier studies and is not repeated here: [`streaming-ux-gripes.md`](streaming-ux-gripes.md), [`streaming-ux-loves.md`](streaming-ux-loves.md), and [`jellyfin-clients.md`](jellyfin-clients.md). A fourth, `streaming-wishlist.md`, was being written in parallel (pull request #137). It appeared after this research was done, so nothing here rests on it; where it has demand figures for something below (spoiler-safe episode lists, a skip step you choose, caption settings), the audit points to it.

## Method and limits

- **Evidence is weighed, not counted** (the owner's method, 2026-11-12). Each finding carries a strength:
  - **Strong**: a controlled study, or measurement at scale, that was read.
  - **Medium**: several platform guidelines that agree, or a Nielsen Norman Group or Baymard finding from their own testing.
  - **Weak**: one small study, a vendor's unexplained claim, or expert opinion.
  - **None**: no source found. Stated as such.
- Every claim has a URL beside it. **"(snippet)"** means the claim comes from a search-result summary and the page was not opened or refused the fetch. **"unverified"** means no source was found; it does not mean the claim is false.
- Apple's Human Interface Guidelines pages render with JavaScript. They were read through Apple's own JSON endpoint for each page; the URL cited is the normal page.
- **Platform guidelines are rules, not evidence.** Apple, Google, Amazon, Roku, Samsung, LG, and Microsoft publish what they require or advise and almost never why. Where they agree the agreement is worth something; where they disagree this document says so.
- **Sites that could not be reached:**
  - `netflixtechblog.com` and its Medium mirror (403). No Netflix tech-blog post was read directly; two were read through a mirror, and the Netflix newsroom and help pages were read.
  - `bbc.co.uk` (refused by the fetch tool and the search tool). **No BBC GEL guideline for TV was found or read.** The BBC's subtitle guidelines were read by a direct request, and its web design system's video-controls page was read from `bbc.github.io`.
  - `dl.acm.org` (403); papers were read from authors' or mirror copies where one exists.
  - `support.plex.tv` (403), `kodi.wiki` (403), `viget.com` (429), `uxdesign.cc` (403), `m3.material.io` (empty), `sdkdocs-archive.roku.com` (DNS failure), one Baymard article (paywall).
  - Reddit was not read, as in the earlier studies.
- No competing app was installed or run. "How the leading apps do it" comes from their help pages, vendor posts, and press, and is thin for Disney+, Kodi, and the Apple TV app. Gaps are marked.
- Fluster's own state is not described here. The audit does that.

## 1. Summary

| # | Area | What the evidence supports | Strength |
|---|---|---|---|
| 1 | Back | Back returns to the place the user thinks of as previous, with the list position and state restored. Losing the place causes abandonment. | Medium to strong (Baymard testing) |
| 2 | Navigation | Visible navigation beats hidden navigation on desktop. Few top-level destinations. | Strong (NN/g, 179 participants) |
| 3 | TV Back | Back goes up one level, ends at the device's home, and never loops or traps. Platforms disagree about confirming exit. | Medium (rules agree; no study) |
| 4 | TV focus | One focused item, always; visible by more than colour; focus is remembered when you return. | Medium (rules agree; WCAG) |
| 5 | TV text and margins | Body text 28 to 30 px at 1080p, nothing under 23 to 24 px; a 5% safe margin. | Medium (five platforms agree) |
| 6 | Rows | People scan down, not across. The first visible cards of the first rows get almost all the attention; row titles are mostly skipped. | Strong (eye tracking, 87 people) |
| 7 | Startup | Viewers start leaving after 2 s of waiting for video, and 5.8% more leave per second after that. | Strong (23 million views) |
| 8 | Skeletons | No good evidence that skeletons beat spinners. Showing nothing for the first second is better supported. | Weak, mixed |
| 9 | Scrub previews | Thumbnails make seeking faster and more accurate in lab tasks. | Medium (lab studies) |
| 10 | Subtitles | About half of viewing hours use them. Viewers need control of size, colour, and background. | Strong (use); medium (styling rules) |
| 11 | Auto-play | People keep it on and resent it when they cannot control it. A visible countdown with a way out is the supported form. | Medium (one experiment, 76 people) |
| 12 | TV text entry | Typing with a D-pad costs about half a second a press and 4 or more presses a character. Avoid it. | Strong (measured) |
| 13 | Search | A visible field, suggestions of 10 or fewer, and a no-results page that offers something. Half of users give up after one failed search. | Medium (NN/g, Baymard testing) |
| 14 | Spoilers | Studies conflict on whether spoilers hurt. Three media apps ship a "hide spoilers" setting; none makes it the default. | Mixed |
| 15 | Sign-in on TV | Authenticate on another device. Keep people signed in. | Medium (every platform says so) |
| 16 | Reduced motion | Replace movement with fades; never auto-play moving content without a control. | Medium (WCAG, Apple) |
| 17 | Error messages | Say what happened and what to do, near where it happened, without blame or codes. | Medium (NN/g rubric) |
| 18 | Settings | Almost nobody changes a default, so defaults are the design. | Medium (weak studies that agree) |

The short reading: **the best-evidenced rules are about not losing people's place and not making them wait.** Back restores where you were; video starts inside two seconds; the first row holds what you want; you never type with a remote. Visual polish has far less evidence behind it than these.

## 2. Information architecture and navigation

### 2.1 Desktop navigation

**Best practice.** Keep the main destinations visible, keep them few, and mark where the user is.

- Nielsen Norman Group tested hidden against visible navigation with 179 participants on six sites. On desktop, people used hidden navigation in 27% of cases and visible navigation in 48%. Tasks were at least 39% slower with hidden navigation, and content was found more than 20% less often. Strong. (https://www.nngroup.com/articles/hamburger-menus/)
- Apple's guidance for tab bars: fewer tabs are easier, labels are one word, and a tab is never hidden or disabled; hiding the bar makes people "forget which area of the app they're in". (https://developer.apple.com/design/human-interface-guidelines/tab-bars)
- Shortcuts are an accelerator, never the only way; they are taught by showing them beside the action or in a tooltip (snippet). (https://www.nngroup.com/articles/ui-accelerators/)

**How the leading apps do it.** Netflix moved Search and My List from a left rail on TV to the top of the page in May 2025 because the rail's shortcuts "were somewhat hidden"; it published no numbers. (https://about.netflix.com/en/news/unveiling-our-innovative-new-tv-experience) The gripes study records that a November 2026 test moves the menu back to the left for some users ([`streaming-ux-gripes.md`](streaming-ux-gripes.md) §5, row 14). Navigation placement on TV is therefore not settled even at Netflix.

**Where they fall short.** No study of navigation in a desktop media app was found. The NN/g result is about websites. It transfers as "visible beats hidden", not as a layout.

### 2.2 Back, on the desktop

**Best practice.** Back returns to what the user perceives as the previous place, in the state they left it.

- Baymard's testing found users expect Back to respect four things: an overlay closes, a filter or sort change steps back, an accordion steps back, and **returning from a detail page restores the list position**. 59% of the sites it benchmarked break at least one. Medium to strong. (https://baymard.com/blog/back-button-expectations)
- Sending a user to the top of a list after they open one item "directly caused site abandonments" in Baymard's testing; 13% of benchmarked sites do it, and lists that load as you scroll are the worst case. (https://baymard.com/blog/return-same-place)
- NN/g on lists that load as you scroll: save the scroll position on return, keep a "Load more" control, and show how many items there are. (https://www.nngroup.com/articles/infinite-scrolling-tips/)
- Escape closes the topmost dialog, and focus returns to the control that opened it. (https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/)

**How the leading apps do it, and where they fall short.** Losing your place after playback is a filed complaint against Jellyfin's Android TV client (snippet). (https://github.com/jellyfin/jellyfin-androidtv/issues/2414) No measured comparison of streaming apps' Back behaviour was found.

### 2.3 Back, on a TV

**Best practice.** Back goes up one level. Repeated presses end at the device's home screen. It never loops and never traps.

| Platform | Rule | Source |
|---|---|---|
| Android TV | Back returns to the previous destination and must end at the launcher. With top navigation, Back first scrolls to the top and focuses the menu. "Avoid exit gating." No on-screen Back button. | https://developer.android.com/training/tv/get-started/navigation and https://developer.android.com/docs/quality-guidelines/tv-app-quality |
| tvOS | Back opens "the parent of the current screen", which "isn't necessarily the previous screen". At the top level the parent is the Apple TV Home Screen. | https://developer.apple.com/design/human-interface-guidelines/remotes |
| Roku | Back returns to the previous screen; on the app's home it exits. One confirmation is allowed. | https://developer.roku.com/docs/developer-program/certification/certification.md |
| Fire TV | Back must not force-close or loop, and no screen may trap the user. Its controller guideline suggests an exit confirmation. | https://developer.amazon.com/docs/app-testing/test-criteria.html and https://developer.amazon.com/docs/fire-tv/controller-behavior-guidelines.html |
| Samsung | Return on the home page must show an exit confirmation. | https://developer.samsung.com/smarttv/develop/guides/fundamentals/terminating-applications.html |
| LG webOS | Back on the entry page must show the Home screen. | https://webostv.developer.lge.com/distribute/app-self-checklist |

**The platforms disagree about confirming exit.** Android says never; Samsung requires it; Roku and Fire TV allow it. A cross-platform client has to follow each platform's rule. Netflix's 2025 TV interface brings up the top bar on Back before leaving. (https://www.engadget.com/entertainment/streaming/netflix-overhauls-its-tv-app-with-a-fresh-ui-and-responsive-recommendations-121511958.html)

Strength: medium. These are certification rules that agree on everything except the confirmation. No usability study of TV Back was found.

## 3. The 10-foot interface

### 3.1 Distance, text size, and safe margins

**Best practice.** Design for a viewer about 3 metres away. Body text of 28 to 30 px at 1080p, nothing smaller than 23 to 24 px, and nothing essential in the outer 5% of the screen.

| Platform | Body text | Smallest text | Safe margin | Source |
|---|---|---|---|---|
| tvOS (1920×1080 pt) | 29 pt | 23 pt | 60 pt top and bottom, 80 pt sides | https://developer.apple.com/design/human-interface-guidelines/typography and https://developer.apple.com/design/human-interface-guidelines/layout |
| Fire TV | 28 px (14 sp) | n/a | Outer 5% of every edge | https://developer.amazon.com/docs/fire-tv/design-and-user-experience-guidelines.html |
| Xbox (archived guidance) | 30 px (15 epx) | 24 px | 54 px top and bottom, 96 px sides | https://learn.microsoft.com/en-us/windows/apps/design/devices/designing-for-tv |
| LG webOS | n/a | 20 px | 20 px (snippet) | https://webostv.developer.lge.com/distribute/app-self-checklist and https://webostv.developer.lge.com/develop/guides/overscan |
| Android TV | In an image; not read | n/a | 5%: 96 px sides, 54 px top and bottom at 1080p | https://developer.android.com/design/ui/tv/guides/styles/layouts |
| Roku (1080p) | n/a | n/a | Action safe 96 px and 53 px; title safe 192 px and 106 px | https://developer.roku.com/dev/docs/graphics |

- Android's layout page contradicts itself: it gives 48 dp and 27 dp, and elsewhere 58 dp and 28 dp. It also says "Most modern TVs no longer have overscan issues" and that backgrounds should bleed to the edge.
- Roku's title-safe area is 80% of the screen, twice the margin of everyone else. A Roku build would need more.
- Apple gives control sizes of 66 pt by default and 56 pt at minimum. Microsoft gives 64 px. LG requires 75 px buttons.
- Colour: Fire TV says to use less saturated colours. Microsoft says to stay inside RGB 16 to 235 because extremes band and bloom. "Avoid pure white" is repeated widely and has no primary source: unverified.
- Android's typography page says thin strokes "are not instantly recognisable" at distance.

Strength: medium. Five platforms land within a few pixels of each other. No legibility study at TV distance was found.

### 3.2 Focus

**Best practice.** Exactly one item has focus at all times. It is shown by size or outline as well as colour. Focus never moves unless the user moves it. Returning to a row or a screen returns to the item that had focus.

- Android TV: "always have an item in focus that a user can take action on immediately after your app starts or any time it is idle", and one uniform focus scheme across the app. Its focus scales are 1.025, 1.05, and 1.1. (https://developer.android.com/training/tv/get-started/navigation and https://developer.android.com/design/ui/tv/guides/styles/focus-system)
- tvOS: "Avoid changing focus without people's interaction." If nothing lies in the pressed direction, focus stays where it is. A collection can remember its last focused item (`remembersLastFocusedIndexPath`), and a screen restores its focus after a transition by default. (https://developer.apple.com/design/human-interface-guidelines/focus-and-selection and https://developer.apple.com/documentation/uikit/uicollectionview/remembersLastFocusedIndexPath)
- LG makes a focus effect mandatory "with NO EXCEPTION"; Fire TV tests for it. (https://webostv.developer.lge.com/distribute/app-self-checklist and https://developer.amazon.com/docs/app-testing/test-criteria.html)
- WCAG 2.2: focus must be visible (2.4.7, AA) and not entirely hidden by other content (2.4.11, AA). The stricter 2.4.13 (AAA) asks for an indicator at least as large as a 2 px perimeter with 3:1 contrast between focused and unfocused states; **a glow or shadow outside the component does not count**. (https://www.w3.org/WAI/WCAG22/Understanding/focus-appearance.html)
- An accessibility consultancy's TV review: focus should combine a border or underline with a size change, never colour alone, and WCAG's contrast ratios do not translate directly to a TV. (https://tetralogical.com/blog/2023/08/09/tv-best-practices/)

Strength: medium. Rules agree; no controlled study of focus styles on TV was found.

### 3.3 D-pad movement

**Best practice.** Each direction has one meaning: up and down change category, left and right change item. Movement is predictable from geometry. Ends stop, except where the platform says they wrap. Holding a key speeds up.

- The W3C's spatial-navigation draft picks the next item by distance and alignment and does not wrap. It is a 2019 working draft with features at risk, so it is a reference, not a standard. (https://www.w3.org/TR/css-nav-1/)
- **Wrap or stop: platforms disagree.** Android Compose, Samsung, and tvOS stop at the end. Fire TV wraps one-dimensional lists. (https://developer.android.com/develop/ui/compose/touch-input/focus/change-focus-traversal-order, https://developer.samsung.com/smarttv/design/input-methods.html, https://developer.amazon.com/docs/fire-tv/design-and-user-experience-guidelines.html)
- Samsung: "Movement accelerates when it is held down." No platform publishes a curve.
- Microsoft: crossing the screen should take "no more than six clicks".
- NN/g's 2015 smart-TV review counted 245 right-arrow presses to browse 500 films on one service; paging would have cut that to 49. It is an expert review, not a study. (https://www.nngroup.com/articles/smart-tv-usability/)
- Android: "If there isn't a straight path to get to a control, consider relocating it."

**Measured.** Disney+ Hotstar cut the delay between a remote press and the screen's response from 675 ms to 272 ms on living-room devices and saw card views per user double, from 111 to 226 a week. It limited spatial navigation to the row, rendered only the visible rows plus one either side, and cancelled work when focus moved on. A vendor case study, with a measured result. (https://web.dev/case-studies/hotstar-inp)

Strength: medium for the rules, strong for "input delay costs browsing". No model of remote navigation cost was found.

### 3.4 Rows, grids, and density

**Best practice.** Put what matters in the first visible cards of the first rows. Show part of the next card. Do not count on row titles being read.

- **Eye tracking of carousel pages** (87 participants, 2,375 screens, ten rows of fifteen items with five visible; SIGIR 2026). People scan down the left, then along one row. In the top row 84% looked at the last visible item and 33% at the first hidden one. The first thumbnail of a row was examined on 91% of screens and the row's title on 26%. Row 1 out-converted row 6 even with row order randomised. Swiping happened almost only in the row that got the click. Strong. The abstract was read (https://arxiv.org/abs/2604.21019); the figures are from a summary of the paper (https://www.uxtigers.com/post/ux-roundup-20260724).
- Netflix's own description matches: members "are more likely to scan vertically than horizontally", and the upper left is seen most (read through a mirror). (https://gwern.net/doc/www/netflixtechblog.com/2f5717e8bbdc98d2caf5c7a972359fbb7e7c0b28.html)
- Netflix's paper: a member "loses interest after perhaps 60 to 90 seconds of choosing, having reviewed 10 to 20 titles (perhaps 3 in detail) on one or two screens". The research behind it is not described. Weak as a number, consistent with the eye tracking. (https://gwern.net/doc/reinforcement-learning/exploration/2015-gomezuribe.pdf)
- Viewers now spend 12 minutes a session in the US deciding what to watch, and 19% give up when the search fails (Gracenote and Nielsen, 3,000 people, 2025). (https://gracenote.com/newsroom/new-gracenote-report-highlights-impact-of-ineffective-content-discovery-on-consumer-happiness-with-streaming/)
- Artwork is "the biggest influencer" of a choice and takes 82% of a browsing member's attention, at about 1.8 seconds a title (Netflix newsroom, 2016; its own research, undescribed). (https://about.netflix.com/en/news/the-power-of-a-picture)
- NN/g's smart-TV review: show the title with the artwork, because one service's users had to open each tile to learn its name.
- Density on platforms: tvOS gives widths for grids of two to nine columns (six across is 260 pt each) with 40 pt gaps and at least 100 pt between rows; Android TV shows a peek of the next card with 20 dp spacing. (https://developer.apple.com/design/human-interface-guidelines/layout and https://developer.android.com/design/ui/tv/guides/components/cards) The gripes study records Netflix testing six tiles a row after complaints about fewer.
- Choice overload is not a safe argument for fewer titles. A meta-analysis of 50 experiments found a mean effect of "virtually zero" (snippet). (https://ideas.repec.org/a/oup/jconrs/v37y2010i3p409-425.html)
- A rotating hero is a different thing from a row. NN/g: people "often immediately scroll past" a rotating hero; use five frames or fewer, never auto-advance if avoidable, and consider a static hero. (https://www.nngroup.com/articles/designing-effective-carousels/)

**Where the leading apps fall short.** Netflix's home has "about 40 rows" of "up to 75 videos"; the eye tracking says most of that is never seen. Twelve minutes of deciding is the measured cost.

## 4. Perceived performance

### 4.1 Response times

- Under 0.1 s feels instant. Up to 1 s keeps the user's train of thought. Past 10 s attention is lost and a percent-done indicator is needed. Medium; these limits are decades old and widely replicated in practice. (https://www.nngroup.com/articles/response-times-3-important-limits/)
- For waits under a second show no indicator at all; a looping animation there is a distraction. Use a spinner for 2 to 10 s. (https://www.nngroup.com/articles/progress-indicators/)
- Design systems delay a spinner by 200 to 300 ms and then keep it for at least 400 ms so it does not flash (snippets; convention, not research). (https://docs.stripe.com/stripe-apps/patterns/loading.md)

### 4.2 Skeletons

**The evidence is weak and mixed.** This is a place where common practice has run ahead of proof.

- NN/g recommends content-shaped skeletons for full-page loads under 10 s and no indicator under 1 s. It is expert guidance citing one study whose results it does not report. (https://www.nngroup.com/articles/skeleton-screens/)
- Viget tested a blank screen, a spinner, and a skeleton on 136 people. The skeleton was perceived as the slowest (snippet; the page refused the fetch). (https://viget.com/articles/a-bone-to-pick-with-skeleton-screens)
- A smaller test found skeletons felt slightly shorter, and a left-to-right shimmer felt shorter than a pulse; its author says the sample was too small to conclude (snippet). (https://uxdesign.cc/what-you-should-know-about-skeleton-screens-a820c45a571a)
- The direction of motion in a loading indicator does change the perceived wait: a controlled study cut perceived duration by 11% (20 and 10 participants). (https://chrisharrison.net/projects/progressbars2/ProgressBarsHarrison.pdf)

What holds: do not flash anything for a fast load; shape the placeholder like the content so nothing jumps; if it shimmers, move left to right. What does not hold: "skeletons feel faster than spinners".

### 4.3 Images

- Reserve the image's space so nothing shifts. Google's threshold for a good page is a layout-shift score of 0.1 or less. (https://web.dev/articles/optimize-cls)
- Blurred placeholders are cheap: Facebook's fit in about 200 bytes and made profile loads about 30% faster on slow connections, which is a load-time result, not a perception study. (https://engineering.fb.com/2015/08/06/android/the-technology-behind-preview-photos/)
- No study was found showing that a blurred placeholder improves perceived speed, and progressive rendering tested as the least preferred option in one vendor study. (https://www.smashingmagazine.com/2018/02/progressive-image-loading-user-perceived-performance/)

### 4.4 Optimistic updates

No controlled research was found. The practitioner rule is to update at once for frequent, reversible actions that nearly always succeed, and to roll back visibly with an error when they fail (snippet; opinion). (https://dev.to/tiagodcosta/being-optimistic-in-ui-511k)

### 4.5 Time to first frame

**The strongest number in this document.**

- In 23 million views by 6.7 million viewers, viewers began abandoning a video after 2 seconds of startup delay, and each further second raised abandonment by 5.8%. A rebuffer lasting 1% of the video cut time watched by 5%. Strong. (https://people.cs.umass.edu/~ramesh/Site/HOME_files/imc208-krishnan.pdf)
- A vendor's data: each 0.25% more rebuffering raises abandonment by 33% (snippet). (https://data.mux.com/blog/video-analytics-series-part-1-rebuffering)
- The study's viewers were watching web video they had not paid for. A person at home with their own library is more patient, by how much is unknown. Two seconds is still the only measured reference.

**How it feels, beyond the number.** No measured source was found for what makes a start feel faster. The techniques vendors describe are fetching the first data before Play is pressed and showing the title's artwork while waiting (snippet). (https://www.fastly.com/blog/video-cache-prefetch-with-compute-edge)

## 5. The player

### 5.1 Control layout

**Best practice.** Transport in one place, the timeline across the width, track choices one step away, and nothing more than "a step or two" deep.

- tvOS: the transport bar holds tasks "like turning on subtitles or changing the audio language"; tabs for Info, Episodes, and Chapters sit below it. A Bluetooth keyboard's Space bar must play and pause. **"Avoid asking people if they want to resume playback"**: resume without a question. On exit, show the title's page with a resume option. (https://developer.apple.com/design/human-interface-guidelines/playing-video)
- Android TV: OK plays and pauses; one press left or right seeks a fixed step; **holding left or right scrubs**; up or down "peeks up controls but does not pause the video"; seeking keeps the play or pause state. (https://developer.android.com/training/tv/playback/controls)
- Fire TV: left and right are rewind and fast-forward, and Menu shows or hides the controls. (https://developer.amazon.com/sdk/asb/controller-guidelines.html)
- The BBC's design system: real buttons whose labels change with state, and a timeline that is a range input with a spoken value such as "0 minutes and 14 seconds". (https://bbc.github.io/gel/components/video-controls)

Strength: medium. Platform rules that agree.

### 5.2 When controls hide

**No evidence picks a delay.** The defaults in use are 3 and 5 seconds.

| Player | Hide delay | Source |
|---|---|---|
| Android Leanback (TV) | 3 s | https://raw.githubusercontent.com/androidx/androidx/androidx-main/leanback/leanback/src/main/res/values/integers.xml |
| Android Media3 | 5 s | https://raw.githubusercontent.com/androidx/media/release/libraries/ui/src/main/java/androidx/media3/ui/PlayerControlView.java |
| Jellyfin's web client | 3 s | `src/apps/legacy/controllers/playback/video/index.js` in https://github.com/jellyfin/jellyfin-web |
| tvOS, YouTube, Netflix | unverified | No official number found |

- Media3 keeps controls up for as long as playback is paused, idle, or ended.
- W3C's media requirements: a user can make the controls "stay on screen regardless of the author preference" (IC-4), and controls never cover captions, "even if… controls are only visible on demand" (VP-5). (https://www.w3.org/TR/media-accessibility-reqs/)
- WCAG 2.2.1 lets a user turn off or lengthen a time limit. Controls that return on any input are probably exempt; that is this document's reading, not W3C's words. (https://www.w3.org/WAI/WCAG22/Understanding/timing-adjustable.html)
- tvOS: do not respond to light touches during playback, because they are often accidental, and keep overlays short and translucent to avoid image retention.
- No source was found for when to hide the pointer. Unverified.

### 5.3 Scrubbing and thumbnail previews

**Best practice.** Show a frame for the position before the seek happens, and make the frame appear with no delay.

- In a lab task (12 participants) finding a scene took 3.2 s with an instant preview and 6.2 s with a 20 ms delay; at the delays of real streaming, seeking "can take up to 10 times longer". A low-resolution preview shown while scrubbing cut task time by up to 72%. Medium: controlled, small. (https://research.autodesk.com/app/uploads/2023/03/swift-reducing-the-effects.pdf_recyl7i6DIR9QBwN2.pdf)
- A follow-up (12 participants) found a grid of pre-loaded thumbnails up to 48% faster than YouTube's and Netflix's scrubbing of the time. (https://research.autodesk.com/app/uploads/2023/03/swifter-improved-online-video.pdf_rec46kl91LgCROmKf.pdf)
- Roku will not certify an app that lacks thumbnails while seeking in a video longer than 15 minutes. (https://developer.roku.com/dev/docs/trick-mode)
- **Apple TV's model:** pause, and a thumbnail appears above the timeline; move to scrub; **OK commits the new position and Back "returns to where you were"**. Holding left or right fast-forwards at 2×, 3×, then 4×. (https://support.apple.com/en-la/guide/tv/atvb7944597f/17.0/tvos)
- Without thumbnails, Android's TV player steps 1% of the duration per press.

The loves study rated previews "nice but not decisive" on usage evidence ([`streaming-ux-loves.md`](streaming-ux-loves.md), L19). The lab evidence here is about speed and accuracy, which is a different claim and a better-supported one.

### 5.4 Seek steps and keys

**No research on the best step was found.** Convention is 10 seconds, with a smaller step and a larger one nearby.

| Player | Arrow keys | Other steps | Source |
|---|---|---|---|
| YouTube | ±5 s | J and L ±10 s; 0 to 9 jump by tenths; `,` and `.` step a frame; `<` and `>` change speed; Ctrl+arrows change chapter | https://support.google.com/youtube/answer/7631406 |
| Netflix | ±10 s | S skips the intro; Enter or Space plays and pauses | https://help.netflix.com/en/node/24855 |
| Apple TV | ±10 s per press | Hold to fast-forward | Apple's guide, above |
| Jellyfin web | 10 s back, 30 s forward | Both configurable; `,` and `.` step a frame | `userSettings.js` in https://github.com/jellyfin/jellyfin-web |
| Android Media3 default | 5 s back, 15 s forward | n/a | `C.java` in https://github.com/androidx/media |
| Plex | About 10 s back, 30 s forward (snippet) | Users complain it cannot be changed | https://forums.plex.tv/t/web-client-30-second-skip-forward-and-10-second-skip-backwards/139748.md |

Shared across YouTube, Netflix, and Jellyfin: Space or K to play and pause, F for fullscreen, M to mute, Up and Down for volume. C for captions is YouTube's.

### 5.5 Audio and subtitle pickers

- **Remember the choice.** The US rule for caption settings requires a device to keep them "until changed by the user". (https://www.law.cornell.edu/cfr/text/47/79.103) Jellyfin's server remembers audio and subtitle selections per user by default. (https://raw.githubusercontent.com/jellyfin/jellyfin/master/MediaBrowser.Model/Configuration/UserConfiguration.cs) The gripes study found track memory to be real friction (§5, row 11).
- **Say what a track is.** Netflix's style guide treats "forced narratives" (on-screen text that matters to the plot) as their own kind of subtitle, which supports labelling forced tracks separately. No platform rule for track labels was found.
- **Make the controls findable.** Blind and low-vision respondents reported being unable to turn on audio description or reach the settings (snippet). (https://www.afb.org/Barriers-Digital-Inclusion-Survey/video) W3C: show that description is available and whether it is on (DV-1).
- An audit of five streaming apps on four devices found some ignore the device's own caption and motion settings (snippet). (https://www.neilsquire.ca/research-development/projects-activities/accessible-streaming-media-audit-results-report/)
- No controlled study of finding subtitle controls was found.

### 5.6 Subtitle legibility

**Use is high.** Netflix says nearly half of US viewing hours have subtitles on ([`streaming-ux-gripes.md`](streaming-ux-gripes.md) §5, row 11). In a survey of 1,000 US adults, 38% prefer them on in a language they know, and 63% of under-30s do. Half of those who avoid them find them distracting. (https://yougov.com/en-us/articles/45987-american-adults-under-30-watching-tv-subtitles) The BBC: most subtitle users "are not hard of hearing".

**The BBC's subtitle guidelines** (read; the most specific source found): (https://www.bbc.co.uk/accessibility/forproducts/guides/subtitles/)

- Line height 7 to 8% of the picture's height for 16:9.
- At most two lines; three is a hard ceiling.
- 37 characters a line on broadcast; 68% of the width online.
- White on a black box, drawn per line with no gap between lines, padded half a character each side.
- A wide, plain font.
- A viewer changing the size must not open gaps between lines.

**US law for devices** (47 CFR 79.103): the viewer can set text colour and opacity, size from 50% to 200%, font, background colour and opacity, and edge style (raised, depressed, uniform, drop shadow), can preview the result, and the device keeps it. (https://www.law.cornell.edu/cfr/text/47/79.103) Fluster is not a device under that rule; the list is the best available definition of "enough control".

**Netflix's authoring rules:** 42 characters a line, two lines, 20 characters a second for adults. (https://partnerhelp.netflixstudios.com/hc/en-us/articles/217350977-English-USA-Timed-Text-Style-Guide)

**A box or an outline?** No controlled study was found, and a W3C thread says the research is "mostly not done" (snippet). The BBC chooses a box. The US rule requires both to be offered.

Android TV's top quality tier asks for subtitle styles, audio description, and playback speed. (https://developer.android.com/docs/quality-guidelines/tv-app-quality)

### 5.7 Feedback, buffering, and the wait to start

- Every action gets a visible answer within 0.1 s (§4.1). No official specification of the brief on-screen confirmation that YouTube and others show was found. Unverified.
- Spinner: NN/g says only for waits past about a second. Apple: "if loading takes more than two seconds, consider showing a black loading screen with a centered activity spinner and no surrounding content", and show content at once with no intro (read in Apple's Human Interface Guidelines; which page was not recorded). Android's player shows no buffering indicator by default.
- Startup and rebuffering: §4.5. Two seconds, then 5.8% a second.
- 17.7% of 47 billion play attempts in one vendor's 2017 data failed or were abandoned before the first frame (snippet). (https://www.conviva.com/?p=892)

### 5.8 Errors in the player

- The NN/g rubric (§10.1) applies: human words, what to do, no blame, **and keep the user's work**. In a player the user's work is their position. That application is this document's reading.
- Fire TV's rules say so directly: after losing playback, start again and "seek back to the last known position" (snippet). (https://developer.amazon.com/docs/fire-tv/multimedia-app-requirements.html)

### 5.9 Skip intro, Up Next, and auto-play

- **Skip intro** is pressed 136 million times a day on Netflix. It began from seeing that members skipped forward by hand in the first five minutes about 15% of the time. Its design rule: appear "only when needed" and "work with a single click". (http://about.netflix.com/en/news/looking-back-on-the-origin-of-skip-intro-five-years-later) Apple's player shows such a button at the bottom trailing corner, only while the transport bar is hidden. (https://developer.apple.com/documentation/avkit/customizing-the-tvos-playback-experience)
- **Auto-play.** In a survey of 120 YouTube users, 87% of those who mentioned auto-play said it made them feel less in control; people with a goal in mind preferred the interface that left them in charge. (https://ar5iv.labs.arxiv.org/html/2101.11778) The gripes study's experiment found about half of those who had it switched off for them planned to turn it back on (§5, row 9). Together: wanted, when it can be seen and stopped.
- YouTube's end-of-video countdown has Cancel (snippet). No evidence was found for the length of a countdown.
- "Are you still watching?": only third-party descriptions were found. The gripes study rates it "loud; no data either way".

### 5.10 Accessibility in the player

- Everything works from the keyboard (WCAG 2.1.1; W3C media requirement IC-1). The criteria in this list are in https://www.w3.org/TR/WCAG22/.
- Audio longer than 3 seconds can be paused or its volume changed (1.4.2).
- Content that appears on hover or focus, such as a scrub preview, can be dismissed and does not vanish while pointed at (1.4.13).
- The timeline speaks a time, not a number of seconds (BBC, §5.1).
- Captions on by default if there is no captions control (BBC).

### 5.11 Where the leading players fall short

- Plex's uneven seek steps cannot be changed, and users ask for it.
- Netflix and YouTube do not publish their timings, so nobody outside can check them against anything.
- Jellyfin's clients leave track memory to the server's per-user setting, and it is a recurring complaint ([`streaming-ux-gripes.md`](streaming-ux-gripes.md) §2.11).
- Some apps ignore the device's caption and motion settings (snippet, above).
- No source was found for Disney+, Infuse, or Kodi player behaviour beyond third-party lists. Unverified.

## 6. Search

### 6.1 On the desktop

**Best practice.** A visible field, suggestions as you type, results that tolerate a mistake, and a no-results page that offers something.

- An open field beside the icon, not an icon alone, at least 27 characters wide; Enter and the icon both submit. Replacing a search link with a box raised search use by 91%. (https://www.nngroup.com/articles/magnifying-glass-icon/ and https://www.nngroup.com/articles/search-visible-and-simple/)
- **People do not retry.** Success was 51% on the first query, 32% on the second, and 18% on the third, and about half of those whose first search failed gave up. The mean query was two words. Medium. (https://www.nngroup.com/articles/search-visible-and-simple/)
- A placeholder is not a label: it disappears, has low contrast, and some screen readers skip it. (https://www.nngroup.com/articles/form-design-placeholders/)
- Suggestions (Baymard): at most about 10 on desktop; Up and Down move through them and wrap; the focused suggestion is copied into the field; the predicted part is emphasised, not the typed part. 80% of sites have suggestions and 19% get the details right. (https://baymard.com/blog/autocomplete-design)
- NN/g found users rarely clicked rich item suggestions and preferred the full list of results. (https://www.nngroup.com/articles/site-search-suggestions/) This cuts against jumping straight to an item from a suggestion, and for making the full results one keypress away.
- No results (Baymard): about half of sites handle it in ways that hurt. Offer an alternative query with a preview of its results, or apply the only plausible correction and say so. "Spelling tips alone are not enough." (https://baymard.com/blog/no-results-page)
- Apple: show recent searches before typing, and let people clear them. (https://developer.apple.com/design/human-interface-guidelines/searching)
- No authoritative figure for the delay before searching while typing was found; 100 to 300 ms is the convention (snippet). The `/` and Ctrl+K shortcuts have no research behind them: unverified as a standard.

**Where the leading apps fall short.** The gripes study covers search that answers with something else. In a personal library the equivalent failure is a misspelt title returning nothing, because Jellyfin's search matches text and the client adds no tolerance.

### 6.2 On a TV

**Best practice.** Avoid typing. When typing is unavoidable, show results after every letter and make each press count.

- Each D-pad press on an on-screen keyboard takes about half a second. Typing a two-word title on an alphabetical grid took 57 presses; a prediction ring cut that to 25. Across real titles the keyboard cost 4.5 presses a character. Strong. (https://research.google.com/pubs/archive/36239.pdf)
- Typing rates with remote-style input are 4 to 9 words a minute for new users. (https://hci.rwth-aachen.de/materials/conferences/CHI2004/1p639.pdf)
- No controlled comparison of QWERTY and alphabetical grids for a D-pad was found. tvOS uses a single line with its own remote and a grid with others. (https://developer.apple.com/design/human-interface-guidelines/virtual-keyboards)
- Android TV's quality rules ask for voice search beside the field. (https://developer.android.com/docs/quality-guidelines/tv-app-quality) The loves study found half of those who have voice search do not use it ([`streaming-ux-loves.md`](streaming-ux-loves.md), L30).
- Microsoft: open search with the keyboard already showing. NN/g: put numbers on the first keyboard page and offer recent searches.

What follows: on a TV, results should update on every letter, recent searches should be one press away, and a phone as the keyboard (P8-01) is worth more there than any keyboard layout.

## 7. Detail and episode pages

### 7.1 Seasons and episodes

- Tabs (NN/g): few, in one row, with one- or two-word labels and at least two signals for the selected one. Tabs that overflow into a scrolling strip hurt discovery. (https://www.nngroup.com/articles/tabs-used-right/)
- Dropdowns (NN/g): avoid long scrolling lists. (https://www.nngroup.com/articles/drop-down-menus/)
- **No research compares tabs with a dropdown for seasons.** Unverified either way. By the tab guidance, tabs suit a show with a few seasons and stop working for a show with twenty.
- No primary source was found for "read more" truncation, metadata density, or progress marks on cards. Unverified.
- Netflix ranks its Continue Watching row by time since viewing, where viewing stopped, and what else was watched since, and it does not always pin the row first. (https://gwern.net/doc/reinforcement-learning/exploration/2015-gomezuribe.pdf)

### 7.2 Spoilers

**The research conflicts.**

- One study (819 participants, twelve stories) found spoiled stories were enjoyed more (snippet). (https://www.psychologicalscience.org/news/releases/spoiler-alert-stories-are-not-spoiled-byspoilers.html)
- A later one (412 students) found "consistently negative" effects: less suspense and less fun (snippet). (https://www.sciencedaily.com/releases/2015/12/151210101816.htm)
- A follow-up found it depends on the person (snippet).

**How the leading apps do it.**

- Infuse: "Hide Spoilers: Blur descriptions and thumbnails of unwatched TV episodes", off by default. (https://support.firecore.com/hc/en-us/articles/360015608854)
- Plex added "Hide Spoilers" for episode thumbnails and summaries in 2025, after years of forum requests (snippet).
- Kodi has a setting to hide the plot and thumbnail of unwatched items (snippet).
- Jellyfin has none. The request has been open since 2019. (https://github.com/jellyfin/jellyfin-web/issues/273)
- Netflix, the Apple TV app, and Disney+: no setting found. Unverified.

What follows: some people care a great deal and some not at all, so this is a setting, and three personal-media apps have converged on one. No evidence says what the default should be.

## 8. Onboarding and sign-in

- **Skip the tour.** NN/g: tutorials at first launch do not improve task performance; teach in context instead. (https://www.nngroup.com/articles/mobile-app-onboarding/)
- A sign-in wall is acceptable for a service that is personal by nature, which a private server is. (https://www.nngroup.com/articles/login-walls/)
- **Let people see the password.** NN/g argues for it without data; Baymard rates a show-password control "Essential" (snippet). (https://www.nngroup.com/articles/stop-password-masking/ and https://baymard.com/guidelines/665-show-password-feature)
- WCAG 2.2's 3.3.8 (AA) forbids a sign-in that depends on memory or transcription unless there is help. Allowing paste and password managers satisfies it. Typing a code shown on another device is transcription; the criterion does not address TV code flows. (https://www.w3.org/WAI/WCAG22/Understanding/accessible-authentication-minimum.html)
- **On a TV, authenticate somewhere else.** Apple: "Prefer letting people use another device", and "People often abandon apps when they're forced to sign in". Android: "Entering usernames and passwords in this environment can be difficult", with a QR code scanned by a phone as the modern path, and a rule to keep returning users signed in. Roku: at most three screens. (https://developer.apple.com/design/human-interface-guidelines/managing-accounts, https://developer.android.com/identity/form-factors, https://developer.roku.com/dev/docs/signin-best-practices)
- NN/g's 2025 essay calls the lack of QR sign-in on some services "insane". An opinion. (https://www.nngroup.com/articles/physical-discs-streaming-experience/)
- Jellyfin's Quick Connect shows a six-character code on the new device, approved from a signed-in one. (https://jellyfin.org/docs/general/server/quick-connect) It runs the opposite way to a QR flow: the person reads a code off the screen and types it on the phone.
- Server discovery by broadcast fails across subnets, guest networks, and containers; typing the address is the reliable fallback (snippet).

## 9. Motion, reduced motion, and accessibility

### 9.1 Motion

- Most interface animation should take 100 to 500 ms; 200 to 300 ms for large changes; something seen often should be shorter. Rules of thumb, no experiments. (https://www.nngroup.com/articles/animation-duration/)
- tvOS asks for "subtle and fluid" animation and a focus that "gently highlights and expands". (https://developer.apple.com/design/human-interface-guidelines/designing-for-tvos)

### 9.2 Reduced motion

- With the system's reduce-motion setting on, **replace movement with a fade**; reduce zooming, scaling, and motion at the edge of vision. Do not auto-play video without controls, and consider one switch that turns auto-play off. (https://developer.apple.com/design/human-interface-guidelines/accessibility)
- WCAG 2.2.2 (A): moving content that starts by itself, lasts over 5 seconds, and sits beside other content needs a way to pause, stop, or hide it. "Starts by itself" includes starting on focus. (https://www.w3.org/WAI/WCAG22/Understanding/pause-stop-hide.html) By that reading a trailer that plays when a card takes focus needs a control.
- WCAG 2.3.3 (AAA): motion triggered by interaction can be turned off. (https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html)
- Shorten animations to near zero under reduced motion instead of removing them, so code waiting for them to end still runs. (https://web.dev/articles/prefers-reduced-motion)
- 35% of US adults over 40 showed balance dysfunction in one national survey (snippet). It measured posture, not sensitivity to screen motion, so it bounds the group loosely. (https://www.sciencedaily.com/releases/2009/05/090525173447.htm)
- Netflix let people turn previews off in February 2020, per profile, and on some devices the change needs a profile switch to take effect. (https://help.netflix.com/en/node/2102)

### 9.3 Accessibility beyond the minimum

- **WCAG 2.2's additions that bear on a media app:** focus not obscured (2.4.11), targets of at least 24 px (2.5.8; 44 px is the stricter 2.5.5), anything done by dragging also works with a single press (2.5.7), and help stays in the same place (3.2.6). (https://www.w3.org/WAI/standards-guidelines/wcag/new-in-22/) A scrubber is a dragging control, so 2.5.7 applies to it.
- **Contrast in dark themes.** The WCAG 2 formula overstates contrast between dark colours, according to the W3C group drafting its replacement (snippet). The replacement is not a standard. A dark app that just meets 4.5:1 for grey text on near-black may be harder to read than the number says. Non-normative. (https://www.w3.org/WAI/GL/task-forces/silver/wiki/Visual_Contrast_of_Text_Subgroup/Whitepaper)
- **Text over artwork.** Use a gradient or a panel, and test against the worst image, not a typical one. (https://www.nngroup.com/articles/text-over-images/)
- **Colour.** About 8% of men of Northern European descent have a colour-vision deficiency (snippet). State is never colour alone. (https://developer.apple.com/design/human-interface-guidelines/accessibility)
- **Text size.** Apple asks that text can enlarge to at least 200%. Android TV asks apps to respect the system font scale and reflow. (https://developer.android.com/training/tv/accessibility)
- **Screen readers on TV.** Fire TV asks that every item's spoken text include everything shown, with a hint for the row and a description of any panel that changes with focus. (https://developer.amazon.com/docs/fire-tv/implement-voiceview-accessibility-features-fire-os.html) Android TV cites a survey in which 65% of visually impaired viewers had trouble finding something to watch.
- **Media requirements** (W3C, 2015): the viewer controls caption font, size, colour, background, and edge; audio description is a switchable track; everything works from the keyboard; playback speed runs from 50% to 250% with pitch preserved. (https://www.w3.org/TR/media-accessibility-reqs/)
- Captions and audio description should be findable in a menu, not only from a remote button. (https://tetralogical.com/blog/2023/08/09/tv-best-practices/)

**Where the leading apps fall short.** Netflix reportedly uses its own screen reader on Fire TV in place of the system's, and VoiceOver users reported it stopped reading thumbnails in 2023 (snippets). No accessibility source was found for Plex, Infuse, Kodi, or any Jellyfin client: unverified.

## 10. Microcopy, errors, and settings

### 10.1 Error messages

NN/g scores an error message on twelve points in three groups. (https://www.nngroup.com/articles/error-messages-scoring-rubric/)

- **Visible:** near its source; marked by more than colour; no louder than the problem; not shown before the user has finished.
- **Clear:** in human words; short and exact; says what to do; never blames.
- **Efficient:** prevents the mistake where it can; keeps what the user entered; makes the fix cheap; explains how the thing works when that helps.

Also:

- Hide error codes unless they help someone diagnose; avoid "invalid", "illegal", and "incorrect"; no humour. (https://www.nngroup.com/articles/error-message-guidelines/)
- Apple: say how to fix it, no "oops", and avoid "we". (https://developer.apple.com/design/human-interface-guidelines/writing)
- An empty screen says why it is empty and gives one way forward, and never shows "nothing here" while loading. (https://www.nngroup.com/articles/empty-state-interface-design/)
- **Undo beats confirm.** Confirm only what is serious or cannot be reversed, because people learn to click through routine confirmations. Label the buttons with the outcome. (https://www.nngroup.com/articles/confirmation-dialog/ and https://alistapart.com/article/neveruseawarning/)

Strength: medium. The rubric is NN/g's synthesis of its testing, not one experiment.

### 10.2 Settings

- **Defaults are the design.** Fewer than 5% of several hundred Word users had changed any setting. The method was weak (people who emailed in their settings files). (https://archive.uie.com/brainsparks/2011/09/14/do-users-change-their-settings/) A search-ranking experiment and organ-donation defaults point the same way. (https://www.nngroup.com/articles/the-power-of-defaults/)
- A switch takes effect at once and never sits in a form with a Save button; its label describes the on state. (https://www.nngroup.com/articles/toggle-switch-guidelines/)
- Show common options first and put the rest one clearly labelled step away; never more than two levels. (https://www.nngroup.com/articles/progressive-disclosure/)
- No research on grouping settings was found. Unverified.

This agrees with `PRODUCT.md` pillar 3, "It just works": a setting is a place where the default failed someone.

## 11. What has no evidence

Stated so that nobody mistakes convention for proof.

- Whether skeletons feel faster than a spinner or a blank screen.
- Whether blurred image placeholders improve perceived speed.
- Any focus style on a TV being better than another.
- QWERTY against an alphabetical grid on a D-pad.
- Season tabs against a season dropdown.
- The best auto-hide delay for player controls.
- The best seek step.
- How long a countdown to the next episode should be.
- What the default should be for hiding spoilers.
- Any usability study of a personal-media client: Plex, Infuse, Kodi, Emby, or a Jellyfin client.

For each of these the dogfood week (P4-01) is better evidence for Fluster than anything found here, and the audit's protocol says what to watch for.
