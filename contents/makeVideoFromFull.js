import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

const DOWNLOADS_DIR = path.join(ROOT, 'downloads');
const OVERLAY_DIR = path.join(ROOT, 'backgrounds', 'overlay');
const OUTPUT_DIR = path.join(ROOT, 'remade_videos');

const OVERLAY_OPACITY = 0.45;

if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

function getFiles(dir, exts) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(f => exts.some(ext => f.toLowerCase().endsWith(ext)))
    .map(f => path.join(dir, f));
}

async function remakeVideo(videoPath, imagePath, outputPath) {
  return new Promise((resolve, reject) => {
    console.log(`\nĐang xử lý: ${path.basename(videoPath)}`);
    console.log(`Ảnh phủ: ${path.basename(imagePath)}`);
    
    // filter_complex:
    // 1. scale2ref: Ép kích thước ảnh (input 1) cho bằng với kích thước video (input 0)
    // 2. format+colorchannelmixer: Chuyển ảnh sang kênh alpha và giảm opacity (aa=OVERLAY_OPACITY)
    // 3. overlay rồi format=yuv420p: ép 8-bit 4:2:0 — tránh nguồn AV1/10-bit/HDR làm đầu ra bị player
    //    Windows hiểu nhầm là “cần AV1” khi pixel format / tag MP4 không chuẩn H.264.
    const filterComplex =
      `[1:v][0:v]scale2ref=w=iw:h=ih[img][vid];` +
      `[img]format=argb,colorchannelmixer=aa=${OVERLAY_OPACITY}[transparent_img];` +
      `[vid][transparent_img]overlay=0:0,format=yuv420p[outv]`;

    const args = [
      '-y',
      '-i', videoPath,
      '-i', imagePath,
      '-filter_complex', filterComplex,
      '-map', '[outv]',
      '-map', '0:a?',
      '-c:v', 'libx264',
      '-profile:v', 'main',
      '-level', '4.0',
      '-pix_fmt', 'yuv420p',
      '-crf', '28',
      '-preset', 'medium',
      '-tag:v', 'avc1',
      '-c:a', 'aac',
      '-b:a', '128k',
      '-movflags', '+faststart',
      '-f', 'mp4',
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

  if (videos.length === 0) {
    console.log(`Không tìm thấy video nào trong thư mục ${DOWNLOADS_DIR}`);
    return;
  }
  if (images.length === 0) {
    console.log(`Không tìm thấy ảnh nào trong thư mục ${OVERLAY_DIR}`);
    return;
  }

  // Lấy ảnh đầu tiên trong thư mục làm overlay chuẩn
  const overlayImage = images[0];

  for (const video of videos) {
    const filename = path.parse(video).name;
    const outputPath = path.join(OUTPUT_DIR, `${filename}_remade.mp4`);
    await remakeVideo(video, overlayImage, outputPath);
  }
  
  console.log('\nĐã xử lý xong tất cả nội dung!');
}

main().catch(console.error);
