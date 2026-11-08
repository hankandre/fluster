//! HLS attribute lists (RFC 8216 §4.2), parsed strictly so that FFmpeg's
//! looser `ff_parse_key_value` reads exactly the same names and values from
//! the line Rust writes back.

#[derive(Clone, Debug, PartialEq, Eq)]
pub(super) enum Value {
    Quoted(String),
    Plain(String),
}

impl Value {
    pub(super) fn text(&self) -> &str {
        match self {
            Value::Quoted(text) | Value::Plain(text) => text,
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub(super) struct Attribute {
    pub(super) name: String,
    pub(super) value: Value,
}

fn is_name_char(character: char) -> bool {
    character.is_ascii_uppercase() || character.is_ascii_digit() || character == '-'
}

// FFmpeg ends an unquoted value at whitespace and reads `\` as an escape
// inside quotes; RFC 8216 does neither. Refusing both removes the difference.
fn is_quoted_char(character: char) -> bool {
    !character.is_control() && character != '"' && character != '\\'
}

fn is_plain_char(character: char) -> bool {
    character.is_ascii_graphic() && !matches!(character, '"' | '\\' | ',')
}

/// Parses `NAME=value,NAME="value"`. `None` for anything else, including an
/// empty list, a trailing comma, and a repeated name.
pub(super) fn parse(text: &str) -> Option<Vec<Attribute>> {
    let mut attributes: Vec<Attribute> = Vec::new();
    let mut rest = text;
    loop {
        let name_end = rest.find(|character: char| !is_name_char(character))?;
        let (name, after_name) = rest.split_at(name_end);
        if name.is_empty() || attributes.iter().any(|attribute| attribute.name == name) {
            return None;
        }
        let after_equals = after_name.strip_prefix('=')?;
        let (value, after_value) = if let Some(quoted) = after_equals.strip_prefix('"') {
            let close = quoted.find('"')?;
            let value = &quoted[..close];
            if !value.chars().all(is_quoted_char) {
                return None;
            }
            (Value::Quoted(value.to_string()), &quoted[close + 1..])
        } else {
            let end = after_equals.find(',').unwrap_or(after_equals.len());
            let value = &after_equals[..end];
            if value.is_empty() || !value.chars().all(is_plain_char) {
                return None;
            }
            (Value::Plain(value.to_string()), &after_equals[end..])
        };
        attributes.push(Attribute {
            name: name.to_string(),
            value,
        });
        if after_value.is_empty() {
            return Some(attributes);
        }
        rest = after_value.strip_prefix(',')?;
    }
}

/// Writes the list back in the same order with the same quoting.
pub(super) fn render(attributes: &[Attribute]) -> String {
    attributes
        .iter()
        .map(|attribute| match &attribute.value {
            Value::Quoted(text) => format!("{}=\"{text}\"", attribute.name),
            Value::Plain(text) => format!("{}={text}", attribute.name),
        })
        .collect::<Vec<_>>()
        .join(",")
}

/// True for an attribute that names a resource: `URI` and every `*-URI`
/// (`SERVER-URI`, `X-ASSET-URI`), `X-ASSET-LIST`, and any value that looks
/// like a URL or an absolute path, whatever its name.
/// Display text with whitespace is not treated as a URL.
pub(super) fn names_a_resource(attribute: &Attribute) -> bool {
    let name = attribute.name.as_str();
    name == "URI"
        || name.ends_with("-URI")
        || name == "X-ASSET-LIST"
        || looks_like_url(attribute.value.text())
}

fn looks_like_url(value: &str) -> bool {
    if value.starts_with('/') || value.contains("//") {
        return true;
    }
    // Display text such as `NAME="Commentary: Director"` is not a URL.
    if value.chars().any(char::is_whitespace) {
        return false;
    }
    // A scheme: a letter, then letters, digits, `+`, `-`, or `.`, then `:`.
    let mut characters = value.chars();
    if !characters
        .next()
        .is_some_and(|first| first.is_ascii_alphabetic())
    {
        return false;
    }
    for character in characters {
        if character == ':' {
            return true;
        }
        if !(character.is_ascii_alphanumeric() || matches!(character, '+' | '-' | '.')) {
            return false;
        }
    }
    false
}
