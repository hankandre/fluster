//! The signed-in Jellyfin `Authorization` header, validated once for every
//! Rust consumer: the server socket and libmpv media requests.

use serde::Deserialize;
use tokio_tungstenite::tungstenite::http::HeaderValue;

const MAX_AUTHORIZATION_BYTES: usize = 4096;

/// A `MediaBrowser …` header that carries a token. The value is a secret:
/// `Debug` prints a placeholder and nothing serializes it.
#[derive(Clone, Deserialize, PartialEq)]
#[serde(try_from = "String")]
pub struct MediaBrowserAuthorization(String);

#[derive(Debug, PartialEq)]
pub struct InvalidAuthorization;

impl std::fmt::Display for InvalidAuthorization {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str("The request needs a signed-in Jellyfin authorization header.")
    }
}

impl MediaBrowserAuthorization {
    pub fn parse(value: &str) -> Result<Self, InvalidAuthorization> {
        let is_media_browser_header =
            value.starts_with("MediaBrowser ") && value.contains("Token=\"");
        if !is_media_browser_header || value.len() > MAX_AUTHORIZATION_BYTES {
            return Err(InvalidAuthorization);
        }
        // HeaderValue refuses CR, LF, NUL, and other control characters, so
        // the value cannot end the header line or add another header.
        HeaderValue::from_str(value).map_err(|_| InvalidAuthorization)?;
        Ok(Self(value.to_owned()))
    }

    /// The raw header value. Pass it only to a request's `Authorization`
    /// header; never format it into a message.
    pub fn expose(&self) -> &str {
        &self.0
    }
}

impl TryFrom<String> for MediaBrowserAuthorization {
    type Error = InvalidAuthorization;

    fn try_from(value: String) -> Result<Self, Self::Error> {
        Self::parse(&value)
    }
}

impl std::fmt::Debug for MediaBrowserAuthorization {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str("MediaBrowserAuthorization([redacted])")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const CANARY: &str = "CANARY-auth-5c2e";

    fn header() -> String {
        format!("MediaBrowser Client=\"Fluster\", Device=\"Linux\", DeviceId=\"d\", Version=\"0.1.0\", Token=\"{CANARY}\"")
    }

    #[test]
    fn accepts_a_signed_in_media_browser_header() {
        let authorization = MediaBrowserAuthorization::parse(&header()).expect("valid header");
        assert_eq!(authorization.expose(), header());
    }

    #[test]
    fn rejects_headers_without_a_token_or_the_media_browser_scheme() {
        for value in [
            String::new(),
            "MediaBrowser Client=\"Fluster\"".to_string(),
            format!("Bearer {CANARY}"),
            format!("Emby Token=\"{CANARY}\""),
            format!("mediabrowser Token=\"{CANARY}\""),
        ] {
            assert_eq!(
                MediaBrowserAuthorization::parse(&value),
                Err(InvalidAuthorization)
            );
        }
    }

    #[test]
    fn rejects_control_characters_and_oversized_headers() {
        for value in [
            format!("{}\r\nX-Injected: 1", header()),
            format!("{}\nX-Injected: 1", header()),
            format!("{}\r", header()),
            format!("{}\0", header()),
            format!("{}{}", header(), "a".repeat(MAX_AUTHORIZATION_BYTES)),
        ] {
            assert_eq!(
                MediaBrowserAuthorization::parse(&value),
                Err(InvalidAuthorization)
            );
        }
    }

    #[test]
    fn debug_and_errors_never_show_the_token() {
        let authorization = MediaBrowserAuthorization::parse(&header()).expect("valid header");
        assert!(!format!("{authorization:?}").contains(CANARY));
        let error = serde_json::from_value::<MediaBrowserAuthorization>(serde_json::json!(
            format!("{}\r\nX: {CANARY}", header())
        ))
        .expect_err("CR/LF must be rejected");
        assert!(!error.to_string().contains(CANARY));
    }
}
