# 0001: Allow plain HTTP for private-LAN Jellyfin servers after confirmation

- Status: Accepted
- Date: 2026-11-07
- Decided by: the user (task P0-11); implementation is task P0-12
- Touches invariants: I4 (tokens), I5 (transport), I6 (subtitle URLs)

## Context

Fluster accepts `http://` only for `localhost` and `127.0.0.1` (`normalizeServerUrl` in `src/lib/jellyfin/gateway.ts`; `parse_allowed_media_url` in `src-tauri/src/mpv.rs`). Every other server must use HTTPS.

Most home Jellyfin servers are reached at a LAN address over HTTP. LAN discovery replies (UDP 7359) usually carry an `http://` address (ARCHITECTURE.md §3, Discovery row). Under the current rule, those servers can't be used at all.

Plain HTTP sends the password (`AuthenticateByName`), the access token (`Authorization` header), and the media without encryption. Anyone who can see the network traffic can read them. On a home LAN the user can judge that risk. On the public internet, Fluster can't.

## Decision

Fluster sorts every server URL into one of three host classes. It does this before it sends any request.

| Class | Hosts | `http://` / `ws://` |
|---|---|---|
| Loopback | `localhost`, `127.0.0.0/8` ([RFC 1122 §3.2.1.3](https://www.rfc-editor.org/rfc/rfc1122#section-3.2.1.3)), `::1` ([RFC 4291 §2.5.3](https://www.rfc-editor.org/rfc/rfc4291#section-2.5.3)) | Allowed without confirmation. The traffic never leaves the device. |
| Private LAN | `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16` ([RFC 1918](https://www.rfc-editor.org/rfc/rfc1918)); `169.254.0.0/16` ([RFC 3927](https://www.rfc-editor.org/rfc/rfc3927)); `fc00::/7` ([RFC 4193](https://www.rfc-editor.org/rfc/rfc4193)); `fe80::/10` ([RFC 4291 §2.5.6](https://www.rfc-editor.org/rfc/rfc4291#section-2.5.6)); names ending in `.local` ([RFC 6762](https://www.rfc-editor.org/rfc/rfc6762)) | Allowed after a one-time confirmation for each server |
| Public | Everything else | Refused before any request is sent |

HTTPS is allowed for every class, as it is today. Credentials in URLs stay refused (I5). Before this decision the loopback class held only `localhost` and `127.0.0.1`. It now includes all of `127.0.0.0/8` and `::1`.

### Edge cases P0-12 must handle

1. **Classify the literal host, never a DNS answer.** A DNS name is public unless it is `localhost` or ends in `.local`. That holds even if the name resolves to a private address today. DNS answers can change between the check and the request, and a rebinding attack can make that happen on purpose. So `http://nas.home.arpa`, `http://jellyfin.lan`, and a bare `http://nas` are refused. The user can type the IP address or a `.local` name instead.
2. **Classify the parsed host, not the typed string.** WHATWG URL parsing (TypeScript `URL`, the Rust `url` crate) normalizes the host first. For example, `http://3232235777/` becomes `192.168.1.1`, and hex or octal IPv4 forms are normalized too. Hostnames are compared case-insensitively. A `.local` name may end in one trailing dot (`nas.local.`), but `local` on its own is not a valid host.
3. **IPv4-mapped IPv6** (`::ffff:0:0/96`, RFC 4291 §2.5.5.2) is classified by the IPv4 address inside it. `[::ffff:192.168.1.5]` is private LAN, and `[::ffff:8.8.8.8]` is public. Every other IPv6 transition form is public, including NAT64 `64:ff9b::/96`, 6to4, and IPv4-compatible addresses. So are the unspecified addresses `0.0.0.0` and `::`. CGNAT `100.64.0.0/10` (used by Tailscale) is public; see open questions.
4. **Ports don't affect the class.** Any port is allowed. The confirmation is stored per origin, and the origin includes the port, so `http://192.168.1.5:8096` and `http://192.168.1.5:8920` each need their own confirmation.
5. **IPv6 zone identifiers.** WHATWG URLs can't express `fe80::1%eth0`. Fluster won't try to support them, so link-local IPv6 works only where the OS can route it without a zone. Fluster doesn't add a parser of its own.
6. **Order of checks.** First the URL is normalized and classified. A public `http://` host is refused at this step, with no request sent. A private-LAN host is then probed with an unauthenticated `GET /System/Info/Public` to read the server `Id`. If no stored confirmation matches, the user is asked to confirm. Only then do `AuthenticateByName` or any request carrying a token run.
7. **Stored confirmation.** The confirmation is keyed by the pair (server `Id`, URL origin). If a different `Id` answers at a confirmed origin, the user must confirm again, and so must a known `Id` at a new origin. The record holds no secret, so it may be stored as a non-secret preference. It must never be stored with or derived from a token. Removing a saved server removes its confirmation.
8. **Redirects.** The gateway must never follow a cross-origin redirect on a request that carries a token. This covers HTTP→HTTPS, HTTPS→HTTP, and changes of host or port. The simplest conforming implementation follows no redirects on authenticated requests and treats one as an error. That way a server, or anyone on the path, can't move the token to another host. A redirect from the probe is not followed either. The user is told to enter the final address, which goes through classification like any other.
9. **Every URL for the server follows the same rule.** This includes the base URL, stream URLs, external subtitle URLs, and image URLs. It also covers addresses from discovery replies. A discovered public `http://` address is shown as refused and is never probed.
10. **Rust URL policy.** `parse_allowed_media_url` accepts `http://` for the loopback and private-LAN classes under the same classification as the gateway. Rust can't see the confirmation, and it doesn't need to. A load request only arrives after the gateway has signed in. Both sides should be tested against one shared table of test vectors so the two classifiers can't drift apart.
11. **Realtime socket (M5).** The socket uses `ws://` exactly where `http://` is allowed and confirmed, and `wss://` everywhere else. It is never `ws://` to a public host.
12. **WebView CSP.** Today's CSP (`src-tauri/tauri.conf.json`) lists `http:` sources only for loopback. CSP host sources can't express CIDR ranges. P0-12 must therefore either add `http:` to `connect-src`/`img-src`/`media-src` and rely on the gateway check, or send private-LAN traffic another way. That choice belongs to P0-12 and is recorded there.

### The warning

The confirmation dialog shows the server name and exact origin. It says, in plain language:

> **This server uses an unencrypted connection.** Your Jellyfin password and sign-in token will travel across your network without encryption. Anyone else on this network could read them and use your account. Continue only on a network you trust, such as your home network. Fluster will remember this choice for "{ServerName}" at {origin}.
>
> [Cancel] [Connect without encryption]

Cancel has focus by default. Pressing Escape cancels.

## Consequences

- Home servers found by discovery or typed as LAN addresses work without a reverse proxy.
- Tokens and passwords cross the LAN in clear text once the user confirms. A device on the same network can capture them. The warning states this, and Fluster doesn't hide it.
- Tokens are never sent over plain HTTP to public addresses (P0-11 acceptance 2). The check runs on the literal host before any request is made.
- Users whose LAN names aren't `.local` (`.lan`, `.home.arpa`, split-horizon DNS) must use an IP address or HTTPS.
- I5 changes from "remote servers require HTTPS" to the three-class rule above. Until P0-12 lands, the code still enforces the older, stricter rule. That rule is safe, but it blocks LAN HTTP.

## Alternatives considered

- **HTTPS only (status quo).** This is the safest option. But most home servers become unusable, LAN discovery ends up listing servers Fluster can't open, and users have to run a reverse proxy with certificates. Rejected.
- **Any `http://` host after a warning.** This is the simplest rule and covers every setup. But it lets a single click send a token in clear text across the internet, where the user can't judge the path. Rejected, because tokens must never be sent over plain HTTP to public addresses.
- **Classify by resolved IP address.** This would accept private-resolving names such as `nas.lan`. But the answer can change between the check and the request (DNS rebinding), and the check would need its own resolver in both TypeScript and Rust. Rejected in favor of literal-host classification.

## Open questions for the human

- Should CGNAT `100.64.0.0/10` (Tailscale and similar overlay networks) count as private LAN? This decision treats it as public.
- Should `.home.arpa` ([RFC 8375](https://www.rfc-editor.org/rfc/rfc8375)) join `.local`? It is reserved for home networks, but it still resolves through ordinary DNS.
- Where can the user review and revoke confirmations beyond removing the server? This waits on the saved-servers UI (P3).
- **Unverified:** whether libmpv/FFmpeg resends `http-header-fields` to a redirect's `Location` on another origin. P0-12 must check this. If it does and it can't be turned off, record the remaining risk in `docs/security.md`.
