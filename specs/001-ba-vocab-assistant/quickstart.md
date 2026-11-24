# Quickstart

## Yêu cầu
- Node 22+, Rust stable, (Windows) WebView2 + Visual Studio Build Tools; (Linux dev) webkit2gtk-4.1.

## Lệnh
```bash
npm install
npm run dev            # chạy frontend trên trình duyệt (adapter sql.js, không có tính năng native)
npm run tauri dev      # chạy app desktop
npm test               # unit + integration (Vitest, sql.js)
npm run e2e            # Playwright trên bản preview
npm run typecheck && npm run lint
npm run vocab:generate # batches → seed-v1.json/csv/xlsx + template
npm run validate:vocab # validator dataset
npm run tauri build    # build installer (trên Windows)
```

## Kịch bản kiểm thử thủ công (Windows)
1. Cài bộ cài → mở app → card xuất hiện góc phải dưới, Dashboard hiển thị 1.000 từ mới.
2. Mở Notepad, gõ chữ; bấm vào nút Next trên card bằng chuột → con trỏ gõ trở lại Notepad vẫn hoạt động sau khi click lại Notepad; khi card tự đổi từ (auto-advance) Notepad không mất focus.
3. Kéo card, resize, chỉnh opacity, khóa vị trí → kéo không được.
4. Đóng main window → app còn ở tray; Ctrl+Alt+J (sau khi bật trong Settings) ẩn/hiện card.
5. Học 5 từ, thoát hẳn từ tray, mở lại → Statistics vẫn có 5 lượt ôn.
