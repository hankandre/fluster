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
| `movies/Synthetic BluRay (2024)/BDMV/` | BluRay folder layout: placeholder `index.bdmv` and `MovieObject.bdmv`, empty `PLAYLIST/` and `CLIPINF/`, `STREAM/00000.m2ts` (H.264 plus AC-3 in MPEG-TS) |
| `movies/Synthetic DVDSub (2024)/Synthetic DVDSub (2024).mkv` | H.264 plus a graphical DVD subtitle (S_VOBSUB, eng) built by `scripts/make-vobsub.py` |
| `movies/Synthetic ISO (2024)/Synthetic ISO (2024).iso` | ISO 9660 image holding the BluRay sample's `BDMV` tree (xorriso, so not UDF); built with a local `xorriso`/`genisoimage`/`mkisofs` or an Alpine container with docker |
| `shows/Synthetic Show/Season 01/Synthetic Show S01E01.mkv`, `S01E02.mkv` | Two regular episodes |
| `shows/Synthetic Show/Season 00/Synthetic Show S00E01.mkv` | A special, for the specials default in the browse screen |

Jellyfin classifies a movie folder as BluRay when it contains a directory named `BDMV` (case-insensitive); see `IsBluRayDirectory` in `Emby.Server.Implementations/Library/Resolvers/BaseVideoResolver.cs` and its use in `MovieResolver.FindMovie` (jellyfin `release-10.11.z`). The Jellyfin docs note that `BDMV` folders do not support multiple versions, parts, or external subtitle and audio tracks.

PGS subtitles are intentionally absent: ffmpeg cannot encode PGS, and no third-party media is allowed (decision 2026-11-07).

Every network assertion must confirm a ranged request to `/Videos/{id}/stream?Static=true`, `PlayMethod: DirectPlay`, and no active Jellyfin encoding job.
