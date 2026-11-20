# Discovery routes on Jellyfin 10.11.7 and 12.4.0

Recorded by P16-01 with `tests/integration/record-discovery-fixtures.mjs` on 2026-11-15. Every fact below names the fixture that shows it (`tests/fixtures/jellyfin/<version>/discovery-<name>.json`) and the test that asserts it (`src/lib/jellyfin/discovery-fixtures.test.ts`, the `it` whose name repeats the sentence).

- Servers: `jellyfin/jellyfin:10.11.7` and `jellyfin/jellyfin:12.4.20261026-211555` (reports itself as 12.4.0), from `tests/integration/docker-compose.yml`, on a fresh volume. The recorder reads the synthetic samples in `tests/samples/` (no third-party media).
- Viewer: a non-admin user `octave-discovery`. Only `POST /Library/Refresh` and `POST /Collections` use the admin `octave-test` user.
- Jellyscale: `compat/endpoints.yaml` as last changed by `8720816` (repo HEAD `d0a05e8`). `docs/status.md` there says Suggestions is "partial" (random items of the asked types) while `endpoints.yaml` says "implemented"; the table shows the file's word and this note adds the other.
- Dates: fixed absolute dates (January and June 2026) are set with `POST /UserItems/{id}/UserData`. Both servers keep a client-supplied `LastPlayedDate` (the recorder reads each item back and fails if not), so no fallback was needed.
- Ids in the fixtures are fake (`item-h264`, `series-synthetic`, and so on); the numbered `id-N` values change between recordings.

## 1. Route table

All requests send `userId=<viewer>`. Card-style lists also send `fields=PrimaryImageAspectRatio`, `enableImageTypes=Primary,Backdrop,Thumb,Logo`, `imageTypeLimit=1`, `enableUserData=true`, and `enableTotalRecordCount=false` (the last makes `TotalRecordCount` 0 on lists that honour it). Sample set: 9 playable movies (one renamed by an online match, "Rehabilitation Of Synthetic Human"), one series with two episodes.

| Route and fixture | 10.11.7 | 12.4.0 | Jellyscale |
|---|---|---|---|
| `GET /Items/{itemId}/Similar?limit=12`: `similar-movie`, `similar-series` | `{ Items }` of 3 movies for the H.264 film (ASS, AV1, Extras); never the film itself. Nothing for the series. | The same shape with 4 movies (adds Multitrack). Nothing for the series. | stub |
| `GET /Items/Suggestions?type=Movie,Series&limit=12`: `suggestions` | `{ Items }` of 10 movies and series in no useful order, the watched H.264 film included, each with `UserData`. The renamed film carries provider links (imdb, themoviedb) in `ExternalUrls`; they are real and stay in the fixture. | The same, in another order. | implemented in `endpoints.yaml`; "partial" in `docs/status.md` |
| `GET /Movies/Recommendations?parentId=<movies view>&categoryLimit=5&itemLimit=8`: `movie-recommendations` | A bare array of categories; one: `SimilarToRecentlyPlayed` (baseline: the played H.264 film), 9 items. | A bare array of three: `SimilarToRecentlyPlayed` (4 items), and two `HasActorFromRecentlyPlayed` (Ada Placeholder 2 items, Bo Example 1). | not listed |
| `GET /Genres?parentId=<movies view>`: `genres-movies` | `{ Items }` of type `Genre`: Comedy, Documentary, Drama, Mystery, Science Fiction. | Same. | stub |
| `GET /Persons?limit=50`: `persons` | `{ Items }` of type `Person`: the NFO actors and director, plus one person from the online match. | Same. | stub |
| `GET /Items/{extras}/LocalTrailers`: `local-trailers` | A bare array with one item of type `Trailer`, named after the file (`Synthetic Extras (2024)-trailer`). | One item of type `Trailer`, named `Trailer`. | stub |
| `GET /Items/{extras}/SpecialFeatures`: `special-features` | A bare array with one item: `Synthetic Extras Featurette`, type `Video`, `ExtraType` `Featurette`. | Same. | stub |
| `GET /Items/Filters2?parentId=<movies view>`: `filters2-movies` | `{ Genres: [{ Name, Id }], Tags }`; the five genres, no tags. | Adds `AudioLanguages` and `SubtitleLanguages` (both empty here). | stub |
| `GET /Items?genreIds=<Mystery>&recursive=true&includeItemTypes=Movie,Series`: `items-by-genre` | `{ Items }`: exactly the H.264 and ASS films, the two NFOs that name Mystery. | Same. | implemented |
| `GET /Items?personIds=<Ada>&recursive=true&includeItemTypes=Movie,Series`: `items-by-person` | `{ Items }`: AV1, Extras, H.264, and the series, the four that name Ada Placeholder. | Same. | implemented |
| `GET /UserItems/Resume?mediaTypes=Video&limit=16`: `resume-mixed`, `resume-old-and-recent` | `{ Items }` of movies and episodes together, each with `UserData` including `LastPlayedDate`, newest last play first. | Same. | implemented |
| `GET /Shows/NextUp?limit=16&enableRewatching=false[&enableResumable][&nextUpDateCutoff]`: `nextup-*` | `{ Items }` of episodes, one per series. Section 2 and 3 give the details. | Same. | stub |
| `POST /UserItems/{itemId}/UserData`: `userdata-reset-sequence` | Section 4. | Same. | implemented |
| `GET /Items/{itemId}/Collections`: `item-collections-member`, `-non-member` | Answers **404** for every item. | `{ Items }` holding the `BoxSet` for a member and `[]` for a non-member. | stub |
| `GET /Items?parentId=<collection>`: `collection-items` | `{ Items }`: the two member films. | Same. | implemented |
| `GET /Items?recursive=true&includeItemTypes=Movie,Episode&filters=IsPlayed&sortBy=DatePlayed&sortOrder=Descending&limit=100&enableUserData=true&enableImages=false`: `recently-played` (P16-02) | `{ Items }` of the finished films and episodes, newest `UserData.LastPlayedDate` first; an episode carries its `SeriesId`; an in-progress film is absent. | Same. | not checked |

Sentences the tests assert, by name: "GET /Items sorted by DatePlayed lists finished films and episodes newest first, without the in-progress film"; "Similar for the H.264 movie lists other synthetic movies and never itself"; "Similar for the series lists nothing"; "Suggestions lists ten movies and series, watched ones included, with UserData"; "Movies/Recommendations has only the similar-to-recently-played category on 10.11.7" and "Movies/Recommendations adds actor categories on 12.4.0"; "Genres lists the NFO genres as Genre items"; "Persons lists the NFO people as Person items"; "LocalTrailers is a bare array holding one item of type Trailer"; "the local trailer is named after the file on 10.11.7 and plain Trailer on 12.4.0"; "SpecialFeatures is a bare array holding the featurette"; "Filters2 lists genres and tags only on 10.11.7" and "Filters2 also lists audio and subtitle languages on 12.4.0"; "Items filtered by genreIds holds exactly the movies whose NFO names that genre"; "Items filtered by personIds holds exactly the movies and the series that name that person".

What this means for the discovery tasks:

- Similar, Suggestions, and Recommendations do not drop watched titles, so Octave filters on `UserData.Played` (P16-04).
- The film-only Recommendations route gains actor rows only on 12.4. A client must accept one category on 10.11.
- LocalTrailers and SpecialFeatures return bare arrays, unlike every other list.
- A trailer's name is not a label on 12.4 (`Trailer`). Show the parent film's title with it.

## 2. Ordering Resume and Next Up by last play

Verdict for Q2, the same on both versions: **the two lists can be ordered by last play only for in-progress items.**

- Resume items carry `UserData.LastPlayedDate` ("Resume items carry UserData.LastPlayedDate"; `resume-mixed`). Resume lists films and episodes together, newest last play first ("Resume lists movies and episodes together, newest last play first"). With the dates set in scene B (film 1 June, film 2 June, episode 3 June 13:00) it returned episode, film (2 June), film (1 June).
- Next Up with `enableResumable=true` adds the in-progress episode, with its own `LastPlayedDate` (`nextup-resumable-true`; "Next Up with enableResumable=true holds the in-progress episode, with its own LastPlayedDate"). That episode is also in Resume, so a merged row must drop the duplicate. With `enableResumable=false` Next Up leaves it out (`nextup-resumable-false`; "Next Up with enableResumable=false leaves the in-progress episode out"). `enableResumable` is a Next Up parameter only; Resume has none (`openapi-date-params`).
- An unplayed next episode carries no `LastPlayedDate` (`nextup-no-cutoff`; "an unplayed next episode carries no LastPlayedDate"). Its `UserData` holds only zeros and `Played: false`. So the series' last play, which is the date a merged row needs, is not on the Next Up item. A client must read it elsewhere (the played episode before it), or place Next Up items after the dated in-progress items.
- The summary test is "the two lists can be ordered by last play only for in-progress items".

Q2 B (one merged row, most recent first) therefore holds for in-progress items, which both versions order for the client. For next episodes it needs the series' last-play date from a second source. The task that builds the row decides how; this note only records that the Next Up item does not carry it.

## 3. Leaving out old items

- `GET /UserItems/Resume` has no date parameter on either version: its query parameters are `userId, startIndex, limit, searchTerm, parentId, fields, mediaTypes, enableUserData, imageTypeLimit, enableImageTypes, excludeItemTypes, includeItemTypes, enableTotalRecordCount, enableImages, excludeActiveSessions` (`openapi-date-params`; "Resume takes no date parameter"). A film last played in January still appears next to one played in June (`resume-old-and-recent`; "Resume lists an item last played long ago, so the client filters it"). The client filters on `UserData.LastPlayedDate`.
- `GET /Shows/NextUp` has exactly one date parameter, `nextUpDateCutoff`, on both versions ("Next Up takes nextUpDateCutoff as its only date parameter"). 10.11.7 also has `disableFirstEpisode`; 12.4.0 does not.
- The cutoff compares with the **series' last play**. With S01E01 played on 5 January 2026: no cutoff lists S01E02 (`nextup-no-cutoff`); a cutoff of 1 December 2025 lists it (`nextup-cutoff-early`; "a cutoff before the series' last play keeps the series"); a cutoff of 1 March 2026 leaves it out (`nextup-cutoff-mid`; "a cutoff after the series' last play leaves the series out").
- A caught-up series (S01E01 and S01E02 played) is not in Next Up (`nextup-caught-up`). After a third episode is added, Next Up lists it with no cutoff ("a new episode brings a caught-up series back when there is no cutoff"; `nextup-new-episode-no-cutoff`). The staged file was indexed with `DateCreated` 2026-11-15, after the March cutoff.
- With the March cutoff the series stays **out**, although the new episode is newer than the cutoff (`nextup-new-episode-cutoff-mid`; "a new episode created after the cutoff does not bring the series back under that cutoff"). The cutoff measures the last play, not the episode's creation date.

Q14's "a new episode brings back a caught-up series" therefore does **not** hold with `nextUpDateCutoff` alone. It needs a client rule: send no cutoff (or an older one), then keep an item when its last play is inside the window **or** its `DateCreated` is. Next Up items carry `DateCreated` when `fields` includes it (the recorder sends `fields=PrimaryImageAspectRatio,DateCreated` for these fixtures). Whether a long gap between the last play and the new episode's `DateCreated` should count is a product choice for the later task.

The forum report that Jellyfin does not bring a series back when a season is added later is checked only for a new episode in an existing season, and only on these two servers. Whether a whole new season behaves the same is not recorded.

## 4. Resetting a position

`POST /UserItems/{itemId}/UserData` with `{ "PlaybackPositionTicks": 0 }` (`userdata-reset-sequence`). The sequence set a 40 percent position at 1 June 2026 and then posted the zero. The result is the same on both versions:

- It answers 200 with the new `UserData` ("a zero-position POST answers 200 with the new UserData").
- The item leaves Resume ("a zero position takes a never-played item out of Resume").
- `Played` stays false. `PlayCount` stays at what it was: 0 for a film never played, 1 for a film played before ("a zero position leaves Played false, PlayCount 0, and LastPlayedDate unchanged on a never-played item"; "a zero position takes a previously played item out of Resume and keeps its PlayCount and LastPlayedDate").
- `LastPlayedDate` is **not** cleared: it stays at 1 June 2026.

So the reported workaround works as a "remove from Continue watching" on both servers, at the cost of the resume position, as the proposal said. The kept `LastPlayedDate` means other clients that sort by last play still rank the item by it. P16-03 (a remove button) is withdrawn; this is only the record.

## 5. Collections

- 10.11.7 has no `GET /Items/{itemId}/Collections`: it answers 404 for a member and a non-member (`item-collections-member`, `item-collections-non-member`; "GET /Items/{itemId}/Collections answers 404 on 10.11.7"). The working route is `GET /Items?parentId=<collection id>` for the collection's members (`collection-items`), and `GET /Items?includeItemTypes=BoxSet&recursive=true` to find collections. Finding the collections *of one item* needs a client-side join: list the collections, list each one's members.
- 12.4.0 lists the collection: a member returns `{ Items: [BoxSet "Synthetic Collection"] }`, a non-member `{ Items: [] }` ("GET /Items/{itemId}/Collections lists the collection on 12.4.0"). `parentId` also works there ("Items with the collection as parentId lists its members on both versions").
- The NFO `<set>` tag created **no** collection on either version. The recorder made it with `POST /Collections?name=...&ids=...` as the admin user. On 10.11.7 the call added both films. On 12.4.0 the collection was created **empty**, and the films were added with `POST /Collections/{id}/Items?ids=...`. A client that creates collections should not rely on `ids` at creation. (The recorder logs both outcomes; the fixtures show only the end state.)
- The sequel rule (§2.2 of the proposal) can use the 12.4 route and must fall back to the join above on 10.11.

## 6. Not settled here

- Suggestions is random; one call per version cannot show the distribution or whether history changes it.
- Similar uses local providers only here (no remote provider was enabled). Remote similar providers on 12.4 are not recorded. The series gets no similar items from either server.
- Recommendations ran with one favourite film and one played film. Other categories (director, genre) did not appear with this sample set.
- The jellyfin-web "Max days in Next Up" setting is a UI claim, not a server fact; no fixture touches it.
- A whole new season, or a series added to the library after the cutoff, is not recorded.
- Metadata providers can add data on a networked server: the BluRay sample is renamed by an online match, and one extra person exists for it. The NFO items use `lockdata`. The show's NFO does not: an episode added under a locked series gets no season or episode numbers from its file name (seen on both versions before the lock was removed), so the staged-episode scene would show nothing.
- Ids of the form `id-N` are numbered in the order the recorder meets them, so they differ between recordings.
