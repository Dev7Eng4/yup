/**
 * Đọc URL đầu tiên từ input.txt → getVideoInfo → tải transcript (SRT) → Gemini:
 * tóm tắt nội dung (summary) + title, description, tags.
 *
 * Không chỉnh từng dòng phụ đề (khác pipeline VTT + update transcript).
 * Tải VTT rồi `cleanSrt` → SRT (qua `downloadTranscript` + `vttOnlyClean`, không Gemini).
 *
 * Chạy:
 *   node contents/scripts/summaryMetaFromTranscript.js
 *   npm run tom-tat-meta-tu-transcript
 *
 * Kết quả: downloads/meta-from-transcript.json
 *
 * Trước khi chạy: xóa toàn bộ file và thư mục con trong downloads/ để tránh nhầm file cũ.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { getVideoInfo, downloadTranscript } from '../downloadVideo.js';
import { updateVideoMetaWithGemini } from '../updateContentWithGemini.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..', '..');
const INPUT_FILE = path.join(ROOT, 'input.txt');
const DOWNLOADS_DIR = path.join(ROOT, 'downloads');
const OUTPUT_JSON = path.join(DOWNLOADS_DIR, 'meta-from-transcript.json');

function emptyDownloadsDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    return;
  }
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isFile()) {
      fs.unlinkSync(fullPath);
    } else {
      fs.rmSync(fullPath, { recursive: true });
    }
  }
}

function readFirstUrlFromInput() {
  if (!fs.existsSync(INPUT_FILE)) {
    throw new Error(`Không tìm thấy input.txt tại: ${INPUT_FILE}`);
  }
  const lines = fs
    .readFileSync(INPUT_FILE, 'utf-8')
    .split('\n')
    .map(l => l.trim())
    .filter(l => l && (l.startsWith('http://') || l.startsWith('https://')));
  if (!lines.length) {
    throw new Error('input.txt không có dòng URL hợp lệ (http/https).');
  }
  return lines[0];
}

function resolveSrtPath(outputDir, videoId) {
  const srts = fs.readdirSync(outputDir).filter(f => /\.srt$/i.test(f));
  if (!srts.length) return null;
  if (videoId) {
    const byId = srts.find(f => f.includes(videoId));
    if (byId) return path.join(outputDir, byId);
  }
  if (srts.length === 1) return path.join(outputDir, srts[0]);
  const withMtime = srts.map(name => ({
    name,
    mtime: fs.statSync(path.join(outputDir, name)).mtimeMs,
  }));
  withMtime.sort((a, b) => b.mtime - a.mtime);
  console.warn(`Có ${srts.length} file .srt; dùng file mới nhất: ${withMtime[0].name} (nên xóa downloads cũ nếu cần chính xác).`);
  return path.join(outputDir, withMtime[0].name);
}

async function main() {
  const url = readFirstUrlFromInput();
  console.log(`URL: ${url}`);

  console.log('Đang xóa toàn bộ nội dung trong downloads/...');
  emptyDownloadsDir(DOWNLOADS_DIR);

  console.log('Đang lấy thông tin video (getVideoInfo)...');
  const info = await getVideoInfo(url);
  const videoId = info.metadata?.id || '';

  console.log('Đang tải transcript (VTT → cleanSrt → SRT, không pipeline Gemini)...');
  await downloadTranscript(url, {
    subFormat: 'vtt',
    vttOnlyClean: true,
    outputDir: DOWNLOADS_DIR,
    videoTitle: info.title,
  });

  const srtPath = resolveSrtPath(DOWNLOADS_DIR, videoId);
  if (!srtPath || !fs.existsSync(srtPath)) {
    throw new Error('Không tìm thấy file .srt sau khi tải transcript.');
  }

  const srtContent = fs.readFileSync(srtPath, 'utf-8');
  console.log(`Đã đọc: ${path.basename(srtPath)} (${srtContent.length} ký tự)`);

  console.log('Đang mở Gemini: tóm tắt → title, description, tags...');
  const meta = await updateVideoMetaWithGemini({
    title: info.title,
    srtContent,
  });

  const out = {
    url,
    source: {
      title: info.title,
      description: info.description,
      tags: info.tags,
    },
    gemini: {
      title: meta.title,
      description: meta.description,
      tags: meta.tags,
      summary: meta.summary,
    },
    metadata: info.metadata,
    srtPath: path.relative(ROOT, srtPath).replace(/\\/g, '/'),
  };

  fs.writeFileSync(OUTPUT_JSON, JSON.stringify(out, null, 2), 'utf-8');
  console.log(`Đã ghi: ${OUTPUT_JSON}`);
}

main().catch(err => {
  console.error(err.message || err);
  process.exit(1);
});
