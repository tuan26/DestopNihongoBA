/**
 * Validate data/vocabulary/seed-v1.json against every rule of the dataset specification (spec §13).
 * Exit code 1 when any error is found. Usage: npm run validate:vocab [-- --json]
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { hasKanji, isKana, kataToHira, normalizeKey } from '../src/core/vocabulary/normalize';
import { maskTarget } from '../src/core/study/modes';
import type { SeedEntry, SeedFile } from '../src/core/vocabulary/types';
import { CATEGORIES, DIFFICULTIES, JLPT_LEVELS, REGISTERS } from '../src/core/vocabulary/types';
import { CATEGORY_TARGETS, VOCAB_DIR } from './vocab-lib';

export interface Finding {
  id: string;
  rule: string;
  message: string;
}

export interface ValidationReport {
  total: number;
  errors: Finding[];
  warnings: Finding[];
  byCategory: Record<string, number>;
  byDifficulty: Record<string, number>;
  bySourceType: Record<string, number>;
  byJlpt: Record<string, number>;
}

const REQUIRED: (keyof SeedEntry)[] = [
  'id', 'japanese', 'reading', 'vietnamese', 'example_ja', 'example_vi', 'category', 'difficulty', 'jlpt_level',
  'register', 'source_type', 'created_at', 'dataset_version',
];

/** Words too basic for an N2–N1 BA/BrSE audience. */
export const TOO_BASIC = new Set(
  [
    '会議', '確認', '仕事', '会社', '電話', 'メール', '時間', '資料', '説明', '質問', '問題', '連絡', '予定', '準備', '社員',
    '勉強', '使う', '見る', '書く', '話す', '作る', 'パソコン', 'コンピューター', 'インターネット', 'データ', 'システム',
    'プログラム', 'テスト', 'お客様', '担当', '会議室', '報告', '相談', '計画', '開発', 'ファイル', 'サーバー', '画面',
  ].map(normalizeKey),
);

const PLACEHOLDER = /(lorem|ipsum|placeholder|example sentence|sample sentence|câu ví dụ|ví dụ mẫu|todo|fixme|xxx|\?\?\?|ダミー|サンプル文|例文です|テスト用)/i;
const JA_CHAR = /[぀-ヿ一-鿿]/;
const VI_LETTER = /[a-zA-ZÀ-ỹđĐ]/;
const BAD_CHARS = /[�\u0000-\u0008\u000B\u000C\u000E-\u001F]/;
// typical mojibake sequences (UTF-8 read as Latin-1 / Shift_JIS)
const MOJIBAKE = /(Ã.|Â.|ã\u0081|ç\u0094|�|縺|繧|竊)/;
const ID_RE = /^(ba|biz|pm|swe|arch|db|cloud|qa|sec|gen)-[a-z]+-\d{4}$/;

/** Each run of hiragana in the headword must appear, in order, in the reading (catches okurigana typos). */
export function okuriganaConsistent(japanese: string, reading: string): boolean {
  const r = kataToHira(reading).replace(/[\s・ー]/g, '');
  const j = kataToHira(japanese);
  if (!hasKanji(japanese)) {
    // pure kana / katakana / mixed with latin: kana part must equal reading (ignoring ー and spaces)
    const kana = j.replace(/[^぀-ゟ]/g, '');
    return kana.length === 0 || r.replace(/ー/g, '') === kana.replace(/ー/g, '') || r.includes(kana);
  }
  const runs = j.match(/[぀-ゟ]+/g) ?? [];
  let pos = 0;
  for (const run of runs) {
    const idx = r.indexOf(run, pos);
    if (idx < 0) return false;
    pos = idx + run.length;
  }
  return true;
}

export function validateDataset(seed: SeedFile): ValidationReport {
  const errors: Finding[] = [];
  const warnings: Finding[] = [];
  const err = (id: string, rule: string, message: string) => errors.push({ id, rule, message });
  const warn = (id: string, rule: string, message: string) => warnings.push({ id, rule, message });
  const entries = seed.entries ?? [];
  const count = <K extends string>(f: (e: SeedEntry) => K) =>
    entries.reduce<Record<string, number>>((acc, e) => ((acc[f(e)] = (acc[f(e)] ?? 0) + 1), acc), {});

  if (!/^\d+\.\d+\.\d+$/.test(seed.dataset_version ?? '')) err('-', 'schema', 'dataset_version must be semver');
  if (entries.length !== 1000) err('-', 'total', `expected exactly 1000 entries, found ${entries.length}`);

  const ids = new Map<string, number>();
  const keys = new Map<string, string>();
  const readMeaning = new Map<string, string>();
  const examples = new Map<string, string>();
  const examplesVi = new Map<string, string>();
  const meanings = new Map<string, string[]>();
  const skeletons = new Map<string, string[]>();

  for (const e of entries) {
    const id = e.id ?? '?';
    for (const f of REQUIRED) {
      const v = e[f];
      if (v == null || (typeof v === 'string' && !v.trim())) err(id, 'required', `missing ${f}`);
    }
    if (!ID_RE.test(id)) err(id, 'schema', 'id format');
    ids.set(id, (ids.get(id) ?? 0) + 1);
    if (!(CATEGORIES as readonly string[]).includes(e.category)) err(id, 'schema', `unknown category ${e.category}`);
    else if (!id.startsWith(CATEGORY_TARGETS[e.category].code + '-')) err(id, 'schema', 'id prefix does not match category');
    if (!(DIFFICULTIES as readonly string[]).includes(e.difficulty)) err(id, 'schema', `difficulty ${e.difficulty}`);
    if (!(JLPT_LEVELS as readonly string[]).includes(e.jlpt_level)) err(id, 'schema', `jlpt_level ${e.jlpt_level}`);
    if (!(REGISTERS as readonly string[]).includes(e.register ?? '')) err(id, 'schema', `register ${e.register}`);
    if (!['AI-generated', 'researched', 'curated'].includes(e.source_type)) err(id, 'schema', `source_type ${e.source_type}`);
    if (e.source_type !== 'AI-generated' && !e.source_reference) err(id, 'honesty', 'non AI-generated entry needs source_reference');
    if (!Array.isArray(e.tags) || e.tags.length === 0) warn(id, 'tags', 'no tags');

    const all = [e.japanese, e.reading, e.vietnamese, e.example_ja, e.example_vi, e.usage_note ?? '', e.subcategory ?? ''].join('\n');
    if (BAD_CHARS.test(all) || MOJIBAKE.test(all)) err(id, 'encoding', 'invalid / mojibake characters');
    if (all !== all.normalize('NFC')) err(id, 'encoding', 'text is not NFC-normalized');
    if (PLACEHOLDER.test(all)) err(id, 'placeholder', 'placeholder-like text');
    if (/\d+$/.test(e.japanese) || /\d+$/.test(e.vietnamese)) err(id, 'demo', 'trailing number looks like duplicated demo data');

    if (!JA_CHAR.test(e.japanese)) err(id, 'nonsense', 'japanese has no Japanese characters');
    if (!isKana(e.reading)) err(id, 'reading', `reading must be kana only: "${e.reading}"`);
    else if (!okuriganaConsistent(e.japanese, e.reading)) err(id, 'reading', `reading inconsistent with kana in headword: ${e.japanese} / ${e.reading}`);
    if (!VI_LETTER.test(e.vietnamese) || e.vietnamese.length < 3) err(id, 'nonsense', 'vietnamese meaning too short / invalid');
    if (JA_CHAR.test(e.vietnamese.replace(/[（(].*?[)）]/g, ''))) warn(id, 'vietnamese', 'Japanese characters inside Vietnamese meaning');
    if (!JA_CHAR.test(e.example_ja) || e.example_ja.length < 8) err(id, 'example', 'example_ja too short / not Japanese');
    if (!/[。！？」]$/.test(e.example_ja)) warn(id, 'example', 'example_ja should end with 。');
    if (!VI_LETTER.test(e.example_vi) || e.example_vi.length < 8) err(id, 'example', 'example_vi too short / invalid');
    if (JA_CHAR.test(e.example_vi)) err(id, 'example', 'example_vi contains Japanese characters');
    if (!maskTarget(e.example_ja, e.japanese).masked) err(id, 'example', `example_ja does not contain the target expression "${e.japanese}"`);
    if (TOO_BASIC.has(normalizeKey(e.japanese))) err(id, 'too-basic', `"${e.japanese}" is too basic for this dataset`);

    const key = normalizeKey(e.japanese);
    if (keys.has(key)) err(id, 'duplicate', `japanese duplicates ${keys.get(key)} (${e.japanese})`);
    else keys.set(key, id);
    const rm = `${kataToHira(e.reading)}::${e.vietnamese.toLowerCase().trim()}`;
    if (readMeaning.has(rm)) err(id, 'duplicate', `same reading + meaning as ${readMeaning.get(rm)}`);
    else readMeaning.set(rm, id);
    if (examples.has(e.example_ja)) err(id, 'duplicate-example', `example_ja identical to ${examples.get(e.example_ja)}`);
    else examples.set(e.example_ja, id);
    if (examplesVi.has(e.example_vi)) err(id, 'duplicate-example', `example_vi identical to ${examplesVi.get(e.example_vi)}`);
    else examplesVi.set(e.example_vi, id);
    const vm = e.vietnamese.toLowerCase().trim();
    meanings.set(vm, [...(meanings.get(vm) ?? []), id]);
    // sentence "skeleton": example with the target removed — detects mass-produced template sentences
    const sk = maskTarget(e.example_ja, e.japanese, '□').text;
    skeletons.set(sk, [...(skeletons.get(sk) ?? []), id]);
  }

  for (const [id, n] of ids) if (n > 1) err(id, 'duplicate', `id used ${n} times`);
  for (const [m, list] of meanings) if (list.length > 1) warn(list.join(','), 'meaning', `same Vietnamese meaning "${m}"`);
  for (const [sk, list] of skeletons) if (list.length > 1) err(list.join(','), 'template-example', `template-like example sentence "${sk}"`);

  const byCategory = count((e) => e.category);
  for (const [cat, t] of Object.entries(CATEGORY_TARGETS)) {
    if ((byCategory[cat] ?? 0) !== t.target) err('-', 'distribution', `${cat}: ${byCategory[cat] ?? 0} (expected ${t.target})`);
  }

  return {
    total: entries.length,
    errors,
    warnings,
    byCategory,
    byDifficulty: count((e) => e.difficulty),
    bySourceType: count((e) => e.source_type),
    byJlpt: count((e) => e.jlpt_level),
  };
}

const isMain = import.meta.url === pathToFileURL(process.argv[1] ?? '').href;
if (isMain) {
  let seed: SeedFile;
  try {
    seed = JSON.parse(readFileSync(join(VOCAB_DIR, 'seed-v1.json'), 'utf8'));
  } catch (e) {
    console.error(`✖ JSON parse error: ${(e as Error).message}`);
    process.exit(1);
  }
  const r = validateDataset(seed);
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(r, null, 2));
  } else {
    console.log(`Entries: ${r.total}`);
    for (const [c, n] of Object.entries(r.byCategory)) console.log(`  ${String(n).padStart(4)}  ${c}`);
    console.log('Difficulty:', r.byDifficulty, ' Source:', r.bySourceType);
    for (const w of r.warnings.slice(0, 40)) console.log(`⚠ [${w.rule}] ${w.id}: ${w.message}`);
    if (r.warnings.length > 40) console.log(`⚠ … ${r.warnings.length - 40} more warnings`);
    for (const e of r.errors) console.log(`✖ [${e.rule}] ${e.id}: ${e.message}`);
    console.log(r.errors.length ? `\n✖ ${r.errors.length} errors, ${r.warnings.length} warnings` : `\n✔ 0 errors, ${r.warnings.length} warnings`);
  }
  process.exit(r.errors.length ? 1 : 0);
}
