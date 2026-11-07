# Review checklist

## Invariants (ARCHITECTURE.md §4)

- I1: Can any path cause server transcoding or remuxing?
- I1: Are all direct-play flags false in both body and query?
- I1: Is the DeviceProfile sent, with no transcoding profiles?
- I1: Are BluRay, DVD, ISO, non-File, and `TranscodingUrl` sources rejected?
- I2: Does only a `Static=true` original-file URL reach the player?
- I3: Does the diff add a generic mpv command, property, or option path?
- I3: Does a new Tauri command have a typed request, tests, and a `docs/security.md` update?
- I4: Can a token, password, authenticated URL, or play-session ID reach a log, error, diagnostic, or URL?
- I5: Is the HTTPS-or-loopback rule intact?
- I6: Are subtitle URLs validated same-origin before authentication?
- I7: Can the browser engine run as a native fallback?
- I8: Does anything other than the gateway call Jellyfin?
- I9: Are mpv config, scripts, and default input bindings still disabled?

## Domain rules (DOMAINS.md)

- Does `src/domain/` import React, the SDK, Tauri, or HTTP code?
- Do views construct gateways or engines outside the composition root?
- Does Catalog code build media URLs or decide playability?
- Do remote commands bypass Playback Negotiation?
- Does `mpv.rs` touch windowing, or `surface/*` touch Jellyfin data?

## Playback session

- Can a stale attempt act after cancel, retry, or back?
- Is the start report sent only after the first frame?
- Is report order preserved, and is draining bounded?
- Does an error stop send `Failed: true`?
- Is each new playback session given a fresh PlaySessionId?

## Native

- Do renderer objects stay on the UI thread?
- Does every `unsafe` block have a `SAFETY:` comment?
- Does any `debug_assert!` contain a side effect?
- Can `unwrap`, slice casts, or `unwrap_or` panic on real input?

## Tests

- Does a test fail without the change?
- Were any tests skipped, deleted, or weakened?
- Do gateway tests assert body and query?
