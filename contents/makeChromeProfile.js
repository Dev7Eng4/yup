/**
 * Tạo / load Chrome profile persistent.
 * Lần đầu: mở Chrome để user đăng nhập Google → session lưu vào chrome-profile/profile1.
 * Các lần sau: load lại profile đã lưu, không cần đăng nhập lại.
 *
 * Cách dùng:
 *   import { getOrCreateProfile } from './makeChromeProfile.js';
 *   const { context, page } = await getOrCreateProfile();
 *   // ... dùng page ...
 *   await context.close();
 */

import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const PROFILE_DIR = path.join(ROOT, 'chrome-profile', 'profile1');

/**
 * Mở Chrome với persistent context (profile lưu trên ổ đĩa).
 * @param {object} [options]
 * @param {boolean} [options.headless=false] - Chạy ẩn browser
 * @param {string}  [options.windowPosition='-2000,-2000'] - Vị trí cửa sổ (mặc định ngoài màn hình)
 * @param {boolean} [options.visible=true] - true = hiển thị bình thường, false = ẩn ngoài màn hình
 * @returns {Promise<{context: import('playwright').BrowserContext, page: import('playwright').Page}>}
 */
export async function getOrCreateProfile(options = {}) {
  const {
    headless = false,
    windowPosition,
    visible = true,
  } = options;

  const args = [
    '--no-sandbox',
    '--disable-blink-features=AutomationControlled',
  ];

  // Nếu không visible → đẩy cửa sổ ra ngoài màn hình
  if (!visible) {
    args.push('--start-minimized');
    args.push(`--window-position=${windowPosition || '-2000,-2000'}`);
  }

  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    channel: 'chrome',        // Dùng Chrome thật (đã cài trên máy)
    headless,
    args,
    viewport: null,           // Để Chrome tự căn chỉnh kích thước
    ignoreDefaultArgs: ['--enable-automation'],  // Bỏ flag automation
  });

  // Lấy page có sẵn hoặc tạo mới
  const page = context.pages().length > 0
    ? context.pages()[0]
    : await context.newPage();

  return { context, page };
}

/**
 * Chạy trực tiếp file này để tạo profile + đăng nhập Google lần đầu.
 * Sau khi đăng nhập xong → đóng browser → session đã được lưu.
 *
 *   node contents/makeChromeProfile.js
 */
async function main() {
  console.log('Đang mở Chrome để tạo profile...');
  console.log(`Profile sẽ lưu tại: ${PROFILE_DIR}`);

  const { context, page } = await getOrCreateProfile({ visible: true });

  // Mở trang đăng nhập Google
  await page.goto('https://accounts.google.com', { waitUntil: 'domcontentloaded' });

  console.log('\n====================================');
  console.log('Hãy đăng nhập Google trong cửa sổ Chrome vừa mở.');
  console.log('Sau khi đăng nhập xong, nhấn Enter ở đây để đóng browser.');
  console.log('====================================\n');

  // Đợi user nhấn Enter
  await new Promise(resolve => {
    process.stdin.resume();
    process.stdin.once('data', () => resolve());
  });

  await context.close();
  console.log('Đã lưu profile. Các lần sau sẽ tự động dùng session này.');
}

// Nếu chạy trực tiếp file này
const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isMain) {
  main().catch(err => {
    console.error(err);
    process.exit(1);
  });
}

export default getOrCreateProfile;
