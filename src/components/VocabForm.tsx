import { useState } from 'react';
import type { VocabContent } from '../core/vocabulary/types';
import { CATEGORIES, CATEGORY_LABELS_VI, DIFFICULTIES, DIFFICULTY_LABELS_VI, JLPT_LEVELS, REGISTERS } from '../core/vocabulary/types';
import { validateContent } from '../core/vocabulary/repository';

export function VocabForm({
  initial,
  onSubmit,
  onCancel,
  submitLabel = 'Lưu',
  warning,
}: {
  initial: VocabContent;
  onSubmit: (c: VocabContent) => void | Promise<void>;
  onCancel: () => void;
  submitLabel?: string;
  warning?: string;
}) {
  const [c, setC] = useState<VocabContent>({ ...initial });
  const [tags, setTags] = useState(initial.tags.join(', '));
  const [errors, setErrors] = useState<string[]>([]);
  const set = <K extends keyof VocabContent>(k: K, v: VocabContent[K]) => setC((p) => ({ ...p, [k]: v }));
  const submit = async () => {
    const content = { ...c, tags: tags.split(',').map((t) => t.trim()).filter(Boolean) };
    const errs = validateContent(content).map((e) => e.message);
    setErrors(errs);
    if (!errs.length) await onSubmit(content);
  };
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      {warning && <div className="badge badge-warn" style={{ marginBottom: 10, display: 'block', padding: 8 }}>{warning}</div>}
      <div className="form-grid">
        <label className="field">
          Tiếng Nhật *
          <input className="input ja" value={c.japanese} onChange={(e) => set('japanese', e.target.value)} autoFocus name="japanese" />
        </label>
        <label className="field">
          Cách đọc (kana) *
          <input className="input ja" value={c.reading} onChange={(e) => set('reading', e.target.value)} name="reading" />
        </label>
        <label className="field full">
          Nghĩa tiếng Việt *
          <input className="input" value={c.vietnamese} onChange={(e) => set('vietnamese', e.target.value)} name="vietnamese" />
        </label>
        <label className="field full">
          Ví dụ (tiếng Nhật)
          <input className="input ja" value={c.example_ja ?? ''} onChange={(e) => set('example_ja', e.target.value)} name="example_ja" />
        </label>
        <label className="field full">
          Dịch ví dụ
          <input className="input" value={c.example_vi ?? ''} onChange={(e) => set('example_vi', e.target.value)} name="example_vi" />
        </label>
        <label className="field">
          Category *
          <select className="select" value={c.category} onChange={(e) => set('category', e.target.value)}>
            {[...new Set([...CATEGORIES, c.category])].map((x) => (
              <option key={x} value={x}>
                {CATEGORY_LABELS_VI[x] ?? x}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Category phụ
          <input className="input" value={c.subcategory ?? ''} onChange={(e) => set('subcategory', e.target.value)} />
        </label>
        <label className="field">
          Độ khó
          <select className="select" value={c.difficulty} onChange={(e) => set('difficulty', e.target.value)}>
            {DIFFICULTIES.map((d) => (
              <option key={d} value={d}>
                {DIFFICULTY_LABELS_VI[d]}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          JLPT / loại
          <select className="select" value={c.jlpt_level} onChange={(e) => set('jlpt_level', e.target.value)}>
            {JLPT_LEVELS.map((d) => (
              <option key={d}>{d}</option>
            ))}
          </select>
        </label>
        <label className="field">
          Từ loại
          <input className="input" value={c.part_of_speech ?? ''} onChange={(e) => set('part_of_speech', e.target.value)} />
        </label>
        <label className="field">
          Văn phong
          <select className="select" value={c.register ?? ''} onChange={(e) => set('register', e.target.value || null)}>
            <option value="">—</option>
            {REGISTERS.map((d) => (
              <option key={d}>{d}</option>
            ))}
          </select>
        </label>
        <label className="field full">
          Ghi chú cách dùng
          <textarea className="input" rows={2} value={c.usage_note ?? ''} onChange={(e) => set('usage_note', e.target.value)} />
        </label>
        <label className="field full">
          Tags (phân tách bằng dấu phẩy)
          <input className="input" value={tags} onChange={(e) => setTags(e.target.value)} />
        </label>
      </div>
      {errors.length > 0 && (
        <ul style={{ color: 'var(--again)' }}>
          {errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
      <div className="row" style={{ justifyContent: 'flex-end', marginTop: 16 }}>
        <button type="button" className="btn" onClick={onCancel}>
          Hủy
        </button>
        <button type="submit" className="btn btn-primary">
          {submitLabel}
        </button>
      </div>
    </form>
  );
}
