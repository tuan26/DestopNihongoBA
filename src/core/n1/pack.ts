/**
 * `jbv-pack` — the app's generic import format for user-provided decks (flashcards and multiple-choice quizzes).
 * The app never ships third-party course content; users import their own files.
 */
export interface PackCard {
  key: string;
  front: string;
  back: string;
  reading?: string | null;
}

export interface PackQuestion {
  key: string;
  /** Optional reading passage (sanitized HTML) shared by several questions. */
  passage?: string | null;
  /** Question text (sanitized HTML allowed). */
  prompt: string;
  options: string[];
  /** Index of the correct option. */
  answer: number;
  explanation?: string | null;
  tag?: string | null;
  audioUrl?: string | null;
}

export interface PackDeck {
  key: string;
  kind: 'flashcard' | 'quiz';
  title: string;
  course?: string | null;
  section?: string | null;
  order?: number;
  cards?: PackCard[];
  questions?: PackQuestion[];
}

export interface Pack {
  format: 'jbv-pack';
  version: 1;
  name: string;
  decks: PackDeck[];
  /** Items the converter could not represent (essay, matching…), for the import summary. */
  skipped?: Record<string, number>;
}

export interface PackSummary {
  name: string;
  courses: number;
  flashcardDecks: number;
  cards: number;
  quizDecks: number;
  questions: number;
  withAudio: number;
  skipped: Record<string, number>;
}

export function summarizePack(p: Pack): PackSummary {
  const fc = p.decks.filter((d) => d.kind === 'flashcard');
  const qz = p.decks.filter((d) => d.kind === 'quiz');
  return {
    name: p.name,
    courses: new Set(p.decks.map((d) => d.course ?? '')).size,
    flashcardDecks: fc.length,
    cards: fc.reduce((a, d) => a + (d.cards?.length ?? 0), 0),
    quizDecks: qz.length,
    questions: qz.reduce((a, d) => a + (d.questions?.length ?? 0), 0),
    withAudio: qz.reduce((a, d) => a + (d.questions?.filter((q) => q.audioUrl).length ?? 0), 0),
    skipped: p.skipped ?? {},
  };
}

/** Structural validation; returns a list of human-readable problems (empty = valid). */
export function validatePack(p: unknown): string[] {
  const errs: string[] = [];
  const o = p as Pack;
  if (!o || typeof o !== 'object') return ['File không phải JSON object'];
  if (o.format !== 'jbv-pack') errs.push('Thiếu "format": "jbv-pack"');
  if (!Array.isArray(o.decks)) return [...errs, 'Thiếu danh sách "decks"'];
  const keys = new Set<string>();
  o.decks.forEach((d, i) => {
    const at = `decks[${i}]`;
    if (!d.key) errs.push(`${at}: thiếu key`);
    else if (keys.has(d.key)) errs.push(`${at}: key trùng "${d.key}"`);
    keys.add(d.key);
    if (d.kind !== 'flashcard' && d.kind !== 'quiz') errs.push(`${at}: kind phải là flashcard hoặc quiz`);
    if (!d.title) errs.push(`${at}: thiếu title`);
    for (const [j, c] of (d.cards ?? []).entries()) {
      if (!c.key || !c.front?.trim() || !c.back?.trim()) errs.push(`${at}.cards[${j}]: cần key, front, back`);
    }
    for (const [j, q] of (d.questions ?? []).entries()) {
      if (!q.key || !q.prompt || !Array.isArray(q.options) || q.options.length < 2)
        errs.push(`${at}.questions[${j}]: cần key, prompt và ít nhất 2 options`);
      else if (!(q.answer >= 0 && q.answer < q.options.length)) errs.push(`${at}.questions[${j}]: answer ngoài phạm vi`);
    }
  });
  return errs.slice(0, 50);
}
