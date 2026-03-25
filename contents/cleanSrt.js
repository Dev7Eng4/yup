import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DOWNLOADS_DIR = path.join(__dirname, '..', 'downloads');

function cleanSrt(vttPath) {
  console.log('🔄 Đang clean subtitle...');
  let text = fs.readFileSync(vttPath, 'utf8');

  // Bỏ header + timestamp + thẻ HTML
  text = text
    .replace(/^WEBVTT[\s\S]*?\n\n/, '')
    .replace(/align:start position:\d+%/g, '')
    .replace(/<\d{2}:\d{2}:\d{2}\.\d{3}>/g, '')
    .replace(/<\/?c[^>]*>/g, '')
    .replace(/\[.*?\]/g, '') // bỏ [nhạc], [vỗ tay] v.v.
    .replace(/&[a-z]+;/g, '')
    .trim();

  // Chia thành khối (mỗi khối phụ đề)
  const blocks = text
    .split(/\n{2,}/)
    .map(b => b.trim())
    .filter(Boolean);

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

    const subtitleText = lines.join(' ').replace(/\s+/g, ' ').trim();
    const checkedText = lines.join(strBreak).replace(/\s+/g, ' ').trim();

    // Bỏ qua nếu lặp
    // if (!prevLine || prevLine.split(strBreak)[0] !== lines[0]) {
    if (!prevLine || (!prevLine.includes(subtitleText) && !subtitleText.includes(prevLine))) {
      // lấy start / end thô để xử lý sau
      const parts = timeLine.split('-->').map(p => p.trim());
      const rawStart = parts[0];
      const rawEnd = parts[1];
      cleaned.push({ rawStart, rawEnd, text: subtitleText });
      prevLine = subtitleText;
    }
  }

  // Tạo nội dung SRT hợp lệ với logic:
  // item[0].start = item[0].rawStart
  // item[i].start = prev.rawEnd (end của item trước)
  // item[i].end = item[i].rawEnd
  const srt = cleaned
    .map((b, i, arr) => {
      // start: nếu i === 0 thì lấy rawStart, else lấy rawEnd của phần tử trước
      const startRaw = i === 0 ? b.rawStart : arr[i - 1].rawEnd;
      const endRaw = b.rawEnd;

      // Normalize: đổi dấu chấm thành dấu phẩy cho phần giây.milliseconds
      const normalize = t => t.replace(/\./g, ',');

      const start = normalize(startRaw);
      const end = normalize(endRaw);

      return `${i + 1}\n${start} --> ${end}\n${b.text}\n`;
    })
    .join('\n');

  const srtPath = vttPath.replace(/\.vtt$/i, '.srt');
  fs.writeFileSync(srtPath, srt, 'utf-8');
  console.log('✅ Clean subtitle xong:', srtPath);
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
