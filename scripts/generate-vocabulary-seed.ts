/**
 * Build data/vocabulary/seed-v1.{json,csv,xlsx} (+ template.xlsx) from the curated batch files.
 * JSON is the source of truth for the app; CSV/XLSX are derived from the same in-memory entries so they never diverge.
 * IDs are stable: data/vocabulary/id-map.json pins japanese → id; new words get the next free number per category.
 * Verification results (scripts/verify-jmdict.py → verification.json) are merged honestly into source_type/source_reference.
 *
 * Usage: npm run vocab:generate
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import ExcelJS from 'exceljs';
import { normalizeKey } from '../src/core/vocabulary/normalize';
import type { SeedEntry, SeedFile } from '../src/core/vocabulary/types';
import { buildTemplateWorkbook } from '../src/core/excel/export';
import { CATEGORY_TARGETS, DATASET_DATE, DATASET_VERSION, VOCAB_DIR, readBatches, toEntry } from './vocab-lib';

const ID_MAP = join(VOCAB_DIR, 'id-map.json');
const VERIFY = join(VOCAB_DIR, 'verification.json');

const { raws, issues, files } = readBatches();
if (issues.length) {
  for (const i of issues) console.error(`✖ ${i.file}:${i.line} ${i.message}`);
  process.exit(1);
}

const idMap: Record<string, string> = existsSync(ID_MAP) ? JSON.parse(readFileSync(ID_MAP, 'utf8')) : {};
const used = new Set(Object.values(idMap));
const nextNum: Record<string, number> = {};
for (const id of used) {
  const m = id.match(/^([a-z]+-[a-z]+)-(\d{4})$/);
  if (m) nextNum[m[1]] = Math.max(nextNum[m[1]] ?? 0, Number(m[2]));
}

const verification: Record<string, { match: string; source: string }> = existsSync(VERIFY)
  ? JSON.parse(readFileSync(VERIFY, 'utf8')).results ?? {}
  : {};

const entries: SeedEntry[] = [];
const newMap: Record<string, string> = {};
for (const r of raws) {
  const cat = CATEGORY_TARGETS[r.category];
  if (!cat) {
    console.error(`✖ ${r.file}:${r.line} unknown category "${r.category}"`);
    process.exit(1);
  }
  const key = normalizeKey(r.fields[0]);
  const prefix = `${cat.code}-${cat.slug}`;
  let id = idMap[key];
  if (!id || !id.startsWith(prefix)) {
    nextNum[prefix] = (nextNum[prefix] ?? 0) + 1;
    id = `${prefix}-${String(nextNum[prefix]).padStart(4, '0')}`;
  }
  newMap[key] = id;
  const e = toEntry(r, id);
  const v = verification[r.fields[0]];
  if (v && (v.match === 'headword+reading')) {
    e.source_type = 'researched';
    e.source_reference = `${v.source} — headword & reading match (meaning/example AI-generated)`;
  }
  entries.push(e);
}

const seed: SeedFile = { dataset_version: DATASET_VERSION, created_at: DATASET_DATE, entries };
writeFileSync(join(VOCAB_DIR, 'seed-v1.json'), JSON.stringify(seed, null, 1) + '\n');
// keep ids of removed words reserved so they are never reused for a different word
writeFileSync(ID_MAP, JSON.stringify({ ...idMap, ...newMap }, Object.keys({ ...idMap, ...newMap }).sort(), 1) + '\n');

const COLS: (keyof SeedEntry)[] = [
  'id', 'japanese', 'reading', 'vietnamese', 'example_ja', 'example_vi', 'category', 'subcategory', 'difficulty',
  'jlpt_level', 'part_of_speech', 'usage_note', 'register', 'tags', 'source_type', 'source_reference', 'created_at', 'dataset_version',
];
const cell = (v: unknown) => (Array.isArray(v) ? v.join(', ') : v == null ? '' : String(v));
const csvEsc = (s: string) => (/[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
const csv = [COLS.join(','), ...entries.map((e) => COLS.map((c) => csvEsc(cell(e[c]))).join(','))].join('\r\n');
writeFileSync(join(VOCAB_DIR, 'seed-v1.csv'), '﻿' + csv + '\r\n');

const wb = new ExcelJS.Workbook();
wb.creator = 'Japanese BA Vocabulary Assistant';
wb.created = new Date(`${DATASET_DATE}T00:00:00Z`);
wb.modified = wb.created;
const ws = wb.addWorksheet('Vocabulary');
ws.columns = COLS.map((c) => ({ header: c, key: c, width: ({ japanese: 22, reading: 24, vietnamese: 44, example_ja: 50, example_vi: 50, usage_note: 40 } as Record<string, number>)[c] ?? 16 }));
for (const e of entries) ws.addRow(Object.fromEntries(COLS.map((c) => [c, cell(e[c])])));
ws.getRow(1).font = { bold: true };
ws.views = [{ state: 'frozen', ySplit: 1 }];
ws.autoFilter = { from: 'A1', to: `R${entries.length + 1}` };
await wb.xlsx.writeFile(join(VOCAB_DIR, 'seed-v1.xlsx'));
await (await buildTemplateWorkbook()).xlsx.writeFile(join(VOCAB_DIR, 'template.xlsx'));

const byCat: Record<string, number> = {};
for (const e of entries) byCat[e.category] = (byCat[e.category] ?? 0) + 1;
console.log(`Generated ${entries.length} entries from ${files.length} batch files`);
for (const [c, t] of Object.entries(CATEGORY_TARGETS)) console.log(`  ${String(byCat[c] ?? 0).padStart(4)} / ${t.target}  ${c}`);
