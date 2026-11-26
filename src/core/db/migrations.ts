import type { Database } from './types';
import { nowIso } from './types';

export interface Migration {
  version: number;
  name: string;
  sql: string;
}

export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: 'initial_schema',
    sql: `
CREATE TABLE vocabulary (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  seed_id          TEXT UNIQUE,
  japanese         TEXT NOT NULL,
  reading          TEXT NOT NULL,
  vietnamese       TEXT NOT NULL,
  example_ja       TEXT,
  example_vi       TEXT,
  category         TEXT NOT NULL,
  subcategory      TEXT,
  difficulty       TEXT NOT NULL DEFAULT 'intermediate',
  jlpt_level       TEXT NOT NULL DEFAULT 'unknown',
  part_of_speech   TEXT,
  usage_note       TEXT,
  register         TEXT,
  tags             TEXT NOT NULL DEFAULT '[]',
  source           TEXT NOT NULL,
  source_type      TEXT,
  source_reference TEXT,
  dataset_version  TEXT,
  normalized_key   TEXT NOT NULL,
  note             TEXT,
  is_favorite      INTEGER NOT NULL DEFAULT 0,
  is_hidden        INTEGER NOT NULL DEFAULT 0,
  user_modified    INTEGER NOT NULL DEFAULT 0,
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL
);
CREATE INDEX idx_vocab_norm ON vocabulary(normalized_key);
CREATE INDEX idx_vocab_cat ON vocabulary(category);

CREATE TABLE review_states (
  vocabulary_id   INTEGER PRIMARY KEY REFERENCES vocabulary(id) ON DELETE CASCADE,
  due             TEXT NOT NULL,
  stability       REAL NOT NULL DEFAULT 0,
  difficulty      REAL NOT NULL DEFAULT 0,
  elapsed_days    INTEGER NOT NULL DEFAULT 0,
  scheduled_days  INTEGER NOT NULL DEFAULT 0,
  learning_steps  INTEGER NOT NULL DEFAULT 0,
  reps            INTEGER NOT NULL DEFAULT 0,
  lapses          INTEGER NOT NULL DEFAULT 0,
  state           INTEGER NOT NULL DEFAULT 0,
  last_review     TEXT,
  last_rating     INTEGER
);
CREATE INDEX idx_review_due ON review_states(due);

CREATE TABLE review_logs (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  vocabulary_id  INTEGER NOT NULL REFERENCES vocabulary(id) ON DELETE CASCADE,
  rating         INTEGER NOT NULL,
  state_before   INTEGER NOT NULL,
  due_before     TEXT,
  due_after      TEXT NOT NULL,
  stability      REAL,
  difficulty     REAL,
  elapsed_days   INTEGER,
  scheduled_days INTEGER,
  mode           TEXT NOT NULL,
  reviewed_at    TEXT NOT NULL
);
CREATE INDEX idx_logs_time ON review_logs(reviewed_at);
CREATE INDEX idx_logs_vocab ON review_logs(vocabulary_id);

CREATE TABLE collections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE collection_items (
  collection_id INTEGER NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
  vocabulary_id INTEGER NOT NULL REFERENCES vocabulary(id) ON DELETE CASCADE,
  added_at TEXT NOT NULL,
  PRIMARY KEY (collection_id, vocabulary_id)
);

CREATE TABLE ai_suggestions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  batch_id TEXT NOT NULL,
  payload TEXT NOT NULL,
  normalized_key TEXT NOT NULL,
  duplicate_of INTEGER,
  status TEXT NOT NULL DEFAULT 'pending',
  provider TEXT,
  model TEXT,
  topic TEXT,
  trigger TEXT NOT NULL DEFAULT 'manual',
  created_at TEXT NOT NULL,
  decided_at TEXT
);
CREATE INDEX idx_ai_status ON ai_suggestions(status);

CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE dataset_versions (
  version TEXT PRIMARY KEY,
  entry_count INTEGER NOT NULL,
  inserted INTEGER,
  updated INTEGER,
  imported_at TEXT NOT NULL
);
`,
  },
  {
    version: 2,
    name: 'quiz_results',
    sql: `
CREATE TABLE quiz_results (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  game        TEXT NOT NULL,
  variant     TEXT,
  source      TEXT,
  score       INTEGER NOT NULL,
  correct     INTEGER NOT NULL,
  total       INTEGER NOT NULL,
  duration_ms INTEGER NOT NULL,
  wrong_ids   TEXT NOT NULL DEFAULT '[]',
  played_at   TEXT NOT NULL
);
CREATE INDEX idx_quiz_game ON quiz_results(game, score);
`,
  },
  {
    version: 3,
    name: 'n1_decks',
    sql: `
CREATE TABLE n1_decks (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  key         TEXT NOT NULL UNIQUE,
  pack        TEXT NOT NULL,
  kind        TEXT NOT NULL,
  title       TEXT NOT NULL,
  course      TEXT,
  section     TEXT,
  ord         INTEGER NOT NULL DEFAULT 0,
  imported_at TEXT NOT NULL
);
CREATE TABLE n1_cards (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  deck_id  INTEGER NOT NULL REFERENCES n1_decks(id) ON DELETE CASCADE,
  key      TEXT NOT NULL UNIQUE,
  front    TEXT NOT NULL,
  back     TEXT NOT NULL,
  reading  TEXT,
  ord      INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_n1_cards_deck ON n1_cards(deck_id);
CREATE TABLE n1_card_states (
  card_id         INTEGER PRIMARY KEY REFERENCES n1_cards(id) ON DELETE CASCADE,
  due             TEXT NOT NULL,
  stability       REAL NOT NULL DEFAULT 0,
  difficulty      REAL NOT NULL DEFAULT 0,
  elapsed_days    INTEGER NOT NULL DEFAULT 0,
  scheduled_days  INTEGER NOT NULL DEFAULT 0,
  learning_steps  INTEGER NOT NULL DEFAULT 0,
  reps            INTEGER NOT NULL DEFAULT 0,
  lapses          INTEGER NOT NULL DEFAULT 0,
  state           INTEGER NOT NULL DEFAULT 0,
  last_review     TEXT,
  last_rating     INTEGER,
  first_studied   TEXT
);
CREATE INDEX idx_n1_states_due ON n1_card_states(due);
CREATE TABLE n1_questions (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  deck_id     INTEGER NOT NULL REFERENCES n1_decks(id) ON DELETE CASCADE,
  key         TEXT NOT NULL UNIQUE,
  ord         INTEGER NOT NULL DEFAULT 0,
  passage     TEXT,
  prompt      TEXT NOT NULL,
  options     TEXT NOT NULL,
  answer      INTEGER NOT NULL,
  explanation TEXT,
  tag         TEXT,
  audio_url   TEXT
);
CREATE INDEX idx_n1_questions_deck ON n1_questions(deck_id);
CREATE TABLE n1_attempts (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  question_id INTEGER NOT NULL REFERENCES n1_questions(id) ON DELETE CASCADE,
  chosen      INTEGER NOT NULL,
  correct     INTEGER NOT NULL,
  answered_at TEXT NOT NULL
);
CREATE INDEX idx_n1_attempts_q ON n1_attempts(question_id, id);
`,
  },
];

const splitStatements = (sql: string) =>
  sql
    .split(/;\s*\n/)
    .map((s) => s.trim())
    .filter(Boolean);

export async function getAppliedVersions(db: Database): Promise<number[]> {
  await db.execute(
    'CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL)',
  );
  const rows = await db.select<{ version: number }>('SELECT version FROM schema_migrations ORDER BY version');
  return rows.map((r) => r.version);
}

export async function pendingMigrations(db: Database, migrations = MIGRATIONS): Promise<Migration[]> {
  const applied = new Set(await getAppliedVersions(db));
  return migrations.filter((m) => !applied.has(m.version)).sort((a, b) => a.version - b.version);
}

/**
 * Apply pending migrations; each one in its own transaction.
 * `beforeMigrate` is invoked once (e.g. to back up the DB file) only when at least one migration is pending
 * AND the database already contained applied migrations (i.e. it's an upgrade, not a fresh install).
 */
export async function runMigrations(
  db: Database,
  opts: { migrations?: Migration[]; beforeMigrate?: () => Promise<void> } = {},
): Promise<number[]> {
  const migrations = opts.migrations ?? MIGRATIONS;
  const applied = await getAppliedVersions(db);
  const pending = await pendingMigrations(db, migrations);
  if (pending.length === 0) return [];
  if (applied.length > 0 && opts.beforeMigrate) await opts.beforeMigrate();
  const done: number[] = [];
  for (const m of pending) {
    await db.transaction(async (tx) => {
      for (const stmt of splitStatements(m.sql)) await tx.execute(stmt);
      await tx.execute('INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)', [
        m.version,
        m.name,
        nowIso(),
      ]);
    });
    done.push(m.version);
  }
  return done;
}
