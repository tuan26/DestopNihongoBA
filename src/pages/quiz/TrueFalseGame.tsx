import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { buildTrueFalseItems } from '../../core/quiz/questions';
import type { VocabWithReview } from '../../core/vocabulary/types';
import type { GameProps } from './types';

const DURATION = 60_000;

export function TrueFalseGame({ pool, onFinish }: GameProps) {
  const items = useMemo(() => buildTrueFalseItems(pool, 300), [pool]);
  const [i, setI] = useState(0);
  const [score, setScore] = useState(0);
  const [combo, setCombo] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [answered, setAnswered] = useState(0);
  const [wrong, setWrong] = useState<VocabWithReview[]>([]);
  const [flash, setFlash] = useState<'' | 'right' | 'wrong'>('');
  const [left, setLeft] = useState(DURATION);
  const start = useRef(Date.now());
  const finished = useRef(false);

  const finish = useCallback(() => {
    if (finished.current) return;
    finished.current = true;
    onFinish({ score, correct, total: answered, durationMs: Date.now() - start.current, wrong });
  }, [onFinish, score, correct, answered, wrong]);

  useEffect(() => {
    const t = setInterval(() => {
      const l = DURATION - (Date.now() - start.current);
      setLeft(Math.max(0, l));
      if (l <= 0) finish();
    }, 100);
    return () => clearInterval(t);
  }, [finish]);

  const answer = useCallback(
    (sayTrue: boolean) => {
      if (finished.current) return;
      const it = items[i % items.length];
      const ok = sayTrue === it.isCorrect;
      setAnswered((a) => a + 1);
      if (ok) {
        setScore((s) => s + 50 + Math.min(combo, 10) * 10);
        setCombo((c) => c + 1);
        setCorrect((c) => c + 1);
      } else {
        setCombo(0);
        setWrong((w) => [...w, it.word]);
      }
      setFlash(ok ? 'right' : 'wrong');
      setTimeout(() => setFlash(''), 180);
      setI((x) => x + 1);
    },
    [items, i, combo],
  );

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') answer(true);
      else if (e.key === 'ArrowLeft') answer(false);
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [answer]);

  const it = items[i % items.length];
  if (!it) return <div className="empty">Không đủ từ.</div>;
  return (
    <div className="quiz-wrap">
      <div className="quiz-hud">
        <span>⏱️ {Math.ceil(left / 1000)}s</span>
        <span className="quiz-combo">{combo >= 2 ? `🔥 Combo ×${combo}` : ''}</span>
        <span data-testid="tf-score">⭐ {score}</span>
      </div>
      <div className="progress" style={{ marginBottom: 14 }}>
        <div style={{ width: `${(left / DURATION) * 100}%`, background: left < 10000 ? 'var(--again)' : undefined }} />
      </div>
      <div className={`card quiz-prompt tf-${flash}`}>
        <div className="flash-word">{it.word.japanese}</div>
        <div className="muted ja">{it.word.reading}</div>
        <div className="flash-meaning" data-testid="tf-meaning">= {it.shownMeaning} ?</div>
      </div>
      <div className="tf-buttons">
        <button className="btn btn-lg rate-1" onClick={() => answer(false)} data-testid="tf-false">← Sai</button>
        <button className="btn btn-lg rate-3" onClick={() => answer(true)} data-testid="tf-true">Đúng →</button>
      </div>
      <p className="muted small" style={{ textAlign: 'center' }}>Phím ← Sai · → Đúng. Trả lời liên tiếp đúng để nhân điểm.</p>
    </div>
  );
}
