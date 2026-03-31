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

export const createPromptReCreateThumbnailFromSummary = summary => `
あなたはYouTubeのCTRを最大化するプロのサムネデザイナーです。

添付されたサムネ画像をベースにして、
構図・人物・背景はできるだけ維持したまま、
クリック率が最大化されるようにサムネを再生成してください。

【やること】
・画像内の既存テキストを読み取り、削除または置き換える
・新しいテキストを追加（より強いCTRを狙う）
・フォントは太く・視認性を最優先（スマホで一瞬で読める）
・色・コントラストを強調して目立たせる

【テキスト条件】
・日本語
・10〜15文字以内
・2chまとめ風
・感情を強く刺激（驚き・恐怖・怒り・共感）
・内容を全て説明しない（続きを見たくなる）

【デザイン条件】
・テキストは大きく中央 or 視線誘導に沿って配置
・背景と被らないように縁取り or シャドウをつける
・赤・黄・白などコントラストの強い色を使用

【NG】
・元画像と全く別の構図にする
・文字が小さい
・普通すぎる表現

---

【タイトル】
{{title}}

【動画の要約】
{{summary}}

【出力】
・改善後のサムネ画像
・使用したテキスト
・なぜCTRが上がるかの簡単な説明
`;
