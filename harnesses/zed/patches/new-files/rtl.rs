// ZED-RTL: automatic right-to-left paragraph detection for the agent chat.
//
// Rule: if a rendered paragraph/line contains at least one RTL character
// (Persian, Arabic, Hebrew, …) the whole line is right-aligned — even when
// the first word is English. Pure LTR text keeps the default alignment.
//
// Code blocks are deliberately excluded by the caller (see `flush_text`):
// source code must always stay left-aligned/LTR.

/// Returns true if `text` contains at least one strongly RTL character.
pub fn contains_rtl(text: &str) -> bool {
    text.chars().any(is_rtl_char)
}

/// Returns true if `c` is a strongly RTL character.
///
/// Covered ranges:
/// - `0590..=08FF` — Hebrew, Arabic (incl. Persian `0600..=06FF`), Syriac,
///   Arabic Supplement, Arabic Extended-A
/// - `FB50..=FDFF`, `FE70..=FEFF` — Arabic/Hebrew presentation forms
///   (Persian ligatures such as ﻝﺍ live here)
/// - `200F`, `202B`, `202E`, `2066..=2069` — explicit RTL marks/embeds
pub fn is_rtl_char(c: char) -> bool {
    matches!(c,
        '\u{0590}'..='\u{08FF}'
        | '\u{FB50}'..='\u{FDFF}'
        | '\u{FE70}'..='\u{FEFF}'
        | '\u{200F}'
        | '\u{202B}'
        | '\u{202E}'
        | '\u{2066}'..='\u{2069}'
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detects_persian_anywhere_in_line() {
        assert!(contains_rtl("سلام دنیا"));
        // English-first sentence with one Persian word -> still RTL.
        assert!(contains_rtl("Hello, این یک تست است"));
        assert!(contains_rtl("Zed is سریع است"));
    }

    #[test]
    fn pure_ltr_is_not_rtl() {
        assert!(!contains_rtl("Hello, world!"));
        assert!(!contains_rtl("fn main() { println!(\"hi\"); }"));
        assert!(!contains_rtl("12345 ?!..."));
        assert!(!contains_rtl(""));
    }

    #[test]
    fn arabic_hebrew_and_marks_count_as_rtl() {
        assert!(contains_rtl("مرحبا")); // Arabic
        assert!(contains_rtl("שלום")); // Hebrew
        assert!(contains_rtl("abc\u{200F}")); // RLM
    }

    #[test]
    fn code_with_rtl_string_stays_detectable_but_caller_excludes_code() {
        // Detection itself is dumb on purpose; `flush_text` skips code blocks.
        assert!(contains_rtl("let s = \"سلام\";"));
    }
}
