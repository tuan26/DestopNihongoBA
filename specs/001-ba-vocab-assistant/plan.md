# Implementation Plan: Japanese BA Vocabulary Assistant (MVP)

**Branch**: `001-ba-vocab-assistant` | **Date**: 2026-11-24 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-ba-vocab-assistant/spec.md`

## Summary

Ứng dụng desktop Windows local-first gồm 2 cửa sổ Tauri: **main window** (Dashboard, Thư viện, Học, AI Discovery,
Thống kê, Cài đặt) và **floating card** (always-on-top, không viền, trong suốt, không lấy focus). Toàn bộ logic domain
viết bằng TypeScript trên một interface `Database` trừu tượng; trong app dùng `tauri-plugin-sql` (SQLite),
trong test và chế độ xem trước trên trình duyệt dùng `sql.js` (SQLite WASM) — cùng một SQL, cùng migrations.
Spaced repetition dùng `ts-fsrs`. Excel dùng `exceljs`. AI provider được gọi từ phía Rust (reqwest) để API key
không bao giờ đi qua WebView. Dataset 1.000 từ được biên soạn theo batch, lưu ở `data/vocabulary/`, sinh JSON/CSV/XLSX
bằng script, kiểm tra bằng validator và đóng gói vào bundle frontend để seed lần chạy đầu.

## Technical Context

**Language/Version**: TypeScript 5.9 (strict), Rust stable (1.97), Node 22 cho tooling

**Primary Dependencies**: Tauri 2.x; plugins: sql (sqlite), global-shortcut, autostart, dialog, fs, single-instance;
React 19 + react-router 7; ts-fsrs 5/6; exceljs 4.4; sql.js 1.x (test/preview); reqwest (Rust, AI)

**Storage**: SQLite file `vocab.db` trong `%APPDATA%/com.nihongoba.vocab/`; backups trong `.../backups/`;
settings card/học/UI trong bảng `settings`; API key trong `ai-keys.json` (app config dir, chỉ Rust đọc)

**Testing**: Vitest (unit + integration với sql.js), Playwright (E2E trên bản preview trình duyệt với sql.js),
`cargo check`/`cargo clippy` cho Rust, validator dataset (`scripts/validate-vocabulary.ts`)

**Target Platform**: Windows 10/11 x64 (WebView2). Phát triển/CI trên Linux; installer build trên GitHub Actions `windows-latest`

**Project Type**: desktop-app (Tauri: frontend web + backend Rust)

**Performance Goals**: first-run seed 1.000 từ < 5 s (batch insert trong transaction); đổi từ trên card < 100 ms; search < 300 ms

**Constraints**: offline cho mọi chức năng học; không lấy focus; RAM nền < 150 MB; installer < 15 MB

**Scale/Scope**: 1 người dùng, ~1.000–20.000 từ, 6 màn hình + 1 card

## Constitution Check

| Nguyên tắc | Đánh giá | Ghi chú |
|---|---|---|
| I. Local-first & Offline | PASS | SQLite local; chỉ AI dùng mạng, opt-in |
| II. Bảo toàn dữ liệu | PASS | migrations có version + transaction; backup file trước migrate (Rust, trước khi mở DB); seed upsert idempotent có cờ `user_modified`; seed chỉ ẩn |
| III. Chất lượng dữ liệu | PASS | validator + báo cáo; source_type trung thực; đối chiếu JMdict nếu tải được |
| IV. Không phiền nhiễu | PASS | card `focus: false`, `focusable` theo trạng thái, `skipTaskbar`; global shortcut opt-in |
| V. Bảo mật | PASS | key ở env/ file config, gọi API từ Rust; capabilities tối thiểu cho từng window |
| VI. Testable | PASS | domain TS thuần + `Database` interface; sql.js trong test |
| VII. Đơn giản | PASS | Tauri thay Electron; thư viện chuẩn; không server |

Re-check sau Phase 1 design: PASS (không có vi phạm cần Complexity Tracking ngoài mục dưới).

## Project Structure

### Documentation (this feature)

```text
specs/001-ba-vocab-assistant/
├── plan.md              # File này
├── research.md          # Quyết định kỹ thuật & lựa chọn thay thế
├── data-model.md        # Schema SQLite + dataset schema
├── quickstart.md        # Cách chạy/kiểm thử
├── contracts/
│   ├── tauri-commands.md      # Lệnh Rust ↔ frontend
│   ├── vocabulary-seed.schema.json
│   └── excel-format.md
├── checklists/requirements.md
├── analysis.md          # Kết quả /speckit-analyze
└── tasks.md
```

### Source Code (repository root)

```text
src/                         # Frontend (React + TS)
├── main.tsx                 # entry; chọn MainApp hoặc CardApp theo window label / ?window=card
├── app/                     # Main window: layout, routes
├── pages/                   # Dashboard, Library, Study, Discovery, Statistics, Settings
├── card/                    # Floating card UI
├── components/              # UI dùng chung (FlashCard, Modal, ...)
├── core/                    # Domain thuần TS (không import Tauri/React)
│   ├── db/                  # Database interface, migrations, sqljs adapter
│   ├── vocabulary/          # repository, normalize, duplicate detection
│   ├── seed/                # seed importer (idempotent, versioned)
│   ├── srs/                 # FSRS scheduler wrapper, review service
│   ├── study/               # learning modes → queue builders
│   ├── stats/               # thống kê, streak
│   ├── excel/               # import/export/template (exceljs)
│   ├── ai/                  # prompt, schema parse/validate, suggestions repo
│   └── settings/
├── platform/                # Adapter Tauri (sql plugin, window, shortcuts, dialog, fs, events) + fallback browser
└── styles/
src-tauri/                   # Rust: windows, tray, backup, AI HTTP, key storage, plugins
data/vocabulary/
├── batches/*.txt            # Nguồn biên soạn theo batch (~50 từ/batch)
├── seed-v1.json             # Nguồn sự thật (sinh từ batches)
├── seed-v1.csv / .xlsx      # Sinh từ JSON
└── template.xlsx            # Template import
scripts/                     # generate-vocabulary-seed.ts, validate-vocabulary.ts, verify-jmdict.py, ...
tests/                       # unit/, integration/, e2e/
docs/                        # vocabulary-seed-report.md, user-guide.md
.github/workflows/           # ci.yml (Linux tests), release-windows.yml (installer)
```

**Structure Decision**: Một project Tauri duy nhất. Domain logic trong `src/core` để test độc lập; `src/platform`
là lớp mỏng nối với Tauri. Rust chỉ đảm nhận những việc bắt buộc native (cửa sổ, tray, backup trước khi mở DB,
HTTP AI có key, autostart/shortcut qua plugin).

## Kiến trúc chính

### Cửa sổ
- `main`: 1100×720, ẩn thay vì đóng (`CloseRequested` → `prevent_close` + `hide`).
- `card`: 340×200, `decorations:false`, `transparent:true`, `alwaysOnTop:true`, `skipTaskbar:true`, `focus:false`,
  `shadow:false`, `resizable:true`. Kéo thả bằng `data-tauri-drag-region` (tắt khi khóa vị trí). Độ trong suốt bằng
  CSS alpha của nền card. Vị trí/kích thước lưu vào settings khi `moved/resized` (debounce).
- Tray: Mở app, Ẩn/Hiện card, Thoát. Single-instance: instance thứ 2 → show main.
- Đồng bộ giữa 2 window: event Tauri `vocab://changed`, `card://settings` — mỗi window đọc DB riêng (SQLite cùng file, WAL).

### Dữ liệu
- Migrations SQL đánh số trong `src/core/db/migrations.ts`, bảng `schema_migrations`, mỗi migration trong transaction.
- Backup: Rust `backup_database(reason)` sao chép `vocab.db` → `backups/vocab-<ts>-<reason>.db` (giữ 10 bản mới nhất);
  frontend gọi trước khi chạy migration pending hoặc nâng cấp dataset.
- Seed: `seed-v1.json` import bằng `INSERT … ON CONFLICT(seed_id) DO UPDATE … WHERE user_modified = 0`;
  bảng `dataset_versions` lưu version đã import; tạo `review_states` cho từ chưa có (state New).

### Học
- `ts-fsrs` với `request_retention` từ settings; `enable_fuzz`. Learning steps của FSRS-6 xử lý từ Again quay lại sau vài phút.
- Queue builder theo mode: lọc theo category/subcategory/tags, ưu tiên due sớm + difficulty cao; Weak = lapses≥2 hoặc
  last rating Again trong 14 ngày.
- Card dùng cùng queue builder ("card deck": due trước, rồi từ mới, rồi ôn ngẫu nhiên từ đã học).

### AI
- Rust command `ai_generate({provider, model, system, prompt})` → trả text; key lấy từ env → `ai-keys.json`.
- TS: build prompt (chủ đề, số lượng, danh sách từ đã có để tránh trùng), parse JSON, validate schema, đánh dấu trùng,
  lưu `ai_suggestions` (pending). Approve → insert vocabulary `source = ai`.
- Scheduler trong main window (chạy nền vì window chỉ ẩn): mỗi 60 phút kiểm tra `ai.schedule` + `ai.lastRunAt`.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| Hai adapter DB (tauri-plugin-sql + sql.js) | Test domain trên Node/CI và preview E2E không cần Windows | Mock DB không kiểm chứng SQL thật; chỉ test trên Tauri thì không chạy được CI Linux nhanh |
| Gọi AI từ Rust thay vì fetch trong WebView | Giữ API key ngoài JS context, tránh CORS | Gọi từ frontend làm lộ key trong devtools/bộ nhớ WebView |
