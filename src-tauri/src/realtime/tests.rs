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

mod socket;
