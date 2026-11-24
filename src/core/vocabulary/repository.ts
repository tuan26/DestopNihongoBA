import type { Database, SqlValue } from '../db/types';
import { nowIso } from '../db/types';
import { createNewReviewState } from '../srs/scheduler';
import { foldVietnamese, normalizeKey, normalizeSearch } from './normalize';
import type { ReviewStateRow, VocabContent, VocabSource, Vocabulary, VocabWithReview } from './types';

type Row = Record<string, unknown>;

export const WEAK_SQL = `(r.lapses >= 2 OR (r.last_rating = 1 AND r.last_review >= ?) OR (r.difficulty >= 7 AND r.state != 0))`;
export const weakSinceIso = (now = new Date()) => new Date(now.getTime() - 14 * 86400000).toISOString();

export function mapVocab(row: Row): Vocabulary {
  let tags: string[] = [];
  try {
    tags = JSON.parse(String(row.tags ?? '[]'));
  } catch {
    tags = [];
  }
  return {
    id: Number(row.id),
    seed_id: (row.seed_id as string) ?? null,
    japanese: String(row.japanese),
    reading: String(row.reading),
    vietnamese: String(row.vietnamese),
    example_ja: (row.example_ja as string) ?? null,
    example_vi: (row.example_vi as string) ?? null,
    category: String(row.category),
    subcategory: (row.subcategory as string) ?? null,
    difficulty: String(row.difficulty),
    jlpt_level: String(row.jlpt_level),
    part_of_speech: (row.part_of_speech as string) ?? null,
    usage_note: (row.usage_note as string) ?? null,
    register: (row.register as string) ?? null,
    tags,
    source: row.source as VocabSource,
    source_type: (row.source_type as string) ?? null,
    source_reference: (row.source_reference as string) ?? null,
    dataset_version: (row.dataset_version as string) ?? null,
    normalized_key: String(row.normalized_key),
    note: (row.note as string) ?? null,
    is_favorite: Number(row.is_favorite) === 1,
    is_hidden: Number(row.is_hidden) === 1,
    user_modified: Number(row.user_modified) === 1,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

export function mapReview(row: Row, prefix = 'r_'): ReviewStateRow | null {
  if (row[`${prefix}vocabulary_id`] == null) return null;
  const g = (k: string) => row[`${prefix}${k}`];
  return {
    vocabulary_id: Number(g('vocabulary_id')),
    due: String(g('due')),
    stability: Number(g('stability')),
    difficulty: Number(g('difficulty')),
    elapsed_days: Number(g('elapsed_days')),
    scheduled_days: Number(g('scheduled_days')),
    learning_steps: Number(g('learning_steps')),
    reps: Number(g('reps')),
    lapses: Number(g('lapses')),
    state: Number(g('state')),
    last_review: (g('last_review') as string) ?? null,
    last_rating: g('last_rating') == null ? null : Number(g('last_rating')),
  };
}

export const SELECT_WITH_REVIEW = `
SELECT v.*,
  r.vocabulary_id AS r_vocabulary_id, r.due AS r_due, r.stability AS r_stability, r.difficulty AS r_difficulty,
  r.elapsed_days AS r_elapsed_days, r.scheduled_days AS r_scheduled_days, r.learning_steps AS r_learning_steps,
  r.reps AS r_reps, r.lapses AS r_lapses, r.state AS r_state, r.last_review AS r_last_review, r.last_rating AS r_last_rating
FROM vocabulary v LEFT JOIN review_states r ON r.vocabulary_id = v.id`;

export const mapWithReview = (row: Row): VocabWithReview => ({ ...mapVocab(row), review: mapReview(row) });

export interface VocabFilter {
  text?: string;
  category?: string;
  difficulty?: string;
  jlpt?: string;
  source?: VocabSource;
  favorite?: boolean;
  weak?: boolean;
  hidden?: 'exclude' | 'only' | 'include';
  collectionId?: number;
  state?: number;
}

/** Text match on japanese, reading (kana-insensitive), vietnamese (accent-insensitive), tags. */
export function matchesText(v: Vocabulary, text: string): boolean {
  const q = normalizeSearch(text);
  if (!q) return true;
  const qFold = foldVietnamese(text.trim());
  return (
    normalizeSearch(v.japanese).includes(q) ||
    normalizeSearch(v.reading).replace(/\s/g, '').includes(q.replace(/\s/g, '')) ||
    foldVietnamese(v.vietnamese).includes(qFold) ||
    v.tags.some((t) => t.toLowerCase().includes(q)) ||
    (v.note ? foldVietnamese(v.note).includes(qFold) : false)
  );
}

export async function listVocabulary(db: Database, f: VocabFilter = {}): Promise<VocabWithReview[]> {
  const where: string[] = [];
  const params: SqlValue[] = [];
  const hidden = f.hidden ?? 'exclude';
  if (hidden === 'exclude') where.push('v.is_hidden = 0');
  if (hidden === 'only') where.push('v.is_hidden = 1');
  if (f.category) {
    where.push('v.category = ?');
    params.push(f.category);
  }
  if (f.difficulty) {
    where.push('v.difficulty = ?');
    params.push(f.difficulty);
  }
  if (f.jlpt) {
    where.push('v.jlpt_level = ?');
    params.push(f.jlpt);
  }
  if (f.source) {
    where.push('v.source = ?');
    params.push(f.source);
  }
  if (f.favorite) where.push('v.is_favorite = 1');
  if (f.state != null) {
    where.push('r.state = ?');
    params.push(f.state);
  }
  if (f.weak) {
    where.push(WEAK_SQL);
    params.push(weakSinceIso());
  }
  if (f.collectionId != null) {
    where.push('v.id IN (SELECT vocabulary_id FROM collection_items WHERE collection_id = ?)');
    params.push(f.collectionId);
  }
  const sql = `${SELECT_WITH_REVIEW} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY v.id`;
  const rows = (await db.select<Row>(sql, params)).map(mapWithReview);
  return f.text ? rows.filter((v) => matchesText(v, f.text!)) : rows;
}

export async function getVocabulary(db: Database, id: number): Promise<VocabWithReview | null> {
  const rows = await db.select<Row>(`${SELECT_WITH_REVIEW} WHERE v.id = ?`, [id]);
  return rows[0] ? mapWithReview(rows[0]) : null;
}

export async function findDuplicates(db: Database, japanese: string, excludeId?: number): Promise<Vocabulary[]> {
  const key = normalizeKey(japanese);
  const rows = await db.select<Row>('SELECT * FROM vocabulary WHERE normalized_key = ? AND id != ?', [
    key,
    excludeId ?? -1,
  ]);
  return rows.map(mapVocab);
}

export interface ContentValidationError {
  field: keyof VocabContent;
  message: string;
}

export function validateContent(c: Partial<VocabContent>): ContentValidationError[] {
  const errs: ContentValidationError[] = [];
  if (!c.japanese?.trim()) errs.push({ field: 'japanese', message: 'Thiếu từ tiếng Nhật' });
  if (!c.reading?.trim()) errs.push({ field: 'reading', message: 'Thiếu cách đọc' });
  else if (!/^[぀-ゟ゠-ヿ・ー\s\u3000A-Za-z0-9]+$/.test(c.reading.trim()))
    errs.push({ field: 'reading', message: 'Cách đọc chỉ được chứa kana' });
  if (!c.vietnamese?.trim()) errs.push({ field: 'vietnamese', message: 'Thiếu nghĩa tiếng Việt' });
  if (!c.category?.trim()) errs.push({ field: 'category', message: 'Thiếu category' });
  return errs;
}

const CONTENT_COLS = [
  'japanese',
  'reading',
  'vietnamese',
  'example_ja',
  'example_vi',
  'category',
  'subcategory',
  'difficulty',
  'jlpt_level',
  'part_of_speech',
  'usage_note',
  'register',
] as const;

const clean = (v: string | null | undefined): string | null => {
  const t = v?.trim();
  return t ? t : null;
};

export function contentParams(c: VocabContent): SqlValue[] {
  return [
    c.japanese.trim(),
    c.reading.trim(),
    c.vietnamese.trim(),
    clean(c.example_ja),
    clean(c.example_vi),
    c.category.trim(),
    clean(c.subcategory),
    c.difficulty || 'intermediate',
    c.jlpt_level || 'unknown',
    clean(c.part_of_speech),
    clean(c.usage_note),
    clean(c.register),
  ];
}

export interface CreateOptions {
  source: VocabSource;
  source_type?: string | null;
  source_reference?: string | null;
  note?: string | null;
  is_favorite?: boolean;
  seed_id?: string | null;
  dataset_version?: string | null;
  now?: Date;
}

export async function createVocabulary(db: Database, c: VocabContent, o: CreateOptions): Promise<number> {
  const errs = validateContent(c);
  if (errs.length) throw new Error(errs.map((e) => e.message).join('; '));
  const now = nowIso(o.now);
  return db.transaction(async (tx) => {
    const res = await tx.execute(
      `INSERT INTO vocabulary (${CONTENT_COLS.join(', ')}, tags, source, source_type, source_reference, dataset_version,
        seed_id, normalized_key, note, is_favorite, created_at, updated_at)
       VALUES (${CONTENT_COLS.map(() => '?').join(', ')}, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        ...contentParams(c),
        JSON.stringify(c.tags ?? []),
        o.source,
        o.source_type ?? (o.source === 'user' ? 'user' : null),
        o.source_reference ?? null,
        o.dataset_version ?? null,
        o.seed_id ?? null,
        normalizeKey(c.japanese),
        clean(o.note),
        o.is_favorite ? 1 : 0,
        now,
        now,
      ],
    );
    const id = res.lastInsertId!;
    await insertNewReviewState(tx, id, o.now);
    return id;
  });
}

export async function insertNewReviewState(db: Database, vocabularyId: number, now = new Date()): Promise<void> {
  const s = createNewReviewState(vocabularyId, now);
  await db.execute(
    `INSERT OR IGNORE INTO review_states (vocabulary_id, due, stability, difficulty, elapsed_days, scheduled_days,
      learning_steps, reps, lapses, state, last_review, last_rating) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      s.vocabulary_id,
      s.due,
      s.stability,
      s.difficulty,
      s.elapsed_days,
      s.scheduled_days,
      s.learning_steps,
      s.reps,
      s.lapses,
      s.state,
      s.last_review,
      s.last_rating,
    ],
  );
}

/** Update content. Editing a seed word marks it `user_modified` so dataset upgrades never overwrite it. */
export async function updateVocabulary(db: Database, id: number, c: VocabContent, now = new Date()): Promise<void> {
  const errs = validateContent(c);
  if (errs.length) throw new Error(errs.map((e) => e.message).join('; '));
  await db.execute(
    `UPDATE vocabulary SET ${CONTENT_COLS.map((k) => `${k} = ?`).join(', ')}, tags = ?, normalized_key = ?,
      user_modified = CASE WHEN source = 'seed' THEN 1 ELSE user_modified END, updated_at = ? WHERE id = ?`,
    [...contentParams(c), JSON.stringify(c.tags ?? []), normalizeKey(c.japanese), nowIso(now), id],
  );
}

export async function setFavorite(db: Database, id: number, fav: boolean): Promise<void> {
  await db.execute('UPDATE vocabulary SET is_favorite = ?, updated_at = ? WHERE id = ?', [fav ? 1 : 0, nowIso(), id]);
}

export async function setNote(db: Database, id: number, note: string | null): Promise<void> {
  await db.execute('UPDATE vocabulary SET note = ?, updated_at = ? WHERE id = ?', [clean(note), nowIso(), id]);
}

export async function setHidden(db: Database, id: number, hidden: boolean): Promise<void> {
  await db.execute('UPDATE vocabulary SET is_hidden = ?, updated_at = ? WHERE id = ?', [hidden ? 1 : 0, nowIso(), id]);
}

/** Hard delete — only allowed for personal (non-seed) words. Seed words must be hidden instead. */
export async function deleteVocabulary(db: Database, id: number): Promise<void> {
  const rows = await db.select<{ source: string }>('SELECT source FROM vocabulary WHERE id = ?', [id]);
  if (!rows[0]) return;
  if (rows[0].source === 'seed') throw new Error('Không thể xóa từ thuộc dữ liệu gốc. Hãy dùng chức năng Ẩn.');
  await db.transaction(async (tx) => {
    await tx.execute('DELETE FROM collection_items WHERE vocabulary_id = ?', [id]);
    await tx.execute('DELETE FROM review_logs WHERE vocabulary_id = ?', [id]);
    await tx.execute('DELETE FROM review_states WHERE vocabulary_id = ?', [id]);
    await tx.execute('DELETE FROM vocabulary WHERE id = ?', [id]);
  });
}

export async function countVocabulary(db: Database): Promise<number> {
  const r = await db.select<{ n: number }>('SELECT COUNT(*) AS n FROM vocabulary');
  return Number(r[0]?.n ?? 0);
}

export async function listCategories(db: Database): Promise<{ category: string; n: number }[]> {
  return db.select('SELECT category, COUNT(*) AS n FROM vocabulary WHERE is_hidden = 0 GROUP BY category ORDER BY n DESC');
}

export const emptyContent = (): VocabContent => ({
  japanese: '',
  reading: '',
  vietnamese: '',
  example_ja: '',
  example_vi: '',
  category: 'BA / Requirement Engineering',
  subcategory: '',
  difficulty: 'intermediate',
  jlpt_level: 'business',
  part_of_speech: '',
  usage_note: '',
  register: 'business',
  tags: [],
});

export const contentOf = (v: VocabContent): VocabContent => ({
  japanese: v.japanese,
  reading: v.reading,
  vietnamese: v.vietnamese,
  example_ja: v.example_ja,
  example_vi: v.example_vi,
  category: v.category,
  subcategory: v.subcategory,
  difficulty: v.difficulty,
  jlpt_level: v.jlpt_level,
  part_of_speech: v.part_of_speech,
  usage_note: v.usage_note,
  register: v.register,
  tags: [...(v.tags ?? [])],
});
