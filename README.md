# Japanese BA Vocabulary Assistant

Ứng dụng Windows desktop giúp người Việt làm **BA / BrSE / IT** trong dự án Nhật học từ vựng tiếng Nhật trung–cao cấp
bằng một **floating vocabulary card** luôn nổi trên màn hình, kết hợp **spaced repetition (FSRS)** và
**1.000 từ vựng chuyên ngành** có sẵn.

- Tauri 2 (Rust + WebView2) · React 19 · TypeScript · SQLite (rusqlite) · ts-fsrs · exceljs
- Local-first: không cần server, không đăng nhập, học offline. Chỉ AI Discovery (tùy chọn) dùng mạng.
- Giao diện tiếng Việt, dark/light mode, cỡ chữ điều chỉnh được.

| Tổng quan | Học | Floating card |
|---|---|---|
| Dashboard: cần ôn, từ mới, từ hay quên, streak, Quick 5/10 | 12 chế độ học, đánh giá Quên/Khó/Nhớ/Dễ | Luôn nổi, kéo thả, resize, độ trong suốt, khóa vị trí, 6 chế độ hiển thị |

## Tính năng

- **Floating card**: always-on-top, không lấy focus của ứng dụng đang dùng khi tự hiện/đổi từ, kéo thả, resize, opacity 30–100%,
  khóa vị trí, vị trí mặc định 4 góc, 6 chế độ (chỉ JP / JP+cách đọc / hiện nghĩa / kèm ví dụ / compact / mini).
  Phím khi card được chọn: `Space` hiện nghĩa · `→` từ tiếp · `←` từ trước · `Esc` ẩn · `F` yêu thích · `1–4` đánh giá · `P` phát âm.
  Phím tắt toàn cục ẩn/hiện card (mặc định **tắt**, bật trong Cài đặt).
- **Chạy nền & khởi động cùng Windows**: đóng cửa sổ chính → app vẫn ở khay hệ thống; menu khay: Mở app / Ẩn-Hiện card / Quick 5 / Thoát.
- **Học**: Daily Review, Quick 5, Quick 10, Nhật→Việt, Việt→Nhật, Đọc Kanji, Ngữ cảnh (câu ví dụ che từ), BA Meeting,
  Business Japanese, IT nâng cao, Từ hay quên, Thử thách ngẫu nhiên. Lịch ôn **FSRS** (`ts-fsrs`), lưu lịch sử mọi lượt ôn.
- **Thư viện**: tìm theo kanji / kana (không phân biệt hiragana–katakana) / tiếng Việt (không dấu cũng được), lọc theo category,
  độ khó, JLPT, nguồn, yêu thích, từ hay quên, collection; thêm/sửa từ, ghi chú, ẩn từ gốc, xóa từ cá nhân (có xác nhận), collections.
- **Excel**: export (kèm trạng thái học & lịch sử ôn), import có preview, báo lỗi từng dòng, phát hiện trùng, chọn Bỏ qua/Cập nhật,
  template có hướng dẫn. Không bao giờ xóa dữ liệu hiện có.
- **AI Discovery**: Claude hoặc OpenAI, 10/20/50 từ theo chủ đề, phát hiện trùng, preview → sửa → duyệt/từ chối; đề xuất định kỳ
  Daily/Weekly chỉ tạo danh sách chờ duyệt. API key chỉ được tiến trình Rust đọc (biến môi trường hoặc file cấu hình người dùng).
- **An toàn dữ liệu**: migration có version + transaction, **tự sao lưu** trước migration / nâng cấp dataset / import / khôi phục,
  seed import idempotent, sửa từ gốc được giữ khi nâng cấp dataset, sao lưu/khôi phục thủ công trong Cài đặt.

## Dataset 1.000 từ

`data/vocabulary/seed-v1.json` (nguồn chính) + `seed-v1.csv` + `seed-v1.xlsx`, sinh từ 21 batch biên soạn trong
`data/vocabulary/batches/`. Validator: **1.000 entry, 0 lỗi**. 443 entry khớp chính xác headword + cách đọc trong JMdict
(`source_type = researched`), 542 cụm ghép khớp cách đọc theo thành phần, nghĩa/ví dụ do AI biên soạn.
Chi tiết và giới hạn: [docs/vocabulary-seed-report.md](docs/vocabulary-seed-report.md).

| Category | Số từ |
|---|---:|
| BA / Requirement Engineering | 180 |
| Japanese Business / Business Communication | 150 |
| Project Management | 120 |
| Software Engineering | 150 |
| System Architecture / Design | 100 |
| Database / Data Engineering | 80 |
| Cloud / DevOps / Infrastructure | 80 |
| Testing / QA | 60 |
| Security | 40 |
| Advanced General Business Japanese | 40 |

## Cài đặt (người dùng)

1. Tải bộ cài `.exe` (NSIS) hoặc `.msi` từ GitHub Releases / artifact của workflow **Windows installer**.
2. Chạy bộ cài (cài cho tài khoản hiện tại, tự cài WebView2 nếu thiếu).
3. Mở app → lần đầu app tự tạo database và nạp 1.000 từ (vài giây). Xem [docs/user-guide.md](docs/user-guide.md).

## Phát triển

Yêu cầu: Node 22+, Rust stable; Windows cần Visual Studio Build Tools (C++) + WebView2; Linux cần `libwebkit2gtk-4.1-dev`.

```bash
npm install
```

```bash
npm run tauri dev
```

Các lệnh khác:

| Lệnh | Mô tả |
|---|---|
| `npm run dev` | Chạy giao diện trên trình duyệt (SQLite WASM + IndexedDB, không có tính năng native) |
| `npm test` | Unit + integration tests (Vitest, SQLite qua sql.js) |
| `npm run e2e` | E2E Playwright trên bản preview |
| `npm run typecheck` / `npm run lint` | Kiểm tra kiểu / ESLint |
| `npm run vocab:generate` | Batches → `seed-v1.json/csv/xlsx` + `template.xlsx` |
| `npm run validate:vocab` | Validator dataset |
| `npm run vocab:verify` | Đối chiếu JMdict (tải `jamdict-data` từ PyPI vào cache, không commit) |
| `npm run vocab:report` | Sinh `docs/vocabulary-seed-report.md` |
| `npm run tauri build` | Build bộ cài (chạy trên Windows) |

Build Windows chính thức chạy trên GitHub Actions (`.github/workflows/release-windows.yml`, `windows-latest` + `tauri-action`):
chạy thủ công (workflow_dispatch) hoặc push tag `v*`.

## Cấu trúc

```text
src/core/        Domain thuần TypeScript (DB interface, migrations, repository, seed, FSRS, modes, stats, Excel, AI)
src/platform/    Cầu nối Tauri (rusqlite IPC, cửa sổ, tray, dialog, shortcut, TTS) + fallback trình duyệt
src/pages, src/card, src/components   Giao diện React (main window + floating card)
src-tauri/       Rust: SQLite, backup/restore, cửa sổ card không lấy focus, tray, AI HTTP, autostart
data/vocabulary/ Batches, seed JSON/CSV/XLSX, template, id-map, verification
scripts/         generate / validate / verify-jmdict / report
specs/001-ba-vocab-assistant/  Spec Kit: spec, plan, research, data-model, contracts, tasks, analysis
```

## Spec-Driven Development

Dự án dùng [GitHub Spec Kit](https://github.com/github/spec-kit) (`specify init --integration claude`); skills
`/speckit-*` nằm trong `.claude/skills/`. Constitution: `.specify/memory/constitution.md`.

## Giấy phép dữ liệu tham chiếu

Đối chiếu cách đọc sử dụng JMdict © Electronic Dictionary Research and Development Group (CC BY-SA 4.0).
Repository không chứa bản sao JMdict, chỉ lưu kết quả khớp/không khớp trong `data/vocabulary/verification.json`.
