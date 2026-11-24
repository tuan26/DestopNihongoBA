<!--
Sync Impact Report
- Version change: (template) → 1.0.0
- Added principles: I–VII (all new)
- Added sections: Ràng buộc kỹ thuật, Quy trình phát triển & Quality Gates, Governance
- Templates: plan-template.md ✅ (Constitution Check dùng các nguyên tắc dưới), spec-template.md ✅, tasks-template.md ✅
- Deferred TODOs: none
-->

# Japanese BA Vocabulary Assistant — Constitution

## Core Principles

### I. Local-first & Offline (NON-NEGOTIABLE)
Mọi chức năng học từ vựng cơ bản (xem thẻ, reveal, đánh giá, lịch ôn, thư viện, thống kê,
import/export Excel) PHẢI hoạt động hoàn toàn offline, không cần server, không cần đăng nhập.
Dữ liệu học tập chỉ được lưu trên máy người dùng (SQLite trong thư mục app data).
Chỉ AI Discovery được phép gọi mạng, và chỉ khi người dùng chủ động cấu hình API key.

### II. Bảo toàn dữ liệu người dùng (NON-NEGOTIABLE)
- Không bao giờ ghi đè learning progress, ghi chú, từ cá nhân hoặc từ seed đã được người dùng chỉnh sửa.
- Mọi migration schema PHẢI được đánh version, chạy trong transaction, và có backup file DB trước khi chạy.
- Seed import PHẢI idempotent (chạy N lần cho kết quả như 1 lần).
- Thao tác xóa/ẩn dữ liệu seed PHẢI có bước xác nhận; dữ liệu seed mặc định chỉ "ẩn", không xóa cứng.
- Import Excel không bao giờ xóa dữ liệu hiện có; chỉ insert hoặc update theo lựa chọn của người dùng.

### III. Chất lượng & trung thực của dữ liệu từ vựng
- Dataset seed PHẢI gồm đúng 1.000 entry unique, đạt validator tự động, không placeholder, không nhân bản.
- Không bịa nguồn. Entry chưa xác minh độc lập PHẢI có `source_type = AI-generated`.
  Chỉ đánh dấu `researched` khi đã đối chiếu được với nguồn thật (ví dụ JMdict) và ghi rõ phạm vi đối chiếu.
- Báo cáo dataset không được tuyên bố độ chính xác 100% khi chưa xác minh.
- JSON là nguồn sự thật duy nhất; CSV/XLSX được sinh tự động từ JSON.

### IV. Không gây phiền nhiễu khi đang làm việc
Floating card là tính năng trung tâm: luôn nằm trên cùng, nhỏ gọn, không cướp focus của ứng dụng
khác khi hiển thị/đổi từ. Không đăng ký global shortcut khi người dùng chưa bật. Phím tắt cục bộ
(Space, ←, →, Esc, F) chỉ hoạt động khi card đang được focus.

### V. Bảo mật & quyền riêng tư
- Không hardcode, không commit API key. API key đọc từ biến môi trường hoặc lưu trong file cấu hình
  riêng ở thư mục app config của người dùng, chỉ được tiến trình Rust đọc; không lưu trong SQLite,
  không xuất ra Excel, không gửi về frontend.
- Từ do AI đề xuất KHÔNG bao giờ được đưa vào learning deck khi chưa được người dùng duyệt.
- Tauri capabilities theo nguyên tắc least-privilege.

### VI. Kiến trúc có thể kiểm thử
- Logic domain (repository, seed, FSRS scheduling, chế độ học, import/export, validation, duplicate
  detection) viết bằng TypeScript thuần, phụ thuộc vào interface `Database` trừu tượng, để chạy unit/integration
  test trên Node (sql.js) mà không cần Tauri.
- Mỗi phase kết thúc khi: typecheck, lint, test đều xanh và tasks.md được cập nhật.

### VII. Đơn giản, nhẹ, dùng thư viện đáng tin cậy
Ưu tiên Tauri 2 (bundle nhỏ, WebView2) thay vì Electron. Dùng thư viện đã kiểm chứng thay vì tự viết:
`ts-fsrs` cho spaced repetition, `exceljs` cho .xlsx, plugin chính thức của Tauri cho SQL, autostart,
global-shortcut, dialog, single-instance. YAGNI: không thêm server, không thêm tài khoản.

## Ràng buộc kỹ thuật

- Nền tảng mục tiêu: Windows 10/11 x64 (WebView2). Linux chỉ dùng để phát triển/CI.
- Stack: Tauri 2, Rust (stable), React 19, TypeScript 5.x (strict), Vite, SQLite (tauri-plugin-sql), ts-fsrs, exceljs.
- Giao diện: tiếng Việt; nội dung học: tiếng Nhật + tiếng Việt. Hỗ trợ dark/light mode, cỡ chữ điều chỉnh được.
- Hiệu năng: khởi động lần đầu (bao gồm import 1.000 từ) < 5 giây trên máy văn phòng phổ thông;
  đổi từ trên card < 100 ms.

## Quy trình phát triển & Quality Gates

1. Spec-Driven: constitution → specify → clarify → plan → tasks → analyze → implement.
2. Mỗi phase: `npm run typecheck`, `npm run lint`, `npm test`, `cargo check` (khi có thay đổi Rust),
   `npm run validate:vocab` (khi dữ liệu thay đổi).
3. Build Windows installer qua GitHub Actions (`windows-latest`, tauri-action) — không cross-compile thủ công.
4. Commit nhỏ, thông điệp rõ ràng; không commit secrets, DB người dùng hoặc file cache.

## Governance

Constitution này có hiệu lực cao hơn mọi quy ước khác trong repository. Sửa đổi cần: cập nhật version
(SemVer: MAJOR khi bỏ/đổi nguyên tắc, MINOR khi thêm, PATCH khi làm rõ), ghi Sync Impact Report ở đầu file,
và rà soát lại plan/tasks bị ảnh hưởng. Mọi review phải kiểm tra tuân thủ các nguyên tắc I–VII;
mọi độ phức tạp vượt nguyên tắc VII phải được giải thích trong mục Complexity Tracking của plan.

**Version**: 1.0.0 | **Ratified**: 2026-11-24 | **Last Amended**: 2026-11-24
