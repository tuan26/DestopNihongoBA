# Tasks: Japanese BA Vocabulary Assistant (MVP)

**Input**: Design documents from `/specs/001-ba-vocab-assistant/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

## Format: `[ID] [P?] [Story] Description`
- **[P]**: có thể làm song song (file khác nhau, không phụ thuộc)
- **[Story]**: US1 card, US2 học/SRS, US3 thư viện, US4 Excel, US5 AI, DS dataset
- Trạng thái: `[x]` xong, `[ ]` chưa

## Phase 0: Spec & Architecture

- [x] T000 Cài Spec Kit (`specify init --here --integration claude`), skills ở `.claude/skills/speckit-*`
- [x] T001 Constitution `.specify/memory/constitution.md`
- [x] T002 Spec tiếng Việt `spec.md` + checklist `checklists/requirements.md`
- [x] T003 Clarify (8 Q/A trong spec.md › Clarifications)
- [x] T004 Plan, research, data-model, contracts, quickstart
- [x] T005 Tasks (file này) + analyze (`analysis.md`)

## Phase 1: Desktop Foundation (Setup + Foundational)

- [x] T010 Khởi tạo Vite + React + TS strict, ESLint, Vitest, Playwright, scripts npm trong `package.json`
- [x] T011 Khởi tạo `src-tauri` (Tauri 2): `tauri.conf.json` với 2 window `main` + `card`, capabilities tối thiểu
- [x] T012 Rust: tray (Mở app / Ẩn-Hiện card / Quick 5 / Thoát), main ẩn khi đóng, single-instance, plugins autostart/global-shortcut/dialog (SQL qua rusqlite — research R2)
- [x] T013 [P] `src/core/db/types.ts` interface `Database`; `src/core/db/sqljs.ts` adapter; `src/platform/tauriDb.ts` adapter (rusqlite IPC)
- [x] T014 `src/core/db/migrations.ts` + runner có `schema_migrations`, transaction; Rust `backup_database` trước migrate
- [x] T015 [P] `src/core/settings/` repository settings có default + kiểu
- [x] T016 Test: migrations idempotent, rollback khi lỗi (`tests/integration/migrations.test.ts`)

## Phase 2: Vocabulary Core (US3)

- [x] T020 [US3] `src/core/vocabulary/normalize.ts` (NFKC, bỏ khoảng trắng, katakana→hiragana cho search)
- [x] T021 [US3] `src/core/vocabulary/repository.ts`: list/search/filter/paginate, get, create, update (user_modified), hide/unhide, delete (chỉ non-seed), favorite, note
- [x] T022 [US3] `src/core/vocabulary/collections.ts` CRUD collection + items
- [x] T023 [US3] `src/core/seed/importer.ts`: import idempotent, nâng cấp version, tạo review_states, ghi `dataset_versions`
- [x] T024 [US3] Trang Thư viện `src/pages/Library.tsx` + form thêm/sửa + chi tiết + xác nhận ẩn/xóa
- [x] T025 [US3] Tests repository + seed importer (idempotent, không ghi đè user_modified, không mất progress)

## Phase 3: Learning Engine (US2)

- [x] T030 [US2] `src/core/srs/scheduler.ts` bọc ts-fsrs (retention, fuzz) ↔ hàng `review_states`
- [x] T031 [US2] `src/core/srs/reviewService.ts`: rate() ghi review_states + review_logs trong transaction
- [x] T032 [US2] `src/core/study/modes.ts`: 12 chế độ → queue builder; mặt trước/sau theo mode
- [x] T033 [US2] `src/core/stats/stats.ts`: due today, new, weak, streak, 30 ngày, theo category
- [x] T034 [US2] Trang Dashboard, Học (`Study.tsx`, FlashCard component), Thống kê
- [x] T035 [US2] Tests scheduler/review/modes/stats

## Phase 4: Floating Card (US1)

- [x] T040 [US1] `src/card/CardApp.tsx`: 6 chế độ hiển thị, controls, phím tắt cục bộ, drag region, opacity, lock
- [x] T041 [US1] Card deck (smart/favorites/weak/category/collection), Previous history, auto-advance tùy chọn
- [x] T042 [US1] Phát âm (`src/platform/tts.ts`, speechSynthesis ja-JP)
- [x] T043 [US1] Rust commands show/hide/toggle card (no focus), reset position, lưu bounds; global shortcut opt-in
- [x] T044 [US1] Autostart toggle; đồng bộ events giữa main/card
- [x] T045 [US1] Tests: card deck builder, keyboard handler

## Phase 5: Excel (US4)

- [x] T050 [US4] `src/core/excel/export.ts` (vocab + learning status + stats)
- [x] T051 [US4] `src/core/excel/import.ts` parse → preview (new/duplicate/error theo dòng) → apply (skip/update)
- [x] T052 [US4] `src/core/excel/template.ts` + `data/vocabulary/template.xlsx`
- [x] T053 [US4] UI import/export trong Thư viện / Settings (dialog plugin, fs)
- [x] T054 [US4] Tests round-trip export→import, lỗi từng dòng, không mất dữ liệu

## Phase 6: AI Discovery (US5)

- [x] T060 [US5] Rust `ai_generate`, `set_ai_key`, `ai_status` (env → ai-keys.json), Anthropic + OpenAI
- [x] T061 [US5] `src/core/ai/`: prompt builder, parse JSON từ text, validate schema, duplicate check, suggestions repo
- [x] T062 [US5] Trang AI Discovery: chủ đề, số lượng 10/20/50, preview, edit, approve/reject (bulk)
- [x] T063 [US5] Scheduler Daily/Weekly (chỉ tạo suggestions pending)
- [x] T064 [US5] Tests parse/validate/duplicate/approve (AI provider mock)

## Phase 7: Dataset 1.000 từ (DS) — BẮT BUỘC

- [x] T070 [DS] Định dạng batch + `scripts/generate-vocabulary-seed.ts` (batches → JSON/CSV/XLSX)
- [x] T071 [DS] `scripts/validate-vocabulary.ts` (mọi tiêu chí mục 13)
- [x] T072 [DS] Batch BA/Requirement Engineering — 180 từ
- [x] T073 [DS] Batch Japanese Business — 150 từ
- [x] T074 [DS] Batch Project Management — 120 từ
- [x] T075 [DS] Batch Software Engineering — 150 từ
- [x] T076 [DS] Batch Architecture — 100 từ
- [x] T077 [DS] Batch Database — 80 từ
- [x] T078 [DS] Batch Cloud/DevOps — 80 từ
- [x] T079 [DS] Batch Testing/QA — 60 từ
- [x] T080 [DS] Batch Security — 40 từ
- [x] T081 [DS] Batch Advanced General Business — 40 từ
- [x] T082 [DS] Duplicate/quality review, sửa lỗi; chạy validator 0 lỗi
- [x] T083 [DS] `scripts/verify-jmdict.py` đối chiếu JMdict → cập nhật source_type trung thực
- [x] T084 [DS] `docs/vocabulary-seed-report.md`
- [x] T085 [DS] Tích hợp seed vào app (import khi chạy lần đầu) + test 1.000 entries trong DB

## Phase 8: QA & Release

- [x] T090 E2E Playwright: first run seed, học Quick 5, thư viện search/add, export
- [x] T091 `cargo check` / clippy; `npm run build`
- [x] T092 `.github/workflows/ci.yml` (Linux: lint, typecheck, test, validate, cargo check) + `release-windows.yml` (tauri-action)
- [x] T093 Backup/Restore UI trong Settings
- [x] T094 README + `docs/user-guide.md` (cài đặt, sử dụng, AI key, backup)
- [x] T095 Secret scan (không có API key), cập nhật tasks, báo cáo

## Dependencies & Execution Order

- Phase 1 → mọi phase khác. Phase 2 (repository, seed importer) → Phase 3, 4, 5, 6.
- Phase 7 (dataset) độc lập về code; T085 cần T023.
- US1 (card) dùng queue builder của US2 → làm Phase 3 trước Phase 4.

## Implementation Strategy

MVP = Phase 1 + 2 + 3 + 4 + 7 (card học được với 1.000 từ). Sau đó Excel (5), AI (6), QA (8).

## Trạng thái kiểm chứng (2026-11-24)

| Hạng mục | Kết quả |
|---|---|
| `npm run typecheck` / `npm run lint` | ✔ |
| `npm test` (Vitest: 8 file, 22 test — migrations, seed idempotent/upgrade, repository, FSRS & modes, stats, Excel, AI, card deck, dataset thật 1.000 từ) | ✔ |
| `npm run e2e` (Playwright, preview + sql.js: seed lần đầu, Quick 5, lưu sau reload, thư viện search/thêm từ, card reveal/fav/rate/prev, export Excel) | ✔ 3/3 |
| `npm run validate:vocab` | ✔ 1.000 entry, 0 lỗi, 0 cảnh báo |
| `cargo clippy -D warnings` (Linux) và `--target x86_64-pc-windows-gnu` | ✔ |
| Build bộ cài Windows chính thức (MSVC) | Workflow `release-windows.yml` (chưa chạy trong phiên này) |
| Hành vi native chỉ kiểm chứng được trên Windows thật: always-on-top, không lấy focus, tray, autostart, global shortcut, TTS ja-JP | Cần chạy kịch bản thủ công trong `quickstart.md` |
