# 0002: Prefer the original file, fall back to server conversion, and show it

- Status: Accepted (the user, 2026-11-07). E1 rejected; E1-B adopted. E2 accepted with a canary test. Remote and local streaming limits default to no limit.
- Date: 2026-11-07
- Decided by: the user. Plan: `docs/plans/active/002-transcoding-fallback-and-parity.md`. Tasks: P10, P11, P12 in `tasks/prd.json`.
- Supersedes: invariants I1 and I2 and source acceptance (`ARCHITECTURE.md` §3, §4); PRODUCT principle 1 "Direct play or nothing"; the `AGENTS.md` hard rules on transcoding, direct-play flags, and `TranscodingUrl`.
- Touches invariants: I1, I2 (replaced), I3, I4, I5, I6, I7.

## Context

Fluster was started as a direct-play-only client. The first README (`git show 37bdb55:README.md`) says: "Server transcoding and remuxing are fixed off. They are not preferences and there is no fallback negotiation." PRODUCT.md turned this into principle 1 ("Direct play or nothing") and a non-goal ("People who need server-side transcoding ... Jellyfin's official clients serve them well"). The code enforces it in five places: `DIRECT_PLAY_REQUEST` (all conversion flags false, in body and query; `src/lib/jellyfin/gateway.ts`), `FLUSTER_PROFILE` (no `TranscodingProfiles`; `src/lib/jellyfin/device-profile.ts`), `evaluateSource` (refuses any source with a `TranscodingUrl`; `src/lib/jellyfin/source-acceptance.ts`), Rust's static-URL validation, and the server tripwire (`tests/integration/tripwire*.ts`, CI job `tripwire`).

The user wants Fluster to be "a valid replacement for things like Wholphin or Fladder or any of these cross-platform Flutter applications". Asked whether Fluster should ever let the server transcode, they chose "Full parity with fallback: behave like other clients: transcode automatically when direct play isn't possible." They also added Music to the roadmap and moved the Android TV/mobile shell earlier. "Never introduce Flutter" stays.

Direct-play-only blocks these cases today; each ends in a refusal screen (`src/features/player/refusal-copy.ts`):

| Case | Why it is refused today | Source |
|---|---|---|
| Remote or slow links, server remote bitrate limits | The server folds `RemoteClientBitrateLimit` into `SupportsDirectPlay: false` | `MediaInfoHelper.GetMaxBitrate`, v10.11.7 lines 495-517; refusal `no-direct-play` |
| Admin policy: remote-source forced transcoding | `ForceRemoteSourceTranscoding` clears direct play | `MediaInfoHelper.cs` v10.11.7 lines 295-306 |
| Blu-ray and DVD folders | The server never direct plays them | `StreamBuilder.cs` v10.11.7 lines 711-715; refusal `disc-source` |
| ISO images | mpv over HTTP is unverified | refusal `iso-source` |
| Non-file sources (`.strm`, remote HTTP) | Only `Protocol: File` is accepted | refusal `not-a-file` |
| Live TV | `RequiresOpening` sources are refused | refusal `live-source` |

mpv decodes nearly every codec and container Jellyfin stores, so for local playback the original file is still the best choice. Conversion is needed for the cases above, not for codecs.

## Decision

### Policy

1. **Original first.** Fluster plays the original file (`/Videos/{id}/stream?Static=true`, PlayMethod `DirectPlay`) whenever the server offers direct play and the source passes the direct-play rules. mpv is treated as able to decode every codec and container, so the DeviceProfile never asks for conversion because of a codec.
2. **Fallback order: direct play, then direct stream (server remux), then transcode.** When direct play is impossible, Fluster asks the server for an HLS stream. The server copies the video and audio when it can (`AllowVideoStreamCopy`, `AllowAudioStreamCopy` true) and encodes only what it must. Fluster calls a stream with video and audio copied "direct stream" and anything else "transcode".
3. **Never silent.** Every non-original stream shows an indicator in the player, "Converting on server: {reason}" for a transcode and "Repackaging on server, original quality: {reason}" for a direct stream, plus the method and reasons in the player information panel. Burned-in subtitles say so. The reason comes from the server's `TranscodeReasons`.
4. **Streaming limit setting.** The user sets a maximum streaming bitrate with separate local and remote values; Fluster sends it as `MaxStreamingBitrate`. Local means the server URL is loopback or private LAN by the decision 0001 host classes; remote means public. Defaults (the user, 2026-11-07): local, no limit; remote, no limit. The server's own remote bitrate limit still applies. When the user's own limit is the only reason for a transcode, the indicator offers "Play original" for that session.
5. **Refuse only what cannot be played or converted.** A refusal remains when no source can be direct played and the server cannot or will not convert it (user policy forbids conversion, transcoding disabled, live sources until Live TV is planned, unsafe URLs, missing data).
6. **One path.** Fallback happens only inside Playback Negotiation. Remote-control `Play` commands, Next Up auto-play, music queues, and the future TV/mobile shell use the same path.

### Negotiation

`PlaybackInfo` keeps the Fluster DeviceProfile on every request. The flags become:

| Field | Value | Note |
|---|---|---|
| `EnableDirectPlay` | `true` | `false` only on the forced-fallback request below |
| `EnableDirectStream` | `true` | The server ignores it for streaming unless `ForceDirectStream` ("direct-stream http streaming is currently broken", `MediaInfoHelper.cs` v10.11.7 lines 249-253), so remux arrives as HLS with stream copy |
| `EnableTranscoding` | `true` | |
| `AllowVideoStreamCopy`, `AllowAudioStreamCopy` | `true` | Lets the server copy instead of encode |
| `AlwaysBurnInSubtitleWhenTranscoding` | `false` | |
| `AutoOpenLiveStream` | `false` | Until Live TV is planned |
| `MaxStreamingBitrate` | the user's setting | The server lowers it further for remote clients (`GetMaxBitrate`, lines 495-517) |

The same values go in the query string, as today, so a body-binding change on the server cannot flip them.

DeviceProfile (`device-profile.ts`):

- `DirectPlayProfiles`: unchanged, match-all for Video and Audio.
- `TranscodingProfiles`: one Video and one Audio profile, `Protocol: "hls"`, `Context: "Streaming"`. Video: `Container: "mp4"` (fMP4 segments, so HEVC and AV1 can be stream-copied), `VideoCodec` lists the codecs mpv plays with the encode target first (proposed `h264,hevc,av1,vp9`), `AudioCodec` proposed `aac,ac3,eac3,opus,flac,mp3`, `EnableSubtitlesInManifest: false`. Audio: `Container: "mp4"`, `AudioCodec: "aac"` (music, P11). Exact lists are confirmed by contract fixtures (P10-02); stream copy depends on the source codec being in the list.
- `CodecProfiles`, `ContainerProfiles`: empty. mpv decodes everything, so no codec condition may force a transcode.
- `SubtitleProfiles`: unchanged (`External` and `Embed`). Never add a `Method: "Hls"` profile (see Q1 below).
- `MaxStreamingBitrate`: the user's setting; `MaxStaticBitrate` stays at 1 Gbps.

Forced fallback: when the server offers direct play for a source that Fluster must not direct play (a disc folder or ISO the server mislabels, or a `Static=true` request that would make the server start ffmpeg), Fluster sends a second `PlaybackInfo` for that `MediaSourceId` with `EnableDirectPlay: false` and uses the conversion it returns.

### Source decision function

Source acceptance becomes `decideSource(source) → DirectPlay | DirectStream | Transcode | Refuse`. Rules run in order; the first that decides wins.

1. `Id` missing: Refuse `missing-source-data`.
2. `RequiresOpening: true`: Refuse `live-source` (until Live TV).
3. Direct play: `SupportsDirectPlay === true`, `Protocol === "File"`, `Path` present, not a disc folder (`VideoType` BluRay/Dvd or a `BDMV`/`VIDEO_TS` segment), not an ISO (`VideoType` Iso or `.iso`), and no `TranscodingUrl`. Result DirectPlay with the static URL.
4. Disc folder or ISO that the server offered for direct play: forced fallback (above), then rule 5 on the new answer.
5. Conversion: `TranscodingUrl` present, `TranscodingSubProtocol === "hls"`, and the URL passes the HLS URL rules (below). Result DirectStream when nothing is re-encoded: every `TranscodeReasons` value in the URL is a container reason (`ContainerNotSupported`, `VideoCodecTagNotSupported`) and the URL's `VideoCodec` and `AudioCodec` lists contain the source's codecs. Otherwise Transcode, and the indicator names what is re-encoded (video, audio, or burned-in subtitles). `TranscodeReasons` reaches the client only in the URL (`&TranscodeReasons=`, `StreamInfo.cs` v10.11.7 lines 1132-1136); the `MediaSourceInfo` property is `[JsonIgnore]` (`MediaSourceInfo.cs` lines 119-120). This classification is checked against `/Sessions` `TranscodingInfo.IsVideoDirect`/`IsAudioDirect` in the tripwire (P10-09); until then it is **[unverified]**.
6. Otherwise Refuse: `conversion-not-allowed` (server says no direct play and no conversion, for example user policy), `unsafe-transcoding-url`, or `no-sources`.

Several versions: the first source whose decision is DirectPlay wins; otherwise the first DirectStream; otherwise the first Transcode; otherwise the first refusal. An explicit `MediaSourceId` is never swapped for another version.

### HLS URL rules (replaces "Never follow a `TranscodingUrl`")

Fluster never uses a `TranscodingUrl` as given. Playback Negotiation parses it and rebuilds it:

- The path must be `/videos/{itemId}/master.m3u8` or `/audio/{itemId}/master.m3u8` (any case) for the requested item, resolved against the normalized server URL. `StreamInfo.ToUrl` builds exactly these relative paths for HLS (`StreamInfo.cs` v10.11.7 lines 882-903). Any other path, an absolute URL to another origin, user info, or a non-HTTP(S) scheme is refused as `unsafe-transcoding-url`.
- Every credential parameter is removed (`ApiKey`, `api_key`, `access_token`, `Token`, `X-Emby-Token`, any case), using the existing `stripCredentialQuery`.
- `EnableTrickplay=false` is set and `EnableSubtitlesInManifest` is removed. A `SubtitleMethod=Hls` parameter is refused.
- `/Audio/{id}/universal` is never used: it answers with a redirect to remote sources (`UniversalAudioController.cs` v10.11.7 lines 175-177).

### Server-side cleanup

- `POST /Sessions/Playing/Stopped` already makes the server kill the jobs for that `PlaySessionId` (`PlaystateController.cs` v10.11.7 lines 249-253).
- Fluster also calls `DELETE /Videos/ActiveEncodings?deviceId=&playSessionId=` (`[Authorize]`, both parameters required; `HlsSegmentController.cs` v10.11.7 lines 108-115, v12.4 lines 103-110) before it starts a new play session for the same item (retry, quality change, audio or subtitle change that needs a new stream) and when a stopped report fails or times out.
- Seek needs no call: when a requested segment is behind or more than `24 / SegmentLength` segments ahead of the running job, the server kills and restarts ffmpeg itself (`DynamicHlsController.GetDynamicSegment`, v10.11.7 lines 1490-1539).
- Paused HLS jobs: the server kills an HLS job 60 s after its last ping (`TranscodeManager.PingTimer`, v10.11.7 lines 144-170). Fluster would send `POST /Sessions/Playing/Ping?playSessionId=` while paused during a conversion if progress reports did not keep the job alive. They do: `TranscodeManager.OnPlaybackProgress` pings the session's jobs on every start and progress report (v10.11.7 lines 709-715, v12.4 lines 710-716), and the P10-07 fixture check confirmed it on both servers (plan 002 decision log), so no ping is sent.

### Playstate reporting

`PlayMethod` in start, progress, and stopped reports is `DirectPlay` for the original file and always `Transcode` for a converted (`hls`) session, even when the server-confirmed UI label is DirectStream (amended 2026-11-08: a non-Transcode report makes the server clear `TranscodingInfo` while ffmpeg runs). The server rewrites `Transcode` to `DirectPlay` when it has no job for the session (`ValidatePlayMethod`, `PlaystateController.cs` v10.11.7 lines 522-531), so a wrong `Transcode` cannot hide a missing job, but a wrong `DirectStream` is not corrected. How the dashboard labels `DirectStream` against `TranscodingInfo` is **[unverified]**; the tripwire records both.

### Subtitles while converting

- Text subtitles: HLS segments are `ts` or `mp4`, which cannot embed subtitles (`IsSubtitleEmbedSupported`, `StreamBuilder.cs` v10.11.7 line 1522), and `Embed` profiles are skipped for HLS transcodes (line 1451). The server therefore offers them as `External` with a `DeliveryUrl`, extracted from the file. Fluster loads them with `sub-add` exactly as today, same-origin and header-authenticated (I6).
- Graphical subtitles (PGS, DVD): `External` only if the server can extract the codec (`CanExtractSubtitles`, line 1559); otherwise the server falls back to `Encode`, which burns them in (lines 1514-1519). Whether 10.11.7 and 12.4 extract PGS is **[unverified]** (P10-02 fixture). Burn-in is shown in the indicator.
- Never `Hls` subtitle delivery: the master playlist then lists subtitle playlists with `ApiKey={token}` in the URL (Q1).

### Browser development engine

The dev-only `<video>` engine does not play HLS. Chromium (Playwright) has no native HLS, WebKitGTK support is **[unverified]**, and a `<video>` cannot send an `Authorization` header, so it would need a token in the URL (I4). hls.js could send the header through its loader, but it would add a dependency only for a development engine. Decision: out of scope. In browser mode a DirectStream or Transcode plan shows "This stream needs the desktop player" with Back. It is never a fallback for native (I7). Playwright journeys test the indicator with a mocked engine. Revisit if a TV or mobile WebView shell needs HLS.

## Security and protocol answers

**Q1. `TranscodingUrl` carries `ApiKey` and `PlaySessionId`. Can Fluster strip the key and authenticate the master playlist and every segment with the header?**

Yes, from source; the spike P10-01 must prove it on both fixtures.

- The key in `TranscodingUrl` comes from `StreamInfo.ToUrl(null, claimsPrincipal.GetToken(), ...)` (`MediaInfoHelper.cs` v10.11.7 lines 300, 313), which appends `&ApiKey={token}` (`StreamInfo.cs` lines 1040-1043). It is there for clients that cannot send headers.
- `DynamicHlsController` is `[Authorize]` at class level (v10.11.7 line 40; v12.4 line 39), covering `master.m3u8`, `main.m3u8`, and the `hls1/{playlistId}/{segmentId}` segments. Authorization reads the `Token` from the `Authorization` header first and the `ApiKey` query only when the header has none (`AuthorizationContext.cs` v10.11.7 lines 90-106), so the header alone is enough.
- Playlist and segment URLs copy the request's own query string. The master playlist builds `main.m3u8` + the master request's `QueryString` (`DynamicHlsHelper.cs` v10.11.7 lines 152, 188-189). The variant playlist builds each segment as `hls1/main/{n}.{ext}` + the variant request's `QueryString` (`DynamicHlsController.cs` lines 1434-1443; `DynamicHlsPlaylistGenerator.cs` lines 72-98). A master URL without the key therefore yields variant and segment URLs without it. They are relative, so they resolve to the server's origin.
- Two exceptions write the token into the playlist body whatever the request carried: HLS subtitle renditions (`.../subtitles.m3u8?SegmentLength=30&ApiKey={token}`, `DynamicHlsHelper.cs` v10.11.7 line 615; v12.4 line 694) when subtitle delivery is `Hls` or `EnableSubtitlesInManifest`, and trickplay image playlists (`Trickplay/{w}/tiles.m3u8?...&ApiKey={token}`, line 652; v12.4 line 731) when `enableTrickplay`, which **defaults to `true`** on `master.m3u8` (line 464; v12.4 line 459). Fluster sets `EnableTrickplay=false`, never sends `SubtitleMethod=Hls`, and lists no `Hls` subtitle profile. FFmpeg ignores the tags it does not know, but the token would still sit in a response body that mpv parses.
- Does mpv send `http-header-fields` on HLS sub-requests? From source, yes. mpv opens HLS through FFmpeg's own I/O (`hls` has `.no_stream = true`, `demux/demux_lavf.c` v0.41.0 line 168) and passes the options from `mp_setup_av_network_options` (lines 1023-1026), which turns `http-header-fields` into FFmpeg's `headers` (`stream/stream_lavf.c` v0.41.0 lines 219-226) and adds `stream-lavf-o` (line 242). Nested opens go through `nested_io_open`, which copies those options onto every nested open (`demux_lavf.c` lines 918-950, 1077). FFmpeg's HLS demuxer also copies `headers` from the master's I/O context to every playlist and segment open (`ffio_copy_url_options`, `libavformat/hls.c` line 2666 and `aviobuf.c` lines 962-965, FFmpeg master at 2bf291526e). Runtime behavior is **[unverified]** until the P10-01 loopback test.
- `PlaySessionId` stays in the HLS URLs, as it already does in the static URL. It is not a credential, but I4 still keeps it out of logs, errors, and diagnostics.

**E1 (rejected by the user, 2026-11-07): let mpv read server playlists directly.** libmpv starts every session with `access-references=no` (`harden_network_options`, `src-tauri/src/player/network.rs`). With it off, mpv replaces FFmpeg's `io_open` with `block_io_open`, which refuses every nested open (`demux_lavf.c` v0.41.0 lines 909-916, 1066-1073), so HLS cannot play at all. E1 would have turned `access-references` on for typed HLS sessions and trusted the server's playlists. FFmpeg's HLS demuxer checks only the protocol of a playlist URI, not its origin (`open_url`, `hls.c` lines 867-905), so a playlist from a compromised server or a rewriting proxy could send the `Authorization` header to another origin. The user did not accept that risk.

**E1-B (adopted, 2026-11-07): Rust validates every HLS playlist before mpv reads it.**

- Only a launch request with a typed `delivery: "hls"` field uses this path. Static sessions are unchanged and keep `access-references=no`. No new Tauri command; one new typed field.
- Rust re-validates the master URL with the HLS URL rules above (same origin as the server, exact path shape, no credential query, `EnableTrickplay=false`).
- Rust fetches the master playlist and every variant playlist itself, with the header, no redirects, and a size limit. It resolves every URI in the playlist against the playlist's URL: plain URI lines and every `URI=` attribute, including `EXT-X-STREAM-INF` and `EXT-X-I-FRAME-STREAM-INF` targets, `EXT-X-MEDIA`, `EXT-X-MAP`, `EXT-X-KEY`, `EXT-X-SESSION-KEY`, and `EXT-X-IMAGE-STREAM-INF`. Every one must be HTTP(S) on the server's origin (scheme, host, port), with no user info and no credential query parameter (`ApiKey`, `api_key`, `access_token`, `Token`, `X-Emby-Token`, any case). Any other URI rejects the whole playlist and fails the launch with a typed error; nothing is rewritten around it.
- Defence in depth (fail closed): Rust also rejects a playlist body that contains any of those credential parameter names anywhere, even in a tag Fluster does not know. With `EnableTrickplay=false` and no `Hls` subtitle delivery the server should never produce one, so a hit means the server changed and playback stops rather than handing mpv a token.
- mpv only ever reads playlists Rust has validated. Rust serves the validated copies from a loopback HTTP server bound to `127.0.0.1` with a random per-session path, closed when the session ends. Each variant entry in the served master points at Rust's validated copy of that variant. Segment, map, and key URIs stay absolute same-origin server URLs. `access-references` is on only for these sessions, because FFmpeg must open the variants and segments; every URI it can reach was checked by Rust first. P10-01 decides whether mpv fetches segments directly with the header, or Rust proxies segments too so the header never enters mpv for HLS sessions, and records the evidence.
- Redirects stay refused: Rust's playlist fetches follow none, and `max_redirects=0` from `stream-lavf-o` must reach mpv's nested segment opens (source reading above; a loopback test proves it).
- The spike also tests `demuxer-lavf-o=protocol_whitelist=http,https,tcp,tls` as an extra guard against `file:`, `data:`, and `crypto:` URIs.
- Tests (P10-01 and P10-04): a playlist with a cross-origin variant, segment, map, or key URI is refused and the second origin receives nothing; a playlist containing a credential parameter is refused; valid playlists play with the header on every server request.

**E2 (accepted by the user with a canary test, 2026-11-07): the token may reach a playlist body Fluster does not control.** If a server ignores `EnableTrickplay=false` or a future version adds another keyed rendition, the token is in a response body. Fluster does not request libmpv log messages (no `mpv_request_log_messages` under `src-tauri/src`), and never logs, persists, or displays playlist bodies. Under E1-B, Rust rejects such a playlist before mpv sees it (above). P10-04 adds a canary test: a loopback HLS server returns a master playlist containing a canary `ApiKey`, and the test asserts the launch fails closed and the canary appears in no Fluster log, error, diagnostic, IPC event, or UI text.

No exception puts a token into a URL that Fluster builds or sends.

**Q2. Redirects and URL policy (I5) for HLS.** Rust applies the same host-class policy to the HLS URL as to the static URL, and to every URI inside each playlist (E1-B). Rust's own playlist fetches follow no redirects. mpv's segment opens inherit `max_redirects=0` through `nested_io_open` (source above, **[unverified]** until P10-01). The P10-04 loopback test serves a 302 on a segment and asserts the second origin receives nothing.

**Q3. Subtitle burn-in vs external.** Covered under "Subtitles while converting".

**Q4. DeviceProfile.** Covered under "Negotiation".

**Q5. PlayMethod.** Covered under "Playstate reporting".

**Q6. Stopping server conversions.** Covered under "Server-side cleanup".

**Q7. Browser engine.** Covered under "Browser development engine".

### What the tripwire checks now

`pnpm test:tripwire` changes from "never converts" to "never converts what can be played as stored":

- Every sample mpv can play (H.264, HEVC HDR10, AV1, ASS, sidecar SRT, multitrack, versions, episodes) must come back DirectPlay with no ffmpeg process, no `TranscodingInfo`, no `TranscodeManager` log line, and only `Static=true` ranged requests, with the default (no limit) setting.
- The BluRay folder must come back DirectStream or Transcode (no `Static=true` request), show the indicator reason, and leave no ffmpeg process within 10 s after the stopped report.
- A forced-limit run sets `MaxStreamingBitrate` below the sample bitrate for one sample and must come back Transcode with reason `ContainerBitrateExceedsLimit`, request only same-origin `master.m3u8`, `main.m3u8`, and `hls1/` URLs with no credential parameter and no `EnableTrickplay` other than `false`, and leave no job after stop.
- A fixture user with transcoding disabled must get the `conversion-not-allowed` refusal for the BluRay folder.
- `/Sessions` `PlayState.PlayMethod` and `TranscodingInfo.IsVideoDirect`/`IsAudioDirect` are recorded for every conversion and must match the confirmed method (`TranscodingInfo`), and the reported `PlayMethod` must stay `Transcode` for a conversion.

## Consequences

- Fluster can replace other Jellyfin clients for remote viewing, bitrate-limited accounts, disc folders, and (later) music and live TV.
- The server may now run ffmpeg because of Fluster. A low-power server can still be protected by its admin's user policy; Fluster then shows `conversion-not-allowed`.
- I1 and I2 are replaced (see `ARCHITECTURE.md` §4). The tripwire stays a required oracle with a new rule set.
- A new native path (HLS) adds a Rust playlist validator and loopback server, and turns `access-references` on for HLS sessions only, where every URI mpv can reach was validated by Rust first. It is covered by loopback tests.
- `RefusalReason` changes: `no-direct-play`, `not-a-file`, `server-requires-transcoding`, `disc-source`, and `iso-source` stop being refusals when the server can convert. `live-source`, `no-sources`, and `missing-source-data` stay. New: `conversion-not-allowed`, `unsafe-transcoding-url`.
- Until the P10 tasks land, the code still enforces the old, stricter rule (no conversion). That is safe but keeps the cases above blocked.

## Alternatives considered

- **Direct play only (status quo).** Keeps the server idle, but Fluster cannot replace other clients for remote or limited accounts. Rejected by the user.
- **Ask before every conversion ("Play anyway").** Honest, but the user chose automatic fallback like other clients. The indicator keeps it visible.
- **Follow `TranscodingUrl` as given, with `ApiKey`.** Simple, and it is what most clients do. Rejected: it puts the token in a URL (I4), and the header works.
- **Progressive (non-HLS) transcode with `/Videos/{id}/stream?Static=false`.** One request, no nested opens, so `access-references` could stay off. Rejected for now: the server disables progressive direct stream for streaming (`MediaInfoHelper.cs` lines 249-253), and HLS is what the server builds for `Protocol: "hls"` profiles and handles seek for. P10-01 may reopen it if E1-B proves too costly, using a `TranscodingProfile` with `Protocol: "http"`.

## Follow-ups

- P10-01 answers every **[unverified]** item above with loopback tests and fixture runs, and prototypes E1-B (including the direct-segment versus proxied-segment choice).
- `docs/security.md` gets the final HLS boundary text with P10-04.
- Live TV (`RequiresOpening`, `LiveStreams/Open`) needs its own decision record before `live-source` stops being a refusal.
