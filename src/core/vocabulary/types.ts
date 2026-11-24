export const CATEGORIES = [
  'BA / Requirement Engineering',
  'Japanese Business / Business Communication',
  'Project Management',
  'Software Engineering',
  'System Architecture / Design',
  'Database / Data Engineering',
  'Cloud / DevOps / Infrastructure',
  'Testing / QA',
  'Security',
  'Advanced General Business Japanese',
] as const;
export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_LABELS_VI: Record<string, string> = {
  'BA / Requirement Engineering': 'BA / Phân tích yêu cầu',
  'Japanese Business / Business Communication': 'Tiếng Nhật thương mại / Giao tiếp',
  'Project Management': 'Quản lý dự án',
  'Software Engineering': 'Kỹ thuật phần mềm',
  'System Architecture / Design': 'Kiến trúc / Thiết kế hệ thống',
  'Database / Data Engineering': 'Cơ sở dữ liệu / Data',
  'Cloud / DevOps / Infrastructure': 'Cloud / DevOps / Hạ tầng',
  'Testing / QA': 'Kiểm thử / QA',
  Security: 'Bảo mật',
  'Advanced General Business Japanese': 'Tiếng Nhật thương mại nâng cao',
};

export const DIFFICULTIES = ['intermediate', 'advanced', 'expert'] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];
export const DIFFICULTY_LABELS_VI: Record<string, string> = {
  intermediate: 'Trung cấp',
  advanced: 'Cao cấp',
  expert: 'Chuyên sâu',
};
export const JLPT_LEVELS = ['N2', 'N1', 'business', 'technical', 'unknown'] as const;
export const REGISTERS = ['formal', 'business', 'technical', 'neutral'] as const;
export type VocabSource = 'seed' | 'user' | 'import' | 'ai';
export const SOURCE_LABELS_VI: Record<VocabSource, string> = {
  seed: 'Dữ liệu gốc',
  user: 'Tự thêm',
  import: 'Import Excel',
  ai: 'AI (đã duyệt)',
};

/** Content fields shared by seed entries, user input, Excel rows and AI suggestions. */
export interface VocabContent {
  japanese: string;
  reading: string;
  vietnamese: string;
  example_ja: string | null;
  example_vi: string | null;
  category: string;
  subcategory: string | null;
  difficulty: string;
  jlpt_level: string;
  part_of_speech: string | null;
  usage_note: string | null;
  register: string | null;
  tags: string[];
}

export interface SeedEntry extends VocabContent {
  id: string;
  example_ja: string;
  example_vi: string;
  source_type: string;
  source_reference: string | null;
  created_at: string;
  dataset_version: string;
}

export interface SeedFile {
  dataset_version: string;
  created_at: string;
  entries: SeedEntry[];
}

export interface Vocabulary extends VocabContent {
  id: number;
  seed_id: string | null;
  source: VocabSource;
  source_type: string | null;
  source_reference: string | null;
  dataset_version: string | null;
  normalized_key: string;
  note: string | null;
  is_favorite: boolean;
  is_hidden: boolean;
  user_modified: boolean;
  created_at: string;
  updated_at: string;
}

export interface ReviewStateRow {
  vocabulary_id: number;
  due: string;
  stability: number;
  difficulty: number;
  elapsed_days: number;
  scheduled_days: number;
  learning_steps: number;
  reps: number;
  lapses: number;
  state: number;
  last_review: string | null;
  last_rating: number | null;
}

export type VocabWithReview = Vocabulary & { review: ReviewStateRow | null };

export const STATE_LABELS_VI = ['Mới', 'Đang học', 'Ôn tập', 'Học lại'];
