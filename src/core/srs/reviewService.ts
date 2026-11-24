import type { Database } from '../db/types';
import { nowIso } from '../db/types';
import { mapReview } from '../vocabulary/repository';
import { createNewReviewState, schedule, type SchedulerOptions, type UserRating } from './scheduler';
import type { ReviewStateRow } from '../vocabulary/types';

export async function getReviewState(db: Database, vocabularyId: number): Promise<ReviewStateRow | null> {
  const rows = await db.select<Record<string, unknown>>('SELECT * FROM review_states WHERE vocabulary_id = ?', [
    vocabularyId,
  ]);
  return rows[0] ? mapReview(rows[0], '') : null;
}

/** Rate a word: update FSRS state + append review log atomically. */
export async function rateWord(
  db: Database,
  vocabularyId: number,
  rating: UserRating,
  mode: string,
  now = new Date(),
  opts: SchedulerOptions = {},
): Promise<ReviewStateRow> {
  return db.transaction(async (tx) => {
    const current = (await getReviewState(tx, vocabularyId)) ?? createNewReviewState(vocabularyId, now);
    const { next } = schedule(current, rating, now, opts);
    await tx.execute(
      `INSERT INTO review_states (vocabulary_id, due, stability, difficulty, elapsed_days, scheduled_days, learning_steps,
        reps, lapses, state, last_review, last_rating) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(vocabulary_id) DO UPDATE SET due = excluded.due, stability = excluded.stability,
        difficulty = excluded.difficulty, elapsed_days = excluded.elapsed_days, scheduled_days = excluded.scheduled_days,
        learning_steps = excluded.learning_steps, reps = excluded.reps, lapses = excluded.lapses, state = excluded.state,
        last_review = excluded.last_review, last_rating = excluded.last_rating`,
      [
        vocabularyId,
        next.due,
        next.stability,
        next.difficulty,
        next.elapsed_days,
        next.scheduled_days,
        next.learning_steps,
        next.reps,
        next.lapses,
        next.state,
        next.last_review,
        next.last_rating,
      ],
    );
    await tx.execute(
      `INSERT INTO review_logs (vocabulary_id, rating, state_before, due_before, due_after, stability, difficulty,
        elapsed_days, scheduled_days, mode, reviewed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        vocabularyId,
        rating,
        current.state,
        current.due,
        next.due,
        next.stability,
        next.difficulty,
        next.elapsed_days,
        next.scheduled_days,
        mode,
        nowIso(now),
      ],
    );
    return next;
  });
}

/** Reset learning progress of a word to "new" (keeps history logs). */
export async function resetProgress(db: Database, vocabularyId: number, now = new Date()): Promise<void> {
  const s = createNewReviewState(vocabularyId, now);
  await db.execute(
    `UPDATE review_states SET due = ?, stability = 0, difficulty = 0, elapsed_days = 0, scheduled_days = 0,
      learning_steps = 0, reps = 0, lapses = 0, state = 0, last_review = NULL, last_rating = NULL WHERE vocabulary_id = ?`,
    [s.due, vocabularyId],
  );
}
