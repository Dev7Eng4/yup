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

export const createPromptSummaryContent = (transcript, previousSummary = '') =>
  `
あなたはYouTubeのストーリーテラーです。長尺の動画を分割して要約しています。

【入力データ】
■これまでの要約（コンテキスト）:
${previousSummary ?? 'なし'}

■今回の文字起こしセグメント（SRT）:
${transcript}

【指示】
1. 「これまでの要約」を基に文脈を把握し、今回のセグメントを詳細に要約してください。
2. ストーリーの進行に合わせて、登場人物、新たな対立、重要なセリフ、感情キーワードを更新・特定してください。
3. 今回の要約は、最終的な「タイトル・概要欄作成」の重要な判断材料となります。

【厳守事項】
- **出力は必ず「唯一つのコードブロックのみ」としてください。**
- コードブロック以外のテキスト（挨拶、説明、質問、確認の言葉、返答など）は、いかなる lý do があっても一切出力しないでください。
- 結果は日本語でMarkdownのコードブロック内に記述してください。
`;

export const createPromptCreateMetaInfo = (title, summary) =>
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
