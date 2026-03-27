/**
 * Google Labs Flow — hai chế độ:
 * - remakeThumbnail: ảnh nền không chữ (backgrounds/thumbnail) + thumbnail cũ có chữ (channels/old) + prompt recreate
 * - newImage: chỉ gửi prompt tạo ảnh mới
 *
 * Chạy:
 *   node contents/generateImage.js new
 *   node contents/generateImage.js remake
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { openChromeProfile } from './makeChromeProfile.js';
import { createPromptNewImage, createPromptReCreateThumbnail } from './promts/createImage.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

/** Trang Flow */
export const FLOW_URL = 'https://labs.google/fx/tools/flow';

/** Chế độ tạo ảnh */
export const IMAGE_JOB = {
  REMAKE_THUMBNAIL: 'remakeThumbnail',
  NEW_IMAGE: 'newImage',
};

const IMAGE_EXT = /\.(png|jpe?g|gif|webp)$/i;

/** Ảnh không chữ (nền sạch) */
export const DEFAULT_CLEAN_THUMBNAIL_DIR = path.join(ROOT, 'backgrounds', 'thumbnail');
/** Thumbnail cũ có chữ */
export const DEFAULT_OLD_THUMBNAIL_DIR = path.join(ROOT, 'channels', 'old');

/**
 * Danh sách đường dẫn ảnh trong thư mục, sort theo tên.
 */
export function listImagesInDir(dir) {
  if (!dir || !fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter(f => IMAGE_EXT.test(f))
    .sort((a, b) => a.localeCompare(b))
    .map(f => path.join(dir, f));
}

/**
 * Chọn cặp ảnh remake: Image A = có chữ (old), Image B = không chữ (clean) — theo prompt createImage.
 * @param {object} [o]
 * @param {string} [o.cleanDir]
 * @param {string} [o.oldDir]
 * @param {number} [o.pairIndex=0] - Cặp thứ N (cùng chỉ số trong 2 list sau khi sort)
 * @param {string} [o.cleanImagePath] - Ghi đè file nền sạch
 * @param {string} [o.oldThumbnailPath] - Ghi đè file thumbnail cũ
 */
export function resolveRemakeThumbnailPair(o = {}) {
  const { cleanDir = DEFAULT_CLEAN_THUMBNAIL_DIR, oldDir = DEFAULT_OLD_THUMBNAIL_DIR, pairIndex = 0, cleanImagePath, oldThumbnailPath } = o;

  if (cleanImagePath && oldThumbnailPath) {
    if (!fs.existsSync(cleanImagePath)) throw new Error(`Không có file nền sạch: ${cleanImagePath}`);
    if (!fs.existsSync(oldThumbnailPath)) throw new Error(`Không có file thumbnail cũ: ${oldThumbnailPath}`);
    return { cleanPath: cleanImagePath, oldPath: oldThumbnailPath };
  }

  const cleanList = listImagesInDir(cleanDir);
  const oldList = listImagesInDir(oldDir);

  if (cleanList.length === 0) {
    throw new Error(`Không có ảnh (.png/.jpg/…) trong thư mục nền sạch: ${cleanDir}`);
  }
  if (oldList.length === 0) {
    throw new Error(`Không có ảnh thumbnail cũ trong: ${oldDir}`);
  }
  if (pairIndex < 0 || pairIndex >= Math.min(cleanList.length, oldList.length)) {
    throw new Error(`pairIndex=${pairIndex} không hợp lệ (clean: ${cleanList.length} ảnh, old: ${oldList.length} ảnh).`);
  }

  return {
    cleanPath: cleanList[pairIndex],
    oldPath: oldList[pairIndex],
  };
}

/**
 * Upload một hoặc nhiều file ảnh lên trang (input[type=file]).
 * Thứ tự: phụ thuộc Flow — thường ảnh đầu = reference A, ảnh sau = B.
 */
async function tryUploadImages(page, absolutePaths) {
  if (!absolutePaths.length) return false;
  console.log('Đang kiểm tra ô tải file ảnh (upload)...');
  const inputs = page.locator('input[type="file"]');
  
  let count = 0;
  const start = Date.now();
  while (Date.now() - start < 15000) {
    count = await inputs.count().catch(() => 0);
    if (count > 0) break;
    await page.waitForTimeout(500);
  }

  if (count === 0) {
    console.warn('Không thấy input[type=file] trên Flow sau 15s — hãy kéo thả ảnh thủ công:', absolutePaths);
    return false;
  }
  try {
    if (count === 1) {
      await inputs.first().setInputFiles(absolutePaths.length === 1 ? absolutePaths[0] : absolutePaths);
    } else {
      const n = Math.min(count, absolutePaths.length);
      for (let i = 0; i < n; i++) {
        await inputs.nth(i).setInputFiles(absolutePaths[i]);
      }
    }
    console.log('Đã gửi lệnh upload ảnh vào Flow:', absolutePaths.map(p => path.basename(p)).join(', '));
    
    // CHỜ UPLOAD XONG: Quét các thẻ img xuất hiện trong vùng Editor (không tính logo/avatar)
    console.log(`Đang chờ ${absolutePaths.length} ảnh hiển thị xong trên UI...`);
    const startWait = Date.now();
    while (Date.now() - startWait < 30000) { // Chờ tối đa 30s
      // Tìm các ảnh thumbnail - Google Flow thường dùng img trong các div có nút xóa (aria-label="Remove")
      const uploadedDone = await page.locator('button[aria-label*="Remove" i]').count();
      if (uploadedDone >= absolutePaths.length) {
        console.log(`Đã tải xong ${uploadedDone} ảnh lên giao diện.`);
        break;
      }
      await page.waitForTimeout(1000);
    }
    
    await page.waitForTimeout(1000); // Chờ ổn định React state
    return true;
  } catch (e) {
    console.warn('Lỗi upload file:', e.message);
    return false;
  }
}

async function findPromptInput(page) {
  // Ưu tiên cao nhất cho textarea đặc trưng của prompt Flow
  const candidates = [
    page.locator('textarea[placeholder*="Describe" i]').first(),
    page.locator('textarea[placeholder*="prompt" i]').first(),
    page.locator('textarea[placeholder*="What" i]').first(),
    page.getByPlaceholder(/Describe|prompt|what/i).first(),
    page.locator('[contenteditable="true"]').filter({ hasNot: page.locator('style, script') }).first(),
    page.locator('textarea').filter({ hasNot: page.locator('[readonly]') }).first(),
    page.getByRole('textbox').first(),
    page.locator('div[role="textbox"]').first(),
  ];

  console.log('Đang chờ ô nhập prompt xuất hiện...');
  const start = Date.now();
  while (Date.now() - start < 20000) { // Chờ tối đa 20s
    for (const loc of candidates) {
      try {
        if (await loc.isVisible()) {
          return loc;
        }
      } catch { /* Bỏ qua lỗi locator nếu component đang load */ }
    }
    await page.waitForTimeout(500); // Polling mỗi 0.5s
  }
  return null;
}

async function fillPromptField(locator, text, page) {
  try {
    await locator.click({ timeout: 5000 });
    await page.waitForTimeout(400); // Chờ focus

    // Ưu tiên dùng fill native (kích hoạt đầy đủ các sự kiện input/change cho React)
    await locator.fill(text, { timeout: 2000 });
    await page.waitForTimeout(500);
    return;
  } catch (e) {
    console.log('API fill() thất bại, chuyển sang giả lập phím gõ...', e.message);
  }

  await locator.click({ timeout: 5000 });
  await page.waitForTimeout(300);
  await page.keyboard.press('Control+a');
  await page.waitForTimeout(200);
  await page.keyboard.press('Backspace');
  await page.waitForTimeout(300);
  
  // Dùng API type thay vì insertText, gửi từng keystroke một bảo đảm kích hoạt React states
  await page.keyboard.type(text, { delay: 5 });
  await page.waitForTimeout(800);
}

async function tryClickGenerate(page) {
  console.log('Đang tìm nút Generate/Create/Gửi...');
  const start = Date.now();
  
  // Sắp xếp ưu tiên, sử dụng Regex CỨNG /^...$/ để KHÔNG bị cắn nhầm chữ "Create with Flow"
  const candidates = [
    // Nút có icon là arrow_forward (chính xác như ảnh inspect DOM)
    page.locator('button').filter({ hasText: 'arrow_forward' }).first(),
    page.getByRole('button', { name: /^create$/i }).first(),
    page.getByRole('button', { name: /^generate$/i }).first(),
    page.locator('button[type="submit"]').first(),
    page.getByRole('button', { name: /^run$/i }).first(),
    page.getByRole('button', { name: /^go$/i }).first(),
  ];

  while (Date.now() - start < 15000) {
    for (const btn of candidates) {
      try {
        if (await btn.isVisible()) {
          // Phải đảm bảo nút tạo ảnh KHÔNG CÒN trạng thái disabled sau khi điền text
          const isDisabled = await btn.isDisabled().catch(() => true);
          if (!isDisabled) {
            await btn.click({ timeout: 5000 });
            return true;
          }
        }
      } catch { /* Bỏ qua và kiếm tiếp */ }
    }
    
    await page.waitForTimeout(500);
  }
  return false;
}

/**
 * Chờ load → bấm "Create with Flow" → bấm "New project" để vào màn nhập prompt.
 * Sử dụng cơ chế polling để bắt được thay đổi UI (SPA) ngay khi nó xuất hiện thay vì chờ tĩnh.
 * @returns {Promise<boolean>} true nếu đã bấm được New project (hoặc gần đúng)
 */
async function waitForFlowLoadedAndClickNewProject(page, navigateTimeoutMs) {
  console.log(`Đang mở Flow: ${FLOW_URL}`);
  
  // 1. Chỉ chờ domcontentloaded thay vì load/networkidle để tiết kiệm thời gian, 
  // vì nội dung được tạo bằng JavaScript (SPA)
  await page.goto(FLOW_URL, { waitUntil: 'domcontentloaded', timeout: navigateTimeoutMs });

  console.log('Đã nạp gốc trang, đang chờ các nút "Create with Flow" hoặc "New project" xuất hiện...');

  const createWithFlowLocs = [
    page.getByRole('button', { name: /create with flow/i }).first(),
    page.getByRole('link', { name: /create with flow/i }).first(),
    page.locator('button, a[href], [role="button"]').filter({ hasText: /create with flow/i }).first()
  ];

  const newProjectLocs = [
    page.getByRole('button', { name: /new project/i }).first(),
    page.getByRole('link', { name: /new project/i }).first(),
    page.getByRole('button', { name: /^new project$/i }).first(),
    page.locator('button, a[href], [role="button"]').filter({ hasText: /new project/i }).first()
  ];

  let foundCreate = null;
  let foundNew = null;
  
  const start = Date.now();
  
  // Vòng lặp chờ 1 trong 2 loại nút xuất hiện (tối đa 25s)
  while (Date.now() - start < 25000) {
    for (const loc of createWithFlowLocs) {
      try {
        if (await loc.isVisible()) { foundCreate = loc; break; }
      } catch { /* Bỏ qua nếu đánh giá lỗi */ }
    }
    if (foundCreate) break;
    
    for (const loc of newProjectLocs) {
      try {
        if (await loc.isVisible()) { foundNew = loc; break; }
      } catch { /* Bỏ qua nếu đánh giá lỗi */ }
    }
    if (foundNew) break;
    
    await page.waitForTimeout(500); // Polling thay vì chờ chết
  }

  if (foundCreate) {
    console.log('Đã thấy nút "Create with Flow", tiến hành click...');
    await foundCreate.click({ timeout: 8000 });
    console.log('Đang chờ phần "New project"...');
    
    // Đã click Create with Flow, tiếp tục polling chờ UI update cho New project
    const start2 = Date.now();
    while (Date.now() - start2 < 15000) {
      for (const loc of newProjectLocs) {
        try {
          if (await loc.isVisible()) {
            console.log('Đã thấy nút "New project", tiến hành click...');
            await loc.click({ timeout: 8000 });
            return true;
          }
        } catch { /* Bỏ qua lỗi */ }
      }
      await page.waitForTimeout(500);
    }
    console.warn('Không thấy nút "New project" sau 15s kể từ lúc bấm Create with Flow.');
  } else if (foundNew) {
    console.log('Đã thấy hiển thị sẵn "New project" (bỏ qua Create with Flow), tiến hành click...');
    await foundNew.click({ timeout: 8000 });
    return true;
  } else {
    console.warn('Không tìm thấy "Create with Flow" hoặc "New project" sau 25s. Có thể mạng chậm, UI thay đổi, hoặc đã mở thẳng vào Editor.');
  }

  return false;
}

async function waitForGenerationComplete(page, initialCount) {
  console.log('Đang theo dõi trạng thái tạo ảnh (Tối đa 3 phút)...');
  const start = Date.now();
  const maxWait = 180000; // 3 phút
  
  let hasLoader = false;
  
  while (Date.now() - start < maxWait) {
    // 1. Kiểm tra thanh tải tiến độ (Progressbar / SVG spinners)
    const loaders = await page.locator('[role="progressbar"], svg:has(animateTransform), svg.animate-spin').count();
    if (loaders > 0) {
      hasLoader = true;
    } else if (hasLoader) {
      console.log('Đã mất biểu tượng Loading. Quá trình tạo có vẻ đã xong!');
      await page.waitForTimeout(2000); // Đợi ổn định DOM UI
      return true;
    }

    // 2. Chờ số lượng thẻ hình ảnh (hoặc canvas) tăng lên do sinh ra ảnh mới
    const currentCount = await page.locator('img, canvas, video').count();
    if (currentCount > initialCount) {
      console.log(`Số lượng ảnh/canvas đã tăng lên (${initialCount} -> ${currentCount}). Chắc chắn đã có kết quả!`);
      await page.waitForTimeout(2000); // Đợi ảnh kịp load độ phân giải
      return true;
    }

    // 3. Theo dõi nút Download / Export đặc thù
    const readyBtn = page.locator('button').filter({ hasText: /download|export|save as/i }).first();
    try {
      if (await readyBtn.isVisible()) {
        console.log('Nút Tải xuống đã xuất hiện. Bức ảnh đã hoàn thiện!');
        return true;
      }
    } catch { /* Bỏ qua lỗi locator quá cứng */ }
    
    await page.waitForTimeout(1000); // Quets 1 giây 1 lần
  }
  
  console.log('Đã đạt giới hạn 3 phút nhưng không tìm thấy dấu hiệu kết thúc rõ nét. Vẫn tiếp tục thực thi.');
  return false;
}

// -------------------------------------------------------------
// TẢI ẢNH VỀ MÁY SAU KHI TẠO XONG
// -------------------------------------------------------------
async function downloadGeneratedImage(page) {
  console.log('Đang tiến hành tải ảnh về...');
  try {
    // 1. Click vào ảnh vừa tạo (lấy ảnh cuối cùng trên màn hình)
    console.log('Click chọn ảnh vừa tạo để mở bảng điều khiển...');
    // Thường portal / modal render ở cuối DOM, ưu tiên .last()
    const images = page.locator('img >> visible=true');
    await images.last().click({ timeout: 8000 });
    await page.waitForTimeout(1500); // Chờ giao diện chi tiết bật lên

    // 2. Click nút Download
    console.log('Tìm và click nút Download...');
    // Lấy nút Download cuối cùng (thuộc về popup chi tiết ảnh vừa mở ra)
    const downloadBtn = page.locator('button:has-text("Download"), button[aria-label*="download" i]').locator('visible=true').last();
    
    await downloadBtn.click({ timeout: 8000 });
    await page.waitForTimeout(1500); // Chờ menu tùy chọn xổ ra trong Portal

    // 3. Chọn option "1K Original size" & Bắt sự kiện tải xuống
    console.log('Chọn chất lượng "1K Original size"...');
    // Vấn đề Portal: React giữ lại các text cũ bị ẩn. Dùng >> visible=true để tìm element đang thực sự xổ ra
    const optionItem = page.locator('text=/1K Original|Original size/i >> visible=true').first();

    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 45000 }),
      optionItem.click({ timeout: 8000 })
    ]);

    // 4. Lưu file vể đĩa cứng (thư mục downloads)
    const downloadDir = path.join(ROOT, 'downloads');
    if (!fs.existsSync(downloadDir)) {
      fs.mkdirSync(downloadDir, { recursive: true });
    }
    
    const suggestedFilename = download.suggestedFilename();
    const finalPath = path.join(downloadDir, suggestedFilename);
    const uniquePath = path.join(downloadDir, `${Date.now()}_${suggestedFilename}`);
    
    await download.saveAs(uniquePath);
    console.log(`=> Tải ảnh thành công: ${uniquePath}`);
    return uniquePath;
  } catch (err) {
    console.error('Lỗi trong quá trình thao tác tải ảnh:', err.message);
    return null;
  }
}

/**
 * Mở Flow → Create with Flow → New project → (tuỳ chọn) upload ảnh → điền prompt → Generate.
 */
async function runFlowSession(page, { promptText, imagePaths = [], autoSubmit, navigateTimeoutMs }) {
  await waitForFlowLoadedAndClickNewProject(page, navigateTimeoutMs);

  // Đừng tìm ô prompt vội. 
  // Rất quan trọng: Bấm sang màn hình mới, cần chút độ trễ để SPA dọn dẹp biến số cũ và render DOM Editor.
  console.log('Đang chờ Editor sẵn sàng...');
  await page.waitForTimeout(3000);

  if (imagePaths.length > 0) {
    /** Thứ tự prompt recreate: Image A = có chữ, Image B = nền sạch → [oldPath, cleanPath] */
    await tryUploadImages(page, imagePaths);
    await page.waitForTimeout(1000);
  }

  const input = await findPromptInput(page);
  if (input) {
    console.log('Đã tìm thấy ô nhập prompt, đang điền...');
    await fillPromptField(input, promptText, page);
    console.log('Đã điền prompt (' + promptText.length + ' ký tự).');
  } else {
    console.warn('Không tìm thấy ô prompt — dán thủ công:\n---\n' + promptText + '\n---');
  }

  if (autoSubmit && input) {
    await page.waitForTimeout(800);
    
    // Đếm lượng ảnh gốc trên màn hình trước khi click mũi tên gửi
    const elementsBefore = await page.locator('img, canvas, video').count();
    
    const clicked = await tryClickGenerate(page);
    console.log(clicked ? 'Đã click thành công nút Generate.' : 'Không chộp được nút Generate — Có thể phải bấm tay.');
    
    if (clicked) {
      const isDone = await waitForGenerationComplete(page, elementsBefore);
      if (isDone) {
        await downloadGeneratedImage(page);
      }
    }
  }
}

/**
 * Chỉ prompt text-to-image (không upload ảnh).
 */
export async function runNewImageFlow(options = {}) {
  const {
    prompt: promptOverride,
    promptHint = '',
    visible = true,
    autoSubmit = true,
    navigateTimeoutMs = 90000,
    closeContext = true,
  } = options;

  const promptText = (promptOverride ?? createPromptNewImage(promptHint)).trim();
  const { context, page } = await openChromeProfile({ visible, isLoginRun: false });

  try {
    await runFlowSession(page, { promptText, imagePaths: [], autoSubmit, navigateTimeoutMs });

    if (!closeContext) {
      return { context, page, mode: IMAGE_JOB.NEW_IMAGE, promptText };
    }
    console.log('Tác vụ Generate hoàn tất. Chờ 5s rồi đóng browser...');
    await page.waitForTimeout(5000);
    return { context: null, page: null, mode: IMAGE_JOB.NEW_IMAGE, promptText };
  } finally {
    if (closeContext) await context.close();
  }
}

/**
 * Remake: ảnh cũ có chữ + nền sạch + createPromptReCreateThumbnail.
 */
export async function runRemakeThumbnailFlow(options = {}) {
  const {
    visible = true,
    autoSubmit = true,
    navigateTimeoutMs = 90000,
    closeContext = true,
    prompt: promptOverride,
    cleanDir,
    oldDir,
    pairIndex,
    cleanImagePath,
    oldThumbnailPath,
  } = options;

  const { cleanPath, oldPath } = resolveRemakeThumbnailPair({
    cleanDir,
    oldDir,
    pairIndex,
    cleanImagePath,
    oldThumbnailPath,
  });

  console.log('Remake thumbnail — Image A (có chữ):', path.basename(oldPath));
  console.log('Remake thumbnail — Image B (nền sạch):', path.basename(cleanPath));

  const promptText = (promptOverride ?? createPromptReCreateThumbnail()).trim();
  /** Flow / prompt: A = có chữ, B = nền sạch */
  const imagePaths = [oldPath, cleanPath];

  const { context, page } = await openChromeProfile({ visible, isLoginRun: false });

  try {
    await runFlowSession(page, { promptText, imagePaths, autoSubmit, navigateTimeoutMs });

    if (!closeContext) {
      return { context, page, mode: IMAGE_JOB.REMAKE_THUMBNAIL, promptText, cleanPath, oldPath };
    }
    console.log('Tác vụ Generate hoàn tất. Chờ 5s rồi đóng browser...');
    await page.waitForTimeout(5000);
    return { context: null, page: null, mode: IMAGE_JOB.REMAKE_THUMBNAIL, promptText, cleanPath, oldPath };
  } finally {
    if (closeContext) await context.close();
  }
}

/**
 * @param {object} [options]
 * @param {'remakeThumbnail'|'newImage'} [options.mode='newImage']
 * @param {string} [options.prompt] - Ghi đè prompt (cả hai mode)
 * @param {string} [options.promptHint] - Chỉ mode newImage: gợi ý thêm cho createPromptNewImage
 * — các option khác giống runNewImageFlow / runRemakeThumbnailFlow
 */
export async function generateImageWithFlow(options = {}) {
  const mode = options.mode ?? IMAGE_JOB.NEW_IMAGE;
  if (mode === IMAGE_JOB.REMAKE_THUMBNAIL) {
    return runRemakeThumbnailFlow(options);
  }
  return runNewImageFlow(options);
}

async function main() {
  const arg = (process.argv[2] || 'remake').toLowerCase();
  if (arg === 'remake' || arg === 'remakeThumbnail' || arg === 'remake-thumbnail') {
    await runRemakeThumbnailFlow({ visible: true, closeContext: false });
  } else {
    await runNewImageFlow({ visible: true, closeContext: false });
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isMain) {
  main().catch(err => {
    console.error(err);
    process.exit(1);
  });
}

export default generateImageWithFlow;
