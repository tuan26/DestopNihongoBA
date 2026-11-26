import { describe, expect, it } from 'vitest';
import { memoryDb, reopen } from '../helpers/db';
import { convertCrawlerFile, parseImportText } from '../../src/core/n1/crawler';
import { sanitizeHtml, toSafeHtml } from '../../src/core/n1/html';
import { deleteAllN1, importPack } from '../../src/core/n1/importer';
import { summarizePack, validatePack } from '../../src/core/n1/pack';
import { buildN1CardQueue, rateN1Card, splitBack } from '../../src/core/n1/cards';
import { deckQuestions, listN1Decks, n1Stats, recordAnswer, wrongQuestions } from '../../src/core/n1/practice';

/** Synthetic file with the same shape as the user's crawler output (content written for the test). */
function fakeCrawler(cardCount = 5, extra = '') {
  return {
    courses: [{ id: 'c1', title: 'Khóa test' }],
    sections: [{ id: 's1', course_id: 'c1', title: 'Phần 1', order: 1 }],
    lessons: [
      { id: 'l1', section_id: 's1', api_id: 'L1', title: 'Flashcard buổi 1', type: 'FLASH_CARD', order: 1 },
      { id: 'l2', section_id: 's1', api_id: 'L2', title: 'Test ngày 1', type: 'QUIZ', order: 2 },
      { id: 'l3', section_id: 's1', api_id: 'L3', title: 'Video', type: 'VIDEO', order: 3 },
    ],
    resources: [
      {
        id: 'r1',
        lesson_id: 'l1',
        type: 'FLASH_CARD',
        raw_data: {
          items: Array.from({ length: cardCount }, (_, i) => ({ id: `card${i}`, front: `語${i}${extra}`, back: `nghĩa ${i}\nví dụ ${i}`, reading: '' })),
        },
      },
      {
        id: 'r2',
        lesson_id: 'l2',
        type: 'QUIZ',
        raw_data: {
          exam: {
            questionMapping: [
              {
                id: 'q1',
                type: 'MULTIPLE_CHOICE_HORIZONTAL',
                content: '定年後も (    ) かぎりは働きたい。',
                explain: 'Giải thích\r\ndòng 2',
                multipleChoiceHorizontal: [
                  { content: 'A', isCorrect: false },
                  { content: 'B', isCorrect: false },
                  { content: 'C', isCorrect: true },
                  { content: 'D', isCorrect: false },
                ],
              },
              {
                id: 'g1',
                content: '<p onclick="x()">Đoạn văn<script>alert(1)</script><img src=x></p>',
                questions: [
                  { id: 's1', type: 'MULTIPLE_CHOICE', content: '<p>Câu 1</p>', explain: '<p>vì...</p>', multipleChoiceAnswers: [{ content: 'X', isCorrect: true }, { content: 'Y', isCorrect: false }] },
                  { id: 's2', type: 'MULTIPLE_CHOICE', content: '<p>Câu 2</p>', multipleChoiceAnswers: [{ content: 'X', isCorrect: false }, { content: 'Y', isCorrect: true }] },
                ],
              },
              { id: 'e1', type: 'ESSAY', content: 'Viết luận', essayAnswers: [{}] },
            ],
          },
        },
      },
      { id: 'r3', lesson_id: 'l3', type: 'VIDEO', raw_data: { videoUrl: 'x' } },
    ],
  };
}

describe('N1 import', () => {
  it('converts crawler output, skipping unsupported items, and sanitizes HTML', () => {
    const pack = convertCrawlerFile(fakeCrawler());
    expect(validatePack(pack)).toEqual([]);
    const s = summarizePack(pack);
    expect(s).toMatchObject({ flashcardDecks: 1, cards: 5, quizDecks: 1, questions: 3 });
    expect(s.skipped).toMatchObject({ ESSAY: 1, 'bài VIDEO': 1 });
    const qz = pack.decks.find((d) => d.kind === 'quiz')!;
    expect(qz.questions![0].answer).toBe(2);
    expect(qz.questions![0].explanation).toBe('Giải thích<br>dòng 2');
    expect(qz.questions![1].passage).toBe('<p>Đoạn văn</p>');
    expect(sanitizeHtml('<a href="javascript:x">link</a><b style="x">đậm</b> 1 < 2')).toBe('link<b>đậm</b> 1 &lt; 2');
    expect(toSafeHtml('a<b')).toBe('a&lt;b');
  });

  it('parses text, rejects unknown formats', () => {
    expect(parseImportText(JSON.stringify(fakeCrawler()), 'n1_data.json').name).toBe('n1_data');
    expect(() => parseImportText('{"x":1}')).toThrow(/Không nhận ra/);
    expect(() => parseImportText('not json')).toThrow(/JSON/);
  });

  it('import is idempotent and never loses progress; re-import updates content', async () => {
    const db = await memoryDb();
    const r1 = await importPack(db, convertCrawlerFile(fakeCrawler()));
    expect(r1).toEqual({ decks: { inserted: 2, updated: 0 }, cards: { inserted: 5, updated: 0 }, questions: { inserted: 3, updated: 0 } });
    const q = await buildN1CardQueue(db, { newPerDay: 3 });
    expect(q).toHaveLength(3);
    await rateN1Card(db, q[0].id, 3);
    const quiz = (await listN1Decks(db)).find((d) => d.kind === 'quiz')!;
    const qs = await deckQuestions(db, quiz.id);
    await recordAnswer(db, qs[0].id, 0, false);

    const r2 = await importPack(db, convertCrawlerFile(fakeCrawler(6, '・')));
    expect(r2.cards).toEqual({ inserted: 1, updated: 5 });
    const re = await reopen(db);
    const st = await n1Stats(re);
    expect(st).toMatchObject({ decks: 2, cards: 6, cardsStudied: 1, questions: 3, answered: 1, wrongNow: 1 });
    expect((await wrongQuestions(re)).map((w) => w.id)).toEqual([qs[0].id]);
    await recordAnswer(re, qs[0].id, 2, true);
    expect(await wrongQuestions(re)).toHaveLength(0);
    await deleteAllN1(re);
    expect((await n1Stats(re)).decks).toBe(0);
  });

  it('daily new-card limit across sessions and deck mode ignores it', async () => {
    const db = await memoryDb();
    await importPack(db, convertCrawlerFile(fakeCrawler(10)));
    const t = new Date('2026-11-26T09:00:00');
    for (const c of await buildN1CardQueue(db, { newPerDay: 4, now: t })) await rateN1Card(db, c.id, 4, t);
    const later = new Date('2026-11-26T15:00:00');
    expect((await buildN1CardQueue(db, { newPerDay: 4, now: later })).length).toBe(0);
    const deck = (await listN1Decks(db))[0];
    expect((await buildN1CardQueue(db, { deckId: deck.id, now: later })).length).toBe(6);
    expect(splitBack('nghĩa\nví dụ\nthêm')).toEqual({ meaning: 'nghĩa', details: 'ví dụ\nthêm' });
  });
});
