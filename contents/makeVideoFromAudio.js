/**
 * Tạo video từ audio + video stock
 * - Audio từ folder downloads
 * - N video stock từ backgrounds/<tên> (N = STOCK_VIDEO_COUNT, cat, dog, ...)
 * - Độ dài video = độ dài audio, loop video nếu không đủ
 * - mode: 'single' = xử lý 1 (audio có sẵn trong downloads), 'batch' = đọc CSV, tải từng link rồi xử lý
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const DOWNLOADS_DIR = path.join(ROOT, 'downloads');
const OUTPUT_DIR = path.join(ROOT, 'outputs');

/** Số lượng video stock lấy từ backgrounds (có thể tăng/giảm) */
const STOCK_VIDEO_COUNT = 3;

const DATA_FILE_PATHS = [
  path.join(ROOT, 'channels', 'output.xlsx'),
  path.join(ROOT, 'channels', 'output.csv'),
  path.join(ROOT, 'output.xlsx'),
  path.join(ROOT, 'output.csv'),
];

/**
 * Lấy duration (giây) của file media bằng ffprobe
 */
function getDuration(filePath) {
  const cmd = `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${filePath}"`;
  const result = execSync(cmd, { encoding: 'utf-8' }).trim();
  return parseFloat(result) || 0;
}

/**
 * Lấy file audio đầu tiên từ downloads
 */
function getAudioFile() {
  const files = fs.readdirSync(DOWNLOADS_DIR).filter(f => /\.(mp3|m4a|wav|aac)$/i.test(f));
  if (files.length === 0) throw new Error('Không tìm thấy file audio trong downloads/');
  return path.join(DOWNLOADS_DIR, files[0]);
}

/**
 * Tìm file subtitle (VTT/SRT) khớp với audio trong downloads
 * Ví dụ: audio = xxx-id.mp3 → tìm xxx-id.ja.vtt, xxx-id.en.srt, xxx-id.vtt...
 */
function getSubtitleFile(audioPath) {
  const baseName = path.basename(audioPath, path.extname(audioPath));
  const files = fs.readdirSync(DOWNLOADS_DIR).filter(f => /\.(vtt|srt)$/i.test(f));
  const match = files.find(f => f.startsWith(baseName) && (f.endsWith('.vtt') || f.endsWith('.srt')));
  return match ? path.join(DOWNLOADS_DIR, match) : null;
}

/**
 * Shuffle array (Fisher-Yates)
 */
function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Lấy N video stock ngẫu nhiên từ thư mục background (N = STOCK_VIDEO_COUNT)
 */
function getStockVideos(backgroundsDir) {
  const files = fs.readdirSync(backgroundsDir).filter(f => /\.(mp4|mov|mkv|webm)$/i.test(f));
  if (files.length < STOCK_VIDEO_COUNT) {
    throw new Error(`Cần ít nhất ${STOCK_VIDEO_COUNT} video trong ${backgroundsDir}`);
  }
  const shuffled = shuffleArray(files);
  return shuffled.slice(0, STOCK_VIDEO_COUNT).map(f => path.join(backgroundsDir, f));
}

/**
 * Tạo file concat list cho ffmpeg (lặp các video stock cho đến khi đủ duration)
 */
function createConcatList(videoPaths, targetDuration) {
  let totalDuration = 0;
  const durations = videoPaths.map(p => {
    const d = getDuration(p);
    totalDuration += d;
    return d;
  });

  const concatLines = [];
  let accumulated = 0;
  let idx = 0;

  while (accumulated < targetDuration) {
    const videoPath = videoPaths[idx % videoPaths.length].replace(/\\/g, '/').replace(/'/g, "'\\''");
    concatLines.push(`file '${videoPath}'`);
    accumulated += durations[idx % videoPaths.length];
    idx++;
  }

  return concatLines.join('\n');
}

/**
 * Đọc file Excel/CSV và lấy danh sách URL từ cột Video
 */
async function readVideoUrlsFromFile() {
  const filePath = DATA_FILE_PATHS.find(p => fs.existsSync(p));
  if (!filePath) {
    throw new Error(`Không tìm thấy file output. Cần tạo từ "Lấy thông tin YouTube" trước.`);
  }

  if (filePath.endsWith('.xlsx')) {
    const ExcelJS = (await import('exceljs')).default;
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);
    const sheet = workbook.worksheets[0];
    if (!sheet || sheet.rowCount < 2) throw new Error('File Excel không có dữ liệu.');
    const headerRow = sheet.getRow(1);
    const videoIdx = headerRow.values.findIndex(v => String(v || '').toLowerCase() === 'video');
    if (videoIdx < 0) throw new Error('Không tìm thấy cột Video.');
    const trangThaiIdx = headerRow.values.findIndex(v => String(v || '').toLowerCase().includes('trạng thái'));
    const urls = [];
    for (let i = 2; i <= sheet.rowCount; i++) {
      const row = sheet.getRow(i);
      if (trangThaiIdx >= 0) {
        const trangThai = String(row.getCell(trangThaiIdx).value || '').trim();
        if (trangThai) continue;
      }
      const val = String(row.getCell(videoIdx).value || '').trim();
      if (val && (val.startsWith('http://') || val.startsWith('https://')) && !val.includes('(Không có video)')) {
        urls.push(val);
      }
    }
    return urls;
  }

  const content = fs.readFileSync(filePath, 'utf-8').replace(/^\uFEFF/, '');
  const lines = content.split('\n').filter(l => l.trim());
  if (lines.length < 2) throw new Error('File CSV không có dữ liệu.');
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
  const videoIdx = headers.findIndex(h => h.toLowerCase() === 'video');
  if (videoIdx < 0) throw new Error('Không tìm thấy cột Video trong CSV.');
  const trangThaiIdx = headers.findIndex(h => h.toLowerCase().includes('trạng thái'));
  const urls = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(',').map(c => c.trim().replace(/^"|"$/g, ''));
    if (trangThaiIdx >= 0) {
      const trangThai = (cells[trangThaiIdx] || '').trim();
      if (trangThai) continue;
    }
    const val = cells[videoIdx] || '';
    if (val && (val.startsWith('http://') || val.startsWith('https://')) && !val.includes('(Không có video)')) {
      urls.push(val);
    }
  }
  return urls;
}

/**
 * Xử lý 1: tạo video từ audio có sẵn trong downloads
 */
async function processOne(backgroundName) {
  const backgroundsDir = path.join(ROOT, 'backgrounds', backgroundName);

  if (!fs.existsSync(DOWNLOADS_DIR)) {
    throw new Error('Không tìm thấy folder downloads/');
  }
  if (!fs.existsSync(backgroundsDir)) {
    throw new Error(`Không tìm thấy folder backgrounds/${backgroundName}/`);
  }

  const audioPath = getAudioFile();
  const videoPaths = getStockVideos(backgroundsDir);

  const audioDuration = getDuration(audioPath);
  console.log(`Audio: ${path.basename(audioPath)} (${audioDuration.toFixed(1)}s)`);
  console.log(`Stock videos: ${videoPaths.map(p => path.basename(p)).join(', ')}`);

  const subtitlePath = getSubtitleFile(audioPath);
  if (subtitlePath) {
    console.log(`Subtitle: ${path.basename(subtitlePath)}`);
  }

  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const baseName = path.basename(audioPath, path.extname(audioPath));
  const concatListPath = path.join(OUTPUT_DIR, 'concat_list.txt');
  const tempVideoPath = path.join(OUTPUT_DIR, 'temp_video.mp4');
  const outputPath = path.join(OUTPUT_DIR, `${baseName}-with-bg.mp4`);

  const concatContent = createConcatList(videoPaths, audioDuration);
  fs.writeFileSync(concatListPath, concatContent, 'utf-8');

  console.log('Đang tạo video (concat stock videos)...');
  execSync(`ffmpeg -y -f concat -safe 0 -i "${concatListPath}" -t ${audioDuration} -c copy "${tempVideoPath}"`, { stdio: 'inherit' });

  const tempSubPath = subtitlePath ? path.join(OUTPUT_DIR, 'temp_sub' + path.extname(subtitlePath)) : null;

  const scaleFilter = 'scale=-2:720';
  const videoEncode = '-c:v libx264 -crf 28 -preset medium -c:a aac -b:a 128k';
  if (subtitlePath) {
    fs.copyFileSync(subtitlePath, tempSubPath);
    const subPathEscaped = tempSubPath.replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "'\\''");
    const subFilter = `subtitles='${subPathEscaped}':force_style='FontSize=25,PrimaryColour=&HFFFFFF&,OutlineColour=&H000000&,BorderStyle=1,Alignment=2'`;
    const vf = `${scaleFilter},${subFilter}`;
    console.log('Đang merge video + audio + subtitle (720p, chất lượng trung bình)...');
    execSync(
      `ffmpeg -y -i "${tempVideoPath}" -i "${audioPath}" -vf "${vf}" ${videoEncode} -map 0:v -map 1:a -shortest "${outputPath}"`,
      { stdio: 'inherit' }
    );
    fs.unlinkSync(tempSubPath);
  } else {
    console.log('Đang merge video + audio (720p, chất lượng trung bình)...');
    execSync(
      `ffmpeg -y -i "${tempVideoPath}" -i "${audioPath}" -vf "${scaleFilter}" ${videoEncode} -map 0:v:0 -map 1:a:0 -shortest "${outputPath}"`,
      { stdio: 'inherit' }
    );
  }

  fs.unlinkSync(concatListPath);
  fs.unlinkSync(tempVideoPath);

  console.log(`\nĐã tạo: ${outputPath}`);
}

/**
 * Main: tạo video từ audio + stock videos
 * options.mode: 'single' | 'batch'
 */
async function main(options = {}) {
  const mode = options.mode || 'single';
  const backgroundName = options.background || 'cat';

  if (mode === 'single') {
    if (!fs.existsSync(DOWNLOADS_DIR)) {
      console.error('Không tìm thấy folder downloads/. Cần tải video/audio trước.');
      return;
    }
    const audioFiles = fs.readdirSync(DOWNLOADS_DIR).filter(f => /\.(mp3|m4a|wav|aac)$/i.test(f));
    if (audioFiles.length === 0) {
      console.error('Không có file audio trong downloads/. Cần tải video/audio trước.');
      return;
    }
    await processOne(backgroundName);
    return;
  }

  if (mode === 'batch') {
    const urls = await readVideoUrlsFromFile();
    if (urls.length === 0) {
      throw new Error('Không có link video nào trong CSV.');
    }
    console.log(`Đọc được ${urls.length} link từ CSV. Bắt đầu xử lý tuần tự...\n`);

    const { downloadSingleVideo } = await import('../downloadVideo.js');

    for (let i = 0; i < urls.length; i++) {
      const url = urls[i];
      console.log(`\n[${i + 1}/${urls.length}] ${url}`);
      const result = await downloadSingleVideo(url);
      if (result) {
        try {
          await processOne(backgroundName);
          console.log(`ĐÃ HOÀN THÀNH: ${url}`);
        } catch (err) {
          console.error('Lỗi tạo video:', err.message);
        }
      }
    }
    console.log(`\nHoàn thành xử lý ${urls.length} video.`);
    return;
  }

  throw new Error(`Mode không hợp lệ: ${mode}`);
}

export default main;
