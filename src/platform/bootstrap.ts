import type { Database } from '../core/db/types';
import { runMigrations } from '../core/db/migrations';
import { importSeed, type SeedImportResult } from '../core/seed/importer';
import type { SeedFile } from '../core/vocabulary/types';
import { isTauri } from './env';
import { backupDatabase } from './native';

let dbPromise: Promise<Database> | null = null;

export function getDatabase(): Promise<Database> {
  dbPromise ??= (async () => {
    if (isTauri()) {
      const { TauriDatabase } = await import('./tauriDb');
      return new TauriDatabase();
    }
    const { openBrowserDatabase } = await import('./browserDb');
    return openBrowserDatabase();
  })();
  return dbPromise;
}

export async function loadSeed(): Promise<SeedFile> {
  const mod = await import('../../data/vocabulary/seed-v1.json');
  return (mod.default ?? mod) as unknown as SeedFile;
}

export interface InitResult {
  db: Database;
  migrated: number[];
  seed: SeedImportResult | null;
  backupPath: string | null;
}

/**
 * First-run / upgrade initialization (run by the main window only in the desktop app):
 * backup → migrations → idempotent seed import.
 */
export async function initializeDatabase(): Promise<InitResult> {
  const db = await getDatabase();
  let backupPath: string | null = null;
  const migrated = await runMigrations(db, {
    beforeMigrate: async () => {
      backupPath = await backupDatabase('pre-migration');
    },
  });
  const seed = await importSeed(db, await loadSeed(), {
    beforeUpgrade: async () => {
      backupPath = (await backupDatabase('pre-dataset-upgrade')) ?? backupPath;
    },
  });
  return { db, migrated, seed, backupPath };
}

/** Card window (desktop): wait until the main window has finished initialization. */
export async function waitForReady(timeoutMs = 30000): Promise<Database> {
  const db = await getDatabase();
  const start = Date.now();
  for (;;) {
    try {
      const r = await db.select<{ n: number }>('SELECT COUNT(*) AS n FROM dataset_versions');
      if (Number(r[0]?.n) > 0) return db;
    } catch {
      /* schema not created yet */
    }
    if (Date.now() - start > timeoutMs) throw new Error('Cơ sở dữ liệu chưa sẵn sàng');
    await new Promise((r) => setTimeout(r, 400));
  }
}
