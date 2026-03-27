/**
 * Gửi nội dung SRT tới Gemini qua Playwright, nhận kết quả text đã xử lý.
 * KẾT HỢP TUẦN TỰ (dưới 30 phút) VÀ SONG SONG (trên 30 phút).
 */

import { openChromeProfile } from './makeChromeProfile.js';
import { checkContentSrt, createPromptUpdateShortTranscript } from './promts/updateContent.js';
import {
  createPromptReCreateTitleVideo,
  createPromptReCreateDescriptionVideo,
  createPromptReCreateTagsVideo,
} from './promts/createVideoInfo.js';
import { extractGeminiResponse, waitForGeminiResponse } from './utils/gemini.util.js';

const GEMINI_URL = 'https://gemini.google.com/app';
const MAX_CONCURRENT = 5; // số lượng tối đa 5 browser (tab) đồng thời

/**
 * Láy thời lượng video (tính bằng phút) dựa vào dòng cue SRT cuối cùng
 */
function getSrtDurationInMinutes(cuesArray) {
  if (!cuesArray || cuesArray.length === 0) return 0;
  const lastCue = cuesArray[cuesArray.length - 1];
  const match = lastCue.match(/(\d{2}):(\d{2}):(\d{2})[.,](\d{3})/g);
  if (match && match.length > 0) {
    const timeStr = match[match.length - 1]; // ending time
    const parts = timeStr.split(/[:,.]/);
    const hours = parseInt(parts[0], 10);
    const minutes = parseInt(parts[1], 10);
    const seconds = parseInt(parts[2], 10);
    return hours * 60 + minutes + seconds / 60;
  }
  return 0; // fallback nếu parse lỗi
}

/**
 * Gửi prompt lên giao diện chat hiện tại trên page và trả về kết quả
 */
async function sendPromptToPage(page, prompt, label) {
  const inputSelector = 'div.ql-editor[contenteditable="true"], .ql-editor, rich-textarea .ql-editor';
  await page.waitForSelector(inputSelector, { timeout: 15000 });

  const inputEl = await page.$(inputSelector);
  const inputBbox = await inputEl.boundingBox();
  if (inputBbox) {
    await page.mouse.move(inputBbox.x + inputBbox.width / 2, inputBbox.y + inputBbox.height / 2, { steps: 10 });
    await page.waitForTimeout(100);
    await page.mouse.down();
    await page.waitForTimeout(50);
    await page.mouse.up();
  }
  await page.waitForTimeout(500);

  await page.keyboard.down('Control');
  await page.keyboard.press('A');
  await page.keyboard.up('Control');
  await page.waitForTimeout(100);
  await page.keyboard.press('Backspace');
  await page.waitForTimeout(100);

  await page.keyboard.insertText(prompt);
  await page.waitForTimeout(1000);

  const sendBtnSelector = 'button.send-button, button[aria-label="Send message"], button[data-mat-icon-name="send"]';
  await page.waitForSelector(sendBtnSelector, { timeout: 5000 });
  const sendEl = await page.$(sendBtnSelector);
  const sendBbox = await sendEl.boundingBox();
  if (sendBbox) {
    await page.mouse.move(sendBbox.x + sendBbox.width / 2, sendBbox.y + sendBbox.height / 2, { steps: 10 });
    await page.waitForTimeout(100);
    await page.mouse.down();
    await page.waitForTimeout(50);
    await page.mouse.up();
  }

  console.log(`Đã gửi ${label}, đang đợi Gemini xử lý...`);
  await waitForGeminiResponse(page, 150000);

  const result = await extractGeminiResponse(page);
  console.log(`Đã nhận kết quả từ Gemini cho ${label}.`);
  return result;
}

/**
 * Xử lý 1 đoạn chunk trên 1 trang Playwright riêng biệt.
 * (Dùng cho cơ chế đa tab đồng thời)
 */
async function processChunkOnPage(page, chunk, index, totalChunks) {
  const prompt = checkContentSrt(chunk);
  console.log(`\n--- Đang mở Gemini và gửi prompt phần ${index + 1}/${totalChunks} ---`);

  // Mở trang Gemini thẳng luôn trên tab được giao
  await page.goto(GEMINI_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });

  const result = await sendPromptToPage(page, prompt, `phần ${index + 1}/${totalChunks}`);

  return { index, result };
}

/**
 * Trên cùng một tab Gemini: title → description → tags (createVideoInfo).
 */
async function runGeminiVideoMetaPrompts(page, { title, srtOut, description, tagsStr }) {
  console.log('\n--- Gemini: tiêu đề → mô tả → tags (tuần tự) ---');
  await page.waitForTimeout(1500);

  const newTitle = await sendPromptToPage(page, createPromptReCreateTitleVideo(title, srtOut), 'tiêu đề video (JP)');
  await page.waitForTimeout(1500);

  const newDescription = await sendPromptToPage(
    page,
    createPromptReCreateDescriptionVideo(newTitle.trim(), description),
    'mô tả video (JP)',
  );
  await page.waitForTimeout(1500);

  const newTags = await sendPromptToPage(page, createPromptReCreateTagsVideo(newTitle.trim(), tagsStr), 'tags video (JP)');

  return {
    title: newTitle.trim(),
    description: newDescription.trim(),
    tags: newTags.trim(),
  };
}

/**
 * Gửi prompt tới Gemini và nhận kết quả.
 * Áp dụng logic kép: Tuần tự cho <30 phút và Song song 5 tab cho >=30 phút.
 *
 * Trả về: { srt, title, description, tags } — luôn gọi createVideoInfo sau khi xử lý SRT (mọi độ dài).
 */
export async function updateContentWithGemini(rawSrtContent, options = {}) {
  const { title = '', description = '', tags: tagsOpt = [] } = options;
  const tagsStr = Array.isArray(tagsOpt) ? tagsOpt.join(', ') : String(tagsOpt || '');

  // Tách chunk từ file srt gốc
  const cues =
    typeof rawSrtContent === 'string'
      ? rawSrtContent
          .split(/\n\n+/)
          .map(c => c.trim())
          .filter(Boolean)
      : rawSrtContent;

  // Tính toán thời lượng video dự kiến bằng dòng mốc thời gian của cục srt cuối cùng
  const durationMin = getSrtDurationInMinutes(cues);
  console.log(`Độ dài video check được qua SRT cuối: ~${durationMin.toFixed(1)} phút`);

  const CHUNK_SIZE = 100;
  const chunks = [];
  for (let i = 0; i < cues.length; i += CHUNK_SIZE) {
    chunks.push(cues.slice(i, i + CHUNK_SIZE).join('\n\n'));
  }

  const totalChunks = chunks.length;

  console.log('Đang mở Chrome với profile đã lưu...');
  const { context, page: initialPage } = await openChromeProfile({ visible: true });

  try {
    const finalResults = new Array(totalChunks).fill(null);

    // KỊCH BẢN 1: VIDEO DƯỚI 30 PHÚT -> DÙNG CHUNG 1 TAB THEO KIỂU NỐI TIẾP CHAP
    if (durationMin < 30) {
      console.log(`Video < 30 phút, Xử lý TUẦN TỰ nối tiếp hội thoại trên 1 tab duy nhất...`);
      await initialPage.goto(GEMINI_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });

      for (let i = 0; i < totalChunks; i++) {
        const chunk = chunks[i];
        let prompt = createPromptUpdateShortTranscript(title, chunk, `phần ${i + 1}/${totalChunks}`);

        console.log(`\n--- Đang gửi tuần tự prompt phần ${i + 1}/${totalChunks} ---`);
        const result = await sendPromptToPage(initialPage, prompt, `phần ${i + 1}/${totalChunks}`);
        finalResults[i] = result;

        if (i < totalChunks - 1) {
          await initialPage.waitForTimeout(2000); // nghỉ nhẹ trước khi gửi phần tiếp theo
        }
      }
    }

    // KỊCH BẢN 2: VIDEO TỪ 30 PHÚT TRỞ LÊN -> CHẠY LÔ BATCH PROMISE.ALL TỐI ĐA 5 TAB NHƯ CŨ
    else {
      const activeConcurrency = Math.min(MAX_CONCURRENT, totalChunks);
      console.log(`Video >= 30 phút, Xử lý ĐỒNG THỜI (${activeConcurrency} tabs song song)...`);

      const pages = [initialPage];
      for (let i = 1; i < activeConcurrency; i++) {
        pages.push(await context.newPage());
      }

      for (let batchStart = 0; batchStart < totalChunks; batchStart += activeConcurrency) {
        const batchPromises = [];
        const batchEnd = Math.min(batchStart + activeConcurrency, totalChunks);

        console.log(`\n=== Mở lô xử lý trực tuyến: từ phần ${batchStart + 1} đến ${batchEnd} / ${totalChunks} ===`);

        for (let i = batchStart; i < batchEnd; i++) {
          const pageIndex = i - batchStart;
          const page = pages[pageIndex];
          const chunk = chunks[i];

          // Đẩy promise vào mảng chờ thực thi đồng thời
          batchPromises.push(processChunkOnPage(page, chunk, i, totalChunks));
        }

        // Thực thi đồng thời tiến trình Promise All
        const batchResults = await Promise.all(batchPromises);

        for (const res of batchResults) {
          finalResults[res.index] = res.result;
        }

        console.log(`=== Đã xong lô ${batchStart + 1} đến ${batchEnd}! ===`);
        if (batchEnd < totalChunks) {
          console.log(`Vẫn còn đoạn cần xử lý, tiếp tục phân lô để chờ...`);
          // Bạn có thể chèn lại timeout 10s tại đây nếu cần
          // await new Promise(resolve => setTimeout(resolve, 10000));
        }
      }

      // Đóng bớt tab phụ
      for (let i = 1; i < pages.length; i++) {
        await pages[i].close();
      }
    }

    // MAP THỜI GIAN THEO LÍP KIỂM TRA CHẶT CHẼ
    let finalSrt = '';
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const processedChunk = finalResults[i];

      if (processedChunk && processedChunk.trim() !== '') {
        const origBlocks = chunk
          .split(/\n\n+/)
          .map(b => b.trim())
          .filter(Boolean);
        let procBlocks = processedChunk
          .replace(/```(srt)?/gi, '')
          .split(/\n\n+/)
          .map(b => b.trim())
          .filter(Boolean);

        const procMap = {};
        for (const pb of procBlocks) {
          const lines = pb.split('\n');
          const index = parseInt(lines[0].trim(), 10);
          if (!isNaN(index) && lines.length >= 3) {
            procMap[index] = lines.slice(2).join('\n');
          }
        }

        const mergedBlocks = [];
        const missingIds = [];
        for (const ob of origBlocks) {
          const lines = ob.split('\n');
          const index = parseInt(lines[0].trim(), 10);
          if (!isNaN(index) && lines.length >= 3) {
            if (procMap[index]) {
              lines.splice(2, lines.length - 2, procMap[index]);
            } else {
              missingIds.push(index);
            }
          }
          mergedBlocks.push(lines.join('\n'));
        }
        if (missingIds.length > 0) {
          console.warn(
            `\n⚠️ [Cảnh báo] Lô vừa rồi Gemini đã TRONG CƠN ẢO GIÁC KHÔNG XỬ LÝ các ID sau (đành giữ nguyên văn bản gốc SRT): ${missingIds.join(
              ', '
            )}`
          );
        }
        finalSrt += mergedBlocks.join('\n\n') + '\n\n';
      } else {
        // Bị thiếu hoặc trả về trống → dùng bản gốc
        finalSrt += chunk + '\n\n';
      }
    }

    const srtOut = finalSrt.trim();

    // Sau SRT: luôn gọi title → description → tags trên tab đầu (dù <30 hay ≥30 phút)
    if (durationMin >= 30) {
      console.log(`Video ≥ 30 phút (~${durationMin.toFixed(1)} phút): dùng tab đầu tiên cho bước title/description/tags.`);
      try {
        await initialPage.goto(GEMINI_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
      } catch (e) {
        console.warn('Không thể goto Gemini cho bước meta:', e.message);
      }
      await initialPage.waitForTimeout(1500);
    }

    const meta = await runGeminiVideoMetaPrompts(initialPage, { title, srtOut, description, tagsStr });

    return {
      srt: srtOut,
      ...meta,
    };
  } finally {
    await context.close();
  }
}

export default updateContentWithGemini;
