# Contract: Excel format (.xlsx)

Sheet `Vocabulary` (bắt buộc), hàng 1 là header (không phân biệt hoa thường, cho phép tên tiếng Việt trong ngoặc):

| Cột | Bắt buộc | Ghi chú |
|---|---|---|
| japanese | ✔ | |
| reading | ✔ | kana |
| vietnamese | ✔ | |
| example_ja | | |
| example_vi | | |
| category | ✔ | một trong 10 category, hoặc tên tùy ý (sẽ được giữ nguyên) |
| subcategory | | |
| difficulty | | intermediate/advanced/expert (mặc định intermediate) |
| jlpt_level | | N2/N1/business/technical/unknown |
| part_of_speech | | |
| register | | |
| tags | | phân tách bằng dấu phẩy |
| usage_note | | |
| note | | ghi chú cá nhân |
| favorite | | TRUE/FALSE |

Export thêm các cột chỉ-đọc: `id`, `source`, `status` (Mới/Đang học/Ôn tập/Học lại), `reps`, `lapses`, `due`, `last_review`, `stability`.
Import bỏ qua các cột chỉ-đọc. Phát hiện trùng bằng `normalized_key` (NFKC, bỏ khoảng trắng của `japanese`).
Lựa chọn khi trùng: `skip` (mặc định) | `update` (cập nhật nội dung, giữ tiến độ học; với từ seed đặt `user_modified = 1`).
Giới hạn: 20.000 dòng/file.
Sheet `Hướng dẫn` trong template mô tả các cột và giá trị hợp lệ.
