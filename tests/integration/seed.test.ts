import { describe, expect, it, vi } from 'vitest';
import { memoryDb, reopen, seedFile } from '../helpers/db';
import { importSeed } from '../../src/core/seed/importer';
import { countVocabulary, listVocabulary, updateVocabulary, contentOf, setFavorite } from '../../src/core/vocabulary/repository';
import { rateWord } from '../../src/core/srs/reviewService';

describe('seed importer', () => {
  it('imports entries with New review state and is idempotent', async () => {
    const db = await memoryDb();
    const r1 = await importSeed(db, seedFile(30));
    expect(r1).toMatchObject({ inserted: 30, skipped: false });
    const r2 = await importSeed(db, seedFile(30));
    expect(r2.skipped).toBe(true);
    expect(await countVocabulary(db)).toBe(30);
    const states = await db.select<{ state: number; reps: number }>('SELECT state, reps FROM review_states');
    expect(states).toHaveLength(30);
    expect(states.every((s) => s.state === 0 && s.reps === 0)).toBe(true);
  });

  it('upgrade keeps progress, user edits, favorites and adds new entries', async () => {
    const db = await memoryDb();
    await importSeed(db, seedFile(10));
    const [first, second] = await listVocabulary(db);
    await rateWord(db, first.id, 3, 'test');
    await updateVocabulary(db, second.id, { ...contentOf(second), vietnamese: 'Nghĩa do tôi sửa' });
    await setFavorite(db, first.id, true);

    const backup = vi.fn(async () => {});
    const v2 = seedFile(12, '1.1.0', (i) => ({ vietnamese: `Nghĩa mới ${i}` }));
    const res = await importSeed(db, v2, { beforeUpgrade: backup });
    expect(backup).toHaveBeenCalledOnce();
    expect(res).toMatchObject({ inserted: 2, updated: 9, preservedUserModified: 1 });

    const reopened = await reopen(db);
    const all = await listVocabulary(reopened);
    expect(all).toHaveLength(12);
    const a = all.find((v) => v.id === first.id)!;
    expect(a.vietnamese).toBe('Nghĩa mới 1');
    expect(a.is_favorite).toBe(true);
    expect(a.review!.reps).toBe(1);
    expect(all.find((v) => v.id === second.id)!.vietnamese).toBe('Nghĩa do tôi sửa');
    const logs = await reopened.select('SELECT * FROM review_logs');
    expect(logs).toHaveLength(1);
  });
});
