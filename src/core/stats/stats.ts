import type { Database } from '../db/types';
import { WEAK_SQL, weakSinceIso } from '../vocabulary/repository';
import { newLearnedToday } from '../study/modes';

export interface DashboardStats {
  total: number;
  hidden: number;
  newCount: number;
  learning: number;
  review: number;
  dueToday: number;
  dueNow: number;
  weak: number;
  reviewedToday: number;
  newLearnedToday: number;
  streak: number;
  favorites: number;
  pendingSuggestions: number;
}

const localDayKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export function computeStreak(reviewTimes: string[], now = new Date()): number {
  const days = new Set(reviewTimes.map((t) => localDayKey(new Date(t))));
  const cursor = new Date(now);
  if (!days.has(localDayKey(cursor))) cursor.setDate(cursor.getDate() - 1); // streak still alive if studied yesterday
  let streak = 0;
  while (days.has(localDayKey(cursor))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

export async function getDashboardStats(db: Database, now = new Date()): Promise<DashboardStats> {
  const endOfDay = new Date(now);
  endOfDay.setHours(23, 59, 59, 999);
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);
  const one = async (sql: string, p: (string | number)[] = []) =>
    Number((await db.select<{ n: number }>(sql, p))[0]?.n ?? 0);
  const base = 'FROM vocabulary v JOIN review_states r ON r.vocabulary_id = v.id WHERE v.is_hidden = 0';
  const times = await db.select<{ reviewed_at: string }>(
    'SELECT reviewed_at FROM review_logs WHERE reviewed_at >= ? ORDER BY reviewed_at',
    [new Date(now.getTime() - 400 * 86400000).toISOString()],
  );
  return {
    total: await one('SELECT COUNT(*) AS n FROM vocabulary WHERE is_hidden = 0'),
    hidden: await one('SELECT COUNT(*) AS n FROM vocabulary WHERE is_hidden = 1'),
    newCount: await one(`SELECT COUNT(*) AS n ${base} AND r.state = 0`),
    learning: await one(`SELECT COUNT(*) AS n ${base} AND r.state IN (1, 3)`),
    review: await one(`SELECT COUNT(*) AS n ${base} AND r.state = 2`),
    dueToday: await one(`SELECT COUNT(*) AS n ${base} AND r.state != 0 AND r.due <= ?`, [endOfDay.toISOString()]),
    dueNow: await one(`SELECT COUNT(*) AS n ${base} AND r.state != 0 AND r.due <= ?`, [now.toISOString()]),
    weak: await one(`SELECT COUNT(*) AS n ${base} AND ${WEAK_SQL}`, [weakSinceIso(now)]),
    reviewedToday: await one('SELECT COUNT(*) AS n FROM review_logs WHERE reviewed_at >= ?', [startOfDay.toISOString()]),
    newLearnedToday: await newLearnedToday(db, now),
    streak: computeStreak(
      times.map((t) => t.reviewed_at),
      now,
    ),
    favorites: await one('SELECT COUNT(*) AS n FROM vocabulary WHERE is_favorite = 1 AND is_hidden = 0'),
    pendingSuggestions: await one("SELECT COUNT(*) AS n FROM ai_suggestions WHERE status = 'pending'"),
  };
}

export interface DailyActivity {
  day: string;
  reviews: number;
  again: number;
  newWords: number;
}

export async function getDailyActivity(db: Database, days = 30, now = new Date()): Promise<DailyActivity[]> {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (days - 1));
  const logs = await db.select<{ reviewed_at: string; rating: number; state_before: number }>(
    'SELECT reviewed_at, rating, state_before FROM review_logs WHERE reviewed_at >= ?',
    [start.toISOString()],
  );
  const map = new Map<string, DailyActivity>();
  for (let i = 0; i < days; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const k = localDayKey(d);
    map.set(k, { day: k, reviews: 0, again: 0, newWords: 0 });
  }
  for (const l of logs) {
    const a = map.get(localDayKey(new Date(l.reviewed_at)));
    if (!a) continue;
    a.reviews++;
    if (Number(l.rating) === 1) a.again++;
    if (Number(l.state_before) === 0) a.newWords++;
  }
  return [...map.values()];
}

export interface CategoryProgress {
  category: string;
  total: number;
  started: number;
  mature: number;
}

export async function getCategoryProgress(db: Database): Promise<CategoryProgress[]> {
  const rows = await db.select<CategoryProgress>(
    `SELECT v.category AS category, COUNT(*) AS total,
       SUM(CASE WHEN r.state != 0 THEN 1 ELSE 0 END) AS started,
       SUM(CASE WHEN r.state = 2 AND r.stability >= 21 THEN 1 ELSE 0 END) AS mature
     FROM vocabulary v JOIN review_states r ON r.vocabulary_id = v.id WHERE v.is_hidden = 0
     GROUP BY v.category ORDER BY total DESC`,
  );
  return rows.map((r) => ({ ...r, total: Number(r.total), started: Number(r.started), mature: Number(r.mature) }));
}

export async function getRatingBreakdown(db: Database, days = 30, now = new Date()) {
  const rows = await db.select<{ rating: number; n: number }>(
    'SELECT rating, COUNT(*) AS n FROM review_logs WHERE reviewed_at >= ? GROUP BY rating',
    [new Date(now.getTime() - days * 86400000).toISOString()],
  );
  const out = { 1: 0, 2: 0, 3: 0, 4: 0 } as Record<number, number>;
  for (const r of rows) out[Number(r.rating)] = Number(r.n);
  return out;
}

/** Upcoming review forecast for the next N days. */
export async function getForecast(db: Database, days = 14, now = new Date()) {
  const rows = await db.select<{ due: string }>(
    `SELECT r.due FROM review_states r JOIN vocabulary v ON v.id = r.vocabulary_id
     WHERE v.is_hidden = 0 AND r.state != 0 AND r.due <= ?`,
    [new Date(now.getTime() + days * 86400000).toISOString()],
  );
  const out: { day: string; n: number }[] = [];
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  for (let i = 0; i < days; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    out.push({ day: localDayKey(d), n: 0 });
  }
  for (const r of rows) {
    const k = localDayKey(new Date(r.due));
    const slot = out.find((o) => o.day === k) ?? (new Date(r.due) < today ? out[0] : undefined);
    if (slot) slot.n++;
  }
  return out;
}
