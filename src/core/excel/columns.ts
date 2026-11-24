export interface ColumnDef {
  key: string;
  header: string;
  required?: boolean;
  width: number;
  readOnly?: boolean;
  help: string;
}

/** Editable columns (import + export). */
export const EDITABLE_COLUMNS: ColumnDef[] = [
  { key: 'japanese', header: 'japanese', required: true, width: 22, help: 'Từ / cụm từ tiếng Nhật (bắt buộc)' },
  { key: 'reading', header: 'reading', required: true, width: 24, help: 'Cách đọc bằng kana (bắt buộc)' },
  { key: 'vietnamese', header: 'vietnamese', required: true, width: 40, help: 'Nghĩa tiếng Việt (bắt buộc)' },
  { key: 'example_ja', header: 'example_ja', width: 48, help: 'Câu ví dụ tiếng Nhật' },
  { key: 'example_vi', header: 'example_vi', width: 48, help: 'Dịch câu ví dụ' },
  { key: 'category', header: 'category', required: true, width: 28, help: 'Category (xem danh sách bên dưới)' },
  { key: 'subcategory', header: 'subcategory', width: 20, help: 'Category phụ' },
  { key: 'difficulty', header: 'difficulty', width: 13, help: 'intermediate | advanced | expert' },
  { key: 'jlpt_level', header: 'jlpt_level', width: 11, help: 'N2 | N1 | business | technical | unknown' },
  { key: 'part_of_speech', header: 'part_of_speech', width: 14, help: 'Từ loại (noun, verb, phrase…)' },
  { key: 'register', header: 'register', width: 11, help: 'formal | business | technical | neutral' },
  { key: 'tags', header: 'tags', width: 24, help: 'Tag, phân tách bằng dấu phẩy' },
  { key: 'usage_note', header: 'usage_note', width: 36, help: 'Ghi chú cách dùng' },
  { key: 'note', header: 'note', width: 30, help: 'Ghi chú cá nhân' },
  { key: 'favorite', header: 'favorite', width: 9, help: 'TRUE / FALSE' },
];

/** Read-only columns appended on export (ignored on import). */
export const READONLY_COLUMNS: ColumnDef[] = [
  { key: 'id', header: 'id', width: 8, readOnly: true, help: 'ID trong app' },
  { key: 'seed_id', header: 'seed_id', width: 16, readOnly: true, help: 'ID dữ liệu gốc' },
  { key: 'source', header: 'source', width: 10, readOnly: true, help: 'seed | user | import | ai' },
  { key: 'status', header: 'status', width: 11, readOnly: true, help: 'Trạng thái học' },
  { key: 'reps', header: 'reps', width: 7, readOnly: true, help: 'Số lần ôn' },
  { key: 'lapses', header: 'lapses', width: 8, readOnly: true, help: 'Số lần quên' },
  { key: 'stability', header: 'stability', width: 10, readOnly: true, help: 'Độ ổn định (ngày)' },
  { key: 'due', header: 'due', width: 20, readOnly: true, help: 'Ngày ôn tiếp theo' },
  { key: 'last_review', header: 'last_review', width: 20, readOnly: true, help: 'Lần ôn gần nhất' },
];

export const MAX_IMPORT_ROWS = 20000;
