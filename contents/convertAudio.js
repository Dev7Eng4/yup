/**
 * Giảm/tăng tốc độ đọc audio:
 * - Tìm file audio trong downloads/
 * - Tạo file mới với tốc độ SPEED (giữ pitch)
 *
 * Có 2 cách dùng:
 *   1. CLI interactive (default export main)
 *   2. Programmatic: import { convertAudioFile } rồi gọi trực tiếp
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import { SPEED } from './makeVideoFromAudio.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const DOWNLOADS_DIR = path.join(ROOT, 'downloads');

/**
 * Convert audio file với tốc độ cho trước (atempo).
 * atempo chỉ hỗ trợ 0.5 → 2.0.
 * @param {string} inputPath - Đường dẫn file audio đầu vào
 * @param {string} outputPath - Đường dẫn file audio đầu ra
 * @param {number} speed - Tốc độ (0.5 → 2.0)
 */
export function convertAudioFile(inputPath, outputPath, speed) {
  if (speed < 0.5 || speed > 2) {
    throw new Error(`atempo chỉ hỗ trợ 0.5–2.0, hiện speed=${speed}`);
  }
  console.log(`\n📁 Input: ${path.basename(inputPath)}`);
  console.log(`⏱  Tốc độ: ${speed}x`);
  console.log(`📄 Output: ${path.basename(outputPath)}\n`);

  execSync(`ffmpeg -y -i "${inputPath}" -filter:a "atempo=${speed}" -vn "${outputPath}"`, { stdio: 'inherit' });

  console.log(`\n✅ Đã tạo: ${outputPath}`);
}

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
    const { picked } = await inquirer.prompt([
      {
        type: 'list',
        name: 'picked',
        message: 'Chọn file audio:',
        choices: audioFiles.map(f => ({ name: f, value: f })),
      },
    ]);
    audioFile = picked;
  }

  const inputPath = path.join(DOWNLOADS_DIR, audioFile);
  const ext = path.extname(audioFile);
  const baseName = path.basename(audioFile, ext);
  const outputPath = path.join(DOWNLOADS_DIR, `${baseName}_slow${ext}`);

  convertAudioFile(inputPath, outputPath, SPEED);
}
