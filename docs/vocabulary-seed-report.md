# Báo cáo dataset từ vựng seed v1.0.0

> File này được sinh tự động bởi `scripts/vocab-report.ts` từ `data/vocabulary/seed-v1.json`,
> kết quả validator (`scripts/validate-vocabulary.ts`) và kết quả đối chiếu JMdict (`scripts/verify-jmdict.py`).
> Ngày tạo dataset: 2026-11-24.

## 1. Tóm tắt

| Chỉ số | Giá trị |
|---|---:|
| Tổng số entry | **1000** |
| Entry unique (sau chuẩn hóa NFKC, bỏ khoảng trắng) | 1000 |
| Lỗi validator | **0** |
| Cảnh báo validator | 0 |
| Số batch biên soạn | 21 (≈ 40–60 từ/batch) |
| Entry khớp JMdict (headword + cách đọc) → `researched` | 443 |
| Entry là cụm ghép, cách đọc khớp các thành phần trong JMdict | 542 |
| Entry không đối chiếu được tự động | 15 |
| Entry `source_type = AI-generated` | 557 |
| Entry `source_type = researched` | 443 |
| Duplicate bị validator phát hiện và loại | 0 (xem mục 4) |
| Entry đã được sửa sau khi viết | 3 (xem mục 5) |

## 2. Phân bổ theo category

| Category | Mục tiêu | Thực tế | Đạt | Trong đó `researched` |
|---|---:|---:|:---:|---:|
| BA / Requirement Engineering | 180 | 180 | ✔ | 54 |
| Japanese Business / Business Communication | 150 | 150 | ✔ | 85 |
| Project Management | 120 | 120 | ✔ | 60 |
| Software Engineering | 150 | 150 | ✔ | 82 |
| System Architecture / Design | 100 | 100 | ✔ | 31 |
| Database / Data Engineering | 80 | 80 | ✔ | 29 |
| Cloud / DevOps / Infrastructure | 80 | 80 | ✔ | 22 |
| Testing / QA | 60 | 60 | ✔ | 13 |
| Security | 40 | 40 | ✔ | 27 |
| Advanced General Business Japanese | 40 | 40 | ✔ | 40 |

## 3. Phân bổ theo độ khó / JLPT / văn phong

| Difficulty | Số lượng |
|---|---:|
| advanced | 455 |
| intermediate | 368 |
| expert | 177 |

| jlpt_level | Số lượng |
|---|---:|
| technical | 518 |
| business | 312 |
| N1 | 147 |
| N2 | 23 |

| Register | Số lượng |
|---|---:|
| technical | 521 |
| business | 294 |
| formal | 151 |
| neutral | 34 |

## 4. Quy trình tạo & kiểm tra

1. Lập danh sách từ mục tiêu cho từng category (spec §9), loại trước các ứng viên trùng/gần trùng giữa các category
   (ví dụ: 稼働率 chỉ giữ ở PM, 冗長 (SWE) vs 冗長化 (Architecture), 切り分け (QA) vs 一次切り分け (Cloud)).
   Việc loại ở bước lập danh sách được làm thủ công, không có log tự động nên không có con số chính xác.
2. Biên soạn theo batch 21 file trong `data/vocabulary/batches/` (mỗi dòng: từ | cách đọc | nghĩa | ví dụ JA | ví dụ VI | …).
3. Sau mỗi batch: `npm run vocab:generate` → `npm run validate:vocab`. Validator kiểm tra: tổng 1.000, unique sau chuẩn hóa,
   trùng (reading + nghĩa), trường bắt buộc, ví dụ rỗng/trùng/mẫu câu lặp ("skeleton" giống nhau sau khi bỏ từ mục tiêu),
   ví dụ phải chứa từ mục tiêu (kể cả dạng chia), phân bổ category, JSON parse, encoding (U+FFFD, mojibake, NFC), placeholder,
   cách đọc chỉ gồm kana và khớp okurigana của headword, danh sách từ quá cơ bản, dữ liệu demo có số đuôi.
   Trong suốt quá trình, validator **không phát hiện duplicate nào** (các ứng viên trùng đã bị loại ở bước 1).
4. Đối chiếu JMdict (EDRDG, CC BY-SA 4.0; bản JMdict v1.08 qua gói PyPI `jamdict-data`):
   - *headword+reading*: từ có mục riêng trong JMdict và cách đọc trùng khớp → đánh dấu `researched`,
     `source_reference` ghi rõ chỉ xác minh headword & cách đọc.
   - *components*: cụm ghép không có mục riêng, nhưng tách được thành các từ JMdict mà cách đọc ghép lại trùng khớp → giữ `AI-generated`.
   - *not-found*: 15 entry — 別途協議、QA表、確認が取れ次第、致しかねます、候補日、ボールを持っている、ブリッジSE、ORマッパー、API連携、APIゲートウェイ、ER図、NULL許容、ETL処理、NoSQLデータベース、SQLインジェクション (chứa chữ Latin hoặc dạng chia động từ/cụm câu).
5. Sinh CSV (UTF-8 BOM) và XLSX từ cùng dữ liệu JSON; sinh `template.xlsx` cho import.

## 5. Các entry đã sửa

| ID | Trường | Trước | Sau | Phát hiện bởi |
|---|---|---|---|---|
| sec-sec-0027 | reading | でんしししょうめいしょ | でんししょうめいしょ | Tự rà soát khi biên soạn batch 20 (lỗi gõ thừa 「し」) |
| sec-sec-0020 | example_vi | Nếu dùng placeholder thì có thể ngăn được SQL injection. | Nếu dùng tham số giữ chỗ (bind variable) trong câu SQL thì có thể ngăn được SQL injection. | Validator — quy tắc placeholder |
| ba-req-0109 | reading | べっとぎょうぎ | べっときょうぎ | Đối chiếu JMdict mức thành phần (協議 = きょうぎ, không biến âm) |

## 6. Ví dụ entry

| Category | Từ | Cách đọc | Nghĩa | Ví dụ |
|---|---|---|---|---|
| BA / Requirement Engineering | 要求定義 | ようきゅうていぎ | Định nghĩa nhu cầu — tổng hợp mong muốn của khách hàng trước khi thành yêu cầu hệ thống | 要求定義の段階では、実現方法よりも業務上の目的を明確にすることが重要です。 |
| Japanese Business / Business Communication | 恐縮ですが | きょうしゅくですが | Thật lấy làm ngại nhưng… | お忙しいところ恐縮ですが、本日中にご回答いただけますと助かります。 |
| Project Management | 後ろ倒し | うしろだおし | Lùi về sau so với kế hoạch | 検証環境の準備が遅れたため、テスト開始を一週間後ろ倒しにします。 |
| Software Engineering | 冪等性 | べきとうせい | Tính idempotent — thực hiện cùng một thao tác nhiều lần vẫn cho kết quả tương đương một lần | このAPIは冪等性を保証する必要があります。 |
| System Architecture / Design | 保守運用性 | ほしゅうんようせい | Tính dễ bảo trì và vận hành | 監視とログの設計は、保守運用性に直結する重要な要素です。 |
| Database / Data Engineering | 正規化 | せいきか | Chuẩn hóa (cơ sở dữ liệu) | 正規化を進めすぎると結合が増え、検索性能が落ちることがあります。 |
| Cloud / DevOps / Infrastructure | 構築手順書 | こうちくてじゅんしょ | Tài liệu thủ tục dựng hệ thống | 構築手順書どおりに作業すれば、誰でも同じサーバーを作れる状態を目指します。 |
| Testing / QA | 回帰テスト | かいきてすと | Kiểm thử hồi quy | 修正の影響がないことを確かめるため、主要機能の回帰テストを自動で流しています。 |
| Security | 脆弱性診断 | ぜいじゃくせいしんだん | Đánh giá lỗ hổng bảo mật | 公開前に外部の専門会社による脆弱性診断を受けます。 |
| Advanced General Business Japanese | 喫緊 | きっきん | Cấp bách, khẩn thiết | 人材の確保が、当社にとって喫緊の課題となっています。 |

## 7. Giới hạn còn tồn tại (đọc kỹ)

- **Nghĩa tiếng Việt, câu ví dụ, bản dịch, usage_note, độ khó, jlpt_level đều do AI biên soạn** và chưa được chuyên gia
  ngôn ngữ con người duyệt toàn bộ. Không tuyên bố chính xác 100%.
- Đối chiếu JMdict chỉ xác minh *sự tồn tại của từ và cách đọc*, không xác minh nghĩa nghiệp vụ hay độ tự nhiên của câu ví dụ.
  Mức "components" chỉ chứng minh cách đọc khớp với các thành phần, không chứng minh cụm ghép là cụm từ phổ biến.
- `jlpt_level` không dựa trên danh sách JLPT chính thức (JLPT không công bố danh sách từ vựng từ 2010); giá trị N2/N1 là ước lượng,
  `business`/`technical` chỉ loại từ chuyên ngành.
- Một số thuật ngữ có nhiều cách đọc/viết được chấp nhận (ví dụ 早急 さっきゅう/そうきゅう, 閾値 しきいち/いきち,
  情報漏えい/情報漏洩); dataset chọn một cách và ghi chú trong `usage_note` khi cần.
- Các thông tin pháp lý (インボイス制度, 電子帳簿保存法, 契約不適合責任, 個人情報保護法) phản ánh hiểu biết chung đến thời điểm
  biên soạn, không phải tư vấn pháp lý.
- Người dùng có thể sửa bất kỳ entry nào trong app; bản sửa được giữ nguyên khi nâng cấp dataset (`user_modified`).
