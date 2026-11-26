# Plan: 003-n1-decks
Constitution: PASS (local-first; bảo toàn dữ liệu: backup + idempotent; không phát tán nội dung bên thứ ba; logic thuần TS có test).

- Rust: `read_text_file(path)` cho .json ≤ 150 MB (tránh truyền mảng byte qua IPC).
- Migration 3: `n1_decks`, `n1_cards`, `n1_card_states` (FSRS), `n1_questions`, `n1_attempts`.
- `src/core/n1/pack.ts` định dạng `jbv-pack` + validate; `crawler.ts` chuyển n1_data.json → pack; `importer.ts` upsert theo key;
  `html.ts` sanitizer; `cards.ts` hàng đợi + chấm FSRS (tái dùng `schedule()`); `practice.ts` câu hỏi, lượt trả lời, sổ câu sai, tiến độ.
- UI: menu "Ôn N1" → `/n1` (nhập, thống kê, cây bộ đề), `/n1/cards/:deck|today`, `/n1/quiz/:deck|wrong`.
- CSP: thêm `media-src https:` để phát audio câu nghe.
