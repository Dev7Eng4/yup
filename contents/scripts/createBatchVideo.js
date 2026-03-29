import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..', '..');
const CHANNELS_DIR = path.join(ROOT, 'channels');

const BATCH_LIMIT = 10;

const DATA_FILE_PATHS = [
  path.join(ROOT, 'channels', '*', 'output.xlsx'),
  path.join(ROOT, 'channels', '*', 'output.csv'),
  path.join(ROOT, 'channels', 'output.xlsx'),
  path.join(ROOT, 'channels', 'output.csv'),
  path.join(ROOT, 'output.xlsx'),
  path.join(ROOT, 'output.csv'),
];

export async function findDataFile() {
  const glob = (await import('glob')).default;
  for (const pattern of DATA_FILE_PATHS) {
    const files = glob.sync(pattern.replace(/\\/g, '/'));
    if (files.length > 0) return files[0];
  }
  return null;
}

/**
 * Đọc file Excel/CSV và lấy danh sách URL từ cột Video
 */
export async function readVideoUrlsFromFile(inputFile = null) {
  let filePath = inputFile;
  if (!filePath) {
    filePath = await findDataFile();
  }

  if (!filePath) {
    throw new Error(`Không tìm thấy file output. Cần tạo từ "Lấy thông tin YouTube" trước.`);
  }

  if (filePath.endsWith('.xlsx')) {
    const ExcelJS = (await import('exceljs')).default;
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);
    const sheet = workbook.worksheets[0];
    if (!sheet || sheet.rowCount < 2) throw new Error('File Excel không có dữ liệu.');
    const headerRow = sheet.getRow(1);
    const videoIdx = headerRow.values.findIndex(v => String(v || '').toLowerCase() === 'link video');
    if (videoIdx < 0) throw new Error('Không tìm thấy cột LINK VIDEO.');
    const trangThaiIdx = headerRow.values.findIndex(v =>
      String(v || '')
        .toLowerCase()
        .includes('status')
    );
    const bgIdx = headerRow.values.findIndex(v => String(v || '').toLowerCase() === 'background video');
    const startIdx = headerRow.values.findIndex(v => String(v || '').toLowerCase() === 'start from');

    let hasFoundStart = startIdx < 0; // Nếu không có cột START FROM thì coi như đã bắt đầu ngay lập tức
    if (!hasFoundStart) {
      // Nếu có cột START FROM, kiểm tra xem thực tế có dòng nào được đánh dấu không.
      // Nếu toàn bộ cột trống, mặc định là bắt đầu luôn.
      let hasAnyMark = false;
      for (let j = 2; j <= sheet.rowCount; j++) {
        if (String(sheet.getRow(j).getCell(startIdx).value || '').trim()) {
          hasAnyMark = true;
          break;
        }
      }
      if (!hasAnyMark) hasFoundStart = true;
    }

    const items = [];
    for (let i = 2; i <= sheet.rowCount; i++) {
      const row = sheet.getRow(i);

      // Nếu chưa tìm thấy điểm bắt đầu và có cột START FROM
      if (!hasFoundStart) {
        const startVal = String(row.getCell(startIdx).value || '').trim();
        if (startVal) {
          hasFoundStart = true;
        }
      }
      if (!hasFoundStart) continue;

      if (trangThaiIdx >= 0) {
        const trangThai = String(row.getCell(trangThaiIdx).value || '').trim();
        if (trangThai) continue;
      }
      const rawVal = row.getCell(videoIdx).value;
      const val = rawVal && typeof rawVal === 'object' ? String(rawVal.text || rawVal.hyperlink || '').trim() : String(rawVal || '').trim();
      const bgVal = bgIdx >= 0 ? String(row.getCell(bgIdx).value || '').trim() : 'cat';
      if (val && (val.startsWith('http://') || val.startsWith('https://')) && !val.includes('(Không có video)')) {
        items.push({
          url: val,
          background: bgVal || 'cat',
        });
      }
    }
    return items;
  }

  const content = fs.readFileSync(filePath, 'utf-8').replace(/^\uFEFF/, '');
  const lines = content.split('\n').filter(l => l.trim());
  if (lines.length < 2) throw new Error('File CSV không có dữ liệu.');
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
  const videoIdx = headers.findIndex(h => h.toLowerCase() === 'link video');
  if (videoIdx < 0) throw new Error('Không tìm thấy cột LINK VIDEO trong CSV.');
  const trangThaiIdx = headers.findIndex(h => h.toLowerCase().includes('status'));
  const bgIdx = headers.findIndex(h => h.toLowerCase() === 'background video');
  const startIdx = headers.findIndex(h => h.toLowerCase() === 'start from');

  let hasFoundStart = startIdx < 0;
  if (!hasFoundStart) {
    const hasAnyMark = lines.slice(1).some(line => {
      const cells = line.split(',').map(c => c.trim().replace(/^"|"$/g, ''));
      return (cells[startIdx] || '').trim();
    });
    if (!hasAnyMark) hasFoundStart = true;
  }

  const items = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(',').map(c => c.trim().replace(/^"|"$/g, ''));

    if (!hasFoundStart) {
      const startVal = (cells[startIdx] || '').trim();
      if (startVal) {
        hasFoundStart = true;
      }
    }
    if (!hasFoundStart) continue;

    if (trangThaiIdx >= 0) {
      const trangThai = (cells[trangThaiIdx] || '').trim();
      if (trangThai) continue;
    }
    const val = cells[videoIdx] || '';
    const bgVal = bgIdx >= 0 ? (cells[bgIdx] || '').trim() : 'cat';
    if (val && (val.startsWith('http://') || val.startsWith('https://')) && !val.includes('(Không có video)')) {
      items.push({
        url: val,
        background: bgVal || 'cat',
      });
    }
  }
  return items;
}

async function main(props = {}) {
  const { VIDEO_TYPE } = await import('../constants/index.js');
  let type = props.videoType;

  if (!type) {
    const inquirer = (await import('inquirer')).default;
    const { videoType } = await inquirer.prompt([
      {
        type: 'list',
        name: 'videoType',
        message: 'Chọn loại video muốn tạo:',
        choices: [
          { name: 'Tạo từ Audio (Ghép nền ngẫu nhiên)', value: VIDEO_TYPE.FROM_AUDIO },
          { name: 'Reup Full (Thêm overlay ảnh/video)', value: VIDEO_TYPE.REUP_FULL },
        ],
      },
    ]);
    type = videoType;
  }

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

  if (!inputFile) {
    inputFile = await findDataFile();
  }

  let items = await readVideoUrlsFromFile(inputFile);
  if (items.length === 0) {
    throw new Error('Không có link video nào trong CSV/Excel.');
  }

  if (items.length > BATCH_LIMIT) {
    console.log(`\t> Giới hạn tối đa ${BATCH_LIMIT} video per batch, bỏ qua ${items.length - BATCH_LIMIT} link còn lại.`);
    items = items.slice(0, BATCH_LIMIT);
  }
  console.log(`Đọc được ${items.length} link từ file. Bắt đầu xử lý tuần tự...\n`);

  if (type === VIDEO_TYPE.FROM_AUDIO) {
    const { default: makeVideoFromAudio } = await import('../makeVideoFromAudio.js');
    await makeVideoFromAudio({ mode: 'batch', inputFile, items, batchLimit: BATCH_LIMIT });
  } else if (type === VIDEO_TYPE.REUP_FULL) {
    const { default: makeVideoFromFull } = await import('../makeVideoFromFull.js');
    await makeVideoFromFull({ mode: 'batch', inputFile, items, batchLimit: BATCH_LIMIT });
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch(err => {
    console.error(err);
    process.exit(1);
  });
}

export default main;

