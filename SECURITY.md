# Security policy

## Reporting a vulnerability

Report vulnerabilities privately through GitHub: **Security → Report a vulnerability** on this repository. Do not open a public issue.

Never include real Jellyfin access tokens, passwords, or authenticated URLs in a report. Replace them with placeholders.

## In scope

- Leaks of Jellyfin tokens, passwords, authenticated URLs, or play-session IDs
- Any path that causes the Jellyfin server to transcode or remux
- Ways to run arbitrary mpv commands, options, or scripts through Fluster
- Weaknesses in server URL, subtitle URL, or credential validation
- Supply-chain issues in the release AppImage or DMG

## Supported versions

Only the latest release and `main` receive fixes.

See `docs/security.md` for the security design.
