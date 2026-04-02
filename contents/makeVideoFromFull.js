import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn, execSync } from 'child_process';
import { MAKE_VIDEO_MODE } from './constants/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

const DOWNLOADS_DIR = path.join(ROOT, 'downloads');
const OVERLAY_DIR = path.join(ROOT, 'backgrounds', 'overlay');
const OUTPUT_DIR = path.join(ROOT, 'remade_videos');

// ok -> 0.4 + 0.5
/** Lớp ảnh (dưới) — giữ như phiên bản cũ */
const IMAGE_OVERLAY_OPACITY = 0.5;
/** Lớp video (trên cùng) */
const VIDEO_OVERLAY_OPACITY = 0.5;

/**
 * Zoom trung tâm + cắt 4 phía trên video gốc (input 0) trước khi overlay.
 * 0 = tắt. Ví dụ 10 = phóng to rồi cắt ~10% chiều rộng từ trái và phải (và tương tự trên/dưới), giữ độ phân giải đầu ra = video gốc.
 * Giới hạn thực tế: 1–49 (từ 50 trở lên không hợp lệ cho công thức scale/crop).
 */
const VIDEO_CROP_PERCENT = 0;

/**
 * Tự động detect NVIDIA NVENC encoder bằng cách test encode thực tế.
 * Kiểm tra cả encoder CÓ trong ffmpeg VÀ driver NVIDIA đủ mới để chạy.
 * Nếu OK → dùng h264_nvenc (nhanh gấp 5-10x).
 * Nếu không → fallback về libx264 veryfast.
 */
function detectNvenc() {
  try {
    // Test encode 1 frame nhỏ để xác nhận driver thực sự hoạt động
    execSync('ffmpeg -hide_banner -loglevel error -f lavfi -i nullsrc=s=64x64:d=0.04 -c:v h264_nvenc -f null -', {
      encoding: 'utf-8',
      stdio: 'pipe',
    });
    console.log('✅ Detected NVIDIA NVENC — sử dụng GPU encoder.');
    return true;
  } catch {
    console.log('ℹ️ NVENC không khả dụng (driver cũ hoặc không có GPU) — fallback CPU (libx264 veryfast).');
    return false;
  }
}

const HAS_NVENC = detectNvenc();

/**
 * Lấy resolution (width × height) của video bằng ffprobe.
 * Dùng để scale overlay chính xác thay vì scale2ref mỗi frame.
 */
function getVideoResolution(filePath) {
  try {
    const cmd = `ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=s=x:p=0 "${filePath}"`;
    const result = execSync(cmd, { encoding: 'utf-8' }).trim();
    const [w, h] = result.split('x').map(Number);
    if (w > 0 && h > 0) return { width: w, height: h };
  } catch {
    // fallback
  }
  return { width: 1920, height: 1080 };
}

const OVERLAY_CACHE_DIR = path.join(OVERLAY_DIR, '.cache');

function ensureDirs() {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }
  if (!fs.existsSync(OVERLAY_DIR)) {
    fs.mkdirSync(OVERLAY_DIR, { recursive: true });
  }
  if (!fs.existsSync(OVERLAY_CACHE_DIR)) {
    fs.mkdirSync(OVERLAY_CACHE_DIR, { recursive: true });
  }
}

/**
 * Pre-process ảnh overlay: scale đúng WxH + nhân sẵn alpha → lưu cache PNG.
 * Lần sau cùng resolution + opacity + ảnh gốc → dùng lại, không cần tính lại mỗi frame.
 * Trả về đường dẫn file cache (RGBA PNG, đã baked alpha).
 */
function getPreprocessedImageOverlay(imagePath, width, height, opacity) {
  const srcStat = fs.statSync(imagePath);
  const cacheKey = `img_${path.parse(imagePath).name}_${width}x${height}_a${Math.round(opacity * 100)}_${srcStat.mtimeMs}`;
  const cachePath = path.join(OVERLAY_CACHE_DIR, `${cacheKey}.png`);

  if (fs.existsSync(cachePath)) {
    console.log(`Dùng cache ảnh overlay: ${path.basename(cachePath)}`);
    return cachePath;
  }

  console.log(`Pre-processing ảnh overlay → ${width}x${height}, alpha=${opacity}...`);
  try {
    execSync(
      `ffmpeg -hide_banner -loglevel error -y -i "${imagePath}" -vf "scale=${width}:${height},format=rgba,colorchannelmixer=aa=${opacity}" -frames:v 1 "${cachePath}"`,
      { encoding: 'utf-8', stdio: 'pipe' },
    );
    console.log(`Đã tạo cache: ${path.basename(cachePath)}`);
  } catch (err) {
    console.warn('Không tạo được cache ảnh overlay, dùng pipeline cũ:', err.message);
    return null;
  }
  return cachePath;
}

function getFiles(dir, exts) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter(f => exts.some(ext => f.toLowerCase().endsWith(ext)))
    .map(f => path.join(dir, f));
}

function sanitizeFilename(name) {
  if (!name) return '';
  return name.replace(/[\\/:*?"<>|]/g, '_').trim();
}

/** Ảnh trong thư mục (không đệ quy), sort theo tên — batch: lấy 1 file đầu làm logo kênh */
function getImageFilesFromDir(dir) {
  if (!dir || !fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter(f => /\.(png|jpe?g|gif|webp)$/i.test(f))
    .sort((a, b) => a.localeCompare(b))
    .map(f => path.join(dir, f));
}

async function remakeVideo(videoPath, imagePath, overlayVideoPath, outputPath) {
  return new Promise((resolve, reject) => {
    const encoderLabel = HAS_NVENC ? 'GPU (h264_nvenc p1)' : 'CPU (libx264 ultrafast)';
    console.log(`\nĐang xử lý: ${path.basename(videoPath)}`);
    console.log(`Encoder: ${encoderLabel}`);
    console.log(`Ảnh phủ (dưới, opacity ${IMAGE_OVERLAY_OPACITY}): ${path.basename(imagePath)}`);
    console.log(`Video phủ (trên, loop, opacity ${VIDEO_OVERLAY_OPACITY}): ${path.basename(overlayVideoPath)}`);

    const { width, height } = getVideoResolution(videoPath);

    // [A] Pre-process ảnh overlay: scale + alpha 1 lần, dùng cache
    const cachedImage = getPreprocessedImageOverlay(imagePath, width, height, IMAGE_OVERLAY_OPACITY);
    const useImageCache = cachedImage != null;

    const p = Math.min(49, Math.max(0, Math.floor(Number(VIDEO_CROP_PERCENT)) || 0));
    const inner = 100 - 2 * p;
    const headCrop =
      p > 0 && inner > 0
        ? `[0:v]scale=iw*100/${inner}:ih*100/${inner},crop=iw*${inner}/100:ih*${inner}/100[v0];`
        : '';
    const vid0 = p > 0 && inner > 0 ? '[v0]' : '[0:v]';
    if (p > 0) {
      console.log(
        `Video gốc: zoom + crop ${p}% mỗi phía (4 phía), đầu ra ${width}x${height}.`,
      );
    }

    // [A] Ảnh đã baked alpha → chỉ overlay thuần, không scale/format/colorchannelmixer mỗi frame
    // [E] Video overlay: dùng yuva420p thay vì argb (nhẹ hơn ~50% bộ nhớ/frame)
    const imgFilter = useImageCache
      ? `${vid0}[1:v]overlay=0:0[base1];`
      : `[1:v]scale=${width}:${height},format=yuva420p,colorchannelmixer=aa=${IMAGE_OVERLAY_OPACITY}[timg];` +
        `${vid0}[timg]overlay=0:0[base1];`;

    const filterComplex =
      headCrop +
      imgFilter +
      `[2:v]scale=${width}:${height},format=yuva420p,colorchannelmixer=aa=${VIDEO_OVERLAY_OPACITY}[ova];` +
      `[base1][ova]overlay=0:0:shortest=1,format=yuv420p[outv]`;

    // [C] Không dùng -hwaccel cuda: filter graph chạy CPU, hwaccel gây overhead copy GPU↔RAM
    const args = ['-y', '-threads', '0'];

    args.push(
      '-i',
      videoPath,
      '-i',
      useImageCache ? cachedImage : imagePath,
      '-stream_loop',
      '-1',
      '-i',
      overlayVideoPath,
      '-filter_complex',
      filterComplex,
      '-map',
      '[outv]',
      '-map',
      '0:a?',
      '-shortest',
    );

    // [F] Encoder: preset nhanh nhất — p1 (NVENC) / ultrafast (libx264)
    if (HAS_NVENC) {
      args.push('-c:v', 'h264_nvenc', '-preset', 'p1', '-rc', 'vbr', '-cq', '28', '-pix_fmt', 'yuv420p', '-tag:v', 'avc1');
    } else {
      args.push('-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '28', '-preset', 'ultrafast', '-tag:v', 'avc1');
    }

    args.push('-c:a', 'copy', '-movflags', '+faststart', '-f', 'mp4', outputPath);

    const ffmpeg = spawn('ffmpeg', args, { stdio: 'inherit' });

    ffmpeg.on('close', code => {
      if (code === 0) {
        console.log(`=> Hoàn thành: ${path.basename(outputPath)}`);
        resolve();
      } else {
        console.error(`Lỗi tạo video (mã thoát: ${code})`);
        reject(new Error(`FFmpeg exited with code ${code}`));
      }
    });
  });
}

async function main(options = {}) {
  ensureDirs();
  const mode = options.mode || 'single';
  const inputFile = options.inputFile || null;

  if (mode === 'single') {
    const videos = getFiles(DOWNLOADS_DIR, ['.mp4', '.mov', '.mkv', '.avi']);
    const images = getFiles(OVERLAY_DIR, ['.png', '.jpg', '.jpeg', '.webp']);
    const overlayVideos = getFiles(OVERLAY_DIR, ['.mp4', '.webm', '.mov', '.mkv']);

    if (videos.length === 0) {
      console.log(`Không tìm thấy video nào trong thư mục ${DOWNLOADS_DIR}`);
      return;
    }
    if (images.length === 0) {
      console.log(`Không tìm thấy ảnh overlay (.png/.jpg/...) trong ${OVERLAY_DIR}`);
      return;
    }
    if (overlayVideos.length === 0) {
      console.log(`Không tìm thấy video overlay (.mp4/.webm/...) trong ${OVERLAY_DIR}`);
      return;
    }

    const overlayImage = images[0];
    const overlayClip = overlayVideos[0];

    for (const video of videos) {
      const filename = path.parse(video).name;
      const outputPath = path.join(OUTPUT_DIR, `${filename}_remade.mp4`);
      await remakeVideo(video, overlayImage, overlayClip, outputPath);
    }
    console.log('\nĐã xử lý xong tất cả nội dung!');
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

    // Luôn lấy overlay từ backgrounds/overlay
    const images = getFiles(OVERLAY_DIR, ['.png', '.jpg', '.jpeg', '.webp']);
    const overlayVideos = getFiles(OVERLAY_DIR, ['.mp4', '.webm', '.mov', '.mkv']);

    if (images.length === 0 || overlayVideos.length === 0) {
      throw new Error(`Cần ít nhất 1 ảnh và 1 video overlay trong ${OVERLAY_DIR}`);
    }

    const overlayImage = images[0];
    const overlayClip = overlayVideos[0];

    /** Metadata Gemini theo URL (callback downloadTranscript) — ghi vào video-meta.json sau render */
    const geminiByUrl = {};

    /** Thư mục cho 1 video: destFolder/<videoID> */
    function resolveVideoOutputDir(videoId) {
      const base = videoId || 'unknown_id';
      const dir = path.join(destFolder, base);
      return dir;
    }

    // Dọn dẹp folder remade_videos trước khi chạy batch
    if (fs.existsSync(OUTPUT_DIR)) {
      const outputFiles = fs.readdirSync(OUTPUT_DIR);
      for (const f of outputFiles) {
        try {
          fs.unlinkSync(path.join(OUTPUT_DIR, f));
        } catch (e) {}
      }
      console.log('Đã dọn dẹp thư mục remade_videos/ trước khi chạy batch.');
    }

    for (let i = 0; i < items.length; i++) {
      const { url } = items[i];
      console.log(`\n[${i + 1}/${items.length}] ${url} (Remake Full)`);

      const result = await downloadSingleVideo(url, {
        mode: MAKE_VIDEO_MODE.REUP_FULL, // Tải cả video
        callback: ({ title: gemTitle, description: gemDesc, tags: gemTags }) => {
          const tagsStr = typeof gemTags === 'string' ? gemTags : Array.isArray(gemTags) ? gemTags.join(', ') : '';
          geminiByUrl[url] = {
            title: gemTitle || '',
            description: gemDesc || '',
            tags: tagsStr,
          };
          console.log('Đã nhận title/description/tags từ Gemini.');
        },
      });

      if (result) {
        const videoId = result.metadata?.id || 'unknown_id';
        const perVideoDir = resolveVideoOutputDir(videoId);
        fs.mkdirSync(perVideoDir, { recursive: true });

        const videoPath = result.filePath;
        if (!fs.existsSync(videoPath)) {
          console.error(`Không tìm thấy file video đã tải: ${videoPath}`);
          continue;
        }

        const baseName = sanitizeFilename(result.title || path.basename(videoPath, path.extname(videoPath)));
        const finalVideoPath = path.join(perVideoDir, `${baseName}.mp4`);

        try {
          await remakeVideo(videoPath, overlayImage, overlayClip, finalVideoPath);

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

          // Lưu metadata
          let gem = geminiByUrl[url] || {};
          const metaPayload = {
            title: result.title || '',
            description: result.description || '',
            tags: Array.isArray(result.tags) ? result.tags.join(', ') : result.tags || '',
            titleGemini: gem.title || '',
            descriptionGemini: gem.description || '',
            tagsGemini: gem.tags || '',
          };
          const metaPath = path.join(perVideoDir, 'video-meta.json');
          fs.writeFileSync(metaPath, JSON.stringify(metaPayload, null, 2), 'utf8');

          progressData[url] = { status: 'Đã tạo video' };
          fs.writeFileSync(progressFile, JSON.stringify(progressData, null, 2), 'utf8');

          console.log(`ĐÃ HOÀN THÀNH VIDEO: ${url}`);
        } catch (err) {
          console.error('Lỗi remake video:', err.message);
        } finally {
          // Xóa file tạm trong downloads để video tiếp theo không bị lẫn
          if (fs.existsSync(DOWNLOADS_DIR)) {
            const files = fs.readdirSync(DOWNLOADS_DIR);
            for (const f of files) {
              try {
                fs.unlinkSync(path.join(DOWNLOADS_DIR, f));
              } catch (e) {}
            }
          }
        }
      }
    }

    console.log(`\nHoàn thành xử lý ${items.length} video.`);

    return;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch(console.error);
}

export default main;
