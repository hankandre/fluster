# Play falsifier: results

Throwaway spike for decision 0003 (`docs/decisions/0003-tv-and-mobile-shell.md`, "Decision (accepted)"
items 6 and 8): can a React Native TV app hand playback to a Kotlin Media3 module that direct-plays an
HDR10 file from Jellyscale, with the Authorization header on every request and no credential in any URL?
Never to be merged.

<!-- VERDICT -->

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

<!-- RUNS -->
