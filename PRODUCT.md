# Product

Status: **Draft for the owner's approval** (T1-05). Rewritten for Octave on TV on 2026-11-20 from the earlier product document (at the tag `desktop-tauri-final`), decisions 0003 and 0004, the owner's decisions of 2026-11-20, and the UX synthesis of the same day. Wording and direction are the owner's call; each choice made in this draft is listed in the clean-slate pull request.

## What Octave is

Octave is a client for watching video from a Jellyfin or Jellyscale server, made for the TV first. It aims to give **the best possible watching experience**: it should feel like a streaming service such as Netflix, on your own library, **without having to finagle with the client** (the owner, 2026-11-12).

Octave is for video only: movies and shows. It does not play music, audiobooks, or photos; better apps exist for those.

Four pillars carry that:

1. **It feels like a streaming service.** Open it and something to watch is in front of you. Resume takes one press. The next episode, the intro skip, and the artwork are where you expect them.
2. **Native, not painted.** Octave runs as a real application on each device. It does not draw its interface on a canvas-like layer the way Flutter clients do, and it uses the device's own decoders and hardware wherever it can.
3. **It just works.** Octave supports as much of the server's video features as each device allows, with the right defaults. Nobody should have to tune a client to make their library play correctly.
4. **Honest about the file.** Octave plays your media **exactly as it is stored whenever the device can**. When the original can't be played (the device has no decoder for it, a slow or limited connection, a disc folder, an admin policy), the server repackages or converts it, and Octave always shows that it is doing so and why ([decision 0002](docs/decisions/0002-server-transcoding-fallback.md)).

It is built for people who chose to own their media and expect the client to respect that: full-quality video, untouched audio tracks, correct subtitles, and a server that stays idle while you watch anything the device can play. The living room leads: Android TV first, Apple TV kept possible, then phones and tablets, then the desktop (owner decisions, 2026-11-20). The long-term aim is to replace the other Jellyfin video clients, including the cross-platform Flutter ones, on every screen it supports.

## Principles

1. **Original first, honest fallback.** The device's engines decide what plays: Media3 first, and libmpv later for original files Media3 cannot decode. Octave plays the original file whenever an engine on this device can. A source no engine here can play is converted by the server, and that conversion is shown with its reason, like every other. The order is direct play, direct stream, transcode. Quality never drops silently.
2. **The client does the work.** Decoding, HDR, subtitle rendering, and audio handling happen on the device. A Raspberry Pi or underpowered NAS can serve a household.
3. **Native feel, everywhere.** It should feel like a real application on each device: fast start, instant focus, the remote's keys doing what they should. It must not feel like a web page in a frame.
4. **No Flutter.** The UI is React Native and TypeScript over a shared core, with native players (decisions 0003 and 0004).
5. **Honest diagnostics.** The player can always say what is really happening: which engine and decoder, whether the picture is HDR, dropped frames. It never claims what it cannot verify.
6. **Private by default.** No analytics and no third-party services. The token goes only in the request header, held as securely as the device allows, and never reaches a URL or a log.
7. **Small and sharp.** Do a few things very well. Every feature has to justify itself against the playback core. Invisible power, a short settings surface.

## Better than a streaming service

Octave borrows the feel of a streaming service and leaves out what such a service does for its own benefit. A personal library has no reason to keep anyone watching, and nothing in it expires (owner, 2026-11-12).

1. **Your next episode comes first.** The first thing on Home is what you were in the middle of, and one press plays it.
2. **Home stays where you left it.** The rows and their order are the same on every visit. A row's contents change only when the library or your own history does.
3. **You decide what Continue watching holds.** You can remove a title from it; its position is kept and its own page still offers Resume. Whether titles also leave by themselves after a while, and what Remove means exactly, are open owner decisions (T5-01).
4. **The end of a film is the end.** In a series the next episode plays after a countdown you can see, hide, or turn off. Nothing unrelated starts by itself.
5. **Your account is yours.** Remembering several accounts must not let one person open another's. What Octave learns about a viewer stays on that viewer's server, under their account.
6. **Nothing from outside.** No ads, no promoted titles, and nothing that is not in the library.
7. **Nothing plays by itself unless you turn it on.** Previews while browsing are off by default.

## Who it's for

| Persona | Situation | What they need |
|---|---|---|
| **Household viewer** | The living-room TV and its remote, then a phone or tablet | Resume where they left off in one press. Next episode. Skip intro. Every library one move away. Sign in without typing. |
| **Home-theater enthusiast** | 4K HDR remuxes, lossless multichannel audio, ASS/PGS subtitles, an AVR | Bit-perfect playback, HDR10 and Dolby Vision, audio passthrough, correct subtitle styling, frame-rate matching |
| **Low-power self-hoster** | Jellyfin or Jellyscale on a NAS or Pi that cannot transcode 4K | Assurance the server never converts what the device can play. Clear reasons when it must. |
| **Remote viewer** | Watching away from home over a limited uplink, or on an account with a bitrate limit | Automatic conversion that fits the connection, a streaming-limit setting, and a visible "Converting on server" indicator |
| **Desktop user** | A computer, later (T16) | A desktop client that shares the TV's rules; how it is built is undecided |

## Not for

- Server administration. Use the server's web dashboard.
- Music, audiobooks, and photos. Octave is a video client (the owner, 2026-11-12).
- Live TV and DVR. Out of scope (the owner, 2026-11-12).
- Books.
- Deleting media, or a requests UI.

## Scope

### Platforms

| Stage | Platform | Shell and engines |
|---|---|---|
| First | Android TV and Google TV (Fire TV after one device is tested, T11-08) | React Native (Expo SDK 58, react-native-tvos 0.88.x) over the shared TypeScript core. Media3 first; libmpv later for original files only (T13). No Rust layer. |
| Kept possible | Apple TV | The same browse UI and core; the engines are chosen when that phase starts (T14). Nothing on Android TV may close the door on it. |
| Next | Android phones and tablets, then iPhone and iPad | The same app and core (T15) |
| Last | Desktop | Undecided; a fresh, maintenance-checked evaluation (T16). There is no maintained desktop beta; the earlier desktop app is kept only in the tag `desktop-tauri-final`. |

### Servers

- **Jellyfin** 10.11.x and 12.x with default settings. Jellyfin 12 disables legacy query-string authorization by default, so Octave authenticates every request with a header (`ARCHITECTURE.md` §3).
- **Jellyscale**, a scale-out video server that speaks the Jellyfin client API. It is a first-class server: it requires a token on every media request, so Octave sends the header on every request, and a playback task passes only when its wire test passes against Jellyscale. Where Jellyscale lacks a feature, the task waits for the Jellyscale issue (phase T10); Octave never works around it with a token in a URL.

### Sign-in

The TV signs in by **Quick Connect, with the code and a QR code** side by side: the viewer approves on a phone that is already signed in, so the TV never opens a browser, no password is required, and an account that has no password (single sign-on) can get in. A server found on the home network is chosen with one press. A typed address and a password are the fallbacks. Octave stays signed in, and asks "Who's watching?" only when two or more accounts are saved.

### Browsing

- **Navigation** is a collapsed side rail that opens on Left: Search in a fixed place, Home, one entry per library, Settings, and the account. Entries never move.
- **Home** is the hero, Continue watching, then one **Recently added** row of movies and shows, with a series' new episodes grouped under the series. There is no row of library tiles and no per-library rows.
- **A library** opens on its full grid, with a sort that is remembered per library and account (Name A to Z, Newest added, and the rest). Sorted A to Z, a letter rail jumps through the grid.
- **Search** shows results as each letter is typed, and has a mic button.
- Later, by evidence (phase T12): a My list row, a profile PIN, Watch Next on the TV's launcher, subtitle timing, recent searches, the phone as a remote, and the HDR and audio polish.

### Original first: what viewers see

- **Direct play** (the normal case): no indicator beyond the player's info sheet, which says "Original file".
- **Direct stream** (the server repackages without re-encoding, for example a disc folder): "Repackaging on server, original quality: {reason}".
- **Transcode** (the server re-encodes, for example for a remote bitrate limit or because this device has no decoder for the original): "Converting on server: {reason}", naming what is converted. If the viewer's own streaming limit is the only reason, the indicator offers "Play original".
- **Refusal** (nothing can be played or converted): Octave stops before playback and explains why in plain words. Retry and Back are always available.

A streaming-limit setting holds a local and a remote maximum bitrate; both default to no limit (the server's own remote limit still applies). Local means the server address is on this device or the home network.

## Roadmap

The roadmap is the phase list of `tasks/prd.json`; that file holds each phase's goal and exit, and each task's acceptance. In order:

| Phase | Name |
|---|---|
| T0 | Falsifiers and decision 0004 |
| T1 | Clean slate |
| T2 | Core extraction and ports |
| T3 | App scaffold and CI |
| T4 | Sign-in |
| T5 | Home |
| T6 | Library and search |
| T7 | Detail |
| T8 | Player |
| T9 | Settings |
| T10 | Jellyscale hardening |
| T11 | Release to the Play Store |
| T12 | After launch on TV |
| T13 | libmpv as the second engine |
| T14 | Apple TV |
| T15 | Mobile |
| T16 | Desktop |

Dolby Vision, passthrough, and frame-rate matching are proven on the owner's Shield before the playback phase is called done (T8-21); their polish is T12-07.

## Success measures

| Measure | Target |
|---|---|
| Server transcode or remux jobs started by Octave for a file the device could play as stored | **0**, always. A failure here is a P0 bug. |
| Server conversions shown to the viewer with a reason | **100%** |
| Server jobs still running 10 s after Octave stops | **0** |
| Presses from launch to resuming what you were watching | **1** |
| Presses from anywhere to any library | **3** or fewer |
| Presses from launch to playing a known film | **15** or fewer (14 or fewer through search, T6-08) |
| Cold start to first content, and key press to focus change | Budgets set by the owner and measured in T3-12 |
| Time from Play to first frame (home network, H.264/HEVC) | < 1.5 s at p50, recorded during dogfooding |
| Resume accuracy (position reported vs. resumed elsewhere) | within 10 s |
| Requests without the header after sign-in, or with a token in a URL | **0**, proven by the wire test against Jellyscale |
| Crashes during the dogfood week (T10-05) | 0. Octave has no analytics, so a percentage cannot be measured. |

## Open product questions

These are the owner's decisions; each has a task.

- **Continue watching (T5-01).** What Remove means (hide and keep the position, or reset progress), where it lives (the title's page, or a menu on a held select), and whether titles also leave the row by themselves after a window, with which default. The earlier desktop rule (titles leave after two weeks) has no evidence behind it; manual removal does.
- **A PIN per profile (T12-01).** Whether and when a profile gets a PIN, entered with the D-pad and never shown in clear.
- **Which settings follow the account and which stay on the device (T9-01).** The earlier "one set of playback settings per computer" does not fit a shared TV. Proposed: personal choices (subtitles, auto-play, skip) follow the account; hardware choices (passthrough, refresh rate) stay with the device.
- **Recent searches on a shared TV (T12-05).** They save presses but show one viewer's searches to the next.
- **One Home across servers.** Servers stay separate for now.
- **Other TV platforms.** Samsung, LG, and Vidaa owners ask for clients (Fider #1615, 466 votes); no platform beyond Android TV, Fire TV, and Apple TV is planned.
