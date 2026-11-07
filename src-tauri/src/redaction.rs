#[allow(dead_code)]
pub fn redact_url(value: &str) -> String {
    let Ok(mut url) = url::Url::parse(value) else {
        return "[invalid or redacted URL]".into();
    };
    if url.password().is_some() {
        let _ = url.set_password(Some("[redacted]"));
    }
    if !url.username().is_empty() {
        let _ = url.set_username("[redacted]");
    }
    if url.query().is_some() {
        url.set_query(Some("[redacted]"));
    }
    url.to_string()
}

const SENSITIVE_MARKERS: [&str; 14] = [
    "http://",
    "https://",
    "api_key=",
    "api-key=",
    "apikey=",
    "token=",
    "token:",
    "x-emby-token",
    "x-mediabrowser-token",
    "authorization",
    "bearer ",
    "password",
    "playsessionid",
    "accesstoken",
];

pub fn safe_error(value: impl std::fmt::Display) -> String {
    let text = value.to_string();
    let lowercase = text.to_ascii_lowercase();
    if SENSITIVE_MARKERS
        .iter()
        .any(|marker| lowercase.contains(marker))
    {
        "Player operation failed; sensitive URL details were redacted.".into()
    } else {
        text
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn removes_the_entire_query_string() {
        let redacted =
            redact_url("https://media.test/Videos/1/stream?api_key=secret&PlaySessionId=session");
        assert!(!redacted.contains("secret"));
        assert!(!redacted.contains("session"));
        assert!(redacted.contains("redacted"));
    }

    #[test]
    fn error_never_echoes_an_authenticated_url() {
        assert!(!safe_error("bad https://host/video?api_key=secret").contains("secret"));
    }
}
