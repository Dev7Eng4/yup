/**
 * Gửi nội dung SRT tới Gemini qua Playwright, nhận kết quả text đã xử lý.
 * KẾT HỢP TUẦN TỰ (dưới 30 phút) VÀ SONG SONG (trên 30 phút).
 */

import { openChromeProfile } from './makeChromeProfile.js';
import { checkContentSrt, createPromptUpdateShortTranscript } from './promts/updateContent.js';
import { createPromptSummaryContent, createPromptToMergeSummaryContent, createPromptCreateMetaInfo } from './promts/createVideoInfo.js';
import { extractGeminiResponse, waitForGeminiResponse } from './utils/gemini.util.js';
import { clickElement } from './utils/dom.util.js';
import { GEMINI_CHUNK_SIZE } from './constants/index.js';

const GEMINI_URL = 'https://gemini.google.com/app';
const MAX_CONCURRENT = 2; // số lượng tối đa 5 browser (tab) đồng thời

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
  // const inputSelector = 'div.ql-editor[contenteditable="true"], .ql-editor, rich-textarea .ql-editor';
  // await page.waitForSelector(inputSelector, { timeout: 15000 });

  // await clickElement(
  //   page,
  //   '/html/body/chat-app/main/side-navigation-v2/mat-sidenav-container/mat-sidenav-content/div/div[2]/chat-window/div/input-container/fieldset/input-area-v2/div/div/div[3]/div[1]/bard-mode-switcher/div/button'
  // );
  // await clickElement(page, '/html/body/div[9]/div[2]/div/mat-bottom-sheet-container/div/mat-action-list/div[3]/div/button');
  // await page.keyboard.press('Escape');

  await clickElement(
    page,
    '/html/body/chat-app/main/side-navigation-v2/mat-sidenav-container/mat-sidenav-content/div/div[2]/chat-window/div/input-container/fieldset/input-area-v2/div/div/div[1]/div/div/rich-textarea'
  );

  // const inputEl = await page.$(inputSelector);
  // const inputBbox = await inputEl.boundingBox();
  // if (inputBbox) {
  //   await page.mouse.move(inputBbox.x + inputBbox.width / 2, inputBbox.y + inputBbox.height / 2, { steps: 10 });
  //   await page.waitForTimeout(100);
  //   await page.mouse.down();
  //   await page.waitForTimeout(50);
  //   await page.mouse.up();
  // }
  await page.waitForTimeout(500);

  await page.keyboard.down('Control');
  await page.keyboard.press('A');
  await page.keyboard.up('Control');
  await page.waitForTimeout(100);
  await page.keyboard.press('Backspace');
  await page.waitForTimeout(100);

  await page.keyboard.insertText(prompt);
  await page.waitForTimeout(1000);
  await page.keyboard.press('Enter');

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
 * Trên cùng một tab Gemini: tóm tắt SRT theo chunk (500 cues) → metadata tổng hợp (createVideoInfo.js).
 * Giống luồng updateContentWithGemini2CH.js, prompt từ createPromptSummaryContent / createPromptCreateMetaInfo.
 */
async function runGeminiVideoMetaPrompts(page, { title, srtContent }) {
  console.log('\n--- Gemini: tóm tắt cuốn chiếu (500 cues/lần) → metadata tổng hợp (createVideoInfo) ---');
  await page.waitForTimeout(1500);

  const cues = srtContent
    .split(/\n\n+/)
    .map(c => c.trim())
    .filter(Boolean);

  const summaries = [];
  let lastSummary = '「物語の始まり」';
  const totalChunks = Math.ceil(cues.length / GEMINI_CHUNK_SIZE.SUMMARY_CONTENT) || 1;

  for (let i = 0; i < cues.length; i += GEMINI_CHUNK_SIZE.SUMMARY_CONTENT) {
    const chunk = cues.slice(i, i + GEMINI_CHUNK_SIZE.SUMMARY_CONTENT).join('\n\n');
    const chunkIndex = Math.floor(i / GEMINI_CHUNK_SIZE.SUMMARY_CONTENT) + 1;

    console.log(`Đang tóm tắt phần ${chunkIndex}/${totalChunks}...`);

    const prompt = createPromptSummaryContent(chunk, lastSummary);
    const result = await sendPromptToPage(page, prompt, `tóm tắt phần ${chunkIndex}/${totalChunks}`);

    const cleanResult = result.trim();
    summaries.push(cleanResult);
    lastSummary = cleanResult;

    if (i + GEMINI_CHUNK_SIZE.SUMMARY_CONTENT < cues.length) {
      await page.waitForTimeout(2000);
    }
  }

  let finalSummaryForMeta = summaries.join('\n');

  if (summaries.length >= 2) {
    console.log(`\nCó ${summaries.length} bản tóm tắt, đang gửi prompt merge các bản tóm tắt...`);
    const mergePrompt = createPromptToMergeSummaryContent(finalSummaryForMeta);
    finalSummaryForMeta = await sendPromptToPage(page, mergePrompt, 'merge summaries');
    await page.waitForTimeout(1500);
  }

  console.log('\nĐang tạo metadata từ bản tóm tắt tổng hợp...');

  const metaRaw = await sendPromptToPage(
    page,
    createPromptCreateMetaInfo(title, finalSummaryForMeta),
    'metadata video (title, desc, tags)'
  );

  const titleMatch = metaRaw.match(/【タイトル】\s*([\s\S]*?)(?=\n\n?【|$)/);
  const descMatch = metaRaw.match(/【動画説明文】\s*([\s\S]*?)(?=\n\n?【|$)/);
  const tagsMatch = metaRaw.match(/【タグ】\s*([\s\S]*?)(?=\n\n?【|$)/);

  return {
    title: titleMatch ? titleMatch[1].trim() : title,
    description: descMatch ? descMatch[1].trim() : '',
    tags: tagsMatch ? tagsMatch[1].trim() : '',
    summary: finalSummaryForMeta,
  };
}

/**
 * INTERNAL: Xử lý Meta (Title, Description, Tags) trên 1 page có sẵn
 */
async function internalUpdateVideoMeta(page, options = {}) {
  const { title = '', srtContent = '' } = options;

  await page.goto(GEMINI_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  const meta = await runGeminiVideoMetaPrompts(page, { title, srtContent });
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

  const chunks = [];
  for (let i = 0; i < cues.length; i += GEMINI_CHUNK_SIZE.UPDATE_TRANSCRIPT) {
    chunks.push(cues.slice(i, i + GEMINI_CHUNK_SIZE.UPDATE_TRANSCRIPT).join('\n\n'));
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
