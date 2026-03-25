/**
 * CLI - Menu chọn chức năng
 */

import fs from 'fs';
import inquirer from 'inquirer';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKGROUNDS_DIR = path.join(__dirname, 'backgrounds');

const OPTIONS = [
  {
    name: 'Lấy thông tin YouTube (từ input.txt)',
    value: 'getInfoChannel',
  },
  {
    name: 'Tạo video từ audio',
    value: 'makeVideoFromAudio',
  },
  {
    name: 'Tạo đoạn kết video (outro)',
    value: 'makeOutro',
  },
  {
    name: 'Gộp outro vào video',
    value: 'mergeOutro',
  },
  {
    name: 'Giảm tốc độ audio (0.95x)',
    value: 'convertAudio',
  },
  {
    name: 'Làm sạch transcript',
    value: 'cleanSrt',
  },
  {
    name: 'Thoát',
    value: 'exit',
  },
];

async function main() {
  const { action } = await inquirer.prompt([
    {
      type: 'list',
      name: 'action',
      message: 'Chọn chức năng:',
      choices: OPTIONS,
    },
  ]);

  if (action === 'exit') {
    console.log('Tạm biệt!');
    process.exit(0);
  }

  if (action === 'getInfoChannel') {
    const { default: runGetInfo } = await import('./getInfoChannel.js');
    await runGetInfo();
  }

  if (action === 'downloadVideo') {
    const { main } = await import('./downloadVideo.js');
    await main();
  }

  if (action === 'makeVideoFromAudio') {
    const { mode } = await inquirer.prompt([
      {
        type: 'list',
        name: 'mode',
        message: 'Chọn chế độ:',
        choices: [
          { name: 'Xử lý 1', value: 'single' },
          { name: 'Xử lý nhiều', value: 'batch' },
        ],
      },
    ]);

    const dirs = fs.readdirSync(BACKGROUNDS_DIR).filter(f => {
      const fullPath = path.join(BACKGROUNDS_DIR, f);
      return fs.statSync(fullPath).isDirectory();
    });
    if (dirs.length === 0) {
      console.error('Không tìm thấy thư mục background trong backgrounds/');
      return;
    }
    const { background } = await inquirer.prompt([
      {
        type: 'list',
        name: 'background',
        message: 'Chọn video nền:',
        choices: dirs.map(d => ({ name: d, value: d })),
      },
    ]);

    const { default: makeVideoFromAudio } = await import('./contents/makeVideoFromAudio.js');
    await makeVideoFromAudio({ background, mode });
  }

  if (action === 'makeOutro') {
    const { default: runMakeOutro } = await import('./contents/makeOutro.js');
    await runMakeOutro();
  }

  if (action === 'mergeOutro') {
    const { default: runMergeOutro } = await import('./contents/mergeOutroIntoVideo.js');
    await runMergeOutro();
  }

  if (action === 'convertAudio') {
    const { default: runConvertAudio } = await import('./contents/convertAudio.js');
    await runConvertAudio();
  }

  if (action === 'cleanSrt') {
    const { default: runCleanSrt } = await import('./contents/cleanSrt111.js');
    await runCleanSrt();
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
