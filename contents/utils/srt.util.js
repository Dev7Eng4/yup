import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DOWNLOADS_DIR = path.join(__dirname, '..', 'downloads');

function cleanSrt(vttPath) {
  console.log('🔄 Đang clean subtitle...');
  let text = fs.readFileSync(vttPath, 'utf8').replace(/\r/g, '');

  // Bỏ header + timestamp + thẻ HTML
  text = text
    .replace(/^WEBVTT[\s\S]*?\n\n/, '')
    .replace(/align:start position:\d+%/g, '')
    // .replace(/<\d{2}:\d{2}:\d{2}\.\d{3}>/g, '')
    // .replace(/<\/?c[^>]*>/g, '')
    .replace(/\[.*?\]/g, '') // bỏ [nhạc], [vỗ tay] v.v.
    .replace(/&[a-z]+;/g, '')
    .trim();
  // console.log('🚀 ~ cleanSrt ~ text:', text);

  // Chia thành khối (mỗi khối phụ đề)
  const blocks = text
    .split(/\n{2,}/)
    .map(b => b.trim())
    .filter(Boolean);
  // console.log('🚀 ~ cleanSrt ~ blocks:', blocks);

  const cleaned = [];
  let prevLine = '';
  const strBreak = '<break>';

  for (const block of blocks) {
    // Tách timestamp + text
    const [timeLine, ...lines] = block
      .split('\n')
      .map(l => l.trim())
      .filter(Boolean);
    if (!timeLine || !timeLine.includes('-->')) continue;

    const subtitleText = lines
      .join(' ')
      .replace(/<\d{2}:\d{2}:\d{2}\.\d{3}>/g, '')
      .replace(/<\/?c[^>]*>/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    const parts = timeLine.split('-->').map(p => p.trim());
    const rawStart = parts[0];
    const rawEnd = parts[1];

    const lastLine = lines[lines.length - 1];

    if (!prevLine) {
      cleaned.push({ rawStart, rawEnd, text: subtitleText });
      prevLine = subtitleText;
      continue;
    }

    if (/<\d{2}:\d{2}:\d{2}\.\d{3}>/.test(lastLine) || /<\/?c[^>]*>/.test(lastLine)) {
      cleaned.push({
        rawStart,
        rawEnd,
        text: lastLine
          .replace(/<\d{2}:\d{2}:\d{2}\.\d{3}>/g, '')
          .replace(/<\/?c[^>]*>/g, '')
          .trim(),
      });
      prevLine = subtitleText;
      continue;
    }

    // Bỏ qua nếu lặp
    // if (!prevLine || prevLine.split(strBreak)[0] !== lines[0]) {
    if (!prevLine.includes(subtitleText) && !subtitleText.includes(prevLine)) {
      cleaned.push({ rawStart, rawEnd, text: subtitleText });
      prevLine = subtitleText;
    }

    cleaned[cleaned.length - 1].rawEnd = rawEnd;
  }

  const srt = cleaned
    .map((b, i, arr) => {
      const normalize = t => t.replace(/\./g, ',');

      const start = normalize(b.rawStart);
      const end = normalize(b.rawEnd);

      return `${i + 1}\n${start} --> ${end}\n${b.text}\n`;
    })
    .join('\n');

  const srtPath = vttPath.replace(/\.vtt$/i, '.srt');
  fs.writeFileSync(srtPath, srt, 'utf-8');
  console.log('✅ Clean subtitle xong:', srtPath);
}

/**
 * Trích xuất phần text thuần từ nội dung SRT (bỏ số thứ tự cue và timeline).
 * Input: chuỗi SRT (có thể là 1 chunk nhiều block cách nhau bằng dòng trống).
 * Output: chuỗi chỉ chứa các dòng thoại, mỗi block cách nhau 1 dòng trống.
 */
export function srtToPlainText(srtContent) {
  if (!srtContent) return '';
  const timelineRe = /^\d{2}:\d{2}:\d{2}[.,]\d{3}\s*-->\s*\d{2}:\d{2}:\d{2}[.,]\d{3}/;

  return srtContent
    .split(/\n\n+/)
    .map(block => {
      const lines = block
        .split('\n')
        .map(l => l.trim())
        .filter(Boolean);
      const textLines = lines.filter(line => {
        if (/^\d+$/.test(line)) return false;
        if (timelineRe.test(line)) return false;
        return true;
      });
      return textLines.join('\n');
    })
    .filter(Boolean)
    .join('\n\n');
}

/**
 * Đọc folder downloads, lấy file VTT và làm sạch → xuất SRT
 */
export default async function runCleanSrt() {
  if (!fs.existsSync(DOWNLOADS_DIR)) {
    console.error('Không tìm thấy thư mục downloads/');
    return;
  }

  const vttFiles = fs.readdirSync(DOWNLOADS_DIR).filter(f => f.endsWith('.vtt'));
  if (vttFiles.length === 0) {
    console.error('Không tìm thấy file .vtt trong downloads/');
    return;
  }

  const vttPath = path.join(DOWNLOADS_DIR, vttFiles[0]);
  cleanSrt(vttPath);
}

export { cleanSrt };
