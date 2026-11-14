use super::diagnostics::update_decode_label;
use super::network::validate_playback_urls;
use super::properties::{apply_property, RuntimeState};
use super::test_support::launch_request;
use super::MpvError;
use crate::model::{PlaybackSnapshot, PlayerEvent};
use crate::redaction::safe_error;
use libmpv2::events::PropertyData;

const CANARY: &str = "CANARY-7f3a9c1e5b";

/// Every place the code knows a credential can sit inside a URL.
fn canary_urls() -> Vec<String> {
    let mut urls = vec![
        format!("https://user:{CANARY}@media.example/video.mkv"),
        format!("https://{CANARY}@media.example/video.mkv"),
    ];
    for key in ["api_key", "ApiKey", "access_token", "token", "X-Emby-Token"] {
        urls.push(format!(
            "https://media.example/Videos/1/stream?{key}={CANARY}"
        ));
        urls.push(format!(
            "https://media.example/Videos/1/stream?Static=true&{key}={CANARY}&PlaySessionId=s"
        ));
        urls.push(format!("http://127.0.0.1:8096/video.mkv?{key}={CANARY}"));
    }
    urls
}

/// Texts libmpv or the platform might produce around a URL.
fn error_texts(url: &str) -> Vec<String> {
    vec![
        url.to_string(),
        format!("loadfile failed for {url}"),
        format!("Failed to open {url}: HTTP error 403"),
        format!("Failed to open {url}."),
        format!("failed to open ({url})"),
        // Variants without a scheme: only the credential markers can catch these.
        // (Userinfo without a scheme is not a form libmpv reports.)
        if url.contains('?') {
            url.replacen("https://", "", 1).replacen("http://", "", 1)
        } else {
            "unrelated failure".to_string()
        },
        format!("GET /Videos/1/stream?PlaySessionId={CANARY}&Static=true failed"),
    ]
}

fn assert_clean(label: &str, text: &str) {
    assert!(
        !text.contains(CANARY),
        "canary leaked through {label}: {text}"
    );
}

fn assert_error_clean(label: &str, error: &MpvError) {
    assert_clean(&format!("{label} to_string"), &error.to_string());
    assert_clean(&format!("{label} Debug"), &format!("{error:?}"));
}

#[test]
fn redaction_canary_stays_out_of_url_carrying_error_variants() {
    for url in canary_urls() {
        for text in error_texts(&url) {
            assert_error_clean("Initialize", &MpvError::Initialize(safe_error(&text)));
            assert_error_clean("Command", &MpvError::Command(safe_error(&text)));
        }
    }
}

#[test]
fn redaction_canary_stays_out_of_credential_header_errors() {
    for text in [
        format!("request failed, X-Emby-Token: {CANARY}"),
        format!("Authorization: MediaBrowser Client=\"Fluster\", Token=\"{CANARY}\""),
        format!("Authorization: Bearer {CANARY}"),
        format!("bad query ?ApiKey={CANARY}&x=1"),
        format!("bad query ?access_token={CANARY}"),
        format!("X-MediaBrowser-Token: {CANARY}"),
        format!("token: \"{CANARY}\""),
        format!("api-key={CANARY}"),
        format!("password {CANARY}"),
        format!("{{\"AccessToken\":\"{CANARY}\"}}"),
        format!("PlaySessionId {CANARY}"),
    ] {
        assert_error_clean("Command", &MpvError::Command(safe_error(&text)));
    }
}

#[test]
fn redaction_canary_stays_out_of_validation_failures() {
    for url in canary_urls() {
        for request in [
            launch_request(&url, None),
            launch_request("https://media.example/video.mkv", Some(&url)),
        ] {
            if let Err(error) = validate_playback_urls(&request) {
                assert_error_clean("validate_playback_urls", &error);
            }
        }
    }
    // The rejected-URL variants must exist for at least the userinfo cases.
    let error = validate_playback_urls(&launch_request(&canary_urls()[0], None)).unwrap_err();
    assert!(matches!(error, MpvError::UnsafeStreamUrl));
}

#[test]
fn redaction_canary_stays_out_of_redact_url() {
    for url in canary_urls() {
        assert_clean("redact_url", &crate::redaction::redact_url(&url));
    }
    assert_clean(
        "redact_url (unparseable)",
        &crate::redaction::redact_url(&format!("not a url?api_key={CANARY}")),
    );
}

#[test]
fn redaction_canary_stays_out_of_serialized_snapshots_and_events() {
    // Snapshots are built from libmpv properties and fixed text, never from
    // plan URLs. Serialize one produced by the production decode-label
    // builder and assert the canary (a plan field) is absent.
    let request = launch_request(&canary_urls()[2], None);
    let mut snapshot = PlaybackSnapshot::default();
    snapshot.diagnostics.hwdec_current = Some("no".into());
    update_decode_label(&mut snapshot);
    // Apply every stream property with non-canary values, as libmpv would.
    let mut state = RuntimeState::new();
    state.snapshot = snapshot;
    let stream_properties = [
        ("video-params/gamma", PropertyData::Str("pq")),
        ("audio-params/channel-count", PropertyData::Int64(6)),
        ("audio-params/samplerate", PropertyData::Int64(48000)),
        ("audio-out-params/format", PropertyData::Str("spdif-eac3")),
        ("audio-out-params/channel-count", PropertyData::Int64(6)),
        ("demuxer-cache-time", PropertyData::Double(12.5)),
    ];
    for (name, data) in stream_properties {
        apply_property(&mut state, name, data);
    }
    let snapshot = state.snapshot;
    assert!(snapshot.buffered_seconds.is_some());
    let events = [
        PlayerEvent::Loaded {
            snapshot: snapshot.clone(),
        },
        PlayerEvent::State {
            snapshot: snapshot.clone(),
            cause: None,
        },
        PlayerEvent::Ended {
            snapshot: snapshot.clone(),
            reason: "error".into(),
        },
    ];
    for event in events {
        assert_clean(
            "serialized PlayerEvent",
            &serde_json::to_string(&event).expect("event serializes"),
        );
    }
    assert_clean(
        "serialized PlaybackSnapshot",
        &serde_json::to_string(&snapshot).expect("snapshot serializes"),
    );
    assert!(request.plan.stream_url.contains(CANARY));
}
