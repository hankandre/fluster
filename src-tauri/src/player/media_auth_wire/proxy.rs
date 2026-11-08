//! FFmpeg's http protocol tunnels through a proxy when its `http_proxy`
//! option is unset and the `http_proxy` environment variable is
//! (libavformat/http.c `http_open_cnx_internal`, FFmpeg 9.0.2). Fluster sets
//! the option to `direct://` on every handle, so neither the environment nor
//! mpv's `http-proxy` can send the header through a proxy. These tests set
//! mpv's `http-proxy` (the same FFmpeg option, set before `stream-lavf-o`
//! in mpv's `mp_setup_av_network_options`) instead of the environment,
//! which other tests in this process share.

use super::hls::{hls_player, play_to_end, server_routes, Network, PLAYLIST};
use super::*;
use crate::player::test_http::{serve_routes, Route};

#[test]
fn static_and_hls_handles_never_use_an_http_proxy() {
    for (label, override_lavf, expect_proxy) in [
        ("static", false, false),
        ("static without the proxy option", true, true),
    ] {
        let Some(mut mpv) = headless_player(&test_authorization()) else {
            return;
        };
        let (proxy, proxy_origin) = listener();
        let proxy_requests = serve(proxy, String::new());
        let (server, origin) = listener();
        let requests = serve(server, String::new());
        mpv.set_property("http-proxy", proxy_origin.as_str())
            .expect("http-proxy");
        if override_lavf {
            mpv.set_property("stream-lavf-o", "max_redirects=0")
                .expect("stream-lavf-o");
        }
        mpv.command("loadfile", &[&format!("{origin}/stream"), "replace"])
            .expect("loadfile");
        settle(&mut mpv);
        let proxied = !proxy_requests.lock().expect("requests mutex").is_empty();
        eprintln!("{label}: proxy contacted {proxied}");
        assert_eq!(proxied, expect_proxy, "{label}");
        if !expect_proxy {
            let direct = requests.lock().expect("requests mutex").clone();
            assert!(!direct.is_empty(), "{label}: the server was never asked");
            for head in &direct {
                assert_single_exact_header(head);
            }
        }
    }

    let Some(mut mpv) = hls_player(Network::Production) else {
        return;
    };
    let (proxy, proxy_origin) = listener();
    let proxy_requests = serve(proxy, String::new());
    let (server, server_origin) = listener();
    let server_requests = serve_routes(server, server_routes());
    let (local, local_origin) = listener();
    let _local = serve_routes(
        local,
        vec![
            (
                "/s/master.m3u8".into(),
                Route::ok(
                    PLAYLIST,
                    super::hls::master_playlist(&format!("{local_origin}/s/v0.m3u8")),
                ),
            ),
            (
                "/s/v0.m3u8".into(),
                Route::ok(PLAYLIST, super::hls::media_playlist(&server_origin)),
            ),
        ],
    );
    mpv.set_property("http-proxy", proxy_origin.as_str())
        .expect("http-proxy");
    assert!(play_to_end(
        &mut mpv,
        &format!("{local_origin}/s/master.m3u8")
    ));
    assert!(proxy_requests.lock().expect("requests mutex").is_empty());
    let direct = server_requests.lock().expect("requests mutex").clone();
    assert!(!direct.is_empty());
    for head in &direct {
        assert_single_exact_header(head);
    }
}
