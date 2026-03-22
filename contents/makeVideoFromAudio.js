/**
 * Tạo video từ audio + video stock
 * - Audio từ folder downloads
 * - N video stock từ backgrounds/<tên> (N = STOCK_VIDEO_COUNT, cat, dog, ...)
 * - Bước 1: chỉnh tempo audio (ffmpeg atempo; nhỏ hơn 1 = chậm hơn → thời lượng dài hơn)
 * - Độ dài video = độ dài audio (sau khi chỉnh tốc độ), loop video nếu không đủ
 * - Phụ đề: copy trực tiếp file .srt/.vtt từ downloads/ — không scale mốc thời gian
 * - Ghép stock: crossfade (xfade) giữa các clip — clip cũ mờ dần, clip mới sáng dần
 * - mode: 'single' = xử lý 1 (audio có sẵn trong downloads), 'batch' = đọc CSV, tải từng link rồi xử lý
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync, spawnSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const DOWNLOADS_DIR = path.join(ROOT, 'downloads');
const OUTPUT_DIR = path.join(ROOT, 'outputs');

/** Số lượng video stock lấy từ backgrounds (có thể tăng/giảm) */
const STOCK_VIDEO_COUNT = 15;

/** Crossfade giữa các clip stock (giây): clip trước mờ dần, clip sau sáng dần */
const STOCK_CROSSFADE_SEC = 1;

/** Thêm vài giây so với audio khi render stock (dự phòng merge / làm tròn frame). */
const STOCK_RENDER_EXTRA_SEC = 15;

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
  return `scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2,format=yuv420p,fps=${f},settb=tb=1/90000,setsar=1`;
}

function stockNormalizeFilterChain(inputLabel, outLabel) {
  return `[${inputLabel}]${stockNormalizeFilterInner()}[${outLabel}]`;
}

/**
 * Hệ số `atempo` của ffmpeg (0.5–2.0). Nhỏ hơn 1 = đọc chậm hơn; thời lượng ≈ (độ dài gốc) / giá trị → dài ra.
 * Ví dụ 0.95 → ~5.3% dài hơn; không phải rút ngắn.
 */
const AUDIO_ATEMPO = 0.95;

/** Logo hình tròn góc trên phải */
const LOGO_PATH = path.join(ROOT, 'logo', 'catLogo.png');
const LOGO_SIZE = 80;
const LOGO_MARGIN_TOP = 20;
const LOGO_MARGIN_RIGHT = 20;

/** Khung nền tối phía dưới cho subtitle (full width) */
const SUB_BOX_HEIGHT = 150;
const SUB_BOX_OPACITY = 0.5;

/** Khoảng cách giữa các ký tự (ASS Spacing, pixel) — tăng nếu chữ vẫn sát */
const SUBTITLE_CHAR_SPACING = 2;

const DATA_FILE_PATHS = [
  path.join(ROOT, 'channels', 'output.xlsx'),
  path.join(ROOT, 'channels', 'output.csv'),
  path.join(ROOT, 'output.xlsx'),
  path.join(ROOT, 'output.csv'),
];

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
 * Lấy N video stock ngẫu nhiên từ thư mục background (N = STOCK_VIDEO_COUNT)
 */
function getStockVideos(backgroundsDir) {
  const files = fs.readdirSync(backgroundsDir).filter(f => /\.(mp4|mov|mkv|webm)$/i.test(f));
  if (files.length < STOCK_VIDEO_COUNT) {
    throw new Error(`Cần ít nhất ${STOCK_VIDEO_COUNT} video trong ${backgroundsDir}`);
  }
  const shuffled = shuffleArray(files);
  return shuffled.slice(0, STOCK_VIDEO_COUNT).map(f => path.join(backgroundsDir, f));
}

/**
 * Lặp clip cho đến khi **độ dài sau xfade** (sum − (n−1)×fade) >= requiredXfadeOutputSec.
 * Trước đây chỉ so tổng sum clip → lệch (n−1)×fade (vd ~40 clip × 1s ≈ mất 40s) → cuối video đứng hình.
 */
function buildStockSegmentPlan(videoPaths, requiredXfadeOutputSec) {
  const durations = videoPaths.map(p => getDuration(p));
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
 * Tạo bản audio đã chỉnh tempo (atempo) — file tạm dùng cho các bước sau
 */
function buildSpeedAdjustedAudio(sourcePath, destPath) {
  const atempo = AUDIO_ATEMPO;
  if (atempo < 0.5 || atempo > 2.0) {
    throw new Error(`atempo chỉ hỗ trợ 0.5–2.0, hiện AUDIO_ATEMPO=${atempo}`);
  }
  const durBefore = getDuration(sourcePath);
  const expectedAfter = durBefore / atempo;
  const pctLonger = ((1 / atempo - 1) * 100).toFixed(1);
  console.log(
    `Đang chỉnh tempo (atempo=${atempo}: chậm hơn → dài hơn ~${pctLonger}%; dự kiến ~${formatClockDuration(expectedAfter)} / ${expectedAfter.toFixed(1)}s)...`,
  );
  execSync(`ffmpeg -y -i "${sourcePath}" -filter:a "atempo=${atempo}" -c:a aac -b:a 192k "${destPath}"`, { stdio: 'inherit' });
  const durAfter = getAudioDurationSeconds(destPath);
  console.log(
    `Sau atempo: ${formatClockDuration(durBefore)} (${durBefore.toFixed(1)}s) → ${formatClockDuration(durAfter)} (${durAfter.toFixed(1)}s) | ffprobe dự kiến ~${expectedAfter.toFixed(1)}s`,
  );
  if (durAfter < durBefore - 0.5) {
    console.warn(
      'Cảnh báo: file sau atempo ngắn hơn file gốc — lý thuyết phải dài hơn. Thử mở bằng VLC/ffplay hoặc `ffprobe`; Explorer/Windows đôi khi báo sai thời lượng AAC.',
    );
  }
}

/**
 * Đọc file Excel/CSV và lấy danh sách URL từ cột Video
 */
async function readVideoUrlsFromFile() {
  const filePath = DATA_FILE_PATHS.find(p => fs.existsSync(p));
  if (!filePath) {
    throw new Error(`Không tìm thấy file output. Cần tạo từ "Lấy thông tin YouTube" trước.`);
  }

  if (filePath.endsWith('.xlsx')) {
    const ExcelJS = (await import('exceljs')).default;
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);
    const sheet = workbook.worksheets[0];
    if (!sheet || sheet.rowCount < 2) throw new Error('File Excel không có dữ liệu.');
    const headerRow = sheet.getRow(1);
    const videoIdx = headerRow.values.findIndex(v => String(v || '').toLowerCase() === 'video');
    if (videoIdx < 0) throw new Error('Không tìm thấy cột Video.');
    const trangThaiIdx = headerRow.values.findIndex(v =>
      String(v || '')
        .toLowerCase()
        .includes('trạng thái'),
    );
    const urls = [];
    for (let i = 2; i <= sheet.rowCount; i++) {
      const row = sheet.getRow(i);
      if (trangThaiIdx >= 0) {
        const trangThai = String(row.getCell(trangThaiIdx).value || '').trim();
        if (trangThai) continue;
      }
      const val = String(row.getCell(videoIdx).value || '').trim();
      if (val && (val.startsWith('http://') || val.startsWith('https://')) && !val.includes('(Không có video)')) {
        urls.push(val);
      }
    }
    return urls;
  }

  const content = fs.readFileSync(filePath, 'utf-8').replace(/^\uFEFF/, '');
  const lines = content.split('\n').filter(l => l.trim());
  if (lines.length < 2) throw new Error('File CSV không có dữ liệu.');
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
  const videoIdx = headers.findIndex(h => h.toLowerCase() === 'video');
  if (videoIdx < 0) throw new Error('Không tìm thấy cột Video trong CSV.');
  const trangThaiIdx = headers.findIndex(h => h.toLowerCase().includes('trạng thái'));
  const urls = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(',').map(c => c.trim().replace(/^"|"$/g, ''));
    if (trangThaiIdx >= 0) {
      const trangThai = (cells[trangThaiIdx] || '').trim();
      if (trangThai) continue;
    }
    const val = cells[videoIdx] || '';
    if (val && (val.startsWith('http://') || val.startsWith('https://')) && !val.includes('(Không có video)')) {
      urls.push(val);
    }
  }
  return urls;
}

/**
 * Xử lý 1: tạo video từ audio có sẵn trong downloads
 */
async function processOne(backgroundName) {
  const backgroundsDir = path.join(ROOT, 'backgrounds', backgroundName);

  if (!fs.existsSync(DOWNLOADS_DIR)) {
    throw new Error('Không tìm thấy folder downloads/');
  }
  if (!fs.existsSync(backgroundsDir)) {
    throw new Error(`Không tìm thấy folder backgrounds/${backgroundName}/`);
  }

  const audioPath = getAudioFile();
  const videoPaths = getStockVideos(backgroundsDir);

  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const slowedAudioPath = path.join(OUTPUT_DIR, `temp_audio_speed${Math.round(AUDIO_ATEMPO * 100)}.m4a`);
  buildSpeedAdjustedAudio(audioPath, slowedAudioPath);
  const workingAudioPath = slowedAudioPath;

  /** Luôn đo trên file đã atempo (m4a tạm), không dùng độ dài MP3 gốc */
  const audioDurationAfterTempo = getAudioDurationSeconds(workingAudioPath);
  console.log(
    `Thời lượng audio sau atempo=${AUDIO_ATEMPO} (ffprobe, dùng cho nền + merge): ${formatClockDuration(audioDurationAfterTempo)} (${audioDurationAfterTempo.toFixed(1)}s) — ${path.basename(workingAudioPath)}`,
  );
  console.log(`Stock videos: ${videoPaths.map(p => path.basename(p)).join(', ')}`);

  const subtitlePath = getSubtitleFile();
  if (subtitlePath) {
    console.log(`Phụ đề: ${path.basename(subtitlePath)} (${getSubtitleFormatLabel(subtitlePath)})`);
  }

  const baseName = path.basename(audioPath, path.extname(audioPath));
  const xfadeFilterPath = path.join(OUTPUT_DIR, 'xfade_stock.txt');
  const tempVideoPath = path.join(OUTPUT_DIR, 'temp_video.mp4');
  const outputPath = path.join(OUTPUT_DIR, `${baseName}-with-bg.mp4`);

  const stockRenderTarget = audioDurationAfterTempo + STOCK_RENDER_EXTRA_SEC;
  const stockSegments = buildStockSegmentPlan(videoPaths, stockRenderTarget);
  if (stockSegments.length > 1) {
    const minSegDur = Math.min(...stockSegments.map(s => s.duration));
    const fadeHint = Math.max(0.15, Math.min(STOCK_CROSSFADE_SEC, minSegDur * 0.45));
    console.log(
      `Đang tạo nền stock (${stockSegments.length} clip, crossfade ~${fadeHint.toFixed(2)}s; độ dài xfade ≥ ${stockRenderTarget.toFixed(1)}s)...`,
    );
  } else {
    console.log('Đang tạo nền stock (1 clip, loop nếu clip ngắn hơn audio)...');
  }
  renderStockVideoWithCrossfades(stockSegments, stockRenderTarget, tempVideoPath, xfadeFilterPath);
  if (fs.existsSync(xfadeFilterPath)) fs.unlinkSync(xfadeFilterPath);

  const tempSubPath = subtitlePath ? path.join(OUTPUT_DIR, 'temp_sub' + path.extname(subtitlePath)) : null;

  const scaleFilter = 'scale=-2:720';
  const videoToScale = `[0:v]${scaleFilter}[vpadded]`;
  const videoEncode = '-c:v libx264 -crf 28 -preset medium -c:a aac -b:a 128k';
  const hasLogo = fs.existsSync(LOGO_PATH);

  const buildLogoOverlay = inputLabel => {
    if (!hasLogo) return inputLabel;
    const r = Math.floor(LOGO_SIZE / 2);
    const geqExpr = `if(lte(hypot(X-W/2,Y-H/2),${r}),255,0)`;
    return `[2:v]scale=${LOGO_SIZE}:${LOGO_SIZE},format=rgba,geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='${geqExpr}'[logo];[${inputLabel}][logo]overlay=main_w-overlay_w-${LOGO_MARGIN_RIGHT}:${LOGO_MARGIN_TOP}[vout]`;
  };

  if (subtitlePath) {
    fs.copyFileSync(subtitlePath, tempSubPath);
    const subPathEscaped = tempSubPath.replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "'\\''");
    const drawboxFilter = `drawbox=x=0:y=ih-h:w=iw:h=${SUB_BOX_HEIGHT}:color=black@${SUB_BOX_OPACITY}:t=fill`;
    const subFilter = `subtitles='${subPathEscaped}':charenc=UTF-8:force_style='FontSize=40,PrimaryColour=&HFFFFFF&,OutlineColour=&H000000&,BorderStyle=1,Alignment=2,MarginV=12,Spacing=${SUBTITLE_CHAR_SPACING}'`;
    const v1 = `${videoToScale};[vpadded]${drawboxFilter}[v1b];[v1b]${subFilter}[v2]`;
    const filterComplexFinal = hasLogo ? v1 + `;${buildLogoOverlay('v2')}` : v1 + ';[v2]copy[vout]';
    const inputs = hasLogo
      ? `-i "${tempVideoPath}" -i "${workingAudioPath}" -i "${LOGO_PATH}"`
      : `-i "${tempVideoPath}" -i "${workingAudioPath}"`;
    console.log('Đang merge video + audio + subtitle (720p, chất lượng trung bình)' + (hasLogo ? ' + logo...' : '...'));
    execSync(
      `ffmpeg -y ${inputs} -filter_complex "${filterComplexFinal}" -map "[vout]" -map 1:a ${videoEncode} -t ${audioDurationAfterTempo} "${outputPath}"`,
      {
        stdio: 'inherit',
      },
    );
    fs.unlinkSync(tempSubPath);
  } else {
    let filterComplexFinal;
    if (hasLogo) {
      filterComplexFinal = `${videoToScale};${buildLogoOverlay('vpadded')}`;
    } else {
      filterComplexFinal = `${videoToScale};[vpadded]copy[vout]`;
    }
    const inputs = hasLogo
      ? `-i "${tempVideoPath}" -i "${workingAudioPath}" -i "${LOGO_PATH}"`
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
}

/**
 * Main: tạo video từ audio + stock videos
 * options.mode: 'single' | 'batch'
 */
async function main(options = {}) {
  const mode = options.mode || 'single';
  const backgroundName = options.background || 'cat';

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
    const urls = await readVideoUrlsFromFile();
    if (urls.length === 0) {
      throw new Error('Không có link video nào trong CSV.');
    }
    console.log(`Đọc được ${urls.length} link từ CSV. Bắt đầu xử lý tuần tự...\n`);

    const { downloadSingleVideo } = await import('../downloadVideo.js');

    for (let i = 0; i < urls.length; i++) {
      const url = urls[i];
      console.log(`\n[${i + 1}/${urls.length}] ${url}`);
      const result = await downloadSingleVideo(url);
      if (result) {
        try {
          await processOne(backgroundName);
          console.log(`ĐÃ HOÀN THÀNH: ${url}`);
        } catch (err) {
          console.error('Lỗi tạo video:', err.message);
        }
      }
    }
    console.log(`\nHoàn thành xử lý ${urls.length} video.`);
    return;
  }

  throw new Error(`Mode không hợp lệ: ${mode}`);
}

export default main;
