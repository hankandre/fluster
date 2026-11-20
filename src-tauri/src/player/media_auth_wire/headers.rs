//! The typed header reaches the stream and `sub-add`, and never a redirect target.

use super::*;
use crate::model::MediaTrack;
use crate::player::network::HttpStacks;
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

/// With the production options (on mpv 0.42+ that includes `curl-enabled=no`,
/// so FFmpeg's `max_redirects=0` applies) the redirect target gets nothing.
#[test]
fn redirects_are_refused_while_the_header_is_set() {
    let Some(http) = probed_http_stacks() else {
        return;
    };
    eprintln!("redirect test on HTTP stacks {http:?}");
    let Some(mpv) = headless_player(&test_authorization()) else {
        return;
    };
    assert_redirect_not_followed(mpv);
}

/// Defence in depth: with the curl backend forced back on, the production
/// `curl-max-redirects=0` still refuses the redirect. With curl's limit
/// raised again, the same redirect is followed, which shows curl served the
/// open. Needs a libmpv with the curl backend (mpv 0.42+); skipped without.
#[test]
fn curl_backend_redirects_are_refused_too() {
    let Some(http) = probed_http_stacks() else {
        return;
    };
    if http == HttpStacks::LavfOnly {
        eprintln!("SKIP curl_backend_redirects_are_refused_too: this libmpv has no curl backend");
        return;
    }
    for (max_redirects, expect_followed) in [(None, false), (Some(16i64), true)] {
        let Some(mut mpv) = headless_player(&test_authorization()) else {
            return;
        };
        mpv.set_property("curl-enabled", true)
            .expect("the curl backend can be turned back on");
        if let Some(limit) = max_redirects {
            mpv.set_property("curl-max-redirects", limit)
                .expect("curl-max-redirects");
        }
        let (outcome, followed) = load_redirect(&mut mpv);
        eprintln!("curl static redirect followed (expected {expect_followed}): {followed}");
        assert_eq!(followed, expect_followed);
        if !expect_followed {
            assert!(matches!(outcome, LoadOutcome::Failed));
        }
    }
}

fn assert_redirect_not_followed(mut mpv: Mpv) {
    let (outcome, followed) = load_redirect(&mut mpv);
    assert!(matches!(outcome, LoadOutcome::Failed));
    assert!(
        !followed,
        "the header followed a redirect to another origin"
    );
}

/// Loads `/redirect` (302 to another origin) and returns the outcome and
/// whether the other origin was asked for anything.
fn load_redirect(mpv: &mut Mpv) -> (LoadOutcome, bool) {
    let (target, target_origin) = listener();
    let target_requests = serve(target, String::new());
    let (server, origin) = listener();
    let requests = serve(server, format!("{target_origin}/stream"));

    mpv.command("loadfile", &[&format!("{origin}/redirect"), "replace"])
        .expect("loadfile");
    let outcome = wait_for_load(mpv);

    let requests = requests.lock().expect("requests mutex").clone();
    let redirect = requests
        .iter()
        .find(|head| head.starts_with("GET /redirect "))
        .expect("the redirecting origin was asked");
    assert_single_exact_header(redirect);
    thread::sleep(Duration::from_millis(200));
    let followed = !target_requests.lock().expect("requests mutex").is_empty();
    (outcome, followed)
}
