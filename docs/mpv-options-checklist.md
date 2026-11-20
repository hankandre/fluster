# mpv options checklist

Status: parked. Decision 0003 (`docs/decisions/0003-tv-and-mobile-shell.md`) drops the desktop Rust layer; this list keeps what it set on every libmpv handle, for when libmpv returns as Android's second engine (original files only). Set every item on every playback handle before it opens anything, and keep a test that reads each one back.

Citations are to commit `ba55ef2` (after PR #221, merged as `288ce46`), which the tag `desktop-tauri-final` contains, and to the mpv v0.42.0 source. Source paths such as `player/network.rs` are in the desktop app's Rust crate at that tag.

## Network

- [ ] **No redirects, no proxy, on FFmpeg's HTTP stack.** `stream-lavf-o=max_redirects=0,http_proxy=direct://` (`player/network.rs:16`, set at `:83`).
  - FFmpeg sends custom headers, including `Authorization`, to every redirect target, whatever its origin. So redirects are refused (`network.rs:11-12`).
  - FFmpeg also tunnels through the `http_proxy` environment variable unless the option is set. Any value that does not start with `http://` turns the proxy off (`network.rs:13-15`, FFmpeg `libavformat/http.c` `http_open_cnx_internal`).
  - Read back by `libmpv_accepts_the_network_hardening_options` (`player/network_tests.rs:142`).
- [ ] **Turn off mpv 0.42's libcurl backend, and cap its redirects as a second guard.** Set `curl-enabled=no`, then `curl-max-redirects=0` (`network.rs:30-31`, set at `:113-120`).
  - The backend is on by default when mpv is built with libcurl and a recent enough libavformat. It follows up to 16 redirects, sends `http-header-fields`, and serves HLS nested opens (`network.rs:17-29`, mpv `stream/stream_curl.c` v0.42.0 lines 91-97, 124, 127, 932-934, 972-973; `demux/demux_lavf.c` lines 1016-1023).
  - With `curl-enabled=no`, the stream and nested opens fall back to FFmpeg, the stack the options above harden.
  - **Option probe.** Decide from the loaded libmpv, never from a failed `set_option`.
    - Read `option-info/curl-enabled/name` on a throwaway handle (`player/version.rs:62-71`).
    - A definite "no such property" means no curl backend on any version, because the backend and its options share the `HAVE_LIBCURL` gate. Any other answer turns the guard on (`version.rs:84-108`; mpv `options/options.c` v0.42.0 lines 940-941). This also covers git builds that report `0.41.0` but have the backend.
    - Then build a second throwaway handle with the guard applied (`version.rs:45-52`). If the guard cannot apply, refuse the launch before any server request (`LibmpvRuntime::launch_http`, `version.rs:22-27`; called at `player/controller.rs:115-118`).
    - A guard failure on a playback handle is its own typed refusal (`MpvError::RedirectGuard`), never a generic initialization error (`network.rs:103-109`).
  - Tests:
    - `every_handle_refuses_the_curl_backend_when_libmpv_has_one` (`player/network_curl_tests.rs:42`).
    - `a_handle_that_cannot_refuse_the_curl_backend_is_never_built` (`:76`).
    - `only_a_curl_guard_failure_becomes_the_redirect_refusal` (`:99`).
    - The wire tests in `player/media_auth_wire/headers.rs:52-90`.
- [ ] **Protocol whitelist for HLS only.** Set `demuxer-lavf-o=protocol_whitelist=[http,https,tcp,tls]` on a validated-HLS handle (`network.rs:34`, set at `:95`).
  - mpv copies this FFmpeg option onto every nested open (`nested_io_open`).
  - A list value that holds commas must be wrapped in `[ ]` (`network.rs:32-33`).
- [ ] **`ytdl=no`.** The builtin `ytdl_hook` retries a failed load by running `yt-dlp` with the full stream URL as a process argument (`network.rs:84-86`). Read back in `network_tests.rs:142`.
- [ ] **`access-references` only for HLS** (`network.rs:87-97`).
  - `no` for an original file (`MediaDelivery::Static`). Otherwise a playlist, EDL, or HLS body served as the "movie" or as a subtitle makes mpv or FFmpeg open the URLs inside it, with the header, and those URLs were never validated.
  - `yes` only for a master playlist that was validated and served from loopback (`MediaDelivery::ValidatedHls`).
  - On Android, mpv plays original files only (decision 0003, D6), so every handle is `access-references=no`.
- [ ] **Only FFmpeg's `hls` demuxer reads the validated master.** Pass `demuxer=lavf,demuxer-lavf-format=hls` as per-file `loadfile` options (`network.rs:121-143`).
  - Without them, a failed `hls` open falls back to mpv's playlist demuxer. That demuxer turns the variant and its segments into playlist entries, opened as top-level files with references on.
  - Clear `file-local-options/demuxer-lavf-format` after `FileLoaded`, and only then `sub-add` (`network.rs:145-151`).
  - HLS only; not needed while mpv plays original files only.
- [ ] **The Authorization header, escaped.** `http-header-fields=Authorization: <value>`, with every comma written as `\,` (`network.rs:153-172`).
  - mpv splits string-list options on commas, and the MediaBrowser header has several.
  - A backslash right before a comma keeps the comma in the item and is itself removed. Other backslashes stay (mpv `options/m_option.c` `get_nextsep`).
  - The handle lives for one session, so the header goes with it. Read back in `network_tests.rs:142`.
- [ ] **`tls-verify=yes`, set explicitly.** Not set at `ba55ef2` (checked with `grep -rn tls` over the Rust crate); branch `fix/mpv-tls-verify` (commit `05752e4`) sets it in `harden_network_options` and adds `https_servers_with_an_untrusted_certificate_are_refused`, a loopback HTTPS test with a self-signed certificate.
  - mpv v0.42.0 defaults it to `yes` only when mpv is built with libcurl or libavformat is 63 or newer (`stream/network.c` lines 54-56; `DOCS/man/options.rst` lines 5807-5816; `DOCS/interface-changes.rst` line 69, "change `--tls-verify` default to `yes`").
  - Otherwise FFmpeg gets `tls_verify=0` (`stream/stream_lavf.c` line 174), and an HTTPS server's certificate is not checked.
  - mpv 0.41 defaults it to `no`: `mpv --list-options` on the local mpv v0.41.0 prints `--tls-verify  Flag (default: no)`. Any desktop install on mpv 0.41 (this development host included) has the gap today, logged in `tasks/backlog.md`.
  - Rust's own playlist fetches always verify, using the platform roots (`player/hls/fetch.rs:23-51`).
- [ ] **A CA source for FFmpeg's TLS on Android.** With `curl-enabled=no`, HTTPS goes through FFmpeg's TLS backend, which checks the peer only against the CAs it can find.
  - FFmpeg's OpenSSL backend loads `tls-ca-file` when it is set and otherwise calls `SSL_CTX_set_default_verify_paths`, whose failure is only a warning (`libavformat/tls_openssl.c` `openssl_init_ca_key_cert`, FFmpeg `master` read on 2026-11-20). Peer verification is on only when `verify` is set (`tls_open`).
  - OpenSSL's default paths are its build-time `OPENSSLDIR`, not Android's system store (`/system/etc/security/cacerts`, plus user CAs), so an Android build of FFmpeg probably finds no CA and refuses every HTTPS server once `tls-verify=yes` (unverified on a device).
  - Before shipping, verify on a device which TLS backend the libmpv build uses, and pass `tls-ca-file` with a PEM bundle the app writes from the Android trust store, or ship one. Test a valid server, a self-signed one, and a wrong host name.

## Config, scripts, and input

- [ ] **`config=no`** (`controller.rs:140`). mpv then sets its config directory to `""` (mpv `options/path.c` lines 113-116), and every platform path lookup returns nothing (lines 77-80). So no `mpv.conf`, no `input.conf`, no `script-opts`, and no user `scripts/` directory are loaded: `load_scripts` finds no directory (mpv `player/scripting.c` lines 289-297).
- [ ] **Builtin scripts off, each set explicitly:** `load-scripts=no`, `osc=no`, `ytdl=no`, `load-stats-overlay=no`, `load-console=no`, `load-select=no`, `load-positioning=no`, `load-commands=no`, `load-context-menu=no`, and `load-auto-profiles=no`. Read each back in a test. Re-check `options/options.c` in every mpv release for new `load-*` scripts.
  - Set today: `osc=no` (`controller.rs:143`) and `ytdl=no` (`network.rs:86`).
  - Not set today: `load-stats-overlay`, `load-console`, `load-select`, `load-positioning`, `load-commands`, and `load-context-menu`. All default to `yes` in mpv v0.42.0 (`options/options.c` lines 1029-1040), so they load whenever the libmpv build has Lua. `load-auto-profiles` defaults to `auto`, which loads nothing without config profiles.
- [ ] **No default input.** `input-default-bindings=no` and `input-vo-keyboard=no` (`controller.rs:144-145`). The app sends only typed commands; no generic mpv command, property, or option bridge (`AGENTS.md`).
- [ ] **No sibling files.** `autoload-files=no` (`controller.rs:147-149`), so only the subtitles Octave adds appear as external tracks.
- [ ] **Probe handles.** The throwaway handles that read the version and options set `config=no`, `vo=null`, and `ao=null`, and open nothing (`version.rs:53-59`).

## URLs before mpv

- [ ] Validate every URL before `loadfile` or `sub-add` (`network.rs:183-206`).
  - Use the allowed host classes (`url_policy::parse_allowed_url`).
  - Refuse any credential query name (`network.rs:174-181`).
  - External subtitles must have the stream's origin.
- [ ] Issue `loadfile` from the two typed loaders only (`network.rs:129-143`; `media_tests::loadfile_is_issued_only_by_the_two_typed_loaders`).
- [ ] Converted streams: validate each playlist against `tests/fixtures/hls-playlists.json` before the player reads it. See `tests/fixtures/README.md`.

## What the desktop security document proved

`docs/security.md` at the tag `desktop-tauri-final` described the desktop boundary in full. Its desktop-only sections are not carried into the TV document; this is what they proved, with the test at the tag that proved each, so a libmpv engine on any platform can port it.

- **References inside downloaded content are never opened.** With `access-references=no`, a playlist, PLS, EDL, or HLS body served as the movie or as a subtitle contacts no second origin (`references_inside_the_stream_body_are_never_opened`, `references_inside_a_subtitle_body_are_never_opened` in `player/media_auth_wire/references.rs`).
- **The header reaches redirect targets on FFmpeg's HTTP stack unless redirects are off.** `redirects_are_refused_while_the_header_is_set` shows the redirect target receives nothing with `max_redirects=0`. FFmpeg 7.0 lacks the option, so a bundled FFmpeg must be 6.1, 7.1, or later.
- **No proxy.** `static_and_hls_handles_never_use_an_http_proxy`.
- **The curl guard.** The tests listed under "Network" above, each with a raised-limit positive control; only mpv 0.41.0 ran them.
- **HLS through a validated loopback copy.** `hls_launch_sends_the_header_on_every_request_and_never_follows_a_segment_redirect`, `hls_launch_with_a_cross_origin_playlist_is_refused_and_contacts_nobody_else`, `hls_failed_hls_open_never_falls_back_to_playlist_entries`, and `redaction_canary_in_a_playlist_body_fails_the_launch_closed`. On Android, mpv plays original files only, so these apply only if a later platform lets libmpv play HLS.
- **The header value.** It was validated as a `MediaBrowser` value with a token, at most 4 KB, with no control character, redacted from `Debug`, and set as the single `http-header-fields` item before `loadfile` (`auth_header.rs`).
- **No logger.** `logger_guard` failed if a logger crate entered the lockfile, because a WebSocket library trace-logged the handshake header.
- **External subtitles share the header.** `sub-add` opens through the same stream layer, so external subtitles got the same header; a loopback test checked the exact request bytes.
- **Only typed loaders call `loadfile`** (`loadfile_is_issued_only_by_the_two_typed_loaders`), and a fixed command allowlist kept the native surface narrow (`command_allowlist.rs`).
