//! The HLS URL rules in Rust, and the plans the TypeScript negotiation
//! builds (`tests/fixtures/hls-master-urls.json`) run through them.

use super::master_url::{audio_stream_index, validate_master_url, MasterRules};
use super::session::subtitle_url;
use super::HlsError;
use crate::model::{Delivery, HlsMediaKind, PlaybackPlan};
use url::Url;

const ITEM: &str = "0123456789abcdef0123456789abcdef";
const VECTORS: &str = include_str!("../../../../tests/fixtures/hls-master-urls.json");

fn check(url: &str, server: &str, kind: HlsMediaKind) -> Result<Url, HlsError> {
    let server = Url::parse(server).expect("server URL");
    validate_master_url(
        url,
        &MasterRules {
            server: &server,
            item_id: ITEM,
            media_source_id: "m",
            play_session_id: "p",
            media_kind: kind,
        },
    )
}

fn plan_rules<'a>(plan: &'a PlaybackPlan, server: &'a Url) -> MasterRules<'a> {
    let Delivery::Hls { media_kind, .. } = &plan.delivery else {
        panic!("{}: not an hls plan", plan.item_id);
    };
    MasterRules {
        server,
        item_id: &plan.item_id,
        media_source_id: &plan.media_source_id,
        play_session_id: &plan.play_session_id,
        media_kind: *media_kind,
    }
}

/// P10-04: every plan TypeScript builds from the recorded conversions, on a
/// server with and without a base path, deserializes as Rust's launch plan
/// and passes the Rust rules; each one-step change to it is refused.
#[test]
fn hls_master_urls_from_the_typescript_rebuild_pass_the_rust_rules() {
    let table: serde_json::Value = serde_json::from_str(VECTORS).expect("valid vectors");
    let vectors = table["vectors"].as_array().expect("vectors");
    assert_eq!(vectors.len(), 44);
    let mut base_path_vectors = 0;
    for vector in vectors {
        let name = vector["name"].as_str().expect("name");
        let plan: PlaybackPlan =
            serde_json::from_value(vector["plan"].clone()).expect("a Rust launch plan");
        let Delivery::Hls { server_url, .. } = &plan.delivery else {
            panic!("{name}: not an hls plan");
        };
        let server = Url::parse(server_url).expect("server URL");
        let rules = plan_rules(&plan, &server);
        let url = validate_master_url(&plan.stream_url, &rules)
            .unwrap_or_else(|error| panic!("{name}: Rust refused the TypeScript URL: {error}"));
        assert_eq!(url.as_str(), plan.stream_url, "{name}");
        if server.path() != "/" {
            base_path_vectors += 1;
            let root = Url::parse(&server.origin().ascii_serialization()).expect("origin");
            assert_eq!(
                validate_master_url(&plan.stream_url, &plan_rules(&plan, &root)).err(),
                Some(HlsError::UnsafeMasterUrl),
                "{name}: the base path is part of the rule"
            );
        }
        for track in plan.tracks.iter().filter(|track| track.kind == "Subtitle") {
            if let Some(delivery_url) = &track.delivery_url {
                assert!(
                    subtitle_url(delivery_url, &server.origin()).is_ok(),
                    "{name}: subtitle {}",
                    track.index
                );
            }
        }
        let session = &plan.play_session_id;
        for changed in [
            plan.stream_url.replace("&EnableTrickplay=false", ""),
            format!("{}&EnableTrickplay=false", plan.stream_url),
            format!("{}&ApiKey=k", plan.stream_url),
            format!("{}&%20ApiToken=k", plan.stream_url),
            format!("{}&SubtitleMethod=Hls", plan.stream_url),
            format!("{}&MediaSourceId={}", plan.stream_url, plan.media_source_id),
            plan.stream_url
                .replace(&format!("PlaySessionId={session}"), "PlaySessionId=other"),
            plan.stream_url.replace("/master.m3u8", "/main.m3u8"),
        ] {
            assert_eq!(
                validate_master_url(&changed, &rules).err(),
                Some(HlsError::UnsafeMasterUrl),
                "{name}: {changed}"
            );
        }
    }
    assert_eq!(base_path_vectors, 22);
}

#[test]
fn hls_master_urls_follow_the_hls_url_rules() {
    let server = "http://192.168.1.5:8096";
    let good = format!(
        "{server}/videos/{ITEM}/master.m3u8?DeviceId=d&MediaSourceId=m&PlaySessionId=p&EnableTrickplay=false"
    );
    let videos = HlsMediaKind::Videos;
    for url in [
        good.clone(),
        good.replace("/videos/", "/Videos/")
            .replace("master.m3u8", "Master.m3u8"),
        good.replace(ITEM, "01234567-89AB-CDEF-0123-456789abcdef"),
        good.replace("EnableTrickplay=false", "enabletrickplay=False"),
        good.replace("MediaSourceId=m", "mediasourceid=M"),
        format!("{good}&SubtitleMethod=%20External%20"),
        format!("{good}&SubtitleMethod=encode&subtitlemethod=Drop&SubtitleMethod=Embed"),
        format!("{good}&tokenless=1&PlaySessionIdX=q"),
    ] {
        assert!(check(&url, server, videos).is_ok(), "{url}");
    }
    let audio = good.replace("/videos/", "/audio/");
    assert!(check(&audio, server, HlsMediaKind::Audio).is_ok());
    assert!(check(&audio, server, videos).is_err());
    assert!(check(&good, server, HlsMediaKind::Audio).is_err());
    // A server with a base path: the master must sit under it.
    let based = good.replace("8096/videos/", "8096/jellyfin/videos/");
    for base in [
        "http://192.168.1.5:8096/jellyfin",
        "http://192.168.1.5:8096/jellyfin/",
    ] {
        assert!(check(&based, base, videos).is_ok(), "{base}");
        assert!(check(&good, base, videos).is_err(), "{base}");
    }
    assert!(check(&based, server, videos).is_err());
    assert!(check(
        &good.replace("8096/videos/", "8096/jellyfinx/videos/"),
        "http://192.168.1.5:8096/jellyfin",
        videos
    )
    .is_err());

    for url in [
        good.replace("http://192.168.1.5", "http://8.8.8.8"),
        good.replace("http://", "http://user@"),
        good.replace("master.m3u8", "main.m3u8"),
        good.replace("master.m3u8", "x/master.m3u8"),
        good.replace(ITEM, "fedcba9876543210fedcba9876543210"),
        good.replace(ITEM, "0123456789abcdef0123456789abcdef%2e"),
        good.replace("/videos/", "/Audio/universal/"),
        good.replace("/videos/", "/items/"),
        good.replace("&EnableTrickplay=false", ""),
        good.replace("EnableTrickplay=false", "EnableTrickplay=true"),
        format!("{good}&EnableTrickplay=false"),
        format!("{good}&EnableSubtitlesInManifest=false"),
        format!("{good}&SubtitleMethod=Hls"),
        format!("{good}&SubtitleMethod=Hls%20"),
        format!("{good}&SubtitleMethod=3"),
        format!("{good}&SubtitleMethod="),
        good.replace("&MediaSourceId=m", ""),
        good.replace("MediaSourceId=m", "MediaSourceId=n"),
        format!("{good}&MediaSourceId=m"),
        good.replace("PlaySessionId=p", "PlaySessionId=q"),
        format!("{good}&PlaySessionId=q"),
        format!("{good}&ApiKey=secret"),
        format!("{good}&api_key=secret"),
        format!("{good}&%20ApiKey=secret"),
        format!("{good}&ApiToken=secret"),
        format!("{good}&AccessToken=secret"),
        format!("{good}&Api%4Bey=secret"),
        format!("{good}&Api%20Key=1"),
        format!("{good}&Tag%09=1"),
        format!("{good}#fragment"),
        good.replace("http://", "file://"),
    ] {
        assert_eq!(
            check(&url, server, videos).err(),
            Some(HlsError::UnsafeMasterUrl),
            "{url}"
        );
    }
    // The master must be on the signed-in server's origin.
    for other in [
        "http://192.168.1.6:8096",
        "https://192.168.1.5:8096",
        "http://192.168.1.5:8920",
    ] {
        assert!(check(&good, other, videos).is_err(), "{other}");
    }
    let server_url = Url::parse(server).expect("server");
    let empty = MasterRules {
        server: &server_url,
        item_id: "",
        media_source_id: "m",
        play_session_id: "p",
        media_kind: videos,
    };
    assert!(validate_master_url(&good, &empty).is_err());
}

#[test]
fn hls_master_urls_name_the_converted_audio_stream() {
    let url = |query: &str| Url::parse(&format!("https://h/videos/i/master.m3u8?{query}")).unwrap();
    assert_eq!(audio_stream_index(&url("AudioStreamIndex=2")), Some(2));
    assert_eq!(audio_stream_index(&url("audiostreamindex=%202")), Some(2));
    assert_eq!(audio_stream_index(&url("x=1")), None);
    assert_eq!(audio_stream_index(&url("AudioStreamIndex=a")), None);
    assert_eq!(
        audio_stream_index(&url("AudioStreamIndex=1&AudioStreamIndex=2")),
        None
    );
}
