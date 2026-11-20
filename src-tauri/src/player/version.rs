//! libmpv runtime checks: the numeric locale, the minimum mpv version, and
//! which HTTP stacks the loaded build has.

use super::network::{refuse_curl_backend, HttpStacks};
use super::{string_property, MpvError};
use crate::redaction::safe_error;
use libmpv2::{mpv_error, Mpv, MpvStr};

/// What the loaded libmpv is, read from throwaway handles.
#[derive(Clone, Debug, PartialEq, Eq)]
pub(super) struct LibmpvRuntime {
    pub(super) version: String,
    pub(super) http: HttpStacks,
    /// Whether a handle accepts the curl guard; checked only on `LavfAndCurl`.
    pub(super) curl_guard_applies: bool,
}

impl LibmpvRuntime {
    /// The HTTP stacks a launch hardens, or the refusal when this libmpv has
    /// a curl backend its handles cannot refuse. Checked before any server
    /// request, so a refused launch starts no transcode and fetches nothing.
    pub(super) fn launch_http(&self) -> Result<HttpStacks, MpvError> {
        match (self.http, self.curl_guard_applies) {
            (HttpStacks::LavfAndCurl, false) => Err(MpvError::RedirectGuard),
            (http, _) => Ok(http),
        }
    }
}

pub(super) fn query_libmpv_runtime() -> Result<LibmpvRuntime, MpvError> {
    ensure_numeric_locale()?;
    let mpv = Mpv::with_initializer(probe_options)
        .map_err(|error| MpvError::Initialize(safe_error(error)))?;
    let (version, http) = probe_runtime(&mpv)?;
    let curl_guard_applies = http == HttpStacks::LavfOnly || curl_guard_applies();
    Ok(LibmpvRuntime {
        version,
        http,
        curl_guard_applies,
    })
}

// Builds a throwaway handle with the guard exactly as a playback handle sets
// it, so a launch can be refused before it contacts the server.
fn curl_guard_applies() -> bool {
    Mpv::with_initializer(|init| {
        refuse_curl_backend(&init, HttpStacks::LavfAndCurl)?;
        probe_options(init)
    })
    .is_ok()
}

/// The options of the probe handle: no config, no output, no network.
pub(super) fn probe_options(init: libmpv2::MpvInitializer) -> libmpv2::Result<()> {
    init.set_option("config", false)?;
    init.set_option("vo", "null")?;
    init.set_option("ao", "null")?;
    Ok(())
}

/// The supported version and HTTP stacks of the libmpv behind `mpv`.
pub(super) fn probe_runtime(mpv: &Mpv) -> Result<(String, HttpStacks), MpvError> {
    let version = string_property(mpv, "mpv-version")
        .ok_or_else(|| MpvError::Initialize("the runtime did not expose mpv-version".into()))?;
    if !is_supported_mpv_version(&version) {
        return Err(MpvError::UnsupportedVersion(version));
    }
    let answer = mpv
        .get_property::<MpvStr<'_>>("option-info/curl-enabled/name")
        .err();
    Ok((version, http_stacks(curl_options(answer.as_ref()))))
}

/// What the probe learned about the `curl-enabled` option.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(super) enum CurlOptions {
    Present,
    /// libmpv answered "no such property": this build has no libcurl.
    Absent,
    /// Any other failure; treated as present.
    Unknown,
}

/// Classifies the error, if any, from reading `option-info/curl-enabled/name`.
pub(super) fn curl_options(error: Option<&libmpv2::Error>) -> CurlOptions {
    match error {
        None => CurlOptions::Present,
        Some(libmpv2::Error::Raw(code)) if *code == mpv_error::PropertyNotFound => {
            CurlOptions::Absent
        }
        Some(_) => CurlOptions::Unknown,
    }
}

/// The curl backend follows redirects by default (`stream/stream_curl.c`
/// v0.42.0 lines 127, 972-973). It and the `curl-*` options are built only
/// with libcurl, behind the same `HAVE_LIBCURL` gate (`options/options.c`
/// v0.42.0 lines 940-941, `stream/stream.c` lines 103-105), so a definite
/// "no such option" means no curl backend, whatever the version. This also
/// covers git builds that have the backend while still reporting `0.41.0`
/// (`MPV_VERSION` at c6833a93 is `0.41.0-UNKNOWN`). An option that exists,
/// or an answer that is not a clear "not found", turns the guard on.
pub(super) fn http_stacks(curl_options: CurlOptions) -> HttpStacks {
    match curl_options {
        CurlOptions::Absent => HttpStacks::LavfOnly,
        CurlOptions::Present | CurlOptions::Unknown => HttpStacks::LavfAndCurl,
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
    fn the_curl_guard_follows_the_probed_option() {
        use libmpv2::Error;
        let not_found = Error::Raw(mpv_error::PropertyNotFound);
        let unavailable = Error::Raw(mpv_error::PropertyUnavailable);
        let option_error = Error::Raw(mpv_error::OptionNotFound);
        for (error, options, expected) in [
            (None, CurlOptions::Present, HttpStacks::LavfAndCurl),
            (Some(&not_found), CurlOptions::Absent, HttpStacks::LavfOnly),
            (
                Some(&unavailable),
                CurlOptions::Unknown,
                HttpStacks::LavfAndCurl,
            ),
            (
                Some(&option_error),
                CurlOptions::Unknown,
                HttpStacks::LavfAndCurl,
            ),
            (
                Some(&Error::InvalidUtf8),
                CurlOptions::Unknown,
                HttpStacks::LavfAndCurl,
            ),
            (
                Some(&Error::Null),
                CurlOptions::Unknown,
                HttpStacks::LavfAndCurl,
            ),
        ] {
            assert_eq!(curl_options(error), options, "{error:?}");
            assert_eq!(http_stacks(options), expected, "{error:?}");
        }
    }

    #[test]
    fn a_launch_is_refused_up_front_when_the_curl_guard_cannot_apply() {
        let runtime = |http, curl_guard_applies| LibmpvRuntime {
            version: "0.42.0".into(),
            http,
            curl_guard_applies,
        };
        assert_eq!(
            runtime(HttpStacks::LavfOnly, false).launch_http().ok(),
            Some(HttpStacks::LavfOnly)
        );
        assert_eq!(
            runtime(HttpStacks::LavfAndCurl, true).launch_http().ok(),
            Some(HttpStacks::LavfAndCurl)
        );
        assert!(matches!(
            runtime(HttpStacks::LavfAndCurl, false).launch_http(),
            Err(MpvError::RedirectGuard)
        ));
    }
}
