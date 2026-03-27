/**
 * Download video YouTube sử dụng youtube-dl-exec
 * Xử lý: lấy thông tin video + tải video
 */

import youtubedl from 'youtube-dl-exec';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { detectVideoLang, getLanguageOptions } from './utils/detectLanguage.util.js';

export const VIDEO_MODE = {
  AUDIO: 'audio',
  VIDEO: 'video',
};
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_OUTPUT_DIR = path.join(__dirname, '..', 'downloads');
const INPUT_FILE = path.join(__dirname, '..', 'input.txt');
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
    // metadata: {
    //   id: raw.id,
    //   url: raw.webpage_url || raw.url,
    //   duration: raw.duration,
    //   view_count: raw.view_count,
    //   like_count: raw.like_count,
    //   upload_date: raw.upload_date,
    //   uploader: raw.uploader,
    //   channel_id: raw.channel_id,
    //   channel_url: raw.channel_url,
    //   thumbnail: raw.thumbnail,
    //   categories: raw.categories || [],
    // },
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

  /**
   * Windows / Movies & TV cần H.264 (AVC), không chỉ đuôi .mp4.
   * YouTube có stream MP4 với codec AV1 (av01) — `bestvideo[ext=mp4]` vẫn có thể chọn AV1.
   * Ưu tiên vcodec avc1; cuối cùng dùng format itag 22/18 (mp4 H.264+AAC gộp sẵn).
   */
  const FORMAT_H264_MP4 =
    'bestvideo[vcodec^=avc1]+bestaudio[ext=m4a]/' +
    'bestvideo[vcodec^=avc1]+bestaudio/' +
    'best[vcodec^=avc1][ext=mp4]/' +
    'best[vcodec^=avc1]/' +
    '22/18/' +
    'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best';

  const actualFormat = format === 'best' ? FORMAT_H264_MP4 : format;

  const subprocess = youtubedl.exec(url, {
    output: outputTemplate,
    format: actualFormat,
    mergeOutputFormat: 'mp4', // Yêu cầu ffmpeg gộp vào container mp4
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
 * Pipeline VTT: cleanSrt → SRT → Gemini → ghi SRT + callback title/description/tags (không ghi file meta).
 */
async function processVttTranscriptsWithGemini(url, outputDir, { videoTitle, description, tags, callback }) {
  const { cleanSrt } = await import('./cleanSrt.js');
  const { updateContentWithGemini } = await import('./updateContentWithGemini.js');

  const vttFiles = fs.readdirSync(outputDir).filter(f => f.endsWith('.vtt'));
  for (const file of vttFiles) {
    const vttPath = path.join(outputDir, file);
    cleanSrt(vttPath);
    fs.unlinkSync(vttPath);

    const srtPath = vttPath.replace(/\.vtt$/i, '.srt');
    if (!fs.existsSync(srtPath)) continue;

    const content = fs.readFileSync(srtPath, 'utf8');
    console.log(`Bắt đầu update nội dung SRT bằng Gemini trong cùng một phiên xử lý...`);
    let finalSrt = content;

    try {
      const geminiOut = await updateContentWithGemini(content, {
        title: videoTitle,
        description,
        tags,
      });
      finalSrt = geminiOut.srt;
      if ('title' in geminiOut && typeof callback === 'function') {
        try {
          await Promise.resolve(
            callback({
              url,
              title: geminiOut.title,
              description: geminiOut.description ?? '',
              tags: geminiOut.tags ?? '',
            })
          );
          console.log('✅ Đã gửi title/description/tags (Gemini) qua callback.');
        } catch (cbErr) {
          console.warn('callback:', cbErr.message);
        }
      }
    } catch (err) {
      console.error('Lỗi khi xử lý hàng loạt qua Gemini:', err.message);
    }

    fs.writeFileSync(srtPath, finalSrt.trim() + '\n', 'utf-8');
    console.log(`✅ Đã update SRT qua Gemini cho ${path.basename(srtPath)}`);
  }
}

/**
 * Tải transcript (phụ đề) dạng SRT và/hoặc VTT
 * @param {object} options.subFormat - 'srt' | 'vtt' (mặc định: vtt)
 * @param {string} options.videoTitle - Tiêu đề video để tự detect ngôn ngữ (ja/ko/en)
 * @param {string} [options.description] - Mô tả gốc (dùng cho bước Gemini title/description/tags khi video ngắn)
 * @param {string[]} [options.tags] - Tags gốc từ YouTube
 * @param {(p: { url: string, title: string, description: string, tags: string }) => void | Promise<void>} [options.callback] - Sau khi Gemini trả title/description/tags (video ngắn)
 */
async function downloadTranscript(url, options = {}) {
  const { outputDir = DEFAULT_OUTPUT_DIR, subFormat = 'vtt', videoTitle = '', description = '', tags = [], callback } = options;
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  const outputTemplate = path.join(outputDir, '%(title)s-%(id)s.%(ext)s');
  const targetFormat = subFormat === 'vtt' ? 'vtt' : 'srt';
  const detectedLang = detectVideoLang(videoTitle);
  const langOrder = [detectedLang, ...getLanguageOptions()].filter((l, i, a) => a.indexOf(l) === i);
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

  if (targetFormat === 'vtt') {
    await processVttTranscriptsWithGemini(url, outputDir, { videoTitle, description, tags, callback });
  }

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
 * @param {object} [options]
 * @param {(p: { url: string, title: string, description: string, tags: string }) => void | Promise<void>} [options.callback] - Truyền xuống downloadTranscript (batch: cập nhật progress từ makeVideoFromAudio)
 * @returns {Promise<{title: string} | null>} - Thông tin video nếu thành công, null nếu lỗi
 */
async function downloadSingleVideo(url, options = {}) {
  const { callback, mode = VIDEO_MODE.VIDEO } = options;
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
    console.log('🚀 ~ downloadSingleVideo ~ result:', result);
    if (mode !== VIDEO_MODE.AUDIO) {
      await downloadVideo(url, { outputDir: DEFAULT_OUTPUT_DIR });
    }
    await downloadAudio(url, { outputDir: DEFAULT_OUTPUT_DIR });
    try {
      // await downloadTranscript(url, {
      //   outputDir: DEFAULT_OUTPUT_DIR,
      //   videoTitle: result.title,
      //   description: result.description,
      //   tags: result.tags,
      //   callback,
      // });
    } catch (err) {
      console.warn('Không tải được transcript:', err.message);
    }
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

    let mergedResult = { ...result };
    try {
      // await downloadTranscript(url, {
      //   videoTitle: result.title,
      //   description: result.description,
      //   tags: result.tags,
      //   callback: ({ title, description, tags }) => {
      //     if (title != null && String(title).trim() !== '') mergedResult.title = String(title).trim();
      //     if (description != null) mergedResult.description = description;
      //     if (tags != null) mergedResult.tags = tags;
      //   },
      // });
    } catch (err) {
      console.warn('Không tải được transcript (có thể do 429):', err.message);
    }

    await downloadAudio(url);

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(mergedResult, null, 2), 'utf-8');
    console.log('Đã cập nhật downloads/output.json (title/description/tags từ Gemini qua callback nếu có).');
  } catch (err) {
    console.error('Lỗi:', err.message);
    if (err.stderr) console.error('Chi tiết:', err.stderr);
    process.exit(1);
  }
}

export default downloadVideo;
export { main, getVideoInfo, downloadThumbnail, downloadTranscript, downloadAudio, downloadSingleVideo };
