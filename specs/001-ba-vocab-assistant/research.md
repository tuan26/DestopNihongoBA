# Research & Technical Decisions

## R1. Desktop framework: Tauri 2
- **Decision**: Tauri 2 (Rust + WebView2) + React 19 + Vite.
- **Rationale**: installer ~5–10 MB, RAM thấp (dùng WebView2 có sẵn), hỗ trợ multi-window, always-on-top, transparent,
  tray, plugin chính thức cho SQL/autostart/global-shortcut/single-instance.
- **Alternatives**: Electron (bundle >80 MB, RAM cao — trái constitution VII); WPF/.NET (UI hiện đại & test chậm hơn, không tận dụng TS domain);
  Flutter desktop (hệ sinh thái SQLite/Excel kém hơn cho use case này).

## R2. SQLite access
- **Decision (revised during implementation)**: Rust giữ **một** connection `rusqlite` (feature `bundled`, WAL) và expose 3 command
  `db_execute`, `db_select`, `db_batch`; frontend dùng adapter `TauriDatabase`. Test & browser preview dùng `sql.js` qua cùng interface `Database`.
- **Rationale**: Ban đầu chọn `tauri-plugin-sql`, nhưng plugin dùng connection pool (sqlx) → các câu `BEGIN…COMMIT` gửi riêng lẻ có thể
  rơi vào connection khác nhau, transaction không an toàn. Một connection duy nhất + "tx owner" theo label cửa sổ (window khác phải chờ
  đến khi COMMIT/ROLLBACK, timeout 15 s thì rollback) đảm bảo atomic; `db_batch` chạy nhiều câu trong một transaction/IPC
  (seed 1.000 từ ≈ 2.000 câu chỉ 1 round-trip). Đồng thời cho phép backup bằng `VACUUM INTO` trước khi migrate.
- **Alternatives**: tauri-plugin-sql (loại vì lý do trên); viết command Rust riêng cho từng truy vấn (nhiều boilerplate, khó test từ TS).

## R3. Spaced repetition
- **Decision**: `ts-fsrs` (open-spaced-repetition, MIT) — triển khai chính thức FSRS cho TypeScript.
- **Alternatives**: SM-2 tự viết (bị cấm bởi yêu cầu "không tự viết sơ sài"), Anki scheduler (không có lib TS).

## R4. Excel
- **Decision**: `exceljs` 4.4 (MIT) cho cả script Node và app (browser build).
- **Alternatives**: SheetJS bản npm 0.18.5 có CVE và bản mới không phát hành trên npm; `xlsx-populate` ít bảo trì.

## R5. Không lấy focus cho card
- **Decision**: tạo card với `focus: false`, show bằng `window.show()` (không `setFocus`), `skipTaskbar`.
  Trên Windows, Tauri `show()` cho cửa sổ `focus:false` dùng `SW_SHOWNOACTIVATE`. Card chỉ nhận focus khi người dùng click.
- **Rủi ro**: hành vi WebView2 khi click vào card sẽ activate window (mong muốn). Cần test thủ công trên Windows (ghi ở quickstart).

## R6. Phát âm
- **Decision**: Web Speech API (`speechSynthesis`, `lang = ja-JP`) — WebView2 dùng giọng SAPI/OneCore của Windows, offline.
- **Alternatives**: file audio đóng gói (tăng kích thước, cần nguồn có license), TTS cloud (vi phạm offline).

## R7. AI provider
- **Decision**: Rust command gọi HTTP (reqwest + rustls) tới Anthropic Messages API hoặc OpenAI Chat Completions;
  model mặc định cấu hình được (`claude-sonnet-5-5`, `gpt-4.1-mini`). Kết quả là JSON array theo schema, validate ở TS.
- **Key**: env `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` → file `ai-keys.json` trong app config dir (do Settings ghi qua command `set_ai_key`).
  Frontend chỉ biết "đã cấu hình / chưa", không đọc được key.

## R8. Dataset 1.000 từ
- **Decision**: Biên soạn bởi AI (Claude) theo 20 batch × ~50 từ, nguồn ở `data/vocabulary/batches/*.txt` (định dạng
  dòng phân tách bằng `|` để dễ review diff), script `generate-vocabulary-seed.ts` sinh JSON/CSV/XLSX với id ổn định
  (`ba-req-0001`…), `validate-vocabulary.ts` kiểm tra mọi tiêu chí mục 13.
- **Xác minh**: `scripts/verify-jmdict.py` đối chiếu cặp (japanese, reading) với JMdict (EDRDG, qua gói PyPI `jamdict-data`).
  Entry khớp → `source_type = researched`, `source_reference = "JMdict (EDRDG) — headword/reading match"`.
  Entry không khớp (phần lớn là cụm từ/collocation) giữ `AI-generated`. Nghĩa tiếng Việt và ví dụ: AI-generated, ghi rõ trong báo cáo.
- **Alternatives**: gọi AI API trong script — không cần vì Claude Code trực tiếp biên soạn; script vẫn có provider abstraction
  cho AI Discovery trong app.

## R9. E2E
- **Decision**: Playwright chạy trên `vite preview` với adapter sql.js (chế độ browser fallback) — kiểm thử luồng UI
  (seed, học, thư viện, import/export). Hành vi native (always-on-top, focus) kiểm thử thủ công theo checklist trong quickstart.
- **Alternatives**: WebDriver cho Tauri trên Windows (tauri-driver) — chỉ khả dụng trên runner Windows; để ở giai đoạn sau.

## R10. Build & phân phối
- **Decision**: GitHub Actions `windows-latest` + `tauri-apps/tauri-action` sinh NSIS `.exe` và `.msi`; WebView2 bootstrapper nhúng.
