//! Fails when the Tauri command surface changes without a deliberate decision.
//!
//! `generate_handler!` cannot be inspected at runtime, so this test reads the
//! Rust sources as text.

use std::collections::BTreeSet;
use std::fs;
use std::path::Path;

/// The only commands the frontend may invoke. Keep in sync with docs/security.md.
const ALLOWED_COMMANDS: [&str; 12] = [
    "initialize_player",
    "launch_playback",
    "set_player_surface",
    "set_paused",
    "seek_absolute",
    "set_volume",
    "set_muted",
    "select_track",
    "set_fullscreen",
    "stop_playback",
    "realtime_connect",
    "realtime_disconnect",
];

const UPDATE_INSTRUCTIONS: &str = "Commands are an architecture change: update ALLOWED_COMMANDS \
in src-tauri/src/command_allowlist.rs, list the command in docs/security.md and \
docs/architecture.md, and record the decision in the active plan \
(see .claude/skills/native-player/references/adding-a-command.md).";

fn registered_commands() -> BTreeSet<String> {
    let lib = include_str!("lib.rs");
    let start = lib
        .find("generate_handler![")
        .expect("lib.rs should call generate_handler!")
        + "generate_handler![".len();
    let end = start
        + lib[start..]
            .find(']')
            .expect("generate_handler! should close");
    lib[start..end]
        .split(',')
        .map(|name| name.trim().to_string())
        .filter(|name| !name.is_empty())
        .collect()
}

fn collect_rust_files(dir: &Path, files: &mut Vec<std::path::PathBuf>) {
    for entry in fs::read_dir(dir).expect("source directory should be readable") {
        let path = entry.expect("directory entry should be readable").path();
        if path.is_dir() {
            collect_rust_files(&path, files);
        } else if path.extension().is_some_and(|extension| extension == "rs") {
            files.push(path);
        }
    }
}

/// Names of every fn that follows a `#[tauri::command]` attribute.
fn annotated_commands() -> BTreeSet<String> {
    let mut files = Vec::new();
    collect_rust_files(
        &Path::new(env!("CARGO_MANIFEST_DIR")).join("src"),
        &mut files,
    );

    let mut names = BTreeSet::new();
    for file in files {
        let source = fs::read_to_string(&file).expect("source file should be readable");
        let mut after_attribute = false;
        for line in source.lines().map(str::trim) {
            if line == "#[tauri::command]" {
                after_attribute = true;
            } else if after_attribute && line.contains("fn ") {
                let after_fn = line.split("fn ").nth(1).unwrap_or_default();
                let name = after_fn.split('(').next().unwrap_or_default();
                names.insert(name.trim().to_string());
                after_attribute = false;
            }
        }
    }
    names
}

fn difference(left: &BTreeSet<String>, right: &BTreeSet<String>) -> Vec<String> {
    left.difference(right).cloned().collect()
}

#[test]
fn command_allowlist_matches_registered_commands() {
    let allowed: BTreeSet<String> = ALLOWED_COMMANDS
        .iter()
        .map(|name| name.to_string())
        .collect();
    let registered = registered_commands();
    assert!(
        registered == allowed,
        "Tauri command surface changed: added {:?}, removed {:?}. {}",
        difference(&registered, &allowed),
        difference(&allowed, &registered),
        UPDATE_INSTRUCTIONS
    );
}

#[test]
fn command_allowlist_covers_every_annotated_command() {
    let registered = registered_commands();
    let annotated = annotated_commands();
    assert!(
        registered == annotated,
        "#[tauri::command] fns differ from generate_handler!: unregistered {:?}, registered without attribute {:?}. {}",
        difference(&annotated, &registered),
        difference(&registered, &annotated),
        UPDATE_INSTRUCTIONS
    );
}
