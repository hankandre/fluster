# Jellyfin clients: how they work today

Researched 2026-11-12 for the product review in [`docs/plans/proposals/product-review.md`](../plans/proposals/product-review.md).

## Method and limits

- Sources are GitHub repositories at their release tags, release notes, project wikis, jellyfin.org, vendor sites, and vendor forums. Every claim has a URL beside it.
- **"(source-derived)"** means the claim was read from UI strings or code, not seen in a running app. No client was installed or run for this document.
- **"(snippet)"** means the claim comes from a search-result summary; the page itself was not opened. support.plex.tv, neowin.net, and aftvnews.com refused direct fetches.
- **"unverified"** means no source was found. It does not mean the feature is absent.
- **Reddit could not be read** from the research environment. No Reddit claim in this document is verified. Pain points therefore lean on GitHub issues and vendor forums.
- forum.jellyfin.org threads are cited from search summaries only.
- Screenshots were not inspected. Layout details (avatars, exact switcher position) are unverified unless a doc describes them.

Context: the Jellyfin server is versioned 12.x. v12.0 shipped 2026-09-08 and v12.4 on 2026-10-26 (https://github.com/jellyfin/jellyfin/releases/tag/v12.4, https://jellyfin.org/posts/state-of-the-fin-2026-05-24/).

## 1. Official clients

### 1.1 jellyfin-web

**Platforms and stack**
- The frontend used by desktop browsers and wrapped by the Android, iOS, and desktop apps (https://github.com/jellyfin/jellyfin-web/blob/v12.4/README.md).
- TypeScript, webpack, React 18, MUI 6, TanStack Query 5, `@jellyfin/sdk` 1.0.2 plus the legacy `jellyfin-apiclient` (https://github.com/jellyfin/jellyfin-web/blob/v12.4/package.json).
- Latest release v12.4, 2026-10-26. Actively maintained, 576 open issues (https://github.com/jellyfin/jellyfin-web/releases/tag/v12.4, https://github.com/jellyfin/jellyfin-web).

**Playback**
- HTML5 `<video>` with hls.js for HLS (https://github.com/jellyfin/jellyfin-web/blob/v12.4/src/plugins/htmlVideoPlayer/plugin.js#L123).
- Direct play is limited to what the browser reports it can play. The device profile is built per browser (https://github.com/jellyfin/jellyfin-web/blob/v12.4/src/scripts/browserDeviceProfile.js).
- Browser limits: HEVC is partial in Chrome, Edge, and Firefox. AC3 and E-AC3 are unsupported in Chrome and Firefox. DTS is unsupported in every browser. MKV is unsupported in Safari and disabled for Firefox (https://jellyfin.org/docs/general/clients/codec-support/).
- Fallback is remux, direct stream, or transcode over HLS (https://github.com/jellyfin/jellyfin-web/blob/v12.4/src/components/playbackSettings/playbackSettings.template.html).
- **Conversion visibility:** a "Playback Info" overlay shows the play method (Direct playing, Remuxing, Direct streaming, Transcoding) and the transcode reason in plain words, for example "The video codec is not supported" (https://github.com/jellyfin/jellyfin-web/blob/v12.4/src/components/playerstats/playerstats.js#L390-L423, https://github.com/jellyfin/jellyfin-web/blob/v12.4/src/strings/en-us.json).
- The overlay is opened from the player menu. Whether anything is shown unprompted: unverified (inferred from code that it is not).

**HDR, audio, subtitles**
- HDR10, HLG, and Dolby Vision are advertised only when the browser or TV platform reports support. Otherwise the server tone-maps (https://github.com/jellyfin/jellyfin-web/blob/v12.4/src/scripts/browserDeviceProfile.js#L1232-L1290).
- No bitstream passthrough. The DTS and TrueHD toggles only declare the codec playable (https://github.com/jellyfin/jellyfin-web/blob/v12.4/src/components/playbackSettings/playbackSettings.template.html).
- ASS/SSA renders in the client with libass-wasm (https://github.com/jellyfin/jellyfin-web/blob/v12.4/src/plugins/htmlVideoPlayer/plugin.js#L1411).
- PGS and VobSub client rendering is an experimental opt-in. Otherwise they are burned in by the server (https://github.com/jellyfin/jellyfin-web/blob/v12.4/src/plugins/htmlVideoPlayer/plugin.js#L1494-L1495).

**Servers and users**
- Multi-server is off by default in the web build (`"multiserver": false`) (https://github.com/jellyfin/jellyfin-web/blob/v12.4/src/config.json).
- When a host enables it, "Select Server" appears in the user settings menu next to "Sign Out" (https://github.com/jellyfin/jellyfin-web/blob/v12.4/src/apps/legacy/routes/user/settings/index.tsx#L319-L353).
- The server screen lists saved servers with connect and delete (https://github.com/jellyfin/jellyfin-web/blob/v12.4/src/apps/legacy/controllers/session/selectServer/index.js#L106-L194).
- The login screen has manual login, "Remember Me" (on by default), "Use Quick Connect", and "Change Server" (https://github.com/jellyfin/jellyfin-web/blob/v12.4/src/apps/legacy/controllers/session/login/index.html#L8-L50).
- A signed-in user can approve another device's Quick Connect code (https://github.com/jellyfin/jellyfin-web/blob/v12.4/src/apps/legacy/routes/user/settings/index.tsx#L96-L110).

**Other features**
- No offline sync. "Download" is a browser file download (https://github.com/jellyfin/jellyfin-web/blob/v12.4/src/strings/en-us.json, key `OptionAllowContentDownloadHelp`).
- SyncPlay, Live TV, music with lyrics, books, photos, and Chromecast are built in (https://github.com/jellyfin/jellyfin-web/blob/v12.4/src/config.json).

**Settings**
- Preferred audio language, home and internet quality (max bitrate), max transcoding resolution, cinema mode, "Play next episode automatically", a "Still watching" prompt, track choice carried from the previous item, skip lengths (https://github.com/jellyfin/jellyfin-web/blob/v12.4/src/components/playbackSettings/playbackSettings.template.html).
- Media segment actions per type (Intro, Outro, Preview, Recap, Commercial): None, Ask To Skip, or Skip (https://github.com/jellyfin/jellyfin-web/blob/v12.4/src/apps/legacy/features/playback/constants/mediaSegmentAction.ts).
- Subtitle language, mode (Default, Smart, Only Forced, Always, None), and styling (https://github.com/jellyfin/jellyfin-web/blob/v12.4/src/components/subtitlesettings/subtitlesettings.template.html).

**Pain points**
- Subtitle desync when transcoding, open since 2023 (https://github.com/jellyfin/jellyfin-web/issues/4346).
- HLS playback times out when audio must be transcoded (https://github.com/jellyfin/jellyfin-web/issues/7546).
- Firefox cannot play MKV on 12.0 (https://github.com/jellyfin/jellyfin-web/issues/8459).
- Access-token security issue, open since 2019 (https://github.com/jellyfin/jellyfin-web/issues/516).
- Stuttering HEVC direct play in Chrome and Edge (snippet) (https://forum.jellyfin.org/t-stuttering-when-direct-playing-hevc).

### 1.2 Jellyfin Desktop (formerly Jellyfin Media Player)

**Status. This is the closest official competitor and it is unsettled.**
- `jellyfin/jellyfin-media-player` now redirects to `jellyfin/jellyfin-desktop`. The rename came with v2.0.0 on 2025-12-14 (https://github.com/jellyfin/jellyfin-desktop/releases/tag/v2.0.0).
- 2026-03-28: the Qt client was declared deprecated in favour of an SDL + CEF rewrite (https://github.com/jellyfin/jellyfin-desktop/commit/105fec60).
- 2026-05-24: the Jellyfin blog said the rewrite had native HDR on Wayland, macOS, and Windows but was not ready for a stable v3.0.0 (https://jellyfin.org/posts/state-of-the-fin-2026-05-24/).
- 2026-07-17: the rewrite's author left the Jellyfin organisation. The rewrite continues unofficially as Jellium Desktop (https://github.com/andrewrabert/jellium-desktop/issues/609).
- 2026-07-29: the deprecation notice was removed and the Qt client revived (https://github.com/jellyfin/jellyfin-desktop/pull/1208).
- Latest tag v2.1.0-pre1, 2026-11-03, a pre-release. v2.0.0 is also flagged pre-release. The last release not flagged pre-release is v1.12.0 from 2025-03-20 (https://github.com/jellyfin/jellyfin-desktop/releases).

**Platforms and stack**
- Qt 6 WebEngine hosting jellyfin-web, with libmpv for video and audio (https://github.com/jellyfin/jellyfin-desktop/blob/master/README.md).
- Linux through Flathub. macOS, Windows, and AppImage only as nightly development builds (https://github.com/jellyfin/jellyfin-desktop/blob/master/README.md).

**Playback**
- The device profile direct plays all video with no codec or container list, unless the user turns on a force-transcode toggle (https://github.com/jellyfin/jellyfin-desktop/blob/master/native/nativeshell.js#L163-L167).
- Force-transcode toggles exist for HEVC, 4K, AV1, HDR, Hi10p, and Dolby Vision (https://github.com/jellyfin/jellyfin-desktop/blob/master/resources/settings/settings_description.json).
- **Conversion visibility:** it reuses jellyfin-web's opt-in "Playback Info" overlay (https://github.com/jellyfin/jellyfin-desktop/blob/master/native/mpvVideoPlayer.js#L834-L885). Whether the transcode reason appears in the desktop shell: unverified.
- It falls back to the HTML5 web player when mpv fails (https://github.com/jellyfin/jellyfin-desktop/issues/1291).

**HDR, audio, subtitles**
- HDR output is not officially supported in the Qt client. The request is open, and users report washed-out colour or hand-edited `mpv.conf` (https://github.com/jellyfin/jellyfin-desktop/issues/523).
- `vo=gpu-next` support is an open request (https://github.com/jellyfin/jellyfin-desktop/issues/362).
- Audio passthrough toggles for AC3, DTS, E-AC3, DTS-HD, and TrueHD, plus exclusive mode (https://github.com/jellyfin/jellyfin-desktop/blob/master/resources/settings/settings_description.json).
- ASS, SRT, and embedded PGS, DVD, and DVB subtitles play directly. There is no burn-in entry in the profile (https://github.com/jellyfin/jellyfin-desktop/blob/master/native/nativeshell.js#L196-L210).

**Servers and users**
- The shell enables jellyfin-web's multi-server feature, so "Select Server" and the saved-server list apply (https://github.com/jellyfin/jellyfin-desktop/blob/master/native/nativeshell.js#L1-L16).
- Multi-profile support is command-line flags only. In-app profile switching is an open request (https://github.com/jellyfin/jellyfin-desktop/releases/tag/v2.0.0, https://github.com/jellyfin/jellyfin-desktop/issues/1093).

**Other features**
- File download only, no offline library (https://github.com/jellyfin/jellyfin-desktop/issues/604).
- SyncPlay, Live TV, and music come from jellyfin-web. MPRIS was added in 2.0 (https://github.com/jellyfin/jellyfin-desktop/releases/tag/v2.0.0).

**Settings**
- Refresh-rate switching, hardware decoding, deinterlace, audio delay, cache size, default playback speed, and `mpv.conf` passthrough (https://github.com/jellyfin/jellyfin-desktop/blob/master/resources/settings/settings_description.json).
- Auto-play next, segment modes, bitrate, and languages are jellyfin-web's.

**Pain points**
- Dual subtitles, the top request (https://github.com/jellyfin/jellyfin-desktop/issues/482).
- No per-series default audio or subtitle language (https://github.com/jellyfin/jellyfin-desktop/issues/749).
- "Forced transcoding on new update 1.11.0 - no direct play" (https://github.com/jellyfin/jellyfin-desktop/issues/687).
- Flatpak 2.0.0 on Wayland: mpv fails and the app silently falls back to the web player (https://github.com/jellyfin/jellyfin-desktop/issues/1291).
- 2.1.0-pre1 drops a frame about every 1.8 s on PipeWire (https://github.com/jellyfin/jellyfin-desktop/issues/1315).
- Windows builds were unavailable after the revival (https://github.com/jellyfin/jellyfin-desktop/issues/1211).

### 1.3 Jellyfin for Android TV

**Platforms and stack**
- Android TV, Nvidia Shield, Fire TV. Kotlin, Compose plus legacy Leanback, Media3 (https://github.com/jellyfin/jellyfin-androidtv/blob/v0.20.0/README.md, https://github.com/jellyfin/jellyfin-androidtv/blob/v0.20.0/gradle/libs.versions.toml).
- Latest v0.20.0, 2026-11-10. Needs server 10.11 or later (https://github.com/jellyfin/jellyfin-androidtv/releases/tag/v0.20.0).

**Playback**
- Media3 ExoPlayer with Jellyfin's FFmpeg extension. The playback rewrite has been open since 2021 (https://github.com/jellyfin/jellyfin-androidtv/issues/1057).
- 0.20 claims better capability detection so more plays without transcoding, plus manual overrides for HDR formats and passthrough codecs (https://jellyfin.org/posts/androidtv-v0.20.0/).
- **Conversion visibility:** new in 0.20, a "Playback info" button shows the play method, codecs, bitrate, and video range (https://github.com/jellyfin/jellyfin-androidtv/pull/5521).
- It says only "Server is transcoding this file". There is no reason string (source-derived) (https://github.com/jellyfin/jellyfin-androidtv/blob/v0.20.0/app/src/main/res/values/strings.xml#L217).

**HDR, audio, subtitles**
- Per-format HDR overrides for HDR10, HDR10+, and Dolby Vision profiles 5, 7, and 8 (https://github.com/jellyfin/jellyfin-androidtv/pull/5743).
- Passthrough is auto-detected, with bitstream toggles for AC3, E-AC3, DTS, and TrueHD (https://github.com/jellyfin/jellyfin-androidtv/pull/5645).
- ASS/SSA direct play through libass is new, experimental, and off by default. When off, ASS forces a transcode (https://jellyfin.org/posts/androidtv-v0.20.0/).
- A "Direct play PGS subtitles" toggle: "Requires transcoding when disabled" (https://github.com/jellyfin/jellyfin-androidtv/blob/v0.20.0/app/src/main/res/values/strings.xml#L583-L640).

**Servers and users (source-derived)**
- The startup screen has "Saved servers", "Discovered servers", and "Enter server address" (https://github.com/jellyfin/jellyfin-androidtv/blob/v0.20.0/app/src/main/res/values/strings.xml#L361-L380).
- Sign in with credentials or Quick Connect (https://github.com/jellyfin/jellyfin-androidtv/blob/v0.20.0/app/src/main/res/values/strings.xml#L483-L490).
- Settings: "Automatic sign in" (off, or most recently used), "Always ask for credentials", "Manage servers", "Remove server", "Switch account" (https://github.com/jellyfin/jellyfin-androidtv/blob/v0.20.0/app/src/main/res/values/strings.xml#L338-L472).
- No per-user PIN. Open request with 58 reactions (https://github.com/jellyfin/jellyfin-androidtv/issues/3509).

**Other features**
- SyncPlay is not supported, open since 2020 (https://github.com/jellyfin/jellyfin-androidtv/issues/538).
- Live TV with guide and recordings, and music (https://github.com/jellyfin/jellyfin-androidtv/blob/v0.20.0/app/src/main/res/values/strings.xml#L158, https://jellyfin.org/posts/androidtv-v0.20.0/).
- Offline downloads: none found; unverified as an explicit statement.

**Settings**
- Max streaming bitrate, next-up timer length, a "still watching" prompt, refresh-rate switching, external player (https://github.com/jellyfin/jellyfin-androidtv/blob/v0.20.0/app/src/main/res/values/strings.xml#L287-L396, https://github.com/jellyfin/jellyfin-androidtv/releases/tag/v0.20.0).
- Media segment actions per type: Ask to skip, Skip, or Do nothing (https://github.com/jellyfin/jellyfin-androidtv/blob/v0.20.0/app/src/main/res/values/strings.xml#L563-L572).

**Pain points. Unwanted transcoding dominates.**
- HDR10+ and other HDR formats trigger a transcode with `VideoRangeTypeNotSupported`, which also strips lossless audio (https://github.com/jellyfin/jellyfin-androidtv/issues/5517).
- "App sending incomplete player capabilities preventing direct play" (https://github.com/jellyfin/jellyfin-androidtv/issues/5316).
- Unnecessary transcoding of HEVC Dolby Vision in 0.19.2 (https://github.com/jellyfin/jellyfin-androidtv/issues/5093).
- No DTS-HD (https://github.com/jellyfin/jellyfin-androidtv/issues/5595).
- No dual subtitles and no audio or subtitle sync menu (https://github.com/jellyfin/jellyfin-androidtv/issues/4394, https://github.com/jellyfin/jellyfin-androidtv/issues/2479).

### 1.4 Swiftfin (iOS, iPadOS, tvOS)

**Platforms and stack**
- Swift and SwiftUI. iOS 18+, tvOS 26+, Jellyfin 12.0 (https://github.com/jellyfin/Swiftfin/blob/1.7.0/README.md).
- Latest 1.7.0, 2026-11-11 (https://github.com/jellyfin/Swiftfin/releases/tag/1.7.0).
- No macOS build (https://github.com/jellyfin/Swiftfin/issues/215).

**Playback**
- Two engines: mpv (default and recommended) and AVPlayer (https://github.com/jellyfin/Swiftfin/blob/1.7.0/Documentation/players.md).
- mpv direct plays MKV, MP4, MOV, TS, and WebM. AVPlayer plays only MP4 and MOV, so other containers are remuxed or transcoded (same page).
- **Conversion visibility:** an in-player "Session" panel shows the play method and codec detail with "(Direct)" markers (https://github.com/jellyfin/Swiftfin/blob/1.7.0/Shared/Objects/MediaPlayerManager/Supplements/PlaybackInfoSupplement.swift). Strings exist for transcode reasons; whether they show in the player or only in the admin view: unverified.

**HDR, audio, subtitles**
- HDR10 and HLG on both engines. Dolby Vision profiles 5, 8.1, and 8.4 on both. Profile 7.6 is tone-mapped by the server with mpv (https://github.com/jellyfin/Swiftfin/blob/1.7.0/Documentation/players.md).
- mpv plays DTS, DTS-HD, and TrueHD. Bitstream passthrough to a receiver: unverified.
- With mpv in Dolby Vision mode, image and styled ASS subtitles need server burn-in. With AVPlayer, bitmap subtitles always burn in and ASS styling is lost (same page).

**Servers and users (source-derived). Among the most complete designs.**
- The launch screen is a user picker (grid or list) across servers (https://github.com/jellyfin/Swiftfin/blob/1.7.0/Shared/Views/SelectUserView/SelectUserView.swift).
- Its toolbar has a server menu: add server, edit server, and a filter for one server or "All servers" (https://github.com/jellyfin/Swiftfin/blob/1.7.0/Shared/Views/SelectUserView/Components/Toolbar/Components/ServerMenu.swift).
- "Add user" sits on the same screen (https://github.com/jellyfin/Swiftfin/blob/1.7.0/Shared/Views/SelectUserView/Components/Toolbar/Components/AddUserMenu.swift).
- Quick Connect both ways: sign in with a code, and approve another device (https://github.com/jellyfin/Swiftfin/blob/1.7.0/Shared/Views/QuickConnectView.swift, https://github.com/jellyfin/Swiftfin/blob/1.7.0/Swiftfin/Views/QuickConnectAuthorizeView.swift).
- Per-user local security: device authentication or a local PIN (https://github.com/jellyfin/Swiftfin/blob/1.7.0/Translations/en.lproj/Localizable.strings).

**Other features**
- No offline downloads. It is the top issue, open since 2021 (https://github.com/jellyfin/Swiftfin/issues/57).
- No SyncPlay (https://github.com/jellyfin/Swiftfin/issues/688).
- Live TV guide and recording arrived in 1.7.0 (https://github.com/jellyfin/Swiftfin/pull/2141).
- Music, playlists, photos, and books: not supported (https://github.com/jellyfin/Swiftfin/blob/1.7.0/Documentation/libraries.md).

**Settings**
- Auto-play toggle (https://github.com/jellyfin/Swiftfin/blob/1.7.0/Shared/Views/VideoPlayer/Components/Toolbar/ActionButtons/AutoPlayActionButton.swift).
- A manual Skip button for Intro and Outro segments only. No auto-skip mode was found; unverified as an absence (https://github.com/jellyfin/Swiftfin/blob/1.7.0/Shared/Objects/MediaPlayerManager/MediaSegment.swift#L33-L40).
- Maximum bitrate (auto with a bitrate test, or custom), remote bitrate, device profile choice, remember track selection, audio and subtitle offset (https://github.com/jellyfin/Swiftfin/blob/1.7.0/Translations/en.lproj/Localizable.strings, https://github.com/jellyfin/Swiftfin/pull/2161).

**Pain points**
- The project's own Common Issues page lists "HDR or Dolby Vision looks wrong" and "Unnecessary transcoding or remuxing" (https://github.com/jellyfin/Swiftfin/blob/1.7.0/Documentation/common_issues.md).
- No custom headers for reverse-proxy authentication (https://github.com/jellyfin/Swiftfin/issues/812).
- tvOS could not sign in to Jellyfin 12.0 without legacy authentication (noted May 2026) (https://jellyfin.org/posts/state-of-the-fin-2026-05-24/).

## 2. Third-party clients

### 2.1 Findroid (Android)

- Kotlin and Jetpack Compose. Latest v1.2.0, 2026-10-25, needs Jellyfin 12.0+ (https://github.com/jarnedemeulemeester/findroid/releases/tag/v1.2.0).
- One spare-time developer. Android TV is planned, not shipped (https://github.com/jarnedemeulemeester/findroid#readme, https://github.com/jarnedemeulemeester/findroid/issues/927).
- **Playback:** ExoPlayer and mpv. "Direct play only, (no transcoding)" (https://github.com/jarnedemeulemeester/findroid#readme).
- **This is the cautionary tale for a direct-play-only client.** Transcoding has been requested since 2021, and a community PR has sat unmerged since 2024-07 (https://github.com/jarnedemeulemeester/findroid/issues/43, https://github.com/jarnedemeulemeester/findroid/pull/791).
- **HDR and audio:** the mpv backend cannot output true HDR on Android (https://github.com/jarnedemeulemeester/findroid/issues/582). Passthrough: unverified.
- **Subtitles:** ExoPlayer has limited ASS styling. mpv handles ASS but PGS is not listed for it (https://github.com/jarnedemeulemeester/findroid#readme).
- **Servers and users (source-derived):** a Servers list, a Users list per server, and several addresses per server. Sign in by password or Quick Connect (https://github.com/jarnedemeulemeester/findroid/blob/main/setup/src/main/res/values/strings.xml). PIN and avatars: unverified.
- **Other:** offline downloads with an offline mode. No SyncPlay, Live TV, or music (https://github.com/jarnedemeulemeester/findroid/blob/main/settings/src/main/res/values/strings.xml, https://github.com/jarnedemeulemeester/findroid/issues/117, https://github.com/jarnedemeulemeester/findroid/issues/184, https://github.com/jarnedemeulemeester/findroid/issues/516).
- **Settings:** skip button and auto-skip per segment type, preferred languages, in-app `mpv.conf` editing (https://github.com/jarnedemeulemeester/findroid/blob/main/settings/src/main/res/values/strings.xml, https://github.com/jarnedemeulemeester/findroid/releases/tag/v1.1.0).
- **Pain points:** no transcoding, no lower resolutions (https://github.com/jarnedemeulemeester/findroid/issues/917), no setting to turn off auto-play next (https://github.com/jarnedemeulemeester/findroid/issues/1050). A forum user: "a lot of settings are missing" (https://forum.jellyfin.org/t-can-t-direct-play-on-android-tablet).

### 2.2 Wholphin (Android TV)

- Kotlin, written from scratch with a Plex-inspired UI. Latest v1.1.1, 2026-11-06. v1.2.0 will need Jellyfin 12+ (https://github.com/damontecres/Wholphin#readme, https://github.com/damontecres/Wholphin/releases/tag/v1.1.1).
- **Playback:** ExoPlayer and mpv. Backend choices are ExoPlayer, MPV, "Prefer MPV" (MPV except for HDR), or an external player (https://github.com/damontecres/Wholphin/wiki/App-Settings).
- A max bitrate setting forces transcoding when a file exceeds it, and it can be changed during playback (https://github.com/damontecres/Wholphin/wiki/App-Settings, https://github.com/damontecres/Wholphin/pull/2097).
- **Conversion visibility:** a "Show playback debug info" overlay, off by default. It prints the play method and, when transcoding, "Reason:" with the server's reasons (https://github.com/damontecres/Wholphin/blob/main/app/src/main/java/com/github/damontecres/wholphin/ui/playback/overlay/PlaybackDebugOverlay.kt). An always-visible indicator: unverified (none found).
- **HDR and audio:** ExoPlayer supports HDR and passthrough. mpv on Android "cannot play HDR content" and "always decodes audio and outputs PCM" (https://github.com/damontecres/Wholphin/wiki).
- **Subtitles:** ASS on ExoPlayer has three modes: libass, ExoPlayer built-in, or server burn-in. PGS direct play is on by default (https://github.com/damontecres/Wholphin/wiki/App-Settings).
- **Servers and users:** "Select Server", "Discovered Servers", "Switch servers", "Select User", "Add User" (https://github.com/damontecres/Wholphin/blob/main/app/src/main/res/values/strings.xml).
- "Sign in automatically" resumes the last user. With it off, the user picker shows at launch (https://github.com/damontecres/Wholphin/wiki/App-Settings).
- Per-profile protection on the device: none, a PIN, or a full sign-in each time (same page).
- Quick Connect works both ways (same page).
- **Other:** Live TV and DVR, music, photos. No SyncPlay (https://github.com/damontecres/Wholphin#readme, https://github.com/damontecres/Wholphin/issues/203). Offline downloads: none found.
- **Settings:** next up at the end, during credits, or never; auto-play toggle and delay; "Passout protection"; per-segment-type auto skip, ask, or ignore; refresh-rate switching; per-library display options (https://github.com/damontecres/Wholphin/wiki/App-Settings).
- **Pain points:** 4K HDR transcodes with `VideoRangeTypeNotSupported` on a Shield (https://github.com/damontecres/Wholphin/issues/867). HDR10+ triggers a transcode (https://github.com/damontecres/Wholphin/issues/1126). The mpv limits tracker (https://github.com/damontecres/Wholphin/issues/235).

### 2.3 Fladder (the only one of the four on desktop)

- Flutter. Android, Android TV, iOS, Windows, macOS, Linux, and web (https://github.com/DonutWare/Fladder#readme).
- Latest stable v0.11.1, 2026-09-08, with a rolling nightly (https://github.com/DonutWare/Fladder/releases/tag/v0.11.1).
- **Playback:** `media_kit` (libmpv), MDK, and a native player. MPV is the default (https://github.com/DonutWare/Fladder/blob/develop/lib/models/settings/video_player_settings.dart).
- "Direct, Transcode and Offline playback" (https://github.com/DonutWare/Fladder#readme).
- Separate "Home quality" and "Internet quality" limits (https://github.com/DonutWare/Fladder/blob/develop/lib/l10n/app_en.arb).
- **Conversion visibility:** a playback-information dialog shows the playback type and the transcode reasons as a raw list. It also shows the stream URL with a copy button (https://github.com/DonutWare/Fladder/blob/develop/lib/screens/video_player/components/video_playback_information.dart).
- A "Transcoding" label sits beside the item's HDR badge (https://github.com/DonutWare/Fladder/issues/677).
- **HDR and audio:** HDR and tone mapping are an opt-in "advanced" option marked unstable (https://github.com/DonutWare/Fladder/blob/develop/lib/l10n/app_en.arb). A PR for Dolby Vision and Atmos passthrough on Windows was closed unmerged (https://github.com/DonutWare/Fladder/pull/884). A built-in passthrough setting: unverified.
- **Subtitles:** a "Native libass subtitles" toggle and styling options (same strings file).
- **Servers and users:** "Multiple profiles – add multiple users or different servers easily switching between" (https://github.com/DonutWare/Fladder#readme).
- Each profile has its own lock: auto login, pass-code, or biometrics (https://github.com/DonutWare/Fladder/blob/develop/lib/l10n/app_en.arb).
- Each profile has a "Local Jellyfin URL" used automatically on the home network (same file).
- Quick Connect sign-in and approval (https://github.com/DonutWare/Fladder/pull/974).
- **Other:** offline sync on every platform, with transcoded downloads (https://github.com/DonutWare/Fladder/releases/tag/v0.10.3). Live TV (https://github.com/DonutWare/Fladder/pull/732). Music in beta with gapless (https://github.com/DonutWare/Fladder/releases/tag/v0.11.0). SyncPlay is an open PR (https://github.com/DonutWare/Fladder/pull/735).
- **Settings:** segment actions None, Ask to skip, Skip once, or Skip; next-up preview Off, Smart, or Static; hotkeys; saved library filters (https://github.com/DonutWare/Fladder/blob/develop/lib/l10n/app_en.arb, https://github.com/DonutWare/Fladder/releases/tag/v0.11.0).
- **Pain points, mostly desktop playback quality:**
  - 4K direct play stutters on Windows 11 (https://github.com/DonutWare/Fladder/issues/731).
  - mpv stutters on 4K Dolby Vision on Android, TV, and PC (https://github.com/DonutWare/Fladder/issues/796).
  - ASS subtitles vanish when playback switches to transcode on Linux (https://github.com/DonutWare/Fladder/issues/912).
  - Styled ASS draws a grey box over the picture (https://github.com/DonutWare/Fladder/issues/447).
  - The MPV backend is broken in Flatpak (https://github.com/DonutWare/Fladder/issues/690).
  - The desktop app does not remember a maximised window (https://github.com/DonutWare/Fladder/issues/932).

### 2.4 Streamyfin (iOS, Android, Apple TV, Android TV)

- Expo and React Native. Latest v0.55.2, 2026-10-16 (https://github.com/streamyfin/streamyfin#readme, https://github.com/streamyfin/streamyfin/releases/tag/v0.55.2).
- It sends crash reports to its developers through Sentry, with an off switch (https://github.com/streamyfin/streamyfin/blob/develop/translations/en.json).
- **Playback:** mpv through MPVKit is the primary player. v0.55.0 added an opt-in ExoPlayer engine on Android TV (https://github.com/streamyfin/streamyfin/releases/tag/v0.55.0).
- **Conversion visibility:** a technical overlay shows a colour-coded "Direct Play / Direct Stream / Transcoding" label and transcode reasons in readable text (https://github.com/streamyfin/streamyfin/blob/develop/components/video-player/controls/TechnicalInfoOverlay.tsx).
- **HDR and audio:** "MPV on TV does not currently pass HDR metadata to the display, so HDR10/HDR10+ content is tone-mapped to SDR. Switch to ExoPlayer for HDR output." (https://github.com/streamyfin/streamyfin/blob/develop/translations/en.json). ExoPlayer on Android TV adds Dolby Vision profile 5 and Atmos passthrough (https://github.com/streamyfin/streamyfin/pull/2002).
- **Subtitles:** ExoPlayer "does not support advanced ASS/SSA subtitle styling"; mpv does (same strings file).
- **Servers and users (source-derived):** "Previous servers", "Search for local servers", "{{count}} accounts", "Select account", "Remove server" (same strings file).
- "Save this account" with no protection or a 4-digit PIN "required when switching" (same file).
- A local URL per server with "Auto-switch when at home", keyed to the home Wi-Fi (same file).
- Using several servers at once is an open request: "I can log out and in" (https://github.com/streamyfin/streamyfin/issues/1115).
- **Other:** downloads, Live TV guide, Chromecast, a companion server plugin (https://github.com/streamyfin/streamyfin#readme). SyncPlay was merged 2026-10-09; shipped status unverified (https://github.com/streamyfin/streamyfin/pull/2201).
- **Settings:** per-segment-type None, Ask to skip, or Skip; auto-play next with "Are you still watching?"; default playback speed; remember audio and subtitle per series (same strings file).
- **Pain points:** HDR dull on iPad Pro (https://github.com/streamyfin/streamyfin/issues/1287). Apple TV never switches refresh rate (https://github.com/streamyfin/streamyfin/issues/2261). Password sign-in fails when "save" is ticked (https://github.com/streamyfin/streamyfin/issues/1917).

## 3. Reference points outside Jellyfin's own ecosystem

### 3.1 Infuse (Apple only, paid)

- iOS, tvOS, macOS, visionOS. Pro is $1.99 a month, $16.99 a year, or $99.99 lifetime (https://firecore.com/infuse).
- Its engine is not named publicly; unverified. It is sold on playing MKV, AV1, H.265, and disc images "without transcoding" (https://firecore.com/infuse).
- HDR10, HDR10+, HLG, and Dolby Vision profiles 5 and 8 (https://firecore.com/infuse).
- TrueHD and DTS-HD MA are decoded. Atmos passes through only as E-AC3 (https://firecore.com/infuse).
- PGS and ASS subtitles are supported (https://firecore.com/infuse).
- **Jellyfin modes:** Direct Mode uses the server's own lists. Library Mode merges several sources into one Infuse library (https://support.firecore.com/hc/articles/360006462093).
- **No Jellyfin transcoding.** Staff said in December 2024 that Infuse "does not currently support Jellyfin's transcoding features", so server bitrate limits do not apply and remote users report buffering (https://community.firecore.com/t/support-jellyfin-remote-access-limits/53047.md).
- Intro and credit skip from Jellyfin media segments since 8.0.4 (snippet) (https://community.firecore.com/t/infuse-8-0-4-now-available/52332.md).
- Live TV, music, and SyncPlay are not on its feature list (https://firecore.com/infuse).
- No Windows, Linux, or Android (https://community.firecore.com/t/upcoming-features-updated-8-14-26/12345/1).

### 3.2 Plex clients

- Plex HTPC uses mpv (snippet) (https://forums.plex.tv/t/problems-with-replacing-mpv/856960.md).
- **Conversion visibility:** Plex Web and Desktop have no client-side overlay showing Direct Play, Direct Stream, or Transcode with a reason. A June 2026 request asks for one (https://forums.plex.tv/t/add-a-client-side-playback-debug-overlay-to-plex-web-and-plex-desktop/939572).
- **Servers:** with several servers, the app asks which sources to pin. Pinned sources drive Home; the rest sit under "More" (snippet) (https://support.plex.tv/articles/customizing-the-apps/).
- **Users:** Plex Home fast user switching asks for a PIN when switching to a protected user (snippet) (https://support.plex.tv/articles/204232453-fast-user-switching/).
- Skip Intro, Skip Credits, and downloads need a Plex Pass (snippet) (https://support.plex.tv/articles/skip-content/).
- **Pain points:** from 2025-04-29 remote streaming needs a Plex Pass or a Remote Watch Pass, and the lifetime pass rose to $249.99 (https://www.plex.tv/blog/important-2025-plex-updates/). The 2025 mobile redesign drew complaints about missing features and crashes (https://forums.plex.tv/t/new-experience-public-release-feedback/910904).

### 3.3 Emby clients

- The Windows app (formerly Emby Theater) is "driven by MPV player under the hood", with automatic HDR and refresh-rate switching (https://emby.media/community/blogs/entry/578-the-new-emby-app-for-windows-xbox/).
- "Stats for Nerds" is an OSD toggle showing direct play or transcoding (snippet) (https://emby.media/community/topic/48821-emby-theater-for-windows-desktop-281-released).
- Emby Connect: one login finds every server linked to the account (https://emby.media/support/articles/Emby-Connect.html).
- Desktop playback is limited to one minute without Premiere. Intro skip, downloads, and Live TV need Premiere (https://emby.media/support/articles/Premiere-Feature-Matrix.html).

## 4. Newer and adjacent clients

### 4.1 Desktop clients that use mpv (the closest competitors)

| Client | Platforms | Stack | What stands out | Status | Source |
|---|---|---|---|---|---|
| Jellium Desktop | Desktop (exact list unverified) | Rust, CEF, mpv | The unofficial continuation of the Jellyfin Desktop rewrite, which had native HDR | 1.9k stars, pushed 2026-11-09, no tagged release | https://github.com/andrewrabert/jellium-desktop |
| Jellyfin MPV Shim | Windows, Linux, macOS | Python, external mpv | v3 is a full client with its own UI: offline sync, SyncPlay, music, Live TV; HDR and Dolby Vision on Windows and Linux | v3.3.0, 2026-10-23 | https://github.com/jellyfin/jellyfin-mpv-shim |
| Tsukimi | Linux only | Rust, GTK4, libmpv2 with gpu-next | Native GNOME app; Rec. 2100 HDR since 26.11.1 | v26.11.1, 2026-10-31, 3.1k stars | https://github.com/tsukinaha/tsukimi |
| Switchfin | Windows, macOS, Linux, consoles | C++, mpv | Console-style UI; direct play or transcode; Live TV; downloads | 0.9.5, 2026-11-10 | https://github.com/dragonflylee/switchfin |
| Moonfin | Windows, macOS, Linux, Android, Android TV, iOS, tvOS, web | Flutter (desktop engine unverified) | Jellyfin, Emby, and Plex in one app; **merged library across servers**; Live TV, SyncPlay, downloads | 3.1.0, 2026-11-12 | https://github.com/Moonfin-Client/Moonfin-Core |
| Plezy | macOS, Linux, Windows, iOS, tvOS | Flutter (engine unverified) | Plex, Jellyfin, and Emby; **cross-server search and a deduplicated Continue Watching** | 2.26.0, 2026-11-09, 4.2k stars | https://github.com/edde746/plezy |
| Fathom | Linux, Windows, Android | Flutter, mpv through media_kit | A Playback Info overlay with the live hardware-decode path; SyncPlay | v0.13.1, 2026-10-09 | https://github.com/TraceApps/fathom |
| MediaFlick Desktop | Windows, Linux (X11), macOS | Rust and React with libmpv | The same stack shape as Fluster; quality cap with transcode fallback | v0.1.6, 2026-07-16, 10 stars | https://github.com/phob/MediaFlick-Desktop |
| Delfin | Linux | Rust, GTK, mpv | Direct playback only; appears stalled since November 2024 | 0.4.8 | https://codeberg.org/avery42/delfin |

Multi-server support for Jellium, Tsukimi, Switchfin, Fathom, and MPV Shim: unverified.

### 4.2 Others

- **Blink:** Tauri 2 and React, but playback runs in the WebView, not mpv. It lists "Multi Jellyfin server support" (https://github.com/prayag17/Blink).
- **Sodalite** (tvOS, iOS): its own engine, Dolby Vision, lossless audio, a "Stats for Nerds" overlay, several servers with automatic internal and external URL probing (https://github.com/superuser404notfound/Sodalite).
- **AFinity** (Android): libmpv and ExoPlayer; shows the reason when transcoding (https://github.com/MakD/AFinity).
- **Elefin** (Android TV): several saved servers, one active at a time (https://github.com/flex36ty/elefin).

### 4.3 Music clients, briefly

- **Finamp:** the four-year redesign went stable as 1.0.1 on 2026-10-11. Android, iOS, and desktop. Gapless, offline with an automatic offline mode, lyrics (https://github.com/finamp-app/finamp/releases/tag/1.0.1).
- **Feishin:** Electron desktop client for Jellyfin, Navidrome, and Subsonic, with an mpv backend (https://github.com/jeffvli/feishin).
- **Symfonium:** paid Android client that merges several sources into one library, with gapless and an offline cache (https://symfonium.app/).
- **Supersonic:** Go desktop client; gapless through mpv; several servers (https://github.com/supersonic-app/supersonic).
- **Jellify:** React Native, iOS and Android, offline downloads (https://github.com/Jellify-Music/App).
- Demand signal: "Gapless Playback" for the web UI has 655 votes and is still open (https://features.jellyfin.org/posts/181).

## 5. What users ask for

Jellyfin's feature tracker, client-relevant items by votes (ranking from https://features.jellyfin.org/api/v1/posts?view=most-wanted; each post is at `https://features.jellyfin.org/posts/<#>`):

| # | Votes | Request |
|---|---|---|
| 218 | 1827 | Offline mode on Android |
| 517 | 1740 | Remove an item from Continue Watching |
| 576 | 1306 | Watchlist |
| 216 | 1186 | Lazy loading instead of pagination in library views |
| 633 | 835 | Watched history |
| 1341 | 821 | Offline sync |
| 181 | 655 | Gapless playback |
| 469 | 260 | Global defaults across clients |
| 2637 | 227 | Quick Connect with a QR code |
| 400 | 223 | Pre-buffer the next episode on auto-play |
| 272 | 219 | "Stats for nerds" in the Android TV app |

No "desktop" tag appears in the top 40, so desktop-specific demand is unverified.

Recurring themes in the issue trackers cited above:

1. **Unwanted transcoding**, above all for HDR and Dolby Vision (Android TV #5517, #5316, #5093; Wholphin #867, #1126; Swiftfin's Common Issues page).
2. **Not knowing why the server is converting.** Android TV only gained a play-method panel in 0.20 and still gives no reason. Plex users are asking for an overlay.
3. **HDR that looks wrong** (Jellyfin Desktop #523; Streamyfin #1287; Swiftfin Common Issues).
4. **Subtitle gaps:** dual subtitles, sync offset, ASS under transcode (Jellyfin Desktop #482; Android TV #4394, #2479; Fladder #912).
5. **Track memory:** per-series audio and subtitle defaults (Jellyfin Desktop #749).
6. **Offline downloads** (Swiftfin #57; features #218, #1341).
7. **Accounts:** PIN-protected profiles (Android TV #3509), fast switching, several servers at once (Streamyfin #1115).
8. **A way to lower quality** when the link is slow (Findroid #917; Infuse remote buffering).

The official client list accepts a third-party client only if it adds "at least one novel/unique feature" for its platform (snippet) (https://github.com/jellyfin/jellyfin-docs/blob/master/general/clients/index.md). Its desktop video entries are Jellyfin Media Player, Jellyfin MPV Shim, Fladder, and jftui (https://jellyfin.org/downloads/clients/all).

## 6. Multi-server and multi-user patterns

This section backs the multi-server recommendation in the proposal. "Taps to switch" was inferred from menus and source; no app was run.

### 6.1 How each client does it

| Client | Where the switcher lives | What is remembered | Token storage | Sign out revokes on server? | Libraries merged? |
|---|---|---|---|---|---|
| jellyfin-web | User menu: "Select Server" (only if the host enables multi-server) and "Sign Out" | Servers with one user and token each | Plaintext `localStorage` key `jellyfin_credentials` | Yes, then clears the token for **every** saved server | No |
| Jellyfin Desktop | The same web menu | The same | Inherits the web store (unverified beyond the profile directory) | As web | No |
| Jellyfin Android | Hamburger menu, "Select Server" | Servers, users per server | Plaintext database column | ? | No |
| Android TV | Startup: server list, then user list, then credentials | Servers, several users per server, user image | Plaintext JSON file | No server call in the code read; "Sign out" drops the token locally | No |
| Swiftfin | Launch screen: user grid with a server menu and "All servers" | Servers with several URLs, users, per-user PIN | **Keychain** | ? | No (only the user picker merges) |
| Findroid | Settings: Servers, Users, Addresses; a server sheet in the main UI | Servers, addresses per server, users per server | Plaintext database column | ? | No |
| Wholphin | Switch Server and Switch User screens | Servers, users, PIN, last used | Plaintext database columns (token and PIN) | ? | No |
| Fladder | Login screen: a grid of account tiles with avatar and server name, across servers | Accounts, each with URL, local URL, token | `shared_preferences` (not a secure store) | No server call in the code read | No |
| Streamyfin | Login: "Previous servers", accounts sheet; Settings: "Switch user on this server" | Servers, saved accounts, PIN hash | **Keychain/Keystore** for saved accounts | ? | No |
| Infuse | Shares list | Shares | ? | ? | **Yes** in Library Mode |
| Plex | No switcher: every server's libraries sit in the sidebar; sources are pinned | Account-wide | ? | n/a | **Yes** |
| Emby | Emby Connect: one login finds every linked server | Account-wide | ? | ? | ? |

Sources:
- jellyfin-web: https://github.com/jellyfin/jellyfin-web/blob/HEAD/src/components/toolbar/AppUserMenu.tsx, https://github.com/jellyfin/jellyfin-apiclient-javascript/blob/HEAD/src/credentials.js, https://github.com/jellyfin/jellyfin-web/blob/HEAD/src/lib/jellyfin-apiclient/connectionManager.js
- Jellyfin Desktop: https://github.com/jellyfin/jellyfin-desktop/issues/694
- Jellyfin Android: https://github.com/jellyfin/jellyfin-android/blob/HEAD/app/src/main/java/org/jellyfin/mobile/data/entity/UserEntity.kt, https://github.com/jellyfin/jellyfin-android/issues/1577
- Android TV: https://github.com/jellyfin/jellyfin-androidtv/blob/HEAD/app/src/main/java/org/jellyfin/androidtv/auth/store/AuthenticationStore.kt, https://github.com/jellyfin/jellyfin-androidtv/blob/HEAD/app/src/main/java/org/jellyfin/androidtv/ui/startup/fragment/ServerFragment.kt, https://github.com/jellyfin/jellyfin-androidtv/blob/HEAD/app/src/main/java/org/jellyfin/androidtv/auth/repository/AuthenticationRepository.kt
- Swiftfin: https://github.com/jellyfin/Swiftfin/blob/HEAD/Shared/Objects/SelectUserServerSelection.swift, https://github.com/jellyfin/Swiftfin/blob/HEAD/Shared/SwiftfinStore/V2Schema/V2ServerModel.swift, https://github.com/jellyfin/Swiftfin/blob/HEAD/Shared/Services/Keychain.swift
- Findroid: https://github.com/jarnedemeulemeester/findroid/tree/HEAD/data/src/main/java/dev/jdtech/jellyfin/models, https://github.com/jarnedemeulemeester/findroid/blob/HEAD/app/phone/src/main/java/dev/jdtech/jellyfin/presentation/film/components/ServerSelectionBottomSheet.kt
- Wholphin: https://github.com/damontecres/Wholphin/blob/HEAD/app/src/main/java/com/github/damontecres/wholphin/data/model/JellyfinServer.kt, https://github.com/damontecres/Wholphin/blob/HEAD/app/src/main/java/com/github/damontecres/wholphin/ui/setup/SwitchUserViewModel.kt
- Fladder: https://github.com/DonutWare/Fladder/blob/HEAD/lib/screens/login/login_user_grid.dart, https://github.com/DonutWare/Fladder/blob/HEAD/lib/models/credentials_model.dart, https://github.com/DonutWare/Fladder/blob/HEAD/lib/providers/shared_provider.dart, https://github.com/DonutWare/Fladder/blob/HEAD/lib/providers/auth_provider.dart
- Streamyfin: https://github.com/streamyfin/streamyfin/blob/HEAD/utils/secureCredentials.ts
- Infuse: https://support.firecore.com/hc/articles/360006462093
- Plex: https://forums.plex.tv/t/2-or-more-plex-media-servers-selecting/862660
- Emby: https://emby.media/support/articles/Emby-Connect.html

### 6.2 Patterns

1. **Three separate actions recur where the design is liked.** Switch user (keep the token). Sign out (drop the token, keep the tile). Remove (delete the entry). Android TV's user card offers exactly "Sign out" and "Remove" (https://github.com/jellyfin/jellyfin-androidtv/blob/HEAD/app/src/main/java/org/jellyfin/androidtv/ui/startup/fragment/ServerFragment.kt).
2. **The account, not the server, is the unit people pick.** Swiftfin and Fladder open on a grid of people, each labelled with its server. Android TV and Wholphin pick the server first, then the person.
3. **Optional lock per profile.** Swiftfin, Wholphin, Fladder, and Streamyfin offer a local PIN or biometrics. Android TV does not, and its request has 53 reactions (https://github.com/jellyfin/jellyfin-androidtv/issues/3509).
4. **More than one address per server.** Swiftfin, Findroid, Fladder, and Streamyfin store a LAN and a remote address. Its absence is the longest-running complaint on the official Android app, open since 2020 (https://github.com/jellyfin/jellyfin-android/issues/180).
5. **Secure storage is rare.** Only Swiftfin and Streamyfin use the OS secure store. The rest keep tokens in plaintext app storage.
6. **Revoking on sign-out is rare.** jellyfin-web calls `POST /Sessions/Logout`. Android TV and Fladder only drop the token locally in the code read, which leaves a live token on the server.
7. **One DeviceId per user.** The server keeps one token per DeviceId, so a multi-user client needs a distinct id per user (https://gist.github.com/nielsvanvelzen/ea047d9028f676185832e51ffaf12a6f). Android TV hashes the device id with the user id (https://github.com/jellyfin/jellyfin-androidtv/blob/HEAD/app/src/main/java/org/jellyfin/androidtv/util/sdk/DeviceInfoExtensions.kt). Streamyfin's fix for this is still an open PR (https://github.com/streamyfin/streamyfin/pull/1957).
8. **Merged libraries are the exception and draw complaints.** The official clients, Swiftfin, Findroid, Wholphin, Fladder, and Streamyfin keep servers separate. Infuse Library Mode, Moonfin, and Plezy merge (sections 3.1 and 4.1). Plex's merged Continue Watching shows an item twice when two servers hold it (https://forums.plex.tv/t/continue-watching-across-multiple-servers/940594, https://forums.plex.tv/t/recently-added-and-continue-watching-duplicates/934592). How Jellyfin users react to merging: unverified.

### 6.3 Complaints

- Switching servers forced a new sign-in every time on Android TV (https://github.com/jellyfin/jellyfin-androidtv/issues/2586).
- Auto sign-in is all or nothing, not per user (https://github.com/jellyfin/jellyfin-androidtv/issues/5791).
- A server could not be removed or its URL changed without reinstalling Swiftfin (https://github.com/jellyfin/Swiftfin/issues/629).
- Too many steps to switch user in Swiftfin; fixed in 2024 (https://github.com/jellyfin/Swiftfin/issues/855).
- The Android app hangs on a white page when the last-used address is unreachable, with no server chooser, open since 2021 (https://github.com/jellyfin/jellyfin-android/issues/291).
- jellyfin-web needs a full sign-out and sign-in to change user; the request was closed as not planned (https://github.com/jellyfin/jellyfin-web/issues/7447).
- The desktop Home showed the old server's cached content after a switch (https://github.com/jellyfin/jellyfin-desktop/issues/694).
- Fladder's desktop app loses the server URL after sign-out (https://github.com/DonutWare/Fladder/issues/920).
- Streamyfin waits for a timeout before trying the local URL (https://github.com/streamyfin/streamyfin/issues/2090).
- Demand on the feature tracker: "Multiple Servers Support", 179 votes, open since 2019 (https://features.jellyfin.org/posts/47/multiple-servers-support). "Multiple account switch", 156 votes, started (https://features.jellyfin.org/posts/2348/multiple-account-switch).
- A forum wish list for household profiles: quick switch, an optional PIN per profile, hidden admin accounts (https://forum.jellyfin.org/t-first-class-household-profiles-for-shared-devices).

### 6.4 Server facts a multi-server client depends on

- Quick Connect: a 6-character code approved from a signed-in device, on by default (https://jellyfin.org/docs/general/server/quick-connect/). Approving uses `POST /QuickConnect/Authorize` (https://api.jellyfin.org/openapi/jellyfin-openapi-stable.json).
- Official clients that can approve a code: web, Android, the desktop client, iOS. Android TV, Roku, and Swiftfin on tvOS can only sign in with one (https://jellyfin.org/docs/general/server/quick-connect/).
- `GET /System/Info/Public` is anonymous and returns the server `Id`, name, and version (https://api.jellyfin.org/openapi/jellyfin-openapi-stable.json).
- `POST /Sessions/Logout` deletes the caller's device and so revokes its token (https://github.com/jellyfin/jellyfin/blob/HEAD/Jellyfin.Api/Controllers/SessionController.cs, https://github.com/jellyfin/jellyfin/blob/HEAD/Emby.Server.Implementations/Session/SessionManager.cs).
- Jellyfin 12.0 disables legacy authorization, including the `api_key` query parameter, by default (https://jellyfin.org/posts/jellyfin-release-12.0).
- Media segment types are Unknown, Commercial, Preview, Recap, Outro, and Intro (https://api.jellyfin.org/openapi/jellyfin-openapi-stable.json).

## 7. Feature matrix

Key: **Y** yes · **N** no · **P** partial or experimental · **?** unverified · **opt-in** behind a menu or setting. Sources are in the client sections above. The Fluster column is the code on `main` at `2245150` and `tasks/prd.json`.

| | jellyfin-web | Jellyfin Desktop | Android TV | Swiftfin | Findroid | Wholphin | Fladder | Streamyfin | Infuse | **Fluster today** |
|---|---|---|---|---|---|---|---|---|---|---|
| Platforms | Browsers | Linux, macOS, Windows | Android TV, Fire TV | iOS, tvOS | Android | Android TV | All desktop, mobile, TV, web | iOS, Android, TVs | Apple only | Linux Wayland |
| Engine | Browser + hls.js | libmpv | ExoPlayer | mpv, AVPlayer | ExoPlayer, mpv | ExoPlayer, mpv | libmpv, MDK, native | mpv, ExoPlayer | Own (unnamed) | libmpv |
| Direct plays nearly everything | N | Y | P | P | Y | Y (mpv) | Y (mpv) | Y (mpv) | Y | Y |
| Transcode fallback | Y | Y | Y | Y | **N** | Y | Y | Y | **N** (Jellyfin) | Y (P10) |
| Conversion shown without asking | N? | N? | N | N? | n/a | N? | P (label) | N? | n/a | **Y** |
| Transcode reason in plain words | Y, opt-in | ? | N | ? | n/a | Raw, opt-in | Raw, opt-in | Y, opt-in | n/a | **Y** |
| HDR output | Browser-dependent | N (open request) | Y | Y | N with mpv | Y with ExoPlayer | P (unstable) | Y with ExoPlayer | Y | **N** (P5) |
| Dolby Vision | Platform-dependent | ? | P5, P7, P8 | P5, P8 | P | P5, P7, P8 | P | P5 | P5, P8 | N |
| Audio passthrough | N | Y | Y | ? | ? | Y with ExoPlayer | ? | P | E-AC3 Atmos only | **N** (P5-03) |
| ASS styled, no burn-in | Y | Y | P (experimental) | Y with mpv | Y with mpv | Y | Y | Y with mpv | Y | Y |
| PGS without burn-in | P (experimental) | Y | Y | Y with mpv | Y with ExoPlayer | Y | P | ? | Y | Y |
| Several saved servers | Y (host opt-in) | Y | Y | Y | Y | Y | Y | Y | Y | **N** |
| Several users, fast switch | P | P | Y | Y | Y | Y | Y | Y | OS profiles | **N** |
| Local PIN or lock per profile | N | N | N | Y | ? | Y | Y | Y | N | N |
| Quick Connect sign-in | Y | Y | Y | Y | Y | Y | Y | Y | ? | Y |
| Approve another device's code | Y | Y | N | Y (iOS) | ? | Y | Y | Y | ? | N |
| LAN and remote address per server | N | N | N | ? | Y | ? | Y | Y | ? | N |
| Stays signed in | Y | Y | Y | Y | Y | Y | Y | Y | Y | **N** (P3-02) |
| Offline downloads | N | N | N? | N | Y | N? | Y | Y | P | N (P8-03) |
| SyncPlay | Y | Y | N | N | N | N | N (PR) | P | N | N (P8-02) |
| Live TV | Y | Y | Y | Y | N | Y | Y | Y | N | N (out of scope) |
| Music | Y | Y | Y | N | N | Y | P (beta) | P | N | N (P11) |
| Skip intro and credits | Y | Y? | Y | P (manual) | Y | Y | Y | Y | Y | Y (manual button) |
| Skip mode setting (ask, auto, off) | Y | Y | Y | N? | Y | Y | Y | Y | Y | **N** |
| Auto-play next with countdown | Y | Y | Y | Y | Y | Y | Y | Y | ? | Y (fixed 10 s) |
| Auto-play on/off setting | Y | Y | Y | Y | **N** | Y | Y | Y | ? | **N** |
| "Still watching?" guard | Y | Y | Y | ? | ? | Y | ? | Y | ? | N |
| Streaming bitrate limit | Y | Y | Y | Y | N | Y | Y | Y | N | Y (local and remote) |
| Trickplay scrub previews | Y | Y | ? | ? | Y | ? | ? | ? | P (arriving) | Y |
| Subtitle sync offset | ? | ? | N | Y with mpv | ? | P | ? | ? | ? | N |
| Playback speed | ? | Y | ? | ? | ? | ? | ? | Y | ? | N |
| Remember tracks per series | Y | N | P | Y | ? | ? | ? | Y | ? | N |
| Tokens kept out of URLs | N (issue open since 2019) | ? | ? | ? | ? | ? | N (shows stream URL) | ? | ? | **Y** |
| Tokens in an OS secure store | N | N? | N | Y | N | N | N | Y | ? | N (session-only; P3-02) |

## 8. Where Fluster can win, and where it can't

### Can win

1. **Telling the truth about conversions, unprompted.** Every other client that shows the play method hides it behind a debug overlay or a menu. Android TV still gives no reason. Plex desktop has no overlay at all. Fluster shows "Converting on server: {reason}" in plain words at the start of every converted session, and says nothing when the file plays as stored. This is the one feature no surveyed client matches, and it is already built (P10-06, P13-13).
2. **Never transcoding for a codec or a range type.** The loudest complaints against Android TV, Wholphin, and Swiftfin are `VideoRangeTypeNotSupported` and capability-detection transcodes. Fluster's DeviceProfile carries no codec or container conditions, and a CI tripwire fails if the server converts a playable file. Jellyfin Desktop takes the same profile approach but adds six force-transcode toggles and falls back silently to the web player.
3. **The Linux desktop slot.** The official desktop client has had no stable release since March 2025, was deprecated and revived inside one year, and has no supported HDR. The rewrite left the organisation. Fladder's open desktop issues are stutter, ASS under transcode, and a broken Flatpak. A stable Wayland-first client with correct mpv playback has a real opening now.
4. **A designed interface that is not jellyfin-web in a frame.** Jellyfin Desktop and MPV Shim's rivals mostly wrap the web UI. Fluster's artwork-first design and one-press resume are its own.
5. **Token handling.** Fluster never puts a token in a URL and validates every HLS playlist in Rust. jellyfin-web's token issue has been open since 2019, and Fladder shows the stream URL with a copy button. This matters to the self-hosting audience and to nobody else's marketing.
6. **Subtitles that are simply correct.** mpv renders ASS and PGS in the client with no burn-in and no engine switch. Clients on ExoPlayer or AVPlayer trade this away for HDR.

### Cannot win today

1. **HDR and Dolby Vision output.** Tsukimi already ships Rec. 2100 HDR on Linux with gpu-next. Jellium has native HDR. Fluster's Render API path cannot do it until the P5-01 spike succeeds. Until then the home-theater persona in PRODUCT.md is not served, and Fluster should not claim otherwise.
2. **Audio passthrough.** Jellyfin Desktop has had it for years. Fluster's is P5-03, not started.
3. **Platform reach.** Fladder, Moonfin, and Plezy run on every desktop, phone, and TV. Fluster runs on Linux Wayland only. It cannot be "the client for every screen" for a long time.
4. **Breadth.** No downloads, SyncPlay, Live TV, or music yet. jellyfin-web has all four except downloads. Fladder has three.
5. **Accounts.** Every surveyed client saves several servers and switches users. Fluster signs out when the window closes.
6. **Settings depth.** Competitors expose dozens of options, including raw `mpv.conf`. Fluster's invariant I9 forbids user mpv config, on purpose. Fluster will always have fewer knobs; it has to win on defaults being right.
7. **Unified multi-server libraries.** Plezy and Moonfin merge servers into one Home. Matching that is a large project (see the proposal).
8. **A team.** Fladder, Streamyfin, and Wholphin ship releases every few weeks with many contributors.

### The honest summary

Fluster's defensible edge is narrow and real: **on the desktop, it plays the original file, proves it, and says so in plain words when it can't.** That edge is already built. It is not enough to replace another client until the daily-driver basics around it exist: staying signed in, several servers and users, the playback settings every rival has, and then HDR.
