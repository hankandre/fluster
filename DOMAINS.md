# Domains

Fluster's bounded contexts: what each owns, the language it uses, where its code lives, and which way dependencies may point. Use this to decide where new code goes and to scope agent tasks. A task that touches more than two domains probably needs a plan (`WORKFLOW.md`).

## Map

```text
                          ┌──────────────────────────────┐
                          │  App Shell & Presentation     │  (UI features, navigation, input)
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
                                      │ Player Engine               │──► Video Surface & Window
                                      └─────────────────────────────┘
   Realtime & Remote Control (M5) ──► feeds Catalog (UserDataChanged) and Playback Session (remote Play/Playstate)
   Distribution ── packages everything; owns the native runtime closure
   Cross-cutting: Security & Redaction · Diagnostics
```

**Classification:**

- **Core** (where Fluster differs from every other client): Playback Negotiation, Player Engine, Video Surface & Window.
- **Supporting:** Playback Session, Playstate Reporting, Server Connection & Identity, Catalog, App Shell.
- **Generic:** Distribution, Realtime.

Spend the most rigor (Opus, plans, adversarial review) on the core.

---

## 1. Server Connection & Identity

**Purpose.** Know which server we talk to, as whom, and what that server supports.

**Owns:**
- server URL normalization, the host-class plain-HTTP policy, and the private-LAN confirmation
- LAN discovery
- the public server info probe and version/feature gating
- password and Quick Connect sign-in
- the stable DeviceId
- the access token lifecycle (hold, validate via `/Users/Me`, revoke via `/Sessions/Logout`)
- the optional credential vault (M1)

**Language.** Server, ServerId, User, Session, DeviceId, Access token, Quick Connect code, Server capabilities.

**Code today.** `JellyfinGateway.connect/login`, `normalizeServerUrl`, `createSdkApi` in `src/lib/jellyfin/gateway.ts`; the sign-in UI in `src/features/sign-in/`.

**Rules.**
- The token is held only by the gateway (and later by the Rust-owned vault). It is never in React state, Query caches, or WebView storage.
- Saved servers are keyed by `ServerId`, not URL.

---

## 2. Catalog

**Purpose.** Let the user find something to watch.

**Owns:**
- libraries (UserViews)
- browse queries, sorting, filters, and search
- home rows (Continue Watching, Next Up, Latest)
- music libraries: artists, albums, and tracks (P11)
- the series → season → episode hierarchy
- item detail and multiple versions as *display* data
- image URL construction and caching by tag
- user data (played, favorite, resume position) and refresh on `UserDataChanged`

**Language.** Library (UserView), Item, Movie, Series, Season, Episode, Collection, Card, Row, Resume position, Played, Favorite, Image tag.

**Code today.** `JellyfinGateway.latest`, the `LibraryItem` type in `src/domain/catalog.ts`, and the home and browse views in `src/features/home/` and `src/features/browse/`.

**Rules.**
- Catalog code never builds stream URLs or decides playability. It hands an `itemId` (and optionally a `mediaSourceId`) to Playback Negotiation.
- Request only the fields a view needs (see `ARCHITECTURE.md` §3).

---

## 3. Playback Negotiation — core

**Purpose.** Turn "play this item" into a `PlaybackPlan` that uses the original file whenever possible and a server conversion only when it must ([decision 0002](docs/decisions/0002-server-transcoding-fallback.md)), or a typed refusal. This is where the product's defining rule lives.

**Owns:**
- `PLAYBACK_POLICY`
- the Fluster DeviceProfile
- the PlaybackInfo request (flags in body and query) and the streaming limit it sends
- the source decision function (DirectPlay, DirectStream, Transcode, Refuse)
- refusal reasons and conversion reasons
- static stream URL construction and HLS URL rebuilding (credentials stripped, `EnableTrickplay=false`)
- external subtitle validation
- the PlaySessionId
- start position (`PlaybackStartChoice`)

**Language.** Direct play, Direct stream, Transcode, Remux, Play method, Conversion reason, Streaming limit, Media source, Version, Device profile, Play session, Playback plan, Refusal reason, Start choice (resume / start over), Ticks.

**Code today.**
- `PLAYBACK_POLICY`, `PlaybackPlan`, `resumeChoice` in `src/domain/playback.ts`
- `DIRECT_PLAY_REQUEST`, `selectDirectFileSource`, `buildStaticStreamUrl`, `createPlaybackPlan` in `gateway.ts`
- Rust `validate_playback_urls` in `src-tauri/src/player/network.rs`

**Rules.**
- No other domain may construct a media URL, use a `TranscodingUrl`, or bypass the source decision.
- Remote-control `Play` commands (M5) go through this domain exactly like a local click.
- Every rule change needs an Opus-level review and a fixture-backed test (`WORKFLOW.md`).

---

## 4. Playback Session

**Purpose.** Run one viewing from negotiation to teardown, including retry and what happens next.

**Owns:**
- playback attempts and cancellation
- launch, first-frame, and end handling
- retry (a fresh plan and play session)
- stop and back
- the UI-facing session state reducer
- later: next-episode auto-play, intro/credits skip using media segments, trickplay scrubbing data
- stopping server conversions (`DELETE /Videos/ActiveEncodings`) before a new play session for the same item
- the play queue for music (P11)

**Language.** Attempt, Operation, First frame, End reason (eof / stopped / quit / error), Retry, Up next, Segment (intro / outro / recap).

**Code today.** `PlaybackCoordinator` (`src/lib/player/coordinator.ts`), `playbackSessionReducer` (`src/lib/player/session-state.ts`), the player wiring in `src/features/player/use-playback-session.ts`.

**Rules.**
- Talks to the player only through the `PlayerEngine` port.
- Talks to the server only through a narrow gateway interface (`PlaybackGateway`).

---

## 5. Playstate Reporting

**Purpose.** Keep the server's idea of what we're watching accurate, without ever blocking playback.

**Owns:**
- start, progress, and stopped reports
- the ordered report queue
- bounded draining on stop or close
- tick conversion
- `PlayMethod` from the plan (`DirectPlay`, `DirectStream`, or `Transcode`)
- `Failed: true` on error stops

**Language.** Report, Progress interval, Drain, PositionTicks.

**Code today.** `PlaystateReporter` in `src/lib/player/playstate-reporter.ts` (ordered queue, progress timer, bounded drain), driven by `PlaybackCoordinator`; `JellyfinGateway.report*`.

**Rules.**
- Reporting failures become warnings, never playback errors.
- Order is preserved.
- Reports are sent only after the first frame.

---

## 6. Player Engine — core

**Purpose.** Decode and present media locally and report what is really happening.

**Owns:**
- the `PlayerEngine` port and `PlayerEvent` stream
- the native mpv adapter (`NativePlayerEngine` → Tauri commands → `MpvController`)
- the dev-only `BrowserPlayerEngine`
- the fixed command surface
- track listing and **Jellyfin ↔ mpv track mapping**
- decode diagnostics (hardware/software, hwdec, codec, dropped frames)
- the libmpv version gate
- snapshot coalescing

**Language.** Engine, Snapshot, Player track (playerId vs. jellyfinIndex), Decode mode, hwdec, Render API, First frame.

**Code today.**
- `src/lib/player/native-player.ts`, `src/lib/player/browser-player.ts`
- `src-tauri/src/player/` (controller, events, properties, track mapping, diagnostics), `src-tauri/src/model.rs`, `src-tauri/src/commands.rs`

**Rules.**
- No generic command bridge.
- Adding a command means updating the command allowlist test and `docs/security.md`.
- The browser engine is never a production fallback.
- mpv user config, scripts, and input bindings stay disabled.

---

## 7. Video Surface & Window — core

**Purpose.** Put decoded frames on screen under the UI on each platform.

**Owns:**
- platform surfaces (GTK GLArea on Wayland, NSOpenGLView on macOS, D3D11 on Windows planned, the Wayland subsurface + `gpu-next` HDR path planned)
- geometry sync from the DOM rectangle
- fullscreen
- UI-thread affinity of render contexts

**Language.** Surface, Surface frame, Scale factor, Composition, Render context.

**Code today.** `src/components/NativeVideoSurface.tsx`, `src-tauri/src/surface.rs`, `src-tauri/src/surface/{linux,macos}.rs`.

**Rules.**
- Renderer objects stay on the platform UI thread.
- Geometry updates are coalesced so that only the newest one is in flight.
- Work here is serial and needs real hardware validation (`WORKFLOW.md`).

---

## 8. Realtime & Remote Control (M5)

**Purpose.** React to server-side changes and let other Jellyfin clients control Fluster.

**Owns:**
- the `/socket` connection and keepalive
- capabilities registration
- message routing (`UserDataChanged` → Catalog; `Play`/`Playstate`/`GeneralCommand` → Playback Session)
- SyncPlay, later

**Code today.** `src-tauri/src/realtime.rs` (the `/socket` connection, keepalive, typed events), `src/lib/realtime/` (native and no-op adapters), the `RealtimeConnection` port in `src/domain/realtime.ts`, and socket lifecycle in `src/app/session.tsx`.

**Rules.**
- Inbound commands are translated into existing use cases. They never get a privileged path around Playback Negotiation.

---

## 9. App Shell & Presentation

**Purpose.** Everything the user sees and touches that isn't the video itself.

**Owns:**
- routing and navigation
- the feature views (sign-in, home, browse, detail, player chrome)
- the dialogs (resume / start over)
- the design system (Tailwind tokens, components)
- keyboard, remote, and focus navigation
- media keys (MPRIS, Now Playing, SMTC; these are wired natively but are presentation concerns)

**Code today.** `src/app/App.tsx` (hash routing), `src/features/` (the views), `src/components/PlayerView.tsx` (player shortcuts in `src/components/player-keymap.ts`), `src/features/roving-focus.ts` (arrow keys in card lists), `src/features/use-escape-key.ts`, `src/features/player/use-idle-cursor.ts`, `src/styles.css`. MPRIS: `src-tauri/src/media_controls.rs` (routing and state) and `src-tauri/src/media_controls/mpris.rs` (the D-Bus service, Linux only), with the stop request handled by `src/app/media-controls.ts` and `use-playback-session.ts`.

**Rules.**
- Media-control requests become existing player operations (pause, seek) or the Back path (stop). They never add a command or carry ids, URLs, or tokens.
- Views call application use cases. They do not instantiate gateways or engines (`src/app/compose.ts` builds them and hands them to views through context).

---

## 10. Distribution

**Purpose.** Ship a self-contained, verifiable build per platform.

**Owns:**
- AppImage and DMG builds
- the pinned libmpv/FFmpeg closure (`release/components.lock`)
- SBOM, provenance, notices, licenses
- extraction and launch tests
- CI release workflows

**Code today.** `release/`, `.github/workflows/release-appimage.yml`, `src-tauri/tauri.conf.json`.

---

## Cross-cutting

| Concern | Owns | Code |
|---|---|---|
| **Security & Redaction** | URL redaction (TS + Rust), credential-in-URL rejection, canary tests, CSP | `src/lib/redact.ts`, `src-tauri/src/redaction.rs`, `docs/security.md` |
| **Diagnostics** | Player information panel, decoder labels, exportable diagnostics (must pass redaction) | diagnostics in `src-tauri/src/player/diagnostics.rs` |

---

## Dependency rules

TypeScript layers. Arrows point in the only allowed import direction:

```text
ui (features, components) ──► application (use cases, coordinators, reducers) ──► domain (pure)
            │                              │
            │                              └──► ports (interfaces only: PlayerEngine, PlaybackGateway, CredentialVault)
            └──► composition root only: may construct adapters
adapters (jellyfin gateway, native/browser engines) ──► domain, ports
```

1. **`domain/` imports nothing** outside itself: no React, no SDK, no Tauri, no Axios.
2. **Adapters never import UI or application code.**
3. **Only the composition root** (`main.tsx` or a dedicated `app/compose.ts`) constructs `JellyfinGateway`, `NativePlayerEngine`, and `BrowserPlayerEngine`. Feature views receive use cases through props or context.
4. **Only Playback Negotiation constructs media URLs.**
5. **Rust side:**
   - `lib.rs` holds command registration only; `commands.rs` holds the thin handlers.
   - `player/` never touches platform windowing.
   - `surface/*` never touches Jellyfin data.
   - `redaction.rs` is used by every error path that can carry a URL.

These rules become an import-boundary lint (`WORKFLOW.md` → Mechanical enforcement backlog), so agents get a failing check instead of a review comment.

## Target layout

The core (domain, gateway, coordinator, native player, surfaces, redaction) moves here incrementally, one domain per PR, keeping its tests. The proof-of-concept UI is deleted (P3-16); all views live under `src/features/`.

```text
src/
  domain/            identity.ts · catalog.ts · playback.ts · tracks.ts   (pure types + rules)
  application/       sign-in.ts · catalog-queries.ts · playback-session.ts · playstate-reporter.ts · session-state.ts
  ports/             player-engine.ts · playback-gateway.ts · credential-vault.ts
  adapters/
    jellyfin/        gateway.ts · device-profile.ts · source-acceptance.ts · types.ts
    player/          native-player.ts · browser-player.ts
  features/
    sign-in/         SignInView.tsx · QuickConnect.tsx
    home/            HomeView.tsx
    browse/          LibraryView.tsx · SeriesView.tsx · SearchView.tsx
    detail/          ItemDetailView.tsx · ResumeDialog.tsx
    player/          PlayerView.tsx · NativeVideoSurface.tsx · PlayerInformation.tsx
  app/               App.tsx (routing only) · compose.ts (composition root)
src-tauri/src/
  lib.rs             command registration
  commands.rs        typed command handlers
  player/            controller.rs · events.rs · properties.rs · track_list.rs · tracks.rs · diagnostics.rs · network.rs · version.rs
  model.rs           command request/response types
  surface/           linux.rs · macos.rs · windows.rs (planned)
  security/          redaction.rs · url_policy.rs
  vault.rs           (M1, OS keyring)
```

`AGENTS.md`'s structure section should be updated as each move lands.

## Ubiquitous language

| Term | Meaning |
|---|---|
| **Direct play** | Streaming the original file byte-for-byte (`Static=true`) and decoding it locally. The preferred mode. |
| **Remux / Direct stream** | The server repackages streams into HLS segments without re-encoding. Allowed only when direct play is impossible, and always shown. |
| **Transcode** | The server re-encodes video or audio, or burns in subtitles. Allowed only when direct play is impossible, and always shown with its reason. |
| **Play method** | `DirectPlay`, `DirectStream`, or `Transcode`: the method a plan uses, shown in the player and reported to the server |
| **Conversion reason** | The server's `TranscodeReasons` for a DirectStream or Transcode plan, shown as "Converting on server: {reason}" |
| **Streaming limit** | The user's maximum streaming bitrate, with a local and a remote value, sent as `MaxStreamingBitrate` |
| **Media source** | One playable version of an item (`MediaSourceInfo`). An item can have several. |
| **Refusal reason** | A typed explanation for why no media source can be played or converted |
| **Playback plan** | The output of negotiation: play method, stream URL, conversion reasons, media source, play session, start position, tracks |
| **Play session** | The server-issued `PlaySessionId` for one negotiation. Retry creates a new one. |
| **Attempt** | One coordinator run from negotiation to teardown. Stale attempts are discarded. |
| **Start choice** | Resume from the saved position, or start over |
| **Ticks** | Jellyfin time unit; 10,000,000 per second |
| **Jellyfin index vs. player id** | A Jellyfin `MediaStream.Index` (external streams numbered first) vs. mpv's track `id`. Mapping between them belongs to Player Engine. |
| **Surface frame** | DOM rectangle + scale factor + visibility, sent to Rust to position video |
| **Decode mode** | `hardware` / `software` / `unknown`, from runtime mpv properties, never assumed |
| **First frame** | The moment video is actually presented. Gates the start report and the UI's "ready" state. |
