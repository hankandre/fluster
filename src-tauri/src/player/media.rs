//! What one launch plays, chosen by the plan's typed `delivery`: the
//! original file on a static handle, or a Rust-validated HLS session on an
//! HLS handle (decision 0002). This is the only place a session's media is
//! loaded, so a `ValidatedHls` handle can only ever get
//! `network::load_validated_hls`, and a static handle never gets references.

use super::hls::{HlsError, HlsRequest, HlsSession};
use super::network::{
    allow_subtitle_formats, harden_network_options, load_static, load_validated_hls,
    set_media_authorization, validate_playback_urls, MediaDelivery,
};
use super::track_list::{load_external_subtitles, read_mpv_tracks, read_tracks};
use super::tracks::hls_player_tracks;
use super::MpvError;
use crate::model::{Delivery, LaunchRequest, MediaTrack, PlayerTrack};
use libmpv2::{Mpv, MpvInitializer};

pub(super) struct LaunchMedia {
    source: Source,
    /// The tracks `sub-add` loads and the mapper reads: the plan's tracks for
    /// the original file; for HLS, the subtitle files with loopback URLs.
    tracks: Vec<MediaTrack>,
}

enum Source {
    Static {
        url: String,
    },
    /// Holds the loopback server; it closes when the session's media drops.
    Hls {
        session: Box<HlsSession>,
        audio: Option<MediaTrack>,
    },
}

impl From<HlsError> for MpvError {
    /// A stream Fluster will not trust is a refusal (the frontend shows the
    /// `unsafe-transcoding-url` copy); a network or local failure is not.
    fn from(error: HlsError) -> Self {
        match error {
            HlsError::Fetch | HlsError::Status(_) | HlsError::Loopback => {
                MpvError::Conversion(error)
            }
            _ => MpvError::UnsafeConversion(error),
        }
    }
}

impl LaunchMedia {
    /// Checks every URL the launch names and, for HLS, fetches and checks
    /// every playlist and subtitle with the header before any mpv handle
    /// exists. Any failure refuses the launch.
    pub(super) fn prepare(request: &LaunchRequest) -> Result<Self, MpvError> {
        let plan = &request.plan;
        let (server_url, media_kind) = match &plan.delivery {
            Delivery::Static => {
                validate_playback_urls(request)?;
                return Ok(Self {
                    source: Source::Static {
                        url: plan.stream_url.clone(),
                    },
                    tracks: plan.tracks.clone(),
                });
            }
            Delivery::Hls {
                server_url,
                media_kind,
            } => (server_url, *media_kind),
        };
        // While converting, the server delivers text subtitles, embedded ones
        // included, as files with a DeliveryUrl (ARCHITECTURE.md §3).
        let subtitles: Vec<&MediaTrack> = plan
            .tracks
            .iter()
            .filter(|track| track.kind == "Subtitle" && track.delivery_url.is_some())
            .collect();
        let subtitle_urls: Vec<String> = subtitles
            .iter()
            .filter_map(|track| track.delivery_url.clone())
            .collect();
        let session = HlsSession::open(&HlsRequest {
            server_url,
            master_url: &plan.stream_url,
            item_id: &plan.item_id,
            media_source_id: &plan.media_source_id,
            play_session_id: &plan.play_session_id,
            media_kind,
            subtitle_urls: &subtitle_urls,
            authorization: &request.authorization,
        })?;
        let tracks = subtitles
            .into_iter()
            .zip(session.subtitle_urls())
            .map(|(track, loopback)| MediaTrack {
                external: true,
                delivery_url: Some(loopback.clone()),
                ..track.clone()
            })
            .collect();
        let audio = session.audio_stream_index().and_then(|index| {
            plan.tracks
                .iter()
                .find(|track| track.index == index && track.kind == "Audio")
                .cloned()
        });
        Ok(Self {
            source: Source::Hls {
                session: Box::new(session),
                audio,
            },
            tracks,
        })
    }

    pub(super) fn delivery(&self) -> MediaDelivery {
        match self.source {
            Source::Static { .. } => MediaDelivery::Static,
            Source::Hls { .. } => MediaDelivery::ValidatedHls,
        }
    }

    /// The network options and the header for this media's handle.
    pub(super) fn configure(
        &self,
        init: &MpvInitializer,
        request: &LaunchRequest,
    ) -> libmpv2::Result<()> {
        harden_network_options(init, self.delivery())?;
        set_media_authorization(init, &request.authorization)
    }

    pub(super) fn load(&self, mpv: &Mpv) -> libmpv2::Result<()> {
        match &self.source {
            Source::Static { url } => load_static(mpv, url),
            Source::Hls { session, .. } => load_validated_hls(mpv, session),
        }
    }

    /// After `FileLoaded`: adds the subtitle files and returns the Jellyfin
    /// indices mpv loaded, in add order. An HLS session first clears the
    /// per-file `hls` format, or `sub-add` could not open a subtitle.
    pub(super) fn load_subtitles(&self, mpv: &Mpv) -> Vec<i64> {
        if matches!(self.source, Source::Hls { .. }) && allow_subtitle_formats(mpv).is_err() {
            return Vec::new();
        }
        load_external_subtitles(mpv, &self.tracks)
    }

    /// Fixed text for an `EndFile` error; it never names the URL.
    pub(super) fn playback_failure(&self) -> &'static str {
        match self.source {
            Source::Static { .. } => "libmpv could not play the original file.",
            Source::Hls { .. } => "libmpv could not play the converted stream.",
        }
    }

    pub(super) fn read_tracks(&self, mpv: &Mpv, added_externals: &[i64]) -> Vec<PlayerTrack> {
        match &self.source {
            Source::Static { .. } => read_tracks(mpv, &self.tracks, added_externals),
            Source::Hls { audio, .. } => hls_player_tracks(
                &self.tracks,
                added_externals,
                &read_mpv_tracks(mpv),
                audio.as_ref(),
            ),
        }
    }
}

#[cfg(test)]
#[path = "media_tests.rs"]
mod tests;
