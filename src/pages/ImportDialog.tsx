import { useState } from 'react';
import { useApp } from '../app/AppContext';
import { Modal } from '../components/Modal';
import type { DuplicateStrategy, ImportPreview } from '../core/excel/import';
import { backupDatabase } from '../platform/native';

export function ImportDialog({ name, preview, onClose, onDone }: { name: string; preview: ImportPreview; onClose: () => void; onDone: () => void }) {
  const { db, toast } = useApp();
  const [strategy, setStrategy] = useState<DuplicateStrategy>('skip');
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<'all' | 'new' | 'duplicate' | 'error'>('all');
  const rows = preview.rows.filter((r) =>
    tab === 'all' ? true : tab === 'error' ? r.errors.length > 0 : tab === 'duplicate' ? !r.errors.length && r.duplicateOf : !r.errors.length && !r.duplicateOf,
  );
  const apply = async () => {
    setBusy(true);
    try {
      await backupDatabase('pre-import');
      const { applyImport } = await import('../core/excel/import');
      const r = await applyImport(db, preview, strategy);
      toast(`Import xong: ${r.inserted} mới, ${r.updated} cập nhật, ${r.skipped} bỏ qua, ${r.failed} lỗi`, 'success');
      onDone();
    } catch (e) {
      toast(`Import thất bại, dữ liệu không thay đổi: ${(e as Error).message}`, 'error');
    } finally {
      setBusy(false);
    }
  };
  const c = preview.counts;
  return (
    <Modal
      title={`Xem trước import: ${name}`}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>Hủy</button>
          <button className="btn btn-primary" disabled={busy || preview.fileErrors.length > 0 || c.new + (strategy === 'update' ? c.duplicate : 0) === 0} onClick={() => void apply()} data-testid="apply-import">
            Import {c.new + (strategy === 'update' ? c.duplicate : 0)} dòng
          </button>
        </>
      }
    >
      {preview.fileErrors.length > 0 ? (
        <div style={{ color: 'var(--again)' }}>{preview.fileErrors.join('; ')}</div>
      ) : (
        <>
          <div className="row" data-testid="import-counts">
            <button className={`btn btn-sm${tab === 'all' ? ' btn-primary' : ''}`} onClick={() => setTab('all')}>Tất cả {c.total}</button>
            <button className={`btn btn-sm${tab === 'new' ? ' btn-primary' : ''}`} onClick={() => setTab('new')}>Mới {c.new}</button>
            <button className={`btn btn-sm${tab === 'duplicate' ? ' btn-primary' : ''}`} onClick={() => setTab('duplicate')}>Trùng {c.duplicate}</button>
            <button className={`btn btn-sm${tab === 'error' ? ' btn-primary' : ''}`} onClick={() => setTab('error')}>Lỗi {c.error}</button>
            <div style={{ flex: 1 }} />
            <label className="toggle">
              Khi trùng:
              <select className="select" value={strategy} onChange={(e) => setStrategy(e.target.value as DuplicateStrategy)}>
                <option value="skip">Bỏ qua (giữ dữ liệu hiện có)</option>
                <option value="update">Cập nhật nội dung (giữ tiến độ học)</option>
              </select>
            </label>
          </div>
          <div style={{ maxHeight: 380, overflow: 'auto', marginTop: 10 }}>
            <table className="table">
              <thead>
                <tr><th>Dòng</th><th>Từ</th><th>Nghĩa</th><th>Kết quả</th></tr>
              </thead>
              <tbody>
                {rows.slice(0, 500).map((r) => (
                  <tr key={r.rowNumber}>
                    <td>{r.rowNumber}</td>
                    <td className="ja">{r.content.japanese}<div className="small muted">{r.content.reading}</div></td>
                    <td className="small">{r.content.vietnamese}</td>
                    <td className="small">
                      {r.errors.length ? (
                        <span style={{ color: 'var(--again)' }}>{r.errors.join('; ')}</span>
                      ) : r.duplicateOf ? (
                        <span className="badge badge-warn">Trùng “{r.duplicateOf.japanese}”</span>
                      ) : (
                        <span className="badge badge-good">Mới</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="muted small">Import không bao giờ xóa dữ liệu hiện có. Database được sao lưu tự động trước khi import.</p>
        </>
      )}
    </Modal>
  );
}
