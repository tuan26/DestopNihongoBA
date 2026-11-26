import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useApp } from '../../app/AppContext';
import { buildN1CardQueue, rateN1Card, splitBack, type N1Card } from '../../core/n1/cards';
import { RATING_LABELS, createNewReviewState, formatInterval, previewIntervals, type UserRating } from '../../core/srs/scheduler';
import { speakJapanese } from '../../platform/tts';

const REQUEUE_MS = 15 * 60 * 1000;

export function N1Cards() {
  const { deck = 'today' } = useParams();
  const { db, settings, dataChanged, toast } = useApp();
  const [queue, setQueue] = useState<N1Card[] | null>(null);
  const [i, setI] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [done, setDone] = useState(0);
  const opts = useMemo(() => ({ retention: settings['study.retention'] }), [settings]);

  useEffect(() => {
    void buildN1CardQueue(db, deck === 'today' ? {} : { deckId: Number(deck) }).then((q) => {
      setQueue(q);
      setI(0);
      setRevealed(false);
    });
  }, [db, deck]);

  const card = queue?.[i] ?? null;
  const intervals = useMemo(() => (card ? previewIntervals(card.state ?? createNewReviewState(card.id), new Date(), opts) : null), [card, opts]);

  const rate = useCallback(
    async (r: UserRating) => {
      if (!card || !revealed) return;
      const next = await rateN1Card(db, card.id, r, new Date(), opts);
      setDone((d) => d + 1);
      setQueue((q) => {
        if (!q) return q;
        const copy = [...q];
        copy[i] = { ...card, state: next };
        if (new Date(next.due).getTime() - Date.now() < REQUEUE_MS) copy.push(copy[i]);
        return copy;
      });
      setI((x) => x + 1);
      setRevealed(false);
      dataChanged('n1-card');
    },
    [card, revealed, db, opts, i, dataChanged],
  );

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        e.preventDefault();
        setRevealed(true);
      } else if (['1', '2', '3', '4'].includes(e.key)) void rate(Number(e.key) as UserRating);
      else if (e.key === 'Enter' && revealed) void rate(3);
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [rate, revealed]);

  if (!queue) return <div className="empty">Đang tải…</div>;
  if (!card)
    return (
      <div className="card flash" data-testid="n1-cards-done">
        <div className="flash-word">{queue.length ? 'お疲れ様でした！' : '🎉'}</div>
        <p>{queue.length ? `Đã ôn ${done} lượt.` : 'Không còn thẻ nào cần ôn lúc này.'}</p>
        <Link className="btn btn-primary" to="/n1">Về Ôn N1</Link>
      </div>
    );

  const { meaning, details } = splitBack(card.back);
  return (
    <>
      <div className="page-title">
        <Link to="/n1" className="btn btn-ghost">←</Link>
        <h1>🃏 {deck === 'today' ? 'Ôn flashcard hôm nay' : card.deckTitle}</h1>
        <div className="spacer" />
        <span className="muted">{Math.min(i + 1, queue.length)} / {queue.length}</span>
      </div>
      <div className="card flash" data-testid="n1-card">
        <div className="row small muted" style={{ justifyContent: 'center' }}>
          <span className="badge">{card.course}</span>
          <span className="badge">{card.deckTitle}</span>
          {!card.state && <span className="badge badge-good">Thẻ mới</span>}
        </div>
        <div className="flash-word" style={{ whiteSpace: 'pre-line' }}>{card.front}</div>
        {card.reading && revealed && <div className="flash-reading">{card.reading}</div>}
        {!revealed ? (
          <button className="btn btn-primary btn-lg" onClick={() => setRevealed(true)} data-testid="n1-reveal">
            Hiện đáp án <span className="kbd">Space</span>
          </button>
        ) : (
          <>
            <div className="flash-meaning" data-testid="n1-meaning">{meaning}</div>
            {details && <div className="n1-back-details ja">{details}</div>}
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => {
                const res = speakJapanese(card.reading || card.front);
                if (!res.ok && res.message) toast(res.message, 'error');
              }}
            >
              🔊 Phát âm
            </button>
          </>
        )}
      </div>
      {revealed && (
        <div className="rating-row">
          {([1, 2, 3, 4] as UserRating[]).map((r) => (
            <button key={r} className={`btn rate-btn rate-${r}`} onClick={() => void rate(r)} data-testid={`n1-rate-${r}`}>
              {RATING_LABELS[r].vi}
              <small><span className="kbd">{r}</span> {intervals ? formatInterval(intervals[r]) : ''}</small>
            </button>
          ))}
        </div>
      )}
    </>
  );
}
