import { useEffect, useState } from 'react';
import { useApp } from '../app/AppContext';
import { CARD_MODE_LABELS, DEFAULT_MODELS, type AppSettings, type CardMode, type Corner } from '../core/settings/settings';
import { listCollections, type Collection } from '../core/vocabulary/collections';
import { CATEGORIES, CATEGORY_LABELS_VI } from '../core/vocabulary/types';
import { isTauri } from '../platform/env';
import {
  aiStatus, backupDatabase, confirmDialog, dbPath, isAutostartEnabled, listBackups, resetCardPosition, restoreBackup,
  setAiKey, setAutostart, showCard, type AiStatus, type BackupInfo,
} from '../platform/native';
import { importedVersions } from '../core/seed/importer';

const CORNERS: { id: Corner; label: string }[] = [
  { id: 'top-left', label: 'Trên trái' },
  { id: 'top-right', label: 'Trên phải' },
  { id: 'bottom-left', label: 'Dưới trái' },
  { id: 'bottom-right', label: 'Dưới phải' },
];

export function DeckSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { db } = useApp();
  const [cols, setCols] = useState<Collection[]>([]);
  useEffect(() => void listCollections(db).then(setCols), [db]);
  return (
    <select className="select" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="smart">Thông minh (đến hạn → từ mới)</option>
      <option value="favorites">Từ yêu thích</option>
      <option value="weak">Từ hay quên</option>
      {CATEGORIES.map((c) => (
        <option key={c} value={`category:${c}`}>Chủ đề: {CATEGORY_LABELS_VI[c]}</option>
      ))}
      {cols.map((c) => (
        <option key={c.id} value={`collection:${c.id}`}>Collection: {c.name}</option>
      ))}
    </select>
  );
}

export function Settings() {
  const { db, settings, updateSettings, toast } = useApp();
  const [autostart, setAuto] = useState(false);
  const [status, setStatus] = useState<AiStatus | null>(null);
  const [key, setKey] = useState('');
  const [backups, setBackups] = useState<BackupInfo[]>([]);
  const [path, setPath] = useState('');
  const [versions, setVersions] = useState<string[]>([]);
  const set = <K extends keyof AppSettings>(k: K, v: AppSettings[K]) => void updateSettings({ [k]: v } as Partial<AppSettings>);

  useEffect(() => {
    void isAutostartEnabled().then(setAuto);
    void aiStatus().then(setStatus);
    void listBackups().then(setBackups);
    void dbPath().then(setPath);
    void importedVersions(db).then(setVersions);
  }, [db]);

  const provider = settings['ai.provider'];

  return (
    <>
      <div className="page-title"><h1>Cài đặt</h1></div>
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))' }}>
        <section className="card col">
          <h3 style={{ margin: 0 }}>🗂️ Floating card</h3>
          <label className="field">Chế độ hiển thị
            <select className="select" value={settings['card.mode']} onChange={(e) => set('card.mode', e.target.value as CardMode)} data-testid="card-mode">
              {(Object.keys(CARD_MODE_LABELS) as CardMode[]).map((m) => <option key={m} value={m}>{CARD_MODE_LABELS[m]}</option>)}
            </select>
          </label>
          <label className="field">Bộ từ hiển thị trên card
            <DeckSelect value={settings['card.deck']} onChange={(v) => set('card.deck', v)} />
          </label>
          <label className="field">Độ trong suốt: {Math.round(settings['card.opacity'] * 100)}%
            <input type="range" min={0.3} max={1} step={0.05} value={settings['card.opacity']} onChange={(e) => set('card.opacity', Number(e.target.value))} />
          </label>
          <label className="field">Tự chuyển từ sau (giây, 0 = tắt)
            <input className="input" type="number" min={0} max={3600} value={settings['card.autoAdvanceSec']} onChange={(e) => set('card.autoAdvanceSec', Math.max(0, Number(e.target.value)))} />
          </label>
          <label className="toggle"><input type="checkbox" checked={settings['card.locked']} onChange={(e) => set('card.locked', e.target.checked)} />Khóa vị trí & kích thước</label>
          <label className="toggle"><input type="checkbox" checked={settings['card.showOnStartup']} onChange={(e) => set('card.showOnStartup', e.target.checked)} />Hiện card khi khởi động</label>
          <div className="row">
            <span className="small muted">Vị trí mặc định:</span>
            <select className="select" value={settings['card.defaultPosition']} onChange={(e) => set('card.defaultPosition', e.target.value as Corner)}>
              {CORNERS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
            {isTauri() && (
              <button className="btn btn-sm" onClick={async () => { await showCard(); await resetCardPosition(settings['card.defaultPosition']); }}>
                Đưa card về vị trí này
              </button>
            )}
          </div>
        </section>

        <section className="card col">
          <h3 style={{ margin: 0 }}>⌨️ Phím tắt & khởi động</h3>
          <p className="small muted" style={{ margin: 0 }}>
            Khi card đang được chọn: <span className="kbd">Space</span> hiện nghĩa · <span className="kbd">→</span> từ tiếp · <span className="kbd">←</span> từ trước ·{' '}
            <span className="kbd">Esc</span> ẩn card · <span className="kbd">F</span> yêu thích · <span className="kbd">1-4</span> đánh giá. Các phím này không ảnh hưởng ứng dụng khác.
          </p>
          <label className="toggle">
            <input type="checkbox" checked={settings['shortcut.enabled']} onChange={(e) => set('shortcut.enabled', e.target.checked)} data-testid="shortcut-enabled" />
            Bật phím tắt toàn cục để ẩn/hiện card (mặc định tắt)
          </label>
          <label className="field">Tổ hợp phím
            <input className="input" value={settings['shortcut.toggleCard']} onChange={(e) => set('shortcut.toggleCard', e.target.value)} disabled={!settings['shortcut.enabled']} />
            <span className="small">Ví dụ: CommandOrControl+Alt+J, Ctrl+Shift+Space. Chọn tổ hợp ít dùng để tránh xung đột.</span>
          </label>
          <label className="toggle">
            <input type="checkbox" checked={autostart} disabled={!isTauri()} onChange={async (e) => {
              try {
                await setAutostart(e.target.checked);
                setAuto(e.target.checked);
                await updateSettings({ 'app.autostart': e.target.checked });
              } catch (err) { toast(String(err), 'error'); }
            }} />
            Khởi động cùng Windows (chạy nền, chỉ hiện card)
          </label>
          <p className="small muted" style={{ margin: 0 }}>Đóng cửa sổ chính sẽ thu nhỏ app xuống khay hệ thống; chọn “Thoát” trong menu khay để tắt hẳn.</p>
        </section>

        <section className="card col">
          <h3 style={{ margin: 0 }}>🎨 Giao diện</h3>
          <label className="field">Chủ đề
            <select className="select" value={settings['ui.theme']} onChange={(e) => set('ui.theme', e.target.value as AppSettings['ui.theme'])} data-testid="theme">
              <option value="system">Theo hệ thống</option>
              <option value="light">Sáng</option>
              <option value="dark">Tối</option>
            </select>
          </label>
          <label className="field">Cỡ chữ: {Math.round(settings['ui.fontScale'] * 100)}%
            <input type="range" min={0.85} max={1.4} step={0.05} value={settings['ui.fontScale']} onChange={(e) => set('ui.fontScale', Number(e.target.value))} />
          </label>
        </section>

        <section className="card col">
          <h3 style={{ margin: 0 }}>🧠 Học tập (FSRS)</h3>
          <label className="field">Số từ mới mỗi ngày
            <input className="input" type="number" min={0} max={200} value={settings['study.newPerDay']} onChange={(e) => set('study.newPerDay', Math.min(200, Math.max(0, Number(e.target.value))))} />
          </label>
          <label className="field">Tỉ lệ ghi nhớ mục tiêu: {Math.round(settings['study.retention'] * 100)}%
            <input type="range" min={0.8} max={0.97} step={0.01} value={settings['study.retention']} onChange={(e) => set('study.retention', Number(e.target.value))} />
            <span className="small">Cao hơn = ôn thường xuyên hơn. Khuyến nghị 90%.</span>
          </label>
        </section>

        <section className="card col">
          <h3 style={{ margin: 0 }}>✨ AI Discovery</h3>
          <label className="field">Provider
            <select className="select" value={provider} onChange={(e) => {
              const p = e.target.value as AppSettings['ai.provider'];
              void updateSettings({ 'ai.provider': p, 'ai.model': DEFAULT_MODELS[p] });
            }}>
              <option value="anthropic">Anthropic Claude</option>
              <option value="openai">OpenAI</option>
            </select>
          </label>
          <label className="field">Model
            <input className="input" value={settings['ai.model']} onChange={(e) => set('ai.model', e.target.value)} />
          </label>
          <div className="small">
            Trạng thái key: {status ? (status[provider] ? <span className="badge badge-good">Đã cấu hình{(provider === 'anthropic' ? status.anthropicFromEnv : status.openaiFromEnv) ? ' (biến môi trường)' : ''}</span> : <span className="badge badge-warn">Chưa có</span>) : '…'}
          </div>
          <div className="row">
            <input className="input" style={{ flex: 1 }} type="password" placeholder="Dán API key" value={key} onChange={(e) => setKey(e.target.value)} disabled={!isTauri()} autoComplete="off" />
            <button className="btn btn-primary" disabled={!key || !isTauri()} onClick={async () => {
              try {
                await setAiKey(provider, key);
                setKey('');
                setStatus(await aiStatus());
                toast('Đã lưu API key', 'success');
              } catch (e) { toast(String(e), 'error'); }
            }}>Lưu</button>
            <button className="btn" disabled={!isTauri()} onClick={async () => { await setAiKey(provider, null); setStatus(await aiStatus()); }}>Xóa</button>
          </div>
          <p className="small muted" style={{ margin: 0 }}>
            Key được lưu trong thư mục cấu hình của tài khoản Windows (ai-keys.json), chỉ tiến trình ứng dụng đọc được; không lưu trong database và không xuất ra Excel.
            Có thể dùng biến môi trường ANTHROPIC_API_KEY / OPENAI_API_KEY thay thế.
          </p>
        </section>

        <section className="card col">
          <h3 style={{ margin: 0 }}>💾 Dữ liệu & sao lưu</h3>
          <div className="small muted" style={{ wordBreak: 'break-all' }}>Database: {path}</div>
          <div className="small muted">Dataset đã nạp: {versions.join(', ') || '—'}</div>
          <div className="row">
            <button className="btn" disabled={!isTauri()} onClick={async () => {
              const p = await backupDatabase('manual');
              toast(p ? `Đã sao lưu: ${p}` : 'Không có dữ liệu để sao lưu', 'success');
              setBackups(await listBackups());
            }}>Sao lưu ngay</button>
          </div>
          {backups.length > 0 && (
            <table className="table small">
              <tbody>
                {backups.map((b) => (
                  <tr key={b.path}>
                    <td>{new Date(b.modified * 1000).toLocaleString('vi-VN')}</td>
                    <td className="muted">{b.name.replace(/^vocab-\d+-/, '').replace('.db', '')}</td>
                    <td className="muted">{(b.size / 1024).toFixed(0)} KB</td>
                    <td style={{ textAlign: 'right' }}>
                      <button className="btn btn-sm" onClick={async () => {
                        if (await confirmDialog('Khôi phục bản sao lưu này? Dữ liệu hiện tại sẽ được sao lưu trước, sau đó ứng dụng khởi động lại.')) {
                          await restoreBackup(b.path);
                        }
                      }}>Khôi phục</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="small muted" style={{ margin: 0 }}>App tự sao lưu trước mỗi lần nâng cấp schema/dataset, trước khi import Excel và trước khi khôi phục. Giữ 10 bản gần nhất.</p>
        </section>
      </div>
    </>
  );
}
