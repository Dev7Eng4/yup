/**
 * Gửi nội dung SRT tới Gemini qua Playwright, nhận kết quả text đã xử lý.
 * Dùng Chrome profile persistent (từ makeChromeProfile) để giữ session Google login.
 */

import { getOrCreateProfile } from './makeChromeProfile.js';
import { updateContentOutro } from '../promts/updateContentOutro.js';

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
 * Tìm text "Kết quả bạn mong muốn:" rồi lấy nội dung thẻ kế tiếp.
 */
async function extractGeminiResponse(page) {
  // Đợi thêm 1 chút để DOM render xong hoàn toàn phần text
  await page.waitForTimeout(1500);

  return page.evaluate(() => {
    // 1. Tìm tất cả các response block
    const responses = Array.from(document.querySelectorAll('.model-response-text, .response-content, message-content, div[data-message-author-role="model"]'));
    if (responses.length === 0) return '';

    // Lấy node DOM của response cuối cùng (gần nhất)
    const lastResponse = responses[responses.length - 1];

    // Tạo regex tìm chuỗi (có/không in đậm)
    const regex = /(?:\*\*?)?Kết quả bạn mong muốn:(?:\*\*?)?\s*/;

    // 2. Quét DOM bằng TreeWalker để tìm thẻ chứa token
    const walker = document.createTreeWalker(lastResponse, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
    let node;
    let foundParent = null;

    while ((node = walker.nextNode())) {
      // Bỏ qua các container chung chung để nhắm vào thẻ chứa nội dung nhỏ nhất (như p, li, b, text)
      if (node.nodeType === Node.ELEMENT_NODE && node.children.length > 2) {
        continue;
      }
      
      const text = node.textContent || '';
      if (regex.test(text)) {
         foundParent = node.nodeType === Node.TEXT_NODE ? node.parentElement : node;
         // Tiếp tục tìm để lấy cái cuối cùng xuất hiện (tránh nhầm thẻ gốc trên đầu)
      }
    }

    if (foundParent) {
       // Chúng ta lấy text của "thẻ liền kề" nằm CÙNG CẤP với cái chứa thẻ "Kết quả bạn mong muốn:"
       // Ví dụ: <p><b>Kết quả bạn mong muốn:</b></p>  ---lấy--->  <p>Văn bản cần lấy</p>
       
       let target = foundParent;
       
       // Trèo lên từ thẻ <b> / <strong> lên đến thẻ line-block của nó (<p>, <li>, <div> chứa nó trực tiếp)
       while (target && target.parentElement && target.parentElement !== lastResponse && ['B','STRONG','SPAN','EM','I'].includes(target.tagName)) {
           target = target.parentElement;
       }

       const nextSibling = target.nextElementSibling;
       if (nextSibling) {
           return nextSibling.innerText?.trim() || nextSibling.textContent?.trim() || '';
       }
    }

    // Fallback nếu vẫn không tìm thấy thẻ sibling (Gemini gom hết vô text thuần)
    const fullText = lastResponse.innerText || lastResponse.textContent || '';
    const lastIndex = fullText.search(new RegExp(regex.source, 'g'));
    if (lastIndex !== -1) {
       // Cắt đến dấu xuống dòng tiếp theo hoặc hết text
       const substr = fullText.substring(lastIndex);
       const contentAfter = substr.replace(regex, ''); // Xoá chữ "Kêt quả..."
       return contentAfter.trim();
    }

    // Nếu không có token, trả về toàn bộ
    return (lastResponse.innerText || lastResponse.textContent || '').trim();
  });
}

/**
 * Gửi prompt tới Gemini và nhận kết quả.
 * Dùng Playwright với Chrome profile persistent (đã đăng nhập Google trước).
 * @param {string} srtText - Nội dung SRT cần xử lý
 * @returns {Promise<string>} Text đã được Gemini xử lý
 */
export async function updateContentWithGemini(srtText) {
  const prompt = updateContentOutro(srtText);
  console.log('Đang mở Chrome với profile đã lưu...');

  const { context, page } = await getOrCreateProfile({ visible: true });

  try {
    // Mở Gemini trong tab hiện tại
    await page.goto(GEMINI_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    console.log('Đã mở Gemini, đang gửi prompt...');

    // Đợi textarea/input xuất hiện
    const inputSelector = 'div.ql-editor[contenteditable="true"], .ql-editor, rich-textarea .ql-editor';
    await page.waitForSelector(inputSelector, { timeout: 15000 });

    // Focus vào input
    await page.click(inputSelector);
    await page.waitForTimeout(500);

    // Paste nội dung prompt
    await page.evaluate((text) => {
      const editor = document.querySelector('div.ql-editor[contenteditable="true"], .ql-editor, rich-textarea .ql-editor');
      if (editor) {
        editor.focus();
        document.execCommand('insertText', false, text);
      }
    }, prompt);

    await page.waitForTimeout(1000);

    // Nhấn nút gửi
    const sendBtnSelector = 'button.send-button, button[aria-label="Send message"], button[data-mat-icon-name="send"]';
    await page.waitForSelector(sendBtnSelector, { timeout: 5000 });
    await page.click(sendBtnSelector);

    console.log('Đã gửi prompt, đang đợi Gemini xử lý...');

    // Đợi response
    await waitForGeminiResponse(page, 120000);

    // Lấy kết quả
    const result = await extractGeminiResponse(page);
    console.log('Đã nhận kết quả từ Gemini.', result);

    return result;
  } finally {
    // Đóng context (giữ lại profile trên ổ đĩa)
    await context.close();
  }
}

export default updateContentWithGemini;
