//! The two checks every playlist goes through: each URI must resolve to the
//! server's own origin without credentials, and the body must not mention a
//! credential parameter anywhere.

use super::HlsError;
use crate::player::network::{has_credential_query, CREDENTIAL_QUERY_NAMES};
use percent_encoding::percent_decode_str;
use url::{Origin, Url};

/// Resolves `raw` against the playlist URL `base` and returns the absolute
/// URL that Rust writes into the served playlist. FFmpeg then reads only
/// this canonical form, never the server's spelling, so a parsing
/// difference between the url crate and FFmpeg cannot change the host.
pub(super) fn resolve_same_origin(raw: &str, base: &Url, server: &Origin) -> Result<Url, HlsError> {
    if raw.is_empty()
        || raw.chars().any(|character| {
            character.is_control() || character.is_whitespace() || character == '\\'
        })
    {
        return Err(HlsError::UnsafeUri);
    }
    let url = base.join(raw).map_err(|_| HlsError::UnsafeUri)?;
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

/// True when any credential parameter name (any case) appears followed by
/// `=`, in the body as written or after up to three rounds of percent
/// decoding. A name counts only at a boundary, so `PlaySessionId=` or
/// `tokenless=` do not match.
pub(super) fn mentions_credential(body: &str) -> bool {
    let mut text = body.to_ascii_lowercase();
    for _ in 0..4 {
        if names_credential(&text) {
            return true;
        }
        let decoded = percent_decode_str(&text)
            .decode_utf8_lossy()
            .to_ascii_lowercase();
        if decoded == text {
            return false;
        }
        text = decoded;
    }
    names_credential(&text)
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

/// True when the token itself appears in `body`, as written or after up to
/// three rounds of percent decoding, ignoring ASCII case.
pub(super) fn contains_secret(body: &str, secret: &str) -> bool {
    if secret.is_empty() {
        return false;
    }
    let secret = secret.to_ascii_lowercase();
    let mut text = body.to_ascii_lowercase();
    for _ in 0..4 {
        if text.contains(&secret) {
            return true;
        }
        let decoded = percent_decode_str(&text)
            .decode_utf8_lossy()
            .to_ascii_lowercase();
        if decoded == text {
            return false;
        }
        text = decoded;
    }
    text.contains(&secret)
}
