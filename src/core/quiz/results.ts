import type { Database } from '../db/types';
import { nowIso } from '../db/types';
import { rateWord } from '../srs/reviewService';
import type { QuizGame } from './questions';
import { isN1WordId, n1CardIdOf } from '../n1/adapter';
import { rateN1Card } from '../n1/cards';

export interface QuizResult {
  id?: number;
  game: QuizGame;
  variant?: string | null;
  source?: string | null;
  score: number;
  correct: number;
  total: number;
  durationMs: number;
  wrongIds: number[];
  playedAt?: string;
}

export async function saveQuizResult(db: Database, r: QuizResult, now = new Date()): Promise<{ id: number; isBest: boolean; previousBest: number | null }> {
  const prev = await bestScore(db, r.game, r.variant ?? null);
  const res = await db.execute(
    `INSERT INTO quiz_results (game, variant, source, score, correct, total, duration_ms, wrong_ids, played_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [r.game, r.variant ?? null, r.source ?? null, r.score, r.correct, r.total, Math.round(r.durationMs), JSON.stringify([...new Set(r.wrongIds)]), nowIso(now)],
  );
  return { id: res.lastInsertId!, isBest: prev == null || r.score > prev, previousBest: prev };
}

export async function bestScore(db: Database, game: QuizGame, variant: string | null = null): Promise<number | null> {
  const rows = await db.select<{ s: number | null }>(
    `SELECT MAX(score) AS s FROM quiz_results WHERE game = ? AND (variant IS ? OR variant = ?)`,
    [game, variant, variant],
  );
  return rows[0]?.s == null ? null : Number(rows[0].s);
}

export async function bestScores(db: Database): Promise<Record<string, { best: number; plays: number }>> {
  const rows = await db.select<{ game: string; best: number; plays: number }>(
    'SELECT game, MAX(score) AS best, COUNT(*) AS plays FROM quiz_results GROUP BY game',
  );
  return Object.fromEntries(rows.map((r) => [r.game, { best: Number(r.best), plays: Number(r.plays) }]));
}

export async function recentResults(db: Database, limit = 10): Promise<QuizResult[]> {
  const rows = await db.select<Record<string, unknown>>('SELECT * FROM quiz_results ORDER BY id DESC LIMIT ?', [limit]);
  return rows.map((r) => ({
    id: Number(r.id),
    game: r.game as QuizGame,
    variant: (r.variant as string) ?? null,
    source: (r.source as string) ?? null,
    score: Number(r.score),
    correct: Number(r.correct),
    total: Number(r.total),
    durationMs: Number(r.duration_ms),
    wrongIds: JSON.parse(String(r.wrong_ids ?? '[]')),
    playedAt: String(r.played_at),
  }));
}

/** Put the words answered wrongly back into the FSRS learning queue ("Again"). Only affects these words. */
export async function markWrongForReview(db: Database, ids: number[], now = new Date(), retention?: number): Promise<number> {
  const unique = [...new Set(ids)];
  for (const id of unique) {
    if (isN1WordId(id)) await rateN1Card(db, n1CardIdOf(id), 1, now, { retention });
    else await rateWord(db, id, 1, 'quiz', now, { retention });
  }
  return unique.length;
}
