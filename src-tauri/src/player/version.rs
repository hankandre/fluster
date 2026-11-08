//! libmpv runtime checks: the numeric locale and the minimum mpv version.

use super::{string_property, MpvError};
use crate::redaction::safe_error;
use libmpv2::Mpv;

pub(super) fn query_libmpv_version() -> Result<String, MpvError> {
    ensure_numeric_locale()?;
    let mpv = Mpv::with_initializer(|init| {
        init.set_option("config", false)?;
        init.set_option("vo", "null")?;
        init.set_option("ao", "null")?;
        Ok(())
    })
    .map_err(|error| MpvError::Initialize(safe_error(error)))?;
    let version = string_property(&mpv, "mpv-version")
        .ok_or_else(|| MpvError::Initialize("the runtime did not expose mpv-version".into()))?;
    if !is_supported_mpv_version(&version) {
        return Err(MpvError::UnsupportedVersion(version));
    }
    Ok(version)
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
}
