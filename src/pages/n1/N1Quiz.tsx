import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useApp } from '../../app/AppContext';
import { sanitizeHtml } from '../../core/n1/html';
import { deckQuestions, randomQuestions, recordAnswer, wrongQuestions, type N1Question } from '../../core/n1/practice';

const Html = ({ html, className, testid }: { html: string; className?: string; testid?: string }) => (
  <div className={className} data-testid={testid} dangerouslySetInnerHTML={{ __html: sanitizeHtml(html) }} />
);

export function N1Quiz() {
  const { deck = 'random' } = useParams();
  const { db, dataChanged } = useApp();
  const [questions, setQuestions] = useState<N1Question[] | null>(null);
  const [i, setI] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [wrong, setWrong] = useState<N1Question[]>([]);
  const [correct, setCorrect] = useState(0);
  const [showPassage, setShowPassage] = useState(true);
  const [round, setRound] = useState(0);
  const [retry, setRetry] = useState<N1Question[] | null>(null);

  useEffect(() => {
    const load = retry
      ? Promise.resolve(retry)
      : deck === 'wrong'
        ? wrongQuestions(db, 30)
        : deck === 'random'
          ? randomQuestions(db, 20)
          : deckQuestions(db, Number(deck));
    void load.then((q) => {
      setQuestions(q);
      setI(0);
      setPicked(null);
      setWrong([]);
      setCorrect(0);
    });
  }, [db, deck, round, retry]);

  const q = questions?.[i] ?? null;
  const title = deck === 'wrong' ? '📕 Sổ câu sai' : deck === 'random' ? '🎲 Luyện ngẫu nhiên' : `📝 ${questions?.[0]?.deckTitle ?? ''}`;

  const choose = useCallback(
    async (idx: number) => {
      if (!q || picked != null) return;
      (document.activeElement as HTMLElement | null)?.blur();
      setPicked(idx);
      const ok = idx === q.answer;
      if (ok) setCorrect((c) => c + 1);
      else setWrong((w) => [...w, q]);
      await recordAnswer(db, q.id, idx, ok);
      dataChanged('n1-answer');
    },
    [q, picked, db, dataChanged],
  );

  const next = useCallback(() => {
    setPicked(null);
    setI((x) => x + 1);
    setShowPassage(true);
  }, []);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (['1', '2', '3', '4', '5', '6'].includes(e.key)) void choose(Number(e.key) - 1);
      else if (e.key === 'Enter') {
        e.preventDefault();
        if (picked != null) next();
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [choose, next, picked]);

  if (!questions) return <div className="empty">Đang tải…</div>;
  if (!questions.length)
    return (
      <div className="card flash">
        <div className="flash-word">🎉</div>
        <p>{deck === 'wrong' ? 'Sổ câu sai đang trống.' : 'Không có câu hỏi.'}</p>
        <Link className="btn btn-primary" to="/n1">Về Ôn N1</Link>
      </div>
    );

  if (!q) {
    const pct = Math.round((correct / questions.length) * 100);
    return (
      <div className="card flash" data-testid="n1-quiz-result">
        <div className="quiz-final-score">{correct}/{questions.length}</div>
        <div className="muted">Đúng {pct}%</div>
        <div className="row" style={{ justifyContent: 'center' }}>
          {wrong.length > 0 && (
            <button className="btn btn-primary" onClick={() => setRetry([...wrong])} data-testid="n1-retry-wrong">
              Làm lại {wrong.length} câu sai
            </button>
          )}
          <button
            className="btn"
            onClick={() => {
              setRetry(null);
              setRound((r) => r + 1);
            }}
          >
            Làm lại cả đề
          </button>
          <Link className="btn" to="/n1">Về Ôn N1</Link>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="page-title">
        <Link to="/n1" className="btn btn-ghost">←</Link>
        <h1>{retry ? '🔁 Làm lại câu sai' : title}</h1>
        <div className="spacer" />
        <span className="muted">Câu {i + 1}/{questions.length} · đúng {correct}</span>
      </div>
      <div className="progress" style={{ marginBottom: 14 }}>
        <div style={{ width: `${(i / questions.length) * 100}%` }} />
      </div>
      <div className="n1-quiz">
        {q.passage && (
          <div className="card n1-passage">
            <button className="btn btn-ghost btn-sm" onClick={() => setShowPassage((s) => !s)}>
              {showPassage ? '▾ Ẩn đoạn văn' : '▸ Hiện đoạn văn'}
            </button>
            {showPassage && <Html html={q.passage} className="ja n1-html" />}
          </div>
        )}
        <div className="card">
          {deck !== Number(deck).toString() && <div className="muted small">{q.deckTitle}</div>}
          {q.audioUrl && <audio controls src={q.audioUrl} style={{ width: '100%', margin: '6px 0' }} />}
          <Html html={q.prompt} className="ja n1-html n1-prompt" testid="n1-prompt" />
          <div className="n1-options">
            {q.options.map((o, idx) => {
              const st = picked == null ? '' : idx === q.answer ? ' right' : idx === picked ? ' wrong' : ' dim';
              return (
                <button key={idx} className={`quiz-option ja${st}`} onClick={() => void choose(idx)} data-testid={`n1-opt-${idx}`} data-correct={idx === q.answer}>
                  <span className="kbd">{idx + 1}</span> {o}
                </button>
              );
            })}
          </div>
          {picked != null && (
            <div className="n1-explain">
              <div className="row">
                <b>{picked === q.answer ? '✅ Chính xác!' : `❌ Đáp án đúng: ${q.options[q.answer]}`}</b>
                <div style={{ flex: 1 }} />
                <button className="btn btn-primary btn-sm" onClick={next} data-testid="n1-next">Câu tiếp <span className="kbd">Enter</span></button>
              </div>
              {q.explanation && <Html html={q.explanation} className="n1-html" />}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
