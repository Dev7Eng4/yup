/**
 * Gửi nội dung SRT tới Gemini qua Playwright, nhận kết quả text đã xử lý.
 * KẾT HỢP TUẦN TỰ (dưới 30 phút) VÀ SONG SONG (trên 30 phút).
 */

import { openChromeProfile } from './scripts/makeChromeProfile.js';
import { checkContentSrt, createPromptUpdateShortTranscript } from './promts/updateContent.js';
import { createPromptToCreateSummaryContent, createPromptToCreateMetaInfo } from './promts/createMeta2ch.js';
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
async function runGeminiVideoMetaPrompts(page, { title, srtContent, description, tagsStr }) {
  console.log('\n--- Gemini 2ch: tóm tắt cuốn chiếu (500 cues/lần) → metadata tổng hợp ---');
  await page.waitForTimeout(1500);

  // 1. Tách cues từ srtContent
  const cues = srtContent
    .split(/\n\n+/)
    .map(c => c.trim())
    .filter(Boolean);

  const CHUNK_SIZE_SUMMARY = 500;
  const summaries = [];
  let lastSummary = '「物語の始まり」';
  const totalChunks = Math.ceil(cues.length / CHUNK_SIZE_SUMMARY);

  // 2. Tóm tắt từng phần (iterative summary)
  for (let i = 0; i < cues.length; i += CHUNK_SIZE_SUMMARY) {
    const chunk = cues.slice(i, i + CHUNK_SIZE_SUMMARY).join('\n\n');
    const chunkIndex = Math.floor(i / CHUNK_SIZE_SUMMARY) + 1;

    console.log(`Đang tóm tắt phần ${chunkIndex}/${totalChunks}...`);

    const prompt = createPromptToCreateSummaryContent(chunk, lastSummary);
    const result = await sendPromptToPage(page, prompt, `tóm tắt phần ${chunkIndex}/${totalChunks}`);

    const cleanResult = result.trim();
    summaries.push(cleanResult);
    lastSummary = cleanResult; // Lưu lại để làm context cho phần tiếp theo

    if (i + CHUNK_SIZE_SUMMARY < cues.length) {
      await page.waitForTimeout(2000);
    }
  }

  // 3. Ghép các bản tóm tắt lại thành một summary tổng thể
  const finalSummaryForMeta = summaries.join('\n');
  console.log('\nĐang tạo metadata từ bản tóm tắt tổng hợp...');

  // 4. Tạo metadata tổng hợp từ summary cuối cùng
  const metaRaw = await sendPromptToPage(
    page,
    createPromptToCreateMetaInfo(title, finalSummaryForMeta),
    'metadata video (title, desc, tags)'
  );

  // 5. Parse kết quả
  const titleMatch = metaRaw.match(/【タイトル】\s*([\s\S]*?)(?=\n\n?【|$)/);
  const descMatch = metaRaw.match(/【動画説明文】\s*([\s\S]*?)(?=\n\n?【|$)/);
  const tagsMatch = metaRaw.match(/【タグ】\s*([\s\S]*?)(?=\n\n?【|$)/);

  return {
    title: titleMatch ? titleMatch[1].trim() : title,
    description: descMatch ? descMatch[1].trim() : '',
    tags: tagsMatch ? tagsMatch[1].trim() : '',
  };
}

/**
 * INTERNAL: Xử lý Meta (Title, Description, Tags) trên 1 page có sẵn
 */
async function internalUpdateVideoMeta(page, options = {}) {
  const { title = '', srtContent = '', description = '', tags: tagsOpt = [] } = options;
  const tagsStr = Array.isArray(tagsOpt) ? tagsOpt.join(', ') : String(tagsOpt || '');

  await page.goto(GEMINI_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  const meta = await runGeminiVideoMetaPrompts(page, { title, srtContent, description, tagsStr });
  console.log('🚀 ~ internalUpdateVideoMeta ~ meta:', meta);
  return meta;
}

/**
 * INTERNAL: Xử lý Transcript SRT trên một context có sẵn
 */
async function internalUpdateTranscript(context, initialPage, rawSrtContent, options = {}) {
  const { title = '' } = options;

  // Tách chunk từ file srt gốc
  const cues =
    typeof rawSrtContent === 'string'
      ? rawSrtContent
          .split(/\n\n+/)
          .map(c => c.trim())
          .filter(Boolean)
      : rawSrtContent;

  const durationMin = getSrtDurationInMinutes(cues);
  console.log(`Độ dài video check được qua SRT cuối: ~${durationMin.toFixed(1)} phút`);

  const CHUNK_SIZE = 100;
  const chunks = [];
  for (let i = 0; i < cues.length; i += CHUNK_SIZE) {
    chunks.push(cues.slice(i, i + CHUNK_SIZE).join('\n\n'));
  }

  const totalChunks = chunks.length;
  const finalResults = new Array(totalChunks).fill(null);

  if (durationMin < 30) {
    console.log(`Video < 30 phút, Xử lý TUẦN TỰ trên 1 tab...`);
    await initialPage.goto(GEMINI_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });

    for (let i = 0; i < totalChunks; i++) {
      const chunk = chunks[i];
      let prompt = createPromptUpdateShortTranscript(title, chunk, `phần ${i + 1}/${totalChunks}`);
      const result = await sendPromptToPage(initialPage, prompt, `phần ${i + 1}/${totalChunks}`);
      finalResults[i] = result;
      if (i < totalChunks - 1) await initialPage.waitForTimeout(2000);
    }
  } else {
    const activeConcurrency = Math.min(MAX_CONCURRENT, totalChunks);
    console.log(`Video >= 30 phút, Xử lý ĐỒNG THỜI (${activeConcurrency} tabs song song)...`);

    const pages = [initialPage];
    for (let i = 1; i < activeConcurrency; i++) {
      pages.push(await context.newPage());
    }

    for (let batchStart = 0; batchStart < totalChunks; batchStart += activeConcurrency) {
      const batchPromises = [];
      const batchEnd = Math.min(batchStart + activeConcurrency, totalChunks);
      for (let i = batchStart; i < batchEnd; i++) {
        batchPromises.push(processChunkOnPage(pages[i - batchStart], chunks[i], i, totalChunks));
      }
      const batchResults = await Promise.all(batchPromises);
      for (const res of batchResults) finalResults[res.index] = res.result;
    }
    // Đóng bớt tab phụ của phần transcript
    for (let i = 1; i < pages.length; i++) await pages[i].close();
  }

  // Ghép nối SRT
  let finalSrt = '';
  for (let i = 0; i < chunks.length; i++) {
    const processedChunk = finalResults[i];
    if (processedChunk && processedChunk.trim() !== '') {
      const origBlocks = chunks[i]
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
        if (!isNaN(index) && lines.length >= 3) procMap[index] = lines.slice(2).join('\n');
      }
      const mergedBlocks = [];
      for (const ob of origBlocks) {
        const lines = ob.split('\n');
        const index = parseInt(lines[0].trim(), 10);
        if (!isNaN(index) && lines.length >= 3) {
          if (procMap[index]) lines.splice(2, lines.length - 2, procMap[index]);
        }
        mergedBlocks.push(lines.join('\n'));
      }
      finalSrt += mergedBlocks.join('\n\n') + '\n\n';
    } else {
      finalSrt += chunks[i] + '\n\n';
    }
  }
  return finalSrt.trim();
}

/**
 * Standalone xử lý Meta
 */
export async function updateVideoMetaWithGemini(options = {}) {
  const { context, page } = await openChromeProfile({ visible: true });
  try {
    return await internalUpdateVideoMeta(page, options);
  } finally {
    await context.close();
  }
}

/**
 * Standalone xử lý Transcript
 */
export async function updateTranscriptWithGemini(rawSrtContent, options = {}) {
  const { context, page: initialPage } = await openChromeProfile({ visible: true });
  try {
    return await internalUpdateTranscript(context, initialPage, rawSrtContent, options);
  } finally {
    await context.close();
  }
}

/**
 * Combined function hỗ trợ tham số updateTranscript
 */
export async function updateContentWithGemini(rawSrtContent, options = {}) {
  const { updateTranscript = true } = options;

  console.log('Đang mở Chrome để xử lý Gemini...');
  const { context, page: transcriptPage } = await openChromeProfile({ visible: true });
  const metaPage = await context.newPage();

  try {
    const promises = [];

    // Chạy Transcript nếu yêu cầu
    if (updateTranscript) {
      promises.push(internalUpdateTranscript(context, transcriptPage, rawSrtContent, options));
    } else {
      console.log('Bỏ qua bước xử lý Transcript theo yêu cầu.');
      promises.push(Promise.resolve(rawSrtContent));
      await transcriptPage.close();
    }

    // Luôn chạy Meta
    promises.push(
      internalUpdateVideoMeta(metaPage, {
        ...options,
        srtContent: rawSrtContent,
      })
    );

    const [srtOut, meta] = await Promise.all(promises);

    return {
      srt: srtOut,
      ...meta,
    };
  } finally {
    await context.close();
  }
}
