//! The language-neutral HLS playlist vectors (`tests/fixtures/hls-playlists.json`,
//! decision 0003) run through the real validator. Every validator that
//! replaces this one must give the same verdict and reason for each vector.

use super::playlist::Kind;
use super::session::check_playlist_body;
use super::HlsError;
use serde::Deserialize;
use std::collections::HashSet;
use url::Url;

const VECTORS: &str = include_str!("../../../../tests/fixtures/hls-playlists.json");
const VECTOR_COUNT: usize = 210;

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Table {
    #[allow(dead_code)]
    description: String,
    vectors: Vec<Vector>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct Vector {
    name: String,
    rule: String,
    playlist_kind: PlaylistKind,
    body: String,
    base_url: String,
    server_origin: String,
    /// The signed-in token; a body that echoes it is refused.
    #[serde(default)]
    token: Option<String>,
    expected: Expected,
}

#[derive(Clone, Copy, Deserialize, PartialEq, Eq, Debug)]
#[serde(rename_all = "lowercase")]
enum PlaylistKind {
    Master,
    Media,
}

#[derive(Deserialize, PartialEq, Eq, Debug)]
#[serde(tag = "verdict", rename_all = "lowercase", deny_unknown_fields)]
enum Expected {
    #[serde(rename_all = "camelCase")]
    Accept {
        served_body: String,
        /// Required for a master, absent for a media playlist.
        #[serde(default)]
        children: Option<Vec<String>>,
    },
    Refuse {
        reason: Reason,
    },
}

#[derive(Clone, Copy, Deserialize, PartialEq, Eq, Debug)]
#[serde(rename_all = "kebab-case")]
enum Reason {
    Malformed,
    NotComplete,
    UnsafeUri,
    CredentialInPlaylist,
}

struct Accepted {
    served_body: String,
    children: Vec<String>,
}

fn reason(error: &HlsError) -> Reason {
    match error {
        HlsError::Malformed => Reason::Malformed,
        HlsError::NotComplete => Reason::NotComplete,
        HlsError::UnsafeUri => Reason::UnsafeUri,
        HlsError::CredentialInPlaylist => Reason::CredentialInPlaylist,
        other => panic!("the playlist validator returned {other:?}"),
    }
}

/// The session's own body check (`session::check_playlist_body`), with each
/// child written as its own absolute URL instead of a loopback copy.
fn validate(vector: &Vector) -> Result<Accepted, HlsError> {
    let base = Url::parse(&vector.base_url).expect("baseUrl");
    let server = Url::parse(&vector.server_origin).expect("serverOrigin");
    assert_eq!(
        server.origin().ascii_serialization(),
        vector.server_origin,
        "{}: serverOrigin must be a bare origin",
        vector.name
    );
    let kind = match vector.playlist_kind {
        PlaylistKind::Master => Kind::Master,
        PlaylistKind::Media => Kind::Media,
    };
    let token = vector.token.as_deref().unwrap_or("");
    let playlist = check_playlist_body(&vector.body, &base, &server.origin(), token, kind)?;
    let children: Vec<String> = playlist
        .children()
        .iter()
        .map(|url| url.to_string())
        .collect();
    Ok(Accepted {
        served_body: playlist.render(&children)?,
        children,
    })
}

fn table() -> Table {
    serde_json::from_str(VECTORS).expect("tests/fixtures/hls-playlists.json matches the schema")
}

#[test]
fn hls_playlist_vectors_match_the_rust_validator() {
    let table = table();
    assert_eq!(table.vectors.len(), VECTOR_COUNT);
    let mut names = HashSet::new();
    let mut disagreements = Vec::new();
    for vector in &table.vectors {
        assert!(
            names.insert(vector.name.as_str()),
            "{}: repeated name",
            vector.name
        );
        assert!(!vector.rule.trim().is_empty(), "{}: no rule", vector.name);
        let outcome = validate(vector);
        let agrees = match (&vector.expected, &outcome) {
            (
                Expected::Accept {
                    served_body,
                    children,
                },
                Ok(accepted),
            ) => {
                assert_eq!(
                    children.is_some(),
                    vector.playlist_kind == PlaylistKind::Master,
                    "{}: children is required for a master and only for a master",
                    vector.name
                );
                *served_body == accepted.served_body
                    && children
                        .as_ref()
                        .is_none_or(|children| *children == accepted.children)
            }
            (Expected::Refuse { reason: expected }, Err(error)) => {
                for text in [error.to_string(), format!("{error:?}")] {
                    assert!(
                        !text.contains("canary") && !text.contains("secret"),
                        "{}: the error carries the credential",
                        vector.name
                    );
                }
                reason(error) == *expected
            }
            _ => false,
        };
        if !agrees {
            let actual = match &outcome {
                Ok(accepted) => format!("accept {:?}", accepted.served_body),
                Err(error) => format!("refuse {:?}", reason(error)),
            };
            disagreements.push(format!(
                "{}: expected {:?}, got {actual}",
                vector.name, vector.expected
            ));
        }
    }
    assert!(
        disagreements.is_empty(),
        "{} vectors disagree with the Rust validator:\n{}",
        disagreements.len(),
        disagreements.join("\n")
    );
}

/// The vectors use synthetic hosts only.
#[test]
fn hls_playlist_vectors_name_no_real_server() {
    for vector in table().vectors {
        for text in [&vector.base_url, &vector.server_origin] {
            let url = Url::parse(text).expect("URL");
            let host = url.host_str().unwrap_or("");
            assert!(
                host == "127.0.0.1" || host.ends_with(".example.test"),
                "{}: {text}",
                vector.name
            );
        }
    }
    assert!(!VECTORS.contains("192.168."));
}

/// The schema is closed: a misspelled key fails instead of being ignored.
#[test]
fn hls_playlist_vectors_refuse_unknown_keys() {
    let vector = r#"{"name":"n","rule":"r","playlistKind":"media","body":"","baseUrl":"http://127.0.0.1:8096/","serverOrigin":"http://127.0.0.1:8096","expected":{"verdict":"refuse","reason":"malformed"}}"#;
    assert!(serde_json::from_str::<Vector>(vector).is_ok());
    for misspelled in [
        vector.replace("\"reason\"", "\"reasons\""),
        vector.replace("\"baseUrl\"", "\"baseURL\""),
        vector.replace("\"malformed\"", "\"malformd\""),
        vector.replace(
            "{\"verdict\":\"refuse\",\"reason\":\"malformed\"}",
            "{\"verdict\":\"accept\",\"servedBody\":\"\",\"servedbody\":\"\"}",
        ),
    ] {
        assert!(
            serde_json::from_str::<Vector>(&misspelled).is_err(),
            "{misspelled}"
        );
    }
}
