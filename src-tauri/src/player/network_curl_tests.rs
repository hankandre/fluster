//! The curl guard: every handle on a libmpv with the curl backend turns it
//! off, and a handle that cannot is refused instead of played.

use super::*;
use crate::player::test_support::{probed_http_stacks, test_authorization};
use crate::player::version::ensure_numeric_locale;
use libmpv2::{Mpv, MpvStr};

fn handle(delivery: MediaDelivery, http: HttpStacks) -> Result<Mpv, HardeningError> {
    ensure_numeric_locale().expect("numeric locale");
    let mut failure = None;
    let created = Mpv::with_initializer(|init| {
        init.set_option("config", false)?;
        init.set_option("vo", "null")?;
        init.set_option("ao", "null")?;
        harden_network_options(&init, delivery, http)
            .and_then(|()| Ok(set_media_authorization(&init, &test_authorization())?))
            .map_err(|error| {
                let raw = match &error {
                    HardeningError::CurlGuard(raw) | HardeningError::Option(raw) => raw.clone(),
                };
                failure = Some(error);
                raw
            })
    });
    match (created, failure) {
        (Ok(mpv), _) => Ok(mpv),
        (Err(_), Some(error)) => Err(error),
        (Err(error), None) => Err(HardeningError::Option(error)),
    }
}

fn has_option(mpv: &Mpv, option: &str) -> bool {
    mpv.get_property::<MpvStr<'_>>(&format!("option-info/{option}/name"))
        .is_ok()
}

/// Tripwire: on a libmpv that has the curl backend (mpv 0.42+, or a git
/// build that reports 0.41), every production handle carries both curl
/// options; on one without it, the probe agrees that no option exists.
#[test]
fn every_handle_refuses_the_curl_backend_when_libmpv_has_one() {
    let Some(http) = probed_http_stacks() else {
        return;
    };
    eprintln!("curl guard branch on this libmpv: {http:?}");
    for delivery in [MediaDelivery::Static, MediaDelivery::ValidatedHls] {
        let mpv = handle(delivery, http).expect("the production options apply");
        match http {
            HttpStacks::LavfAndCurl => {
                let enabled: bool = mpv.get_property(CURL_ENABLED).expect(CURL_ENABLED);
                assert!(!enabled, "{delivery:?}: the curl backend is on");
                let redirects: i64 = mpv
                    .get_property(CURL_MAX_REDIRECTS)
                    .expect(CURL_MAX_REDIRECTS);
                assert_eq!(redirects, 0, "{delivery:?}");
            }
            HttpStacks::LavfOnly => {
                // The probe reads an option that exists the same way.
                assert!(has_option(&mpv, "ytdl"), "option-info cannot see options");
                assert!(
                    !has_option(&mpv, CURL_ENABLED),
                    "{delivery:?}: the probe missed a curl backend"
                );
            }
        }
        let lavf_options: String = mpv.get_property("stream-lavf-o").expect("stream-lavf-o");
        assert_eq!(lavf_options, STREAM_LAVF_OPTIONS);
    }
}

/// Fail closed: where the curl options do not exist, a handle that needs
/// the guard is refused with `CurlGuard`, and the launch maps that to its
/// own typed refusal. Runs only on a libmpv without the curl backend.
#[test]
fn a_handle_that_cannot_refuse_the_curl_backend_is_never_built() {
    let Some(http) = probed_http_stacks() else {
        return;
    };
    if http == HttpStacks::LavfAndCurl {
        eprintln!("SKIP a_handle_that_cannot_refuse_the_curl_backend_is_never_built: this libmpv has the curl options");
        return;
    }
    for delivery in [MediaDelivery::Static, MediaDelivery::ValidatedHls] {
        let Err(error) = handle(delivery, HttpStacks::LavfAndCurl) else {
            panic!("{delivery:?}: a handle without the curl options was built");
        };
        let HardeningError::CurlGuard(raw) = error else {
            panic!("{delivery:?}: expected a curl guard failure, got {error:?}");
        };
        assert!(matches!(
            initialize_error(raw, true),
            MpvError::RedirectGuard
        ));
    }
}

#[test]
fn only_a_curl_guard_failure_becomes_the_redirect_refusal() {
    let raw = || libmpv2::Error::Raw(libmpv2::mpv_error::OptionNotFound);
    assert!(matches!(
        initialize_error(raw(), true),
        MpvError::RedirectGuard
    ));
    assert!(matches!(
        initialize_error(raw(), false),
        MpvError::Initialize(_)
    ));
    let copy = MpvError::RedirectGuard.to_string();
    assert!(copy.ends_with("Update Fluster."), "{copy}");
    assert!(!copy.contains("libmpv"), "{copy}");
}
