# Hướng dẫn sử dụng

## 1. Lần đầu mở app

- App tạo database tại `%APPDATA%\com.nihongoba.vocab\vocab.db` và nạp 1.000 từ. Mọi từ ở trạng thái **Mới**.
- Card nổi xuất hiện ở góc dưới phải. Cửa sổ chính mở trang **Tổng quan**.
- Mỗi ngày mặc định có **20 từ mới** (đổi trong Cài đặt › Học tập).

## 2. Floating card

| Thao tác | Cách làm |
|---|---|
| Di chuyển | Kéo thanh trên cùng (⋮⋮) |
| Đổi kích thước | Kéo cạnh/góc card |
| Hiện nghĩa | Bấm vào card hoặc nút “Hiện nghĩa”, hoặc `Space` khi card đang được chọn |
| Đánh giá | Quên / Khó / Nhớ / Dễ (hoặc `1`–`4`) — lịch ôn được tính bằng FSRS |
| Từ tiếp / trước | `›` `‹` hoặc `→` `←` |
| Yêu thích | ☆ hoặc `F` |
| Phát âm | 🔊 hoặc `P` (cần giọng đọc tiếng Nhật của Windows) |
| Đổi chế độ, khóa vị trí, độ trong suốt | Nút `⋯` |
| Mở chi tiết từ trong app | `⋯` › Xem chi tiết từ |
| Ẩn card | `✕` hoặc `Esc` |

- Card **không lấy focus** khi tự hiện hoặc tự chuyển từ: bạn vẫn gõ được trong Excel/Teams. Card chỉ nhận bàn phím khi bạn bấm vào nó.
- Chế độ **Mini**: chỉ hiện từ tiếng Nhật; kéo bằng tay nắm ⋮ bên trái; rê chuột để xem cách đọc/nghĩa, bấm để hiện nghĩa, nhấp đúp để về chế độ thường.
- **Bộ từ trên card** (Cài đặt › Floating card): Thông minh (đến hạn → từ mới), Yêu thích, Từ hay quên, theo chủ đề, theo collection.
- **Tự chuyển từ** sau N giây (0 = tắt).
- Phím tắt toàn cục ẩn/hiện card mặc định **tắt**. Bật ở Cài đặt › Phím tắt (mặc định `Ctrl+Alt+J`). Nếu báo lỗi, tổ hợp đó đang bị ứng dụng khác dùng — hãy đổi tổ hợp.

## 3. Chạy nền & khởi động cùng Windows

- Bấm `X` ở cửa sổ chính chỉ **ẩn** cửa sổ; app vẫn chạy ở khay hệ thống (góc phải thanh taskbar).
- Menu khay: Mở ứng dụng · Ẩn/Hiện card · Quick 5 · **Thoát** (tắt hẳn).
- Cài đặt › “Khởi động cùng Windows”: app tự chạy khi đăng nhập, chỉ hiện card (cửa sổ chính ẩn).

## 4. Học

Vào **Học** để chọn 1 trong 12 chế độ. Trong phiên: `Space` hiện đáp án, `1`–`4` đánh giá, `Enter` = Nhớ, `F` yêu thích.
Từ đánh giá **Quên** (hoặc từ mới đang ở bước học) sẽ quay lại ngay trong phiên. Tiến độ được lưu sau mỗi lần đánh giá.

## 5. Trò chơi & Quiz

Menu **Trò chơi & Quiz** (hoặc ô 🎮 trên Tổng quan). Chọn nguồn từ (Từ đã học / Tất cả / Hay quên / Yêu thích / theo chủ đề) rồi chọn trò:

| Trò | Cách chơi | Phím |
|---|---|---|
| Trắc nghiệm | 10 câu, 4 đáp án; hướng Nhật→Việt, Việt→Nhật hoặc Kanji→Cách đọc | `1`–`4`, `Enter` sang câu |
| Ghép cặp | Ghép 6 từ tiếng Nhật với nghĩa; nhanh và ít lỗi = điểm cao | chuột |
| Đúng hay Sai 60s | Nghĩa hiển thị có đúng không? Trả lời liên tiếp đúng để nhân điểm | `←` Sai · `→` Đúng |
| Gõ cách đọc | Nhìn kanji, gõ cách đọc bằng bộ gõ tiếng Nhật (hiragana hoặc katakana đều được) | `Enter` |
| Điền từ vào câu | Câu ví dụ bị che một từ, chọn từ đúng | `1`–`4` |

Kết quả quiz **không tự thay đổi lịch ôn**. Cuối ván có danh sách từ trả lời sai và nút **Đưa từ sai vào ôn lại**
(đánh dấu "Quên" để các từ đó quay lại sớm trong Ôn tập hằng ngày). Điểm cao nhất và các ván gần đây được lưu trên máy.

## 6. Ôn N1 (dữ liệu của riêng bạn)

Menu **Ôn N1** dùng để ôn bộ flashcard và đề trắc nghiệm N1 mà bạn có (ví dụ file `n1_data.json` do crawler của bạn tạo, hoặc file định dạng `jbv-pack`).

1. Bấm **Nhập dữ liệu N1** → chọn file → xem tóm tắt (số bộ flashcard, số đề, số câu, mục bị bỏ qua như video/slide/tự luận) → **Nhập**.
   Dữ liệu chỉ lưu trong database trên máy bạn; database được sao lưu trước khi nhập. Nhập lại file mới hơn sẽ cập nhật nội dung, không trùng, không mất tiến độ.
2. **Ôn flashcard hôm nay**: thẻ đến hạn + thẻ mới (mặc định 30 thẻ mới/ngày, chỉnh ở cuối trang Ôn N1). Lịch FSRS riêng, không lẫn với 1.000 từ BA.
3. **Làm đề**: chọn đề trong cây Khóa → Phần → Bài. Câu đọc hiểu có đoạn văn (ẩn/hiện được). Chọn đáp án bằng chuột hoặc `1`–`4`, xem giải thích, `Enter` sang câu tiếp. Cuối đề có điểm và nút làm lại các câu sai.
4. **Sổ câu sai**: mọi câu mà lần trả lời gần nhất bị sai. Trả lời đúng thì câu rời khỏi sổ.
5. **Luyện ngẫu nhiên 20 câu** trộn từ tất cả các đề. Câu nghe có link audio chỉ phát được khi có Internet.
6. **Xóa dữ liệu N1** xóa toàn bộ dữ liệu và tiến độ N1 (1.000 từ BA không bị ảnh hưởng).

Lưu ý: tài liệu khóa học có bản quyền của đơn vị cung cấp; chỉ dùng cho việc học cá nhân và không chia sẻ file dữ liệu.

## 6b. Thư viện

- Tìm kiếm: gõ kanji, kana (hiragana hay katakana đều được) hoặc tiếng Việt (có dấu hay không dấu).
- Bấm một dòng để xem chi tiết: phát âm, ghi chú cá nhân, collection, yêu thích, sửa, học lại từ đầu, ẩn.
- **Từ gốc** (dataset) chỉ có thể **Ẩn** (bỏ ẩn bằng bộ lọc “Đã ẩn”). Từ bạn tự thêm/import/AI có thể **Xóa** (có xác nhận).
- Sửa từ gốc: bản sửa của bạn được giữ nguyên khi app cập nhật dataset.

## 7. Excel

- **Export Excel**: toàn bộ từ (kể cả đã ẩn) + trạng thái học + sheet lịch sử ôn.
- **Template Excel**: file mẫu có sheet “Hướng dẫn” mô tả cột.
- **Import Excel**: chọn file → màn hình xem trước cho biết dòng Mới / Trùng / Lỗi (kèm số dòng và lý do) → chọn khi trùng:
  *Bỏ qua* hoặc *Cập nhật nội dung (giữ tiến độ học)* → Import. Database được sao lưu tự động trước khi import.

## 8. AI Discovery (tùy chọn, cần Internet)

1. Cài đặt › AI Discovery: chọn provider (Anthropic Claude / OpenAI), model, dán API key › Lưu.
   Hoặc đặt biến môi trường `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` rồi mở lại app.
2. Trang AI Discovery: chọn chủ đề, (tùy chọn) chủ đề cụ thể, số lượng 10/20/50 › Tạo đề xuất.
3. Xem danh sách: mục “Trùng thư viện” không thể duyệt; sửa nếu cần; Duyệt/Từ chối từng mục hoặc hàng loạt.
4. Đề xuất định kỳ (Hằng ngày/Hằng tuần) chỉ tạo danh sách **chờ duyệt**; không từ nào vào bộ học khi chưa được duyệt.

**Bảo mật key**: key lưu ở `%APPDATA%\com.nihongoba.vocab\ai-keys.json` (thư mục tài khoản Windows của bạn), chỉ tiến trình
native của app đọc; không nằm trong database, không xuất ra Excel, không gửi đi đâu ngoài API của provider bạn chọn.
Chi phí gọi API do tài khoản provider của bạn chịu.

## 9. Sao lưu & khôi phục

- Tự động: trước mỗi lần nâng cấp schema, nâng cấp dataset, import Excel, khôi phục. Giữ 10 bản gần nhất trong `...\backups\`.
- Thủ công: Cài đặt › Dữ liệu & sao lưu › **Sao lưu ngay**; chọn một bản › **Khôi phục** (app sao lưu dữ liệu hiện tại trước, rồi khởi động lại).

## 10. Câu hỏi thường gặp

- **Không nghe phát âm?** Windows Settings › Time & language › Speech › Add voices › 日本語.
- **Card nằm ngoài màn hình sau khi rút màn hình phụ?** Khởi động lại app (card tự về góc mặc định) hoặc Cài đặt › “Đưa card về vị trí này”.
- **Gỡ cài đặt có mất dữ liệu không?** Dữ liệu nằm trong `%APPDATA%\com.nihongoba.vocab\`; hãy Export Excel hoặc sao chép thư mục này trước khi gỡ.
