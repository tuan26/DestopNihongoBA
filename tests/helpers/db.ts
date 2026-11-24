import initSqlJs from 'sql.js';
import { SqlJsDatabase } from '../../src/core/db/sqljs';
import { runMigrations } from '../../src/core/db/migrations';
import type { SeedEntry, SeedFile } from '../../src/core/vocabulary/types';

let SQL: Awaited<ReturnType<typeof initSqlJs>> | null = null;

export async function memoryDb(migrate = true): Promise<SqlJsDatabase> {
  SQL ??= await initSqlJs();
  const db = await SqlJsDatabase.create(SQL);
  if (migrate) await runMigrations(db);
  return db;
}

export async function reopen(db: SqlJsDatabase): Promise<SqlJsDatabase> {
  SQL ??= await initSqlJs();
  return SqlJsDatabase.create(SQL, db.export());
}

export function entry(i: number, over: Partial<SeedEntry> = {}): SeedEntry {
  return {
    id: `ba-test-${String(i).padStart(4, '0')}`,
    japanese: `認識合わせ${i}`,
    reading: 'にんしきあわせ',
    vietnamese: `Thống nhất nhận thức ${i}`,
    example_ja: `要件について認識合わせ${i}を行いましょう。`,
    example_vi: `Hãy thống nhất cách hiểu ${i}.`,
    category: 'BA / Requirement Engineering',
    subcategory: 'Meeting',
    difficulty: 'intermediate',
    jlpt_level: 'business',
    part_of_speech: 'noun',
    usage_note: null,
    register: 'business',
    tags: ['meeting'],
    source_type: 'AI-generated',
    source_reference: null,
    created_at: '2026-11-24',
    dataset_version: '1.0.0',
    ...over,
  };
}

export function seedFile(n: number, version = '1.0.0', over: (i: number) => Partial<SeedEntry> = () => ({})): SeedFile {
  return {
    dataset_version: version,
    created_at: '2026-11-24',
    entries: Array.from({ length: n }, (_, i) => entry(i + 1, { dataset_version: version, ...over(i + 1) })),
  };
}
