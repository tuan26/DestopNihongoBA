# Contract: Tauri commands & events (Rust ↔ Frontend)

| Command | Input | Output | Ghi chú |
|---|---|---|---|
| `backup_database` | `{ reason: string }` | `string` (đường dẫn file backup) hoặc `null` nếu DB chưa tồn tại | Giữ 10 bản mới nhất |
| `list_backups` | – | `{ path, size, modified }[]` | |
| `restore_backup` | `{ path: string }` | `()` | Chỉ nhận file trong thư mục backups; app tự khởi động lại |
| `show_card` / `hide_card` / `toggle_card` | – | `bool` (visible) | Không gọi `set_focus` |
| `show_main` | `{ route?: string }` | `()` | Emit `main://navigate` |
| `set_card_locked` | `{ locked: bool }` | `()` | |
| `reset_card_position` | `{ corner: string }` | `()` | Đặt theo work area của màn hình hiện tại |
| `ai_status` | – | `{ anthropic: bool, openai: bool }` | Chỉ cho biết có key hay không |
| `set_ai_key` | `{ provider, key: string \| null }` | `()` | `null` = xóa |
| `ai_generate` | `{ provider, model, system, prompt, maxTokens }` | `string` (text model trả về) | Timeout 120 s |
| `db_path` | – | `string` | Hiển thị trong Settings |

Events (emit toàn app):
- `vocab://changed` `{ reason }` — dữ liệu từ vựng/review thay đổi → card và main reload.
- `card://settings` — settings card thay đổi.
- `main://navigate` `{ route }` — card yêu cầu mở chi tiết.
- `card://visibility` `{ visible }`.

Global shortcut (plugin, đăng ký từ frontend chỉ khi `shortcut.enabled = true`): `shortcut.toggleCard` → `toggle_card`.
