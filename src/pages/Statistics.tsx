import { useEffect, useState } from 'react';
import { useApp } from '../app/AppContext';
import {
  getCategoryProgress, getDailyActivity, getDashboardStats, getForecast, getRatingBreakdown,
  type CategoryProgress, type DailyActivity, type DashboardStats,
} from '../core/stats/stats';
import { CATEGORY_LABELS_VI } from '../core/vocabulary/types';
import { RATING_LABELS, type UserRating } from '../core/srs/scheduler';

export function Statistics() {
  const { db, dataVersion } = useApp();
  const [s, setS] = useState<DashboardStats | null>(null);
  const [act, setAct] = useState<DailyActivity[]>([]);
  const [fc, setFc] = useState<{ day: string; n: number }[]>([]);
  const [cats, setCats] = useState<CategoryProgress[]>([]);
  const [ratings, setRatings] = useState<Record<number, number>>({});
  useEffect(() => {
    void (async () => {
      setS(await getDashboardStats(db));
      setAct(await getDailyActivity(db, 30));
      setFc(await getForecast(db, 14));
      setCats(await getCategoryProgress(db));
      setRatings(await getRatingBreakdown(db, 30));
    })();
  }, [db, dataVersion]);
  if (!s) return <div className="empty">Đang tải…</div>;
  const maxAct = Math.max(1, ...act.map((a) => a.reviews));
  const maxFc = Math.max(1, ...fc.map((a) => a.n));
  const totalRatings = Object.values(ratings).reduce((a, b) => a + b, 0);
  const retention = totalRatings ? Math.round(((totalRatings - (ratings[1] ?? 0)) / totalRatings) * 100) : null;
  return (
    <>
      <div className="page-title"><h1>Thống kê</h1></div>
      <div className="grid grid-4">
        {[
          ['Tổng số từ', s.total],
          ['Đã bắt đầu học', s.total - s.newCount],
          ['Đang học / học lại', s.learning],
          ['Đã vào chu kỳ ôn', s.review],
          ['Chuỗi ngày học', s.streak],
          ['Tỉ lệ nhớ (30 ngày)', retention == null ? '—' : `${retention}%`],
        ].map(([l, v]) => (
          <div key={String(l)} className="card stat"><span className="stat-value">{v}</span><span className="stat-label">{l}</span></div>
        ))}
      </div>
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', marginTop: 14 }}>
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Lượt ôn 30 ngày qua</h3>
          <div className="bars">
            {act.map((a) => (
              <div key={a.day} className="bar" style={{ height: `${(a.reviews / maxAct) * 100}%` }} title={`${a.day}: ${a.reviews} lượt, ${a.newWords} từ mới, ${a.again} quên`}>
                <div className="bar-again" style={{ height: `${a.reviews ? (a.again / a.reviews) * 100 : 0}%` }} />
              </div>
            ))}
          </div>
          <div className="small muted">Phần đỏ: số lần “Quên”.</div>
        </div>
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Dự báo ôn tập 14 ngày tới</h3>
          <div className="bars">
            {fc.map((a) => (
              <div key={a.day} className="bar" style={{ height: `${(a.n / maxFc) * 100}%`, background: 'var(--good)' }} title={`${a.day}: ${a.n} từ`} />
            ))}
          </div>
          <div className="small muted">Hôm nay → 14 ngày sau.</div>
        </div>
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Đánh giá 30 ngày</h3>
          {([1, 2, 3, 4] as UserRating[]).map((r) => (
            <div key={r} className="row" style={{ flexWrap: 'nowrap' }}>
              <span style={{ width: 90 }} className={`rate-${r}`}>{RATING_LABELS[r].vi}</span>
              <div className="progress" style={{ flex: 1 }}><div style={{ width: `${totalRatings ? ((ratings[r] ?? 0) / totalRatings) * 100 : 0}%` }} /></div>
              <span className="small muted" style={{ width: 50, textAlign: 'right' }}>{ratings[r] ?? 0}</span>
            </div>
          ))}
        </div>
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Theo chủ đề (đã học / thuộc lâu)</h3>
          {cats.map((c) => (
            <div key={c.category} className="row small" style={{ flexWrap: 'nowrap' }}>
              <span style={{ width: 230 }}>{CATEGORY_LABELS_VI[c.category] ?? c.category}</span>
              <div className="progress" style={{ flex: 1 }}><div style={{ width: `${(c.started / Math.max(1, c.total)) * 100}%` }} /></div>
              <span className="muted" style={{ width: 90, textAlign: 'right' }}>{c.started}/{c.total} · {c.mature}</span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
