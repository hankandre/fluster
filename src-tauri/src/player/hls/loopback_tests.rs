//! The loopback server stays responsive and stops promptly whatever a
//! local client does (regression for the review's slow-client probe).

use super::loopback::{BoundLoopback, Served, HEAD_DEADLINE};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::net::TcpStream;
use std::thread;
use std::time::{Duration, Instant};

fn get(address: &str, path: &str) -> String {
    let mut stream = TcpStream::connect(address).expect("connect");
    stream
        .set_read_timeout(Some(Duration::from_secs(20)))
        .expect("timeout");
    write!(stream, "GET {path} HTTP/1.1\r\nHost: x\r\n\r\n").expect("write");
    let mut response = String::new();
    let _ = stream.read_to_string(&mut response);
    response
}

/// Sends one byte every `interval`, never finishing the request head.
fn slow_client(address: String, bytes: usize, interval: Duration) -> thread::JoinHandle<()> {
    thread::spawn(move || {
        let Ok(mut stream) = TcpStream::connect(address) else {
            return;
        };
        for _ in 0..bytes {
            if stream.write_all(b"G").is_err() {
                break;
            }
            thread::sleep(interval);
        }
    })
}

#[test]
fn hls_loopback_serves_past_slow_clients_and_drops_promptly() {
    let bound = BoundLoopback::bind().expect("bind");
    let path = bound.path("master.m3u8");
    let url = bound.url("master.m3u8");
    let address = url
        .strip_prefix("http://")
        .and_then(|rest| rest.split('/').next())
        .expect("address")
        .to_string();
    let mut bodies = HashMap::new();
    bodies.insert(
        path.clone(),
        Served {
            content_type: "application/vnd.apple.mpegurl",
            body: b"#EXTM3U\n".to_vec(),
        },
    );
    let server = bound.serve(bodies).expect("serve");

    let slow: Vec<_> = (0..4)
        .map(|_| slow_client(address.clone(), 6, Duration::from_millis(1500)))
        .collect();
    thread::sleep(Duration::from_millis(200));
    let started = Instant::now();
    let response = get(&address, &path);
    let waited = started.elapsed();
    assert!(response.starts_with("HTTP/1.1 200 OK"), "{response}");
    assert!(
        waited < Duration::from_millis(500),
        "a slow client delayed a GET by {waited:?}"
    );

    // A slow client's own connection is closed at the head deadline.
    let mut stalled = TcpStream::connect(&address).expect("connect");
    stalled.write_all(b"G").expect("write");
    stalled
        .set_read_timeout(Some(HEAD_DEADLINE * 3))
        .expect("timeout");
    let started = Instant::now();
    let mut rest = Vec::new();
    let _ = stalled.read_to_end(&mut rest);
    assert!(rest.is_empty());
    assert!(
        started.elapsed() < HEAD_DEADLINE * 2,
        "{:?}",
        started.elapsed()
    );

    let started = Instant::now();
    drop(server);
    assert!(
        started.elapsed() < Duration::from_millis(200),
        "drop waited {:?}",
        started.elapsed()
    );
    thread::sleep(Duration::from_millis(50));
    assert!(
        TcpStream::connect(&address).is_err(),
        "still listening after drop"
    );
    for client in slow {
        let _ = client.join();
    }
}
