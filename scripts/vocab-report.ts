/**
 * Generate docs/vocabulary-seed-report.md from the actual dataset, validator and verification results.
 * Usage: npm run vocab:report
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { SeedFile } from '../src/core/vocabulary/types';
import { CATEGORY_TARGETS, ROOT, VOCAB_DIR, readBatches } from './vocab-lib';
import { validateDataset } from './validate-vocabulary';

const seed: SeedFile = JSON.parse(readFileSync(join(VOCAB_DIR, 'seed-v1.json'), 'utf8'));
const report = validateDataset(seed);
const verification = existsSync(join(VOCAB_DIR, 'verification.json'))
  ? JSON.parse(readFileSync(join(VOCAB_DIR, 'verification.json'), 'utf8'))
  : null;
const corrections: { id: string; field: string; before: string; after: string; detectedBy: string }[] = JSON.parse(
  readFileSync(join(VOCAB_DIR, 'corrections.json'), 'utf8'),
);
const { files } = readBatches();
const e = seed.entries;
const by = (f: (x: (typeof e)[number]) => string) =>
  e.reduce<Record<string, number>>((a, x) => ((a[f(x)] = (a[f(x)] ?? 0) + 1), a), {});
const table = (rec: Record<string, number>, head: string) =>
  [`| ${head} | Số lượng |`, '|---|---:|', ...Object.entries(rec).sort((a, b) => b[1] - a[1]).map(([k, v]) => `| ${k} | ${v} |`)].join('\n');

const vc: Record<string, number> = verification?.counts ?? {};
const notFound = verification
  ? Object.entries(verification.results as Record<string, { match: string }>).filter(([, v]) => v.match === 'not-found').map(([k]) => k)
  : [];
const catRows = Object.entries(CATEGORY_TARGETS)
  .map(([c, t]) => {
    const n = e.filter((x) => x.category === c).length;
    const r = e.filter((x) => x.category === c && x.source_type === 'researched').length;
    return `| ${c} | ${t.target} | ${n} | ${n === t.target ? '✔' : '✖'} | ${r} |`;
  })
  .join('\n');
const samples = Object.keys(CATEGORY_TARGETS)
  .map((c) => {
    const x = e.find((y) => y.category === c && y.difficulty !== 'intermediate') ?? e.find((y) => y.category === c)!;
    return `| ${c} | ${x.japanese} | ${x.reading} | ${x.vietnamese} | ${x.example_ja} |`;
  })
  .join('\n');

const md = `# Báo cáo dataset từ vựng seed v${seed.dataset_version}

> File này được sinh tự động bởi \`scripts/vocab-report.ts\` từ \`data/vocabulary/seed-v1.json\`,
> kết quả validator (\`scripts/validate-vocabulary.ts\`) và kết quả đối chiếu JMdict (\`scripts/verify-jmdict.py\`).
> Ngày tạo dataset: ${seed.created_at}.

## 1. Tóm tắt

| Chỉ số | Giá trị |
|---|---:|
| Tổng số entry | **${e.length}** |
| Entry unique (sau chuẩn hóa NFKC, bỏ khoảng trắng) | ${new Set(e.map((x) => x.japanese.normalize('NFKC').replace(/\s/g, ''))).size} |
| Lỗi validator | **${report.errors.length}** |
| Cảnh báo validator | ${report.warnings.length} |
| Số batch biên soạn | ${files.length} (≈ 40–60 từ/batch) |
| Entry khớp JMdict (headword + cách đọc) → \`researched\` | ${vc['headword+reading'] ?? 0} |
| Entry là cụm ghép, cách đọc khớp các thành phần trong JMdict | ${vc['components'] ?? 0} |
| Entry không đối chiếu được tự động | ${vc['not-found'] ?? 0} |
| Entry \`source_type = AI-generated\` | ${report.bySourceType['AI-generated'] ?? 0} |
| Entry \`source_type = researched\` | ${report.bySourceType['researched'] ?? 0} |
| Duplicate bị validator phát hiện và loại | 0 (xem mục 4) |
| Entry đã được sửa sau khi viết | ${corrections.length} (xem mục 5) |

## 2. Phân bổ theo category

| Category | Mục tiêu | Thực tế | Đạt | Trong đó \`researched\` |
|---|---:|---:|:---:|---:|
${catRows}

## 3. Phân bổ theo độ khó / JLPT / văn phong

${table(report.byDifficulty, 'Difficulty')}

${table(report.byJlpt, 'jlpt_level')}

${table(by((x) => x.register ?? 'null'), 'Register')}

## 4. Quy trình tạo & kiểm tra

1. Lập danh sách từ mục tiêu cho từng category (spec §9), loại trước các ứng viên trùng/gần trùng giữa các category
   (ví dụ: 稼働率 chỉ giữ ở PM, 冗長 (SWE) vs 冗長化 (Architecture), 切り分け (QA) vs 一次切り分け (Cloud)).
   Việc loại ở bước lập danh sách được làm thủ công, không có log tự động nên không có con số chính xác.
2. Biên soạn theo batch ${files.length} file trong \`data/vocabulary/batches/\` (mỗi dòng: từ | cách đọc | nghĩa | ví dụ JA | ví dụ VI | …).
3. Sau mỗi batch: \`npm run vocab:generate\` → \`npm run validate:vocab\`. Validator kiểm tra: tổng 1.000, unique sau chuẩn hóa,
   trùng (reading + nghĩa), trường bắt buộc, ví dụ rỗng/trùng/mẫu câu lặp ("skeleton" giống nhau sau khi bỏ từ mục tiêu),
   ví dụ phải chứa từ mục tiêu (kể cả dạng chia), phân bổ category, JSON parse, encoding (U+FFFD, mojibake, NFC), placeholder,
   cách đọc chỉ gồm kana và khớp okurigana của headword, danh sách từ quá cơ bản, dữ liệu demo có số đuôi.
   Trong suốt quá trình, validator **không phát hiện duplicate nào** (các ứng viên trùng đã bị loại ở bước 1).
4. Đối chiếu JMdict (EDRDG, CC BY-SA 4.0; bản ${verification?.source?.match(/JMdict v[\d.]+/)?.[0] ?? '—'} qua gói PyPI \`jamdict-data\`):
   - *headword+reading*: từ có mục riêng trong JMdict và cách đọc trùng khớp → đánh dấu \`researched\`,
     \`source_reference\` ghi rõ chỉ xác minh headword & cách đọc.
   - *components*: cụm ghép không có mục riêng, nhưng tách được thành các từ JMdict mà cách đọc ghép lại trùng khớp → giữ \`AI-generated\`.
   - *not-found*: ${notFound.length} entry — ${notFound.join('、')} (chứa chữ Latin hoặc dạng chia động từ/cụm câu).
5. Sinh CSV (UTF-8 BOM) và XLSX từ cùng dữ liệu JSON; sinh \`template.xlsx\` cho import.

## 5. Các entry đã sửa

| ID | Trường | Trước | Sau | Phát hiện bởi |
|---|---|---|---|---|
${corrections.map((c) => `| ${c.id} | ${c.field} | ${c.before} | ${c.after} | ${c.detectedBy} |`).join('\n')}

## 6. Ví dụ entry

| Category | Từ | Cách đọc | Nghĩa | Ví dụ |
|---|---|---|---|---|
${samples}

## 7. Giới hạn còn tồn tại (đọc kỹ)

- **Nghĩa tiếng Việt, câu ví dụ, bản dịch, usage_note, độ khó, jlpt_level đều do AI biên soạn** và chưa được chuyên gia
  ngôn ngữ con người duyệt toàn bộ. Không tuyên bố chính xác 100%.
- Đối chiếu JMdict chỉ xác minh *sự tồn tại của từ và cách đọc*, không xác minh nghĩa nghiệp vụ hay độ tự nhiên của câu ví dụ.
  Mức "components" chỉ chứng minh cách đọc khớp với các thành phần, không chứng minh cụm ghép là cụm từ phổ biến.
- \`jlpt_level\` không dựa trên danh sách JLPT chính thức (JLPT không công bố danh sách từ vựng từ 2010); giá trị N2/N1 là ước lượng,
  \`business\`/\`technical\` chỉ loại từ chuyên ngành.
- Một số thuật ngữ có nhiều cách đọc/viết được chấp nhận (ví dụ 早急 さっきゅう/そうきゅう, 閾値 しきいち/いきち,
  情報漏えい/情報漏洩); dataset chọn một cách và ghi chú trong \`usage_note\` khi cần.
- Các thông tin pháp lý (インボイス制度, 電子帳簿保存法, 契約不適合責任, 個人情報保護法) phản ánh hiểu biết chung đến thời điểm
  biên soạn, không phải tư vấn pháp lý.
- Người dùng có thể sửa bất kỳ entry nào trong app; bản sửa được giữ nguyên khi nâng cấp dataset (\`user_modified\`).
`;
writeFileSync(join(ROOT, 'docs', 'vocabulary-seed-report.md'), md);
console.log('docs/vocabulary-seed-report.md written');
