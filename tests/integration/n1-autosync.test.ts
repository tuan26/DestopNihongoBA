import { describe, expect, it, vi } from 'vitest';
import { memoryDb } from '../helpers/db';
import { syncN1, getN1Source, N1_AUTO_KEY, type N1FileIO } from '../../src/core/n1/autoSync';
import { setKv } from '../../src/core/settings/settings';
import { n1Stats } from '../../src/core/n1/practice';
import { buildN1CardQueue, rateN1Card } from '../../src/core/n1/cards';

const crawler = (cards: number) =>
  JSON.stringify({
    courses: [{ id: 'c', title: 'Khóa thử' }],
    sections: [{ id: 's', course_id: 'c', title: 'P1', order: 1 }],
    lessons: [{ id: 'l', section_id: 's', api_id: 'L', title: 'FC', type: 'FLASH_CARD', order: 1 }],
    resources: [{ id: 'r', lesson_id: 'l', type: 'FLASH_CARD', raw_data: { items: Array.from({ length: cards }, (_, i) => ({ id: `k${i}`, front: `語${i}`, back: `nghĩa ${i}` })) } }],
  });

function fakeIO(files: Record<string, { text: string; modified: number }>) {
  const io: N1FileIO = {
    find: vi.fn(async () => Object.entries(files).map(([path, f]) => ({ path, size: f.text.length, modified: f.modified }))),
    modified: vi.fn(async (p: string) => files[p]?.modified ?? null),
    read: vi.fn(async (p: string) => files[p].text),
    backup: vi.fn(async () => null),
  };
  return io;
}

describe('N1 auto sync from the user\'s own file', () => {
  it('finds and imports on first run, then only re-imports when the file changes, keeping progress', async () => {
    const db = await memoryDb();
    const files = { 'C:/Users/me/crawler/n1_data.json': { text: crawler(5), modified: 100 } };
    const io = fakeIO(files);
    expect(await syncN1(db, io)).toMatchObject({ status: 'imported', reason: 'first' });
    expect(io.backup).toHaveBeenCalledOnce();
    expect((await getN1Source(db))?.path).toBe('C:/Users/me/crawler/n1_data.json');

    const [c] = await buildN1CardQueue(db);
    await rateN1Card(db, c.id, 3);
    expect(await syncN1(db, io)).toMatchObject({ status: 'unchanged' });

    files['C:/Users/me/crawler/n1_data.json'] = { text: crawler(8), modified: 200 };
    expect(await syncN1(db, io)).toMatchObject({ status: 'imported', reason: 'changed' });
    expect(await n1Stats(db)).toMatchObject({ cards: 8, cardsStudied: 1 });
  });

  it('searches at most once a day when nothing is found, and reports bad files', async () => {
    const db = await memoryDb();
    const io = fakeIO({});
    const t = new Date('2026-11-27T08:00:00Z');
    expect(await syncN1(db, io, { now: t })).toEqual({ status: 'not-found' });
    expect(await syncN1(db, io, { now: new Date(t.getTime() + 3600_000) })).toEqual({ status: 'skipped' });
    expect(io.find).toHaveBeenCalledTimes(1);
    expect(await syncN1(db, io, { search: 'always', now: t })).toEqual({ status: 'not-found' });

    // after the user deletes N1 data on purpose, startup sync stays off until they search again
    await setKv(db, N1_AUTO_KEY, false);
    const files2 = fakeIO({ 'y/n1_data.json': { text: crawler(2), modified: 5 } });
    expect(await syncN1(db, files2, { now: new Date(t.getTime() + 3 * 86400000) })).toEqual({ status: 'skipped' });
    expect(await syncN1(db, files2, { search: 'always' })).toMatchObject({ status: 'imported' });

    const bad = fakeIO({ 'x/n1_data.json': { text: '{"nope":1}', modified: 1 } });
    expect(await syncN1(await memoryDb(), bad, { search: 'always' })).toMatchObject({ status: 'error' });
  });
});
