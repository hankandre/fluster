//! One HLS playback session: fetch and validate every playlist, then serve
//! the validated copies from loopback for as long as the session lives.

use super::fetch::PlaylistFetcher;
use super::loopback::{BoundLoopback, LoopbackServer};
use super::master_url::validate_master_url;
use super::playlist::{Kind, Playlist};
use super::HlsError;
use crate::auth_header::MediaBrowserAuthorization;
use std::collections::HashMap;
use url::Url;

pub(crate) struct HlsSession {
    playlist_url: String,
    _server: LoopbackServer,
}

impl HlsSession {
    /// Validates the master URL for `item_id`, fetches and validates the
    /// master and every child playlist with the header, and starts the
    /// loopback server. Any failure fails the whole session.
    pub(crate) fn open(
        master_url: &str,
        item_id: &str,
        authorization: &MediaBrowserAuthorization,
    ) -> Result<Self, HlsError> {
        let master_url = validate_master_url(master_url, item_id)?;
        Self::open_validated(&PlaylistFetcher::new(), &master_url, authorization)
    }

    fn open_validated(
        fetcher: &PlaylistFetcher,
        master_url: &Url,
        authorization: &MediaBrowserAuthorization,
    ) -> Result<Self, HlsError> {
        let server = master_url.origin();
        let master_body = fetcher.fetch(master_url, authorization)?;
        let master = Playlist::parse(&master_body, master_url, &server)?;
        if master.kind() != Kind::Master {
            return Err(HlsError::Malformed);
        }
        let mut children = Vec::with_capacity(master.children().len());
        for child_url in master.children() {
            let body = fetcher.fetch(child_url, authorization)?;
            let child = Playlist::parse(&body, child_url, &server)?;
            if child.kind() != Kind::Media {
                return Err(HlsError::Malformed);
            }
            children.push(child);
        }

        let loopback = BoundLoopback::bind()?;
        let names: Vec<String> = (0..children.len()).map(|n| format!("{n}.m3u8")).collect();
        let child_urls: Vec<String> = names.iter().map(|name| loopback.url(name)).collect();
        let mut bodies = HashMap::new();
        bodies.insert(loopback.path("master.m3u8"), master.render(&child_urls)?);
        for (name, child) in names.iter().zip(&children) {
            bodies.insert(loopback.path(name), child.render(&[])?);
        }
        let playlist_url = loopback.url("master.m3u8");
        Ok(Self {
            playlist_url,
            _server: loopback.serve(bodies)?,
        })
    }

    /// The loopback master playlist URL to give `loadfile`. It holds the
    /// random session path; treat it like the play-session id (never log it).
    pub(crate) fn playlist_url(&self) -> &str {
        &self.playlist_url
    }
}
