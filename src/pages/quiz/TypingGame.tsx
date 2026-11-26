import { useMemo, useRef, useState } from 'react';
import { buildTypingQuestions, checkReading, pointsFor } from '../../core/quiz/questions';
import type { VocabWithReview } from '../../core/vocabulary/types';
import type { GameProps } from './types';

const COUNT = 10;

export function TypingGame({ pool, onFinish }: GameProps) {
  const questions = useMemo(() => buildTypingQuestions(pool, COUNT), [pool]);
  const [i, setI] = useState(0);
  const [value, setValue] = useState('');
  const [result, setResult] = useState<null | boolean>(null);
  const [score, setScore] = useState(0);
  const [combo, setCombo] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [wrong, setWrong] = useState<VocabWithReview[]>([]);
  const start = useRef(Date.now());
  const composing = useRef(false);
  const w = questions[i];

  const submit = () => {
    if (!w) return;
    if (result != null) {
      if (i + 1 >= questions.length) onFinish({ score, correct, total: questions.length, durationMs: Date.now() - start.current, wrong });
      else {
        setI(i + 1);
        setValue('');
        setResult(null);
      }
      return;
    }
    if (!value.trim()) return;
    const ok = checkReading(value, w.reading);
    setResult(ok);
    if (ok) {
      setScore((s) => s + pointsFor(combo));
      setCombo((c) => c + 1);
      setCorrect((c) => c + 1);
    } else {
      setCombo(0);
      setWrong((x) => [...x, w]);
    }
  };

  if (!w) return <div className="empty">Không đủ từ có kanji trong nguồn này.</div>;
  return (
    <div className="quiz-wrap">
      <div className="quiz-hud">
        <span>Câu {i + 1}/{questions.length}</span>
        <span className="quiz-combo">{combo >= 2 ? `🔥 Combo ×${combo}` : ''}</span>
        <span>⭐ {score}</span>
      </div>
      <div className="card quiz-prompt">
        <div className="muted small">Gõ cách đọc bằng hiragana hoặc katakana</div>
        <div className="flash-word">{w.japanese}</div>
        <div className="muted">{w.vietnamese}</div>
      </div>
      <form
        className="row"
        style={{ justifyContent: 'center', marginTop: 16 }}
        onSubmit={(e) => {
          e.preventDefault();
          if (!composing.current) submit();
        }}
      >
        <input
          className={`input ja quiz-input${result == null ? '' : result ? ' right' : ' wrong'}`}
          lang="ja"
          autoFocus
          value={value}
          readOnly={result != null}
          onChange={(e) => setValue(e.target.value)}
          onCompositionStart={() => (composing.current = true)}
          onCompositionEnd={() => (composing.current = false)}
          placeholder="例：にんしきあわせ"
          data-testid="typing-input"
        />
        <button className="btn btn-primary" type="submit">{result == null ? 'Kiểm tra' : 'Tiếp'}</button>
      </form>
      {result != null && (
        <div className="quiz-feedback">
          {result ? '✅ Chính xác!' : '❌ Đáp án đúng:'} <b className="ja">{w.reading}</b>
        </div>
      )}
      <p className="muted small" style={{ textAlign: 'center' }}>
        Bật bộ gõ tiếng Nhật của Windows (Alt + ` hoặc Win + Space). Nhấn Enter để kiểm tra / sang câu tiếp.
      </p>
    </div>
  );
}
