---
name: native-player
description: Change Octave's native code: the player module (Media3 now, libmpv later), the one authenticated OkHttp client, the native image view, Expo native modules, or the PlayerEngine port. Use for any Kotlin edit under modules/ or apps/tv/android.
---

# Native player

## Before editing

- Use Opus.
- Read `ARCHITECTURE.md` §2–3, `DOMAINS.md` §6, and `docs/security.md`.
- Read decision 0005: the token lives only in Kotlin's session registry and its Keystore record; JavaScript holds an opaque session id.
- Outline the target file before reading it; read only the symbols you need.
- Verify any new dependency against the maintenance rule from primary sources first.

## Network and sessions

- Keep the session surface to `signIn`, `request`, `restoreSessions`, `endSession`, and the `sessionEnded` event; a new method or event needs a decision record.
- Never return the token, the header, or the sign-in response to JavaScript; strip the session's token value (as written and percent-encoded) from every body before it crosses.
- Keep `request` narrow: no header, no absolute URL, a path resolved against the session's origin.
- Persist a token only as the AES-GCM record under an Android Keystore key in the no-backup directory.

- Send every request through the one OkHttp client; never construct another client or use `HttpURLConnection`.
- Never use `DefaultHttpDataSource`, `DefaultDataSource.Factory`, or an ExoPlayer built without Octave's media source factory.
- Add the header only in the client's interceptor, and only for the signed-in server's scheme, host, and port; refuse every other origin before sending.
- Keep `followRedirects` and `followSslRedirects` off and the proxy off.
- Refuse URLs with user info or a credential parameter.
- Never log the header or the token; redact its debug form.

## Player

- Expose only the `PlayerEngine` port's methods; follow `references/adding-a-method.md` to change them.
- Take a launch only as the typed request union with a session id; never a header, token, or free-form option.
- Read HLS playlists only through Octave's parser hook, which must pass every vector in `tests/fixtures/hls-playlists.json` and re-check the master URL against `tests/fixtures/hls-master-urls.json`.
- Never let libmpv play HLS; pass every item of `docs/mpv-options-checklist.md` before libmpv ships.
- Send errors to JavaScript as typed codes, never player text, URLs, or paths.
- Keep Kotlin behind interfaces a Swift implementation can mirror; name no engine in TypeScript.

## Verify

- Run `pnpm tv:native:test` (T3-01) and `pnpm check` after each change.
- Run the task's wire test against the pinned Jellyscale (`pnpm tv:wire`, T3-05) for any change that sends a request.
- Report the decoder the device actually used before claiming hardware decoding.
- List every device, Android version, and server you did not test.
- Keep this work serial; never run it in parallel with other native or on-device work.
