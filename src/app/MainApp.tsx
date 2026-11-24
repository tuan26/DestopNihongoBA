import { useEffect, useState } from 'react';
import { HashRouter, NavLink, Route, Routes, useNavigate } from 'react-router-dom';
import { useApp } from './AppContext';
import { Dashboard } from '../pages/Dashboard';
import { Library } from '../pages/Library';
import { StudyHome, StudySession } from '../pages/Study';
import { Discovery } from '../pages/Discovery';
import { Statistics } from '../pages/Statistics';
import { Settings } from '../pages/Settings';
import { EVENTS, onEvent, setGlobalShortcut, showCard, toggleCard, isCardVisible } from '../platform/native';
import { isTauri } from '../platform/env';
import { useDiscoveryScheduler } from '../pages/discoveryScheduler';

const NAV = [
  { to: '/', label: 'Tổng quan', icon: '🏠' },
  { to: '/library', label: 'Thư viện từ vựng', icon: '📚' },
  { to: '/study', label: 'Học', icon: '🧠' },
  { to: '/discovery', label: 'AI Discovery', icon: '✨' },
  { to: '/stats', label: 'Thống kê', icon: '📈' },
  { to: '/settings', label: 'Cài đặt', icon: '⚙️' },
];

function NavigationBridge() {
  const nav = useNavigate();
  useEffect(() => {
    const p = onEvent<{ route: string }>(EVENTS.navigate, ({ route }) => nav(route));
    return () => void p.then((u) => u());
  }, [nav]);
  return null;
}

function Shell() {
  const { settings, toast, dataVersion } = useApp();
  const [cardOn, setCardOn] = useState(false);
  useDiscoveryScheduler();

  // Startup: show the card if wanted, apply opt-in global shortcut.
  useEffect(() => {
    if (!isTauri()) return;
    if (settings['card.visible'] && settings['card.showOnStartup']) void showCard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!isTauri()) return;
    setGlobalShortcut(settings['shortcut.enabled'] ? settings['shortcut.toggleCard'] : null).catch((e) =>
      toast(`Không đăng ký được phím tắt ${settings['shortcut.toggleCard']}: ${e}. Hãy chọn tổ hợp khác.`, 'error'),
    );
  }, [settings, toast]);
  useEffect(() => {
    void isCardVisible().then(setCardOn);
    const p = onEvent<{ visible: boolean }>(EVENTS.cardVisibility, (e) => setCardOn(e.visible));
    return () => void p.then((u) => u());
  }, [dataVersion]);

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-logo">語</div>
          <div className="brand-name">
            Japanese BA
            <small>Vocabulary Assistant</small>
          </div>
        </div>
        {NAV.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.to === '/'} className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
            <span>{n.icon}</span>
            {n.label}
          </NavLink>
        ))}
        <div className="sidebar-footer">
          {isTauri() ? (
            <button className="btn" onClick={() => void toggleCard().then(setCardOn)} title="Ẩn/hiện floating card">
              {cardOn ? '🗂️ Ẩn card' : '🗂️ Hiện card'}
            </button>
          ) : (
            <a className="btn" href="?window=card" target="_blank" rel="noreferrer">
              🗂️ Mở card (xem trước)
            </a>
          )}
        </div>
      </aside>
      <main className="main">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/library" element={<Library />} />
          <Route path="/library/:id" element={<Library />} />
          <Route path="/study" element={<StudyHome />} />
          <Route path="/study/:mode" element={<StudySession />} />
          <Route path="/discovery" element={<Discovery />} />
          <Route path="/stats" element={<Statistics />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </main>
    </div>
  );
}

export function MainApp() {
  return (
    <HashRouter>
      <NavigationBridge />
      <Shell />
    </HashRouter>
  );
}
