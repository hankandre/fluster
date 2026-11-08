use super::attributes::{names_a_resource, parse, render, Attribute, Value};

fn attribute(name: &str, value: Value) -> Attribute {
    Attribute {
        name: name.into(),
        value,
    }
}

#[test]
fn hls_attributes_parse_quoted_and_plain_values_and_render_them_back() {
    let text = "BANDWIDTH=1280000,CODECS=\"avc1.640028,mp4a.40.2\",RESOLUTION=1920x1080,NAME=\"Commentary: Director\"";
    let attributes = parse(text).expect("a valid list");
    assert_eq!(
        attributes,
        vec![
            attribute("BANDWIDTH", Value::Plain("1280000".into())),
            attribute("CODECS", Value::Quoted("avc1.640028,mp4a.40.2".into())),
            attribute("RESOLUTION", Value::Plain("1920x1080".into())),
            attribute("NAME", Value::Quoted("Commentary: Director".into())),
        ]
    );
    assert_eq!(render(&attributes), text);
}

#[test]
fn hls_attributes_refuse_forms_ffmpeg_would_read_differently() {
    for text in [
        "",
        "URI",
        "URI=",
        "uri=\"a\"",
        "URI=\"a\",",
        "URI=\"a\",URI=\"b\"",
        "URI=\"a\\\"b\"",
        "URI=\"unterminated",
        "URI=a b",
        "URI=a\"b",
        " URI=\"a\"",
        "URI =\"a\"",
        "URI=\"a\" ,METHOD=NONE",
        "URI=\"a\"METHOD=NONE",
        "URI=\"line\u{7}\"",
        "X_Y=1",
    ] {
        assert_eq!(parse(text), None, "{text:?}");
    }
}

#[test]
fn hls_attributes_name_resources_by_name_and_by_shape() {
    let named =
        |name: &str, value: &str| names_a_resource(&attribute(name, Value::Quoted(value.into())));
    for (name, value) in [
        ("URI", "main.m3u8"),
        ("SERVER-URI", "steer.json"),
        ("X-ASSET-URI", "ad.m3u8"),
        ("X-ASSET-LIST", "ads.json"),
        ("DATA-ID", "https://other.example/x"),
        ("X-CUSTOM", "//other.example/x"),
        ("X-CUSTOM", "/videos/x"),
        ("X-CUSTOM", "data:text/plain,hi"),
        ("KEYFORMAT", "urn:uuid:1"),
    ] {
        assert!(named(name, value), "{name}={value}");
    }
    for (name, value) in [
        ("CODECS", "avc1.640028,mp4a.40.2"),
        ("NAME", "Commentary: Director"),
        ("GROUP-ID", "audio"),
        ("START-DATE", "2026-01-01T00:00:00Z"),
        ("VIDEO-RANGE", "SDR"),
    ] {
        assert!(!named(name, value), "{name}={value}");
    }
}
