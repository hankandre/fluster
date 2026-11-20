# Shared test vectors

Language-neutral vectors that every implementation of a rule must pass, so two implementations cannot drift. Decision 0003 (`docs/decisions/0003-tv-and-mobile-shell.md`) keeps them as the contract for the TV and mobile validators after the desktop Rust code is gone. Rust source paths below are in the desktop app's Rust crate (`src/` under its crate directory) at the tag `desktop-tauri-final`; on `main` only the TypeScript side and the shape test run them until a native validator lands (Kotlin in T3-03 and T8-08).

| File | Rule | Read by |
| --- | --- | --- |
| `host-classes.json` | Host classes from decision 0001: loopback, private LAN, public | `src/domain/host-class.test.ts`; at the tag, `url_policy.rs` and `discovery/tests.rs`; next, the Kotlin classifier (T3-03) |
| `hls-master-urls.json` | The HLS master URL rules (`ARCHITECTURE.md` "HLS URL rules"): accepted plans and refused URLs | `src/lib/jellyfin/hls-master-url-vectors.test.ts` (writes `vectors`), `src/lib/jellyfin/hls-url.test.ts` (`refusals`); at the tag, `player/hls/master_url_tests.rs` (both); next, Kotlin (T8-08) |
| `hls-playlists.json` | The HLS playlist rules: every URI same-origin, unambiguous, and credential-free; only complete, well-formed playlists | `src/lib/jellyfin/hls-playlist-vectors.test.ts` (shape); at the tag, `player/hls/playlist_vectors_tests.rs`; next, Kotlin (T8-08) |
| `jellyfin/` | Scrubbed server answers; see `jellyfin/README.md` | TypeScript tests under `src/lib/jellyfin/` and `src/domain/` (for example `src/lib/jellyfin/conversion-negotiation.test.ts`) |
| `playback-info-direct.json`, `playback-info-transcode-rejected.json` | Older PlaybackInfo samples | no reader at `ba55ef2` (`git grep` finds none) |

## `hls-master-urls.json`

- `vectors` (44): the plans TypeScript Playback Negotiation builds from every recorded conversion, on a server with and without a base path. Every native validator deserializes each plan and accepts its master URL. Regenerate with `OCTAVE_WRITE_HLS_VECTORS=1 pnpm vitest run hls-master-url-vectors`; that keeps `description` and `refusals` as they are.
- `refusals` (56): master URLs every validator refuses, each with the context it is checked in (`serverUrl`, `mediaKind`, `itemId`, `mediaSourceId`, `playSessionId`) and a `rule` tag. `typescript` says what `rebuildMasterUrl` (`src/lib/jellyfin/hls-url.ts`) does with the same input:
  - `{"verdict": "refuse"}`: it refuses too.
  - `{"verdict": "rebuild", "url": "…"}`: it removes the offending part (a credential parameter, `EnableTrickplay`, `EnableSubtitlesInManifest=false`) and returns `url`, which a validator then accepts.

A new client checks the master URL the way the side it replaces does: the rebuild, then the native check of the result.

## `hls-playlists.json`

The rules of the desktop validator (`player/hls/playlist.rs`, `uri.rs`, `attributes.rs`, and the body check in `session.rs`) as data. Every validator that replaces it must give the same verdict and reason for every vector: Kotlin in Media3's playlist parser hook first, then Swift or an IO-free Rust crate.

- Vectors: 210. SHA-256 of the file at this count: `536984c5135a40c83a7f06c88adaeb47eb77b8498f8008fdfb2deae22f756221`.
- At the tag, run by `hls_playlist_vectors_match_the_rust_validator` through `session::check_playlist_body`, the function a desktop session used on every fetched body. On `main`, `src/lib/jellyfin/hls-playlist-vectors.test.ts` checks the file's shape.

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
- `token` is present only in token-echo vectors.
- `expected` is `{"verdict": "accept", …}` or `{"verdict": "refuse", "reason": <code>}`.
  - `servedBody` (every accept) is the copy the player reads: LF line ends, every URI in its absolute resolved form, and each child playlist named by its own absolute URL. The desktop app swaps each child for a loopback URL; that swap is not part of the vector.
  - `children` (every master accept, and only those) lists the child playlists in order: `EXT-X-MEDIA` renditions with a `URI` and `EXT-X-STREAM-INF` variants, as they appear. A validator fetches and checks each one as a `media` playlist before the player opens it.
- The schema is closed: an unknown key fails every driver (on `main`, `hls-playlist-vectors.test.ts`).
- Hosts are synthetic: `127.0.0.1` and names under `example.test`. the shape test checks `baseUrl` and `serverOrigin`, and that no `192.168.` address appears anywhere in the file; hosts inside bodies are checked by review only.

### Reason codes

| Code | Desktop `HlsError` | Meaning |
| --- | --- | --- |
| `malformed` | `Malformed` | Not a playlist the validator can check, not the expected kind, or a master that lists subtitle renditions or trickplay. |
| `not-complete` | `NotComplete` | A media playlist without `EXT-X-ENDLIST`: live or event playlists are never served. |
| `unsafe-uri` | `UnsafeUri` | A URI that is not same-origin, not http(s), ambiguous (see "Resolving URIs"), has user info, a fragment, whitespace, a control character, a backslash, or a credential query name; or a `URI=` the parser could not read. |
| `credential-in-playlist` | `CredentialInPlaylist` | The body names a credential parameter, echoes the token, or still percent-decodes after four rounds. |

### Resolving URIs

A validator must check the **same resolved URL the player will request**. URL parsers disagree on some spellings, so those are refused, not resolved:

- a colon before the first `/`, `?`, or `#` that is not a scheme followed by `//`: `http:x`, `http:/x`, `http:%2F%2Fx`, `a:b.mp4`;
- any user info, even empty: `http://@host/`, `http://:@host/`;
- a host not written exactly as the parsed host (ASCII case aside): percent-encoding, IDN, and every IPv4 form other than dotted decimal (hex `0x7f.0.0.1`, octal `0177.0.0.1`, short `127.1`, integer `2130706433`);
- a host ending in a dot;
- a port that is empty, has a leading zero, or is not the plain decimal of the parsed port.

What remains (relative paths, `/root` paths, `//host` and `HTTP://` spellings of the server) resolves the same under WHATWG (the Rust `url` crate) and RFC 3986. In Media3's parser hook, resolve with the function Media3 itself uses (`UriUtil.resolve`) and validate that result, or refuse any raw URI whose Media3 resolution differs from the URL the validator checked. Example: Media3 keeps `http:other.example.test/a` as is and OkHttp then reads its host as `other.example.test`, while the `url` crate reads it as a relative path; the rule above refuses it before either reading matters.

A URI must also be http or https, on `serverOrigin` (scheme, host, and port), and have no user info, no fragment (even empty, `a.mp4#`), no whitespace (Unicode, including U+00A0 and U+2028), no control character, no backslash, and no credential query name, with or without a value (`a.mp4?ApiKey`). The absolute form written into the copy must start with `serverOrigin` followed by `/`.

### Check order

A body with more than one fault is refused with the reason of the first check that fails. To agree on the rest, check in this order (`session::check_playlist_body`, then `Playlist::parse`):

1. Token echo (`token` vectors only): the token, case-folded, in the body case-folded, as written or after each of up to four rounds of percent decoding. A body that still decodes to something new after the fourth round is refused.
2. The credential scan over the whole body: `apikey`, `api_key`, `access_token`, `token`, `x-emby-token`, followed by optional spaces or tabs and `=`, at a boundary (not after an ASCII letter, digit, or `_`), as written or after each of up to four rounds of percent decoding; a body that still decodes after the fourth round is refused. Case folding is ASCII lower-casing plus the three non-ASCII letters whose simple case mapping is an ASCII letter: `ı` (U+0131) to `i`, `ſ` (U+017F) to `s`, and the Kelvin sign (U+212A) to `k`. A name with no `=` is not a credential in the body (`# ApiKey` is accepted), but in a URI any credential query name is refused, with or without a value.
3. Any control character other than tab, CR, and LF (C0, DEL, and C1 such as U+0085): `malformed`.
4. Lines end at CR, LF, or CRLF; only trailing spaces and tabs are dropped (not U+00A0 or U+2028). The first line must be exactly `#EXTM3U` (no BOM, no leading space).
5. Each line in order; the first failing line decides.
   - A line over 4000 bytes (UTF-8 bytes, not characters) is `malformed`, whether it is kept, dropped, or a comment. Blank lines are skipped.
   - A comment (`#` not followed by `EXT`, so `#ext-x-version:7` is a comment) must not contain `uri=` (any case); it is left out of the copy.
   - A tag name after `#` must be upper-case letters, digits, and `-` (`#EXT-x-VERSION`, `#EXT_X_VERSION` are `malformed`). `EXT-X-DEFINE` and a second `#EXTM3U` are `malformed`.
   - Attribute lists are strict RFC 8216 section 4.2: no spaces, no empty list, no trailing comma, no repeated name, no backslash or control character (tab included) in a quoted value, no quote, backslash, or comma in a plain value. A list that breaks this is `malformed`.
   - Every attribute that names a resource is resolved against `baseUrl` and checked as above: `URI`, any `*-URI`, `X-ASSET-LIST`, and any value that starts with `/`, contains `//`, or starts with a URI scheme (letters, digits, `+`, `-`, `.`, then `:`) and has no whitespace. So `NAME="Commentary: Director"` is not a resource, but `NAME="a // b"` is, and is refused. `EXT-X-STREAM-INF` and `EXT-X-START` may name no resource (`unsafe-uri`).
   - The number of `uri=` on a line (any case) must equal the number of `URI`/`*-URI` attributes the parser read (`unsafe-uri`). An unknown tag whose value is not an attribute list may not contain `//` (`unsafe-uri`).
   - `EXT-X-MAP` needs a `URI`, and so does `EXT-X-KEY` unless `METHOD=NONE` (`malformed`). A `URI` on `METHOD=NONE` is still checked.
   - A master never lists subtitle renditions or trickplay (`AGENTS.md` hard rule): `EXT-X-MEDIA` with `TYPE=SUBTITLES` and any `EXT-X-IMAGE-STREAM-INF` are `malformed`, after their URIs are checked. Media3 must never receive either.
   - A URI line must follow `EXT-X-STREAM-INF` (a child) or `EXTINF` (a segment); any other URI line is `malformed`. Two `EXT-X-STREAM-INF` or two `EXTINF` in a row are `malformed`. A 17th child is `malformed`.
   - Tags FFmpeg ignores (`EXT-X-I-FRAME-STREAM-INF`, `EXT-X-SESSION-DATA`, `EXT-X-SESSION-KEY`, `EXT-X-CONTENT-STEERING`, `EXT-X-PART`, `EXT-X-PRELOAD-HINT`, `EXT-X-RENDITION-REPORT`, unknown tags) are checked, then left out of the copy.
6. At the end: an `EXT-X-STREAM-INF` or `EXTINF` still waiting for its URI, a mix of master and media tags, a master with no child, or a media playlist with no segment is `malformed`; then a media playlist without `EXT-X-ENDLIST` is `not-complete`.
7. The served copy: a line over 4000 bytes after resolution is `malformed`.
8. The kind: a body that is not `playlistKind` is `malformed`.

### Fetch rules

These rules are not in the vectors, because they need I/O. They are part of the contract and leave with the Rust code, so they are written here.

- Every playlist and subtitle request carries exactly one `Authorization` header with the typed value, and no token in the URL (`player/hls/fetch.rs:86`).
- No redirects: a 3xx is refused (`HlsError::Redirect`) and never followed (`fetch.rs:50`, `:90-92`). No proxy (`fetch.rs:51`), no cookies.
- Only HTTP 200 is accepted; any other status is refused (`fetch.rs:93-95`).
- TLS uses the platform's root certificates (`fetch.rs:23-47`).
- Playlists: at most 8 MiB (`fetch.rs:14`), a 20 s timeout per request (`fetch.rs:19`), and the body must be valid UTF-8, or it is `malformed` (`fetch.rs:68`). The master is fetched and checked first, then each of its `children` as `media`, before the player opens anything (`session.rs` `open_until`). All checks share a 60 s deadline (`player/pending.rs:18`).
- External subtitles on a converted stream are fetched the same way, from the server's origin with no credential query (`session.rs:137-141`), at most 64 MiB each and 96 MiB per session (`fetch.rs:16`, `:18`), with a 45 s timeout (`fetch.rs:21`).
  - The body is refused if it echoes the token (`session.rs:107`).
  - It is refused if it names a playlist or reference format anywhere, in any ASCII case: `#extm3u`, `#ext-x-`, `#extinf`, `# mpv edl`, `edl://`, `[playlist]`, `ffconcat`, `<asx`, `<smil`, `[reference]` (`subtitle.rs:16-30`).
  - It is accepted only if it starts like a known format, after an optional UTF-8 BOM: PGS (`PG` magic), WebVTT, ASS/SSA (`[script info]`), SubViewer (`[information]`), MicroDVD (`{`), or SubRip (a first line of digits) (`subtitle.rs:13`, `:31-46`).
  - A subtitle that cannot be fetched (network, status, or size) is left out; one that fails a check fails the launch (`session.rs:58-66`).

### Using it in a new validator

1. Load the file and fail if it has fewer than 210 vectors, or if names repeat.
2. For each vector, run the validator on `body` with `baseUrl`, `serverOrigin`, `token`, and `playlistKind`. Do no network I/O.
3. Compare the verdict and, for a refusal, the reason code.
4. For an acceptance, compare `children`. A validator that writes a copy for the player compares `servedBody` byte for byte. A validator that hands a parsed playlist to its player (Media3) must hand it only the absolute URIs in `servedBody`, resolved the way the player will resolve them, and must drop the tags `servedBody` leaves out.
5. Make no error message carry the body, a URI, or the token.

### Changing it

- Add a vector here first and run `pnpm test`. Once a native validator exists (T8-08), a vector that disagrees with it fails the build. Until then, check a new vector against the Rust validator at the tag (its `playlist_vectors` test).
- Update the count in `hls-playlist-vectors.test.ts`, the count and SHA-256 above, and the count in "Using it" when the file changes.
- Never change a vector's `expected` to make a validator pass. A rule change is an architecture change (`ARCHITECTURE.md` invariant I2).

### Rule coverage

Each rule was deleted, one at a time, from a scratch copy of the Rust validator, and the vectors were run against it. Every deletion fails at least one vector. Where a rule is enforced in more than one place (same-origin also by the written-prefix check, user info also by the ambiguity check, a trailing dot also by the origin check), every layer was deleted together. Counts are from the run at 207 vectors; the layered rows and "dangling tag at the end" were re-run at 210.

| Rule deleted | Vectors that fail | For example |
| --- | --- | --- |
| credential query in a URI | 1 | `segment URI with a credential name and no value` |
| fragment | 2 | `segment URI refused: fragment`; `segment URI refused: empty fragment` |
| whitespace, control, backslash | 7 | `segment URI refused: leading space`; `segment URI refused: inner space` |
| ambiguous: whole check | 13 | `segment URI refused: same scheme without slashes`; `segment URI refused: scheme then host without slashes` |
| ambiguous: scheme without // | 3 | `segment URI refused: same scheme without slashes`; `segment URI refused: scheme then host without slashes` |
| ambiguous: host as parsed | 4 | `segment URI refused: hexadecimal IPv4 spelling of the server`; `segment URI refused: octal IPv4 spelling of the server` |
| body credential scan | 31 | `segment URI with credential query ApiKey`; `segment URI with credential query api_key` |
| credential name boundary | 1 | `segment URI: names that only contain a credential name` |
| decode fail-closed | 3 | `credential name percent-encoded five times`; `harmless value that still decodes after four rounds` |
| non-ASCII case folding | 1 | `credential name with a dotless i that case-folds to ASCII` |
| token echo | 5 | `body echoes the token in a segment URI`; `body echoes the token in another case` |
| kind check | 2 | `media playlist fetched as the master`; `master playlist fetched as a variant` |
| header first | 2 | `structure: byte order mark before the header`; `structure: space before the header` |
| control characters | 4 | `structure: NUL in a segment URI`; `structure: bell character in a comment` |
| input line length | 2 | `structure: comment of 4001 bytes`; `structure: dropped tag of 4001 bytes` |
| served line length | 1 | `structure: served line longer than 4000 bytes after resolution` |
| tag characters | 2 | `structure: tag with a lower-case letter`; `structure: tag with an underscore` |
| comment URI= count | 1 | `URI= in a comment` |
| URI= count | 4 | `second URI= hidden in another attribute value`; `URI= in a comment` |
| EXT-X-DEFINE | 2 | `EXT-X-DEFINE in an otherwise valid master`; `EXT-X-DEFINE in an otherwise valid media playlist` |
| second header | 1 | `structure: second header` |
| no resource in STREAM-INF or START | 6 | `EXT-X-STREAM-INF attribute names a resource: URI=main.m3u8`; `EXT-X-STREAM-INF attribute names a resource: SERVER-URI=steer.json` |
| ignored master tags checked | 4 | `other origin in master EXT-X-I-FRAME-STREAM-INF URI`; `other origin in master EXT-X-SESSION-KEY URI` |
| ignored media tags checked | 3 | `other origin in media EXT-X-PART URI`; `other origin in media EXT-X-PRELOAD-HINT URI` |
| unknown tags checked | 3 | `other origin in master unknown tag attribute holding a URL`; `other origin in media EXT-X-DATERANGE X-ASSET-URI` |
| unknown non-list tag with // | 1 | `other origin in master unknown tag value holding a URL` |
| rendition URI is a child | 1 | `audio rendition with a URI is a child playlist` |
| subtitle renditions refused | 2 | `subtitle rendition with a same-origin URI`; `subtitle rendition without a URI` |
| trickplay refused | 1 | `trickplay image stream with a same-origin URI` |
| MAP and KEY need a URI | 2 | `structure: EXT-X-MAP with no URI`; `EXT-X-KEY METHOD=AES-128 without a URI` |
| KEY METHOD=NONE needs none | 1 | `EXT-X-KEY METHOD=NONE needs no URI` |
| STREAM-INF twice | 1 | `structure: two STREAM-INF tags in a row` |
| EXTINF twice | 1 | `structure: two EXTINF in a row` |
| stray URI line | 1 | `structure: tag shifted by a leading space becomes a URI line` |
| dangling tag at the end | 2 | `structure: STREAM-INF left without its URI after a complete variant`; `structure: EXTINF left without its URI after a complete segment` |
| master and media not mixed | 1 | `structure: master and media tags mixed` |
| at most 16 children | 1 | `structure: seventeen variants` |
| complete media playlist | 2 | `media playlist without EXT-X-ENDLIST`; `event playlist without EXT-X-ENDLIST` |
| CR line ends | 2 | `jellyfin media playlist with CRLF line ends`; `jellyfin media playlist with lone CR line ends` |
| trim only space and tab | 2 | `segment URI refused: trailing no-break space`; `segment URI refused: trailing line separator` |
| segment URI written absolute | 26 | `jellyfin fMP4 media playlist`; `jellyfin media playlist on an https server with a base path` |
| MAP and KEY URI written absolute | 6 | `jellyfin fMP4 media playlist`; `jellyfin media playlist on an https server with a base path` |
| attributes: repeated name | 1 | `EXT-X-MAP attribute list refused: "URI=\"a\",URI=\"b\""` |
| attributes: quoted characters | 2 | `EXT-X-MAP URI with a backslash is not an attribute list`; `EXT-X-MAP URI with a tab is not an attribute list` |
| attributes: plain characters | 2 | `EXT-X-MAP attribute list refused: "URI=a b"`; `EXT-X-MAP attribute list refused: "URI=a\"b"` |
| attributes: trailing comma | 2 | `EXT-X-MAP attribute list refused: "URI=\"a\","`; `EXT-X-STREAM-INF attribute list with a trailing comma` |
| resource by shape | 8 | `other origin in master unknown tag attribute holding a URL`; `rendition NAME holding a double slash names a resource` |
| display text is not a URL | 1 | `attribute list with quoted and plain values is written back unchanged` |
| same-origin (origin and prefix) | 25 | `other origin in master variant URI line`; `other origin in master EXT-X-I-FRAME-STREAM-INF URI` |
| scheme (origin, prefix, scheme) | 7 | `jellyfin media playlist on an https server with a base path`; `jellyfin master on an https server with a base path` |
| user info (both layers) | 3 | `segment URI refused: empty user info`; `segment URI refused: empty user info, scheme-relative` |
| ambiguous: empty user info | 3 | `segment URI refused: empty user info`; `segment URI refused: empty user info, scheme-relative` |
| ambiguous: percent in host (both layers) | 5 | `segment URI refused: hexadecimal IPv4 spelling of the server`; `segment URI refused: octal IPv4 spelling of the server` |
| ambiguous: trailing dot (all layers) | 6 | `jellyfin media playlist on an https server with a base path`; `jellyfin master on an https server with a base path` |
| ambiguous: port spelling (both layers) | 1 | `segment URI refused: port with a leading zero` |

### Rust-only tests

These lived in Rust at the tag, because a vector cannot express them; a native validator needs its own equivalents:

- `playlist_tests.rs`: `hls_jellyfin_master_points_its_variant_at_the_loopback_copy` and `hls_renditions_with_a_uri_become_loopback_children` check the desktop loopback swap of child URLs.
- `uri_tests.rs`: `hls_uris_refuse_credential_queries_and_tabs_on_their_own` checks that `resolve_same_origin` refuses a credential query and a trailing tab by itself. Inside a playlist, the body credential scan refuses the first, line trimming removes the second from a URI line, and a quoted attribute refuses it as a control character (`malformed`).
- `session_tests.rs`, `subtitle_tests.rs`, `loopback_tests.rs`: fetching, redirects, status and size limits, subtitles, and the loopback server ("Fetch rules" above).
