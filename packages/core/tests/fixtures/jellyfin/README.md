# Jellyfin contract fixtures

Scrubbed answers from the two pinned fixture servers (`tests/integration/docker-compose.yml`). Every file is scrubbed as `.claude/skills/jellyfin-api/references/contract-fixtures.md` describes: no token, password, authenticated URL, or play-session id, and ids are stable fakes.

| Recorder (`tests/integration/`) | Fixture prefix |
|---|---|
| `record-fixtures.mjs` | `playbackinfo-`, `conversion-`, `item-` |
| `record-discovery-fixtures.mjs` | `discovery-` |
| `record-account-language-fixtures.mjs` | `account-language-` |
| `record-rating-fixtures.mjs` | `rating-` |

## Personal ratings (P16-13)

- Servers: Jellyfin 10.11.7 (`jellyfin/jellyfin:10.11.7`) and 12.4.0 (`jellyfin/jellyfin:12.4.20261026-211555`). Recorded 2026-11-19 by `record-rating-fixtures.mjs`; tested by `src/lib/jellyfin/rating-fixtures.test.ts`.
- Users: the recorder creates the throwaway users `octave-ratings` (scenes V, R, T, S) and `octave-ratings-list` (scene L), and deletes both at the end, which deletes their user data. No fixture user's data is touched. In the files they are `user-ratings` and `user-ratings-list`; the admin is `user-test`.
- Two runs back to back wrote identical files on both servers, so these fixtures are reproducible on this sample set.
- Scene L set-up (also in `rating-list-all-movies.json`, key `setup`):

| Film | Done as `octave-ratings-list` | Stored |
|---|---|---|
| `item-h264` | `POST UserData { Rating: 10 }` | 10 |
| `item-av1` | `POST UserData { Rating: 8 }` | 8 |
| `item-multitrack` | `POST UserData { Rating: 7.5 }` | 7.5 |
| `item-ass` | `POST UserData { Rating: 6 }` | 6 |
| `item-sidecar` | `POST UserData { Rating: 1 }` | 1 |
| `item-extras` | `POST Rating?likes=true` | 10 |
| `item-versions` | rated 9, then `DELETE Rating` | none |
| `item-hevc` | favourite only | none |
| `item-bluray` | played only | none |

### Claims checked

Claims are from `tasks/backlog.md` in the tag `desktop-tauri-final` "Personal ratings and top-rated lists" (read from source on 2026-11-17) and `docs/plans/proposals/product-review.md`. Fixture names are under `rating-<name>.json` in both version folders; `it` names are in the test file. Both servers gave the same answer for every claim unless a row says so.

| Claim | Verdict | Evidence |
|---|---|---|
| 1. Jellyfin stores a per-user 0-10 `UserItemData.Rating`, separate from community and critic ratings | Confirmed. `UserData.Rating` takes 1 to 10 and 7.5; 11 and -1 are refused with 400 | `values-sequence`; "every whole value from 1 to 10 and 7.5 reads back as sent", "a rating of 11 or -1 is refused with 400 and leaves the rating at 6.5" |
| 2. `Likes` is derived from it: 6.5 and above is liked | Confirmed. `Likes` is true at 6.5 and every value above, false at 6 and below | `values-sequence`; "Likes reads true from 6.5 up and false below" |
| 3. Setting like stores 10; setting dislike stores 1 | Confirmed | `thumbs-sequence`; "a like on an unrated film stores 10", "a dislike overwrites a rating of 8 with 1" |
| 4. A rating is set with `POST /UserItems/{id}/UserData` carrying `Rating` | Confirmed. Answers 200 with the stored user data | `values-sequence`; "POST UserData answers with the stored user data" |
| 5. Thumbs use `POST`/`DELETE /UserItems/{id}/Rating?likes=` | Confirmed. Both methods exist on both servers | `openapi`, `thumbs-sequence`; "UpdateUserItemDataDto carries Rating and Likes, and the Rating route accepts POST and DELETE" |
| 6. No sort by the user's rating | Confirmed. `ItemSortBy` has CommunityRating, CriticRating, OfficialRating, IsFavoriteOrLiked | `openapi`; "ItemSortBy has no value naming the user's own rating" |
| 7. No threshold filter beyond `Likes` (>= 6.5) | Confirmed. `ItemFilter` has `Likes`, `Dislikes`, `IsFavoriteOrLikes`; `GET /Items` has no minimum-rating parameter for the user's rating. `Dislikes` and `IsFavoriteOrLikes` do not behave as their names say (see Listing) | `openapi`, `list-*`; "ItemFilter touches the user's rating only through Likes, Dislikes, and IsFavoriteOrLikes", "GET /Items has no query parameter for a minimum user rating" |
| 8. "4 stars and up" (>= 8) and "top 25% of what you rated" must be computed in Octave from one request for the user's rated items | Corrected in part. Computing it in Octave is confirmed, but no request returns exactly the rated films. For "4 stars and up" (R4 A, cutoff 8) `filters=Likes` is enough, because it holds every film rated 6.5 or more and the client keeps those with `Rating >= 8`. A top-25% rule needs every rated film, so it needs the unfiltered movie list; the fixtures support computing it (each item carries `UserData.Rating`). R4 A did not choose it and it is not built | `list-likes`, `list-all-movies`; "filters=Likes holds every film rated 8 or more, so a cutoff of 8 is a client-side filter on it", "no single request returns exactly the rated films" |
| 9. Which other Jellyfin clients set a numeric rating | Not settled by fixtures | none |
| 10. 3.5 stars (7) reads as liked elsewhere and 3 stars (6) does not | Confirmed. 7 reads `Likes: true`, 6 reads `Likes: false` | `values-sequence`; "Likes reads true from 6.5 up and false below" |

### Removing a rating

`DELETE /UserItems/{id}/Rating` clears it: 200, and the item's `UserData` then has no `Rating` and no `Likes` key (absent, not `null`). No `UserData` body clears it: `{}`, `{ "Rating": null }`, and `{ "Likes": null }` answer 200 and leave the rating at 8; `{ "Rating": 0 }` stores 0 and `Likes: false`, which is a rating of zero, not a removal. Fixtures: `remove-sequence`, `thumbs-sequence`. Tests: "DELETE /UserItems/{id}/Rating clears the rating, and the key is absent, not null", "an empty body leaves the rating at 8", "{ Rating: null } leaves the rating at 8", "{ Likes: null } leaves the rating at 8", "{ Rating: 0 } stores a rating of 0 and does not clear it".

### Thumbs and numbers

A like (`POST Rating?likes=true`) stores 10 and a dislike (`likes=false`) stores 1, each over any number the viewer gave: a like over 8 becomes 10, a dislike over 8 or 3 becomes 1. `{ "Likes": true }` in the `UserData` body also stores 10. So a thumbs call overwrites a number; Octave must not call the thumbs routes on a viewer who rated with half stars. Fixture: `thumbs-sequence`. Tests: "a like overwrites a rating of 8 with 10", "a dislike overwrites a rating of 8 with 1", "a dislike overwrites a rating of 3 with 1", "{ Likes: true } in the UserData body over a rating of 8 stores 10".

### Side effects

Setting a rating, liking, and removing a rating leave `Played`, `PlaybackPositionTicks`, `LastPlayedDate`, `IsFavorite`, and `PlayCount` as they were, for a played favourite, a film in progress, and an untouched film. Fixture: `side-effects`. Test: "setting a rating, a like, or removing a rating leaves Played, position, LastPlayedDate, favourite, and PlayCount as they were".

### Listing rated films

No `GET /Items` request returns exactly the rated films (`userId`, `recursive=true`, `includeItemTypes=Movie`, `enableUserData=true`). Fixtures `list-likes`, `list-dislikes`, `list-likes-and-dislikes`, `list-favorite-or-likes`, `list-all-movies`; test "no single request returns exactly the rated films".

- `filters=Likes` returns the films rated 6.5 or more, never an unrated film, and not the films rated below 6.5. Test: "filters=Likes lists the films rated 6.5 or more, and not every rated film".
- `filters=Dislikes` differs by version. On 10.11.7 it returns the same films as `Likes`. On 12.4.0 it returns every film that is not liked, rated or not (unrated films included). Neither is "the films the viewer rated low". Test: the `filters=Dislikes` test, named per version.
- `filters=Likes,Dislikes` is answered with the `Likes` list on 10.11.7 and refused with 400 on 12.4.0. Do not send it.
- `filters=IsFavoriteOrLikes` returned only the favourite, not the liked films, on both servers. Do not rely on it.
- Every rated film in the lists carries `UserData.Rating`, `ProductionYear`, and an image (`ImageTags` or `PrimaryImageAspectRatio`), and `toBrowseCards` keeps it. A film without artwork has neither image field (not a rated one here).
- Paging: `limit` and `startIndex` work, and with `enableTotalRecordCount=true` `TotalRecordCount` is the full list length (`likes-page-1`, `likes-page-2`; test "the Likes list pages with limit and startIndex, and TotalRecordCount is the unpaged length").
- To get every rated film, scan the unfiltered movie list (`list-all-movies`) and keep items whose `UserData.Rating` is a number. For P16-15 (cutoff 8), `filters=Likes` is enough: its list is a superset of the films rated 8 or more, so one pass over its pages and a client filter on `Rating >= 8` is exact.
- Cost on a large library, estimated from this 11-film sample (about 600 bytes per card item as compact JSON in `list-all-movies`), not measured on a large library, at a page size of 100: a full scan is ceil(N / 100) requests and about 60 KB each, so 10 requests and 0.6 MB for 1,000 films, and 100 requests and 6 MB for 10,000. The `Likes` list is that cost times the share of films rated 6.5 or more, so a viewer who rated few films pays little.

### Not settled here

Other clients' behaviour; timing and memory on a large library; a different server version than the two above; ratings of series and episodes (films only, R2 B).
