import { useEffect, useMemo, useRef, useState } from 'react';
import { buildMatchBoard, matchScore, type MatchCard } from '../../core/quiz/questions';
import type { VocabWithReview } from '../../core/vocabulary/types';
import type { GameProps } from './types';

export function MatchGame({ pool, onFinish }: GameProps) {
  const board = useMemo(() => buildMatchBoard(pool, 6), [pool]);
  const [selected, setSelected] = useState<MatchCard | null>(null);
  const [done, setDone] = useState<Set<number>>(new Set());
  const [shake, setShake] = useState<string[]>([]);
  const [mistakes, setMistakes] = useState<Map<number, number>>(new Map());
  const [elapsed, setElapsed] = useState(0);
  const start = useRef(Date.now());

  useEffect(() => {
    const t = setInterval(() => setElapsed(Date.now() - start.current), 250);
    return () => clearInterval(t);
  }, []);

  const totalMistakes = [...mistakes.values()].reduce((a, b) => a + b, 0);

  useEffect(() => {
    if (board.words.length && done.size === board.words.length) {
      const ms = Date.now() - start.current;
      const wrongWords: VocabWithReview[] = board.words.filter((w) => (mistakes.get(w.id) ?? 0) > 0);
      const t = setTimeout(
        () => onFinish({ score: matchScore(ms / 1000, totalMistakes), correct: board.words.length - wrongWords.length, total: board.words.length, durationMs: ms, wrong: wrongWords }),
        500,
      );
      return () => clearTimeout(t);
    }
  }, [done, board.words, mistakes, totalMistakes, onFinish]);

  const click = (c: MatchCard) => {
    if (done.has(c.wordId)) return;
    if (!selected || selected.side === c.side) {
      setSelected(c);
      return;
    }
    if (selected.wordId === c.wordId) {
      setDone(new Set(done).add(c.wordId));
    } else {
      setShake([selected.key, c.key]);
      setTimeout(() => setShake([]), 450);
      const m = new Map(mistakes);
      for (const id of [selected.wordId, c.wordId]) m.set(id, (m.get(id) ?? 0) + 1);
      setMistakes(m);
    }
    setSelected(null);
  };

  const cardClass = (c: MatchCard) =>
    `match-card${c.side === 'ja' ? ' ja' : ''}${done.has(c.wordId) ? ' done' : ''}${selected?.key === c.key ? ' selected' : ''}${shake.includes(c.key) ? ' shake' : ''}`;

  return (
    <div className="quiz-wrap">
      <div className="quiz-hud">
        <span>Đã ghép {done.size}/{board.words.length}</span>
        <span>❌ {totalMistakes}</span>
        <span>⏱️ {(elapsed / 1000).toFixed(1)}s</span>
      </div>
      <div className="match-grid">
        <div className="col">
          {board.left.map((c) => (
            <button key={c.key} className={cardClass(c)} onClick={() => click(c)} data-testid={`match-${c.key}`}>{c.text}</button>
          ))}
        </div>
        <div className="col">
          {board.right.map((c) => (
            <button key={c.key} className={cardClass(c)} onClick={() => click(c)} data-testid={`match-${c.key}`}>{c.text}</button>
          ))}
        </div>
      </div>
      <p className="muted small" style={{ textAlign: 'center' }}>Bấm một từ tiếng Nhật rồi bấm nghĩa tương ứng. Nhanh và ít lỗi = điểm cao.</p>
    </div>
  );
}
