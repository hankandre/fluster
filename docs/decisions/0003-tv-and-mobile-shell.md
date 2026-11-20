# 0003: The TV and mobile shell and its playback engines

- Status: Proposed. Waiting for the owner's approval (P12-02 acceptance 5).
- Date: 2026-11-20
- Task: P12-02. It decides what P9-01 (the Android TV spike) must prove.
- Touches: `ARCHITECTURE.md` §1 ("TV and mobile direction", constraint 4), the `AGENTS.md` hard rules on the DeviceProfile and HLS validation, PRODUCT.md principle 3 and the M6 order.
- Evidence: six research passes on 2026-11-20 (React Native, Kotlin Multiplatform and native Kotlin, a WebView shell, playback engines and devices, core reuse and agent fit), each citing primary sources, then an independent review by Fable 5.2 that re-checked 16 of the claims against primary sources (13 held; the rest are corrected below). Passthrough per device rests on press and forum sources. The sources are listed at the end. **[unverified]** marks a claim no primary source confirmed.

## Context

PRODUCT.md M6 puts Android TV first, then Android phones, then Apple TV and iOS. `ARCHITECTURE.md` §1 names React Native (`react-native-tvos`) with a native mpv module as the leading candidate, and assumes libmpv on every platform. P12-02's acceptance asked for React Native, Kotlin Multiplatform with Compose, and native Kotlin to be compared, each with libmpv on Android. The owner added a fourth option on 2026-11-20: a WebView shell that reuses the React UI over a native video layer.

Whatever the shell, these must hold:

- **Direct play first.** Play the original file whenever the device can, and never ask the server to convert a source the client can play (I1, I2).
- **Hardware decoding.** MediaCodec on Android, VideoToolbox on Apple.
- **Media security.** The Authorization header on every static and HLS request, never a token in a URL, no redirects followed (I4, I5). HLS playlists are validated before the player reads them (decision 0002, E1-B; `AGENTS.md`: "Validate every HLS playlist in Rust before mpv reads it").
- **No generic player bridge.** Typed, narrow commands only.
- **Reuse the core.** P9-01 acceptance 1: "The shell imports the unchanged domain, gateway, and coordinator."
- **The home-theatre persona** (PRODUCT.md): HDR10 and Dolby Vision where the display has them, untouched audio to an AVR, and correct ASS and PGS subtitles.

## Finding 1: the playback engine decides more than the shell

All six passes found the same thing: the shell choice matters less than whether libmpv can meet the home-theatre promise on Android. Today it cannot.

| | libmpv on Android (mpv-android, libmpv-android) | Media3 ExoPlayer (+ FFmpeg audio, + ass-media) |
|---|---|---|
| HDR10 / HDR10+ out | **No.** The gpu VOs tone-map to SDR. Maintainer, 2024-12-06: "mpv-android currently *cannot* output native HDR" ([mpv-android#1022](https://github.com/mpv-android/mpv-android/issues/1022)); 2025-12-19: native HDR needs Vulkan, which the APK does not ship and which zero-copy hwdec does not support ([#874](https://github.com/mpv-android/mpv-android/issues/874)). [mpv PR #18858](https://github.com/mpv-player/mpv/pull/18858) "vo: add Android HDR output" opened 2026-11-19, unmerged, tested on one tablet. It works on the GL context, so it would keep zero-copy hwdec, but it needs libplacebo API 399 (libmpv-android 1.1.0 pins 7.387.0) and says nothing about DV. `vo=mediacodec_embed` passes HDR on some devices by user report ([#874](https://github.com/mpv-android/mpv-android/issues/874), 2025-12-30, with a stretching problem), but loses subtitle rendering and the OSD ([vo.rst v0.42.0](https://github.com/mpv-player/mpv/blob/v0.42.0/DOCS/man/vo.rst#L690-L697)). | **Yes**, through SurfaceView ([HDR playback guide](https://developer.android.com/media/grow/hdr-playback)). |
| Dolby Vision | No source shows DV output, as opposed to tone-mapping. FFmpeg's MediaCodec wrapper has no `video/dolby-vision` MIME (`libavcodec/mediacodec_wrapper.c`). | Device-dependent. P5/P8 work where the device decodes them. In 1.11.1 a P7 MKV is misrouted to the P5 decoder; the fix is on `main`, unreleased ([androidx/media#3486](https://github.com/androidx/media/issues/3486)). |
| Lossless passthrough (TrueHD, DTS-HD MA) | Reported broken in 2024, nothing newer: maintainer "No, still broken" and no hardware to test (2024-10-18, [#619](https://github.com/mpv-android/mpv-android/issues/619)). From source, `ao_audiotrack` opens IEC61937 as stereo at the output rate, which makes high-bitrate formats unlikely **[unverified, source reading]**. | Yes where the device supports it (`AudioCapabilities` handles `DOLBY_TRUEHD`, `DTS_HD`, `E_AC3_JOC`). |
| Codec coverage | Everything FFmpeg decodes, in software when the SoC cannot. | **Device-dependent.** Video formats "depend on the underlying platform"; VC-1 and MPEG-2 play only where the SoC has a decoder ([supported formats](https://developer.android.com/media/media3/exoplayer/supported-formats)). |
| Styled ASS, PGS | libass, PGS | PGS in-tree; libass via `ass-media` (jellyfin-androidtv 0.20.0). |
| Header, no redirects | `http-header-fields`; `max_redirects=0`, **and on mpv 0.42 `curl-max-redirects` (Finding 2)**. | OkHttp data source with `followRedirects(false)` and `followSslRedirects(false)`. `DefaultHttpDataSource` follows up to 20 redirects with no off switch, so it must not be used. |

What real clients chose (each from source at a 2026-10/11 commit):

| Client | Android engine | Apple engine |
|---|---|---|
| jellyfin-androidtv 0.20.0 | Media3 1.11.1 + OkHttp + Jellyfin FFmpeg audio + ass-media; libVLC removed in 2024 ([PR #3639](https://github.com/jellyfin/jellyfin-androidtv/pull/3639)) | — |
| Wholphin | ExoPlayer or mpv, with a "Prefer MPV except HDR" mode; its wiki says mpv "Cannot play HDR content on Android" | — |
| Findroid 1.2.0 | ExoPlayer (default) or mpv | — |
| Streamyfin | mpv (default) plus an opt-in Media3 engine on Android TV only, added in [PR #1783](https://github.com/streamyfin/streamyfin/pull/1783) (2026-07-21) because "MPV on Android TV currently tone-maps HDR content to SDR" and libmpv caused OOM on low-RAM boxes | A fork of MPVKit with an out-of-tree AVFoundation VO |
| Swiftfin 1.7 | — | mpv (default) and AVPlayer; VLC dropped in 2026 ([PR #2274](https://github.com/jellyfin/Swiftfin/pull/2274)) |
| Moonfin 3.1 (Flutter) | media_kit (libmpv) plus a Media3 package | media_kit |

What the table shows: on Android, every client listed has ExoPlayer for HDR, DV and passthrough; jellyfin-androidtv ships only ExoPlayer, Wholphin and Findroid offer mpv beside it, and Streamyfin defaults to mpv with ExoPlayer opt-in on TV. On Apple, the two open-source clients checked (Swiftfin, Streamyfin) use mpv, Swiftfin with AVPlayer beside it.

The device decides lossless audio as much as the engine. Lossless bitstream to an AVR is available on the Nvidia Shield **[unverified, not re-checked]** and, for TrueHD, the Fire TV Cube 3rd gen (DTS-HD MA **[unverified]**). It is not available on the Google TV Streamer (TrueHD and DTS-HD MA were listed but never worked, per press coverage, and a 2025 update removed the listing), Chromecast with Google TV, Onn 4K Pro **[unverified, forum only]** or Apple TV. On those, Atmos reaches an AVR only as E-AC-3 JOC.

**Consequence.** On Android, "libmpv only" fails the home-theatre persona today. The options are:

- **(E1) Two engines on Android.** Media3 for sources the device can decode in hardware (HDR, DV, passthrough), libmpv for everything else (VC-1 or MPEG-2 without a decoder, odd containers, ASS styling Media3 cannot render). The choice is made per source by the client, deterministically, and shown in the player info panel (principle 5).
- **(E2) libmpv only, SDR.** Accept tone-mapped SDR and PCM audio on Android until upstream HDR lands.
- **(E3) libmpv only via `mediacodec_embed`.** HDR possibly reaches the display, but subtitles and any mpv-drawn overlay must be rendered by the app. Untested anywhere.

**E1 keeps the DeviceProfile free of codec conditions, but it changes Playback Negotiation.** The engine choice happens after PlaybackInfo, inside the client, from the source's streams and the device's `MediaCodecList`, so the profile can stay as it is. But "mpv is the floor" assumes software decoding keeps up, which holds on a desktop and may not on a TV SoC without a hardware decoder for the source (4K AV1 on older sticks, H.264 Hi10P, VC-1, high-bitrate 4K) **[unverified, a part A measurement]**. When neither engine can play a source in real time on this device, the honest answer is a server conversion, and the server never offers one by itself: with match-all `DirectPlayProfiles` it always answers direct play. The client must send a second request with direct play **and** stream copy off (`AllowVideoStreamCopy: false`; `StreamBuilder.cs` v10.11.7 line 868, `EncodingHelper.CanStreamCopyVideo` line 2321), or the server copies the same unplayable codec into HLS. So E1 also:

- adds a device-dependent "this device cannot play it" rule to `decideSource` (today that forced path exists only for disc folders and ISOs);
- amends decision 0002's flag table (`AllowVideoStreamCopy: true` always) and I1's "passes the direct-play rules", which becomes per device;
- turns the tripwire's "every sample direct plays" into a per-device matrix;
- needs a reason for a client-initiated conversion in the indicator, since the server sends no `TranscodeReasons` for it **[unverified]**;
- needs Jellyscale to honour both flags.

Real clients do gate on device capability: Streamyfin's `utils/profiles/codecSupport.ts` probes hardware AV1 and gates Apple direct play and the Android transcode target on it; Wholphin sends a separate `mpvDeviceProfile` with explicit codec lists.

**Which engine plays a converted (HLS) session is open.** mpv only keeps the validator and loopback design as they are, but an HDR remux served as direct stream would play in SDR. Media3 too means rewording the `AGENTS.md` rule "before mpv reads it" and I2, and re-auditing the validator: the served copy keeps only the tags FFmpeg's `hls` demuxer acts on (`docs/security.md` line 41), and Media3's parser supports variable substitution (`EXT-X-DEFINE`, which `playlist.rs:237` already refuses).

On Apple, libmpv (MPVKit) stays primary, with AVPlayer as the secondary engine where mpv's limits bite (frame-rate matching, DV P5/P8). AVPlayer documents no API for custom request headers, so it would need a loopback proxy that adds the header **[unverified for HLS segments]**. KSPlayer (GPL, key features paid) and VLCKit (libVLC 4 pre-release, unreliable HDR) are rejected.

## Finding 2: mpv 0.42's curl backend follows redirects

mpv 0.42.0 (2026-11-05) added a libcurl HTTP backend that also serves FFmpeg's nested HLS opens. It sets `CURLOPT_FOLLOWLOCATION` with `max-redirects` defaulting to 16 (`stream/stream_curl.c` v0.42.0 lines 113, 127, 972-973; RELEASE_NOTES lines 61-62). It is on by default when mpv is built with libcurl and libavformat ≥ 62.15.101. Fluster's only redirect guard, `stream-lavf-o=max_redirects=0` (`src-tauri/src/player/network.rs:15`), does not reach it.

- **Desktop:** the version gate accepts any mpv ≥ 0.41 (`player/version.rs:40`). The development machine has libavformat 63.1 and curl 8.23, so an mpv 0.42 package would silently follow redirects. A fix is in progress on `fix/mpv-curl-redirects` (switch the curl backend off and set `curl-max-redirects=0` on 0.42+, fail closed).
- **Mobile:** libmpv-android 1.1.0 (2026-11-15) is mpv 0.42 built with libcurl. Every mobile mpv configuration must carry the same options.

## Finding 3: what each option reuses

| | React Native (`react-native-tvos`, Expo) | Kotlin Multiplatform + Compose | Native Kotlin (Compose for TV) | WebView shell (Tauri 2 Android, React UI over a native video layer) |
|---|---|---|---|---|
| Hardware-decoded direct play (P12-02 acceptance 2) | Yes: the player is a native module (MediaCodec, VideoToolbox) | Yes: native player | Yes: native player | Yes: native player under the WebView (MediaCodec; VideoToolbox on iOS) |
| Reach | Android TV, phones, iOS, **tvOS**. Fire TV Vega only as a separate port: Vega runs Amazon's React Native 0.72 with C++ turbo modules, not `react-native-tvos` or a Kotlin player | Android, iOS; tvOS only with a community Compose fork; TV UI is Android-only (`tv-material` publishes no KMP targets) | Android, Android TV | Android, Android TV, iOS. **No tvOS** (WKWebView is not on tvOS). Vega only as a separate port: the web UI could run in Vega WebView, the engine could not |
| TypeScript core | Reused, after polyfills: WHATWG `URL` (RN's is regex-based, which would silently weaken the HLS URL rules), `crypto.subtle`, `randomUUID`; and a fetch that refuses redirects (RN's `fetch` ignores `redirect: "manual"`; `expo/fetch` honours it) | Only through an embedded JS engine (quickjs-kt, no JIT) with a Kotlin `fetch`, or a port of ~5.3k lines and ~595 tests. Either breaks P9-01 acceptance 1 as written | Same as KMP | **Unchanged** (Chromium WebView has every API the core uses) |
| UI | Rebuilt in RN components (~9k lines of `.tsx`, ~3k of CSS); ~3k lines of hooks and pure logic carry over | Rebuilt in Compose | Rebuilt in Compose | **Reused**, including the TV form (`html[data-form="tv"]`, DESIGN.md §6) and its Playwright and visual tests |
| Rust security layer (HLS validator, loopback, header, redirects) | Cross-compiled crate over JNI/FFI **[unverified]** | Same, or a Kotlin port (a third validator) | Same | Has no Tauri import (`auth_header.rs`, `url_policy.rs`, `player/hls/*`, `redaction.rs`, `network.rs`); the Android build (rustls with ring, `rustls-native-certs`, `ureq`) is to be proven in part A |
| Precedent | Streamyfin ships all four targets; its player is now native Kotlin and SwiftUI inside an Expo module | Compose for TV clients (Wholphin, Findroid) are native Kotlin, not KMP | Wholphin, Findroid, jellyfin-androidtv | skrin and Polarity (Tauri apps with a transparent WebView over a SurfaceView; Polarity drives libmpv; both tested only on one box or the emulator **[unverified]**); jellyfin-android uses a WebView UI with a separate native player. Tauri PR #10602 only adds the TV launcher entries to the manifest template, not D-pad, focus or video support |
| Agent loop and tests | TypeScript; TV e2e has no turnkey tool (Maestro has D-pad keys on Android TV, nothing on tvOS) | Best screenshot tooling (Roborazzi on the JVM), but every core rule is re-proved in Kotlin | Same | Existing Vitest, Playwright and CI baselines; only the native seam needs device tests |
| Where the token lives and who does HTTP | JS (core) with a native transport; persisted token in Keystore/Keychain via native code | Kotlin | Kotlin | JS in the WebView, as on desktop; a persisted token needs Keystore storage owned by native code (each native call is a new command, I3); Android's network security config scopes cleartext by domain, not address range, so decision 0001's private-LAN HTTP rule likely needs cleartext allowed app-wide with Fluster's own host classifier as the guard **[unverified]** |
| Main risks | Two UIs to keep in step; Android TV focus regressions (#1087, #1162); the player chrome ends up native anyway | Two cores or a JS bridge; still needs SwiftUI for tvOS | No Apple path | Old or unknown WebViews (Amazon's on Fire OS); 1 GB TV boxes (TV-ME caps a low-RAM app at 280 MB); PRODUCT.md "must not feel like a web page in a frame"; Tauri mobile is thin for this (hand-maintained `gen/android`) |

## Decision (proposed)

1. **Rule out Kotlin Multiplatform and native Kotlin, on their merits.** Either means porting or bridging the TypeScript core (about 5.3k lines and 595 tests), which puts a second implementation of negotiation and the HLS URL rules into a one-owner project, a security liability; neither reaches Apple TV without another UI; and the owner's agents are strongest in TypeScript. The honest cost: native Kotlin with Compose for TV is what Wholphin, Findroid and jellyfin-androidtv ship, and it is the lowest-risk route to a TV-native feel on Android alone.
2. **Part 0, a falsifier first (days, not weeks).** Put the existing TV form in a plain Android WebView wrapper around a built bundle (no Tauri, no engine) on the test devices. It answers the WebView version, memory against TV-ME, D-pad focus and frame pacing, and lets the owner judge "must not feel like a web page in a frame" from the sofa. If it fails, React Native becomes the shell and part A's engine is built as a React Native-compatible native module from the start.
3. **Part A, the engine, shell-independent.** It decides the home-theatre promise. Build a minimal Android test app and measure on a Shield, a Google TV Streamer, a Fire TV Stick 4K Max (Fire OS) and a low-RAM box such as the Onn 4K (the full list is under "What P9-01 must prove").
4. **Part B, the shell.** The WebView shell reuses the most (core, UI, TV form, tests, the Rust security layer) and fits DESIGN.md principle 6 ("the same tokens and components serve a 1440 px window and a 10-foot TV"). Measure two layouts: the web UI over the video (overlay), and a native player screen with its own controls opened from the web UI (jellyfin-android's shape: no transparent overlay and the lowest-memory playback, but the player chrome is built twice). Choose the WebView shell only if, on every test device, the video stays a hardware overlay under the visible UI (or the native player screen is chosen), no frames drop over 10 minutes with the OSD animating, memory is within TV-ME, and the WebView is new enough for the CSS baseline. Otherwise React Native with a native player module is the shell.
5. **Apple TV is a separate decision.** If the WebView shell is chosen, Android TV, phones and iOS share the web UI, and Apple TV needs a second UI (React Native or SwiftUI) when its turn comes. React Native for TV with the web UI for phones would keep two UIs and gain nothing, so it is not an option.
6. **Adopt E1 (two engines) on Android if part A confirms the libmpv gaps,** with the engine-selection and "cannot play here" rules written into `ARCHITECTURE.md`.
7. **Move the platform-neutral Rust security layer into its own crate** with an Android build in CI, whichever shell wins.

### Owner decisions this record needs

- **D1: the order:** part 0 (falsifier), part A (engine), part B (shell), with React Native as the fallback shell.
- **D2: two engines on Android (E1)** if part A confirms that libmpv cannot output HDR, DV or lossless passthrough. Alternatives: E2 (SDR only until upstream HDR lands) or E3 (`mediacodec_embed` with app-drawn subtitles).
- **D3: licence.** The standard libmpv-android and Jellyfin's Media3 FFmpeg extension link a GPL-3.0 FFmpeg. The repo has no LICENSE file. Choose GPL-3.0 for the app, or build LGPL FFmpeg and libmpv (and confirm the codec loss). The App Store has a history with GPL (VLC was pulled in 2011) **[unverified for current policy]**.
- **D4: the look bar.** PRODUCT.md principle 3 ("must not feel like a web page in a frame") is judged by the owner on the part 0 falsifier.
- **D5: change P9-01.** Its title ("Spike a React Native TV shell with a native mpv module") and acceptance become parts 0, A and B below. Its acceptance 1 ("imports the unchanged domain, gateway, and coordinator") stays.
- **D6: which engine plays converted (HLS) sessions:** mpv only, or Media3 too (with the I2 and `AGENTS.md` rewording and a validator re-audit).
- **D7: the E1 negotiation change:** the "cannot play here" rule, decision 0002's flag table, I1 per device, the tripwire matrix, and the indicator's reason for a client-initiated conversion.
- **D8: doc edits a WebView shell needs:** the PRODUCT.md Platforms table ("Native shell sharing Fluster's TypeScript core"), `ARCHITECTURE.md` §1 constraint 4 and the "leading candidate" paragraph, and the `AGENTS.md` "before mpv reads it" rule if Media3 plays HLS.
- **The fastest usable Android TV app** (an alternative order, for the owner to weigh): part 0, then Media3-only direct play in the WebView shell with header auth and OkHttp redirects off, then libmpv as the second engine. Media3 gives HDR, DV and passthrough from day one; until mpv arrives, sources Media3 cannot play need the forced-conversion path from E1, which then gets built first.

## What P9-01 must prove

Part 0 (falsifier, no engine): the TV form in a plain WebView wrapper on every test device: WebView version, memory, D-pad and OK, Back, frame pacing while scrolling rows, and the owner's look verdict.

Part A (engine, shell-independent):

1. `hwdec-current` reports MediaCodec during direct play and HLS direct stream, under `vo=gpu` and `vo=gpu-next`.
2. HDR10 and DV (P5, P8.1, P7 MEL and FEL) on each device with: mpv `gpu`, `gpu-next`, `mediacodec_embed`, a build with mpv PR #18858, and Media3. Record what the TV reports.
3. Passthrough of AC-3, E-AC-3 JOC, TrueHD/Atmos, DTS-HD MA and DTS:X to an AVR with mpv `audio-spdif` and with Media3. Record the AVR display.
4. Header on every request and no redirect followed, for static, HLS master, variant and segment requests, on each engine: mpv with `curl-max-redirects=0` and `curl-enabled=no`; Media3 with OkHttp `followRedirects(false)`. Port the desktop loopback tests.
5. The Rust HLS validator and loopback server built for Android and used by each engine for a converted sample (P12-02 acceptance).
6. Refresh-rate switching with `preferredDisplayModeId`.
7. Frame drops over 10 minutes for 4K HEVC 10-bit and AV1 on each engine, and mpv software decoding of 4K AV1, H.264 Hi10P and VC-1 on each device.
8. A forced conversion with direct play and stream copy off, on Jellyfin 10.11, 12.4 and Jellyscale.
9. DV profile 5 on a non-DV display (mpv `gpu-next` tone mapping vs Media3).
10. The same runs on a low-RAM box.

Part B (shell):

11. The unchanged core runs in the shell (WebView: as is; React Native: under Hermes with the polyfills and `expo/fetch`) and passes the shared fixture vectors (`tests/fixtures/hls-master-urls.json`, `host-classes.json`).
12. WebView shell: both layouts (overlay and native player screen); `dumpsys SurfaceFlinger` shows the video layer in hardware composition with the OSD hidden and visible; WebView version on each device; memory against TV-ME; cold start; D-pad, OK on text fields, Back to home (TV-DB), centre key pauses (TV-PC), media play-pause (TV-PP).
13. Chromium WebView behaviour for `redirect: "manual"`, mixed content from the app origin, and private-network requests (`docs/security.md` records the opaque-redirect check on WebKitGTK only).
14. Every `.so` is 16 KB aligned (Google Play TV-G6).
15. A decision record chooses the shell (P9-01 acceptance 4).

## Preparatory refactors (any option)

1. Extract `packages/core` (the `tsconfig.core.json` set and its tests) into a pnpm workspace package; keep one repo.
2. Replace `"types": ["node"]` in `tsconfig.core.json` with an explicit host-globals file, so the core's runtime contract (URL, timers, `crypto.subtle`, `randomUUID`, TextEncoder) is typed rather than implied by Node.
3. Add Clock and Crypto ports (`coordinator.ts:540`, `playstate-reporter.ts:70,191`, `gateway.ts:220`, `device-id.ts:7-8`).
4. Build the MediaBrowser header in the core rather than through `@jellyfin/sdk`, and keep axios in a desktop transport adapter that refuses redirects.
5. Make `setSurface` and `setFullscreen` an optional capability of `PlayerEngine`, and generalise `PlayerCapabilities` beyond mpv names.
6. Extract the Tauri-free Rust (`player/hls`, `network.rs`, `url_policy.rs`, `auth_header.rs`, `redaction.rs`, track mapping) into a workspace crate with an Android target in CI.

## Security notes for mobile

- The token stays in the core's memory as on desktop; a persisted token goes in the Android Keystore or Apple Keychain through native code, never WebView storage (`AGENTS.md`).
- The loopback playlist server is reachable by other apps on the device. Desktop has the same exposure, and the served playlists are token-free on a random path; restate it in `docs/security.md` for Android.
- Every mobile mpv configuration carries `curl-max-redirects=0` or `curl-enabled=no` (Finding 2).

## Hidden costs

- A device lab: an AVR, an HDR and DV display, the four test boxes, and a manual pass for every engine release.
- Media3 parity with mpv for track mapping (the `ff-index` rules are mpv-specific), subtitles, playstate and diagnostics, including a second "which decoder, is hardware active" readout for PRODUCT principle 5.
- Play Store requirements for every `.so` (app bundles, 64-bit, 16 KB pages) and a hand-maintained `gen/android`.

## Revisit if

- mpv PR #18858 merges and works with zero-copy hwdec on TV boxes: mpv-only (E2) becomes viable for HDR10, though not for DV or passthrough.
- mpv-android fixes passthrough.
- The part 0 falsifier fails: the shell moves to React Native.
- Jellyscale cannot honour the direct-play and stream-copy flags: E1's forced-conversion path is blocked there.
- The owner wants Fire TV Vega soon: keep the UI web-based (Vega WebView) and plan a Vega engine port.

## Rough effort (judgment, not measured)

- P9-01 part 0: days. Part A: 2–3 weeks plus device time. Part B: 1–2 weeks.
- Android TV MVP after the spike: WebView shell 6–10 weeks; React Native 2–3 months.
- Android phones: +2–4 weeks.
- iOS: +5–8 weeks (WebView over MPVKit) or +2–3 months (React Native, shared with tvOS).

## Sources (all read 2026-11-20)

Engines and devices: mpv-android issues #619, #871, #874, #1022, #1137, #1320; mpv PR #18858; mpv v0.42.0 `DOCS/man/vo.rst`, `options.rst`, `stream/stream_curl.c`, `audio/out/ao_audiotrack.c`, RELEASE_NOTES; libmpv-android v1.0.0 and v1.1.0 build scripts; androidx/media 1.11.1 (`AudioCapabilities.java`, `DefaultHttpDataSource.java`, `VideoFrameReleaseHelper.java`, extractor text parsers), issues #1865, #3160, #3486; developer.android.com Media3 supported formats, HDR playback, surface, TV app quality, TV memory; jellyfin-androidtv v0.20.0 `libs.versions.toml` and issues #5093, #5595, #5794, #5825, #5908, #5977; jellyfin-androidx-media `build.sh`; Wholphin wiki and MpvPlayer.kt; Findroid v1.2.0; Streamyfin at 68af07d (`package.json`, `app.json`, `modules/mpv-player`, PRs #1783, #2486, issues #1673, #1853, #2261); Swiftfin 1.7.0 `Documentation/players.md`, PRs #2273, #2274; MPVKit README and releases; KSPlayer README; VLCKit; Moonfin-Core `pubspec.yaml`; Infuse product page; Kodi PR #22546; nvidia.com Shield TV Pro; Amazon Fire TV Cube device specifications; Google TV Streamer support page; androidcentral on the Streamer's lossless codec removal; apple.com Apple TV 4K specs; Apple `AVDisplayCriteria`.

Shells: react-native-tvos README and releases, issues #1087, #1162; docs.expo.dev "Building for TV"; reactnative.dev networking (0.87, 0.88); RN `Libraries/Blob/URL.js` (react-native-tvos 0.88.1-0); `expo/fetch` `NativeRequest.kt`, `NativeResponse.swift`; Hermes `doc/RegExp.md`; developer.android.com JavaScriptSandbox; quickjs-kt; Compose for TV and javascriptengine release notes; `tv-material` 1.1.0 Gradle module metadata; kotlinlang.org supported platforms and native target support; jellyfin-sdk-kotlin; Tauri issues #6364, #10152, PR #10602; wry `main_pipe.rs`, `WryActivity.kt`; skrin and Polarity sources; jellyfin-android `PlayerFragment.kt`; Amazon Vega OS and Vega 2.0 announcements; Amazon hybrid apps overview; Apple App Review guideline 4.2; WKWebView availability; Callstack's TV testing guide; Maestro `pressKey` and supported platforms; Roborazzi; GitHub Actions billing and runner pricing.
