/**
 * Gửi nội dung SRT tới Gemini qua Puppeteer, nhận kết quả text đã xử lý.
 * Kết nối vào Chrome đang mở (qua remote debugging port) để dùng session Google có sẵn.
 * Nếu Chrome chưa bật debugging, sẽ tự restart Chrome với --remote-debugging-port.
 */

import puppeteer from 'puppeteer';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync, spawn } from 'child_process';
import { updateContentOutro } from '../promts/updateContentOutro.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const GEMINI_URL = 'https://gemini.google.com/app';
const DEBUG_PORT = 9222;

/**
 * Tìm đường dẫn Chrome và user data dir theo OS.
 */
function getChromeInfo() {
  const platform = process.platform;
  if (platform === 'win32') {
    const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
    const userDataDir = `${process.env.LOCALAPPDATA}\\Google\\Chrome\\User Data`;
    return { chromePath, userDataDir };
  }
  if (platform === 'darwin') {
    const home = process.env.HOME || '';
    return {
      chromePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      userDataDir: `${home}/Library/Application Support/Google/Chrome`,
    };
  }
  const home = process.env.HOME || '';
  return {
    chromePath: 'google-chrome',
    userDataDir: `${home}/.config/google-chrome`,
  };
}

/**
 * Thử kết nối tới Chrome qua debugging port.
 * Nếu chưa bật, tắt Chrome hiện tại và mở lại với --remote-debugging-port.
 */
async function connectToChrome() {
  const browserURL = `http://127.0.0.1:${DEBUG_PORT}`;

  // Thử kết nối trước
  try {
    const browser = await puppeteer.connect({ browserURL });
    console.log('Đã kết nối vào Chrome đang chạy.');
    return browser;
  } catch {
    // Chrome chưa bật debugging port — cần restart
  }

  console.log(`Chrome chưa bật debugging port. Đang restart Chrome với --remote-debugging-port=${DEBUG_PORT}...`);
  const { chromePath, userDataDir } = getChromeInfo();

  // Tắt Chrome hiện tại
  try {
    if (process.platform === 'win32') {
      execSync('taskkill /F /IM chrome.exe /T', { stdio: 'ignore' });
    } else {
      execSync('pkill -f chrome', { stdio: 'ignore' });
    }
  } catch { /* Chrome có thể chưa chạy */ }

  // Chờ Chrome tắt hẳn
  await new Promise(r => setTimeout(r, 2000));

  // Mở lại Chrome với debugging port (giữ nguyên user data dir + session login)
  const chromeProcess = spawn(chromePath, [
    `--remote-debugging-port=${DEBUG_PORT}`,
    `--user-data-dir=${userDataDir}`,
    '--restore-last-session',
  ], {
    detached: true,
    stdio: 'ignore',
  });
  chromeProcess.unref();

  // Đợi Chrome khởi động
  console.log('Đang đợi Chrome khởi động...');
  for (let i = 0; i < 15; i++) {
    await new Promise(r => setTimeout(r, 1000));
    try {
      const browser = await puppeteer.connect({ browserURL });
      console.log('Đã kết nối vào Chrome.');
      return browser;
    } catch { /* chưa sẵn sàng */ }
  }

  throw new Error('Không thể kết nối tới Chrome sau 15 giây. Hãy mở Chrome thủ công với flag: --remote-debugging-port=9222');
}

/**
 * Đợi cho đến khi Gemini trả lời xong (không còn loading/streaming).
 */
async function waitForGeminiResponse(page, timeoutMs = 120000) {
  const startTime = Date.now();

  // Đợi response container xuất hiện
  await page.waitForSelector('.model-response-text, .response-content, message-content', {
    timeout: timeoutMs,
  });

  // Đợi cho đến khi streaming xong
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
    await new Promise(r => setTimeout(r, 1000));
  }

  // Chờ thêm 2 giây để chắc chắn response hoàn tất
  await new Promise(r => setTimeout(r, 2000));
}

/**
 * Lấy text kết quả từ response cuối cùng của Gemini.
 */
async function extractGeminiResponse(page) {
  return page.evaluate(() => {
    // Tìm trong toàn bộ page text chứa "Kết quả bạn mong muốn:"
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      if (node.textContent.includes('Kết quả bạn mong muốn:')) {
        // Lấy thẻ cha chứa text này
        const parent = node.parentElement;
        if (!parent) continue;
        // Lấy thẻ kế tiếp (nextElementSibling) — đây là thẻ chứa content
        const nextEl = parent.nextElementSibling;
        if (nextEl) {
          return nextEl.innerText?.trim() || '';
        }
      }
    }
    return '';
  });
}

/**
 * Gửi prompt tới Gemini qua Puppeteer và nhận kết quả.
 * Kết nối vào Chrome đang mở, mở tab mới, gửi prompt, lấy kết quả, đóng tab.
 * @param {string} srtText - Nội dung SRT cần xử lý
 * @returns {Promise<string>} Text đã được Gemini xử lý
 */
export async function updateContentWithGemini(srtText) {
  const prompt = updateContentOutro(srtText);
  console.log('Đang kết nối tới Chrome...');

  const browser = await connectToChrome();
  let page;

  try {
    // Mở tab mới trong Chrome đang chạy
    page = await browser.newPage();
    await page.goto(GEMINI_URL, { waitUntil: 'networkidle2', timeout: 30000 });
    console.log('Đã mở Gemini, đang gửi prompt...');

    // Đợi textarea/input xuất hiện
    const inputSelector = 'div.ql-editor[contenteditable="true"], .ql-editor, rich-textarea .ql-editor';
    await page.waitForSelector(inputSelector, { timeout: 15000 });

    // Focus vào input
    await page.click(inputSelector);
    await new Promise(r => setTimeout(r, 500));

    // Paste nội dung prompt
    await page.evaluate(async (text) => {
      const editor = document.querySelector('div.ql-editor[contenteditable="true"], .ql-editor, rich-textarea .ql-editor');
      if (editor) {
        editor.focus();
        document.execCommand('insertText', false, text);
      }
    }, prompt);

    await new Promise(r => setTimeout(r, 1000));

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
    // Chỉ đóng tab, KHÔNG đóng browser (để user tiếp tục dùng Chrome)
    if (page) await page.close();
  }
}

export default updateContentWithGemini;
