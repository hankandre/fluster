//! Fails when native trace output could name a play session.
//!
//! Scans every production Rust file under `src/` at runtime, so a new module
//! is covered without being listed. A file is test-only, and skipped, when its
//! module is declared under `#[cfg(test)]` (or sits below such a module).
//! Inside a production file, only `#[cfg(test)] mod … { … }` blocks are
//! skipped; every other line is scanned.

use crate::command_allowlist::collect_rust_files;
use std::collections::BTreeSet;
use std::fs;
use std::path::{Path, PathBuf};

/// Calls whose text reaches stderr in debug builds.
const TRACE_CALLS: [&str; 3] = ["eprintln!", "native_trace(", "realtime_trace("];

struct Scan {
    scanned: BTreeSet<PathBuf>,
    hits: Vec<String>,
}

/// Scans `sources` (path, text) and reports every trace line in production
/// code that names a session or interpolates an `id`.
fn scan(sources: &[(PathBuf, String)]) -> Scan {
    let test_only = test_only_modules(sources);
    let mut scanned = BTreeSet::new();
    let mut hits = Vec::new();
    for (path, source) in sources {
        if test_only
            .iter()
            .any(|module| path == &module.with_extension("rs") || path.starts_with(module))
        {
            continue;
        }
        scanned.insert(path.clone());
        for line in session_traces(source) {
            hits.push(format!("{}: {line}", path.display()));
        }
    }
    Scan { scanned, hits }
}

/// Module paths (without extension) declared as `#[cfg(test)] mod name;`.
/// `a/b` covers both `a/b.rs` and everything under `a/b/`.
fn test_only_modules(sources: &[(PathBuf, String)]) -> Vec<PathBuf> {
    let mut modules = Vec::new();
    for (path, source) in sources {
        let dir = module_dir(path);
        let mut under_cfg_test = false;
        for line in source.lines().map(str::trim) {
            if line == "#[cfg(test)]" {
                under_cfg_test = true;
                continue;
            }
            if under_cfg_test {
                if let Some(name) = outline_mod_name(line) {
                    modules.push(dir.join(name));
                }
            }
            if !line.starts_with("#[") {
                under_cfg_test = false;
            }
        }
    }
    modules
}

/// The directory that holds a file's child modules.
fn module_dir(path: &Path) -> PathBuf {
    let parent = path.parent().unwrap_or(Path::new("")).to_path_buf();
    match path.file_stem().and_then(|stem| stem.to_str()) {
        Some("mod" | "lib" | "main") | None => parent,
        Some(stem) => parent.join(stem),
    }
}

/// `name` for `mod name;` or `pub(…) mod name;`.
fn outline_mod_name(line: &str) -> Option<&str> {
    let declaration = line.strip_suffix(';')?;
    declaration
        .split_whitespace()
        .skip_while(|word| *word != "mod")
        .nth(1)
}

/// True for `mod name {` or `pub(…) mod name {`.
fn opens_inline_mod(line: &str) -> bool {
    line.ends_with('{') && line.split_whitespace().any(|word| word == "mod")
}

/// Trace lines outside `#[cfg(test)] mod … { … }` blocks that name a session.
fn session_traces(source: &str) -> Vec<String> {
    let mut hits = Vec::new();
    let mut lines = source.lines().map(str::trim);
    let mut under_cfg_test = false;
    while let Some(line) = lines.next() {
        if line == "#[cfg(test)]" {
            under_cfg_test = true;
            continue;
        }
        if under_cfg_test && opens_inline_mod(line) {
            skip_block(line, &mut lines);
            under_cfg_test = false;
            continue;
        }
        if !line.starts_with("#[") {
            under_cfg_test = false;
        }
        if TRACE_CALLS.iter().any(|call| line.starts_with(call))
            && (line.to_ascii_lowercase().contains("session") || line.contains("{id}"))
        {
            hits.push(line.to_string());
        }
    }
    hits
}

/// Consumes lines until the braces opened on `first` close.
fn skip_block<'a>(first: &str, lines: &mut impl Iterator<Item = &'a str>) {
    let mut depth = brace_balance(first);
    while depth > 0 {
        let line = lines
            .next()
            .expect("a #[cfg(test)] module never closes; the trace scan cannot place its end");
        depth += brace_balance(line);
    }
}

fn brace_balance(line: &str) -> i64 {
    line.chars().fold(0, |depth, character| match character {
        '{' => depth + 1,
        '}' => depth - 1,
        _ => depth,
    })
}

fn source(path: &str, text: &str) -> (PathBuf, String) {
    (PathBuf::from(path), text.to_string())
}

#[test]
fn redaction_canary_keeps_play_session_ids_out_of_native_traces() {
    let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("src");
    let mut files = Vec::new();
    collect_rust_files(&root, &mut files);
    let sources: Vec<(PathBuf, String)> = files
        .into_iter()
        .map(|path| {
            let text = fs::read_to_string(&path).expect("source file should be readable");
            let relative = path.strip_prefix(&root).expect("under src").to_path_buf();
            (relative, text)
        })
        .collect();

    let result = scan(&sources);
    assert!(
        result.hits.is_empty(),
        "native traces name a session identifier: {:?}",
        result.hits
    );
    // The rule reaches production modules without a list and skips test files.
    for production in [
        "lib.rs",
        "commands.rs",
        "realtime.rs",
        "surface.rs",
        "surface/linux.rs",
        "player/mod.rs",
        "player/controller.rs",
        "player/events.rs",
    ] {
        assert!(
            result.scanned.contains(Path::new(production)),
            "{production} was not scanned"
        );
    }
    for test_only in [
        "trace_canary.rs",
        "command_allowlist.rs",
        "player/redaction_canary.rs",
        "player/media_auth_wire/tracks.rs",
        "player/tracks/tests.rs",
        "realtime/tests/socket.rs",
    ] {
        assert!(
            sources.iter().any(|(path, _)| path == Path::new(test_only)),
            "{test_only} no longer exists; update this list"
        );
        assert!(
            !result.scanned.contains(Path::new(test_only)),
            "{test_only} should be test-only"
        );
    }
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
        source("leaky/inner.rs", "native_trace(\"session started\");\n"),
        source("fixtures.rs", "eprintln!(\"session {id}\");\n"),
        source("fixtures/nested.rs", "eprintln!(\"session {id}\");\n"),
    ]);
    assert_eq!(
        result.hits,
        vec![
            "leaky.rs: eprintln!(\"[fluster native] {id}\");".to_string(),
            "leaky/inner.rs: native_trace(\"session started\");".to_string(),
        ]
    );
}

#[test]
fn trace_scan_reads_production_code_after_a_test_module() {
    let text = "\
fn before() {}

#[cfg(test)]
#[allow(dead_code)]
mod tests {
    fn helper() {
        eprintln!(\"session {id}\");
    }
}

fn after(id: &str) {
    native_trace(\"stopping session\");
    realtime_trace(\"{id}\");
}
";
    assert_eq!(
        session_traces(text),
        vec![
            "native_trace(\"stopping session\");".to_string(),
            "realtime_trace(\"{id}\");".to_string(),
        ]
    );
}

#[test]
#[should_panic(expected = "never closes")]
fn trace_scan_refuses_an_unterminated_test_module() {
    session_traces("#[cfg(test)]\nmod tests {\n    fn open() { \"{\";\n}\n");
}
