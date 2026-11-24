# Feature Specification: Japanese BA Vocabulary Assistant (MVP)

**Feature Branch**: `001-ba-vocab-assistant`

**Created**: 2026-11-24

**Status**: Clarified (sẵn sàng cho plan)

**Input**: User description: "Ứng dụng Windows Desktop giúp người Việt làm BA/BrSE/IT học từ vựng tiếng Nhật trung cấp–cao cấp qua floating vocabulary card luôn hiển thị, có spaced repetition, 1.000 từ seed do AI biên soạn, AI discovery, import/export Excel, chạy local-first."

## Clarifications

### Session 2026-11-24

Các câu hỏi dưới đây được rút ra trong bước `/speckit-clarify`. Vì phiên làm việc chạy tự động,
mỗi câu được trả lời bằng phương án khuyến nghị (phù hợp nhất với yêu cầu gốc và constitution);
người dùng có thể thay đổi sau.

- Q: API key cho AI Discovery được lưu ở đâu? → A: Ưu tiên biến môi trường (`ANTHROPIC_API_KEY`,
  `OPENAI_API_KEY`); nếu không có, người dùng nhập trong Settings và key được lưu vào file cấu hình riêng
  trong thư mục app config của Windows user, chỉ tiến trình native đọc. Không lưu trong DB, không xuất Excel.
- Q: Phát âm (Play pronunciation) dùng gì khi offline? → A: Dùng giọng đọc tiếng Nhật có sẵn của hệ điều hành
  (Text-to-Speech). Nếu máy không có giọng ja-JP, nút phát âm hiển thị thông báo hướng dẫn cài giọng đọc.
- Q: "Không chiếm focus" nghĩa cụ thể là gì? → A: Khi card tự hiện (khởi động, shortcut toàn cục, chuyển từ tự động)
  card KHÔNG được kích hoạt (activate) cửa sổ; ứng dụng đang dùng vẫn giữ bàn phím. Card chỉ nhận focus khi
  người dùng click trực tiếp vào card.
- Q: Từ seed bị người dùng "xóa" thì xử lý thế nào? → A: Từ seed chỉ có thể "ẩn" (có xác nhận); có thể bỏ ẩn.
  Chỉ từ cá nhân (user-created / AI-approved / imported) mới xóa cứng được, cũng cần xác nhận.
- Q: Khi nâng cấp dataset (seed v2), entry seed mà người dùng đã sửa thì sao? → A: Giữ nguyên bản người dùng
  (đánh dấu `user_modified`), chỉ cập nhật entry seed chưa bị sửa; entry mới được thêm; tiến độ học không đổi.
- Q: Thuật toán spaced repetition? → A: FSRS (thư viện đã được kiểm chứng), 4 mức Again/Hard/Good/Easy,
  retention mục tiêu mặc định 0.9, có thể chỉnh trong Settings.
- Q: Giới hạn từ mới mỗi ngày? → A: Mặc định 20 từ mới/ngày, chỉnh được (0–200).
- Q: Discovery định kỳ chạy khi nào? → A: Khi app đang chạy (kể cả chạy nền), kiểm tra mỗi giờ; nếu đến hạn
  (Daily/Weekly) và có API key thì tạo danh sách đề xuất ở trạng thái "chờ duyệt". Manual là mặc định.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Học từ qua floating card trong lúc làm việc (Priority: P1)

Người dùng (BA/BrSE) mở máy, app khởi động cùng Windows và chạy nền. Một card nhỏ nổi trên mọi cửa sổ
hiển thị một từ, ví dụ 「認識合わせ」. Khi rảnh vài giây, họ click vào card, nhấn Space để xem nghĩa và ví dụ,
rồi đánh giá Again/Hard/Good/Easy. Card chuyển sang từ tiếp theo theo lịch ôn.

**Why this priority**: Đây là giá trị cốt lõi và khác biệt của sản phẩm — học "thụ động" mà không rời công việc.

**Independent Test**: Cài app trên Windows, khởi động lần đầu, quan sát card hiển thị trên Excel/Teams,
kéo thả, đổi kích thước, reveal, đánh giá; tắt/mở lại app và thấy tiến độ còn nguyên.

**Acceptance Scenarios**:

1. **Given** app vừa cài lần đầu, **When** người dùng mở app, **Then** DB được khởi tạo với đúng 1.000 từ seed và card hiển thị một từ chưa học.
2. **Given** card đang hiển thị ở chế độ "Nhật + cách đọc", **When** người dùng nhấn Space (card đang focus), **Then** nghĩa tiếng Việt, câu ví dụ và bản dịch hiện ra.
3. **Given** nghĩa đã được reveal, **When** người dùng chọn Good, **Then** lịch ôn tiếp theo được tính và lưu, card chuyển sang từ kế tiếp.
4. **Given** card đang hiển thị, **When** người dùng làm việc trong ứng dụng khác, **Then** card vẫn nằm trên cùng và ứng dụng kia không mất focus khi card đổi từ.
5. **Given** card đã bị khóa vị trí, **When** người dùng kéo card, **Then** card không di chuyển.
6. **Given** người dùng đóng main window, **When** nhấn nút X, **Then** app vẫn chạy nền (icon ở system tray) và card vẫn hoạt động.

---

### User Story 2 - Phiên học có cấu trúc và spaced repetition (Priority: P1)

Người dùng mở main window, xem Dashboard (số từ đến hạn, từ mới, từ yếu, streak), chọn Daily Review,
Quick 5/10 hoặc một chế độ chuyên đề (BA Meeting, Business Japanese, IT Advanced, Kanji Reading,
Context Learning, Vietnamese → Japanese, Weak Words, Random Challenge).

**Why this priority**: Spaced repetition quyết định hiệu quả ghi nhớ; dashboard là điểm vào chính.

**Independent Test**: Học 10 từ ở Quick 10, đánh giá, kiểm tra Statistics và lịch ôn; khởi động lại app và xác nhận dữ liệu còn.

**Acceptance Scenarios**:

1. **Given** có từ đến hạn, **When** chọn Daily Review, **Then** chỉ các từ đến hạn (và từ mới trong hạn mức ngày) được đưa vào phiên, từ quá hạn lâu/khó được ưu tiên.
2. **Given** người dùng đánh giá Again cho một từ, **When** phiên tiếp diễn, **Then** từ đó quay lại trong cùng phiên hoặc trong vòng vài phút.
3. **Given** chế độ Context Learning, **When** hiển thị thẻ, **Then** câu ví dụ tiếng Nhật hiển thị với từ mục tiêu bị che.
4. **Given** chế độ Vietnamese → Japanese, **When** hiển thị thẻ, **Then** mặt trước là nghĩa tiếng Việt, mặt sau là từ tiếng Nhật + cách đọc.
5. **Given** đã học nhiều ngày liên tiếp, **When** mở Dashboard, **Then** streak hiển thị đúng số ngày.

---

### User Story 3 - Quản lý thư viện từ vựng (Priority: P2)

Người dùng tìm kiếm (Nhật, cách đọc, Việt), lọc theo category/difficulty/JLPT/favorite/weak, thêm từ cá nhân,
sửa từ, ghi chú, ẩn từ seed, xóa từ cá nhân, tạo collection riêng (ví dụ "Họp sprint review").

**Why this priority**: Cho phép cá nhân hóa; cần thiết nhưng không chặn giá trị chính.

**Independent Test**: Thêm một từ mới, tìm thấy nó bằng cách đọc kana, đưa vào collection, học nó trên card.

**Acceptance Scenarios**:

1. **Given** thư viện có 1.000 từ, **When** gõ "にんしき", **Then** các từ có cách đọc chứa chuỗi đó xuất hiện trong < 300 ms.
2. **Given** một từ seed, **When** người dùng bấm Ẩn, **Then** hệ thống hỏi xác nhận; sau khi xác nhận từ không còn xuất hiện trong phiên học nhưng vẫn khôi phục được.
3. **Given** người dùng thêm từ trùng với từ đã có, **When** lưu, **Then** hệ thống cảnh báo trùng và cho phép hủy.

---

### User Story 4 - Import / Export Excel (Priority: P2)

Người dùng xuất toàn bộ từ vựng kèm trạng thái học ra .xlsx, tải template, bổ sung từ trong Excel và import lại
với màn hình preview, báo lỗi từng dòng, chọn Skip/Update cho dòng trùng.

**Independent Test**: Export → sửa 1 dòng, thêm 2 dòng, thêm 1 dòng thiếu reading → Import → preview hiển thị 1 update, 2 new, 1 lỗi → xác nhận → dữ liệu cũ không mất.

**Acceptance Scenarios**:

1. **Given** file .xlsx hợp lệ, **When** chọn import, **Then** màn hình preview hiển thị số dòng mới / trùng / lỗi trước khi ghi.
2. **Given** dòng thiếu trường bắt buộc, **When** preview, **Then** dòng đó được đánh dấu lỗi kèm số dòng và tên cột.
3. **Given** dòng trùng, **When** người dùng chọn Skip, **Then** bản ghi hiện có không thay đổi.

---

### User Story 5 - AI Vocabulary Discovery (Priority: P3)

Người dùng chọn chủ đề (BA, Requirement, Meeting, Email, Negotiation, Cloud, Security…), số lượng (10/20/50),
có thể nhập chủ đề cụ thể ("thương lượng phạm vi change request"), AI trả về từ theo schema chuẩn.
Người dùng xem preview, sửa, approve hoặc reject. Có thể đặt lịch Daily/Weekly để tạo danh sách đề xuất.

**Independent Test**: Cấu hình API key, yêu cầu 10 từ về "Negotiation", thấy các từ trùng được đánh dấu,
approve 3 từ, các từ đó xuất hiện trong thư viện với nguồn "AI-approved".

**Acceptance Scenarios**:

1. **Given** chưa có API key, **When** mở AI Discovery, **Then** hiển thị hướng dẫn cấu hình, không crash.
2. **Given** AI trả về từ đã có trong DB, **When** preview, **Then** từ đó được đánh dấu "Trùng" và mặc định không được chọn.
3. **Given** từ đề xuất chưa duyệt, **When** chạy phiên học, **Then** từ đó không xuất hiện.

---

### Edge Cases

- DB bị hỏng hoặc migration lỗi → rollback transaction, giữ file backup, hiển thị thông báo có đường dẫn backup.
- Seed import bị ngắt giữa chừng (tắt máy) → lần khởi động sau import lại idempotent, không trùng.
- Màn hình thay đổi (rút màn hình phụ) → card có vị trí ngoài vùng hiển thị được đưa về vị trí mặc định.
- Không có từ đến hạn → Daily Review hiển thị "Đã hoàn thành hôm nay" và gợi ý Quick 5 / từ mới.
- Tất cả từ bị ẩn / filter rỗng → card hiển thị trạng thái rỗng thân thiện.
- File Excel sai định dạng / quá lớn (> 20.000 dòng) → báo lỗi rõ ràng, không ghi gì.
- AI trả về JSON sai schema / timeout / hết quota → hiển thị lỗi, không lưu gì, cho thử lại.
- Global shortcut đã bị ứng dụng khác chiếm → báo người dùng chọn tổ hợp khác.
- Hai instance app chạy cùng lúc → instance thứ hai chỉ focus instance đầu.

## Requirements *(mandatory)*

### Functional Requirements

**Nền tảng & dữ liệu**
- **FR-001**: Hệ thống PHẢI chạy như ứng dụng desktop Windows, không yêu cầu đăng nhập hay server cho chức năng học.
- **FR-002**: Hệ thống PHẢI lưu toàn bộ dữ liệu học tập cục bộ và hoạt động offline với từ vựng đã có.
- **FR-003**: Lần chạy đầu, hệ thống PHẢI tạo DB, chạy migrations, import 1.000 từ seed, ghi dataset version và tạo trạng thái học "mới" cho mọi từ.
- **FR-004**: Seed import PHẢI idempotent; nâng cấp dataset KHÔNG được ghi đè entry người dùng đã sửa, KHÔNG xóa tiến độ.
- **FR-005**: Hệ thống PHẢI tạo bản backup DB trước mỗi lần chạy migration schema và trước khi nâng cấp dataset.

**Floating card**
- **FR-010**: Card PHẢI luôn nằm trên cùng, kéo thả được, đổi kích thước được, chỉnh độ trong suốt (30–100%), khóa vị trí, và nhớ vị trí/kích thước.
- **FR-011**: Card PHẢI hỗ trợ 6 chế độ hiển thị: chỉ tiếng Nhật; Nhật + cách đọc; reveal nghĩa; kèm ví dụ; compact; mini.
- **FR-012**: Card PHẢI có thao tác: Next, Previous, Reveal, Phát âm, Again/Hard/Good/Easy, Favorite, Mở chi tiết (main window), Ẩn card.
- **FR-013**: Khi card đang focus: Space = Reveal, → = Next, ← = Previous, Esc = Ẩn, F = Favorite.
- **FR-014**: Global shortcut ẩn/hiện card CHỈ được đăng ký khi người dùng bật trong Settings; tổ hợp phím tùy chỉnh được.
- **FR-015**: Card không được lấy focus từ ứng dụng khác khi tự hiện hoặc đổi từ; có thể đặt vị trí mặc định (4 góc màn hình).
- **FR-016**: App PHẢI hỗ trợ khởi động cùng Windows (bật/tắt trong Settings) và chạy nền khi đóng main window (system tray: Mở app, Ẩn/Hiện card, Thoát).

**Học tập**
- **FR-020**: Hệ thống PHẢI cung cấp các chế độ: Daily Review, Quick 5, Quick 10, JA→VI, VI→JA, Kanji Reading, Context Learning, BA Meeting, Business Japanese, IT Advanced, Weak Words, Random Challenge.
- **FR-021**: Hệ thống PHẢI lập lịch ôn bằng FSRS với 4 mức đánh giá; từ quên quay lại sớm; từ đã thuộc giãn khoảng cách.
- **FR-022**: Hệ thống PHẢI lưu lịch sử mọi lần đánh giá (thời điểm, mức, trạng thái trước/sau, chế độ).
- **FR-023**: Hệ thống PHẢI tính: số từ đến hạn hôm nay, từ mới, từ yếu (lapses ≥ 2 hoặc Again gần đây), streak, tổng đã học, phân bố theo category, lịch sử 30 ngày.

**Thư viện**
- **FR-030**: Người dùng PHẢI tìm kiếm theo tiếng Nhật, cách đọc, tiếng Việt và lọc theo category, difficulty, JLPT, favorite, weak, nguồn, collection.
- **FR-031**: Người dùng PHẢI thêm, sửa từ; xóa từ cá nhân; ẩn/bỏ ẩn từ seed (có xác nhận); ghi chú; đánh dấu favorite.
- **FR-032**: Người dùng PHẢI tạo/sửa/xóa collection tùy chỉnh và thêm/bớt từ trong collection.
- **FR-033**: Hệ thống PHẢI phát hiện trùng (sau chuẩn hóa NFKC, bỏ khoảng trắng) khi thêm/import/AI.

**Excel**
- **FR-040**: Export .xlsx gồm: từ, cách đọc, nghĩa, ví dụ JA/VI, category, difficulty, tags, ghi chú, trạng thái học, thống kê ôn.
- **FR-041**: Import .xlsx có preview, validate schema, phát hiện trùng, chọn Skip/Update, báo lỗi từng dòng, không mất dữ liệu.
- **FR-042**: Cung cấp file template Excel có hướng dẫn cột.

**AI Discovery**
- **FR-050**: Người dùng PHẢI yêu cầu AI tạo 10/20/50 từ theo chủ đề định sẵn hoặc chủ đề tự nhập.
- **FR-051**: Kết quả PHẢI theo schema chuẩn, được kiểm tra trùng với DB, hiển thị preview cho approve/reject/edit.
- **FR-052**: Từ AI chỉ vào thư viện khi được approve; lưu ngày tạo, provider/model và `source_type = AI-generated`.
- **FR-053**: Discovery định kỳ (Daily/Weekly/Manual) chỉ tạo danh sách đề xuất chờ duyệt.
- **FR-054**: Hỗ trợ ít nhất 2 provider (Anthropic Claude, OpenAI) qua lớp trừu tượng; không hardcode key.

**UI**
- **FR-060**: Main window có 6 màn hình: Dashboard, Thư viện, Học, AI Discovery, Thống kê, Cài đặt; giao diện tiếng Việt.
- **FR-061**: Hỗ trợ dark/light/theo hệ thống, cỡ chữ điều chỉnh, font tiếng Nhật dễ đọc.
- **FR-062**: Cài đặt có Backup/Restore DB thủ công.

### Key Entities

- **Vocabulary**: một từ/cụm từ; thuộc tính nội dung (japanese, reading, vietnamese, ví dụ song ngữ, category, subcategory, difficulty, jlpt_level, part_of_speech, usage_note, register, tags), nguồn (seed / user / import / ai), seed_id, trạng thái ẩn, favorite, note, cờ user_modified.
- **ReviewState (Card)**: trạng thái FSRS của một từ (due, stability, difficulty, reps, lapses, state, last_review).
- **ReviewLog**: một lần đánh giá (vocabulary, rating, thời điểm, chế độ, trạng thái trước/sau).
- **Collection** & **CollectionItem**: nhóm từ tùy chỉnh.
- **AiSuggestion**: từ AI đề xuất, trạng thái pending/approved/rejected, batch, provider, thời điểm.
- **Setting**: cặp key/value cấu hình (card, học, AI, giao diện).
- **DatasetVersion**: lịch sử import seed (version, số entry, thời điểm).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Lần chạy đầu sẵn sàng học (đã có 1.000 từ) trong < 5 giây trên laptop văn phòng.
- **SC-002**: Người dùng reveal và đánh giá một từ trên card trong ≤ 3 thao tác, < 5 giây.
- **SC-003**: 100% tiến độ học được giữ nguyên sau khi khởi động lại hoặc cập nhật app (kiểm chứng bằng test tự động).
- **SC-004**: Dataset seed: đúng 1.000 entry unique, 0 lỗi validator, 0 placeholder, phân bổ category đúng bảng yêu cầu.
- **SC-005**: Tìm kiếm trên 1.000+ từ trả kết quả < 300 ms.
- **SC-006**: Import Excel 1.000 dòng: preview < 3 giây, 0 bản ghi hiện có bị mất.
- **SC-007**: 0 API key trong source code / repository (kiểm chứng bằng secret scan).
- **SC-008**: Bộ cài Windows < 15 MB; RAM khi chạy nền < 150 MB.

## Assumptions

- Người dùng có trình độ N2–N1; không cần furigana từng chữ trên card, cách đọc toàn cụm là đủ.
- Máy Windows 10/11 có WebView2 (mặc định trên Win 11; bộ cài tự cài nếu thiếu).
- Phát âm dùng TTS của hệ điều hành; chất lượng phụ thuộc giọng ja-JP đã cài.
- AI Discovery cần Internet và API key do người dùng tự cung cấp; chi phí API do người dùng chịu.
- Dataset seed do AI biên soạn; chính tả/cách đọc được đối chiếu tự động với từ điển mở JMdict khi có thể,
  nghĩa tiếng Việt và câu ví dụ là AI-generated, chưa được chuyên gia con người duyệt toàn bộ.
- Đồng bộ đa thiết bị, tài khoản, mobile: ngoài phạm vi MVP.
