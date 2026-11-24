import type { Database } from '../db/types';
import type { VocabWithReview } from '../vocabulary/types';
import { buildQueue } from './modes';

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
  const daily = deck === 'smart' ? await buildQueue(db, 'daily', { newPerDay, limit: 40, excludeIds: exclude, now }) : [];
  if (daily.length >= 5) return daily;
  const more = await buildQueue(db, 'ja_vi', { deck, limit: 40, excludeIds: [...exclude, ...daily.map((d) => d.id)], now });
  return [...daily, ...more];
}
