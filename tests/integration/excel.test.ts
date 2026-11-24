import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import { memoryDb, seedFile } from '../helpers/db';
import { importSeed } from '../../src/core/seed/importer';
import { exportVocabularyXlsx, templateXlsx } from '../../src/core/excel/export';
import { applyImport, previewImport } from '../../src/core/excel/import';
import { listVocabulary } from '../../src/core/vocabulary/repository';
import { rateWord } from '../../src/core/srs/reviewService';

async function book(rows: Record<string, string>[]): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Vocabulary');
  const headers = ['japanese', 'reading', 'vietnamese', 'example_ja', 'example_vi', 'category', 'difficulty', 'tags', 'favorite'];
  ws.addRow(headers);
  for (const r of rows) ws.addRow(headers.map((h) => r[h] ?? ''));
  return new Uint8Array(await wb.xlsx.writeBuffer());
}

describe('excel', () => {
  it('export → import round trip detects all as duplicates and skip keeps data', async () => {
    const db = await memoryDb();
    await importSeed(db, seedFile(8));
    const [w] = await listVocabulary(db);
    await rateWord(db, w.id, 3, 'test');
    const bytes = await exportVocabularyXlsx(db);
    const p = await previewImport(db, bytes);
    expect(p.counts).toEqual({ total: 8, new: 0, duplicate: 8, error: 0 });
    const r = await applyImport(db, p, 'skip');
    expect(r.skipped).toBe(8);
    expect((await listVocabulary(db)).find((v) => v.id === w.id)!.review!.reps).toBe(1);
  });

  it('preview reports per-row errors, in-file duplicates; update keeps progress', async () => {
    const db = await memoryDb();
    await importSeed(db, seedFile(2));
    const [w] = await listVocabulary(db);
    await rateWord(db, w.id, 3, 'test');
    const bytes = await book([
      { japanese: w.japanese, reading: 'にんしきあわせ', vietnamese: 'Nghĩa cập nhật', category: 'BA / Requirement Engineering' },
      { japanese: '冪等性', reading: 'べきとうせい', vietnamese: 'Tính idempotent', category: 'Software Engineering', tags: 'api, design', favorite: 'TRUE' },
      { japanese: '属人化', reading: '', vietnamese: 'Phụ thuộc vào cá nhân', category: 'Project Management' },
      { japanese: '冪等性', reading: 'べきとうせい', vietnamese: 'lặp', category: 'Software Engineering' },
      { japanese: '可用性', reading: 'かようせい', vietnamese: 'Tính sẵn sàng', category: 'System Architecture / Design', difficulty: 'super' },
    ]);
    const p = await previewImport(db, bytes);
    expect(p.counts).toEqual({ total: 5, new: 1, duplicate: 1, error: 3 });
    expect(p.rows[2].rowNumber).toBe(4);
    expect(p.rows[2].errors.join()).toMatch(/reading/);
    expect(p.rows[3].errors.join()).toMatch(/dòng 3/);
    const r = await applyImport(db, p, 'update');
    expect(r).toEqual({ inserted: 1, updated: 1, skipped: 0, failed: 3 });
    const all = await listVocabulary(db);
    const updated = all.find((v) => v.id === w.id)!;
    expect(updated.vietnamese).toBe('Nghĩa cập nhật');
    expect(updated.user_modified).toBe(true);
    expect(updated.review!.reps).toBe(1);
    const imp = all.find((v) => v.japanese === '冪等性')!;
    expect(imp.source).toBe('import');
    expect(imp.is_favorite).toBe(true);
    expect(imp.tags).toEqual(['api', 'design']);
  });

  it('rejects files with missing required columns; template is importable', async () => {
    const db = await memoryDb();
    const wb = new ExcelJS.Workbook();
    wb.addWorksheet('Vocabulary').addRow(['foo', 'bar']);
    const p = await previewImport(db, new Uint8Array(await wb.xlsx.writeBuffer()));
    expect(p.fileErrors[0]).toMatch(/Thiếu cột/);
    const t = await previewImport(db, await templateXlsx());
    expect(t.counts).toMatchObject({ total: 1, new: 1, error: 0 });
  });
});
