//! Blanks comments and the contents of string and char literals, so braces,
//! parentheses, and calls can be found by position. Every blanked byte becomes
//! a space and newlines stay, so offsets match the original source.

pub(super) fn code_view(source: &str) -> String {
    let bytes = source.as_bytes();
    let mut out = bytes.to_vec();
    let mut i = 0;
    while i < bytes.len() {
        let rest = &bytes[i..];
        let end = if rest.starts_with(b"//") {
            let end = find_from(bytes, i, b"\n").unwrap_or(bytes.len());
            blank(&mut out, i, end);
            end
        } else if rest.starts_with(b"/*") {
            let end = block_comment_end(bytes, i);
            blank(&mut out, i, end);
            end
        } else if let Some((open, hashes)) = raw_string_open(bytes, i) {
            let closing = [b"\"".as_slice(), &vec![b'#'; hashes]].concat();
            let close = find_from(bytes, open + 1, &closing).unwrap_or(bytes.len());
            blank(&mut out, open + 1, close);
            (close + closing.len()).min(bytes.len())
        } else if bytes[i] == b'"' {
            let close = string_end(bytes, i + 1);
            blank(&mut out, i + 1, close);
            (close + 1).min(bytes.len())
        } else if bytes[i] == b'\'' {
            match char_literal_end(source, i) {
                Some(close) => {
                    blank(&mut out, i + 1, close);
                    close + 1
                }
                // A lifetime or label, not a literal.
                None => i + 1,
            }
        } else {
            i + 1
        };
        i = end;
    }
    String::from_utf8(out).expect("blanking replaces whole characters with spaces")
}

fn blank(out: &mut [u8], start: usize, end: usize) {
    let end = end.min(out.len());
    for byte in &mut out[start..end] {
        if *byte != b'\n' {
            *byte = b' ';
        }
    }
}

fn find_from(bytes: &[u8], from: usize, needle: &[u8]) -> Option<usize> {
    bytes
        .get(from..)?
        .windows(needle.len())
        .position(|window| window == needle)
        .map(|offset| from + offset)
}

fn is_ident_byte(byte: u8) -> bool {
    byte.is_ascii_alphanumeric() || byte == b'_'
}

/// End (exclusive) of a possibly nested `/* … */` comment starting at `start`.
fn block_comment_end(bytes: &[u8], start: usize) -> usize {
    let mut depth = 0;
    let mut i = start;
    while i < bytes.len() {
        if bytes[i..].starts_with(b"/*") {
            depth += 1;
            i += 2;
        } else if bytes[i..].starts_with(b"*/") {
            depth -= 1;
            i += 2;
            if depth == 0 {
                return i;
            }
        } else {
            i += 1;
        }
    }
    bytes.len()
}

/// For `r"`, `r#"`, `br#"` … at `i`: the index of the opening quote and the
/// number of `#`.
fn raw_string_open(bytes: &[u8], i: usize) -> Option<(usize, usize)> {
    let r = match bytes[i] {
        b'b' if bytes.get(i + 1) == Some(&b'r') => i + 1,
        b'r' => i,
        _ => return None,
    };
    if i > 0 && is_ident_byte(bytes[i - 1]) {
        return None;
    }
    let hashes = bytes[r + 1..]
        .iter()
        .take_while(|byte| **byte == b'#')
        .count();
    let open = r + 1 + hashes;
    (bytes.get(open) == Some(&b'"')).then_some((open, hashes))
}

/// Index of the closing quote of a normal string whose contents start at `i`.
fn string_end(bytes: &[u8], mut i: usize) -> usize {
    while i < bytes.len() {
        match bytes[i] {
            b'\\' => i += 2,
            b'"' => return i,
            _ => i += 1,
        }
    }
    bytes.len()
}

/// Index of the closing quote when `'` at `i` opens a char literal.
fn char_literal_end(source: &str, i: usize) -> Option<usize> {
    let bytes = source.as_bytes();
    if bytes.get(i + 1) == Some(&b'\\') {
        // Escapes: skip the escaped character, then find the closing quote.
        return find_from(bytes, i + 3, b"'");
    }
    let character = source.get(i + 1..)?.chars().next()?;
    let close = i + 1 + character.len_utf8();
    (bytes.get(close) == Some(&b'\'')).then_some(close)
}
