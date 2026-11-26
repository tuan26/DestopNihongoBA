import { useCallback, useEffect, useRef, useState } from 'react';
import { useApp } from '../app/AppContext';
import { CARD_MODE_LABELS, getKv, setKv, type CardMode } from '../core/settings/settings';
import { buildCardDeck } from '../core/study/cardDeck';
import { rateWord } from '../core/srs/reviewService';
import { RATING_LABELS, type UserRating } from '../core/srs/scheduler';
import { getVocabulary, setFavorite } from '../core/vocabulary/repository';
import { CATEGORY_LABELS_VI, type VocabWithReview } from '../core/vocabulary/types';
import { isTauri } from '../platform/env';
import {
  EVENTS, applyCardBounds, hideCard, onEvent, onWindowBoundsChanged, setResizable, showMain, startDragging,
} from '../platform/native';
import { speakJapanese } from '../platform/tts';
import { isN1WordId, n1CardIdOf } from '../core/n1/adapter';
import { rateN1Card } from '../core/n1/cards';

const QUICK_DECKS: { id: string; label: string }[] = [
  { id: 'smart', label: '📚 Từ vựng BA/IT' },
  { id: 'n1', label: '🗾 Thẻ N1 của bạn' },
  { id: 'mixed', label: '🔀 Trộn BA + N1' },
];

const BOUNDS_KEY = 'card.bounds';

export function CardApp() {
  const { db, settings, updateSettings, dataVersion, dataChanged } = useApp();
  const [queue, setQueue] = useState<VocabWithReview[]>([]);
  const [history, setHistory] = useState<VocabWithReview[]>([]);
  const [current, setCurrent] = useState<VocabWithReview | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [menu, setMenu] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const mode = settings['card.mode'];
  const locked = settings['card.locked'];
  const rootRef = useRef<HTMLDivElement>(null);

  const refill = useCallback(
    async (exclude: number[] = []) => {
      const deck = await buildCardDeck(db, settings['card.deck'], settings['study.newPerDay'], exclude);
      setQueue(deck);
      return deck;
    },
    [db, settings],
  );

  // initial load + deck change
  useEffect(() => {
    let alive = true;
    void refill().then((d) => {
      if (!alive) return;
      // first load keeps nothing; a deck switch jumps straight to the new deck's first card
      setCurrent(d[0] ?? null);
      setRevealed(false);
      setHistory([]);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, settings['card.deck']]);

  // keep the current word fresh when data changes in another window (favorite, edit, hide…)
  useEffect(() => {
    if (!current || isN1WordId(current.id)) return;
    void getVocabulary(db, current.id).then((v) => {
      if (!v || v.is_hidden) {
        setCurrent(null);
        void refill().then((d) => setCurrent(d[0] ?? null));
      } else setCurrent((c) => (c && c.id === v.id ? v : c));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataVersion]);

  // window bounds: restore once, then persist (desktop only)
  useEffect(() => {
    if (!isTauri()) return;
    let unlisten: (() => void) | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    void (async () => {
      const saved = await getKv<{ x: number; y: number; width: number; height: number } | null>(db, BOUNDS_KEY, null);
      await applyCardBounds(saved, settings['card.defaultPosition']).catch(() => undefined);
      unlisten = await onWindowBoundsChanged((b) => {
        clearTimeout(timer);
        timer = setTimeout(() => void setKv(db, BOUNDS_KEY, b), 400);
      });
    })();
    return () => {
      unlisten?.();
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db]);

  useEffect(() => {
    void setResizable(!locked).catch(() => undefined);
  }, [locked]);

  // reset position when the user picks another default corner
  useEffect(() => {
    const p = onEvent<Record<string, unknown>>(EVENTS.cardSettings, (patch) => {
      if (patch && 'card.defaultPosition' in patch) {
        void setKv(db, BOUNDS_KEY, null).then(() => applyCardBounds(null, String(patch['card.defaultPosition'])));
      }
    });
    return () => void p.then((u) => u());
  }, [db]);

  const next = useCallback(async () => {
    setRevealed(false);
    setMessage(null);
    if (current) setHistory((h) => [...h.slice(-49), current]);
    let q = queue.filter((w) => w.id !== current?.id);
    if (q.length === 0) q = (await refill(current ? [current.id] : [])).filter((w) => w.id !== current?.id);
    else setQueue(q);
    const n = q[0] ?? null;
    setQueue(q);
    setCurrent(n);
  }, [current, queue, refill]);

  const prev = useCallback(() => {
    setHistory((h) => {
      if (!h.length) return h;
      const p = h[h.length - 1];
      if (current) setQueue((q) => [current, ...q.filter((w) => w.id !== current.id)]);
      setCurrent(p);
      setRevealed(true);
      return h.slice(0, -1);
    });
  }, [current]);

  const rate = useCallback(
    async (r: UserRating) => {
      if (!current) return;
      const opts = { retention: settings['study.retention'] };
      if (isN1WordId(current.id)) await rateN1Card(db, n1CardIdOf(current.id), r, new Date(), opts);
      else await rateWord(db, current.id, r, 'card', new Date(), opts);
      dataChanged('card-review');
      setQueue((q) => q.filter((w) => w.id !== current.id));
      await next();
    },
    [current, db, settings, dataChanged, next],
  );

  const toggleFav = useCallback(async () => {
    if (!current || isN1WordId(current.id)) return;
    await setFavorite(db, current.id, !current.is_favorite);
    setCurrent({ ...current, is_favorite: !current.is_favorite });
    dataChanged('favorite');
  }, [current, db, dataChanged]);

  const speak = useCallback(() => {
    if (!current) return;
    const r = speakJapanese(current.reading || current.japanese);
    setMessage(r.ok ? null : (r.message ?? null));
  }, [current]);

  // auto-advance
  useEffect(() => {
    const sec = settings['card.autoAdvanceSec'];
    if (!sec || menu) return;
    const t = setTimeout(() => void next(), sec * 1000);
    return () => clearTimeout(t);
  }, [settings, current, menu, next]);

  // local shortcuts — only active while the card window itself has keyboard focus
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.altKey || e.metaKey) return;
      switch (e.key) {
        case ' ':
          e.preventDefault();
          setRevealed((r) => !r);
          break;
        case 'ArrowRight':
          void next();
          break;
        case 'ArrowLeft':
          prev();
          break;
        case 'Escape':
          if (menu) setMenu(false);
          else void hideCard();
          break;
        case 'f':
        case 'F':
          void toggleFav();
          break;
        case '1':
        case '2':
        case '3':
        case '4':
          if (revealed) void rate(Number(e.key) as UserRating);
          break;
        case 'p':
        case 'P':
          speak();
          break;
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [next, prev, toggleFav, rate, revealed, menu, speak]);

  const onDragStart = (e: React.MouseEvent) => {
    if (locked || e.button !== 0) return;
    void startDragging();
  };

  const showReading = mode !== 'ja' || revealed;
  const showMeaning = mode === 'reveal' || mode === 'example' || revealed;
  const showExample = mode === 'example' || (revealed && mode !== 'compact' && mode !== 'mini');
  const isMini = mode === 'mini';

  return (
    <div
      ref={rootRef}
      className={`fc${isMini ? ' fc-mini' : ''}`}
      style={{ ['--fc-opacity' as string]: settings['card.opacity'] }}
      data-testid="floating-card"
    >
      {!isMini && (
        <div className="fc-top">
          <div className={`drag${locked ? ' locked' : ''}`} onMouseDown={onDragStart} title={locked ? 'Card đang bị khóa vị trí' : 'Kéo để di chuyển'}>
            {locked ? '🔒' : '⋮⋮'} {current ? CATEGORY_LABELS_VI[current.category] ?? current.category : 'Japanese BA'}
          </div>
          {current && !isN1WordId(current.id) && (
            <button className={`icon-btn${current.is_favorite ? ' on' : ''}`} onClick={() => void toggleFav()} title="Yêu thích (F)" data-testid="card-fav">
              {current.is_favorite ? '★' : '☆'}
            </button>
          )}
          <button className="icon-btn" onClick={speak} title="Phát âm (P)">🔊</button>
          <button className="icon-btn" onClick={() => setMenu((m) => !m)} title="Tùy chọn" data-testid="card-menu">⋯</button>
          <button className="icon-btn" onClick={() => void hideCard()} title="Ẩn card (Esc)">✕</button>
        </div>
      )}
      {menu && (
        <div className="fc-menu" onMouseLeave={() => setMenu(false)}>
          {(Object.keys(CARD_MODE_LABELS) as CardMode[]).map((m) => (
            <button key={m} className={m === mode ? 'active' : ''} onClick={() => void updateSettings({ 'card.mode': m })}>
              {m === mode ? '● ' : '○ '}
              {CARD_MODE_LABELS[m]}
            </button>
          ))}
          <hr />
          {QUICK_DECKS.map((d) => (
            <button key={d.id} className={settings['card.deck'] === d.id ? 'active' : ''} onClick={() => void updateSettings({ 'card.deck': d.id })} data-testid={`card-deck-${d.id}`}>
              {settings['card.deck'] === d.id ? '● ' : '○ '}
              {d.label}
            </button>
          ))}
          <hr />
          <button onClick={() => void updateSettings({ 'card.locked': !locked })}>{locked ? '🔓 Mở khóa vị trí' : '🔒 Khóa vị trí'}</button>
          {[0.6, 0.8, 0.95].map((o) => (
            <button key={o} className={Math.abs(settings['card.opacity'] - o) < 0.01 ? 'active' : ''} onClick={() => void updateSettings({ 'card.opacity': o })}>
              Độ trong suốt {Math.round(o * 100)}%
            </button>
          ))}
          <hr />
          {current && (
            <button onClick={() => void showMain(isN1WordId(current.id) ? '/n1' : `/library/${current.id}`)}>
              📖 {isN1WordId(current.id) ? 'Mở Ôn N1' : 'Xem chi tiết từ'}
            </button>
          )}
          <button onClick={() => void showMain('/study/quick5')}>⚡ Học Quick 5</button>
          <button onClick={() => void showMain('/settings')}>⚙️ Cài đặt card</button>
        </div>
      )}

      {isMini && !locked && (
        <div className="fc-mini-handle" onMouseDown={onDragStart} title="Kéo để di chuyển">
          ⋮
        </div>
      )}
      <div
        className="fc-body"
        onClick={() => setRevealed((r) => !r)}
        onDoubleClick={isMini ? () => void updateSettings({ 'card.mode': 'ja_reading' }) : undefined}
        title={isMini ? `${current?.reading ?? ''} — ${current?.vietnamese ?? ''} (nhấp đúp để mở rộng)` : undefined}
      >
        {loading ? (
          <span className="fc-empty">Đang tải…</span>
        ) : !current ? (
          <span className="fc-empty">Không có từ nào trong bộ này. Đổi bộ từ trong Cài đặt.</span>
        ) : (
          <>
            <div className="fc-word" data-testid="card-word">{current.japanese}</div>
            {showReading && !isMini && <div className="fc-reading">{current.reading}</div>}
            {isMini && revealed && <div className="fc-meaning">{current.vietnamese}</div>}
            {!isMini && showMeaning && <div className="fc-meaning" data-testid="card-meaning">{current.vietnamese}</div>}
            {!isMini && showExample && current.example_ja && (
              <>
                <div className="fc-example">例：{current.example_ja}</div>
                <div className="fc-example-vi">{current.example_vi}</div>
              </>
            )}
            {!isMini && !showMeaning && (
              <button className="fc-reveal" onClick={(e) => { e.stopPropagation(); setRevealed(true); }} data-testid="card-reveal">
                Hiện nghĩa
              </button>
            )}
            {message && <div className="fc-example-vi">{message}</div>}
          </>
        )}
      </div>

      {!isMini && (
        <div className="fc-bottom">
          <button className="icon-btn" onClick={prev} title="Từ trước (←)" disabled={!history.length}>‹</button>
          {revealed || mode === 'reveal' || mode === 'example' ? (
            ([1, 2, 3, 4] as UserRating[]).map((r) => (
              <button key={r} className={`fc-rate rate-${r}`} onClick={() => void rate(r)} title={`${RATING_LABELS[r].en} (${r})`} data-testid={`card-rate-${r}`}>
                {mode === 'compact' ? RATING_LABELS[r].en[0] : RATING_LABELS[r].vi}
              </button>
            ))
          ) : (
            <div style={{ flex: 1 }} />
          )}
          <button className="icon-btn" onClick={() => void next()} title="Từ tiếp (→)" data-testid="card-next">›</button>
        </div>
      )}
    </div>
  );
}
