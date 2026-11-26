import type { Database } from '../db/types';
import { getKv, setKv } from '../settings/settings';
import { parseImportText } from './crawler';
import { importPack, type PackImportResult } from './importer';
import { validatePack } from './pack';

export interface N1FileIO {
  /** Search the computer for candidate files (best first). */
  find: () => Promise<{ path: string; size: number; modified: number }[]>;
  /** Modification time (unix s) or null when the file is gone. */
  modified: (path: string) => Promise<number | null>;
  read: (path: string) => Promise<string>;
  backup?: (reason: string) => Promise<unknown>;
}

export interface N1Source {
  path: string;
  modified: number;
  importedAt: string;
}

export const N1_SOURCE_KEY = 'n1.source';
export const N1_SEARCHED_KEY = 'n1.searchedAt';
/** false after the user deleted N1 data on purpose: no automatic import until they import/search again. */
export const N1_AUTO_KEY = 'n1.autoSync';

export type SyncOutcome =
  | { status: 'imported'; path: string; result: PackImportResult; reason: 'first' | 'changed' | 'forced' }
  | { status: 'unchanged'; path: string }
  | { status: 'not-found' }
  | { status: 'skipped' }
  | { status: 'error'; path?: string; message: string };

async function deckCount(db: Database) {
  return Number((await db.select<{ n: number }>('SELECT COUNT(*) AS n FROM n1_decks'))[0]?.n ?? 0);
}

export async function getN1Source(db: Database): Promise<N1Source | null> {
  return getKv<N1Source | null>(db, N1_SOURCE_KEY, null);
}

export async function importN1File(db: Database, io: N1FileIO, path: string, modified: number, reason: 'first' | 'changed' | 'forced'): Promise<SyncOutcome> {
  try {
    const text = await io.read(path);
    const pack = parseImportText(text, path.split(/[\\/]/).pop() ?? 'n1_data.json');
    const errs = validatePack(pack);
    if (errs.length) return { status: 'error', path, message: errs[0] };
    await io.backup?.('pre-n1-import');
    const result = await importPack(db, pack);
    await setKv(db, N1_SOURCE_KEY, { path, modified, importedAt: new Date().toISOString() } satisfies N1Source);
    return { status: 'imported', path, result, reason };
  } catch (e) {
    return { status: 'error', path, message: (e as Error).message };
  }
}

/**
 * Keep N1 data in sync with the user's own file:
 * - a remembered source file that changed (or nothing imported yet) is re-imported;
 * - otherwise, when nothing was ever imported, search the computer (at most once a day unless `search: 'always'`).
 * Progress is never lost: import is idempotent.
 */
export async function syncN1(db: Database, io: N1FileIO, opts: { search?: 'always' | 'daily' | 'never'; now?: Date } = {}): Promise<SyncOutcome> {
  const now = opts.now ?? new Date();
  if (opts.search !== 'always' && !(await getKv<boolean>(db, N1_AUTO_KEY, true))) return { status: 'skipped' };
  if (opts.search === 'always') await setKv(db, N1_AUTO_KEY, true);
  const src = await getN1Source(db);
  if (src) {
    const m = await io.modified(src.path);
    if (m != null) {
      if (m > src.modified) return importN1File(db, io, src.path, m, 'changed');
      if ((await deckCount(db)) === 0) return importN1File(db, io, src.path, m, 'forced');
      return { status: 'unchanged', path: src.path };
    }
  }
  if ((await deckCount(db)) > 0 && src) return { status: 'skipped' };
  const mode = opts.search ?? 'daily';
  if (mode === 'never') return { status: 'skipped' };
  if (mode === 'daily') {
    const last = await getKv<string | null>(db, N1_SEARCHED_KEY, null);
    if (last && now.getTime() - new Date(last).getTime() < 86400000) return { status: 'skipped' };
  }
  await setKv(db, N1_SEARCHED_KEY, now.toISOString());
  const found = await io.find();
  if (!found.length) return { status: 'not-found' };
  return importN1File(db, io, found[0].path, found[0].modified, 'first');
}
