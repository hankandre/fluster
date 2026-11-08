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

fn sender(ip: &str) -> SocketAddr {
    SocketAddr::new(ip.parse().expect("ip"), DISCOVERY_PORT)
}

fn lan() -> SocketAddr {
    sender("192.168.1.5")
}

fn server(datagram: &[u8], from: SocketAddr) -> DiscoveredServer {
    match parse_reply(datagram, from) {
        ParsedReply::Server(server) => server,
        other => panic!("expected a server, got {other:?}"),
    }
}

#[test]
fn the_payload_is_jellyfins_discovery_message_on_port_7359() {
    assert_eq!(DISCOVERY_MESSAGE, b"who is JellyfinServer?");
    assert_eq!(DISCOVERY_PORT, 7359);
}

#[test]
fn parses_a_jellyfin_reply_with_its_sender() {
    let found = server(
        &reply("http://192.168.1.5:8096", SERVER_ID, "Living room"),
        lan(),
    );
    assert_eq!(
        found,
        DiscoveredServer {
            name: "Living room".into(),
            id: SERVER_ID.into(),
            address: "http://192.168.1.5:8096".into(),
            advertised_by: "192.168.1.5".into(),
            address_is_sender: true,
            conflicting: false,
        }
    );
}

#[test]
fn marks_an_address_that_is_not_the_sender() {
    let other_host = server(&reply("http://192.168.1.9:8096", SERVER_ID, "Den"), lan());
    assert_eq!(other_host.advertised_by, "192.168.1.5");
    assert!(!other_host.address_is_sender);

    let name = server(&reply("http://nas.local:8096", SERVER_ID, "Den"), lan());
    assert!(!name.address_is_sender);

    let mapped = server(
        &reply("http://[::ffff:192.168.1.5]:8096", SERVER_ID, "Den"),
        lan(),
    );
    assert!(mapped.address_is_sender);
}

#[test]
fn keeps_a_base_path_and_https_addresses() {
    let found = server(
        &reply("https://media.example/jellyfin/", SERVER_ID, "Remote"),
        lan(),
    );
    assert_eq!(found.address, "https://media.example/jellyfin");
}

#[test]
fn malformed_replies_are_invalid_without_panicking() {
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
        reply("http://192.168.1.5:8096", "", "Empty id"),
        reply("http://192.168.1.5:8096", "../../etc", "Odd id"),
        reply("http://192.168.1.5:8096", &"a".repeat(65), "Long id"),
    ] {
        assert_eq!(
            parse_reply(&datagram, lan()),
            ParsedReply::Invalid,
            "{datagram:?}"
        );
    }
}

#[test]
fn oversized_replies_are_invalid() {
    let padding = "x".repeat(MAX_REPLY_BYTES);
    let datagram = reply("http://192.168.1.5:8096", SERVER_ID, &padding);
    assert!(datagram.len() > MAX_REPLY_BYTES);
    assert_eq!(parse_reply(&datagram, lan()), ParsedReply::Invalid);
}

#[test]
fn names_are_cleaned_and_bounded() {
    let found = server(
        &reply(
            "http://192.168.1.5:8096",
            SERVER_ID,
            "  Den\u{0007}\nServer  ",
        ),
        lan(),
    );
    assert_eq!(found.name, "DenServer");

    let long = server(
        &reply("http://192.168.1.5:8096", SERVER_ID, &"n".repeat(500)),
        lan(),
    );
    assert_eq!(long.name.chars().count(), MAX_NAME_CHARS);

    let unnamed = server(&reply("http://192.168.1.5:8096", SERVER_ID, " \t"), lan());
    assert_eq!(unnamed.name, UNNAMED_SERVER);
}

#[test]
fn invisible_and_bidi_characters_are_stripped_from_names() {
    let found = server(
        &reply(
            "http://192.168.1.5:8096",
            SERVER_ID,
            "n\u{202e}xilfknaH\u{200b}",
        ),
        lan(),
    );
    assert_eq!(found.name, "nxilfknaH");
    let every_hidden: String = ('\u{200B}'..='\u{200F}')
        .chain('\u{202A}'..='\u{202E}')
        .chain('\u{2060}'..='\u{2069}')
        .chain(['\u{FEFF}', '\u{0000}', '\u{001B}', '\u{0085}'])
        .collect();
    let hidden = server(
        &reply(
            "http://192.168.1.5:8096",
            SERVER_ID,
            &format!("A{every_hidden}B"),
        ),
        lan(),
    );
    assert_eq!(hidden.name, "AB");
}

#[test]
fn addresses_the_url_policy_refuses_are_counted_as_refused() {
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
        "not a url",
    ] {
        assert_eq!(
            parse_reply(&reply(address, SERVER_ID, "Server"), lan()),
            ParsedReply::Refused,
            "{address}"
        );
    }
    let long = format!("http://192.168.1.5:8096/{}", "a".repeat(MAX_ADDRESS_BYTES));
    assert_eq!(
        parse_reply(&reply(&long, SERVER_ID, "Server"), lan()),
        ParsedReply::Refused
    );
}

#[test]
fn loopback_addresses_are_kept_only_from_a_loopback_sender() {
    for address in [
        "http://127.0.0.1:8096",
        "http://127.12.34.56:8096",
        "http://localhost:8096",
        "http://[::1]:8096",
        "https://localhost/",
        "http://[::ffff:127.0.0.1]/",
    ] {
        assert_eq!(
            parse_reply(&reply(address, SERVER_ID, "Server"), lan()),
            ParsedReply::Refused,
            "{address} from the LAN"
        );
        assert!(
            matches!(
                parse_reply(&reply(address, SERVER_ID, "Server"), sender("127.0.0.1")),
                ParsedReply::Server(_)
            ),
            "{address} from loopback"
        );
    }
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
/// URL policy allows it: loopback (from a loopback sender) and private LAN
/// (including link-local 169.254/16 and fe80::/10) over plain HTTP, never
/// public.
#[test]
fn plain_http_follows_the_shared_host_class_table() {
    let table: Table =
        serde_json::from_str(include_str!("../../../tests/fixtures/host-classes.json"))
            .expect("valid host-classes.json");
    assert!(!table.vectors.is_empty());
    for vector in table.vectors {
        let from = if vector.class == "loopback" {
            sender("127.0.0.1")
        } else {
            lan()
        };
        let kept = matches!(
            parse_reply(&reply(&vector.url, SERVER_ID, "Server"), from),
            ParsedReply::Server(_)
        );
        assert_eq!(kept, vector.class != "public", "{}", vector.url);
    }
}

#[test]
fn a_repeated_reply_is_kept_once() {
    let mut collector = Collector::default();
    collector.accept(&reply("http://192.168.1.5:8096", SERVER_ID, "First"), lan());
    collector.accept(&reply("http://192.168.1.5:8096", SERVER_ID, "Again"), lan());
    collector.accept(
        &reply(
            "http://192.168.1.5:8096",
            &SERVER_ID.to_ascii_uppercase(),
            "Upper",
        ),
        lan(),
    );
    let result = collector.finish();
    assert_eq!(result.servers.len(), 1);
    assert_eq!(result.servers[0].name, "First");
    assert!(!result.servers[0].conflicting);
}

/// When a spoofed reply and the real server's reply both arrive, both are
/// listed, both are marked, and each shows its claimed sender.
#[test]
fn the_same_id_at_different_addresses_is_kept_and_marked_conflicting() {
    let mut collector = Collector::default();
    collector.accept(
        &reply("http://192.168.1.66:8096", SERVER_ID, "Living room"),
        sender("192.168.1.66"),
    );
    collector.accept(
        &reply("http://192.168.1.5:8096", SERVER_ID, "Living room"),
        lan(),
    );
    collector.accept(
        &reply("http://192.168.1.7:8096", "otherserver", "Den"),
        sender("192.168.1.7"),
    );
    let result = collector.finish();
    assert_eq!(result.servers.len(), 3);
    assert!(result.servers[0].conflicting);
    assert!(result.servers[1].conflicting);
    assert!(!result.servers[2].conflicting);
    assert_eq!(result.servers[0].advertised_by, "192.168.1.66");
    assert_eq!(result.servers[1].advertised_by, "192.168.1.5");
}

#[test]
fn refused_replies_are_counted() {
    let mut collector = Collector::default();
    collector.accept(&reply("http://8.8.8.8:8096", SERVER_ID, "Public"), lan());
    collector.accept(&reply("http://127.0.0.1:8096", SERVER_ID, "Loop"), lan());
    collector.accept(b"junk", lan());
    let result = collector.finish();
    assert!(result.servers.is_empty());
    assert_eq!(result.refused, 2);
}

/// Guardian's scenario: a fake reply with the real id, then fillers until
/// the list is full, then the real server. The real reply is still read,
/// the kept entry is marked conflicting, and the overflow is counted.
#[test]
fn a_full_list_still_flags_a_later_conflicting_reply() {
    let mut collector = Collector::default();
    collector.accept(
        &reply("http://192.168.1.66:8096", SERVER_ID, "Hankflix"),
        sender("192.168.1.66"),
    );
    for index in 0..(MAX_SERVERS - 1) {
        collector.accept(
            &reply(
                "http://192.168.1.66:8096",
                &format!("filler{index}"),
                "Filler",
            ),
            sender("192.168.1.66"),
        );
    }
    assert!(collector.is_full());
    collector.accept(
        &reply("http://192.168.1.5:8096", SERVER_ID, "Hankflix"),
        lan(),
    );
    // A repeat of a kept pair is neither a conflict nor a drop.
    collector.accept(
        &reply("http://192.168.1.66:8096", "filler0", "Filler"),
        sender("192.168.1.66"),
    );
    let result = collector.finish();
    assert_eq!(result.servers.len(), MAX_SERVERS);
    let hankflix: Vec<_> = result
        .servers
        .iter()
        .filter(|server| server.id == SERVER_ID)
        .collect();
    assert_eq!(hankflix.len(), 1);
    assert!(hankflix[0].conflicting);
    assert!(result
        .servers
        .iter()
        .filter(|server| server.id != SERVER_ID)
        .all(|server| !server.conflicting));
    assert_eq!(result.dropped, 1);
}

#[test]
fn at_most_max_servers_are_kept() {
    let mut collector = Collector::default();
    for index in 0..(MAX_SERVERS + 5) {
        collector.accept(
            &reply(
                "http://192.168.1.5:8096",
                &format!("server{index}"),
                "Server",
            ),
            lan(),
        );
    }
    assert!(collector.is_full());
    let result = collector.finish();
    assert_eq!(result.servers.len(), MAX_SERVERS);
    assert_eq!(result.dropped, 5);
}

#[test]
fn only_one_search_runs_at_a_time() {
    let flag = AtomicBool::new(false);
    let first = SearchGuard::acquire(&flag).expect("first search");
    assert_eq!(
        SearchGuard::acquire(&flag).err(),
        Some(DiscoveryError::Busy)
    );
    assert_eq!(
        DiscoveryError::Busy.to_string(),
        "Fluster is already searching this network for servers."
    );
    drop(first);
    assert!(SearchGuard::acquire(&flag).is_ok());
}

/// A fake Jellyfin on 127.0.0.1 that answers with `replies`. Sends the
/// received request back on `seen`.
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
        reply("http://127.0.0.1:8096", "loopserver", "Local"),
    ]);

    let started = Instant::now();
    let result = discover(target, Duration::from_millis(500)).expect("discover");
    assert!(started.elapsed() < Duration::from_secs(2));

    assert_eq!(
        seen.recv_timeout(Duration::from_secs(1)).expect("request"),
        DISCOVERY_MESSAGE
    );
    assert_eq!(result.refused, 1);
    assert_eq!(
        result.servers,
        vec![
            DiscoveredServer {
                name: "Living room".into(),
                id: SERVER_ID.into(),
                address: "http://192.168.1.5:8096".into(),
                advertised_by: "127.0.0.1".into(),
                address_is_sender: false,
                conflicting: false,
            },
            DiscoveredServer {
                name: "Local".into(),
                id: "loopserver".into(),
                address: "http://127.0.0.1:8096".into(),
                advertised_by: "127.0.0.1".into(),
                address_is_sender: true,
                conflicting: false,
            },
        ]
    );
}

#[test]
fn junk_datagrams_do_not_end_the_search() {
    let mut replies: Vec<Vec<u8>> = (0..100)
        .map(|index| format!("junk {index}").into_bytes())
        .collect();
    replies.extend((0..10).map(|_| vec![b'x'; MAX_REPLY_BYTES + 100]));
    replies.push(reply("http://192.168.1.5:8096", SERVER_ID, "Living room"));
    let (target, _seen) = fake_responder(replies);
    let result = discover(target, Duration::from_millis(700)).expect("discover");
    assert_eq!(result.servers.len(), 1);
    assert_eq!(result.servers[0].name, "Living room");
}

#[test]
fn a_full_list_does_not_stop_reading_over_the_wire() {
    let mut replies = vec![reply("http://192.168.1.66:8096", SERVER_ID, "Hankflix")];
    replies.extend((0..(MAX_SERVERS - 1)).map(|index| {
        reply(
            "http://192.168.1.66:8096",
            &format!("filler{index}"),
            "Filler",
        )
    }));
    replies.push(reply("http://192.168.1.5:8096", SERVER_ID, "Hankflix"));
    let (target, _seen) = fake_responder(replies);
    let result = discover(target, Duration::from_millis(700)).expect("discover");
    assert_eq!(result.servers.len(), MAX_SERVERS);
    assert!(
        result
            .servers
            .iter()
            .find(|server| server.id == SERVER_ID)
            .expect("kept")
            .conflicting
    );
    assert!(result.dropped > 0);
}

#[test]
fn no_reply_returns_an_empty_result_after_the_deadline() {
    // Bound but never answers.
    let silent = UdpSocket::bind("127.0.0.1:0").expect("bind");
    let target = silent.local_addr().expect("address");
    let started = Instant::now();
    let result = discover(target, Duration::from_millis(300)).expect("discover");
    let elapsed = started.elapsed();
    assert!(result.servers.is_empty());
    assert_eq!(result.refused, 0);
    assert_eq!(result.dropped, 0);
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
    let broadcast = discover_on_lan().expect("discover").servers;
    let dogfood_host = std::env::var("FLUSTER_DOGFOOD_SERVER")
        .ok()
        .and_then(|value| url::Url::parse(&value).ok())
        .and_then(|url| url.host_str().map(str::to_string));
    let direct = dogfood_host.as_ref().map(|host| {
        let target = std::net::ToSocketAddrs::to_socket_addrs(&(host.as_str(), DISCOVERY_PORT))
            .ok()
            .and_then(|mut addresses| addresses.next())
            .expect("dogfood host resolves");
        discover(target, LISTEN_TIME).expect("discover").servers
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
