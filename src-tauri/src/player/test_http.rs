//! Loopback HTTP servers for tests that record each request head.

use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::sync::{Arc, Mutex};
use std::thread;

pub(super) type Requests = Arc<Mutex<Vec<String>>>;

pub(super) fn read_request_head(stream: &mut TcpStream) -> String {
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

pub(super) fn listener() -> (TcpListener, String) {
    let listener = TcpListener::bind("127.0.0.1:0").expect("bind loopback");
    let origin = format!("http://{}", listener.local_addr().expect("local address"));
    (listener, origin)
}

pub(super) struct Route {
    pub(super) status: &'static str,
    pub(super) content_type: &'static str,
    pub(super) body: Vec<u8>,
    pub(super) location: Option<String>,
}

impl Route {
    pub(super) fn ok(content_type: &'static str, body: impl Into<Vec<u8>>) -> Self {
        Self {
            status: "200 OK",
            content_type,
            body: body.into(),
            location: None,
        }
    }

    pub(super) fn redirect(location: String) -> Self {
        Self {
            status: "302 Found",
            content_type: "text/plain",
            body: Vec::new(),
            location: Some(location),
        }
    }

    fn not_found() -> Self {
        Self {
            status: "404 Not Found",
            content_type: "text/plain",
            body: Vec::new(),
            location: None,
        }
    }
}

/// Serves each route by path (the query is ignored) and 404 otherwise.
pub(super) fn serve_routes(listener: TcpListener, routes: Vec<(String, Route)>) -> Requests {
    let requests: Requests = Arc::default();
    let recorded = requests.clone();
    let not_found = Route::not_found();
    thread::spawn(move || {
        for stream in listener.incoming() {
            let Ok(mut stream) = stream else { continue };
            let head = read_request_head(&mut stream);
            recorded.lock().expect("requests mutex").push(head.clone());
            let target = head.split_whitespace().nth(1).unwrap_or("");
            let path = target.split('?').next().unwrap_or("");
            let route = routes
                .iter()
                .find(|(candidate, _)| candidate == path)
                .map(|(_, route)| route)
                .unwrap_or(&not_found);
            let mut response = format!(
                "HTTP/1.1 {}\r\nContent-Type: {}\r\nContent-Length: {}\r\nConnection: close\r\n",
                route.status,
                route.content_type,
                route.body.len()
            );
            if let Some(location) = &route.location {
                response.push_str(&format!("Location: {location}\r\n"));
            }
            response.push_str("\r\n");
            let _ = stream.write_all(response.as_bytes());
            let _ = stream.write_all(&route.body);
        }
    });
    requests
}

/// The request targets (path and query) in arrival order.
pub(super) fn paths(requests: &Requests) -> Vec<String> {
    requests
        .lock()
        .expect("requests mutex")
        .iter()
        .map(|head| head.split_whitespace().nth(1).unwrap_or("").to_string())
        .collect()
}

pub(super) fn authorization_lines(head: &str) -> Vec<&str> {
    head.lines()
        .filter(|line| line.to_ascii_lowercase().starts_with("authorization:"))
        .collect()
}
