# Review checklist

## Invariants (ARCHITECTURE.md §4)

- I1: Can any path convert a source that an engine on this device can play under the direct-play rules?
- I1: Is every DirectStream or Transcode shown with its reason?
- I1: Are the PlaybackInfo flags the same in body and query, and is the DeviceProfile sent without codec or container conditions?
- I1: Do BluRay, DVD, and ISO sources never direct play? Does the device-cannot-play request send direct play and stream copy off, and never a third request?
- I2: Is every player URL a `Static=true` URL or a rebuilt same-origin `master.m3u8` with no credential and `EnableTrickplay=false`? Is every playlist validated before the player reads it?
- I3: Does the diff add a generic player command, property, option, or header path, or a native method without its allowlist and `docs/security.md` update?
- I4: Can a token, password, authenticated URL, or play-session ID reach a URL, prop, event, log, error, or diagnostic?
- I5: Is the host-class rule intact (public `http://` refused before any request, private-LAN `http://` only after confirmation)? Can any request follow a redirect, use a proxy, or reach another origin? Is `redirect: "manual"` still set in one place?
- I6: Are subtitle URLs validated same-origin before authentication?
- I7: Can any path play or load an image without the header (a web video element, Media3's default data sources, another HTTP client)?
- I8: Does anything other than the gateway call the server, or anything other than the engine port drive the player?
- I9: Can an engine load user configuration, scripts, or plugins, or follow a reference inside downloaded content?

## Domain rules (DOMAINS.md)

- Does `src/domain/` import React, React Native, Expo, the SDK, or HTTP code?
- Does the core import a platform API instead of taking a port?
- Do screens construct gateways, transports, or engines outside the composition root?
- Does Catalog code build media URLs or decide playability?
- Do remote commands bypass Playback Negotiation?

## Playback session

- Can a stale attempt act after cancel, retry, or Back?
- Is the start report sent only after the first frame?
- Is report order preserved, and is draining bounded?
- Does an error stop send `Failed: true`?
- Is each new playback session given a fresh PlaySessionId?

## Native

- Does every native request go through the one OkHttp client?
- Does the header reach only the signed-in origin, and is it never logged?
- Do Kotlin errors cross to JavaScript only as typed codes?

## Dependencies

- Does the diff adopt a dependency without a recorded maintenance check from primary sources?

## Tests

- Does a test fail without the change?
- Were any tests skipped, deleted, or weakened?
- Do gateway tests assert body and query?
