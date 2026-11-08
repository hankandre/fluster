# Product

## What Fluster is

Fluster is a native-quality Jellyfin client that plays your media **exactly as it is stored whenever it can**. The original file is streamed byte-for-byte and decoded locally with mpv, on the GPU when possible. When the original can't be played (a slow or limited connection, a disc folder, an admin policy), the server repackages or converts it, and Fluster always shows that it is doing so and why ([decision 0002](docs/decisions/0002-server-transcoding-fallback.md)).

It is built for people who chose Jellyfin to own their media and expect the client to respect that: full-quality video, untouched audio tracks, correct subtitles, and a server that stays idle while you watch anything the client can play. It aims to replace the other Jellyfin clients, including the cross-platform Flutter ones, on every screen it supports: movies, shows, music, and later the living room and phone.

## Principles

1. **Original first, honest fallback.** Fluster plays the original file whenever mpv can, and mpv can decode nearly everything. It asks the server to repackage or convert only when the original can't be played, in the order direct play, direct stream, transcode. Every conversion is shown with its reason. Quality never drops silently.
2. **The client does the work.** Decoding, tone-mapping, subtitle rendering, and audio handling happen locally. A Raspberry Pi or underpowered NAS can serve a household.
3. **Native feel, everywhere.** It should feel like a real application on each platform: fast startup, correct window behavior, keyboard and remote navigation, platform media keys. It must not feel like a web page in a frame.
4. **No Flutter.** The UI is React/TypeScript in a Tauri shell on desktop, with native shells where a WebView cannot go (see `ARCHITECTURE.md`).
5. **Honest diagnostics.** The player always shows what is really happening: which decoder, whether hardware acceleration is active, dropped frames. It never claims hardware acceleration it cannot verify.
6. **Private by default.** No analytics and no third-party services. Credentials are held as securely as the platform allows, and authenticated URLs never reach logs.
7. **Small and sharp.** Do a few things very well. Every feature has to justify itself against the playback core.

## Who it's for

| Persona | Situation | What they need |
|---|---|---|
| **Home-theater enthusiast** | 4K HDR remuxes, lossless multichannel audio, ASS/PGS subtitles, good GPU | Bit-perfect playback, HDR, audio passthrough, correct subtitle styling, refresh-rate matching |
| **Low-power self-hoster** | Jellyfin on a NAS or Pi that cannot transcode 4K | Assurance the server never converts what the client can play. Clear reasons when it must. |
| **Remote viewer** | Watching away from home over a limited uplink, or on an account with a bitrate limit | Automatic conversion that fits the connection, a streaming-limit setting, and a visible "Converting on server" indicator |
| **Music listener** | A Jellyfin music library | Albums and artists, a queue, gapless playback, and lossless files played as stored |
| **Linux desktop user** | Wayland desktop, NVIDIA or AMD | A first-class client that isn't X11-only, isn't Electron-heavy, and uses VA-API/NVDEC properly |
| **Household viewer** (later) | Living-room TV, phone, tablet | Resume where someone left off. Next episode. Skip intro. Simple navigation. |

## Not for

- Server administration. Use Jellyfin's web dashboard.
- Live TV/DVR, books, photos (not now; live TV needs its own decision record).

## Scope

### Platforms

| Stage | Platform | Shell |
|---|---|---|
| Now (beta) | Linux x86_64, Wayland | Tauri + embedded libmpv |
| Next | macOS (Apple Silicon) | Tauri + embedded libmpv |
| Then | Windows x64 | Tauri + embedded libmpv (needs a composition spike first) |
| Early (spike after the fallback core lands) | Android TV, then Android phones | Native shell sharing Fluster's TypeScript core (see `ARCHITECTURE.md`) |
| Later | Apple TV, iOS | The same shell, or SwiftUI for Apple TV |

X11, ARM64 Linux, and Flatpak are deferred, not rejected.

### Servers

Jellyfin 10.11.x and 12.x with default settings. Jellyfin 12 disables legacy query-string authorization by default, so Fluster authenticates media requests with headers (see `ARCHITECTURE.md` §3).

### Original first: what users see

- **Direct play** (the normal case): no indicator beyond the player information panel, which says "Original file".
- **Direct stream** (the server repackages without re-encoding, for example a disc folder): "Repackaging on server, original quality: {reason}".
- **Transcode** (the server re-encodes, for example a remote bitrate limit): "Converting on server: {reason}", naming what is converted (video, audio, or burned-in subtitles). If the user's own streaming limit is the only reason, the indicator offers "Play original".
- **Refusal** (nothing can be played or converted): Fluster stops before playback and explains why in plain language, for example the admin turned off conversion for this user, or the item is a live channel. Retry and Back are always available.

A streaming-limit setting holds a local and a remote maximum bitrate. Local means the server address is on this device or the home network.

## Roadmap

Each milestone has an execution plan under `docs/plans/` when work begins. "Done when" items are the acceptance criteria.

### M0 — Vertical slice (complete)

Manual login, ten latest items, resume/start-over, direct play through embedded libmpv on Wayland, controls, tracks, diagnostics, playstate reporting, retry, AppImage.

### M1 — Daily driver (Linux)

The client someone could use every evening instead of the web UI.

- **Sign-in:** server discovery on the LAN, Quick Connect, and a remembered server and user. Store the token in the OS keyring, behind an explicit "stay signed in" choice. This changes the current session-only rule, so it needs a decision record and an update to `docs/security.md`.
- **Home:** Continue Watching, Next Up, Latest per library.
- **Browse:** libraries, movie grid, series → seasons → episodes, sort and filter, collections.
- **Search** across movies, series, and episodes.
- **Item detail:** artwork, overview, cast, media info (codec, HDR, audio format, subtitles) before you press play.
- **Watch state:** mark played/unplayed, favorites. Changes from other clients appear without a restart.
- **In the player:** auto-play next episode with a countdown, skip intro/credits from Jellyfin media segments, scrub previews from Jellyfin trickplay images, chapters.
- **Track defaults:** respect the user's Jellyfin audio and subtitle language preferences.
- **Input:** full keyboard navigation, media keys and MPRIS on Linux, mouse-idle hiding.

Done when: a week of normal evening use needs no fallback to the web UI, the server runs no conversion for any file Fluster could play as stored, and every flow above has a Playwright journey.

### M1b — Playback parity (decision 0002)

Server fallback when the original can't be played: direct stream or transcode over HLS with header authentication, a streaming-limit setting with local and remote values, the "Converting on server" indicator, correct `PlayMethod` reporting, and cleanup of server jobs. Plan: `docs/plans/active/002-transcoding-fallback-and-parity.md`.

Done when: every sample mpv can play still direct plays (tripwire), disc folders and bitrate-limited plays convert with the indicator showing, and no server job outlives a stopped session.

### M2 — Cinema quality

- HDR10/HLG output on Wayland where the compositor supports it, and accurate tone-mapping where it doesn't (depends on the HDR architecture spike).
- Audio passthrough/bitstreaming (AC3, E-AC3, TrueHD, DTS-HD) as an explicit setting.
- Display refresh-rate matching where the platform allows.
- Subtitle styling options that don't override ASS authoring.

Done when: the `docs/validation.md` codec matrix passes, plus HDR and passthrough gates on reference hardware.

### M3 — macOS beta

Signed and notarized DMG, VideoToolbox decoding, Now Playing and media-key integration, Retina-correct geometry.

### M4 — Windows beta

Composition spike first: transparent WebView2 over an mpv D3D11 surface. Then D3D11VA/NVDEC decoding, SMTC media controls, and an installer.

### M7 — Music

Music libraries, album and artist views, a play queue, gapless audio in mpv, and playstate for audio. Lossless files play as stored; the same fallback applies when they can't.

### M5 — Connected

- Act as a Jellyfin cast target: other clients can send play/pause/seek.
- SyncPlay (watch together).
- Offline downloads of the original file.

### M6 — Living room and mobile

A TV/mobile shell that reuses Fluster's domain, gateway, and playback policy. Android TV comes first, then Android phones; Apple TV follows. The shell spike starts as soon as the fallback core (M1b negotiation) lands, in parallel with the desktop milestones.

### Order

M0, M1, M1b, then M6's shell spike in parallel with M2, then M7, M3, M4, M5. Milestone numbers are names, not the order.

## Success measures

| Measure | Target |
|---|---|
| Server transcode/remux jobs started by Fluster for a file it could play as stored | **0**, always. A failure here is a P0 bug. |
| Server conversions shown to the user with a reason | **100%** |
| Server jobs still running 10 s after Fluster stops | **0** |
| Time from Play to first frame (LAN, H.264/HEVC) | < 1.5 s at p50 |
| Resume accuracy (position reported vs. resumed elsewhere) | within 10 s |
| Hardware decode engaged on supported GPU | 100% of validation matrix |
| Crash-free playback sessions | > 99.5% |
| Authenticated URLs or tokens in logs/diagnostics | 0 |

## Open product questions

- **Persistent login.** Session-only tokens are safe but annoying daily. Proposal: opt-in keyring storage in M1. Needs a decision record.
- **Remote (off-LAN) defaults.** Decision 0002 adds a streaming limit. Should the remote default be "no limit" (original first, server limits still apply) or a fixed value such as 20 Mbps?
- **Multiple servers and users.** One server and one user per session is simpler. Do households need quick user switching in M1 or later?
- **Live TV.** Still out of scope. Needs a decision record before `RequiresOpening` sources are played.
