/**
 * Giảm tốc độ đọc audio:
 * - Tìm file audio trong downloads/
 * - Tạo file mới với tốc độ 0.95x (giữ pitch)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const DOWNLOADS_DIR = path.join(ROOT, 'downloads');

const SPEED = 0.95;

export default async function main() {
  if (!fs.existsSync(DOWNLOADS_DIR)) {
    console.error('Không tìm thấy thư mục downloads/.');
    return;
  }

  const audioFiles = fs.readdirSync(DOWNLOADS_DIR).filter(f => /\.(mp3|m4a|wav|aac)$/i.test(f));
  if (audioFiles.length === 0) {
    console.error('Không tìm thấy file audio trong downloads/.');
    return;
  }

  const inquirer = (await import('inquirer')).default;

  let audioFile = audioFiles[0];
  if (audioFiles.length > 1) {
    const { picked } = await inquirer.prompt([{
      type: 'list',
      name: 'picked',
      message: 'Chọn file audio:',
      choices: audioFiles.map(f => ({ name: f, value: f })),
    }]);
    audioFile = picked;
  }

  const inputPath = path.join(DOWNLOADS_DIR, audioFile);
  const ext = path.extname(audioFile);
  const baseName = path.basename(audioFile, ext);
  const outputPath = path.join(DOWNLOADS_DIR, `${baseName}_slow${ext}`);

  console.log(`\n📁 Input: ${audioFile}`);
  console.log(`⏱  Tốc độ: ${SPEED}x`);
  console.log(`📄 Output: ${path.basename(outputPath)}\n`);

  // atempo chỉ hỗ trợ 0.5 → 2.0, 0.95 nằm trong khoảng cho phép
  execSync(
    `ffmpeg -y -i "${inputPath}" -filter:a "atempo=${SPEED}" -vn "${outputPath}"`,
    { stdio: 'inherit' },
  );

  console.log(`\n✅ Đã tạo: ${outputPath}`);
}
