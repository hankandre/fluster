use super::code_view::code_view;
use super::traces::session_traces;
use super::*;

fn source(path: &str, text: &str) -> (PathBuf, String) {
    (PathBuf::from(path), text.to_string())
}

/// The guardian's bypass shapes A–F from the P2-04 re-review.
const BYPASSES: &str = r#"use super::native_trace;

pub(super) fn a_match_arm(id: &str, ok: bool) {
    match ok {
        true => {}
        false => native_trace(&format!("A session {id}")),
    }
}

pub(super) fn b_debug_format(id: &str) {
    native_trace(&format!("B play {id:?}"));
}

pub(super) fn c_multiline(play_session_id: &str) {
    native_trace(&format!(
        "C play session {play_session_id} with a long message that rustfmt wraps"
    ));
}

macro_rules! trace {
    ($($arg:tt)*) => {
        native_trace(&format!($($arg)*))
    };
}

pub(super) fn f_macro(id: &str) {
    trace!("F session {id}");
}

#[cfg(test)]
mod tests {
    #[test]
    fn opens_a_brace() {
        let _open = '{';
    }
}

pub(super) fn d_swallowed(id: &str) {
    native_trace(&format!("D session {id}"));
}

pub(super) fn d_rebalance() -> char {
    '}'
}

#[cfg(test)]
const E_MARK: u8 = 1; // test mod {

pub(super) fn e_swallowed(id: &str) {
    native_trace(&format!("E session {id}"));
}
// }
"#;

fn flags(text: &str, marker: &str) -> bool {
    session_traces(text).iter().any(|hit| hit.contains(marker))
}

#[test]
fn trace_scan_catches_every_guardian_bypass_shape() {
    let hits = session_traces(BYPASSES);
    for marker in [
        "\"A session {id}\"",
        "\"B play {id:?}\"",
        "\"C play session {play_session_id}",
        "\"D session {id}\"",
        "\"E session {id}\"",
        "forwards a macro argument",
    ] {
        assert!(
            hits.iter().any(|hit| hit.contains(marker)),
            "missed {marker}: {hits:#?}"
        );
    }
}

#[test]
fn trace_scan_reads_a_call_rustfmt_wrapped_across_lines() {
    assert!(flags(
        "fn f(sid: &str) {\n    eprintln!(\n        \"[fluster] stopping {}\",\n        sid\n    );\n}\n",
        "stopping"
    ));
}

#[test]
fn trace_scan_finds_calls_in_the_middle_of_a_line() {
    assert!(flags(
        "fn f(r: Result<(), String>, item_id: &str) {\n    if let Err(e) = r { eprintln!(\"{e} for {}\", item_id) }\n}\n",
        "item_id"
    ));
}

#[test]
fn trace_scan_flags_ids_in_any_placeholder_or_argument() {
    for call in [
        "eprintln!(\"{id:?}\")",
        "eprintln!(\"{0}\", play.id)",
        "eprintln!(\"{}\", sid)",
        "eprintln!(\"{sid}\")",
        "native_trace(&format!(\"{}\", request.plan.PlaySessionId))",
        "realtime_trace(item_ids)",
    ] {
        let text = format!("fn f() {{\n    {call};\n}}\n");
        assert_eq!(session_traces(&text).len(), 1, "{call}");
    }
    assert!(session_traces("fn f(valid: bool) {\n    eprintln!(\"ok {}\", 1);\n}\n").is_empty());
}

#[test]
fn trace_scan_flags_helpers_that_forward_their_argument() {
    let hits = session_traces("fn log_it(message: &str) {\n    eprintln!(\"{message}\");\n}\n");
    assert_eq!(hits.len(), 1, "{hits:?}");
    assert!(hits[0].starts_with("forwards a parameter of fn log_it"));
    // The two trace helpers forward by design; their callers are scanned.
    assert!(session_traces(
        "fn native_trace(message: &str) {\n    eprintln!(\"[fluster native] {message}\");\n}\n"
    )
    .is_empty());
}

#[test]
fn trace_scan_ignores_comments_and_literals_when_matching_braces() {
    let text = "\
#[cfg(test)]
#[allow(dead_code)]
mod tests {
    const OPEN: char = '{';
    const RAW: &str = r#\"}}}\"#;
    // }
    /* { */
    fn helper(id: &str) { eprintln!(\"session {id}\"); }
}

fn after(id: &str) {
    native_trace(\"stopping session\");
}
";
    let hits = session_traces(text);
    assert_eq!(hits.len(), 1, "{hits:?}");
    assert!(hits[0].contains("stopping session"));
    assert_eq!(code_view(text).len(), text.len());
}

#[test]
fn trace_scan_flags_a_session_trace_in_an_unlisted_module() {
    let result = scan(&[
        source(
            "lib.rs",
            "mod leaky;\n#[cfg(test)]\nmod fixtures;\npub fn run() {}\n",
        ),
        source(
            "leaky.rs",
            "fn leak(id: &str) {\n    eprintln!(\"[fluster native] {id}\");\n}\n",
        ),
        source(
            "leaky/inner.rs",
            "fn f() { native_trace(\"session started\"); }\n",
        ),
        source(
            "fixtures.rs",
            "fn f(id: &str) { eprintln!(\"session {id}\"); }\n",
        ),
        source(
            "fixtures/nested.rs",
            "fn f(id: &str) { eprintln!(\"session {id}\"); }\n",
        ),
    ]);
    assert_eq!(result.hits.len(), 2, "{:#?}", result.hits);
    assert!(result.hits[0].starts_with("leaky.rs: formats an id"));
    assert!(result.hits[1].starts_with("leaky/inner.rs: names a session"));
}

#[test]
#[should_panic(expected = "never closes")]
fn trace_scan_refuses_an_unterminated_test_module() {
    session_traces("#[cfg(test)]\nmod tests {\n    fn open() {\n}\n");
}
