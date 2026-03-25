import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CHANNELS_DIR = path.join(__dirname, 'channels');

async function main() {
  let inputFile = null;

  if (fs.existsSync(CHANNELS_DIR)) {
    const files = fs.readdirSync(CHANNELS_DIR).filter(f => f.endsWith('.xlsx') || f.endsWith('.csv'));
    if (files.length > 1) {
      const inquirer = (await import('inquirer')).default;
      const result = await inquirer.prompt([
        {
          type: 'list',
          name: 'selectedFile',
          message: 'Chọn file dữ liệu để chạy batch:',
          choices: files.map(f => ({ name: f, value: path.join(CHANNELS_DIR, f) })),
        },
      ]);
      inputFile = result.selectedFile;
    } else if (files.length === 1) {
      inputFile = path.join(CHANNELS_DIR, files[0]);
    }
  }

  const { default: makeVideoFromAudio } = await import('./contents/makeVideoFromAudio.js');
  await makeVideoFromAudio({ mode: 'batch', inputFile });
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
