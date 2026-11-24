import { describe, expect, it } from 'vitest';
import { memoryDb, seedFile } from '../helpers/db';
import { importSeed } from '../../src/core/seed/importer';
import {
  createVocabulary, deleteVocabulary, emptyContent, findDuplicates, listVocabulary, setHidden,
} from '../../src/core/vocabulary/repository';
import { addToCollection, createCollection, listCollections } from '../../src/core/vocabulary/collections';

describe('vocabulary repository', () => {
  it('creates, searches (kana/katakana/vietnamese without accents), hides and deletes', async () => {
    const db = await memoryDb();
    await importSeed(db, seedFile(3));
    const id = await createVocabulary(
      db,
      { ...emptyContent(), japanese: '冪等性', reading: 'べきとうせい', vietnamese: 'Tính idempotent', category: 'Software Engineering' },
      { source: 'user' },
    );
    expect((await listVocabulary(db, { text: 'べきとう' })).map((v) => v.id)).toEqual([id]);
    expect((await listVocabulary(db, { text: 'ベキトウ' })).map((v) => v.id)).toEqual([id]);
    expect((await listVocabulary(db, { text: 'thong nhat' })).length).toBe(3);
    expect((await findDuplicates(db, ' 冪等性 ')).length).toBe(1);

    const seedWord = (await listVocabulary(db, { source: 'seed' }))[0];
    await expect(deleteVocabulary(db, seedWord.id)).rejects.toThrow();
    await setHidden(db, seedWord.id, true);
    expect(await listVocabulary(db)).toHaveLength(3);
    expect(await listVocabulary(db, { hidden: 'only' })).toHaveLength(1);

    await deleteVocabulary(db, id);
    expect(await listVocabulary(db, { hidden: 'include' })).toHaveLength(3);
  });

  it('rejects invalid content', async () => {
    const db = await memoryDb();
    await expect(createVocabulary(db, { ...emptyContent(), japanese: '仕様' }, { source: 'user' })).rejects.toThrow();
  });

  it('manages collections', async () => {
    const db = await memoryDb();
    await importSeed(db, seedFile(5));
    const cid = await createCollection(db, 'Sprint review');
    const words = await listVocabulary(db);
    await addToCollection(db, cid, words[0].id);
    await addToCollection(db, cid, words[0].id);
    await addToCollection(db, cid, words[1].id);
    expect((await listCollections(db))[0].count).toBe(2);
    expect(await listVocabulary(db, { collectionId: cid })).toHaveLength(2);
    await expect(createCollection(db, 'Sprint review')).rejects.toThrow();
  });
});
