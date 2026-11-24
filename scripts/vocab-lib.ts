/**
 * Shared helpers for the vocabulary dataset scripts.
 * Batch source format (data/vocabulary/batches/*.txt), one entry per line, fields separated by "|":
 *   japanese | reading | vietnamese | example_ja | example_vi | subcategory | difficulty | jlpt | pos | register | tags | usage_note
 *   difficulty: i=intermediate a=advanced e=expert ; jlpt: N2 N1 B=business T=technical U=unknown
 *   register: f=formal b=business t=technical n=neutral ; tags: comma separated
 * Header lines:  "# category: <Category>"  and  "# code: <id prefix>"
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { SeedEntry } from '../src/core/vocabulary/types';

export const ROOT = join(import.meta.dirname, '..');
export const VOCAB_DIR = join(ROOT, 'data', 'vocabulary');
export const BATCH_DIR = join(VOCAB_DIR, 'batches');
export const DATASET_VERSION = '1.0.0';
export const DATASET_DATE = '2026-11-24';

export const CATEGORY_TARGETS: Record<string, { code: string; slug: string; target: number }> = {
  'BA / Requirement Engineering': { code: 'ba', slug: 'req', target: 180 },
  'Japanese Business / Business Communication': { code: 'biz', slug: 'comm', target: 150 },
  'Project Management': { code: 'pm', slug: 'mgmt', target: 120 },
  'Software Engineering': { code: 'swe', slug: 'dev', target: 150 },
  'System Architecture / Design': { code: 'arch', slug: 'design', target: 100 },
  'Database / Data Engineering': { code: 'db', slug: 'data', target: 80 },
  'Cloud / DevOps / Infrastructure': { code: 'cloud', slug: 'ops', target: 80 },
  'Testing / QA': { code: 'qa', slug: 'test', target: 60 },
  Security: { code: 'sec', slug: 'sec', target: 40 },
  'Advanced General Business Japanese': { code: 'gen', slug: 'biz', target: 40 },
};

const DIFF: Record<string, string> = { i: 'intermediate', a: 'advanced', e: 'expert' };
const JLPT: Record<string, string> = { N2: 'N2', N1: 'N1', B: 'business', T: 'technical', U: 'unknown' };
const REG: Record<string, string> = { f: 'formal', b: 'business', t: 'technical', n: 'neutral' };
const POS: Record<string, string> = {
  n: 'noun',
  vs: 'noun (suru-verb)',
  v: 'verb',
  'adj-na': 'na-adjective',
  'adj-i': 'i-adjective',
  adv: 'adverb',
  phr: 'phrase',
  exp: 'expression',
  suf: 'suffix',
};

export interface RawEntry {
  file: string;
  line: number;
  category: string;
  fields: string[];
}

export interface ParseIssue {
  file: string;
  line: number;
  message: string;
}

export function readBatches(): { raws: RawEntry[]; issues: ParseIssue[]; files: string[] } {
  const files = readdirSync(BATCH_DIR)
    .filter((f) => f.endsWith('.txt'))
    .sort();
  const raws: RawEntry[] = [];
  const issues: ParseIssue[] = [];
  for (const file of files) {
    const text = readFileSync(join(BATCH_DIR, file), 'utf8');
    let category = '';
    text.split(/\r?\n/).forEach((lineText, i) => {
      const line = i + 1;
      const t = lineText.trim();
      if (!t) return;
      if (t.startsWith('#')) {
        const m = t.match(/^#\s*category:\s*(.+)$/);
        if (m) category = m[1].trim();
        return;
      }
      if (!category) issues.push({ file, line, message: 'entry before "# category:" header' });
      const fields = t.split('|').map((f) => f.trim());
      if (fields.length !== 12) {
        issues.push({ file, line, message: `expected 12 fields, got ${fields.length}` });
        return;
      }
      raws.push({ file, line, category, fields });
    });
  }
  return { raws, issues, files };
}

export function toEntry(r: RawEntry, id: string): SeedEntry {
  const [japanese, reading, vietnamese, example_ja, example_vi, subcategory, d, j, pos, reg, tags, note] = r.fields;
  return {
    id,
    japanese,
    reading,
    vietnamese,
    example_ja,
    example_vi,
    category: r.category,
    subcategory: subcategory || null,
    difficulty: DIFF[d] ?? d,
    jlpt_level: JLPT[j] ?? j,
    part_of_speech: POS[pos] ?? (pos || null),
    usage_note: note || null,
    register: REG[reg] ?? reg,
    tags: tags
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean),
    source_type: 'AI-generated',
    source_reference: null,
    created_at: DATASET_DATE,
    dataset_version: DATASET_VERSION,
  };
}
