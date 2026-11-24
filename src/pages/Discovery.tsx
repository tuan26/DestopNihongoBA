import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../app/AppContext';
import { Modal } from '../components/Modal';
import { VocabForm } from '../components/VocabForm';
import {
  DISCOVERY_TOPICS, approveSuggestion, listSuggestions, rejectSuggestion, runDiscovery, updateSuggestionContent, type Suggestion,
} from '../core/ai/discovery';
import { CATEGORY_LABELS_VI } from '../core/vocabulary/types';
import { aiGenerate, aiStatus, type AiStatus } from '../platform/native';
import { isTauri } from '../platform/env';

export function Discovery() {
  const { db, settings, updateSettings, dataChanged, toast, dataVersion } = useApp();
  const [status, setStatus] = useState<AiStatus | null>(null);
  const [topic, setTopic] = useState('BA');
  const [custom, setCustom] = useState('');
  const [count, setCount] = useState(10);
  const [running, setRunning] = useState(false);
  const [items, setItems] = useState<Suggestion[]>([]);
  const [view, setView] = useState<'pending' | 'all'>('pending');
  const [editing, setEditing] = useState<Suggestion | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const reload = useCallback(async () => {
    const list = await listSuggestions(db, view);
    setItems(list);
    setSelected(new Set(list.filter((s) => s.status === 'pending' && !s.duplicate_of && !s.errors.length).map((s) => s.id)));
  }, [db, view]);
  useEffect(() => {
    void aiStatus().then(setStatus);
  }, []);
  useEffect(() => {
    void reload();
  }, [reload, dataVersion]);

  const provider = settings['ai.provider'];
  const hasKey = !!status?.[provider];

  const generate = async () => {
    setRunning(true);
    try {
      const r = await runDiscovery(db, { topicId: topic, customTopic: custom.trim() || undefined, count, provider, model: settings['ai.model'] }, (req) =>
        aiGenerate({ ...req, provider, model: settings['ai.model'] }),
      );
      toast(`AI đề xuất ${r.stored} từ (${r.duplicates} trùng với thư viện). Hãy duyệt bên dưới.`, 'success');
      dataChanged('ai-suggestions');
      setView('pending');
      await reload();
    } catch (e) {
      toast(`AI Discovery lỗi: ${(e as Error).message ?? e}`, 'error');
    } finally {
      setRunning(false);
    }
  };

  const approveMany = async (ids: number[]) => {
    let ok = 0;
    const errs: string[] = [];
    for (const id of ids) {
      try {
        await approveSuggestion(db, id);
        ok++;
      } catch (e) {
        errs.push((e as Error).message);
      }
    }
    toast(`Đã thêm ${ok} từ vào thư viện${errs.length ? `; ${errs.length} lỗi: ${errs[0]}` : ''}`, errs.length ? 'error' : 'success');
    dataChanged('ai-approve');
    await reload();
  };

  const rejectMany = async (ids: number[]) => {
    for (const id of ids) await rejectSuggestion(db, id);
    dataChanged('ai-reject');
    await reload();
  };

  return (
    <>
      <div className="page-title">
        <h1>✨ AI Vocabulary Discovery</h1>
      </div>
      {!isTauri() && <div className="card" style={{ marginBottom: 14 }}>AI Discovery chỉ hoạt động trong ứng dụng desktop.</div>}
      {isTauri() && status && !hasKey && (
        <div className="card" style={{ marginBottom: 14, background: 'var(--warn-bg)' }}>
          Chưa có API key cho <b>{provider}</b>. Vào <Link to="/settings">Cài đặt › AI</Link> để nhập key, hoặc đặt biến môi trường{' '}
          <code>{provider === 'anthropic' ? 'ANTHROPIC_API_KEY' : 'OPENAI_API_KEY'}</code> rồi khởi động lại app. Các chức năng học khác vẫn hoạt động offline.
        </div>
      )}
      <div className="card col" style={{ marginBottom: 14 }}>
        <div className="row">
          <label className="field">
            Chủ đề
            <select className="select" value={topic} onChange={(e) => setTopic(e.target.value)}>
              {DISCOVERY_TOPICS.map((t) => (
                <option key={t.id} value={t.id}>{t.label}</option>
              ))}
            </select>
          </label>
          <label className="field" style={{ flex: 1 }}>
            Chủ đề cụ thể (tùy chọn)
            <input className="input" value={custom} placeholder="VD: thương lượng phạm vi change request, thiết kế batch xử lý đêm…" onChange={(e) => setCustom(e.target.value)} />
          </label>
          <label className="field">
            Số lượng
            <select className="select" value={count} onChange={(e) => setCount(Number(e.target.value))}>
              {[10, 20, 50].map((n) => <option key={n}>{n}</option>)}
            </select>
          </label>
          <button className="btn btn-primary" style={{ alignSelf: 'flex-end' }} disabled={!hasKey || running} onClick={() => void generate()}>
            {running ? 'Đang tạo…' : 'Tạo đề xuất'}
          </button>
        </div>
        <div className="row small muted">
          Provider: {provider} · Model: {settings['ai.model']} · Đề xuất định kỳ:
          <select className="select" value={settings['ai.schedule']} onChange={(e) => void updateSettings({ 'ai.schedule': e.target.value as 'manual' | 'daily' | 'weekly' })}>
            <option value="manual">Thủ công</option>
            <option value="daily">Hằng ngày</option>
            <option value="weekly">Hằng tuần</option>
          </select>
          chủ đề
          <select className="select" value={settings['ai.scheduleTopic']} onChange={(e) => void updateSettings({ 'ai.scheduleTopic': e.target.value })}>
            {DISCOVERY_TOPICS.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
          {settings['ai.lastRunAt'] && <>· lần chạy gần nhất {new Date(settings['ai.lastRunAt']).toLocaleString('vi-VN')}</>}
        </div>
        <div className="small muted">Từ do AI tạo chỉ được thêm vào thư viện khi bạn duyệt. Đề xuất định kỳ chỉ tạo danh sách chờ duyệt.</div>
      </div>

      <div className="row" style={{ marginBottom: 10 }}>
        <button className={`btn btn-sm${view === 'pending' ? ' btn-primary' : ''}`} onClick={() => setView('pending')}>Chờ duyệt</button>
        <button className={`btn btn-sm${view === 'all' ? ' btn-primary' : ''}`} onClick={() => setView('all')}>Lịch sử</button>
        <div style={{ flex: 1 }} />
        {view === 'pending' && items.length > 0 && (
          <>
            <button className="btn btn-sm" onClick={() => void rejectMany([...selected])} disabled={!selected.size}>Từ chối {selected.size} mục</button>
            <button className="btn btn-sm btn-primary" onClick={() => void approveMany([...selected])} disabled={!selected.size}>Duyệt {selected.size} mục</button>
          </>
        )}
      </div>
      <div className="card" style={{ padding: 0 }}>
        {items.length === 0 ? (
          <div className="empty">Chưa có đề xuất nào.</div>
        ) : (
          <table className="table">
            <thead>
              <tr><th></th><th>Từ</th><th>Nghĩa & ví dụ</th><th>Thông tin</th><th></th></tr>
            </thead>
            <tbody>
              {items.map((s) => (
                <tr key={s.id}>
                  <td>
                    {s.status === 'pending' && (
                      <input type="checkbox" checked={selected.has(s.id)} onChange={(e) => {
                        const n = new Set(selected);
                        if (e.target.checked) n.add(s.id); else n.delete(s.id);
                        setSelected(n);
                      }} />
                    )}
                  </td>
                  <td>
                    <div className="ja-word">{s.content.japanese}</div>
                    <div className="ja small muted">{s.content.reading}</div>
                  </td>
                  <td className="small" style={{ maxWidth: 420 }}>
                    <b>{s.content.vietnamese}</b>
                    <div className="ja">{s.content.example_ja}</div>
                    <div className="muted">{s.content.example_vi}</div>
                  </td>
                  <td className="small">
                    {CATEGORY_LABELS_VI[s.content.category] ?? s.content.category}
                    <div className="muted">{s.content.difficulty} · {s.topic} · {s.trigger}</div>
                    {s.duplicate_of && <span className="badge badge-warn">Trùng thư viện</span>}
                    {s.errors.length > 0 && <span className="badge badge-danger" title={s.errors.join('; ')}>Thiếu dữ liệu</span>}
                    {s.status !== 'pending' && <span className={`badge ${s.status === 'approved' ? 'badge-good' : ''}`}>{s.status === 'approved' ? 'Đã duyệt' : 'Đã từ chối'}</span>}
                  </td>
                  <td>
                    {s.status === 'pending' && (
                      <div className="row" style={{ flexWrap: 'nowrap' }}>
                        <button className="btn btn-sm" onClick={() => setEditing(s)}>Sửa</button>
                        <button className="btn btn-sm" onClick={() => void rejectMany([s.id])}>✕</button>
                        <button className="btn btn-sm btn-primary" disabled={!!s.duplicate_of} onClick={() => void approveMany([s.id])}>✓</button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {editing && (
        <Modal title="Sửa đề xuất" onClose={() => setEditing(null)}>
          <VocabForm
            initial={editing.content}
            onCancel={() => setEditing(null)}
            onSubmit={async (c) => {
              await updateSuggestionContent(db, editing.id, c);
              setEditing(null);
              await reload();
            }}
          />
        </Modal>
      )}
    </>
  );
}
