import type { Database } from '../db/types';
import { nowIso } from '../db/types';
import { normalizeKey, isKana } from '../vocabulary/normalize';
import { createVocabulary, validateContent } from '../vocabulary/repository';
import { CATEGORIES, DIFFICULTIES, JLPT_LEVELS, REGISTERS, type VocabContent } from '../vocabulary/types';

export const DISCOVERY_TOPICS: { id: string; label: string; category: string; hint: string }[] = [
  { id: 'BA', label: 'BA', category: 'BA / Requirement Engineering', hint: 'business analysis, stakeholder, as-is/to-be, business flow' },
  { id: 'Requirement', label: 'Requirement Engineering', category: 'BA / Requirement Engineering', hint: 'requirement definition, functional/non-functional requirements, specification documents' },
  { id: 'Business', label: 'Business Japanese', category: 'Japanese Business / Business Communication', hint: 'polite business expressions with clients' },
  { id: 'Software', label: 'Software Engineering', category: 'Software Engineering', hint: 'programming, design patterns, code review, API' },
  { id: 'Architecture', label: 'System Architecture', category: 'System Architecture / Design', hint: 'architecture styles, scalability, availability' },
  { id: 'Database', label: 'Database', category: 'Database / Data Engineering', hint: 'RDBMS, SQL tuning, data modeling, ETL' },
  { id: 'Cloud', label: 'Cloud', category: 'Cloud / DevOps / Infrastructure', hint: 'cloud services, IaC, CI/CD, monitoring' },
  { id: 'Security', label: 'Security', category: 'Security', hint: 'vulnerability, authentication, incident response' },
  { id: 'PM', label: 'Project Management', category: 'Project Management', hint: 'schedule, risk, progress reporting, estimation' },
  { id: 'Meeting', label: 'Meeting', category: 'BA / Requirement Engineering', hint: 'expressions used in meetings with Japanese clients' },
  { id: 'Email', label: 'Email', category: 'Japanese Business / Business Communication', hint: 'business email phrases' },
  { id: 'Negotiation', label: 'Negotiation', category: 'Japanese Business / Business Communication', hint: 'negotiating scope, cost, schedule, change requests' },
];

export const SYSTEM_PROMPT = `You are a Japanese business & IT terminology expert helping Vietnamese Business Analysts and Bridge SEs.
Return ONLY a JSON array, no prose. Each element must have exactly these keys:
japanese, reading (full reading in hiragana/katakana only), vietnamese (accurate Vietnamese meaning for the work context),
example_ja (one natural sentence used at work containing the word), example_vi (Vietnamese translation of example_ja),
category, subcategory, difficulty (intermediate|advanced|expert), jlpt_level (N2|N1|business|technical|unknown),
part_of_speech, usage_note (short Vietnamese note on usage/nuance), register (formal|business|technical|neutral), tags (array of short English tags).
Prefer N2–N1, business and technical vocabulary that is genuinely used in Japanese IT projects. Never output beginner words.
Do not invent fake words. Every example sentence must be different.`;

export function buildPrompt(opts: { topicId: string; customTopic?: string; count: number; avoid: string[] }): string {
  const topic = DISCOVERY_TOPICS.find((t) => t.id === opts.topicId) ?? DISCOVERY_TOPICS[0];
  const avoid = opts.avoid.slice(0, 400).join('、');
  return [
    `Generate ${opts.count} Japanese vocabulary entries for the topic "${topic.label}" (${topic.hint}).`,
    opts.customTopic ? `Focus specifically on: ${opts.customTopic}.` : '',
    `Use category "${topic.category}" unless another of these fits better: ${CATEGORIES.join(' | ')}.`,
    avoid ? `Do NOT include any of these existing words: ${avoid}` : '',
    'Output: JSON array only.',
  ]
    .filter(Boolean)
    .join('\n');
}

/** Extract the first JSON array from a model response (tolerates ```json fences and leading prose). */
export function extractJsonArray(text: string): unknown[] {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced ? fenced[1] : text;
  const start = body.indexOf('[');
  const end = body.lastIndexOf(']');
  if (start < 0 || end <= start) throw new Error('Phản hồi AI không chứa JSON array');
  const parsed = JSON.parse(body.slice(start, end + 1));
  if (!Array.isArray(parsed)) throw new Error('Phản hồi AI không phải array');
  return parsed;
}

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : v == null ? '' : String(v).trim());

export interface ParsedSuggestion {
  content: VocabContent;
  errors: string[];
}

export function coerceSuggestion(raw: unknown, fallbackCategory: string): ParsedSuggestion {
  const o = (raw ?? {}) as Record<string, unknown>;
  const errors: string[] = [];
  const pick = <T extends readonly string[]>(v: unknown, list: T, def: T[number]) => {
    const s = str(v);
    return (list as readonly string[]).includes(s) ? s : def;
  };
  const category = (CATEGORIES as readonly string[]).includes(str(o.category)) ? str(o.category) : fallbackCategory;
  const content: VocabContent = {
    japanese: str(o.japanese),
    reading: str(o.reading),
    vietnamese: str(o.vietnamese),
    example_ja: str(o.example_ja) || null,
    example_vi: str(o.example_vi) || null,
    category,
    subcategory: str(o.subcategory) || null,
    difficulty: pick(o.difficulty, DIFFICULTIES, 'advanced'),
    jlpt_level: pick(o.jlpt_level, JLPT_LEVELS, 'unknown'),
    part_of_speech: str(o.part_of_speech) || null,
    usage_note: str(o.usage_note) || null,
    register: pick(o.register, REGISTERS, 'business'),
    tags: Array.isArray(o.tags) ? o.tags.map(str).filter(Boolean).slice(0, 8) : [],
  };
  for (const e of validateContent(content)) errors.push(e.message);
  if (content.reading && !isKana(content.reading)) errors.push('Cách đọc không phải kana');
  if (!content.example_ja || !content.example_vi) errors.push('Thiếu câu ví dụ song ngữ');
  return { content, errors };
}

export interface Suggestion {
  id: number;
  batch_id: string;
  content: VocabContent;
  errors: string[];
  duplicate_of: number | null;
  status: 'pending' | 'approved' | 'rejected';
  provider: string | null;
  model: string | null;
  topic: string | null;
  trigger: string;
  created_at: string;
}

export type GenerateFn = (req: { system: string; prompt: string; maxTokens: number }) => Promise<string>;

export interface DiscoveryRequest {
  topicId: string;
  customTopic?: string;
  count: number;
  provider: string;
  model: string;
  trigger?: 'manual' | 'daily' | 'weekly';
}

/** Ask the AI, validate, detect duplicates (DB + within batch + pending suggestions) and store as pending. */
export async function runDiscovery(db: Database, req: DiscoveryRequest, generate: GenerateFn, now = new Date()) {
  const existing = await db.select<{ id: number; japanese: string; normalized_key: string }>(
    'SELECT id, japanese, normalized_key FROM vocabulary',
  );
  const pending = await db.select<{ normalized_key: string }>(
    "SELECT normalized_key FROM ai_suggestions WHERE status = 'pending'",
  );
  const topic = DISCOVERY_TOPICS.find((t) => t.id === req.topicId) ?? DISCOVERY_TOPICS[0];
  const relevant = existing.filter(() => true).map((e) => e.japanese);
  const text = await generate({
    system: SYSTEM_PROMPT,
    prompt: buildPrompt({ topicId: req.topicId, customTopic: req.customTopic, count: req.count, avoid: relevant }),
    maxTokens: Math.min(16000, 400 * req.count + 1000),
  });
  const items = extractJsonArray(text);
  const byKey = new Map(existing.map((e) => [e.normalized_key, Number(e.id)]));
  const pendingKeys = new Set(pending.map((p) => p.normalized_key));
  const batchKeys = new Set<string>();
  const batchId = `${now.toISOString()}-${Math.random().toString(36).slice(2, 7)}`;
  let stored = 0;
  let duplicates = 0;
  await db.transaction(async (tx) => {
    for (const raw of items) {
      const { content, errors } = coerceSuggestion(raw, topic.category);
      if (!content.japanese) continue;
      const key = normalizeKey(content.japanese);
      if (batchKeys.has(key) || pendingKeys.has(key)) continue; // silently drop exact repeats of pending items
      batchKeys.add(key);
      const dup = byKey.get(key) ?? null;
      if (dup) duplicates++;
      await tx.execute(
        `INSERT INTO ai_suggestions (batch_id, payload, normalized_key, duplicate_of, status, provider, model, topic, trigger, created_at)
         VALUES (?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?)`,
        [
          batchId,
          JSON.stringify({ ...content, _errors: errors }),
          key,
          dup,
          req.provider,
          req.model,
          req.customTopic ? `${topic.label}: ${req.customTopic}` : topic.label,
          req.trigger ?? 'manual',
          nowIso(now),
        ],
      );
      stored++;
    }
  });
  return { batchId, stored, duplicates, received: items.length };
}

const mapSuggestion = (r: Record<string, unknown>): Suggestion => {
  const payload = JSON.parse(String(r.payload)) as VocabContent & { _errors?: string[] };
  const { _errors, ...content } = payload;
  return {
    id: Number(r.id),
    batch_id: String(r.batch_id),
    content,
    errors: _errors ?? [],
    duplicate_of: r.duplicate_of == null ? null : Number(r.duplicate_of),
    status: r.status as Suggestion['status'],
    provider: (r.provider as string) ?? null,
    model: (r.model as string) ?? null,
    topic: (r.topic as string) ?? null,
    trigger: String(r.trigger),
    created_at: String(r.created_at),
  };
};

export async function listSuggestions(db: Database, status: Suggestion['status'] | 'all' = 'pending'): Promise<Suggestion[]> {
  const rows = await db.select<Record<string, unknown>>(
    status === 'all'
      ? 'SELECT * FROM ai_suggestions ORDER BY id DESC LIMIT 500'
      : 'SELECT * FROM ai_suggestions WHERE status = ? ORDER BY id DESC',
    status === 'all' ? [] : [status],
  );
  return rows.map(mapSuggestion);
}

export async function updateSuggestionContent(db: Database, id: number, content: VocabContent): Promise<void> {
  const key = normalizeKey(content.japanese);
  const dup = await db.select<{ id: number }>('SELECT id FROM vocabulary WHERE normalized_key = ? LIMIT 1', [key]);
  const errors = validateContent(content).map((e) => e.message);
  await db.execute('UPDATE ai_suggestions SET payload = ?, normalized_key = ?, duplicate_of = ? WHERE id = ?', [
    JSON.stringify({ ...content, _errors: errors }),
    key,
    dup[0]?.id ?? null,
    id,
  ]);
}

/** Approve: the only path by which AI words enter the learning deck. */
export async function approveSuggestion(db: Database, id: number, now = new Date()): Promise<number> {
  return db.transaction(async (tx) => {
    const rows = await tx.select<Record<string, unknown>>('SELECT * FROM ai_suggestions WHERE id = ?', [id]);
    if (!rows[0]) throw new Error('Không tìm thấy đề xuất');
    const s = mapSuggestion(rows[0]);
    if (s.status !== 'pending') throw new Error('Đề xuất đã được xử lý');
    const dup = await tx.select<{ id: number }>('SELECT id FROM vocabulary WHERE normalized_key = ?', [
      normalizeKey(s.content.japanese),
    ]);
    if (dup.length) throw new Error(`Từ "${s.content.japanese}" đã có trong thư viện`);
    const vid = await createVocabulary(tx, s.content, {
      source: 'ai',
      source_type: 'AI-generated',
      source_reference: `AI Discovery — ${s.provider ?? '?'} / ${s.model ?? '?'} — ${s.created_at.slice(0, 10)}`,
      now,
    });
    await tx.execute("UPDATE ai_suggestions SET status = 'approved', decided_at = ? WHERE id = ?", [nowIso(now), id]);
    return vid;
  });
}

export async function rejectSuggestion(db: Database, id: number, now = new Date()): Promise<void> {
  await db.execute("UPDATE ai_suggestions SET status = 'rejected', decided_at = ? WHERE id = ? AND status = 'pending'", [
    nowIso(now),
    id,
  ]);
}

/** Whether a periodic discovery run is due. */
export function isDiscoveryDue(schedule: string, lastRunAt: string | null, now = new Date()): boolean {
  if (schedule !== 'daily' && schedule !== 'weekly') return false;
  if (!lastRunAt) return true;
  const elapsed = now.getTime() - new Date(lastRunAt).getTime();
  return elapsed >= (schedule === 'daily' ? 86400000 : 7 * 86400000);
}
