use super::diagnostics::update_decode_label;
use super::network::validate_playback_urls;
use super::test_support::launch_request;
use super::MpvError;
use crate::model::{PlaybackSnapshot, PlayerEvent};
use crate::redaction::safe_error;

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
    let events = [
        PlayerEvent::Loaded {
            snapshot: snapshot.clone(),
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

#[test]
fn redaction_canary_keeps_play_session_ids_out_of_native_traces() {
    // Trace output is eprintln!/native_trace text; none of it may name a
    // session, so a play-session ID can never be logged.
    for (name, source) in [
        ("player/mod.rs", include_str!("mod.rs")),
        ("player/controller.rs", include_str!("controller.rs")),
        ("player/diagnostics.rs", include_str!("diagnostics.rs")),
        ("player/events.rs", include_str!("events.rs")),
        ("player/network.rs", include_str!("network.rs")),
        ("player/properties.rs", include_str!("properties.rs")),
        ("player/track_list.rs", include_str!("track_list.rs")),
        ("player/tracks.rs", include_str!("tracks.rs")),
        ("player/version.rs", include_str!("version.rs")),
        ("surface/linux.rs", include_str!("../surface/linux.rs")),
        ("surface/macos.rs", include_str!("../surface/macos.rs")),
    ] {
        let production = source.split("#[cfg(test)]").next().unwrap_or(source);
        for line in production.lines().filter(|line| {
            let line = line.trim_start();
            line.starts_with("eprintln!") || line.starts_with("native_trace(")
        }) {
            let lowered = line.to_ascii_lowercase();
            assert!(
                !lowered.contains("session") && !line.contains("{id}"),
                "{name} traces a session identifier: {line}"
            );
        }
    }
}
