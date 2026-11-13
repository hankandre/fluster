# Streaming UX loves: what viewers praise, use, and choose apps for

Researched 2026-11-12 for [`docs/plans/proposals/streaming-loves.md`](../plans/proposals/streaming-loves.md). The owner asked for it the same day: "it might be worth having Fable also doing some research into what users love about Netflix or any streaming service, what features they like. If they make statements about, hey, I really like this streaming application because of this feature, or any evidence of users preferring features they see in other applications over another one, we should evaluate that evidence, look for research on that evidence, and then determine if that's something that we should adopt."

It is the companion to [`streaming-ux-gripes.md`](streaming-ux-gripes.md) and uses the same weighing rule, turned around: praise is not use.

## Method and limits

- **The rule.** The owner's method for the gripes study was "we shouldn't just follow the loudest malcontents". The same goes for praise. For each loved feature this document asks two separate questions: do people say they love it, and do people use it or choose an app because of it.
- **Four verdicts.**
  - *Drives choice*: a survey with a sample size, a measured effect, or paid adoption shows that people pick, keep, or leave an app over it.
  - *Used and liked*: measured or reported heavy use, but nothing shows it decides which app people choose.
  - *Nice but not decisive*: liked by those who use it; use is a minority, or no usage data exists.
  - *Loud praise, little use*: visible enthusiasm, and the usage evidence points the other way.
- **Evidence strength** is marked **strong** (a survey of 1,000 or more with its method stated, or a measured behaviour), **medium** (a vendor's own numbers, a vote board, an app-store rating count, or a self-selected poll), or **weak** (reviews, forum posts, a vendor-sponsored survey of intentions, or nothing).
- **Stated intent is not use.** "I would use this" figures run far above measured use wherever both exist (downloads, §2.5; voice search, §2.6). They are reported as intent.
- **"(snippet)"** means the claim comes from a search-result summary; the page was not opened, or it refused the fetch. **"unverified"** means no source was found.
- **How pages were read.** One source was read in full by this pass: the Hub and CTAM deck (below), from its PDF text. The other pages marked as opened were opened by research subagents through a fetch tool that summarises the page, so their quotes are as that tool returned them.
- **Not reached.** Reddit was not read; no Reddit claim is in this document. App-store review text was not analysed: only the rating counts from Apple's public lookup API and the reviews Apple features on the page. streamtvinsider.com and newscaststudio.com returned 403; variety.com's paywalled research was blocked; the GfK page on downloads returned 404; Akamai's press page returned no text. No Nielsen Norman Group or Baymard study of streaming detail pages, season pickers, or 10-foot navigation was found. No Deloitte, Parks Associates, or TiVo figure newer than those cited was found for any feature.
- **Nothing here was observed in a running app.** No service or competing client was installed or used.
- **The main survey.** Hub Entertainment Research and CTAM, "Value by Design" (2026): 24 interviews and 3,000 online interviews of US viewers aged 13 to 64 (the age range is from CTAM's release: https://www.ctam.com/new-research-from-ctam-and-hub-highlights-the-cost-of-bad-user-experience-ux/). It tested 20 problems and 13 proposed features, and for each feature asked five things: love it, would "absolutely" use it, more valuable, would make the app "home base", and more likely to keep the subscription. The deck is at https://www.ctam.com/wp-content/uploads/CIM26-study-Hub-CTAM-JonGiegengack-Value-By-Design-presentation.pdf and is cited below as **Hub 2026**. Two cautions: every figure is a stated answer about a described feature, not behaviour; and the deck gives the problem ratings only as a chart, so no per-problem percentages exist here.
- **"Applies?"** asks whether the feature makes sense in a personal library and a video-only client. **"API"** names what Jellyfin offers and what Jellyscale's `compat/endpoints.yaml` and `docs/status.md` said at `93a0f3f` (read 2026-11-12).

## 1. Summary

Ordered by the strength of the evidence that people use the feature or choose by it. Task ids are from `tasks/prd.json`.

| # | Loved feature | Verdict | Strength | Applies to Fluster? | Fluster today |
|---|---|---|---|---|---|
| L1 | What you were watching, pinned first | Drives choice | Strong | Yes | Have; P16-02 |
| L2 | It starts fast and does not stall or crash | Drives choice | Strong | Yes | Partly measured; **P3-28 added** |
| L3 | It remembers the exact place, and keeps you signed in | Drives choice | Strong (survey), no per-item figure | Yes | P1-10 done; P3-02, P3-21 |
| L4 | Saved titles (a watch list), easy to find | Used and liked; most saved titles go unwatched | Strong (intent), weak (use) | Yes, through Favorites | P15-01 (nav only); **decision D1** |
| L5 | Plays the file as it is, with no conversion | Drives choice among personal-media users | Medium | Yes: the core | Have |
| L6 | Skip intro | Used and liked; sold as a paid feature | Medium to strong | Yes, when the server has segments | Have; P3-24 |
| L7 | Subtitles, and track choices that stick | Used and liked | Strong (use) | Yes | P3-13 done; P15-07, P5-05 |
| L8 | Next episode plays after a countdown | Used and liked | Medium | Yes | Have; P3-23 |
| L9 | Suggestions that follow what you finish | Used and liked | Strong (intent) | Yes, without a crowd | P16-04, P16-05 |
| L10 | A phone as the TV's remote and keyboard | Used and liked (intent only) | Strong (intent), no use data | With the TV shell | P8-01; **decision D4** |
| L11 | Polished, consistent apps | Used and liked; a reason people stay on Plex | Medium | Yes | Design system (P13) |
| L12 | Hide rows you do not use | Used and liked (intent) | Strong (intent) | Yes | Backlog (owner chose a fixed order) |
| L13 | Rows that group similar titles | Used and liked (intent) | Medium | Yes | P16-06; genre rows in backlog |
| L14 | Trailers on the title's page | Used and liked | Strong for services | Only with local trailers | P16-08 |
| L15 | Signing in on a TV without typing | Used and liked | Medium | Yes | P3-04 done; P15-05 |
| L16 | Offline downloads | Loved on phones; little evidence elsewhere | Medium (votes), mixed (use) | Not on the desktop; yes on a phone | P8-03 |
| L17 | HDR, Dolby Vision, lossless audio passthrough | Drives choice for a small group; not for most | Medium | Yes, for one persona | P5-02 to P5-04 |
| L18 | Honest labels for what the file is and how it plays | Nice but not decisive | Medium (votes) | Yes | Have; P13-23 |
| L19 | Scrubbing thumbnails, 10-second skip | Nice but not decisive | Weak (lab study only) | Yes | Have |
| L20 | Playback speed | Nice but not decisive on a TV | Strong | Yes, as a minority feature | P15-06 |
| L21 | Ratings and reviews beside the title | Nice but not decisive | Strong (intent) | Yes, from the server only | P15-03 |
| L22 | "Why was this recommended?" | Nice but not decisive | Strong (intent) | Yes | P16-05 names its anchor |
| L23 | A watch history | Nice but not decisive | Medium (votes) | Yes | None; **decision D2** |
| L24 | Custom lists and boards | Nice but not decisive | Strong (intent) | Collections exist | Playlists in backlog |
| L25 | Profiles and kids' controls | Used; nothing shows they drive choice | Weak | Yes, through server accounts | P13-21, P13-27 |
| L26 | Thumbs and "two thumbs up" | Nice but not decisive | Medium | Weakly; Jellyscale has no ratings | None |
| L27 | Top 10 and popularity lists | Liked on services; not applicable | Medium (intent) | No: a household has no crowd | None |
| L28 | Watch together | Loud praise, little use | Medium | Possible; not a reason to choose | P8-02 |
| L29 | "Play something" shuffle | Loud praise, little use | Medium | No | None |
| L30 | Voice search | Loud praise, little use | Medium (old) | TV shell only | None |
| L31 | Chat, sharing, and communities in the app | Loud praise, little use | Strong | No | None |
| L32 | Picture-in-picture, sleep timer, dialogue boost, X-Ray | No data | None | Possible | None |

The short reading: **the features with the best evidence are the plain ones**: the app opens fast on what you were watching, remembers where you were, keeps you signed in, and plays without stalling. Most of what streaming services advertise sits in the lower half.

## 2. The features

### 2.1 Onboarding, sign-in, and profiles

**L3 (part). Staying signed in.**
- *Love.* Hub 2026 tested "I get logged out of the TV streaming service or app unexpectedly" and "TV apps make it hard to log back and often require resetting passwords, getting a code, etc." Both sit in its "App performance" group, the group it describes as rare but with "a big impact".
- *Use and choice.* 39% of viewers aged 13 to 24 "say that difficult logins make them use a TV service less often", against 25% of older viewers (Hub 2026).
- *Verdict.* Drives choice, as an absence: people use a service less when it is hard to get back in.
- *Applies?* Yes. Fluster signs out when the window closes today.
- *API.* None beyond sign-in. Jellyscale: sign-in by name is implemented.

**L15. Signing in on a TV without typing.**
- *Love.* "Quick Connect with a QR code" has 227 votes on Jellyfin's tracker ([`jellyfin-clients.md`](jellyfin-clients.md) §5). Hub 2026 tested "TV apps make me use the remote control to type in the 'search' or other fields, which is too hard to do".
- *Use and choice.* No conversion or usage figure for QR or code sign-in was found: unverified.
- *Verdict.* Used and liked; no figure.
- *Applies?* Yes, most of all on the TV shell.
- *API.* Jellyfin Quick Connect. **Jellyscale: `/QuickConnect/Enabled` is a stub and Quick Connect is "not built".**

**L25. Profiles and kids' controls.**
- *Love.* Shared accounts are the norm: 18% of respondents were the only user of their household's Netflix account (CivicScience, more than 3,600 US adults, date not shown; snippet) (https://civicscience.com/?p=29752).
- *Use and choice.* No service publishes how many accounts use several profiles or a kids' profile: unverified. Parental controls were the least important of the features Morning Consult tested in 11 of 15 countries; in the US "just 48% said parental controls are important" (3 to 8 March 2022, 999 to 2,211 adults per country) (https://intel.morningconsult.com/mc-content/articles/preferred-streaming-features). About half of parents whose children stream use the controls (Aura and Ipsos, 684 US parents, 2023; snippet) (https://ipsos.com/sites/default/files/ct/news/documents/2023-09/Topline.pdf); 38% on smart TVs (FOSI, 2025; snippet) (https://fosi.org/?p=11967). Parents weigh kids' content, not controls, when subscribing: 39% consider kids' content, 54% price (YouGov, 2023; snippet) (https://yougov.com/en-us/articles/46545-childrens-influence-streaming-parents-poll-2023).
- *Verdict.* Used by those who need them; nothing shows they decide which app people choose.
- *Applies?* Yes. A Jellyfin account is a real account, and the server enforces ratings and library access.
- *API.* Server accounts. Jellyscale: user management and parental ratings are "not built".

### 2.2 Home and rows

**L1. What you were watching, pinned first.**
- *Love.* Pinned Continue Watching was the most loved of 13 tested features: 46% "love" it (Hub 2026). Interviewees asked for it in their own words: "there's like 4-5 rows of random content or shows recommended before I can even get the content which I'm interested in" (Hub 2026).
- *Use and choice.* 63% would "absolutely" use it, 42% say it makes the service more valuable, 48% would make that app their "home base", and 48% say it makes them more likely to keep the subscription: first on all five measures (Hub 2026). "A large portion of watching hours are spent in continue watching mode" (Netflix, RecSysTV 2016: https://www.slideshare.net/MohammadHosseinTagha/balancing-discovery-and-continuation-in-recommendations). A test that moved the row down cut clicks by 16% (snippet) (https://amplitude.com/blog/ae-networks-amplitude-viewer-engagement). On Jellyfin's tracker, "Option to combine Next Up and Continue Watching" has 209 votes (https://features.jellyfin.org/posts/1055).
- *Verdict.* **Drives choice.** The best-evidenced feature in this document, and the same finding as the gripes study from the other side.
- *Applies?* In full.
- *API.* `GET /UserItems/Resume` and `GET /Shows/NextUp`. **Jellyscale: Resume is implemented; NextUp is a stub.**

**L4. Saved titles, easy to find.**
- *Love.* A pinned watch list was the second most loved feature: 39% (Hub 2026). "Watchlist (like Netflix)" has 1,306 votes on Jellyfin's tracker, third among client requests (https://features.jellyfin.org/posts/576).
- *Use and choice.* 56% would "absolutely" use it and 43% say it makes them more likely to keep the subscription (Hub 2026). 61% of viewers "decide what I want to watch in advance, and might not actually watch it until days or weeks later", so a place to keep those decisions has a real job (Hub 2026). Netflix moved My List and Search to the top of its 2025 TV layout because they were "somewhat hidden"; it published no test figure (snippet) (https://about.netflix.com/en/news/unveiling-our-innovative-new-tv-experience).
- *Against.* Saved titles mostly go unwatched. Reelgood: "75% of the titles on active users' watchlists receive no user engagement" (2018; snippet; the page now returns 410) (https://www.digg.com/2018/do-people-complete-watchlists-streaming). JustWatch: 5 to 10% of watch-list titles are clicked; Letterboxd: 16.8% are watched (2019 blog; snippet) (https://rvasus.blogspot.com/2019/03/prove-or-disprove-does-adding-content.html). 68% of Americans say their list is "nearly impossible" to get through (2,000 respondents, 2022, sponsored by Plex; snippet) (https://shinyshiny.tv/2022/09/2-in-3-americans-unable-to-get-through-tv-and-movie-watch-list.html).
- *Verdict.* **Used and liked.** The wish to save and to find the list is well supported. That the list then gets watched is not.
- *Applies?* Yes, with a difference. A personal library is already a list of things someone chose. The list is for "next", not for "exists".
- *API.* Jellyfin has no watch list. Favorites are the nearest thing: `POST` and `DELETE /UserFavoriteItems/{itemId}`, and `GET /Items?isFavorite=true`. **Jellyscale: favorites are implemented.**

**L9. Suggestions that follow what you finish.**
- *Love.* "More relevant recommendations" was described to respondents as: "Algorithm updates recommendations based on what you finish, not shows you sampled but abandoned". 37% love it, third of 13 (Hub 2026).
- *Use and choice.* 46% would absolutely use it; 35% more likely to keep the subscription; it is in the top tier for viewers aged 13 to 24 (Hub 2026). 82% of streaming subscribers said they were likely to use "groupings of similar content" (Morning Consult, 17 to 19 July 2020, 1,362 subscribers; intent) (https://intel.morningconsult.com/mc-content/articles/half-of-streaming-subscribers-cant-decide-what-to-watch-but-just-one-third-would-use-a-feature-that-picks-a-program-for-them). The recommender influences "about 80% of hours streamed at Netflix" (Gomez-Uribe and Hunt, 2015; gripes §2.8).
- *Against.* The service with the best-rated recommendations is not the best-liked. Whip Media's 2023 study put Netflix first for user experience and recommendations and sixth for overall satisfaction (about 2,000 US adults; snippet) (https://whipmedia.com/wp-content/uploads/2023/09/2023-US-Streaming-Satisfaction-Study.pdf).
- *Verdict.* **Used and liked.** What respondents asked for is narrow and concrete: count what I finished, ignore what I abandoned, do not repeat.
- *Applies?* Yes, from one viewer's history and the library's metadata. There is no crowd (gripes §4).
- *API.* `GET /Items/{itemId}/Similar`. **Jellyscale: a stub.**

**L12. Hide rows you do not use.**
- *Love.* 29% love "Remove things you don't use (like 'Trending Now' or 'Leaving Soon') so you don't see them again" (Hub 2026). "New or Improved Home Screen Sections" has 172 votes on Jellyfin's tracker (https://features.jellyfin.org/posts/1986).
- *Use and choice.* 47% would absolutely use it, the fourth-highest use figure of the 13, and 37% say it makes them more likely to keep the subscription (Hub 2026).
- *Verdict.* Used and liked, on intent. The examples respondents were shown are a service's promotional rows, which Fluster does not have.
- *Applies?* Partly. Fluster's rows are the viewer's own and one per library.
- *API.* None needed; a preference. Jellyfin's `DisplayPreferences` could carry it across devices (**implemented in Jellyscale**).

**L13. Rows that group similar titles.**
- *Love and use.* The Morning Consult figure above (82% likely to use groupings). Netflix's home page is where "2 of every 3 hours streamed" are found (gripes §5, row 8). Hub 2026 found "content categories are too broad to be useful" a frequent, low-frustration problem.
- *Verdict.* Used and liked on services; the personal-library evidence is absent.
- *Applies?* Yes. Fluster has "Latest in {library}" rows and plans genre browsing from the library (P16-06).
- *API.* `GET /Genres`, `GET /Items?genreIds=`. **Jellyscale: `/Genres` is a stub.**

**L27. Top 10 and popularity lists.**
- *Love and use.* 65% of subscribers said they were likely to use a top 10 list (Morning Consult, 2020, above; intent). Netflix said members in its test countries "responded well" and gave no numbers (https://techcrunch.com/2020/02/24/new-netflix-feature-reveals-the-top-10-most-popular-programs-on-its-service/). A Hub interviewee: "I do like the Top 10 shows, but it would always be like Rings of Power" (Hub 2026).
- *Verdict.* Liked on services; **not applicable**. A popularity list needs a crowd, and a household is not one.

**L29. A shuffle or "Play something" button.**
- *Love and use.* 36% likely to use a random shuffle (Morning Consult, 2020, above). Netflix removed "Play Something" in January 2023 because it was little used (gripes §5, row 2).
- *Verdict.* **Loud praise, little use.**

### 2.3 Search

- **How much viewing starts in search.** No primary figure newer than Netflix's 2015 "the remaining 20% comes from search" was found (gripes §2.8). 43% of viewers aged 13 to 24 and 35% of older viewers "decide what to watch in advance" (Hub 2026), which means many sessions begin with a title in mind.
- **Search across services.** 70% agree "I want a way to search across all my services" (Hub 2026); two-thirds want universal search (Horowitz, 2,200 adults, 2022) (https://www.nexttv.com/news/survey-streaming-dominates-video-viewing). It answers a problem a single library does not have. Its nearest relative in Fluster is search across several servers (P15-08).
- **L30. Voice search.** Loud praise, little use: 10.9% had used voice search to find something to watch (TiVo, Q2 2017; snippet) (https://www.advanced-television.com/2017/09/27/tivo-viewers-will-pay-more-for-sport-specific-networks/); about half of those who have it do not use it (TiVo, Q4 2017; snippet) (https://www.nexttv.com/news/about-half-consumers-voice-search-actually-use-it-tivo-study-417042). Hub 2026 lists "Voice activated search doesn't accurately pull up the show or movie I ask for" among its problems. All the usage figures are old.
- **Search by mood, and AI search.** "Built-in AI search" is loved by 27% and would be used by 40% (Hub 2026): mid-table. 20% of those who look for more information about a title already "ask ChatGPT or AI about it" (Hub 2026, n=1,633). Nothing shows use inside a TV app.
- *Applies?* Exact search over one library is already Fluster's (P3-07). *API:* `GET /Items?searchTerm=`; **Jellyscale answers 404 for `/Search/Hints`**, which Fluster's suggestions call (`tasks/backlog.md`).

### 2.4 Detail pages, episode lists, and seasons

**L14. Trailers on the title's page.**
- *Love and use.* Of the 1,633 respondents who need more information before choosing, 37% "watch the 'official' trailer on the streaming service" as one of their three most-used sources, second only to a Google search at 44% (Hub 2026). "Trailers Plugin" has 585 votes on Jellyfin's tracker (https://features.jellyfin.org/posts/55).
- *Verdict.* Used and liked on services.
- *Applies?* Less than on a service. The viewer or someone in the household chose every title. A trailer exists only if a file sits beside the film.
- *API.* `GET /Items/{itemId}/LocalTrailers`. **Jellyscale: a stub; extras "answer empty lists or 404".**

**L21. Ratings and reviews beside the title.**
- *Love and use.* 27% love it, 38% would absolutely use it; Hub puts it in its lowest tier (composite 32%). 28% of those who need more information look up reviews elsewhere (Hub 2026). 42% agree "TV services/apps don't have enough information about a show for me to decide if it's worth watching" (Hub 2026).
- *Verdict.* Nice but not decisive.
- *Applies?* Yes, only from what the server holds. *API:* `CommunityRating` and `CriticRating` on the item.

**Episode lists and season pickers.** No research was found: unverified. One usability study reported that finding an individual episode was the hardest task it set, and that Netflix "required many clicks to find the list of episodes" (UserTesting, 2018; snippet) (https://de.slideshare.net/UserTestingDotCom/the-streaming-media-cx-index-what-customers-expect-from-svod-experiences). Opinion pieces prefer season tabs to a dropdown (snippet) (https://uxdesign.cc/does-hbo-max-have-good-ux-59646edbc2f7). Fluster's series page already uses tabs and a one-press next episode.

**Several versions of a film.** Plex's "Multiple Cuts Of Movie" request reached 1,459 votes and was implemented (https://forums.plex.tv/c/feature-suggestions/8/l/votes.json); Jellyfin's version-handling request has 266 (https://features.jellyfin.org/posts/174). Fluster has the version picker (P3-08).

### 2.5 Playback controls

**L6. Skip intro.**
- *Love.* Netflix's own engineer doubted that a "free cupcake" button would get more clicks (snippet) (https://www.tvbeurope.com/media-consumption/netflixs-skip-intro-button-is-pressed-136-million-times-a-day). "Skip intro/outro/credits" drew 1,089 votes on Jellyfin's tracker before it was completed (https://features.jellyfin.org/posts/45).
- *Use and choice.* Pressed about 136 million times a day; before the button existed, members skipped ahead by hand about 15% of the time (gripes §2.10). Plex and Emby sell it: it needs a Plex Pass or Emby Premiere ([`jellyfin-clients.md`](jellyfin-clients.md) §3). An Android Authority article on leaving Plex names Skip Intro behind the subscription among the reasons (https://www.androidauthority.com/plex-restrictions-reasons-to-switch-3622348/).
- *Counter-signal.* 45% of US TV watchers enjoy title sequences and 27% do not (YouGov, 1,000 adults, April 2022) (https://yougov.com/en-us/articles/42726-american-tv-preferences-yougov-poll). That supports a button over skipping without asking.
- *Verdict.* **Used and liked, heavily.** Two vendors charge for it, which is the nearest thing to choice evidence.
- *Applies?* Yes, when the server has segments.
- *API.* `GET /MediaSegments/{itemId}`. **Jellyscale: "Media segments and intro skip: not built"; no route is listed.**

**Skip recap and skip credits.** No usage figure was found from any service: unverified. Plex added credits skipping in 2023 with no figures (snippet) (https://www.macrumors.com/2023/02/16/plex-adds-credit-detection/). Nothing here changes the owner's "not now" on recap segments.

**L8. The next episode after a countdown.**
- *Love and use.* 42% of US adults binge at least half the time (YouGov 2022, above). In the University of Chicago experiment about half of the participants planned to turn auto-play back on (gripes §5, row 9). No service publishes how often the countdown is left to run. "Begin buffering the next episode" has 223 votes on Jellyfin's tracker (https://features.jellyfin.org/posts/400).
- *Verdict.* Used and liked; the countdown's own use is unmeasured.
- *API.* `GET /Shows/NextUp` or the season's episodes. Jellyscale: episodes implemented, NextUp a stub.

**L19. Scrubbing thumbnails and 10-second skip.**
- *Love and use.* A lab study found that showing a grid of thumbnails while scrubbing beat other techniques for finding a scene, "by a factor of up to 48%" (Swifter, CHI 2013; snippet) (https://www.autodesk.com/research/publications/swifter). No field usage was found for thumbnails or for the 10-second buttons: unverified.
- *Verdict.* Nice but not decisive. Expected, cheap to keep, and unmeasured.
- *API.* Trickplay images. **Jellyscale: "Trickplay: not built".**

**L20. Playback speed.**
- *Love.* Netflix called it "much requested by members", and deaf and hard-of-hearing viewers and the National Federation of the Blind welcomed it (https://about.netflix.com/en/news/player-control-tests).
- *Use and choice.* 11% of US TV watchers have watched faster than normal; 23% would be interested; 55% would not; 77% did not know services offered it (YouGov 2022, above). On YouTube, people who change speed on TVs and consoles spend longest at normal speed, then 1.25x; 2x leads only on the web (https://blog.youtube/inside-youtube/youtube-watch-video-playback-speeds-trends). Netflix capped it at 0.5x to 1.5x, reset it for each title, and left TVs out (Netflix, above).
- *Verdict.* **Nice but not decisive** for films and shows on a big screen. A minority uses it; for some of them it is an accessibility need.
- *API.* None; a player command.

**L7. Subtitles, and track choices that stick.**
- *Love.* Track memory is asked for on all three server forums (gripes §2.11). Plex's "Control subtitles on a per-series basis" reached 701 votes and was implemented; "Automatic subtitle synchronisation" has 687 (https://forums.plex.tv/c/feature-suggestions/8/l/votes.json). "Improve Subtitle Appearance/Options" has 189 votes on Jellyfin's tracker (https://features.jellyfin.org/posts/161).
- *Use and choice.* "Nearly half of all viewing hours on Netflix in the US happen with subtitles or captions on" (gripes §5, row 11). 80% of viewers in five countries use subtitles at least sometimes, "including 81% who report no hearing difficulty" (XR, 3,000 respondents, May 2026; a vendor survey) (https://www.advanced-television.com/?p=285307). About 4 in 10 adults under 45 use them at least often (AP-NORC, 2025; snippet) (https://www.fox13news.com/news/young-people-watch-tv-movies-subtitles-more-than-older-viewers-survey).
- *Not found.* Usage of subtitle styling, of Amazon's Dialogue Boost, of Netflix's dialogue-only subtitles, or of audio description as a share of viewers: unverified. Nothing shows that any of them decides which service people choose.
- *Verdict.* **Used and liked.** Subtitles are used in about half of viewing, so anything that makes them wrong, late, or forgotten is felt often.
- *API.* Subtitle streams on the item; the user's `SubtitleMode` and language preferences. Jellyscale: delivery is done for text and image tracks; "starting on the default subtitle per the viewer's subtitle mode" is "not built".

**L16. Offline downloads.**
- *Love.* "Support offline mode on Android mobile" is the most-voted client request on Jellyfin's tracker at 1,827, and "Offline Sync Feature" has 821 ([`jellyfin-clients.md`](jellyfin-clients.md) §5). 59% of US streaming users "expect" downloads and 54% say they are more likely to subscribe (Penthera with nScreenMedia, 2019; vendor-sponsored, sample not stated) (https://www.nexttv.com/news/downloading-becoming-key-feature-for-mobile-viewers).
- *Use and choice.* Netflix gives no share of members who download. It says downloads are most popular in "countries like Mexico, Brazil, and India" (https://about.netflix.com/en/news/celebrating-five-years-of-downloads-on-netflix). An independent 2017 survey found 63% of Netflix subscribers aware of downloads and about 3% using them (GfK; snippet; the page now returns 404) (https://blog.gfk.com/2017/04/netflix-now-offers-downloadable-content-watch-offline). In a vendor survey of people aware of downloading, 43% did not download, and 8% downloaded daily against 25% who streamed daily (Penthera, 2017, more than 1,000 respondents) (https://www.videonuze.com/article/research-interest-in-video-downloading-is-strong-but-awareness-lags). 9.6% of US respondents prefer downloading to streaming (Limelight; snippet) (https://www.streamingmedia.com/Articles/News/Online-Video-News/40-Prefer-to-Stream-Movies-and-TV-Shows-26-Prefer-to-Download-118749.aspx).
- *Verdict.* **Loved on phones; stated intent far above measured use; no evidence for a desktop.** The brief set the bar at "overwhelming". The evidence does not reach it for the desktop client. It is the top request for a phone client.
- *API.* `GET /Items/{itemId}/Download`. **Jellyscale: implemented.**

**L32. No data.** Picture-in-picture (Mozilla's study is 11 interviews: https://blog.mozilla.org/ux/2020/09/from-a-feature-to-a-habit-why-are-people-watching-videos-in-picture-in-picture/), a sleep timer (YouTube shipped one in 2024 "reflecting user feedback", no numbers; snippet), Dialogue Boost (Amazon's launch post has no usage figure: https://www.aboutamazon.com/news/entertainment/prime-video-dialogue-boost), X-Ray, "watch from the beginning", and chapter markers. No verdict is possible.

### 2.6 Remote and TV navigation, and second screens

**L10. A phone as the TV's remote and keyboard.**
- *Love.* 33% love "Use your phone instead of the TV remote to make typing in a TV app easier" (Hub 2026).
- *Use and choice.* 49% would absolutely use it, third of 13; 43% say it makes them more likely to keep the subscription; Hub's composite puts it third and in its "build now" tier, and first-tier for viewers aged 35 and over (Hub 2026). No measured usage was found.
- *Verdict.* Used and liked, on intent only. It answers the typing problem (gripes §2.14).
- *Applies?* When Fluster runs on a TV. Jellyfin already lets one client control another's session, so a phone running any Jellyfin app can be the remote once Fluster accepts commands.
- *API.* `POST /Sessions/Capabilities/Full` and the remote-control messages on the socket. **Jellyscale: `/Sessions` and `/socket` are implemented; both Capabilities routes are stubs.**

**Carrying on from one device to another.** 32% love "Start a show on your phone and continue at the same point on TV"; 42% would use it (Hub 2026). On Jellyfin this is the resume position, which the server already keeps. It is L3.

**L28. Watch together.**
- *Love.* "Add Watch Together to New Plex Experience" is the top-voted request on Plex's forum at 2,906 (https://forums.plex.tv/c/feature-suggestions/8/l/votes.json). Jellyfin's SyncPlay requests have 270 and 164 votes (https://features.jellyfin.org/posts/971, https://features.jellyfin.org/posts/389).
- *Use and choice.* 23% of viewers had used a co-viewing app "this year" in mid-2021, 41% of those aged 16 to 34 (Hub, 2,519 US respondents) (https://senalnews.com/en/data/co-viewing-apps-are-more-popular-with-young-audiences/amp). That was "ever", at the height of lockdowns. Disney+ removed GroupWatch in September 2023 without a stated reason (snippet) (https://www.techradar.com/streaming/disney-plus-just-removed-one-of-its-best-friends-and-family-focused-features). No service publishes regular use.
- *Verdict.* **Loud praise, little use.** The Plex votes show that people who had it miss it; nothing shows people choose a client for it.
- *API.* SyncPlay. **Jellyscale: `/SyncPlay/List` is a stub; SyncPlay is its last phase.**

**L31. Chat, sharing, and communities in the app.** The three lowest of Hub's 13: sharing 25% love, community links 19%. **Loud praise, little use**, and against `PRODUCT.md` principle 6.

**Casting.** No figure for how many viewers cast was found: unverified. Netflix ended casting to most newer TVs in November 2025 without publishing usage (snippet) (https://www.engadget.com/entertainment/streaming/netflix-ends-casting-from-mobile-devices-for-users-of-newer-tvs-151921578.html).

### 2.7 Personalization, history, and ratings

**L22. "Why was this recommended?"**
- *Love and use.* 28% love it and 36% would absolutely use it: tenth of 13 on use, and in Hub's lowest tier (Hub 2026). Yet 48% agree that recommendations "don't feel like they're designed for me" (Hub 2026). Recommender research holds that explanations build trust (Herlocker, Konstan, and Riedl, CSCW 2000, DOI 10.1145/358916.358995; snippet), and that trust is hard to measure (Tintarev and Masthoff, 2012; snippet) (https://abdn.elsevierpure.com/files/20864620/USER700.pdf).
- *Verdict.* Nice but not decisive. Cheap when the reason is one title's name.

**L26. Thumbs and "two thumbs up".**
- *Love and use.* Replacing stars with thumbs gave "an astounding 200% increase in ratings activity" in a test with hundreds of thousands of members (Netflix, quoted in https://www.tubefilter.com/2017/04/05/netflix-thumbs-up-down-ratings/). Netflix said of "two thumbs up" that members wanted to tell liked from loved; it published no figures (https://techcrunch.com/2022/04/11/netflix-adds-a-two-thumbs-up-button-in-effort-to-learn-what-users-love-not-just-like/). Netflix's own product lead: "We made ratings less important because the implicit signal of your behavior is more important" (snippet) (https://www.businessinsider.in/netflix-will-kill-its-5-star-rating-system-in-favor-of-thumbs-up-thumbs-down-heres-why/amp_articleshow/57679521.cms). "Personal ratings" has 461 votes on Jellyfin's tracker (https://features.jellyfin.org/posts/1134). Hub 2026 found "I can only give a thumbs up or thumbs down" among the least frustrating problems.
- *Verdict.* Nice but not decisive. A simpler control gets used more, and the vendor still trusts behaviour over it. No survey shows that viewers value rating things.
- *Applies?* Weakly. A rating feeds a recommender, and Fluster's first one reads what the viewer finished and favourited.
- *API.* Jellyfin has `Likes` on user data. **Jellyscale answers 404 for likes and ratings, by decision.**

**L23. A watch history.**
- *Love.* "Watched History" has 835 votes on Jellyfin's tracker, fifth among client requests (https://features.jellyfin.org/posts/633).
- *Use and choice.* No usage figure for any service's history page was found: unverified.
- *Verdict.* Nice but not decisive, on one vote board.
- *API.* `GET /Items?isPlayed=true&sortBy=DatePlayed`. It is one date per title, not a list of sessions. Jellyscale: `/Items` is implemented; this filter and sort are unverified there.

**L24. Custom lists and boards.** "Pinterest for TV" (boards such as "Background Shows") is loved by 26% and would be used by 31%, near the bottom (Hub 2026). Nice but not decisive. Jellyfin collections and playlists are the equivalent; Jellyscale lists no playlist route.

### 2.8 Performance and startup

**L2. It starts fast and does not stall or crash.**
- *Love.* "When I open an app, I want it to already be where I left off or already doing what I need" (an interviewee, Hub 2026). Hub's first qualitative finding: "The best apps remove orientation — they launch doing what you came for".
- *Use and choice.* Measured behaviour, from 23 million views by 6.7 million viewers: "viewers start to abandon a video if it takes more than 2 seconds to start up, with each incremental delay of 1 second resulting in a 5.8% increase in the abandonment rate"; a viewer who met a failure was 2.32% less likely to come back within a week (Krishnan and Sitaraman, IMC 2012) (https://people.cs.umass.edu/~ramesh/Site/HOME_files/imc208-krishnan.pdf). 36% of viewers "have cancelled a subscription because the app was frustrating to use", 43% of those under 25 (Hub 2026). Hub's problem map puts "App glitches or crashes" highest for frustration and names "slow startup" with buried Continue Watching as what makes viewers abandon sessions. J.D. Power's 2016 streaming study ranked "performance and reliability" first of six satisfaction factors, ahead of content and cost (3,928 respondents; snippet) (https://www.jdpower.com/business/press-releases/jd-power-2016-streaming-video-satisfaction-study). Vendor surveys agree on rebuffering: 28.7% stop after one rebuffer (Limelight; snippet) (https://www.streamingmedia.com/Articles/News/Online-Video-News/Rebuffering-Frustration-29-Will-Stop-Watching-After-One-Problem-127618.aspx).
- *Not found.* A Netflix engineering post tying TV app launch time to retention; any benchmark or survey tying a Jellyfin client's launch speed to preference. "Remove pagination / lazy loading for library view" has 1,186 votes on Jellyfin's tracker, which is the nearest signal (https://features.jellyfin.org/posts/216).
- *Verdict.* **Drives choice.** The abandonment study is the only measured behaviour at scale in this document. It was measured on web video in 2012; the direction is not in doubt, the exact numbers for a home library are.
- *Applies?* In full. `PRODUCT.md` promises "fast startup" and measures only Play to first frame.
- *API.* None.

**L3 (part). It remembers the exact place.** "When I close the app and come back later, the app doesn't always remember the exact place I stopped watching" sits beside crashes near the top of Hub's frustration scale. It is a failure people notice, not a feature they praise. Jellyscale: progress and stopped reports are implemented.

### 2.9 Picture and audio quality

**L5. Plays the file as it is.**
- *Love.* Infuse holds 4.67 from 28,627 ratings on the US App Store and sells a $99.99 lifetime licence (https://apps.apple.com/us/app/infuse/id1136220934); Swiftfin, the free Jellyfin client on the same devices, holds 3.76 from 278 (Apple lookup API, 2026-11-12). Firecore says Infuse "has long been known for its ability to directly play almost any video format" (https://firecore.com/blog/infuse-85-smarter-streaming). The Jellyfin project's own write-up leads with "direct playback (no transcoding required) for almost all formats" (https://jellyfin.org/posts/client-infuse). A forum user picks it because the official Apple TV app "doesn't play in Dolby Vision" (snippet) (https://forum.jellyfin.org/t-how-can-i-watch-dv-on-apple-tv-4k).
- *Use and choice.* People pay for a third-party player when free ones exist. Unwanted transcoding is the first recurring complaint in the Jellyfin clients' trackers ([`jellyfin-clients.md`](jellyfin-clients.md) §5). In July 2026 Infuse added optional server transcoding for slow links (Firecore, above), which is the same order Fluster uses: original first, conversion as a stated fallback.
- *Limits.* No survey asks why Infuse's users bought it, and Firecore publishes no usage. The rating gap also reflects polish and age.
- *Verdict.* **Drives choice among personal-media users**, on paid adoption and reviews: medium strength.

**L17. HDR, Dolby Vision, and lossless audio passthrough.**
- *Love.* 77% "would pay extra for better picture or sound quality" (Dolby and Wakefield, 5,000 respondents in four countries, 2020; **commissioned by Dolby**, stated preference) (https://www.advanced-television.com/2020/11/23/survey-consumers-value-enhanced-entertainment-quality/). Plex's "Correctly identify & display Dolby Atmos, dts:X, and dts-HD MA" has 701 votes (Plex votes, above).
- *Use and choice.* Among Jellyfin users the quality requests draw few votes beside the library ones: "Audio Passthrough on supported devices" 47, "Dolby TrueHD passthrough on Android TV" 24, "DTS-X passthrough" 8 (https://features.jellyfin.org/posts/420, https://features.jellyfin.org/posts/1633, https://features.jellyfin.org/posts/1589), against 1,740 for removing an item from Continue Watching. Among mainstream viewers, only 43% of 4K TV owners had ever watched 4K programming (Hub, about 2019; snippet) (https://www.streamingmedia.com/Articles/News/Online-Video-News/Wheres-the-4K-Consumers-Dont-Know-How-to-Find-4K-Video-133198.aspx). No reliable figure for the share of viewing in HDR or Atmos was found.
- *Verdict.* **Drives choice for a small group; nice but not decisive for most.** The home-theatre persona in `PRODUCT.md` chooses by it. The vote counts say that persona is a minority of Jellyfin's users.
- *API.* None; the file's own streams.

**L18. Honest labels.** "Stats for nerds" has 219 votes for the Android TV app ([`jellyfin-clients.md`](jellyfin-clients.md) §5), and the Plex Atmos-label request above has 701. Nice but not decisive; Fluster already leads here.

### 2.10 Accessibility and polish

**Accessibility.** Subtitles are the one accessibility feature with usage evidence, and most of their users have no hearing difficulty (L7). No usage share was found for audio description; one self-selected survey found 8.2% of its users sighted (American Council of the Blind; snippet) (https://www.acb.org/adp-survey). Nothing shows accessibility features decide which service people choose; for the people who need them they decide whether the app can be used at all.

**L11. Polish.**
- *Love.* Reviewers give polish as Plex's advantage over Jellyfin: Plex apps are "more polished than the open-source packages Jellyfin relies on" (Engadget, July 2026) (https://engadget.com/2204587/plex-vs-jellyfin-comparison); a "highly polished" interface and "excellent metadata handling" are the reasons to stay (NAS Compares, April 2025) (https://nascompares.com/news/is-this-the-beginning-of-the-end-of-plex-is-it-jellyfin-time/amp/). Infuse's featured reviews: "looks great and plays even better" (App Store, above).
- *Use and choice.* "More than half of consumers in all countries said it was important" that a service has a user-friendly interface, alongside price options and library size (Morning Consult, March 2022, 15 countries, above). 90% are satisfied with TV apps' experience overall, 48% "very" (Hub 2026). Against: the best-rated experience did not make Netflix the best-liked service (Whip Media, L9). No evidence was found that animation or artwork quality by itself affects choice: unverified.
- *Verdict.* Used and liked; among personal-media users it is one of two stated reasons to stay with Plex.

## 3. Why people prefer one app to another

What was found on switching and preference, as distinct from praise for a feature.

1. **A bad app loses subscribers; a good one keeps them a little.** 36% have cancelled over an app that was frustrating to use (Hub 2026). The best a single feature does for keeping a subscription is 48% "more likely" (pinned Continue Watching), and a stated one.
2. **Self-hosters are moving from Plex to Jellyfin, and the reasons are price and intrusion, not features.** In the selfh.st survey Jellyfin rose from 53.9% of 3,655 respondents in 2024 to 60.9% of 4,081 in 2025; Plex fell from 35.0% to 29.9% (https://selfh.st/survey/2025-results/, counts from https://raw.githubusercontent.com/selfhst/cdn/main/assets/surveys/annual/2025-results.json; percentages computed from the counts). The sample is self-hosting enthusiasts. In an Android Authority reader poll of 7,734 votes, 31% had already switched from Plex, 30% were thinking about it, and 23% were staying; the article's reasons to leave are the remote-streaming paywall, features behind the subscription, and streaming "bloat" (December 2025; self-selected) (https://www.androidauthority.com/plex-restrictions-reasons-to-switch-3622348/). Plex ended free remote streaming and raised its lifetime pass to $249.99 on 29 April 2025 ([`jellyfin-clients.md`](jellyfin-clients.md) §3.2).
3. **What keeps people on Plex is polish, metadata, and easy remote access** (NAS Compares and Engadget, above). The first is a client's job. The other two are the server's.
4. **Apple users pay for Infuse for playback and looks** (L5). It is the clearest case of people choosing a client, with money, over the free official one.
5. **Emby sits between the two** (Engadget's "Goldilocks solution"); it is used by 3.7% of the selfh.st sample. Kodi's use fell from 278 to 237 respondents; its praise is customisation, on anecdote only (snippet) (https://lemmy.federate.cc/comment/1001498).
6. **Among Jellyfin's own clients, adoption follows platform reach.** GitHub stars on 2026-11-12: Jellyfin Desktop 6,012, Streamyfin 5,357, Findroid 4,311, Swiftfin 4,275, Wholphin 3,322, Fladder 2,739 (GitHub API). No poll or survey of why Jellyfin users pick one client over another was found: unverified.

## 4. What the weighing shows

1. **The plain things win.** Of the 32 features, the three with evidence of choice are that the app opens fast on what you were watching, remembers your place and your sign-in, and plays without stalling. None is a feature a service advertises.
2. **Fluster's plan already matches the top of the list.** L1, L3, L5 to L9 are built or are tasks. The gripes study reached the same first rows from complaints. Two independent readings agreeing is the strongest result here.
3. **Three gaps appear.** Startup is promised and not measured (L2). Saved titles are planned for the nav, where the survey says they get lost (L4). A phone as the remote ranks in the top tier for TVs and Fluster's task for it sits in its last milestone (L10).
4. **Stated intent overstates.** Downloads: 54% "more likely to subscribe" against about 3% using them. Voice search: half of those who have it do not use it. Watch lists: loved, and three-quarters of saved titles untouched. The Hub figures are the same kind of evidence and should be read with that discount.
5. **Several loved features need a crowd or a catalogue Fluster does not have.** Top 10, universal search, "leaving soon", and collaborative ratings do not carry over.
6. **Quality drives a minority.** Direct play matters to personal-media users enough to pay for. HDR and passthrough matter intensely to few. Fluster's identity rests on the first; the second is a persona, not the majority.
7. **Much is simply unmeasured.** No usage data was found for skip recap, skip credits, the countdown, scrubbing thumbnails, profiles, kids' profiles, audio description, subtitle styling, casting, or history pages.

## 5. Adopt, already have, don't adopt

### 5.1 Adopt (ranked)

New work the evidence supports. The first needs no owner choice and is a task; the rest are decisions in the proposal.

| Rank | What | From | Why | How |
|---|---|---|---|---|
| 1 | **Measure startup and the gap between episodes** | L2 | The only measured behaviour at scale says delay loses viewers; `PRODUCT.md` promises fast startup and measures one number. | **P3-28**, added |
| 2 | **Put saved titles on Home** | L4 | Second of 13 features on every Hub measure; "hard to find" was one of the two most damaging design problems. | Decision D1 |
| 3 | **Bring the phone-as-remote work forward to the TV shell** | L10 | Third of 13 and Hub's first tier; the TV shell is where typing hurts. | Decision D4 |
| 4 | **Ask Jellyscale for media segments, Quick Connect, and trickplay** | L6, L15, L19 | Skip intro is the most-used player feature there is, and it has no data on Jellyscale. | Decision D8 |
| 5 | **Set a startup target once measured** | L2 | A promise needs a number. | Decision D3 |
| 6 | **Let a viewer dismiss a suggestion** | L9 | "Recommendations repeat over and over" is among the most frequent problems. | Decision D6 |
| 7 | **A watch history** | L23 | 835 votes; no usage evidence. | Decision D2 |

### 5.2 Already have or planned

| Loved feature | Where |
|---|---|
| L1 Continue watching first, one merged row, old items aged out | P3-05 (done), P3-27, P16-02 |
| L3 Exact resume; staying signed in; signing in again when a sign-in ends | P1-10 (done), P3-15 (done), P3-02, P3-19, P3-21 |
| L5 Plays the original; says so when it cannot | P1-03, P10-03, P10-06, P10-09 (done) |
| L6 Skip intro and credits, with three modes | P3-11 (done), P3-24 |
| L7 Subtitle and audio defaults; per-series memory; styling; timing offset | P3-13 (done), P15-07, P5-05, P15-06 |
| L8 Next episode with a countdown, Hide, and an off switch | P3-10 (done), P3-23 |
| L9 More like this; one row after you finish something, anchored on what was finished | P16-04, P16-05 |
| L11 A designed interface | P13 (most done), P13-19 |
| L13 Browse by genre | P16-06 |
| L14 Local trailers | P16-08, P16-09 |
| L15 Quick Connect; approve another device's code | P3-04 (done), P15-05 |
| L17 HDR, passthrough, refresh-rate matching | P5-01 to P5-04 |
| L18 Play method, decoder, video and audio facts | P3-18 (done), P13-23 |
| L19 Trickplay previews, chapters, 10-second steps | P3-12 (done), P13-22 |
| L20 Playback speed | P15-06 |
| L21 Ratings from the server on the facts line | P15-03 |
| L22 The suggestion row names its anchor | P16-05 |
| L25 Accounts, the account picker, private accounts | P13-21, P13-27 |
| Several versions of a film | P3-08 (done) |
| Library grids that load as you scroll | P13-11 (done), `DESIGN.md` §7.12 |
| L10 A phone as the remote (the receiving half) | P8-01 |
| L16 Offline downloads | P8-03 |
| L28 Watch together | P8-02 |

### 5.3 Don't adopt, and why

| Feature | Why not |
|---|---|
| L27 Top 10 and popularity rows | Needs a crowd. A household has none. |
| L29 A shuffle or "Play something" button | Netflix removed its own for lack of use; 36% intent. |
| L30 Voice search | Half of those who have it do not use it; a platform feature on TVs, not a client's. |
| L31 Chat, sharing, and community links | The three least loved of 13, and against "Private by default". |
| L26 Thumbs and ratings | No evidence viewers value rating; Jellyscale has no ratings by decision; Favorite is the stated signal. |
| Search across services; AI search | The first answers a problem one library does not have. The second is stage 3 of the viewer profile, not a feature to add now. |
| L16 Downloads on the desktop, ahead of their milestone | The evidence is not overwhelming for a desktop: stated intent, phone-centred use. Keep P8-03 where it is. It is the top request for a phone client and should lead that shell's list. |
| L28 Watch together, ahead of its milestone | Loud praise, little measured use. Keep P8-02 where it is. |
| L12 Hiding rows, now | Fluster has no promotional rows to hide, and the owner chose one fixed order. The intent figure is new evidence for the backlog entry. |
| L32 Picture-in-picture, a sleep timer, dialogue boost, X-Ray | No usage data at all. Backlog, not tasks. |
| Skipping intros without asking, as the default | 45% enjoy title sequences. The button stays the default, as decided. |
