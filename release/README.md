# Embedded libmpv release gate

Release builds run on an immutable Ubuntu 22.04 image and dated Ubuntu package snapshot to set the glibc/WebKitGTK 4.1 compatibility baseline. `components.lock` records that snapshot plus verified upstream tags and full commits for mpv 0.41.0, FFmpeg 7.1.2, libass 0.17.4, libplacebo 7.360.1, and NVIDIA codec headers 12.1.14.0.

Build the pinned runtime and AppImage together:

```sh
./release/build-appimage.sh
```

The build first links the release binary against the staged runtime, writes a
bundle-relative loader path, creates the AppImage, and runs
`test-appimage.sh`. That gate extracts the artifact with no `LD_LIBRARY_PATH`,
checks that one `libmpv.so` closure resolves inside the extracted image, rejects
missing or duplicate media dependencies, reports compressed and extracted
sizes, and verifies that component locks, notices, and licenses exist.

The recipe compiles libmpv in Ubuntu 22.04, stages `libmpv.so` and its user-space dependencies under `src-tauri/target/fluster-media/lib`, records their names in `media-libraries.txt`, links the Tauri binary against that pinned runtime, and lets the AppImage bundler place one copy in `usr/lib`. The AppImage includes exact locks and license files and must run with no system mpv or libmpv. Development requires the system libmpv 0.41+ development package; there is no executable or GPU override.

Apple Silicon macOS uses:

```sh
./release/build-dmg.sh
```

`build-libmpv-macos.sh` builds the pinned mpv revision, stages libmpv plus its non-system dylib dependency closure, and rewrites references to bundle-relative loader paths before the Tauri DMG build. Its Homebrew-supplied FFmpeg/libass/libplacebo formulae must be locked and their source/license notices archived in the release evidence; the Linux source-built component lock is not proof of those Homebrew revisions. Direct distribution requires signing and notarization. The transparent private-WebView composition is not compatible with a Mac App Store release.

The release workflow publishes the AppImage with its SHA-256 checksum, SPDX
SBOM, component lock, licenses, notices, and GitHub/Sigstore provenance.

This recipe is a release gate, not a promise that a locally built binary has passed GPU validation. Before publication, complete every item in `docs/validation.md`, attach the machine results to the release, then extract the AppImage on a clean system without mpv.
