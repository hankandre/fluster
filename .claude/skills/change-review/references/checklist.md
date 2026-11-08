# Review checklist

## Invariants (ARCHITECTURE.md §4)

- I1: Can any path convert a source that passes the direct-play rules?
- I1: Is every DirectStream or Transcode shown with its reason?
- I1: Are the PlaybackInfo flags the same in body and query, and is the DeviceProfile sent without codec conditions?
- I1: Do BluRay, DVD, and ISO sources never direct play?
- I2: Is every player URL a `Static=true` URL or a rebuilt same-origin `master.m3u8` with no credential and `EnableTrickplay=false`?
- I3: Does the diff add a generic mpv command, property, or option path?
- I3: Does a new Tauri command have a typed request, tests, and a `docs/security.md` update?
- I4: Can a token, password, authenticated URL, or play-session ID reach a log, error, diagnostic, or URL?
- I5: Is the host-class rule intact (public `http://` refused before any request, private-LAN `http://` only after confirmation, no followed redirects)?
- I6: Are subtitle URLs validated same-origin before authentication?
- I7: Can the browser engine run as a native fallback?
- I8: Does anything other than the gateway call Jellyfin?
- I9: Are mpv config, scripts, and default input bindings still disabled?

## Domain rules (DOMAINS.md)

- Does `src/domain/` import React, the SDK, Tauri, or HTTP code?
- Do views construct gateways or engines outside the composition root?
- Does Catalog code build media URLs or decide playability?
- Do remote commands bypass Playback Negotiation?
- Does `player/` touch windowing, or `surface/*` touch Jellyfin data?

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
