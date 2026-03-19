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
 * Làm sạch VTT từ YouTube: xóa inline tags <00:00:xx.xxx><c>text</c>, gộp cue trùng lặp
 */
function cleanVtt(content) {
  const lines = content.split('\n');
  const cues = [];
  let i = 0;

  while (i < lines.length) {
    const timeMatch = lines[i].match(/^(\d{2}:\d{2}:\d{2}\.\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}\.\d{3})/);
    if (!timeMatch) {
      i++;
      continue;
    }
    const start = timeMatch[1];
    const end = timeMatch[2];
    i++;
    while (i < lines.length && lines[i].trim() === '') i++;
    const textLines = [];
    while (i < lines.length && lines[i].trim() !== '') {
      let text = lines[i]
        .replace(/<\d{2}:\d{2}:\d{2}\.\d{3}><c>([^<]*)<\/c>/g, '$1')
        .replace(/<[^>]+>/g, '')
        .trim();
      if (text) textLines.push(text);
      i++;
    }
    const text = textLines.join(' ').trim();
    if (text) {
      const toSec = t => {
        const [h, m, s] = t.split(':');
        return parseInt(h, 10) * 3600 + parseInt(m, 10) * 60 + parseFloat(s);
      };
      cues.push({ start, end, text, duration: toSec(end) - toSec(start) });
    }
    i++;
  }

  const merged = [];
  for (const cue of cues) {
    if (cue.duration < 0.02) continue;
    const prev = merged[merged.length - 1];
    if (prev && prev.text === cue.text) {
      prev.end = cue.end;
    } else {
      merged.push({ ...cue });
    }
  }

  let out = 'WEBVTT\n\n';
  for (const c of merged) {
    out += `${c.start} --> ${c.end}\n${c.text}\n\n`;
  }
  return out;
}

/**
 * Chuyển SRT sang VTT (WebVTT)
 * SRT: HH:MM:SS,mmm | VTT: HH:MM:SS.mmm + header WEBVTT
 */
function srtToVtt(srtContent) {
  const lines = srtContent.split('\n');
  const vttLines = ['WEBVTT', ''];
  for (const line of lines) {
    const vttLine = line.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2');
    vttLines.push(vttLine);
  }
  return vttLines.join('\n');
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
 * @param {object} options.subFormat - 'srt' | 'vtt' | 'both' (mặc định: both)
 * @param {string} options.videoTitle - Tiêu đề video để tự detect ngôn ngữ (ja/ko/en)
 */
async function downloadTranscript(url, options = {}) {
  const { outputDir = DEFAULT_OUTPUT_DIR, subFormat = 'both', videoTitle = '' } = options;
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
        writeSub: true,
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

  const srtFiles = fs.readdirSync(outputDir).filter(f => f.endsWith('.srt'));
  for (const file of srtFiles) {
    const srtPath = path.join(outputDir, file);
    const vttPath = srtPath.replace(/\.srt$/i, '.vtt');
    const srtContent = fs.readFileSync(srtPath, 'utf-8');
    const vttContent = cleanVtt(srtToVtt(srtContent));
    fs.writeFileSync(vttPath, vttContent, 'utf-8');
    fs.unlinkSync(srtPath);
    console.log(`Đã làm sạch và chuyển sang VTT: ${file}`);
  }

  const vttFiles = fs.readdirSync(outputDir).filter(f => f.endsWith('.vtt'));
  for (const file of vttFiles) {
    const vttPath = path.join(outputDir, file);
    const content = fs.readFileSync(vttPath, 'utf-8');
    const cleaned = cleanVtt(content);
    if (cleaned !== content) {
      fs.writeFileSync(vttPath, cleaned, 'utf-8');
      console.log(`Đã làm sạch VTT: ${file}`);
    }
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
export { main, getVideoInfo, downloadThumbnail, downloadTranscript, downloadAudio };
