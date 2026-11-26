# Feature Specification: Tab "Ôn N1" — bộ đề & flashcard riêng của người dùng

**Feature Branch**: `003-n1-decks` · **Created**: 2026-11-26 · **Status**: Clarified
**Input**: "Xây dựng 1 tab khác để ôn N1 từ dữ liệu (crawler) của tôi"

## Clarifications (Session 2026-11-26)
- Q: Dữ liệu N1 có được đưa vào repo/bộ cài không? → A: **Không.** Dữ liệu là tài liệu khóa học trả phí của bên thứ ba mà người dùng
  có quyền học. App chỉ cung cấp chức năng **nhập file từ máy người dùng**; dữ liệu lưu trong DB cục bộ; repo và test không chứa nội dung đó.
- Q: Định dạng nhập? → A: (1) file `n1_data.json` của crawler (courses/sections/lessons/resources) — app tự chuyển đổi;
  (2) định dạng chung `jbv-pack` (JSON) để có thể nhập bộ đề từ nguồn khác.
- Q: Tách khỏi 1.000 từ BA? → A: Có. Bảng riêng, lịch FSRS riêng, giới hạn từ mới/ngày riêng; không lẫn vào Ôn tập hằng ngày BA.
- Q: Video/slide/text? → A: Không nhập (không phải dữ liệu ôn tập). Câu tự luận/ghép/sắp xếp (≈100 câu) bỏ qua, ghi số lượng trong báo cáo nhập.
- Q: Câu nghe có audioUrl? → A: Giữ link, phát khi có Internet; không tải file về.

## User Stories
1. **(P1) Nhập dữ liệu**: chọn file → xem tóm tắt (số khóa, bộ flashcard, thẻ, đề, câu, câu bỏ qua) → nhập. Nhập lại file mới hơn không mất tiến độ, không trùng.
2. **(P1) Flashcard N1 với FSRS**: "Ôn flashcard hôm nay" (đến hạn + mới trong hạn mức), hoặc học theo từng bộ; Quên/Khó/Nhớ/Dễ.
3. **(P1) Luyện đề**: làm từng đề (theo ngày/buổi), 4 đáp án, xem giải thích, điểm cuối đề, làm lại câu sai.
4. **(P2) Sổ câu sai**: tất cả câu đang trả lời sai (lần gần nhất) để luyện lại; đúng thì rời sổ.
5. **(P2) Tiến độ**: cây Khóa → Phần → Bài với số thẻ đã học, % đúng từng đề.

## Requirements
- FR-201 Nhập `n1_data.json` (crawler) và `jbv-pack`; validate; idempotent theo khóa ổn định (id gốc); không ghi đè tiến độ.
- FR-202 Sao lưu DB trước khi nhập; nhập trong transaction.
- FR-203 HTML trong câu hỏi/giải thích được làm sạch (whitelist thẻ định dạng, bỏ thuộc tính, bỏ script/style/img/link).
- FR-204 FSRS riêng cho thẻ N1, hạn mức thẻ mới/ngày riêng (mặc định 30).
- FR-205 Luyện đề: hỗ trợ câu đơn 4 đáp án và câu trong bài đọc (hiện đoạn văn); phím 1–4, Enter.
- FR-206 Lưu mọi lượt trả lời; sổ câu sai = câu có lượt gần nhất sai.
- FR-207 Xóa toàn bộ dữ liệu N1 đã nhập (có xác nhận).
- FR-208 Không có dữ liệu khóa học trong repo, test dùng dữ liệu giả lập.

## Success Criteria
- SC-201 Nhập file ~24 MB (~7.000 thẻ, ~9.500 câu) < 30 giây trên laptop văn phòng.
- SC-202 Nhập lại cùng file: 0 bản ghi trùng, tiến độ giữ nguyên (test tự động).
