# Shared test vectors

Language-neutral vectors that every implementation of a rule must pass, so two implementations cannot drift. Decision 0003 (`docs/decisions/0003-tv-and-mobile-shell.md`) keeps them as the contract for the TV and mobile validators after the desktop Rust code is gone.

| File | Rule | Read by |
| --- | --- | --- |
| `host-classes.json` | Host classes from decision 0001: loopback, private LAN, public | `src/domain/host-class.test.ts`, `src-tauri/src/url_policy.rs`, `src-tauri/src/discovery/tests.rs` |
| `hls-master-urls.json` | The HLS master URL rules (`ARCHITECTURE.md` "HLS URL rules"), as the plans TypeScript Playback Negotiation builds from the recorded conversions | written by `src/lib/jellyfin/hls-rust-vectors.test.ts`, read by `src-tauri/src/player/hls/master_url_tests.rs` |
| `hls-playlists.json` | The HLS playlist rules: every URI same-origin and credential-free, and only complete, well-formed playlists | `src-tauri/src/player/hls/playlist_vectors_tests.rs` |
| `jellyfin/` | Scrubbed server answers; see `jellyfin/README.md` | gateway and negotiation tests |

## `hls-playlists.json`

The rules of the desktop validator (`src-tauri/src/player/hls/playlist.rs`, `uri.rs`, `attributes.rs`) as data. Every validator that replaces it must give the same verdict and reason for every vector: Kotlin in Media3's playlist parser hook first, then Swift or an IO-free Rust crate.

### Schema

```json
{
  "description": "…",
  "vectors": [
    {
      "name": "unique, human-readable",
      "rule": "the invariant this vector checks",
      "playlistKind": "master | media",
      "body": "the playlist exactly as the server sent it",
      "baseUrl": "the URL the body was fetched from",
      "serverOrigin": "scheme://host[:port] of the signed-in server",
      "token": "optional: the signed-in token",
      "expected": { "verdict": "accept", "servedBody": "…", "children": ["…"] }
    }
  ]
}
```

- `playlistKind` is what the URL was fetched as: `master` for the master URL from Playback Negotiation, `media` for a child playlist that a master named. A body of the other kind is refused as `malformed`.
- `baseUrl` resolves relative URIs. `serverOrigin` is the only origin a URI may resolve to. A base path (`https://media.example.test/jellyfin`) is part of `baseUrl`, not of the origin.
- `token` is present only in token-echo vectors. A body that contains it (any ASCII case, as written or after up to three rounds of percent decoding) is refused.
- `expected` is `{"verdict": "accept", …}` or `{"verdict": "refuse", "reason": <code>}`.
  - `servedBody` is the copy the player reads, LF line ends, every URI written in its absolute resolved form, and each child playlist named by its own absolute URL. The desktop app swaps each child for a loopback URL; that swap is not part of the vector.
  - `children` (masters only) lists the child playlists in order: `EXT-X-MEDIA` renditions with a `URI` and `EXT-X-STREAM-INF` variants, as they appear. A validator fetches and checks each one as a `media` playlist before the player opens it.
- Hosts are synthetic: `127.0.0.1` and names under `example.test`. `hls_playlist_vectors_name_no_real_server` enforces it.

### Reason codes

| Code | Desktop `HlsError` | Meaning |
| --- | --- | --- |
| `malformed` | `Malformed` | Not a playlist the validator can check, or not the expected kind. |
| `not-complete` | `NotComplete` | A media playlist without `EXT-X-ENDLIST`: live or event playlists are never served. |
| `unsafe-uri` | `UnsafeUri` | A URI that is not same-origin, not http(s), has user info, a fragment, whitespace, a control character, or a backslash; or a `URI=` the parser could not read. |
| `credential-in-playlist` | `CredentialInPlaylist` | The body names a credential parameter or echoes the token. |

### Check order

A body with more than one fault is refused with the reason of the first check that fails. Most vectors have one fault; to agree on the rest, check in this order:

1. Token echo (`token` vectors only), then the credential scan over the whole body: `ApiKey`, `api_key`, `access_token`, `Token`, `X-Emby-Token` in any case, followed by optional spaces or tabs and `=`, at a boundary (not after a letter, digit, or `_`), as written or after up to three rounds of percent decoding.
2. Any control character other than tab, CR, and LF: `malformed`.
3. Lines end at CR, LF, or CRLF; trailing spaces and tabs are dropped. The first line must be exactly `#EXTM3U` (no BOM, no leading space).
4. Each line in order; the first failing line decides.
   - A line over 4000 bytes is `malformed`. Blank lines are skipped.
   - A comment (`#` not followed by `EXT`) must not contain `uri=` (any case); it is left out of the copy.
   - A tag name must be upper-case letters, digits, and `-`. `EXT-X-DEFINE` and a second `#EXTM3U` are `malformed`.
   - Attribute lists are strict RFC 8216 section 4.2: no spaces, no empty list, no trailing comma, no repeated name, no backslash or control character in a quoted value, no quote, backslash, or comma in a plain value. A list that breaks this is `malformed`.
   - Every attribute that names a resource is resolved against `baseUrl` and must be same-origin: `URI`, any `*-URI`, `X-ASSET-LIST`, and any value that starts with `/`, contains `//`, or starts with a URI scheme. `EXT-X-STREAM-INF` and `EXT-X-START` may name no resource (`unsafe-uri`).
   - The number of `uri=` on a line (any case) must equal the number of `URI`/`*-URI` attributes the parser read (`unsafe-uri`). An unknown tag whose value is not an attribute list may not contain `//` (`unsafe-uri`).
   - `EXT-X-MAP` needs a `URI`, and so does `EXT-X-KEY` unless `METHOD=NONE` (`malformed`).
   - A URI line must follow `EXT-X-STREAM-INF` (a child) or `EXTINF` (a segment); any other URI line is `malformed`. Two `EXT-X-STREAM-INF` or two `EXTINF` in a row are `malformed`. A 17th child is `malformed`.
5. At the end: a dangling `EXT-X-STREAM-INF` or `EXTINF`, a mix of master and media tags, a master with no child, or a media playlist with no segment is `malformed`; then a media playlist without `EXT-X-ENDLIST` is `not-complete`.
6. The served copy: a line over 4000 bytes after resolution is `malformed`.
7. The kind: a body that is not `playlistKind` is `malformed`.

### Using it in a new validator

1. Load the file and fail if it has fewer vectors than the Rust driver's `VECTOR_COUNT` (162), or if names repeat.
2. For each vector, run the validator on `body` with `baseUrl`, `serverOrigin`, `token`, and `playlistKind`. Do no network I/O.
3. Compare the verdict and, for a refusal, the reason code.
4. For an acceptance, compare `children`. A validator that writes a copy for the player compares `servedBody` byte for byte. A validator that hands a parsed playlist to its player (Media3) must hand it only the absolute URIs that appear in `servedBody`, and must drop the tags that `servedBody` leaves out.
5. Make no error message carry the body, a URI, or the token.

URI resolution follows the WHATWG URL Standard (the Rust `url` crate). Some vectors depend on it: `HTTP://` and `//host` spellings, `http:%2F%2F…` read as a relative path, `0x7f.0.0.1` read as `127.0.0.1`, and backslashes. A validator built on another URL parser must still pass them.

### Changing it

- Add a vector here first and run `cargo test --manifest-path src-tauri/Cargo.toml playlist_vectors`. A vector that disagrees with the Rust validator fails the build, and the failure lists every disagreement.
- Update `VECTOR_COUNT` in `playlist_vectors_tests.rs` when the count changes.
- Never change a vector's `expected` to make a validator pass. A rule change is an architecture change (`ARCHITECTURE.md` invariant I2).

### Rust-only tests

These stay in Rust, because a vector cannot express them:

- `playlist_tests.rs`: `hls_jellyfin_master_points_its_variant_at_the_loopback_copy` and `hls_renditions_with_a_uri_become_loopback_children` check the desktop loopback swap of child URLs.
- `uri_tests.rs`: `hls_uris_refuse_credential_queries_and_tabs_on_their_own` checks that `resolve_same_origin` refuses a credential query and a trailing tab by itself. Inside a playlist, the body credential scan refuses the first, line trimming removes the second from a URI line, and a quoted attribute refuses it as a control character (`malformed`).
- `session_tests.rs`, `subtitle_tests.rs`, `loopback_tests.rs`: fetching, redirects, status and size limits, subtitles, and the loopback server. These involve I/O and are outside the playlist rules.
