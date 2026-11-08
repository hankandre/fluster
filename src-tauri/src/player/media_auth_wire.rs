//! Plays from a loopback HTTP server and checks the exact request bytes, so
//! the header is proven on the wire for the stream, `sub-add`, and redirects.

mod headers;
mod references;
mod tracks;

use super::network::{harden_network_options, set_media_authorization};
use super::test_support::test_authorization;
use super::version::ensure_numeric_locale;
use crate::auth_header::MediaBrowserAuthorization;
use libmpv2::events::Event;
use libmpv2::Mpv;
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};

type Requests = Arc<Mutex<Vec<String>>>;

fn silent_wav() -> Vec<u8> {
    let samples = 8_000u32; // half a second of 8 kHz mono 16-bit silence
    let data_len = samples * 2;
    let mut wav = Vec::new();
    wav.extend_from_slice(b"RIFF");
    wav.extend_from_slice(&(36 + data_len).to_le_bytes());
    wav.extend_from_slice(b"WAVEfmt ");
    wav.extend_from_slice(&16u32.to_le_bytes());
    wav.extend_from_slice(&1u16.to_le_bytes()); // PCM
    wav.extend_from_slice(&1u16.to_le_bytes()); // mono
    wav.extend_from_slice(&8_000u32.to_le_bytes());
    wav.extend_from_slice(&16_000u32.to_le_bytes());
    wav.extend_from_slice(&2u16.to_le_bytes());
    wav.extend_from_slice(&16u16.to_le_bytes());
    wav.extend_from_slice(b"data");
    wav.extend_from_slice(&data_len.to_le_bytes());
    wav.resize(wav.len() + data_len as usize, 0);
    wav
}

fn read_request_head(stream: &mut TcpStream) -> String {
    let mut head = Vec::new();
    let mut byte = [0u8; 1];
    while !head.ends_with(b"\r\n\r\n") && head.len() < 64 * 1024 {
        match stream.read(&mut byte) {
            Ok(1) => head.push(byte[0]),
            _ => break,
        }
    }
    String::from_utf8_lossy(&head).into_owned()
}

/// Serves `/stream` (WAV), `/sub.srt`, and `/redirect` (302 to `redirect_to`).
fn serve(listener: TcpListener, redirect_to: String) -> Requests {
    let requests: Requests = Arc::default();
    let recorded = requests.clone();
    thread::spawn(move || {
        for stream in listener.incoming() {
            let Ok(mut stream) = stream else { continue };
            let head = read_request_head(&mut stream);
            recorded.lock().expect("requests mutex").push(head.clone());
            let path = head.split_whitespace().nth(1).unwrap_or("").to_string();
            let (status, content_type, body, location) = match path.as_str() {
                "/stream" => ("200 OK", "audio/wav", silent_wav(), None),
                "/sub.srt" => (
                    "200 OK",
                    "text/plain",
                    b"1\r\n00:00:00,000 --> 00:00:00,400\r\nHello\r\n\r\n".to_vec(),
                    None,
                ),
                "/redirect" => ("302 Found", "text/plain", Vec::new(), Some(&redirect_to)),
                _ => ("404 Not Found", "text/plain", Vec::new(), None),
            };
            let mut response = format!(
                    "HTTP/1.1 {status}\r\nContent-Type: {content_type}\r\nContent-Length: {}\r\nConnection: close\r\n",
                    body.len()
                );
            if let Some(location) = location {
                response.push_str(&format!("Location: {location}\r\n"));
            }
            response.push_str("\r\n");
            let _ = stream.write_all(response.as_bytes());
            let _ = stream.write_all(&body);
        }
    });
    requests
}

/// The production session network options on a headless handle.
fn headless_player(authorization: &MediaBrowserAuthorization) -> Option<Mpv> {
    ensure_numeric_locale().expect("numeric locale");
    let created = Mpv::with_initializer(|init| {
        init.set_option("config", false)?;
        init.set_option("vo", "null")?;
        init.set_option("ao", "null")?;
        init.set_option("autoload-files", false)?;
        harden_network_options(&init)?;
        set_media_authorization(&init, authorization)
    });
    match created {
        Err(libmpv2::Error::VersionMismatch { linked, loaded }) => {
            eprintln!("SKIP media_auth_wire: loaded libmpv API {loaded:#x} is older than linked {linked:#x}");
            None
        }
        other => Some(other.expect("libmpv starts headless")),
    }
}

enum LoadOutcome {
    Loaded,
    Failed,
}

fn wait_for_load(mpv: &mut Mpv) -> LoadOutcome {
    wait_for(mpv, |event| matches!(event, Event::FileLoaded))
}

/// Waits for `wanted`, or for the file to end or fail.
fn wait_for(mpv: &mut Mpv, wanted: impl Fn(&Event) -> bool) -> LoadOutcome {
    let deadline = Instant::now() + Duration::from_secs(15);
    while Instant::now() < deadline {
        match mpv.wait_event(0.2) {
            Some(Ok(event)) if wanted(&event) => return LoadOutcome::Loaded,
            // libmpv2 reports an end-file with an error as `Err`.
            Some(Ok(Event::EndFile(_))) | Some(Err(_)) => return LoadOutcome::Failed,
            _ => {}
        }
    }
    panic!("libmpv neither loaded nor failed the file in time");
}

fn authorization_lines(head: &str) -> Vec<&str> {
    head.lines()
        .filter(|line| line.to_ascii_lowercase().starts_with("authorization:"))
        .collect()
}

fn assert_single_exact_header(head: &str) {
    let expected = format!("Authorization: {}", test_authorization().expose());
    assert_eq!(authorization_lines(head), vec![expected.as_str()], "{head}");
    // A comma split would turn the header's later fields into extra lines.
    assert!(!head.contains("\r\n Device="), "{head}");
}

fn listener() -> (TcpListener, String) {
    let listener = TcpListener::bind("127.0.0.1:0").expect("bind loopback");
    let origin = format!("http://{}", listener.local_addr().expect("local address"));
    (listener, origin)
}

/// Serves `body` with `content_type` for every path.
fn serve_body(listener: TcpListener, body: String, content_type: &'static str) -> Requests {
    let requests: Requests = Arc::default();
    let recorded = requests.clone();
    thread::spawn(move || {
        for stream in listener.incoming() {
            let Ok(mut stream) = stream else { continue };
            let head = read_request_head(&mut stream);
            recorded.lock().expect("requests mutex").push(head);
            let response = format!(
                    "HTTP/1.1 200 OK\r\nContent-Type: {content_type}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
                    body.len()
                );
            let _ = stream.write_all(response.as_bytes());
        }
    });
    requests
}

/// Gives libmpv time to load, fail, and open whatever it would open next
/// (a playlist ends its own file before loading its entries).
fn settle(mpv: &mut Mpv) {
    let deadline = Instant::now() + Duration::from_millis(2500);
    while Instant::now() < deadline {
        let _ = mpv.wait_event(0.1);
    }
}
