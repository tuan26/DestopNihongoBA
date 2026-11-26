import type { Database } from '../db/types';
import { nowIso } from '../db/types';
import { createNewReviewState, schedule, type SchedulerOptions, type UserRating } from '../srs/scheduler';
import { getKv } from '../settings/settings';
import type { ReviewStateRow } from '../vocabulary/types';

export interface N1Card {
  id: number;
  deckId: number;
  deckTitle: string;
  course: string | null;
  front: string;
  back: string;
  reading: string | null;
  state: ReviewStateRow | null;
}

export const N1_NEW_PER_DAY_KEY = 'n1.newPerDay';
export const n1NewPerDay = (db: Database) => getKv<number>(db, N1_NEW_PER_DAY_KEY, 30);

const SELECT = `SELECT c.id, c.deck_id, c.front, c.back, c.reading, d.title AS deck_title, d.course,
  s.card_id AS s_card_id, s.due, s.stability, s.difficulty, s.elapsed_days, s.scheduled_days, s.learning_steps, s.reps, s.lapses,
  s.state, s.last_review, s.last_rating
  FROM n1_cards c JOIN n1_decks d ON d.id = c.deck_id LEFT JOIN n1_card_states s ON s.card_id = c.id`;

type Row = Record<string, unknown>;
const mapCard = (r: Row): N1Card => ({
  id: Number(r.id),
  deckId: Number(r.deck_id),
  deckTitle: String(r.deck_title),
  course: (r.course as string) ?? null,
  front: String(r.front),
  back: String(r.back),
  reading: (r.reading as string) || null,
  state:
    r.s_card_id == null
      ? null
      : {
          vocabulary_id: Number(r.id),
          due: String(r.due),
          stability: Number(r.stability),
          difficulty: Number(r.difficulty),
          elapsed_days: Number(r.elapsed_days),
          scheduled_days: Number(r.scheduled_days),
          learning_steps: Number(r.learning_steps),
          reps: Number(r.reps),
          lapses: Number(r.lapses),
          state: Number(r.state),
          last_review: (r.last_review as string) ?? null,
          last_rating: r.last_rating == null ? null : Number(r.last_rating),
        },
});

const startOfDay = (now: Date) => {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
};

export async function newStudiedToday(db: Database, now = new Date()): Promise<number> {
  const r = await db.select<{ n: number }>('SELECT COUNT(*) AS n FROM n1_card_states WHERE first_studied >= ?', [startOfDay(now)]);
  return Number(r[0]?.n ?? 0);
}

/**
 * Today's flashcard queue: due cards first (oldest due), then unseen cards in course order up to the daily new limit.
 * With `deckId`, studies that deck only and ignores the daily limit (explicit choice by the user).
 */
export async function buildN1CardQueue(
  db: Database,
  o: { deckId?: number; now?: Date; newPerDay?: number; limit?: number } = {},
): Promise<N1Card[]> {
  const now = o.now ?? new Date();
  const limit = o.limit ?? 100;
  const deckWhere = o.deckId != null ? 'AND c.deck_id = ?' : '';
  const p = o.deckId != null ? [o.deckId] : [];
  const due = (
    await db.select<Row>(`${SELECT} WHERE s.card_id IS NOT NULL AND s.due <= ? ${deckWhere} ORDER BY s.due LIMIT ?`, [nowIso(now), ...p, limit])
  ).map(mapCard);
  const newBudget = o.deckId != null ? limit : Math.max(0, (o.newPerDay ?? (await n1NewPerDay(db))) - (await newStudiedToday(db, now)));
  const fresh = newBudget
    ? (await db.select<Row>(`${SELECT} WHERE s.card_id IS NULL ${deckWhere} ORDER BY d.course, d.ord, c.ord LIMIT ?`, [...p, Math.min(newBudget, limit)])).map(mapCard)
    : [];
  return [...due, ...fresh].slice(0, limit);
}

export async function rateN1Card(db: Database, cardId: number, rating: UserRating, now = new Date(), opts: SchedulerOptions = {}): Promise<ReviewStateRow> {
  const rows = await db.select<Row>(`${SELECT} WHERE c.id = ?`, [cardId]);
  if (!rows[0]) throw new Error('Không tìm thấy thẻ');
  const card = mapCard(rows[0]);
  const current = card.state ?? createNewReviewState(cardId, now);
  const { next } = schedule(current, rating, now, opts);
  await db.execute(
    `INSERT INTO n1_card_states (card_id, due, stability, difficulty, elapsed_days, scheduled_days, learning_steps, reps, lapses, state,
       last_review, last_rating, first_studied) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(card_id) DO UPDATE SET due = excluded.due, stability = excluded.stability, difficulty = excluded.difficulty,
       elapsed_days = excluded.elapsed_days, scheduled_days = excluded.scheduled_days, learning_steps = excluded.learning_steps,
       reps = excluded.reps, lapses = excluded.lapses, state = excluded.state, last_review = excluded.last_review,
       last_rating = excluded.last_rating`,
    [cardId, next.due, next.stability, next.difficulty, next.elapsed_days, next.scheduled_days, next.learning_steps, next.reps, next.lapses,
      next.state, next.last_review, rating, nowIso(now)],
  );
  return next;
}

/** Split a card back into a short meaning (first line) and details (examples…). */
export function splitBack(back: string): { meaning: string; details: string } {
  const lines = back.split('\n');
  return { meaning: lines[0].trim(), details: lines.slice(1).join('\n').trim() };
}

/** All (or a random subset of) N1 cards, optionally limited to one course — used by games and as card filler. */
export async function listN1Cards(db: Database, o: { course?: string | null; limit?: number; exclude?: number[] } = {}): Promise<N1Card[]> {
  const ex = o.exclude?.length ? `AND c.id NOT IN (${o.exclude.map(() => '?').join(',')})` : '';
  return (
    await db.select<Row>(`${SELECT} WHERE (? IS NULL OR d.course = ?) ${ex} ORDER BY RANDOM() LIMIT ?`, [
      o.course ?? null,
      o.course ?? null,
      ...(o.exclude ?? []),
      o.limit ?? 2000,
    ])
  ).map(mapCard);
}

export async function n1Courses(db: Database): Promise<{ course: string; cards: number }[]> {
  const rows = await db.select<{ course: string; n: number }>(
    `SELECT COALESCE(d.course, '') AS course, COUNT(*) AS n FROM n1_cards c JOIN n1_decks d ON d.id = c.deck_id GROUP BY d.course ORDER BY d.course`,
  );
  return rows.map((r) => ({ course: r.course, cards: Number(r.n) }));
}
