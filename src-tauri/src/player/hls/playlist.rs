//! Parses one HLS playlist, rejects it unless every URI in it is same-origin
//! and credential-free, and writes the copy that libmpv reads.
//!
//! Every URI line and every URI-like attribute is checked, in every tag,
//! including tags FFmpeg ignores. The copy keeps only what FFmpeg's `hls`
//! demuxer acts on (`libavformat/hls.c` `parse_playlist`, FFmpeg 9.0.2), with
//! each URI rewritten to its absolute form and each attribute list rewritten
//! in canonical form. Tags FFmpeg ignores are checked, then left out, so
//! libmpv cannot open a playlist Rust has not fetched and validated.

use super::attributes::{self, Attribute, Value};
use super::uri::{mentions_credential, resolve_same_origin};
use super::HlsError;
use url::{Origin, Url};

// FFmpeg reads lines into a `MAX_URL_SIZE` (4096) buffer and silently splits
// longer ones; Rust refuses them instead.
const MAX_LINE_BYTES: usize = 4000;
const MAX_CHILD_PLAYLISTS: usize = 16;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(super) enum Kind {
    Master,
    Media,
}

#[derive(Debug)]
enum Line {
    Text(String),
    /// A URI line naming the child playlist with this index.
    Child(usize),
    /// A tag whose `URI` attribute names the child playlist with this index.
    TagWithChild(&'static str, Vec<Attribute>, usize),
}

#[derive(Debug)]
pub(super) struct Playlist {
    kind: Kind,
    lines: Vec<Line>,
    children: Vec<Url>,
}

/// Tags FFmpeg reads that hold no URI and no attribute list.
const PLAIN_TAGS: [&str; 10] = [
    "#EXTINF",
    "#EXT-X-TARGETDURATION",
    "#EXT-X-MEDIA-SEQUENCE",
    "#EXT-X-PLAYLIST-TYPE",
    "#EXT-X-BYTERANGE",
    "#EXT-X-ENDLIST",
    "#EXT-X-DISCONTINUITY",
    "#EXT-X-PROGRAM-DATE-TIME",
    "#EXT-X-VERSION",
    "#EXT-X-INDEPENDENT-SEGMENTS",
];
const MEDIA_ONLY_PLAIN_TAGS: [&str; 7] = [
    "#EXTINF",
    "#EXT-X-TARGETDURATION",
    "#EXT-X-MEDIA-SEQUENCE",
    "#EXT-X-PLAYLIST-TYPE",
    "#EXT-X-BYTERANGE",
    "#EXT-X-ENDLIST",
    "#EXT-X-DISCONTINUITY",
];
/// Master tags FFmpeg ignores; each URI in them is still checked.
const IGNORED_MASTER_TAGS: [&str; 5] = [
    "#EXT-X-I-FRAME-STREAM-INF",
    "#EXT-X-IMAGE-STREAM-INF",
    "#EXT-X-SESSION-DATA",
    "#EXT-X-SESSION-KEY",
    "#EXT-X-CONTENT-STEERING",
];
/// Media tags FFmpeg ignores; each URI in them is still checked.
const IGNORED_MEDIA_TAGS: [&str; 3] = [
    "#EXT-X-PART",
    "#EXT-X-PRELOAD-HINT",
    "#EXT-X-RENDITION-REPORT",
];

struct Parser<'a> {
    base: &'a Url,
    server: &'a Origin,
    master: bool,
    media: bool,
    complete: bool,
    pending_variant: Option<Vec<Attribute>>,
    pending_segment: bool,
    segments: usize,
    lines: Vec<Line>,
    children: Vec<Url>,
}

impl Playlist {
    /// `base` is the URL the body was fetched from; `server` is the origin
    /// every URI must resolve to.
    pub(super) fn parse(body: &str, base: &Url, server: &Origin) -> Result<Self, HlsError> {
        if mentions_credential(body) {
            return Err(HlsError::CredentialInPlaylist);
        }
        if body
            .chars()
            .any(|character| character.is_control() && !matches!(character, '\t' | '\r' | '\n'))
        {
            return Err(HlsError::Malformed);
        }
        // FFmpeg ends a line at `\r`, `\n`, or `\r\n`, and drops trailing
        // whitespace (`ff_get_chomp_line`).
        let mut lines = body
            .split(['\r', '\n'])
            .map(|line| line.trim_end_matches([' ', '\t']));
        if lines.next() != Some("#EXTM3U") {
            return Err(HlsError::Malformed);
        }
        let mut parser = Parser {
            base,
            server,
            master: false,
            media: false,
            complete: false,
            pending_variant: None,
            pending_segment: false,
            segments: 0,
            lines: vec![Line::Text("#EXTM3U".into())],
            children: Vec::new(),
        };
        for line in lines {
            if line.len() > MAX_LINE_BYTES {
                return Err(HlsError::Malformed);
            }
            parser.line(line)?;
        }
        parser.finish()
    }

    pub(super) fn kind(&self) -> Kind {
        self.kind
    }

    /// The child playlists (variants and renditions) in order.
    pub(super) fn children(&self) -> &[Url] {
        &self.children
    }

    /// The copy libmpv reads, with child `n` replaced by `child_urls[n]`.
    pub(super) fn render(&self, child_urls: &[String]) -> Result<String, HlsError> {
        let mut out = String::new();
        for line in &self.lines {
            let text = match line {
                Line::Text(text) => text.clone(),
                Line::Child(index) => child_urls.get(*index).ok_or(HlsError::Malformed)?.clone(),
                Line::TagWithChild(tag, attributes, index) => {
                    let url = child_urls.get(*index).ok_or(HlsError::Malformed)?;
                    let mut attributes = attributes.clone();
                    for attribute in attributes
                        .iter_mut()
                        .filter(|attribute| attribute.name == "URI")
                    {
                        attribute.value = Value::Quoted(url.clone());
                    }
                    format!("{tag}:{}", attributes::render(&attributes))
                }
            };
            if text.len() > MAX_LINE_BYTES {
                return Err(HlsError::Malformed);
            }
            out.push_str(&text);
            out.push('\n');
        }
        Ok(out)
    }
}

impl Parser<'_> {
    fn line(&mut self, line: &str) -> Result<(), HlsError> {
        if line.is_empty() {
            return Ok(());
        }
        if !line.starts_with('#') {
            return self.uri_line(line);
        }
        if !line.starts_with("#EXT") {
            // A comment: FFmpeg skips it, and so does the copy.
            return expect_resource_count(line, 0);
        }
        let (tag, rest) = match line.split_once(':') {
            Some((tag, rest)) => (tag, Some(rest)),
            None => (line, None),
        };
        if !tag[1..].chars().all(|character| {
            character.is_ascii_uppercase() || character.is_ascii_digit() || character == '-'
        }) {
            return Err(HlsError::Malformed);
        }
        if let Some(plain) = PLAIN_TAGS.iter().find(|plain| **plain == tag) {
            return self.plain_tag(plain, line);
        }
        match tag {
            "#EXT-X-STREAM-INF" => {
                self.master = true;
                let attributes = self.checked_attributes(line, rest, false)?;
                if self.pending_variant.replace(attributes).is_some() {
                    return Err(HlsError::Malformed);
                }
                Ok(())
            }
            "#EXT-X-MEDIA" => {
                self.master = true;
                let attributes = self.checked_attributes(line, rest, true)?;
                if attributes.iter().any(|attribute| attribute.name == "URI") {
                    let index = self.child(&attributes)?;
                    self.lines
                        .push(Line::TagWithChild("#EXT-X-MEDIA", attributes, index));
                } else {
                    self.push_tag(tag, &attributes);
                }
                Ok(())
            }
            "#EXT-X-MAP" | "#EXT-X-KEY" => {
                self.media = true;
                let attributes = self.absolute_uris(self.checked_attributes(line, rest, true)?)?;
                let method_none = attributes.iter().any(|attribute| {
                    attribute.name == "METHOD" && attribute.value.text() == "NONE"
                });
                let has_uri = attributes.iter().any(|attribute| attribute.name == "URI");
                let needs_uri = tag == "#EXT-X-MAP" || !method_none;
                if needs_uri && !has_uri {
                    return Err(HlsError::Malformed);
                }
                self.push_tag(tag, &attributes);
                Ok(())
            }
            "#EXT-X-START" => {
                let attributes = self.checked_attributes(line, rest, false)?;
                self.push_tag(tag, &attributes);
                Ok(())
            }
            "#EXT-X-DEFINE" | "#EXTM3U" => Err(HlsError::Malformed),
            _ if IGNORED_MASTER_TAGS.contains(&tag) => {
                self.master = true;
                self.checked_attributes(line, rest, true).map(drop)
            }
            _ if IGNORED_MEDIA_TAGS.contains(&tag) => {
                self.media = true;
                self.checked_attributes(line, rest, true).map(drop)
            }
            // Any other tag: checked like an attribute list when it is one,
            // then left out of the copy.
            _ => match rest.and_then(attributes::parse) {
                Some(attributes) => self.check_resources(line, &attributes).map(drop),
                None if rest.is_some_and(|rest| rest.contains("//")) => Err(HlsError::UnsafeUri),
                None => expect_resource_count(line, 0),
            },
        }
    }

    fn plain_tag(&mut self, tag: &'static str, line: &str) -> Result<(), HlsError> {
        expect_resource_count(line, 0)?;
        if MEDIA_ONLY_PLAIN_TAGS.contains(&tag) {
            self.media = true;
        }
        match tag {
            "#EXTINF" => {
                if self.pending_segment {
                    return Err(HlsError::Malformed);
                }
                self.pending_segment = true;
            }
            "#EXT-X-ENDLIST" => self.complete = true,
            _ => {}
        }
        self.lines.push(Line::Text(line.to_string()));
        Ok(())
    }

    /// Parses the attribute list and checks every resource in it.
    fn checked_attributes(
        &self,
        line: &str,
        rest: Option<&str>,
        may_name_resources: bool,
    ) -> Result<Vec<Attribute>, HlsError> {
        let attributes = rest
            .and_then(attributes::parse)
            .ok_or(HlsError::Malformed)?;
        let resources = self.check_resources(line, &attributes)?;
        if resources > 0 && !may_name_resources {
            return Err(HlsError::UnsafeUri);
        }
        Ok(attributes)
    }

    /// Checks every resource attribute and that the line names no other
    /// `URI=` that the parser did not see. Returns how many it checked.
    fn check_resources(&self, line: &str, attributes: &[Attribute]) -> Result<usize, HlsError> {
        let mut uri_names = 0;
        let mut resources = 0;
        for attribute in attributes
            .iter()
            .filter(|attribute| attributes::names_a_resource(attribute))
        {
            resolve_same_origin(attribute.value.text(), self.base, self.server)?;
            resources += 1;
            if attribute.name.ends_with("URI") {
                uri_names += 1;
            }
        }
        expect_resource_count(line, uri_names)?;
        Ok(resources)
    }

    /// Rewrites each `URI` attribute to its absolute same-origin form.
    fn absolute_uris(&self, mut attributes: Vec<Attribute>) -> Result<Vec<Attribute>, HlsError> {
        for attribute in attributes
            .iter_mut()
            .filter(|attribute| attribute.name == "URI")
        {
            let url = resolve_same_origin(attribute.value.text(), self.base, self.server)?;
            attribute.value = Value::Quoted(url.into());
        }
        Ok(attributes)
    }

    fn child(&mut self, attributes: &[Attribute]) -> Result<usize, HlsError> {
        let raw = attributes
            .iter()
            .find(|attribute| attribute.name == "URI")
            .map(|attribute| attribute.value.text())
            .ok_or(HlsError::Malformed)?;
        self.push_child(raw)
    }

    fn push_child(&mut self, raw: &str) -> Result<usize, HlsError> {
        let url = resolve_same_origin(raw, self.base, self.server)?;
        if self.children.len() >= MAX_CHILD_PLAYLISTS {
            return Err(HlsError::Malformed);
        }
        self.children.push(url);
        Ok(self.children.len() - 1)
    }

    fn push_tag(&mut self, tag: &str, attributes: &[Attribute]) {
        self.lines.push(Line::Text(format!(
            "{tag}:{}",
            attributes::render(attributes)
        )));
    }

    fn uri_line(&mut self, line: &str) -> Result<(), HlsError> {
        if let Some(attributes) = self.pending_variant.take() {
            let index = self.push_child(line)?;
            self.push_tag("#EXT-X-STREAM-INF", &attributes);
            self.lines.push(Line::Child(index));
            return Ok(());
        }
        if self.pending_segment {
            let url = resolve_same_origin(line, self.base, self.server)?;
            self.pending_segment = false;
            self.segments += 1;
            self.lines.push(Line::Text(url.into()));
            return Ok(());
        }
        // FFmpeg ignores a URI line with no tag before it; Rust refuses it.
        Err(HlsError::Malformed)
    }

    fn finish(self) -> Result<Playlist, HlsError> {
        if self.pending_variant.is_some() || self.pending_segment {
            return Err(HlsError::Malformed);
        }
        let kind = match (self.master, self.media) {
            (true, false) if !self.children.is_empty() => Kind::Master,
            (false, true) if self.segments > 0 => Kind::Media,
            _ => return Err(HlsError::Malformed),
        };
        // The copy is a snapshot: a live playlist would never grow.
        if kind == Kind::Media && !self.complete {
            return Err(HlsError::NotComplete);
        }
        Ok(Playlist {
            kind,
            lines: self.lines,
            children: self.children,
        })
    }
}

/// The line must contain exactly `expected` case-insensitive `URI=`
/// occurrences, so a URI the parser did not recognize fails closed.
fn expect_resource_count(line: &str, expected: usize) -> Result<(), HlsError> {
    if line.to_ascii_lowercase().matches("uri=").count() == expected {
        Ok(())
    } else {
        Err(HlsError::UnsafeUri)
    }
}
