import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { memoryDb, reopen } from '../helpers/db';
import { importSeed } from '../../src/core/seed/importer';
import { countVocabulary, listVocabulary } from '../../src/core/vocabulary/repository';
import { getDashboardStats } from '../../src/core/stats/stats';
import { buildQueue } from '../../src/core/study/modes';
import { rateWord } from '../../src/core/srs/reviewService';
import type { SeedFile } from '../../src/core/vocabulary/types';
import { validateDataset } from '../../scripts/validate-vocabulary';

const seed: SeedFile = JSON.parse(readFileSync(join(__dirname, '../../data/vocabulary/seed-v1.json'), 'utf8'));

describe('real seed dataset (data/vocabulary/seed-v1.json)', () => {
  it('passes the validator with exactly 1000 entries', () => {
    const r = validateDataset(seed);
    expect(r.total).toBe(1000);
    expect(r.errors).toEqual([]);
  });

  it('first run imports 1000 words, all New; re-import is a no-op; progress survives restart', async () => {
    const db = await memoryDb();
    const t0 = performance.now();
    const res = await importSeed(db, seed);
    const ms = performance.now() - t0;
    expect(res).toMatchObject({ inserted: 1000, skipped: false });
    expect(ms).toBeLessThan(5000);
    expect(await countVocabulary(db)).toBe(1000);
    const s = await getDashboardStats(db);
    expect(s.newCount).toBe(1000);
    expect(s.review + s.learning).toBe(0);

    const q = await buildQueue(db, 'quick10');
    for (const w of q) await rateWord(db, w.id, 3, 'quick10');
    expect((await importSeed(db, seed)).skipped).toBe(true);

    const restarted = await reopen(db);
    expect(await countVocabulary(restarted)).toBe(1000);
    const studied = (await listVocabulary(restarted)).filter((v) => v.review!.reps > 0);
    expect(studied).toHaveLength(10);
  });

  it('every themed study mode has words and search is fast', async () => {
    const db = await memoryDb();
    await importSeed(db, seed);
    for (const m of ['ba_meeting', 'business', 'it_advanced', 'kanji', 'context', 'vi_ja', 'random'] as const) {
      expect((await buildQueue(db, m)).length).toBeGreaterThan(5);
    }
    const t0 = performance.now();
    const hits = await listVocabulary(db, { text: 'にんしき' });
    expect(performance.now() - t0).toBeLessThan(300);
    expect(hits.map((h) => h.japanese)).toContain('認識合わせ');
  });
});
