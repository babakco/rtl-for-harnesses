//! Standalone verification of the ZED-RTL detection logic.
//!
//! This file INCLUDES the exact `rtl.rs` shipped in
//! `patches/new-files/rtl.rs`, so `cargo test` here always exercises the
//! real patched logic (plus the extra scenario checks in `main`).

mod rtl {
    include!("../../../patches/new-files/rtl.rs");
}

use rtl::contains_rtl;

fn main() {
    let cases: &[(&str, bool)] = &[
        // User rule: English-first sentence with one Persian word -> RTL.
        ("Hello, این یک تست است", true),
        ("Zed is سریع است", true),
        ("سلام دنیا", true),
        ("## Title فارسی", true),
        ("- item with کلمه inside", true),
        ("print(\"سلام\")", true), // detection is dumb; caller excludes code
        ("שלום", true),
        ("abc\u{200F}", true),
        // Pure LTR stays LTR.
        ("Hello, world!", false),
        ("fn main() {}", false),
        ("| a | b |\n|---|---|", false),
        ("", false),
        ("12345 + 67890", false),
        // Persian digits live in the Arabic block: a line of Persian
        // digits is Persian content, so right-alignment is correct.
        ("۱۲۳۴۵", true),
        // A sentence starting with symbols/punctuation but containing
        // Persian must still flip (user rule: any Persian word counts).
        ("؟Hello این یک تست است؟", true),
        ("...سلام...", true),
        ("(test) فارسی", true),
    ];
    let mut failed = 0;
    for (text, expected) in cases {
        let got = contains_rtl(text);
        let status = if got == *expected { "ok" } else { failed += 1; "FAIL" };
        println!("[{status}] {text:?} -> {got} (expected {expected})");
    }
    if failed > 0 {
        eprintln!("{failed} case(s) FAILED");
        std::process::exit(1);
    }
    println!("all {} cases passed", cases.len());
}
