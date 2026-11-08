//! The HLS URL rules (decision 0002, ARCHITECTURE.md §3) for the master
//! playlist URL that Playback Negotiation rebuilt from a `TranscodingUrl`.
//! `src/lib/jellyfin/hls-url.ts` builds it; this re-checks the result, and
//! `master_url_tests.rs` feeds it the URLs the TypeScript rules produce.

use super::HlsError;
use crate::model::HlsMediaKind;
use crate::player::network::CREDENTIAL_QUERY_NAMES;
use crate::url_policy::parse_allowed_url;
use url::Url;

/// Names the TypeScript rebuild also strips (`credential-query.ts`).
const EXTRA_CREDENTIAL_NAMES: [&str; 2] = ["apitoken", "accesstoken"];
/// `SubtitleDeliveryMethod` names Fluster accepts; `Hls` and numeric enum
/// values are refused.
const SUBTITLE_METHODS: [&str; 4] = ["encode", "embed", "external", "drop"];

/// What the master URL must name: the plan's own server, item, source, and
/// play session.
pub(super) struct MasterRules<'a> {
    /// The signed-in server URL, with any base path.
    pub(super) server: &'a Url,
    pub(super) item_id: &'a str,
    pub(super) media_source_id: &'a str,
    pub(super) play_session_id: &'a str,
    pub(super) media_kind: HlsMediaKind,
}

fn normalized_id(id: &str) -> String {
    id.replace('-', "").to_ascii_lowercase()
}

fn is_credential_name(name: &str) -> bool {
    let name = name.trim().to_ascii_lowercase();
    CREDENTIAL_QUERY_NAMES.contains(&name.as_str())
        || EXTRA_CREDENTIAL_NAMES.contains(&name.as_str())
}

fn path_matches(url: &Url, rules: &MasterRules<'_>) -> bool {
    let base = rules.server.path().trim_end_matches('/');
    let Some(rest) = url
        .path()
        .strip_prefix(base)
        .and_then(|rest| rest.strip_prefix('/'))
    else {
        return false;
    };
    let kind = match rules.media_kind {
        HlsMediaKind::Videos => "videos",
        HlsMediaKind::Audio => "audio",
    };
    match rest.split('/').collect::<Vec<_>>().as_slice() {
        [path_kind, id, file] => {
            path_kind.eq_ignore_ascii_case(kind)
                && !id.is_empty()
                && id
                    .chars()
                    .all(|character| character.is_ascii_alphanumeric() || character == '-')
                && !rules.item_id.is_empty()
                && normalized_id(id) == normalized_id(rules.item_id)
                && file.eq_ignore_ascii_case("master.m3u8")
        }
        _ => false,
    }
}

/// Accepts only `{base}/videos/{itemId}/master.m3u8` (or `/audio/` for an
/// audio-only plan; fixed segments in any case) on the server's origin,
/// under the Rust URL policy (I5), with exactly one `MediaSourceId` naming
/// the plan's source, any `PlaySessionId` equal to the plan's,
/// `EnableTrickplay=false` exactly once, no credential parameter, no
/// `EnableSubtitlesInManifest`, a `SubtitleMethod` of `Encode`, `Embed`,
/// `External`, or `Drop` only (trimmed, any case), and no parameter name
/// with whitespace or a control character.
pub(super) fn validate_master_url(value: &str, rules: &MasterRules<'_>) -> Result<Url, HlsError> {
    let url = parse_allowed_url(value).ok_or(HlsError::UnsafeMasterUrl)?;
    if url.origin() != rules.server.origin() || !path_matches(&url, rules) {
        return Err(HlsError::UnsafeMasterUrl);
    }
    let mut trickplay_off = 0;
    let mut media_source_ids = 0;
    for (name, value) in url.query_pairs() {
        let unsafe_name = name
            .chars()
            .any(|character| character.is_whitespace() || character.is_control());
        if unsafe_name || is_credential_name(&name) {
            return Err(HlsError::UnsafeMasterUrl);
        }
        let accepted = match name.to_ascii_lowercase().as_str() {
            "enabletrickplay" => {
                trickplay_off += 1;
                value.eq_ignore_ascii_case("false")
            }
            "enablesubtitlesinmanifest" => false,
            "subtitlemethod" => {
                SUBTITLE_METHODS.contains(&value.trim().to_ascii_lowercase().as_str())
            }
            "mediasourceid" => {
                media_source_ids += 1;
                !rules.media_source_id.is_empty()
                    && normalized_id(&value) == normalized_id(rules.media_source_id)
            }
            "playsessionid" => value == rules.play_session_id,
            _ => true,
        };
        if !accepted {
            return Err(HlsError::UnsafeMasterUrl);
        }
    }
    if trickplay_off != 1 || media_source_ids != 1 {
        return Err(HlsError::UnsafeMasterUrl);
    }
    Ok(url)
}

/// The `AudioStreamIndex` the conversion carries, when the URL names exactly
/// one: the converted stream's only audio track is that source stream.
pub(super) fn audio_stream_index(url: &Url) -> Option<i64> {
    let mut values = url
        .query_pairs()
        .filter(|(name, _)| name.eq_ignore_ascii_case("AudioStreamIndex"))
        .map(|(_, value)| value.trim().parse::<i64>().ok());
    let first = values.next()??;
    values.next().is_none().then_some(first)
}
