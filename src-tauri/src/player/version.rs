//! libmpv runtime checks: the numeric locale, the minimum mpv version, and
//! which HTTP stacks the loaded build has.

use super::network::HttpStacks;
use super::{string_property, MpvError};
use crate::redaction::safe_error;
use libmpv2::{mpv_error, Mpv, MpvStr};

/// What the loaded libmpv is, read from a throwaway handle.
#[derive(Clone, Debug, PartialEq, Eq)]
pub(super) struct LibmpvRuntime {
    pub(super) version: String,
    pub(super) http: HttpStacks,
}

pub(super) fn query_libmpv_runtime() -> Result<LibmpvRuntime, MpvError> {
    ensure_numeric_locale()?;
    let mpv = Mpv::with_initializer(probe_options)
        .map_err(|error| MpvError::Initialize(safe_error(error)))?;
    probe_runtime(&mpv)
}

/// The options of the probe handle: no config, no output, no network.
pub(super) fn probe_options(init: libmpv2::MpvInitializer) -> libmpv2::Result<()> {
    init.set_option("config", false)?;
    init.set_option("vo", "null")?;
    init.set_option("ao", "null")?;
    Ok(())
}

pub(super) fn probe_runtime(mpv: &Mpv) -> Result<LibmpvRuntime, MpvError> {
    let version = string_property(mpv, "mpv-version")
        .ok_or_else(|| MpvError::Initialize("the runtime did not expose mpv-version".into()))?;
    if !is_supported_mpv_version(&version) {
        return Err(MpvError::UnsupportedVersion(version));
    }
    let curl_options = has_curl_options(mpv);
    let http = http_stacks(&version, curl_options);
    Ok(LibmpvRuntime { version, http })
}

// mpv registers the `curl-*` options only when built with libcurl
// (`options/options.c` v0.42.0 lines 940-941, `#if HAVE_LIBCURL`). Only a
// definite "no such option" counts as absent; any other answer counts as
// present, so the handle must then refuse the curl backend or fail.
fn has_curl_options(mpv: &Mpv) -> bool {
    match mpv.get_property::<MpvStr<'_>>("option-info/curl-enabled/name") {
        Err(libmpv2::Error::Raw(code)) => code != mpv_error::PropertyNotFound,
        _ => true,
    }
}

/// The curl backend follows redirects by default (`stream/stream_curl.c`
/// v0.42.0 lines 127, 972-973). mpv 0.42.0 and newer may have it, and git
/// builds after 2026-05-16 have it while still reporting `0.41.0`
/// (`MPV_VERSION` at c6833a93 is `0.41.0-UNKNOWN`), so either signal turns
/// the curl guard on. An unparsable version also turns it on.
pub(super) fn http_stacks(version: &str, curl_options: bool) -> HttpStacks {
    let below_curl_release =
        parse_mpv_version(version).is_some_and(|(major, minor, _)| (major, minor) < (0, 42));
    if curl_options || !below_curl_release {
        HttpStacks::LavfAndCurl
    } else {
        HttpStacks::LavfOnly
    }
}

pub(super) fn ensure_numeric_locale() -> Result<(), MpvError> {
    // SAFETY: `c"C"` is a valid NUL-terminated string that outlives the call;
    // setlocale copies it. The returned pointer is only checked for null.
    // Known gap: setlocale is not thread-safe, and this runs after GTK, WebKit,
    // and runtime threads exist. `run()` already set LC_NUMERIC to "C" before
    // any thread started, so this call normally changes nothing; it guards
    // against a library resetting the locale. A concurrent locale-dependent
    // libc call during the write is a theoretical data race we accept.
    let locale = unsafe { libc::setlocale(libc::LC_NUMERIC, c"C".as_ptr()) };
    if locale.is_null() {
        return Err(MpvError::Locale);
    }
    Ok(())
}

fn is_supported_mpv_version(version: &str) -> bool {
    parse_mpv_version(version).is_some_and(|(major, minor, _)| major > 0 || minor >= 41)
}

fn parse_mpv_version(version: &str) -> Option<(u64, u64, u64)> {
    let start = version.find(|character: char| character.is_ascii_digit())?;
    let numeric = version[start..]
        .split(|character: char| !character.is_ascii_digit() && character != '.')
        .next()?;
    let mut parts = numeric.split('.');
    let major = parts.next()?.parse().ok()?;
    let minor = parts.next()?.parse().ok()?;
    let patch = parts.next().unwrap_or("0").parse().ok()?;
    Some((major, minor, patch))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_and_gates_runtime_mpv_versions() {
        assert_eq!(parse_mpv_version("0.41.0"), Some((0, 41, 0)));
        assert_eq!(parse_mpv_version("mpv 0.42.1-12-gabcdef"), Some((0, 42, 1)));
        assert!(is_supported_mpv_version("0.41.0"));
        assert!(is_supported_mpv_version("mpv 1.0.0"));
        assert!(!is_supported_mpv_version("0.40.0"));
        assert!(!is_supported_mpv_version("unknown"));
    }

    #[test]
    fn the_curl_guard_follows_the_version_and_the_options() {
        for (version, curl_options, expected) in [
            ("0.41.0", false, HttpStacks::LavfOnly),
            ("mpv 0.41.2", false, HttpStacks::LavfOnly),
            // A git build after the curl backend landed still says 0.41.0.
            ("mpv v0.41.0-412-gabcdef", true, HttpStacks::LavfAndCurl),
            ("0.41.0", true, HttpStacks::LavfAndCurl),
            // From 0.42 the guard is required even if the probe saw no option,
            // so a renamed or missing option fails the launch instead.
            ("0.42.0", false, HttpStacks::LavfAndCurl),
            ("0.42.0", true, HttpStacks::LavfAndCurl),
            ("mpv 0.43.1-dirty", false, HttpStacks::LavfAndCurl),
            ("1.0.0", false, HttpStacks::LavfAndCurl),
            ("0.100.0", false, HttpStacks::LavfAndCurl),
            ("unknown", false, HttpStacks::LavfAndCurl),
        ] {
            assert_eq!(
                http_stacks(version, curl_options),
                expected,
                "{version} {curl_options}"
            );
        }
    }
}
