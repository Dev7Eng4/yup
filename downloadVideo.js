/**
 * Download video YouTube sử dụng youtube-dl-exec
 * Xử lý: lấy thông tin video + tải video
 */

import youtubedl from 'youtube-dl-exec';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_OUTPUT_DIR = path.join(__dirname, 'downloads');
const INPUT_FILE = path.join(__dirname, 'input.txt');
const OUTPUT_FILE = path.join(DEFAULT_OUTPUT_DIR, 'output.json');

/**
 * Lấy thông tin video đơn lẻ
 */
async function getVideoInfo(url) {
  const raw = await youtubedl(url, {
    dumpSingleJson: true,
    noCheckCertificates: true,
    noWarnings: true,
    addHeader: ['referer:youtube.com', 'user-agent:googlebot'],
  });

  return {
    type: 'video',
    title: raw.title,
    description: raw.description || '',
    tags: raw.tags || [],
    metadata: {
      id: raw.id,
      url: raw.webpage_url || raw.url,
      duration: raw.duration,
      view_count: raw.view_count,
      like_count: raw.like_count,
      upload_date: raw.upload_date,
      uploader: raw.uploader,
      channel_id: raw.channel_id,
      channel_url: raw.channel_url,
      thumbnail: raw.thumbnail,
      categories: raw.categories || [],
    },
  };
}

/**
 * Download video từ URL
 * @param {string} url - Link video YouTube
 * @param {object} options - Tùy chọn
 * @param {string} options.outputDir - Thư mục lưu file (mặc định: ./downloads)
 * @param {string} options.format - Format video (mặc định: best)
 * @returns {Promise<string>} - Đường dẫn file đã tải
 */
async function downloadVideo(url, options = {}) {
  const { outputDir = DEFAULT_OUTPUT_DIR, format = 'best' } = options;

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const outputTemplate = path.join(outputDir, '%(title)s-%(id)s.%(ext)s');

  console.log('Đang tải video...');

  const subprocess = youtubedl.exec(url, {
    output: outputTemplate,
    format,
    writeThumbnail: true,
    noCheckCertificates: true,
    noWarnings: true,
    addHeader: ['referer:youtube.com', 'user-agent:googlebot'],
  });

  let lastPercent = -1;
  const updateProgress = chunk => {
    const text = chunk.toString();
    const match = text.match(/(\d+\.?\d*)%/);
    if (match) {
      const percent = parseFloat(match[1]);
      if (percent >= 0 && percent <= 100 && Math.floor(percent) !== Math.floor(lastPercent)) {
        lastPercent = percent;
        process.stdout.write(`\rĐang tải: ${percent.toFixed(1)}%`);
      }
    }
  };
  subprocess.stderr?.on('data', updateProgress);
  subprocess.stdout?.on('data', updateProgress);

  await subprocess;
  if (lastPercent >= 0) process.stdout.write('\n');
  console.log('Tải video xong!');
  return outputDir;
}

/**
 * Tải thumbnail
 */
async function downloadThumbnail(url, options = {}) {
  const { outputDir = DEFAULT_OUTPUT_DIR } = options;
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  const outputTemplate = path.join(outputDir, '%(title)s-%(id)s.%(ext)s');
  console.log('Đang tải thumbnail...');
  await youtubedl(url, {
    output: outputTemplate,
    skipDownload: true,
    writeThumbnail: true,
    noCheckCertificates: true,
    noWarnings: true,
    addHeader: ['referer:youtube.com', 'user-agent:googlebot'],
  });
  console.log('Tải thumbnail xong!');
}

/**
 * Phát hiện ngôn ngữ video từ title để chọn phụ đề phù hợp
 * Dựa trên ký tự: Hangul (Hàn), Hiragana/Katakana (Nhật)
 */
function detectSubtitleLang(title) {
  if (!title || typeof title !== 'string') return 'ja';
  const t = title;
  const hasKorean = /[\uAC00-\uD7AF\u3130-\u318F\u1100-\u11FF]/.test(t);
  const hasJapanese = /[\u3040-\u309F\u30A0-\u30FF]/.test(t);
  if (hasKorean && !hasJapanese) return 'ko';
  if (hasJapanese) return 'ja';
  return 'en';
}

/**
 * Tải transcript (phụ đề) dạng SRT và/hoặc VTT
 * @param {object} options.subFormat - 'srt' | 'vtt' (mặc định: vtt)
 * @param {string} options.videoTitle - Tiêu đề video để tự detect ngôn ngữ (ja/ko/en)
 */
async function downloadTranscript(url, options = {}) {
  const { outputDir = DEFAULT_OUTPUT_DIR, subFormat = 'vtt', videoTitle = '' } = options;
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  const outputTemplate = path.join(outputDir, '%(title)s-%(id)s.%(ext)s');
  const targetFormat = subFormat === 'vtt' ? 'vtt' : 'srt';
  const detectedLang = detectSubtitleLang(videoTitle);
  const langOrder = [detectedLang, 'ja', 'ko', 'en', 'vi'].filter((l, i, a) => a.indexOf(l) === i);
  let lastErr = null;

  for (const lang of langOrder) {
    try {
      console.log(`Đang tải transcript (${lang.toUpperCase()}${lang === detectedLang ? ' - detected' : ''})...`);
      await youtubedl(url, {
        output: outputTemplate,
        skipDownload: true,
        writeSub: false,
        writeAutoSub: true,
        convertSubs: targetFormat,
        subLangs: lang,
        sleepSubtitles: 5,
        noCheckCertificates: true,
        noWarnings: true,
        addHeader: ['referer:youtube.com', 'user-agent:googlebot'],
      });
      lastErr = null;
      break;
    } catch (err) {
      lastErr = err;
      console.warn(`Không tải được ${lang}:`, err.message);
    }
  }
  if (lastErr) throw lastErr;

  // // Nếu tải VTT: gọi cleanSrt làm sạch → xuất SRT → xóa file VTT
  // if (targetFormat === 'vtt') {
  //   const { cleanSrt } = await import('./contents/cleanSrt.js');
  //   const vttFiles = fs.readdirSync(outputDir).filter(f => f.endsWith('.vtt'));
  //   for (const file of vttFiles) {
  //     const vttPath = path.join(outputDir, file);
  //     cleanSrt(vttPath);
  //     fs.unlinkSync(vttPath);
  //   }
  // }

  console.log('Tải transcript xong!');
}

/**
 * Tải audio (extract từ video)
 */
async function downloadAudio(url, options = {}) {
  const { outputDir = DEFAULT_OUTPUT_DIR, audioFormat = 'mp3' } = options;
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  const outputTemplate = path.join(outputDir, '%(title)s-%(id)s.%(ext)s');
  console.log('Đang tải audio...');

  const subprocess = youtubedl.exec(url, {
    output: outputTemplate,
    extractAudio: true,
    audioFormat,
    noCheckCertificates: true,
    noWarnings: true,
    addHeader: ['referer:youtube.com', 'user-agent:googlebot'],
  });

  let lastPercent = -1;
  const updateProgress = chunk => {
    const text = chunk.toString();
    const match = text.match(/(\d+\.?\d*)%/);
    if (match) {
      const percent = parseFloat(match[1]);
      if (percent >= 0 && percent <= 100 && Math.floor(percent) !== Math.floor(lastPercent)) {
        lastPercent = percent;
        process.stdout.write(`\rĐang tải audio: ${percent.toFixed(1)}%`);
      }
    }
  };
  subprocess.stderr?.on('data', updateProgress);
  subprocess.stdout?.on('data', updateProgress);

  await subprocess;
  if (lastPercent >= 0) process.stdout.write('\n');
  console.log('Tải audio xong!');
  return outputDir;
}

/**
 * Tải 1 video: video + transcript + audio (dùng cho xử lý batch)
 * @param {string} url - Link YouTube
 * @returns {Promise<{title: string} | null>} - Thông tin video nếu thành công, null nếu lỗi
 */
async function downloadSingleVideo(url) {
  if (!fs.existsSync(DEFAULT_OUTPUT_DIR)) {
    fs.mkdirSync(DEFAULT_OUTPUT_DIR, { recursive: true });
  } else {
    const entries = fs.readdirSync(DEFAULT_OUTPUT_DIR, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(DEFAULT_OUTPUT_DIR, entry.name);
      if (entry.isFile()) {
        fs.unlinkSync(fullPath);
      } else {
        fs.rmSync(fullPath, { recursive: true });
      }
    }
  }

  try {
    const result = await getVideoInfo(url);
    await downloadVideo(url, { outputDir: DEFAULT_OUTPUT_DIR });
    try {
      await downloadTranscript(url, { outputDir: DEFAULT_OUTPUT_DIR, videoTitle: result.title });
    } catch (err) {
      console.warn('Không tải được transcript:', err.message);
    }
    await downloadAudio(url, { outputDir: DEFAULT_OUTPUT_DIR });
    return result;
  } catch (err) {
    console.error(`Lỗi tải ${url}:`, err.message);
    return null;
  }
}

/**
 * Main: đọc input.txt, lấy thông tin video + tải
 */
async function main() {
  if (!fs.existsSync(INPUT_FILE)) {
    console.error('Không tìm thấy file input.txt');
    process.exit(1);
  }

  const content = fs.readFileSync(INPUT_FILE, 'utf-8').trim();
  const lines = content
    .split('\n')
    .map(l => l.trim())
    .filter(l => l && (l.startsWith('http://') || l.startsWith('https://')));

  if (lines.length === 0) {
    console.error('File input.txt không có link hợp lệ.');
    process.exit(1);
  }

  const url = lines[0];
  console.log(`Đang xử lý: ${url}`);

  try {
    if (fs.existsSync(DEFAULT_OUTPUT_DIR)) {
      const entries = fs.readdirSync(DEFAULT_OUTPUT_DIR, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(DEFAULT_OUTPUT_DIR, entry.name);
        if (entry.isFile()) {
          fs.unlinkSync(fullPath);
        } else {
          fs.rmSync(fullPath, { recursive: true });
        }
      }
      console.log('Đã xóa file cũ trong downloads/');
    } else {
      fs.mkdirSync(DEFAULT_OUTPUT_DIR, { recursive: true });
    }

    const result = await getVideoInfo(url);
    const output = JSON.stringify(result, null, 2);
    fs.writeFileSync(OUTPUT_FILE, output, 'utf-8');
    console.log('Đã lưu thông tin vào downloads/output.json');

    await downloadVideo(url);

    try {
      await downloadTranscript(url, { videoTitle: result.title });
    } catch (err) {
      console.warn('Không tải được transcript (có thể do 429):', err.message);
    }

    await downloadAudio(url);
  } catch (err) {
    console.error('Lỗi:', err.message);
    if (err.stderr) console.error('Chi tiết:', err.stderr);
    process.exit(1);
  }
}

export default downloadVideo;
export { main, getVideoInfo, downloadThumbnail, downloadTranscript, downloadAudio, downloadSingleVideo };
