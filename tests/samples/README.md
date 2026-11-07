# Playback samples

The Jellyfin fixture servers (`pnpm fixture:up`) mount this directory read-only at `/media` and register two libraries:

- `movies/` becomes the Movies library (`/media/movies`, collection type movies).
- `shows/` becomes the Shows library (`/media/shows`, collection type tvshows).

Integration and machine-validation runs place redistributable short samples in those folders:

- `h264.mkv`
- `hevc-main10.mkv`
- `av1.mkv`
- `ass.mkv`
- `pgs.mkv`
- `multitrack.mkv`

Samples are deliberately not committed unless their redistribution licenses and source notices are recorded. Every network assertion must confirm a ranged request to `/Videos/{id}/stream?Static=true`, `PlayMethod: DirectPlay`, and no active Jellyfin encoding job.
