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
    // .replace(/<\/?c[^>]*>/g, '')
    .replace(/\[.*?\]/g, '') // bỏ [nhạc], [vỗ tay] v.v.
    .replace(/&[a-z]+;/g, '')
    .trim();

  // Chia thành khối (mỗi khối phụ đề)
  const blocks = text
    .split(/\n{2,}/)
    .map(b => b.trim())
    .filter(Boolean);

  const cleaned = blocks
    .map(block => {
      const [timeLine, ...lines] = block
        .split('\n')
        .map(l => l.trim())
        .filter(Boolean);

      const textContent = lines.join(' ');

      if (!timeLine || !timeLine.includes('-->') || !textContent.trim()) return null;

      const parts = timeLine.split('-->').map(p => p.trim());
      const rawStart = parts[0];
      const rawEnd = parts[1];

      if (block.includes('<c>')) {
        return { rawStart, rawEnd, isTimeLine: true };
      }

      return { rawStart: rawStart, rawEnd: rawEnd, text: textContent };
    })
    .filter(Boolean);

  const srt = cleaned
    .reduce((acc, curr, index, prevArr) => {
      const normalize = t => t.replace(/\./g, ',');

      if (curr?.isTimeLine) {
        const nextItem = prevArr[index + 1];

        if (!nextItem || nextItem.isTimeLine) return acc;

        return [...acc, `${normalize(curr.rawStart)} --> ${normalize(nextItem.rawEnd)}\n${nextItem.text}\n`];
      }

      const prevItem = prevArr[index - 1];

      if (prevItem && prevItem.isTimeLine) return acc;

      return [...acc, `${normalize(curr.rawStart)} --> ${normalize(curr.rawEnd)}\n${curr.text}\n`];
    }, [])
    .join('\n');
  console.log('🚀 ~ cleanSrt ~ srt:', srt);

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
