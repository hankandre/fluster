//! The HLS URL rules (decision 0002) for the master playlist URL that
//! Playback Negotiation rebuilt from a `TranscodingUrl`.

use super::HlsError;
use crate::player::network::has_credential_query;
use crate::url_policy::parse_allowed_url;
use url::Url;

fn normalized_id(id: &str) -> String {
    id.replace('-', "").to_ascii_lowercase()
}

/// Accepts only `/videos/{itemId}/master.m3u8` or `/audio/{itemId}/master.m3u8`
/// (any case) for `item_id`, under the Rust URL policy (I5), with no
/// credential parameter, `EnableTrickplay=false` exactly once, no
/// `EnableSubtitlesInManifest`, and no `SubtitleMethod=Hls`.
pub(super) fn validate_master_url(value: &str, item_id: &str) -> Result<Url, HlsError> {
    let url = parse_allowed_url(value).ok_or(HlsError::UnsafeMasterUrl)?;
    if has_credential_query(&url) {
        return Err(HlsError::UnsafeMasterUrl);
    }
    let segments: Vec<&str> = url
        .path_segments()
        .map(|segments| segments.collect())
        .unwrap_or_default();
    let shape_matches = match segments.as_slice() {
        [kind, id, file] => {
            (kind.eq_ignore_ascii_case("videos") || kind.eq_ignore_ascii_case("audio"))
                && !item_id.is_empty()
                && normalized_id(id) == normalized_id(item_id)
                && id
                    .chars()
                    .all(|character| character.is_ascii_hexdigit() || character == '-')
                && file.eq_ignore_ascii_case("master.m3u8")
        }
        _ => false,
    };
    if !shape_matches {
        return Err(HlsError::UnsafeMasterUrl);
    }
    let mut trickplay_off = 0;
    for (name, value) in url.query_pairs() {
        if name.eq_ignore_ascii_case("EnableTrickplay") {
            if !value.eq_ignore_ascii_case("false") {
                return Err(HlsError::UnsafeMasterUrl);
            }
            trickplay_off += 1;
        }
        let subtitles_in_manifest = name.eq_ignore_ascii_case("EnableSubtitlesInManifest");
        let hls_subtitles =
            name.eq_ignore_ascii_case("SubtitleMethod") && value.eq_ignore_ascii_case("Hls");
        if subtitles_in_manifest || hls_subtitles {
            return Err(HlsError::UnsafeMasterUrl);
        }
    }
    if trickplay_off != 1 {
        return Err(HlsError::UnsafeMasterUrl);
    }
    Ok(url)
}
