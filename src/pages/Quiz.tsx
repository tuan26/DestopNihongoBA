import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useApp } from '../app/AppContext';
import { DIRECTION_LABELS, QUIZ_GAMES, loadPool, type ChoiceDirection, type QuizGame, type QuizSource } from '../core/quiz/questions';
import { bestScores, markWrongForReview, recentResults, saveQuizResult, type QuizResult } from '../core/quiz/results';
import { CATEGORIES, CATEGORY_LABELS_VI, type VocabWithReview } from '../core/vocabulary/types';
import { ChoiceGame } from './quiz/ChoiceGame';
import { MatchGame } from './quiz/MatchGame';
import { TrueFalseGame } from './quiz/TrueFalseGame';
import { TypingGame } from './quiz/TypingGame';
import type { GameOutcome } from './quiz/types';

const SOURCES: { id: QuizSource; label: string }[] = [
  { id: 'learned', label: 'Từ đã học' },
  { id: 'all', label: 'Tất cả từ' },
  { id: 'weak', label: 'Từ hay quên' },
  { id: 'favorites', label: 'Từ yêu thích' },
  ...CATEGORIES.map((c) => ({ id: `category:${c}` as QuizSource, label: `Chủ đề: ${CATEGORY_LABELS_VI[c]}` })),
];

const gameLabel = (g: string) => QUIZ_GAMES.find((x) => x.id === g)?.label ?? g;

export function QuizHome() {
  const { db, dataVersion } = useApp();
  const nav = useNavigate();
  const [source, setSource] = useState<QuizSource>('learned');
  const [dir, setDir] = useState<ChoiceDirection>('ja_vi');
  const [best, setBest] = useState<Record<string, { best: number; plays: number }>>({});
  const [recent, setRecent] = useState<QuizResult[]>([]);
  useEffect(() => {
    void bestScores(db).then(setBest);
    void recentResults(db, 8).then(setRecent);
  }, [db, dataVersion]);

  const play = (g: QuizGame) => nav(`/quiz/${g}?source=${encodeURIComponent(source)}${g === 'choice' ? `&dir=${dir}` : ''}`);

  return (
    <>
      <div className="page-title">
        <h1>🎮 Trò chơi & Quiz</h1>
      </div>
      <div className="card row" style={{ marginBottom: 14 }}>
        <label className="field">
          Lấy từ từ
          <select className="select" value={source} onChange={(e) => setSource(e.target.value as QuizSource)} data-testid="quiz-source">
            {SOURCES.map((s) => (
              <option key={s.id} value={s.id}>{s.label}</option>
            ))}
          </select>
        </label>
        <label className="field">
          Hướng (Trắc nghiệm)
          <select className="select" value={dir} onChange={(e) => setDir(e.target.value as ChoiceDirection)}>
            {(Object.keys(DIRECTION_LABELS) as ChoiceDirection[]).map((d) => (
              <option key={d} value={d}>{DIRECTION_LABELS[d]}</option>
            ))}
          </select>
        </label>
        <span className="muted small" style={{ alignSelf: 'flex-end' }}>
          Kết quả quiz không tự thay đổi lịch ôn. Cuối ván bạn có thể đưa các từ trả lời sai vào ôn lại.
        </span>
      </div>
      <div className="grid grid-3">
        {QUIZ_GAMES.map((g) => (
          <button key={g.id} className="card mode-tile" onClick={() => play(g.id)} data-testid={`game-${g.id}`}>
            <div className="mode-icon">{g.icon}</div>
            <div>
              <h3>{g.label}</h3>
              <p>{g.description}</p>
              {best[g.id] && (
                <p style={{ marginTop: 6 }}>
                  <span className="badge badge-primary">🏆 {best[g.id].best}</span> <span className="small">{best[g.id].plays} ván</span>
                </p>
              )}
            </div>
          </button>
        ))}
      </div>
      {recent.length > 0 && (
        <div className="card" style={{ marginTop: 18 }}>
          <h3 style={{ marginTop: 0 }}>Ván gần đây</h3>
          <table className="table small">
            <tbody>
              {recent.map((r) => (
                <tr key={r.id}>
                  <td>{gameLabel(r.game)}{r.variant ? ` · ${DIRECTION_LABELS[r.variant as ChoiceDirection] ?? r.variant}` : ''}</td>
                  <td>⭐ {r.score}</td>
                  <td>{r.correct}/{r.total} đúng</td>
                  <td className="muted">{Math.round(r.durationMs / 1000)}s</td>
                  <td className="muted">{r.playedAt ? new Date(r.playedAt).toLocaleString('vi-VN') : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

export function QuizPlay() {
  const { game = 'choice' } = useParams();
  const [params] = useSearchParams();
  const source = (params.get('source') ?? 'learned') as QuizSource;
  const dir = (params.get('dir') ?? 'ja_vi') as ChoiceDirection;
  const { db, settings, dataChanged, toast } = useApp();
  const [pool, setPool] = useState<VocabWithReview[] | null>(null);
  const [fellBack, setFellBack] = useState(false);
  const [outcome, setOutcome] = useState<(GameOutcome & { isBest: boolean; previousBest: number | null }) | null>(null);
  const [round, setRound] = useState(0);
  const [requeued, setRequeued] = useState(false);

  useEffect(() => {
    setPool(null);
    void loadPool(db, source).then((r) => {
      setPool(r.words);
      setFellBack(r.fellBack);
    });
  }, [db, source, round]);

  const finish = useCallback(
    async (o: GameOutcome) => {
      const saved = await saveQuizResult(db, {
        game: game as QuizGame,
        variant: game === 'choice' ? dir : null,
        source,
        score: o.score,
        correct: o.correct,
        total: o.total,
        durationMs: o.durationMs,
        wrongIds: o.wrong.map((w) => w.id),
      });
      setOutcome({ ...o, isBest: saved.isBest, previousBest: saved.previousBest });
      dataChanged('quiz');
    },
    [db, game, dir, source, dataChanged],
  );

  const again = () => {
    setOutcome(null);
    setRequeued(false);
    setRound((r) => r + 1);
  };

  const meta = QUIZ_GAMES.find((g) => g.id === game) ?? QUIZ_GAMES[0];
  const uniqueWrong = outcome ? [...new Map(outcome.wrong.map((w) => [w.id, w])).values()] : [];

  return (
    <>
      <div className="page-title">
        <Link to="/quiz" className="btn btn-ghost">←</Link>
        <h1>{meta.icon} {meta.label}{game === 'choice' ? ` · ${DIRECTION_LABELS[dir]}` : ''}</h1>
      </div>
      {fellBack && !outcome && source === 'learned' && (
        <p className="muted small">Bạn chưa học đủ từ nên quiz lấy thêm từ trong toàn bộ thư viện.</p>
      )}
      {!pool ? (
        <div className="empty">Đang chuẩn bị…</div>
      ) : outcome ? (
        <div className="card flash" data-testid="quiz-result">
          <div className="flash-word">{outcome.isBest ? '🏆 Kỷ lục mới!' : outcome.correct === outcome.total && outcome.total > 0 ? '🎉 Hoàn hảo!' : 'お疲れ様でした！'}</div>
          <div className="quiz-final-score" data-testid="final-score">⭐ {outcome.score}</div>
          <div className="muted">
            {outcome.correct}/{outcome.total} đúng · {Math.round(outcome.durationMs / 1000)} giây
            {outcome.previousBest != null && !outcome.isBest && ` · Kỷ lục: ${outcome.previousBest}`}
          </div>
          {uniqueWrong.length > 0 && (
            <div style={{ width: '100%', maxWidth: 620, textAlign: 'left' }}>
              <h3>Các từ cần xem lại ({uniqueWrong.length})</h3>
              <table className="table small">
                <tbody>
                  {uniqueWrong.map((w) => (
                    <tr key={w.id}>
                      <td className="ja-word">{w.japanese}</td>
                      <td className="ja muted">{w.reading}</td>
                      <td>{w.vietnamese}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="row" style={{ justifyContent: 'center' }}>
            {uniqueWrong.length > 0 && (
              <button
                className="btn"
                disabled={requeued}
                data-testid="requeue"
                onClick={async () => {
                  const n = await markWrongForReview(db, uniqueWrong.map((w) => w.id), new Date(), settings['study.retention']);
                  setRequeued(true);
                  dataChanged('quiz-requeue');
                  toast(`Đã đưa ${n} từ vào lịch ôn lại`, 'success');
                }}
              >
                {requeued ? '✔ Đã đưa vào ôn lại' : '🔁 Đưa từ sai vào ôn lại'}
              </button>
            )}
            <button className="btn btn-primary" onClick={again} data-testid="play-again">Chơi lại</button>
            <Link className="btn" to="/quiz">Chọn trò khác</Link>
          </div>
        </div>
      ) : (
        <div key={round}>
          {game === 'match' ? (
            <MatchGame pool={pool} onFinish={finish} />
          ) : game === 'truefalse' ? (
            <TrueFalseGame pool={pool} onFinish={finish} />
          ) : game === 'typing' ? (
            <TypingGame pool={pool} onFinish={finish} />
          ) : (
            <ChoiceGame pool={pool} onFinish={finish} mode={game === 'cloze' ? 'cloze' : dir} />
          )}
        </div>
      )}
    </>
  );
}
