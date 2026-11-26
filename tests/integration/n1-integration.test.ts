import { describe, expect, it } from 'vitest';
import { memoryDb, seedFile } from '../helpers/db';
import { importSeed } from '../../src/core/seed/importer';
import { importPack } from '../../src/core/n1/importer';
import type { Pack } from '../../src/core/n1/pack';
import { N1_ID_OFFSET, isN1WordId, n1CardToWord } from '../../src/core/n1/adapter';
import { buildCardDeck } from '../../src/core/study/cardDeck';
import { buildChoiceQuestions, buildMatchBoard, buildTypingQuestions, loadPool } from '../../src/core/quiz/questions';
import { markWrongForReview } from '../../src/core/quiz/results';
import { n1Stats } from '../../src/core/n1/practice';

const pack: Pack = {
  format: 'jbv-pack',
  version: 1,
  name: 'test',
  decks: [
    {
      key: 'kanji',
      kind: 'flashcard',
      title: 'Kanji buổi 1',
      course: 'KANJI',
      cards: Array.from({ length: 12 }, (_, i) => ({ key: `k${i}`, front: `漢字${i}`, back: `nghĩa kanji ${i}\nかんじ${'あいうえおかきくけこさし'[i]}` })),
    },
    {
      key: 'grammar',
      kind: 'flashcard',
      title: 'Ngữ pháp 1',
      course: 'NGỮ PHÁP',
      cards: Array.from({ length: 6 }, (_, i) => ({ key: `g${i}`, front: `〜文法${i}`, back: `ý nghĩa ${i}\n例文です${i}。毎日勉強する。\n(Câu ví dụ ${i})` })),
    },
  ],
};

describe('N1 cards on the floating card and in games', () => {
  it('adapter extracts reading, meaning and example', async () => {
    const db = await memoryDb();
    await importPack(db, pack);
    const words = (await loadPool(db, 'n1')).words;
    const k = words.find((w) => w.japanese === '漢字0')!;
    expect(k).toMatchObject({ reading: 'かんじあ', vietnamese: 'nghĩa kanji 0', category: 'KANJI' });
    expect(isN1WordId(k.id)).toBe(true);
    const g = words.find((w) => w.japanese === '〜文法1')!;
    expect(g.example_ja).toBe('例文です1。毎日勉強する。');
    expect(g.example_vi).toBe('Câu ví dụ 1');
    expect(n1CardToWord({ id: 1, deckId: 1, deckTitle: 'd', course: null, front: 'x', back: 'y', reading: null, state: null }).id).toBe(N1_ID_OFFSET + 1);
  });

  it('card decks: n1 only and mixed with BA words; rating goes to the N1 schedule', async () => {
    const db = await memoryDb();
    await importSeed(db, seedFile(10));
    await importPack(db, pack);
    const n1 = await buildCardDeck(db, 'n1', 20);
    expect(n1.length).toBeGreaterThan(5);
    expect(n1.every((w) => isN1WordId(w.id))).toBe(true);
    const mixed = await buildCardDeck(db, 'mixed', 20);
    expect(mixed.some((w) => isN1WordId(w.id))).toBe(true);
    expect(mixed.some((w) => !isN1WordId(w.id))).toBe(true);
    await markWrongForReview(db, [n1[0].id, mixed.find((w) => !isN1WordId(w.id))!.id]);
    expect((await n1Stats(db)).cardsStudied).toBe(1);
    expect(await db.select('SELECT * FROM review_logs')).toHaveLength(1);
  });

  it('games work with N1 sources; course filter; typing needs a kana reading', async () => {
    const db = await memoryDb();
    await importPack(db, pack);
    const kanji = (await loadPool(db, 'n1course:KANJI')).words;
    expect(kanji.every((w) => w.category === 'KANJI')).toBe(true);
    for (const q of buildChoiceQuestions(kanji, 10, 'ja_vi')) expect(new Set(q.options.map((o) => o.text)).size).toBe(4);
    expect(buildMatchBoard(kanji, 6).left).toHaveLength(6);
    expect(buildTypingQuestions(kanji, 10).every((w) => w.reading.startsWith('かんじ'))).toBe(true);
    const small = await loadPool(db, 'n1course:NGỮ PHÁP');
    expect(small.fellBack).toBe(true);
  });
});
