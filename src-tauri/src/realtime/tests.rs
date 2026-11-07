use super::*;
use tokio::net::TcpListener;
use tokio::sync::mpsc;
use tokio_tungstenite::tungstenite::handshake::server::{Request, Response};
use tokio_tungstenite::tungstenite::http;

const CANARY: &str = "CANARY_7f3e9b1c_SECRET";
const HEADER: &str = "MediaBrowser Client=\"Fluster\", Device=\"Linux\", DeviceId=\"abc\", Version=\"0.1.0\", Token=\"CANARY_7f3e9b1c_SECRET\"";

// Captured from the shape Jellyfin 10.11/12.4 serializes:
// UserDataChangedMessage<UserDataChangeInfo> with Guids in "N" format.
const USER_DATA_CHANGED: &str = r#"{"MessageType":"UserDataChanged","MessageId":"5f0c5e8b6a3a4c2e9a1d2b3c4d5e6f70","Data":{"UserId":"0123456789abcdef0123456789abcdef","UserDataList":[{"Rating":null,"PlayedPercentage":null,"UnplayedItemCount":null,"PlaybackPositionTicks":0,"PlayCount":1,"IsFavorite":false,"Likes":null,"LastPlayedDate":"2026-11-07T10:00:00.0000000Z","Played":true,"Key":"tvdb-1234","ItemId":"aaaabbbbccccddddeeeeffff00001111"},{"PlaybackPositionTicks":1200000000,"PlayCount":0,"IsFavorite":true,"Played":false,"Key":"5678","ItemId":"22223333444455556666777788889999"}]}}"#;

#[test]
fn parses_force_keep_alive_interval() {
    // tests/Jellyfin.Server.Implementations.Tests/Test Data/HttpServer/ForceKeepAlive.json
    let message = r#"{"MessageType":"ForceKeepAlive","MessageId":"00000000-0000-0000-0000-000000000000","ServerId":null,"Data":60}"#;
    assert_eq!(
        parse_message(message),
        InboundMessage::ForceKeepAlive {
            timeout_seconds: 60
        }
    );
    assert_eq!(keep_alive_period(60), Duration::from_secs(30));
    assert_eq!(keep_alive_period(1), Duration::from_secs(1));
}

#[test]
fn clamps_unusable_keep_alive_intervals() {
    for (data, expected) in [
        ("0", 60),
        ("-5", 60),
        ("\"60\"", 60),
        ("null", 60),
        ("1", 2),
        ("18446744073709551615", 600),
        ("1e300", 60),
    ] {
        let message = format!(r#"{{"MessageType":"ForceKeepAlive","Data":{data}}}"#);
        assert_eq!(
            parse_message(&message),
            InboundMessage::ForceKeepAlive {
                timeout_seconds: expected
            },
            "{data}"
        );
    }
    assert_eq!(keep_alive_period(600), Duration::from_secs(300));
    assert_eq!(
        idle_limit(Duration::from_secs(300)),
        Duration::from_secs(600)
    );
    assert_eq!(idle_limit(Duration::MAX), Duration::MAX);
}

#[test]
fn extracts_item_ids_from_user_data_changed() {
    assert_eq!(
        parse_message(USER_DATA_CHANGED),
        InboundMessage::UserDataChanged {
            item_ids: vec![
                "aaaabbbbccccddddeeeeffff00001111".into(),
                "22223333444455556666777788889999".into(),
            ]
        }
    );
}

#[test]
fn drops_malformed_item_ids() {
    let message = r#"{"MessageType":"UserDataChanged","Data":{"UserDataList":[{"ItemId":"../Users"},{"ItemId":""},{"Key":"no-id"}]}}"#;
    assert_eq!(parse_message(message), InboundMessage::Ignored);
}

#[test]
fn ignores_unknown_and_malformed_messages() {
    for message in [
        r#"{"MessageType":"KeepAlive"}"#,
        r#"{"MessageType":"ForceKeepAliveX","Data":60}"#,
        r#"{"MessageType":"Play","Data":{"ItemIds":["aaaa"],"PlayCommand":"PlayNow"}}"#,
        r#"{"MessageType":"Playstate","Data":{"Command":"Stop"}}"#,
        r#"{"MessageType":"LibraryChanged","Data":{"ItemsAdded":["aaaa"]}}"#,
        r#"{"MessageType":"UserDataChanged","Data":"oops"}"#,
        r#"{"Data":60}"#,
        "not json",
    ] {
        assert_eq!(parse_message(message), InboundMessage::Ignored, "{message}");
    }
}

#[test]
fn server_events_serialize_to_the_frontend_contract() {
    let changed = ServerEvent::UserDataChanged {
        item_ids: vec!["abc".into()],
    };
    assert_eq!(
        serde_json::to_string(&changed).expect("serializes"),
        r#"{"kind":"user-data-changed","itemIds":["abc"]}"#
    );
    let connected = ServerEvent::Connection {
        state: ConnectionState::Connected,
    };
    assert_eq!(
        serde_json::to_string(&connected).expect("serializes"),
        r#"{"kind":"connection","state":"connected"}"#
    );
}

#[test]
fn socket_urls_follow_the_server_url_policy() {
    for (server_url, socket_url) in [
        ("https://media.example", "wss://media.example/socket"),
        ("https://media.example/", "wss://media.example/socket"),
        (
            "https://media.example/jellyfin/",
            "wss://media.example/jellyfin/socket",
        ),
        (
            "https://media.example:8920",
            "wss://media.example:8920/socket",
        ),
        ("http://localhost:8096", "ws://localhost:8096/socket"),
        ("http://127.0.0.1:8096", "ws://127.0.0.1:8096/socket"),
        ("http://[::1]:8096", "ws://[::1]:8096/socket"),
        ("http://192.168.1.5:8096", "ws://192.168.1.5:8096/socket"),
        ("http://10.0.0.7", "ws://10.0.0.7/socket"),
        ("http://[fd00::5]:8096/", "ws://[fd00::5]:8096/socket"),
        ("http://nas.local:8096", "ws://nas.local:8096/socket"),
        (
            "http://jellyfin.home.arpa/jellyfin",
            "ws://jellyfin.home.arpa/jellyfin/socket",
        ),
        ("https://192.168.1.5:8920", "wss://192.168.1.5:8920/socket"),
    ] {
        let target = socket_target(server_url, HEADER).expect(server_url);
        assert_eq!(target.url.as_str(), socket_url);
    }
}

#[test]
fn socket_urls_reject_plaintext_public_hosts_and_credentials() {
    for server_url in [
        "http://media.example",
        "http://localhost.example",
        "http://100.64.0.1:8096",
        "http://8.8.8.8:8096",
        "http://[::ffff:8.8.8.8]:8096",
        "http://jellyfin.lan:8096",
        "http://user:password@192.168.1.5:8096",
        "https://user:password@media.example",
        "https://media.example/#fragment",
        "https://media.example/?ApiKey=secret",
        "ws://localhost:8096",
        "wss://media.example",
        "file:///tmp/socket",
        "not a url",
    ] {
        let error = socket_target(server_url, HEADER).expect_err(server_url);
        assert_eq!(error, RealtimeError::UnsafeServerUrl);
        assert!(!error.to_string().contains("secret"));
        assert!(!error.to_string().contains("password"));
    }
}

#[test]
fn authorization_must_be_a_media_browser_token_header() {
    for authorization in [
        "",
        "Bearer abc",
        "MediaBrowser Client=\"Fluster\"",
        "Emby Token=\"abc\"",
        "MediaBrowser Token=\"abc\"\r\nX-Injected: 1",
    ] {
        assert_eq!(
            socket_target("https://media.example", authorization).unwrap_err(),
            RealtimeError::InvalidAuthorization
        );
    }
    let oversized = format!("MediaBrowser Token=\"{}\"", "a".repeat(5000));
    assert!(socket_target("https://media.example", &oversized).is_err());
}

#[test]
fn redaction_canary_stays_out_of_targets_and_errors() {
    let target = socket_target("https://media.example", HEADER).expect("valid");
    assert!(!format!("{target:?}").contains(CANARY));

    let bad_url = format!("https://user:{CANARY}@media.example/?ApiKey={CANARY}");
    let error = socket_target(&bad_url, HEADER).unwrap_err();
    assert!(!error.to_string().contains(CANARY));
    assert!(!format!("{error:?}").contains(CANARY));

    let bad_header = format!("Bearer {CANARY}");
    let error = socket_target("https://media.example", &bad_header).unwrap_err();
    assert!(!error.to_string().contains(CANARY));
}

#[test]
fn redaction_canary_stays_out_of_connection_errors() {
    let refused = http::Response::builder()
        .status(StatusCode::UNAUTHORIZED)
        .header(
            "WWW-Authenticate",
            format!("MediaBrowser Token=\"{CANARY}\""),
        )
        .body(Some(format!("Token {CANARY} is invalid").into_bytes()))
        .expect("response");
    let errors = [
        SocketError::Http(Box::new(refused)),
        SocketError::Io(std::io::Error::other(format!(
            "connect https://media.example/socket?ApiKey={CANARY}"
        ))),
        SocketError::Url(tokio_tungstenite::tungstenite::error::UrlError::UnsupportedUrlScheme),
        SocketError::ConnectionClosed,
    ];
    for error in &errors {
        let description = describe_connection_error(error);
        assert!(!description.contains(CANARY), "{description}");
        assert!(!description.contains("https://"), "{description}");
    }
    assert!(is_auth_refusal(&errors[0]));
    assert!(!is_auth_refusal(&errors[1]));
}

#[test]
fn reconnect_backoff_is_capped() {
    let delays: Vec<u64> = (0..8).map(|n| reconnect_delay(n).as_secs()).collect();
    assert_eq!(delays, vec![1, 2, 4, 8, 16, 30, 30, 30]);
    assert_eq!(reconnect_delay(u32::MAX), Duration::from_secs(30));
}

/// A loopback stand-in for Jellyfin's WebSocketManager: it refuses the
/// upgrade without the header, sends ForceKeepAlive on connect like
/// SessionWebSocketListener, and expects KeepAlive replies.
#[tokio::test]
async fn opens_the_socket_with_header_auth_and_answers_keep_alives() {
    let listener = TcpListener::bind("127.0.0.1:0").await.expect("bind");
    let port = listener.local_addr().expect("addr").port();
    let (header_tx, mut header_rx) = mpsc::unbounded_channel::<Option<String>>();
    let (keep_alive_tx, mut keep_alive_rx) = mpsc::unbounded_channel::<String>();

    let server = tokio::spawn(async move {
        let (stream, _) = listener.accept().await.expect("accept");
        // tungstenite's handshake Callback fixes this Result type.
        #[allow(clippy::result_large_err)]
        let callback = move |request: &Request, response: Response| {
            let header = request
                .headers()
                .get(AUTHORIZATION)
                .and_then(|value| value.to_str().ok())
                .map(str::to_string);
            let path_and_query = request.uri().to_string();
            assert_eq!(path_and_query, "/socket");
            let _ = header_tx.send(header);
            Ok(response)
        };
        let mut socket = tokio_tungstenite::accept_hdr_async(stream, callback)
            .await
            .expect("handshake");
        socket
            .send(Message::text(
                r#"{"MessageType":"ForceKeepAlive","MessageId":"00000000-0000-0000-0000-000000000000","ServerId":null,"Data":2}"#,
            ))
            .await
            .expect("send force keepalive");
        socket
            .send(Message::text(USER_DATA_CHANGED))
            .await
            .expect("send user data");
        socket
            .send(Message::text(r#"{"MessageType":"Play","Data":{}}"#))
            .await
            .expect("send play");
        // Like WebSocketConnection.SendKeepAliveResponse: answer each KeepAlive.
        while let Some(Ok(message)) = socket.next().await {
            if let Message::Text(text) = message {
                let _ = keep_alive_tx.send(text.to_string());
                let _ = socket.send(Message::text(KEEP_ALIVE)).await;
            }
        }
    });

    let target = socket_target(&format!("http://127.0.0.1:{port}"), HEADER).expect("target");
    let (event_tx, mut event_rx) = mpsc::unbounded_channel::<ServerEvent>();
    let client = tokio::spawn(run_supervised(target, move |event| {
        let _ = event_tx.send(event);
    }));

    let wait = Duration::from_secs(5);
    let header = timeout(wait, header_rx.recv())
        .await
        .expect("header in time");
    assert_eq!(header.flatten().as_deref(), Some(HEADER));

    assert_eq!(
        timeout(wait, event_rx.recv()).await.expect("connected"),
        Some(ServerEvent::Connection {
            state: ConnectionState::Connected
        })
    );
    assert_eq!(
        timeout(wait, event_rx.recv()).await.expect("user data"),
        Some(ServerEvent::UserDataChanged {
            item_ids: vec![
                "aaaabbbbccccddddeeeeffff00001111".into(),
                "22223333444455556666777788889999".into(),
            ]
        })
    );

    // One immediate answer, then one per half-interval (1 s for Data: 2).
    for _ in 0..2 {
        let reply = timeout(wait, keep_alive_rx.recv())
            .await
            .expect("keepalive");
        assert_eq!(reply.as_deref(), Some(KEEP_ALIVE));
    }
    // The Play message was dropped: nothing else reached the frontend.
    assert!(event_rx.try_recv().is_err());

    client.abort();
    server.abort();
}

#[tokio::test]
async fn stops_when_the_server_refuses_the_token() {
    let listener = TcpListener::bind("127.0.0.1:0").await.expect("bind");
    let port = listener.local_addr().expect("addr").port();
    let server = tokio::spawn(async move {
        let (stream, _) = listener.accept().await.expect("accept");
        // tungstenite's handshake Callback fixes this Result type.
        #[allow(clippy::result_large_err)]
        let callback = |_request: &Request, _response: Response| {
            let refusal = http::Response::builder()
                .status(StatusCode::UNAUTHORIZED)
                .body(Some("Token is required".to_string()))
                .expect("response");
            Err(refusal)
        };
        let _ = tokio_tungstenite::accept_hdr_async(stream, callback).await;
    });

    let target = socket_target(&format!("http://127.0.0.1:{port}"), HEADER).expect("target");
    let (event_tx, mut event_rx) = mpsc::unbounded_channel::<ServerEvent>();
    let finished = timeout(
        Duration::from_secs(5),
        run_supervised(target, move |event| {
            let _ = event_tx.send(event);
        }),
    )
    .await;
    assert!(finished.is_ok(), "run should stop after a 401");
    assert!(event_rx.try_recv().is_err());
    server.abort();
}

/// Exercises the rustls connector: TCP connects, the TLS handshake fails
/// against a plain listener, and the loop keeps running without panicking.
#[tokio::test]
async fn tls_failures_are_retried_without_panicking() {
    let listener = TcpListener::bind("127.0.0.1:0").await.expect("bind");
    let port = listener.local_addr().expect("addr").port();
    let (accepted_tx, mut accepted_rx) = mpsc::unbounded_channel::<()>();
    let server = tokio::spawn(async move {
        loop {
            let Ok((stream, _)) = listener.accept().await else {
                return;
            };
            let _ = accepted_tx.send(());
            drop(stream);
        }
    });

    let target = socket_target(&format!("https://localhost:{port}"), HEADER).expect("target");
    assert_eq!(
        target.url.as_str(),
        format!("wss://localhost:{port}/socket")
    );
    let (event_tx, mut event_rx) = mpsc::unbounded_channel::<ServerEvent>();
    let client = tokio::spawn(run_supervised(target, move |event| {
        let _ = event_tx.send(event);
    }));

    let wait = Duration::from_secs(5);
    timeout(wait, accepted_rx.recv())
        .await
        .expect("tcp connect");
    // The first failure waits 2 s before the second attempt.
    timeout(wait, accepted_rx.recv()).await.expect("reconnect");
    assert!(!client.is_finished(), "the loop must survive a TLS failure");
    assert!(event_rx.try_recv().is_err());

    client.abort();
    server.abort();
}

/// Live check against a pinned fixture server (`pnpm fixture:up`,
/// `pnpm fixture:setup`). Set FLUSTER_SOCKET_SERVER, FLUSTER_SOCKET_AUTH, and
/// optionally FLUSTER_SOCKET_WAIT_SECONDS; mark an item played from another
/// client while it runs. Proves header auth, a UserDataChanged event, and that
/// keepalives hold the socket open past the server's 60 s timeout.
#[tokio::test]
#[ignore = "needs a live Jellyfin fixture server"]
async fn live_fixture_server_socket() {
    let (Ok(server), Ok(authorization)) = (
        std::env::var("FLUSTER_SOCKET_SERVER"),
        std::env::var("FLUSTER_SOCKET_AUTH"),
    ) else {
        panic!("set FLUSTER_SOCKET_SERVER and FLUSTER_SOCKET_AUTH");
    };
    let wait_seconds: u64 = std::env::var("FLUSTER_SOCKET_WAIT_SECONDS")
        .ok()
        .and_then(|value| value.parse().ok())
        .unwrap_or(75);
    let target = socket_target(&server, &authorization).expect("target");
    let (event_tx, mut event_rx) = mpsc::unbounded_channel::<ServerEvent>();
    let client = tokio::spawn(run_supervised(target, move |event| {
        let _ = event_tx.send(event);
    }));

    let mut events = Vec::new();
    let deadline = tokio::time::Instant::now() + Duration::from_secs(wait_seconds);
    while let Ok(Some(event)) = tokio::time::timeout_at(deadline, event_rx.recv()).await {
        events.push(event);
    }
    client.abort();

    assert_eq!(
        events.first(),
        Some(&ServerEvent::Connection {
            state: ConnectionState::Connected
        })
    );
    assert!(
        !events.contains(&ServerEvent::Connection {
            state: ConnectionState::Disconnected
        }),
        "the socket dropped: {events:?}"
    );
    assert!(
        events
            .iter()
            .any(|event| matches!(event, ServerEvent::UserDataChanged { .. })),
        "no UserDataChanged: {events:?}"
    );
}

/// A server that sends one ForceKeepAlive per connection and either answers
/// KeepAlives (like Jellyfin) or goes silent. Reports each accepted socket.
async fn keep_alive_server(
    data: &'static str,
    answers_keep_alives: bool,
) -> (u16, mpsc::UnboundedReceiver<()>) {
    let listener = TcpListener::bind("127.0.0.1:0").await.expect("bind");
    let port = listener.local_addr().expect("addr").port();
    let (accepted_tx, accepted_rx) = mpsc::unbounded_channel::<()>();
    tokio::spawn(async move {
        while let Ok((stream, _)) = listener.accept().await {
            let accepted_tx = accepted_tx.clone();
            tokio::spawn(async move {
                let Ok(mut socket) = tokio_tungstenite::accept_async(stream).await else {
                    return;
                };
                let _ = accepted_tx.send(());
                let force = format!(r#"{{"MessageType":"ForceKeepAlive","Data":{data}}}"#);
                let _ = socket.send(Message::text(force)).await;
                while let Some(Ok(message)) = socket.next().await {
                    if answers_keep_alives && message.is_text() {
                        let _ = socket.send(Message::text(KEEP_ALIVE)).await;
                    }
                }
            });
        }
    });
    (port, accepted_rx)
}

fn spawn_client(
    port: u16,
) -> (
    tokio::task::JoinHandle<()>,
    mpsc::UnboundedReceiver<ServerEvent>,
) {
    let target = socket_target(&format!("http://127.0.0.1:{port}"), HEADER).expect("target");
    let (event_tx, event_rx) = mpsc::unbounded_channel::<ServerEvent>();
    let client = tokio::spawn(run_supervised(target, move |event| {
        let _ = event_tx.send(event);
    }));
    (client, event_rx)
}

#[tokio::test]
async fn a_huge_keep_alive_timeout_is_clamped_instead_of_panicking() {
    let (port, mut accepted) = keep_alive_server("18446744073709551615", true).await;
    let (client, mut events) = spawn_client(port);

    let wait = Duration::from_secs(5);
    timeout(wait, accepted.recv()).await.expect("accepted");
    assert_eq!(
        timeout(wait, events.recv()).await.expect("connected"),
        Some(ServerEvent::Connection {
            state: ConnectionState::Connected
        })
    );
    tokio::time::sleep(Duration::from_millis(500)).await;
    assert!(!client.is_finished(), "the socket task must survive");
    assert!(events.try_recv().is_err(), "no disconnect expected");
    client.abort();
}

#[tokio::test]
async fn a_silent_server_is_treated_as_disconnected_and_reconnected() {
    // Data 2 -> keepalive every 1 s -> idle limit 2 s.
    let (port, mut accepted) = keep_alive_server("2", false).await;
    let (client, mut events) = spawn_client(port);

    let wait = Duration::from_secs(5);
    timeout(wait, accepted.recv())
        .await
        .expect("first connection");
    assert_eq!(
        timeout(wait, events.recv()).await.expect("connected"),
        Some(ServerEvent::Connection {
            state: ConnectionState::Connected
        })
    );
    assert_eq!(
        timeout(wait, events.recv()).await.expect("idle disconnect"),
        Some(ServerEvent::Connection {
            state: ConnectionState::Disconnected
        })
    );
    timeout(wait, accepted.recv()).await.expect("reconnected");
    client.abort();
}

#[tokio::test]
async fn an_answering_server_keeps_the_socket_open_past_the_idle_limit() {
    let (port, mut accepted) = keep_alive_server("2", true).await;
    let (client, mut events) = spawn_client(port);

    let wait = Duration::from_secs(5);
    timeout(wait, accepted.recv()).await.expect("accepted");
    timeout(wait, events.recv()).await.expect("connected");
    tokio::time::sleep(Duration::from_millis(3500)).await;
    assert!(events.try_recv().is_err(), "the socket must stay open");
    client.abort();
}

#[tokio::test(start_paused = true)]
async fn a_panicking_socket_task_reports_disconnected_and_restarts() {
    let starts = std::sync::atomic::AtomicU32::new(0);
    let (event_tx, mut events) = mpsc::unbounded_channel::<ServerEvent>();
    let emit = move |event| {
        let _ = event_tx.send(event);
    };
    let supervisor = supervise(
        || {
            let attempt = starts.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
            async move {
                if attempt == 0 {
                    panic!("simulated socket task failure");
                }
            }
        },
        &emit,
    );
    timeout(Duration::from_secs(120), supervisor)
        .await
        .expect("the supervisor returns once the restarted task ends");

    assert_eq!(starts.load(std::sync::atomic::Ordering::SeqCst), 2);
    assert_eq!(
        events.try_recv().ok(),
        Some(ServerEvent::Connection {
            state: ConnectionState::Disconnected
        })
    );
}
