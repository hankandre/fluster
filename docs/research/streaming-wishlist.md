# Streaming wish list: what viewers wish their video apps did

Researched 2026-11-12 for [`docs/plans/proposals/streaming-wishlist.md`](../plans/proposals/streaming-wishlist.md). The owner asked for it the same day: "look on forums and elsewhere for wish list items that people wish they had in their video watching apps, so that we can actually not only take features that exist today in different apps and hopefully improve upon them, but also look for new features that could put our app above and beyond."

It completes a trio with [`streaming-ux-gripes.md`](streaming-ux-gripes.md) (what people dislike) and [`streaming-ux-loves.md`](streaming-ux-loves.md) (what they praise and use). Those two are cited as **Gripes** and **Loves** and are not repeated here.

## Method and limits

- **The rule.** The owner's standing method is not to follow the loudest voices. For each wish this document asks: how many people want it and how strongly, whether a working version exists anywhere, and whether it would change which app people choose.
- **Four verdicts**, plus one for silence:
  - *Strong unmet need*: a survey with a sample size, or large vote counts in more than one community, and no app that does it well.
  - *Real but niche*: a steady, countable group asks for it; nothing shows the majority cares.
  - *Loud wish, little use*: visible demand, and the usage evidence points the other way or is absent after years of availability.
  - *Already solved elsewhere*: a working version exists; the wish is to have it here.
  - *Unproven*: no demand evidence was found either way. It is not a claim that nobody wants it.
- **Evidence strength** follows Loves: **strong** (a survey of 1,000 or more with its method stated, or a measured behaviour), **medium** (a vote board, a vendor's own numbers, a self-selected or sponsored poll), **weak** (forum threads, reviews, a vendor shipping something, a small study).
- **Votes are not use.** A vote board counts people who visit vote boards. Plex's votes are capped per user and are the cleanest count; Jellyfin's are open; Infuse's forum shows only likes summed over a thread; Emby's numbers below were parsed from HTML and are approximate.
- **Where the numbers came from.**
  - Jellyfin's tracker: `https://features.jellyfin.org/api/v1/posts?view=most-wanted&limit=300`, read 2026-11-12. Only the top 300 open posts are visible that way; the 300th has about 35 votes. "Not in the top 300" below means fewer votes than that, or no post. Each post is at `https://features.jellyfin.org/posts/<number>`.
  - Plex: the forum's public topic data (`https://forums.plex.tv/t/<id>.json`, field `vote_count`), read 2026-11-12. Each thread is at `https://forums.plex.tv/t/<id>`.
  - Infuse: `https://community.firecore.com/t/<id>.json` (`like_count`). Each thread is at `https://community.firecore.com/t/<id>`.
  - GitHub: thumbs-up counts on issues, read through the search API on 2026-11-12.
  - Server facts: the Jellyfin SDK typings in this repository (`@jellyfin/sdk` 1.0.2, `lib/generated-client/`), and Jellyscale's `compat/endpoints.yaml` and `docs/status.md` at `93a0f3f`, read only.
- **"(snippet)"** means the claim comes from a search-result summary; the page was not opened or refused the fetch. **"unverified"** means no source was found.
- **Not reached.**
  - Reddit: not read. No Reddit claim is here.
  - Kodi: the forum was not reached and the wiki refused the fetch (HTTP 403). Kodi's GitHub issues hold bug reports, not wishes. Every statement about Kodi is unverified.
  - App-store reviews, and the help communities of Netflix, Disney+, and Max: not reached.
  - Hacker News searches returned nothing usable.
  - GitHub's API quota ran out during the pass. Whether a closed issue was closed as done or as declined was not checked, so "closed" below never means "shipped".
- **Nothing was observed in a running app.** No competing client was installed.
- **A correction to the brief.** The brief names invariant I7 as the no-outside-services rule. In `ARCHITECTURE.md` I7 is "the browser engine is never a silent fallback". The rules applied here as "private, own server only" are `PRODUCT.md` principle 6 ("Private by default"), "Better than a streaming service" rules 5 and 6, and invariant I8 (only the gateway talks to the server).
- **"Fits?"** asks whether the wish makes sense for a private, video-only library with no outside service. **"Server"** says what Jellyfin offers and what Jellyscale has.

## 1. Summary

Ordered inside each area by evidence. Task ids are from `tasks/prd.json`.

| # | Wish | Verdict | Strength | Fits? | Fluster today |
|---|---|---|---|---|---|
| **Watching** | | | | | |
| W1 | Dialogue you can hear | Strong unmet need (the problem); use of any remedy unmeasured | Medium to strong | Yes, on the device | Backlog |
| W2 | Night mode: quiet scenes up, loud scenes down | Real but niche | Medium | Yes, on the device | Backlog |
| W3 | Captions for the bit you just missed | Already solved elsewhere (Apple TV); absent from personal-media apps | Weak (demand), strong (subtitle use) | Yes | None |
| W4 | Rewind a little on resume | Real but niche; solved elsewhere | Weak to medium | Yes | None |
| W5 | Two subtitle tracks at once | Real but niche | Medium | Yes | Backlog |
| W6 | Subtitle look, timing, and automatic sync | Already solved elsewhere | Medium | Yes | P5-05, P15-06 |
| W7 | Track choices that stick per series | Already solved elsewhere | Medium | Yes | P15-07 |
| W8 | Subtitles for files that have none | Real but niche | Weak | Server-side only | None |
| W9 | Dialogue-only subtitles | Unproven | Weak | Partly | None |
| W10 | Smooth motion, correct HDR, watchable dark scenes | Real but niche (one persona) | Medium | Yes | P5-01 to P5-04 |
| W11 | Skip steps you choose; end time shown | Real but niche | Medium | Yes | None |
| W12 | Volume above 100% | Real but niche | Weak to medium | Yes | None |
| **Series and binge flow** | | | | | |
| W13 | Spoiler-safe episode lists | Real but niche; 14 years unsolved in most apps | Medium | Yes | None |
| W14 | "Previously on", on demand | Unproven (a vendor's bet) | Weak | A library-only form does | Backlog (recap segments) |
| W15 | Episode order you choose; specials in place | Already solved elsewhere; a server matter | Medium | No (metadata) | None |
| W16 | Missing and upcoming episodes | Real but niche | Medium | No (needs outside data) | P16-02 covers new episodes that arrive |
| W17 | Rewatch without losing history | Unproven | None | Yes | None |
| W18 | "Still watching?" | Loud; no data (Gripes) | Medium | Partly | Backlog (Q16) |
| **Finding something in your own library** | | | | | |
| W19 | Help choosing tonight | Strong (the problem); every remedy unproven | Strong, weak | Yes | P16-04, P16-05 |
| W20 | Smart playlists and saved filters | Strong unmet need on Jellyfin; a server feature | Medium to strong | Partly | Backlog (playlists) |
| W21 | Search that forgives typos and reads tags | Real but niche | Medium | Server-side | P3-07, P16-06 |
| W22 | Hide a title | Real but niche | Medium | Yes | Backlog (D6 A) |
| **Household** | | | | | |
| W23 | Two accounts watching in the same room | Real but niche; unsolved everywhere | Medium | Yes | None |
| W24 | Watch together from different homes | Loud wish, little use (Loves L28); the largest vote count found | Medium | Possible | P8-02 |
| W25 | A lock per profile; a kids' mode | Real but niche | Medium | Yes | Backlog (Q11) |
| W26 | Guest use that leaves no trace | Real but niche | Weak to medium | Yes | Backlog ("private session") |
| **Accessibility** | | | | | |
| W27 | Audio description you can find and keep on | Real but niche; essential to those who need it | Medium (old survey) | Yes | None |
| W28 | Caption settings that are near, previewed, and kept | Real; a US rule requires it of devices | Weak (use) | Yes | P5-05 |
| W29 | A screen reader can drive the app | Unproven as demand; a basic need | Weak | Yes | Not audited |
| W30 | Plain, predictable layouts | Real (one commissioned study) | Medium | Yes | Fixed Home order (Q1 A) |
| W31 | Flashing-light dimming or warnings | Unproven | Weak | Research only | None |
| **Curation by the viewer** | | | | | |
| W32 | A watch list | Settled (Q10 A) | Medium | Yes | P15-01, P15-09 |
| W33 | Personal ratings | Real but niche | Medium | Jellyfin only | None |
| W34 | Notes, tags, "dropped" | Unproven | None | Yes | None |
| W35 | Remove from Continue Watching | Settled (Q4) | Medium | Yes | P16-02 |
| **Comfort** | | | | | |
| W36 | A sleep timer that ends with the episode | Real but niche | Weak | Yes | Backlog |
| W37 | Theme music, video backdrops, a screensaver | Real but niche | Weak | Against rule 7 unless opt-in | None |
| **Stats** | | | | | |
| W38 | A watch history and a year in review | Loud wish, little use | Medium (votes), none (use) | Only on the viewer's server | Backlog (D2 A) |
| **Remote and second screen** | | | | | |
| W39 | A phone as the remote | Settled (D4 B) | Strong (intent) | Yes | P8-01 |
| W40 | Send the picture to another screen | Real; bound to platforms | Medium | Not on the desktop | None |
| W41 | Who is in this scene | Real but niche | Weak | A cast list does; scene timing does not | P16-07 (pages only) |
| W42 | Picture-in-picture, screenshots, bookmarks | Real but niche | Weak | Yes | Backlog (PiP) |
| **Control** | | | | | |
| W43 | Settings that follow the account | Real | Medium | Yes | One set per computer (Q9 A) |
| W44 | Play the original; say what is happening | Fluster's core | Medium | Yes | Have |
| W45 | Versions and extras, clearly labelled | Already solved elsewhere | Medium to strong | Yes | P3-08 (done), P16-08 |
| W46 | Filter out profanity or scenes | Real but niche | Medium | No (needs outside data) | None |

The short reading: **the wishes with the most votes are mostly ones Fluster has already decided** (a watch list, clearing Continue Watching, watch together, playlists). **The best openings are quieter**: the problems with the broadest evidence and the fewest working answers are hearing the dialogue, catching the line you missed, and keeping a series page from spoiling the series. All three can be done on the device with nothing from outside.

## 2. The wishes

### 2.1 Watching itself

**W1. Dialogue you can hear.**
- *Who wants it.* A survey by a language-tutoring company (1,265 US respondents, self-selected, updated 30 September 2026): half usually watch with subtitles; 55% find dialogue harder to hear than it used to be, and 78% of those blame loud background music; about three-quarters of subtitle users cite muddled audio (https://preply.com/en/blog/americas-subtitles-use/). Netflix says nearly half of US viewing hours have subtitles on (Gripes §5, row 11). A UK poll found four in five viewers aged 18 to 24 use subtitles, and few of them are deaf (snippet) (https://www.stagetext.org/news/yougov-survey-supports-stagetexts-findings/). The vote boards are quieter: Plex "Global Audio Boost and Normalization" has 170 votes (#700726) and "Let me boost the voice channel!" 5 (#733741); Jellyfin's nearest post is "increase volume to more than 100%" with 126 (#150), and no dialogue post is in its top 300.
- *Who does it.* TVs, soundbars, Fire TV, and Apple TV have speech modes (Loves L32; no usage figures). In personal media, Plex shipped "Boost Dialog" in server 1.43.4: it needs a Plex Pass, and "enabling either of these options will cause the audio to be transcoded" (https://support.plex.tv/articles/audio-track-enhancements-for-video/). A November 2025 Infuse thread describes needing a 12 dB centre boost and finding no control for it (#58032). A Jellyfin developer's answer is to configure mpv by hand (snippet) (https://forum.jellyfin.org/t-volume-normalization).
- *Verdict.* **Strong unmet need for the problem.** The demand for a remedy inside the app is modest on vote boards, and nobody publishes how many people use a speech mode (Loves L32). The honest reading: many people cope with subtitles; a smaller group asks for an audio fix; the one personal-media answer is paid and converts on the server.
- *Fits?* Yes, and it fits Fluster's identity: the player can raise the centre channel or apply a speech filter on the device while the server still sends the original file. FFmpeg lists `dialoguenhance`, `speechnorm`, `dynaudnorm`, `loudnorm`, `acompressor`, and `pan` among its audio filters (https://ffmpeg.org/ffmpeg-filters.html), and mpv takes them through its `af` option (https://mpv.io/manual/stable/). How well each sounds, and what each costs, is **unverified**: nobody has tried them in Fluster. Two limits are known: a filter cannot touch audio that is passed through untouched to a receiver (P5-03), and it needs a typed player command (invariant I3).
- *Server.* None. A loudness figure per audio track would help W2; see there.

**W2. Night mode.** Quiet scenes up, explosions down, so the volume can stay put.
- *Who wants it.* Plex "dynamic audio range compression": 134 votes, open since 2012 (#21701). Infuse "Reduce Loud Sounds": 96 likes over 52 posts, open since 2019 (#17522). Jellyfin: not in the top 300.
- *Who does it.* Plex "Normalize Loudness" (the same article as W1): paid, converts the audio, and needs a prior analysis pass. Apple devices have "Reduce Loud Sounds" (snippet).
- *Verdict.* **Real but niche.** It is the same control as W1 for most people and should be designed with it.
- *Fits?* Yes, on the device, with the same limits as W1. A live compressor cannot look ahead as an analysed file can.
- *Server.* Optional: Jellyfin's item record has `NormalizationGain` (SDK `base-item-dto.d.ts`); whether it is filled for video is unverified. Jellyscale: nothing.

**W3. Captions for the bit you just missed.**
- *Who wants it.* Subtitles are on for about half of viewing hours, mostly for comprehension (W1). Explicit requests are few: one Infuse thread (#44867) and one Emby thread (snippet) (https://emby.media/community/topic/147330-enabling-of-subtitles-for-duration-of-rewind/).
- *Who does it.* Apple TV: when you skip back 10 seconds, "subtitles are turned on automatically", and a remote button shows them for the previous 10 to 30 seconds (https://support.apple.com/guide/tv/atvb7944597f/tvos). No personal-media client was found doing it: unverified beyond the two requests.
- *Verdict.* **Already solved elsewhere, absent here.** Weak demand evidence, strong evidence for the habit it serves.
- *Fits?* Yes. It is a player rule: after a short skip back, show the preferred subtitle track for the replayed stretch, then hide it again. It needs a subtitle track to exist.
- *Server.* None.

**W4. Rewind a little on resume.**
- *Who wants it.* Jellyfin "Rewind on Resume": 55 votes (#2667). Plex: 8 votes on a 2015 thread, since closed (#92051); a snippet says Plex shipped it in late 2023. Infuse: 11 likes, open (#55664).
- *Verdict.* **Real but niche; solved elsewhere.** Cheap.
- *Fits?* Yes. A rule in the client: resume a few seconds earlier, more after a long gap.
- *Server.* None.

**W5. Two subtitle tracks at once.**
- *Who wants it.* Language learners. GitHub thumbs-up: Jellyfin Desktop 47 (https://github.com/jellyfin/jellyfin-desktop/issues/482), Android TV 36 (https://github.com/jellyfin/jellyfin-androidtv/issues/4394), Wholphin 10. Infuse "Render multiple subtitles at once": 134 likes (#19588). In the survey under W1, about one in five use subtitles to learn a language.
- *Who does it.* jellyfin-web has a secondary track that works for plain-text subtitles only (snippet) (https://forum.jellyfin.org/t-adjusting-position-of-secondary-subtitle). mpv has `secondary-sid` (manual, above).
- *Verdict.* **Real but niche.** Unsolved in every native Jellyfin client found.
- *Fits?* Yes. Already in `tasks/backlog.md`; it needs a typed player command.

**W6, W7. Subtitle look, timing, and memory.** Plex "Automatic subtitle synchronisation" has 687 votes (#381054) and per-series subtitle control was built after 701 (#181400). Jellyfin: appearance 189 (#161), offset on Android TV 182 (#3036), a second preferred language 96 (#666), a default per show 76 (#1602). **Already solved elsewhere**, and planned: P5-05, P15-06, P15-07. Automatic sync is the unplanned part; a local method is unverified.

**W8. Subtitles for files that have none.** Jellyfin: "Auto-generate subtitles using whisper.cpp" 61 votes (#2143), on-demand subtitle search 68 (#3385). VLC demonstrated on-device generation in January 2025; release status unverified (snippet) (https://9to5mac.com/2025/01/10/vlc-ai-subtitles/). **Real but niche.** Searching a subtitle site is an outside service and does not fit. Generating them is batch work for a server's workers, on the operator's hardware.

**W9. Dialogue-only subtitles.** Netflix added a track without sound cues in April 2025 (Gripes §5). No vote or usage figure was found: **unproven**. A client could hide bracketed cues in a text track; that is untested.

**W10. Smooth motion, correct HDR, watchable dark scenes.** Covered by Loves L17 and planned in P5-01 to P5-04. Nothing new was found with numbers. **Real but niche.**

**W11. Skip steps you choose; end time shown.** Plex "customize the skip-back duration": 454 votes (#117240, closed; outcome unverified). Jellyfin double-tap seek: 109 (#131). End time: Infuse 98 likes (#18135); a Jellyfin post was completed with 29. **Real but niche.** Fits; client-only.

**W12. Volume above 100%.** Jellyfin, 126 votes (#150). mpv allows it. **Real but niche**; it is a symptom of W1 and W2.

### 2.2 Series and binge flow

**W13. Spoiler-safe episode lists.** Hide the thumbnail, the description, and sometimes the title of episodes you have not seen.
- *Who wants it.* Jellyfin "Avoid spoilers for unwatched items": 120 votes (#137). Plex "Hide plot for unwatched shows": 49 votes, opened September 2012 and still open (#21036); "disable auto-generated thumbnails (sports spoilers)": 118 votes, 113 posts (#110096). Emby has two threads (snippet) (https://emby.media/community/topic/48048-spoiler-plot-suppression-on-unwatched-items).
- *Who does it.* Infuse has "Hide Spoilers", which blurs descriptions and thumbnails of unwatched episodes (snippet) (https://support.firecore.com/hc/articles/360015608854-Settings-Overview); users ask for a black tile because the blur still shows shapes (8 likes, #41228), and it is one switch for every show. Kodi is said to have a setting: unverified. A paid third-party Jellyfin client advertises it (snippet) (https://jellywatch.app/doc/player/tv-anti-spoilers). Jellyfin's own clients and Plex: none found.
- *Verdict.* **Real but niche**, with unusual persistence: the same request across four products for fourteen years, and one partial answer.
- *Fits?* Fully. It is a display rule over data the client already has (Played per episode). The care is in the details: the Up Next card, search results, the Home hero, and the player's episode title all leak if missed.
- *Server.* None.

**W14. "Previously on", on demand.** A way back into a series after weeks away.
- *Who wants it.* No post in Jellyfin's top 300 and none found on Plex. The evidence is what a vendor built: Amazon's text recaps (2024) and generated video recaps for a few of its own series in the US (November 2025) (snippet) (https://www.aboutamazon.com/news/entertainment/ai-plot-summary-video-recaps-prime-video). No usage figure and no study of recaps was found.
- *Verdict.* **Unproven.** A vendor's bet, not a measured wish.
- *Fits?* A generated recap needs a model; under `PRODUCT.md` principle 6 that means the operator's own hardware (discovery proposal §3.1, stage 3). A plain form needs nothing new: the series page already knows the last episode watched and when, and can show that episode's own description and offer to replay its last minutes. Where a file carries a Recap segment, the player could offer to play it after a long gap and skip it otherwise.
- *Server.* Jellyfin's segment types include `Recap` (SDK `media-segment-type.d.ts`). Jellyscale: media segments are "not built" (`docs/status.md`).

**W15. Episode order you choose.** Plex "alternate episode order": 502 votes, built for one provider (#537737). Infuse: 212 likes. Jellyfin: 56 and 39. **Solved elsewhere** and a matter for the server's metadata, not for a client.

**W16. Missing and upcoming episodes.** Jellyfin "Show missing episodes": 347 votes, started (#572). Plex: 328 (#77834). New-episode notices: 50 (#74). Knowing what exists beyond the library needs an outside source, so it **does not fit**. What does fit is already planned: a new episode brings a caught-up series back to the first row (P16-02), and the backlog has "marks on cards for what is new".

**W17. Rewatch without losing history.** Nothing found: **unproven**. Jellyfin keeps `PlayCount` and one `LastPlayedDate` per title (SDK `user-item-data-dto.d.ts`).

**W18. "Still watching?"** Jellyfin has an open post with 111 votes (#3439) and a completed one with 496 (#814); which client gained it was not checked. The owner's answer (product review Q16 A) is "not now", and Gripes found no data either way. See W36: a sleep timer is the form of this the viewer controls.

### 2.3 Finding something in your own library

**W19. Help choosing tonight.**
- *Who wants it.* The problem is the best measured in the trio: 14 minutes a session looking, 19% giving up (Gripes §2.2). The wishes for remedies are small: Jellyfin "genres and recommendations on Home" 88 votes (#3501), "local recommendation engine" 86 (#2737); Plex "Recommend server content" 252 (#87784). No request for a runtime filter, a mood picker, or a random pick is in Jellyfin's top 300.
- *Who does it.* Netflix withdrew its "Play Something" button for lack of use (Loves L29). One recommender experiment found that viewers given a simple control over their recommendations rated the adjusted lists as more helpful; the write-up gives no figures (https://grouplens.org/blog/putting-users-in-control-of-their-recommendations).
- *Verdict.* **Strong for the problem; every remedy is unproven.** The absence from vote boards is itself evidence: people do not ask for pickers.
- *Fits?* A question a personal library can answer and a service has no reason to: "what fits the time I have". Runtime is in the metadata. Whether anyone would use it is unknown.
- *Server.* Jellyfin sorts by `Runtime` and `Random` (SDK `item-sort-by.d.ts`); its item query has no runtime range (the SDK's minimum and maximum parameters cover rating, date, and size only). Jellyscale implements `GET /Items`; which sorts it honours is unverified.

**W20. Smart playlists and saved filters.** Jellyfin "Dynamic (Smart) Playlists": 588 votes, planned (#49); smart collections 104 and 35. Plex "Better Playlists": 1,425 votes, open since 2014 (#73590); "Playlists: remember position": 241 (#84866). Emby "Smart Playlists/Views": about 176 reactions (parsed). **Strong unmet need on Jellyfin**, and a server feature: a client cannot add it. The client-side cousin is a library filter that is remembered, which `tasks/backlog.md` already lists. Jellyscale: collections and playlists are "not built".

**W21. Search that forgives.** Jellyfin: search by tag or genre 258 (#276), fuzzy search 91 (#3703). **Real but niche**; the matching is the server's. P16-06 adds a genre filter.

**W22. Hide a title.** Jellyfin: 131 votes (#1072) and 36 (#116). **Real but niche.** The owner chose to wait for the server-side profile (Loves D6 A).

### 2.4 Household

**W23. Two accounts watching in the same room.** A couple watch an episode on one screen; only the signed-in account gets the progress, and the other finds it unwatched.
- *Who wants it.* Jellyfin "watch together (watch with multiples accounts)": 164 votes (#389). Plex "Allow Multiple Users to Viewing Session": 25 votes, opened January 2016, still open (#131160), with several closed duplicates. No survey was found on how much household viewing is shared: unverified.
- *Who does it.* No app found. Workarounds are a shared "us" account, which defeats per-person history, and third-party scripts.
- *Verdict.* **Real but niche; unsolved everywhere.** Medium evidence, and a problem Fluster is already close to: it will show "Who's watching?" when two accounts are signed in (product review Q5).
- *Fits?* Yes. Nothing leaves the server. It touches "Your account is yours": the second person must be signed in on this device and choose to join, and nothing may be written to an account that has not.
- *Server.* Jellyfin has `POST` and `DELETE /Sessions/{sessionId}/User/{userId}` ("add user to session"; SDK `session-api`). Whether progress and Played then reach the added account on 10.11 and 12.x is **unverified**. The plain alternative is two calls: mark the episode played for each signed-in account (`POST /UserPlayedItems/{itemId}`, implemented on Jellyscale). The session routes are not in Jellyscale's `compat/endpoints.yaml`.

**W24. Watch together from different homes.** The largest count in this pass: Plex "Add Watch Together to New Plex Experience", 2,906 votes since February 2025 (#906941), and 603 for more than one episode (#644669). Jellyfin: invite link 270 (#971), chat 105; thumbs-up on client issues 65, 31, 29, 13. Infuse: 135 likes (#32307). Loves L28 judged it **loud praise, little use**: no service publishes use, and one large service withdrew it. The Plex count is a protest at a removal, which shows that those who used it miss it, not how many did. P8-02 stays where it is; see the proposal §3.

**W25. A lock per profile; a kids' mode.** Jellyfin: child mode 77, profile PIN 62, library PIN 60; Android TV issue 53 thumbs-up. **Real but niche.** Settled: with the TV shell (Q11 D).

**W26. Guest use.** Jellyfin "Anonymous, guest access": 88 votes (#1313); "Mark Device as Shared": 39. **Real but niche.** The backlog has "a private session that plays without reporting".

### 2.5 Accessibility

**W27. Audio description you can find and keep on.**
- *Who wants it.* A 2016 survey for the American Council of the Blind (483 respondents): on a 7-point scale, satisfaction with the amount of description averaged 2.29 for television and 2.84 for streaming apps; 86% could turn description on by themselves in the apps they used; there was no way to search for described titles (https://ar5iv.labs.arxiv.org/html/1809.05585). The survey is ten years old and services have added sections since. No post is in Jellyfin's top 300.
- *Who does it.* Services list described titles. In personal media nothing was found: unverified.
- *Verdict.* **Real but niche**, and decisive for those who need it (Loves §2.10).
- *Fits?* Yes, when the file carries a description track: label it as such, and offer "prefer audio description" beside the audio language setting.
- *Server.* Jellyfin's stream record has `IsHearingImpaired` for subtitles and no field for audio description (SDK `media-stream.d.ts`); a client can only read the track's title. A flag from the file's own stream markers would be an additive request to Jellyscale.

**W28. Caption settings that are near, previewed, and kept.** A US rule in force since September 2024 judges caption settings by proximity, discoverability, previewability, and persistence (snippet) (https://www.wiley.law/alert-Readily-Accessible-Closed-Captioning-Requirements-Take-Effect-on-September-16-2024). Whether it binds a desktop app is unverified; it is a good checklist regardless. P5-05 plans styling. A live preview and reaching it from the player are not in its acceptance.

**W29. A screen reader can drive the app.** No audit with numbers was found for any streaming app, and no vote. Fluster's interface is HTML in a WebView, which can expose roles and names; whether Orca reads it under WebKitGTK has not been tried: unverified.

**W30. Plain, predictable layouts.** A study commissioned by the UK regulator with viewers aged 65 and over found that simple design changes cut usability barriers by almost half; the barriers were cluttered home screens, inconsistent menus, sign-in, and remotes (https://dtg.org.uk/2025/09/18/simple-design-changes-cut-streaming-tv-usability-barriers-in-half-for-older-viewers). It agrees with the fixed Home order (Q1 A).

**W31. Flashing lights.** Apple dims flashing on the device; services warn (snippets). No personal-media app does either, and detecting it in Fluster is unexplored. **Unproven**; a research item at most.

### 2.6 Curation by the viewer

- **W32. A watch list**: 1,306 votes (#576). Settled: Favorites is the watch list (Q10 A), with a Home row (P15-09). A 39-vote post asks for a list of titles not in the library (#599), which needs an outside source and does not fit.
- **W33. Personal ratings**: 461 votes, planned by Jellyfin (#1134). Loves L26 found no evidence that viewers value rating, and Jellyscale answers 404 for ratings by decision. **Real but niche.**
- **W34. Notes, tags, "dropped".** One Plex post with no votes. **Unproven.**
- **W35. Remove from Continue Watching**: 1,740 votes (#517), still "planned"; a newer post asking for a button was declined (#4116). Emby completed "Forget a series in Next Up" (about 135 reactions, parsed). Settled: items age out (Q4).

### 2.7 Comfort

**W36. A sleep timer that ends with the episode.**
- *Who wants it.* Plex: 7 votes on a thread open since 2014 (#72669). Jellyfin's Android app: 23 thumbs-up (https://github.com/jellyfin/jellyfin-android/issues/632). Not in Jellyfin's top 300. YouTube added one in 2024 without numbers (Loves L32).
- *Verdict.* **Real but niche.** Weak evidence; small cost.
- *Fits?* Yes. "Stop after this episode" is the form that suits a series, and on stop Fluster already reports the position and ends any server conversion. It also answers "Still watching?" (W18) with a control the viewer sets, not a prompt the app imposes.
- *Server.* None.

**W37. Theme music, video backdrops, a screensaver.** Jellyfin: theme-song volume 104, fade-in 57; an OLED screensaver was completed with 42. **Real but niche**, and "nothing plays by itself unless you turn it on" applies (rule 7).

### 2.8 Stats

**W38. A watch history and a year in review.** Jellyfin "Watched History": 835 votes (#633); "Server/User usage statistics": 36. Plex publishes a yearly "Rewind" for paying members (snippet) (https://www.plex.tv/blog/2025-plex-rewind/), and community tools build the same from server logs (https://github.com/aunefyren/wrapperr). No figure for how many people open any of them was found. **Loud wish, little use** on today's evidence. The owner chose no history for now (Loves D2 A). Jellyfin keeps one last-played date per title, so a true year in review needs dated plays, which is a server record.

### 2.9 Remote and second screen

- **W39. A phone as the remote.** Settled: P8-01 moved to the TV shell (Loves D4 B).
- **W40. Send the picture to another screen.** IINA: AirPlay 529 thumbs-up (https://github.com/iina/iina/issues/63), Chromecast 307 (https://github.com/iina/iina/issues/126). Jellyfin: Chromecast on iOS 105. **Real**, but it belongs to phones and to the platforms' own protocols. Not for the desktop client.
- **W41. Who is in this scene.** Jellyfin "On-screen actor information during playback": 39 votes (#2545). Infuse "View Cast and Crew during playback": 14 likes (#41919). **Real but niche.** Knowing who is on screen at a given moment needs timed data no personal library has. A cast list on the paused player needs nothing new.
- **W42. Picture-in-picture, screenshots, bookmarks.** Thumbs-up of 14, 20, and 51 on desktop players. **Real but niche.**

### 2.10 Control

**W43. Settings that follow the account.** Jellyfin "Global defaults (clients)": 260 votes (#469); "Easy import/export of settings" was completed with 899. **Real.** Jellyfin and Jellyscale both implement `DisplayPreferences`, a per-account record with a free `CustomPrefs` map. The owner chose one set of settings per computer (Q9 A); see the proposal §3.

**W44. Play the original; say what is happening.** Plex "Disable 4K transcoding": 249 votes; "Display Atmos, DTS:X correctly": 701; Jellyfin "force direct play" 49 thumbs-up and "stats for nerds" 219. This is what Fluster is built on (Loves L5, L18).

**W45. Versions and extras, labelled.** Plex multiple cuts: 1,459 votes, built; "More info in Play Version": 266, open. Jellyfin: 266, 146, 105. Infuse extras: 664 likes; Plex TV extras: 434. Done or planned: P3-08, P16-08.

**W46. Filter profanity or scenes.** Plex: 148 votes, 407 likes (#182952). Jellyfin EDL support: 96. It needs per-title cut lists from outside. **Does not fit.**

## 3. What the weighing shows

1. **The biggest numbers are settled or are the server's.** Of the ten most-voted wishes found (table below), Fluster has decided four, three are server features, and two are planned. That is a sign the earlier passes read the same boards correctly, not a gap.
2. **Surveys and vote boards disagree about audio.** The survey evidence says most subtitle use is a workaround for dialogue; the boards barely mention an audio fix. People ask for what they have seen. That is the best argument for W1 and also its risk: no one has shown that viewers use a speech mode when given one.
3. **The persistent small requests are the unsolved ones.** Spoiler safety (2012 onward), two accounts in one room (2016 onward), and night mode (2012 onward) have modest votes and no good answer in any personal-media app. Persistence without resolution is weaker than a survey and stronger than a spike of votes.
4. **Nobody asks for pickers, recaps, or a year in review on Jellyfin's board.** Each has a vendor behind it and no measured use.
5. **Accessibility has need without votes.** People who cannot use an app do not vote on its board.
6. **Several wishes need outside data and do not fit**: missing episodes, alternate orders, profanity filters, a wish list beyond the library, subtitle search, scene-timed cast.

### The ten most-wanted, by count

| Wish | Best count | Verdict | Where Fluster stands |
|---|---|---|---|
| Watch together (remote) | 2,906 votes (Plex) | Loud wish, little use | P8-02, in M5 |
| Remove from Continue Watching | 1,740 (Jellyfin) | Settled | P16-02 ages items out |
| Better and smart playlists | 1,425 (Plex), 588 (Jellyfin) | Strong unmet need; server feature | Backlog |
| A watch list | 1,306 (Jellyfin) | Settled | P15-01, P15-09 |
| Hearing the dialogue | 1,265-person survey; 170 votes (Plex) | Strong unmet need (problem) | Backlog; **proposal D1** |
| A watch history | 835 (Jellyfin) | Loud wish, little use | Not for now (D2 A) |
| Subtitle control (per series, sync, look) | 701 and 687 (Plex) | Already solved elsewhere | P15-07, P15-06, P5-05 |
| Skip control (auto-skip, step length) | 483 and 454 (Plex) | Already solved elsewhere | P3-24; step length unplanned |
| Personal ratings | 461 (Jellyfin) | Real but niche | None |
| Spoiler-safe episodes | 120 (Jellyfin), 118 and 49 (Plex) | Real but niche; unsolved | None; **proposal D3** |

## 4. Fluster could lead here

Ranked by evidence first and fit second. "Lead" means no personal-media client found does it well and Fluster's design makes it natural. None is a task yet; each is a decision in the proposal.

| Rank | Idea | Evidence | Why Fluster | Cost and risk |
|---|---|---|---|---|
| 1 | **Hear every line, with the original file.** A "Clear voices" control and a night mode, applied on the device. (W1, W2, W12) | Problem: medium to strong (a 1,265-person survey, Netflix's subtitle share). Demand for the remedy: medium (170, 134 votes; 96 likes). Use: none measured. | The one shipped answer in personal media is paid and makes the server convert. Fluster decodes locally, so the server stays idle and the file stays untouched. | A native spike, then a typed player command. Does not apply with passthrough. Sound quality untested. |
| 2 | **"What did they say?"** Skip back and the captions appear for the replayed stretch; resume starts a few seconds early. (W3, W4) | Habit: strong (half of hours with subtitles). Demand: weak (a few threads; 55 votes for rewind). One vendor ships it. | A player rule on data already present. No personal-media client found has the caption half. | Small. Needs a subtitle track to exist. |
| 3 | **A series page that cannot spoil the series.** Unwatched episodes hide the still, the description, and optionally the title, everywhere they appear. (W13) | Medium: 120, 118, and 49 votes; four products; since 2012. One partial answer (a blur). | A display rule; Fluster controls every surface. Doing it completely is the improvement. | Small to medium. Every surface must be covered or it fails. |
| 4 | **Two people, one screen, both up to date.** Add a second signed-in account to what is playing. (W23) | Medium: 164 and 25 votes; open since 2016; no app does it. | Fluster already holds several signed-in accounts and asks "Who's watching?". | Needs a server check first. Touches "Your account is yours". |
| 5 | **Described and captioned by default for those who need it.** Label description tracks, prefer them on request, preview caption styles from the player. (W27, W28) | Medium for need (a 483-person survey, 2016); no votes. | Costs little; decisive for a few; no personal-media client found does it. | Small. Depends on how files label tracks. |
| 6 | **Stop when this episode ends.** A sleep timer in episode units. (W36, W18) | Weak: 23 thumbs-up, 7 votes. | Ends the session cleanly and stops any server job. Replaces a prompt with a choice. | Small. |
| 7 | **"I have 90 minutes."** A runtime choice when browsing films. (W19) | Problem: strong. This remedy: none. | The library knows every runtime; a service has no reason to offer it. | Small, and may go unused. |
| 8 | **Where you left off.** After a long gap, the series page says which episode you last saw and when, and offers its ending or the file's own recap. (W14) | Weak: a vendor's bet. | Works from the library alone; a generated recap can come later on the operator's hardware. | Small for the plain form. |
| 9 | **Who is in this.** The cast on the paused player. (W41) | Weak: 39 votes, 14 likes. | Data already fetched for the title's page. | Small. |

Ideas 1 to 3 have the best case. Ideas 7 to 9 are cheap guesses and are marked as such.

## 5. Already planned, by task

| Wish | Task |
|---|---|
| W6 subtitle look and timing | P5-05, P15-06 |
| W7 track memory per series | P15-07 |
| W10 HDR, passthrough, refresh rate | P5-01 to P5-04 |
| W16 a new episode returns a series to the first row | P16-02 |
| W18 "Still watching?" | Backlog (Q16 A) |
| W19 suggestions after finishing | P16-04, P16-05 |
| W21 genre filter | P16-06 |
| W24 watch together | P8-02 |
| W25 profile lock | Backlog, with the TV shell (Q11 D) |
| W32 watch list | P15-01, P15-09 |
| W35 Continue Watching clutter | P16-02 |
| W39 phone as remote | P8-01 |
| W41 cast and people pages | P15-03, P16-07 |
| W44 honest playback facts | P3-18 (done), P13-23 |
| W45 versions and extras | P3-08 (done), P16-08 |
| W5 dual subtitles; W1, W2 audio options; W36 sleep timer; W42 picture-in-picture; W20 playlists; W22 dismiss | `tasks/backlog.md` |
