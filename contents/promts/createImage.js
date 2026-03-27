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
