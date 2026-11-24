import type { Database } from '../db/types';

export type CardMode = 'ja' | 'ja_reading' | 'reveal' | 'example' | 'compact' | 'mini';
export const CARD_MODE_LABELS: Record<CardMode, string> = {
  ja: 'Chỉ tiếng Nhật',
  ja_reading: 'Tiếng Nhật + cách đọc',
  reveal: 'Hiện nghĩa ngay',
  example: 'Đầy đủ kèm ví dụ',
  compact: 'Gọn (compact)',
  mini: 'Mini — chỉ từ tiếng Nhật',
};
export type Corner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

export interface AppSettings {
  'card.mode': CardMode;
  'card.opacity': number;
  'card.locked': boolean;
  'card.defaultPosition': Corner;
  'card.visible': boolean;
  'card.autoAdvanceSec': number;
  'card.deck': string;
  'card.showOnStartup': boolean;
  'shortcut.enabled': boolean;
  'shortcut.toggleCard': string;
  'app.autostart': boolean;
  'ui.theme': 'system' | 'light' | 'dark';
  'ui.fontScale': number;
  'study.newPerDay': number;
  'study.retention': number;
  'ai.provider': 'anthropic' | 'openai';
  'ai.model': string;
  'ai.schedule': 'manual' | 'daily' | 'weekly';
  'ai.scheduleTopic': string;
  'ai.scheduleCount': number;
  'ai.lastRunAt': string | null;
}

export const DEFAULT_SETTINGS: AppSettings = {
  'card.mode': 'ja_reading',
  'card.opacity': 0.95,
  'card.locked': false,
  'card.defaultPosition': 'bottom-right',
  'card.visible': true,
  'card.autoAdvanceSec': 0,
  'card.deck': 'smart',
  'card.showOnStartup': true,
  'shortcut.enabled': false,
  'shortcut.toggleCard': 'CommandOrControl+Alt+J',
  'app.autostart': false,
  'ui.theme': 'system',
  'ui.fontScale': 1,
  'study.newPerDay': 20,
  'study.retention': 0.9,
  'ai.provider': 'anthropic',
  'ai.model': 'claude-sonnet-5-5',
  'ai.schedule': 'manual',
  'ai.scheduleTopic': 'BA',
  'ai.scheduleCount': 10,
  'ai.lastRunAt': null,
};

export const DEFAULT_MODELS: Record<AppSettings['ai.provider'], string> = {
  anthropic: 'claude-sonnet-5-5',
  openai: 'gpt-4.1-mini',
};

export async function loadSettings(db: Database): Promise<AppSettings> {
  const rows = await db.select<{ key: string; value: string }>('SELECT key, value FROM settings');
  const s: AppSettings = { ...DEFAULT_SETTINGS };
  for (const r of rows) {
    if (r.key in s) {
      try {
        (s as unknown as Record<string, unknown>)[r.key] = JSON.parse(r.value);
      } catch {
        /* keep default */
      }
    }
  }
  return s;
}

export async function saveSetting<K extends keyof AppSettings>(db: Database, key: K, value: AppSettings[K]): Promise<void> {
  await db.execute(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    [key, JSON.stringify(value)],
  );
}

export async function saveSettings(db: Database, patch: Partial<AppSettings>): Promise<void> {
  await db.batch(
    Object.entries(patch).map(([k, v]) => ({
      sql: 'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      params: [k, JSON.stringify(v)],
    })),
  );
}

/** Raw key/value store for small internal state (e.g. card position). */
export async function getKv<T>(db: Database, key: string, fallback: T): Promise<T> {
  const r = await db.select<{ value: string }>('SELECT value FROM settings WHERE key = ?', [key]);
  if (!r[0]) return fallback;
  try {
    return JSON.parse(r[0].value) as T;
  } catch {
    return fallback;
  }
}

export async function setKv(db: Database, key: string, value: unknown): Promise<void> {
  await db.execute(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    [key, JSON.stringify(value)],
  );
}
