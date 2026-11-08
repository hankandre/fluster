use super::*;
use std::net::UdpSocket;
use std::sync::mpsc;
use std::thread;

const SERVER_ID: &str = "4c2b8f1e0d3a4b6c9e7f1a2b3c4d5e6f";

fn reply(address: &str, id: &str, name: &str) -> Vec<u8> {
    serde_json::to_vec(&serde_json::json!({
        "Address": address,
        "Id": id,
        "Name": name,
        "EndpointAddress": null,
    }))
    .expect("json")
}

#[test]
fn the_payload_is_jellyfins_discovery_message_on_port_7359() {
    assert_eq!(DISCOVERY_MESSAGE, b"who is JellyfinServer?");
    assert_eq!(DISCOVERY_PORT, 7359);
}

#[test]
fn parses_a_jellyfin_reply() {
    let server = parse_reply(&reply("http://192.168.1.5:8096", SERVER_ID, "Living room"))
        .expect("valid reply");
    assert_eq!(
        server,
        DiscoveredServer {
            name: "Living room".into(),
            id: SERVER_ID.into(),
            address: "http://192.168.1.5:8096".into(),
        }
    );
}

#[test]
fn keeps_a_base_path_and_https_addresses() {
    let server = parse_reply(&reply(
        "https://media.example/jellyfin/",
        SERVER_ID,
        "Remote",
    ))
    .expect("https is allowed for every host");
    assert_eq!(server.address, "https://media.example/jellyfin");
}

#[test]
fn malformed_replies_are_dropped_without_panicking() {
    for datagram in [
        b"".to_vec(),
        b"who is JellyfinServer?".to_vec(),
        b"{".to_vec(),
        b"null".to_vec(),
        b"[]".to_vec(),
        b"{\"Address\":\"http://192.168.1.5:8096\"}".to_vec(),
        b"{\"Address\":5,\"Id\":\"a\",\"Name\":\"b\"}".to_vec(),
        b"{\"Address\":\"http://192.168.1.5:8096\",\"Id\":null,\"Name\":\"b\"}".to_vec(),
        vec![0xff, 0xfe, 0x00, 0x7b],
        "[".repeat(4000).into_bytes(),
        reply("not a url", SERVER_ID, "Bad"),
        reply("http://192.168.1.5:8096", "", "Empty id"),
        reply("http://192.168.1.5:8096", "../../etc", "Odd id"),
        reply("http://192.168.1.5:8096", &"a".repeat(65), "Long id"),
    ] {
        assert!(parse_reply(&datagram).is_none(), "{datagram:?}");
    }
}

#[test]
fn oversized_replies_are_dropped() {
    let padding = "x".repeat(MAX_REPLY_BYTES);
    let datagram = reply("http://192.168.1.5:8096", SERVER_ID, &padding);
    assert!(datagram.len() > MAX_REPLY_BYTES);
    assert!(parse_reply(&datagram).is_none());
}

#[test]
fn names_are_cleaned_and_bounded() {
    let server = parse_reply(&reply(
        "http://192.168.1.5:8096",
        SERVER_ID,
        "  Den\u{0007}\nServer  ",
    ))
    .expect("valid reply");
    assert_eq!(server.name, "DenServer");

    let long = parse_reply(&reply(
        "http://192.168.1.5:8096",
        SERVER_ID,
        &"n".repeat(500),
    ))
    .expect("valid reply");
    assert_eq!(long.name.chars().count(), MAX_NAME_CHARS);

    let unnamed =
        parse_reply(&reply("http://192.168.1.5:8096", SERVER_ID, " \t")).expect("valid reply");
    assert_eq!(unnamed.name, UNNAMED_SERVER);
}

#[test]
fn addresses_the_url_policy_refuses_are_dropped() {
    for address in [
        // Public plain HTTP, including CGNAT (ADR 0001 edge case 3).
        "http://8.8.8.8:8096",
        "http://100.64.0.1:8096",
        "http://media.example/",
        "http://jellyfin.lan:8096",
        "http://0.0.0.0:8096",
        "http://[ff02::1]/",
        // Credentials, fragments, queries, and other schemes.
        "http://user:pw@192.168.1.5:8096",
        "http://192.168.1.5:8096/#x",
        "http://192.168.1.5:8096/?api_key=secret",
        "ws://192.168.1.5:8096",
        "file:///etc/passwd",
        "javascript:alert(1)",
    ] {
        assert!(
            parse_reply(&reply(address, SERVER_ID, "Server")).is_none(),
            "{address}"
        );
    }
    let long = format!("http://192.168.1.5:8096/{}", "a".repeat(MAX_ADDRESS_BYTES));
    assert!(parse_reply(&reply(&long, SERVER_ID, "Server")).is_none());
}

#[derive(serde::Deserialize)]
struct Table {
    vectors: Vec<Vector>,
}

#[derive(serde::Deserialize)]
struct Vector {
    url: String,
    class: String,
}

/// Every address in the shared host-class table is kept exactly when the
/// URL policy allows it: loopback and private LAN (including link-local
/// 169.254/16 and fe80::/10) over plain HTTP, never public.
#[test]
fn plain_http_follows_the_shared_host_class_table() {
    let table: Table =
        serde_json::from_str(include_str!("../../../tests/fixtures/host-classes.json"))
            .expect("valid host-classes.json");
    assert!(!table.vectors.is_empty());
    for vector in table.vectors {
        let kept = parse_reply(&reply(&vector.url, SERVER_ID, "Server")).is_some();
        assert_eq!(kept, vector.class != "public", "{}", vector.url);
    }
}

#[test]
fn duplicate_ids_keep_the_first_reply() {
    let mut collector = Collector::default();
    collector.accept(&reply("http://192.168.1.5:8096", SERVER_ID, "First"));
    collector.accept(&reply("http://10.0.0.5:8096", SERVER_ID, "Second"));
    collector.accept(&reply(
        "http://10.0.0.5:8096",
        &SERVER_ID.to_ascii_uppercase(),
        "Upper",
    ));
    assert_eq!(collector.servers.len(), 1);
    assert_eq!(collector.servers[0].name, "First");
}

#[test]
fn at_most_max_servers_are_kept() {
    let mut collector = Collector::default();
    for index in 0..(MAX_SERVERS + 5) {
        collector.accept(&reply(
            "http://192.168.1.5:8096",
            &format!("server{index}"),
            "Server",
        ));
    }
    assert_eq!(collector.servers.len(), MAX_SERVERS);
    assert!(collector.is_full());
}

/// A fake Jellyfin on 127.0.0.1 that checks the request and answers with
/// `replies`. Sends the received request back on `seen`.
fn fake_responder(replies: Vec<Vec<u8>>) -> (SocketAddr, mpsc::Receiver<Vec<u8>>) {
    let socket = UdpSocket::bind("127.0.0.1:0").expect("bind responder");
    socket
        .set_read_timeout(Some(Duration::from_secs(5)))
        .expect("timeout");
    let address = socket.local_addr().expect("address");
    let (seen, received) = mpsc::channel();
    thread::spawn(move || {
        let mut buffer = [0_u8; 512];
        let Ok((length, from)) = socket.recv_from(&mut buffer) else {
            return;
        };
        let _ = seen.send(buffer[..length].to_vec());
        for datagram in replies {
            let _ = socket.send_to(&datagram, from);
        }
    });
    (address, received)
}

#[test]
fn round_trip_with_a_loopback_responder() {
    let (target, seen) = fake_responder(vec![
        b"not json".to_vec(),
        reply("http://8.8.8.8:8096", "publicserver", "Public"),
        reply("http://192.168.1.5:8096", SERVER_ID, "Living room"),
        reply("http://192.168.1.5:8096", SERVER_ID, "Living room again"),
        reply(
            "http://x.local:8096",
            &"f".repeat(32),
            &"y".repeat(MAX_REPLY_BYTES),
        ),
        reply("https://media.example", "otherserver", "Remote"),
    ]);

    let started = Instant::now();
    let servers = discover(target, Duration::from_millis(500)).expect("discover");
    assert!(started.elapsed() < Duration::from_secs(2));

    assert_eq!(
        seen.recv_timeout(Duration::from_secs(1)).expect("request"),
        DISCOVERY_MESSAGE
    );
    assert_eq!(
        servers,
        vec![
            DiscoveredServer {
                name: "Living room".into(),
                id: SERVER_ID.into(),
                address: "http://192.168.1.5:8096".into(),
            },
            DiscoveredServer {
                name: "Remote".into(),
                id: "otherserver".into(),
                address: "https://media.example".into(),
            },
        ]
    );
}

#[test]
fn no_reply_returns_an_empty_list_after_the_deadline() {
    // Bound but never answers.
    let silent = UdpSocket::bind("127.0.0.1:0").expect("bind");
    let target = silent.local_addr().expect("address");
    let started = Instant::now();
    let servers = discover(target, Duration::from_millis(300)).expect("discover");
    let elapsed = started.elapsed();
    assert!(servers.is_empty());
    assert!(elapsed >= Duration::from_millis(250), "{elapsed:?}");
    assert!(elapsed < Duration::from_secs(2), "{elapsed:?}");
}

fn has_hankflix(servers: &[DiscoveredServer]) -> bool {
    servers
        .iter()
        .any(|server| server.name.eq_ignore_ascii_case("Hankflix"))
}

fn yes_no(value: bool) -> &'static str {
    if value {
        "yes"
    } else {
        "no"
    }
}

/// Acceptance 3 (Hankflix). Needs the real LAN, so it is ignored by default:
/// `cargo test discovers_the_dogfood_server -- --ignored --nocapture`.
/// Prints only yes/no results, never an address, id, or name.
///
/// With `FLUSTER_DOGFOOD_SERVER` set it also sends the same datagram
/// directly to that host, which shows whether the server answers when the
/// broadcast cannot reach it (for example from another subnet).
#[test]
#[ignore = "needs the real LAN and the dogfood server"]
fn discovers_the_dogfood_server_on_the_lan() {
    let broadcast = discover_on_lan().expect("discover");
    let dogfood_host = std::env::var("FLUSTER_DOGFOOD_SERVER")
        .ok()
        .and_then(|value| url::Url::parse(&value).ok())
        .and_then(|url| url.host_str().map(str::to_string));
    let direct = dogfood_host.as_ref().map(|host| {
        let target = std::net::ToSocketAddrs::to_socket_addrs(&(host.as_str(), DISCOVERY_PORT))
            .ok()
            .and_then(|mut addresses| addresses.next())
            .expect("dogfood host resolves");
        discover(target, LISTEN_TIME).expect("discover")
    });
    println!(
        "broadcast: {} servers, Hankflix discovered: {}",
        broadcast.len(),
        yes_no(has_hankflix(&broadcast))
    );
    match &direct {
        Some(servers) => println!(
            "direct to dogfood host: Hankflix answered and passed the policy: {}",
            yes_no(has_hankflix(servers))
        ),
        None => println!("direct to dogfood host: not checked (FLUSTER_DOGFOOD_SERVER unset)"),
    }
    assert!(
        has_hankflix(&broadcast),
        "Hankflix did not answer the broadcast"
    );
}
