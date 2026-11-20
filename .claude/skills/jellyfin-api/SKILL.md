---
name: jellyfin-api
description: Add or change Jellyfin and Jellyscale server calls, playback negotiation, playstate reporting, or track mapping in Octave. Use for any edit to the gateway (src/lib/jellyfin/, later packages/core) or to PLAYBACK_POLICY.
---

# Jellyfin API

## Before editing

- Read `ARCHITECTURE.md` §4.
- Use Opus for negotiation, source decisions, auth, or track mapping.
- Use Sonnet for catalog queries and images.

## Calls

- Add server calls only to `src/lib/jellyfin/gateway.ts`.
- Use 10.9+ paths; never use `/Users/{userId}/…` routes.
- Support Jellyfin 10.11.x and 12.x, and Jellyscale.
- Gate features by detection, not by version string.
- Request only the `fields` the screen renders.
- Set `enableTotalRecordCount=false` unless paging needs counts.
- Request images by item, type, tag, and size, through the native image view (T3-11); never build an image URL for React.
- When Jellyscale lacks a call, wait for its issue; never work around it with a token in a URL.

## Auth

- Authenticate with the `Authorization: MediaBrowser …` header, `Client="Octave"`. On Android, Kotlin adds it; the core holds only a session id (decision 0005).
- Never put a token in a query string, prop, event, or log.
- Strip every credential parameter from server-supplied URLs before use.
- Keep one stable DeviceId per install, server, and user.
- Treat a 3xx answer and a status of 0 as errors; never follow a redirect.
- Call `POST /Sessions/Logout` on logout.

## Negotiation

- Send the Octave DeviceProfile with every PlaybackInfo request.
- Never add codec or container conditions to it; the device's capabilities are read by the source decision, not sent.
- Send the same flags in body and query.
- Decide each source with the `ARCHITECTURE.md` §4 rules: DirectPlay, DirectStream, Transcode, or Refuse.
- When no engine on the device can play a source, send one more request with direct play and stream copy off; never a third.
- Return a typed refusal reason when no source can be played or converted.
- Rebuild a `TranscodingUrl` with the HLS URL rules before use; never use it as given.
- Route remote `Play` commands through the same negotiation.

## Tracks and reports

- Remember that Jellyfin numbers external streams first; map an engine's track ids to Jellyfin indices and verify each by type, language, and codec.
- Apply `DefaultAudioStreamIndex` and `DefaultSubtitleStreamIndex`.
- Report start only after the first frame.
- Report progress every ten seconds and on pause, seek, and track change.
- Send `Failed: true` on stopped reports after errors.
- Report `Transcode` for every converted session.

## Tests

- Back every new or changed call with a contract fixture test.
- Follow `references/contract-fixtures.md`.
- Assert both the request body and the query string.
- For a call the app sends from the device, add the Jellyscale wire test (`pnpm tv:wire`, T3-05).
