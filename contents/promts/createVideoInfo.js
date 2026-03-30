// export const createPromptReCreateTitleVideo = (title, content) =>
//   `
// Bạn là chuyên gia viết tiêu đề YouTube cho thị trường Nhật Bản, với mục tiêu tối đa hóa CTR.

// Nhiệm vụ:
// - Viết lại tiêu đề video bằng TIẾNG NHẬT.
// - Giữ đúng nội dung video (không bịa, không gây hiểu sai).
// - Ưu tiên CTR hơn SEO.

// Chiến lược:
// - Có thể sử dụng định dạng 【】 ở đầu để xác định nội dung (anime, 2ch, 解説, 考察…).
// - Phần sau 【】 phải là câu hook gây tò mò mạnh.
// - Hook phải xuất hiện ở nửa đầu tiêu đề.
// - Tạo “curiosity gap” (gợi mở nhưng không nói hết).
// - Không được tiết lộ kết luận chính hoặc toàn bộ nội dung (tránh spoiler).
// - Có yếu tố bất ngờ, twist hoặc “違和感”.
// - Khiến người xem nghĩ: 「気になる…」 và muốn click ngay.

// Phong cách:
// - Tự nhiên như người Nhật (native).
// - Có thể dùng: 「…」「？」 để tăng tò mò.
// - Ưu tiên các dạng:
//   「実は〜」「なぜ〜？」「知らない事実」「〜と思ってたけど…」「これヤバい」

// Yêu cầu:
// - Chỉ viết DUY NHẤT 1 title.
// - Không giải thích, không ký tự thừa.
// - Độ dài ~40–65 ký tự.
// - Không spam keyword, không SEO cứng.

// Dữ liệu:
// Title gốc: ${title}
// ${content ? `Transcript: ${content}` : ''}

// FORMAT BẮT BUỘC:
// - Trả về kết quả trong code block
// - Trong code block CHỈ chứa duy nhất 1 dòng title tiếng Nhật

// Ví dụ format đúng:
// 【修羅場】夫の一言に違和感…調べた結果がヤバすぎた…
// - Không thêm bất kỳ text nào ngoài code block

// Yêu cầu cuối:
// - Chỉ trả về code block chứa title。
// `;

// export const createPromptReCreateDescriptionVideo = (title, description) => `
// Bạn là chuyên gia SEO YouTube tại thị trường Nhật Bản.

// Nhiệm vụ:

// * Viết lại (rewrite) phần description video bằng TIẾNG NHẬT.
// * Tối ưu SEO theo hành vi tìm kiếm của người Nhật.
// * Tăng CTR (gây tò mò, hấp dẫn, giữ chân người xem).
// * Giữ đúng nội dung video, KHÔNG bịa thêm tình tiết.

// Dữ liệu đầu vào:

// * Title: ${title}
// * Description gốc: ${description}

// Yêu cầu xử lý:

// 1. BẮT BUỘC LOẠI BỎ HOÀN TOÀN:

//    * TẤT CẢ link (http, https, www, short link, social link, channel link)
//    * Mention kênh khác / credit ngoài không cần thiết
//    * CTA không liên quan
//    * Keyword spam

//    ⚠️ QUAN TRỌNG:
//    - KHÔNG giữ lại bất kỳ URL nào dưới mọi hình thức
//    - KHÔNG viết lại hoặc biến tấu link (ví dụ: youtube dot com)
//    - Output CUỐI KHÔNG ĐƯỢC chứa "http", "www", ".com", ".jp", ".net" dưới bất kỳ dạng nào

// 2. Giữ lại & tối ưu:

//    * Những đoạn mô tả nội dung chính.
//    * Từ khóa quan trọng (SEO keyword).
//    * Các cụm từ đang có hiệu suất tốt (nếu có).

// 3. Viết lại description theo cấu trúc:

//    * Dòng đầu: hashtag SEO (3–5 hashtag mạnh nhất, liên quan trực tiếp nội dung).
//    * 2–3 dòng đầu: hook cực mạnh để tăng CTR.
//    * Phần thân:

//      * Tóm tắt nội dung rõ ràng, dễ đọc
//      * Chèn từ khóa tự nhiên (không nhồi nhét)
//    * CTA nhẹ (khuyến khích xem tiếp / đăng ký kênh)
//    * Cuối cùng: thêm 5–10 hashtag liên quan (bao gồm từ khóa chính + biến thể)

// 4. Phong cách:

//    * Tự nhiên như người Nhật viết
//    * Không quá dài dòng
//    * Ưu tiên readability + giữ chân người xem

// 5. Tuyệt đối KHÔNG:

//    * Không giữ lại link
//    * Không thêm link mới
//    * Không nhồi keyword spam
//    * Không viết sai nội dung video
//    * Không dùng văn phong máy móc

// 6. FORMAT BẮT BUỘC:

//    * Trả về kết quả trong code block
//    * Trong code block là TOÀN BỘ description tiếng Nhật hoàn chỉnh
//    * Giữ xuống dòng hợp lý để dễ đọc
//    * Không thêm bất kỳ giải thích nào ngoài code block, không thêm ký tự thừa

// Ví dụ format đúng:

// #修羅場 #浮気 #離婚

// 妻のある一言に違和感を覚えた俺…
// 調べてみた結果、想像を超える事実が発覚した——

// （phần nội dung tiếp tục…）
// `;

// export const createPromptReCreateTagsVideo = (title, tags) => `
// Bạn là chuyên gia SEO YouTube tại thị trường Nhật Bản.

// Nhiệm vụ:

// * Tối ưu và mở rộng tags cho video dựa trên:

//   * Title
//   * Tags cũ

// Mục tiêu:

// * Giữ lại những tags cũ có giá trị SEO cao
// * Loại bỏ tags yếu / không liên quan
// * Thêm tags mới để mở rộng khả năng tìm kiếm và đề xuất

// Dữ liệu đầu vào:

// * Title: ${title}
// * Tags cũ: ${tags}

// Yêu cầu xử lý:

// 1. Phân tích tags cũ:

//    * Xác định tag nào:

//      * Liên quan mạnh đến nội dung → GIỮ
//      * Có tiềm năng SEO → GIỮ
//      * Không liên quan / quá chung / spam → LOẠI BỎ

// 2. Tạo tags mới:

//    * Tag ngắn (1–2 từ)
//    * Tag trung bình (2–3 từ)
//    * Tag dài (long-tail 4–8 từ)
//    * Biến thể từ khóa
//    * Tag theo ngữ cảnh (修羅場, スカッと, 浮気, 離婚, 2ch など)

// 3. BẮT BUỘC:

//    * Thêm 5–10 tag cực dài
//    * Dạng câu tìm kiếm tự nhiên của người Nhật
//    * Ví dụ: 「浮気した夫に復讐した結果」「離婚後に起きた衝撃の展開」

// 4. Chiến lược:

//    * Ưu tiên hành vi tìm kiếm thật của người Nhật
//    * Không nhồi nhét keyword
//    * Không trùng lặp tag (dù là tag cũ hay mới)
//    * Bao phủ cả:

//      * Search intent
//      * Browse / đề xuất

// 5. Output:

//    * 30–50 tags tổng cộng (bao gồm cả tag cũ đã được giữ lại + tag mới)
//    * Viết bằng tiếng Nhật
//    * Phân cách bằng dấu phẩy (,)

// 6. FORMAT BẮT BUỘC:

//    * Trả về kết quả trong code block
//    * Trong code block CHỈ có 1 dòng duy nhất chứa toàn bộ tags
//    * Không xuống dòng trong code block

// Ví dụ format đúng:

// 修羅場, 浮気, 離婚, スカッと, 2ch, 不倫された夫の逆襲, 妻の裏切りの結末, 離婚後に起きた衝撃の展開

//    * Không thêm bất kỳ text nào ngoài code block

// Yêu cầu cuối:

//    * Chỉ trả về code block chứa tag.
// `;

export const createPromptSummaryContent = (currentContent, previousSummaries = '') =>
  `
# Role:

あなたは2ch/5chスカッと・修羅場系動画の構成作家です。
どんなジャンルでも文脈を正確に理解し、視聴者の感情を引き込む要約を作成します。

# Task:

「これまでのあらすじ」に続く今回のトランスクリプトを要約してください。
挨拶・説明は一切禁止。

# Context（これまでのあらすじ）:

${previousSummaries ?? '物語の始まり'}

# Input Transcript:

${currentContent}

# Instructions:

1. ジャンル自動判定（最重要）:
   以下のどれに該当するか判断する

* 嫁姑・義実家トラブル
* 不倫・浮気・裏切り
* その他の人間関係トラブル

※文脈から最も近いものを1つ選択

2. 整合性:

* これまでのあらすじと矛盾しないようにする
* ストーリーを自然に接続

3. 事実ベース:

* トランスクリプトの内容のみ使用
* 情報の捏造・追加は禁止

4. 感情の強調（ジャンル別）:

* 嫁姑系 → 嫌味・ストレス・支配・無関心
* 不倫系 → 裏切り・疑念・証拠・違和感
* その他 → 対立・不公平・衝突

5. 緊張感の上昇:

* 前パートより状況が悪化・深刻化するように描写

6. 不穏な要素:

* 小さな違和感・伏線・意味深な言動を必ず拾う

7. 引き（最重要）:
   以下のいずれかで終える

* 決定的な一言の直前
* 真実が明らかになる直前
* 関係が崩壊する直前

# Output Format（厳守）:

必ずコードブロック内のみ出力

\`\`\`
【ジャンル】:
（自動判定結果）

【起きた出来事】:
（今回の進展）

【対立・問題点】:
（何が問題になっているか）

【胸糞ポイント】:
（最もイラつく言動）

【主人公の状態】:
（感情・変化）

【不穏な伏線】:
（違和感・意味深要素）

【引き】:
（次を見たくなる終わり方）

【サムネ用パワーワード】:
（2〜3個）
\`\`\`
`;

export const createPromptToMergeSummaryContent = allPartSummaries => `
# Role:

あなたはスカッと系・修羅場系YouTube動画の統括ディレクターです。
ジャンル（嫁姑・不倫・人間関係）に応じて、最適な感情構造で物語を完成させます。

# Context:

${allPartSummaries}

# Task:

1. 全パートを統合し、自然で一貫性のあるストーリーに再構成する
2. ジャンルに応じて感情の流れを最適化する
3. クライマックス（スカッと場面）を最大化する

# Instructions:

1. ジャンル判定:
   各パートの【ジャンル】を参考に、全体のメインジャンルを決定する

2. 原文準拠（最重要）:

* 要約内容から逸脱しない
* 情報の捏造は禁止

3. 一貫性:

* 人物の性格・関係性・行動ロジックを維持

4. ジャンル別構成最適化:

■ 嫁姑・義実家系:

* 小さなストレス → 蓄積 → 限界 → 逆転 → スカッと

■ 不倫・浮気系:

* 違和感 → 疑念 → 証拠 → 発覚 → 崩壊 → スカッと

■ その他:

* 対立 → 悪化 → 転機 → 解決

5. 伏線回収:

* 各パートの「不穏な伏線」を回収し、繋がりを明確にする

6. スカッとの質:

* なぜ逆転できたかを論理的に説明
* ご都合主義を避ける

# Output Format（厳守）:

コードブロック内のみ出力

\`\`\`
【ジャンル】:
（最終判定）

【全体プロット】:
（起承転結 300〜400字）

【ストーリー構造】:
（ジャンルに応じた流れを整理）

【対立の本質】:
（何が問題だったのか）

【クライマックス】:
（最も盛り上がる瞬間）

【スカッとポイント】:
（爽快感の理由）

【伏線と回収】:
（前半→後半の繋がり）

【登場人物の結末】:
（主人公・敵対者それぞれ）

【量産用パターン】:
（この話の型）
\`\`\`
`;

export const createPromptCreateMetaInfo = (title, summary) =>
  `
# Role:

あなたはスカッと系・修羅場系YouTube動画で100万再生を連発するプロ作家です。
ジャンルに応じて、クリック率と視聴維持率を最大化するタイトル・説明文・タグを作成します。

# Task:

提供された最終要約を分析し、「タイトル」「動画説明文」「タグ」を作成してください。
挨拶・解説は一切不要。

# Input:

* 最終要約: ${summary}
* 旧タイトル: ${title}

# Instructions:

1. ジャンル判定（最重要）:
   以下のいずれかを判定

* 嫁姑・義実家トラブル
* 不倫・浮気・裏切り
* その他の人間関係

→ 判定結果に応じて表現・キーワードを最適化

2. タイトル作成:

* ネタバレ禁止
* 感情を強く刺激（怒り・違和感・衝撃）
* 必ずジャンルに合ったワードを含める

■ 嫁姑系:

* 姑・義実家・夫
* 嫌味・限界・崩壊

■ 不倫系:

* 浮気・不倫・裏切り
* 発覚・証拠・バレた瞬間

■ その他:

* 裏切り・非常識・衝突

3. 説明文:
   以下の構成で作成

① 導入（ジャンル別）

* 嫁姑 → 共感・ストレス
* 不倫 → 疑念・違和感
* その他 → 問題提起

② あらすじ（ネタバレなし）

③ 視聴者への問いかけ
（あなたならどうする？系）

④ 定型文（チャンネル説明）

4. タグ:

* 15〜20個
* 短文＋長文タグ混合
* ジャンル特化キーワードを優先
* カンマ区切り

# Output Format（厳守）:

必ずコードブロック内のみ出力

\`\`\`
【ジャンル】
（判定結果）

【タイトル】
（1案）

【動画説明文】
#スカッと #修羅場 #2ch

（導入）
（あらすじ）
（問いかけ）
（定型文）

【タグ】
（カンマ区切り）
\`\`\`
`;

export const createPromptCreateMetaInfoOld = (title, summary) =>
  `
あなたはYouTubeマーケティングのスペシャリスト（日本市場担当）です。「修羅場」「2ch」「スカッと」「復讐」系ジャンルにおいて、クリック率（CTR）とSEOを極限まで高めるプロフェッショナルです。

【入力データ】
元のタイトル：${title}
全体の要約 (Summary)：${summary}

【タスク】
提供された要約に基づき、以下の3要素を生成してください。

1. タイトル (Title):
- 目的：CTRの最大化。
- 戦略：「実は〜」「…した結果」「〜がヤバい」等のネイティブな表現を使用。
- 文字数：40〜65文字。結末は伏せ、強いフックを前半に置く。

2. 動画説明文 (Description):
- 構成：冒頭にハッシュタグ(3-5個) → 感情を揺さぶる導入文(2-3行) → ストーリーの魅力的な要約。
- 【厳守】：URL、外部リンク、SNSリンクは一切含めない。
- 末尾に関連ハッシュタグを5〜10個追加。

3. タグ (Tags):
- 30〜50個を生成し、カンマ区切りで1行にまとめる。
- 検索意図（ロングテールキーワード）を重視。

【出力形式 - 厳守】
- **【重要】全ての回答を「唯一つのコードブロック」の中にまとめて出力してください。**
- 各セクションの冒頭には必ず以下のラベルを付けてください：
  【タイトル】
  【動画説明文】
  【タグ】
- コードブロック以外のテキスト（挨拶、説明、アドバイス、返答など）は、いかなる理由があっても一切出力しないでください。
- 日本語のみで出力してください。
`;
