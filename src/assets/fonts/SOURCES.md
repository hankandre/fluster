# Font sources

Both files are the unmodified `googlefonts` webfont builds (variable, `wght` axis 200 to 800), downloaded on 2026-11-08 with `gh api` from the GitHub contents API. Neither was subset or re-encoded. Licence: SIL Open Font License 1.1 (`OFL.txt`, which carries both copyright lines).

| Shipped file | Upstream repository | Commit | Upstream path | sha256 |
|---|---|---|---|---|
| `AtkinsonHyperlegibleNext-Variable.woff2` | https://github.com/googlefonts/atkinson-hyperlegible-next | `7925f50f649b3813257faf2f4c0b381011f434f1` | `fonts/webfonts/AtkinsonHyperlegibleNext[wght].woff2` | `abde1ad5cf78b9ac575ef90d991f2e9101eb0b3b6668bde9a00e2e1e27d99afd` |
| `AtkinsonHyperlegibleMono-Variable.woff2` | https://github.com/googlefonts/atkinson-hyperlegible-next-mono | `154d50362016cc3e873eb21d242cd0772384c8f9` | `fonts/webfonts/AtkinsonHyperlegibleMono[wght].woff2` | `4cf41c5cacdb2e98311929f3a482e95b2299ca34e6f389e8968a9075e355d58a` |
| `OFL.txt` | both repositories (`OFL.txt` at the root; identical apart from the first copyright line) | as above | `OFL.txt` | `56fadcb6ec7da835b807b8643bcaa16cb823865b2be00c671f949ffce665bb8d` |

Commits are the `main` heads at download time. The Mono repository is archived. To verify, run `sha256sum` on the files and compare.
