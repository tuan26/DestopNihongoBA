# Tasks: Trò chơi & Quiz ôn tập

- [x] T101 Migration 002 `quiz_results`
- [x] T102 `src/core/quiz/questions.ts` — pool, distractors, 5 loại câu, chấm cách đọc
- [x] T103 `src/core/quiz/results.ts` — lưu ván, best score, đưa từ sai vào ôn lại
- [x] T104 Tests: không trùng đáp án trên dataset thật, chấm cách đọc, lưu kết quả
- [x] T105 UI: trang Trò chơi (chọn trò, nguồn, hướng), menu + ô trên Dashboard
- [x] T106 UI: Trắc nghiệm, Điền từ (chung component), Gõ cách đọc
- [x] T107 UI: Ghép cặp, Đúng/Sai 60s
- [x] T108 Màn hình kết quả + điểm cao nhất + ôn lại từ sai
- [x] T109 E2E: chơi hết một ván Trắc nghiệm và Ghép cặp
- [x] T110 Cập nhật user guide, build, push

## Kiểm chứng (2026-11-26)
- Vitest 27/27 (gồm 30 vòng × 3 hướng trên dataset thật: không có đáp án trùng); Playwright 6/6 (Trắc nghiệm, Ghép cặp, Đúng/Sai).
- E2E phát hiện & đã sửa: phím Enter kích hoạt nhầm nút đáp án đang focus ở câu kế tiếp.
- App desktop (Xvfb): DB schema v1 nâng lên v2 tự động, có backup `pre-migration`, dữ liệu giữ nguyên.
