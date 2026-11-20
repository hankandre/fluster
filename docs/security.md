# Security boundary

This is Octave's security design for the TV app: where the token is held, how requests leave the device, and how server addresses are trusted. Every claim names the test that proves it today, or the task that will add the test. **Tested** means a test on `main` proves it; **Planned (T…)** means the rule is binding but its test does not exist yet, and the named task adds it. Nothing below is stated as tested that is not.

The desktop app proved the same rules for libmpv with its own native tests. They live in the tag `desktop-tauri-final`; what each proved, and what a future libmpv engine must pass, is in [`docs/mpv-options-checklist.md`](mpv-options-checklist.md).

## 1. The token boundary

The access token is the one secret Octave holds. Jellyscale requires it on every media request, so it travels on every request, always in the `Authorization: MediaBrowser … Token="…"` header and never anywhere else. [Decision 0005](decisions/0005-token-boundary.md) (accepted 2026-11-20) sets where it lives on Android: **native memory only. The token never enters JavaScript.**

### Where the token is, and who does HTTP

- **On Android the token is held only by the native session module's session registry and its encrypted store.** It never enters JavaScript. The core holds an opaque session id: 128 random bits made by Kotlin at sign-in or restore, not derived from the token, meaningless to the server. The id may appear in props; it is kept out of logs by habit.
- **Kotlin sends every request.** The core decides catalog requests (path, query, body) and parses their responses; Kotlin adds the header and sends them through the one client (§2). Kotlin alone sends and parses the two sign-in calls (`POST /Users/AuthenticateByName`, `POST /Users/AuthenticateWithQuickConnect`); their responses never reach JavaScript. Before sign-in, `GET /System/Info/Public` and the Quick Connect initiate and poll calls go through the same transport with the tokenless header, to a fixed list of paths.
- **What crosses at sign-in:** the password or the Quick Connect secret, once, from JavaScript to Kotlin, as an argument of `signIn`; Kotlin does not keep it after the call returns. The DeviceId is derived in the core and passed in; it is not a secret.
- **Token echoes are removed.** Jellyfin echoes the token in some response bodies (an external subtitle `DeliveryUrl` with `ApiKey=…`, a `TranscodingUrl` with `ApiKey=`). Before any body crosses to JavaScript, Kotlin replaces every occurrence of the session's token value, as written and percent-encoded, with a fixed marker. The filter is by value, so it does not depend on which routes echo it.
- **On the desktop and in Node** (tests and the tripwire) the core's `JellyfinGateway` still holds the token as a private field, the reference transport for T2-04 and T2-09. That path never runs on the TV.

### The native session surface

Four methods and one event, in a session module of their own that shares the registry with the player module. Adding a method or an event is an architecture change that needs a decision record.

| Method | Takes | Returns |
|---|---|---|
| `signIn` | origin, DeviceId, and a password credential or a Quick Connect secret | `{ session, userId, userName, serverId }` or an error code |
| `request` | a session id (or, for the fixed pre-sign-in paths, an origin), a method (`GET`, `POST`, `DELETE`), a server path, query pairs, a JSON body, a timeout | `{ status, body }` or an error code |
| `restoreSessions` | nothing | a list of `{ session, origin, userId, userName, serverId }` |
| `endSession` | a session id | nothing; always succeeds locally |

Event: `sessionEnded { session, reason }`, where `reason` is a fixed code (`revoked`, `store-unreadable`).

`request` is not a general HTTP bridge: it accepts no header and no absolute URL (the path must start with `/` and resolves against the session's origin); it sends through the one client; a 3xx or a status of 0 is an error, never followed; any URL with a credential parameter or the token value is refused; errors are codes, and no error, result or event carries a header, a URL or a play-session id.

### The session registry and authority

The registry maps a session id to its origin, header and token, and nothing outside the module's HTTP package can read an entry. It holds more than one session. The player's launch request carries a session id and token-free URLs (T2-05, T8-01); the image view takes an item id, image type, tag, size and session id (T3-11). Both ask the registry for the client and never see the header. A recreated activity or a restarted JavaScript runtime calls `restoreSessions` and gets the same ids back while the process lives.

### The stored credential

A token is persisted only as one encrypted record per session, written and read only by Kotlin: AES-256-GCM under a key generated in the Android Keystore (the key never enters the app process), stored under `getNoBackupFilesDir()`, which Auto Backup always excludes. The key needs no user authentication (a TV has no screen lock to rely on). Users stay signed in by default. A record is removed in three ways:

- **Sign-out.** `endSession` removes the registry entry and deletes the record first, then sends `POST /Sessions/Logout` with the token held in a local variable. A failed or refused logout is reported as a code and changes nothing locally.
- **A confirmed 401.** When an authenticated request gets 401, Kotlin sends `GET /Users/Me`; if that is also 401 it ends the session as sign-out does, without the logout call, stops any player using it, and emits `sessionEnded` with `revoked`. One 401 alone does not sign the viewer out.
- **An unreadable record** (the key is gone, the ciphertext fails its tag) is deleted and reported as `store-unreadable`.

### Development builds

In a debug variant the debugger and the dev-launcher network inspector can read the header. Rule (owner, 2026-11-20): **a development build signs in only to a development server**, never to a server holding a real library. A release build contains no inspector wiring.

### Residual risk

Code running inside the app process, or root, can read the token: same-process Kotlin memory is not a boundary against it. Decision 0005 protects against accidents, JavaScript state, logs, and third-party JavaScript. A crash reporter, over-the-air JavaScript updates, or any third-party runtime code would reopen the decision.

### Claims and their tests

| Claim | Status |
|---|---|
| The core's gateway holds the token only as a private field, clears it on logout, and exposes the header value only through `authorizationHeader()` (the Node and reference path) | Tested: `src/lib/jellyfin/gateway.test.ts` |
| A playback plan is token-free: it holds only token-free stream and subtitle URLs and never the header | Tested: `src/lib/jellyfin/gateway.test.ts` ("keeps same-origin external subtitle URLs token-free", "strips every server credential parameter from subtitle URLs") |
| A gateway error (401, 5xx, network, timeout) carries no token, config, or request object | Tested: `src/lib/jellyfin/error-strip.test.ts` |
| `redactText` and the URL redactors remove tokens, `ApiKey`, `api_key`, `access_token`, passwords, and play-session ids from every string that can reach a log, error, or diagnostic | Tested: `src/lib/redact.test.ts`, `src/lib/redact-canary.test.ts` |
| Copy diagnostics holds no server name, address, user name, token, or play-session id | Tested: `src/lib/diagnostics.test.ts`, `src/lib/redact-canary.test.ts` |
| No function argument, result, error, event payload, or view prop across the seam carries the token, raw, percent-encoded up to four rounds, or base64, through sign-in, browse, artwork, playback, a 401 and sign-out | Planned: `seam_canary_token_never_crosses` (T3-05, T10-02) |
| The serialized gateway, session store, Query cache, navigation state, and every thrown error hold no token | Planned: `javascript_state_holds_no_canary` (T2-04, T3-05) |
| Logcat and the JavaScript console hold no token, no `Token="`, and no play-session id; no log call in the HTTP and session packages takes a request, header, or URL; no `HttpLoggingInterceptor` | Planned: `logcat_and_console_hold_no_canary` (T3-03, T3-05) |
| The sign-in response stays in Kotlin, and an echoed token is removed from response bodies | Planned: `sign_in_result_has_no_token_field`, `an_echoed_token_is_removed_from_response_bodies` (T3-05, T4-03) |
| `request` refuses headers, absolute URLs, and other origins | Planned: `request_refuses_headers_absolute_urls_and_other_origins` (T3-05) |
| No URL carries the token or a credential parameter | Planned: `no_url_carries_the_token` (T3-03, T3-05) |
| The stored credential is ciphertext: no file in the app's data directory holds the token | Planned: `stored_credential_is_ciphertext` (T4-05) |
| Sign-out clears memory and the store even when logout fails; a confirmed 401 ends the session; an unreadable record means signed out | Planned: `sign_out_clears_memory_and_store_even_when_logout_fails`, `a_confirmed_401_ends_the_session`, `an_unreadable_record_means_signed_out` (T4-05) |
| Kotlin builds the same header as the TypeScript reference transport, byte for byte | Planned: `kotlin_header_matches_the_recorded_vector` (T2-04, T3-05) |
| The release APK contains no dev-launcher network inspector wiring | Planned: `release_build_has_no_inspector` (T3-01) |
| Every request to Jellyscale, catalog and sign-in included, carries the header; every request after the fixed pre-sign-in paths carries a token; no redirect is followed; no other origin is contacted | Planned: the Jellyscale wire test (T3-05, T10-01) |
| Non-secret preferences are rebuilt from an allowlist of validated fields, so they never hold a token, URL, or play-session id | Tested for the port: `src/lib/preference-store.test.ts`; the TV store is planned (T9-02) |

## 2. The network boundary

Every request the app sends goes to the signed-in server's origin, with the header, through code that refuses redirects and proxies.

| Claim | Status |
|---|---|
| The core's gateway follows no redirect: a 3xx answer and an opaque redirect with status 0 are both errors on every call, playstate reports and logout included, and the error tells the viewer to enter the final address | Tested: `src/lib/jellyfin/gateway-redirects.test.ts` |
| On a host with no native transport (Node), `redirect: "manual"` is set in one place, the core's transport adapter | Today in the gateway's client set-up (`src/lib/jellyfin/gateway.ts`); the transport port: Planned (T2-04) |
| One OkHttp client carries every server request: sign-in, catalog, artwork, media, playlists, segments, subtitles | Planned (T3-03, T3-05) |
| Its interceptor adds the header only when the request's scheme, host, and port equal the session's origin; a request to any other origin fails before it is sent; no cookie is stored or sent | Planned (T3-03, MockWebServer tests with a second server standing in for the other origin) |
| `followRedirects` and `followSslRedirects` are off: a 3xx is an error and the redirect target receives nothing | Planned (T3-03) |
| No proxy is used, whatever the system or environment says | Planned (T3-03) |
| A URL with user info or a credential query parameter is refused | Tested in the core: `src/lib/jellyfin/gateway.test.ts`, `src/lib/jellyfin/hls-url.test.ts`; natively Planned (T3-03) |
| The header value is accepted natively only as a `MediaBrowser` value with a token, at most 4 KB, with no control character, is never logged, and its debug form is redacted | Planned (T3-03) |
| The build fails on Media3's `DefaultHttpDataSource`, `DefaultDataSource.Factory`, or default media source factory without Octave's data source, on another `OkHttpClient`, on `HttpURLConnection`, on an ExoPlayer without Octave's media source factory, and on TypeScript passing headers or a token to an image, video, or fetch call outside the transport adapter | Planned (T3-04) |
| Images are requested natively by item, type, tag, size, and session id; React passes no URL, header, or token | Planned (T3-11) |
| The wire test records every request the app makes against the pinned Jellyscale and fails on a request without the header after sign-in, a credential parameter in any URL, a followed redirect, or another origin; a playback task passes only when its wire test passes | Planned (T3-05 adds `pnpm tv:wire`; T10-01 makes it one required job) |

### Converted streams

| Claim | Status |
|---|---|
| A `TranscodingUrl` is never used as given: Playback Negotiation rebuilds it on the server's origin, with the exact `master.m3u8` path for the item, one `MediaSourceId`, a matching `PlaySessionId`, no credential parameter, `EnableTrickplay=false`, and no subtitle rendition | Tested: `src/lib/jellyfin/hls-url.test.ts`, `src/lib/jellyfin/conversion-negotiation.test.ts` |
| The rebuilt URLs from the recorded conversions are shared vectors every native validator must accept, and each one-step change to them must be refused | Tested for TypeScript: `src/lib/jellyfin/hls-master-url-vectors.test.ts`; Kotlin Planned (T8-08) |
| Media3 reads playlists only through Octave's parser hook, which refuses the whole playlist unless every URI is HTTP(S) on the server's origin with no user info, fragment, or credential parameter; a body that names a credential parameter or holds the token (also percent-encoded) fails closed; `EXT-X-DEFINE`, live playlists, subtitle renditions, and trickplay are refused | Planned (T8-08), against every vector in `tests/fixtures/hls-playlists.json` |
| Playlists and segments are fetched only through the one client, and a segment redirect is not followed | Planned (T8-08) |
| A cross-origin variant, segment, map, or key URI ends in the unsafe-stream refusal and the other origin receives nothing | Planned (T8-08) |
| `DELETE /Videos/ActiveEncodings` carries `deviceId` and `playSessionId` in its query; neither is a credential, and both stay out of logs, errors, and diagnostics | Tested: `src/lib/player/playstate-reporter.test.ts`, `src/lib/redact.test.ts` |

## 3. Server addresses (decision 0001 on Android)

[Decision 0001](decisions/0001-private-lan-http.md) holds unchanged: HTTPS is accepted for every host; plain HTTP depends on the literal host after WHATWG parsing, never a DNS answer.

- Loopback (`localhost`, `127.0.0.0/8`, `::1`) needs no confirmation. Private LAN (`10/8`, `172.16/12`, `192.168/16`, `169.254/16`, `fc00::/7`, `fe80::/10`, `*.local`, `*.home.arpa`) needs a one-time confirmation per server `Id` and origin. Every other host, including CGNAT `100.64/10`, is public and refused for plain HTTP before any request. IPv4-mapped IPv6 takes the class of the embedded IPv4 address. A name with an internationalized (`xn--`) label is public for plain HTTP. URLs containing user information are refused. Tested: `src/domain/host-class.test.ts` against `tests/fixtures/host-classes.json`.
- The gateway refuses a public `http://` URL before an HTTP client exists. For a private-LAN `http://` server it sends only the unauthenticated `GET /System/Info/Public` probe, then refuses password and Quick Connect sign-in until the viewer has confirmed the warning for that server `Id` at that exact origin. Tested: `src/lib/jellyfin/gateway.test.ts`.
- The confirmation record holds only the server `Id` and origin, never a token. The `Id` is public, so the confirmation is not proof of identity (decision 0001, accepted residual risk). The port is `src/lib/lan-http-confirmations.ts`; the TV store is Planned (T4-02).
- **Cleartext on Android.** Android's network security configuration cannot express CIDR ranges or `*.local` for IP literals, so the app allows cleartext app-wide and the host classifier is the enforcement point: the core refuses a public `http://` address before the transport is called (tested above), and the native client refuses it again before any request, with a Kotlin classifier that passes `tests/fixtures/host-classes.json`. Planned (T3-01 sets the configuration; T3-03 adds the native refusal and its tests).
- After the viewer confirms, the password, access token, and media cross the LAN unencrypted. The warning says so.
- A host classifier that sees a non-ASCII host fails closed, because Expo's URL implementation has partial IDNA. Planned (T2-06), against both shared URL files.

### LAN discovery

Discovery (T4-01) sends one fixed datagram, `who is JellyfinServer?`, with no token, device id, or user data, to the IPv4 broadcast address on UDP 7359, and reads for a fixed time. Every reply is untrusted: oversized or malformed replies are dropped, names are stripped of control and bidirectional characters and capped, and a reply is listed only when its `Address` passes the host-class rule. Choosing one runs the normal probe, which must report the discovered `Id`, and then the confirmation. The `Id` is public, so a spoofed reply can copy it; the sign-in screens show the exact origin for every sign-in, typed or discovered. Planned (T4-01).

## 4. Player boundary

| Claim | Status |
|---|---|
| The player module exposes only the `PlayerEngine` port's methods (initialize, launch, pause, seek, select track, stop); a test fails when one is added without updating the allowlist and this document | Planned (T2-05, T8-01) |
| A launch takes only the typed request union (original file or HLS session) with token-free URLs and a session id; it takes no header, token, or free-form option | Planned (T2-05, T8-01) |
| Player events map one to one to the core's events; errors are codes with no URL, path, or player text | Planned (T8-01) |
| A native view hosts the video; React passes it no URL | Planned (T8-01) |
| libmpv, when it arrives, plays original files only, never HLS, and passes every item of the mpv checklist | Planned (T13-02) |

## 5. What is not protected

- Anyone on a confirmed private LAN can read plain-HTTP traffic, token included (decision 0001).
- A device that holds a confirmed LAN address and port on another network and presents a copied server `Id` inherits the confirmation (decision 0001, decision 7).
- A spoofed discovery reply can relay Quick Connect; the visible origin is the only cue.
- Code inside the app process, or root, can read the token (§1).

Persisted state is limited to the encrypted credential records (§1, T4-05), the preferences record, and the LAN confirmations. Playback positions, track choices, and play-session ids are not persisted. Authentication secrets must never be added to Query caches, analytics, crash payloads, or diagnostic exports. Octave has no analytics and no third-party services.
