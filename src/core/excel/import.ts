import ExcelJS from 'exceljs';
import type { Database } from '../db/types';
import { nowIso } from '../db/types';
import { normalizeKey } from '../vocabulary/normalize';
import { contentParams, createVocabulary, validateContent } from '../vocabulary/repository';
import type { VocabContent } from '../vocabulary/types';
import { DIFFICULTIES, JLPT_LEVELS } from '../vocabulary/types';
import { EDITABLE_COLUMNS, MAX_IMPORT_ROWS } from './columns';

export interface ImportRow {
  rowNumber: number;
  content: VocabContent;
  note: string | null;
  favorite: boolean | null;
  errors: string[];
  duplicateOf: { id: number; japanese: string; source: string } | null;
  duplicateInFile: number | null;
}

export interface ImportPreview {
  rows: ImportRow[];
  fileErrors: string[];
  counts: { total: number; new: number; duplicate: number; error: number };
}

const cellText = (v: ExcelJS.CellValue): string => {
  if (v == null) return '';
  if (typeof v === 'object') {
    if ('richText' in v) return v.richText.map((r) => r.text).join('');
    if ('text' in v) return String(v.text);
    if ('result' in v) return String(v.result ?? '');
    if (v instanceof Date) return v.toISOString();
  }
  return String(v);
};

const headerKey = (h: string) =>
  h
    .toLowerCase()
    .replace(/\(.*?\)/g, '')
    .trim()
    .replace(/[\s-]+/g, '_');

export async function parseWorkbook(data: ArrayBuffer | Uint8Array): Promise<{ rows: Record<string, string>[]; rowNumbers: number[]; errors: string[] }> {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(data instanceof Uint8Array ? (data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer) : data);
  } catch (e) {
    return { rows: [], rowNumbers: [], errors: [`Không đọc được file Excel: ${(e as Error).message}`] };
  }
  const ws = wb.getWorksheet('Vocabulary') ?? wb.worksheets[0];
  if (!ws) return { rows: [], rowNumbers: [], errors: ['File không có sheet nào'] };
  const headers: Record<number, string> = {};
  ws.getRow(1).eachCell((cell, col) => {
    headers[col] = headerKey(cellText(cell.value));
  });
  const known = new Set(Object.values(headers));
  const missing = EDITABLE_COLUMNS.filter((c) => c.required && !known.has(c.key)).map((c) => c.key);
  if (missing.length) return { rows: [], rowNumbers: [], errors: [`Thiếu cột bắt buộc: ${missing.join(', ')}`] };
  if (ws.rowCount - 1 > MAX_IMPORT_ROWS)
    return { rows: [], rowNumbers: [], errors: [`File quá lớn (${ws.rowCount - 1} dòng, tối đa ${MAX_IMPORT_ROWS})`] };
  const rows: Record<string, string>[] = [];
  const rowNumbers: number[] = [];
  ws.eachRow((row, n) => {
    if (n === 1) return;
    const rec: Record<string, string> = {};
    row.eachCell({ includeEmpty: false }, (cell, col) => {
      const k = headers[col];
      if (k) rec[k] = cellText(cell.value).trim();
    });
    if (Object.values(rec).some((v) => v)) {
      rows.push(rec);
      rowNumbers.push(n);
    }
  });
  return { rows, rowNumbers, errors: [] };
}

export function recordToContent(r: Record<string, string>): { content: VocabContent; note: string | null; favorite: boolean | null; errors: string[] } {
  const errors: string[] = [];
  const difficulty = (r.difficulty || 'intermediate').toLowerCase();
  const jlpt = r.jlpt_level ? (r.jlpt_level.toUpperCase().startsWith('N') ? r.jlpt_level.toUpperCase() : r.jlpt_level.toLowerCase()) : 'unknown';
  if (!(DIFFICULTIES as readonly string[]).includes(difficulty)) errors.push(`difficulty không hợp lệ: "${r.difficulty}"`);
  if (!(JLPT_LEVELS as readonly string[]).includes(jlpt)) errors.push(`jlpt_level không hợp lệ: "${r.jlpt_level}"`);
  const content: VocabContent = {
    japanese: r.japanese ?? '',
    reading: r.reading ?? '',
    vietnamese: r.vietnamese ?? '',
    example_ja: r.example_ja || null,
    example_vi: r.example_vi || null,
    category: r.category ?? '',
    subcategory: r.subcategory || null,
    difficulty,
    jlpt_level: jlpt,
    part_of_speech: r.part_of_speech || null,
    usage_note: r.usage_note || null,
    register: r.register || null,
    tags: (r.tags ?? '')
      .split(/[,、]/)
      .map((t) => t.trim())
      .filter(Boolean),
  };
  for (const e of validateContent(content)) errors.push(`${e.field}: ${e.message}`);
  const fav = r.favorite ? /^(true|1|yes|x|✔|có)$/i.test(r.favorite) : null;
  return { content, note: r.note || null, favorite: fav, errors };
}

export async function previewImport(db: Database, data: ArrayBuffer | Uint8Array): Promise<ImportPreview> {
  const parsed = await parseWorkbook(data);
  const existing = await db.select<{ id: number; japanese: string; source: string; normalized_key: string }>(
    'SELECT id, japanese, source, normalized_key FROM vocabulary',
  );
  const byKey = new Map(existing.map((e) => [e.normalized_key, e]));
  const seenInFile = new Map<string, number>();
  const rows: ImportRow[] = parsed.rows.map((rec, i) => {
    const rowNumber = parsed.rowNumbers[i];
    const { content, note, favorite, errors } = recordToContent(rec);
    const key = content.japanese ? normalizeKey(content.japanese) : '';
    const dup = key ? byKey.get(key) : undefined;
    const firstRow = key ? seenInFile.get(key) : undefined;
    if (key && firstRow == null) seenInFile.set(key, rowNumber);
    if (firstRow != null) errors.push(`Trùng với dòng ${firstRow} trong file`);
    return {
      rowNumber,
      content,
      note,
      favorite,
      errors,
      duplicateOf: dup ? { id: Number(dup.id), japanese: dup.japanese, source: dup.source } : null,
      duplicateInFile: firstRow ?? null,
    };
  });
  const error = rows.filter((r) => r.errors.length).length;
  const duplicate = rows.filter((r) => !r.errors.length && r.duplicateOf).length;
  return {
    rows,
    fileErrors: parsed.errors,
    counts: { total: rows.length, new: rows.length - error - duplicate, duplicate, error },
  };
}

export type DuplicateStrategy = 'skip' | 'update';

export interface ImportResult {
  inserted: number;
  updated: number;
  skipped: number;
  failed: number;
}

/**
 * Apply a preview. Never deletes anything. Duplicates are skipped or updated (content only — learning progress
 * is kept; seed words become `user_modified`).
 */
export async function applyImport(db: Database, preview: ImportPreview, strategy: DuplicateStrategy): Promise<ImportResult> {
  const res: ImportResult = { inserted: 0, updated: 0, skipped: 0, failed: 0 };
  await db.transaction(async (tx) => {
    for (const row of preview.rows) {
      if (row.errors.length) {
        res.failed++;
        continue;
      }
      if (row.duplicateOf) {
        if (strategy === 'skip') {
          res.skipped++;
          continue;
        }
        const c = row.content;
        await tx.execute(
          `UPDATE vocabulary SET japanese = ?, reading = ?, vietnamese = ?, example_ja = ?, example_vi = ?, category = ?,
            subcategory = ?, difficulty = ?, jlpt_level = ?, part_of_speech = ?, usage_note = ?, register = ?, tags = ?,
            note = COALESCE(?, note), is_favorite = COALESCE(?, is_favorite),
            user_modified = CASE WHEN source = 'seed' THEN 1 ELSE user_modified END, updated_at = ? WHERE id = ?`,
          [
            ...contentParams(c),
            JSON.stringify(c.tags),
            row.note,
            row.favorite == null ? null : row.favorite ? 1 : 0,
            nowIso(),
            row.duplicateOf.id,
          ],
        );
        res.updated++;
        continue;
      }
      await createVocabulary(tx, row.content, {
        source: 'import',
        source_type: 'user',
        note: row.note,
        is_favorite: row.favorite ?? false,
      });
      res.inserted++;
    }
  });
  return res;
}
