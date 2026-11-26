# Feature Specification: Trò chơi & Quiz ôn tập

**Feature Branch**: `002-quiz-games`
**Created**: 2026-11-26
**Status**: Clarified
**Input**: User description: "Thêm chức năng chơi trò chơi hoặc quiz để hỏi đáp ôn tập cho dễ"

## Clarifications

### Session 2026-11-26 (trả lời theo phương án khuyến nghị)

- Q: Quiz có làm thay đổi lịch ôn FSRS không? → A: Không tự động. Cuối mỗi ván hiển thị danh sách từ trả lời sai và nút
  "Đưa các từ sai vào ôn lại" (đánh dấu Quên trong FSRS). Lý do: quiz trắc nghiệm dễ hơn tự nhớ (recall), tự động chấm Good sẽ làm lịch ôn sai lệch.
- Q: Lấy từ ở đâu? → A: Nguồn chọn được: Từ đã học (mặc định, fallback sang tất cả nếu chưa đủ), Tất cả, Từ hay quên, Yêu thích, theo chủ đề.
- Q: Có lưu điểm không? → A: Có, lưu lịch sử ván chơi cục bộ và hiển thị điểm cao nhất từng trò.

## User Scenarios & Testing

### User Story 1 - Trắc nghiệm 4 đáp án (P1)
Người dùng chọn hướng (Nhật→Việt, Việt→Nhật, Kanji→Cách đọc), trả lời 10 câu bằng chuột hoặc phím 1–4, thấy ngay đúng/sai, combo, điểm.
**Acceptance**: Given 10 câu, When chọn đáp án, Then đáp án đúng được tô xanh, sai tô đỏ, chuyển câu sau; cuối ván hiện điểm, % đúng, danh sách từ sai.

### User Story 2 - Ghép cặp (P1)
6 thẻ tiếng Nhật và 6 thẻ nghĩa xáo trộn; bấm 2 thẻ để ghép; tính giờ và số lần sai.
**Acceptance**: ghép đúng → hai thẻ biến mất; ghép sai → rung đỏ, +1 lỗi; hết thẻ → hiện thời gian và điểm.

### User Story 3 - Đúng hay Sai 60 giây (P2)
Hiện một từ kèm một nghĩa (đúng hoặc sai ~50%), người dùng bấm Đúng/Sai (phím ← →) nhanh nhất có thể trong 60 giây; combo nhân điểm.

### User Story 4 - Gõ cách đọc (P2)
Hiện từ có kanji, người dùng gõ cách đọc bằng kana (IME), chấp nhận hiragana/katakana, bỏ qua khoảng trắng.

### User Story 5 - Điền từ vào câu (P2)
Câu ví dụ bị che từ mục tiêu, chọn 1 trong 4 từ (cùng chủ đề).

### Edge Cases
- Nguồn có ít hơn số câu cần → lấy thêm từ "Tất cả", báo cho người dùng.
- Không đủ đáp án nhiễu cùng chủ đề → lấy từ chủ đề khác; không bao giờ có 2 đáp án trùng nhau.
- Thoát giữa ván → không lưu kết quả.

## Requirements

- **FR-101**: 5 trò chơi: Trắc nghiệm, Ghép cặp, Đúng/Sai 60s, Gõ cách đọc, Điền từ.
- **FR-102**: Chọn nguồn từ; chọn hướng cho Trắc nghiệm.
- **FR-103**: Đáp án nhiễu ưu tiên cùng category, không trùng nghĩa/cách đọc với đáp án đúng.
- **FR-104**: Điểm, combo, thời gian; lưu lịch sử ván và điểm cao nhất mỗi trò.
- **FR-105**: Kết thúc ván: danh sách từ sai; nút đưa từ sai vào ôn lại (FSRS Again, mode `quiz`); nút chơi lại.
- **FR-106**: Điều khiển bằng bàn phím (1–4, ←/→, Enter).
- **FR-107**: Hoạt động offline, không cần AI.

## Success Criteria
- **SC-101**: Bắt đầu một ván trong ≤ 2 thao tác từ menu.
- **SC-102**: 0 câu có đáp án trùng lặp (kiểm chứng bằng test trên dataset 1.000 từ).
- **SC-103**: Ván Trắc nghiệm 10 câu hoàn thành trong < 2 phút.

## Assumptions
- Không có bảng xếp hạng online (local-first).
