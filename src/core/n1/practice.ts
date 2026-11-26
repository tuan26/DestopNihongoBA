import type { Database } from '../db/types';
import { nowIso } from '../db/types';

export interface N1Question {
  id: number;
  deckId: number;
  deckTitle: string;
  passage: string | null;
  prompt: string;
  options: string[];
  answer: number;
  explanation: string | null;
  tag: string | null;
  audioUrl: string | null;
}

type Row = Record<string, unknown>;
const mapQ = (r: Row): N1Question => ({
  id: Number(r.id),
  deckId: Number(r.deck_id),
  deckTitle: String(r.deck_title ?? ''),
  passage: (r.passage as string) || null,
  prompt: String(r.prompt),
  options: JSON.parse(String(r.options)),
  answer: Number(r.answer),
  explanation: (r.explanation as string) || null,
  tag: (r.tag as string) || null,
  audioUrl: (r.audio_url as string) || null,
});

const Q = `SELECT q.*, d.title AS deck_title FROM n1_questions q JOIN n1_decks d ON d.id = q.deck_id`;
const LATEST = `(SELECT a.correct FROM n1_attempts a WHERE a.question_id = q.id ORDER BY a.id DESC LIMIT 1)`;

export async function deckQuestions(db: Database, deckId: number): Promise<N1Question[]> {
  return (await db.select<Row>(`${Q} WHERE q.deck_id = ? ORDER BY q.ord`, [deckId])).map(mapQ);
}

/** "Sổ câu sai": questions whose most recent attempt was wrong. */
export async function wrongQuestions(db: Database, limit = 30): Promise<N1Question[]> {
  return (await db.select<Row>(`${Q} WHERE ${LATEST} = 0 ORDER BY RANDOM() LIMIT ?`, [limit])).map(mapQ);
}

export async function randomQuestions(db: Database, limit = 20, course?: string): Promise<N1Question[]> {
  return (
    await db.select<Row>(`${Q} WHERE (? IS NULL OR d.course = ?) ORDER BY RANDOM() LIMIT ?`, [course ?? null, course ?? null, limit])
  ).map(mapQ);
}

export async function recordAnswer(db: Database, questionId: number, chosen: number, correct: boolean, now = new Date()): Promise<void> {
  await db.execute('INSERT INTO n1_attempts (question_id, chosen, correct, answered_at) VALUES (?, ?, ?, ?)', [
    questionId,
    chosen,
    correct ? 1 : 0,
    nowIso(now),
  ]);
}

export interface N1DeckInfo {
  id: number;
  kind: 'flashcard' | 'quiz';
  title: string;
  course: string;
  section: string;
  ord: number;
  total: number;
  /** flashcards: cards studied at least once; quiz: questions answered at least once */
  done: number;
  /** flashcards: due now; quiz: questions whose latest answer is correct */
  extra: number;
}

export async function listN1Decks(db: Database, now = new Date()): Promise<N1DeckInfo[]> {
  const rows = await db.select<Row>(
    `SELECT d.id, d.kind, d.title, COALESCE(d.course, '') AS course, COALESCE(d.section, '') AS section, d.ord,
       CASE WHEN d.kind = 'flashcard' THEN (SELECT COUNT(*) FROM n1_cards c WHERE c.deck_id = d.id)
            ELSE (SELECT COUNT(*) FROM n1_questions q WHERE q.deck_id = d.id) END AS total,
       CASE WHEN d.kind = 'flashcard' THEN (SELECT COUNT(*) FROM n1_cards c JOIN n1_card_states s ON s.card_id = c.id WHERE c.deck_id = d.id)
            ELSE (SELECT COUNT(DISTINCT a.question_id) FROM n1_attempts a JOIN n1_questions q ON q.id = a.question_id WHERE q.deck_id = d.id) END AS done,
       CASE WHEN d.kind = 'flashcard' THEN (SELECT COUNT(*) FROM n1_cards c JOIN n1_card_states s ON s.card_id = c.id WHERE c.deck_id = d.id AND s.due <= ?)
            ELSE (SELECT COUNT(*) FROM n1_questions q WHERE q.deck_id = d.id AND ${LATEST} = 1) END AS extra
     FROM n1_decks d ORDER BY d.course, d.ord, d.id`,
    [nowIso(now)],
  );
  return rows.map((r) => ({
    id: Number(r.id),
    kind: r.kind as 'flashcard' | 'quiz',
    title: String(r.title),
    course: String(r.course),
    section: String(r.section),
    ord: Number(r.ord),
    total: Number(r.total),
    done: Number(r.done),
    extra: Number(r.extra),
  }));
}

export interface N1Stats {
  decks: number;
  cards: number;
  cardsStudied: number;
  cardsDue: number;
  questions: number;
  answered: number;
  wrongNow: number;
  accuracy: number | null;
}

export async function n1Stats(db: Database, now = new Date()): Promise<N1Stats> {
  const one = async (sql: string, p: (string | number)[] = []) => Number((await db.select<{ n: number }>(sql, p))[0]?.n ?? 0);
  const total = await one('SELECT COUNT(*) AS n FROM n1_attempts');
  const right = await one('SELECT COUNT(*) AS n FROM n1_attempts WHERE correct = 1');
  return {
    decks: await one('SELECT COUNT(*) AS n FROM n1_decks'),
    cards: await one('SELECT COUNT(*) AS n FROM n1_cards'),
    cardsStudied: await one('SELECT COUNT(*) AS n FROM n1_card_states'),
    cardsDue: await one('SELECT COUNT(*) AS n FROM n1_card_states WHERE due <= ?', [nowIso(now)]),
    questions: await one('SELECT COUNT(*) AS n FROM n1_questions'),
    answered: await one('SELECT COUNT(DISTINCT question_id) AS n FROM n1_attempts'),
    wrongNow: await one(`SELECT COUNT(*) AS n FROM n1_questions q WHERE ${LATEST} = 0`),
    accuracy: total ? Math.round((right / total) * 100) : null,
  };
}
