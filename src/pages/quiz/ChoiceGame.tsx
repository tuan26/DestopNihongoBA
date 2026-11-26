import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { buildChoiceQuestions, buildClozeQuestions, pointsFor, type ChoiceDirection } from '../../core/quiz/questions';
import type { VocabWithReview } from '../../core/vocabulary/types';
import type { GameProps } from './types';

const COUNT = 10;

export function ChoiceGame({ pool, onFinish, mode }: GameProps & { mode: ChoiceDirection | 'cloze' }) {
  const questions = useMemo(
    () => (mode === 'cloze' ? buildClozeQuestions(pool, COUNT) : buildChoiceQuestions(pool, COUNT, mode)),
    [pool, mode],
  );
  const [i, setI] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const [combo, setCombo] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [wrong, setWrong] = useState<VocabWithReview[]>([]);
  const start = useRef(Date.now());
  const q = questions[i];

  const next = useCallback(() => {
    if (i + 1 >= questions.length) {
      onFinish({ score, correct, total: questions.length, durationMs: Date.now() - start.current, wrong });
    } else {
      setI(i + 1);
      setPicked(null);
    }
  }, [i, questions.length, onFinish, score, correct, wrong]);

  const choose = useCallback(
    (idx: number) => {
      if (picked != null || !q) return;
      // Drop focus from the clicked button: otherwise Enter ("next") would also activate the button
      // at the same position in the next question and answer it by accident.
      (document.activeElement as HTMLElement | null)?.blur();
      setPicked(idx);
      if (q.options[idx].correct) {
        setScore((s) => s + pointsFor(combo));
        setCombo((c) => c + 1);
        setCorrect((c) => c + 1);
      } else {
        setCombo(0);
        setWrong((w) => [...w, q.word]);
      }
    },
    [picked, q, combo],
  );

  // auto-advance: quick after a right answer, longer after a wrong one so the correct answer can be read
  useEffect(() => {
    if (picked == null || !q) return;
    const t = setTimeout(next, q.options[picked].correct ? 700 : 2200);
    return () => clearTimeout(t);
  }, [picked, q, next]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (['1', '2', '3', '4'].includes(e.key)) choose(Number(e.key) - 1);
      else if (e.key === 'Enter') {
        e.preventDefault(); // never let Enter activate a focused option button
        if (picked != null) next();
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [choose, next, picked]);

  if (!q) return <div className="empty">Không đủ từ để tạo câu hỏi. Hãy chọn nguồn từ khác.</div>;

  return (
    <div className="quiz-wrap">
      <div className="quiz-hud">
        <span>Câu {i + 1}/{questions.length}</span>
        <span className={`quiz-combo${combo >= 3 ? ' hot' : ''}`}>{combo >= 2 ? `🔥 Combo ×${combo}` : ''}</span>
        <span data-testid="quiz-score">⭐ {score}</span>
      </div>
      <div className="progress" style={{ marginBottom: 14 }}>
        <div style={{ width: `${(i / questions.length) * 100}%` }} />
      </div>
      <div className="card quiz-prompt">
        {mode === 'cloze' && <div className="muted small">Chọn từ phù hợp điền vào chỗ trống</div>}
        {mode === 'reading' && <div className="muted small">Từ này đọc như thế nào?</div>}
        {mode === 'vi_ja' && <div className="muted small">Từ tiếng Nhật nào có nghĩa là…</div>}
        <div className={q.promptIsJapanese ? (mode === 'cloze' ? 'flash-context' : 'flash-word') : 'flash-meaning'} data-testid="quiz-prompt">
          {q.prompt}
        </div>
        {q.hint && <div className="muted">{q.hint}</div>}
      </div>
      <div className="quiz-options">
        {q.options.map((o, idx) => {
          const state = picked == null ? '' : o.correct ? ' right' : idx === picked ? ' wrong' : ' dim';
          return (
            <button key={idx} className={`quiz-option${state}${o.japanese ? ' ja' : ''}`} onClick={() => choose(idx)} data-testid={`opt-${idx}`} data-correct={o.correct}>
              <span className="kbd">{idx + 1}</span> {o.text}
            </button>
          );
        })}
      </div>
      {picked != null && (
        <div className="quiz-feedback">
          {q.options[picked].correct ? '✅ Chính xác!' : '❌ Chưa đúng.'} <b className="ja">{q.word.japanese}</b>（{q.word.reading}）— {q.word.vietnamese}
          <button className="btn btn-sm" onClick={next}>Tiếp <span className="kbd">Enter</span></button>
        </div>
      )}
    </div>
  );
}
