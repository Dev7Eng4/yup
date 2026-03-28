import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

const DOWNLOADS_DIR = path.join(ROOT, 'downloads');
const OVERLAY_DIR = path.join(ROOT, 'backgrounds', 'overlay');
const OUTPUT_DIR = path.join(ROOT, 'remade_videos');

// ok -> 0.4 + 0.5
/** Lớp ảnh (dưới) — giữ như phiên bản cũ */
const IMAGE_OVERLAY_OPACITY = 0.3;
/** Lớp video (trên cùng) */
const VIDEO_OVERLAY_OPACITY = 0.4;

if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

function getFiles(dir, exts) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter(f => exts.some(ext => f.toLowerCase().endsWith(ext)))
    .map(f => path.join(dir, f));
}

async function remakeVideo(videoPath, imagePath, overlayVideoPath, outputPath) {
  return new Promise((resolve, reject) => {
    console.log(`\nĐang xử lý: ${path.basename(videoPath)}`);
    console.log(`Ảnh phủ (dưới, opacity ${IMAGE_OVERLAY_OPACITY}): ${path.basename(imagePath)}`);
    console.log(`Video phủ (trên, loop, opacity ${VIDEO_OVERLAY_OPACITY}): ${path.basename(overlayVideoPath)}`);

    // 0 = video gốc; 1 = ảnh; 2 = video overlay (-stream_loop -1)
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

async function main() {
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
}

main().catch(console.error);
