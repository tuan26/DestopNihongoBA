import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useApp } from '../app/AppContext';
import { FlashCard } from '../components/FlashCard';
import { STUDY_MODES, buildQueue, getMode, type StudyModeId } from '../core/study/modes';
import { rateWord } from '../core/srs/reviewService';
import { RATING_LABELS, formatInterval, previewIntervals, type UserRating } from '../core/srs/scheduler';
import { setFavorite } from '../core/vocabulary/repository';
import type { VocabWithReview } from '../core/vocabulary/types';
import { createNewReviewState } from '../core/srs/scheduler';

export function StudyHome() {
  const nav = useNavigate();
  return (
    <>
      <div className="page-title">
        <h1>Chọn chế độ học</h1>
      </div>
      <div className="grid grid-3">
        {STUDY_MODES.map((m) => (
          <button key={m.id} className="card mode-tile" onClick={() => nav(`/study/${m.id}`)} data-testid={`mode-${m.id}`}>
            <div className="mode-icon">{m.icon}</div>
            <div>
              <h3>{m.label}</h3>
              <p>{m.description}</p>
            </div>
          </button>
        ))}
      </div>
      <p className="muted small" style={{ marginTop: 18 }}>
        Phím tắt trong phiên học: <span className="kbd">Space</span> hiện đáp án · <span className="kbd">1</span> Quên ·{' '}
        <span className="kbd">2</span> Khó · <span className="kbd">3</span> Nhớ · <span className="kbd">4</span> Dễ ·{' '}
        <span className="kbd">F</span> Yêu thích
      </p>
    </>
  );
}

const REQUEUE_WINDOW_MS = 15 * 60 * 1000;

export function StudySession() {
  const { mode: modeParam } = useParams();
  const mode = getMode(modeParam ?? 'daily');
  const { db, settings, dataChanged, toast } = useApp();
  const [queue, setQueue] = useState<VocabWithReview[] | null>(null);
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [results, setResults] = useState<Record<UserRating, number>>({ 1: 0, 2: 0, 3: 0, 4: 0 });
  const [busy, setBusy] = useState(false);
  const [requeued, setRequeued] = useState<Record<number, number>>({});
  const opts = useMemo(() => ({ retention: settings['study.retention'] }), [settings]);

  useEffect(() => {
    let alive = true;
    void buildQueue(db, mode.id as StudyModeId, { newPerDay: settings['study.newPerDay'] }).then((q) => {
      if (alive) {
        setQueue(q);
        setIndex(0);
        setRevealed(false);
        setResults({ 1: 0, 2: 0, 3: 0, 4: 0 });
      }
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, mode.id]);

  const current = queue?.[index] ?? null;
  const intervals = useMemo(
    () => (current ? previewIntervals(current.review ?? createNewReviewState(current.id), new Date(), opts) : null),
    [current, opts],
  );

  const rate = useCallback(
    async (r: UserRating) => {
      if (!current || !revealed || busy) return;
      setBusy(true);
      try {
        const next = await rateWord(db, current.id, r, mode.id, new Date(), opts);
        setResults((p) => ({ ...p, [r]: p[r] + 1 }));
        const updated = { ...current, review: next };
        setQueue((q) => {
          if (!q) return q;
          const copy = [...q];
          copy[index] = updated;
          const soon = new Date(next.due).getTime() - Date.now() < REQUEUE_WINDOW_MS;
          if (soon && (requeued[current.id] ?? 0) < 3) copy.push(updated);
          return copy;
        });
        if (new Date(next.due).getTime() - Date.now() < REQUEUE_WINDOW_MS)
          setRequeued((m) => ({ ...m, [current.id]: (m[current.id] ?? 0) + 1 }));
        setIndex((i) => i + 1);
        setRevealed(false);
        dataChanged('review');
      } catch (e) {
        toast(`Lỗi lưu kết quả: ${(e as Error).message}`, 'error');
      } finally {
        setBusy(false);
      }
    },
    [current, revealed, busy, db, mode.id, opts, index, requeued, dataChanged, toast],
  );

  const toggleFav = useCallback(async () => {
    if (!current) return;
    await setFavorite(db, current.id, !current.is_favorite);
    setQueue((q) => q && q.map((w) => (w.id === current.id ? { ...w, is_favorite: !w.is_favorite } : w)));
    dataChanged('favorite');
  }, [current, db, dataChanged]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      if (e.code === 'Space') {
        e.preventDefault();
        setRevealed(true);
      } else if (['1', '2', '3', '4'].includes(e.key)) void rate(Number(e.key) as UserRating);
      else if (e.key === 'Enter' && revealed) void rate(3);
      else if (e.key.toLowerCase() === 'f') void toggleFav();
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [rate, revealed, toggleFav]);

  if (!queue) return <div className="empty">Đang chuẩn bị phiên học…</div>;

  const total = queue.length;
  const done = Object.values(results).reduce((a, b) => a + b, 0);

  if (!current) {
    return (
      <div className="card flash" data-testid="session-done">
        {total === 0 ? (
          <>
            <div className="flash-word">🎉</div>
            <h2>{mode.id === 'daily' ? 'Bạn đã hoàn thành phần ôn tập hôm nay!' : 'Không có từ nào phù hợp với chế độ này.'}</h2>
            <p className="muted">Thử Quick 5 hoặc học thêm từ mới.</p>
          </>
        ) : (
          <>
            <div className="flash-word">お疲れ様でした！</div>
            <p>Đã ôn {done} lượt trong chế độ “{mode.label}”.</p>
            <div className="row" style={{ justifyContent: 'center' }}>
              {([1, 2, 3, 4] as UserRating[]).map((r) => (
                <span key={r} className={`badge rate-${r}`}>
                  {RATING_LABELS[r].vi}: {results[r]}
                </span>
              ))}
            </div>
          </>
        )}
        <div className="row" style={{ justifyContent: 'center' }}>
          <Link className="btn" to="/study">
            Chọn chế độ khác
          </Link>
          <Link className="btn btn-primary" to="/study/quick5" reloadDocument={false} onClick={() => window.location.hash === '#/study/quick5' && window.location.reload()}>
            Quick 5
          </Link>
          <Link className="btn" to="/">
            Về tổng quan
          </Link>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="page-title">
        <Link to="/study" className="btn btn-ghost">
          ←
        </Link>
        <h1>
          {mode.icon} {mode.label}
        </h1>
        <div className="spacer" />
        <button className="btn btn-ghost" onClick={() => void toggleFav()} title="Yêu thích (F)">
          {current.is_favorite ? '⭐' : '☆'}
        </button>
        <span className="muted" data-testid="progress">
          {Math.min(index + 1, total)} / {total}
        </span>
      </div>
      <div className="progress" style={{ maxWidth: 760, margin: '0 auto 14px' }}>
        <div style={{ width: `${(index / Math.max(1, total)) * 100}%` }} />
      </div>
      <FlashCard word={current} front={mode.front} revealed={revealed} onReveal={() => setRevealed(true)} onSpeakError={(m) => toast(m, 'error')} />
      {revealed && (
        <div className="rating-row">
          {([1, 2, 3, 4] as UserRating[]).map((r) => (
            <button key={r} className={`btn rate-btn rate-${r}`} onClick={() => void rate(r)} disabled={busy} data-testid={`rate-${r}`}>
              {RATING_LABELS[r].vi} ({RATING_LABELS[r].en})
              <small>
                <span className="kbd">{r}</span> {intervals ? formatInterval(intervals[r]) : ''}
              </small>
            </button>
          ))}
        </div>
      )}
    </>
  );
}
