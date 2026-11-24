import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/app.css';
import { currentWindowKind, isTauri } from './platform/env';
import { initializeDatabase, waitForReady } from './platform/bootstrap';
import { loadSettings } from './core/settings/settings';
import { AppProvider, applyTheme } from './app/AppContext';

const root = createRoot(document.getElementById('root')!);

function Fatal({ error }: { error: unknown }) {
  return (
    <div style={{ padding: 24, fontFamily: 'sans-serif' }}>
      <h2>Không thể khởi động ứng dụng</h2>
      <pre style={{ whiteSpace: 'pre-wrap' }}>{String((error as Error)?.message ?? error)}</pre>
      <p>Dữ liệu của bạn không bị xóa. Nếu lỗi xảy ra sau khi cập nhật, bản sao lưu nằm trong thư mục backups của ứng dụng.</p>
    </div>
  );
}

async function start() {
  const kind = currentWindowKind();
  if (kind === 'card') document.documentElement.classList.add('card-window');
  try {
    // In the desktop app only the main window initializes (migrations + seed); the card waits for it.
    const db = kind === 'card' && isTauri() ? await waitForReady() : (await initializeDatabase()).db;
    const settings = await loadSettings(db);
    applyTheme(settings);
    if (kind === 'card') {
      const { CardApp } = await import('./card/CardApp');
      root.render(
        <StrictMode>
          <AppProvider db={db} initial={settings}>
            <CardApp />
          </AppProvider>
        </StrictMode>,
      );
    } else {
      const { MainApp } = await import('./app/MainApp');
      root.render(
        <StrictMode>
          <AppProvider db={db} initial={settings}>
            <MainApp />
          </AppProvider>
        </StrictMode>,
      );
    }
  } catch (e) {
    console.error(e);
    root.render(<Fatal error={e} />);
  }
}

void start();
