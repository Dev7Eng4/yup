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
      const lines = block.split('\n').map(l => l.trim()).filter(Boolean);
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
