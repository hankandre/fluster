//! Finds trace calls in one file's code view and decides which could name a
//! session or an id.

use super::code_view::code_view;
use std::ops::Range;

/// Calls whose text reaches stdout or stderr.
const TRACE_CALLS: [&str; 8] = [
    "eprintln!",
    "eprint!",
    "println!",
    "print!",
    "dbg!",
    "native_trace",
    "realtime_trace",
    "media_trace",
];

/// The sanctioned trace helpers; they forward their message by design and
/// their callers are scanned instead.
const TRACE_SINKS: [&str; 3] = ["native_trace", "realtime_trace", "media_trace"];

/// A module declared under `#[cfg(test)]`, with its inline body if it has one.
pub(super) struct CfgTestModule {
    pub(super) name: String,
    pub(super) body: Option<Range<usize>>,
}

struct Function {
    name: String,
    params: Vec<String>,
    body: Range<usize>,
}

/// Every `#[cfg(test)] mod name;` and `#[cfg(test)] mod name { … }` in a code view.
pub(super) fn cfg_test_modules(code: &str) -> Vec<CfgTestModule> {
    const ATTRIBUTE: &str = "#[cfg(test)]";
    let mut modules = Vec::new();
    let mut search = 0;
    while let Some(offset) = code[search..].find(ATTRIBUTE) {
        let item = skip_attributes(code, search + offset + ATTRIBUTE.len());
        search = item;
        let Some((name, after_name)) = mod_declaration(code, item) else {
            continue;
        };
        let next = skip_whitespace(code, after_name);
        match code.as_bytes().get(next) {
            Some(b';') => modules.push(CfgTestModule { name, body: None }),
            Some(b'{') => {
                let close = matching(code, next, b'{', b'}').unwrap_or_else(|| {
                    panic!(
                        "#[cfg(test)] mod {name} never closes; the trace scan cannot place its end"
                    )
                });
                modules.push(CfgTestModule {
                    name,
                    body: Some(next..close + 1),
                });
            }
            _ => {}
        }
    }
    modules
}

/// Trace calls outside `#[cfg(test)]` module bodies that could name a session
/// or an id, each as "reason: call".
pub(super) fn session_traces(source: &str) -> Vec<String> {
    let code = code_view(source);
    let test_bodies: Vec<Range<usize>> = cfg_test_modules(&code)
        .into_iter()
        .filter_map(|module| module.body)
        .collect();
    let functions = functions(&code);
    let mut hits = Vec::new();
    for (start, callee) in trace_calls(&code) {
        if test_bodies.iter().any(|body| body.contains(&start)) {
            continue;
        }
        let open = skip_whitespace(&code, start + callee.len());
        let close = match code.as_bytes().get(open) {
            Some(b'(') => matching(&code, open, b'(', b')'),
            Some(b'[') => matching(&code, open, b'[', b']'),
            Some(b'{') => matching(&code, open, b'{', b'}'),
            _ => continue,
        };
        let Some(close) = close else {
            hits.push((start, format!("unterminated call: {callee}")));
            continue;
        };
        let call = &source[start..=close];
        let arguments = &code[open + 1..close];
        let enclosing = functions
            .iter()
            .filter(|function| function.body.contains(&start))
            .min_by_key(|function| function.body.len());
        // Arguments in code, plus names inlined in format strings (`{name}`).
        let mut referenced: Vec<&str> = identifiers(arguments).collect();
        referenced.extend(placeholders(call));
        let reason = if call.to_ascii_lowercase().contains("session") {
            Some("names a session".to_string())
        } else if referenced.iter().any(|word| names_an_id(word)) {
            Some("formats an id".to_string())
        } else if arguments.contains('$') {
            Some("forwards a macro argument".to_string())
        } else {
            enclosing
                .filter(|function| !TRACE_SINKS.contains(&function.name.as_str()))
                .filter(|function| {
                    referenced
                        .iter()
                        .any(|word| function.params.iter().any(|param| param == word))
                })
                .map(|function| format!("forwards a parameter of fn {}", function.name))
        };
        if let Some(reason) = reason {
            hits.push((start, format!("{reason}: {}", collapse_whitespace(call))));
        }
    }
    hits.sort();
    hits.into_iter().map(|(_, hit)| hit).collect()
}

/// (offset, callee) for every trace call; definitions (`fn native_trace`) are skipped.
fn trace_calls(code: &str) -> Vec<(usize, &'static str)> {
    let bytes = code.as_bytes();
    let mut calls = Vec::new();
    for callee in TRACE_CALLS {
        let mut search = 0;
        while let Some(offset) = code[search..].find(callee) {
            let start = search + offset;
            search = start + callee.len();
            let starts_word = start == 0 || !is_ident_byte(bytes[start - 1]);
            let ends_word = callee.ends_with('!')
                || !matches!(bytes.get(search), Some(byte) if is_ident_byte(*byte));
            let is_definition = code[..start].trim_end().ends_with("fn");
            if starts_word && ends_word && !is_definition {
                calls.push((start, callee));
            }
        }
    }
    calls
}

fn functions(code: &str) -> Vec<Function> {
    let bytes = code.as_bytes();
    let mut found = Vec::new();
    let mut search = 0;
    while let Some(offset) = code[search..].find("fn ") {
        let start = search + offset;
        search = start + 3;
        if start > 0 && is_ident_byte(bytes[start - 1]) {
            continue;
        }
        let name: String = code[search..]
            .trim_start()
            .chars()
            .take_while(|character| character.is_alphanumeric() || *character == '_')
            .collect();
        let Some(open) = code[search..].find('(').map(|index| search + index) else {
            continue;
        };
        let Some(close) = matching(code, open, b'(', b')') else {
            continue;
        };
        let Some(body_open) = code[close..]
            .find(['{', ';'])
            .map(|index| close + index)
            .filter(|index| bytes[*index] == b'{')
        else {
            continue;
        };
        let Some(body_close) = matching(code, body_open, b'{', b'}') else {
            continue;
        };
        found.push(Function {
            name,
            params: parameter_names(&code[open + 1..close]),
            body: body_open..body_close + 1,
        });
    }
    found
}

/// The identifier before each top-level `:` in a parameter list.
fn parameter_names(params: &str) -> Vec<String> {
    let bytes = params.as_bytes();
    let mut names = Vec::new();
    let mut depth = 0i32;
    let mut segment_start = 0;
    let mut i = 0;
    while i < bytes.len() {
        match bytes[i] {
            b'-' if bytes.get(i + 1) == Some(&b'>') => i += 1,
            b'(' | b'[' | b'<' => depth += 1,
            b')' | b']' | b'>' => depth -= 1,
            b',' if depth == 0 => segment_start = i + 1,
            b':' if depth == 0
                && bytes.get(i + 1) != Some(&b':')
                && (i == 0 || bytes[i - 1] != b':') =>
            {
                if let Some(name) = identifiers(&params[segment_start..i]).last() {
                    names.push(name.to_string());
                }
            }
            _ => {}
        }
        i += 1;
    }
    names
}

fn identifiers(code: &str) -> impl Iterator<Item = &str> {
    code.split(|character: char| !(character.is_alphanumeric() || character == '_'))
        .filter(|word| {
            word.starts_with(|character: char| character.is_alphabetic() || character == '_')
        })
}

/// Names inside `{name}` or `{name:…}` format placeholders.
fn placeholders(text: &str) -> Vec<&str> {
    let mut names = Vec::new();
    let mut rest = text;
    while let Some(open) = rest.find('{') {
        rest = &rest[open + 1..];
        if rest.starts_with('{') {
            rest = &rest[1..];
            continue;
        }
        let inner = rest.split(['}', ':']).next().unwrap_or_default();
        if identifiers(inner).count() == 1 && identifiers(inner).next() == Some(inner.trim()) {
            names.push(inner.trim());
        }
    }
    names
}

/// `id`, `sid`, `item_id`, `play_session_id`, `PlaySessionId`, …
fn names_an_id(word: &str) -> bool {
    let lowered = word.to_ascii_lowercase();
    lowered.contains("session")
        || word.ends_with("Id")
        || lowered
            .split('_')
            .any(|segment| matches!(segment, "id" | "ids" | "sid"))
}

fn is_ident_byte(byte: u8) -> bool {
    byte.is_ascii_alphanumeric() || byte == b'_'
}

fn skip_whitespace(code: &str, from: usize) -> usize {
    from + code[from..].len() - code[from..].trim_start().len()
}

fn skip_attributes(code: &str, mut from: usize) -> usize {
    loop {
        let next = skip_whitespace(code, from);
        if !code[next..].starts_with("#[") {
            return next;
        }
        match matching(code, next + 1, b'[', b']') {
            Some(close) => from = close + 1,
            None => return next,
        }
    }
}

/// `(name, end of name)` for `mod name` or `pub … mod name` at `from`.
fn mod_declaration(code: &str, from: usize) -> Option<(String, usize)> {
    let mut at = from;
    if code[at..].starts_with("pub") {
        at = skip_whitespace(code, at + 3);
        if code[at..].starts_with('(') {
            at = skip_whitespace(code, matching(code, at, b'(', b')')? + 1);
        }
    }
    let after_mod = code[at..].strip_prefix("mod")?;
    if !after_mod.starts_with(char::is_whitespace) {
        return None;
    }
    let name_start = skip_whitespace(code, at + 3);
    let name: String = code[name_start..]
        .chars()
        .take_while(|character| character.is_alphanumeric() || *character == '_')
        .collect();
    (!name.is_empty()).then(|| (name.clone(), name_start + name.len()))
}

/// Index of the delimiter that closes the one at `open`.
fn matching(code: &str, open: usize, opener: u8, closer: u8) -> Option<usize> {
    let mut depth = 0usize;
    for (index, byte) in code.as_bytes().iter().enumerate().skip(open) {
        if *byte == opener {
            depth += 1;
        } else if *byte == closer {
            depth = depth.checked_sub(1)?;
            if depth == 0 {
                return Some(index);
            }
        }
    }
    None
}

fn collapse_whitespace(text: &str) -> String {
    text.split_whitespace().collect::<Vec<_>>().join(" ")
}
