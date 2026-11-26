import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useApp } from '../../app/AppContext';
import { Modal } from '../../components/Modal';
import { N1_NEW_PER_DAY_KEY, n1NewPerDay } from '../../core/n1/cards';
import { parseImportText } from '../../core/n1/crawler';
import { deleteAllN1, importPack } from '../../core/n1/importer';
import { summarizePack, validatePack, type Pack, type PackSummary } from '../../core/n1/pack';
import { listN1Decks, n1Stats, type N1DeckInfo, type N1Stats } from '../../core/n1/practice';
import { setKv } from '../../core/settings/settings';
import { backupDatabase, confirmDialog, n1FileIO, openJsonText } from '../../platform/native';
import { getN1Source, importN1File, syncN1, N1_AUTO_KEY, N1_SOURCE_KEY, type N1Source } from '../../core/n1/autoSync';
import { getKv } from '../../core/settings/settings';
import { isTauri } from '../../platform/env';

export function N1Home() {
  const { db, dataVersion, dataChanged, toast } = useApp();
  const nav = useNavigate();
  const [stats, setStats] = useState<N1Stats | null>(null);
  const [decks, setDecks] = useState<N1DeckInfo[]>([]);
  const [filter, setFilter] = useState('');
  const [newPerDay, setNewPerDay] = useState(30);
  const [pending, setPending] = useState<{ file: string; pack: Pack; summary: PackSummary } | null>(null);
  const [busy, setBusy] = useState(false);
  const [source, setSource] = useState<N1Source | null>(null);
  const [searching, setSearching] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [pendingPath, setPendingPath] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setStats(await n1Stats(db));
    setDecks(await listN1Decks(db));
    setNewPerDay(await n1NewPerDay(db));
    setSource(await getN1Source(db));
  }, [db]);
  useEffect(() => void reload(), [reload, dataVersion]);

  const runSync = useCallback(
    async (search: 'always' | 'never') => {
      setSearching(true);
      setNotFound(false);
      const r = await syncN1(db, n1FileIO(), { search });
      setSearching(false);
      if (r.status === 'imported') {
        toast(`Đã nhập ${r.result.cards.inserted} thẻ, ${r.result.questions.inserted} câu từ ${r.path}`, 'success');
        dataChanged('n1-sync');
      } else if (r.status === 'not-found') setNotFound(true);
      else if (r.status === 'error') toast(`Không nhập được ${r.path ?? ''}: ${r.message}`, 'error');
      else if (r.status === 'unchanged') toast('Dữ liệu N1 đã là mới nhất', 'info');
      else if (r.status === 'skipped' && search === 'never') toast('Không thấy file nguồn ở vị trí cũ. Hãy bấm "Nhập dữ liệu N1" để chọn lại.', 'error');
      await reload();
    },
    [db, toast, dataChanged, reload],
  );

  // Nothing imported yet: look for the user's own n1_data.json automatically (desktop).
  useEffect(() => {
    if (!isTauri() || !stats || stats.decks > 0) return;
    void getKv<boolean>(db, N1_AUTO_KEY, true).then((auto) => (auto ? runSync('always') : setNotFound(false)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stats?.decks]);

  const pick = async () => {
    const f = await openJsonText();
    if (!f) return;
    setBusy(true);
    try {
      const pack = parseImportText(f.text, f.name);
      const errs = validatePack(pack);
      if (errs.length) throw new Error(errs.slice(0, 5).join('\n'));
      setPending({ file: f.name, pack, summary: summarizePack(pack) });
      setPendingPath(f.path ?? null);
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const doImport = async () => {
    if (!pending) return;
    setBusy(true);
    try {
      await backupDatabase('pre-n1-import');
      let r;
      if (pendingPath && isTauri()) {
        // remember the file so later changes are picked up automatically
        const { fileModified } = await import('../../platform/native');
        const out = await importN1File(db, n1FileIO(), pendingPath, (await fileModified(pendingPath)) ?? 0, 'forced');
        if (out.status !== 'imported') throw new Error(out.status === 'error' ? out.message : out.status);
        r = out.result;
      } else {
        r = await importPack(db, pending.pack);
      }
      toast(`Đã nhập: ${r.cards.inserted} thẻ mới, ${r.questions.inserted} câu mới (cập nhật ${r.cards.updated + r.questions.updated})`, 'success');
      setPending(null);
      dataChanged('n1-import');
      await reload();
    } catch (e) {
      toast(`Nhập thất bại, dữ liệu không thay đổi: ${(e as Error).message}`, 'error');
    } finally {
      setBusy(false);
    }
  };

  const tree = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const map = new Map<string, Map<string, N1DeckInfo[]>>();
    for (const d of decks) {
      if (q && !`${d.course} ${d.section} ${d.title}`.toLowerCase().includes(q)) continue;
      const c = map.get(d.course) ?? new Map<string, N1DeckInfo[]>();
      const list = c.get(d.section) ?? [];
      list.push(d);
      c.set(d.section, list);
      map.set(d.course, c);
    }
    return map;
  }, [decks, filter]);

  if (!stats) return <div className="empty">Đang tải…</div>;

  return (
    <>
      <div className="page-title">
        <h1>🗾 Ôn N1</h1>
        <div className="spacer" />
        <button className="btn" onClick={() => void pick()} disabled={busy} data-testid="n1-import">⬆ Nhập dữ liệu N1</button>
      </div>

      {stats.decks === 0 && searching ? (
        <div className="card col" style={{ maxWidth: 760 }} data-testid="n1-searching">
          <h3 style={{ margin: 0 }}>🔎 Đang tìm file n1_data.json trên máy của bạn…</h3>
          <p className="muted" style={{ margin: 0 }}>Tìm trong thư mục người dùng (Desktop, Documents, Downloads, thư mục dự án). Có thể mất vài giây.</p>
        </div>
      ) : stats.decks === 0 ? (
        <div className="card col" style={{ maxWidth: 760 }}>
          <h3 style={{ margin: 0 }}>{notFound ? 'Không tìm thấy file n1_data.json trên máy' : 'Chưa có dữ liệu N1'}</h3>
          {notFound && (
            <p style={{ margin: 0 }}>
              App đã tìm trong thư mục người dùng nhưng không thấy. Hãy chạy crawler của bạn để tạo file, hoặc bấm <b>Nhập dữ liệu N1</b> để chọn
              file thủ công (thường nằm ở <code>Clawer_nihongo\n1-learning-app\src\data\n1_data.json</code>).
            </p>
          )}
          {isTauri() && (
            <div>
              <button className="btn" onClick={() => void runSync('always')}>🔎 Tìm lại</button>
            </div>
          )}
          <p style={{ margin: 0 }}>
            Bấm <b>Nhập dữ liệu N1</b> và chọn file <code>n1_data.json</code> (đầu ra của crawler của bạn) hoặc một file <code>jbv-pack</code>.
            App sẽ tự lấy các bộ flashcard và đề trắc nghiệm; video/slide/bài text được bỏ qua.
          </p>
          <p className="muted small" style={{ margin: 0 }}>
            Dữ liệu chỉ lưu trong database trên máy bạn, không gửi đi đâu và không nằm trong bộ cài. Database được sao lưu trước khi nhập.
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-4">
            <div className="card stat"><span className="stat-value">{stats.cardsDue}</span><span className="stat-label">Thẻ đến hạn</span></div>
            <div className="card stat"><span className="stat-value">{stats.cardsStudied}/{stats.cards}</span><span className="stat-label">Thẻ đã học</span></div>
            <div className="card stat"><span className="stat-value">{stats.answered}/{stats.questions}</span><span className="stat-label">Câu đã làm</span></div>
            <div className="card stat"><span className="stat-value">{stats.accuracy == null ? '—' : `${stats.accuracy}%`}</span><span className="stat-label">Tỉ lệ đúng</span></div>
          </div>
          <div className="grid grid-3" style={{ marginTop: 14 }}>
            <Link to="/n1/cards/today" className="card mode-tile" style={{ textDecoration: 'none', color: 'inherit' }} data-testid="n1-today">
              <div className="mode-icon">🃏</div>
              <div><h3>Ôn flashcard hôm nay</h3><p>{stats.cardsDue} thẻ đến hạn + tối đa {newPerDay} thẻ mới/ngày (FSRS)</p></div>
            </Link>
            <Link to="/n1/quiz/wrong" className="card mode-tile" style={{ textDecoration: 'none', color: 'inherit' }} data-testid="n1-wrong">
              <div className="mode-icon">📕</div>
              <div><h3>Sổ câu sai</h3><p>{stats.wrongNow} câu đang trả lời sai — làm lại đến khi đúng</p></div>
            </Link>
            <Link to="/n1/quiz/random" className="card mode-tile" style={{ textDecoration: 'none', color: 'inherit' }}>
              <div className="mode-icon">🎲</div>
              <div><h3>Luyện ngẫu nhiên 20 câu</h3><p>Trộn câu hỏi từ tất cả các đề</p></div>
            </Link>
          </div>

          <div className="card" style={{ marginTop: 14 }}>
            <div className="row" style={{ marginBottom: 8 }}>
              <h3 style={{ margin: 0, flex: 1 }}>Bộ đề & flashcard ({decks.length})</h3>
              <input className="input" placeholder="Tìm bài, buổi, ngày…" value={filter} onChange={(e) => setFilter(e.target.value)} />
            </div>
            {[...tree.entries()].map(([course, sections]) => (
              <details key={course} className="n1-course" open={tree.size === 1 || !!filter}>
                <summary>
                  <b>{course || 'Khác'}</b>{' '}
                  <span className="muted small">{[...sections.values()].reduce((a, l) => a + l.length, 0)} bài</span>
                </summary>
                {[...sections.entries()].map(([section, list]) => (
                  <div key={section} className="n1-section">
                    <div className="muted small n1-section-title">{section}</div>
                    {list.map((d) => (
                      <div key={d.id} className="n1-deck-row">
                        <span>{d.kind === 'flashcard' ? '🃏' : '📝'}</span>
                        <span className="n1-deck-title">{d.title}</span>
                        <span className="small muted">
                          {d.kind === 'flashcard'
                            ? `${d.done}/${d.total} thẻ${d.extra ? ` · ${d.extra} đến hạn` : ''}`
                            : `${d.done}/${d.total} câu${d.done ? ` · đúng ${d.extra}` : ''}`}
                        </span>
                        <div className="progress" style={{ width: 90 }}>
                          <div style={{ width: `${(d.done / Math.max(1, d.total)) * 100}%` }} />
                        </div>
                        <button className="btn btn-sm" onClick={() => nav(d.kind === 'flashcard' ? `/n1/cards/${d.id}` : `/n1/quiz/${d.id}`)}>
                          {d.kind === 'flashcard' ? 'Học' : 'Làm đề'}
                        </button>
                      </div>
                    ))}
                  </div>
                ))}
              </details>
            ))}
          </div>

          {source && (
            <div className="card row small" style={{ marginTop: 14 }} data-testid="n1-source">
              <span>
                📄 Nguồn: <code style={{ wordBreak: 'break-all' }}>{source.path}</code> · nhập lúc {new Date(source.importedAt).toLocaleString('vi-VN')}.
                App tự nhập lại khi file này thay đổi.
              </span>
              <div style={{ flex: 1 }} />
              <button className="btn btn-sm" disabled={searching} onClick={() => void runSync('never')}>🔄 Đồng bộ ngay</button>
            </div>
          )}
          <div className="card row" style={{ marginTop: 14 }}>
            <label className="field">
              Thẻ N1 mới mỗi ngày
              <input
                className="input"
                type="number"
                min={0}
                max={300}
                value={newPerDay}
                onChange={async (e) => {
                  const v = Math.max(0, Math.min(300, Number(e.target.value)));
                  setNewPerDay(v);
                  await setKv(db, N1_NEW_PER_DAY_KEY, v);
                }}
              />
            </label>
            <div style={{ flex: 1 }} />
            <button
              className="btn btn-danger"
              onClick={async () => {
                if (!(await confirmDialog('Xóa toàn bộ dữ liệu N1 đã nhập cùng tiến độ học N1? (1.000 từ BA không bị ảnh hưởng)'))) return;
                await backupDatabase('pre-n1-delete');
                await deleteAllN1(db);
                await setKv(db, N1_SOURCE_KEY, null);
                await setKv(db, N1_AUTO_KEY, false);
                dataChanged('n1-delete');
                await reload();
              }}
            >
              Xóa dữ liệu N1
            </button>
          </div>
        </>
      )}

      {pending && (
        <Modal
          title={`Nhập: ${pending.file}`}
          onClose={() => setPending(null)}
          footer={
            <>
              <button className="btn" onClick={() => setPending(null)}>Hủy</button>
              <button className="btn btn-primary" onClick={() => void doImport()} disabled={busy} data-testid="n1-confirm-import">
                {busy ? 'Đang nhập…' : 'Nhập'}
              </button>
            </>
          }
        >
          <table className="table small" data-testid="n1-summary">
            <tbody>
              <tr><td>Khóa học</td><td>{pending.summary.courses}</td></tr>
              <tr><td>Bộ flashcard / thẻ</td><td>{pending.summary.flashcardDecks} / {pending.summary.cards}</td></tr>
              <tr><td>Đề / câu trắc nghiệm</td><td>{pending.summary.quizDecks} / {pending.summary.questions}</td></tr>
              <tr><td>Câu nghe (cần Internet để phát)</td><td>{pending.summary.withAudio}</td></tr>
              {Object.entries(pending.summary.skipped).map(([k, v]) => (
                <tr key={k} className="muted"><td>Bỏ qua: {k}</td><td>{v}</td></tr>
              ))}
            </tbody>
          </table>
          <p className="muted small">Nhập lại file mới hơn sẽ cập nhật nội dung, không tạo trùng và không làm mất tiến độ.</p>
        </Modal>
      )}
    </>
  );
}
