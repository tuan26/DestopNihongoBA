import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Database } from '../core/db/types';
import { DEFAULT_SETTINGS, loadSettings, saveSettings, type AppSettings } from '../core/settings/settings';
import { EVENTS, emitEvent, notifyVocabChanged, onEvent } from '../platform/native';

interface Ctx {
  db: Database;
  settings: AppSettings;
  updateSettings: (patch: Partial<AppSettings>) => Promise<void>;
  /** Increments whenever vocabulary / review data changes (in any window). */
  dataVersion: number;
  dataChanged: (reason: string) => void;
  toast: (msg: string, kind?: 'info' | 'error' | 'success') => void;
}

const AppCtx = createContext<Ctx | null>(null);

export function useApp(): Ctx {
  const c = useContext(AppCtx);
  if (!c) throw new Error('useApp outside provider');
  return c;
}

interface Toast {
  id: number;
  msg: string;
  kind: string;
}

export function applyTheme(s: AppSettings) {
  const root = document.documentElement;
  const dark =
    s['ui.theme'] === 'dark' ||
    (s['ui.theme'] === 'system' && window.matchMedia?.('(prefers-color-scheme: dark)').matches);
  root.dataset.theme = dark ? 'dark' : 'light';
  root.style.setProperty('--font-scale', String(s['ui.fontScale']));
}

export function AppProvider({ db, initial, children }: { db: Database; initial: AppSettings; children: ReactNode }) {
  const [settings, setSettings] = useState<AppSettings>(initial ?? DEFAULT_SETTINGS);
  const [dataVersion, setDataVersion] = useState(0);
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => applyTheme(settings), [settings]);
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    const h = () => applyTheme(settings);
    mq?.addEventListener('change', h);
    return () => mq?.removeEventListener('change', h);
  }, [settings]);

  useEffect(() => {
    const subs = [
      onEvent(EVENTS.vocabChanged, () => setDataVersion((v) => v + 1)),
      onEvent(EVENTS.cardSettings, async () => setSettings(await loadSettings(db))),
    ];
    return () => {
      subs.forEach((p) => p.then((u) => u()));
    };
  }, [db]);

  const updateSettings = useCallback(
    async (patch: Partial<AppSettings>) => {
      await saveSettings(db, patch);
      setSettings((s) => ({ ...s, ...patch }));
      await emitEvent(EVENTS.cardSettings, patch);
    },
    [db],
  );

  const dataChanged = useCallback((reason: string) => {
    void notifyVocabChanged(reason);
  }, []);

  const toast = useCallback((msg: string, kind: 'info' | 'error' | 'success' = 'info') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, msg, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === 'error' ? 7000 : 3500);
  }, []);

  const value = useMemo(
    () => ({ db, settings, updateSettings, dataVersion, dataChanged, toast }),
    [db, settings, updateSettings, dataVersion, dataChanged, toast],
  );
  return (
    <AppCtx.Provider value={value}>
      {children}
      <div className="toasts" role="status">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.kind}`}>
            {t.msg}
          </div>
        ))}
      </div>
    </AppCtx.Provider>
  );
}
