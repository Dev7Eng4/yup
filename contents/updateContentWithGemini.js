/**
 * Gửi nội dung SRT tới Gemini qua Playwright, nhận kết quả text đã xử lý.
 * Dùng Chrome profile persistent (từ makeChromeProfile) để giữ session Google login.
 */

import { getOrCreateProfile, cleanupTempProfile } from './makeChromeProfile.js';
import { checkFirstParagraph, checkLastParagraph } from '../promts/checkTextContent.js';

const GEMINI_URL = 'https://gemini.google.com/app';

/**
 * Đợi cho đến khi Gemini trả lời xong (không còn loading/streaming).
 */
async function waitForGeminiResponse(page, timeoutMs = 120000) {
  // Đợi response container xuất hiện
  await page.waitForSelector('.model-response-text, .response-content, message-content', {
    timeout: timeoutMs,
  });

  // Đợi cho đến khi streaming xong (nút Stop biến mất)
  const startTime = Date.now();
  while (Date.now() - startTime < timeoutMs) {
    const isStreaming = await page.evaluate(() => {
      const stopBtn = document.querySelector('button[aria-label="Stop response"], mat-icon[data-mat-icon-name="stop_circle"]');
      if (stopBtn) {
        const rect = stopBtn.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      }
      return false;
    });
    if (!isStreaming) break;
    await page.waitForTimeout(1000);
  }

  // Chờ thêm 2 giây để chắc chắn response hoàn tất
  await page.waitForTimeout(2000);
}

/**
 * Lấy text kết quả từ response của Gemini.
 * Nếu là cleanSrt_*, lấy từ block <code> chứa định dạng markdown.
 * Còn lại thì lấy sau text "Kết quả bạn mong muốn:".
 */
async function extractGeminiResponse(page) {
  // Đợi thêm 1 chút để DOM render xong hoàn toàn phần text
  await page.waitForTimeout(1500);

  return page.evaluate(() => {
    // 1. Tìm tất cả các response block
    const responses = Array.from(
      document.querySelectorAll('.model-response-text, .response-content, message-content, div[data-message-author-role="model"]'),
    );
    if (responses.length === 0) return '';

    // Lấy node DOM của response cuối cùng (gần nhất)
    const lastResponse = responses[responses.length - 1];

    // Trích xuất kết quả từ Markdown Code block (áp dụng mặc định)
    // Tìm thẻ code có data-test-id="code-content"
    const codeBlocks = lastResponse.querySelectorAll('code[data-test-id="code-content"]');
    if (codeBlocks.length > 0) {
      return (codeBlocks[codeBlocks.length - 1].innerText || codeBlocks[codeBlocks.length - 1].textContent || '').trim();
    }

    // Fallback lấy bất kỳ block code nào
    const anyCode = lastResponse.querySelectorAll('code');
    if (anyCode.length > 0) {
      return (anyCode[anyCode.length - 1].innerText || anyCode[anyCode.length - 1].textContent || '').trim();
    }

    // Fallback vét cạn nếu không có thẻ code nào
    return (lastResponse.innerText || lastResponse.textContent || '').trim();
  });
}

/**
 * Gửi prompt tới Gemini và nhận kết quả. Cùng 1 phiên duyệt web nếu truyền vào mảng.
 * Dùng Playwright với Chrome profile persistent (đã đăng nhập Google trước).
 * @param {string|string[]} textOrChunks - Nội dung text (hoặc mảng các chunk) cần xử lý
 * @param {object} options - Tùy chọn truyền vào (mode, title, part...)
 * @returns {Promise<string|string[]>} Text đã được Gemini xử lý (cùng định dạng input)
 */
export async function updateContentWithGemini(textOrChunks, options = {}) {
  const isArray = Array.isArray(textOrChunks);
  const chunks = isArray ? textOrChunks : [textOrChunks];
  const { mode = 'outro', title = '' } = options;

  console.log('Đang mở Chrome với profile đã lưu...');
  const { context, page } = await getOrCreateProfile({ visible: true });

  try {
    // Mở Gemini trong tab hiện tại (không dùng networkidle vì giao thức SSE keep-alive sẽ treo load)
    await page.goto(GEMINI_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    console.log(`Đã mở Gemini, bắt đầu xử lý ${chunks.length} phần...`);

    const results = [];

    for (let currentPart = 1; currentPart <= chunks.length; currentPart++) {
      const chunk = chunks[currentPart - 1];
      let currentMode = currentPart === 1 ? 'cleanSrt_first' : 'cleanSrt_next';
      let prompt = currentPart === 1 ? checkFirstParagraph(title, chunk) : checkLastParagraph(title, chunk, currentPart);

      console.log(`\n--- Đang gửi prompt phần ${currentPart}/${chunks.length} (mode: ${currentMode}) ---`);

      // Đợi textarea/input xuất hiện
      const inputSelector = 'div.ql-editor[contenteditable="true"], .ql-editor, rich-textarea .ql-editor';
      await page.waitForSelector(inputSelector, { timeout: 15000 });

      // Focus vào input
      await page.click(inputSelector);
      await page.waitForTimeout(500);

      // Paste nội dung prompt (đồng thời xoá nội dung cũ nếu còn sót lại)
      await page.evaluate(textToPaste => {
        const editor = document.querySelector('div.ql-editor[contenteditable="true"], .ql-editor, rich-textarea .ql-editor');
        if (editor) {
          editor.focus();
          document.execCommand('selectAll', false, null); // Chọn toàn bộ text cũ
          document.execCommand('insertText', false, textToPaste); // Ghi đè text mới (kích hoạt event input của giao diện)
        }
      }, prompt);

      await page.waitForTimeout(1000);

      // Nhấn nút gửi
      const sendBtnSelector = 'button.send-button, button[aria-label="Send message"], button[data-mat-icon-name="send"]';
      await page.waitForSelector(sendBtnSelector, { timeout: 5000 });
      await page.click(sendBtnSelector);

      console.log(`Đã gửi phần ${currentPart}, đang đợi Gemini xử lý...`);

      // Đợi response
      await waitForGeminiResponse(page, 150000);

      // Lấy kết quả
      const result = await extractGeminiResponse(page);
      console.log(`Đã nhận kết quả từ Gemini cho phần ${currentPart}.`);

      results.push(result);

      // Chờ thêm một nhịp nhẹ trước khi gửi prompt tiếp theo
      if (currentPart < chunks.length) {
        await page.waitForTimeout(2000);
      }
    }

    return isArray ? results : results[0];
  } finally {
    // Đóng context (giữ lại profile trên ổ đĩa)
    await context.close();
    cleanupTempProfile();
  }
}

export default updateContentWithGemini;
