# Product

## What Fluster is

Fluster is a client for watching video from a Jellyfin or Jellyscale server. It aims to give **the best possible watching experience**: it should feel like a streaming service such as Netflix, on your own library, **without having to finagle with the client** (the owner, 2026-11-12).

Fluster is for video only: movies and shows. It does not play music, audiobooks, or photos; better apps exist for those.

Four pillars carry that:

1. **It feels like a streaming service.** Open it and something to watch is in front of you. Resume takes one press. The next episode, the intro skip, and the artwork are where you expect them.
2. **Native, not painted.** Fluster runs as a real application on each platform. It does not draw its interface on a canvas-like layer the way Flutter clients do, and it uses the device's own hardware and hardware acceleration wherever it can.
3. **It just works.** Fluster supports as much of the server's video features as each device allows, with the right defaults. Nobody should have to tune a client to make their library play correctly.
4. **Honest about the file.** Fluster plays your media **exactly as it is stored whenever it can**. The original file is streamed byte-for-byte and decoded locally with mpv, on the GPU when possible. When the original can't be played (a slow or limited connection, a disc folder, an admin policy), the server repackages or converts it, and Fluster always shows that it is doing so and why ([decision 0002](docs/decisions/0002-server-transcoding-fallback.md)).

It is built for people who chose to own their media and expect the client to respect that: full-quality video, untouched audio tracks, correct subtitles, and a server that stays idle while you watch anything the client can play. It starts on the desktop. The long-term aim is to replace the other Jellyfin video clients, including the cross-platform Flutter ones, on every screen it supports: the desk first, and later the living room and phone.

Where Fluster leads other clients today, and where it does not yet, is recorded in [`docs/research/jellyfin-clients.md`](docs/research/jellyfin-clients.md).

## Principles

1. **Original first, honest fallback.** Fluster plays the original file whenever mpv can, and mpv can decode nearly everything. It asks the server to repackage or convert only when the original can't be played, in the order direct play, direct stream, transcode. Every conversion is shown with its reason. Quality never drops silently.
2. **The client does the work.** Decoding, tone-mapping, subtitle rendering, and audio handling happen locally. A Raspberry Pi or underpowered NAS can serve a household.
3. **Native feel, everywhere.** It should feel like a real application on each platform: fast startup, correct window behavior, keyboard and remote navigation, platform media keys. It must not feel like a web page in a frame.
4. **No Flutter.** The UI is React/TypeScript in a Tauri shell on desktop, with native shells where a WebView cannot go (see `ARCHITECTURE.md`).
5. **Honest diagnostics.** The player always shows what is really happening: which decoder, whether hardware acceleration is active, dropped frames. It never claims hardware acceleration it cannot verify.
6. **Private by default.** No analytics and no third-party services. Credentials are held as securely as the platform allows, and authenticated URLs never reach logs.
7. **Small and sharp.** Do a few things very well. Every feature has to justify itself against the playback core.

## Better than a streaming service

Fluster borrows the feel of a streaming service and leaves out what such a service does for its own benefit. A personal library has no reason to keep anyone watching, and nothing in it expires. These rules follow from that (owner, 2026-11-12). The research and the weighing behind them are in [`docs/research/streaming-ux-gripes.md`](docs/research/streaming-ux-gripes.md) and [`docs/plans/proposals/discovery-and-profiles.md`](docs/plans/proposals/discovery-and-profiles.md).

1. **Your next episode comes first.** The first thing on Home is what you were in the middle of, and one press plays it.
2. **Home stays where you left it.** The rows and their order are the same on every visit. A row's contents change only when the library or your own history does.
3. **The first row holds what you're watching now.** A title you last played more than two weeks ago leaves Continue watching; the length is a setting. Its position is kept, and its own page still offers Resume.
4. **The end of a film is the end.** In a series the next episode plays after a countdown you can see, hide, or turn off. Nothing unrelated starts by itself.
5. **Your account is yours.** Remembering several accounts must not let one person open another's. What Fluster learns about a viewer stays on that viewer's server, under their account.
6. **Nothing from outside.** No ads, no promoted titles, and nothing that is not in the library.
7. **Nothing plays by itself unless you turn it on.** Previews while browsing are off by default.

## Who it's for

| Persona | Situation | What they need |
|---|---|---|
| **Home-theater enthusiast** | 4K HDR remuxes, lossless multichannel audio, ASS/PGS subtitles, good GPU | Bit-perfect playback, HDR, audio passthrough, correct subtitle styling, refresh-rate matching |
| **Low-power self-hoster** | Jellyfin on a NAS or Pi that cannot transcode 4K | Assurance the server never converts what the client can play. Clear reasons when it must. |
| **Remote viewer** | Watching away from home over a limited uplink, or on an account with a bitrate limit | Automatic conversion that fits the connection, a streaming-limit setting, and a visible "Converting on server" indicator |
| **Linux desktop user** | Wayland desktop, NVIDIA or AMD | A first-class client that isn't X11-only, isn't Electron-heavy, and uses VA-API/NVDEC properly |
| **Household viewer** (later) | Living-room TV, phone, tablet | Resume where someone left off. Next episode. Skip intro. Simple navigation. |

## Not for

- Server administration. Use Jellyfin's web dashboard.
- Music, audiobooks, and photos. Fluster is a video client (the owner, 2026-11-12). Better apps exist for these, and Fluster will not grow them.
- Live TV and DVR. Out of scope (the owner, 2026-11-12), although most other clients have it.
- Books.

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

- **Jellyfin** 10.11.x and 12.x with default settings. Jellyfin 12 disables legacy query-string authorization by default, so Fluster authenticates media requests with headers (see `ARCHITECTURE.md` §3).
- **Jellyscale**, a scale-out video server that speaks the Jellyfin client API and is meant as a drop-in replacement for a Jellyfin server. It is still being built. Fluster aims to be the first client to support it directly, and assumes Jellyscale will provide the APIs needed to stream. Fluster is tested against it when Jellyscale reaches its client-integration work (`tasks/backlog.md`); nothing is verified against it today.

### Original first: what users see

- **Direct play** (the normal case): no indicator beyond the player information panel, which says "Original file".
- **Direct stream** (the server repackages without re-encoding, for example a disc folder): "Repackaging on server, original quality: {reason}".
- **Transcode** (the server re-encodes, for example a remote bitrate limit): "Converting on server: {reason}", naming what is converted (video, audio, or burned-in subtitles). If the user's own streaming limit is the only reason, the indicator offers "Play original".
- **Refusal** (nothing can be played or converted): Fluster stops before playback and explains why in plain language, for example the admin turned off conversion for this user, or the item is a live channel. Retry and Back are always available.

A streaming-limit setting holds a local and a remote maximum bitrate; both default to no limit (the server's own remote limit still applies). Local means the server address is on this device or the home network.

## Roadmap

Each milestone has an execution plan under `docs/plans/` when work begins. "Done when" items are the acceptance criteria.

### M0 — Vertical slice (complete)

Manual login, ten latest items, resume/start-over, direct play through embedded libmpv on Wayland, controls, tracks, diagnostics, playstate reporting, retry, AppImage.

### M1 — Daily driver (Linux)

The client someone could use every evening instead of the web UI.

- **Sign-in:** server discovery on the LAN, Quick Connect, and remembered servers and users. Store each account's token in the OS keyring, behind a visible "stay signed in" switch that is on by default when a keyring is available. This changes the current session-only rule, so it needs a decision record (P3-01) and an update to `docs/security.md`.
- **Accounts:** any number of saved accounts, where an account is one user on one server. One is active at a time and each server's libraries stay separate. The account menu in the nav switches between them. Switch keeps the sign-in, Sign out revokes it on the server, and Remove also forgets the account.
- **Home:** Continue Watching, Next Up, Latest per library.
- **Browse:** libraries, movie grid, series → seasons → episodes, sort and filter, collections.
- **Search** across movies, series, and episodes.
- **Item detail:** artwork, overview, cast, media info (codec, HDR, audio format, subtitles) before you press play.
- **Watch state:** mark played/unplayed, favorites. Changes from other clients appear without a restart.
- **In the player:** auto-play next episode with a countdown, skip intro/credits from Jellyfin media segments, scrub previews from Jellyfin trickplay images, chapters.
- **Settings:** auto-play next on or off and its countdown length; for intros and for credits, show a Skip button, skip automatically, or do nothing; streaming limits. One set of playback settings per computer.
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
- Dolby Vision: what Fluster does with it is decided after the HDR spike (P5-01) reports on profiles 5 and 8.

Done when: the `docs/validation.md` codec matrix passes, plus HDR and passthrough gates on reference hardware.

### M3 — macOS beta

Signed and notarized DMG, VideoToolbox decoding, Now Playing and media-key integration, Retina-correct geometry.

### M4 — Windows beta

Composition spike first: transparent WebView2 over an mpv D3D11 surface. Then D3D11VA/NVDEC decoding, SMTC media controls, and an installer.

### M5 — Connected

- SyncPlay (watch together).
- Offline downloads of the original file.

### M6 — Living room and mobile

A TV/mobile shell that reuses Fluster's domain, gateway, and playback policy. Android TV comes first, then Android phones; Apple TV follows. The shell spike starts as soon as the fallback core (M1b negotiation) lands, in parallel with the desktop milestones.

- Act as a Jellyfin cast target, so a phone can be the TV's remote and other clients can send play, pause and seek (P8-01, moved here from M5 by the owner, 2026-11-12, D4 B).

### Order

M0, M1, M1b, then M6's shell spike in parallel with M2, then M3, M4, M5. Milestone numbers are names, not the order.

## Success measures

| Measure | Target |
|---|---|
| Server transcode/remux jobs started by Fluster for a file it could play as stored | **0**, always. A failure here is a P0 bug. |
| Server conversions shown to the user with a reason | **100%** |
| Server jobs still running 10 s after Fluster stops | **0** |
| Time from Play to first frame (LAN, H.264/HEVC) | < 1.5 s at p50, recorded in the dogfood log (P4-01) |
| Resume accuracy (position reported vs. resumed elsewhere) | within 10 s |
| Hardware decode engaged on supported GPU | 100% of validation matrix |
| Crashes during the dogfood week | 0. Fluster has no analytics, so a percentage cannot be measured. |
| Authenticated URLs or tokens in logs/diagnostics | 0 |

## Open product questions

- **One Home across servers.** Servers stay separate for now. A spike after the dogfood week (P15-08) decides whether to merge them.
- **A PIN per profile.** It ships with the TV shell's account picker. Until then, turning "Stay signed in" off for an account is the privacy control (owner, 2026-11-12; P13-27).
- **Dolby Vision.** Decided after the P5-01 spike.

Answered on 2026-11-12 (see `docs/plans/proposals/product-review.md`): persistent login (keyring, on by default, P3-01 and P3-02), multiple servers and users (saved accounts, one active), Live TV (out of scope), and music, audiobooks, and photos (out of scope; the music milestone M7 was removed).
