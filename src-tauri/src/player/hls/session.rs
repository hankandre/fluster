//! One HLS playback session: fetch and check every playlist and external
//! subtitle, then serve the checked copies from loopback for as long as the
//! session lives.

use super::fetch::{PlaylistFetcher, MAX_SUBTITLE_BYTES};
use super::loopback::{BoundLoopback, LoopbackServer, Served};
use super::master_url::{audio_stream_index, validate_master_url, MasterRules};
use super::playlist::{Kind, Playlist};
use super::subtitle::check_subtitle;
use super::uri::contains_secret;
use super::HlsError;
use crate::auth_header::MediaBrowserAuthorization;
use crate::model::HlsMediaKind;
use crate::player::network::has_credential_query;
use crate::url_policy::parse_allowed_url;
use std::collections::HashMap;
use url::{Origin, Url};

const PLAYLIST_TYPE: &str = "application/vnd.apple.mpegurl";
const SUBTITLE_TYPE: &str = "application/octet-stream";

/// What a converted launch needs. `server_url` is the signed-in server;
/// every other URL must share its origin, and the master must name the
/// plan's item, media source, and play session (`master_url.rs`).
pub(crate) struct HlsRequest<'a> {
    pub(crate) server_url: &'a str,
    pub(crate) master_url: &'a str,
    pub(crate) item_id: &'a str,
    pub(crate) media_source_id: &'a str,
    pub(crate) play_session_id: &'a str,
    pub(crate) media_kind: HlsMediaKind,
    /// External subtitle delivery URLs, in the order the plan lists them.
    pub(crate) subtitle_urls: &'a [String],
    pub(crate) authorization: &'a MediaBrowserAuthorization,
}

pub(crate) struct HlsSession {
    playlist_url: String,
    subtitle_urls: Vec<String>,
    audio_stream_index: Option<i64>,
    _server: LoopbackServer,
}

/// Fetches bodies with the header and checks them before anything else
/// sees them.
struct Checker<'a> {
    fetcher: PlaylistFetcher,
    authorization: &'a MediaBrowserAuthorization,
    server: Origin,
}

impl Checker<'_> {
    /// Fail closed when a body echoes the token itself (decision 0002, E2).
    fn refuse_secret(&self, body: &str) -> Result<(), HlsError> {
        let token = self.authorization.token().unwrap_or("");
        if contains_secret(body, token) {
            return Err(HlsError::CredentialInPlaylist);
        }
        Ok(())
    }

    fn playlist(&self, url: &Url, expected: Kind) -> Result<Playlist, HlsError> {
        let body = self.fetcher.fetch(url, self.authorization)?;
        self.refuse_secret(&body)?;
        let playlist = Playlist::parse(&body, url, &self.server)?;
        if playlist.kind() != expected {
            return Err(HlsError::Malformed);
        }
        Ok(playlist)
    }

    fn subtitle(&self, raw: &str) -> Result<Vec<u8>, HlsError> {
        let url = subtitle_url(raw, &self.server)?;
        let body = self
            .fetcher
            .fetch_bytes(&url, self.authorization, MAX_SUBTITLE_BYTES)?;
        self.refuse_secret(&String::from_utf8_lossy(&body))?;
        check_subtitle(&body)?;
        Ok(body)
    }
}

/// An external subtitle URL Rust may fetch: the URL policy, the server's
/// origin, and no credential parameter.
pub(super) fn subtitle_url(raw: &str, server: &Origin) -> Result<Url, HlsError> {
    parse_allowed_url(raw)
        .filter(|url| url.origin() == *server && !has_credential_query(url))
        .ok_or(HlsError::UnsafeSubtitleUrl)
}

/// `sub{n}.{ext}`, keeping a short alphanumeric extension from the server
/// path so mpv's format guess still works.
fn subtitle_name(index: usize, raw: &str) -> String {
    let extension = Url::parse(raw)
        .ok()
        .and_then(|url| {
            let last = url.path_segments()?.next_back()?.to_string();
            let (_, extension) = last.rsplit_once('.')?;
            let short = (1..=5).contains(&extension.len())
                && extension.chars().all(|c| c.is_ascii_alphanumeric());
            short.then(|| extension.to_ascii_lowercase())
        })
        .unwrap_or_else(|| "sub".into());
    format!("sub{index}.{extension}")
}

impl HlsSession {
    /// Validates the master URL against the server origin and `item_id`,
    /// fetches and checks the master, every child playlist, and every
    /// external subtitle with the header, and starts the loopback server.
    /// Any failure fails the whole session.
    pub(crate) fn open(request: &HlsRequest<'_>) -> Result<Self, HlsError> {
        let server_url = parse_allowed_url(request.server_url).ok_or(HlsError::UnsafeMasterUrl)?;
        let master_url = validate_master_url(
            request.master_url,
            &MasterRules {
                server: &server_url,
                item_id: request.item_id,
                media_source_id: request.media_source_id,
                play_session_id: request.play_session_id,
                media_kind: request.media_kind,
            },
        )?;
        let server = server_url.origin();
        let checker = Checker {
            fetcher: PlaylistFetcher::new(),
            authorization: request.authorization,
            server,
        };
        let master = checker.playlist(&master_url, Kind::Master)?;
        let children = master
            .children()
            .iter()
            .map(|child_url| checker.playlist(child_url, Kind::Media))
            .collect::<Result<Vec<_>, _>>()?;
        let subtitles = request
            .subtitle_urls
            .iter()
            .map(|raw| checker.subtitle(raw))
            .collect::<Result<Vec<_>, _>>()?;

        let loopback = BoundLoopback::bind()?;
        let mut bodies = HashMap::new();
        let playlist = |text: String| Served {
            content_type: PLAYLIST_TYPE,
            body: text.into_bytes(),
        };
        let names: Vec<String> = (0..children.len()).map(|n| format!("{n}.m3u8")).collect();
        let child_urls: Vec<String> = names.iter().map(|name| loopback.url(name)).collect();
        bodies.insert(
            loopback.path("master.m3u8"),
            playlist(master.render(&child_urls)?),
        );
        for (name, child) in names.iter().zip(&children) {
            bodies.insert(loopback.path(name), playlist(child.render(&[])?));
        }
        let mut subtitle_urls = Vec::with_capacity(subtitles.len());
        for (index, (raw, body)) in request.subtitle_urls.iter().zip(subtitles).enumerate() {
            let name = subtitle_name(index, raw);
            subtitle_urls.push(loopback.url(&name));
            let served = Served {
                content_type: SUBTITLE_TYPE,
                body,
            };
            bodies.insert(loopback.path(&name), served);
        }
        let playlist_url = loopback.url("master.m3u8");
        Ok(Self {
            playlist_url,
            subtitle_urls,
            audio_stream_index: audio_stream_index(&master_url),
            _server: loopback.serve(bodies)?,
        })
    }

    /// The loopback master playlist URL; load it only with
    /// `network::load_validated_hls`. It holds the random session path;
    /// treat it like the play-session id (never log it).
    pub(crate) fn playlist_url(&self) -> &str {
        &self.playlist_url
    }

    /// Loopback URLs of the checked external subtitles, in request order,
    /// for `sub-add` on the HLS handle instead of the server URLs.
    pub(crate) fn subtitle_urls(&self) -> &[String] {
        &self.subtitle_urls
    }

    /// The master URL's `AudioStreamIndex`, when it names exactly one.
    pub(crate) fn audio_stream_index(&self) -> Option<i64> {
        self.audio_stream_index
    }
}
