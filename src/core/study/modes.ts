import type { Database, SqlValue } from '../db/types';
import { SELECT_WITH_REVIEW, WEAK_SQL, mapWithReview, weakSinceIso } from '../vocabulary/repository';
import { hasKanji } from '../vocabulary/normalize';
import type { VocabWithReview } from '../vocabulary/types';

export type StudyModeId =
  | 'daily'
  | 'quick5'
  | 'quick10'
  | 'ja_vi'
  | 'vi_ja'
  | 'kanji'
  | 'context'
  | 'ba_meeting'
  | 'business'
  | 'it_advanced'
  | 'weak'
  | 'random';

/** What is shown on the front of the card. */
export type FrontKind = 'ja' | 'vi' | 'kanji' | 'context';

export interface StudyModeDef {
  id: StudyModeId;
  label: string;
  description: string;
  front: FrontKind;
  limit: number;
  icon: string;
}

export const STUDY_MODES: StudyModeDef[] = [
  { id: 'daily', label: 'Ôn tập hằng ngày', description: 'Các từ đến hạn theo lịch FSRS + từ mới trong hạn mức ngày', front: 'ja', limit: 200, icon: '📅' },
  { id: 'quick5', label: 'Quick 5', description: 'Học nhanh 5 từ trong 1–2 phút', front: 'ja', limit: 5, icon: '⚡' },
  { id: 'quick10', label: 'Quick 10', description: 'Học nhanh 10 từ', front: 'ja', limit: 10, icon: '⚡' },
  { id: 'ja_vi', label: 'Nhật → Việt', description: 'Nhìn từ tiếng Nhật, nhớ nghĩa', front: 'ja', limit: 20, icon: '🇯🇵' },
  { id: 'vi_ja', label: 'Việt → Nhật', description: 'Nhìn nghĩa tiếng Việt, nhớ từ tiếng Nhật', front: 'vi', limit: 20, icon: '🇻🇳' },
  { id: 'kanji', label: 'Đọc Kanji', description: 'Luyện cách đọc các từ có kanji', front: 'kanji', limit: 20, icon: '漢' },
  { id: 'context', label: 'Học theo ngữ cảnh', description: 'Câu ví dụ có từ bị ẩn — đoán từ còn thiếu', front: 'context', limit: 15, icon: '📝' },
  { id: 'ba_meeting', label: 'BA Meeting', description: 'Từ dùng trong họp, làm rõ và thảo luận yêu cầu', front: 'ja', limit: 20, icon: '🗣️' },
  { id: 'business', label: 'Business Japanese', description: 'Email, thương lượng, báo cáo, trao đổi với khách hàng', front: 'ja', limit: 20, icon: '💼' },
  { id: 'it_advanced', label: 'IT nâng cao', description: 'Thuật ngữ kỹ thuật chuyên sâu (kiến trúc, DB, cloud, bảo mật…)', front: 'ja', limit: 20, icon: '🖥️' },
  { id: 'weak', label: 'Từ hay quên', description: 'Tập trung vào các từ bạn thường quên', front: 'ja', limit: 20, icon: '🎯' },
  { id: 'random', label: 'Thử thách ngẫu nhiên', description: 'Kiểm tra ngẫu nhiên 20 từ bất kỳ', front: 'ja', limit: 20, icon: '🎲' },
];

export const getMode = (id: string): StudyModeDef => STUDY_MODES.find((m) => m.id === id) ?? STUDY_MODES[0];

const IT_CATS = [
  'Software Engineering',
  'System Architecture / Design',
  'Database / Data Engineering',
  'Cloud / DevOps / Infrastructure',
  'Testing / QA',
  'Security',
];

/** SQL filter fragment per mode (applied on top of `is_hidden = 0`). */
function modeFilter(id: StudyModeId): { where: string; params: SqlValue[] } {
  switch (id) {
    case 'ba_meeting':
      return {
        where: `(v.category = 'BA / Requirement Engineering' OR v.tags LIKE '%"meeting"%' OR v.subcategory LIKE '%Meeting%' OR v.subcategory LIKE '%会議%')`,
        params: [],
      };
    case 'business':
      return {
        where: `(v.category IN ('Japanese Business / Business Communication','Advanced General Business Japanese') OR v.tags LIKE '%"email"%' OR v.tags LIKE '%"negotiation"%')`,
        params: [],
      };
    case 'it_advanced':
      return {
        where: `(v.category IN (${IT_CATS.map(() => '?').join(',')}) AND v.difficulty IN ('advanced','expert'))`,
        params: IT_CATS,
      };
    case 'weak':
      return { where: WEAK_SQL, params: [weakSinceIso()] };
    case 'context':
      return { where: `(v.example_ja IS NOT NULL AND v.example_ja != '')`, params: [] };
    default:
      return { where: '1 = 1', params: [] };
  }
}

export interface QueueOptions {
  now?: Date;
  newPerDay?: number;
  limit?: number;
  /** Extra deck restriction used by the floating card. */
  deck?: string;
  excludeIds?: number[];
  random?: () => number;
}

export async function newLearnedToday(db: Database, now = new Date()): Promise<number> {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const r = await db.select<{ n: number }>(
    `SELECT COUNT(DISTINCT vocabulary_id) AS n FROM review_logs WHERE state_before = 0 AND reviewed_at >= ?`,
    [start.toISOString()],
  );
  return Number(r[0]?.n ?? 0);
}

function shuffle<T>(arr: T[], rnd: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function deckFilter(deck: string | undefined): { where: string; params: SqlValue[] } {
  if (!deck || deck === 'smart') return { where: '1 = 1', params: [] };
  if (deck === 'favorites') return { where: 'v.is_favorite = 1', params: [] };
  if (deck === 'weak') return { where: WEAK_SQL, params: [weakSinceIso()] };
  if (deck.startsWith('category:')) return { where: 'v.category = ?', params: [deck.slice(9)] };
  if (deck.startsWith('collection:'))
    return {
      where: 'v.id IN (SELECT vocabulary_id FROM collection_items WHERE collection_id = ?)',
      params: [Number(deck.slice(11))],
    };
  return { where: '1 = 1', params: [] };
}

/**
 * Build a study queue.
 * Priority: overdue/due reviews (oldest due & hardest first) → new words (bounded by daily limit, except
 * quick/themed modes which may borrow new words) → already-learned words with lowest stability.
 */
export async function buildQueue(db: Database, modeId: StudyModeId, o: QueueOptions = {}): Promise<VocabWithReview[]> {
  const now = o.now ?? new Date();
  const mode = getMode(modeId);
  const limit = o.limit ?? mode.limit;
  const rnd = o.random ?? Math.random;
  const mf = modeFilter(modeId);
  const df = deckFilter(o.deck);
  const exclude = o.excludeIds?.length ? `AND v.id NOT IN (${o.excludeIds.map(() => '?').join(',')})` : '';
  const rows = (
    await db.select<Record<string, unknown>>(
      `${SELECT_WITH_REVIEW} WHERE v.is_hidden = 0 AND ${mf.where} AND ${df.where} ${exclude}`,
      [...mf.params, ...df.params, ...(o.excludeIds ?? [])],
    )
  ).map(mapWithReview);

  let candidates = rows;
  if (modeId === 'kanji') candidates = candidates.filter((v) => hasKanji(v.japanese));
  if (modeId === 'context') candidates = candidates.filter((v) => maskTarget(v.example_ja ?? '', v.japanese).masked);

  if (modeId === 'random') return shuffle(candidates, rnd).slice(0, limit);

  const nowMs = now.getTime();
  const due = candidates
    .filter((v) => v.review && v.review.state !== 0 && new Date(v.review.due).getTime() <= nowMs)
    .sort(
      (a, b) =>
        new Date(a.review!.due).getTime() - new Date(b.review!.due).getTime() || b.review!.difficulty - a.review!.difficulty,
    );
  const fresh = shuffle(
    candidates.filter((v) => !v.review || v.review.state === 0),
    rnd,
  );
  // Keep the seed order roughly by difficulty so beginners-in-the-domain see intermediate words first.
  const diffRank: Record<string, number> = { intermediate: 0, advanced: 1, expert: 2 };
  fresh.sort((a, b) => (diffRank[a.difficulty] ?? 1) - (diffRank[b.difficulty] ?? 1));

  const queue: VocabWithReview[] = [...due];
  if (modeId === 'daily') {
    const remainingNew = Math.max(0, (o.newPerDay ?? 20) - (await newLearnedToday(db, now)));
    queue.push(...fresh.slice(0, remainingNew));
    return queue.slice(0, limit);
  }
  if (modeId === 'weak') {
    const learned = candidates
      .filter((v) => v.review && v.review.state !== 0 && !due.includes(v))
      .sort((a, b) => b.review!.lapses - a.review!.lapses || a.review!.stability - b.review!.stability);
    return [...due, ...learned].slice(0, limit);
  }
  queue.push(...fresh.slice(0, Math.max(0, limit - queue.length)));
  if (queue.length < limit) {
    const learned = candidates
      .filter((v) => v.review && v.review.state !== 0 && !due.includes(v))
      .sort((a, b) => a.review!.stability - b.review!.stability);
    queue.push(...learned.slice(0, limit - queue.length));
  }
  return queue.slice(0, limit);
}

/**
 * Hide the target expression in an example sentence. Handles conjugated verbs/adjectives by
 * progressively trimming trailing kana from the dictionary form (落とし込む → 落とし込).
 */
export function maskTarget(sentence: string, word: string, blank = '＿＿＿'): { text: string; masked: boolean } {
  if (!sentence || !word) return { text: sentence, masked: false };
  const candidates: string[] = [word];
  // strip common suffixes like する / な / に used in dictionary forms
  const base = word.replace(/(する|な|に|だ)$/, '');
  if (base !== word && base.length >= 2) candidates.push(base);
  let stem = word;
  while (/[぀-ゟ]$/.test(stem) && stem.length > 2) {
    stem = stem.slice(0, -1);
    candidates.push(stem);
  }
  for (const c of candidates) {
    const idx = sentence.indexOf(c);
    if (idx >= 0 && c.length >= Math.min(2, word.length)) {
      return { text: sentence.slice(0, idx) + blank + sentence.slice(idx + c.length), masked: true };
    }
  }
  return { text: sentence, masked: false };
}
