/**
 * Text-to-image: chỉ mô tả ý tưởng, không kèm ảnh tham chiếu.
 * @param {string} [hint] - Gợi ý thêm (tiếng Anh hoặc tiếng nhật tùy model)
 */
export const createPromptNewImage = (hint = '') =>
  `
Create a single high-CTR YouTube thumbnail image.

Style:
- Bold, readable text hierarchy, strong contrast
- Typical Japanese YouTube thumbnail energy if the topic fits
- Sharp, no watermark, no distorted faces

${hint ? `Additional direction:\n${hint}\n` : ''}

Output: one striking thumbnail image only.
`.trim();

export const createPromptReCreateThumbnail = () =>
  `
You are a professional YouTube thumbnail designer.

Task:
Take the text from Image A (image with text) and place it onto Image B (clean image) to create a high-CTR YouTube thumbnail.

Instructions:

1. Text extraction:
- Extract ALL text from Image A exactly as it appears
- Keep original language (Japanese if present)
- DO NOT translate, rewrite, or summarize

2. Text styling (VERY IMPORTANT):
- Recreate bold, eye-catching YouTube thumbnail text
- Match font style as closely as possible (thick, strong, impactful)
- Use large font size for readability on mobile
- Apply effects if present: stroke (outline), drop shadow, glow
- Ensure high contrast between text and background

3. Layout & positioning:
- Place text in a visually balanced position similar to Image A
- Keep composition clean and professional
- Avoid covering faces or key subjects
- Follow typical Japanese YouTube thumbnail style (big text, dramatic layout)

4. CTR optimization:
- Make text instantly readable at small sizes
- Emphasize key words (bigger / bolder if needed)
- Keep strong visual hierarchy
- Make the thumbnail feel clickable and engaging

5. Enhancement for Japanese audience:
- Use bold and dramatic visual style common in Japanese YouTube thumbnails
- Slightly exaggerate text size and contrast for higher click-through rate
- Prioritize readability over strict visual accuracy if needed

6. Image quality:
- Sharp, high resolution (no blur, no artifacts)
- Natural blending between text and background
- Text should look like it was originally part of Image B

7. Strict rules:
- DO NOT add any new text
- DO NOT remove any text
- DO NOT translate text
- DO NOT add watermark
- DO NOT distort the image

Output:
Return ONLY the final YouTube thumbnail image.
`;

export const createPromptCreateJapaneseThumbnail = (title, summary) =>
  `
Tạo thumbnail YouTube mới kích thước 1280x720 hoặc 1920x1080, phong cách Nhật Bản hiện đại, cực kỳ hấp dẫn, high contrast, vibrant colors, cinematic lighting, sharp details, professional YouTube thumbnail 2026.

Từ hình ảnh tham chiếu được cung cấp:
- Làm sạch hoàn toàn hình ảnh: loại bỏ mọi chữ cũ, logo cũ và các yếu tố thừa không mong muốn.
- Tái tạo lại chủ thể chính với chất lượng cao hơn, chi tiết sắc nét và biểu cảm mạnh mẽ hơn để tăng sức hút.
- Thay nền hoàn toàn bằng nền mới đẹp mắt, phù hợp phong cách Nhật Bản (neon đêm Tokyo, gradient cinematic, anime aesthetic tinh tế hoặc nền tối để text pop).

Thêm text overlay mới, rõ ràng, nổi bật và tối ưu CTR cao:
- Tiêu đề chính (chữ to, bold): ${title}
- Hook phụ (chữ nhỏ hơn nhưng mạnh): ${summary}

Yêu cầu text (rất quan trọng):
- Sử dụng màu text chủ đạo: trắng sáng + viền đen dày, vàng gold neon hoặc đỏ rực
- Kết hợp linh hoạt: tiêu đề chính dùng **trắng hoặc vàng gold**, hook phụ dùng **đỏ hoặc vàng** để tạo điểm nhấn
- Font sans-serif hiện đại hoặc kiểu chữ Nhật Bản tinh tế, chữ to rõ ràng, có glow nhẹ hoặc shadow mạnh để text nổi bật cực kỳ
- Bố cục cân đối, dễ đọc trên mobile, không lộn xộn

Tổng thể: Eye-catching, scroll-stopping, màu sắc rực rỡ, contrast mạnh, chất lượng ultra sharp, 8K, không có logo, không watermark, không text thừa ngoài những gì đã chỉ định.

Reference image: [attach]
`;

export const summary = `## 1. 今回のセグメント要約
帰省先の地元で買い物をしていた主人公と妻・美ゆきの前に、不潔な身なりの男が現れる。男は美ゆきの腕を掴み、馴れ馴れしく食事をねだるが、美ゆきはこれまで夫に見せたことのない「氷のように冷徹な表情」へと一変。男が過去に美ゆきの親友の家を荒らして逮捕され、現在は自業自得で借金に苦しんでいる事実を突きつけ、「あんたを考える1秒ももったいない」と一蹴する。

車に戻った後、美ゆきは男が「親友の人生を壊した元カレ」であることを告白。親友を救えなかった後悔から、感情を抑えて穏やかに生きるよう努めてきた過去を明かす。夫は彼女の隠された激しい気性を知ってもなお、親友を想う彼女の深い優しさを再確認し、すべてを受け入れて彼女を守り抜くことを誓う。

---

## 2. 登場人物ステータス
* **主人公（俺）**: 美ゆきの夫。妻の豹変に驚愕するも、背景にある彼女の正義感と優しさを理解し、以前にも増して愛することを決意する。
* **美ゆき**: 主人公の妻。普段は「人間ができている」と評されるほど穏やかだが、大切な人を傷つけた相手には容赦ない「静かな怒り」を持つ。過去のトラウマにより地元を避けていた。
* **謎の男**: 美ゆきの親友の元カレ。家宅侵入などの犯罪行為で親友を追い詰め、現在は裏社会の借金に追われている。美ゆきに金の無心をしようとした。

---

## 3. 重要なセリフ
* **「私の人生にあんたを考えている1秒の時間ももったいない」**: 執着を断ち切り、男を完全な「無価値」として切り捨てた美ゆきの言葉。
* **「私が何も知らないとでも思ってるの？」**: 普段の笑顔からは想像もつかない、感情の抜け落ちた冷酷な追及。
* **「ごめんなさい」**: 男を追い払った後、見せたくなかった一面を晒してしまったことに怯え、夫に放った一言。

---

## 4. 感情キーワード
* **静かな怒り**: 声を荒らげず、トーンを落として相手を追い詰める美ゆきの真の怒り。
* **自業自得**: 落ちぶれた加害者に対する、慈悲なき断罪。
* **親友への後悔**: 親友を守れず、縁が切れてしまったことへの消えない心の傷。
* **無条件の受容**: 妻の「隠したかった顔」を知ることで、より絆を深めようとする夫の包容力。`;
