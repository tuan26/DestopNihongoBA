import ExcelJS from 'exceljs';
import type { Database } from '../db/types';
import { listVocabulary } from '../vocabulary/repository';
import { CATEGORIES, STATE_LABELS_VI, type VocabWithReview } from '../vocabulary/types';
import { EDITABLE_COLUMNS, READONLY_COLUMNS } from './columns';

function styleHeader(ws: ExcelJS.Worksheet) {
  const row = ws.getRow(1);
  row.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF3B5BDB' } };
  ws.views = [{ state: 'frozen', ySplit: 1 }];
}

export function vocabToRow(v: VocabWithReview): Record<string, unknown> {
  return {
    japanese: v.japanese,
    reading: v.reading,
    vietnamese: v.vietnamese,
    example_ja: v.example_ja ?? '',
    example_vi: v.example_vi ?? '',
    category: v.category,
    subcategory: v.subcategory ?? '',
    difficulty: v.difficulty,
    jlpt_level: v.jlpt_level,
    part_of_speech: v.part_of_speech ?? '',
    register: v.register ?? '',
    tags: v.tags.join(', '),
    usage_note: v.usage_note ?? '',
    note: v.note ?? '',
    favorite: v.is_favorite ? 'TRUE' : 'FALSE',
    id: v.id,
    seed_id: v.seed_id ?? '',
    source: v.source,
    status: v.review ? STATE_LABELS_VI[v.review.state] : '',
    reps: v.review?.reps ?? 0,
    lapses: v.review?.lapses ?? 0,
    stability: v.review ? Math.round(v.review.stability * 10) / 10 : 0,
    due: v.review && v.review.state !== 0 ? v.review.due.slice(0, 16).replace('T', ' ') : '',
    last_review: v.review?.last_review ? v.review.last_review.slice(0, 16).replace('T', ' ') : '',
  };
}

export async function buildExportWorkbook(db: Database, opts: { includeHidden?: boolean } = {}): Promise<ExcelJS.Workbook> {
  const words = await listVocabulary(db, { hidden: opts.includeHidden ? 'include' : 'exclude' });
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Japanese BA Vocabulary Assistant';
  wb.created = new Date();
  const ws = wb.addWorksheet('Vocabulary');
  const cols = [...EDITABLE_COLUMNS, ...READONLY_COLUMNS];
  ws.columns = cols.map((c) => ({ header: c.header, key: c.key, width: c.width }));
  for (const w of words) ws.addRow(vocabToRow(w));
  styleHeader(ws);
  READONLY_COLUMNS.forEach((_, i) => {
    ws.getColumn(EDITABLE_COLUMNS.length + i + 1).font = { color: { argb: 'FF868E96' } };
  });

  const stats = wb.addWorksheet('Review statistics');
  stats.columns = [
    { header: 'vocabulary_id', key: 'vocabulary_id', width: 14 },
    { header: 'japanese', key: 'japanese', width: 22 },
    { header: 'reviewed_at', key: 'reviewed_at', width: 22 },
    { header: 'rating', key: 'rating', width: 8 },
    { header: 'mode', key: 'mode', width: 14 },
    { header: 'due_after', key: 'due_after', width: 22 },
  ];
  const logs = await db.select<Record<string, unknown>>(
    `SELECT l.vocabulary_id, v.japanese, l.reviewed_at, l.rating, l.mode, l.due_after
     FROM review_logs l JOIN vocabulary v ON v.id = l.vocabulary_id ORDER BY l.reviewed_at`,
  );
  for (const l of logs) stats.addRow(l);
  styleHeader(stats);
  return wb;
}

export async function exportVocabularyXlsx(db: Database, opts: { includeHidden?: boolean } = {}): Promise<Uint8Array> {
  const wb = await buildExportWorkbook(db, opts);
  return new Uint8Array(await wb.xlsx.writeBuffer());
}

export async function buildTemplateWorkbook(): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Japanese BA Vocabulary Assistant';
  const ws = wb.addWorksheet('Vocabulary');
  ws.columns = EDITABLE_COLUMNS.map((c) => ({ header: c.header, key: c.key, width: c.width }));
  ws.addRow({
    japanese: '認識合わせ',
    reading: 'にんしきあわせ',
    vietnamese: 'Thống nhất cách hiểu giữa các bên',
    example_ja: '要件について、事前に認識合わせを行いましょう。',
    example_vi: 'Về yêu cầu, hãy thống nhất cách hiểu trước.',
    category: 'BA / Requirement Engineering',
    subcategory: 'Meeting',
    difficulty: 'intermediate',
    jlpt_level: 'business',
    part_of_speech: 'noun',
    register: 'business',
    tags: 'meeting, alignment',
    usage_note: 'Rất hay dùng trong họp với khách hàng Nhật',
    note: '',
    favorite: 'FALSE',
  });
  styleHeader(ws);
  const lists: Record<string, string[]> = {
    difficulty: ['intermediate', 'advanced', 'expert'],
    jlpt_level: ['N2', 'N1', 'business', 'technical', 'unknown'],
    register: ['formal', 'business', 'technical', 'neutral'],
    favorite: ['TRUE', 'FALSE'],
  };
  EDITABLE_COLUMNS.forEach((c, i) => {
    const list = lists[c.key];
    if (!list) return;
    for (let r = 2; r <= 1000; r++) {
      ws.getCell(r, i + 1).dataValidation = { type: 'list', allowBlank: true, formulae: [`"${list.join(',')}"`] };
    }
  });

  const help = wb.addWorksheet('Hướng dẫn');
  help.columns = [
    { header: 'Cột', key: 'col', width: 18 },
    { header: 'Bắt buộc', key: 'req', width: 10 },
    { header: 'Mô tả', key: 'help', width: 60 },
  ];
  for (const c of EDITABLE_COLUMNS) help.addRow({ col: c.header, req: c.required ? '✔' : '', help: c.help });
  help.addRow({});
  help.addRow({ col: 'Category hợp lệ', help: CATEGORIES.join(' | ') });
  help.addRow({ col: 'Lưu ý', help: 'Hàng 1 là tiêu đề, không đổi tên cột. Khi import, app sẽ hiển thị preview và phát hiện từ trùng.' });
  styleHeader(help);
  return wb;
}

export async function templateXlsx(): Promise<Uint8Array> {
  return new Uint8Array(await (await buildTemplateWorkbook()).xlsx.writeBuffer());
}
