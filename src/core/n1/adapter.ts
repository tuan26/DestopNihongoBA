import type { VocabWithReview } from '../vocabulary/types';
import { isKana } from '../vocabulary/normalize';
import { splitBack, type N1Card } from './cards';

/**
 * N1 flashcards live in their own tables. To reuse the floating card and the games, they are exposed as
 * vocabulary-shaped objects whose id is offset so it can never collide with a BA vocabulary id.
 */
export const N1_ID_OFFSET = 1_000_000_000;
export const isN1WordId = (id: number) => id >= N1_ID_OFFSET;
export const n1CardIdOf = (wordId: number) => wordId - N1_ID_OFFSET;

const JA = /[぀-ヿ一-鿿]/;

export function n1CardToWord(c: N1Card): VocabWithReview {
  const { meaning, details } = splitBack(c.back);
  let lines = details.split('\n').map((l) => l.trim()).filter(Boolean);
  let reading = c.reading ?? '';
  // many cards store the reading as the last line of the back ("rung, lắc\nゆする")
  if (!reading && lines.length && isKana(lines[lines.length - 1]) && lines[lines.length - 1].length < 40) {
    reading = lines[lines.length - 1];
    lines = lines.slice(0, -1);
  }
  const exIdx = lines.findIndex((l) => JA.test(l) && l.length >= 6);
  const exampleJa = exIdx >= 0 ? lines[exIdx].replace(/^[「『]|[」』]$/g, '') : null;
  const exampleVi = exIdx >= 0 && lines[exIdx + 1] && !JA.test(lines[exIdx + 1]) ? lines[exIdx + 1].replace(/^[（(]|[）)]$/g, '') : null;
  const now = new Date(0).toISOString();
  return {
    id: N1_ID_OFFSET + c.id,
    seed_id: null,
    japanese: c.front,
    reading,
    vietnamese: meaning,
    example_ja: exampleJa,
    example_vi: exampleVi,
    category: c.course ?? 'N1',
    subcategory: c.deckTitle,
    difficulty: 'advanced',
    jlpt_level: 'N1',
    part_of_speech: null,
    usage_note: null,
    register: null,
    tags: ['n1'],
    source: 'import',
    source_type: null,
    source_reference: null,
    dataset_version: null,
    normalized_key: c.front,
    note: null,
    is_favorite: false,
    is_hidden: false,
    user_modified: false,
    created_at: now,
    updated_at: now,
    review: c.state ? { ...c.state, vocabulary_id: N1_ID_OFFSET + c.id } : null,
  };
}
