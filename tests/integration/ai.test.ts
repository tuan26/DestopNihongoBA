import { describe, expect, it } from 'vitest';
import { memoryDb, seedFile } from '../helpers/db';
import { importSeed } from '../../src/core/seed/importer';
import {
  approveSuggestion, extractJsonArray, isDiscoveryDue, listSuggestions, rejectSuggestion, runDiscovery,
} from '../../src/core/ai/discovery';
import { buildQueue } from '../../src/core/study/modes';
import { listVocabulary } from '../../src/core/vocabulary/repository';

const fake = (items: unknown[]) => async () => 'Here you go:\n```json\n' + JSON.stringify(items) + '\n```';
const item = (japanese: string, reading: string) => ({
  japanese, reading, vietnamese: 'nghĩa', example_ja: `${japanese}を確認します。`, example_vi: 'Xác nhận.',
  category: 'Japanese Business / Business Communication', difficulty: 'advanced', jlpt_level: 'business',
  register: 'business', tags: ['negotiation'],
});

describe('AI discovery', () => {
  it('stores pending suggestions, flags duplicates, never auto-adds', async () => {
    const db = await memoryDb();
    await importSeed(db, seedFile(3));
    const res = await runDiscovery(
      db,
      { topicId: 'Negotiation', count: 3, provider: 'mock', model: 'm' },
      fake([item('落としどころ', 'おとしどころ'), item('認識合わせ1', 'にんしきあわせ'), item('落としどころ', 'おとしどころ'), item('痛み分け', 'いたみわけ')]),
    );
    expect(res).toMatchObject({ stored: 3, duplicates: 1, received: 4 });
    expect(await listVocabulary(db)).toHaveLength(3);
    const q = await buildQueue(db, 'random', { limit: 100 });
    expect(q).toHaveLength(3);

    const sugg = await listSuggestions(db);
    const dup = sugg.find((s) => s.duplicate_of != null)!;
    await expect(approveSuggestion(db, dup.id)).rejects.toThrow();
    const ok = sugg.find((s) => s.content.japanese === '落としどころ')!;
    const vid = await approveSuggestion(db, ok.id);
    const added = (await listVocabulary(db)).find((v) => v.id === vid)!;
    expect(added.source).toBe('ai');
    expect(added.source_type).toBe('AI-generated');
    await rejectSuggestion(db, sugg.find((s) => s.content.japanese === '痛み分け')!.id);
    expect(await listSuggestions(db, 'pending')).toHaveLength(1);
  });

  it('parses messy responses and schedules', () => {
    expect(extractJsonArray('blah [{"a":1}] tail')).toEqual([{ a: 1 }]);
    expect(() => extractJsonArray('no json')).toThrow();
    const now = new Date('2026-11-24T10:00:00Z');
    expect(isDiscoveryDue('manual', null, now)).toBe(false);
    expect(isDiscoveryDue('daily', null, now)).toBe(true);
    expect(isDiscoveryDue('daily', '2026-11-24T00:00:00Z', now)).toBe(false);
    expect(isDiscoveryDue('weekly', '2026-11-16T00:00:00Z', now)).toBe(true);
  });
});
