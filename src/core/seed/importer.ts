import type { Database, Statement } from '../db/types';
import { nowIso } from '../db/types';
import { normalizeKey } from '../vocabulary/normalize';
import type { SeedEntry, SeedFile } from '../vocabulary/types';
import { createNewReviewState } from '../srs/scheduler';

export interface SeedImportResult {
  version: string;
  skipped: boolean;
  inserted: number;
  updated: number;
  preservedUserModified: number;
  total: number;
}

const CONTENT = (e: SeedEntry) => [
  e.japanese,
  e.reading,
  e.vietnamese,
  e.example_ja,
  e.example_vi,
  e.category,
  e.subcategory ?? null,
  e.difficulty,
  e.jlpt_level,
  e.part_of_speech ?? null,
  e.usage_note ?? null,
  e.register ?? null,
  JSON.stringify(e.tags ?? []),
  e.source_type,
  e.source_reference ?? null,
  e.dataset_version,
  normalizeKey(e.japanese),
];

export async function importedVersions(db: Database): Promise<string[]> {
  const rows = await db.select<{ version: string }>('SELECT version FROM dataset_versions ORDER BY imported_at');
  return rows.map((r) => r.version);
}

/**
 * Idempotent seed import / upgrade.
 * - New seed ids are inserted with a fresh "New" review state (nothing is marked as learned).
 * - Existing seed rows are updated only when the user never edited them (`user_modified = 0`).
 * - Learning progress, notes, favorites, hidden flags and personal words are never touched.
 * - Seed rows absent from a newer dataset are kept (progress preserved).
 */
export async function importSeed(
  db: Database,
  seed: SeedFile,
  opts: { now?: Date; beforeUpgrade?: () => Promise<void> } = {},
): Promise<SeedImportResult> {
  const now = opts.now ?? new Date();
  const versions = await importedVersions(db);
  const existing = await db.select<{ seed_id: string; user_modified: number; dataset_version: string | null }>(
    'SELECT seed_id, user_modified, dataset_version FROM vocabulary WHERE seed_id IS NOT NULL',
  );
  const bySeed = new Map(existing.map((r) => [r.seed_id, r]));
  const alreadyComplete =
    versions.includes(seed.dataset_version) && seed.entries.every((e) => bySeed.has(e.id));
  if (alreadyComplete) {
    return { version: seed.dataset_version, skipped: true, inserted: 0, updated: 0, preservedUserModified: 0, total: seed.entries.length };
  }
  if (existing.length > 0 && opts.beforeUpgrade) await opts.beforeUpgrade();

  const ts = nowIso(now);
  const stmts: Statement[] = [];
  let inserted = 0;
  let updated = 0;
  let preserved = 0;
  for (const e of seed.entries) {
    const cur = bySeed.get(e.id);
    if (!cur) {
      inserted++;
      stmts.push({
        sql: `INSERT INTO vocabulary (japanese, reading, vietnamese, example_ja, example_vi, category, subcategory, difficulty,
          jlpt_level, part_of_speech, usage_note, register, tags, source_type, source_reference, dataset_version, normalized_key,
          seed_id, source, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'seed', ?, ?)
          ON CONFLICT(seed_id) DO NOTHING`,
        params: [...CONTENT(e), e.id, ts, ts],
      });
      const s = createNewReviewState(0, now);
      stmts.push({
        sql: `INSERT OR IGNORE INTO review_states (vocabulary_id, due, stability, difficulty, elapsed_days, scheduled_days,
          learning_steps, reps, lapses, state) SELECT id, ?, 0, 0, 0, 0, 0, 0, 0, 0 FROM vocabulary WHERE seed_id = ?`,
        params: [s.due, e.id],
      });
    } else if (cur.user_modified) {
      preserved++;
    } else if (cur.dataset_version !== e.dataset_version) {
      updated++;
      stmts.push({
        sql: `UPDATE vocabulary SET japanese = ?, reading = ?, vietnamese = ?, example_ja = ?, example_vi = ?, category = ?,
          subcategory = ?, difficulty = ?, jlpt_level = ?, part_of_speech = ?, usage_note = ?, register = ?, tags = ?,
          source_type = ?, source_reference = ?, dataset_version = ?, normalized_key = ?, updated_at = ?
          WHERE seed_id = ? AND user_modified = 0`,
        params: [...CONTENT(e), ts, e.id],
      });
    }
  }
  stmts.push({
    sql: `INSERT INTO dataset_versions (version, entry_count, inserted, updated, imported_at) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(version) DO UPDATE SET entry_count = excluded.entry_count, inserted = excluded.inserted,
      updated = excluded.updated, imported_at = excluded.imported_at`,
    params: [seed.dataset_version, seed.entries.length, inserted, updated, ts],
  });
  await db.batch(stmts);
  return { version: seed.dataset_version, skipped: false, inserted, updated, preservedUserModified: preserved, total: seed.entries.length };
}
