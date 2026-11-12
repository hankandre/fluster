# Architecture

This is the top-level architecture: the stack decision, the system shape, how Fluster uses the Jellyfin API, and the invariants that must hold. For deeper detail on the native playback core, see `docs/architecture.md`. For domain boundaries, see `DOMAINS.md`.

Researched 2026-11-07. Items marked **[unverified]** need confirmation with a fixture or on hardware before they are relied on.

---

## 1. Stack decision

### Verdict: keep Tauri for desktop. Plan a separate native shell for TV and mobile. Never Flutter.

Tauri 2 + React/TypeScript + Rust is the right desktop stack for a one-human, agent-heavy project:

- **The pattern is proven.** A web UI over an mpv video surface is how the Jellyfin desktop client and Plex Desktop/HTPC are built (both use Qt WebEngine + mpv). Tauri gives the same shape with a smaller footprint and Rust for the native side.
- **It is fast to build and test.** TypeScript/React is the stack coding agents handle best. Vitest and Playwright give quick oracles, and a browser engine lets most UI work happen without a native build.
- **Rust owns the dangerous parts.** libmpv, platform windowing, and URL validation live behind a narrow typed command surface.

No alternative removes the hard problems, which come from mpv and the platforms rather than from Tauri:

| Option | Why not (for now) |
|---|---|
| Qt 6 / QML | Mature mpv embedding, but the same libmpv Render API limits. C++/QML is slower for agents to work in. jellyfin-desktop reports Qt WebEngine churn. |
| CEF + SDL3 | Full control of compositing, but heavy, and needs a forked mpv. Worth watching as jellyfin-desktop explores it. |
| Electron | Same overlay limits as Tauri, ~10× the footprint |
| Slint / egui / iced | Smaller ecosystems; same Render API limit |
| GTK4 / libadwaita | Linux only |
| Native per platform | Best quality, but N codebases for one developer |
| Flutter | Excluded by product principle |

### Constraints that shape the roadmap

1. **HDR needs mpv to own its surface.** The libmpv Render API, which Fluster uses today, does not support `vo=gpu-next`/libplacebo (mpv issue #10810, open as of 2026-10). Wayland HDR passthrough and newer Dolby Vision handling are `gpu-next`-only. This applies to *every* toolkit that uses the Render API, not just Tauri. The path forward is to let mpv render into its own Wayland subsurface (Vulkan, `gpu-next`) with the WebView composited above it. Keep the Render API path as the SDR fallback until the spike succeeds. This is milestone M2's first spike.
2. **Linux WebView is WebKitGTK on GTK3.** wry's GTK4/webkitgtk-6.0 port is unmerged (wry #1474/#1767). There are known transparency and DMA-BUF issues on Wayland/NVIDIA. Pin versions and keep a compositor × GPU smoke matrix.
3. **Windows needs a composition spike.** Before promising Windows, test a transparent WebView2 over an mpv D3D11 surface (mpv 0.42 added a D3D11 Render API backend). **[unverified]** whether WebView2 transparency over a sibling D3D HWND is reliable.
4. **Tauri will not reach tvOS.** The maintainers closed tvOS as not planned, and tvOS has no WebView. Tauri mobile has no native-video-under-WebView plugin.

### TV and mobile direction (M6, moved earlier by decision 0002)

Keep the domain, Jellyfin gateway, playback policy, and coordinator **framework-free TypeScript**, so a second shell can reuse them unchanged. The shell spike starts once the fallback negotiation (P10-03) lands, because the TV engine must play the same plans, including HLS with header authentication. The leading candidate shell is React Native (`react-native-tvos`) with a native mpv module (MPVKit on Apple, libmpv on Android). Streamyfin ships this combination on iOS, Android, tvOS, and Android TV. A SwiftUI app is the fallback for Apple TV.

### Revisit this decision if

- the Wayland subsurface HDR spike fails under WebKitGTK and CEF is the only working route
- wry stops tracking WebKitGTK releases, or WebKitGTK regressions block playback for two consecutive releases
- the Windows composition spike fails on both HWND and composition-hosted WebView2

---

## 2. System shape

```text
┌──────────────────────────────── Shell (per platform) ───────────────────────────────┐
│  Desktop: Tauri window                         Future: RN/native TV & mobile shell   │
│  ┌──────────── WebView (React) ────────────┐                                         │
│  │ UI features: auth · catalog · player    │                                         │
│  └───────────────┬─────────────────────────┘                                         │
│                  │ uses                                                              │
│  ┌───────────────▼─────────── Core (framework-free TS) ───────────────────────────┐  │
│  │ domain/        pure types + rules (policy, ticks, start choice, track mapping) │  │
│  │ application    use cases: sign-in, catalog queries, playback session, reports  │  │
│  │ ports          PlayerEngine, CredentialVault, Clock                            │  │
│  └───────┬────────────────────────────────────────────┬───────────────────────────┘  │
│          │ adapters                                   │ adapters                     │
│  ┌───────▼──────────────┐                 ┌───────────▼─────────────────────────┐    │
│  │ Jellyfin gateway     │                 │ NativePlayerEngine ─ Tauri invoke ─┐│    │
│  │ (@jellyfin/sdk/HTTP) │                 │ BrowserPlayerEngine (dev/CI only)  ││    │
│  └──────────────────────┘                 └────────────────────────────────────┘│    │
│                                                                                 ▼    │
│  Rust: typed commands → MpvController (libmpv in-process) → platform surface         │
│        (GTK GLArea on Wayland · NSOpenGLView on macOS · D3D11 on Windows, planned)   │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

- **Desktop composition.** The native video surface sits beneath a transparent WebView. React measures the player rectangle and Rust positions the surface. See `docs/architecture.md`.
- **The engine is a port.** `PlayerEngine` is the seam between the core and any player: native mpv, the dev-only browser engine, or a future mobile/TV engine.
- **Rust exposes a fixed command list:** initialize, load, surface geometry, pause, seek, volume, mute, track selection, fullscreen, stop, the server socket's connect and disconnect, and LAN server discovery (`discover_servers`, no arguments, read-only; added by P3-03 with the user's approval on 2026-11-07). Adding a command is an architectural change (see the invariants). Decision 0002 adds no command: an HLS launch is a typed `delivery` field on the load request.
- **System media controls (Linux MPRIS)** live in `src-tauri/src/media_controls/`, not behind a command. Play, pause, and seek call the same `MpvController` methods as the commands. Stop reaches the frontend as the typed `fluster://media-control` event `{ action: "stop" }`, which runs Back, so Stopped is reported. MPRIS sees only the title, length, play state, and position. Its track id is `/app/fluster/Fluster/Track/<n>`, where n counts sessions in this run, so a seek aimed at an earlier session is ignored.
- **In-process libmpv** trades fault isolation for integrated presentation. A driver crash takes the app down. Keep the native layer isolated so it can move out of process later.

---

## 3. Jellyfin API usage

### Supported servers

- **Jellyfin 10.11.x and 12.x.** Jellyfin 12.0 shipped 2026-09-08; 12.4 is current.
- Gate on parsed semver (`>= 10.11.0`) plus **feature detection** (`HasSegments`, presence of `Trickplay`), not exact-version regexes.
- 12.x turns off legacy authorization by default. The `api_key` query parameter, the `X-Emby-*` headers, and the `Emby` scheme are ignored unless an admin re-enables them. Checked on the 12.4.0 fixture (P1-04): `GET /Users/Me?api_key=` returns 401, but `?ApiKey=` (capital K) and the `Authorization` header both return 200.
- The static stream and subtitle routes are anonymous on 10.11.7 and 12.4.0: `VideosController.GetVideoStream` and `SubtitleController.GetSubtitle` carry no `[Authorize]` (v12.4 at 83d0d0e, lines 314 and 208), and both fixtures answered 206/200 with no header or a bogus token. Header auth for media is therefore about keeping tokens out of URLs (I4) and working with servers or proxies that do require auth, not about 12.x compatibility.

### Authentication and identity

| Concern | Approach |
|---|---|
| Header | `Authorization: MediaBrowser Client="Fluster", Device="…", DeviceId="…", Version="…", Token="…"`. Values are quoted and URL-encoded. The SDK builds this. |
| Media requests | **Header auth, not query auth.** Rust passes the `Authorization` header to libmpv through a fixed, typed `http-header-fields` value set at load time. The token never appears in a URL. Use `ApiKey=` (capital K) only where a header is impossible. Never send both. |
| DeviceId | The server keeps **one token per DeviceId**. Persist a random install ID (`fluster.installId` in localStorage; not secret) and derive `DeviceId = SHA-256(installId:serverId:username)`. The login request carries the DeviceId before the user id exists, so the lowercased username stands in for the user id. Never generate a new one per launch. |
| Password login | `POST /Users/AuthenticateByName` `{Username, Pw}` returns `AccessToken`, `User`, `ServerId` |
| Quick Connect | 1. `GET /QuickConnect/Enabled`. 2. `POST /QuickConnect/Initiate` (GET was removed in 12.0) returns `{Secret, Code}`. 3. Show the code and poll `GET /QuickConnect/Connect?secret=` until `Authenticated`. 4. `POST /Users/AuthenticateWithQuickConnect` `{Secret}` |
| Validate a stored token | `GET /Users/Me`. On 401, return to sign-in. |
| Logout | `POST /Sessions/Logout` (revokes the token on the server), then delete the local credential |
| Token storage | Session-only today. M1 proposes opt-in OS keyring storage (Secret Service, Keychain, Credential Manager) owned by Rust, never WebView storage. Needs a decision record and a `docs/security.md` update. |
| Discovery | Probe a URL with `GET /System/Info/Public` (no auth; returns `Id`, `ServerName`, `Version`). LAN discovery (desktop only, `discover_servers`, P3-03) broadcasts `who is JellyfinServer?` to UDP 7359 on IPv4; replies are `{Address, Id, Name, EndpointAddress}` (`AutoDiscoveryHost.cs` and `ServerDiscoveryInfo.cs`, identical at v10.11.7 and v12.4; the server listens on `IPAddress.Any`, so there is no IPv6 discovery). Key saved servers by `Id`, not URL. Discovered addresses are usually `http://` LAN URLs. They follow the host-class rule of `docs/decisions/0001`: Rust never lists a reply whose `Address` fails the URL policy (a public `http://` address is counted and shown as refused, never probed), lists each reply with the IP it came from, and marks two replies that claim the same `Id` at different addresses as conflicting. Choosing a listed address runs the same probe and confirmation as a typed one, and is refused unless the probe reports the discovered `Id`. A limited broadcast does not cross subnets, and the server answers with the address it believes it has, which behind NAT or a container network may not be reachable from the client. |

### Catalog (10.9+ paths; old `/Users/{userId}/…` routes are obsolete)

| Need | Endpoint |
|---|---|
| Libraries | `GET /UserViews` (filter by `CollectionType`) |
| Browse / search | `GET /Items?parentId=&includeItemTypes=&recursive=true&sortBy=&sortOrder=&startIndex=&limit=&fields=&searchTerm=&enableImageTypes=Primary,Backdrop,Thumb,Logo&imageTypeLimit=1&enableTotalRecordCount=false` (`true` on the first library page only, `startIndex=0`, for the toolbar count) |
| Continue Watching | `GET /UserItems/Resume?mediaTypes=Video&limit=` |
| Next Up | `GET /Shows/NextUp?limit=&enableRewatching=false`; series form (series page): `GET /Shows/NextUp?seriesId=&limit=1&enableUserData=true&enableResumable=true&enableRewatching=false&enableImages=false&enableTotalRecordCount=false` |
| Latest per library | `GET /Items/Latest?parentId=&limit=&groupItems=true` (returns an array, not a QueryResult) |
| Series | `GET /Shows/{id}/Seasons`, `GET /Shows/{id}/Episodes?seasonId=` |
| Next episode | `GET /Shows/{id}/Episodes?adjacentTo={episodeId}` (the entry after the current one) |
| Detail | `GET /Items/{id}?userId=` with no `fields`: the SDK's `getItem` takes only a user id, and recordings on 10.11.7 and 12.4.0 (`item-detail-no-fields-*.json`) show the full item, including `MediaSources`, `MediaStreams`, `People`, `Genres`, and `UserData` (+ `/Similar`, `/SpecialFeatures`) |
| Type-ahead | `GET /Search/Hints` (lighter DTO; use `/Items?searchTerm=` for result pages) |
| Filters | `GET /Items/Filters2?parentId=`, `filters=IsUnplayed,IsResumable,IsFavorite` |
| Played / favorite | `POST`/`DELETE /UserPlayedItems/{id}`, `POST`/`DELETE /UserFavoriteItems/{id}` |
| Images | `GET /Items/{id}/Images/{type}?tag=&maxWidth=&quality=&format=Webp`. Tagged URLs are immutable, so cache by `(id, type, tag, size)` forever. Use `ImageBlurHashes` for placeholders. No token needed. Cards and details carry `logo` and `thumb` refs (type `Logo`/`Thumb`, with BlurHash); an episode without its own falls back to `ParentLogoItemId`/`ParentLogoImageTag` and `ParentThumbItemId`/`ParentThumbImageTag`, which the server sets when those image types are enabled (not `ItemFields` values). |

Performance rules:
- Request only the `fields` a view renders. Cards need little; list endpoints (`/Items`) honor `fields`, but `GET /Items/{id}` takes none and returns the full item.
- `ProductionYear` and `RunTimeTicks` are always returned and are not valid `fields` values.
- Set `enableTotalRecordCount=false` unless paging needs counts.
- Set `enableUserData` only where watched or progress state is shown.

### Playback negotiation (the core)

Policy: [decision 0002](docs/decisions/0002-server-transcoding-fallback.md). Play the original file whenever possible; otherwise let the server remux or transcode over HLS, show it, and authenticate every request with the header. **Implementation status:** negotiation, the profile, the source decision, and the HLS URL rebuild below are implemented (P10-03). The native engine plays `hls` plans through Rust's typed HLS path (P10-04, below); the browser engine still refuses them with a typed `UnsupportedDeliveryError` before any player call (P10-10), and playstate reports still say `DirectPlay` (P10-06).

```text
GET  /Items/{id}?fields=MediaSources,Chapters,Trickplay      → versions, chapters, trickplay
POST /Items/{id}/PlaybackInfo                                → MediaSources[] evaluated for THIS device
     body:  UserId, StartTimeTicks, MediaSourceId?, MaxStreamingBitrate: <user's local or remote limit>,
            AudioStreamIndex?, SubtitleStreamIndex? (renegotiation only, also in the query),
            EnableDirectPlay:true, EnableDirectStream:true, EnableTranscoding:true,
            AllowVideoStreamCopy:true, AllowAudioStreamCopy:true, AutoOpenLiveStream:false,
            AlwaysBurnInSubtitleWhenTranscoding:false, DeviceProfile: FLUSTER_PROFILE
     query: the same flags and MaxStreamingBitrate, duplicated (AlwaysBurnInSubtitleWhenTranscoding is body-only)
decide   DirectPlay   → GET /Videos/{id}/stream?Static=true&MediaSourceId=&PlaySessionId=   (header auth, via libmpv)
         DirectStream → GET /videos/{id}/master.m3u8?… rebuilt from TranscodingUrl, credentials stripped,
         Transcode      EnableTrickplay=false                                               (header auth on every playlist and segment)
         Refuse       → typed RefusalReason
```

**Always send a DeviceProfile.** The server applies `EnableDirectPlay`, user policy, the remote bitrate limit, and `ForceRemoteSourceTranscoding` only inside `SetDeviceSpecificData`, which runs **only when a profile is present**. That is also the only place subtitle `DeliveryMethod`/`DeliveryUrl` get filled in. Without a profile, the server's direct-play evaluation is skipped and external subtitles have no URL.

The profile accepts everything for direct play, so a codec never causes a conversion, and offers one HLS target per media type for fallback:

- `DirectPlayProfiles`: `[{ "Type": "Video" }, { "Type": "Audio" }]` (match-all).
- `TranscodingProfiles`: Video, `Protocol: "hls"`, `Context: "Streaming"`, `Container: "mp4"` (fMP4, so HEVC and AV1 can be stream-copied), `VideoCodec` with the encode target first (proposed `h264,hevc,av1,vp9`), `AudioCodec` (proposed `aac,ac3,eac3,opus,flac,mp3`), `EnableSubtitlesInManifest: false`; Audio, `Protocol: "hls"`, `Container: "mp4"`, `AudioCodec: "aac"`. Lists are confirmed by contract fixtures (P10-02).
- `CodecProfiles`, `ContainerProfiles`: empty.
- `SubtitleProfiles`: `External` and `Embed` for `srt`, `ass`, `ssa`, `vtt`, `sub`, `pgssub` (External) and `srt`, `ass`, `ssa`, `pgssub`, `dvdsub`, `vtt` (Embed). Never `Hls`: HLS subtitle renditions carry `ApiKey={token}` in the playlist (`DynamicHlsHelper.cs` v10.11.7 line 615).
- `MaxStreamingBitrate`: the user's limit; `MaxStaticBitrate`: 1 Gbps.

Empty `Container`/`VideoCodec`/`AudioCodec` fields mean "match anything": `ContainerHelper.ContainsContainer` returns true for an empty profile list (`MediaBrowser.Model/Extensions/ContainerHelper.cs` lines 82-88 at v10.11.7 and v12.4), and `StreamBuilder` uses it for the container, video, and audio checks (v12.4 lines 1346, 1357, 1366). A source with an empty `Container` does not match, which is the BluRay folder case. Contract fixtures confirm `SupportsDirectPlay: true` with this profile on 10.11.7 and 12.4.0 for the H.264/AAC, HEVC Main10 HDR10, AV1, embedded-ASS, and multi-audio (AAC + AC-3) MKV samples.

**Source decision.** `decideSource` (`src/lib/jellyfin/source-acceptance.ts`) returns `DirectPlay`, `DirectStream`, `Transcode`, or `Refuse`. Rules run in order and the first that decides wins:

1. `Id` missing: Refuse `missing-source-data`.
2. `RequiresOpening` is `true` (a live source): Refuse `live-source`, until Live TV has a decision record.
3. **DirectPlay** when all hold: `SupportsDirectPlay === true`; `Protocol === "File"`; `Path` present; `VideoType` is not `BluRay`, `Dvd`, or `Iso` (any case) and `Path` has no `BDMV` or `VIDEO_TS` segment and does not end in `.iso`; `TranscodingUrl` is empty. A `Static=true` request for a disc folder silently starts ffmpeg on the server, so disc sources never direct play.
4. A disc folder or ISO that the server offered for direct play (and sent no `TranscodingUrl`): send a second PlaybackInfo for that `MediaSourceId` with `EnableDirectPlay: false`, then apply the rules to the answer once. If the answer still offers direct play, Refuse `disc-source` or `iso-source`; there is never a third request.
5. **DirectStream** or **Transcode** when `TranscodingUrl` is present, `TranscodingSubProtocol` is `hls` (otherwise Refuse `unsafe-transcoding-url`), and the rebuilt URL passes the HLS URL rules below. DirectStream only when the URL shows that video and audio are copied: `TranscodeReasons` is present and every value is `ContainerNotSupported` or `VideoCodecTagNotSupported`; there is no `SubtitleMethod=Encode`, `AlwaysBurnInSubtitleWhenTranscoding=true`, `RequireAvc=true`, or `AllowVideoStreamCopy`/`AllowAudioStreamCopy=false` (names in any case); the source has one video stream whose codec is in the URL's `VideoCodec` list and that is within any `VideoBitrate`, `MaxWidth`, `MaxHeight`, and `MaxFramerate` in the URL, with each compared value known (video path only); and, when the source has audio, the URL's `AudioCodec` is exactly the codec of the source stream at `AudioStreamIndex` (or `DefaultAudioStreamIndex`), because `StreamBuilder` narrows that list to the source codec only when it copies the stream, and that stream is within any `AudioBitrate` and `AudioSampleRate`. The limits mirror `EncodingHelper.CanStreamCopyVideo` and `CanStreamCopyAudio` (v10.11.7 lines 2317-2560). Anything else, including an absent `TranscodeReasons` (the BluRay folder) or an unknown reason, is Transcode. Evidence and the 12.4 `AudioCodecNotSupported` cause: plan 002 decision log (P10-03). **This label is provisional** (the user, 2026-11-08): the P10-09 tripwire showed both fixtures stream-copy the BluRay folder and the ISO that the URL rule calls Transcode. After the first frame of a converted session, the coordinator asks the server (`JellyfinGateway.sessionPlayMethod`: `GET /Sessions?deviceId=`, matched by device, `NowPlayingItem.Id`, and `PlayState.MediaSourceId`, because `SessionInfoDto` carries no play-session id) at 3 s and, if the server has no `TranscodingInfo` yet, once more at 10 s. The plan then becomes DirectStream exactly when `TranscodingInfo.IsVideoDirect` and (for a source with audio) `IsAudioDirect` are true, otherwise Transcode, and the server's `TranscodeReasons` join the plan's. The indicator and the information panel follow it; playstate reports do not (user decision, 2026-11-08): every start, progress, and stopped report for a converted (`hls`) session keeps `PlayMethod: Transcode`, because a report with another method makes Jellyfin clear the session's `TranscodingInfo` while ffmpeg still runs (see Playstate reporting). A failed or empty answer keeps the URL's label, so original quality is never claimed without the server saying it copies. The check runs in the background, is aborted when the attempt ends, and nothing that leaves the player waits for it. The tripwire compares `/Sessions` `TranscodingInfo` with this confirmed method and expects the reported `PlayMethod` to stay `Transcode`.
6. Otherwise Refuse: `conversion-not-allowed` (no direct play and the server offers no conversion, for example user policy; both servers send no `ErrorCode` then), `not-a-file` (direct play offered for a non-`File` source and no conversion), `missing-source-data` (direct play offered without a `Path`), or `no-sources`.

With several versions, the first DirectPlay source wins, then the first DirectStream, then the first Transcode, then the first disc that needs the forced fallback, then the first refusal. A requested `MediaSourceId` is never replaced by another version. The gateway throws `PlaybackRefusedError` with a typed `RefusalReason` (`src/domain/playback.ts`). Multiple versions are listed by `MediaSources[].Name`.

**HLS URL rules.** A `TranscodingUrl` is never used as given, logged, or shown (`src/lib/jellyfin/hls-url.ts`). Playback Negotiation resolves a relative one against the normalized server URL (including any base path, as for the static URL) and refuses it unless the path is `/videos/{itemId}/master.m3u8` (a source with video, or a `VideoType`) or `/audio/{itemId}/master.m3u8` (an audio-only source) (any case; the id compared without dashes and case) for the requested item, on the server's origin, with no user info, with exactly one `MediaSourceId` naming the chosen source, and with any `PlaySessionId` equal to the PlaybackInfo answer's. A query name with whitespace or a control character is refused. It then removes every credential parameter (`ApiKey`, `api_key`, `access_token`, `Token`, `X-Emby-Token`, plus `ApiToken` and `AccessToken`; any case, also percent-encoded), sets `EnableTrickplay=false` exactly once (the server defaults it to `true` and then lists trickplay playlists with `ApiKey={token}`, `DynamicHlsController.cs` v10.11.7 line 464, `DynamicHlsHelper.cs` line 652), removes `EnableSubtitlesInManifest=false` and refuses any other value, and refuses any `SubtitleMethod` other than `Encode`, `Embed`, `External`, or `Drop` (trimmed, any case; so `Hls` and numeric enum values are refused). Rust's `validate_master_url` (`src-tauri/src/player/hls/master_url.rs`) re-checks the result with the same rules against the plan's `serverUrl` (base path included), item, source, play session, and `mediaKind`; the plans the TypeScript negotiation builds from the recorded fixtures are shared test vectors (`tests/fixtures/hls-master-urls.json`), so the two cannot drift. The server builds variant and segment URLs from the request's own query string (`DynamicHlsHelper.cs` lines 152, 188-189; `DynamicHlsPlaylistGenerator.cs` lines 72-98), so they carry no key either. `DynamicHlsController` is `[Authorize]` (line 40) and reads the header token before any `ApiKey` query (`AuthorizationContext.cs` lines 90-106). `/Audio/{id}/universal` is never used, because it can redirect (`UniversalAudioController.cs` lines 175-177).

**Playlist validation (E1-B, approved 2026-11-07).** Rust fetches the master and every variant playlist itself and rejects the whole playlist unless every URI line and `URI=` attribute (stream, i-frame, media, map, key, session key, image) resolves to HTTP(S) on the server's origin with no user info and no credential parameter, and unless the body contains no credential parameter name at all (fail closed). mpv reads only Rust's validated copies, served from a `127.0.0.1` loopback server on a random per-session path; `access-references` is on only for these sessions, and mpv opens the master only through FFmpeg's `hls` demuxer (per-file `demuxer=lavf,demuxer-lavf-format=hls`), never its playlist demuxer. External subtitles on these sessions are fetched and checked by Rust and served from the same loopback server. Every handle disables FFmpeg's HTTP proxy (`http_proxy=direct://`). The load request's typed `delivery` field (`static` or `hls`, with `serverUrl` and `mediaKind` for `hls`) selects this path; `LaunchMedia` (`src-tauri/src/player/media.rs`) prepares the session before any mpv handle exists, picks the handle options, and is the only code that loads media. A validation failure is the `unsafe-transcoding-url` refusal. On a converted session only the one audio track (the master URL's `AudioStreamIndex`) and the loopback subtitle files are mapped to Jellyfin indices; local track switching among them works. The player's track menus list the source's streams (`src/domain/track-choice.ts`): choosing one the conversion lacks, or changing subtitles while they are burned in, renegotiates at the current position with `AudioStreamIndex` and `SubtitleStreamIndex` (`-1` for off) in body and query and the playing `MediaSourceId` in the body, which the server needs to apply them (`MediaInfoHelper.cs` v10.11.7 lines 206-211, v12.4 lines 218-223). A streaming-limit change for this server's host class while playing renegotiates a conversion, or the original file when the new limit is below its bitrate (P10-08). Both, and Play original, use `PlaybackCoordinator.renegotiate`: the old session is stopped, reported Stopped with `Failed: true` so the server leaves the user's play state alone (a non-failed stop runs `UpdatePlayState`, `SessionManager.cs` v10.11.7 line 1115, v12.4 line 1176, which past the resume cutoff marks the item played and counts it again at the real end; the new session's progress reports record the position), and its encode deleted before the new negotiation. Direct play switches tracks in mpv only. Details: decision 0002 and `docs/security.md`.

**Indicator.** A DirectStream or Transcode plan carries its method and the server's `TranscodeReasons` (read from the URL; the `MediaSourceInfo` property is `[JsonIgnore]`). The player shows "Converting on server: {reason}" or "Repackaging on server, original quality: {reason}", and the information panel shows the method.

**Subtitles and track mapping.**

- External subtitle `DeliveryUrl` arrives as `/Videos/{id}/{msId}/Subtitles/{idx}/0/Stream.{fmt}?ApiKey=…`. Strip every query credential (`ApiKey`, `api_key`, `access_token`, `Token`, `X-Emby-Token`, any case), validate same-origin, and load it via `sub-add` with header auth.
- While converting, HLS segments cannot carry subtitles (`IsSubtitleEmbedSupported`, `StreamBuilder.cs` v10.11.7 line 1522), so the server offers text subtitles as `External` and Fluster loads them the same way. Graphical subtitles it cannot extract are burned in (`Encode`, lines 1514-1519), and the indicator says so.
- Embedded subtitles are rendered by mpv directly.
- **Jellyfin numbers external streams first.** Embedded streams have `Index = ffprobeIndex + externalCount`. Map mpv `ff-index` to Jellyfin index as `ff-index + count(IsExternal)`. Map external tracks by the order Fluster added them.
- Apply `DefaultAudioStreamIndex` and `DefaultSubtitleStreamIndex` for the initial selection.
- The server already derives both defaults from the user's configuration (`AudioLanguagePreference`, `PlayDefaultAudioTrack`, `SubtitleLanguagePreference`, `SubtitleMode`, and remembered selections) in `MediaSourceManager.SetDefaultAudioAndSubtitleStreamIndices` when `PlaybackInfo` carries `UserId`, which the gateway always sends; the gateway passes them through unchanged and the client adds no preference logic (P3-13). `SubtitleMode: None` yields no `DefaultSubtitleStreamIndex`, so the player sets `sid=no`. With `PlayDefaultAudioTrack` on (the server default), the file's default audio track wins over `AudioLanguagePreference`; recorded fixtures cover a Spanish preference with it off and `SubtitleMode: None`, and remembered selections are unverified live.
- Implemented in `src-tauri/src/player/tracks.rs` (P1-05). Every candidate is verified by type, language, and codec family; a failed `ff-index` candidate falls back to the Nth embedded stream of that type, and anything still unclear stays unmapped. mpv gives each `sub-add` file its own demuxer, so an external track reports `external: yes` and `ff-index` 0 and only add order identifies it; sessions set `autoload-files=no` so no other external track can appear. An absent or -1 default subtitle, or one mpv does not expose, sets `sid=no`. Playstate reports carry the Jellyfin index of the selected track.

### Playstate reporting

| Event | Call |
|---|---|
| First frame | `POST /Sessions/Playing` |
| Every 10 s, and on pause/seek/track change | `POST /Sessions/Playing/Progress` |
| End / stop / error | `POST /Sessions/Playing/Stopped`, with **`Failed: true` on the error path** so the server records no bogus progress |

- Report bodies carry `ItemId`, `MediaSourceId`, `PlaySessionId`, `PositionTicks`, `IsPaused`, `IsMuted`, `VolumeLevel`, `AudioStreamIndex`, `SubtitleStreamIndex`, `CanSeek`, and `PlayMethod` from the plan: `DirectPlay` for the original file and `Transcode` for every converted (`hls`) session, including one rule 5's check confirmed as DirectStream (`reportedPlan`, `src/lib/player/confirm-play-method.ts`, applied by `PlaystateReporter`). Reporting DirectStream would make the server run `ClearTranscodingInfo` and lose the running job; the UI label is not changed by this. The server rewrites `Transcode` to `DirectPlay` when it has no job for the session (`ValidatePlayMethod`, `PlaystateController.cs` v10.11.7 lines 522-531).
- Ticks are 10,000,000 per second.
- The server applies its min/max resume percentages when it records progress.
- The server kills an HLS job 60 s after its last ping (`TranscodeManager.PingTimer`, v10.11.7 lines 144-170). Every start and progress report pings the session's jobs (`TranscodeManager.OnPlaybackProgress`, v10.11.7 lines 95-96 and 709-715, v12.4 lines 95-96 and 710-716), so Fluster's 10 s progress reports, which continue while paused, keep a paused conversion alive and it sends no `/Sessions/Playing/Ping`. Fixture check (P10-07, both servers): with `IsPaused=true` reports every 10 s the job survived 90 s and resumed without a restart; after one `IsPaused=true` report and silence it was killed at about 60 s and restarted on resume.
- **Stopping conversions.** The stopped report kills the session's jobs (`PlaystateController.cs` v10.11.7 lines 249-253). Fluster also calls `DELETE /Videos/ActiveEncodings?deviceId=&playSessionId=` (`HlsSegmentController.cs` lines 108-115) before starting a new play session for the same item (retry, quality or track change) and when a stopped report fails, times out, or was never sent (start not reported). The `PlaystateReporter` sends it, at most once per play session, bounded at 3 s, inside the background drain: the next negotiation waits for it, leaving the player never does. Seeking needs no call: the server restarts ffmpeg at the requested segment (`DynamicHlsController.GetDynamicSegment`, lines 1490-1539).

### Realtime and remote control (M5)

- **Socket.** Open `wss://host/socket` (`ws://` only where decision 0001 allows `http://`) with header auth. Answer `ForceKeepAlive` with `KeepAlive` at half the interval.
- **Decision (P3-15): the socket lives in Rust.** The WebView's WebSocket API cannot set an `Authorization` header, and a token in the socket URL would break I4. Jellyfin authenticates the upgrade through the same `AuthorizationContext` as REST (`WebSocketManager.WebSocketRequestHandler` → `AuthService.Authenticate`, 10.11.11 and 12.4), so header auth works. Rust (`src-tauri/src/realtime.rs`) owns one connection behind the typed `realtime_connect`/`realtime_disconnect` commands, answers keepalives itself, and emits only `user-data-changed` and `connection` events on `fluster://server-event`. Browser dev mode has no socket. Remote control (`Play`, `Playstate`, `GeneralCommand`) is P8-01.
- **Messages.** Handle `UserDataChanged` (refresh watched badges), `LibraryChanged`, `Playstate`, `GeneralCommand`, `Play`, and `ServerRestarting`.
- **Cast target.** `POST /Sessions/Capabilities/Full` with `PlayableMediaTypes: ["Video"]`, `SupportsMediaControl: true`, a `SupportedCommands` list, and the DeviceProfile.
- **Remote `Play`.** Always route it through the same negotiation path. Never play a server-supplied URL directly.

### Newer server features

| Feature | Since | Use |
|---|---|---|
| Trickplay | 10.9 | `fields=Trickplay` gives tile metadata per media source and width. Tiles come from `GET /Videos/{id}/Trickplay/{width}/{index}.jpg?mediaSourceId=` |
| Media segments | 10.10 | `GET /MediaSegments/{id}?includeSegmentTypes=Intro&includeSegmentTypes=Outro`. Precheck `MediaSourceInfo.HasSegments`. Plugin-populated, so often empty. |
| Chapters | — | `fields=Chapters`; images via `/Items/{id}/Images/Chapter?imageIndex=` |
| SyncPlay | — | Large separate protocol; deferred to M5 |

### Call sequences

- **First launch:**
  1. Discover or enter a URL, then `GET /System/Info/Public` and check the version.
  2. Sign in with Quick Connect or password.
  3. Store the credential if the user opted in.
  4. `POST /Sessions/Capabilities/Full`.
  5. Open the socket (M5).
- **Relaunch:** load the credential, then `GET /Users/Me`. On 401, sign in again.
- **Home:** in parallel, `/UserViews`, `/UserItems/Resume`, `/Shows/NextUp`, and `/Items/Latest` per view.
- **Play:**
  1. Item detail.
  2. PlaybackInfo with the profile.
  3. Accept a source or show a refusal.
  4. Launch mpv with header auth and subtitles (static URL, or HLS with `delivery: "hls"`).
  5. Fetch segments (optional).
  6. Report start on first frame, then progress.
- **Stop:** report stopped (with `Failed` on error), then refresh the affected rows.
- **Logout:** `POST /Sessions/Logout`, then delete the credential.

### SDK

Fluster pins `@jellyfin/sdk` 1.0.2. The gateway remains the **only** module that talks to the server.

---

## 4. Invariants

Each invariant has an enforcement mechanism. Where the mechanism is "planned", it is tracked in `WORKFLOW.md` → Mechanical enforcement backlog.

| # | Invariant | Enforced by |
|---|---|---|
| I1 | Fluster plays the original file whenever the server offers direct play and the source passes the direct-play rules; it never asks the server to convert such a source, and it never converts silently: every DirectStream or Transcode is shown with its reason ([decision 0002](docs/decisions/0002-server-transcoding-fallback.md)) | Source decision function (§3) with fixture tests (`conversion-negotiation.test.ts`); flags in body *and* query; DeviceProfile without codec conditions; server tripwire `pnpm test:tripwire` (every playable sample must direct play; disc and forced-limit samples must convert with the indicator; P10-09); indicator journey tests (P10-06). |
| I2 | Only two URL shapes reach the player: a `Static=true` original-file URL, or a same-origin `master.m3u8` URL rebuilt by Playback Negotiation with no credential and `EnableTrickplay=false`; every URI inside an HLS playlist is same-origin and credential-free, checked by Rust before mpv reads it | Gateway URL builders; Rust URL and playlist validation by the typed `delivery` (`player/media.rs`, `player/hls/`); shared TS/Rust master-URL vectors (`tests/fixtures/hls-master-urls.json`); cross-origin playlist launch test (`hls_launch_with_a_cross_origin_playlist_is_refused_and_contacts_nobody_else`) |
| I3 | No generic mpv command bridge; Rust exposes a fixed command list | Code review; `command_allowlist` Rust test (`src-tauri/src/command_allowlist.rs`) |
| I4 | Tokens never appear in logs, errors, diagnostics, or URLs; HLS playlists and segments authenticate with the header | Redaction in TS and Rust; canary tests (TS `redact-canary.test.ts`, Rust `redaction_canary`); Rust refuses stream, HLS, and subtitle URLs with a credential query parameter (`validate_playback_urls`, `validate_master_url`); HLS playlist-body canary (`redaction_canary_in_a_playlist_body_fails_the_launch_closed`) |
| I5 | Servers require HTTPS, except plain HTTP to loopback and, after a one-time per-server confirmation, to private-LAN hosts classified by the literal host ([decision 0001](docs/decisions/0001-private-lan-http.md)); tokens never go over plain HTTP to public hosts or across cross-origin redirects; credentials in URLs are rejected | Enforced: one host classifier in TS (`src/domain/host-class.ts`) and Rust (`src-tauri/src/url_policy.rs`), both tested against `tests/fixtures/host-classes.json`; gateway URL normalization refuses public HTTP before any request and the gateway refuses sign-in calls until the private-LAN confirmation; the gateway client and libmpv (`max_redirects=0`, also on HLS nested opens: `hls_launch_sends_the_header_on_every_request_and_never_follows_a_segment_redirect`) follow no redirects and use no HTTP proxy; gateway, sign-in, and Rust tests |
| I6 | Subtitle URLs must be same-origin and validated before authentication | TS + Rust checks, tests |
| I7 | The browser engine is never a silent fallback for native, and it does not play HLS | App wiring, review |
| I8 | Only the gateway talks to Jellyfin; only the engine port talks to the player | Import-boundary lint (`pnpm lint:boundaries`, dependency-cruiser; rules in `DOMAINS.md`) |
| I9 | libmpv user config, scripts, and default input bindings stay disabled | MpvController initialization, tests |

---

## 5. Known gaps (from the 2026-11 API review)

Tracked in `docs/plans/active/001-jellyfin-api-correctness.md`.

| Severity | Gap |
|---|---|
| Medium | Refusal reasons: typed reasons exist (`RefusalReason` in `src/domain/playback.ts`); UI copy is P3-09 |

---

## Sources

- Jellyfin OpenAPI specs 10.10.7, 10.11.11, 12.4 — https://api.jellyfin.org/openapi/stable/
- Jellyfin server source at `v10.11.11` / `v12.4`: `AuthorizationContext.cs`, `MediaInfoController.cs`, `MediaInfoHelper.cs`, `VideosController.cs`, `StreamInfo.cs`, `FFProbeVideoInfo.cs`, `SessionManager.cs`, `AutoDiscoveryHost.cs`
- Jellyfin server source at `v10.11.7` / `v12.4` for decision 0002: `DynamicHlsController.cs`, `DynamicHlsHelper.cs`, `DynamicHlsPlaylistGenerator.cs`, `HlsSegmentController.cs`, `PlaystateController.cs`, `TranscodeManager.cs`, `StreamBuilder.cs`, `UniversalAudioController.cs`
- mpv v0.41.0 `demux/demux_lavf.c`, `stream/stream_lavf.c`; FFmpeg `libavformat/hls.c`, `aviobuf.c` (master at 2bf291526e)
- Jellyfin 12.0 release notes — https://github.com/jellyfin/jellyfin/releases/tag/v12.0
- Jellyfin API authorization guide — https://gist.github.com/nielsvanvelzen/ea047d9028f676185832e51ffaf12a6f
- mpv Render API / gpu-next — https://github.com/mpv-player/mpv/issues/10810, mpv v0.42.0 release notes
- Tauri tvOS — https://github.com/tauri-apps/tauri/issues/6364; wry GTK4 — wry #1474, #1767; Linux graphics — https://v2.tauri.app/develop/debug/linux-graphics/
- jellyfin-desktop — https://github.com/jellyfin/jellyfin-desktop; Swiftfin — https://github.com/jellyfin/Swiftfin; Streamyfin — https://github.com/streamyfin/streamyfin
