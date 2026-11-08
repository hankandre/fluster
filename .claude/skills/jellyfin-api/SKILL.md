---
name: jellyfin-api
description: Add or change Jellyfin server calls, playback negotiation, playstate reporting, or track mapping in Fluster. Use for any edit to src/lib/jellyfin/ or to PLAYBACK_POLICY.
---

# Jellyfin API

## Before editing

- Read `ARCHITECTURE.md` §3.
- Use Opus for negotiation, source acceptance, auth, or track mapping.
- Use Sonnet for catalog queries and images.

## Calls

- Add server calls only to `src/lib/jellyfin/gateway.ts`.
- Use 10.9+ paths; never use `/Users/{userId}/…` routes.
- Support Jellyfin 10.11.x and 12.x.
- Gate features by detection, not by version string.
- Request only the `fields` the view renders.
- Set `enableTotalRecordCount=false` unless paging needs counts.
- Cache images by item, type, tag, and size.

## Auth

- Authenticate with the `Authorization: MediaBrowser …` header.
- Never put a token in a query string.
- Strip `ApiKey` from server-supplied URLs before use.
- Keep one stable DeviceId per install, server, and user.
- Call `POST /Sessions/Logout` on logout.

## Negotiation

- Send the Fluster DeviceProfile with every PlaybackInfo request.
- Send the same flags in body and query.
- Decide each source with the `ARCHITECTURE.md` §3 rules: DirectPlay, DirectStream, Transcode, or Refuse.
- Return a typed refusal reason when no source can be played or converted.
- Rebuild a `TranscodingUrl` with the §3 HLS URL rules before use; never use it as given.
- Route remote `Play` commands through the same negotiation.

## Tracks and reports

- Map embedded tracks as `ff-index + count(IsExternal)`.
- Map external tracks by add order.
- Apply `DefaultAudioStreamIndex` and `DefaultSubtitleStreamIndex`.
- Report start only after the first frame.
- Report progress every ten seconds and on pause, seek, and track change.
- Send `Failed: true` on stopped reports after errors.

## Tests

- Back every new or changed call with a contract fixture test.
- Follow `references/contract-fixtures.md`.
- Assert both the request body and the query string.
