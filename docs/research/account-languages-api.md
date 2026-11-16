# Account-language routes on Jellyfin 10.11.7 and 12.4.0

Recorded by P17-01 with `tests/integration/record-account-language-fixtures.mjs` on 2026-11-16. Every fact below names the fixture that shows it (`tests/fixtures/jellyfin/<version>/account-language-<name>.json`) and the test that asserts it (`src/lib/jellyfin/account-language-fixtures.test.ts`, the `it` whose name repeats the sentence).

- Servers: `jellyfin/jellyfin:10.11.7` and `jellyfin/jellyfin:12.4.20261026-211555` (reports itself as 12.4.0), from `tests/integration/docker-compose.yml`, on fresh volumes.
- Viewer: a throwaway non-admin user `fluster-languages`, created by the recorder with a random password and deleted when it ends. Only user creation, user deletion, and `POST /Library/Refresh` use the admin `fluster-test` user. No fixture user's `Configuration` is changed; the recorder compares each with a snapshot at the end and restores it if it differs.
- Sample: `tests/samples/staging/Synthetic Languages (2024)/Synthetic Languages (2024).mkv`, staged outside both libraries and copied into `movies/` only for the run. One H.264 video, four audio tracks (`eng` flagged default, `deu`, `fra`, `jpn`), and twelve SRT subtitle tracks: `eng` (default), `fra`, `fra` forced, `fra` hearing-impaired, `deu`, `ger`, `spa`, `ita`, `jpn`, `por`, `nld`, and one with no language tag. `scripts/generate-samples.sh` checks every tag and flag with ffprobe, also with jellyfin-ffmpeg from the 10.11.7 image (the CI form).
- Jellyscale: `main` at `8246054` (2026-11-16T03:52Z) of `jellyscale-org/jellyscale`: `tasks/prd.json` for the task status and `compat/captures/user-configuration-12.4.md` for JS-116's capture of Jellyfin 12.4.
- Stream indices: Jellyfin numbers the video 0, the audio 1 to 4, and the subtitles 5 to 16 (`account-language-playbackinfo-sample.json`). The tables below write "a:2" for the third audio track (index 3) and "s:1" for the second subtitle track (index 6), the order of the file.
- Requests: header auth, no token in any URL. `POST /Users/Configuration` carries no `userId`, so it saves the caller's own settings. PlaybackInfo carries the Fluster DeviceProfile and the same flags in body and query.

## 1. Route table

| Route and fixture | 10.11.7 | 12.4.0 | Jellyscale |
|---|---|---|---|
| `GET /Users/Me`, new user's `Configuration`: `users-me-new-user` | 15 fields: `PlayDefaultAudioTrack` true, `SubtitleLanguagePreference` `""`, `DisplayMissingEpisodes` false, `GroupedFolders`, `OrderedViews`, `LatestItemsExcludes`, `MyMediaExcludes` all `[]`, `SubtitleMode` `Default`, `DisplayCollectionsView` false, `EnableLocalPassword` false, `HidePlayedInLatest`, `RememberAudioSelections`, `RememberSubtitleSelections`, `EnableNextEpisodeAutoPlay` true, `CastReceiverId` `F007D354`. **No `AudioLanguagePreference` key.** | The same 15 fields and values. | JS-116 (`done`): the same 15 fields, `AudioLanguagePreference` absent, in its 12.4 capture. Agrees. |
| `POST /Users/Configuration`, whole object, two language fields changed: `configuration-sequence` | 204. Every field reads back as sent. | Same. | JS-116 (`done`): 204, every field reads back as sent. Agrees. |
| `POST /Users/Configuration`, only the language fields: `configuration-sequence` | 204. Every field the body lacks **goes back to the new user's value**: `SubtitleMode` `Default`, `PlayDefaultAudioTrack` true, `HidePlayedInLatest` true, and the rest. Nothing merges. | Same. | JS-116 (`done`): "A body replaces the whole Configuration". Agrees. |
| `POST /Users/Configuration`, a field the server does not know: `configuration-sequence` | 204. The known fields in the body are saved; the unknown field is **dropped** and appears in no read-back. | Same. | JS-116 (`done`): "Unknown fields are dropped silently (204)". Agrees. |
| `POST /Users/Configuration` without `userId` | Served (204), so the `?userId=` form was not needed on either version. | Same. | JS-116 (`done`) ran the path form, the `?userId=` form, and this form: "behave alike". Agrees. |
| `GET /Localization/Cultures`: `cultures` | A bare array of **192** entries, each with exactly `Name`, `DisplayName`, `TwoLetterISOLanguageName`, `ThreeLetterISOLanguageName`, `ThreeLetterISOLanguageNames`. Every entry has a two-letter name and a three-letter main name. | A bare array of **494** entries with the same five keys. 192 have a two-letter name; 302 have `""`. One main name is not three letters: `qaa-qtz` ("Reserved for local use"). | JS-116 (`done`): 494 entries with the same five fields. Agrees with 12.4.0; 10.11.7 lists fewer. |
| `OriginalLanguage` as `AudioLanguagePreference`: `defaults` cells A6, A7 | Accepted: 204, read back as `OriginalLanguage`. | Same. | JS-117 (`todo`) and JS-121 (`todo`) are the tasks that make it mean something; JS-116 records that `"OriginalLanguage"` is saved as it is. |
| PlaybackInfo `DefaultAudioStreamIndex`: `defaults` | Section 2. | Section 2. Same indices. | JS-121 (`todo`): "A film starts in the viewer's audio language". |
| PlaybackInfo `DefaultSubtitleStreamIndex`: `defaults` | Section 2. | Section 2. Same indices. | JS-041 (`todo`, outside JS-116 to JS-121, named because it owns this index): "Default subtitle by the viewer's subtitle mode and language". |
| `GET /jellyscale/v1/track-preferences`: `jellyscale-probe` | 404. | 404. | JS-118 (`todo`) adds it. JS-119 and JS-120 (hiding tracks, marks): not recorded here; P17-04. |

## 2. Default tracks

Cells are in `account-language-defaults.json`. Each cell saves the new user's whole `Configuration` with the listed fields changed, reads it back, and asks PlaybackInfo (Fluster profile, flags in body and query). Every cell saved with 204 and read back as sent. **The two versions gave the same index in every cell.** "Index" is the value of `MediaSources[0].DefaultAudioStreamIndex` or `DefaultSubtitleStreamIndex`.

| Cell | Audio pref | Play default track | Subtitle pref | Subtitle mode | Audio index | Subtitle index |
|---|---|---|---|---|---|---|
| A1 | (none) | true | `""` | Default | 1 (a:0 English) | 5 (s:0 English) |
| A2 | `fra` | true | `""` | Default | 1 (a:0 English) | 5 (s:0 English) |
| A3 | `fra` | false | `""` | Default | 3 (a:2 French) | 5 (s:0 English) |
| A4 | `ger` | false | `""` | Default | 2 (a:1 German, tagged `deu`) | 5 |
| A5 | `deu` | false | `""` | Default | 2 (a:1 German) | 5 |
| A6 | `OriginalLanguage` | false | `""` | Default | 1 (a:0 English) | 5 |
| A7 | `OriginalLanguage` | true | `""` | Default | 1 (a:0 English) | 5 |
| S1 | `eng` | true | `fra` | Default | 1 | 5 (s:0 English, the flagged default) |
| S2 | `eng` | true | `fra` | Always | 1 | 6 (s:1 French, the first French track) |
| S3 | `eng` | true | `fra` | OnlyForced | 1 | 7 (s:2 French forced) |
| S4 | `eng` | true | `fra` | None | 1 | absent (no key) |
| S5 | `eng` | true | `fra` | Smart | 1 | 6 (s:1 French) |
| S6 | `fra` | false | `fra` | Smart | 3 (a:2 French) | 7 (s:2 French forced) |
| S7 | `eng` | true | `ger` | Always | 1 | 9 (s:4 German, tagged `deu`) |
| S8 | `eng` | true | `deu` | Always | 1 | 9 (same track as S7) |

The rules, in words, on both versions:

- **Audio.** With `PlayDefaultAudioTrack` on, the file's flagged default audio track wins over any `AudioLanguagePreference` (A2: French asked, English played). With it off, the first track in the preferred language is chosen (A3). `OriginalLanguage` matches no track, so it gives the file's default track, in both cells (A6, A7).
- **`ger` finds `deu`.** A preference of `ger` selects the audio tagged `deu` (A4 equals A5). The server also reports the subtitle tagged `ger` (s:5) as `Language` `deu`, so the sample holds two `deu` subtitles as far as the server is concerned (`playbackinfo-sample`), and a `ger` or `deu` subtitle preference picks the first, s:4 (S7 equals S8). The `ger`/`deu` pair cannot be told apart through PlaybackInfo on either version; this is a finding, not a failure.
- **Subtitle mode.** `Default` (S1) picks the track flagged default and ignores the language; `Always` (S2) picks the first track in the subtitle language, not the forced or SDH one; `OnlyForced` (S3) picks the forced track in that language; `None` (S4) gives no `DefaultSubtitleStreamIndex` key at all; `Smart` (S5) picks the first French track when the audio is English, and (S6) the forced French track when the audio is French too.
- **No subtitle language.** With `SubtitleLanguagePreference` `""` and mode `Default` (A1 to A7), the flagged default subtitle is chosen.
- **IsHearingImpaired** is present on every stream in both versions (`playbackinfo-sample`: s:3 is true, the others false), and `IsForced` marks s:2 only. The untagged subtitle (s:11) has no `Language` key.

## 3. Issue #178 claims

| Claim in issue #178 | Verdict | Fixture |
|---|---|---|
| "Read `Configuration` from `GET /Users/Me`" | Confirmed on both versions. A new user's object has 15 fields and no `AudioLanguagePreference`; the client must treat it as absent, not `""`. | `users-me-new-user` |
| "Save by posting the whole object back to `POST /Users/Configuration`", and the comment's "Saving `/Users/Configuration` replaces the whole object" | Confirmed. A body with only the language fields resets every other field to the new user's value on both versions, so the client must send every field it read. An unknown field is dropped, not refused. | `configuration-sequence` |
| "List languages from `GET /Localization/Cultures`" | Confirmed with one correction: the lists differ. 10.11.7 has 192 entries, all with a two-letter name; 12.4.0 has 494, of which 302 have no two-letter name, and one has a main name of `qaa-qtz`. Each entry carries `ThreeLetterISOLanguageNames`; German's is `["deu","ger"]`. A client that saves the main three-letter name (`deu`) is what the server compares with. | `cultures` |
| "'Original language' is one of the audio choices (the value `OriginalLanguage`, as jellyfin-web offers)" | Confirmed: both versions accept and store it. Corrected for what it selects: on plain Jellyfin it selects nothing; the default audio track is the file's default (A6, A7). The meaning comes from jellyscale (JS-117, JS-121). | `defaults` |
| "On Jellyfin it is 404" (`GET /jellyscale/v1/track-preferences`) | Confirmed on both versions. | `jellyscale-probe` |
| The comment's "Two clients saving at the same moment can still overwrite each other" | Not settled by these fixtures: no concurrent writes are recorded. | none |

## 4. Facts for P17-02, P17-03, and P17-08

Facts only; this task decides none of them.

- A language-only body resets 14 other fields on both versions, so a save has to post the whole object read just before it (P17-03).
- The new user has no `AudioLanguagePreference`. Posting `null` or leaving it out is what leaves it absent (jellyscale's capture, JS-116); this task recorded that a read-back with no key is a new user's state.
- The server reports tags through its own table: the `ger` track is reported as `deu`. Comparing languages for display needs `ger` equal to `deu` (P17-02); the server already treats a `ger` preference as `deu` for audio (A4).
- `OriginalLanguage` is stored as a plain string; on plain Jellyfin it selects the file's default audio track. An audio pick sent into negotiation (P17-08) is not changed by it.
- **`ARCHITECTURE.md` §3 line 187** says "With `PlayDefaultAudioTrack` on, the file's default audio track wins over `AudioLanguagePreference`". The fixtures hold it on both versions (A2). The line also says remembered selections are unverified; they still are, because the throwaway user never plays the item.
- Recording method: the `fluster-test` admin and the throwaway user must not log in twice on the same device id, or the first token ends. The recorder reuses the admin session for the fixture user of the same name.
- The baseline re-record (`record-fixtures.mjs` and `record-discovery-fixtures.mjs`) does not reproduce the committed fixtures on a fresh server: ids and online matches differ. Run before and after the language recorder on the same servers, the two outputs differ only in `DateCreated` (two files) and in one online-matched title (`discovery-suggestions`), which the language recorder does not touch.
