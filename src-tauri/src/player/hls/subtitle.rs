//! External subtitles on converted sessions: Rust fetches each one with the
//! header and serves the checked copy from loopback, because the HLS handle
//! has `access-references` on and mpv would otherwise open URLs named inside
//! a playlist or EDL body served as a subtitle (decision log, plan 002).

use super::HlsError;

/// Accepts only bodies that start like a subtitle format Fluster's profile
/// lists (WebVTT, ASS/SSA, SubRip, MicroDVD, SubViewer, PGS `.sup`), and
/// refuses any body that names a playlist, EDL, or reference format anywhere.
pub(super) fn check_subtitle(body: &[u8]) -> Result<(), HlsError> {
    // PGS (`.sup`) is binary and starts with the `PG` segment magic.
    let binary_pgs = body.starts_with(b"PG");
    let body = body.strip_prefix(b"\xEF\xBB\xBF").unwrap_or(body);
    let text = String::from_utf8_lossy(body).to_ascii_lowercase();
    const REFERENCE_MARKERS: [&str; 10] = [
        "#extm3u",
        "#ext-x-",
        "#extinf",
        "# mpv edl",
        "edl://",
        "[playlist]",
        "ffconcat",
        "<asx",
        "<smil",
        "[reference]",
    ];
    if REFERENCE_MARKERS.iter().any(|marker| text.contains(marker)) {
        return Err(HlsError::UnsafeSubtitle);
    }
    if binary_pgs {
        return Ok(());
    }
    let head = text.trim_start();
    let first_line = head.lines().next().unwrap_or("").trim();
    let srt = !first_line.is_empty() && first_line.chars().all(|c| c.is_ascii_digit());
    let known = srt
        || head.starts_with("webvtt")
        || head.starts_with("[script info]")
        || head.starts_with("[information]")
        || head.starts_with('{');
    if known {
        Ok(())
    } else {
        Err(HlsError::UnsafeSubtitle)
    }
}
