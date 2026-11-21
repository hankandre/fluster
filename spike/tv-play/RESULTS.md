# Play falsifier: results

Throwaway spike for decision 0003 (`docs/decisions/0003-tv-and-mobile-shell.md`, "Decision (accepted)"
items 6 and 8): can a React Native TV app hand playback to a Kotlin Media3 module that direct-plays an
HDR10 file from Jellyscale, with the Authorization header on every request and no credential in any URL?
Never to be merged.

## Verdict

**The wiring holds, and HDR output is unproven.** On the owner's Nvidia Shield (Android 11), Media3
1.11.1 direct-played **Alien (1979)** from Jellyscale through the recording proxy:

- **Playback.** It started 2.48 s after process start (1.28 s from `prepare()` to the first frame).
- **Decoder.** `OMX.Nvidia.h265.decode`, the hardware HEVC decoder, on a 3840×2160 HEVC Main10 stream
  (`hvc1.2.4.H153.90`) that Media3 read as BT.2020 / SMPTE 2084 (PQ).
- **Frames.** 3 dropped of 3,081 rendered in 128 s, all at start-up. No rebuffers.
- **Wire.** The proxy verdict was **PASS** on every assertion:
  - the header was on every request;
  - a token was on every non-public request;
  - no credential was in any URL;
  - zero redirects were followed;
  - zero requests went to another origin.

  "No other origin" is scoped to the shared OkHttp client and the proxy's own traffic. The evidence is
  the proxy's Host check, the canary (0 hits) and the interceptor's refusal counter. It does not cover
  every socket in the process.

  A tokenless control request to Jellyscale got **401**.

What it does **not** show is HDR reaching the screen.

- During the runs the Shield reported no HDR output capability:
  - `dumpsys SurfaceFlinger`: `HWC Support: wideColorGamut=true hdr10plus=false hdr10=false hlg=false dv=false`;
  - `dumpsys display`: `HdrCapabilities{mSupportedHdrTypes=[], mMaxLuminance=500.0 ...}`;
  - the app's own `Display.isHdr()` was false before and after the first frame.
- The display mode was 3840×2160 at 59.94 Hz. So the Shield was driving a 4K sink that it did not see
  as HDR, or its HDR output was off. Either way the PQ frames were tone-mapped or shown as SDR.
- **HDR10 output on the Shield is therefore unverified.** This is a device or settings state, not a
  Media3 result. The same run with the TV and AVR chain advertising HDR10 is still needed (see "Still
  needed").

Also seen:

- **Dune (2021)** played: Dolby Vision `dvhe.07.06` (profile 7) went to `OMX.Nvidia.DOVI.decode`, the
  first frame came at 2.17 s, and 0 frames were dropped in 40 s. With no DV-capable output reported,
  this says nothing about whether the enhancement layer was used, or about the 1.11.1 P7 misroute
  (androidx/media#3486).
- **Spider-Man: Into the Spider-Verse** did not get to play on the Shield: the lookup failed. With the
  fixed build, the emulator (going through the proxy to Jellyscale) found it: DirectPlay, Dolby Vision
  `dvhe.08.06` (profile 8.6). The emulator's software decoder cannot decode it, so it still needs a
  Shield run.
- In the emulator negative run, the proxy answered every stream request with a 302 to the canary.
  Playback failed with `ERROR_CODE_IO_BAD_HTTP_STATUS` (HTTP 302) and the canary got **0** hits.

## What was built

**App.** Expo SDK 58 + react-native-tvos 0.88.1-0, the same stack and pins as `spike/tv-browse`
(`package.json`). Package `dev.fluster.spike.play`, release build, Hermes.

**The TypeScript core, unchanged.** `src/App.tsx` imports the repo's own `src/lib/jellyfin/gateway.ts`
(and through it `source-acceptance.ts`, `device-profile.ts`, `hls-url.ts`, the domain modules) straight
from `../../src`; `metro.config.js` adds `../../src` as a watch folder and resolves its bare imports
(`axios`, `@jellyfin/sdk`) from this app's `node_modules`. Nothing under `src/` was edited. It took well
under the half-day budget, so no Kotlin fallback was needed. The core does:
`connect()` -> `login()` -> `searchItems(title)` (the id is looked up by name and year at run time) ->
`createPlaybackPlan()` (PlaybackInfo with the Fluster DeviceProfile, flags in body and query, then
`selectSource`), and the plan's `streamUrl` is the core's `buildStaticStreamUrl`:
`/Videos/{id}/stream?Static=true&MediaSourceId=...&PlaySessionId=...`, no token.

What the core needed under Hermes (`src/polyfills.ts`, `src/expo-fetch-transport.ts`):
- `react-native-url-polyfill` for a WHATWG `URL`;
- `crypto.subtle.digest("SHA-256")` from `expo-crypto` (for `deriveDeviceId`); the install id is passed in
  explicitly instead of the constructor's `crypto.randomUUID()` default;
- an injected `HttpTransport` over `expo/fetch` with `redirect: "manual"` (expo's Android
  `NativeRequest.kt:44-46` turns that into OkHttp `followRedirects(false)`). With an injected transport
  the gateway never installs the session header (`startSession` only swaps the Axios instance), so the
  transport adds `gateway.authorizationHeader()` itself after sign-in, and a tokenless MediaBrowser
  header before it;
- **Client name.** The core's SDK path hard-codes `Client="Fluster"` (`gateway.ts` `createClient`). The
  transport rewrites it to `Client="Octave"` on every header, and native gets the same rewritten header,
  so one identity (Client, Device, DeviceId, Version) and one token are used from JS and native.
  Preparatory refactor 4 in decision 0003 (build the header in the core) removes this hack.
- Plain-HTTP consent: on a private-LAN `http:` origin `login()` needs `confirmUnencryptedConnection()`;
  the spike calls it, since the operator chooses the server at run time. Through `adb reverse` the
  origin is loopback, which needs no consent.

**The native module** (`modules/octave-player/`, a local Expo module in Kotlin, Media3 1.11.1):
- `AuthenticatedHttp.kt`: the one OkHttp client. `followRedirects(false)`, `followSslRedirects(false)`,
  `Proxy.NO_PROXY`, and one interceptor that refuses any request whose scheme, host or port differ from
  the session origin, refuses a URL with an `api_key`/`ApiKey`/token-like parameter or the token itself,
  and adds `Authorization: MediaBrowser Client="Octave", Device=..., DeviceId=..., Version=..., Token=...`.
  It counts requests, refusals and 3xx answers (never followed).
- `OctavePlayerModule.kt`: `takeLaunchConfig()` reads the run-time inputs from intent extras and removes
  them from the intent; `startSession(origin, authorization)` is the single hand-over of the header (and
  token) to native, held in memory only; `runNativeProbes()` exercises redirects and origins through the
  shared client; the `OctavePlayerView` view takes only the tokenless URL as a prop.
- `OctavePlayerView.kt`: Media3 `PlayerView` (SurfaceView, the path Android documents for HDR), built as
  `ExoPlayer.Builder(context, renderers, DefaultMediaSourceFactory(OkHttpDataSource.Factory(AuthenticatedHttp.client)))`.
  It logs (tag `OCTAVE_PLAY`) the decoder name, the input format and its colour info, the display's HDR
  capabilities before and after the first frame, the time from process start to the first rendered frame,
  dropped frames (`onDroppedVideoFrames` and `DecoderCounters`) every 10 s, rebuffers, and errors as
  code + cause classes + HTTP status only. No log line carries a URL, header or play-session id.
- `scripts/check-no-default-datasources.sh` (`npm run check:datasources`) fails on `DefaultHttpDataSource`,
  `DefaultDataSource`/`DefaultDataSourceFactory`, `DefaultMediaSourceFactory(context)`,
  `setDataSourceFactory`, or any `ExoPlayer.Builder(...)` that does not pass a media source factory. A
  negative test (a scratch file with `ExoPlayer.Builder(context).build()`) made it fail; it passes on
  the module as committed.
- `plugins/with-cleartext-scope.js`: a `network_security_config` with cleartext off by default and on
  only for `127.0.0.1`/`localhost`, plus one host from `OCTAVE_CLEARTEXT_HOST` at prebuild time if set
  (never committed; it would live only in the gitignored `android/` and `dist/`). The runs below did not
  set it.

**Wire test** (`scripts/wire-proxy.mjs`, `run-play.sh`):
- The recording reverse proxy listens on host 127.0.0.1:8837 and forwards to the upstream named only in
  the environment (never printed or written). `adb reverse` tunnels the device's 127.0.0.1:8837 to it,
  so the app's server origin is `http://127.0.0.1:8837` and no LAN address reaches the APK, the scripts
  or the results. It streams bodies with Range passthrough.
- It records method, path, query parameter **names** (never values), whether an Authorization header
  is present, its scheme, whether it has a token, its Client field, status and bytes (`wire.jsonl`).
- `verdict.json` asserts: every request carries `Authorization: MediaBrowser ...`; every request but
  `/System/Info/Public` and `/Users/AuthenticateByName` carries a token; no URL has a credential
  parameter or any token value seen in any header (scanned at the end, in memory); zero redirects
  followed; zero requests for another origin (Host header) and zero canary hits; no 3xx relayed from
  the server.
- Redirect and origin probes: the proxy answers `/__octave_probe/redirect-same` (302 to a same-origin
  target) and `/__octave_probe/redirect-canary` (302 to a second listener, the canary, also reachable
  through `adb reverse`). The app hits both through `expo/fetch` (JS) and the shared OkHttp client
  (native), requests the canary origin directly through the shared client, and requests a URL with
  `api_key`. A followed redirect would hit the target or the canary; the off-origin and `api_key`
  requests must be refused in the app before they leave it.
- `NEGATIVE=redirect-stream` makes the proxy answer every stream request with a 302 to the canary:
  playback must fail and the canary must stay at zero.
- The D-026 control: after the run, `run-play.sh` sends the stream request straight to the server with
  no header (curl, status code only) and records it in `control.json`.

## Runs (2026-11-20)

All runs used `adb reverse` (device 127.0.0.1:8837 → host proxy), including the Shield's, which is on
network adb. Whether the tunnel limits throughput was not measured separately. The Alien run had no
rebuffer in 128 s at its bitrate.

| Run (`results/…`) | Device | Server | Result | First frame (process start / prepare) | Dropped | Proxy | Control |
|---|---|---|---|---|---|---|---|
| `emu-gtv-mock-Alien-…135118` | emulator, Google TV image (API 36) | mock, HEVC Main10 HDR10 clip | **decode failed**: `c2.goldfish.hevc.decoder` rejects Main10 (`ERROR_CODE_DECODING_FAILED`) | n/a | n/a | PASS | not run (ordering bug, fixed) |
| `emu-gtv-mock-Alien-…135713` | same | mock, HEVC Main 8-bit clip tagged BT.2020/PQ | played 125 s | 0.80 s / 0.51 s | 15 of 3,004 | PASS | 401 |
| `emu-gtv-mock-Alien-redirect-stream-…135936` | same | mock; proxy 302s every stream request to the canary | playback **failed** as required: `ERROR_CODE_IO_BAD_HTTP_STATUS` httpStatus=302 | n/a | n/a | PASS (4 injected 302s, 0 canary hits) | 401 |
| `emu-gtv-mock-Alien-…142101` | same | mock, 8-bit (re-check after the last fixes) | played | 1.00 s / 0.40 s | — | PASS (133.5 MB streamed) | 401 |
| `shield-jellyscale-Alien-…140325` | Shield | Jellyscale | sign-in, lookup, plan (DirectPlay, 27 tracks), probes OK; then `prepare failed CodedError` (see "Remount") | — | — | PASS | 401 |
| `shield-jellyscale-Alien-…141210` | Shield | Jellyscale | **played 128 s** | **2.48 s / 1.28 s** (`am start -W` TotalTime 509 ms) | **3 of 3,081** (max 3 in a row, at start) | **PASS** | **401** |
| `shield-jellyscale-SpiderMan…-…141542`, `…141639` | Shield | Jellyscale | lookup failed (0, then 1 search hit; the title compare was too strict) | — | — | PASS (3 requests) | — |
| `shield-jellyscale-Dune-…141914` | Shield | Jellyscale | played 40 s, DV P7 to `OMX.Nvidia.DOVI.decode` | 2.17 s / 1.35 s | 0 of 922 | PASS | 401 |
| `emu-gtv-remount-mock-Alien-…142946` | emulator | mock, 8-bit | after the remount fix: `wm density 240` and then `reset` mid-playback recreated the activity twice. Each time it reused the launch config, signed in again, restarted the session for the same origin and played again | 1.06 s, then 0.34 s and 0.37 s after each recreation | 0 of 711 | PASS | 401 |
| `emu-gtv-mock-NoSuchFilm-…143051` | emulator | mock | the failure path: lookup failed, so the run stopped in 16 s with a summary | — | — | PASS | none (no stream) |
| `emu-gtv-jellyscale-SpiderMan…-…143113` | emulator | Jellyscale through the proxy | lookup and plan OK (DirectPlay, 56 tracks, DV `dvhe.08.06`); decode failed on `c2.goldfish.hevc.decoder`, as expected | — | — | PASS | 401 |

**Deviation: not `fluster_tv`.** The `fluster_tv` emulator (`emulator-5554`, which this spike did not
start) was held by the Compose browse spike the whole time. A second instance of that AVD needs every
instance to be read-only. So the emulator runs used the `fluster_googletv` AVD instead:
- Google TV system image, API 36, x86_64;
- started by this spike read-only on port 5556 (`nice 10`, 2 cores), and stopped afterwards.

That second emulator ran **at the same time as the other agent's native work** on `emulator-5554`. It
may have loaded the host while the browse spike was measuring.

### Proxy detail (Shield, Alien, `…141210/verdict.json`, `wire.jsonl`)

- **11 requests.** `/System/Info/Public` and `/Users/AuthenticateByName` carried the tokenless
  MediaBrowser header. Search, PlaybackInfo and 3 stream requests (Range, `Static`, `MediaSourceId`,
  `PlaySessionId`) carried the token. Every header said `Client="Octave"`.
- **Probes.** 4 probe redirects were served (2 to `expo/fetch`, 2 to OkHttp). All answered 302 to the
  app and were not followed: 0 target hits and 0 canary hits.
- **Refused in the app.** The direct off-origin request and the `api_key` URL were both refused before
  leaving the app (`offOriginRefused=true`, `apiKeyUrlRefused=true`; the proxy never saw the `api_key`
  probe).
- **Counts.** 0 credential parameters, 0 token values in URLs, 0 wrong Host headers, 0 relayed 3xx.
- `streamBytes` in the Shield verdicts undercounts. It was added only when a response ended, and the
  main stream was still open at shutdown. The proxy now counts per chunk (the last emulator run shows
  the full 133.5 MB).

### HDR evidence

- **Emulator.** The video layer in `dumpsys SurfaceFlinger` is
  `SurfaceView[dev.fluster.spike.play/...] ... dataspace: 0x11c60000`. That decodes as
  `STANDARD_BT2020 | TRANSFER_ST2084 | RANGE_LIMITED`, so Media3 hands the surface PQ frames. The
  emulator display has no HDR types, so this proves the tagging path only.
- **Shield.**
  - `VIDEO_FORMAT mime=video/hevc codecs=hvc1.2.4.H153.90 3840x2160 color=[space=6 transfer=6 range=2 lumaBits=10]`:
    space 6 is BT.2020 and transfer 6 is ST 2084.
  - `VIDEO_DECODER name=OMX.Nvidia.h265.decode`.
  - `media.metrics` lists an `OMX.Nvidia.h265.decode` session at height 2160 for the app's uid.
  - `dumpsys media.codec` does not exist on this Android 11 build (`Can't find service: media.codec`).
  - **The video layer** (`raw/surfaceflinger.txt`, Alien and Dune runs):
    `SurfaceView - dev.fluster.spike.play/...` is composed in hardware (`composition type=DEVICE (2)`,
    HWC `Comp Type DEVICE`, display frame 3840×2160), with `dataspace=0xc (12) hdr metadata types=0`.
    - The emulator layer carried `0x11c60000` (BT2020/PQ), but the Shield's layer did not.
    - Dataspace 12 is not a standard composed value, and what Nvidia's decoder means by it is
      **unverified**. A guess is that the decoder converts to SDR when the sink has no HDR.
    - No HDR static metadata was attached to the layer.
  - The output side: HWC and display report no HDR (see "Verdict").
  - **The TV's own state is unknown.** `mScreenState=ON` is the Shield's state, not the TV's. No tool
    here reads the TV's power or input (the browse spike's `tvoff`/`tvon` labels were also manual).
    - The 4K59.94 mode and the EDID mode list (3840×2160 at 23.976 Hz and up) show that a 4K sink was
      attached.
    - Decoder and renderer counters (frames, drops) do not depend on the TV. HDR output does.
  - Media3 read `hdrStaticInfo=false` from the container. Whether the file carries mastering metadata
    in the bitstream SEI was not checked.
- **Audio.** Alien's default track is DTS-HD (`audio/vnd.dts.hd`, 6 ch). Media3 opened the AudioTrack
  with encoding 7 (`ENCODING_DTS`), so it is passed through as the DTS core. Whether the AVR received
  DTS-HD MA was not checked.

### Remount (the first Shield attempt)

- **What happened.** In `…140325` the proxy saw two sign-ins (4 tokenless requests, 6 probe redirects)
  and 3 stream requests, and `media.metrics` shows a 2160p `OMX.Nvidia.h265.decode` session for the app
  at 14:08:12. Then JS logged `prepare failed CodedError`.
- **Mechanism.** The proxy counts fit a second full JS cycle in one process (sign-in, probes) dying in
  the native `startSession`, which then refused any second start.
- **Trigger: unknown.** Playback had started (the codec session), so something recreated the activity
  or restarted the JS app. Neither the first cycle's `session started` nor its `FIRST_FRAME` line is in
  `app-log.txt`, although the script clears logcat only before launch. So something else may have
  cleared logcat mid-run: another tool may have been active on the Shield.
- **Fix** (in the APK now in `dist/`):
  - the launch config is held per process, so a recreated activity, whose new intent carries the
    extras again, gets the same config;
  - `startSession` accepts a repeat for the same origin and replaces the header; another origin is
    still refused.

  So "the token is passed to native once" becomes **once per JS start**.
- **Fix verified on the emulator** (`emu-gtv-remount-…`): two forced recreations each resumed
  playback, and the proxy verdict was still PASS. Whether the old build fails the same way on that
  test was not checked.
- A real app should keep one player across recreation rather than rebuild it.
- The second Shield attempt (`…141210`) did not hit this. The Shield has not run the fixed build.

### Spider-Man

- **What failed.** The first Shield run searched for the full title and got 0 hits. The second searched
  for the part before the colon and got 1 hit, which failed the exact title-and-year compare. Which of
  the two (title or year) failed it was not logged.
- **Fix.** The search uses the text before the colon, the compare uses letters and digits only, and a
  failed lookup now logs the match count and years.
- **Check.** With the fix, the emulator run through the proxy to Jellyscale (`emu-gtv-jellyscale-SpiderMan…`)
  matched it: year 2018, DirectPlay, DV profile 8.6.

## Still needed (Shield, after 23:00 CST, by the coordinator)

1. **Alien with HDR on.**
   - Before the run, check `adb shell dumpsys SurfaceFlinger | grep "HWC Support"` and expect
     `hdr10=true`, and check that `dumpsys display` lists HDR types.
   - That needs the TV (and AVR) on, on an HDR-capable input, and the Shield's display settings
     allowing HDR (for example "Match content dynamic range" or an HDR display mode).
   - Then run `MODE=jellyscale ./run-play.sh <serial> shield`.
   - Look for HDR in `display[after-first-frame] isHdr=... hdrTypes=[...]` and in the SurfaceView
     layer's dataspace in `raw/surfaceflinger.txt`.
2. **Spider-Man with the fixed title compare:**
   `TITLE="Spider-Man: Into the Spider-Verse" YEAR=2018 MODE=jellyscale ./run-play.sh <serial> shield`.
3. **Dune** for at least 2 minutes with DV output on, to see whether profile 7 shows as DV on the TV.

## Shield run, night of 2026-11-20

The coordinator's night agent ran this at 00:00–00:06 CST on 21 November.
- It held an exclusive lock on the Shield, and no other agent was on it.
- Both runs used `MODE=jellyscale` with `PLAY_SECS=130`, the fixed APK in `dist/`, and the server
  address only in the shell environment.

**HWC before each run:** `HWC Support: wideColorGamut=true hdr10plus=false hdr10=false hlg=false
dv=false metadata=3`. `dumpsys display` reported `HdrCapabilities{mSupportedHdrTypes=[],
mMaxLuminance=500.0}`, `mActiveColorMode=0`, and mode 3840×2160 at 59.94 Hz. So the sink reported
no HDR. **Item 1 (Alien with HDR on) was not re-run**, because the condition `hdr10=true` was not
met.
- At 23:05 the Shield was asleep with display power off. Whether the TV was on, and on which
  input, is unknown; no tool here reads it.

| Run (`results/…`) | Title | Result | First frame (launch / prepare) | `am start` TotalTime | Rendered / dropped | Rebuffers | Proxy | Control |
|---|---|---|---|---|---|---|---|---|
| `shield-jellyscale-SpiderManIntotheSpiderVerse-20261121-000031` | Spider-Man: Into the Spider-Verse (2018) | **played 137 s** | 4.26 s / 2.99 s | 810 ms | 3,283 / **0** | 0 | **PASS** | **401** |
| `shield-jellyscale-Dune-20261121-000314` | Dune (2021) | **played 139 s** | 2.29 s / 1.25 s | 519 ms | 3,325 / **0** | 0 | **PASS** | **401** |

- **Lookup and plan.**
  - Spider-Man: the fixed title compare found it (`lookup ok kind=Movie year=2018`).
  - Both titles planned `delivery=static playMethod=DirectPlay reasons=[]`.
  - Track counts: Spider-Man 56, Dune 17.
- **Decoders.**
  - Spider-Man is `video/dolby-vision`, `dvhe.08.06`, 3840×2160, BT.2020/ST 2084, 10-bit, decoded by
    `OMX.Nvidia.h265.decode`. That is profile 8.6 as HEVC through its HDR10 base layer.
  - Dune is `dvhe.07.06`, decoded by `OMX.Nvidia.DOVI.decode`.
  - Audio for both is AC-3 5.1 passed through (`encoding=5`, tunneling and offload off).
- **Proxy, per run.**
  - 11 requests and 2 tokenless ones (public info and sign-in).
  - 0 credential parameters, 0 tokens in URLs, 0 wrong hosts, 0 upstream 3xx.
  - 4 probe redirects served, 0 probe target hits, 0 canary hits, 3 stream requests.
  - The app refused the off-origin and `api_key` probes.
  - Streamed: Spider-Man 1.07 GB, Dune 1.25 GB, counted per chunk now.
- **The remount fix held on the Shield.** Each run had a single `session started`, and neither run
  restarted.
- **Video layer.**
  - The app's layer is `appId=10154`, which is `dev.fluster.spike.play`'s uid. It was composed in
    hardware (`DEVICE`, 3840×2160).
  - Spider-Man's layer had `dataspace=0x41b41f30` and Dune's `0xd576d023`, both with `hdr metadata
    types=2`. The afternoon runs showed `0xc` and types 0.
  - Neither value is a standard `Dataspace`. What Nvidia's HWC means by them is **unverified**.
  - Types bit 2 is CTA-861.3 content light level in the HWC metadata mask, so HDR metadata is now
    attached to the layer.
  - The display stayed `isHdr=false` before and after the first frame.
- **HDR and DV output: still not shown.** With a sink that reports no HDR, neither title can show HDR
  or DV on the TV. Item 3's question (whether profile 7 shows as DV on the TV) stays open, and so does
  item 1.
- **Still needed:** with the TV on an HDR/DV-capable input and the Shield allowing HDR (`hdr10=true`
  and `dv=true` in HWC Support), re-run Alien and Dune.

## Verified vs unverified

| Claim | Status | Evidence |
|---|---|---|
| The TypeScript core runs unchanged under Hermes in RN TV (sign-in, search, PlaybackInfo, `selectSource`, static URL) | verified | `OCTAVE_JS` lines in every `app-log.txt`; nothing under `src/` changed |
| The stream URL has no token; every request has the header; no redirect followed; no other origin | verified, emulator and Shield | `verdict.json` PASS in every run; probes in `app-log.txt` |
| Off-origin and `api_key` requests are refused natively | verified | `native probes {... offOriginRefused=true, apiKeyUrlRefused=true}` |
| A server redirect on the stream stops playback and is not followed | verified, emulator | `…redirect-stream…`: httpStatus=302, 0 canary hits |
| Jellyscale refuses a tokenless stream request | verified | `control.json` 401 (Shield runs) |
| Hardware HEVC Main10 decode of Alien on the Shield | verified | `VIDEO_DECODER name=OMX.Nvidia.h265.decode`, media.metrics |
| HDR10 output to the display | **unverified**: the Shield reported no HDR sink | `HWC Support: ... hdr10=false`, `HdrCapabilities{mSupportedHdrTypes=[]}` |
| Dropped frames over 2 minutes (Alien, Shield) | verified for this (SDR-output) run: 3 of 3,081 | `stats[tick]` lines |
| Launch to first frame | verified: 2.48 s (Alien), 2.17 s (Dune) from process start | `FIRST_FRAME` lines |
| DV P7 (Dune) is decoded and output correctly | **unverified**: decoder chosen, output not DV-capable | `OMX.Nvidia.DOVI.decode` |
| `expo/fetch` uses OkHttp with redirects off for `redirect: "manual"` | verified, source and probe | `expo/android/.../NativeRequest.kt:44-46`; JS probes got 302 |
| The trigger of the `CodedError` in the first Shield attempt | **unknown**; the mechanism (a second `startSession`) fits the proxy counts | see "Remount" |
| The app survives activity recreation mid-playback | verified on the emulator after the fix; not yet on the Shield | `emu-gtv-remount-…` |
| The Shield's video layer is HDR-tagged | **no**: `dataspace=0xc`, `hdr metadata types=0`, composed in hardware | `raw/surfaceflinger.txt` (local, gitignored) |
| The TV was on and on an HDR input | **unknown** | no tool reads it |
| The `adb reverse` tunnel did not distort the Shield timings | **unverified** | not measured against a direct LAN path |

## Not tested

- **Devices.**
  - Android TV devices other than the Nvidia Shield TV (Android 11): Google TV Streamer, Chromecast
    with Google TV, Fire TV (Fire OS or Vega), Onn 4K Pro, and any low-RAM box.
  - Phones and tablets.
  - Apple TV and iOS (no Apple work was in scope).
- **Display.** An HDR10, HDR10+ or Dolby Vision sink was never active, so HDR output, HDR10+
  dynamic metadata, the DV output path and frame-rate or dynamic-range matching are untested.
- **Emulators.**
  - The emulator image `fluster_tv` (Android TV) was busy, and `fluster_tv_lowram` was not run.
  - The emulator GPU is SwiftShader (software), so no emulator GPU or compositor result says anything
    about real hardware composition.
- **Network path.** The direct LAN path (the `OCTAVE_CLEARTEXT_HOST` build) was not built or run.
  HTTPS (Jellyscale's tailnet address) was not tried.
- **Servers.** Stock Jellyfin 10.11 or 12.4 servers other than Jellyscale were not used. Only Jellyscale
  12.4.0 and the mock were.
- **Converted streams.** HLS and conversions were not run (Media3's HLS path and the playlist validator
  are out of scope here).
- **Not built.** Subtitles, audio passthrough verification at an AVR, track selection, playstate
  reporting and seeking.

## Checks run

- `npm run check:datasources`: "datasource check: OK (only OkHttpDataSource over the shared client)".
  A scratch file containing `ExoPlayer.Builder(context).build()` made the check fail, as it should.
- `npx tsc --noEmit -p .` in `spike/tv-play`: no errors.
- `pnpm check` at the worktree root (nothing under `src/` changed) passed:
  - Vitest: "Test Files 223 passed (223)", "Tests 3364 passed (3364)";
  - Rust tests: "test result: ok. 221 passed; 0 failed; 7 ignored".
- Not run, because no desktop UI, flow, Rust or negotiation code changed: `pnpm test:e2e`, the visual
  tests, cargo fmt/clippy beyond `pnpm check`, and the server tripwire.

## How to run

```sh
cd spike/tv-play
mise exec -- npm install
mise exec -- npm run prebuild:tv            # OCTAVE_CLEARTEXT_HOST unset: cleartext for loopback only
(cd android && mise exec -- ./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a,x86_64)
cp android/app/build/outputs/apk/release/app-release.apk dist/play-falsifier.apk
npm run check:datasources
scripts/make-sample.sh 150 1920x1080        # HDR10 Main10 clip for the mock; BITS=8 for the emulator
SAMPLE=sample-hevc8 MODE=mock ./run-play.sh emulator-5556 emu
OCTAVE_JELLYSCALE_URL=... MODE=jellyscale ./run-play.sh <serial> shield
```

`run-play.sh` refuses to touch a Shield between 15:50 and 23:00 CST and waits (2-minute retries, up to
40 minutes) while `dev.fluster.spike.browse*` holds the foreground. It sets `svc power stayon true`
during the run, and force-stops the app, presses HOME and sets stayon false when it is done.

- **What reaches disk.** Credentials are read from `~/.config/octave/jellyscale.env` at run time and
  passed as intent extras. They are never written or echoed. Neither the serial nor the server address
  is written; every saved log is redacted (private IPv4, URLs, `Token="…"`, `PlaySessionId`).
- **The password on the command line.** It is visible in the host's and the device's process list while
  `am start` runs.
- **Raw dumps.** They are in `results/*/raw/` (gitignored).
