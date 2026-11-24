# Data Model

## 1. Seed dataset entry (`data/vocabulary/seed-v1.json`)

JSON Schema: [contracts/vocabulary-seed.schema.json](./contracts/vocabulary-seed.schema.json)

```jsonc
{
  "dataset_version": "1.0.0",
  "created_at": "2026-11-24",
  "entries": [{
    "id": "swe-api-0001",            // stable: <category-code>-<seq 4 số>, không đổi giữa các version
    "japanese": "冪等性",
    "reading": "べきとうせい",
    "vietnamese": "Tính idempotent — …",
    "example_ja": "このAPIは冪等性を保証する必要があります。",
    "example_vi": "API này cần đảm bảo tính idempotent.",
    "category": "Software Engineering",
    "subcategory": "API Design",
    "difficulty": "advanced",          // intermediate | advanced | expert
    "jlpt_level": "technical",         // N2 | N1 | business | technical | unknown
    "part_of_speech": "noun",
    "usage_note": "…",                 // nullable
    "register": "technical",           // formal | business | technical | neutral
    "tags": ["api", "design"],
    "source_type": "AI-generated",     // AI-generated | researched | curated
    "source_reference": null,          // chỉ có khi đối chiếu thật
    "created_at": "2026-11-24",
    "dataset_version": "1.0.0"
  }]
}
```

Category codes: `ba` BA/Requirement Engineering (180), `biz` Japanese Business/Communication (150), `pm` Project Management (120),
`swe` Software Engineering (150), `arch` System Architecture/Design (100), `db` Database/Data Engineering (80),
`cloud` Cloud/DevOps/Infrastructure (80), `qa` Testing/QA (60), `sec` Security (40), `gen` Advanced General Business Japanese (40).

## 2. SQLite schema (migration 001)

```sql
CREATE TABLE vocabulary (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  seed_id          TEXT UNIQUE,                 -- id trong seed; NULL với từ cá nhân
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
  tags             TEXT NOT NULL DEFAULT '[]',  -- JSON array
  source           TEXT NOT NULL,               -- seed | user | import | ai
  source_type      TEXT,                        -- AI-generated | researched | curated | user
  source_reference TEXT,
  dataset_version  TEXT,
  normalized_key   TEXT NOT NULL,               -- NFKC(japanese) bỏ khoảng trắng → phát hiện trùng
  note             TEXT,
  is_favorite      INTEGER NOT NULL DEFAULT 0,
  is_hidden        INTEGER NOT NULL DEFAULT 0,
  user_modified    INTEGER NOT NULL DEFAULT 0,  -- 1 khi người dùng sửa nội dung seed
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL
);
CREATE INDEX idx_vocab_norm ON vocabulary(normalized_key);
CREATE INDEX idx_vocab_cat ON vocabulary(category);

CREATE TABLE review_states (
  vocabulary_id   INTEGER PRIMARY KEY REFERENCES vocabulary(id) ON DELETE CASCADE,
  due             TEXT NOT NULL,      -- ISO
  stability       REAL NOT NULL DEFAULT 0,
  difficulty      REAL NOT NULL DEFAULT 0,
  elapsed_days    INTEGER NOT NULL DEFAULT 0,
  scheduled_days  INTEGER NOT NULL DEFAULT 0,
  learning_steps  INTEGER NOT NULL DEFAULT 0,
  reps            INTEGER NOT NULL DEFAULT 0,
  lapses          INTEGER NOT NULL DEFAULT 0,
  state           INTEGER NOT NULL DEFAULT 0,  -- 0 New, 1 Learning, 2 Review, 3 Relearning
  last_review     TEXT,
  last_rating     INTEGER
);
CREATE INDEX idx_review_due ON review_states(due);

CREATE TABLE review_logs (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  vocabulary_id  INTEGER NOT NULL REFERENCES vocabulary(id) ON DELETE CASCADE,
  rating         INTEGER NOT NULL,    -- 1 Again, 2 Hard, 3 Good, 4 Easy
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

CREATE TABLE collections (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, description TEXT, created_at TEXT NOT NULL);
CREATE TABLE collection_items (
  collection_id INTEGER NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
  vocabulary_id INTEGER NOT NULL REFERENCES vocabulary(id) ON DELETE CASCADE,
  added_at TEXT NOT NULL,
  PRIMARY KEY (collection_id, vocabulary_id)
);

CREATE TABLE ai_suggestions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  batch_id TEXT NOT NULL,
  payload TEXT NOT NULL,              -- JSON entry theo schema
  normalized_key TEXT NOT NULL,
  duplicate_of INTEGER,               -- vocabulary.id nếu trùng
  status TEXT NOT NULL DEFAULT 'pending',  -- pending | approved | rejected
  provider TEXT, model TEXT, topic TEXT,
  trigger TEXT NOT NULL DEFAULT 'manual',  -- manual | daily | weekly
  created_at TEXT NOT NULL, decided_at TEXT
);

CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE dataset_versions (version TEXT PRIMARY KEY, entry_count INTEGER NOT NULL, inserted INTEGER, updated INTEGER, imported_at TEXT NOT NULL);
CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL);
```

## 3. Quy tắc & chuyển trạng thái

- **Source**: `seed` (không xóa cứng, chỉ `is_hidden`), `user`/`import`/`ai` (xóa cứng được, có xác nhận).
- **Sửa từ seed** → `user_modified = 1` → nâng cấp dataset bỏ qua entry đó.
- **ReviewState**: tạo cùng lúc với vocabulary (state New, due = now). FSRS: New → Learning → Review ⇄ Relearning.
- **Weak word**: `lapses >= 2` hoặc `last_rating = 1` trong 14 ngày, hoặc (`difficulty >= 7` và state ≠ New).
- **AiSuggestion**: pending → approved (tạo vocabulary `source=ai`, `source_type=AI-generated`) | rejected.
- **Streak**: số ngày liên tiếp (theo giờ địa phương) tính đến hôm nay/hôm qua có ≥ 1 review_log.

## 4. Settings keys (JSON value)

`card.mode` (`ja|ja_reading|reveal|example|compact|mini`), `card.opacity` (0.3–1), `card.locked`, `card.defaultPosition`
(`top-left|top-right|bottom-left|bottom-right`), `card.bounds` {x,y,w,h}, `card.visible`, `card.autoAdvanceSec` (0 = tắt),
`card.deck` (`smart|favorites|weak|category:<name>|collection:<id>`), `shortcut.enabled`, `shortcut.toggleCard` (mặc định `Ctrl+Alt+J`),
`app.autostart`, `ui.theme` (`system|light|dark`), `ui.fontScale` (0.85–1.4), `study.newPerDay` (20), `study.retention` (0.9),
`ai.provider` (`anthropic|openai`), `ai.model`, `ai.schedule` (`manual|daily|weekly`), `ai.scheduleTopic`, `ai.lastRunAt`.
