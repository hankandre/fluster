//! The typed header reaches the stream and `sub-add`, and never a redirect target.

use super::*;
use crate::model::MediaTrack;
use crate::player::track_list::load_external_subtitles;

#[test]
fn stream_and_external_subtitles_send_exactly_the_typed_header() {
    let Some(mut mpv) = headless_player(&test_authorization()) else {
        return;
    };
    let (server, origin) = listener();
    let requests = serve(server, String::new());

    mpv.command("loadfile", &[&format!("{origin}/stream"), "replace"])
        .expect("loadfile");
    assert!(matches!(wait_for_load(&mut mpv), LoadOutcome::Loaded));
    let subtitle = MediaTrack {
        index: 1,
        kind: "Subtitle".into(),
        display_title: "English".into(),
        codec: None,
        language: Some("eng".into()),
        external: true,
        delivery_url: Some(format!("{origin}/sub.srt")),
    };
    load_external_subtitles(&mpv, &[subtitle]);

    let requests = requests.lock().expect("requests mutex").clone();
    let stream_requests: Vec<_> = requests
        .iter()
        .filter(|head| head.starts_with("GET /stream "))
        .collect();
    let subtitle_requests: Vec<_> = requests
        .iter()
        .filter(|head| head.starts_with("GET /sub.srt "))
        .collect();
    assert!(
        !stream_requests.is_empty(),
        "no stream request: {requests:?}"
    );
    assert!(
        !subtitle_requests.is_empty(),
        "no sub-add request: {requests:?}"
    );
    for head in stream_requests.into_iter().chain(subtitle_requests) {
        assert_single_exact_header(head);
    }
}

#[test]
fn redirects_are_refused_while_the_header_is_set() {
    let Some(mut mpv) = headless_player(&test_authorization()) else {
        return;
    };
    let (target, target_origin) = listener();
    let target_requests = serve(target, String::new());
    let (server, origin) = listener();
    let requests = serve(server, format!("{target_origin}/stream"));

    mpv.command("loadfile", &[&format!("{origin}/redirect"), "replace"])
        .expect("loadfile");
    assert!(matches!(wait_for_load(&mut mpv), LoadOutcome::Failed));

    let requests = requests.lock().expect("requests mutex").clone();
    let redirect = requests
        .iter()
        .find(|head| head.starts_with("GET /redirect "))
        .expect("the redirecting origin was asked");
    assert_single_exact_header(redirect);
    thread::sleep(Duration::from_millis(200));
    assert!(
        target_requests.lock().expect("requests mutex").is_empty(),
        "the header followed a redirect to another origin"
    );
}
