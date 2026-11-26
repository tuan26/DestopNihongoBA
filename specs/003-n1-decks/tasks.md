# Tasks: 003-n1-decks
- [x] T201 Rust read_text_file + CSP media-src
- [x] T202 Migration 3
- [x] T203 core/n1: pack, crawler converter, html sanitizer
- [x] T204 core/n1: importer (idempotent, backup), cards (FSRS), practice (attempts, wrong bank, progress)
- [x] T205 Tests với dữ liệu giả lập (không dùng dữ liệu khóa học)
- [x] T206 UI: trang Ôn N1 (nhập + cây bộ đề + thống kê)
- [x] T207 UI: học flashcard N1, luyện đề, sổ câu sai
- [x] T208 E2E, kiểm thử nhập file thật cục bộ (không commit), tài liệu, build

## Kiểm chứng (2026-11-26)
- Vitest 31/31 (dữ liệu giả lập); Playwright 7/7 (nhập pack → flashcard → làm đề → sổ câu sai).
- Thử cục bộ với file thật của người dùng (KHÔNG commit): 7.324 thẻ, 9.793 câu, 746 bộ; chuyển đổi 0,13 s, nhập ~1,2 s; nhập lại 0 trùng.
- Repo không chứa nội dung khóa học (fixture e2e do tự viết).
