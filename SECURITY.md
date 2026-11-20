# Security policy

## Reporting a vulnerability

Report vulnerabilities privately through GitHub: **Security → Report a vulnerability** on this repository. Do not open a public issue.

Never include real access tokens, passwords, or authenticated URLs in a report. Replace them with placeholders.

## In scope

- Leaks of access tokens, passwords, authenticated URLs, or play-session IDs, in a URL, log, event, or diagnostic
- Any request that carries the token to an origin other than the signed-in server, follows a redirect, or goes through a proxy
- Any path that makes the server transcode or remux a file the device could play as stored, or converts without showing it
- Ways to drive the player with arbitrary commands, options, or headers
- Weaknesses in server URL, playlist, subtitle URL, or credential validation
- Supply-chain issues in released builds

## Supported versions

Only `main` and the latest release receive fixes. The desktop app at the tag `desktop-tauri-final` is not maintained.

See `docs/security.md` for the security design.
