# 0005: Where the access token lives on Android TV and how it crosses to native code

- Status: **Accepted** by the owner on 2026-11-20: **native memory only** (Kotlin owns the token and does all server HTTP; JavaScript holds an opaque session handle); the token **may be persisted** encrypted under an Android Keystore key, readable only by native code, and users **stay signed in by default**; **development builds sign in only to development servers**. The new native session surface (signIn, request, restoreSessions, endSession, one event) is accepted as part of this decision.
- Date: 2026-11-20
- Task: T2-01 (the TV task list on branch `docs/tv-prd`, commit `c2c224b`).
- Follows: decision 0003 ("Decision (accepted)" items 3 and 6) and decision 0004 (branch `docs/decision-0004`, commit `931bc39`).
- Changes, if accepted as recommended: decision 0003's Finding 3 table row "Where the token lives and who does HTTP" ("JS (core) with a native transport") and its security note "The token stays in the core's memory as on desktop". 0003 item 6 ("every native request … goes through one authenticated OkHttp client") is kept and extended to sign-in and catalog requests.
- Touches: the `AGENTS.md` hard rules on tokens, `docs/security.md`, `ARCHITECTURE.md` §3 ("Token storage"), and tasks T2-04, T2-05, T3-11, T4-05 and T8-01.
- Evidence: the play falsifier (`spike/tv-play/RESULTS.md` on branch `spike/tv-play-falsifier`, commit `af75d28`), the code named below, and the primary sources listed at the end, all read on 2026-11-20. **[unverified]** marks a claim no source or measurement backs. **[judgment]** marks an estimate.

## The question

Jellyscale answers 401 to every media request without a token, so on Android TV the header must reach four kinds of request: sign-in and catalog calls, the player's stream and playlist requests, subtitles, and artwork. Three things are undecided:

1. Which memory holds the token: Hermes (JavaScript), Kotlin, or both.
2. How the player and the image loader are allowed to send the header when the rule is that a token never appears in a URL, a prop, an event or a log.
3. How the token survives a restart, given the hard rule "Never log, persist, or display tokens".

## What exists today

**Desktop.** The token is a private field of `JellyfinGateway` (`src/lib/jellyfin/gateway.ts` line 211, set in `startSession` at line 373). `authorizationHeader()` (line 392) is the only accessor. It is read in `src/app/session.tsx`, `src/features/player/use-playback-session.ts` and `src/lib/player/coordinator.ts`, to hand the header to Rust for the socket and for `launch_playback`. `docs/security.md` line 3 says: "Jellyfin access tokens are session-only fields inside `JellyfinGateway`". Nothing is persisted.

**The play falsifier.** It did not build "native memory only". It built **JavaScript owns the token and Kotlin holds a copy**:

- The unchanged core signs in through `expo/fetch`. The AuthenticateByName response, `AccessToken` included, is parsed in Hermes (`gateway.ts` `startSession`).
- The spike's transport adds the header to each catalog request itself (`spike/tv-play/src/expo-fetch-transport.ts`, `send`).
- JavaScript then calls `startSession(origin, authorization)` once per JavaScript start, and Kotlin keeps the header for the player (`OctavePlayerModule.kt`, `AuthenticatedHttp.kt`). The view takes only a token-free URL as a prop.
- The recording proxy passed every assertion on the Shield and the emulator: the header on every request, no credential in any URL, no redirect followed, a tokenless control answered 401 (RESULTS.md, "Verdict").

Decision 0003's table says the same thing ("JS (core) with a native transport; persisted token in Keystore/Keychain via native code"). The pivot review's correction stands: "native memory only" described neither the design nor the spike.

Four facts about that shape, read from source:

- **Two HTTP clients.** `expo/fetch` builds its own OkHttp client from React Native's `OkHttpClientProvider` (`ExpoFetchModule.kt` lines 26-32, expo 58.0.23). It is not the module's `AuthenticatedHttp.client`. It has no origin pin and no check for a credential in a URL; those guards exist only in TypeScript for catalog requests. The draft rule "send every native request (artwork, playlists, segments, media, subtitles, sign-in) through the one authenticated OkHttp client" is therefore not true of it.
- **Cookies are on by default.** `expo/fetch` defaults `credentials` to `include` (`fetch.ts` line 77; `NativeRequestInit.kt`) and wires a cookie jar. The spike transport never sets `omit`.
- **Redirects.** `redirect: "manual"` becomes `followRedirects(false)` and `followSslRedirects(false)` (`NativeRequest.kt` lines 44-47); the spike's probes confirmed it.
- **Errors.** The fixed messages in `FetchExceptions.kt` carry no URL or header. `FetchError` wraps the native message as `fetch failed: …` (`FetchErrors.ts`); what OkHttp puts in an `IOException` message for a failed connection was not read **[unverified]**. URLs are token-free in any case.

## Options

- **A. JavaScript owns the token; Kotlin holds a copy.** What the spike built. The core keeps the token and builds the header. Catalog and sign-in HTTP stay on `expo/fetch`. Kotlin gets the header through one typed call.
- **B. Kotlin only, with the gateway rewritten in Kotlin.** Sign-in, catalog calls and their parsing move to Kotlin. JavaScript receives view models.
- **C. Kotlin owns the token; the core holds an opaque session handle.** The core keeps every rule it has today (requests, parsing, negotiation, reporting) but sends its HTTP through a narrow transport in the native module. Kotlin adds the header. The token never enters Hermes.

**How these map to T2-01's wording.** T2-01 asks the record to choose between "the TypeScript core's memory, native memory only, or both".

- "The TypeScript core's memory" alone cannot exist on Android. Media3 and the image loader send their requests from Kotlin, so Kotlin must hold the header whenever JavaScript does.
- **A is "both"**: the token is in Hermes and in Kotlin.
- **B and C are both "native memory only"**: JavaScript never sees the token and Kotlin sends all HTTP. They differ in where the gateway's logic lives. The handle in C is not the token and gives no access outside the app.

So the recommendation below, C, is **native memory only**.

B is rejected without a table row of its own. It discards the core that decision 0003 kept and the play falsifier proved under Hermes, and it buys nothing C does not.

### Against the rule: never in a URL, a prop, an event or a log

| | A: JavaScript owns, Kotlin copies | C: Kotlin owns, JavaScript holds a handle |
|---|---|---|
| URL | Never. The core builds token-free URLs; the Kotlin interceptor refuses a URL that carries the token or a credential parameter. Proven on the wire. | The same, and the interceptor now also covers catalog and sign-in requests. |
| React prop | Never, by convention: views take a token-free URL. | Never, by construction: no JavaScript value contains it. |
| Event | Never, by convention: Kotlin must not echo the header. | Never, by construction on the JavaScript side; Kotlin still must not emit it. |
| Log | Rests on redaction and tests in both languages. | Rests on tests in Kotlin only; JavaScript has nothing to log. |
| Crossings of the JavaScript and native seam | Three: the header on every `expo/fetch` request, the `startSession` argument, and, once persistence exists, the stored token coming back to JavaScript at every start. | None for the token. The password or Quick Connect secret crosses once at sign-in, in every option. |

### Against the Hermes and JavaScript surface

| Surface | A | C |
|---|---|---|
| Hermes debugger and Metro (development builds) | The token is a heap value any debugger session can read. | Not in the heap. |
| Expo network inspector (development builds) | Header and response bodies up to 1 MB go to the debugger. | **The same.** The dev-launcher plugin patches `OkHttpClient.Builder.build()` for every class in a debug variant, so the native client is inspected too (`DevLauncherPlugin.kt`, `InstrumentationScope.ALL`, `isDebugVariant`). |
| React DevTools | Shows props, state and hooks. The gateway object must never sit in any of them. | Nothing to show. |
| Error stringification, `console.log` of an object | A dumped gateway or request init prints the token. Redaction and a canary test guard it. | Nothing to print. |
| A crash reporter added later | Could capture breadcrumbs or locals that hold it **[unverified for any specific reporter]**. None is installed. | Could not, from JavaScript. |
| `expo/fetch` request objects | Hold the header for the life of each request. | Not used for authenticated requests. |
| A hostile or buggy npm dependency in the bundle | Can read a long-lived bearer token and send it anywhere `expo/fetch` reaches. | Can use the session while the app runs, through a client pinned to one origin. Cannot extract the token. |
| Code execution inside the app process, a rooted device | Token readable. | Token readable. Same process: Kotlin memory is not a security boundary against this. |
| The password | In JavaScript while the user types it. | The same. |

What this shows:

- **In a development build the options are equal.** The header is visible to the debugger either way. Whether development builds may sign in to a real server is a rule for the owner to set (decision 5 below).
- **Against a compromised process the options are equal.**
- **C's gain is in release builds against accidents and against JavaScript that Octave did not write.** It turns four conventions (prop, event, log, object dump) into things that cannot happen from JavaScript, and it downgrades a dependency compromise from "steals a durable credential" to "can act while the app is open".
- **C's second gain is one client.** Every request that carries the header passes one interceptor with one origin pin, one credential-in-URL refusal and one redirect rule. Under A, catalog requests have none of those natively.

### Cost

| | A | C |
|---|---|---|
| Proven on the wire | Yes, Shield and emulator. | The native client is proven for stream requests. Sign-in and catalog through it are not yet. |
| Core changes | None beyond T2-04 as written. | The gateway stops holding `accessToken` and loses `authorizationHeader()` (three callers). Sign-in goes through a port. T2-04 has not started, so this is a change of direction, not a rewrite. |
| Native code | `startSession` and `endSession`. | A transport, a session registry, sign-in, and the store: roughly 400 to 600 lines of Kotlin and their tests, about 2 to 4 days **[judgment]**. |
| New native methods (each one an architecture change) | 2 | 4 and one event (below). |
| Apple TV later | `expo/fetch` runs on tvOS (Expo's platform list); whether `redirect: "manual"` holds there is **[unverified]**. | The same transport must be written in Swift. A native authenticated client is needed there for the player and artwork anyway. |
| Persistence | The stored token returns to JavaScript at every start. | Kotlin reads its own store. T4-05 already says "by native code". |
| Core tests under Node | Unchanged. | A TypeScript transport that holds a test token stands in for Kotlin. The header builder T2-04 asks for lives there and is checked against the same recorded vector as Kotlin's. |

## Recommendation

**Option C: native memory only, with the core kept and holding an opaque session handle. Confidence: medium, about 60 %.**

- The rule the owner wants ("never in a URL, prop, event or log") becomes one stronger sentence that a test can check with no exemptions: **the token never enters JavaScript.**
- It makes "one authenticated client" true, which the draft rules already assume.
- Persistence forces the question now. Once the token is stored, A has Kotlin hand it back to JavaScript at every start, and the honest rule the pivot review asked for ("native never returns it") stops being true.
- It is cheapest now. T2-04, T2-05, T3-11, T4-05 and T8-01 are all still `todo`.

Why not higher:

- It protects against accidents and third-party JavaScript, not against a compromised process. If the owner judges those risks small for a single-user TV app with no crash reporter and no remote code, A with the hardening below is defensible and is the proven path.
- It adds native surface, which the owner is wary of ("overhead that we don't need"), and the same surface again in Swift.
- Catalog and sign-in over the native transport have not run against Jellyscale.
- "Never enters JavaScript" rests on one filter, not only on construction: Jellyfin echoes the token inside some response bodies, and Kotlin must remove it before the body crosses (see "The seam").

**What would change this to A:** the transport cannot stay narrow (it starts to need headers, absolute URLs or streaming bodies); or the catalog wire run through it fails for a reason that is not a quick fix; or the owner rules that same-process isolation is not worth 2 to 4 days.

### If the owner chooses A instead

These become requirements, because the spike left them open:

1. The core's transport sets `credentials: "omit"`; a test shows no cookie is stored or sent.
2. `startSession(origin, authorization)` returns an opaque session id, and `endSession(id)` exists. The header crosses from JavaScript to Kotlin once per JavaScript start. Kotlin never returns it.
3. The stored token is the one thing Kotlin hands back to JavaScript, through one named function, at start.
4. The token field is a true private field, and no object that holds it is ever put in React state, context, a navigation parameter or a Query cache.
5. The canary test exempts exactly three crossings (the `expo/fetch` request header, the `startSession` argument, the restore result) and scans everything else.
6. The rule "every request through the one authenticated client" is reworded: catalog and sign-in requests use `expo/fetch`, guarded by the core.

## The design under C

### Who does what

- **Sign-in HTTP: Kotlin.** `POST /Users/AuthenticateByName` and `POST /Users/AuthenticateWithQuickConnect` are sent and parsed by the module. It keeps `AccessToken` and returns only a session id, the user id, the user name and the server id. **The sign-in response never reaches JavaScript.**
- **Catalog HTTP: the core decides, Kotlin sends.** The core builds every request (path, query, body) and parses every response, as today. Kotlin adds the header and returns status and body.
- **Before sign-in.** `GET /System/Info/Public` and the Quick Connect initiate and poll calls go through the same transport with the tokenless `MediaBrowser` header, to a fixed list of paths.
- **The password and the Quick Connect secret** cross from JavaScript to Kotlin once, as arguments of the sign-in call, and are not kept after it returns.
- **DeviceId** is still derived in the core (`SHA-256(installId:serverId:username)`, `ARCHITECTURE.md` §3) and passed in. It is not a secret.
- **Decision 0001** is unchanged: the core still refuses a public plain-HTTP server and asks for consent on a private LAN before sign-in. Kotlin re-checks the host class against `tests/fixtures/host-classes.json`, as Rust did.

### The seam

Four methods and one event. Each is an architecture change that this record asks the owner to approve; the exact shapes belong to the task specs. They belong in a session module of their own that shares the registry with the player module, so that `modules/player` keeps "exactly the PlayerEngine port's" methods (T8-01).

| Method | Takes | Returns |
|---|---|---|
| `signIn` | origin, DeviceId, and a password credential or a Quick Connect secret | `{ session, userId, userName, serverId }` or an error code |
| `request` | a session id (or, for the fixed pre-sign-in paths, an origin), a method (`GET`, `POST`, `DELETE`), a server path, query pairs, a JSON body, a timeout | `{ status, body }` or an error code |
| `restoreSessions` | nothing | a list of `{ session, origin, userId, userName, serverId }` |
| `endSession` | a session id | nothing; always succeeds locally |

Event: `sessionEnded { session, reason }`, where `reason` is a fixed code (`revoked`, `store-unreadable`).

`request` is deliberately not a general HTTP bridge:

- It accepts no header and no absolute URL. The path must start with `/` and is resolved against the session's origin.
- It sends through the one client: redirects off, no proxy, no cookies, any other origin refused, any URL with a credential parameter or the token value refused.
- A 3xx or a status of 0 is returned as an error, never followed.
- **Jellyfin echoes the token in some bodies, and Kotlin removes it.** An external subtitle `DeliveryUrl` in a PlaybackInfo response arrives as `…/Stream.{fmt}?ApiKey=…` (`ARCHITECTURE.md` §3), and a `TranscodingUrl` carries `&ApiKey={token}` (decision 0002, Q1). Before a body crosses to JavaScript, Kotlin replaces every occurrence of the session's token value, as written and percent-encoded, with a fixed marker. The core already strips credential parameters by name, so it needs no change. Which other routes echo the token, and whether Jellyscale ever does, is **[unverified]**; the filter is by value, so it does not depend on the answer.
- Cancellation (the core's `AbortSignal`) and the timeout are part of the call; how a cancel crosses is for the task spec.
- Errors are codes. No error, result or event carries a header, a URL or a play-session id.

### How the player and the image loader get authority

Through a **session registry** inside the module, keyed by the opaque session id.

- The id is 128 random bits made by Kotlin at sign-in or restore. It is not derived from the token and means nothing to the server.
- The registry maps the id to the origin, the header and the token. Nothing outside the module's HTTP package can read the entry.
- The player's launch request carries the session id and token-free URLs (T2-05, T8-01). The image view takes an item id, an image type, a tag and a size (T3-11), and the session id. Both ask the registry for the client; neither sees the header.
- The id may appear in props. It is kept out of logs by habit, not by rule.
- A registry holds more than one session, so signing in to a second server needs no change to the seam. The spike's client refused a second origin; that restriction goes.
- The hand-over is **per sign-in or restore**, not per launch and not per JavaScript start: a recreated activity or a restarted JavaScript runtime calls `restoreSessions` and gets the same ids back while the process lives.

### Persisting across launches

This is an **exception to the hard rule "Never log, persist, or display tokens"**, and the owner grants it or not.

- **Where.** One encrypted record per session, written and read only by Kotlin: AES-256-GCM under a key generated in the Android Keystore, which keeps the key out of the app process ("Key material never enters the application process", Android Keystore docs). The record lives under `getNoBackupFilesDir()`, which Auto Backup always excludes, so no backup rule is needed.
- **No user authentication on the key.** A TV has no screen lock to rely on **[judgment]**. The key protects the record at rest against a copy of the app's files; it does not protect against the app's own process.
- **Not `androidx.security:security-crypto`.** Its release notes for 1.1.0-alpha07 and 1.1.0-beta01 say: "Deprecated all APIs in favour of existing platform APIs and direct use of Android Keystore". 1.1.0 is the current stable release.
- **Not expo-secure-store under C.** It passes the maintenance rule: 58.0.3 is current on npm, the package had commits on 2026-10-28 and 2026-11-13, `expo/expo` is not archived, and its README has no deprecation or maintenance-mode note. It stores values in SharedPreferences encrypted with a Keystore key and excludes them from Auto Backup. But its API returns the value to JavaScript (`getItemAsync(): Promise<string | null>`), which is the crossing C removes. It is the right store under A. Expo's platform list for it names Android, iOS and tvOS and does not name Android TV, and it has not run on the Shield **[unverified on Android TV]**.
- **Sign-out.** `endSession` removes the registry entry and deletes the stored record first, then sends `POST /Sessions/Logout` with the token it still holds in a local variable. A failed or refused logout is reported as a code and changes nothing locally.
- **Revoked on the server** (the device deleted, the password changed). When an authenticated request gets 401, Kotlin sends `GET /Users/Me`. If that is also 401, it ends the session as sign-out does, without the logout call, stops any player using it, and emits `sessionEnded` with `revoked`. One 401 alone does not sign the user out.
- **An unreadable record** (the key is gone, the ciphertext fails its tag) is deleted and reported as `store-unreadable`. The user signs in again.
- **Uninstall** removes the app's files. That the Keystore key is removed with the app is **[unverified]** here; an orphaned key decrypts nothing.
- **Whether a Shield's Keystore key is hardware-backed** was not checked **[unverified]**. The design does not depend on it.

## Tests that prove the boundary

Each test has a negative control: a planted leak must make it fail, as the repository's existing canaries do. Names are proposals for the task specs.

| Test | What it proves | Negative control |
|---|---|---|
| `seam_canary_token_never_crosses` (instrumented, emulator) | A mock server issues a canary token. The run signs in, browses, loads artwork, launches playback, takes a 401 and signs out. A test-build recorder around the module sees every function argument, result, rejected error, event payload and view prop, in both directions, and finds no canary: raw, percent-encoded up to four rounds, or base64. | A test-only function that returns the header. |
| `javascript_state_holds_no_canary` (core and app, Node) | After the same flow against a fake transport, the serialized gateway, session store, Query cache, navigation state and every thrown error contain no canary. | A gateway field that keeps the token. |
| `logcat_and_console_hold_no_canary` (emulator) | The app's logcat and the captured JavaScript console contain no canary, no `Token="`, and no play-session id. A source tripwire fails on a log call in the HTTP and session packages that takes a request, header or URL, and on `HttpLoggingInterceptor`. | A planted `Log.i` of the header. |
| Jellyscale wire test (the play falsifier's recording proxy, extended) | Every request, catalog and sign-in included, carries `Authorization: MediaBrowser …`; every request except the fixed pre-sign-in paths carries a token; no redirect is followed; no other origin is contacted; a tokenless control request gets 401. | The proxy strips the header from one request; a 302 to a canary origin. |
| `no_url_carries_the_token` (proxy and unit) | The proxy scans every request URL, decoded up to four rounds, for the token value and each credential parameter name. A unit test shows the interceptor refuses such a URL before it leaves the device. | A request with `api_key` and one with the token in its path. |
| `sign_in_result_has_no_token_field` and `an_echoed_token_is_removed_from_response_bodies` | The sign-in response stays in Kotlin. A PlaybackInfo body whose subtitle `DeliveryUrl` and `TranscodingUrl` carry the token, as written and percent-encoded, reaches JavaScript without it. | The filter switched off. |
| `request_refuses_headers_absolute_urls_and_other_origins` | The transport stays narrow. | Each refused shape. |
| `stored_credential_is_ciphertext` (emulator) | After sign-in, no file in the app's data directory (shared preferences, files, databases, React Native storage) contains the canary. | A plain write of the token. |
| `sign_out_clears_memory_and_store_even_when_logout_fails`, `a_confirmed_401_ends_the_session`, `an_unreadable_record_means_signed_out` | The sign-out and revoke rules above. | A logout that returns 500; a single 401 that must not sign out. |
| `kotlin_header_matches_the_recorded_vector` | Kotlin and the TypeScript reference transport build the same header, byte for byte, from the fixture T2-04 records. | A changed quote or encoding. |
| `release_build_has_no_inspector` (build check) | The release APK contains no dev-launcher network inspector wiring. | A debug variant. |

## security.md changes to apply

**Not written into `docs/security.md` in this branch.** The file on `main` describes only the Tauri and mpv app, T1-07 rewrites it whole for the TV app, and T2-01 depends on T1-07. Editing the desktop text now would conflict with that rewrite. T2-01's last acceptance item ("`docs/security.md` is updated to match in the same PR") is therefore **not met by this branch**.

The two tasks are circular: T1-07 must state "where the token is held", which is this decision, and T2-01 waits for T1-07. The owner or the Product Owner picks the order. The simplest is to accept this record first and let T1-07 write the list below as part of its rewrite, with T2-01 closing in that pull request.

1. Replace "Jellyfin access tokens are session-only fields inside `JellyfinGateway`" with: on Android the token is held only by the native module's session registry and its encrypted store; it never enters JavaScript; the core holds an opaque session id.
2. State which code does HTTP: Kotlin sends every request; the core decides catalog requests and parses their responses; Kotlin alone sends and parses the two sign-in calls.
3. State what crosses the seam at sign-in: the password or Quick Connect secret, once, as a call argument.
4. Describe the four methods and the event, the `request` restrictions, and that adding a method or event needs a decision.
5. Describe the session registry and that the player and image views name a session by id.
6. Describe the store: Keystore key, AES-GCM, the no-backup directory, no user authentication, and the three ways a record is removed (sign-out, confirmed 401, unreadable).
7. Reword the persistence rule: a token is persisted only as that encrypted record, by native code.
8. State the development-build exposure: the debugger and the network inspector can read the header in a debug variant. Add the rule the owner sets for it.
9. State the residual risk: code running inside the app process, or root, can read the token; same-process Kotlin memory is not a boundary against it.
10. List each test above against the claim it proves, marked as planned until it exists (T1-07, acceptance 4).

Related wording outside `docs/security.md`, for the same pull request or the Product Owner:

- `AGENTS.md`: "Never log, persist, or display tokens" gains the store exception; "decision 0005 (T2-01) decides where it is held" becomes the rule itself; "Set `redirect: "manual"` in one place, the core's transport adapter" applies only to a host with no native transport.
- `ARCHITECTURE.md` §3, "Token storage": replace "Session-only today…" for Android.
- Tasks, which only the owner or the Product Owner may reword: T2-04 (on Android the header is built in Kotlin; the core's builder serves the reference transport), T3-11 (the image view also takes a session id), T8-01 (the method allowlist includes the four methods here).

## What the owner decides

1. **C or A.** Recommended: C.
2. **The persistence exception.** May a token be stored, encrypted under a Keystore key, by native code only? T4-05 assumes yes.
3. **Staying signed in: on by default, or opt-in?** `ARCHITECTURE.md` §3 proposed opt-in for desktop. Recommended for TV: on by default, because typing a password with a remote is the cost of the alternative, with sign-out one step away.
4. **The four methods and one event** as new native surface.
5. **Development builds.** The debugger and the network inspector can read the header in a debug variant under either option. Recommended rule: a development build signs in only to a development server, never to a server holding a real library.

## Revisit if

- A crash reporter, over-the-air JavaScript updates or any third-party runtime code is proposed. Under A that is a new reader of the token; under C it is not.
- The `request` method needs a header, an absolute URL or a streaming body.
- Apple TV work starts: the Swift transport is the same decision made again.

## Sources (all read 2026-11-20)

- Repository: `src/lib/jellyfin/gateway.ts`, `docs/security.md`, `ARCHITECTURE.md` §3, `AGENTS.md`; `spike/tv-play/RESULTS.md`, `src/expo-fetch-transport.ts`, `AuthenticatedHttp.kt` and `OctavePlayerModule.kt` on branch `spike/tv-play-falsifier` (`af75d28`).
- expo 58.0.23, from the spike's `node_modules`: `android/src/main/java/expo/modules/fetch/ExpoFetchModule.kt`, `NativeRequest.kt`, `NativeRequestInit.kt`, `FetchExceptions.kt`; `src/winter/fetch/fetch.ts`, `FetchErrors.ts`.
- expo-modules-core, same install: `kotlin/devtools/ExpoNetworkInspectOkHttpInterceptors.kt` (request and response capture, 1 MB body limit), `cdp/CdpNetworkTypes.kt` (headers are sent).
- `expo/expo`, branch `sdk-58` (`e88ec73b49`): `packages/expo-dev-launcher/expo-dev-launcher-gradle-plugin/…/DevLauncherPlugin.kt` and `packages/expo-network-addons/expo-network-addons-gradle-plugin/…/NetworkAddonsPlugin.kt`. Neither package was installed in the spike, so the inspector's behaviour in an Octave debug build is read from source, not observed.
- expo-secure-store 58.0.3 (npm tarball): `SecureStoreModule.kt`, `encryptors/AESEncryptor.kt`, `res/xml/secure_store_backup_rules.xml`, `build/SecureStore.d.ts`, `CHANGELOG.md`, `README.md`; npm registry metadata; `expo/expo` commit list for `packages/expo-secure-store`; <https://docs.expo.dev/versions/latest/sdk/securestore/>.
- Android: <https://developer.android.com/privacy-and-security/keystore> ("Extraction prevention"); <https://developer.android.com/identity/data/autobackup> ("Files that are backed up"); <https://developer.android.com/jetpack/androidx/releases/security> (security-crypto 1.1.0-alpha07, 1.1.0-beta01 and 1.1.0).
- Expo: <https://docs.expo.dev/versions/latest/sdk/expo/> (the `expo` package's platform list; the page does not describe redirect handling).

This record contains no address, serial, token or play-session id.
