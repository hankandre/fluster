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

### TV and mobile direction (M6)

Keep the domain, Jellyfin gateway, playback policy, and coordinator **framework-free TypeScript**, so a second shell can reuse them unchanged. The leading candidate shell is React Native (`react-native-tvos`) with a native mpv module (MPVKit on Apple, libmpv on Android). Streamyfin ships this combination on iOS, Android, tvOS, and Android TV. A SwiftUI app is the fallback for Apple TV.

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
- **Rust exposes a fixed command list:** initialize, load, surface geometry, pause, seek, volume, mute, track selection, fullscreen, stop, and the server socket's connect and disconnect. Adding a command is an architectural change (see the invariants).
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
| Discovery | Probe a URL with `GET /System/Info/Public` (no auth; returns `Id`, `ServerName`, `Version`). LAN discovery broadcasts `who is JellyfinServer?` to UDP 7359; replies are `{Address, Id, Name}`. Key saved servers by `Id`, not URL. Discovered addresses are usually `http://` LAN URLs. They follow the host-class rule of `docs/decisions/0001`: a private-LAN address is probed and confirmed like a typed one; a public `http://` address is shown as refused and never probed. |

### Catalog (10.9+ paths; old `/Users/{userId}/…` routes are obsolete)

| Need | Endpoint |
|---|---|
| Libraries | `GET /UserViews` (filter by `CollectionType`) |
| Browse / search | `GET /Items?parentId=&includeItemTypes=&recursive=true&sortBy=&sortOrder=&startIndex=&limit=&fields=&searchTerm=&enableImageTypes=Primary,Backdrop,Thumb&imageTypeLimit=1&enableTotalRecordCount=false` |
| Continue Watching | `GET /UserItems/Resume?mediaTypes=Video&limit=` |
| Next Up | `GET /Shows/NextUp?limit=&enableRewatching=false` |
| Latest per library | `GET /Items/Latest?parentId=&limit=&groupItems=true` (returns an array, not a QueryResult) |
| Series | `GET /Shows/{id}/Seasons`, `GET /Shows/{id}/Episodes?seasonId=` |
| Detail | `GET /Items/{id}?userId=` with no `fields`: the SDK's `getItem` takes only a user id, and recordings on 10.11.7 and 12.4.0 (`item-detail-no-fields-*.json`) show the full item, including `MediaSources`, `MediaStreams`, `People`, `Genres`, and `UserData` (+ `/Similar`, `/SpecialFeatures`) |
| Type-ahead | `GET /Search/Hints` (lighter DTO; use `/Items?searchTerm=` for result pages) |
| Filters | `GET /Items/Filters2?parentId=`, `filters=IsUnplayed,IsResumable,IsFavorite` |
| Played / favorite | `POST`/`DELETE /UserPlayedItems/{id}`, `POST`/`DELETE /UserFavoriteItems/{id}` |
| Images | `GET /Items/{id}/Images/{type}?tag=&maxWidth=&quality=&format=Webp`. Tagged URLs are immutable, so cache by `(id, type, tag, size)` forever. Use `ImageBlurHashes` for placeholders. No token needed. |

Performance rules:
- Request only the `fields` a view renders. Cards need little; list endpoints (`/Items`) honor `fields`, but `GET /Items/{id}` takes none and returns the full item.
- `ProductionYear` and `RunTimeTicks` are always returned and are not valid `fields` values.
- Set `enableTotalRecordCount=false` unless paging needs counts.
- Set `enableUserData` only where watched or progress state is shown.

### Playback negotiation (the core)

```text
GET  /Items/{id}?fields=MediaSources,Chapters,Trickplay      → versions, chapters, trickplay
POST /Items/{id}/PlaybackInfo                                → MediaSources[] evaluated for THIS device
     body:  UserId, StartTimeTicks, MediaSourceId?, MaxStreamingBitrate: 1e9,
            EnableDirectPlay:true, EnableDirectStream:false, EnableTranscoding:false,
            AllowVideoStreamCopy:false, AllowAudioStreamCopy:false, AutoOpenLiveStream:false,
            DeviceProfile: FLUSTER_PROFILE
     query: the same false flags, duplicated
select source → GET /Videos/{id}/stream?Static=true&MediaSourceId=&PlaySessionId=  (header auth, via libmpv)
```

**Always send a DeviceProfile.** The server applies `EnableDirectPlay`, user policy, the remote bitrate limit, and `ForceRemoteSourceTranscoding` only inside `SetDeviceSpecificData`, which runs **only when a profile is present**. That is also the only place subtitle `DeliveryMethod`/`DeliveryUrl` get filled in. Without a profile, the server's direct-play evaluation is skipped and external subtitles have no URL.

The profile accepts everything for direct play and offers no way to transcode:

```json
{
  "Name": "Fluster",
  "MaxStreamingBitrate": 1000000000,
  "MaxStaticBitrate": 1000000000,
  "DirectPlayProfiles": [{ "Type": "Video" }, { "Type": "Audio" }],
  "TranscodingProfiles": [],
  "ContainerProfiles": [],
  "CodecProfiles": [],
  "SubtitleProfiles": [
    { "Format": "srt", "Method": "External" }, { "Format": "ass", "Method": "External" },
    { "Format": "ssa", "Method": "External" }, { "Format": "vtt", "Method": "External" },
    { "Format": "sub", "Method": "External" }, { "Format": "pgssub", "Method": "External" },
    { "Format": "srt", "Method": "Embed" }, { "Format": "ass", "Method": "Embed" },
    { "Format": "ssa", "Method": "Embed" }, { "Format": "pgssub", "Method": "Embed" },
    { "Format": "dvdsub", "Method": "Embed" }, { "Format": "vtt", "Method": "Embed" }
  ]
}
```

Empty `Container`/`VideoCodec`/`AudioCodec` fields mean "match anything": `ContainerHelper.ContainsContainer` returns true for an empty profile list (`MediaBrowser.Model/Extensions/ContainerHelper.cs` lines 82-88 at v10.11.7 and v12.4), and `StreamBuilder` uses it for the container, video, and audio checks (v12.4 lines 1346, 1357, 1366). A source with an empty `Container` does not match, which is the BluRay folder case. Contract fixtures confirm `SupportsDirectPlay: true` with this profile on 10.11.7 and 12.4.0 for the H.264/AAC, HEVC Main10 HDR10, AV1, embedded-ASS, and multi-audio (AAC + AC-3) MKV samples.

**Media source acceptance.** A source is playable only if **all** of these hold:

1. `VideoType` is not `BluRay` or `Dvd` (any case), and `Path` has no `BDMV` or `VIDEO_TS` segment. A `Static=true` request for a disc-folder source silently starts ffmpeg on the server.
2. `VideoType` is not `Iso` and `Path` does not end in `.iso` (any case). Rejected for now; **[unverified]** whether mpv handles ISO over HTTP.
3. `RequiresOpening` is not `true` (a live source).
4. `SupportsDirectPlay === true`
5. `Protocol === "File"`
6. `TranscodingUrl` is empty
7. `Id` and `Path` are present.

The rules run in this order and the first failing rule names the reason; the disc checks come first so a disc folder always reports `disc-source` or `iso-source`. If no source qualifies, the gateway throws `PlaybackRefusedError` with a typed `RefusalReason` (`src/domain/playback.ts`): `no-sources`, `no-direct-play`, `not-a-file`, `live-source`, `server-requires-transcoding`, `disc-source`, `iso-source`, or `missing-source-data`. The server reports remote bitrate limits and remote-source policy as `SupportsDirectPlay: false`, so they surface as `no-direct-play`. The profile lives in `src/lib/jellyfin/device-profile.ts` and the rules in `src/lib/jellyfin/source-acceptance.ts`. Multiple versions are listed by `MediaSources[].Name` and chosen by `MediaSourceId`; without a choice the first acceptable source plays.

**Subtitles and track mapping.**

- External subtitle `DeliveryUrl` arrives as `/Videos/{id}/{msId}/Subtitles/{idx}/0/Stream.{fmt}?ApiKey=…`. Strip every query credential (`ApiKey`, `api_key`, `access_token`, `Token`, `X-Emby-Token`, any case), validate same-origin, and load it via `sub-add` with header auth.
- Embedded subtitles are rendered by mpv directly.
- **Jellyfin numbers external streams first.** Embedded streams have `Index = ffprobeIndex + externalCount`. Map mpv `ff-index` to Jellyfin index as `ff-index + count(IsExternal)`. Map external tracks by the order Fluster added them.
- Apply `DefaultAudioStreamIndex` and `DefaultSubtitleStreamIndex` for the initial selection.

### Playstate reporting

| Event | Call |
|---|---|
| First frame | `POST /Sessions/Playing` |
| Every 10 s, and on pause/seek/track change | `POST /Sessions/Playing/Progress` |
| End / stop / error | `POST /Sessions/Playing/Stopped`, with **`Failed: true` on the error path** so the server records no bogus progress |

- Report bodies carry `ItemId`, `MediaSourceId`, `PlaySessionId`, `PositionTicks`, `IsPaused`, `IsMuted`, `VolumeLevel`, `AudioStreamIndex`, `SubtitleStreamIndex`, `CanSeek`, and `PlayMethod: "DirectPlay"`.
- Ticks are 10,000,000 per second.
- The server applies its min/max resume percentages when it records progress.
- `/Sessions/Playing/Ping` exists mainly to keep transcode jobs alive, so it is not needed for direct play.

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
  4. Launch mpv with header auth and subtitles.
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
| I1 | Fluster never causes server transcoding or remuxing | Frozen `PLAYBACK_POLICY`. False flags in body *and* query. DeviceProfile without transcoding profiles. Source acceptance rules. Server tripwire `pnpm test:tripwire` (`tests/integration/tripwire.ts`; CI job `tripwire`, not yet required). |
| I2 | Only `Static=true` original-file URLs reach the player | Gateway URL builder, Rust URL validation, tests |
| I3 | No generic mpv command bridge; Rust exposes a fixed command list | Code review; `command_allowlist` Rust test (`src-tauri/src/command_allowlist.rs`) |
| I4 | Tokens never appear in logs, errors, diagnostics, or URLs | Redaction in TS and Rust; canary tests (TS `redact-canary.test.ts`, Rust `redaction_canary`); Rust refuses stream and subtitle URLs with a credential query parameter (`validate_playback_urls`) |
| I5 | Servers require HTTPS, except plain HTTP to loopback and, after a one-time per-server confirmation, to private-LAN hosts classified by the literal host ([decision 0001](docs/decisions/0001-private-lan-http.md)); tokens never go over plain HTTP to public hosts or across cross-origin redirects; credentials in URLs are rejected | Enforced: one host classifier in TS (`src/domain/host-class.ts`) and Rust (`src-tauri/src/url_policy.rs`), both tested against `tests/fixtures/host-classes.json`; gateway URL normalization refuses public HTTP before any request and the gateway refuses sign-in calls until the private-LAN confirmation; the gateway client and libmpv (`max_redirects=0`) follow no redirects; gateway, sign-in, and Rust tests |
| I6 | Subtitle URLs must be same-origin and validated before authentication | TS + Rust checks, tests |
| I7 | The browser engine is never a silent fallback for native | App wiring, review |
| I8 | Only the gateway talks to Jellyfin; only the engine port talks to the player | Import-boundary lint (`pnpm lint:boundaries`, dependency-cruiser; rules in `DOMAINS.md`) |
| I9 | libmpv user config, scripts, and default input bindings stay disabled | MpvController initialization, tests |

---

## 5. Known gaps (from the 2026-11 API review)

Tracked in `docs/plans/active/001-jellyfin-api-correctness.md`.

| Severity | Gap |
|---|---|
| High | Track mapping ignores the external-first index numbering |
| Medium | Refusal reasons: typed reasons exist (`RefusalReason` in `src/domain/playback.ts`); UI copy is P3-09 |

---

## Sources

- Jellyfin OpenAPI specs 10.10.7, 10.11.11, 12.4 — https://api.jellyfin.org/openapi/stable/
- Jellyfin server source at `v10.11.11` / `v12.4`: `AuthorizationContext.cs`, `MediaInfoController.cs`, `MediaInfoHelper.cs`, `VideosController.cs`, `StreamInfo.cs`, `FFProbeVideoInfo.cs`, `SessionManager.cs`, `AutoDiscoveryHost.cs`
- Jellyfin 12.0 release notes — https://github.com/jellyfin/jellyfin/releases/tag/v12.0
- Jellyfin API authorization guide — https://gist.github.com/nielsvanvelzen/ea047d9028f676185832e51ffaf12a6f
- mpv Render API / gpu-next — https://github.com/mpv-player/mpv/issues/10810, mpv v0.42.0 release notes
- Tauri tvOS — https://github.com/tauri-apps/tauri/issues/6364; wry GTK4 — wry #1474, #1767; Linux graphics — https://v2.tauri.app/develop/debug/linux-graphics/
- jellyfin-desktop — https://github.com/jellyfin/jellyfin-desktop; Swiftfin — https://github.com/jellyfin/Swiftfin; Streamyfin — https://github.com/streamyfin/streamyfin
