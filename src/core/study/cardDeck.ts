import type { Database } from '../db/types';
import type { VocabWithReview } from '../vocabulary/types';
import { buildQueue } from './modes';
import { buildN1CardQueue, listN1Cards } from '../n1/cards';
import { N1_ID_OFFSET, isN1WordId, n1CardToWord } from '../n1/adapter';

/**
 * Deck shown on the floating card: due reviews first, then new words within the daily limit (smart deck),
 * then — so the card never runs dry — the least-stable learned words of the selected deck.
 */
export async function buildCardDeck(
  db: Database,
  deck: string,
  newPerDay: number,
  exclude: number[] = [],
  now = new Date(),
): Promise<VocabWithReview[]> {
  if (deck === 'n1') return n1Deck(db, exclude, now);
  if (deck === 'mixed') {
    const [ba, n1] = await Promise.all([buildCardDeck(db, 'smart', newPerDay, exclude, now), n1Deck(db, exclude, now)]);
    const out: VocabWithReview[] = [];
    for (let i = 0; i < Math.max(ba.length, n1.length); i++) {
      if (ba[i]) out.push(ba[i]);
      if (n1[i]) out.push(n1[i]);
    }
    return out;
  }
  const daily = deck === 'smart' ? await buildQueue(db, 'daily', { newPerDay, limit: 40, excludeIds: exclude, now }) : [];
  if (daily.length >= 5) return daily;
  const more = await buildQueue(db, 'ja_vi', { deck, limit: 40, excludeIds: [...exclude, ...daily.map((d) => d.id)], now });
  return [...daily, ...more];
}

/** N1 flashcards for the floating card: due + today's new N1 cards, topped up with random N1 cards so the card never runs dry. */
async function n1Deck(db: Database, exclude: number[], now: Date): Promise<VocabWithReview[]> {
  const ex = exclude.filter(isN1WordId).map((id) => id - N1_ID_OFFSET);
  const queue = (await buildN1CardQueue(db, { now, limit: 40 })).filter((c) => !ex.includes(c.id));
  const filler = queue.length >= 10 ? [] : await listN1Cards(db, { limit: 30, exclude: [...ex, ...queue.map((c) => c.id)] });
  return [...queue, ...filler].map(n1CardToWord);
}
