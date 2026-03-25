/**
 * Gộp video outro vào video full:
 * - Tìm video outro (*-outro.mp4) và video full trong outputs/
 * - Cắt phần cuối video full (đúng bằng thời lượng outro)
 * - Ghép phần đầu video full + video outro → video mới
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const OUTPUT_DIR = path.join(ROOT, 'outputs');

function getDuration(filePath) {
  const cmd = `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${filePath}"`;
  const result = execSync(cmd, { encoding: 'utf-8' }).trim();
  return parseFloat(result) || 0;
}

export default async function main(options = {}) {
  const { fullFile: fixedFull, outroFile: fixedOutro, mode = 'single' } = options;

  if (!fs.existsSync(OUTPUT_DIR)) {
    console.error('Không tìm thấy thư mục outputs/.');
    return;
  }

  const allVideos = fs.readdirSync(OUTPUT_DIR).filter(f => /\.(mp4|mov|mkv|webm)$/i.test(f));
  const outroFiles = allVideos.filter(f => /-outro\./i.test(f));
  const fullFiles = allVideos.filter(f => !/-outro\./i.test(f) && !/-merged\./i.test(f));

  if (!fixedOutro && outroFiles.length === 0) {
    console.error('Không tìm thấy video outro (*-outro.mp4) trong outputs/.');
    return;
  }
  if (!fixedFull && fullFiles.length === 0) {
    console.error('Không tìm thấy video full trong outputs/.');
    return;
  }

  let outroFile = fixedOutro || outroFiles[0];
  if (!fixedOutro && outroFiles.length > 1) {
    if (mode === 'batch') {
      outroFile = outroFiles[0]; // Batch mode lấy mặc định file đầu tiên
    } else {
      const inquirer = (await import('inquirer')).default;
      const { picked } = await inquirer.prompt([{
        type: 'list',
        name: 'picked',
        message: 'Chọn video outro:',
        choices: outroFiles.map(f => ({ name: f, value: f })),
      }]);
      outroFile = picked;
    }
  }

  let fullFile = fixedFull || fullFiles[0];
  if (!fixedFull && fullFiles.length > 1) {
    if (mode === 'batch') {
      fullFile = fullFiles[0]; // Batch mode lấy mặc định file đầu tiên
    } else {
      const inquirer = (await import('inquirer')).default;
      const { picked } = await inquirer.prompt([{
        type: 'list',
        name: 'picked',
        message: 'Chọn video full:',
        choices: fullFiles.map(f => ({ name: f, value: f })),
      }]);
      fullFile = picked;
    }
  }

  const outroPath = path.join(OUTPUT_DIR, outroFile);
  const fullPath = path.join(OUTPUT_DIR, fullFile);

  const outroDur = getDuration(outroPath);
  const fullDur = getDuration(fullPath);

  if (outroDur <= 0) {
    console.error('Không đọc được thời lượng video outro.');
    return;
  }
  if (outroDur >= fullDur) {
    console.error(`Video outro (${outroDur.toFixed(1)}s) dài hơn hoặc bằng video full (${fullDur.toFixed(1)}s).`);
    return;
  }

  const cutPoint = fullDur - outroDur;
  console.log(`Video full: ${fullFile} (${fullDur.toFixed(1)}s)`);
  console.log(`Video outro: ${outroFile} (${outroDur.toFixed(1)}s)`);
  console.log(`Cắt video full tại ${cutPoint.toFixed(1)}s, ghép outro vào.`);

  const baseName = path.basename(fullFile, path.extname(fullFile));
  const outPath = path.join(OUTPUT_DIR, `${baseName}-merged.mp4`);
  const tempMainVid = path.join(OUTPUT_DIR, 'temp_main_vid.mp4');
  const tempConcatVid = path.join(OUTPUT_DIR, 'temp_concat_vid.mp4');
  const tempList = path.join(OUTPUT_DIR, 'temp_concat_list.txt');

  try {
    // 1. Cắt phần đầu video full (chỉ video, không audio)
    execSync(
      `ffmpeg -y -i "${fullPath}" -t ${cutPoint.toFixed(3)} -an -c:v libx264 -crf 23 -preset medium "${tempMainVid}"`,
      { stdio: 'inherit' },
    );

    // 2. Ghép video: phần đầu + outro (cả hai đều không có audio)
    const listContent = `file '${tempMainVid.replace(/\\/g, '/')}'\nfile '${outroPath.replace(/\\/g, '/')}'`;
    fs.writeFileSync(tempList, listContent, 'utf-8');
    execSync(
      `ffmpeg -y -f concat -safe 0 -i "${tempList}" -an -c:v libx264 -crf 23 -preset medium "${tempConcatVid}"`,
      { stdio: 'inherit' },
    );

    // 3. Ghép video đã concat + audio gốc từ video full
    execSync(
      `ffmpeg -y -i "${tempConcatVid}" -i "${fullPath}" -map 0:v -map 1:a -c:v copy -c:a aac -b:a 192k -shortest "${outPath}"`,
      { stdio: 'inherit' },
    );

    console.log(`\nĐã tạo: ${outPath}`);
  } finally {
    if (fs.existsSync(tempMainVid)) fs.unlinkSync(tempMainVid);
    if (fs.existsSync(tempConcatVid)) fs.unlinkSync(tempConcatVid);
    if (fs.existsSync(tempList)) fs.unlinkSync(tempList);
  }
}
