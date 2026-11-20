//! `tls-verify=yes` on every handle: a loopback HTTPS server with a
//! self-signed certificate is refused before any request reaches it, and
//! the same server is played once its certificate is trusted, so the
//! refusal comes from certificate verification and nothing else.

use super::*;
use rustls::pki_types::{CertificateDer, PrivateKeyDer, PrivatePkcs8KeyDer};
use rustls::{ServerConfig, ServerConnection, StreamOwned};
use std::io::Read;
use std::path::PathBuf;

/// A self-signed certificate for `127.0.0.1`, as DER and as PEM.
struct SelfSigned {
    certificate: CertificateDer<'static>,
    key: Vec<u8>,
    pem: String,
}

fn self_signed() -> SelfSigned {
    let rcgen::CertifiedKey { cert, signing_key } =
        rcgen::generate_simple_self_signed(vec!["127.0.0.1".to_string()])
            .expect("a self-signed certificate");
    SelfSigned {
        certificate: cert.der().clone(),
        key: signing_key.serialize_der(),
        pem: cert.pem(),
    }
}

fn read_tls_head(stream: &mut StreamOwned<ServerConnection, std::net::TcpStream>) -> String {
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

/// Serves `/stream` (WAV) over TLS and records each request head that
/// arrives, which only happens after the client accepted the certificate.
fn serve_tls(listener: TcpListener, certificate: &SelfSigned) -> Requests {
    let config =
        ServerConfig::builder_with_provider(Arc::new(rustls::crypto::ring::default_provider()))
            .with_safe_default_protocol_versions()
            .expect("TLS versions")
            .with_no_client_auth()
            .with_single_cert(
                vec![certificate.certificate.clone()],
                PrivateKeyDer::Pkcs8(PrivatePkcs8KeyDer::from(certificate.key.clone())),
            )
            .expect("server certificate");
    let config = Arc::new(config);
    let requests: Requests = Arc::default();
    let recorded = requests.clone();
    thread::spawn(move || {
        for stream in listener.incoming() {
            let Ok(stream) = stream else { continue };
            let _ = stream.set_read_timeout(Some(Duration::from_secs(5)));
            let Ok(connection) = ServerConnection::new(config.clone()) else {
                continue;
            };
            let mut tls = StreamOwned::new(connection, stream);
            let head = read_tls_head(&mut tls);
            if head.is_empty() {
                continue;
            }
            recorded.lock().expect("requests mutex").push(head);
            let body = silent_wav();
            let response = format!(
                "HTTP/1.1 200 OK\r\nContent-Type: audio/wav\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
                body.len()
            );
            let _ = tls.write_all(response.as_bytes());
            let _ = tls.write_all(&body);
            let _ = tls.flush();
        }
    });
    requests
}

/// The test CA file, removed when dropped, including on an early return.
struct PemFile(PathBuf);

impl Drop for PemFile {
    fn drop(&mut self) {
        let _ = std::fs::remove_file(&self.0);
    }
}

fn pem_file(certificate: &SelfSigned) -> PemFile {
    let path = std::env::temp_dir().join(format!(
        "fluster-tls-test-{}-{:?}.pem",
        std::process::id(),
        thread::current().id()
    ));
    std::fs::write(&path, &certificate.pem).expect("write the test CA file");
    PemFile(path)
}

#[test]
fn https_servers_with_an_untrusted_certificate_are_refused() {
    let certificate = self_signed();
    let ca_file = pem_file(&certificate);
    for (label, trust_the_certificate, verify, expect_request) in [
        ("production options", false, true, false),
        ("certificate trusted through tls-ca-file", true, true, true),
        ("tls-verify off, as mpv 0.41 defaults", false, false, true),
    ] {
        let Some(mut mpv) = headless_player(&test_authorization()) else {
            return;
        };
        let verifying: bool = mpv.get_property("tls-verify").expect("tls-verify");
        assert!(verifying, "{label}: production handles verify");
        if trust_the_certificate {
            mpv.set_property("tls-ca-file", ca_file.0.to_str().expect("UTF-8 path"))
                .expect("tls-ca-file");
        }
        if !verify {
            mpv.set_property("tls-verify", false).expect("tls-verify");
        }
        let (listener, _) = listener();
        let port = listener.local_addr().expect("local address").port();
        let requests = serve_tls(listener, &certificate);
        mpv.command(
            "loadfile",
            &[&format!("https://127.0.0.1:{port}/stream"), "replace"],
        )
        .expect("loadfile");
        let outcome = wait_for_load(&mut mpv);
        let heads = requests.lock().expect("requests mutex").clone();
        eprintln!(
            "{label}: loaded {}, requests {}",
            matches!(outcome, LoadOutcome::Loaded),
            heads.len()
        );
        assert_eq!(!heads.is_empty(), expect_request, "{label}");
        assert_eq!(
            matches!(outcome, LoadOutcome::Loaded),
            expect_request,
            "{label}"
        );
        for head in &heads {
            assert_single_exact_header(head);
        }
    }
}
