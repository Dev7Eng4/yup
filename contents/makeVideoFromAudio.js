/**
 * Tạo video từ audio + video stock
 * - Audio từ folder downloads
 * - N video stock từ backgrounds/<tên> (N = STOCK_VIDEO_COUNT, cat, dog, ...)
 * - Bước 1: chỉnh tempo audio (ffmpeg atempo; nhỏ hơn 1 = chậm hơn → thời lượng dài hơn)
 * - Độ dài video = độ dài audio (sau khi chỉnh tốc độ), loop video nếu không đủ
 * - Phụ đề: copy file .srt/.vtt từ downloads/ — nếu SPEED ≠ 1 sẽ tự động scale timestamps cho khớp tốc độ audio
 * - Ghép stock: crossfade (xfade) giữa các clip — clip cũ mờ dần, clip mới sáng dần
 * - mode: 'single' = xử lý 1 (audio có sẵn trong downloads), 'batch' = đọc CSV, tải từng link rồi xử lý
 * - batch: 1 ảnh logo kênh trong thư mục chứa CSV/Excel — mọi video batch dùng chung ảnh đó; không có ảnh → LOGO_PATH mặc định
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync, spawnSync } from 'child_process';
import { MAKE_VIDEO_MODE } from './constants/index.js';
import { convertAudioFile } from './convertAudio.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const DOWNLOADS_DIR = path.join(ROOT, 'downloads');
const OUTPUT_DIR = path.join(ROOT, 'outputs');

export const SPEED = 0.91;

/**
 * Số lượng video stock lấy từ backgrounds được tính theo thời lượng audio.
 * - < 25 phút: 15
 * - 25 - 40 phút: 18
 * - 40 - 60 phút: 21
 * - >= 60 phút: 25
 */
function getDynamicStockVideoCount(audioDurationSec) {
  const minutes = audioDurationSec / 60;
  if (minutes < 25) return 15;
  if (minutes < 40) return 18;
  if (minutes < 60) return 21;
  return 25;
}

/** Crossfade giữa các clip stock (giây): clip trước mờ dần, clip sau sáng dần */
const STOCK_CROSSFADE_SEC = 1;

/** Thêm vài giây so với audio khi render stock (dự phòng merge / làm tròn frame). */
const STOCK_RENDER_EXTRA_SEC = 15;

/** Hệ số slow-motion cho video stock. 2.0 = gấp đôi thời lượng (nửa tốc độ). 1.0 = bình thường. */
const STOCK_SLOWMO_FACTOR = 2.0;

/** Canvas chuẩn cho clip stock — xfade bắt buộc cùng kích thước / pixel format */
const STOCK_CANVAS_W = 1280;
const STOCK_CANVAS_H = 720;

/** FPS + timebase thống nhất — xfade yêu cầu timebase khớp (vd 1/15360 vs 1/25000 sẽ lỗi) */
const STOCK_FPS = 30;

/**
 * Chuỗi filter: scale/pad, yuv420p, CFR, settb — dùng cho -vf và cho từng nhánh trước xfade
 */
function stockNormalizeFilterInner() {
  const w = STOCK_CANVAS_W;
  const h = STOCK_CANVAS_H;
  const f = STOCK_FPS;
  // setpts=N*PTS → slow-motion gấp STOCK_SLOWMO_FACTOR lần (vd 2.0 → video 13s thành 26s)
  const slowmo = STOCK_SLOWMO_FACTOR !== 1.0 ? `,setpts=${STOCK_SLOWMO_FACTOR}*PTS` : '';
  return `scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2,format=yuv420p${slowmo},fps=${f},settb=tb=1/90000,setsar=1`;
}

function stockNormalizeFilterChain(inputLabel, outLabel) {
  return `[${inputLabel}]${stockNormalizeFilterInner()}[${outLabel}]`;
}

/**
 * SPEED được dùng làm hệ số atempo cho audio.
 * Nhỏ hơn 1 = đọc chậm hơn → thời lượng dài hơn.
 * Ví dụ 0.91 → ~9.9% dài hơn.
 * Khi SPEED ≠ 1, timestamps trong SRT cũng được scale theo.
 */

/** Logo mặc định (single hoặc batch khi thư mục kênh không có ảnh) — hình tròn góc trên phải */
const LOGO_PATH = path.join(ROOT, 'logo', 'catLogo.png');

/** Ảnh trong thư mục (không đệ quy), sort theo tên — batch: lấy 1 file đầu làm logo kênh */
function getImageFilesFromDir(dir) {
  if (!dir || !fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter(f => /\.(png|jpe?g|gif|webp)$/i.test(f))
    .sort((a, b) => a.localeCompare(b))
    .map(f => path.join(dir, f));
}
const LOGO_SIZE = 80;
const LOGO_MARGIN_TOP = 20;
const LOGO_MARGIN_RIGHT = 20;

/** Khung nền tối phía dưới cho subtitle (full width) */
const SUB_BOX_HEIGHT = 200;
const SUB_BOX_OPACITY = 0.5;

/** Kích thước font chữ của Subtitle */
const SUB_FONT_SIZE = 80;

/** Khoảng cách từ mép trên của dải nền màu đen rơi xuống chữ (padding top) */
const SUB_PADDING_TOP = 15;

/** Paddings margin trái/phải cho subtitle so với viền màn hình video */
const SUB_PADDING_HORIZONTAL = 40;

/** Khoảng cách giữa các ký tự (ASS Spacing, pixel) — tăng nếu chữ vẫn sát */
const SUBTITLE_CHAR_SPACING = 2;

/**
 * Lấy duration (giây) của file media bằng ffprobe
 */
function getDuration(filePath) {
  const cmd = `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${filePath}"`;
  const result = execSync(cmd, { encoding: 'utf-8' }).trim();
  return parseFloat(result) || 0;
}

/**
 * Độ dài luồng audio (giây) — ưu tiên stream a:0, fallback format.duration.
 * Dùng cho file đã qua atempo: mọi chỗ “thời lượng để ghép video” phải gọi trên file đó, không phải MP3 gốc.
 */
function getAudioDurationSeconds(filePath) {
  const streamCmd = `ffprobe -v error -select_streams a:0 -show_entries stream=duration -of default=noprint_wrappers=1:nokey=1 "${filePath}"`;
  const raw = execSync(streamCmd, { encoding: 'utf-8' }).trim();
  const streamDur = parseFloat(raw);
  if (Number.isFinite(streamDur) && streamDur > 0) return streamDur;
  return getDuration(filePath);
}

/** Hiển thị m:ss (vd 13:08) — dùng log so sánh thời lượng */
function formatClockDuration(sec) {
  if (!Number.isFinite(sec) || sec < 0) return '?';
  const s = Math.round(sec);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
}

/**
 * Loại bỏ các ký tự không hợp lệ cho tên file
 */
function sanitizeFilename(name) {
  if (!name) return '';
  return name.replace(/[\\/:*?"<>|]/g, '_').trim();
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
 * Tìm file phụ đề trong downloads: bất kỳ .srt hoặc .vtt nào.
 * Có nhiều file cùng loại → chọn tên sắp xếp alphabet; có cả .srt và .vtt → ưu tiên .srt.
 */
function getSubtitleFile() {
  if (!fs.existsSync(DOWNLOADS_DIR)) return null;
  const names = fs.readdirSync(DOWNLOADS_DIR);
  const srts = names.filter(f => /\.srt$/i.test(f)).sort((a, b) => a.localeCompare(b));
  const vtts = names.filter(f => /\.vtt$/i.test(f)).sort((a, b) => a.localeCompare(b));
  const pick = srts[0] || vtts[0];
  return pick ? path.join(DOWNLOADS_DIR, pick) : null;
}

function getSubtitleFormatLabel(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.srt') return 'SRT';
  if (ext === '.vtt') return 'VTT';
  return ext.slice(1).toUpperCase() || '?';
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
 * Lấy N video stock ngẫu nhiên từ thư mục background
 */
function getStockVideos(backgroundsDir, count) {
  const files = fs.readdirSync(backgroundsDir).filter(f => /\.(mp4|mov|mkv|webm)$/i.test(f));
  if (files.length < count) {
    throw new Error(`Cần ít nhất ${count} video trong ${backgroundsDir}`);
  }
  const shuffled = shuffleArray(files);
  return shuffled.slice(0, count).map(f => path.join(backgroundsDir, f));
}

/**
 * Lặp clip cho đến khi **độ dài sau xfade** (sum − (n−1)×fade) >= requiredXfadeOutputSec.
 * Trước đây chỉ so tổng sum clip → lệch (n−1)×fade (vd ~40 clip × 1s ≈ mất 40s) → cuối video đứng hình.
 */
function buildStockSegmentPlan(videoPaths, requiredXfadeOutputSec) {
  // Nhân duration với STOCK_SLOWMO_FACTOR vì setpts sẽ kéo dài video tương ứng
  const durations = videoPaths.map(p => getDuration(p) * STOCK_SLOWMO_FACTOR);
  const minSegmentDur = Math.min(...durations);
  const fadeEst = Math.max(0.15, Math.min(STOCK_CROSSFADE_SEC, minSegmentDur * 0.45));
  const segments = [];
  let accumulated = 0;
  let idx = 0;
  while (true) {
    const i = idx % videoPaths.length;
    segments.push({ path: videoPaths[i], duration: durations[i] });
    accumulated += durations[i];
    idx++;
    const n = segments.length;
    const xfadeLen = n <= 1 ? accumulated : accumulated - (n - 1) * fadeEst;
    if (xfadeLen >= requiredXfadeOutputSec) break;
  }
  return segments;
}

/**
 * Ghép nhiều clip stock bằng xfade (fade): kết thúc clip trước mờ, clip sau hiện dần.
 * Dùng spawnSync + filter_complex_script để tránh lệnh quá dài trên Windows.
 */
function renderStockVideoWithCrossfades(segments, targetDuration, outputPath, filterScriptPath) {
  if (segments.length === 0) {
    throw new Error('Không có clip stock để ghép.');
  }

  if (segments.length === 1) {
    const vf = stockNormalizeFilterInner();
    const oneDur = segments[0].duration;
    const args = ['-y'];
    if (oneDur < targetDuration - 0.01) {
      args.push('-stream_loop', '-1', '-i', segments[0].path);
    } else {
      args.push('-i', segments[0].path);
    }
    args.push('-vf', vf, '-t', String(targetDuration), '-c:v', 'libx264', '-crf', '23', '-preset', 'medium', '-an', outputPath);
    const r = spawnSync('ffmpeg', args, { stdio: 'inherit', shell: false });
    if (r.error) throw r.error;
    if (r.status !== 0) throw new Error(`ffmpeg thoát mã ${r.status}`);
    return;
  }

  const minDur = Math.min(...segments.map(s => s.duration));
  const fade = Math.max(0.15, Math.min(STOCK_CROSSFADE_SEC, minDur * 0.45));

  const norm = [];
  for (let i = 0; i < segments.length; i++) {
    norm.push(stockNormalizeFilterChain(`${i}:v`, `s${i}`));
  }

  const xfadeParts = [];
  let accLen = segments[0].duration;
  let cur = 's0';

  for (let i = 1; i < segments.length; i++) {
    const offset = accLen - fade;
    if (offset < 0) {
      throw new Error(`Clip quá ngắn so với crossfade (fade=${fade.toFixed(2)}s).`);
    }
    const outTag = i === segments.length - 1 ? 'vout' : `xf${i}`;
    xfadeParts.push(`[${cur}][s${i}]xfade=transition=fade:duration=${fade.toFixed(4)}:offset=${offset.toFixed(4)}[${outTag}]`);
    cur = outTag;
    accLen += segments[i].duration - fade;
  }

  // Phải nối bằng `;` — xuống dòng khiến ffmpeg (đặc biệt trên Windows) parse sai offset/số thập phân
  const fullGraph = [...norm, ...xfadeParts].join(';');
  fs.writeFileSync(filterScriptPath, fullGraph, 'utf-8');

  const args = ['-y'];
  for (const s of segments) {
    args.push('-i', s.path);
  }
  args.push(
    '-filter_complex_script',
    filterScriptPath,
    '-map',
    '[vout]',
    '-t',
    String(targetDuration),
    '-c:v',
    'libx264',
    '-crf',
    '23',
    '-preset',
    'medium',
    '-an',
    outputPath,
  );

  const r = spawnSync('ffmpeg', args, { stdio: 'inherit', shell: false });
  if (r.error) throw r.error;
  if (r.status !== 0) throw new Error(`ffmpeg thoát mã ${r.status}`);
}

/**
 * Tạo bản audio đã chỉnh tempo (atempo=SPEED) — file tạm dùng cho các bước sau.
 * Nếu SPEED == 1.0, chỉ copy / re-encode nhẹ (không thay đổi tốc độ).
 * Nếu SPEED != 1.0, gọi convertAudioFile từ convertAudio.js.
 */
function buildSpeedAdjustedAudio(sourcePath, destPath) {
  const speed = SPEED;
  if (speed === 1) {
    // Không cần chỉnh tốc độ — re-encode sang m4a để đồng nhất format
    console.log('SPEED = 1.0 → giữ nguyên tốc độ audio, chỉ re-encode sang m4a...');
    execSync(`ffmpeg -y -i "${sourcePath}" -c:a aac -b:a 192k "${destPath}"`, { stdio: 'inherit' });
    return;
  }

  // SPEED != 1 → convert audio qua convertAudioFile
  const durBefore = getDuration(sourcePath);
  const expectedAfter = durBefore / speed;
  const pctChange = ((1 / speed - 1) * 100).toFixed(1);
  console.log(
    `Đang chỉnh tốc độ audio (SPEED=${speed}: ${speed < 1 ? 'chậm hơn → dài hơn' : 'nhanh hơn → ngắn hơn'} ~${Math.abs(pctChange)}%; dự kiến ~${formatClockDuration(
      expectedAfter,
    )} / ${expectedAfter.toFixed(1)}s)...`,
  );
  convertAudioFile(sourcePath, destPath, speed);
  const durAfter = getAudioDurationSeconds(destPath);
  console.log(
    `Sau chỉnh tốc độ: ${formatClockDuration(durBefore)} (${durBefore.toFixed(1)}s) → ${formatClockDuration(durAfter)} (${durAfter.toFixed(
      1,
    )}s) | dự kiến ~${expectedAfter.toFixed(1)}s`,
  );
}

/** Parse SRT time "HH:MM:SS,mmm" → tổng milliseconds */
function srtTimeToMs(h, m, s, ms) {
  return Number.parseInt(h) * 3600000 + Number.parseInt(m) * 60000 + Number.parseInt(s) * 1000 + Number.parseInt(ms);
}

/** milliseconds → "HH:MM:SS,mmm" */
function msToSrtTime(totalMs) {
  const ms = Math.round(totalMs);
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const msPart = ms % 1000;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(msPart).padStart(3, '0')}`;
}

/**
 * Scale timestamps trong file SRT theo hệ số speed.
 * Khi SPEED < 1 (chậm hơn), audio dài hơn → timestamps phải giãn ra (nhân 1/speed).
 * Khi SPEED > 1 (nhanh hơn), audio ngắn hơn → timestamps phải co lại (nhân 1/speed).
 * @param {string} srtPath - File SRT gốc
 * @param {string} outputSrtPath - File SRT đã scale
 * @param {number} speed - Tốc độ (vd: 0.91)
 */
function scaleSrtTimestamps(srtPath, outputSrtPath, speed) {
  const content = fs.readFileSync(srtPath, 'utf8');
  // Hệ số scale: duration_new = duration_old / speed
  // → timestamp_new = timestamp_old / speed
  const factor = 1 / speed;

  const timeRe = /(\d{2}):(\d{2}):(\d{2}),(\d{3}) --> (\d{2}):(\d{2}):(\d{2}),(\d{3})/g;
  const scaled = content.replaceAll(timeRe, (match, h1, m1, s1, ms1, h2, m2, s2, ms2) => {
    const startMs = srtTimeToMs(h1, m1, s1, ms1) * factor;
    const endMs = srtTimeToMs(h2, m2, s2, ms2) * factor;
    return `${msToSrtTime(startMs)} --> ${msToSrtTime(endMs)}`;
  });

  fs.writeFileSync(outputSrtPath, scaled, 'utf-8');
  console.log(`Đã scale SRT timestamps (factor=${factor.toFixed(4)}, speed=${speed}): ${path.basename(outputSrtPath)}`);
}

/**
 * Chuyển SRT sang định dạng file ASS với cấu hình Style: Box nền Mờ, dễ đọc.
 * @param {string} srtPath - Đường dẫn file SRT đầu vào
 * @param {string} assPath - Nơi lưu file ASS đầu ra
 */
function convertSrtToAss(srtPath, assPath) {
  const content = fs.readFileSync(srtPath, 'utf8');
  const cues = content.split(/\n\n+/).filter(Boolean);

  // Alignment=8 (Top Center) - chữ sẽ neo ở mép trên và văn bản mọc dần xuống dưới nếu nhiều dòng.
  // MarginV đo từ màn hình xuống mép trên chữ (= H_video - H_box + Padding_Top)
  const marginV = STOCK_CANVAS_H - SUB_BOX_HEIGHT + SUB_PADDING_TOP;

  const header = `[Script Info]
ScriptType: v4.00+
PlayResX: ${STOCK_CANVAS_W}
PlayResY: ${STOCK_CANVAS_H}
WrapStyle: 1

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,${SUB_FONT_SIZE},&H00FFFFFF,&H000000FF,&H00000000,&H00000000,-1,0,0,0,100,100,${SUBTITLE_CHAR_SPACING},0,1,2.0,0,8,${SUB_PADDING_HORIZONTAL},${SUB_PADDING_HORIZONTAL},${marginV},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  let events = '';
  for (const cue of cues) {
    const lines = cue
      .split('\n')
      .map(l => l.trim())
      .filter(Boolean);
    const timeRe = /(\d{2}):(\d{2}):(\d{2}),(\d{3}) \-\-> (\d{2}):(\d{2}):(\d{2}),(\d{3})/;
    let timeLineIdx = -1;
    let match = null;

    for (let i = 0; i < lines.length; i++) {
      match = lines[i].match(timeRe);
      if (match) {
        timeLineIdx = i;
        break;
      }
    }

    if (timeLineIdx === -1 || !match) continue;

    // ASS time format: H:MM:SS.cs (cents của giây) thay vì HH:MM:SS,ms
    const formatTime = (h, m, s, ms) => {
      const cs = Math.floor(parseInt(ms) / 10)
        .toString()
        .padStart(2, '0');
      return `${parseInt(h)}:${m}:${s}.${cs}`;
    };

    const start = formatTime(match[1], match[2], match[3], match[4]);
    const end = formatTime(match[5], match[6], match[7], match[8]);

    const textLines = lines.slice(timeLineIdx + 1);

    // Tính toán số lượng kí tự tối đa trên 1 dòng để tự động quấn dòng (Word Wrap Programmatic cho chữ CJK)
    const cw = STOCK_CANVAS_W - SUB_PADDING_HORIZONTAL * 2;
    const cSize = SUB_FONT_SIZE + SUBTITLE_CHAR_SPACING;
    const maxCharsPerLine = Math.max(1, Math.floor(cw / cSize));

    const wrappedLines = [];
    for (const rawLine of textLines) {
      let currentLine = '';
      // dùng Array.from để tách an toàn cả unicode emoji nếu có
      for (const char of Array.from(rawLine)) {
        if (currentLine.length >= maxCharsPerLine) {
          wrappedLines.push(currentLine);
          currentLine = '';
        }
        currentLine += char;
      }
      if (currentLine) wrappedLines.push(currentLine);
    }

    const text = wrappedLines.join('\\N'); // \\N là kí tự xuống dòng trong ass

    events += `Dialogue: 0,${start},${end},Default,,0,0,0,,${text}\n`;
  }

  fs.writeFileSync(assPath, header + events, 'utf-8');
}

/**
 * Xử lý 1: tạo video từ audio có sẵn trong downloads
 * @param {string} bgNameArg - Tên background
 * @param {object} [options] - Tùy chọn
 * @param {string} [options.logoPath] - Batch: đường dẫn logo kênh
 * @param {string} [options.perVideoDir] - Batch: thư mục xuất của riêng video này
 * @param {string} [options.originalTitle] - Tiêu đề gốc YouTube
 * @param {string} [options.description] - Mô tả gốc
 * @param {string} [options.tags] - Tags gốc
 * @param {string} [options.url] - URL video (dùng cho lookup geminiByUrl)
 * @param {object} [options.geminiByUrl] - Map chứa metadata từ Gemini
 */
async function processOne(bgNameArg, options = {}) {
  const { perVideoDir, originalTitle, description, tags, url, geminiByUrl } = options;
  let backgroundName = bgNameArg || 'cat';
  let backgroundsDir = path.join(ROOT, 'backgrounds', backgroundName);

  if (!fs.existsSync(backgroundsDir)) {
    console.warn(`Không tìm thấy folder backgrounds/${backgroundName}/, sử dụng default là "cat"`);
    backgroundName = 'cat';
    backgroundsDir = path.join(ROOT, 'backgrounds', backgroundName);
  }

  if (!fs.existsSync(DOWNLOADS_DIR)) {
    throw new Error('Không tìm thấy folder downloads/');
  }
  if (!fs.existsSync(backgroundsDir)) {
    throw new Error(`Không tìm thấy folder backgrounds/${backgroundName}/`);
  }

  const audioPath = getAudioFile();

  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  // 1. Chỉnh tốc độ audio trước để có thời lượng chính xác
  const slowedAudioPath = path.join(OUTPUT_DIR, `temp_audio_speed${Math.round(SPEED * 100)}.m4a`);
  buildSpeedAdjustedAudio(audioPath, slowedAudioPath);
  const workingAudioPath = slowedAudioPath;

  /** Luôn đo trên file đã chỉnh tốc độ (m4a tạm), không dùng độ dài MP3 gốc */
  const audioDurationAfterTempo = getAudioDurationSeconds(workingAudioPath);
  console.log(
    `Thời lượng audio sau SPEED=${SPEED} (dùng cho stock + merge): ${formatClockDuration(
      audioDurationAfterTempo,
    )} (${audioDurationAfterTempo.toFixed(1)}s) — ${path.basename(workingAudioPath)}`,
  );

  // 2. Lấy video stock dựa trên thời lượng MỚI
  const stockVideoCount = getDynamicStockVideoCount(audioDurationAfterTempo);
  const videoPaths = getStockVideos(backgroundsDir, stockVideoCount);
  console.log(`Stock videos (${stockVideoCount} clip): ${videoPaths.map(p => path.basename(p)).join(', ')}`);

  // 3. Xử lý phụ đề (scale timestamps nếu SPEED != 1)
  let subtitlePath = getSubtitleFile();
  let scaledSrtPath = null;
  if (subtitlePath && SPEED !== 1) {
    scaledSrtPath = path.join(OUTPUT_DIR, 'temp_scaled_sub' + path.extname(subtitlePath));
    scaleSrtTimestamps(subtitlePath, scaledSrtPath, SPEED);
    subtitlePath = scaledSrtPath; // Dùng file SRT đã scale
    console.log(`Phụ đề (đã scale theo SPEED=${SPEED}): ${path.basename(scaledSrtPath)}`);
  } else if (subtitlePath) {
    console.log(`Phụ đề: ${path.basename(subtitlePath)}`);
  }

  const baseName = originalTitle ? sanitizeFilename(originalTitle) : path.basename(audioPath, path.extname(audioPath));
  const xfadeFilterPath = path.join(OUTPUT_DIR, 'xfade_stock.txt');
  const tempVideoPath = path.join(OUTPUT_DIR, 'temp_video.mp4');
  const outputPath = path.join(OUTPUT_DIR, `${baseName}-with-bg.mp4`);

  const stockRenderTarget = audioDurationAfterTempo + STOCK_RENDER_EXTRA_SEC;
  const stockSegments = buildStockSegmentPlan(videoPaths, stockRenderTarget);
  if (stockSegments.length > 1) {
    const minSegDur = Math.min(...stockSegments.map(s => s.duration));
    const fadeHint = Math.max(0.15, Math.min(STOCK_CROSSFADE_SEC, minSegDur * 0.45));
    console.log(
      `Đang tạo nền stock (${stockSegments.length} clip, crossfade ~${fadeHint.toFixed(2)}s; độ dài xfade ≥ ${stockRenderTarget.toFixed(
        1,
      )}s)...`,
    );
  } else {
    console.log('Đang tạo nền stock (1 clip, loop nếu clip ngắn hơn audio)...');
  }
  renderStockVideoWithCrossfades(stockSegments, stockRenderTarget, tempVideoPath, xfadeFilterPath);
  if (fs.existsSync(xfadeFilterPath)) fs.unlinkSync(xfadeFilterPath);

  const tempSubPath = subtitlePath ? path.join(OUTPUT_DIR, 'temp_sub.ass') : null;

  const scaleFilter = 'scale=-2:720';
  const videoToScale = `[0:v]${scaleFilter}[vpadded]`;
  const videoEncode = '-c:v libx264 -crf 28 -preset medium -c:a aac -b:a 128k';
  const logoPathForMerge = options.logoPath != null ? options.logoPath : LOGO_PATH;
  // const hasLogo = fs.existsSync(logoPathForMerge);
  const hasLogo = false;

  const buildLogoOverlay = inputLabel => {
    if (!hasLogo) return inputLabel;
    const r = Math.floor(LOGO_SIZE / 2);
    const geqExpr = `if(lte(hypot(X-W/2,Y-H/2),${r}),255,0)`;
    return `[2:v]scale=${LOGO_SIZE}:${LOGO_SIZE},format=rgba,geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='${geqExpr}'[logo];[${inputLabel}][logo]overlay=main_w-overlay_w-${LOGO_MARGIN_RIGHT}:${LOGO_MARGIN_TOP}[vout]`;
  };

  if (subtitlePath) {
    // Thay vì dùng subtitle gốc, ta chuyển đổi file sang định dạng ASS có sẵn Box Opacity
    convertSrtToAss(subtitlePath, tempSubPath);

    const subPathEscaped = tempSubPath.replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "'\\''");

    // Sử dụng drawbox của FFmpeg để tạo một thanh màu đen cắt ngang video
    const drawboxFilter = `drawbox=x=0:y=ih-h:w=iw:h=${SUB_BOX_HEIGHT}:color=black@${SUB_BOX_OPACITY}:t=fill`;

    // Subtitle được căn chỉnh đè lên bằng file ASS
    const subFilter = `subtitles='${subPathEscaped}'`;

    const v1 = `${videoToScale};[vpadded]${drawboxFilter}[v1b];[v1b]${subFilter}[v2]`;
    const filterComplexFinal = hasLogo ? v1 + `;${buildLogoOverlay('v2')}` : v1 + ';[v2]copy[vout]';
    const inputs = hasLogo
      ? `-i "${tempVideoPath}" -i "${workingAudioPath}" -i "${logoPathForMerge}"`
      : `-i "${tempVideoPath}" -i "${workingAudioPath}"`;
    console.log('Đang merge video + audio + Dịch subtitle sang ASS (720p, chất lượng trung bình)' + (hasLogo ? ' + logo...' : '...'));
    execSync(
      `ffmpeg -y ${inputs} -filter_complex "${filterComplexFinal}" -map "[vout]" -map 1:a ${videoEncode} -t ${audioDurationAfterTempo} "${outputPath}"`,
      {
        stdio: 'inherit',
      },
    );
    fs.unlinkSync(tempSubPath);
    if (scaledSrtPath && fs.existsSync(scaledSrtPath)) fs.unlinkSync(scaledSrtPath);
  } else {
    let filterComplexFinal;
    if (hasLogo) {
      filterComplexFinal = `${videoToScale};${buildLogoOverlay('vpadded')}`;
    } else {
      filterComplexFinal = `${videoToScale};[vpadded]copy[vout]`;
    }
    const inputs = hasLogo
      ? `-i "${tempVideoPath}" -i "${workingAudioPath}" -i "${logoPathForMerge}"`
      : `-i "${tempVideoPath}" -i "${workingAudioPath}"`;
    console.log('Đang merge video + audio (720p, chất lượng trung bình)' + (hasLogo ? ' + logo...' : '...'));
    execSync(
      `ffmpeg -y ${inputs} -filter_complex "${filterComplexFinal}" -map "[vout]" -map 1:a ${videoEncode} -t ${audioDurationAfterTempo} "${outputPath}"`,
      {
        stdio: 'inherit',
      },
    );
  }

  fs.unlinkSync(tempVideoPath);
  fs.unlinkSync(slowedAudioPath);

  console.log(`\nĐã tạo: ${outputPath}`);

  // Nếu có perVideoDir (batch mode), copy kết quả và lưu metadata
  if (perVideoDir) {
    fs.mkdirSync(perVideoDir, { recursive: true });

    const destVideoPath = path.join(perVideoDir, `${baseName}.mp4`);
    fs.copyFileSync(outputPath, destVideoPath);
    console.log(`>>> Đã xuất video vào folder ID: ${destVideoPath}`);

    // Copy thumbnail nếu có
    if (fs.existsSync(DOWNLOADS_DIR)) {
      const downloadFiles = fs.readdirSync(DOWNLOADS_DIR);
      const thumbFile = downloadFiles.find(f => /\.(jpg|jpeg|png|webp)$/i.test(f));
      if (thumbFile) {
        const thumbExt = path.extname(thumbFile);
        const thumbDestPath = path.join(perVideoDir, `thumbnail${thumbExt}`);
        fs.copyFileSync(path.join(DOWNLOADS_DIR, thumbFile), thumbDestPath);
        console.log(`>>> Đã copy thumbnail: ${thumbDestPath}`);
      }
    }

    // Đợi 1 chút để Gemini callback có thời gian cập nhật (nếu đang chạy song song)
    let gem = geminiByUrl && url ? geminiByUrl[url] : {};
    if (!gem || !gem.title) {
      await new Promise(r => setTimeout(r, 2000));
      gem = geminiByUrl && url ? geminiByUrl[url] : {};
    }

    const ytTagsStr = Array.isArray(tags) ? tags.join(', ') : tags || '';
    const metaPayload = {
      title: originalTitle || '',
      description: description || '',
      tags: ytTagsStr,
      titleGemini: gem?.title || '',
      descriptionGemini: gem?.description || '',
      tagsGemini: gem?.tags || '',
      summaryGemini: gem?.summary || '',
    };
    const metaPath = path.join(perVideoDir, 'video-meta.json');
    fs.writeFileSync(metaPath, JSON.stringify(metaPayload, null, 2), 'utf8');
    console.log(`>>> Đã lưu metadata: ${metaPath}`);
  }
}

/**
 * Main: tạo video từ audio + stock videos
 * options.mode: 'single' | 'batch'
 */
async function main(options = {}) {
  const mode = options.mode || 'single';
  const backgroundName = options.background || 'cat';
  const inputFile = options.inputFile || null;

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
    const items = options.items || [];
    if (items.length === 0) {
      console.log('Không có items để xử lý batch.');
      return;
    }

    const { downloadSingleVideo } = await import('./downloadVideo.js');

    // Tìm file thực tế được dùng để lấy thư mục đích (folder channel)
    const actualInputFile = inputFile;
    let destFolder = path.join(ROOT, 'channels');
    if (actualInputFile) {
      destFolder = path.dirname(actualInputFile);
    }

    const progressFile = actualInputFile
      ? actualInputFile.replace(/\.(xlsx|csv)$/, '_progress.json')
      : path.join(ROOT, 'channels', 'progress.json');
    let progressData = {};
    if (fs.existsSync(progressFile)) {
      try {
        progressData = JSON.parse(fs.readFileSync(progressFile, 'utf8'));
      } catch (e) {}
    }

    const channelLogoImages = getImageFilesFromDir(destFolder);
    const batchChannelLogoPath = channelLogoImages.length > 0 ? channelLogoImages[0] : undefined;
    if (batchChannelLogoPath) {
      console.log(`Logo kênh (dùng cho mọi video batch): ${batchChannelLogoPath}`);
      if (channelLogoImages.length > 1) {
        console.warn(
          `Có ${channelLogoImages.length} ảnh trong thư mục; dùng 1 file đầu tiên (theo tên): ${path.basename(batchChannelLogoPath)}`,
        );
      }
    }

    /** Metadata Gemini theo URL (callback downloadTranscript) — ghi vào video-meta.json sau render */
    const geminiByUrl = {};

    /** Thư mục cho 1 video: destFolder/<videoID> */
    function resolveVideoOutputDir(videoId) {
      const base = videoId || 'unknown_id';
      const dir = path.join(destFolder, base);
      return dir;
    }

    // Luống bắt đầu batch -> Clean folder outputs
    if (fs.existsSync(OUTPUT_DIR)) {
      const outputFiles = fs.readdirSync(OUTPUT_DIR);
      for (const f of outputFiles) {
        try {
          fs.unlinkSync(path.join(OUTPUT_DIR, f));
        } catch (e) {}
      }
      console.log('Đã dọn dẹp thư mục outputs/ trước khi chạy batch.');
    }

    for (let i = 0; i < items.length; i++) {
      const { url, background } = items[i];
      console.log(`\n[${i + 1}/${items.length}] ${url} (Background: ${background})`);

      const result = await downloadSingleVideo(url, {
        mode: MAKE_VIDEO_MODE.FROM_AUDIO,
        callback: ({ title: gemTitle, description: gemDesc, tags: gemTags, summary: gemSummary }) => {
          const tagsStr = typeof gemTags === 'string' ? gemTags : Array.isArray(gemTags) ? gemTags.join(', ') : '';
          geminiByUrl[url] = {
            title: gemTitle || '',
            description: gemDesc || '',
            tags: tagsStr,
            summary: gemSummary || '',
          };
          console.log('Đã nhận title/description/tags/summary từ Gemini (sẽ ghi video-meta.json sau khi render).');
        },
      });
      if (result) {
        const videoId = result.metadata?.id || 'unknown_id';
        const perVideoDir = resolveVideoOutputDir(videoId);

        try {
          await processOne(background, {
            logoPath: batchChannelLogoPath,
            perVideoDir,
            originalTitle: result.title,
            description: result.description,
            tags: result.tags,
            url,
            geminiByUrl,
          });
          console.log(`ĐÃ HOÀN THÀNH VIDEO: ${url}`);

          // Xóa tất cả file trong outputs để xử lý video tiếp theo
          if (fs.existsSync(OUTPUT_DIR)) {
            const outputFiles = fs.readdirSync(OUTPUT_DIR);
            for (const f of outputFiles) {
              try {
                fs.unlinkSync(path.join(OUTPUT_DIR, f));
              } catch (e) {}
            }
            console.log('Đã dọn dẹp outputs/ cẩn thận cho video tiếp theo.');
          }

          // Chỉ đồng bộ STATUS vào Excel — title/description/tags nằm trong video-meta.json từng folder
          progressData[url] = {
            status: 'Đã tạo video',
          };
          fs.writeFileSync(progressFile, JSON.stringify(progressData, null, 2), 'utf8');
        } catch (err) {
          console.error('Lỗi tạo video:', err.message);
        }
      }
    }
    console.log(`\nHoàn thành xử lý ${items.length} video.`);

    // Tự động gọi script đồng bộ bằng child_process
    try {
      console.log('\nĐang tự động đồng bộ trạng thái vào file Excel...');
      const cp = await import('child_process');
      const syncScript = path.join(ROOT, 'contents', 'scripts', 'syncStatusToExcel.js');
      if (fs.existsSync(syncScript)) {
        cp.execSync(`node "${syncScript}"`, { stdio: 'inherit' });
      }
    } catch (e) {
      console.error('Lỗi tự động đồng bộ:', e.message);
    }

    return;
  }

  throw new Error(`Mode không hợp lệ: ${mode}`);
}

export default main;
