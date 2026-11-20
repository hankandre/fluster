//! The two checks every playlist goes through: each URI must resolve to the
//! server's own origin without credentials, and the body must not mention a
//! credential parameter anywhere.

use super::HlsError;
use crate::player::network::{fold_case, has_credential_query, CREDENTIAL_QUERY_NAMES};
use percent_encoding::percent_decode_str;
use url::{Origin, Url};

/// Resolves `raw` against the playlist URL `base` and returns the absolute
/// URL that Rust writes into the served playlist. FFmpeg then reads only
/// this canonical form, never the server's spelling, so a parsing
/// difference between the url crate and FFmpeg cannot change the host.
/// Spellings that URL parsers read differently are refused before
/// resolution (`unambiguous`), so a validator built on another parser
/// reaches the same verdict.
pub(super) fn resolve_same_origin(raw: &str, base: &Url, server: &Origin) -> Result<Url, HlsError> {
    if raw.is_empty()
        || raw.chars().any(|character| {
            character.is_control() || character.is_whitespace() || character == '\\'
        })
    {
        return Err(HlsError::UnsafeUri);
    }
    let url = base.join(raw).map_err(|_| HlsError::UnsafeUri)?;
    if !unambiguous(raw, &url) {
        return Err(HlsError::UnsafeUri);
    }
    let same_origin = matches!(url.scheme(), "http" | "https") && url.origin() == *server;
    let credential_free =
        url.username().is_empty() && url.password().is_none() && !has_credential_query(&url);
    if !same_origin || !credential_free || url.fragment().is_some() {
        return Err(HlsError::UnsafeUri);
    }
    // The written form must start with exactly the server's origin.
    let prefix = format!("{}/", server.ascii_serialization());
    if !url.as_str().starts_with(&prefix) {
        return Err(HlsError::UnsafeUri);
    }
    Ok(url)
}

/// False for a URI spelling that WHATWG (the url crate), RFC 3986 parsers
/// (Media3 `UriUtil`, `java.net.URI`), and FFmpeg may read differently:
/// - a colon before the first `/`, `?`, or `#` that is not a scheme followed
///   by `//` (`http:x`, `http:/x`, `http:%2F%2Fx`, `a:b`);
/// - any user info, even empty (`http://@host/`);
/// - a host that is not written exactly as the parsed host (any ASCII case):
///   so no percent-encoding, no IDN, and only dotted-decimal IPv4 (no hex,
///   octal, short, or integer forms);
/// - a host ending in a dot;
/// - a port that is empty or not the plain decimal of the parsed port.
fn unambiguous(raw: &str, url: &Url) -> bool {
    let end = raw.find(['/', '?', '#']).unwrap_or(raw.len());
    let authority_start = match raw[..end].find(':') {
        Some(colon) => {
            let scheme = &raw[..colon];
            let valid_scheme = scheme
                .chars()
                .next()
                .is_some_and(|first| first.is_ascii_alphabetic())
                && scheme
                    .chars()
                    .all(|c| c.is_ascii_alphanumeric() || matches!(c, '+' | '-' | '.'));
            if !valid_scheme || !raw[colon + 1..].starts_with("//") {
                return false;
            }
            colon + 3
        }
        None if raw.starts_with("//") => 2,
        None => return true,
    };
    let rest = &raw[authority_start..];
    let authority = &rest[..rest.find(['/', '?', '#']).unwrap_or(rest.len())];
    if authority.contains(['@', '%']) {
        return false;
    }
    let (host, port) = if authority.starts_with('[') {
        match authority.find(']') {
            Some(close) => (&authority[..=close], &authority[close + 1..]),
            None => return false,
        }
    } else {
        match authority.rfind(':') {
            Some(colon) => (&authority[..colon], &authority[colon..]),
            None => (authority, ""),
        }
    };
    if host.is_empty()
        || host.ends_with('.')
        || Some(host.to_ascii_lowercase().as_str()) != url.host_str()
    {
        return false;
    }
    match port.strip_prefix(':') {
        None => port.is_empty(),
        Some(digits) => {
            !digits.is_empty()
                && !digits.starts_with('0')
                && digits.chars().all(|c| c.is_ascii_digit())
                && url
                    .port_or_known_default()
                    .map(|port| port.to_string())
                    .as_deref()
                    == Some(digits)
        }
    }
}

/// How many rounds of percent decoding the body checks run. A body that
/// still decodes to something new after the last round is refused, so no
/// nesting depth hides a name or the token.
const DECODE_ROUNDS: usize = 4;

/// The texts a body check looks at: the body as written and after each of
/// `DECODE_ROUNDS` rounds of percent decoding, each case-folded. `None` when
/// the body still decodes to something new after the last round.
fn decoded_forms(body: &str) -> Option<Vec<String>> {
    let mut forms = vec![fold_case(body)];
    for _ in 0..DECODE_ROUNDS {
        let last = forms.last().map(String::as_str).unwrap_or_default();
        let decoded = fold_case(&percent_decode_str(last).decode_utf8_lossy());
        if decoded == last {
            return Some(forms);
        }
        forms.push(decoded);
    }
    let last = forms.last().map(String::as_str).unwrap_or_default();
    let decoded = fold_case(&percent_decode_str(last).decode_utf8_lossy());
    (decoded == last).then_some(forms)
}

/// True when any credential parameter name (any case, `fold_case`) appears
/// followed by optional spaces or tabs and `=`, in the body as written or
/// after up to `DECODE_ROUNDS` rounds of percent decoding, or when the body
/// still decodes after the last round. A name counts only at a boundary, so
/// `PlaySessionId=` or `tokenless=` do not match.
pub(super) fn mentions_credential(body: &str) -> bool {
    match decoded_forms(body) {
        Some(forms) => forms.iter().any(|text| names_credential(text)),
        None => true,
    }
}

fn names_credential(lowercase: &str) -> bool {
    CREDENTIAL_QUERY_NAMES.iter().any(|name| {
        lowercase.match_indices(name).any(|(start, _)| {
            let before = lowercase[..start].chars().next_back();
            let at_boundary = !before
                .is_some_and(|character| character.is_ascii_alphanumeric() || character == '_');
            let after = lowercase[start + name.len()..].trim_start_matches([' ', '\t']);
            at_boundary && after.starts_with('=')
        })
    })
}

/// True when the token itself appears in `body` (any case, `fold_case`),
/// as written or after up to `DECODE_ROUNDS` rounds of percent decoding, or
/// when the body still decodes after the last round.
pub(super) fn contains_secret(body: &str, secret: &str) -> bool {
    if secret.is_empty() {
        return false;
    }
    let secret = fold_case(secret);
    match decoded_forms(body) {
        Some(forms) => forms.iter().any(|text| text.contains(&secret)),
        None => true,
    }
}
