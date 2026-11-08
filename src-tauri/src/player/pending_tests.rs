//! Guardian M1 and L2 for P10-04: a pending launch is exclusive, `stop`
//! cancels it without waiting for the server, and the checks give up.

use super::*;
use crate::player::test_http::{listener, read_request_head, Requests};
use crate::player::test_support::hls_launch_request;
use std::io::Write;
use std::net::TcpListener;

const ITEM: &str = "0123456789abcdef0123456789abcdef";

/// Answers every request after `delay`: the master names one variant, every
/// other path is a complete media playlist.
fn slow_server(listener: TcpListener, delay: Duration) -> Requests {
    let requests: Requests = Arc::default();
    let recorded = requests.clone();
    thread::spawn(move || {
        for stream in listener.incoming() {
            let Ok(mut stream) = stream else { continue };
            let recorded = recorded.clone();
            thread::spawn(move || {
                let head = read_request_head(&mut stream);
                recorded.lock().expect("requests mutex").push(head.clone());
                thread::sleep(delay);
                let body = if head.contains("master.m3u8") {
                    "#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1\nmain.m3u8\n"
                } else {
                    "#EXTM3U\n#EXT-X-TARGETDURATION:1\n#EXTINF:1,\n0.mp4\n#EXT-X-ENDLIST\n"
                };
                let _ = write!(
                    stream,
                    "HTTP/1.1 200 OK\r\nContent-Type: application/vnd.apple.mpegurl\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
                    body.len()
                );
            });
        }
    });
    requests
}

fn converted_request(origin: &str) -> LaunchRequest {
    let master = format!(
        "{origin}/videos/{ITEM}/master.m3u8?MediaSourceId=m&PlaySessionId=p&EnableTrickplay=false"
    );
    hls_launch_request(origin, &master, ITEM, &[])
}

#[test]
fn a_second_launch_is_refused_while_one_is_pending_and_the_slot_clears_on_every_exit() {
    let slot = PendingSlot::default();
    assert!(!slot.cancel(), "nothing to cancel");
    {
        let first = slot.begin().expect("first launch");
        assert!(matches!(slot.begin(), Err(MpvError::AlreadyPlaying)));
        assert!(first.check().is_ok());
        assert!(slot.cancel());
        assert!(matches!(first.check(), Err(MpvError::Cancelled)));
    }
    // The failed launch left nothing behind.
    let second = slot.begin().expect("a new launch after the first ended");
    assert!(second.check().is_ok());
}

/// Stop during the playlist checks returns at once with `Cancelled`, before
/// any mpv handle could exist, and the abandoned check sends nothing more.
#[test]
fn stop_during_a_converted_check_returns_at_once_and_sends_nothing_more() {
    let (server, origin) = listener();
    let requests = slow_server(server, Duration::from_millis(1500));
    let slot = PendingSlot::default();
    let pending = slot.begin().expect("a launch");
    let request = converted_request(&origin);
    let started = Instant::now();
    let result = thread::scope(|scope| {
        scope.spawn(|| {
            thread::sleep(Duration::from_millis(150));
            assert!(slot.cancel());
        });
        pending.prepare(&request, PREPARE_DEADLINE)
    });
    let elapsed = started.elapsed();
    assert!(
        matches!(result, Err(MpvError::Cancelled)),
        "{:?}",
        result.err()
    );
    assert!(elapsed < Duration::from_millis(800), "took {elapsed:?}");
    // The master answer arrives later; the check stops before the variant.
    thread::sleep(Duration::from_millis(2500));
    let heads = requests.lock().expect("requests mutex").clone();
    assert_eq!(heads.len(), 1, "{heads:?}");
    assert!(heads[0].contains("master.m3u8"));
}

#[test]
fn a_converted_check_past_its_deadline_times_out() {
    let (server, origin) = listener();
    let _requests = slow_server(server, Duration::from_secs(5));
    let slot = PendingSlot::default();
    let pending = slot.begin().expect("a launch");
    let started = Instant::now();
    let result = pending.prepare(&converted_request(&origin), Duration::from_millis(300));
    assert!(matches!(result, Err(MpvError::LaunchTimedOut)));
    assert!(started.elapsed() < Duration::from_secs(1));
    // The timeout cancels the abandoned check too.
    assert!(matches!(pending.check(), Err(MpvError::Cancelled)));
}

#[test]
fn a_converted_check_that_finishes_returns_its_media() {
    let (server, origin) = listener();
    let _requests = slow_server(server, Duration::from_millis(10));
    let slot = PendingSlot::default();
    let pending = slot.begin().expect("a launch");
    let media = pending
        .prepare(&converted_request(&origin), PREPARE_DEADLINE)
        .expect("checked media");
    assert_eq!(
        media.delivery(),
        crate::player::network::MediaDelivery::ValidatedHls
    );
}
