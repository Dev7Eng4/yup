import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import { VIDEO_TYPE } from './constants/index.js';


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

function ensureDirs() {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }
  if (!fs.existsSync(OVERLAY_DIR)) {
    fs.mkdirSync(OVERLAY_DIR, { recursive: true });
  }
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
    console.log(`\nĐang xử lý: ${path.basename(videoPath)}`);
    console.log(`Ảnh phủ (dưới, opacity ${IMAGE_OVERLAY_OPACITY}): ${path.basename(imagePath)}`);
    console.log(`Video phủ (trên, loop, opacity ${VIDEO_OVERLAY_OPACITY}): ${path.basename(overlayVideoPath)}`);

    // 0 = video gốc; 1 = ảnh; 2 = video overlay (-stream_loop -1)
    // Bước 1: ảnh lên nền [0:v] như cũ → [base1]
    // Bước 2: video scale + alpha, overlay lên [base1] tới hết video gốc
    const filterComplex =
      `[1:v][0:v]scale2ref=w=iw:h=ih[img][vid];` +
      `[img]format=argb,colorchannelmixer=aa=${IMAGE_OVERLAY_OPACITY}[timg];` +
      `[vid][timg]overlay=0:0[base1];` +
      `[2:v][base1]scale2ref=w=iw:h=ih[ov][base];` +
      `[ov]format=argb,colorchannelmixer=aa=${VIDEO_OVERLAY_OPACITY}[ova];` +
      `[base][ova]overlay=0:0:shortest=1,format=yuv420p[outv]`;

    const args = [
      '-y',
      '-i',
      videoPath,
      '-i',
      imagePath,
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
      '-c:v',
      'libx264',
      '-profile:v',
      'main',
      '-level',
      '4.0',
      '-pix_fmt',
      'yuv420p',
      '-crf',
      '28',
      '-preset',
      'medium',
      '-tag:v',
      'avc1',
      '-c:a',
      'aac',
      '-b:a',
      '128k',
      '-movflags',
      '+faststart',
      '-f',
      'mp4',
      outputPath,
    ];

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

    // Lấy overlays từ destFolder hoặc mặc định OVERLAY_DIR
    let images = getFiles(destFolder, ['.png', '.jpg', '.jpeg', '.webp']);
    if (images.length === 0) images = getFiles(OVERLAY_DIR, ['.png', '.jpg', '.jpeg', '.webp']);

    let overlayVideos = getFiles(destFolder, ['.mp4', '.webm', '.mov', '.mkv']);
    if (overlayVideos.length === 0) overlayVideos = getFiles(OVERLAY_DIR, ['.mp4', '.webm', '.mov', '.mkv']);

    if (images.length === 0 || overlayVideos.length === 0) {
      throw new Error(`Cần ít nhất 1 ảnh và 1 video overlay trong ${destFolder} hoặc ${OVERLAY_DIR}`);
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
        mode: VIDEO_TYPE.REUP_FULL, // Tải cả video
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

    // Đồng bộ trạng thái
    try {
      console.log('\nĐang tự động đồng bộ trạng thái vào file Excel...');
      const syncScript = path.join(ROOT, 'contents', 'scripts', 'syncStatusToExcel.js');
      if (fs.existsSync(syncScript)) {
        const { execSync } = await import('child_process');
        execSync(`node "${syncScript}"`, { stdio: 'inherit' });
      }
    } catch (e) {
      console.error('Lỗi tự động đồng bộ:', e.message);
    }

    return;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch(console.error);
}

export default main;
