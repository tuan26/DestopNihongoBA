import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { memoryDb, seedFile } from '../helpers/db';
import { importSeed } from '../../src/core/seed/importer';
import { listVocabulary } from '../../src/core/vocabulary/repository';
import { normalizeKey } from '../../src/core/vocabulary/normalize';
import {
  buildChoiceQuestions, buildClozeQuestions, buildMatchBoard, buildTrueFalseItems, buildTypingQuestions, checkReading, loadPool, matchScore, pointsFor,
} from '../../src/core/quiz/questions';
import { bestScore, markWrongForReview, recentResults, saveQuizResult } from '../../src/core/quiz/results';
import type { SeedFile } from '../../src/core/vocabulary/types';

const seed: SeedFile = JSON.parse(readFileSync(join(__dirname, '../../data/vocabulary/seed-v1.json'), 'utf8'));

describe('quiz question generation on the real 1,000-word dataset', () => {
  it('choice & cloze questions never contain duplicate or ambiguous options', async () => {
    const db = await memoryDb();
    await importSeed(db, seed);
    const pool = await listVocabulary(db);
    for (let round = 0; round < 30; round++) {
      for (const dir of ['ja_vi', 'vi_ja', 'reading'] as const) {
        for (const q of buildChoiceQuestions(pool, 10, dir)) {
          expect(q.options).toHaveLength(4);
          expect(q.options.filter((o) => o.correct)).toHaveLength(1);
          expect(new Set(q.options.map((o) => normalizeKey(o.text))).size).toBe(4);
        }
      }
      for (const q of buildClozeQuestions(pool, 10)) {
        expect(q.prompt).toContain('＿＿＿');
        expect(new Set(q.options.map((o) => o.text)).size).toBe(4);
      }
    }
  });

  it('match board, true/false and typing', async () => {
    const db = await memoryDb();
    await importSeed(db, seed);
    const pool = await listVocabulary(db);
    const board = buildMatchBoard(pool, 6);
    expect(board.left).toHaveLength(6);
    expect(new Set(board.right.map((c) => c.text)).size).toBe(6);
    const tf = buildTrueFalseItems(pool, 200);
    const honest = tf.filter((t) => t.isCorrect).length;
    expect(honest).toBeGreaterThan(60);
    expect(honest).toBeLessThan(140);
    for (const t of tf.filter((x) => !x.isCorrect)) expect(t.shownMeaning).not.toBe(t.word.vietnamese);
    expect(buildTypingQuestions(pool, 10).every((w) => /[一-鿿]/.test(w.japanese))).toBe(true);
  });

  it('reading check accepts katakana, spaces, full width', () => {
    expect(checkReading('にんしきあわせ', 'にんしきあわせ')).toBe(true);
    expect(checkReading('ニンシキアワセ', 'にんしきあわせ')).toBe(true);
    expect(checkReading(' にんしき あわせ ', 'にんしきあわせ')).toBe(true);
    expect(checkReading('にんしき', 'にんしきあわせ')).toBe(false);
    expect(checkReading('', 'あ')).toBe(false);
    expect(pointsFor(0)).toBe(100);
    expect(pointsFor(25)).toBe(200);
    expect(matchScore(30, 2)).toBe(600);
  });
});

describe('quiz pool & results', () => {
  it('learned source falls back to all words when nothing was studied', async () => {
    const db = await memoryDb();
    await importSeed(db, seedFile(30));
    const r = await loadPool(db, 'learned');
    expect(r.fellBack).toBe(true);
    expect(r.words.length).toBeGreaterThanOrEqual(12);
  });

  it('saves results, tracks best score and re-queues wrong words', async () => {
    const db = await memoryDb();
    await importSeed(db, seedFile(10));
    const [a, b] = await listVocabulary(db);
    const r1 = await saveQuizResult(db, { game: 'choice', variant: 'ja_vi', score: 800, correct: 8, total: 10, durationMs: 50000, wrongIds: [a.id, b.id] });
    expect(r1.isBest).toBe(true);
    const r2 = await saveQuizResult(db, { game: 'choice', variant: 'ja_vi', score: 500, correct: 5, total: 10, durationMs: 40000, wrongIds: [] });
    expect(r2.isBest).toBe(false);
    expect(await bestScore(db, 'choice', 'ja_vi')).toBe(800);
    expect((await recentResults(db))[1].wrongIds).toEqual([a.id, b.id]);
    expect(await markWrongForReview(db, [a.id, a.id, b.id])).toBe(2);
    const logs = await db.select<{ mode: string; rating: number }>('SELECT mode, rating FROM review_logs');
    expect(logs).toEqual([{ mode: 'quiz', rating: 1 }, { mode: 'quiz', rating: 1 }]);
  });
});
