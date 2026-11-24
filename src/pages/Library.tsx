import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useApp } from '../app/AppContext';
import { Modal } from '../components/Modal';
import { VocabForm } from '../components/VocabForm';
import {
  contentOf, createVocabulary, deleteVocabulary, emptyContent, findDuplicates, getVocabulary, listVocabulary,
  setFavorite, setHidden, setNote, updateVocabulary, type VocabFilter,
} from '../core/vocabulary/repository';
import {
  addToCollection, collectionsOf, createCollection, deleteCollection, listCollections, removeFromCollection, type Collection,
} from '../core/vocabulary/collections';
import { resetProgress } from '../core/srs/reviewService';
import {
  CATEGORIES, CATEGORY_LABELS_VI, DIFFICULTIES, DIFFICULTY_LABELS_VI, JLPT_LEVELS, SOURCE_LABELS_VI, STATE_LABELS_VI,
  type VocabContent, type VocabSource, type VocabWithReview,
} from '../core/vocabulary/types';
import { confirmDialog, openXlsx, saveBytes } from '../platform/native';
import { speakJapanese } from '../platform/tts';
import { ImportDialog } from './ImportDialog';
import type { ImportPreview } from '../core/excel/import';

const PAGE = 50;

export function Library() {
  const { db, dataVersion, dataChanged, toast } = useApp();
  const { id: routeId } = useParams();
  const nav = useNavigate();
  const [filter, setFilter] = useState<VocabFilter>({});
  const [text, setText] = useState('');
  const [rows, setRows] = useState<VocabWithReview[]>([]);
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<VocabWithReview | null>(null);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [modal, setModal] = useState<null | 'add' | 'edit' | 'collections'>(null);
  const [importPreview, setImportPreview] = useState<{ name: string; preview: ImportPreview } | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    const t0 = performance.now();
    const list = await listVocabulary(db, { ...filter, text });
    setRows(list);
    setCollections(await listCollections(db));
    if (performance.now() - t0 > 300) console.warn('search slow', performance.now() - t0);
  }, [db, filter, text]);

  useEffect(() => {
    const t = setTimeout(() => void reload(), 120);
    return () => clearTimeout(t);
  }, [reload, dataVersion]);
  useEffect(() => setPage(0), [filter, text]);

  useEffect(() => {
    if (routeId) void getVocabulary(db, Number(routeId)).then(setSelected);
  }, [routeId, db, dataVersion]);
  useEffect(() => {
    if (selected) {
      const fresh = rows.find((r) => r.id === selected.id);
      if (fresh && fresh !== selected) setSelected(fresh);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);

  const pageRows = useMemo(() => rows.slice(page * PAGE, page * PAGE + PAGE), [rows, page]);
  const pages = Math.max(1, Math.ceil(rows.length / PAGE));

  const changed = (reason: string) => {
    dataChanged(reason);
    void reload();
  };

  const addWord = async (c: VocabContent) => {
    const dups = await findDuplicates(db, c.japanese);
    if (dups.length && !(await confirmDialog(`"${c.japanese}" đã có trong thư viện (${dups.length} mục). Vẫn thêm?`))) return;
    const id = await createVocabulary(db, c, { source: 'user' });
    setModal(null);
    toast('Đã thêm từ mới', 'success');
    changed('add');
    nav(`/library/${id}`);
  };

  const editWord = async (c: VocabContent) => {
    if (!selected) return;
    const dups = await findDuplicates(db, c.japanese, selected.id);
    if (dups.length && !(await confirmDialog(`"${c.japanese}" trùng với từ khác trong thư viện. Vẫn lưu?`))) return;
    await updateVocabulary(db, selected.id, c);
    setModal(null);
    toast('Đã lưu thay đổi', 'success');
    changed('edit');
  };

  const exportExcel = async () => {
    setBusy(true);
    try {
      const { exportVocabularyXlsx } = await import('../core/excel/export');
      const bytes = await exportVocabularyXlsx(db, { includeHidden: true });
      const p = await saveBytes(`japanese-ba-vocabulary-${new Date().toISOString().slice(0, 10)}.xlsx`, bytes);
      if (p) toast(`Đã xuất ${rows.length ? '' : ''}file: ${p}`, 'success');
    } catch (e) {
      toast(`Xuất Excel lỗi: ${(e as Error).message}`, 'error');
    } finally {
      setBusy(false);
    }
  };

  const downloadTemplate = async () => {
    const { templateXlsx } = await import('../core/excel/export');
    const p = await saveBytes('japanese-ba-vocabulary-template.xlsx', await templateXlsx());
    if (p) toast(`Đã lưu template: ${p}`, 'success');
  };

  const startImport = async () => {
    const f = await openXlsx();
    if (!f) return;
    setBusy(true);
    try {
      const { previewImport } = await import('../core/excel/import');
      setImportPreview({ name: f.name, preview: await previewImport(db, f.bytes) });
    } catch (e) {
      toast(`Không đọc được file: ${(e as Error).message}`, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="page-title">
        <h1>Thư viện từ vựng</h1>
        <span className="badge" data-testid="result-count">{rows.length.toLocaleString('vi-VN')} từ</span>
        <div className="spacer" />
        <button className="btn" onClick={() => setModal('collections')}>📁 Collections</button>
        <button className="btn" onClick={() => void downloadTemplate()}>Template Excel</button>
        <button className="btn" onClick={() => void startImport()} disabled={busy} data-testid="import-btn">⬆ Import Excel</button>
        <button className="btn" onClick={() => void exportExcel()} disabled={busy} data-testid="export-btn">⬇ Export Excel</button>
        <button className="btn btn-primary" onClick={() => setModal('add')} data-testid="add-word">+ Thêm từ</button>
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="row">
          <input
            className="input"
            style={{ flex: '1 1 260px' }}
            placeholder="Tìm theo tiếng Nhật, cách đọc (kana) hoặc tiếng Việt…"
            value={text}
            onChange={(e) => setText(e.target.value)}
            data-testid="search"
          />
          <select className="select" value={filter.category ?? ''} onChange={(e) => setFilter({ ...filter, category: e.target.value || undefined })}>
            <option value="">Tất cả category</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>{CATEGORY_LABELS_VI[c]}</option>
            ))}
          </select>
          <select className="select" value={filter.difficulty ?? ''} onChange={(e) => setFilter({ ...filter, difficulty: e.target.value || undefined })}>
            <option value="">Mọi độ khó</option>
            {DIFFICULTIES.map((d) => (
              <option key={d} value={d}>{DIFFICULTY_LABELS_VI[d]}</option>
            ))}
          </select>
          <select className="select" value={filter.jlpt ?? ''} onChange={(e) => setFilter({ ...filter, jlpt: e.target.value || undefined })}>
            <option value="">JLPT / loại</option>
            {JLPT_LEVELS.map((d) => (
              <option key={d}>{d}</option>
            ))}
          </select>
          <select className="select" value={filter.source ?? ''} onChange={(e) => setFilter({ ...filter, source: (e.target.value || undefined) as VocabSource })}>
            <option value="">Mọi nguồn</option>
            {(Object.keys(SOURCE_LABELS_VI) as VocabSource[]).map((s) => (
              <option key={s} value={s}>{SOURCE_LABELS_VI[s]}</option>
            ))}
          </select>
          <select
            className="select"
            value={filter.collectionId ?? ''}
            onChange={(e) => setFilter({ ...filter, collectionId: e.target.value ? Number(e.target.value) : undefined })}
          >
            <option value="">Collection</option>
            {collections.map((c) => (
              <option key={c.id} value={c.id}>{c.name} ({c.count})</option>
            ))}
          </select>
          <label className="toggle"><input type="checkbox" checked={!!filter.favorite} onChange={(e) => setFilter({ ...filter, favorite: e.target.checked || undefined })} />⭐ Yêu thích</label>
          <label className="toggle"><input type="checkbox" checked={!!filter.weak} onChange={(e) => setFilter({ ...filter, weak: e.target.checked || undefined })} />🎯 Hay quên</label>
          <label className="toggle"><input type="checkbox" checked={filter.hidden === 'only'} onChange={(e) => setFilter({ ...filter, hidden: e.target.checked ? 'only' : undefined })} />Đã ẩn</label>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: selected ? 'minmax(0, 1fr) 380px' : '1fr', gap: 14 }}>
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          {rows.length === 0 ? (
            <div className="empty">Không có từ nào phù hợp.</div>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Từ</th>
                  <th>Nghĩa</th>
                  <th>Category</th>
                  <th>Trạng thái</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((v) => (
                  <tr key={v.id} className={`clickable${selected?.id === v.id ? ' selected' : ''}`} onClick={() => nav(`/library/${v.id}`)}>
                    <td>
                      <div className="ja-word">{v.is_favorite ? '⭐ ' : ''}{v.japanese}</div>
                      <div className="ja small muted">{v.reading}</div>
                    </td>
                    <td style={{ maxWidth: 380 }}>{v.vietnamese}</td>
                    <td className="small">
                      {CATEGORY_LABELS_VI[v.category] ?? v.category}
                      <div className="muted">{DIFFICULTY_LABELS_VI[v.difficulty]} · {v.jlpt_level}</div>
                    </td>
                    <td className="small">
                      {v.review ? STATE_LABELS_VI[v.review.state] : '—'}
                      {v.review && v.review.lapses >= 2 && <div><span className="badge badge-danger">quên {v.review.lapses} lần</span></div>}
                      {v.source !== 'seed' && <div><span className="badge">{SOURCE_LABELS_VI[v.source]}</span></div>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {pages > 1 && (
            <div className="row" style={{ justifyContent: 'center', padding: 10 }}>
              <button className="btn btn-sm" disabled={page === 0} onClick={() => setPage(page - 1)}>‹</button>
              <span className="small muted">Trang {page + 1}/{pages}</span>
              <button className="btn btn-sm" disabled={page >= pages - 1} onClick={() => setPage(page + 1)}>›</button>
            </div>
          )}
        </div>

        {selected && (
          <Detail
            key={selected.id}
            word={selected}
            collections={collections}
            onClose={() => {
              setSelected(null);
              nav('/library');
            }}
            onEdit={() => setModal('edit')}
            onChanged={changed}
          />
        )}
      </div>

      {modal === 'add' && (
        <Modal title="Thêm từ mới" onClose={() => setModal(null)}>
          <VocabForm initial={emptyContent()} onSubmit={addWord} onCancel={() => setModal(null)} submitLabel="Thêm" />
        </Modal>
      )}
      {modal === 'edit' && selected && (
        <Modal title={`Sửa: ${selected.japanese}`} onClose={() => setModal(null)}>
          <VocabForm
            initial={contentOf(selected)}
            onSubmit={editWord}
            onCancel={() => setModal(null)}
            warning={
              selected.source === 'seed'
                ? 'Đây là từ thuộc dữ liệu gốc. Sau khi sửa, các bản cập nhật dataset sẽ không ghi đè nội dung bạn đã sửa.'
                : undefined
            }
          />
        </Modal>
      )}
      {modal === 'collections' && (
        <CollectionsModal collections={collections} onClose={() => setModal(null)} onChanged={() => changed('collections')} />
      )}
      {importPreview && (
        <ImportDialog
          name={importPreview.name}
          preview={importPreview.preview}
          onClose={() => setImportPreview(null)}
          onDone={() => {
            setImportPreview(null);
            changed('import');
          }}
        />
      )}
    </>
  );
}

function Detail({
  word,
  collections,
  onClose,
  onEdit,
  onChanged,
}: {
  word: VocabWithReview;
  collections: Collection[];
  onClose: () => void;
  onEdit: () => void;
  onChanged: (r: string) => void;
}) {
  const { db, toast } = useApp();
  const [note, setNoteText] = useState(word.note ?? '');
  const [inCols, setInCols] = useState<number[]>([]);
  useEffect(() => {
    void collectionsOf(db, word.id).then(setInCols);
  }, [db, word.id]);

  const toggleCol = async (cid: number) => {
    if (inCols.includes(cid)) await removeFromCollection(db, cid, word.id);
    else await addToCollection(db, cid, word.id);
    setInCols(await collectionsOf(db, word.id));
    onChanged('collection');
  };

  const hide = async () => {
    if (word.is_hidden) {
      await setHidden(db, word.id, false);
      toast('Đã bỏ ẩn', 'success');
    } else {
      if (!(await confirmDialog(`Ẩn "${word.japanese}"? Từ sẽ không xuất hiện trong phiên học và card. Bạn có thể bỏ ẩn sau (lọc “Đã ẩn”).`))) return;
      await setHidden(db, word.id, true);
      toast('Đã ẩn từ', 'success');
    }
    onChanged('hide');
  };

  const remove = async () => {
    if (!(await confirmDialog(`Xóa vĩnh viễn "${word.japanese}" và lịch sử học của từ này? Không thể hoàn tác.`))) return;
    await deleteVocabulary(db, word.id);
    toast('Đã xóa', 'success');
    onChanged('delete');
    onClose();
  };

  const reset = async () => {
    if (!(await confirmDialog(`Đặt lại tiến độ học của "${word.japanese}" về “Mới”?`))) return;
    await resetProgress(db, word.id);
    onChanged('reset');
  };

  const r = word.review;
  return (
    <div className="card detail-panel col" data-testid="detail">
      <div className="row">
        <div style={{ flex: 1 }}>
          <div className="ja-word" style={{ fontSize: '1.7em' }}>{word.japanese}</div>
          <div className="ja muted">
            {word.reading}{' '}
            <button className="btn btn-ghost btn-sm" onClick={() => { const res = speakJapanese(word.reading); if (!res.ok && res.message) toast(res.message, 'error'); }}>🔊</button>
          </div>
        </div>
        <button className="btn btn-ghost" onClick={onClose}>✕</button>
      </div>
      <div style={{ fontWeight: 600 }}>{word.vietnamese}</div>
      {word.example_ja && (
        <div>
          <div className="ja">例：{word.example_ja}</div>
          <div className="muted small">{word.example_vi}</div>
        </div>
      )}
      {word.usage_note && <div className="small">💡 {word.usage_note}</div>}
      <div className="row small">
        <span className="badge">{CATEGORY_LABELS_VI[word.category] ?? word.category}</span>
        {word.subcategory && <span className="badge">{word.subcategory}</span>}
        <span className="badge badge-primary">{DIFFICULTY_LABELS_VI[word.difficulty]}</span>
        <span className="badge">{word.jlpt_level}</span>
        {word.part_of_speech && <span className="badge">{word.part_of_speech}</span>}
        {word.register && <span className="badge">{word.register}</span>}
        {word.tags.map((t) => <span key={t} className="badge">#{t}</span>)}
      </div>
      <div className="small muted">
        Nguồn: {SOURCE_LABELS_VI[word.source]}
        {word.source_type ? ` · ${word.source_type}` : ''}
        {word.source_reference ? ` · ${word.source_reference}` : ''}
        {word.user_modified ? ' · đã chỉnh sửa' : ''}
      </div>
      {r && (
        <div className="small">
          <b>Học tập:</b> {STATE_LABELS_VI[r.state]} · ôn {r.reps} lần · quên {r.lapses} lần
          {r.state !== 0 && <> · ôn tiếp: {new Date(r.due).toLocaleString('vi-VN')}</>}
        </div>
      )}
      <label className="field">
        Ghi chú cá nhân
        <textarea className="input" rows={2} value={note} onChange={(e) => setNoteText(e.target.value)} onBlur={async () => {
          if ((word.note ?? '') !== note) {
            await setNote(db, word.id, note);
            onChanged('note');
          }
        }} />
      </label>
      {collections.length > 0 && (
        <div className="row small">
          {collections.map((c) => (
            <label key={c.id} className="toggle">
              <input type="checkbox" checked={inCols.includes(c.id)} onChange={() => void toggleCol(c.id)} />
              {c.name}
            </label>
          ))}
        </div>
      )}
      <div className="row">
        <button className="btn btn-sm" onClick={async () => { await setFavorite(db, word.id, !word.is_favorite); onChanged('favorite'); }}>
          {word.is_favorite ? '⭐ Bỏ yêu thích' : '☆ Yêu thích'}
        </button>
        <button className="btn btn-sm" onClick={onEdit} data-testid="edit-word">✏️ Sửa</button>
        <button className="btn btn-sm" onClick={() => void reset()}>↺ Học lại từ đầu</button>
        <button className="btn btn-sm" onClick={() => void hide()}>{word.is_hidden ? '👁 Bỏ ẩn' : '🙈 Ẩn'}</button>
        {word.source !== 'seed' && (
          <button className="btn btn-sm btn-danger" onClick={() => void remove()}>🗑 Xóa</button>
        )}
      </div>
    </div>
  );
}

function CollectionsModal({ collections, onClose, onChanged }: { collections: Collection[]; onClose: () => void; onChanged: () => void }) {
  const { db, toast } = useApp();
  const [name, setName] = useState('');
  return (
    <Modal title="Collections" onClose={onClose}>
      <p className="muted small">Nhóm từ theo nhu cầu riêng (ví dụ “Họp sprint review”, “Dự án ngân hàng”). Thêm từ vào collection trong bảng chi tiết của từ.</p>
      <form
        className="row"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            await createCollection(db, name);
            setName('');
            onChanged();
          } catch (err) {
            toast((err as Error).message, 'error');
          }
        }}
      >
        <input className="input" style={{ flex: 1 }} placeholder="Tên collection mới" value={name} onChange={(e) => setName(e.target.value)} />
        <button className="btn btn-primary" type="submit">Tạo</button>
      </form>
      <table className="table" style={{ marginTop: 12 }}>
        <tbody>
          {collections.map((c) => (
            <tr key={c.id}>
              <td>{c.name}</td>
              <td className="muted">{c.count} từ</td>
              <td style={{ textAlign: 'right' }}>
                <button
                  className="btn btn-sm btn-danger"
                  onClick={async () => {
                    if (await confirmDialog(`Xóa collection "${c.name}"? (Các từ vẫn được giữ trong thư viện)`)) {
                      await deleteCollection(db, c.id);
                      onChanged();
                    }
                  }}
                >
                  Xóa
                </button>
              </td>
            </tr>
          ))}
          {collections.length === 0 && (
            <tr>
              <td className="muted">Chưa có collection nào.</td>
            </tr>
          )}
        </tbody>
      </table>
    </Modal>
  );
}
