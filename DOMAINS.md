# Domains

Octave's bounded contexts: what each owns, the language it uses, where its code lives, and which way dependencies may point. Use this to decide where new code goes and to scope agent tasks. A task that touches more than two domains probably needs a plan (`WORKFLOW.md`). Every task in `tasks/prd.json` names one of these domains.

Paths: **Today** is where the code is on `main`. **Target** is where it moves: `packages/core` (done in T2-02), `apps/tv` (T3-01), `modules/player` (T8-01), and the native HTTP module (T3-03). A target path does not exist until its task lands.

## Map

```text
                          ┌──────────────────────────────┐
                          │  App Shell & Presentation     │  (screens, navigation, focus, remote keys)
                          └──────┬──────────┬────────────┘
                                 │          │
          ┌──────────────────────▼─┐   ┌────▼────────────────────────┐
          │ Server Connection &     │   │ Catalog                     │
          │ Identity                │   │                             │
          └──────────┬──────────────┘   └────┬────────────────────────┘
                     │ session                │ item to play
                     │                ┌───────▼─────────────────────┐
                     └───────────────►│ Playback Negotiation  (CORE)│
                                      └───────┬─────────────────────┘
                                              │ PlaybackPlan
                                      ┌───────▼─────────────────────┐
                                      │ Playback Session            │──► Playstate Reporting
                                      └───────┬─────────────────────┘
                                              │ PlayerEngine port
                                      ┌───────▼─────────────────────┐
                                      │ Player Engine  (CORE)        │  Media3 now, libmpv later
                                      └─────────────────────────────┘
   Realtime & Remote Control (later) ──► feeds Catalog (UserDataChanged) and Playback Session (remote Play)
   Distribution ── builds, signs and ships the TV app
   Cross-cutting: Security & Redaction · Diagnostics · Performance · Device lab
   Repository: Process · Workflow
```

**Classification:**

- **Core** (where Octave differs from every other client): Playback Negotiation, Player Engine, Security & Redaction.
- **Supporting:** Playback Session, Playstate Reporting, Server Connection & Identity, Catalog, App Shell & Presentation.
- **Generic:** Distribution, Realtime, Performance, Device lab, Process, Workflow.

Spend the most rigor (Opus or Fable, plans, adversarial review) on the core.

---

## 1. Server Connection & Identity

**Purpose.** Know which server we talk to, as whom, and what that server supports.

**Owns:** server URL normalization, the host-class plain-HTTP policy and the private-LAN confirmation; LAN discovery; the public server info probe and feature gating; Quick Connect (code and QR) and password sign-in; the stable DeviceId; the access token lifecycle (hold, validate via `/Users/Me`, revoke via `/Sessions/Logout`); the credential store; saved accounts and "Who's watching?"; the account's language settings.

**Language.** Server, ServerId, User, Account, Session, DeviceId, Access token, Quick Connect code, Server capabilities.

**Today.** `JellyfinGateway.connect/login`, `normalizeServerUrl`, `saveAccountLanguages` in `packages/core/src/jellyfin/gateway.ts`; `packages/core/src/domain/host-class.ts`, `packages/core/src/domain/server-connection.ts`, `packages/core/src/domain/server-discovery.ts` (the discovery port), `packages/core/src/domain/sign-in-failure.ts`; `packages/core/src/jellyfin/device-id.ts` (the DeviceId derivation, through the Crypto port in `packages/core/src/ports/crypto.ts`); the confirmation port in `packages/core/src/lan-http-confirmations.ts`; the Transport port in `packages/core/src/ports/transport.ts`, its reference adapter `packages/core/src/adapters/fetch-transport.ts`, and the header builder `packages/core/src/jellyfin/authorization-header.ts` (T2-04).

**Target.** `packages/core` for the rules and the gateway; the sign-in screens in `apps/tv`; the native session module (sign-in, the session registry, `request`; T3-03, T3-05), discovery (T4-01), and the Keystore credential store (T4-05) as native code behind core ports.

**Rules.**
- The token is held only in native memory and its encrypted Keystore record (decision 0005); the core holds an opaque session id. Kotlin alone performs sign-in.
- Saved servers are keyed by `ServerId`, not URL.

---

## 2. Catalog

**Purpose.** Let the viewer find something to watch.

**Owns:** libraries (UserViews); browse queries, the remembered sort, the letter rail, filters, and search as you type; Home's rows (Continue watching merging in-progress items and next episodes, then one Recently added row) and the Up next hero pick (`packages/core/src/domain/up-next.ts`); the series, season and episode hierarchy; item detail and versions as display data; image requests by item, type, tag and size; user data (played, favorite, resume position).

**Language.** Library (UserView), Item, Movie, Series, Season, Episode, Collection, Card, Row, Rail, Resume position, Played, Favorite, Image tag.

**Today.** `JellyfinGateway` catalog calls, `packages/core/src/jellyfin/cards.ts`, `packages/core/src/jellyfin/item-detail.ts`, `packages/core/src/domain/catalog.ts`, `packages/core/src/domain/up-next.ts`, `packages/core/src/domain/subtitle-list.ts`, `packages/core/src/domain/languages.ts`, `packages/core/src/domain/media-format.ts`.

**Target.** `packages/core` for queries and rules; Home, library, search, and detail screens in `apps/tv`; the native image view (T3-11).

**Rules.**
- Catalog code never builds stream URLs or decides playability. It hands an `itemId` (and optionally a `mediaSourceId`) to Playback Negotiation.
- Request only the fields a view needs (`ARCHITECTURE.md` §3).
- Images never take a URL, header, or token from React; only an item id, type, tag, and size.

---

## 3. Playback Negotiation — core

**Purpose.** Turn "play this item" into a `PlaybackPlan` that uses the original file whenever an engine on this device can, and a server conversion only when it must ([decision 0002](docs/decisions/0002-server-transcoding-fallback.md)), or a typed refusal.

**Owns:** `PLAYBACK_POLICY`; the Octave DeviceProfile; the PlaybackInfo request (flags in body and query) and the streaming limit; the device capability list as the source decision reads it (T2-07); the source decision (DirectPlay, DirectStream, Transcode, Refuse); refusal and conversion reasons and their copy; static stream URL construction and HLS URL rebuilding; external subtitle validation; the PlaySessionId; the start position.

**Language.** Direct play, Direct stream, Transcode, Remux, Play method, Conversion reason, Device capabilities, Streaming limit, Media source, Version, Device profile, Play session, Playback plan, Refusal reason, Start choice, Ticks.

**Today.** `PLAYBACK_POLICY`, `PlaybackPlan`, `resumeChoice` in `packages/core/src/domain/playback.ts`; `packages/core/src/domain/conversion-copy.ts`; `PLAYBACK_INFO_FLAGS`, `buildStaticStreamUrl`, `createPlaybackPlan` in `gateway.ts`; `decideSource`, `selectSource`, `decideForcedConversion` in `source-acceptance.ts`; `devicePlayability` in `packages/core/src/domain/device-capabilities.ts`; the `DeviceCapabilitySource` port on `JellyfinGateway`; `rebuildMasterUrl` in `hls-url.ts`; `OCTAVE_PROFILE` in `device-profile.ts`.

**Target.** `packages/core`; the native re-check of master URLs and playlists lives with the Player Engine (T8-08) and passes the same shared vectors.

**Rules.**
- No other domain may construct a media URL, use a `TranscodingUrl`, or bypass the source decision.
- Remote `Play` commands go through this domain exactly like a local press.
- Every rule change needs an Opus- or Fable-level review and a fixture-backed test.

---

## 4. Playback Session

**Purpose.** Run one viewing from negotiation to teardown, including retry and what happens next.

**Owns:** playback attempts and cancellation; launch, first-frame, and end handling; retry; stop and Back; the session state reducer; next-episode auto-play, intro and credits skip from media segments, trickplay data; renegotiation for track and limit changes; stopping server conversions before a new play session for the same item.

**Language.** Attempt, Operation, First frame, End reason (eof / stopped / quit / error), Retry, Up next, Segment (intro / outro / recap).

**Today.** `PlaybackCoordinator` (`packages/core/src/player/coordinator.ts`), `playbackSessionReducer` (`packages/core/src/player/session-state.ts`), `packages/core/src/player/session-failure.ts`, `packages/core/src/domain/track-choice.ts`, `packages/core/src/domain/media-segments.ts`.

**Target.** `packages/core` (done in T2-02); the player screen in `modules/player` (T8-01) and `apps/tv` (T3-01).

**Rules.**
- Talks to the player only through the `PlayerEngine` port.
- Talks to the server only through a narrow gateway interface (`PlaybackGateway`).

---

## 5. Playstate Reporting

**Purpose.** Keep the server's idea of what we're watching accurate, without ever blocking playback.

**Owns:** start, progress, and stopped reports; the ordered queue; bounded draining; tick conversion; `PlayMethod` from the plan; `Failed: true` on error stops.

**Language.** Report, Progress interval, Drain, PositionTicks.

**Today.** `PlaystateReporter` in `packages/core/src/player/playstate-reporter.ts`, `packages/core/src/player/confirm-play-method.ts`, `JellyfinGateway.report*`.

**Target.** `packages/core` (done in T2-02).

**Rules.**
- Reporting failures become warnings, never playback errors.
- Order is preserved.
- Reports are sent only after the first frame.

---

## 6. Player Engine — core

**Purpose.** Decode and present media on the device and report what is really happening.

**Owns:** the `PlayerEngine` port and `PlayerEvent` stream; the device capability report; the player module's fixed methods; Media3 with Octave's media source factory and HLS parser hook; libmpv for originals only (T13); the native video view; track listing and Jellyfin index mapping; decode diagnostics.

**Language.** Engine, Launch request (original file or HLS session), Capabilities (complete or failed), Player error code, Snapshot, Player track (player id vs. Jellyfin index), Decode mode, First frame.

**Today.** The port lives in `packages/core/src/domain/player-engine.ts` (re-exported by `domain/playback.ts`); the coordinator's tests use the port-only fake `packages/core/src/player/fake-player-engine.ts`. There is no engine on `main`.

**Target.** `modules/player` (T8-01; Kotlin behind an interface a Swift implementation can mirror).

**Rules.**
- No generic command, property, option, or header bridge.
- Adding a method or event means updating the allowlist test and `docs/security.md`.
- An engine never receives a token or header from JavaScript; the launch request names a session id and the engine asks the native session registry for the client (decision 0005).
- No engine plays what cannot carry the header; libmpv never plays HLS.

---

## 7. Realtime & Remote Control (later)

**Purpose.** React to server-side changes and let a phone control the TV.

**Owns:** the `/socket` connection and keepalive; capabilities registration; message routing (`UserDataChanged` to Catalog; `Play`, `Playstate`, `GeneralCommand` to Playback Session).

**Today.** The `RealtimeConnection` port in `packages/core/src/domain/realtime.ts`; no adapter.

**Target.** A native socket adapter behind the port (T12-06); the socket carries the header, never a token in its URL.

**Rules.**
- Inbound commands are translated into existing use cases. They never get a privileged path around Playback Negotiation.

---

## 8. App Shell & Presentation

**Purpose.** Everything the viewer sees and touches that isn't the video itself.

**Owns:** navigation (the collapsed side rail); screens; focus, the D-pad, select, Back, and held keys; the design tokens and shared controls; dialogs and toasts; the non-secret preferences store (`packages/core/src/preference-store.ts` port, `packages/core/src/streaming-limits.ts`).

**Today.** Only the preference and streaming-limit ports, and the plain-copy helpers (`packages/core/src/safe-reason.ts`, `packages/core/src/transport-error.ts`, `packages/core/src/diagnostics.ts`).

**Target.** `apps/tv` (T3-01), with the tokens and base controls from T3-06 and the shell from T3-09.

**Rules.**
- Screens call application use cases. They do not instantiate gateways, transports, or engines; the composition root builds them.
- Every screen works with the D-pad, select, and Back alone (`DESIGN.md`).

---

## 9. Distribution

**Purpose.** Ship a signed, verifiable TV app.

**Owns:** the release build and its Baseline Profile; the Play bundle with 16 KB page alignment; signing; licences, notices, and the source offer (GPL-3.0); the Play TV track.

**Today.** Nothing on `main`.

**Target.** `apps/tv` build configuration and the release workflows of phase T11.

---

## Cross-cutting

| Concern | Owns | Today | Target |
|---|---|---|---|
| **Security & Redaction** | Token boundary, the one authenticated client, URL and playlist validation, redaction, canary tests | `packages/core/src/redact.ts`, `packages/core/src/safe-reason.ts`, `packages/core/src/transport-error.ts`, `packages/core/src/domain/host-class.ts`, `packages/core/src/conformance/`, `packages/core/tests/fixtures/`, `docs/security.md` | `packages/core`, the native HTTP module (T3-03), `modules/player` (T8-08) |
| **Diagnostics** | The player's info sheet, decoder labels, exportable diagnostics that pass redaction | `packages/core/src/diagnostics.ts` | `apps/tv` (T3-01) and `modules/player` (T8-01) |
| **Performance** | The budget (cold start, key to focus, janky frames, memory), Baseline Profile, image loading | n/a | T3-12, T3-13, T3-14 |
| **Device lab** | The Shield and the cheap box, on-device checks | n/a | T0-06, the Shield checks |

**Process** and **Workflow** own the repository itself: the rule files, `tasks/`, `.claude/`, CI, and the checks in `scripts/`.

---

## Dependency rules

TypeScript layers. Arrows point in the only allowed import direction:

```text
screens (apps/tv) ──► application (use cases, coordinator, reducers) ──► domain (pure)
            │                              │
            │                              └──► ports (interfaces only: Transport, PlayerEngine, PlaybackGateway, stores)
            └──► composition root only: may construct adapters
adapters (gateway transport, native modules) ──► domain, ports
```

1. **`domain/` imports nothing** outside itself: no React, React Native, Expo, SDK, or HTTP client.
2. **The core imports no platform:** nothing from React, React Native, Expo, a native module, or a browser or desktop API. It takes what it needs through ports.
3. **Adapters never import screens or application code.**
4. **Only the composition root** constructs the gateway, the transport, and engines. Screens receive use cases through props or context.
5. **Only Playback Negotiation constructs media URLs.**
6. **Native side:** every request goes through the one OkHttp client; the token stays in the session registry; the player module never touches Jellyfin data other than its typed launch request.

`pnpm lint:boundaries` (dependency-cruiser, `.dependency-cruiser.cjs`) enforces rules 1, 2, 3 and no circular imports on `packages/core/src` (T2-02): the domain may import nothing outside `domain/`, installed or not; a core file, tests included, imports only core code, the core's test fixtures and its declared npm packages (an allowlist), so React, React Native, Expo and native modules cannot reach it; and no core source file may import a Node builtin. ESLint forbids the browser globals in the core, and forbids timers, the wall clock, `crypto` and `Math.random` outside `packages/core/src/adapters/`; dependency-cruiser forbids importing `adapters/` from non-test core code (T2-03); ESLint also forbids `fetch` and `XMLHttpRequest` outside `adapters/` (T2-04). T3-04 adds the native checks.

## Ubiquitous language

| Term | Meaning |
|---|---|
| **Direct play** | Streaming the original file byte for byte (`Static=true`) and decoding it on the device. The preferred mode. |
| **Remux / Direct stream** | The server repackages streams into HLS segments without re-encoding. Allowed only when direct play is impossible, and always shown. |
| **Transcode** | The server re-encodes video or audio, or burns in subtitles. Allowed only when direct play is impossible, and always shown with its reason. |
| **Play method** | `DirectPlay`, `DirectStream`, or `Transcode`: the method a plan uses |
| **Conversion reason** | The server's `TranscodeReasons`, or the client-side "this device cannot play the original", shown in the player |
| **Device capabilities** | What the engines on this device can decode and output, reported by the engine and read by the source decision; never written into the DeviceProfile |
| **Streaming limit** | The viewer's maximum streaming bitrate, with a local and a remote value, sent as `MaxStreamingBitrate` |
| **Media source** | One playable version of an item (`MediaSourceInfo`) |
| **Refusal reason** | A typed explanation for why no media source can be played or converted |
| **Playback plan** | The output of negotiation: play method, token-free stream URL, conversion reasons, media source, play session, start position, tracks |
| **Play session** | The server-issued `PlaySessionId` for one negotiation. Retry creates a new one. |
| **Attempt** | One coordinator run from negotiation to teardown. Stale attempts are discarded. |
| **Start choice** | Resume from the saved position, or start over |
| **Ticks** | Jellyfin time unit; 10,000,000 per second |
| **Jellyfin index vs. player id** | A Jellyfin `MediaStream.Index` (external streams numbered first) vs. the engine's track id. Mapping between them belongs to Player Engine. |
| **Wire test** | A test that records every request the app makes against a pinned server and fails on a request without the header, a credential in a URL, a followed redirect, or another origin (T3-05, T10-01) |
| **First frame** | The moment video is actually presented. Gates the start report and the UI's ready state. |
