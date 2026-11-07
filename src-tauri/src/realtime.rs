//! The Jellyfin server socket (`/socket`).
//!
//! The WebView's WebSocket API cannot send an `Authorization` header, and a
//! token in the URL is forbidden (invariant I4), so the socket lives here.
//! Rust answers keepalives itself and forwards only `ServerEvent`s.

use crate::auth_header::MediaBrowserAuthorization;
use crate::model::{ConnectionState, ServerEvent};
use crate::url_policy::parse_allowed_url;
use futures_util::{FutureExt, SinkExt, StreamExt};
use serde::Deserialize;
use std::future::Future;
use std::panic::AssertUnwindSafe;
use std::sync::Mutex;
use std::time::{Duration, Instant};
use thiserror::Error;
use tokio::net::TcpStream;
use tokio::time::{interval_at, sleep_until, timeout, Instant as TokioInstant, Interval};
use tokio_tungstenite::tungstenite::client::IntoClientRequest;
use tokio_tungstenite::tungstenite::http::header::AUTHORIZATION;
use tokio_tungstenite::tungstenite::http::{HeaderValue, StatusCode};
use tokio_tungstenite::tungstenite::protocol::WebSocketConfig;
use tokio_tungstenite::tungstenite::{Error as SocketError, Message};
use tokio_tungstenite::{connect_async_with_config, MaybeTlsStream, WebSocketStream};
use url::Url;

pub const SERVER_EVENT: &str = "fluster://server-event";

const CONNECT_TIMEOUT: Duration = Duration::from_secs(20);
const SEND_TIMEOUT: Duration = Duration::from_secs(10);
const MAX_RECONNECT_DELAY_SECONDS: u64 = 30;
// A connection that lasted this long resets the reconnect backoff.
const STABLE_CONNECTION: Duration = Duration::from_secs(30);
const MAX_MESSAGE_BYTES: usize = 1024 * 1024;
// Jellyfin sends 60 (SessionWebSocketListener.WebSocketLostTimeout). Other
// values are clamped so a hostile server cannot overflow timers or flood.
const DEFAULT_KEEP_ALIVE_TIMEOUT_SECONDS: u64 = 60;
const MIN_KEEP_ALIVE_TIMEOUT_SECONDS: u64 = 2;
const MAX_KEEP_ALIVE_TIMEOUT_SECONDS: u64 = 600;
const MAX_ITEM_ID_LENGTH: usize = 64;
const KEEP_ALIVE: &str = r#"{"MessageType":"KeepAlive"}"#;

type Socket = WebSocketStream<MaybeTlsStream<TcpStream>>;

#[derive(Debug, Error, PartialEq)]
pub enum RealtimeError {
    #[error("The server URL is not allowed. Use HTTPS, or HTTP only for this device or a private home-network server.")]
    UnsafeServerUrl,
    #[error("The server socket needs a signed-in Jellyfin authorization header.")]
    InvalidAuthorization,
}

/// A validated socket URL and the header that authenticates it.
pub struct SocketTarget {
    url: Url,
    authorization: HeaderValue,
}

impl std::fmt::Debug for SocketTarget {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter
            .debug_struct("SocketTarget")
            .field("scheme", &self.url.scheme())
            .field("authorization", &"[redacted]")
            .finish()
    }
}

/// Builds `wss://host/base/socket` (or `ws://` where plain HTTP is allowed:
/// loopback and private-LAN hosts) from the
/// server URL, using the same policy as playback URLs.
pub fn socket_target(server_url: &str, authorization: &str) -> Result<SocketTarget, RealtimeError> {
    let mut url = parse_allowed_url(server_url).ok_or(RealtimeError::UnsafeServerUrl)?;
    if url.query().is_some() {
        return Err(RealtimeError::UnsafeServerUrl);
    }
    let socket_scheme = if url.scheme() == "https" { "wss" } else { "ws" };
    url.set_scheme(socket_scheme)
        .map_err(|_| RealtimeError::UnsafeServerUrl)?;
    let socket_path = format!("{}/socket", url.path().trim_end_matches('/'));
    url.set_path(&socket_path);

    let authorization = MediaBrowserAuthorization::parse(authorization)
        .map_err(|_| RealtimeError::InvalidAuthorization)?;
    let mut authorization = HeaderValue::from_str(authorization.expose())
        .map_err(|_| RealtimeError::InvalidAuthorization)?;
    authorization.set_sensitive(true);
    Ok(SocketTarget { url, authorization })
}

/// What Fluster understands from the server. Everything else is `Ignored`.
#[derive(Debug, PartialEq)]
pub enum InboundMessage {
    ForceKeepAlive { timeout_seconds: u64 },
    UserDataChanged { item_ids: Vec<String> },
    Ignored,
}

#[derive(Deserialize)]
struct Envelope {
    #[serde(rename = "MessageType")]
    message_type: String,
    #[serde(rename = "Data", default)]
    data: serde_json::Value,
}

#[derive(Deserialize)]
struct UserDataChangeInfo {
    #[serde(rename = "UserDataList", default)]
    user_data_list: Vec<UserItemData>,
}

#[derive(Deserialize)]
struct UserItemData {
    #[serde(rename = "ItemId", default)]
    item_id: Option<String>,
}

pub fn parse_message(text: &str) -> InboundMessage {
    let Ok(envelope) = serde_json::from_str::<Envelope>(text) else {
        return InboundMessage::Ignored;
    };
    match envelope.message_type.as_str() {
        "ForceKeepAlive" => {
            let timeout_seconds = envelope
                .data
                .as_u64()
                .filter(|seconds| *seconds > 0)
                .unwrap_or(DEFAULT_KEEP_ALIVE_TIMEOUT_SECONDS)
                .clamp(
                    MIN_KEEP_ALIVE_TIMEOUT_SECONDS,
                    MAX_KEEP_ALIVE_TIMEOUT_SECONDS,
                );
            InboundMessage::ForceKeepAlive { timeout_seconds }
        }
        "UserDataChanged" => {
            let Ok(info) = serde_json::from_value::<UserDataChangeInfo>(envelope.data) else {
                return InboundMessage::Ignored;
            };
            let item_ids: Vec<String> = info
                .user_data_list
                .into_iter()
                .filter_map(|entry| entry.item_id)
                .filter(|item_id| is_item_id(item_id))
                .collect();
            if item_ids.is_empty() {
                InboundMessage::Ignored
            } else {
                InboundMessage::UserDataChanged { item_ids }
            }
        }
        _ => InboundMessage::Ignored,
    }
}

fn is_item_id(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= MAX_ITEM_ID_LENGTH
        && value
            .chars()
            .all(|character| character.is_ascii_hexdigit() || character == '-')
}

/// The server drops a socket after `timeout_seconds` without a KeepAlive and
/// asks clients to send one at least every half of that timeout.
pub fn keep_alive_period(timeout_seconds: u64) -> Duration {
    Duration::from_secs((timeout_seconds / 2).max(1))
}

/// Jellyfin answers every client KeepAlive with a KeepAlive
/// (WebSocketConnection.SendKeepAliveResponse), so a healthy socket always
/// hears from the server within one keepalive period. Silence for two
/// periods means the connection is dead.
pub fn idle_limit(keep_alive_period: Duration) -> Duration {
    keep_alive_period.saturating_mul(2)
}

/// `start + duration`, or `start` itself if that would overflow; an early
/// deadline only causes a keepalive or a reconnect, never a panic.
fn deadline_after(start: TokioInstant, duration: Duration) -> TokioInstant {
    start.checked_add(duration).unwrap_or(start)
}

/// 1, 2, 4, 8, 16, then 30 seconds.
pub fn reconnect_delay(failures: u32) -> Duration {
    let seconds = 1u64 << failures.min(5);
    Duration::from_secs(seconds.min(MAX_RECONNECT_DELAY_SECONDS))
}

/// A short, fixed description that never carries a URL, header, or body.
pub fn describe_connection_error(error: &SocketError) -> &'static str {
    match error {
        SocketError::Io(_) => "network error",
        SocketError::Tls(_) => "TLS error",
        SocketError::Http(response) if is_auth_refusal_status(response.status()) => {
            "the server refused the session"
        }
        SocketError::Http(_) => "the server rejected the socket upgrade",
        SocketError::Url(_) => "invalid socket URL",
        SocketError::ConnectionClosed | SocketError::AlreadyClosed => "connection closed",
        SocketError::Protocol(_) => "socket protocol error",
        SocketError::Capacity(_) => "server message too large",
        _ => "socket error",
    }
}

fn is_auth_refusal_status(status: StatusCode) -> bool {
    status == StatusCode::UNAUTHORIZED || status == StatusCode::FORBIDDEN
}

fn is_auth_refusal(error: &SocketError) -> bool {
    matches!(error, SocketError::Http(response) if is_auth_refusal_status(response.status()))
}

#[cfg(debug_assertions)]
fn realtime_trace(message: &'static str) {
    eprintln!("[fluster realtime] {message}");
}

#[cfg(not(debug_assertions))]
fn realtime_trace(_message: &'static str) {}

/// Keeps the socket open until the task is aborted or the server refuses
/// the session. If the loop ever panics, the frontend hears `disconnected`
/// and the loop starts again after the longest backoff.
pub async fn run_supervised(target: SocketTarget, emit: impl Fn(ServerEvent)) {
    supervise(|| run(&target, &emit), &emit).await;
}

async fn supervise<F, Fut>(mut start: F, emit: &impl Fn(ServerEvent))
where
    F: FnMut() -> Fut,
    Fut: Future<Output = ()>,
{
    loop {
        if AssertUnwindSafe(start()).catch_unwind().await.is_ok() {
            return;
        }
        realtime_trace("the socket task panicked; restarting");
        emit(ServerEvent::Connection {
            state: ConnectionState::Disconnected,
        });
        tokio::time::sleep(Duration::from_secs(MAX_RECONNECT_DELAY_SECONDS)).await;
    }
}

/// Reconnects with capped backoff; returns only when the server refuses the
/// session.
async fn run(target: &SocketTarget, emit: &impl Fn(ServerEvent)) {
    // Pin rustls to ring explicitly; this fails harmlessly once installed.
    let _ = rustls::crypto::ring::default_provider().install_default();
    let mut failures: u32 = 0;
    loop {
        match open(target).await {
            Ok(socket) => {
                emit(ServerEvent::Connection {
                    state: ConnectionState::Connected,
                });
                let connected_at = Instant::now();
                let reason = serve(socket, emit).await;
                realtime_trace(reason);
                emit(ServerEvent::Connection {
                    state: ConnectionState::Disconnected,
                });
                if connected_at.elapsed() >= STABLE_CONNECTION {
                    failures = 0;
                } else {
                    failures = failures.saturating_add(1);
                }
            }
            Err(error) => {
                realtime_trace(describe_connection_error(&error));
                if is_auth_refusal(&error) {
                    return;
                }
                failures = failures.saturating_add(1);
            }
        }
        tokio::time::sleep(reconnect_delay(failures)).await;
    }
}

async fn open(target: &SocketTarget) -> Result<Socket, SocketError> {
    let mut request = target.url.as_str().into_client_request()?;
    request
        .headers_mut()
        .insert(AUTHORIZATION, target.authorization.clone());
    let config = WebSocketConfig::default()
        .max_message_size(Some(MAX_MESSAGE_BYTES))
        .max_frame_size(Some(MAX_MESSAGE_BYTES));
    match timeout(
        CONNECT_TIMEOUT,
        connect_async_with_config(request, Some(config), false),
    )
    .await
    {
        Ok(result) => result.map(|(socket, _response)| socket),
        Err(_) => Err(SocketError::Io(std::io::ErrorKind::TimedOut.into())),
    }
}

/// Reads until the connection ends and returns why, as a fixed description.
async fn serve(mut socket: Socket, emit: &impl Fn(ServerEvent)) -> &'static str {
    let mut keep_alive: Option<Interval> = None;
    let mut period = keep_alive_period(DEFAULT_KEEP_ALIVE_TIMEOUT_SECONDS);
    let mut last_inbound = TokioInstant::now();
    loop {
        let idle_deadline = deadline_after(last_inbound, idle_limit(period));
        tokio::select! {
            message = socket.next() => {
                last_inbound = TokioInstant::now();
                match message {
                None => return "connection closed",
                Some(Err(error)) => return describe_connection_error(&error),
                Some(Ok(Message::Close(_))) => return "the server closed the socket",
                Some(Ok(Message::Text(text))) => match parse_message(text.as_str()) {
                    InboundMessage::ForceKeepAlive { timeout_seconds } => {
                        if let Err(reason) = send_keep_alive(&mut socket).await {
                            return reason;
                        }
                        period = keep_alive_period(timeout_seconds);
                        let first_tick = deadline_after(TokioInstant::now(), period);
                        keep_alive = Some(interval_at(first_tick, period));
                    }
                    InboundMessage::UserDataChanged { item_ids } => {
                        emit(ServerEvent::UserDataChanged { item_ids });
                    }
                    InboundMessage::Ignored => {}
                },
                Some(Ok(_)) => {}
                }
            },
            _ = sleep_until(idle_deadline) => return "the server stopped answering keepalives",
            _ = next_tick(&mut keep_alive) => {
                if let Err(reason) = send_keep_alive(&mut socket).await {
                    return reason;
                }
            }
        }
    }
}

async fn next_tick(keep_alive: &mut Option<Interval>) {
    match keep_alive {
        Some(interval) => {
            interval.tick().await;
        }
        None => std::future::pending::<()>().await,
    }
}

async fn send_keep_alive(socket: &mut Socket) -> Result<(), &'static str> {
    match timeout(SEND_TIMEOUT, socket.send(Message::text(KEEP_ALIVE))).await {
        Ok(Ok(())) => Ok(()),
        Ok(Err(error)) => Err(describe_connection_error(&error)),
        Err(_) => Err("keepalive send timed out"),
    }
}

/// Owns the one live socket task. Connecting replaces any previous task.
#[derive(Default)]
pub struct RealtimeManager {
    task: Mutex<Option<tauri::async_runtime::JoinHandle<()>>>,
}

impl RealtimeManager {
    pub fn connect(
        &self,
        target: SocketTarget,
        emit: impl Fn(ServerEvent) + Send + Sync + 'static,
    ) {
        let mut task = self
            .task
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        if let Some(previous) = task.take() {
            previous.abort();
        }
        *task = Some(tauri::async_runtime::spawn(run_supervised(target, emit)));
    }

    pub fn disconnect(&self) {
        let mut task = self
            .task
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        if let Some(previous) = task.take() {
            previous.abort();
        }
    }
}

#[cfg(test)]
mod tests;
