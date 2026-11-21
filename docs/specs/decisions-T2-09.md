# T2-09 decisions

## How are acceptance items 1 and 5 read on Jellyscale?

Decided 2026-11-21 by the coordinator; the owner may veto it. A veto needs a Product Owner scope edit, not a spec change.

Item 5 names no server, and Jellyscale has no user API (`decisions-T2-08.md`; backlog line 128), so no user there may not convert. Each of item 5's four rows is stated for Jellyscale and none is dropped quietly:

- `bluray-noconv` is `not-run` with the precondition `no-restricted-credentials`, which the run checks and fails when a restricted Jellyscale credential appears.
- `bluray-folder` is negotiated like any other sample. Jellyscale lists the folder's `.m2ts` file as a plain film, so the row is what milestone 1 observes (likely direct play).
- `iso` is `not-run` with the precondition `not-listed` only if Jellyscale lists no item for it; otherwise it is negotiated and the row is what milestone 1 observes.
- `h264-limited` is a `conversion` by `Transcode`. It is also Jellyscale's positive control: without it a "no server job" result there proves nothing.

Item 1 says every sample is negotiated on all three servers, so a row is `not-run` only when nothing can be negotiated.

## What does "a capability set" mean in item 3?

Decided 2026-11-21 by the coordinator; the owner may veto it. Three sets, `no-h264`, `no-hevc` and `no-av1`, each lacking one video codec, each run on the lacking sample and one control sample that the set can play.

## Item 7

Already met: ruleset 26769544 requires the `tripwire` context on the default branch with no bypass. This task adds no branch rule and keeps the job's name `tripwire`.
