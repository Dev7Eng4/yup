import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CHANNELS_DIR = path.join(__dirname, 'channels');

async function main() {
  let inputFile = null;

  if (fs.existsSync(CHANNELS_DIR)) {
    const entries = fs.readdirSync(CHANNELS_DIR, { withFileTypes: true });
    const folders = entries.filter(e => e.isDirectory()).map(e => e.name);

    let selectedFolder = null;

    if (folders.length > 1) {
      const inquirer = (await import('inquirer')).default;
      const result = await inquirer.prompt([
        {
          type: 'list',
          name: 'selectedFolder',
          message: 'Chọn channel folder để chạy batch:',
          choices: folders,
        },
      ]);
      selectedFolder = result.selectedFolder;
    } else if (folders.length === 1) {
      selectedFolder = folders[0];
    } else {
      console.error('Không tìm thấy folder nào trong directories channels');
      process.exit(1);
    }

    if (selectedFolder) {
      const folderPath = path.join(CHANNELS_DIR, selectedFolder);
      const files = fs.readdirSync(folderPath).filter(f => f.endsWith('.xlsx') || f.endsWith('.csv'));
      
      if (files.length > 0) {
        inputFile = path.join(folderPath, files[0]);
      } else {
        console.error(`Không tìm thấy file excel (.xlsx, .csv) trong folder: ${selectedFolder}`);
        process.exit(1);
      }
    }
  }

  const { default: makeVideoFromAudio } = await import('./contents/makeVideoFromAudio.js');
  await makeVideoFromAudio({ mode: 'batch', inputFile });
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
