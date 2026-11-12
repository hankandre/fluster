# Discovery and profiles: improving on Netflix in a personal library

Status: **Proposal, 2026-11-12. Waiting for the owner's answers to §7.** Nothing here is decided except the two tasks in §6.2, which needed no design choice and were added to `tasks/prd.json` under the `AGENTS.md` "Tasks" rule.

This is the Fable 5.2 product-review pass that the rule names. It triages the discovery entries in `tasks/backlog.md` and the proposals below.

## The owner's direction (2026-11-12)

Relayed by the coordinating agent. These are the words this proposal works from.

- "I'm willing to consider Netflix's user experience, but there's a lot of people who have complaints about it. So I think we have an opportunity here to improve even on Netflix."
- On profiles: show "Who's watching?" only when several users are signed in, "because some users may not appreciate other people kind of looking into their account or watching on their account."
- "Another opportunity for improvement here is discoverability because Netflix does a pretty good job of surfacing new content, but oftentimes they're just looking for something that you're going to binge."
- "How can we create a really good profile. And this is probably a good opportunity to leverage AI at some point in time. And maybe we'll do that with Jellyscale here in the future": a profile built from the last film or episode watched, to judge "where their mind space is and what content might actually be helpful for them to watch next. Obviously, if they're watching a TV series, they're going to want to binge that TV series most likely."
- "We should also do a ton of product research into the gripes and frustrations that people have with Netflix and its UX and see if there are ways for us to improve on it. Obviously, this is a personal library software so it's a bit different."

## Inputs and limits

- [`docs/research/streaming-ux-gripes.md`](../../research/streaming-ux-gripes.md), written for this proposal. "Gripes §n" points into it.
- [`docs/research/jellyfin-clients.md`](../../research/jellyfin-clients.md) and [`product-review.md`](product-review.md) with its answers and direction update.
- `PRODUCT.md`, `DESIGN.md`, `ARCHITECTURE.md` §4, `DOMAINS.md` §2, `tasks/backlog.md`, and `tasks/prd.json` at `e1d1341`.
- Fluster's code at the same commit: `src/lib/jellyfin/gateway.ts`, `src/features/home/`.
- The Jellyfin TypeScript SDK that Fluster pins (`@jellyfin/sdk` 1.0.2 in `node_modules`), for route names, parameters, and response shapes.
- Jellyfin's server source on `master` for what two routes compute.
- Jellyscale at `93a0f3f`: `compat/endpoints.yaml`, `docs/status.md`, `ARCHITECTURE.md`, `PRODUCT.md`.

Limits:

- No Jellyfin route named here was called against a server for this proposal. What each returns on 10.11.7 and 12.4.0 is **unverified** until P16-01 records fixtures.
- `codebase-memory` has no index for this repository, so the code map came from `semble` and direct reads.
- The research could not read Reddit or app-store reviews.

Sizes: **S** is one pull request, **M** is two or three, **L** needs its own execution plan.

---

## 1. Improve-on-Netflix principles

Proposed for `PRODUCT.md` once the owner agrees. Each one answers a gripe and uses an advantage a subscription service does not have (Gripes §4).

| # | Principle | Answers | What it means in Fluster |
|---|---|---|---|
| N1 | **Nothing plays until you ask.** | Gripes §2.1 | No preview, trailer, or sound starts on focus or hover. Trailers play when the viewer presses Trailer. The Home backdrop stays a still image (`DESIGN.md` §7.2). |
| N2 | **Home stays where you left it.** | Gripes §2.3 | The rows and their order are the same on every visit. A row's contents change only when the library or the viewer's history changes. Artwork is the library's own and never changes to attract a click. |
| N3 | **Your next episode comes first.** | Gripes §2.4, §2.9; the owner's "binge that TV series" | The first thing on Home is what the viewer was in the middle of. In a series that is the next episode. One press plays it. |
| N4 | **A few good suggestions, with the reason shown.** | Gripes §2.2, §2.8 | Fluster suggests a small number of titles and says why ("Because you watched …"). It never pads Home with rows to scroll. Success is finding something in under a minute, not watching longer. |
| N5 | **The whole library is one step away.** | Gripes §2.7, §2.12 | Every row leads to a full, sortable, filterable list. Search returns what the library has and says plainly when it has nothing. |
| N6 | **You can clear what you gave up on.** | Gripes §2.4 | An abandoned title can be removed from the first row, and the viewer is told what that does to its saved position. |
| N7 | **The end of a film is the end.** | Gripes §2.9 | Credits play at full size. Nothing unrelated starts by itself. Next-episode auto-play in a series has a visible countdown, a Hide button, and an off switch (`DESIGN.md` §7.15, P3-23). |
| N8 | **Your account is yours.** | Gripes §2.5, §2.13; the owner's privacy reason | Remembering several accounts must not let one person browse another's. What Fluster knows about a viewer stays on that viewer's server, under their account. |
| N9 | **The profile is visible and yours to reset.** | Gripes §2.8 | When Fluster or the server builds a picture of what a viewer likes, the viewer can see the reason behind each suggestion, and can turn it off or clear it. |
| N10 | **Nothing from outside.** | Gripes §2.15 | No ads, no promoted titles, no content that is not in the library, and no third-party service (`PRODUCT.md` principle 6). |

N1, N7, and N10 are already true of Fluster. Writing them down keeps them true. N2 to N6, N8, and N9 need the work in §2 to §5.

---

## 2. Discoverability for a personal library

### 2.1 Where Fluster is today

- Home shows a hero, then "Continue watching", "Next up", and one "Latest in {library}" row per library (`src/features/home/home-view.tsx`, `DESIGN.md` §7.3 and §7.4).
- The hero is the first Continue Watching item, else the first Next Up item, else the first item of the first non-empty Latest row (`src/features/home/hero-pick.ts`).
- The gateway calls `/UserItems/Resume`, `/Shows/NextUp` (with `enableRewatching: false`), `/Items/Latest`, and `/UserViews` for Home (`src/lib/jellyfin/gateway.ts` lines 383 to 478).
- Inside the player, the Up Next card offers the next episode with a countdown (`DESIGN.md` §7.15, P3-10 done).
- Fluster calls none of `/Items/{id}/Similar`, `/Items/Suggestions`, `/Movies/Recommendations`, `/Genres`, `/Persons`, or the trailer routes. The detail page's `PersonRow` cards are "not interactive" (`DESIGN.md` §7.7).
- `DESIGN.md` has no "More like this", genre page, people page, or trailer control. Each is a new design choice, so each is a question in §7.

The order is already stable and already binge-first in spirit. What is missing is everything after "I finished it": Fluster has no answer to "what next?" once a series ends or a film finishes.

### 2.2 Binge-first "Up next"

One rule, used by the hero and the first row, decides what the viewer most likely wants. It reads only what the server already returns.

Proposed order. The first rule that matches wins:

1. **Something is in progress.** Take the in-progress item played most recently. An episode resumes; a film resumes.
2. **The last thing finished was an episode, and its series has another.** Offer that next episode. This is the owner's binge case, and it ranks above an older half-watched film because it is where the viewer's attention is.
3. **The last thing finished was a film in a collection with an unwatched entry.** Offer the next film in the collection (the sequel case).
4. **The last thing finished has nothing after it** (a film, or the last episode of a series). Offer the first title from "More like this" for that item, unwatched only (§2.3).
5. **No history.** Offer the newest addition, as today.

Rules 1 and 2 swap places compared with today's hero, which always prefers Continue Watching over Next Up whatever their dates. Which one should win when both exist is the owner's call (Q2).

What it needs:

- Rule 1 and 2 need the last-played date on Resume and Next Up items, to order across the two lists. `UserData.LastPlayedDate` exists in the SDK's `UserItemDataDto`; whether `/Shows/NextUp` items carry a date that reflects the series' last play is **unverified** (P16-01).
- `/Shows/NextUp` accepts `enableResumable`, which adds in-progress episodes to its own list (SDK `show-api.d.ts`). It does not cover films, so a merged row still needs `/UserItems/Resume`.
- Rule 3 needs the collections an item belongs to. Jellyscale lists `/Items/{itemId}/Collections` as a stub; the pinned SDK has no method for that path, so its shape on Jellyfin is **unverified** (P16-01).
- The rule is a pure function over cards. It belongs in `src/domain/` beside `hero-pick.ts`'s logic, with no React or HTTP import (`AGENTS.md` hard rule).

A bug this exposes today: when the hero shows a series from a Latest row, Play starts its first episode, not the episode the series page would start (`tasks/backlog.md`, P13-10 follow-up). That needs no design choice and is task **P3-27** (§6.2).

### 2.3 "Where their mind space is"

The owner's idea is to read the viewer's state from the last film or episode. A personal library has few viewers, so there is no crowd to learn from (Gripes §4). The signal has to come from one person's recent history and the content's own metadata. Stage one is rules.

| What just happened | What it suggests about the viewer | What Fluster offers |
|---|---|---|
| Finished an episode; more exist | In the middle of a series | The next episode (§2.2 rule 2). Nothing else competes with it. |
| Finished a season finale or the last episode | Just closed a story; open to something new of that kind | One row: "Because you watched {series}", from Similar, unwatched only |
| Finished a film | Same, for film | One row: "Because you watched {film}"; the collection's next film first when there is one |
| Stopped early and did not come back | Did not like it, or was interrupted | It is not used as the anchor for suggestions. It can be removed from the first row (N6). |
| Watched the same title again | A favourite | Counts for more when a profile is built (§3) |
| Marked Favorite | A stated preference | Same |

Rules for the row itself:

- **One anchor, one row.** At most one "Because you watched" row, anchored on the last finished title. Netflix shows many; N4 says a few good suggestions.
- **Unwatched only**, so it never suggests what the viewer has seen.
- **Stable.** The row changes when the anchor changes, that is, when the viewer finishes something else. It does not reshuffle on each visit (N2). Jellyfin's `/Items/Suggestions` cannot be used for this: it orders at random on every call (see §2.6).
- **Hidden when empty.** A library with thin metadata gets no row, not a bad one (`DESIGN.md` principle 1 and §7.4).

Later signals, for the profile in §3: the time of day and the runtime (a three-hour film at 23:00 is a poor suggestion), the device (TV or desk), and how often a viewer finishes what they start in a genre. None of these is proposed for stage one.

### 2.4 Rows that stay stable

Proposed rule for Home (Q1 asks the owner to confirm or change it):

1. The hero (§2.2).
2. The viewer's own row or rows: what is in progress and what is next (Q2: one row or two).
3. At most one "Because you watched" row (Q6).
4. "Latest in {library}", one per library, in the server's library order.

Nothing else appears on Home unless the owner adds it. The order never depends on a ranking model. A row that has nothing to show is hidden, and the rows below keep their relative order.

Two things can still move a row's contents, and both are the viewer's or the library's doing: playing something, and new media arriving. New items do not appear without a restart today (`tasks/backlog.md`, `LibraryChanged`); that entry stays in the backlog and is not part of this proposal.

Letting the viewer reorder or hide rows is what Plex, Emby, and Jellyfin users ask for (Gripes §3). It is a larger design question and is offered as an option in Q1, not recommended for now.

### 2.5 More like this, genres, trailers, people

| Feature | Jellyfin route | In Fluster today | In Jellyscale today (`compat/endpoints.yaml`, `docs/status.md`) | Question |
|---|---|---|---|---|
| More like this | `GET /Items/{itemId}/Similar` | Not called | **Stub.** "Similar items: not built. In scope." | Q5 |
| Because you watched | `GET /Items/{itemId}/Similar` on the anchor; or `GET /Movies/Recommendations` for films | Not called | Similar is a stub; `/Movies/Recommendations` is not in the route list | Q6 |
| Genre pages | `GET /Genres`, then `GET /Items?genreIds=` | Genres show in the facts line as text | **`/Genres` is a stub.** "Genres, studios, persons and their pages and images: not built. In scope. The pages list them through `GET /Items` filters." | Q7 |
| People pages | `GET /Items?personIds=` for a person's titles; `GET /Persons` lists people | `PersonRow`, not interactive; images come with P15-03 | **`/Persons` is a stub.** `GET /Persons/{name}` is a non-goal there | Q8 |
| Trailers and extras | `GET /Items/{itemId}/LocalTrailers`, `GET /Items/{itemId}/SpecialFeatures`; `RemoteTrailers` on the item for web links | Not called | **Stubs.** "Extras: trailers, theme songs and videos and special features answer empty lists or 404." | Q9 |
| Filter chips a library can match | `GET /Items/Filters2` | Not called (`tasks/backlog.md`) | **Stub** | Stays in the backlog |

Each of these degrades to nothing on a server that returns an empty list: the row or button is hidden. So Fluster can build them against Jellyfin now and they light up on Jellyscale when its routes do.

### 2.6 What Jellyfin's API already gives

Read from the pinned SDK and the server source. "Gives" means the route exists; what it returns on 10.11.7 and 12.4.0 is recorded by P16-01.

| Need | Route | What it does | Good enough? |
|---|---|---|---|
| In progress | `GET /UserItems/Resume` | The viewer's partly played items | **Yes.** In use. |
| Next episode | `GET /Shows/NextUp` | The next unwatched episode per series; `enableResumable`, `enableRewatching`, and `nextUpDateCutoff` tune it (SDK `show-api.d.ts`) | **Yes.** In use. **A stub in Jellyscale** ("Next up and filters: not built. In scope."), so Fluster's Next Up row is empty there today. |
| Newest | `GET /Items/Latest` | Recently added, per library | **Yes.** In use. |
| Similar | `GET /Items/{itemId}/Similar` | On `master`, providers produce the list. Local providers are always on; remote ones "must be explicitly enabled". Results are filtered to libraries the user can see (https://raw.githubusercontent.com/jellyfin/jellyfin/master/Emby.Server.Implementations/Library/SimilarItems/SimilarItemsManager.cs) | **Probably.** It is per item, not per viewer, and it does not drop watched titles, so Fluster filters them. The 10.11 behaviour is **unverified**. |
| Film recommendations | `GET /Movies/Recommendations` | Rows built from the seven most recently played films and up to ten liked or favourite films: "similar to", "has director from", "has actor from" (same source file; SDK `RecommendationType`) | **Partly.** Films only; no series equivalent. Several rows, which N4 argues against. Useful as a source for one row. |
| Suggestions | `GET /Items/Suggestions` | Random order: `OrderBy = new[] { (ItemSortBy.Random, SortOrder.Descending) }`, with no use of history (https://raw.githubusercontent.com/jellyfin/jellyfin/master/Jellyfin.Api/Controllers/SuggestionsController.cs) | **No.** It reshuffles on every call, against N2, and is not personal. |
| Genres | `GET /Genres`; `GET /Items?genreIds=` | The genres in a library; items in a genre | **Yes.** |
| People | `GET /Persons`; `GET /Items?personIds=` | People; a person's titles | **Yes.** |
| Trailers, extras | `GET /Items/{itemId}/LocalTrailers`, `/SpecialFeatures` | Files the owner stored beside the film | **Yes**, when the library has them. |
| History signals | `UserData` on every item: `Played`, `PlayCount`, `LastPlayedDate`, `PlaybackPositionTicks`, `PlayedPercentage`, `IsFavorite`, `Likes` (SDK `user-item-data-dto.d.ts`) | Per viewer, per item | **Yes** for rules. It is a summary, not a history: one last-played date per item, no list of sessions. |
| Remove from Continue Watching | none | Requested since 2020 (1,740 votes). A flag is proposed upstream and lives on a fork (https://github.com/jellyfin/jellyfin-meta/discussions/136). A reported workaround resets the position with `POST /UserItems/{itemId}/UserData` (https://github.com/jellyfin/jellyfin-meta/discussions/50) | **Workaround only, unverified** on 10.11 and 12.4 (P16-01). It loses the resume position. |
| Watchlist | none | 1,306 votes; no server feature ([`jellyfin-clients.md`](../../research/jellyfin-clients.md) §5) | **No.** Favorites is the nearest thing (Q10). |

### 2.7 What needs new server-side work

| Need | Why the client can't do it well | Where |
|---|---|---|
| A viewer profile that spans devices | A client sees one device's sessions and a summary per item. Two clients would compute two answers. | Server (§3.2) |
| Recommendations for series, not just films | `/Movies/Recommendations` is films only | Server |
| A real watch history (sessions, abandonments, rewatches) | `UserData` keeps one date and a count | Server. Jellyfin has a proposal (meta discussion #136). |
| Remove from Continue Watching that keeps the position | No flag exists | Server |
| A watchlist | No route exists | Server |
| Stable suggestions | `/Items/Suggestions` is random per call | Server, or Fluster avoids the route |
| Jellyscale: Next Up, Similar, Genres, Persons, trailers, filters | Stubs today | Jellyscale (§3.4) |

---

## 3. Viewer profile and AI

### 3.1 A staged plan

Each stage is useful by itself and none depends on AI arriving.

| Stage | What | Signals | Where it runs | Needs |
|---|---|---|---|---|
| **0. Rules in the client** | §2.2 "Up next" and one "Because you watched" row | Resume, Next Up, last-played dates, Similar, Played | Fluster's TypeScript core (`src/domain/`), shared with the TV shell | P16-01, then the tasks behind Q2, Q5, Q6 |
| **1. Rules on the server** | The same answers, computed once per account so every client and device agrees | The server's own watch records | Jellyscale; on Jellyfin, Fluster keeps stage 0 | A Jellyscale recommendation route (§3.4) |
| **2. A taste profile, no AI** | A weighted picture of what the viewer finishes: genres, people, decades, runtimes. Favourites and recent plays count for more. Unwatched titles are ranked against it. | Watch history and library metadata only | Jellyscale workers | Stage 1's route; the profile is a table per account |
| **3. AI, on the user's own hardware** | Text embeddings of overviews for "like this, in tone"; a short written reason; a "what am I in the mood for" query | The same, plus overviews | A model the operator runs inside their own cluster | Stage 2; an opt-in per account |

Stage 2 is known to work at this scale without AI. A Jellyfin plugin does it with TF-IDF vectors over genres, people, tags, decades, and ratings, a per-user profile weighted towards favourites and recent plays, and cosine similarity against unwatched items, all on the server (https://github.com/rdpharr/jellyfin-plugin-localrecs). Its weakness is delivery: a plugin cannot add rows to clients, so it shows results as extra libraries, and its author will not update it for Jellyfin 12. A server that owns its API and a client built for it do not have that problem. That is the opening Fluster and Jellyscale have together.

What stage 3 adds over stage 2 is judgement about tone and mood from text, which metadata tags do not carry. It should come last because it costs the most to run and is the hardest to explain to the viewer (N9).

### 3.2 Where it should live

**Recommendation: the profile lives on the server. Fluster computes stage 0 itself and asks the server from stage 1 on.**

| Place | For | Against |
|---|---|---|
| **The client** | Works on any Jellyfin today. No server change. | It sees a summary, not a history. Each device computes its own answer, so the TV and the laptop disagree. A profile stored on a device is lost with it and is readable by whoever uses that device, which is the owner's privacy concern in another form. TV hardware is weak. |
| **A Jellyfin plugin** | Reaches existing Jellyfin users. | Fluster would own .NET code tied to the server's plugin ABI; the one existing plugin is being abandoned over exactly that. Jellyscale has no plugins by design (`~/Code/jellyscale/PRODUCT.md`, "Non-goals"). No client would show the result without client work anyway. |
| **Jellyscale** | The watch records are already there, per account, behind the account's sign-in. One answer for every device. Workers exist for batch work and Postgres for storage. The owner controls both ends, so the API can carry a reason and a stable row id. It is where the owner pointed. | Jellyfin users get stage 0 only. The work is in another repository with its own agents. |

The client keeps three jobs at every stage: asking, presenting (with the reason), and keeping the order stable. It may also pass what only it knows, such as the local time and the kind of device, as hints on the request.

### 3.3 Privacy

Rules proposed for any profile work, in either repository:

1. **Per account.** A profile belongs to one server account. No profile is shared across the accounts on a device or on a server. A household-wide "what we watch" is out unless the owner asks for it.
2. **On the user's own server.** The profile is computed and stored on the server the account belongs to. Fluster stores no profile on the device. With stage 0, Fluster computes from responses it already holds in memory and keeps nothing.
3. **Nothing leaves.** No analytics, no third-party recommendation or metadata service, no hosted model (`PRODUCT.md` principle 6; Jellyscale's "Metadata comes from files beside the film, not from outside services"). A stage 3 model runs on hardware the operator controls.
4. **Explained.** Every suggestion carries its reason, and Fluster shows it (N4, N9).
5. **Off and reset.** The viewer can turn suggestions off and clear the profile. Clearing the profile does not clear watched state.
6. **Not visible to other accounts.** An administrator of a self-hosted server can already read watch state. The profile must not make another ordinary account's habits visible, in the API or in the UI.
7. **No secrets in it.** The profile route is an ordinary authenticated API call through `src/lib/jellyfin/gateway.ts`. It adds no token storage and no new Tauri command.

### 3.4 Proposals for Jellyscale (for the owner to carry over)

These are **not tasks**. Jellyscale has its own task list and agents. The owner decides whether and when to carry any of them over.

**A. Fill the routes a streaming-service Home needs.** All are in Jellyscale's scope already, per its `docs/status.md`:

1. `GET /Shows/NextUp`. Fluster's "Next up" row and the binge rule depend on it. It is a stub.
2. `GET /Items/{itemId}/Similar`, from library metadata.
3. `GET /Genres` and `GET /Persons`, with `genreIds` and `personIds` filters on `GET /Items`.
4. `GET /Items/{itemId}/LocalTrailers` and `/SpecialFeatures`.
5. `GET /Items/Filters2`.

**B. Things found while reading, relevant to Fluster's first test against Jellyscale** (added to the Jellyscale entry in `tasks/backlog.md`):

- `/Search/Hints` answers 404 there, because jellyfin-web searches through `GET /Items`. Fluster's search suggestions call `/Search/Hints` (`gateway.ts`, `searchHints`).
- Media segments are "not built"; segments will come "only from data an operator provides or from chapter markers". Fluster's Skip intro depends on `/MediaSegments`.
- Likes and ratings (`/UserItems/{itemId}/Rating`) answer 404 by decision. A profile that wants a "liked" signal has Favorite only.
- `compat/endpoints.yaml` lists `/Items/Suggestions` as implemented while `docs/status.md` says Suggestions are "not built". One of the two is out of date.

**C. A recommendation API, at a high level.** One additive route, outside Jellyfin's namespace so that no existing client is confused by it:

- **Request.** "Give me this account's suggestions for this place": Home, or after finishing a named item. Optional hints from the client: local time, device kind, how many rows it will show.
- **Response.** A short list of rows. Each row has a stable id, a kind (next episode, because you watched, more from a collection, unwatched in a favourite genre), a reason the client can show (the kind plus the title it is based on), the items in Jellyfin's usual item shape so that existing card code renders them, and a time until which the row will not change.
- **Controls.** Read the account's settings (on or off), clear the profile, and "not this one" for a single suggestion.
- **Discovery.** Fluster learns the route exists from the server, not from the product name, and falls back to stage 0 when it does not.

How it would fit Jellyscale's architecture (`~/Code/jellyscale/ARCHITECTURE.md`):

- The `api` role answers from a stored result. Workers compute profiles and rows as pulled jobs, so no role calls another (rules 2 and 3).
- Postgres stays the only required service (rule 5). At household or community scale, similarity over a few thousand titles needs no vector service.
- The design states its cost (rule 6): one recompute per account when that account finishes something, not per request.
- Stage 3's model is optional. A cluster without one still serves stages 1 and 2. This keeps "nothing leaves" and "no required service" true.
- Unmodified Jellyfin clients gain from part A and are unaffected by part C, which keeps Jellyscale's goal 3 ("Current Jellyfin clients work unmodified").

Jellyscale's `PRODUCT.md` says viewers "never need to know jellyscale exists" and lists "a jellyscale-branded client" as a non-goal. A route only Fluster calls is a step past that. Whether Jellyscale's product statement should change is the owner's decision there, not something this proposal assumes.

---

## 4. Profile privacy

### 4.1 What is decided

- One signed-in account opens straight away. Two or more signed-in accounts show "Who's watching?" (owner, 2026-11-12; P13-21; `DESIGN.md` §7.21).
- A PIN per profile: "not now; revisit with TV" (Q11 in the product review; `tasks/backlog.md`).
- "Stay signed in" is chosen per account at sign-in and is on by default when a keyring is available (P3-02).

### 4.2 Does the owner's new reason change Q11?

**It strengthens the case and exposes a gap, but it does not by itself require a PIN now.**

The owner's reason for showing the picker only with several accounts is that people "may not appreciate other people kind of looking into their account or watching on their account". The picker as designed does not prevent that. With two signed-in accounts, anyone at the computer can choose either tile and is in. The picker tells people whose account they are opening; it does not stop them.

Two facts bound how much a PIN can do:

- A Jellyfin account already has a real boundary, its password. An account that is **not** kept signed in on this device cannot be opened without it. P3-02 already builds that switch.
- A local PIN is a courtesy lock. Anyone with the OS login can read the keyring (product review §3.5). It stops a housemate at the sofa; it does not stop someone determined.

Where the risk is highest matters. On a desktop, people usually have their own OS login or their own computer. On a TV, everyone shares one device and typing a password with a remote is painful (Gripes §2.14), so "sign in each time" is a poor answer there and a PIN is the practical one. That is the same conclusion as Q11's "revisit with TV", now with a reason attached.

A second gap is the owner's "watching on their account". When someone watches on another person's account, that person's Continue Watching and history change. A lock prevents it. A softer answer is a session that does not report playback, but that breaks resume and touches Playstate Reporting, so it is only noted in the backlog.

### 4.3 Options

- **A. Keep Q11 as answered.** No PIN until the TV shell. Nothing new on desktop.
- **B. Use what is already being built.** Make "Stay signed in" the privacy control and say so: an account with it off asks for the password (or Quick Connect) every time, shows as "Signed out" in the picker, and does not count towards showing the picker. No PIN, no new storage, no new Tauri command. The cost is copy at sign-in and in Settings › Accounts, and a way to change the switch for a saved account.
- **C. A PIN now, with the account switcher.** An optional PIN per account on this device, asked when switching to it. It needs a place to keep the PIN's hash in the keyring, which is a new Tauri command and so an architecture change (`ARCHITECTURE.md` I3), plus a "forgot PIN" path (sign in again).
- **D. B now, C with the TV shell.**

**Recommendation: D.** B closes the gap the owner named on desktop at almost no cost and with a real boundary, not a courtesy one. C arrives where it is needed, with the TV shell, and "revisit with TV" becomes "ships with the TV shell's account picker". This is Q11 in §7.

---

## 5. Invariants and rules this proposal touches

None is changed. Each task below must hold them.

| Rule | Where | How this proposal meets it |
|---|---|---|
| Only the gateway talks to Jellyfin (I8) | `ARCHITECTURE.md` §4 | Every new route is a typed method in `src/lib/jellyfin/gateway.ts` with a gateway test. |
| `src/domain/` has no React, SDK, Tauri, or HTTP imports | `AGENTS.md` | The "Up next" rule is a pure function in `src/domain/`. |
| Media URLs are built only in Playback Negotiation; original first (I1, I2) | `AGENTS.md`, `ARCHITECTURE.md` §4 | A trailer or extra is an item id handed to Playback Negotiation like any other. No YouTube or web trailer is embedded. |
| The browser engine is never a fallback (I7) | `ARCHITECTURE.md` §4 | Remote web trailers would need a browser player, so Q9 recommends local trailers only. |
| No new Tauri command without an architecture change (I3) | `AGENTS.md` | Nothing in §2 or §3 needs one. A local PIN (option C in §4.3) would. |
| Tokens never stored in WebView storage, Query caches, or React state; never logged (I4) | `AGENTS.md` | No task adds token handling. Fixtures are scrubbed (P16-01). |
| Private by default: no analytics, no third-party services | `PRODUCT.md` principle 6 | §3.3 rules 2 and 3. |
| Catalog code never builds stream URLs or decides playability | `DOMAINS.md` §2 | Discovery lives in Catalog and hands item ids on. |
| Every screen works with arrows, Enter, and Escape; UI follows `DESIGN.md` | `AGENTS.md` | Each UI task carries the TV-form, screenshot, and design-review lines. `DESIGN.md` gains sections for each new component after the owner's answers. |
| The owner makes design calls | owner's standing instruction | Every new row, page, and control is a question in §7. Only §6.2 was added without one. |

---

## 6. Backlog triage

### 6.1 Entries triaged

From `tasks/backlog.md` at `e1d1341`.

| Backlog entry | Outcome | Why |
|---|---|---|
| The Home hero for a series plays its first episode; use `seriesNextUp` | **Task P3-27, added** | A defect against "one obvious next action". The fix copies what the series page already does. No design choice. |
| Playlists, extras and trailers, genre and people pages (M each) | **Split.** Trailers and extras: proposed P16-08 (Q9). Genre pages: proposed P16-06 (Q7). People pages: proposed P16-07 (Q8). Playlists: **stays in the backlog.** | Each of the first three is a new screen or control. Playlists are not part of a streaming-service feel, no research in either document shows demand for them in a video client, and Jellyscale lists no playlist route. |
| Remove an item from Continue Watching, and a watchlist | Removal: proposed P16-03 (Q4), after P16-01 verifies the server behaviour. Watchlist: Q10. | Removal has 1,740 votes and is principle N6. How it behaves is a design choice because the only route today loses the resume position. |
| Cast (`PersonRow`) on the series page | **Folded into proposed P16-07** (Q8) | Where the row sits on the series page is a layout choice, and it is the way into people pages for a series. |
| Hide filter chips a library cannot match (`/Items/Filters2`) | Stays in the backlog. P16-01 records the route. | Not discovery. The fixture removes its "unverified". |
| New items appear without a restart (`LibraryChanged`) | Stays in the backlog | Not discovery. Related to N2 only in that it is the one legitimate reason a Latest row changes. |
| A PIN per profile (Q11, not now) | Q11 in §7, with the new rationale | §4 |
| A "Still watching?" prompt (Q16, not now) | **Stays deferred.** No change proposed. | Gripes §2.6: a mild complaint, and Netflix's place-keeping reason applies. Nothing in the research argues for bringing it forward. |
| Test Fluster against Jellyscale | Stays. **Notes added** (§3.4 B). | The stubs and 404s found here belong with that entry. |

### 6.2 Tasks added to `tasks/prd.json`

Two tasks. Neither needs a design choice. Both follow existing tasks' shape.

**P3-27. Play a series' next episode from the Home hero.** Priority: high. Size S. Model: Sonnet (`implementer`). Domain: Catalog.

- Place: the end of phase P3, after P3-26. It is a daily-driver defect, so it sits with the daily driver. P4-01's dependency list is not edited, so the dogfood week does not wait for it.
- Depends on: P13-08, P13-10 (both done).
- Acceptance:
  1. When the Home hero shows a series, its primary action starts the episode the series page's primary action would start, resuming it when that episode has a saved position.
  2. The hero's primary label and facts line name that episode in the same words the series page uses (`DESIGN.md` §7.7, series).
  3. The hero uses the gateway's existing `seriesNextUp`; no new server route is called, and no playback request changes.
  4. Unit tests cover a series with an episode in progress, a series not started, and a series fully watched; in each the hero and the series page agree.
  5. A Playwright journey starts playback from the hero of a series and from its series page and asserts the same episode.
  6. The TV-form, screenshot, design-review, and "no journey weakened" lines that every UI task carries.
- Verify: `pnpm check && pnpm test:e2e && pnpm test:visual`

**P16-01. Record discovery contract fixtures for 10.11 and 12.x.** Priority: medium; it unblocks every other discovery task. Size S to M. Model: Sonnet (`implementer`, `jellyfin-api` skill). Domain: Catalog.

- Place: the first task of a new phase, **P16 "Discovery"**, placed after P15 and before P5 in the file. The phase's goal is the owner's own direction: finishing something always leads to a good next thing to watch, from the library, without scrolling. Further P16 tasks are added after the answers to §7.
- Depends on: P0-02, P0-03 (both done).
- Acceptance:
  1. Fixtures from Jellyfin 10.11.7 and 12.4.0 for `GET /Items/{itemId}/Similar`, `/Items/Suggestions`, `/Movies/Recommendations`, `/Genres`, `/Persons`, `/Items/{itemId}/LocalTrailers`, `/Items/{itemId}/SpecialFeatures`, and `/Items/Filters2`, and for `/Items` filtered by `genreIds` and by `personIds`.
  2. Fixtures for `/UserItems/Resume` and `/Shows/NextUp`, with and without `enableResumable`, that show whether each item carries a last-played date a client can sort the two lists by.
  3. A recorded sequence shows what `POST /UserItems/{itemId}/UserData` with a zero position does on each version: whether the item leaves `/UserItems/Resume`, and what happens to `Played`, `PlayCount`, and `LastPlayedDate`.
  4. A fixture or a recorded 404 shows how each version reports the collections an item belongs to.
  5. The synthetic sample set gains what these need (genres, people, a collection, a local trailer, and an extra, as files beside the samples) without third-party media, and `tests/samples/README.md` lists them.
  6. `docs/research/discovery-api.md` states, per route and version, what the response holds, and beside it the route's status in Jellyscale's `compat/endpoints.yaml`; every "unverified" in `docs/plans/proposals/discovery-and-profiles.md` §2 that the fixtures settle is updated.
  7. Fixtures are scrubbed per the `jellyfin-api` contract-fixtures reference; no gateway method, playback request, or UI changes.
- Verify: `pnpm test -- fixtures && ls tests/fixtures/jellyfin/*/`

### 6.3 Tasks proposed, waiting for answers

Not in `tasks/prd.json`. Ids are provisional. Each is written so that it can be added as it stands once its question is answered with the recommended option; a different answer changes the acceptance.

Every UI task also carries the four standard lines (TV form; screenshots at 1440×900 and 1920×1080; fresh-context design review; no journey skipped, deleted, or weakened) and "`DESIGN.md` matches what ships". They are not repeated below. Verify for each UI task: `pnpm check && pnpm test:e2e && pnpm test:visual`.

**P16-02. Keep Home stable and lead with what's next** (Q1, Q2). Priority: high. Size M. Sonnet. Depends on P16-01, P3-27.

1. Home's rows appear in one fixed order, documented in `DESIGN.md` §7.4, on every visit and for every account.
2. A pure function in `src/domain/` picks "Up next" by the rules in §2.2 as answered in Q2; unit tests cover each rule and each tie.
3. The hero and the first row use that function, so they never disagree.
4. The viewer's in-progress and next-episode items are shown as answered in Q2 (one row or two), ordered by last play.
5. A row with nothing to show is hidden and the others keep their order; a unit test loads Home twice with the same fixtures and asserts the same row order and card order.
6. A Playwright journey finishes an episode and finds the next episode first on Home.

**P16-03. Remove a title from Continue Watching** (Q4). Priority: high. Size S. Sonnet, `jellyfin-api`. Depends on P16-01, P13-26, P13-20.

1. A card in the in-progress row offers "Remove from Continue watching" from its menu (`i`, Menu on TV, or right-click), without changing what Enter does.
2. The gateway call is the one P16-01 verified on 10.11.7 and 12.4.0; a gateway test asserts the request.
3. Before removing, Fluster says what will be lost (the saved position) in the words the owner approves; after, a toast offers Undo, which restores the position.
4. The row and the hero update without a reload.
5. When the server offers a flag that hides an item without clearing its position, Fluster uses it; until then that path is absent, not stubbed.
6. A Playwright journey removes a title, undoes it, and removes it again.

**P16-04. Show "More like this" on movies and series** (Q5). Priority: medium. Size S. Sonnet, `jellyfin-api`. Depends on P16-01.

1. The detail page for a movie and the series page show a "More like this" `MediaRow` of posters from `GET /Items/{itemId}/Similar`, with titles the viewer has finished left out.
2. The row is hidden when the server returns nothing, including a server where the route is a stub.
3. The request carries only the fields a card needs; a gateway test asserts it; no playback request changes.
4. The row's order is the server's and does not change between visits while the library and the viewer's history are unchanged.
5. A Playwright journey opens a title from the row.

**P16-05. Suggest one row after you finish something** (Q6). Priority: medium. Size M. Sonnet. Depends on P16-02, P16-04.

1. Home shows at most one "Because you watched {title}" row, anchored on the last title the viewer finished, in the position Q1 gives it.
2. The row holds unwatched titles only, and names its anchor in its heading.
3. The row changes only when the anchor changes; a test loads Home twice and asserts the same cards.
4. A title the viewer stopped early is never the anchor; the threshold is a named constant with a unit test.
5. Settings has a switch that turns the row off (once P13-17 and P3-22 exist).
6. The row is hidden when there is no anchor or nothing to suggest.
7. `/Items/Suggestions` is not used.

**P16-06. Browse by genre** (Q7). Priority: medium. Size M. Sonnet, `jellyfin-api`. Depends on P16-01.

1. A genre in a title's facts line opens that genre: the library grid filtered to it, with the usual sort and filters.
2. The library toolbar offers genres as a filter, from `GET /Genres` for that library.
3. Home gains no genre row unless Q7 says so.
4. A genre with no titles the viewer may see is never offered.
5. The route is part of the URL, so Back and focus restore work (P13-24).
6. A Playwright journey goes from a title to its genre and to another title.

**P16-07. Open a person's titles; show cast on the series page** (Q8). Priority: low to medium. Size M. Sonnet, `jellyfin-api`. Depends on P15-03, P16-01.

1. The series page shows the cast `PersonRow`, in the position the owner approves.
2. A `PersonRow` card is a link to a person page: the name, the image (initials as the fallback), and a grid of that person's titles in the libraries the viewer may see, from `GET /Items` with `personIds`.
3. The person page shows only what the library has: no biography or filmography from outside the server.
4. Arrow keys reach every person card, and Enter opens it; `DESIGN.md` §7.7 no longer says the cards are not interactive.
5. A Playwright journey goes from a film to an actor to another film.

**P16-08. Play local trailers and extras** (Q9). Priority: low. Size M. Opus for the spec (it touches Playback Negotiation's inputs); Sonnet to implement; `guardian` review. Depends on P16-01, P3-17.

1. A title with a local trailer shows a Trailer button in the action bar, after the primary action; a title with extras shows an Extras row on its detail page.
2. Nothing plays until the viewer activates it. No trailer starts on focus, on hover, or when a film ends.
3. A trailer or an extra plays through Playback Negotiation by item id like any other item, with the same direct-play rules and conversion indicator; the tripwire still passes.
4. Playing a trailer does not change the title's resume position or watched state, and Back returns to the detail page with focus on the Trailer button.
5. Web trailers (`RemoteTrailers`) are not offered, and no request leaves for a third party.
6. Both controls are absent when the server returns none.

**P16-09. A watchlist** (Q10). No task under the recommended answer: P15-01 already adds the Favorites view. Another answer needs its own task after P16-01.

**P13-27. Keep an account private on this computer** (Q11, option B). Priority: medium. Size S. Sonnet. Depends on P3-20, P13-21.

1. Sign-in and Settings › Accounts explain, in the words the owner approves, that turning "Stay signed in" off makes Fluster ask for the password or a Quick Connect code every time.
2. Settings › Accounts can change "Stay signed in" for a saved account; turning it off removes the stored credential at once.
3. An account with it off shows as "Signed out" after Fluster closes, and does not count towards showing "Who's watching?".
4. No PIN is stored and no Tauri command is added; the command allowlist test is unchanged.
5. A Playwright journey sets an account private, restarts, and finds it asks to sign in.

A local PIN (option C) is not written up as a task. It needs a decision record first because it adds a Tauri command, and it belongs with the task that builds the TV shell.

### 6.4 Proposed order

```text
Now:                P3-27 hero plays the next episode (added)
                    P16-01 discovery fixtures (added)
After the answers:  P16-02 stable Home and Up next → P16-03 remove from Continue watching
                    → P16-04 More like this → P16-05 Because you watched
                    → P16-06 genres → P16-07 people → P16-08 trailers and extras
With accounts:      P13-27 private accounts, after P13-21
Carried to Jellyscale by the owner: §3.4 A, then C
```

P16-02 and P16-03 are the two with the clearest evidence behind them (Gripes §2.3 and §2.4) and are small. They would be worth having before the dogfood week; adding them to P4-01's dependencies is the owner's call, because P4-01 is an existing task.

### 6.5 Added to the backlog by this pass

- A "private session" that plays without reporting, for watching on someone else's account (§4.2). Touches Playstate Reporting. M.
- An end-of-film card that offers "More like this" after the credits finish, never over them (N7). Needs P16-04. S.
- Use the time of day and the runtime to rank suggestions (§2.3). Needs the profile. M.
- Let the viewer reorder or hide Home rows (Q1, option B). M.
- A row for a collection on Home (Gripes §3). S.

---

## 7. Decision list

Twelve questions, in three batches of four. Each stands alone. "Rec" is a recommendation; the owner decides.

### Batch 1: Home

**Q1. How is Home ordered?**
Netflix reorders rows per viewer; users of Plex, Emby, and Jellyfin ask for rows that stay put and for control over them (Gripes §2.3, §3).
- A: One fixed order for everyone, as in §2.4. No setting.
- B: A fixed default, and the viewer can reorder and hide rows in Settings.
- C: Fluster orders rows by what it thinks the viewer wants.
- **Rec: A now; B stays in the backlog.** A is principle N2 at no design cost. B is wanted but is a Settings screen of its own.

**Q2. One row or two for what you're watching, and which comes first?**
Today "Continue watching" (in progress) and "Next up" (next episodes) are two rows, and the hero always prefers the first. Netflix has one row. The owner's binge case is a next episode, which today sits in the second row.
- A: Keep two rows; the hero follows the most recent activity across both.
- B: One "Continue watching" row holding both, most recent first; the hero is its first item.
- C: Keep today's behaviour.
- **Rec: B.** It puts the next episode of the series being binged first, and removes a row. It depends on P16-01 showing that the two lists can be ordered by last play; if they can't, A.

**Q3. Does anything ever play by itself while browsing?**
Autoplaying previews are Netflix's most covered complaint (Gripes §2.1). Fluster plays nothing on focus today.
- A: Never. Write N1 into `PRODUCT.md`.
- B: Never by default; a setting may turn on muted previews later.
- **Rec: A.** A personal library has no reason to compete for attention, and B is the setting Netflix was forced to add in reverse.

**Q4. Removing a title from Continue Watching.**
The most wanted missing feature among Jellyfin users that a client could attempt (1,740 votes). Jellyfin has no flag for it. The only known route resets the saved position (unverified until P16-01).
- A: Build it now on the position reset, with a clear warning and Undo; switch to the server's flag when one exists.
- B: Wait for a server flag that keeps the position.
- C: Build it only for Jellyscale, once it has a flag.
- **Rec: A,** if P16-01 confirms the route on 10.11.7 and 12.4.0. Someone removing a title has given up on it, so losing the position costs little, and Undo covers a mistake.

### Batch 2: finding something new

**Q5. "More like this" on a title's page?**
The server computes it per title (`/Items/{itemId}/Similar`). It is a stub in Jellyscale, where the row would simply not show.
- A: A poster row on movie and series pages, hidden when empty.
- B: Not now.
- **Rec: A.** It is the cheapest answer to "what next?" and the base for Q6.

**Q6. Suggestions on Home after you finish something?**
The owner's "where their mind space is". Netflix shows many such rows; Jellyfin's film recommendations route offers several too.
- A: One row at most, "Because you watched {last finished title}", unwatched only, stable until the viewer finishes something else, with an off switch.
- B: Several rows, as Jellyfin's `/Movies/Recommendations` offers (films only).
- C: None until the server has a profile (§3).
- **Rec: A.** It is principle N4, and it works for series as well as films. It needs Q5.

**Q7. Genres.**
- A: A genre in the facts line opens the library filtered to that genre, and the library toolbar gains a genre filter. No genre rows on Home.
- B: A, plus a few genre rows on Home.
- C: Not now.
- **Rec: A.** Genre rows are how a home screen becomes an endless scroll (Gripes §2.2); a filter gives the same reach on request.

**Q8. People pages.**
Cast cards are not interactive today, and the series page has no cast row.
- A: Cast cards open a page of that person's titles in the library; the series page gains the cast row.
- B: Cast on the series page only; cards stay non-interactive.
- C: Not now.
- **Rec: A,** after P15-03 adds person images. "What else is she in that I own" is a question only a personal library can answer exactly.

### Batch 3: extras, lists, privacy, and the profile

**Q9. Trailers and extras.**
- A: A Trailer button and an Extras row for files stored in the library. Never automatic.
- B: A, plus web trailers.
- C: Not now.
- **Rec: A,** at low priority. B would need a browser player or a third-party request, against invariant I7 and `PRODUCT.md` principle 6.

**Q10. A watchlist?**
1,306 votes on Jellyfin's tracker. No server has one.
- A: Favorites is the watchlist for now; P15-01 already adds the Favorites view. Revisit when a server offers a real one.
- B: Build "My list" on a Jellyfin playlist per account, so that it follows the account to other clients.
- C: Propose a watchlist for Jellyscale and wait.
- **Rec: A.** B makes a private-looking list out of a visible playlist and would not work on Jellyscale, which has no playlist routes.

**Q11. Account privacy on a shared computer.**
"Who's watching?" shows the accounts but lets anyone open any signed-in one, which is what the owner wants to avoid (§4).
- A: No change. A PIN is revisited with the TV shell.
- B: Make "Stay signed in" the privacy control: an account with it off asks for the password every time and does not appear as signed in. No PIN.
- C: An optional PIN per account now. Needs a new Tauri command and a decision record.
- D: B now, and the PIN ships with the TV shell's account picker.
- **Rec: D.** B is a real boundary and nearly free. A PIN matters most on a TV, where typing a password is painful.

**Q12. Where does the viewer profile live?**
- A: In the client only. Works on any Jellyfin; each device computes its own answer.
- B: Rules in the client now; the profile on the server, starting with Jellyscale. Fluster asks the server when it can and falls back to its own rules.
- C: A Jellyfin plugin.
- **Rec: B,** with the privacy rules in §3.3 and AI last (§3.1). This also asks the owner to carry §3.4 into Jellyscale's own backlog.
