import type { Database } from '../db/types';
import { listVocabulary, type VocabFilter } from '../vocabulary/repository';
import { normalizeKey, kataToHira, hasKanji, isKana } from '../vocabulary/normalize';
import { listN1Cards } from '../n1/cards';
import { n1CardToWord } from '../n1/adapter';
import { maskTarget } from '../study/modes';
import type { VocabWithReview } from '../vocabulary/types';

export type QuizGame = 'choice' | 'match' | 'truefalse' | 'typing' | 'cloze';
export type ChoiceDirection = 'ja_vi' | 'vi_ja' | 'reading';
export type QuizSource = 'learned' | 'all' | 'weak' | 'favorites' | `category:${string}` | 'n1' | `n1course:${string}`;

export const QUIZ_GAMES: { id: QuizGame; label: string; icon: string; description: string }[] = [
  { id: 'choice', label: 'Trắc nghiệm', icon: '🅰️', description: '10 câu, chọn 1 trong 4 đáp án — Nhật→Việt, Việt→Nhật hoặc cách đọc' },
  { id: 'match', label: 'Ghép cặp', icon: '🧩', description: 'Ghép 6 từ tiếng Nhật với nghĩa tiếng Việt nhanh nhất có thể' },
  { id: 'truefalse', label: 'Đúng hay Sai 60s', icon: '⏱️', description: 'Nghĩa này đúng không? Trả lời thật nhanh trong 60 giây' },
  { id: 'typing', label: 'Gõ cách đọc', icon: '⌨️', description: 'Nhìn kanji, gõ cách đọc bằng kana (bật bộ gõ tiếng Nhật)' },
  { id: 'cloze', label: 'Điền từ vào câu', icon: '📝', description: 'Câu ví dụ bị che một từ — chọn từ đúng' },
];

export const DIRECTION_LABELS: Record<ChoiceDirection, string> = {
  ja_vi: 'Nhật → Việt',
  vi_ja: 'Việt → Nhật',
  reading: 'Kanji → Cách đọc',
};

export type Rng = () => number;

export function shuffle<T>(arr: T[], rnd: Rng = Math.random): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Words available for a quiz source. "learned" falls back to all words when fewer than `min` were studied. */
export async function loadPool(db: Database, source: QuizSource, min = 12): Promise<{ words: VocabWithReview[]; fellBack: boolean }> {
  if (source === 'n1' || source.startsWith('n1course:')) {
    // N1 flashcards imported by the user (Ôn N1). A course with too few cards falls back to all N1 cards.
    const course = source === 'n1' ? null : source.slice(9);
    let cards = await listN1Cards(db, { course, limit: 3000 });
    let fellBack = false;
    if (course != null && cards.length < min) {
      cards = await listN1Cards(db, { limit: 3000 });
      fellBack = true;
    }
    return { words: cards.map(n1CardToWord).filter((w) => w.vietnamese), fellBack };
  }
  const all = await listVocabulary(db);
  let filter: VocabFilter | null = null;
  if (source === 'weak') filter = { weak: true };
  else if (source === 'favorites') filter = { favorite: true };
  else if (source.startsWith('category:')) filter = { category: source.slice(9) };
  let words: VocabWithReview[];
  if (source === 'learned') words = all.filter((w) => w.review && w.review.state !== 0);
  else if (filter) words = await listVocabulary(db, filter);
  else words = all;
  if (words.length >= min) return { words, fellBack: false };
  const have = new Set(words.map((w) => w.id));
  return { words: [...words, ...shuffle(all.filter((w) => !have.has(w.id))).slice(0, min * 3)], fellBack: true };
}

const readingKey = (s: string) => kataToHira(s.normalize('NFKC')).replace(/[\s\u3000・]/g, '');
const meaningKey = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();

/** Pick `n` distractors for `target` — same category first, never sharing headword, reading or meaning. */
export function pickDistractors(target: VocabWithReview, pool: VocabWithReview[], n: number, rnd: Rng = Math.random): VocabWithReview[] {
  const usedJa = new Set([normalizeKey(target.japanese)]);
  const usedRd = new Set([readingKey(target.reading)]);
  const usedVi = new Set([meaningKey(target.vietnamese)]);
  const out: VocabWithReview[] = [];
  const consider = (cands: VocabWithReview[]) => {
    for (const c of shuffle(cands, rnd)) {
      if (out.length >= n) return;
      const ja = normalizeKey(c.japanese);
      const rd = readingKey(c.reading);
      const vi = meaningKey(c.vietnamese);
      if (usedJa.has(ja) || usedRd.has(rd) || usedVi.has(vi)) continue;
      usedJa.add(ja);
      usedRd.add(rd);
      usedVi.add(vi);
      out.push(c);
    }
  };
  consider(pool.filter((w) => w.id !== target.id && w.category === target.category));
  consider(pool.filter((w) => w.id !== target.id && w.category !== target.category));
  return out;
}

export interface ChoiceQuestion {
  word: VocabWithReview;
  prompt: string;
  promptIsJapanese: boolean;
  hint?: string;
  options: { text: string; japanese: boolean; correct: boolean }[];
}

function optionFor(w: VocabWithReview, kind: 'vi' | 'ja' | 'reading') {
  if (kind === 'vi') return { text: w.vietnamese, japanese: false };
  if (kind === 'ja') return { text: w.japanese, japanese: true };
  return { text: w.reading, japanese: true };
}

export function buildChoiceQuestions(
  pool: VocabWithReview[],
  count: number,
  direction: ChoiceDirection,
  rnd: Rng = Math.random,
): ChoiceQuestion[] {
  const eligible = direction === 'reading' ? pool.filter((w) => hasKanji(w.japanese)) : pool;
  return shuffle(eligible, rnd)
    .slice(0, count)
    .map((word) => {
      const kind = direction === 'ja_vi' ? 'vi' : direction === 'vi_ja' ? 'ja' : 'reading';
      const distractors = pickDistractors(word, pool, 3, rnd);
      const options = shuffle(
        [{ ...optionFor(word, kind), correct: true }, ...distractors.map((d) => ({ ...optionFor(d, kind), correct: false }))],
        rnd,
      );
      return {
        word,
        prompt: direction === 'vi_ja' ? word.vietnamese : word.japanese,
        promptIsJapanese: direction !== 'vi_ja',
        options,
      };
    });
}

/** Fill-in-the-blank: example sentence with the target masked, 4 Japanese options. */
export function buildClozeQuestions(pool: VocabWithReview[], count: number, rnd: Rng = Math.random): ChoiceQuestion[] {
  const eligible = pool.filter((w) => w.example_ja && maskTarget(w.example_ja, w.japanese).masked);
  return shuffle(eligible, rnd)
    .slice(0, count)
    .map((word) => {
      const distractors = pickDistractors(word, pool, 3, rnd);
      return {
        word,
        prompt: maskTarget(word.example_ja!, word.japanese).text,
        promptIsJapanese: true,
        hint: word.example_vi ?? undefined,
        options: shuffle(
          [{ text: word.japanese, japanese: true, correct: true }, ...distractors.map((d) => ({ text: d.japanese, japanese: true, correct: false }))],
          rnd,
        ),
      };
    });
}

export interface TrueFalseItem {
  word: VocabWithReview;
  shownMeaning: string;
  isCorrect: boolean;
}

export function buildTrueFalseItems(pool: VocabWithReview[], count: number, rnd: Rng = Math.random): TrueFalseItem[] {
  const items: TrueFalseItem[] = [];
  const words = shuffle(pool, rnd);
  for (let i = 0; i < count; i++) {
    const word = words[i % words.length];
    const honest = rnd() < 0.5;
    const fake = honest ? null : pickDistractors(word, pool, 1, rnd)[0];
    items.push({ word, shownMeaning: fake ? fake.vietnamese : word.vietnamese, isCorrect: !fake });
  }
  return items;
}

export interface MatchCard {
  key: string;
  wordId: number;
  text: string;
  side: 'ja' | 'vi';
}

/** `n` pairs with mutually distinct meanings; returns both columns shuffled independently. */
export function buildMatchBoard(pool: VocabWithReview[], n = 6, rnd: Rng = Math.random) {
  const picked: VocabWithReview[] = [];
  const seen = new Set<string>();
  for (const w of shuffle(pool, rnd)) {
    const k = meaningKey(w.vietnamese);
    if (seen.has(k)) continue;
    seen.add(k);
    picked.push(w);
    if (picked.length === n) break;
  }
  return {
    words: picked,
    left: shuffle(picked.map((w) => ({ key: `ja-${w.id}`, wordId: w.id, text: w.japanese, side: 'ja' as const })), rnd),
    right: shuffle(picked.map((w) => ({ key: `vi-${w.id}`, wordId: w.id, text: w.vietnamese, side: 'vi' as const })), rnd),
  };
}

export function buildTypingQuestions(pool: VocabWithReview[], count: number, rnd: Rng = Math.random): VocabWithReview[] {
  return shuffle(pool.filter((w) => hasKanji(w.japanese) && !!w.reading && isKana(w.reading)), rnd).slice(0, count);
}

/** Accept hiragana or katakana, full/half width, ignore spaces and ・. */
export function checkReading(input: string, reading: string): boolean {
  const a = readingKey(input);
  return a.length > 0 && a === readingKey(reading);
}

/** Points for a correct answer given the current combo (combo counts previous consecutive correct answers). */
export const pointsFor = (combo: number, base = 100) => base + Math.min(combo, 10) * 10;
export const matchScore = (seconds: number, mistakes: number) => Math.max(0, Math.round(1000 - seconds * 10 - mistakes * 50));
