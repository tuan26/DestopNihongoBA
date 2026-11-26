# Implementation Plan: Trò chơi & Quiz ôn tập

**Spec**: [spec.md](./spec.md) — Constitution check: PASS (offline, dữ liệu local, logic thuần TS có test, không thêm thư viện).

## Thiết kế
- `src/core/quiz/questions.ts` (thuần TS, test được): lấy pool từ theo nguồn; sinh câu hỏi trắc nghiệm (3 hướng), câu điền từ,
  cặp Đúng/Sai, cặp ghép; chọn đáp án nhiễu (ưu tiên cùng category, loại trùng normalizedKey/nghĩa/cách đọc); chấm cách đọc gõ tay
  (NFKC, katakana→hiragana, bỏ khoảng trắng và ・).
- `src/core/quiz/results.ts`: lưu ván, điểm cao nhất, lịch sử; `markWrongForReview` gọi `rateWord(…, 1, 'quiz')`.
- Migration 002: bảng `quiz_results (id, game, score, correct, total, duration_ms, source, played_at, wrong_ids)`.
- UI: `src/pages/Quiz.tsx` (chọn trò + nguồn), `src/pages/quiz/*` mỗi trò một component, màn hình kết quả chung.
- Điểm: đúng = 100 + combo×10 (combo tối đa 10); Ghép cặp = max(0, 1000 − giây×10 − lỗi×50); Đúng/Sai: 50 + combo×10.
