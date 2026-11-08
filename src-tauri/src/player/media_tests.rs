//! The typed delivery field and what each delivery may do to a handle.

use super::*;
use crate::command_allowlist::collect_rust_files;
use crate::model::HlsMediaKind;
use crate::player::test_http::{listener, serve_routes, Route};
use crate::player::test_support::{hls_launch_request, launch_request, test_authorization};
use crate::player::version::ensure_numeric_locale;
use std::fs;
use std::path::{Path, PathBuf};

const ITEM: &str = "0123456789abcdef0123456789abcdef";
const PLAYLIST: &str = "application/vnd.apple.mpegurl";

fn headless(media: &LaunchMedia, request: &LaunchRequest) -> Option<Mpv> {
    ensure_numeric_locale().expect("numeric locale");
    let created = Mpv::with_initializer(|init| {
        init.set_option("config", false)?;
        init.set_option("vo", "null")?;
        init.set_option("ao", "null")?;
        media.configure(&init, request)
    });
    match created {
        Err(libmpv2::Error::VersionMismatch { linked, loaded }) => {
            eprintln!("SKIP media: loaded libmpv API {loaded:#x} is older than linked {linked:#x}");
            None
        }
        other => Some(other.expect("libmpv starts headless")),
    }
}

fn plan_json(delivery: serde_json::Value) -> serde_json::Value {
    let mut plan = serde_json::json!({
        "itemId": "item",
        "title": "Test video",
        "streamUrl": "https://media.example/video.mkv",
        "mediaSourceId": "source",
        "playSessionId": "session",
        "startPositionTicks": 0,
        "tracks": [],
        "playMethod": "DirectPlay",
        "conversionReasons": [],
    });
    if let (Some(plan), Some(delivery)) = (plan.as_object_mut(), delivery.as_object()) {
        plan.extend(delivery.clone());
    }
    serde_json::json!({ "plan": plan, "authorization": test_authorization().expose() })
}

/// Acceptance 1: the load request carries a typed delivery; a missing or
/// unknown one, or an hls one without its server, is refused before Rust
/// does anything.
#[test]
fn launch_requests_need_a_typed_delivery() {
    let parse = |delivery| serde_json::from_value::<LaunchRequest>(plan_json(delivery));
    let request = parse(serde_json::json!({ "delivery": "static" })).expect("static");
    assert_eq!(request.plan.delivery, Delivery::Static);
    let request = parse(serde_json::json!({
        "delivery": "hls",
        "serverUrl": "https://media.example/jellyfin",
        "mediaKind": "audio",
    }))
    .expect("hls");
    assert_eq!(
        request.plan.delivery,
        Delivery::Hls {
            server_url: "https://media.example/jellyfin".into(),
            media_kind: HlsMediaKind::Audio,
        }
    );
    for refused in [
        serde_json::json!({}),
        serde_json::json!({ "delivery": "HLS", "serverUrl": "https://m", "mediaKind": "videos" }),
        serde_json::json!({ "delivery": "progressive" }),
        serde_json::json!({ "delivery": "hls", "mediaKind": "videos" }),
        serde_json::json!({ "delivery": "hls", "serverUrl": "https://m" }),
        serde_json::json!({ "delivery": "hls", "serverUrl": "https://m", "mediaKind": "video" }),
    ] {
        assert!(parse(refused.clone()).is_err(), "{refused}");
    }
}

/// Acceptance 3: a static launch keeps `access-references` off and sets no
/// whitelist; only a launch Rust prepared as validated HLS turns them on.
#[test]
fn static_launches_keep_access_references_off() {
    let request = launch_request("http://127.0.0.1:9/Videos/i/stream?Static=true", None);
    let media = LaunchMedia::prepare(&request).expect("a static launch");
    assert_eq!(media.delivery(), MediaDelivery::Static);
    let Some(mpv) = headless(&media, &request) else {
        return;
    };
    assert!(!mpv
        .get_property::<bool>("access-references")
        .expect("references"));
    let whitelist: String = mpv.get_property("demuxer-lavf-o").expect("demuxer-lavf-o");
    assert_eq!(whitelist, "");

    let (server, origin) = listener();
    let master = format!("{origin}/videos/{ITEM}/master.m3u8");
    let _requests = serve_routes(
        server,
        vec![
            (
                format!("/videos/{ITEM}/master.m3u8"),
                Route::ok(
                    PLAYLIST,
                    "#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1\nmain.m3u8\n",
                ),
            ),
            (
                format!("/videos/{ITEM}/main.m3u8"),
                Route::ok(
                    PLAYLIST,
                    "#EXTM3U\n#EXT-X-TARGETDURATION:1\n#EXTINF:1,\n0.ts\n#EXT-X-ENDLIST\n",
                ),
            ),
        ],
    );
    let query = "?MediaSourceId=m&PlaySessionId=p&EnableTrickplay=false";
    let request = hls_launch_request(&origin, &format!("{master}{query}"), ITEM, &[]);
    let media = LaunchMedia::prepare(&request).expect("an hls launch");
    assert_eq!(media.delivery(), MediaDelivery::ValidatedHls);
    let Some(mpv) = headless(&media, &request) else {
        return;
    };
    assert!(mpv
        .get_property::<bool>("access-references")
        .expect("references"));

    // The same master URL as a static launch is only a URL: no references.
    let request = launch_request(&format!("{master}{query}"), None);
    let media = LaunchMedia::prepare(&request).expect("a static launch");
    assert_eq!(media.delivery(), MediaDelivery::Static);
}

/// Validation failures are refusals the frontend recognizes by prefix;
/// network failures are not.
#[test]
fn unsafe_conversions_are_refusals_and_network_failures_are_not() {
    for error in [
        HlsError::UnsafeMasterUrl,
        HlsError::Redirect,
        HlsError::TooLarge,
        HlsError::Malformed,
        HlsError::NotComplete,
        HlsError::UnsafeUri,
        HlsError::CredentialInPlaylist,
        HlsError::UnsafeSubtitleUrl,
        HlsError::UnsafeSubtitle,
    ] {
        let message = MpvError::from(error).to_string();
        assert!(
            message.starts_with("Fluster refused the converted stream:"),
            "{message}"
        );
    }
    for error in [HlsError::Fetch, HlsError::Status(502), HlsError::Loopback] {
        let message = MpvError::from(error).to_string();
        assert!(message.starts_with("Could not start the converted stream:"));
    }
}

fn production_sources() -> Vec<(PathBuf, String)> {
    let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("src");
    let mut files = Vec::new();
    collect_rust_files(&root.join("player"), &mut files);
    files
        .into_iter()
        .filter(|path| {
            let name = path
                .file_name()
                .and_then(|name| name.to_str())
                .unwrap_or("");
            let test_only = ["test_http.rs", "test_support.rs", "redaction_canary.rs"]
                .contains(&name)
                || name.ends_with("_tests.rs")
                || path.components().any(|part| {
                    matches!(
                        part.as_os_str().to_str(),
                        Some("media_auth_wire" | "tracks")
                    )
                })
                || name == "media_auth_wire.rs";
            !test_only
        })
        .map(|path| {
            let source = fs::read_to_string(&path).expect("readable source");
            // Drop inline `#[cfg(test)] mod tests { … }` bodies (always last).
            let source = match source.find("#[cfg(test)]\nmod tests {") {
                Some(start) => source[..start].to_string(),
                None => source,
            };
            (path, source)
        })
        .collect()
}

/// Guardian note for P10-04: a plain `loadfile` on a `ValidatedHls` handle
/// reopens the playlist-demuxer leak. Production code loads media only
/// through the two typed loaders in `network.rs`, which `LaunchMedia` picks
/// by delivery, and only `LaunchMedia` turns on references.
#[test]
fn loadfile_is_issued_only_by_the_two_typed_loaders() {
    let sources = production_sources();
    assert!(sources.len() > 10, "the scan found too few files");
    for (path, source) in &sources {
        let name = path
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("");
        let loads = source.matches("\"loadfile\"").count();
        let expected = if name == "network.rs" { 2 } else { 0 };
        assert_eq!(loads, expected, "{}", path.display());
        for command in [
            "\"loadlist\"",
            "\"playlist-play-index\"",
            "\"playlist-next\"",
        ] {
            assert!(!source.contains(command), "{}: {command}", path.display());
        }
        if source.contains("MediaDelivery::ValidatedHls") {
            assert!(
                ["network.rs", "media.rs"].contains(&name),
                "{} picks an HLS handle",
                path.display()
            );
        }
    }
}
