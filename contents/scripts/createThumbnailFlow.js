/**
 * CLI tạo thumbnail qua Google Flow (Playwright + flow.util).
 * Prompt dùng createPromptReCreateThumbnail từ promts/createImage.js (tái tạo thumbnail từ ảnh có chữ + ảnh nền).
 *
 * Cách chạy:
 *   npm run tao-thumbnail-flow -- [thư_mục_lưu] [tên_file_không_đuôi]
 *
 * Ví dụ:
 *   npm run tao-thumbnail-flow
 *   npm run tao-thumbnail-flow -- ./downloads thumb1
 */

import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { createPromptReCreateThumbnail } from '../promts/createImage.js';
import { generateImageThumbnailWithFlow } from '../utils/flow.util.js';
import { flowSettings } from '../constants/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..', '..');

async function main() {
  const args = process.argv.slice(2);
  const pathSave = path.resolve(args[0] || ROOT);
  const outputBaseName = args[1] || 'thumbnail-flow';

  const prompt = createPromptReCreateThumbnail();

  fs.mkdirSync(path.join(pathSave, 'images'), { recursive: true });

  await generateImageThumbnailWithFlow(prompt, pathSave, outputBaseName, { ...flowSettings });
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
