/**
 * Tạo clip kết: video từ backgrounds/outro + audio + phụ đề trùng N giây cuối (từ SRT/VTT trong downloads).
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync, spawnSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const DOWNLOADS_DIR = path.join(ROOT, 'downloads');
const OUTPUT_DIR = path.join(ROOT, 'outputs');
const OUTRO_BG_DIR = path.join(ROOT, 'backgrounds', 'outro');

const LOGO_PATH = path.join(ROOT, 'logo', 'catLogo.png');
const LOGO_SIZE = 80;
const LOGO_MARGIN_TOP = 20;
const LOGO_MARGIN_RIGHT = 20;

/** Phụ đề outro: góc trên trái, xếp dọc */
const OUTRO_SUB_LEFT = 12;
const OUTRO_SUB_TOP = 12;
const OUTRO_SUB_LINE_HEIGHT = 62;
const OUTRO_SUB_FONT_SIZE = 62;
const OUTRO_SUB_CHAR_SPACING = 2;
/** Karaoke ASS: độ dài mỗi ký tự (centisecond, 1 cs = 10 ms). */
const OUTRO_SUB_KARAOKE_CS = 5;
/**
 * Màu viền (OutlineColour ASS &H00BBGGRR) theo dòng. Dòng 1 đỏ, dòng 2 xanh, rồi lặp lại.
 * Chữ luôn trắng, viền dày 2px.
 */
const OUTRO_SUB_LINE_OUTLINE_COLORS = ['&H000000FF', '&H00D9F50A', '&H000000FF'];

function buildOutroColorStyleLines() {
  return OUTRO_SUB_LINE_OUTLINE_COLORS.map(
    (outlineCol, i) =>
      `Style: OutroC${i},Arial,${OUTRO_SUB_FONT_SIZE},&H00FFFFFF,&HFF000000,${outlineCol},&H80000000,1,0,0,0,100,100,0,0,1,2,0,7,0,0,0,1`
  ).join('\n');
}

function getDuration(filePath) {
  const cmd = `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${filePath}"`;
  const result = execSync(cmd, { encoding: 'utf-8' }).trim();
  return parseFloat(result) || 0;
}

function getAudioDurationSeconds(filePath) {
  const streamCmd = `ffprobe -v error -select_streams a:0 -show_entries stream=duration -of default=noprint_wrappers=1:nokey=1 "${filePath}"`;
  const raw = execSync(streamCmd, { encoding: 'utf-8' }).trim();
  const streamDur = parseFloat(raw);
  if (Number.isFinite(streamDur) && streamDur > 0) return streamDur;
  return getDuration(filePath);
}

function getAudioFile() {
  const files = fs.readdirSync(DOWNLOADS_DIR).filter(f => /\.(mp3|m4a|wav|aac)$/i.test(f));
  if (files.length === 0) throw new Error('Không tìm thấy file audio trong downloads/');
  return path.join(DOWNLOADS_DIR, files[0]);
}

function getSubtitleFile() {
  if (!fs.existsSync(DOWNLOADS_DIR)) return null;
  const names = fs.readdirSync(DOWNLOADS_DIR);
  const srts = names.filter(f => /\.srt$/i.test(f)).sort((a, b) => a.localeCompare(b));
  const vtts = names.filter(f => /\.vtt$/i.test(f)).sort((a, b) => a.localeCompare(b));
  const pick = srts[0] || vtts[0];
  return pick ? path.join(DOWNLOADS_DIR, pick) : null;
}

function parseSrtTimeToMs(tok) {
  const t = String(tok).trim().replace(',', '.');
  const segs = t.split(':');
  if (segs.length === 3) {
    const h = parseInt(segs[0], 10);
    const m = parseInt(segs[1], 10);
    const s = parseFloat(String(segs[2]).replace(',', '.'));
    return Math.round((h * 3600 + m * 60 + s) * 1000);
  }
  if (segs.length === 2) {
    const m = parseInt(segs[0], 10);
    const s = parseFloat(String(segs[1]).replace(',', '.'));
    return Math.round((m * 60 + s) * 1000);
  }
  return 0;
}

/** Thời gian ASS (h:mm:ss.cs) */
function formatAssTime(ms) {
  const x = Math.max(0, Math.round(ms));
  const h = Math.floor(x / 3600000);
  const m = Math.floor((x % 3600000) / 60000);
  const s = Math.floor((x % 60000) / 1000);
  const cs = Math.floor((x % 1000) / 10);
  const pad = n => String(n).padStart(2, '0');
  return `${h}:${pad(m)}:${pad(s)}.${pad(cs)}`;
}

function escapeAssText(text) {
  return String(text).replace(/\\/g, '\\\\').replace(/\n/g, '\\N').replace(/\{/g, '\\{').replace(/\}/g, '\\}');
}

/** Hiện từng ký tự: ẩn hoàn toàn (alpha FF) rồi hiện tức thì (alpha 00) sau delay. */
function buildOutroKaraokeAssText(plainText, csPerChar, charOffset = 0) {
  const chars = Array.from(plainText);
  if (chars.length === 0) return '';
  return chars
    .map((ch, i) => {
      const delayMs = (charOffset + i) * csPerChar * 10;
      const escaped = escapeAssText(ch);
      if (delayMs === 0) return escaped;
      return `{\\alpha&HFF&\\t(${delayMs},${delayMs},\\alpha&H00&)}${escaped}`;
    })
    .join('');
}

function parseSrt(content) {
  const cues = [];
  const text = content.replace(/\r/g, '').replace(/^\uFEFF/, '');
  const blocks = text.split(/\n\n+/);
  for (const block of blocks) {
    const lines = block.trim().split('\n');
    if (lines.length < 2) continue;
    let i = 0;
    if (/^\d+$/.test(lines[0].trim())) i = 1;
    const timeLine = lines[i];
    const m = timeLine.match(
      /(\d{1,2}:\d{2}:\d{2}[,.]\d{3}|\d{1,2}:\d{2}[,.]\d{3})\s*-->\s*(\d{1,2}:\d{2}:\d{2}[,.]\d{3}|\d{1,2}:\d{2}[,.]\d{3})/
    );
    if (!m) continue;
    const startMs = parseSrtTimeToMs(m[1]);
    const endMs = parseSrtTimeToMs(m[2]);
    const cueText = lines
      .slice(i + 1)
      .join('\n')
      .trim();
    cues.push({ startMs, endMs, text: cueText });
  }
  return cues;
}

function parseVtt(content) {
  const cues = [];
  const text = content.replace(/\r/g, '').replace(/^\uFEFF/, '');
  const lines = text.split('\n');
  let i = 0;
  if (lines[0]?.startsWith('WEBVTT')) i = 1;
  for (; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line.startsWith('NOTE') || line.startsWith('STYLE')) continue;
    const m = line.match(/(\d[\d:.]+)\s*-->\s*(\d[\d:.]+)/);
    if (!m) continue;
    const startMs = parseSrtTimeToMs(m[1].replace('.', ','));
    const endMs = parseSrtTimeToMs(m[2].replace('.', ','));
    const textLines = [];
    i++;
    while (i < lines.length && lines[i].trim() !== '') {
      textLines.push(lines[i]);
      i++;
    }
    cues.push({ startMs, endMs, text: textLines.join('\n').trim() });
  }
  return cues;
}

function parseSubtitleFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const raw = fs.readFileSync(filePath, 'utf-8');
  return ext === '.vtt' ? parseVtt(raw) : parseSrt(raw);
}

/**
 * Cues trong cửa sổ cuối → timeline 0..outroDurationMs.
 * Chỉ lấy cue có startTime nghiêm ngặt sau mốc (total - outro), vd. audio 10:22 + outro 20s
 * → mốc 10:02; cue 00:09:58 --> ... bị loại vì start < 10:02.
 * Mỗi dòng: bắt đầu đúng lúc xuất hiện (theo SRT), kết thúc = hết video (giữ đến cuối).
 * Vị trí: top-left, xếp dọc. 
 * Từng cue một được đẩy lên thành 1 hàng với màu riêng biệt thay vì ghép nối lại.
 * Mỗi dòng dùng karaoke ASS (\\k) để lộ từng ký tự; chỉnh OUTRO_SUB_KARAOKE_CS để đổi tốc độ.
 */
function buildOutroAss(cues, totalMs, outroDurationMs) {
  const windowStartMs = Math.max(0, totalMs - outroDurationMs);
  const endStr = formatAssTime(outroDurationMs);
  const inWindow = [];
  for (const c of cues) {
    if (c.startMs <= windowStartMs || c.startMs >= totalMs) continue;
    const ns = Math.max(0, c.startMs - windowStartMs);
    if (ns >= outroDurationMs) continue;
    inWindow.push(c);
  }

  /* Tự xuống dòng nếu text vượt 3/4 video width */
  const MAX_LINE_WIDTH = 1280 * 0.65;
  const estCharWidth = OUTRO_SUB_FONT_SIZE * 0.55 + OUTRO_SUB_CHAR_SPACING;
  const maxCharsPerLine = Math.max(1, Math.floor((MAX_LINE_WIDTH - OUTRO_SUB_LEFT) / estCharWidth));

  const dialogues = [];
  let row = 0;
  let colorIndex = 0;
  
  for (const c of inWindow) {
    const ns = Math.max(0, c.startMs - windowStartMs);
    if (ns >= outroDurationMs) continue;
    
    const startStr = formatAssTime(ns);
    const mergedText = String(c.text).replace(/\r/g, '').replace(/\n/g, '').trim();
    if (!mergedText) continue;

    const chars = Array.from(mergedText);
    const segments = [];
    for (let i = 0; i < chars.length; i += maxCharsPerLine) {
      segments.push(chars.slice(i, i + maxCharsPerLine).join(''));
    }

    const colorStyle = `OutroC${colorIndex % OUTRO_SUB_LINE_OUTLINE_COLORS.length}`;
    let charOffset = 0;
    for (const seg of segments) {
      const y = OUTRO_SUB_TOP + row * OUTRO_SUB_LINE_HEIGHT;
      const text = buildOutroKaraokeAssText(seg, OUTRO_SUB_KARAOKE_CS, charOffset);
      if (!text) continue;
      const tag = `{\\an7\\pos(${OUTRO_SUB_LEFT},${y})\\fs${OUTRO_SUB_FONT_SIZE}\\fsp${OUTRO_SUB_CHAR_SPACING}}`;
      dialogues.push(`Dialogue: 0,${startStr},${endStr},${colorStyle},,0,0,0,,${tag}${text}`);
      charOffset += Array.from(seg).length;
      row++;
    }
    colorIndex++;
  }

  const header = `[Script Info]
Title: Outro
ScriptType: v4.00+
WrapStyle: 0
PlayResX: 1280
PlayResY: 720

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,${OUTRO_SUB_FONT_SIZE},&H00FFFFFF,&HFF000000,&H00000000,&H80000000,1,0,0,0,100,100,0,0,1,0,0,7,0,0,0,1
${buildOutroColorStyleLines()}

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;
  return header + dialogues.join('\n');
}

function stockNormalizeFilterInner() {
  const w = 1280;
  const h = 720;
  const f = 30;
  return `scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2,format=yuv420p,fps=${f},settb=tb=1/90000,setsar=1`;
}

/**
 * Trích raw SRT text từ các cues trong window outro, chỉ lấy nguyên text để tạo chữ chạy trên video.
 */
function extractSrtTextFromWindow(cues, totalMs, outroDurationMs) {
  const windowStartMs = Math.max(0, totalMs - outroDurationMs);
  const filtered = [];
  for (const c of cues) {
    if (c.startMs <= windowStartMs || c.startMs >= totalMs) continue;
    const ns = Math.max(0, c.startMs - windowStartMs);
    if (ns >= outroDurationMs) continue;
    // Lấy text mộc, thay thế lặp chuỗi nếu có ngoặc, etc..
    filtered.push(c.text);
  }
  return filtered.join('\n');
}

/**
 * Build ASS từ text đã xử lý bởi Gemini (mỗi câu 1 dòng).
 * Phân bổ đều thời gian cho các dòng text.
 */
function buildOutroAssFromProcessedText(processedText, outroDurationMs) {
  const lines = processedText.split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length === 0) return null;

  const endStr = formatAssTime(outroDurationMs);
  const timePerLine = outroDurationMs / lines.length;

  /* Tự xuống dòng nếu text vượt 3/4 video width */
  const MAX_LINE_WIDTH = 1280 * 0.65;
  const estCharWidth = OUTRO_SUB_FONT_SIZE * 0.55 + OUTRO_SUB_CHAR_SPACING;
  const maxCharsPerLine = Math.max(1, Math.floor((MAX_LINE_WIDTH - OUTRO_SUB_LEFT) / estCharWidth));

  const dialogues = [];
  let row = 0;

  for (let i = 0; i < lines.length; i++) {
    const startMs = Math.round(i * timePerLine);
    const startStr = formatAssTime(startMs);
    const text = lines[i];
    if (!text) continue;

    const chars = Array.from(text);
    const segments = [];
    for (let j = 0; j < chars.length; j += maxCharsPerLine) {
      segments.push(chars.slice(j, j + maxCharsPerLine).join(''));
    }

    const colorStyle = `OutroC${i % OUTRO_SUB_LINE_OUTLINE_COLORS.length}`;
    let charOffset = 0;
    for (const seg of segments) {
      const y = OUTRO_SUB_TOP + row * OUTRO_SUB_LINE_HEIGHT;
      const karaokeText = buildOutroKaraokeAssText(seg, OUTRO_SUB_KARAOKE_CS, charOffset);
      if (!karaokeText) continue;
      const tag = `{\\an7\\pos(${OUTRO_SUB_LEFT},${y})\\fs${OUTRO_SUB_FONT_SIZE}\\fsp${OUTRO_SUB_CHAR_SPACING}}`;
      dialogues.push(`Dialogue: 0,${startStr},${endStr},${colorStyle},,0,0,0,,${tag}${karaokeText}`);
      charOffset += Array.from(seg).length;
      row++;
    }
  }

  const header = `[Script Info]
Title: Outro
ScriptType: v4.00+
WrapStyle: 0
PlayResX: 1280
PlayResY: 720

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,${OUTRO_SUB_FONT_SIZE},&H00FFFFFF,&HFF000000,&H00000000,&H80000000,1,0,0,0,100,100,0,0,1,0,0,7,0,0,0,1
${buildOutroColorStyleLines()}

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;
  return header + dialogues.join('\n');
}

export default async function main({ outroSeconds, outroFile, mode = 'single' } = {}) {
  if (!fs.existsSync(DOWNLOADS_DIR)) {
    console.error('Không có thư mục downloads/.');
    return;
  }
  if (!fs.existsSync(OUTRO_BG_DIR)) {
    fs.mkdirSync(OUTRO_BG_DIR, { recursive: true });
    console.log('Đã tạo thư mục backgrounds/outro — hãy thêm file video (.mp4, ...) vào đó.');
  }

  const bgFiles = fs.readdirSync(OUTRO_BG_DIR).filter(f => /\.(mp4|mov|mkv|webm)$/i.test(f));
  if (bgFiles.length === 0) {
    console.error('Không có file video trong backgrounds/outro/, bỏ qua tạo outro.');
    return;
  }

  if (outroFile) {
    if (!bgFiles.includes(outroFile)) {
      console.warn(`Không tìm thấy file "${outroFile}" trong backgrounds/outro/. Dùng video đầu tiên: ${bgFiles[0]}`);
      outroFile = bgFiles[0];
    }
  } else {
    if (mode === 'batch') {
      console.warn(`Không chọn video nền outro ở cột Excel, tự động nhận video đầu tiên: ${bgFiles[0]}`);
      outroFile = bgFiles[0];
    } else {
      const inquirer = (await import('inquirer')).default;
      const result = await inquirer.prompt([
        {
          type: 'list',
          name: 'outroFile',
          message: 'Chọn video nền outro:',
          choices: bgFiles.map(f => ({ name: f, value: f })),
        },
      ]);
      outroFile = result.outroFile;
    }
  }

  // Nếu chưa có outroSeconds, hỏi user
  if (!outroSeconds) {
    const { inputSeconds } = await inquirer.prompt([
      {
        type: 'input',
        name: 'inputSeconds',
        message: 'Độ dài outro (giây), ví dụ 14:',
        validate: v => {
          const n = parseFloat(String(v).replace(',', '.'));
          if (!Number.isFinite(n) || n <= 0) return 'Nhập số giây > 0';
          return true;
        },
        filter: v => parseFloat(String(v).replace(',', '.')),
      },
    ]);
    outroSeconds = inputSeconds;
  }

  const outroSec = outroSeconds;
  const outroMs = Math.round(outroSec * 1000);

  const audioPath = getAudioFile();
  const totalAudioSec = getAudioDurationSeconds(audioPath);
  if (outroSec > totalAudioSec + 0.01) {
    console.error(`Outro (${outroSec}s) dài hơn toàn bộ audio (${totalAudioSec.toFixed(1)}s).`);
    return;
  }

  const subPath = getSubtitleFile();
  if (!subPath) {
    console.error('Không tìm thấy file .srt hoặc .vtt trong downloads/.');
    return;
  }

  // === BƯỚC 1: Parse SRT và trích transcript trong window outro ===
  const cues = parseSubtitleFile(subPath);
  const totalMs = Math.round(totalAudioSec * 1000);
  // Lọc ra các dòng chữ nằm trong window outro để log chơi
  const windowStartMs = Math.max(0, totalMs - outroMs);
  const inWindowCues = cues.filter(c => c.startMs > windowStartMs && c.startMs < totalMs);

  if (inWindowCues.length === 0) {
    console.warn('Không có dòng phụ đề nào trong khoảng cuối.');
    return;
  }

  console.log(`Đã trích ${inWindowCues.length} dòng sub nguyên gốc từ ${outroSec}s cuối.`);

  // === BƯỚC 3: Tạo ASS subtitle từ mảng cues nguyên bản (giữ chính xác mốc thời gian xuất hiện theo original SRT) ===
  const assBody = buildOutroAss(cues, totalMs, outroMs);
  if (!assBody || !assBody.includes('Dialogue:')) {
    console.warn('Không tạo được phụ đề ở đoạn outro — vẫn tạo video (không chữ).');
  }

  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const tempSub = path.join(OUTPUT_DIR, 'temp_outro_sub.ass');
  fs.writeFileSync(
    tempSub,
    assBody && assBody.includes('Dialogue:')
      ? assBody
      : `${assBody || ''}Dialogue: 0,0:00:00.00,0:00:00.10,Default,,0,0,0,,{\\an7\\pos(${OUTRO_SUB_LEFT},${OUTRO_SUB_TOP})}.\n`,
    'utf-8'
  );

  // === BƯỚC 4: Tạo video outro bằng ffmpeg (giữ nguyên logic cũ) ===
  const videoIn = path.join(OUTRO_BG_DIR, outroFile);
  const vidDur = getDuration(videoIn);
  const tempVideo = path.join(OUTPUT_DIR, 'temp_outro_video.mp4');

  const vf = stockNormalizeFilterInner();
  if (vidDur < outroSec - 0.05) {
    const r = spawnSync(
      'ffmpeg',
      [
        '-y',
        '-stream_loop',
        '-1',
        '-i',
        videoIn,
        '-vf',
        vf,
        '-t',
        String(outroSec),
        '-an',
        '-c:v',
        'libx264',
        '-crf',
        '23',
        '-preset',
        'medium',
        tempVideo,
      ],
      { stdio: 'inherit', shell: false }
    );
    if (r.status !== 0) throw new Error(`ffmpeg video outro thoát ${r.status}`);
  } else {
    execSync(`ffmpeg -y -i "${videoIn}" -vf "${vf}" -t ${outroSec} -an -c:v libx264 -crf 23 -preset medium "${tempVideo}"`, {
      stdio: 'inherit',
    });
  }

  const subEscaped = tempSub.replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "'\\''");
  const scaleFilter = 'scale=-2:720';
  const BG_OPACITY = 0.6;
  const videoToScale = `color=c=black:s=1280x720:r=30:d=${outroSec}[bg];[0:v]${scaleFilter}[v];[bg][v]blend=all_mode=normal:all_opacity=${BG_OPACITY}[vpadded]`;
  const subFilter = `subtitles='${subEscaped}':charenc=UTF-8`;
  const hasLogo = fs.existsSync(LOGO_PATH);

  const buildLogoOverlay = inputLabel => {
    if (!hasLogo) return inputLabel;
    const r = Math.floor(LOGO_SIZE / 2);
    const geqExpr = `if(lte(hypot(X-W/2,Y-H/2),${r}),255,0)`;
    return `[1:v]scale=${LOGO_SIZE}:${LOGO_SIZE},format=rgba,geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='${geqExpr}'[logo];[${inputLabel}][logo]overlay=main_w-overlay_w-${LOGO_MARGIN_RIGHT}:${LOGO_MARGIN_TOP}[vout]`;
  };

  const baseName = path.basename(audioPath, path.extname(audioPath));
  const outPath = path.join(OUTPUT_DIR, `${baseName}-outro.mp4`);

  let filterComplex;
  if (hasLogo) {
    filterComplex = `${videoToScale};[vpadded]${subFilter}[v2];${buildLogoOverlay('v2')}`;
  } else {
    filterComplex = `${videoToScale};[vpadded]${subFilter}[vout]`;
  }

  const inputs = hasLogo ? `-i "${tempVideo}" -i "${LOGO_PATH}"` : `-i "${tempVideo}"`;

  console.log(`Đang ghép outro (${outroSec}s, phụ đề từ Gemini)...`);
  execSync(
    `ffmpeg -y ${inputs} -filter_complex "${filterComplex}" -map "[vout]" -an -c:v libx264 -crf 28 -preset medium -t ${outroSec} "${outPath}"`,
    { stdio: 'inherit' }
  );

  fs.unlinkSync(tempSub);
  fs.unlinkSync(tempVideo);

  console.log(`\nĐã tạo: ${outPath}`);
}
