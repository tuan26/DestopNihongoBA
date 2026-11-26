/**
 * Thin wrappers over Tauri APIs with graceful browser fallbacks (preview / E2E).
 */
import { isTauri } from './env';

type Unlisten = () => void;

async function inv<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<T>(cmd, args);
}

// ---------- events between windows ----------
const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('jbv-events') : null;

export async function emitEvent(name: string, payload: unknown = {}): Promise<void> {
  if (isTauri()) {
    const { emit } = await import('@tauri-apps/api/event');
    await emit(name, payload);
  } else {
    channel?.postMessage({ name, payload });
    window.dispatchEvent(new CustomEvent(name, { detail: payload }));
  }
}

export async function onEvent<T>(name: string, cb: (payload: T) => void): Promise<Unlisten> {
  if (isTauri()) {
    const { listen } = await import('@tauri-apps/api/event');
    return listen<T>(name, (e) => cb(e.payload));
  }
  const local = (e: Event) => cb((e as CustomEvent).detail as T);
  const remote = (e: MessageEvent) => {
    if (e.data?.name === name) cb(e.data.payload as T);
  };
  window.addEventListener(name, local);
  channel?.addEventListener('message', remote);
  return () => {
    window.removeEventListener(name, local);
    channel?.removeEventListener('message', remote);
  };
}

export const EVENTS = {
  vocabChanged: 'vocab://changed',
  cardSettings: 'card://settings',
  cardVisibility: 'card://visibility',
  navigate: 'main://navigate',
} as const;

export const notifyVocabChanged = (reason: string) => emitEvent(EVENTS.vocabChanged, { reason });

// ---------- windows ----------
export async function showCard(): Promise<void> {
  if (isTauri()) await inv('show_card');
}
export async function hideCard(): Promise<void> {
  if (isTauri()) await inv('hide_card');
  else await emitEvent(EVENTS.cardVisibility, { visible: false });
}
export async function toggleCard(): Promise<boolean> {
  return isTauri() ? inv<boolean>('toggle_card') : false;
}
export async function isCardVisible(): Promise<boolean> {
  return isTauri() ? inv<boolean>('card_visible') : false;
}
export async function showMain(route?: string): Promise<void> {
  if (isTauri()) await inv('show_main', { route: route ?? null });
  else if (route) window.open(`/#${route}`, '_blank');
}
export async function resetCardPosition(corner: string): Promise<void> {
  if (isTauri()) await inv('reset_card_position', { corner });
}
export async function applyCardBounds(bounds: { x: number; y: number; width: number; height: number } | null, corner: string) {
  if (isTauri()) await inv('apply_card_bounds', { bounds, corner });
}
export async function startDragging(): Promise<void> {
  if (!isTauri()) return;
  const { getCurrentWindow } = await import('@tauri-apps/api/window');
  await getCurrentWindow().startDragging();
}
export async function setResizable(r: boolean): Promise<void> {
  if (!isTauri()) return;
  const { getCurrentWindow } = await import('@tauri-apps/api/window');
  await getCurrentWindow().setResizable(r);
}
export async function onWindowBoundsChanged(cb: (b: { x: number; y: number; width: number; height: number }) => void): Promise<Unlisten> {
  if (!isTauri()) return () => {};
  const { getCurrentWindow } = await import('@tauri-apps/api/window');
  const w = getCurrentWindow();
  const report = async () => {
    const p = await w.outerPosition();
    const s = await w.innerSize();
    cb({ x: p.x, y: p.y, width: s.width, height: s.height });
  };
  const u1 = await w.onMoved(() => void report());
  const u2 = await w.onResized(() => void report());
  return () => {
    u1();
    u2();
  };
}

// ---------- backup ----------
export interface BackupInfo {
  path: string;
  name: string;
  size: number;
  modified: number;
}
export async function backupDatabase(reason: string): Promise<string | null> {
  return isTauri() ? inv<string | null>('backup_database', { reason }) : null;
}
export async function listBackups(): Promise<BackupInfo[]> {
  return isTauri() ? inv<BackupInfo[]>('list_backups') : [];
}
export async function restoreBackup(path: string): Promise<void> {
  if (isTauri()) await inv('restore_backup', { path });
}
export async function dbPath(): Promise<string> {
  return isTauri() ? inv<string>('db_path') : 'IndexedDB (chế độ xem trước trên trình duyệt)';
}

// ---------- files ----------
const XLSX_FILTER = [{ name: 'Excel', extensions: ['xlsx'] }];

/** Save bytes via native dialog (desktop) or a browser download. Returns the path/name or null if cancelled. */
export async function saveBytes(defaultName: string, bytes: Uint8Array): Promise<string | null> {
  if (isTauri()) {
    const { save } = await import('@tauri-apps/plugin-dialog');
    const path = await save({ defaultPath: defaultName, filters: XLSX_FILTER });
    if (!path) return null;
    await inv('save_file', { path, bytes: Array.from(bytes) });
    return path;
  }
  const blob = new Blob([bytes as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = defaultName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  return defaultName;
}

/** Pick an .xlsx file. Returns its bytes or null if cancelled. */
export async function openXlsx(): Promise<{ name: string; bytes: Uint8Array } | null> {
  if (isTauri()) {
    const { open } = await import('@tauri-apps/plugin-dialog');
    const path = await open({ multiple: false, filters: XLSX_FILTER });
    if (!path || Array.isArray(path)) return null;
    const bytes = await inv<number[]>('read_file', { path });
    return { name: String(path).split(/[\\/]/).pop() ?? 'file.xlsx', bytes: new Uint8Array(bytes) };
  }
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.xlsx';
    input.onchange = async () => {
      const f = input.files?.[0];
      resolve(f ? { name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) } : null);
    };
    input.click();
  });
}

export async function confirmDialog(message: string, title = 'Xác nhận'): Promise<boolean> {
  if (isTauri()) {
    const { confirm } = await import('@tauri-apps/plugin-dialog');
    return confirm(message, { title, kind: 'warning', okLabel: 'Đồng ý', cancelLabel: 'Hủy' });
  }
  return window.confirm(message);
}

// ---------- autostart & shortcut ----------
export async function setAutostart(enabled: boolean): Promise<void> {
  if (!isTauri()) return;
  const m = await import('@tauri-apps/plugin-autostart');
  if (enabled) await m.enable();
  else await m.disable();
}
export async function isAutostartEnabled(): Promise<boolean> {
  if (!isTauri()) return false;
  const m = await import('@tauri-apps/plugin-autostart');
  return m.isEnabled();
}

let registered: string | null = null;
/** Register (or unregister when `combo` is null) the global toggle-card shortcut. Opt-in only. */
export async function setGlobalShortcut(combo: string | null): Promise<void> {
  if (!isTauri()) return;
  const gs = await import('@tauri-apps/plugin-global-shortcut');
  if (registered) {
    await gs.unregister(registered).catch(() => undefined);
    registered = null;
  }
  if (!combo) return;
  await gs.register(combo, (e) => {
    if (e.state === 'Pressed') void toggleCard();
  });
  registered = combo;
}

// ---------- AI ----------
export interface AiStatus {
  anthropic: boolean;
  openai: boolean;
  anthropicFromEnv?: boolean;
  openaiFromEnv?: boolean;
}
export async function aiStatus(): Promise<AiStatus> {
  return isTauri() ? inv<AiStatus>('ai_status') : { anthropic: false, openai: false };
}
export async function setAiKey(provider: string, key: string | null): Promise<void> {
  if (!isTauri()) throw new Error('Chỉ hỗ trợ trong ứng dụng desktop');
  await inv('set_ai_key', { provider, key });
}
export async function aiGenerate(req: { provider: string; model: string; system: string; prompt: string; maxTokens: number }): Promise<string> {
  if (!isTauri()) throw new Error('AI Discovery chỉ hoạt động trong ứng dụng desktop (cần API key).');
  return inv<string>('ai_generate', { req });
}

/** Pick a JSON file and return its text (N1 deck import). */
export async function openJsonText(): Promise<{ name: string; text: string; path?: string } | null> {
  if (isTauri()) {
    const { open } = await import('@tauri-apps/plugin-dialog');
    const path = await open({ multiple: false, filters: [{ name: 'JSON', extensions: ['json'] }] });
    if (!path || Array.isArray(path)) return null;
    const text = await inv<string>('read_text_file', { path });
    return { name: String(path).split(/[\\/]/).pop() ?? 'data.json', text, path: String(path) };
  }
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = async () => {
      const f = input.files?.[0];
      resolve(f ? { name: f.name, text: await f.text() } : null);
    };
    input.click();
  });
}

export interface FoundFile {
  path: string;
  size: number;
  modified: number;
}
/** Desktop only: look for the user's own n1_data.json under the home folder. */
export async function findN1Data(): Promise<FoundFile[]> {
  return isTauri() ? inv<FoundFile[]>('find_n1_data') : [];
}
export async function fileModified(path: string): Promise<number | null> {
  return isTauri() ? inv<number | null>('file_modified', { path }) : null;
}
export async function readN1File(path: string): Promise<string> {
  return inv<string>('read_n1_file', { path });
}

export interface N1GithubConfig {
  repo: string;
  path: string;
  branch?: string;
}
export async function n1GithubStatus(): Promise<{ hasToken: boolean; source: string | null }> {
  return isTauri() ? inv('n1_github_status') : { hasToken: false, source: null };
}
export async function setN1GithubToken(token: string | null): Promise<void> {
  if (!isTauri()) throw new Error('Chỉ hỗ trợ trong ứng dụng desktop');
  await inv('set_n1_github_token', { token });
}
export async function downloadN1FromGithub(cfg: N1GithubConfig, force: boolean): Promise<{ path: string; changed: boolean; size: number }> {
  return inv('download_n1_from_github', { req: { repo: cfg.repo, path: cfg.path, branch: cfg.branch || null, force } });
}

/** File access used by N1 auto-sync (desktop). `getGithub` returns the saved repo config, if any. */
export function n1FileIO(getGithub?: () => Promise<N1GithubConfig | null>) {
  return {
    find: findN1Data,
    modified: async (p: string) => fileModified(p),
    read: readN1File,
    backup: (reason: string) => backupDatabase(reason),
    download: async (force: boolean) => {
      if (!isTauri() || !getGithub) return null;
      const cfg = await getGithub();
      if (!cfg?.repo || !cfg.path || !(await n1GithubStatus()).hasToken) return null;
      return downloadN1FromGithub(cfg, force);
    },
  };
}
