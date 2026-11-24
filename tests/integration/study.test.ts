import { describe, expect, it } from 'vitest';
import { memoryDb, seedFile } from '../helpers/db';
import { importSeed } from '../../src/core/seed/importer';
import { buildQueue, maskTarget } from '../../src/core/study/modes';
import { rateWord } from '../../src/core/srs/reviewService';
import { getDashboardStats, computeStreak, getDailyActivity } from '../../src/core/stats/stats';
import { listVocabulary } from '../../src/core/vocabulary/repository';

const T0 = new Date('2026-11-24T09:00:00');

describe('study engine', () => {
  it('Again brings the word back soon, Easy pushes it far', async () => {
    const db = await memoryDb();
    await importSeed(db, seedFile(5), { now: T0 });
    const [a, b] = await listVocabulary(db);
    const sa = await rateWord(db, a.id, 1, 'test', T0);
    const sb = await rateWord(db, b.id, 4, 'test', T0);
    expect(new Date(sa.due).getTime() - T0.getTime()).toBeLessThan(15 * 60000);
    expect(new Date(sb.due).getTime() - T0.getTime()).toBeGreaterThan(86400000);
  });

  it('daily queue: due first, then new words limited by newPerDay', async () => {
    const db = await memoryDb();
    await importSeed(db, seedFile(40), { now: T0 });
    const words = await listVocabulary(db);
    for (const w of words.slice(0, 3)) await rateWord(db, w.id, 3, 'daily', T0);
    const later = new Date(T0.getTime() + 30 * 86400000);
    const q = await buildQueue(db, 'daily', { now: later, newPerDay: 5 });
    expect(q.slice(0, 3).every((v) => v.review!.state !== 0)).toBe(true);
    expect(q.filter((v) => v.review!.state === 0)).toHaveLength(5);
  });

  it('quick5 returns 5, weak mode returns lapsed words', async () => {
    const db = await memoryDb();
    await importSeed(db, seedFile(20), { now: T0 });
    expect(await buildQueue(db, 'quick5', { now: T0 })).toHaveLength(5);
    const [w] = await listVocabulary(db);
    let t = T0;
    for (const r of [3, 1, 3, 1, 3] as const) {
      await rateWord(db, w.id, r, 'test', t);
      t = new Date(t.getTime() + 10 * 86400000);
    }
    const weak = await buildQueue(db, 'weak', { now: t });
    expect(weak.map((v) => v.id)).toContain(w.id);
  });

  it('context mode masks the target expression, also for conjugated forms', () => {
    expect(maskTarget('要件について、事前に認識合わせを行いましょう。', '認識合わせ')).toEqual({
      text: '要件について、事前に＿＿＿を行いましょう。',
      masked: true,
    });
    expect(maskTarget('業務フローに落とし込んでください。', '落とし込む').masked).toBe(true);
    expect(maskTarget('全く関係ない文', '冪等性').masked).toBe(false);
  });

  it('stats & streak', async () => {
    const db = await memoryDb();
    await importSeed(db, seedFile(10), { now: T0 });
    const words = await listVocabulary(db);
    await rateWord(db, words[0].id, 3, 'quick5', new Date(T0.getTime() - 86400000));
    await rateWord(db, words[1].id, 3, 'quick5', T0);
    const s = await getDashboardStats(db, T0);
    expect(s.total).toBe(10);
    expect(s.streak).toBe(2);
    expect(s.reviewedToday).toBe(1);
    expect(s.newCount).toBe(8);
    expect(computeStreak([], T0)).toBe(0);
    const act = await getDailyActivity(db, 7, T0);
    expect(act).toHaveLength(7);
    expect(act[6].reviews).toBe(1);
  });
});
