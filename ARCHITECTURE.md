# Architecture

This is the top-level architecture: the stack, the system shape, the two playback engines, how Octave uses the Jellyfin API, and the invariants that must hold. For domain boundaries, see `DOMAINS.md`. For the token and network boundary, see `docs/security.md`.

Decisions behind it: [0001](docs/decisions/0001-private-lan-http.md) (plain HTTP on the home network), [0002](docs/decisions/0002-server-transcoding-fallback.md) (original first, honest fallback, amended 2026-11-20 for per-device playback), [0003](docs/decisions/0003-tv-and-mobile-shell.md) (the TV shell and its engines; its "Decision (accepted)" section wins) and [0004](docs/decisions/0004-tv-shell-go-no-go.md) (go with React Native, with conditions) and [0005](docs/decisions/0005-token-boundary.md) (the token lives in native memory only). Items marked **[unverified]** need a fixture or a device check before they are relied on. A path or command marked with a task id does not exist yet; that task adds it.

---

## 1. Stack

### Verdict: React Native for TV, a shared TypeScript core, native players. Never Flutter.

Decisions 0003 and 0004 (accepted 2026-11-20):

- **Shell.** Expo SDK 58 with react-native-tvos 0.88.x, in TypeScript. It is the only option that reaches Android TV and tvOS with one UI and keeps one implementation of the TypeScript rules. The browse UI is React Native; the player screen is native per platform.
- **Core.** The TypeScript core (domain, Jellyfin gateway and negotiation, coordinator, playstate reporter, redaction) is kept and runs unchanged under Hermes with three host additions: a URL implementation, SHA-256, and a transport (decision 0004, "Play").
- **Engines.** Android: Media3 first (HDR, Dolby Vision, passthrough); libmpv later as the second engine, for original files Media3 cannot decode (T13). Apple TV (T14): decided when that phase starts, each engine checked against the maintenance rule.
- **No Rust layer and no FFI.** The desktop app's playlist rules became the shared vectors in `packages/core/tests/fixtures/` that every validator must pass, and its mpv options became `docs/mpv-options-checklist.md`.
- **Order.** Android TV first, Apple TV kept possible, then phones and tablets (T15), then the desktop (T16, route undecided).

### Conditions that shape the work (decision 0004)

1. A Baseline Profile in every release build (T3-13).
2. A performance budget set by the owner and enforced (T3-12).
3. A cheap Google TV box before the browse screens (T0-06).
4. Image loads started off the main thread (T3-11, T3-14).
5. The focus fixes carried into rows and the rail (T3-08, T3-09), and the 500-press focus test as a required CI check (T3-10).
6. HDR10 output and passthrough proven before the playback phase is called done (T8-21).
7. One Fire TV device tested before Fire OS is promised (T11-08).

### Revisit if

- A cheap box cannot meet the memory budget with any acceptable design (decision 0004, "What would lower this to no-go").
- react-native-tvos stops passing the maintenance rule, or its out-of-tree move costs more than one migration.
- The owner judges the React Native build wrong from the sofa in a way the measured fixes do not repair.

The replacement named by decision 0004 is native Kotlin with Compose for TV; it has no Apple TV path and would need the core ported or bridged.

---

## 2. System shape

```text
┌──────────────────────────── apps/tv (Expo + react-native-tvos, T3-01) ────────────────────────────┐
│  Screens: sign-in · home · library · search · detail · settings        (React Native, TypeScript) │
│                      │ use cases, typed errors                                                     │
│  ┌───────────────────▼──────────── core (TypeScript, no platform APIs) ─────────────────────────┐  │
│  │ domain         pure types and rules: policy, host classes, start choice, track choice         │  │
│  │ jellyfin       gateway, DeviceProfile, source decision, HLS URL rebuild                        │  │
│  │ player         coordinator, playstate reporter, session state                                  │  │
│  │ ports          Transport, PlayerEngine, Clock, Crypto, stores; holds a session id, no token    │  │
│  └──────┬─────────────────────────────────────────────────────────────────┬───────────────────────┘  │
│         │ Transport port (T2-04, T3-05)                                    │ PlayerEngine port (T2-05) │
│  ┌──────▼──────────────────────────────┐            ┌─────────────────────▼─────────────────────┐   │
│  │ native HTTP module (Kotlin, T3-03)  │◄───────────│ modules/player (Expo module, T8-01)        │   │
│  │ one OkHttp client: header for the   │  every     │ Media3 + Octave's media source factory     │   │
│  │ signed-in origin, no redirects,     │  native    │ HLS playlist parser hook (T8-08)           │   │
│  │ no proxy, other origins refused     │  request   │ libmpv for originals only (T13)            │   │
│  └──────▲──────────────────────────────┘            └────────────────────────────────────────────┘   │
│         │ artwork by item, type, tag and size (T3-11)                                                │
└─────────┴────────────────────────────────────────────────────────────────────────────────────────────┘
```

- **Where the code is today.** The core lives in `packages/core/src/domain/`, `packages/core/src/jellyfin/`, `packages/core/src/player/`, and `packages/core/src/` (redaction, safe reasons, transport errors, preference and confirmation ports), with its tests beside it and the shared fixtures in `packages/core/tests/fixtures/`. It is the pnpm workspace package `@octave/core` (T2-02). `apps/tv` (T3-01) and `modules/player` (T8-01) do not exist yet.
- **The core is platform-free.** It takes its host through ports: a `Transport` for HTTP (T2-04 drops axios and the SDK), `Clock` and `Crypto` (T2-03), and the stores.
- **The token lives in native memory only (decision 0005).** Kotlin sends and parses the two sign-in calls and keeps `AccessToken` in a session registry keyed by an opaque 128-bit session id; JavaScript holds only that id. The core still builds every catalog request (path, query, body) and parses every response; Kotlin adds the header, sends it, and strips the session's token value (as written and percent-encoded) from the body before it crosses back. The native session surface is four methods and one event: `signIn`, `request` (no header, no absolute URL, a path resolved against the session's origin), `restoreSessions`, `endSession`, and `sessionEnded { session, reason }`. The player's launch request and the image view name a session by id and ask the registry for the client; neither sees the header. On Android the header is built in Kotlin; the core's header builder serves the reference transport used by Node tests and the tripwire.
- **The engine is a port.** `PlayerEngine` is the seam between the core and any player. T2-05 makes it engine-neutral: no surface geometry or fullscreen, a launch request that is a discriminated union of an original file and an HLS session with token-free URLs, a typed capability list, a fixed method list (initialize, launch, pause, seek, select track, stop), and errors as typed codes.
- **One authenticated client.** Every server request (sign-in, catalog, artwork, media, playlists, segments, subtitles) goes through one OkHttp client. Its interceptor adds the header only for the signed-in server's scheme, host and port; redirects and SSL redirects are off; no proxy; any other origin is refused before the request is sent (T3-03). A build check fails on Media3's default data sources, another `OkHttpClient`, `HttpURLConnection`, or an ExoPlayer without Octave's media source factory (T3-04).
- **The video is native.** A native view hosts the video; React passes it no URL. The player screen's chrome is native per platform.

### Engines

| | Media3 (first, T8) | libmpv (second, T13) |
|---|---|---|
| Plays | Original files the device's decoders handle, and every converted (HLS) session | Original files only, for what Media3 cannot decode on this device |
| Never plays | n/a | HLS. Android needs no playlist proxy and no loopback server |
| Network | Octave's data source over the one OkHttp client | Must pass every item of `docs/mpv-options-checklist.md` before it ships |
| HDR, Dolby Vision, passthrough | Device-dependent, through SurfaceView and `AudioCapabilities` | No native HDR output on Android today (decision 0003, Finding 1) |

- **Engine choice is per source and per device.** The device reports what it can play as a typed capability list (T2-05, T8-07). The source decision direct-plays only what an engine on this device can play (T2-07). When none can, the core asks the server for a conversion (below). T13-01 sets when mpv is chosen, and the player says which engine is playing.
- **HLS on Android.** Media3 reads playlists only through Octave's parser hook, which refuses the whole playlist unless every URI is same-origin and credential-free and passes the shared vectors (T8-08). Segments and keys are fetched through the one client, and a segment redirect is not followed.

---

## 3. Jellyfin API usage

### Supported servers

- **Jellyfin 10.11.x and 12.x**, and **Jellyscale**, which speaks the Jellyfin client API and is a first-class server. Jellyscale requires a token on every media request, so every media, playlist, segment, subtitle and image request carries the header. Where Jellyscale lacks a feature, the task waits for its issue; a token in a URL is never the workaround.
- Gate on parsed semver (`>= 10.11.0`) plus **feature detection** (`HasSegments`, presence of `Trickplay`), not exact-version regexes.
- 12.x turns off legacy authorization by default. The `api_key` query parameter, the `X-Emby-*` headers, and the `Emby` scheme are ignored unless an admin re-enables them. Checked on the 12.4.0 fixture: `GET /Users/Me?api_key=` returns 401, but `?ApiKey=` (capital K) and the `Authorization` header both return 200.
- The static stream and subtitle routes are anonymous on Jellyfin 10.11.7 and 12.4.0 (`VideosController.GetVideoStream` and `SubtitleController.GetSubtitle` carry no `[Authorize]`, v12.4 at 83d0d0e, lines 314 and 208). Jellyscale is not anonymous there. Header auth for media is therefore required, not only a way of keeping tokens out of URLs.

### Authentication and identity

| Concern | Approach |
|---|---|
| Header | `Authorization: MediaBrowser Client="Octave", Device="…", DeviceId="…", Version="…", Token="…"`. Values are quoted and URL-encoded. The SDK builds it today; the core builds it itself from T2-04. `Device` is `Octave <platform>` and `Version` is the `package.json` version; the composition root passes both in. |
| Media requests | **Header auth, never query auth.** The native client's interceptor adds the header (T3-03). The token never enters JavaScript and never appears in a URL, prop, event, or log (decision 0005). |
| DeviceId | The server keeps **one token per DeviceId**. Persist a random install ID (not secret) and derive `DeviceId = SHA-256(installId:serverId:username)`. The login request carries the DeviceId before the user id exists, so the lowercased username stands in for the user id. Never generate a new one per launch. The device must derive the same value Node derives (T3-02). |
| Quick Connect | 1. `GET /QuickConnect/Enabled`. 2. `POST /QuickConnect/Initiate` (GET was removed in 12.0) returns `{Secret, Code}`. 3. Show the code and a QR code and poll `GET /QuickConnect/Connect?secret=` until `Authenticated`. 4. `POST /Users/AuthenticateWithQuickConnect` `{Secret}`. This is the TV's main sign-in, and the only one for an account that has no password (SSO). Jellyscale support: issues #104 and #118 (T10-06). |
| Password login | `POST /Users/AuthenticateByName` `{Username, Pw}` returns `AccessToken`, `User`, `ServerId`. The fallback (T4-04). |
| Validate a stored token | `GET /Users/Me`. On 401, return to sign-in with the server and user already chosen. |
| Logout | `POST /Sessions/Logout` (revokes the token on the server), then delete the local credential, even when the revoke fails. |
| Token storage | Native memory, plus one encrypted record per session written and read only by Kotlin: AES-256-GCM under an Android Keystore key, in the no-backup directory (T4-05, decision 0005). Users stay signed in by default. A record is removed on sign-out, on a confirmed 401 (a 401 followed by a 401 from `GET /Users/Me`, which also emits `sessionEnded` with `revoked`), and when it cannot be read (`store-unreadable`). Development builds sign in only to development servers. |
| Discovery | Probe a URL with `GET /System/Info/Public` (no auth; returns `Id`, `ServerName`, `Version`). LAN discovery (T4-01) broadcasts `who is JellyfinServer?` to UDP 7359 on IPv4; replies are `{Address, Id, Name, EndpointAddress}` (`AutoDiscoveryHost.cs` and `ServerDiscoveryInfo.cs`, identical at v10.11.7 and v12.4; the server listens on `IPAddress.Any`, so there is no IPv6 discovery). Every reply is untrusted. Key saved servers by `Id`, not URL. A reply whose `Address` fails the host-class rule of decision 0001 is counted as refused and never probed. Choosing a listed address runs the same probe and confirmation as a typed one, and is refused unless the probe reports the discovered `Id`. A limited broadcast does not cross subnets. |

### Catalog (10.9+ paths; old `/Users/{userId}/…` routes are obsolete)

| Need | Endpoint |
|---|---|
| Libraries | `GET /UserViews` (filter by `CollectionType`) |
| Browse / search | `GET /Items?parentId=&includeItemTypes=&recursive=true&sortBy=&sortOrder=&startIndex=&limit=&fields=&searchTerm=&enableImageTypes=Primary,Backdrop,Thumb,Logo&imageTypeLimit=1&enableTotalRecordCount=false` (`true` on the first library page only) |
| Letter rail | `nameLessThan` counts per letter (T6-04) **[unverified]**; Jellyscale issue #227 (T10-09) |
| Remembered sort | `/DisplayPreferences` per library and account (T6-03) **[unverified]** |
| Continue watching | `GET /UserItems/Resume?mediaTypes=Video&limit=` |
| Next Up (merged into Continue watching) | `GET /Shows/NextUp?limit=&enableRewatching=false&enableResumable=false&fields=PrimaryImageAspectRatio,DateCreated` with no `nextUpDateCutoff` (`docs/research/discovery-api.md` §3); the window is applied in `packages/core/src/domain/up-next.ts`. Series form: `GET /Shows/NextUp?seriesId=&limit=1&enableUserData=true&enableResumable=true&enableRewatching=false&enableImages=false&enableTotalRecordCount=false` |
| Recently played (dates next episodes, anchors the hero) | `GET /Items?recursive=true&includeItemTypes=Movie,Episode&filters=IsPlayed&sortBy=DatePlayed&sortOrder=Descending&limit=100&enableUserData=true&enableImages=false&enableTotalRecordCount=false` |
| Recently added (one Home row, movies and shows, episodes grouped by series) | `GET /Items/Latest?limit=&groupItems=true` (returns an array, not a QueryResult). Without `parentId`, across libraries: **[unverified]**. One card per series; Jellyscale issue #234 (T10-07) |
| Series | `GET /Shows/{id}/Seasons`, `GET /Shows/{id}/Episodes?seasonId=` |
| Next episode | `GET /Shows/{id}/Episodes?adjacentTo={episodeId}` |
| Detail | `GET /Items/{id}?userId=` with no `fields`; recordings on 10.11.7 and 12.4.0 (`item-detail-no-fields-*.json`) show the full item, including `MediaSources`, `MediaStreams`, `People`, `CommunityRating`, `CriticRating`, `Genres`, and `UserData` |
| Account languages | `GET /Users/Me` → `Configuration`; save with `POST /Users/Configuration` carrying the whole `Configuration` as read and only the changed fields, no `userId`, one save at a time |
| Language codes | `GET /Localization/Cultures` |
| Type-ahead | `GET /Search/Hints`, on every letter (T6-06) |
| Filters | `GET /Items/Filters2?parentId=`, `filters=IsUnplayed,IsResumable,IsFavorite` |
| Played / favorite | `POST`/`DELETE /UserPlayedItems/{id}`, `POST`/`DELETE /UserFavoriteItems/{id}` |
| Images | `GET /Items/{id}/Images/{type}?tag=&maxWidth=&quality=&format=Webp`, through the native client with the header (T3-11). Tagged URLs are immutable, so cache by `(id, type, tag, size)`. Request at the drawn size; a poster on the 1920 canvas is never requested wider than 400 px. Use `ImageBlurHashes` for placeholders. |

Performance rules:

- Request only the `fields` a view renders.
- `ProductionYear` and `RunTimeTicks` are always returned and are not valid `fields` values.
- Set `enableTotalRecordCount=false` unless paging needs counts.
- Set `enableUserData` only where watched or progress state is shown.

### Playback negotiation (the core)

Policy: [decision 0002](docs/decisions/0002-server-transcoding-fallback.md) with its 2026-11-20 amendment. Play the original file whenever an engine on this device can; otherwise let the server remux or transcode over HLS, show it, and authenticate every request with the header.

```text
GET  /Items/{id}                                              → versions, chapters, trickplay
POST /Items/{id}/PlaybackInfo                                 → MediaSources[] evaluated for THIS device
     body:  UserId, StartTimeTicks, MediaSourceId?, MaxStreamingBitrate: <the viewer's local or remote limit>,
            AudioStreamIndex?, SubtitleStreamIndex? (a viewer's audio pick, and renegotiation; also in the query),
            EnableDirectPlay:true, EnableDirectStream:true, EnableTranscoding:true,
            AllowVideoStreamCopy:true, AllowAudioStreamCopy:true, AutoOpenLiveStream:false,
            AlwaysBurnInSubtitleWhenTranscoding:false, DeviceProfile: OCTAVE_PROFILE
     query: the same flags and MaxStreamingBitrate, duplicated (AlwaysBurnInSubtitleWhenTranscoding is body-only)
decide   DirectPlay   → GET /Videos/{id}/stream?Static=true&MediaSourceId=&PlaySessionId=   (header auth)
         DirectStream → GET /videos/{id}/master.m3u8?… rebuilt from TranscodingUrl, credentials stripped,
         Transcode      EnableTrickplay=false                                               (header auth on every playlist and segment)
         Refuse       → typed RefusalReason
```

**Always send a DeviceProfile.** The server applies `EnableDirectPlay`, user policy, the remote bitrate limit, and `ForceRemoteSourceTranscoding` only inside `SetDeviceSpecificData`, which runs **only when a profile is present**. That is also the only place subtitle `DeliveryMethod`/`DeliveryUrl` get filled in.

The profile accepts everything for direct play, so a codec never makes the server convert, and offers one HLS target per media type for fallback:

- `DirectPlayProfiles`: `[{ "Type": "Video" }, { "Type": "Audio" }]` (match-all).
- `TranscodingProfiles`: Video, `Protocol: "hls"`, `Context: "Streaming"`, `Container: "mp4"` (fMP4, so HEVC and AV1 can be stream-copied), `VideoCodec` with the encode target first (`h264,hevc,av1,vp9`), `AudioCodec` (`aac,ac3,eac3,opus,flac,mp3`), `EnableSubtitlesInManifest: false`; Audio, `Protocol: "hls"`, `Container: "mp4"`, `AudioCodec: "aac"`.
- `CodecProfiles`, `ContainerProfiles`: empty.
- `SubtitleProfiles`: `External` and `Embed` for `srt`, `ass`, `ssa`, `vtt`, `sub`, `pgssub` (External) and `srt`, `ass`, `ssa`, `pgssub`, `dvdsub`, `vtt` (Embed). Never `Hls`: HLS subtitle renditions carry `ApiKey={token}` in the playlist (`DynamicHlsHelper.cs` v10.11.7 line 615).
- `MaxStreamingBitrate`: the viewer's limit; `MaxStaticBitrate`: 1 Gbps.

What the device can decode is never written into the profile. It is a client-side capability list that the source decision reads (below).

**Source decision.** `decideSource` (`packages/core/src/jellyfin/source-acceptance.ts`) returns `DirectPlay`, `DirectStream`, `Transcode`, or `Refuse`. Rules run in order and the first that decides wins:

1. `Id` missing: Refuse `missing-source-data`.
2. `RequiresOpening` is `true` (a live source): Refuse `live-source`.
3. **DirectPlay** when all hold: `SupportsDirectPlay === true`; `Protocol === "File"`; `Path` present; `VideoType` is not `BluRay`, `Dvd`, or `Iso` (any case) and `Path` has no `BDMV` or `VIDEO_TS` segment and does not end in `.iso`; `TranscodingUrl` is empty; and (from T2-07) an engine on this device can play the source's video and audio.
4. A disc folder or ISO that the server offered for direct play: send a second PlaybackInfo for that `MediaSourceId` with `EnableDirectPlay: false`, then apply the rules to the answer once. If the answer still offers direct play, Refuse `disc-source` or `iso-source`; there is never a third request.
5. **Device cannot play (T2-07).** The server offered direct play, but no engine on this device can play the source: send one more PlaybackInfo for that `MediaSourceId` with `EnableDirectPlay: false` and `AllowVideoStreamCopy: false`, in body and query (whether audio the device cannot play also needs `AllowAudioStreamCopy: false` is open for T2-07), and use its answer, with a client-side conversion reason. If it still offers only direct play, Refuse with the typed "this device cannot play the file" reason; there is never a third request.
6. **DirectStream** or **Transcode** when `TranscodingUrl` is present, `TranscodingSubProtocol` is `hls` (otherwise Refuse `unsafe-transcoding-url`), and the rebuilt URL passes the HLS URL rules below. DirectStream only when the URL shows that video and audio are copied: `TranscodeReasons` is present and every value is `ContainerNotSupported` or `VideoCodecTagNotSupported`; no `SubtitleMethod=Encode`, `AlwaysBurnInSubtitleWhenTranscoding=true`, `RequireAvc=true`, or `AllowVideoStreamCopy`/`AllowAudioStreamCopy=false`; the source has one video stream whose codec is in the URL's `VideoCodec` list and within its limits; and the URL's `AudioCodec` is exactly the codec of the chosen audio stream. Anything else is Transcode. After the first frame of a converted session the coordinator asks the server (`GET /Sessions?deviceId=`) at 3 s and once more at 10 s; the plan becomes DirectStream exactly when `TranscodingInfo.IsVideoDirect` and (with audio) `IsAudioDirect` are true. Playstate reports for every converted session keep `PlayMethod: Transcode` (see Playstate reporting).
7. Otherwise Refuse: `conversion-not-allowed`, `not-a-file`, `missing-source-data`, or `no-sources`.

**A viewer's audio pick.** A title's page can start a play with an audio track the viewer picked. The index goes in body and query with `MediaSourceId` in the body. A pick never costs a direct play: if the answer to the request that named the index does not direct play, one more request is sent without it, and a direct-play answer to either wins. A session with no pick sends exactly the requests it did before. Fixtures `conversion-multitrack-audio-pick*` cover both servers.

With several versions, the first DirectPlay source wins, then the first DirectStream, then the first Transcode, then the first disc that needs the forced fallback, then the first refusal. A requested `MediaSourceId` is never replaced by another version. Refusals are typed (`RefusalReason` in `packages/core/src/domain/playback.ts`).

**HLS URL rules.** A `TranscodingUrl` is never used as given, logged, or shown (`packages/core/src/jellyfin/hls-url.ts`). Playback Negotiation resolves it against the normalized server URL (including any base path) and refuses it unless the path is `/videos/{itemId}/master.m3u8` or `/audio/{itemId}/master.m3u8` (any case) for the requested item, on the server's origin, with no user info, with exactly one `MediaSourceId` naming the chosen source, and with any `PlaySessionId` equal to the PlaybackInfo answer's. A query name with whitespace or a control character is refused. It removes every credential parameter (`ApiKey`, `api_key`, `access_token`, `Token`, `X-Emby-Token`, `ApiToken`, `AccessToken`; any case, also percent-encoded), sets `EnableTrickplay=false` exactly once (the server defaults it to `true` and then lists trickplay playlists with `ApiKey={token}`, `DynamicHlsController.cs` v10.11.7 line 464), removes `EnableSubtitlesInManifest=false` and refuses any other value, and refuses any `SubtitleMethod` other than `Encode`, `Embed`, `External`, or `Drop`. Every native validator re-checks the result with the same rules: the plans the negotiation builds from the recorded fixtures are the shared vectors in `packages/core/tests/fixtures/hls-master-urls.json` (written and checked by `packages/core/src/jellyfin/hls-master-url-vectors.test.ts`), and the Kotlin check must pass them (T8-08). `/Audio/{id}/universal` is never used, because it can redirect.

**Playlist validation.** Before the player reads a playlist, a native validator (Media3's parser hook on Android, T8-08) refuses the whole playlist unless every URI line and `URI=` attribute (stream, i-frame, media, map, key, session key, image) resolves to HTTP(S) on the server's origin with no user info, no fragment, and no credential parameter, and unless the body contains no credential parameter name and not the token value itself, as written or after up to three rounds of percent decoding (fail closed). A live playlist (no `EXT-X-ENDLIST`), `EXT-X-DEFINE`, a subtitle rendition, and trickplay are refused. The rules are language-neutral vectors in `packages/core/tests/fixtures/hls-playlists.json` (described in `packages/core/tests/fixtures/README.md`). A failure is the `unsafe-transcoding-url` refusal.

**Track changes on a converted session.** Choosing a track the conversion lacks, or changing burned-in subtitles, renegotiates at the current position with `AudioStreamIndex` and `SubtitleStreamIndex` (`-1` for off) in body and query and the playing `MediaSourceId` in the body (`MediaInfoHelper.cs` v10.11.7 lines 206-211, v12.4 lines 218-223). The old session is stopped and reported Stopped with `Failed: true` so the server leaves the play state alone, and its encode is deleted before the new negotiation (`PlaybackCoordinator.renegotiate`). Direct play switches tracks in the engine only.

**Indicator.** A DirectStream or Transcode plan carries its method and the server's `TranscodeReasons` (read from the URL). The player shows "Converting on server: {reason}" or "Repackaging on server, original quality: {reason}" (`packages/core/src/domain/conversion-copy.ts`), and the info sheet shows the method. A client-side conversion (rule 5) says the device cannot play the original.

**Subtitles and track mapping.**

- External subtitle `DeliveryUrl` arrives as `/Videos/{id}/{msId}/Subtitles/{idx}/0/Stream.{fmt}?ApiKey=…`. Strip every query credential, validate same-origin, and fetch it with the header through the native client.
- While converting, HLS segments cannot carry subtitles (`IsSubtitleEmbedSupported`, `StreamBuilder.cs` v10.11.7 line 1522), so the server offers text subtitles as `External`. Graphical subtitles it cannot extract are burned in (`Encode`), and the indicator says so.
- Subtitles are drawn on the device, styled ones included (T8-11).
- **Jellyfin numbers external streams first.** Embedded streams have `Index = containerIndex + externalCount`. Each engine maps its own track ids to Jellyfin indices and verifies each candidate by type, language and codec family; anything unclear stays unmapped.
- Apply `DefaultAudioStreamIndex` and `DefaultSubtitleStreamIndex` for the initial selection. The server derives both from the account's language settings when PlaybackInfo carries `UserId`, which the gateway always sends; the client adds no preference logic. An absent or -1 default subtitle means subtitles off.

### Playstate reporting

| Event | Call |
|---|---|
| First frame | `POST /Sessions/Playing` |
| Every 10 s, and on pause/seek/track change | `POST /Sessions/Playing/Progress` |
| End / stop / error | `POST /Sessions/Playing/Stopped`, with **`Failed: true` on the error path** |

- Report bodies carry `ItemId`, `MediaSourceId`, `PlaySessionId`, `PositionTicks`, `IsPaused`, `IsMuted`, `VolumeLevel`, `AudioStreamIndex`, `SubtitleStreamIndex`, `CanSeek`, and `PlayMethod`: `DirectPlay` for the original file and `Transcode` for every converted session, including one the server confirmed as DirectStream (`reportedPlan`, `packages/core/src/player/confirm-play-method.ts`). Reporting DirectStream would make the server clear `TranscodingInfo` while ffmpeg runs.
- Ticks are 10,000,000 per second.
- The server kills an HLS job 60 s after its last ping. Every start and progress report pings the session's jobs, so 10 s progress reports, which continue while paused, keep a paused conversion alive.
- **Stopping conversions.** The stopped report kills the session's jobs. Octave also calls `DELETE /Videos/ActiveEncodings?deviceId=&playSessionId=` before a new play session for the same item and when a stopped report fails, times out, or was never sent. `PlaystateReporter` sends it at most once per play session, bounded at 3 s.

### Realtime and remote control (later)

- **Socket.** `wss://host/socket` (`ws://` only where decision 0001 allows `http://`) with header auth, so it is opened natively and never with a token in the URL. Answer `ForceKeepAlive` with `KeepAlive` at half the interval. The `RealtimeConnection` port is `packages/core/src/domain/realtime.ts`; there is no TV adapter yet.
- **Cast target** (T12-06). `POST /Sessions/Capabilities/Full` with `PlayableMediaTypes: ["Video"]`, `SupportsMediaControl: true`, a `SupportedCommands` list, and the DeviceProfile.
- **Remote `Play`.** Always routed through the same negotiation. Never play a server-supplied URL directly.

### Newer server features

| Feature | Since | Use |
|---|---|---|
| Trickplay | 10.9 | `fields=Trickplay` gives tile metadata. Tiles: `GET /Videos/{id}/Trickplay/{width}/{index}.jpg?mediaSourceId=`, with the header (T8-16; Jellyscale #105) |
| Media segments | 10.10 | `GET /MediaSegments/{id}?includeSegmentTypes=Intro&includeSegmentTypes=Outro`. Precheck `HasSegments` (T8-14; Jellyscale #103) |
| Chapters | n/a | `fields=Chapters` |
| SyncPlay | n/a | Deferred (T12-08) |

### Call sequences

- **First launch:** discover or enter a URL, then `GET /System/Info/Public` and check the version; sign in with Quick Connect (code and QR) or password; store the credential (T4-05); `POST /Sessions/Capabilities/Full`.
- **Relaunch:** load the credential, then `GET /Users/Me`. On 401, sign in again.
- **Home:** in parallel, `/UserViews`, `/UserItems/Resume`, `/Shows/NextUp`, the recently-played list, and one `/Items/Latest` for the Recently added row.
- **Play:** item detail; PlaybackInfo with the profile; accept a source or show a refusal; launch the engine with a token-free typed request; report start on first frame, then progress.
- **Stop:** report stopped (with `Failed` on error), then refresh the affected rows.
- **Logout:** `POST /Sessions/Logout`, then delete the credential.

### SDK

The gateway pins `@jellyfin/sdk` 1.0.2 and axios until T2-04 replaces both with the injected transport. The gateway remains the **only** module that talks to the server.

---

## 4. Invariants

Each invariant names what enforces it today, or the task that adds the enforcement. The desktop app's native tests proved the same rules for libmpv; their names and what each proved are in `docs/mpv-options-checklist.md`.

| # | Invariant | Enforced by |
|---|---|---|
| I1 | Octave plays the original file whenever the server offers direct play, the source passes the direct-play rules, and an engine on this device can play it. It never asks the server to convert such a source, and never converts silently: every DirectStream or Transcode is shown with its reason. When no engine on the device can play a source, the one extra request sends direct play and stream copy off. The rule and the tripwire are per device ([decision 0002](docs/decisions/0002-server-transcoding-fallback.md), amended 2026-11-20) | Today: the source decision fixture tests (`packages/core/src/jellyfin/conversion-negotiation.test.ts`, `conversion-fixtures.test.ts`), flags in body *and* query (`gateway.test.ts`), the profile without codec conditions (`device-profile.test.ts`), and the server tripwire `pnpm test:tripwire` (`tests/integration/tripwire.ts`). Per device: T2-07 (capability-aware decision and the forced conversion), T2-09 (tripwire per capability set and per server), T8-20 (on devices) |
| I2 | Only two URL shapes reach a player: a `Static=true` original-file URL, or a same-origin `master.m3u8` URL rebuilt by Playback Negotiation with no credential and `EnableTrickplay=false`. Every URI inside an HLS playlist is same-origin and credential-free, checked natively before the player reads it | Today: `hls-url.test.ts` and the shared vectors (`hls-master-url-vectors.test.ts` writes and checks `packages/core/tests/fixtures/hls-master-urls.json`). Native: the Kotlin re-check and playlist validator against `hls-master-urls.json` and `hls-playlists.json` (T8-08) |
| I3 | No generic player bridge: the player module exposes only the `PlayerEngine` port's fixed methods, with typed requests and typed error codes | T2-05 (port allowlist test), T8-01 (module allowlist test that also requires a `docs/security.md` update) |
| I4 | Tokens never appear in a URL, React prop, event, log, error, or diagnostic; media, playlists, segments, subtitles, and images authenticate with the header | Today: `packages/core/src/redact.test.ts`, `redact-canary.test.ts`, `error-strip.test.ts`, and the gateway's credential-query tests. Native: T3-03 (header never logged, debug form redacted), T3-05 (canary across the JavaScript and native seam), T3-11 (images), T8-08 (playlist bodies), T10-02 (canary through a whole journey) |
| I5 | Servers require HTTPS, except plain HTTP to loopback and, after a one-time per-server confirmation, to private-LAN hosts classified by the literal host ([decision 0001](docs/decisions/0001-private-lan-http.md)). No request follows a redirect, uses a proxy, or reaches an origin other than the signed-in server's; credentials in URLs are refused | Today: one host classifier (`packages/core/src/domain/host-class.ts`) tested against `packages/core/tests/fixtures/host-classes.json`; gateway normalization refuses public HTTP before any request and refuses sign-in until the confirmation; redirects and status 0 are errors (`gateway-redirects.test.ts`). Native: T3-03 (one OkHttp client, Kotlin classifier against `host-classes.json`, MockWebServer tests with a second origin), T3-04 (build check) |
| I6 | Subtitle URLs are same-origin and validated before they are authenticated | Today: the gateway's subtitle validation tests (`gateway.test.ts`). Native: T8-10, T8-11 |
| I7 | No player or image path that cannot send the header is ever used, as a fallback or otherwise (a web video element, Media3's default data sources) | T3-04 (build check), T8-01, T3-11 |
| I8 | Only the gateway talks to the server; only the engine port talks to the player | `pnpm lint:boundaries` (dependency-cruiser; rules in `DOMAINS.md`); T3-04 for headers or tokens passed outside the transport adapter |
| I9 | No engine loads user configuration, scripts, or plugins, or follows a reference inside downloaded content; its safety options are fixed in code from typed values | Media3: its only network path is Octave's data source (T3-04, T8-02). libmpv: every item of `docs/mpv-options-checklist.md` as a test (T13-02) |

---

## 5. Known gaps

| Severity | Gap | Task |
|---|---|---|
| High | The core still reaches the server through axios and the Jellyfin SDK, and holds the token itself; decision 0005 moves the token into Kotlin and leaves the core a session id | T2-04, T3-03, T3-05 |
| Medium | The `PlayerEngine` port still carries desktop-era methods | T2-05 |
| Medium | No native validator exists yet; the vectors are proven only against the TypeScript rebuild and the desktop validator at the tag | T8-08 |

---

## Sources

- Jellyfin OpenAPI specs 10.10.7, 10.11.11, 12.4 — https://api.jellyfin.org/openapi/stable/
- Jellyfin server source at `v10.11.11` / `v12.4`: `AuthorizationContext.cs`, `MediaInfoController.cs`, `MediaInfoHelper.cs`, `VideosController.cs`, `StreamInfo.cs`, `SessionManager.cs`, `AutoDiscoveryHost.cs`
- Jellyfin server source at `v10.11.7` / `v12.4` for decision 0002: `DynamicHlsController.cs`, `DynamicHlsHelper.cs`, `DynamicHlsPlaylistGenerator.cs`, `HlsSegmentController.cs`, `PlaystateController.cs`, `TranscodeManager.cs`, `StreamBuilder.cs`, `UniversalAudioController.cs`
- Jellyfin 12.0 release notes — https://github.com/jellyfin/jellyfin/releases/tag/v12.0
- Media3 HDR playback — https://developer.android.com/media/grow/hdr-playback
- Decisions 0003 and 0004 for the shell, engine, and device evidence
