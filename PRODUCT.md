# Product

## What Fluster is

Fluster is a native-quality Jellyfin client that plays your media **exactly as it is stored**. It never asks the server to transcode or remux. The original file is streamed byte-for-byte and decoded locally with mpv, on the GPU when possible.

It is built for people who chose Jellyfin to own their media and expect the client to respect that: full-quality video, untouched audio tracks, correct subtitles, and a server that stays idle while you watch.

## Principles

1. **Direct play or nothing.** Transcoding and remuxing are off by design, not by preference. If a file cannot be direct played, Fluster says why. It does not degrade silently.
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
| **Low-power self-hoster** | Jellyfin on a NAS or Pi that cannot transcode 4K | Assurance the server never transcodes. Clear errors instead of stutter. |
| **Linux desktop user** | Wayland desktop, NVIDIA or AMD | A first-class client that isn't X11-only, isn't Electron-heavy, and uses VA-API/NVDEC properly |
| **Household viewer** (later) | Living-room TV, phone, tablet | Resume where someone left off. Next episode. Skip intro. Simple navigation. |

## Not for

- People who need server-side transcoding: slow remote links, devices that cannot decode their media. Jellyfin's official clients serve them well.
- Server administration. Use Jellyfin's web dashboard.
- Live TV/DVR, music, books, photos (not now; music may be reconsidered later as a separate surface).

## Scope

### Platforms

| Stage | Platform | Shell |
|---|---|---|
| Now (beta) | Linux x86_64, Wayland | Tauri + embedded libmpv |
| Next | macOS (Apple Silicon) | Tauri + embedded libmpv |
| Then | Windows x64 | Tauri + embedded libmpv (needs a composition spike first) |
| Later | Android TV, Apple TV, iOS, Android | Native shell sharing Fluster's TypeScript core (see `ARCHITECTURE.md`) |

X11, ARM64 Linux, and Flatpak are deferred, not rejected.

### Servers

Jellyfin 10.11.x and 12.x with default settings. Jellyfin 12 disables legacy query-string authorization by default, so Fluster authenticates media requests with headers (see `ARCHITECTURE.md` §3).

### Direct play only: what users see

When a file cannot be played as-is, Fluster stops before playback and explains the reason in plain language. Examples:

- The server's user policy forces transcoding (e.g. a remote bitrate limit). Say which setting and that an admin can change it.
- The media source is not a file Fluster can stream directly (e.g. an ISO or disc folder, or an HLS-only remote source).
- The server is unreachable, or the stream request failed.

Retry and Back are always available. There is never a "play anyway with transcoding" option.

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

Done when: a week of normal evening use needs no fallback to the web UI, no transcoding jobs appear on the server, and every flow above has a Playwright journey.

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

### M5 — Connected

- Act as a Jellyfin cast target: other clients can send play/pause/seek.
- SyncPlay (watch together).
- Offline downloads of the original file. This is still direct play, just later.

### M6 — Living room and mobile

A TV/mobile shell that reuses Fluster's domain, gateway, and playback policy. Android TV and Apple TV come first.

## Success measures

| Measure | Target |
|---|---|
| Server transcode/remux jobs started by Fluster | **0**, always. A failure here is a P0 bug. |
| Time from Play to first frame (LAN, H.264/HEVC) | < 1.5 s at p50 |
| Resume accuracy (position reported vs. resumed elsewhere) | within 10 s |
| Hardware decode engaged on supported GPU | 100% of validation matrix |
| Crash-free playback sessions | > 99.5% |
| Authenticated URLs or tokens in logs/diagnostics | 0 |

## Open product questions

- **Persistent login.** Session-only tokens are safe but annoying daily. Proposal: opt-in keyring storage in M1. Needs a decision record.
- **Remote (off-LAN) use.** Direct play over the internet needs enough upstream bandwidth. Should Fluster show a bitrate warning before playing a large file remotely?
- **Multiple servers and users.** One server and one user per session is simpler. Do households need quick user switching in M1 or later?
- **Music.** Out of scope now. Revisit after M2.
