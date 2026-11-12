# Streaming UX gripes: what people dislike about Netflix and its peers

Researched 2026-11-12 for [`docs/plans/proposals/discovery-and-profiles.md`](../plans/proposals/discovery-and-profiles.md). The owner asked for it the same day: "We should also do a ton of product research into the gripes and frustrations that people have with Netflix and its UX and see if there are ways for us to improve on it. Obviously, this is a personal library software so it's a bit different."

## Method and limits

- Sources are news articles, vendor help pages and blogs, one academic paper by Netflix staff, one university study, and the Plex, Jellyfin, and Emby forums. Every claim has a URL beside it.
- **"(snippet)"** means the claim comes from a search-result summary. The page itself was not opened, or it refused the fetch.
- **"unverified"** means no source was found. It does not mean the claim is false.
- **Reddit could not be read.** No Reddit claim is in this document. App-store reviews were not reachable either, so the mobile-store voice is missing.
- No Nielsen Norman Group critique of Netflix was found.
- **"How often"** is a reading of the coverage, not a measurement, unless a survey is cited:
  - *Widespread*: mainstream coverage in several outlets, a survey, or the vendor shipped a fix.
  - *Common*: recurring articles or forum threads.
  - *Niche*: a few sources, sometimes intense.
- Nothing here was observed in a running app. Netflix, Prime Video, Disney+, Max, and Plex were not installed or used for this document.
- "Applies to a personal library?" asks whether Fluster could fall into the same trap, not whether the business reason exists there.

## 1. Summary

| # | Gripe | How often | Why the service does it | Applies to a personal library? |
|---|---|---|---|---|
| 1 | Previews that play by themselves while browsing | Widespread | Capture attention inside about 90 seconds | Only if Fluster chooses to. No incentive. |
| 2 | Too much to scroll; minutes lost choosing | Widespread (survey) | A large catalogue is the product; abandonment is churn | Yes. A big library has the same problem. |
| 3 | Rows and artwork that change between visits | Common | Per-visit ranking and per-viewer artwork raise plays | Only if Fluster chooses to. |
| 4 | Continue Watching fills with things you gave up on | Common | The row competes with discovery rows; removal came late | Yes, and Jellyfin has no removal today. |
| 5 | Other people see or alter your profile | Common | Profiles are a convenience, not a boundary; social features drive engagement | Yes. This is the owner's "Who's watching?" concern. |
| 6 | "Are you still watching?" | Common, low intensity | Saves the viewer's place and data (Netflix's words) | Partly. A conversion left running costs the user's own server. |
| 7 | The catalogue can't be browsed in full; titles leave | Common | Licensing; "a few compelling choices" beats full navigation | No licensing churn. Full browse is the default. |
| 8 | Recommendations favour what keeps you watching | Common | Retention; the recommender drives about 80% of hours | The incentive is absent. The owner wants to do better here. |
| 9 | Auto-play of the next episode, and credits cut short | Common; credits niche but intense | More viewing per session | Auto-play is wanted for series; the abuses are optional. |
| 10 | Skip intro missing or inconsistent | Widespread demand | Lowers friction in a binge; Plex sells it | Yes. It depends on server data. |
| 11 | Audio and subtitle choices not remembered; short language lists | Common | Licensing per title; the short list is unexplained | Track memory yes. Short lists no. |
| 12 | Search answers with something else | Common (Netflix), widespread (Prime) | Keep the session alive; sell rentals | No. Search can be exact. |
| 13 | Kids leave the kids' profile; previews ignore ratings | Common | Soft controls are cheaper than real ones | Yes, through server parental controls. |
| 14 | Remote navigation gets slower after a redesign | Widespread (2025) | Bigger tiles promote featured titles | Yes, when the TV shell arrives. |
| 15 | Ads and outside content pushed into the home screen | Widespread (Plex, Prime) | Ad revenue from users who never pay | No incentive. This is why people leave Plex. |

## 2. The gripes

### 2.1 Previews that play by themselves

- Netflix launched video previews worldwide on 6 December 2016. Its product staff said the previews help "members decide whether to click play" and that "we have less than 90 seconds to capture someone's attention" (https://www.advanced-television.com/2016/12/06/netflix-video-previews-speed-content-selection/).
- On 20 December 2019 a preview for a documentary about kitten abuse played without warning. Netflix support said it already had "a number of the same feedback" (https://gizmodo.com/netflix-autoplays-the-murder-of-kittens-to-angry-subscr-1840549061).
- On 6 February 2020, after "years" of complaints, Netflix added two switches per profile: "Autoplay previews while browsing" and "Autoplay next episode". They could be set only on the website at the time. Netflix wrote: "Some people find this feature helpful. Others not so much." (https://gizmodo.com/at-long-last-our-netflix-autoplay-nightmare-is-over-1841499223)
- The TV redesign announced on 7 May 2025 brought tiles that expand and play a preview on focus. Users complained that fewer titles fit in a row, where seven fitted before (https://www.whats-on-netflix.com/news/netflixs-new-ui-update-sparks-backlash-as-global-rollout-continues/). The article notes that nobody knows what share of users complained.
- Amazon's Fire TV added video ads that play when the device turns on, and later scaled them back (snippet) (https://www.tomsguide.com/news/latest-amazon-fire-tv-update-adds-auto-playing-ads-whenever-you-turn-it-on).

**How often:** widespread. Mainstream coverage in 2020 and again in 2025, and Netflix shipped a setting.
**Why:** attention. The 90-second figure is Netflix's own.
**Personal library:** nothing pushes Fluster to do it. `DESIGN.md` already keeps the Home backdrop still and silent: it follows focus after a 300 ms dwell and plays nothing (§7.2).

### 2.2 Too much to scroll

- Nielsen's Gracenote surveyed 3,000 people in six countries for its 2025 "State of Play" report (5 November 2025). Viewers spend 14 minutes on average looking for something to watch, and 12 minutes in the US, up from 10.5 in mid-2023. 19% give up the session, and 29% of those aged 18 to 24. 49% would cancel a service over it. 45% call streaming overwhelming (https://gracenote.com/newsroom/new-gracenote-report-highlights-impact-of-ineffective-content-discovery-on-consumer-happiness-with-streaming/).
- The 2023 report had 10.5 minutes per session and one in five giving up (snippet) (https://www.advanced-television.com/2023/08/29/nielsen-viewers-facing-content-discovery-challenges).
- Netflix's own staff wrote in 2015: "a typical Netflix member loses interest after perhaps 60 to 90 seconds of choosing, having reviewed 10 to 20 titles (perhaps 3 in detail) on one or two screens" (Gomez-Uribe and Hunt, "The Netflix Recommender System", ACM TMIS; copy at https://gwern.net/doc/reinforcement-learning/exploration/2015-gomezuribe.pdf).

**How often:** widespread. It is the best-measured complaint here.
**Why:** a huge catalogue is what the subscription sells, and a viewer who gives up may cancel. The paper gives that as the motive for personalising.
**Personal library:** it applies in full. A library of thousands of titles is as hard to choose from as a service. What differs is that the viewer picked every title, so the question is "what am I in the mood for", not "is there anything good".

### 2.3 Rows and artwork that change

- Netflix's 2015 engineering post describes a ranking model that orders the rows for each member. It replaced a fixed template in which Continue Watching came first. Task rows such as My List are placed "in amongst the more discovery-oriented rows". Netflix wants pages "fresh and responsive" yet with "some stability" (archived copy of "Learning a Personalized Homepage": https://gwern.net/doc/www/netflixtechblog.com/2f5717e8bbdc98d2caf5c7a972359fbb7e7c0b28.html). The post does not say the order is recomputed on every visit.
- In October 2018 viewers criticised personalised thumbnails for misrepresenting films. Netflix said it uses viewing history only, not demographics (snippet) (https://deadline.com/2018/10/netflixs-artwork-personalization-attracts-online-criticism-1202487598, https://www.axios.com/2018/10/19/netflix-users-ask-if-promos-target-race-gender).
- On 6 May 2026 Netflix removed the A–Z and by-year sort from its web grid views. Users called it frustrating, and Netflix did not comment (https://www.whats-on-netflix.com/news/netflix-quietly-removes-a-z-and-other-sorting-from-web-ui/).
- The 2025 TV redesign shows My List as a vertical scroll and removed New & Popular (https://www.whats-on-netflix.com/news/netflixs-new-ui-update-sparks-backlash-as-global-rollout-continues/).
- One user reports My List in a changing random order (snippet) (https://discussions.apple.com/thread/250106958).

**How often:** common. The artwork dispute and the redesign are well covered. "The rows change every visit" is mostly anecdote in what was found.
**Why:** ranking and artwork chosen per viewer raise the chance of a play. The paper says the system also picks "which image out of several versions".
**Personal library:** Fluster has no reason to do either. Artwork is the library's own. Stable rows are a choice Fluster can simply make.

### 2.4 Continue Watching clutter

- Netflix added "Remove from row" on Android on 23 June 2020 and on iOS on 29 June 2020 (https://mobilesyrup.com/2020/06/23/netflix-remove-from-row-continue-watching-android/). Its help page now lists computers, TVs, Android, and iOS (snippet) (https://help.netflix.com/en/node/115312).
- Disney+ launched on 12 November 2019 with no Continue Watching row at all, and restored it about two weeks later after complaints (snippet) (https://www.engadget.com/2019/11/26/disney-plus-continue-watching/).
- A Tom's Guide writer argues the row belongs at the top (headline only) (https://www.tomsguide.com/news/hbo-max-is-better-than-netflix-in-one-big-way).
- **Jellyfin has the same gap.** "Remove an item from Continue Watching" is the second most wanted feature on Jellyfin's tracker, with 1,740 votes ([`jellyfin-clients.md`](jellyfin-clients.md) §5; https://features.jellyfin.org/posts/517). The server team liked the idea in January 2024 and declined to change the existing code. A June 2026 proposal adds an "exclude from resume" flag that hides an item without clearing its position; it is implemented on a fork and no release is promised (https://github.com/jellyfin/jellyfin-meta/discussions/50, https://github.com/jellyfin/jellyfin-meta/discussions/136).
- A user in that thread reported in February 2024 that posting `PlaybackPositionTicks: 0` to the item's user data removes it from the row and keeps the play count and last-played date. The Jellyfin version was not stated and no maintainer confirmed it (https://github.com/jellyfin/jellyfin-meta/discussions/50). **Unverified on 10.11 and 12.4.**
- A third-party plugin implements removal without resetting progress (snippet) (https://github.com/jon4hz/jellyfin-plugin-discontinue-watching).

**How often:** common. The Jellyfin vote count makes it the strongest signal in this document for Fluster's own users.
**Why:** unverified for Netflix. Its engineering post implies the row competes with discovery rows for position.
**Personal library:** it applies in full, and Fluster's users have asked for it louder than Netflix's have.

### 2.5 Other people in your profile

- Netflix added a four-digit Profile Lock in April 2020, described as stopping housemates from seeing your history or altering your recommendations (snippet) (https://www.tomsguide.com/how-to/how-to-set-up-profile-pin-locks-on-netflix, https://www.soyacincau.com/2020/04/08/you-can-now-lock-your-netflix-profile-with-a-pin).
- Plex's "Discover Together" sent "week in review" emails of each user's watch activity to their friends in November 2023. Users called it "an extreme breach of trust and privacy". Plex admitted the email "was enabled by default and caught some of our users by surprise" (https://www.theregister.com/2023/11/28/plex_privacy/). The Plex forum thread ran to at least 27 pages (snippet) (https://forums.plex.tv/t/weekly-review-emails-data-leak/860206).
- A Jellyfin forum thread of 28 May 2026 asks for "Who's watching?" profiles with an optional PIN per profile (https://forum.jellyfin.org/t-first-class-household-profiles-for-shared-devices). jellyfin-web needs a full sign-out and sign-in to switch users (snippet) (https://github.com/jellyfin/jellyfin-web/issues/7447). Four other clients have a profile PIN (`tasks/backlog.md`; [`jellyfin-clients.md`](jellyfin-clients.md) §2 and §6).

**How often:** common. Netflix shipped a feature for it, Plex had an incident covered by several outlets, and the Jellyfin requests recur.
**Why:** a profile on a subscription service is a convenience for recommendations, not a security boundary. Plex's social features serve its catalogue business (unverified as a Plex statement).
**Personal library:** it applies. A Jellyfin account is a real account with a password, which is stronger than a Netflix profile. A client that remembers several accounts and lets anyone pick one weakens that again. The owner named this on 2026-11-12.

### 2.6 "Are you still watching?"

- Netflix says the prompt exists "so you don't lose your place or use internet data when you're not actually watching". On a TV it appears "after 3 episodes and 90 minutes of uninterrupted watching". The only remedies are to dismiss it or to turn off next-episode auto-play (https://help.netflix.com/en/node/114059).
- There is no switch for it; browser extensions are the workaround (snippet) (https://www.howtogeek.com/685919/why-netflix-asks-are-you-still-watching-and-how-to-stop-it/).

**How often:** common but low in intensity. Many how-to articles; no news-level backlash was found.
**Why:** the viewer's place and data, in Netflix's words. That it also saves Netflix bandwidth is a third-party inference (unverified).
**Personal library:** the place-keeping reason applies: falling asleep marks five episodes watched. A second reason is the user's own: a conversion left running all night loads their server. The owner deferred the prompt (Q16 in the product review); nothing here argues for bringing it forward.

### 2.7 A catalogue you can't see, and titles that leave

- Netflix says its list of category codes "already tops 36,000". They work only by typing a URL in a browser (https://www.netflix.com/tudum/articles/netflix-secret-codes-guide).
- Titles leave "because of licensing agreements" (https://help.netflix.com/en/node/60541).
- A user quoted in the sort-removal article wanted "a straight list of all the horror movies" without the algorithm (https://www.whats-on-netflix.com/news/netflix-quietly-removes-a-z-and-other-sorting-from-web-ui/).
- Deloitte's Digital Media Trends is reported to find a majority frustrated when content disappears (66% in 2021, 57% in a later edition). The figures appeared only in a search summary: **unverified**.

**How often:** common. The volume of "secret codes" guides shows that people want to browse everything.
**Why:** licences are time-limited and regional. The Netflix paper states the philosophy: what customers ask for ("comprehensive search and navigation tools") differs from "what actually works (a few compelling choices simply presented)".
**Personal library:** it does not apply. Nothing leaves unless the owner deletes it, and Fluster's library pages already sort and filter the whole library.

### 2.8 Recommendations that serve the service

- The recommender "influences choice for about 80% of hours streamed at Netflix. The remaining 20% comes from search". The authors estimate that personalisation and recommendations "save us more than $1B per year" by reducing cancellations (Gomez-Uribe and Hunt, 2015: https://gwern.net/doc/reinforcement-learning/exploration/2015-gomezuribe.pdf).
- On 5 April 2017 thumbs and a personal "% match" replaced star ratings (https://techcrunch.com/2017/04/05/netflixs-new-thumbs-rating-system-goes-live/amp/).
- From 24 February to 24 March 2020, 70% of the titles in the US Top 10 were Netflix originals: 84% of the TV entries and 27% of the films. Netflix declined to comment (https://www.thewrap.com/netflix-top-10-list-netflix-original-titles-love-is-blind-tiger-king-gabriel-fernandez-spenser-confidential).
- Reed Hastings said in April 2017 that Netflix is "competing with sleep on the margin" (snippet) (https://www.pressreader.com/usa/usa-today-us-edition/20170419/281998967334147).

**How often:** common among critics and enthusiasts. "It pushes originals" is the critics' inference; the Top 10 share could simply reflect what people watched.
**Why:** retention. The paper ties recommendations to lower monthly churn. The measure being optimised is hours and renewals, which is the owner's point: "oftentimes they're just looking for something that you're going to binge."
**Personal library:** the incentive is absent. Nothing is gained by keeping a viewer up. What Jellyfin offers today is weak in the other direction: `/Items/Suggestions` returns items in random order, with no use of history (https://raw.githubusercontent.com/jellyfin/jellyfin/master/Jellyfin.Api/Controllers/SuggestionsController.cs).

### 2.9 Auto-play of the next thing, and credits cut short

- A University of Chicago study (3 March 2025, 76 participants) found that turning auto-play off cut viewing by about 18 minutes per session. The authors recommend auto-play off by default and longer countdowns (https://news.uchicago.edu/story/uchicago-scientists-study-hidden-cost-netflixs-autoplay).
- A Change.org petition with more than 10,500 signatures (26 November 2020) asked Netflix to show full credits by default. Netflix shrinks the credits to a small window and shows recommendations (https://www.mentalfloss.com/article/637730/viewers-petition-netflix-stop-cutting-end-credits). BoJack Horseman's creator criticised the cut credits (snippet) (https://television.mxdwn.com/?p=47291).
- The next-episode switch exists per profile since February 2020 (https://gizmodo.com/at-long-last-our-netflix-autoplay-nightmare-is-over-1841499223).
- Whether any setting stops a different title's trailer from playing after a film ends is **unverified**.
- YouTube Kids made auto-play optional and off by default in 2021; advocates delivered a petition of more than 10,000 signatures saying that did not go far enough (snippet) (https://www.fightforthefuture.org/news/2021-08-12-photos-parents-respond-to-youtube-updates-and/).

**How often:** common for binge auto-play. Niche but intense for credits.
**Why:** more viewing per session. The Chicago result is the best evidence.
**Personal library:** next-episode auto-play is wanted. The owner said so: "if they're watching a TV series, they're going to want to binge that TV series most likely." The abuses are separate and optional: starting something unrelated after a film, shrinking credits, and hiding the off switch. Fluster already has a countdown card with Hide (`DESIGN.md` §7.15) and plans a switch and a countdown length (P3-23).

### 2.10 Skip intro

- Netflix's Skip Intro is pressed about 136 million times a day. It was built after data showed members skipped ahead by hand in the first five minutes about 15% of the time. It reached TVs in August 2017 (http://about.netflix.com/en/news/looking-back-on-the-origin-of-skip-intro-five-years-later).
- Plex added Skip Credits in February 2023; for personal media it needs the paid Plex Pass (snippet) (https://www.macrumors.com/2023/02/16/plex-adds-credit-detection/, https://support.plex.tv/articles/credits-detection/).
- Jellyfin 10.10 and later store media segments but do not generate them: a plugin such as Intro Skipper is needed, and each client has to draw its own button (snippet) (https://forum.jellyfin.org/t-media-segments, https://github.com/intro-skipper/intro-skipper). A user could not get the button on some clients in February 2025 (snippet) (https://forum.jellyfin.org/t-can-t-get-skip-intro-to-work-on-windows-or-google-tv?pid=51735).

**How often:** the demand is widespread, by Netflix's own numbers. Complaints that it is missing or uneven are common in Jellyfin.
**Why:** it removes friction in a binge. Plex charges for it.
**Personal library:** it applies, and it depends on the server having segments. Fluster already skips from Jellyfin media segments (P3-11). Jellyscale's status page lists media segments as not built, with segments coming only from operator data or chapter markers (`~/Code/jellyscale/docs/status.md`, read 2026-11-12).

### 2.11 Audio and subtitles

- Until 2 April 2025 Netflix's TV apps offered only five to seven languages, chosen by settings and location. Netflix then opened the full list, citing "thousands of language availability requests per month" (https://www.arabnews.com/media/netflix-expands-language-support-on-tv-in-accessibility-push-2595688).
- Subtitle use is high among younger viewers: 70% of Gen Z in a Preply survey of about 1,265 US respondents (May 2022), with 72% of respondents citing muddled audio; 59% of Gen Z in a YPulse survey. Both are marketing surveys (snippet) (https://www.axios.com/2023/08/20/gen-z-millennials-tv-movies-subtitles, https://tvtechnology.com/news/survey-younger-viewers-embrace-subtitles).
- Plex users must pick tracks again for every episode; anime is the example given (28 March 2026) (https://forums.plex.tv/t/persistent-sticky-audio-and-subtitle-track-selection-at-series-level/937532). Emby and Jellyfin have the same request (snippet) (https://emby.media/community/topic/139095-remember-audio-and-subtitles-selection-per-tv-show, https://forum.jellyfin.org/t-persist-audio-and-subtitle-language-settings-across-episodes).

**How often:** subtitle use is widespread. Track-memory complaints are common and recur on all three server forums.
**Why:** licensing per title for missing languages (snippet) (https://help.netflix.com/en/node/101798). The reason for the short list is unverified.
**Personal library:** short lists do not apply; every track in the file is offered. Track memory applies and is already a task (P15-07).

### 2.12 Search that answers with something else

- Netflix deliberately shows recommendations for searches on "unavailable (out-of-catalog) entities" (Lamkhede and Das, Netflix, 2019: https://arxiv.org/abs/1903.04638). Users read "related" results as "we don't have it" (snippet) (https://applevis.com/forum/ios-ipados/searching-movies-netflix).
- Prime Video mixes included, rental, and channel titles, which makes it "near impossible to figure out what is what"; a MoffettNathanson study found that almost 30% of the most popular titles are not included with Prime (10 July 2020) (https://www.engadget.com/amazon-prime-video-confusing-interface-160050117.html). A July 2024 redesign added a Prime tab and badges (snippet) (https://www.engadget.com/prime-video-gets-a-much-needed-ui-overhaul-with-a-new-content-bar-and-ai-recommendations-120019397.html).

**How often:** widespread for Prime Video, common for Netflix.
**Why:** Netflix keeps the session alive by substituting. Amazon sells rentals.
**Personal library:** it does not apply. Everything found is playable, and "no results" can be said plainly. Complaints about sorting, filtering, and searching by actor were not researched to a source: **unverified**.

### 2.13 Kids

- A 2019 review called Netflix's parental controls "soft controls": a child can "switch to your profile anytime he wants", previews for TV-MA titles were exempt from the PIN, and PIN settings were web-only (https://www.howtogeek.com/435304/netflix%E2%80%99s-parental-controls-are-terrible/). Netflix later revised its controls "based on feedback", with maturity filters per profile and an auto-play switch for kids (snippet) (https://internetmatters.org/hub/news-blogs/netflix-release-new-and-improved-parental-controls).

**How often:** common.
**Why:** auto-play raises watch time (the advocates' claim; unverified from the vendors).
**Personal library:** it applies through the server. Jellyfin enforces parental ratings and library access per user on the server, so a child's account cannot list what it may not see. The weak point is the same as Netflix's: a client that lets the child pick a parent's saved account. See §2.5.

### 2.14 The remote

- After the 2025 TV redesign a user wrote: "Scrolling through titles is 10x slower". Users cannot go back to the old layout (https://www.whats-on-netflix.com/news/netflixs-new-ui-update-sparks-backlash-as-global-rollout-continues/). Netflix says members prefer the new layout (snippet) (https://www.techradar.com/streaming/netflix/as-netflix-users-rage-against-absolute-trash-ui-redesign-the-streaming-giant-claims-people-actually-like-it).
- An HBO Max update for Apple TV replaced the system player, broke remote scrubbing, and was rolled back (snippet) (https://9to5mac.com/2021/06/03/latest-hbo-max-app-update-for-tvos-breaks-multiple-key-features-on-apple-tv/).
- Typing with an on-screen keyboard costs a cursor move and a press per letter (a developer's blog, not a study; snippet) (https://dev.to/hugonaili/building-search-for-a-smart-tv-streaming-platform-27fg).

**How often:** widespread for the redesign. The keyboard point is unverified beyond practitioners.
**Why:** larger tiles and previews promote featured titles (unverified; Netflix cites its tests).
**Personal library:** it will apply to Fluster's TV shell. `DESIGN.md` already fixes six posters or four thumbs per TV row and one-press resume.

### 2.15 Ads and outside content

- Plex's new Android app (April 2025) put Live TV and Discover on the home screen. The fix is to turn off online media sources, and Discover is "all or nothing" (https://forums.plex.tv/t/live-tv-and-discovery-are-forced-on-my-home-page-unable-to-hide-remove/913801). Reviews of that release were mixed (https://mobilesyrup.com/2025/04/01/plex-update-rolls-out-for-mobile-reviews-are-mixed/). The feedback thread has more than 58 pages (snippet) (https://forums.plex.tv/t/new-experience-public-release-feedback/910904).
- Commenters on a NAS site say Plex's free streaming content appears ahead of their own media (7 August 2026) (https://nascompares.com/news/plex-ad-supported-streaming-nas-users-frustrated/).

**How often:** widespread among Plex users.
**Why:** ad-supported viewing earns from users who never buy Plex Pass (the NASCompares author's reasoning).
**Personal library:** Fluster has no such incentive, and `PRODUCT.md` principle 6 rules out third-party services. This gripe is a reason people move to Jellyfin.

## 3. What personal-library users ask for instead

- A collection as a Home row (28 April 2025) (https://forum.jellyfin.org/t-display-a-collection-on-home). A plugin adds collection and playlist rows to Jellyfin's Home (snippet) (https://github.com/ranaldsgift/KefinTweaks/wiki).
- Control over which Home rows appear and in what order, and what each holds (Plex: https://forums.plex.tv/t/live-tv-and-discovery-are-forced-on-my-home-page-unable-to-hide-remove/913801; snippets: https://forums.plex.tv/t/home-library-management-features-request/861030, https://emby.media/community/topic/145338-feature-request-ability-to-set-the-sort-for-individual-home-screen-rows, https://emby.media/community/topic/84817-cleaner-home-screen-hide-libraries).
- Removal from Continue Watching and a watchlist: 1,740 and 1,306 votes on Jellyfin's tracker ([`jellyfin-clients.md`](jellyfin-clients.md) §5).
- Track choices that stick per series (§2.11).
- Recommendations computed on the server from local history. A Jellyfin plugin does this with content similarity only: genres, people, tags, decades, and ratings as TF-IDF vectors, a taste profile per user weighted towards favourites and recent plays, and cosine similarity against unwatched items. It says nothing leaves the server. It shows its results as extra libraries because a plugin cannot add Home rows to clients, and its author will not update it for Jellyfin 12 (https://github.com/rdpharr/jellyfin-plugin-localrecs).

No thread about the quality of "recommended" rows in Jellyfin was found: **unverified**.

## 4. What a personal library can do that a subscription service can't

| Advantage | Why a service can't | What it allows |
|---|---|---|
| **No engagement incentive.** | Hours watched and renewals pay the bills (§2.8, §2.9). | Fluster can recommend one good thing and stop. It can suggest a 90-minute film at 22:30, or nothing. Success is "found something in under a minute", not "watched longer". |
| **A catalogue the viewer chose.** | A service must sell what it licensed, including what the viewer would never pick. | Every title is already wanted by someone in the household. Discovery becomes "what did I mean to watch", not "is this any good". Unwatched and recently added are strong signals by themselves. |
| **No licensing churn.** | Licences expire (§2.7). | Rows can stay put for months. "Leaving soon" pressure does not exist. A watchlist never loses items. |
| **The whole catalogue is browsable.** | Services hide breadth behind rows (§2.7). | Full sort and filter stays one step from every row. Search is exact (§2.12). |
| **The viewer's own metadata.** | A service keeps one global record per title. | The owner's collections, tags, and artwork are the organising structure. A collection can be a row. Artwork never changes to bait a click (§2.3). |
| **Local signals, kept local.** | A service has the signals but uses them centrally, and the viewer cannot see or reset them. | History lives on the user's own server, per account. A profile can be shown, explained ("because you watched …"), reset, or turned off. Nothing leaves the server. |
| **No ads, no outside content.** | Ad tiers and promotions pay (§2.15). | The first screen is the library. |
| **Real accounts.** | A profile is a convenience inside one paid account (§2.5). | Each person has their own server account, password, and parental limits. The client's job is not to weaken that. |
| **The file is known.** | A service hides delivery. | Fluster can show runtime, quality, and languages before play, and say when the server converts (`PRODUCT.md` pillar 4). |

Where a personal library is weaker, to be honest about it:

- **Few viewers.** There is no crowd to learn from. "People who watched this also watched" is not available in a household of four. Recommendations must come from the content and one person's history.
- **Metadata is as good as the owner made it.** Genres, people, and collections may be missing. Jellyscale reads metadata only from files beside the film (`~/Code/jellyscale/PRODUCT.md`, "Non-goals").
- **The server decides what exists.** Skip intro, trickplay, and similar items appear only if the server provides them (§2.10).
- **No editorial voice.** Nobody curates a "new this week" list. Recently added is the only "new".
