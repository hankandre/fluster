# Playback samples

The Jellyfin fixture servers (`pnpm fixture:up`) mount this directory read-only at `/media` and register two libraries:

- `movies/` becomes the Movies library (`/media/movies`, collection type movies).
- `shows/` becomes the Shows library (`/media/shows`, collection type tvshows).

## Regenerating

All media is synthetic. `scripts/generate-samples.sh` builds it with ffmpeg lavfi sources (`testsrc2`, `smptehdbars`, `sine`), so no third-party media is used or committed. Generated files are gitignored; only this README and the `.gitkeep` files are tracked.

```sh
pnpm samples:generate            # skips samples that already exist
bash scripts/generate-samples.sh --force   # rebuild everything
```

Requires `ffmpeg` and `ffprobe` with libx264, libx265, libsvtav1, and the `ass`, `srt`, `aac`, and `ac3` encoders. Each clip is 10 seconds. The script verifies the results with ffprobe and prints a summary table.

Folder and file names follow the Jellyfin naming docs: [movies](https://jellyfin.org/docs/general/server/media/movies/) and [shows](https://jellyfin.org/docs/general/server/media/shows/).

## Conversion-only samples

The dvdsub and ISO samples (P10-02) are opt-in, because they need `python3` and an ISO tool (`xorriso`, `genisoimage`, `mkisofs`, or docker), which the `jellyfin/jellyfin` image lacks. Generate them with `OCTAVE_CONVERSION_SAMPLES=1 pnpm samples:generate`, and set the same variable for `pnpm test:tripwire` to play them. With the variable set, a missing tool fails the script. CI's tripwire job builds the other samples inside the Jellyfin image and then these two on the host, with `ffmpeg` and `xorriso` from the pinned Ubuntu snapshot.

## Samples

| Path (under `tests/samples/`) | Exercises |
| --- | --- |
| `movies/Synthetic H264 (2024)/Synthetic H264 (2024).mkv` | H.264 High 8-bit, AAC stereo (eng) |
| `movies/Synthetic HEVC HDR10 (2024)/Synthetic HEVC HDR10 (2024).mkv` | HEVC Main10, BT.2020 / PQ (smpte2084), mastering display and max-cll metadata |
| `movies/Synthetic AV1 (2024)/Synthetic AV1 (2024).mkv` | AV1 (SVT-AV1), 10-bit |
| `movies/Synthetic ASS (2024)/Synthetic ASS (2024).mkv` | Embedded styled ASS subtitle (eng) |
| `movies/Synthetic Sidecar (2024)/Synthetic Sidecar (2024).mkv` and `.en.srt` | External SRT sidecar named `<video name>.<language>.srt` |
| `movies/Synthetic Multitrack (2024)/Synthetic Multitrack (2024).mkv` | Two audio tracks: eng stereo AAC (default) and spa 5.1 AC-3 |
| `movies/Synthetic Versions (2024)/Synthetic Versions (2024) - 1080p.mkv` and `- 720p.mkv` | Multi-version movie: two H.264 files in one folder, each starting with the folder name plus a ` - <label>` suffix ([movie naming docs, Multiple Versions](https://jellyfin.org/docs/general/server/media/movies/)) |
| `movies/Synthetic BluRay (2024)/BDMV/` | BluRay folder layout: placeholder `index.bdmv` and `MovieObject.bdmv`, `PLAYLIST/00000.mpls` and `CLIPINF/00000.clpi` naming the one clip (10 s, H.264 720p24 PID 0x1011, AC-3 stereo PID 0x1100), and `STREAM/00000.m2ts` (H.264 plus AC-3 in MPEG-TS) |
| `movies/Synthetic DVDSub (2024)/Synthetic DVDSub (2024).mkv` | H.264 plus a graphical DVD subtitle (S_VOBSUB, eng) built by `scripts/make-vobsub.py` |
| `movies/Synthetic ISO (2024)/Synthetic ISO (2024).iso` | ISO 9660 image holding the BluRay sample's `BDMV` tree (xorriso, so not UDF); built with a local `xorriso`/`genisoimage`/`mkisofs` or an Alpine container with docker |
| `movies/Synthetic Extras (2024)/Synthetic Extras (2024).mkv` | The film that owns a local trailer and an extra (P16-01); H.264 and AAC, 320x180 |
| `movies/Synthetic Extras (2024)/Synthetic Extras (2024)-trailer.mkv` | Local trailer, found by the `-trailer` suffix; both servers list it as a `Trailer` |
| `movies/Synthetic Extras (2024)/featurettes/Synthetic Extras Featurette.mkv` | An extra in a `featurettes` folder; both servers list it as a `Featurette` special feature |
| `movies/*/<name>.nfo` for H264, AV1, Multitrack, ASS, and Extras; `shows/Synthetic Show/tvshow.nfo` | Kodi-style NFO files giving genres, people, and a collection name (see below) |
| `staging/Synthetic Show S01E03.mkv` | A third episode outside both libraries; the discovery recorder copies it into `Season 01` for one scene and removes it |
| `staging/Synthetic Languages (2024)/Synthetic Languages (2024).mkv` and `.nfo` | One H.264 video, four audio tracks, and twelve SRT subtitle tracks in eight languages (P17-01), outside both libraries; the account-language recorder copies the folder into `movies/` for one run and removes it (see below) |
| `shows/Synthetic Show/Season 01/Synthetic Show S01E01.mkv`, `S01E02.mkv` | Two regular episodes |
| `shows/Synthetic Show/Season 00/Synthetic Show S00E01.mkv` | A special, for the specials default in the browse screen |

## Discovery metadata

P16-01 records discovery routes (`docs/research/discovery-api.md`, `tests/integration/record-discovery-fixtures.mjs`). The generator writes these files with `printf`; no third-party media or real names are used. Every NFO except the show's has `<lockdata>true</lockdata>`, so an online match cannot rename the title or replace genres and people.

| NFO | Genres | People |
| --- | --- | --- |
| Synthetic H264 | Drama, Mystery | Actors Ada Placeholder and Bo Example, director Cy Sample; `<set>` Synthetic Collection |
| Synthetic AV1 | Drama, Science Fiction | Actor Ada Placeholder; `<set>` Synthetic Collection |
| Synthetic Multitrack | Comedy | Actor Bo Example |
| Synthetic ASS | Mystery | none |
| Synthetic Extras | Drama | Actor Ada Placeholder |
| Synthetic Show (`tvshow.nfo`) | Drama | Actor Ada Placeholder |

HEVC HDR10 and Versions have no NFO, because item-detail fixtures were recorded from them.

- The show's NFO has no `lockdata`: an episode added later under a locked series is created locked, and the server then never reads its season and episode numbers from the file name (seen on 10.11.7 and 12.4.0).
- Neither server turns the `<set>` tag into a collection. The recorder creates "Synthetic Collection" with `POST /Collections` (admin user) and, on 12.4.0, adds the two films with `POST /Collections/{id}/Items`, because the call created it empty there.
- The `-trailer` suffix and a `featurettes` folder are both read by the two pinned servers; no `trailers/` folder was needed.
- Collections and the watch state the recorder sets live in the server config volume, not in this folder. `pnpm fixture:down && pnpm fixture:up && pnpm fixture:setup` starts clean; NFOs are read on the first scan.
- If a recording is killed during the new-episode scene, `shows/Synthetic Show/Season 01/Synthetic Show S01E03.mkv` is left behind. Delete it by hand and refresh the library.

Jellyfin classifies a movie folder as BluRay when it contains a directory named `BDMV` (case-insensitive); see `IsBluRayDirectory` in `Emby.Server.Implementations/Library/Resolvers/BaseVideoResolver.cs` and its use in `MovieResolver.FindMovie` (jellyfin `release-10.11.z`). The Jellyfin docs note that `BDMV` folders do not support multiple versions, parts, or external subtitle and audio tracks.

The playlist and clip info are written byte by byte by `scripts/generate-samples.sh` (bash `printf`, no python3). Jellyfin reads disc folders with the BDInfo library (`jellyfin/BDInfo` 0.8.0, `TSPlaylistFile.Scan` and `TSStreamClipFile.Scan`; called from `BdInfoExaminer.GetDiscInfo`): the longest valid playlist gives the runtime and the `.m2ts` files ffmpeg concatenates. Without a playlist the folder has no runtime, so the server serves its conversion as a live stream (`live.m3u8`, `EncodingJobInfo.IsSegmentedLiveStream`), which fails with an empty concat list (both fixtures answered HTTP 500) and which Octave refuses anyway (a media playlist without `EXT-X-ENDLIST`). With the playlist both fixtures report a 10 s runtime, H.264 and AC3 streams, and a VOD `main.m3u8`.

PGS subtitles are intentionally absent: ffmpeg cannot encode PGS, and no third-party media is allowed (decision 2026-11-07).

`pnpm test:tripwire` checks every sample against the decision 0002 rules (`docs/validation.md`, gates 1 and 2): every playable sample must direct play with only ranged `/Videos/{id}/stream?Static=true` and external subtitle requests, `PlayMethod: DirectPlay`, and no Jellyfin encoding job; the BluRay folder, the ISO, and a forced-limit run of the H.264 sample must convert over same-origin, credential-free HLS with `EnableTrickplay=false`, agree with `/Sessions`, and leave no job 10 s after the stopped report; the `octave-noconv` user must get `conversion-not-allowed` for the BluRay folder.

## Language sample

`staging/Synthetic Languages (2024)/` holds the sample for the account-language fixtures (P17-01, `docs/research/account-languages-api.md`, `tests/integration/record-account-language-fixtures.mjs`). It is built from lavfi sources and `printf` SRT text, and the NFO is locked like the others. `scripts/generate-samples.sh` checks every tag and flag below with ffprobe.

Audio (ff order after the video):

| Track | Language tag | Title | Flag |
| --- | --- | --- | --- |
| a:0 | `eng` | English | default |
| a:1 | `deu` | German | none |
| a:2 | `fra` | French | none |
| a:3 | `jpn` | Japanese | none |

Subtitles (all text, `subrip`):

| Track | Language tag | Title | Flag |
| --- | --- | --- | --- |
| s:0 | `eng` | English | default |
| s:1 | `fra` | French | none |
| s:2 | `fra` | French forced | forced |
| s:3 | `fra` | French SDH | hearing_impaired |
| s:4 | `deu` | German (deu) | none |
| s:5 | `ger` | German (ger) | none |
| s:6 | `spa` | Spanish | none |
| s:7 | `ita` | Italian | none |
| s:8 | `jpn` | Japanese | none |
| s:9 | `por` | Portuguese | none |
| s:10 | `nld` | Dutch | none |
| s:11 | none | Untagged | none |

The recorder removes its copy in `movies/` when it ends. If a run was killed and cannot be rerun, delete `tests/samples/movies/Synthetic Languages (2024)/` and refresh the library, or the tripwire and discovery fixtures see an extra film.
