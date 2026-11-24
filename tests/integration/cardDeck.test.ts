import { describe, expect, it } from 'vitest';
import { memoryDb, seedFile } from '../helpers/db';
import { importSeed } from '../../src/core/seed/importer';
import { buildCardDeck } from '../../src/core/study/cardDeck';
import { listVocabulary, setFavorite, setHidden } from '../../src/core/vocabulary/repository';
import { rateWord } from '../../src/core/srs/reviewService';

const T0 = new Date('2026-11-24T09:00:00');

describe('floating card deck', () => {
  it('smart deck: due words first, respects daily new limit, never empty', async () => {
    const db = await memoryDb();
    await importSeed(db, seedFile(30), { now: T0 });
    const words = await listVocabulary(db);
    await rateWord(db, words[0].id, 3, 'card', T0);
    const later = new Date(T0.getTime() + 20 * 86400000);
    const deck = await buildCardDeck(db, 'smart', 5, [], later);
    expect(deck[0].id).toBe(words[0].id);
    expect(deck.filter((w) => w.review!.state === 0).length).toBeGreaterThanOrEqual(5);
    const none = await buildCardDeck(db, 'smart', 0, [], later);
    expect(none.length).toBeGreaterThan(0);
  });

  it('favorites deck and hidden words', async () => {
    const db = await memoryDb();
    await importSeed(db, seedFile(10), { now: T0 });
    const [a, b, c] = await listVocabulary(db);
    await setFavorite(db, a.id, true);
    await setFavorite(db, b.id, true);
    await setHidden(db, b.id, true);
    const deck = await buildCardDeck(db, 'favorites', 20, [], T0);
    expect(deck.map((w) => w.id)).toEqual([a.id]);
    const smart = await buildCardDeck(db, 'smart', 20, [c.id], T0);
    expect(smart.map((w) => w.id)).not.toContain(b.id);
    expect(smart.map((w) => w.id)).not.toContain(c.id);
  });
});
