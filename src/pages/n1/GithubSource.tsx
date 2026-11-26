import { useEffect, useState } from 'react';
import { useApp } from '../../app/AppContext';
import { N1_GITHUB_KEY } from '../../core/n1/autoSync';
import { getKv, setKv } from '../../core/settings/settings';
import { isTauri } from '../../platform/env';
import { n1GithubStatus, setN1GithubToken, type N1GithubConfig } from '../../platform/native';

const DEFAULTS: N1GithubConfig = { repo: 'tuan26/Clawer_nihongo', path: 'n1-learning-app/src/data/n1_data.json', branch: '' };

/** Configure download of the user's own n1_data.json from their private GitHub repo. */
export function GithubSource({ onSaved, busy, open }: { onSaved: () => void; busy: boolean; open: boolean }) {
  const { db, toast } = useApp();
  const [cfg, setCfg] = useState<N1GithubConfig>(DEFAULTS);
  const [token, setToken] = useState('');
  const [hasToken, setHasToken] = useState(false);

  useEffect(() => {
    void getKv<N1GithubConfig | null>(db, N1_GITHUB_KEY, null).then((c) => c && setCfg({ ...DEFAULTS, ...c }));
    void n1GithubStatus().then((s) => setHasToken(s.hasToken));
  }, [db]);

  if (!isTauri()) return null;
  const save = async () => {
    try {
      if (token.trim()) await setN1GithubToken(token.trim());
      if (!token.trim() && !hasToken) throw new Error('Hãy dán GitHub token');
      await setKv(db, N1_GITHUB_KEY, { repo: cfg.repo.trim(), path: cfg.path.trim(), branch: cfg.branch?.trim() ?? '' });
      setToken('');
      setHasToken(true);
      onSaved();
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  return (
    <details className="card" open={open} data-testid="n1-github">
      <summary style={{ cursor: 'pointer' }}>
        <b>☁️ Tải dữ liệu từ GitHub (repo riêng tư của bạn)</b>{' '}
        {hasToken && <span className="badge badge-good">đã lưu token</span>}
      </summary>
      <div className="col" style={{ marginTop: 10 }}>
        <div className="form-grid">
          <label className="field">
            Repo (owner/tên)
            <input className="input" value={cfg.repo} onChange={(e) => setCfg({ ...cfg, repo: e.target.value })} />
          </label>
          <label className="field">
            Branch (để trống = mặc định)
            <input className="input" value={cfg.branch ?? ''} onChange={(e) => setCfg({ ...cfg, branch: e.target.value })} />
          </label>
          <label className="field full">
            Đường dẫn file trong repo
            <input className="input" value={cfg.path} onChange={(e) => setCfg({ ...cfg, path: e.target.value })} />
          </label>
          <label className="field full">
            GitHub token {hasToken ? '(đã lưu — để trống nếu không đổi)' : ''}
            <input className="input" type="password" autoComplete="off" placeholder="github_pat_…" value={token} onChange={(e) => setToken(e.target.value)} />
          </label>
        </div>
        <div className="row">
          <button className="btn btn-primary" disabled={busy} onClick={() => void save()} data-testid="n1-github-save">
            {busy ? 'Đang tải…' : '💾 Lưu & tải về ngay'}
          </button>
          {hasToken && (
            <button
              className="btn btn-sm"
              onClick={async () => {
                await setN1GithubToken(null);
                setHasToken(false);
                toast('Đã xóa token', 'success');
              }}
            >
              Xóa token
            </button>
          )}
        </div>
        <details className="small muted">
          <summary style={{ cursor: 'pointer' }}>Cách tạo token (1 lần, khoảng 1 phút)</summary>
          <ol>
            <li>Mở github.com → ảnh đại diện → <b>Settings</b> → <b>Developer settings</b> → <b>Personal access tokens</b> → <b>Fine-grained tokens</b> → <b>Generate new token</b>.</li>
            <li>Đặt tên (vd: JBV N1), chọn thời hạn.</li>
            <li><b>Repository access</b> → <b>Only select repositories</b> → chọn <code>{cfg.repo.split('/')[1] || 'Clawer_nihongo'}</code>.</li>
            <li><b>Permissions</b> → <b>Repository permissions</b> → <b>Contents: Read-only</b> (không cần quyền nào khác).</li>
            <li><b>Generate token</b> → copy chuỗi <code>github_pat_…</code> → dán vào ô trên → Lưu & tải về ngay.</li>
          </ol>
          Token chỉ lưu trong thư mục cấu hình của tài khoản Windows của bạn (không nằm trong database, không xuất Excel), và chỉ dùng để đọc file từ repo của bạn.
          App tự kiểm tra bản mới mỗi lần khởi động; nếu file trên GitHub không đổi thì không tải lại.
        </details>
      </div>
    </details>
  );
}
