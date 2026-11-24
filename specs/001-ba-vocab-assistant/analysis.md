# Specification Analysis Report (`/speckit-analyze`)

Phân tích chéo spec.md ↔ plan.md ↔ tasks.md ↔ constitution (2026-11-24).

| ID | Category | Severity | Location | Summary | Recommendation / Resolution |
|---|---|---|---|---|---|
| A1 | Coverage | MEDIUM | FR-062 | Backup/Restore thủ công chưa có task riêng ở bản tasks đầu | Đã thêm T093 |
| A2 | Ambiguity | LOW | FR-015 "không lấy focus" | Hành vi focus phụ thuộc WebView2, không test tự động được | Ghi rõ ở research R5 + quickstart bước 2 (test thủ công) |
| A3 | Constitution | LOW | Nguyên tắc V | Key lưu file cấu hình dạng plaintext trong thư mục user | Chấp nhận cho MVP (thư mục profile user, ngoài repo, không qua WebView); ghi ở user-guide; hướng nâng cấp: Windows Credential Manager |
| A4 | Coverage | LOW | SC-008 | Kích thước bộ cài/RAM chỉ đo được trên Windows | Đo trên artifact CI Windows; không chặn MVP |
| A5 | Consistency | LOW | data-model vs contracts | Excel `favorite` cột ↔ `is_favorite` | Mapping ghi trong excel-format.md |
| A6 | Underspec | MEDIUM | FR-023 "từ yếu" | Spec chưa định nghĩa | data-model §3 định nghĩa Weak word (lapses ≥ 2, Again 14 ngày, difficulty ≥ 7) |

## Coverage Summary

| Requirement | Tasks |
|---|---|
| FR-001–005 | T010–T016, T023, T085 |
| FR-010–016 | T040–T045, T012 |
| FR-020–023 | T030–T035 |
| FR-030–033 | T020–T025 |
| FR-040–042 | T050–T054 |
| FR-050–054 | T060–T064 |
| FR-060–062 | T024, T034, T053, T062, T093 |
| SC-004 (dataset) | T070–T085 |

**Metrics**: 30 FR, 30/30 có task (100%); 0 CRITICAL; 0 HIGH; 2 MEDIUM (đã xử lý); 4 LOW.
Kết luận: đủ điều kiện chuyển sang `/speckit-implement`.
