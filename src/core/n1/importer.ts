import type { Database, Statement } from '../db/types';
import { nowIso } from '../db/types';
import type { Pack } from './pack';
import { validatePack } from './pack';

export interface PackImportResult {
  decks: { inserted: number; updated: number };
  cards: { inserted: number; updated: number };
  questions: { inserted: number; updated: number };
}

/**
 * Idempotent import keyed by stable keys. Content is updated in place; learning state (n1_card_states,
 * n1_attempts) is never touched, and items missing from a newer file are kept.
 */
export async function importPack(db: Database, pack: Pack, now = new Date()): Promise<PackImportResult> {
  const errs = validatePack(pack);
  if (errs.length) throw new Error(errs.join('\n'));
  const keysOf = async (table: string) => new Set((await db.select<{ key: string }>(`SELECT key FROM ${table}`)).map((r) => r.key));
  const [deckKeys, cardKeys, qKeys] = await Promise.all([keysOf('n1_decks'), keysOf('n1_cards'), keysOf('n1_questions')]);
  const res: PackImportResult = { decks: { inserted: 0, updated: 0 }, cards: { inserted: 0, updated: 0 }, questions: { inserted: 0, updated: 0 } };
  const ts = nowIso(now);
  const stmts: Statement[] = [];
  for (const d of pack.decks) {
    res.decks[deckKeys.has(d.key) ? 'updated' : 'inserted']++;
    stmts.push({
      sql: `INSERT INTO n1_decks (key, pack, kind, title, course, section, ord, imported_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(key) DO UPDATE SET pack = excluded.pack, kind = excluded.kind, title = excluded.title, course = excluded.course,
            section = excluded.section, ord = excluded.ord, imported_at = excluded.imported_at`,
      params: [d.key, pack.name, d.kind, d.title, d.course ?? null, d.section ?? null, d.order ?? 0, ts],
    });
    (d.cards ?? []).forEach((c, i) => {
      res.cards[cardKeys.has(c.key) ? 'updated' : 'inserted']++;
      stmts.push({
        sql: `INSERT INTO n1_cards (deck_id, key, front, back, reading, ord) SELECT id, ?, ?, ?, ?, ? FROM n1_decks WHERE key = ?
              ON CONFLICT(key) DO UPDATE SET deck_id = excluded.deck_id, front = excluded.front, back = excluded.back,
              reading = excluded.reading, ord = excluded.ord`,
        params: [c.key, c.front, c.back, c.reading ?? null, i, d.key],
      });
    });
    (d.questions ?? []).forEach((q, i) => {
      res.questions[qKeys.has(q.key) ? 'updated' : 'inserted']++;
      stmts.push({
        sql: `INSERT INTO n1_questions (deck_id, key, ord, passage, prompt, options, answer, explanation, tag, audio_url)
              SELECT id, ?, ?, ?, ?, ?, ?, ?, ?, ? FROM n1_decks WHERE key = ?
              ON CONFLICT(key) DO UPDATE SET deck_id = excluded.deck_id, ord = excluded.ord, passage = excluded.passage,
              prompt = excluded.prompt, options = excluded.options, answer = excluded.answer, explanation = excluded.explanation,
              tag = excluded.tag, audio_url = excluded.audio_url`,
        params: [q.key, i, q.passage ?? null, q.prompt, JSON.stringify(q.options), q.answer, q.explanation ?? null, q.tag ?? null, q.audioUrl ?? null, d.key],
      });
    });
  }
  await db.batch(stmts);
  return res;
}

/** Remove every imported N1 deck together with its progress. */
export async function deleteAllN1(db: Database): Promise<void> {
  await db.batch([
    { sql: 'DELETE FROM n1_attempts' },
    { sql: 'DELETE FROM n1_card_states' },
    { sql: 'DELETE FROM n1_questions' },
    { sql: 'DELETE FROM n1_cards' },
    { sql: 'DELETE FROM n1_decks' },
  ]);
}
