/**
 * Converter for the user's own LMS crawler output (`n1_data.json`: courses / sections / lessons / resources).
 * Runs locally inside the app; nothing from the file is stored outside the user's database.
 */
import type { Pack, PackDeck, PackQuestion } from './pack';
import { toSafeHtml } from './html';

interface CrawlerFile {
  courses: { id: string; title: string }[];
  sections: { id: string; course_id: string; title: string; order?: number }[];
  lessons: { id: string; section_id: string; api_id?: string; title: string; type: string; order?: number }[];
  resources: { id: string; lesson_id: string; type: string; raw_data: unknown }[];
}

interface RawAnswer {
  content?: string;
  isCorrect?: boolean;
}

interface RawQuestion {
  id?: string;
  content?: string;
  type?: string;
  tag?: string;
  explain?: string;
  audioUrl?: string;
  multipleChoiceHorizontal?: RawAnswer[];
  multipleChoiceAnswers?: RawAnswer[];
  questions?: RawQuestion[];
}

export function isCrawlerFile(x: unknown): x is CrawlerFile {
  const o = x as CrawlerFile;
  return !!o && Array.isArray(o.courses) && Array.isArray(o.sections) && Array.isArray(o.lessons) && Array.isArray(o.resources);
}

const clean = (s: string | undefined | null) => (s ?? '').replace(/\r\n/g, '\n').trim();

function choiceQuestion(q: RawQuestion, key: string, passage: string | null, skipped: Record<string, number>): PackQuestion | null {
  const answers = (q.multipleChoiceHorizontal?.length ? q.multipleChoiceHorizontal : q.multipleChoiceAnswers) ?? [];
  const options = answers.map((a) => clean(a.content));
  const answer = answers.findIndex((a) => a.isCorrect);
  if (options.length < 2 || answer < 0 || answers.filter((a) => a.isCorrect).length !== 1 || options.some((o) => !o)) {
    skipped[q.type ?? 'unknown'] = (skipped[q.type ?? 'unknown'] ?? 0) + 1;
    return null;
  }
  return {
    key,
    passage,
    prompt: toSafeHtml(q.content ?? ''),
    options,
    answer,
    explanation: toSafeHtml(q.explain ?? '') || null,
    tag: q.tag ?? null,
    audioUrl: q.audioUrl && /^https:\/\//.test(q.audioUrl) ? q.audioUrl : null,
  };
}

export function convertCrawlerFile(data: CrawlerFile, name = 'N1'): Pack {
  const courses = new Map(data.courses.map((c) => [c.id, c]));
  const sections = new Map(data.sections.map((s) => [s.id, s]));
  const lessons = new Map(data.lessons.map((l) => [l.id, l]));
  const decks: PackDeck[] = [];
  const skipped: Record<string, number> = {};
  const bump = (k: string, n = 1) => (skipped[k] = (skipped[k] ?? 0) + n);

  for (const r of data.resources) {
    const lesson = lessons.get(r.lesson_id);
    if (!lesson) continue;
    const section = sections.get(lesson.section_id);
    const course = section ? courses.get(section.course_id) : undefined;
    const base = {
      key: `crawler:${lesson.api_id ?? lesson.id}`,
      title: clean(lesson.title) || 'Không tên',
      course: course?.title?.trim() ?? null,
      section: section?.title?.trim() ?? null,
      order: (section?.order ?? 0) * 1000 + (lesson.order ?? 0),
    };
    if (r.type === 'FLASH_CARD') {
      const items = ((r.raw_data as { items?: { id: string; front?: string; back?: string; reading?: string }[] } | null)?.items ?? []).filter(
        (i) => clean(i.front) && clean(i.back),
      );
      if (!items.length) continue;
      decks.push({
        ...base,
        kind: 'flashcard',
        cards: items.map((i) => ({ key: `card:${i.id}`, front: clean(i.front), back: clean(i.back), reading: clean(i.reading) || null })),
      });
    } else if (r.type === 'QUIZ') {
      const exam = (r.raw_data as { exam?: { questionMapping?: RawQuestion[] } } | null)?.exam;
      const questions: PackQuestion[] = [];
      for (const q of exam?.questionMapping ?? []) {
        if (Array.isArray(q.questions) && q.questions.length) {
          const passage = toSafeHtml(q.content ?? '');
          for (const sub of q.questions) {
            const pq = choiceQuestion(sub, `${base.key}:${q.id}:${sub.id}`, passage, skipped);
            if (pq) questions.push(pq);
          }
        } else {
          const pq = choiceQuestion(q, `${base.key}:${q.id}`, null, skipped);
          if (pq) questions.push(pq);
        }
      }
      if (questions.length) decks.push({ ...base, kind: 'quiz', questions });
    } else {
      bump(`bài ${r.type}`);
    }
  }
  decks.sort((a, b) => (a.course ?? '').localeCompare(b.course ?? '') || (a.order ?? 0) - (b.order ?? 0));
  return { format: 'jbv-pack', version: 1, name, decks, skipped };
}

/** Parse any supported file text into a pack. */
export function parseImportText(text: string, fileName = 'N1'): Pack {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (e) {
    throw new Error(`File JSON không hợp lệ: ${(e as Error).message}`);
  }
  if (isCrawlerFile(data)) return convertCrawlerFile(data, fileName.replace(/\.json$/i, ''));
  if ((data as Pack)?.format === 'jbv-pack') {
    const pack = data as Pack;
    // Normalise free text from third-party packs into sanitized HTML once, at import time.
    for (const d of pack.decks ?? [])
      for (const q of d.questions ?? []) {
        q.prompt = toSafeHtml(q.prompt);
        q.passage = q.passage ? toSafeHtml(q.passage) : null;
        q.explanation = q.explanation ? toSafeHtml(q.explanation) : null;
      }
    return pack;
  }
  throw new Error('Không nhận ra định dạng. Hỗ trợ: n1_data.json của crawler, hoặc file jbv-pack.');
}
