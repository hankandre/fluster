//! A converted launch end to end, as the controller runs it: the typed
//! request, `LaunchMedia::prepare` (Rust fetches and checks every playlist
//! and subtitle), the handle options for that media, `LaunchMedia::load`,
//! and the subtitles after `FileLoaded` (P10-04 acceptance 4 to 7).

use super::hls::{server_routes, PLAYLIST};
use super::*;
use crate::model::LaunchRequest;
use crate::player::hls::HlsError;
use crate::player::media::LaunchMedia;
use crate::player::test_http::{paths, serve_routes, Route};
use crate::player::test_support::hls_launch_request;
use crate::player::MpvError;

const ITEM: &str = "0123456789abcdef0123456789abcdef";

fn videos() -> String {
    format!("/videos/{ITEM}")
}

fn master_url(origin: &str) -> String {
    format!(
        "{origin}{}/master.m3u8?MediaSourceId=m&PlaySessionId=p&AudioStreamIndex=1&EnableTrickplay=false",
        videos()
    )
}

fn master_route(variant: &str) -> (String, Route) {
    (
        format!("{}/master.m3u8", videos()),
        Route::ok(
            PLAYLIST,
            format!("#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=128000\n{variant}\n"),
        ),
    )
}

fn media_route(body: String) -> (String, Route) {
    (format!("{}/main.m3u8", videos()), Route::ok(PLAYLIST, body))
}

/// The init section and segments of `server_routes` under `/videos/{id}`,
/// listed relative to the variant as Jellyfin lists them.
fn media_playlist(second_segment: &str) -> String {
    format!(
        "#EXTM3U\n#EXT-X-VERSION:7\n#EXT-X-TARGETDURATION:1\n#EXT-X-PLAYLIST-TYPE:VOD\n\
         #EXT-X-MEDIA-SEQUENCE:0\n#EXT-X-MAP:URI=\"hls1/main/-1.mp4?PlaySessionId=p\"\n\
         #EXTINF:0.25,\nhls1/main/0.mp4?PlaySessionId=p\n\
         #EXTINF:0.25,\n{second_segment}\n#EXT-X-ENDLIST\n"
    )
}

fn is_rust_request(head: &str) -> bool {
    head.contains("\r\nuser-agent: Fluster\r\n")
}

/// The production handle for `media`, headless.
fn handle_for(media: &LaunchMedia, request: &LaunchRequest) -> Option<Mpv> {
    ensure_numeric_locale().expect("numeric locale");
    let created = Mpv::with_initializer(|init| {
        init.set_option("config", false)?;
        init.set_option("vo", "null")?;
        init.set_option("ao", "null")?;
        init.set_option("autoload-files", false)?;
        media.configure(&init, request)
    });
    match created {
        Err(libmpv2::Error::VersionMismatch { linked, loaded }) => {
            eprintln!(
                "SKIP launch: loaded libmpv API {loaded:#x} is older than linked {linked:#x}"
            );
            None
        }
        other => Some(other.expect("libmpv starts headless")),
    }
}

/// Acceptance 4: a playlist with a cross-origin URI refuses the launch
/// before any mpv handle exists, with the refusal the frontend shows as
/// `unsafe-transcoding-url`, and the second origin receives nothing.
#[test]
fn hls_launch_with_a_cross_origin_playlist_is_refused_and_contacts_nobody_else() {
    let (other, other_origin) = listener();
    let other_requests = serve_routes(other, vec![]);
    let cases = [
        (
            "variant",
            master_route(&format!("{other_origin}/main.m3u8")),
            None,
        ),
        (
            "segment",
            master_route("main.m3u8"),
            Some(media_playlist(&format!("{other_origin}/1.mp4"))),
        ),
        (
            "map",
            master_route("main.m3u8"),
            Some(media_playlist("hls1/main/1.mp4").replace(
                "hls1/main/-1.mp4?PlaySessionId=p",
                &format!("{other_origin}/init.mp4"),
            )),
        ),
    ];
    for (label, master, media) in cases {
        let (server, origin) = listener();
        let mut routes = vec![master];
        routes.extend(media.map(media_route));
        let requests = serve_routes(server, routes);
        let request = hls_launch_request(&origin, &master_url(&origin), ITEM, &[]);
        let error = match LaunchMedia::prepare(&request) {
            Err(error) => error,
            Ok(_) => panic!("{label}: the launch was not refused"),
        };
        assert!(
            matches!(error, MpvError::UnsafeConversion(HlsError::UnsafeUri)),
            "{label}: {error:?}"
        );
        assert!(error
            .to_string()
            .starts_with("Fluster refused the converted stream:"));
        assert!(!error.to_string().contains("127.0.0.1"));
        let heads = requests.lock().expect("requests mutex").clone();
        assert!(heads.iter().all(|head| is_rust_request(head)), "{label}");
    }
    thread::sleep(Duration::from_millis(200));
    assert!(
        other_requests.lock().expect("requests mutex").is_empty(),
        "the second origin was contacted"
    );
}

/// Acceptance 5: on a converted launch, Rust's master, variant, and
/// subtitle fetches and mpv's map and segment opens each carry exactly the
/// typed header; `sub-add` reads only the loopback copy; and a segment the
/// server redirects to another origin sends that origin nothing.
#[test]
fn hls_launch_sends_the_header_on_every_request_and_never_follows_a_segment_redirect() {
    let (other, other_origin) = listener();
    let other_requests = serve_routes(other, server_routes());
    let (server, origin) = listener();
    let videos = videos();
    let mut routes: Vec<(String, Route)> = server_routes()
        .into_iter()
        .filter(|(path, _)| path != "/hls1/main/1.mp4")
        .map(|(path, route)| (format!("{videos}{path}"), route))
        .collect();
    routes.push((
        format!("{videos}/hls1/main/1.mp4"),
        Route::redirect(format!("{other_origin}/hls1/main/1.mp4")),
    ));
    routes.push(master_route("main.m3u8?PlaySessionId=p"));
    routes.push(media_route(media_playlist(
        "hls1/main/1.mp4?PlaySessionId=p",
    )));
    let subtitle_path = format!("{videos}/m/Subtitles/3/0/Stream.srt");
    routes.push((
        subtitle_path.clone(),
        Route::ok(
            "text/plain",
            "1\r\n00:00:00,000 --> 00:00:00,400\r\nHello\r\n\r\n",
        ),
    ));
    let requests = serve_routes(server, routes);
    let subtitles = vec![format!("{origin}{subtitle_path}")];
    let request = hls_launch_request(&origin, &master_url(&origin), ITEM, &subtitles);

    let media = LaunchMedia::prepare(&request).expect("a valid converted launch");
    let Some(mut mpv) = handle_for(&media, &request) else {
        return;
    };
    media.load(&mpv).expect("loadfile");
    assert!(matches!(wait_for_load(&mut mpv), LoadOutcome::Loaded));
    assert_eq!(media.load_subtitles(&mpv), vec![3]);
    let tracks = media.read_tracks(&mpv, &[3]);
    let mapped: Vec<_> = tracks
        .iter()
        .map(|track| (track.kind.as_str(), track.jellyfin_index))
        .collect();
    eprintln!("hls launch tracks: {mapped:?}");
    assert!(mapped.contains(&("Audio", Some(1))), "{mapped:?}");
    assert!(mapped.contains(&("Subtitle", Some(3))), "{mapped:?}");
    settle(&mut mpv);

    let heads = requests.lock().expect("requests mutex").clone();
    let fetched = paths(&requests);
    eprintln!("hls launch server requests: {fetched:?}");
    let value = test_authorization().expose().to_string();
    let mut rust = Vec::new();
    for head in &heads {
        let target = head.split_whitespace().nth(1).unwrap_or("").to_string();
        if is_rust_request(head) {
            assert_eq!(
                authorization_lines(head),
                vec![format!("authorization: {value}").as_str()],
                "{target}"
            );
            rust.push(target.split('?').next().unwrap_or("").to_string());
        } else {
            assert!(!target.contains(".m3u8"), "mpv read a server playlist");
            assert!(!target.contains("Subtitles"), "sub-add went to the server");
            assert_single_exact_header(head);
        }
    }
    assert_eq!(
        rust,
        vec![
            format!("{videos}/master.m3u8"),
            format!("{videos}/main.m3u8"),
            subtitle_path,
        ]
    );
    for segment in ["-1.mp4", "0.mp4", "1.mp4"] {
        let path = format!("{videos}/hls1/main/{segment}?PlaySessionId=p");
        assert!(fetched.contains(&path), "libmpv never asked for {path}");
    }
    assert!(
        other_requests.lock().expect("requests mutex").is_empty(),
        "a redirected segment reached the second origin"
    );
}

/// Acceptance 7. `FLUSTER_HLS_LAUNCH_FILE` names a private JSON file
/// `{ "request": … }` holding the `launch_playback` request exactly as
/// `NativePlayerEngine.launch` sends it for a Transcode plan from a fixture
/// server (`plan` with `delivery: "hls"`, and `authorization`). Headless
/// libmpv must reach `playback-restart` through Rust-validated playlists.
#[test]
#[ignore = "needs a live Jellyfin fixture server"]
fn live_fixture_transcode_plan_reaches_playback_restart() {
    let path = std::env::var("FLUSTER_HLS_LAUNCH_FILE").expect("set FLUSTER_HLS_LAUNCH_FILE");
    let json: serde_json::Value =
        serde_json::from_str(&std::fs::read_to_string(path).expect("read the launch file"))
            .expect("JSON");
    let play_method = json["request"]["plan"]["playMethod"].clone();
    let request: LaunchRequest =
        serde_json::from_value(json["request"].clone()).expect("a launch request");
    assert_eq!(play_method, "Transcode");
    let media = LaunchMedia::prepare(&request).expect("the server's playlists pass validation");
    let Some(mut mpv) = handle_for(&media, &request) else {
        return;
    };
    media.load(&mpv).expect("loadfile");
    assert!(matches!(wait_for_load(&mut mpv), LoadOutcome::Loaded));
    let added = media.load_subtitles(&mpv);
    assert!(matches!(
        wait_for(&mut mpv, |event| matches!(event, Event::PlaybackRestart)),
        LoadOutcome::Loaded
    ));
    let width: i64 = mpv.get_property("video-params/w").unwrap_or(0);
    let codec: String = mpv.get_property("video-codec").unwrap_or_default();
    let format: String = mpv.get_property("file-format").unwrap_or_default();
    let tracks: Vec<_> = media
        .read_tracks(&mpv, &added)
        .into_iter()
        .map(|track| (track.kind, track.jellyfin_index, track.external))
        .collect();
    eprintln!(
        "live transcode playback-restart: width {width}, codec {codec}, file-format {format}, subtitles added {added:?}, tracks {tracks:?}"
    );
    assert_eq!(format, "hls");
}
