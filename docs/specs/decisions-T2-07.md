# T2-07 decisions

## Where does the Jellyscale fixture for acceptance item 8 come from?

Decided 2026-11-21 by the coordinator; the owner may veto it.

T2-08 runs first and adds the pinned Jellyscale with the generated samples. T2-07 records item 8 from that pinned server, so the fixture is reproducible in CI and holds only synthetic media. The acceptance text is unchanged.

## The copy for a client-side conversion

Confirmed by the owner on 2026-11-21.

- Player chip: "Converting on server: this device cannot play the original"
- Refusal: "This device cannot play the file, and the server offered no conversion."
- Info panel: when the client's reason is shown, leave out the server's "playing the original file failed" (its DirectPlayError, which the server sends for every request with EnableDirectPlay false).
