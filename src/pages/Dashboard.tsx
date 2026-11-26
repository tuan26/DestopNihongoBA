import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../app/AppContext';
import { getCategoryProgress, getDashboardStats, type CategoryProgress, type DashboardStats } from '../core/stats/stats';
import { CATEGORY_LABELS_VI } from '../core/vocabulary/types';

const greeting = () => {
  const h = new Date().getHours();
  return h < 10 ? 'おはようございます' : h < 18 ? 'こんにちは' : 'お疲れ様です';
};

export function Dashboard() {
  const { db, dataVersion, settings } = useApp();
  const [s, setS] = useState<DashboardStats | null>(null);
  const [cats, setCats] = useState<CategoryProgress[]>([]);
  useEffect(() => {
    void getDashboardStats(db).then(setS);
    void getCategoryProgress(db).then(setCats);
  }, [db, dataVersion]);
  if (!s) return <div className="empty">Đang tải…</div>;
  const newLeft = Math.max(0, settings['study.newPerDay'] - s.newLearnedToday);
  const tiles = [
    { label: 'Cần ôn hôm nay', value: s.dueToday, testid: 'stat-due' },
    { label: 'Từ mới còn lại hôm nay', value: Math.min(newLeft, s.newCount) },
    { label: 'Đã ôn hôm nay', value: s.reviewedToday },
    { label: 'Từ hay quên', value: s.weak },
    { label: 'Chuỗi ngày học 🔥', value: s.streak },
    { label: 'Tổng số từ', value: s.total, testid: 'stat-total' },
  ];
  return (
    <>
      <div className="page-title">
        <h1>{greeting()} 👋</h1>
        <div className="spacer" />
        {s.pendingSuggestions > 0 && (
          <Link to="/discovery" className="badge badge-primary">
            {s.pendingSuggestions} từ AI chờ duyệt
          </Link>
        )}
      </div>
      <div className="grid grid-4">
        {tiles.map((t) => (
          <div className="card stat" key={t.label} data-testid={t.testid}>
            <span className="stat-value">{t.value.toLocaleString('vi-VN')}</span>
            <span className="stat-label">{t.label}</span>
          </div>
        ))}
      </div>

      <div className="grid grid-3" style={{ marginTop: 18 }}>
        <Link to="/study/daily" className="card mode-tile" style={{ textDecoration: 'none', color: 'inherit' }} data-testid="continue">
          <div className="mode-icon">📅</div>
          <div>
            <h3>{s.dueNow > 0 ? 'Tiếp tục ôn tập' : 'Học hằng ngày'}</h3>
            <p>
              {s.dueNow} từ đến hạn · {Math.min(newLeft, s.newCount)} từ mới
            </p>
          </div>
        </Link>
        <Link to="/study/quick5" className="card mode-tile" style={{ textDecoration: 'none', color: 'inherit' }} data-testid="quick5">
          <div className="mode-icon">⚡</div>
          <div>
            <h3>Quick 5</h3>
            <p>5 từ — khoảng 1 phút giữa hai cuộc họp</p>
          </div>
        </Link>
        <Link to="/study/quick10" className="card mode-tile" style={{ textDecoration: 'none', color: 'inherit' }}>
          <div className="mode-icon">⚡</div>
          <div>
            <h3>Quick 10</h3>
            <p>10 từ — khoảng 3 phút</p>
          </div>
        </Link>
        <Link to="/study/weak" className="card mode-tile" style={{ textDecoration: 'none', color: 'inherit' }}>
          <div className="mode-icon">🎯</div>
          <div>
            <h3>Từ hay quên</h3>
            <p>{s.weak} từ cần củng cố</p>
          </div>
        </Link>
        <Link to="/study/ba_meeting" className="card mode-tile" style={{ textDecoration: 'none', color: 'inherit' }}>
          <div className="mode-icon">🗣️</div>
          <div>
            <h3>BA Meeting</h3>
            <p>Từ vựng họp & thảo luận yêu cầu</p>
          </div>
        </Link>
        <Link to="/quiz" className="card mode-tile" style={{ textDecoration: 'none', color: 'inherit' }} data-testid="dash-quiz">
          <div className="mode-icon">🎮</div>
          <div>
            <h3>Trò chơi & Quiz</h3>
            <p>Trắc nghiệm, ghép cặp, đúng/sai 60 giây…</p>
          </div>
        </Link>
        <Link to="/study" className="card mode-tile" style={{ textDecoration: 'none', color: 'inherit' }}>
          <div className="mode-icon">🧠</div>
          <div>
            <h3>Tất cả chế độ</h3>
            <p>12 chế độ học</p>
          </div>
        </Link>
      </div>

      <div className="card" style={{ marginTop: 18 }}>
        <h3 style={{ marginTop: 0 }}>Tiến độ theo chủ đề</h3>
        <div className="col">
          {cats.map((c) => (
            <div key={c.category} className="row" style={{ flexWrap: 'nowrap' }}>
              <div style={{ width: 290 }} className="small">
                {CATEGORY_LABELS_VI[c.category] ?? c.category}
              </div>
              <div className="progress" style={{ flex: 1 }}>
                <div style={{ width: `${(c.started / Math.max(1, c.total)) * 100}%` }} />
              </div>
              <div className="small muted" style={{ width: 90, textAlign: 'right' }}>
                {c.started}/{c.total}
              </div>
            </div>
          ))}
        </div>
      </div>
      <p className="muted small">
        Trạng thái: {s.newCount} mới · {s.learning} đang học · {s.review} đã vào chu kỳ ôn · {s.favorites} yêu thích
      </p>
    </>
  );
}
