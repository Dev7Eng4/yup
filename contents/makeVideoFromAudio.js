/**
 * Tạo video từ audio + 3 video stock
 * - Audio từ folder downloads
 * - 3 video stock từ backgrounds/<tên> (cat, dog, ...)
 * - Độ dài video = độ dài audio, loop video nếu không đủ
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const DOWNLOADS_DIR = path.join(ROOT, 'downloads');
const OUTPUT_DIR = path.join(ROOT, 'outputs');

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
 * Lấy 3 video stock từ thư mục background
 */
function getStockVideos(backgroundsDir) {
  const files = fs.readdirSync(backgroundsDir).filter(f => /\.(mp4|mov|mkv|webm)$/i.test(f));
  if (files.length < 3) throw new Error(`Cần ít nhất 3 video trong ${backgroundsDir}`);
  return files.slice(0, 3).map(f => path.join(backgroundsDir, f));
}

/**
 * Tạo file concat list cho ffmpeg (lặp 3 video cho đến khi đủ duration)
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
 * Main: tạo video từ audio + stock videos
 */
async function main(options = {}) {
  const backgroundName = options.background || 'cat';
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

main().catch(err => {
  console.error('Lỗi:', err.message);
  process.exit(1);
});

export default main;
