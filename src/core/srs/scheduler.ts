import { createEmptyCard, fsrs, generatorParameters, Rating, State, type Card, type Grade } from 'ts-fsrs';
import type { ReviewStateRow } from '../vocabulary/types';

export { Rating, State };
export type UserRating = 1 | 2 | 3 | 4;
export const RATING_LABELS: Record<UserRating, { vi: string; en: string; key: string }> = {
  1: { vi: 'Quên', en: 'Again', key: '1' },
  2: { vi: 'Khó', en: 'Hard', key: '2' },
  3: { vi: 'Nhớ', en: 'Good', key: '3' },
  4: { vi: 'Dễ', en: 'Easy', key: '4' },
};

export interface SchedulerOptions {
  retention?: number;
  maximumInterval?: number;
  enableFuzz?: boolean;
}

export function createScheduler(o: SchedulerOptions = {}) {
  return fsrs(
    generatorParameters({
      request_retention: Math.min(0.99, Math.max(0.7, o.retention ?? 0.9)),
      maximum_interval: o.maximumInterval ?? 36500,
      enable_fuzz: o.enableFuzz ?? true,
      enable_short_term: true,
    }),
  );
}

export function createNewReviewState(vocabularyId: number, now = new Date()): ReviewStateRow {
  return cardToRow(vocabularyId, createEmptyCard(now), null);
}

export function rowToCard(r: ReviewStateRow): Card {
  return {
    due: new Date(r.due),
    stability: r.stability,
    difficulty: r.difficulty,
    elapsed_days: r.elapsed_days,
    scheduled_days: r.scheduled_days,
    learning_steps: r.learning_steps,
    reps: r.reps,
    lapses: r.lapses,
    state: r.state as State,
    last_review: r.last_review ? new Date(r.last_review) : undefined,
  };
}

export function cardToRow(vocabularyId: number, c: Card, lastRating: number | null): ReviewStateRow {
  return {
    vocabulary_id: vocabularyId,
    due: c.due.toISOString(),
    stability: c.stability,
    difficulty: c.difficulty,
    elapsed_days: c.elapsed_days,
    scheduled_days: c.scheduled_days,
    learning_steps: c.learning_steps,
    reps: c.reps,
    lapses: c.lapses,
    state: c.state,
    last_review: c.last_review ? c.last_review.toISOString() : null,
    last_rating: lastRating,
  };
}

/** Compute the next state for a rating (pure). */
export function schedule(row: ReviewStateRow, rating: UserRating, now = new Date(), opts: SchedulerOptions = {}) {
  const f = createScheduler(opts);
  const result = f.next(rowToCard(row), now, rating as Grade);
  return { next: cardToRow(row.vocabulary_id, result.card, rating), log: result.log };
}

/** Preview the due date for each rating, for button hints ("10 phút", "3 ngày"…). */
export function previewIntervals(row: ReviewStateRow, now = new Date(), opts: SchedulerOptions = {}) {
  const f = createScheduler({ ...opts, enableFuzz: false });
  const rec = f.repeat(rowToCard(row), now);
  const out = {} as Record<UserRating, Date>;
  for (const g of [1, 2, 3, 4] as UserRating[]) out[g] = rec[g as Grade].card.due;
  return out;
}

export function formatInterval(due: Date, now = new Date()): string {
  const mins = Math.max(0, Math.round((due.getTime() - now.getTime()) / 60000));
  if (mins < 60) return `${Math.max(1, mins)} phút`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} giờ`;
  const days = Math.round(hours / 24);
  if (days < 31) return `${days} ngày`;
  const months = Math.round(days / 30);
  if (months < 12) return `${months} tháng`;
  return `${(days / 365).toFixed(1)} năm`;
}
