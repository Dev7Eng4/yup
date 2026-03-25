import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import ExcelJS from 'exceljs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CHANNELS_DIR = path.join(__dirname, 'channels');

async function main() {
  if (!fs.existsSync(CHANNELS_DIR)) {
    console.log('Không có thư mục channels.');
    return;
  }

  const files = fs.readdirSync(CHANNELS_DIR).filter(f => f.endsWith('_progress.json'));
  if (files.length === 0) {
    console.log('Không tìm thấy file _progress.json nào để đồng bộ.');
    return;
  }

  for (const file of files) {
    const progressFile = path.join(CHANNELS_DIR, file);
    const excelFileExt = fs.existsSync(progressFile.replace('_progress.json', '.xlsx')) ? '.xlsx' : null;
    
    if (!excelFileExt) {
      console.log(`Bỏ qua ${file} vì không tìm thấy file Excel tương ứng.`);
      continue;
    }

    const excelFile = progressFile.replace('_progress.json', '.xlsx');
    
    let progressData;
    try {
      progressData = JSON.parse(fs.readFileSync(progressFile, 'utf8'));
    } catch (e) {
      console.error(`Lỗi đọc ${file}:`, e.message);
      continue;
    }

    if (Object.keys(progressData).length === 0) {
      console.log(`${file} trống, bỏ qua đồng bộ.`);
      continue;
    }

    try {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.readFile(excelFile);
      const sheet = workbook.worksheets[0];
      
      const headerRow = sheet.getRow(1);
      const videoIdx = headerRow.values.findIndex(v => String(v || '').toLowerCase() === 'link video');
      const statusIdx = headerRow.values.findIndex(v => String(v || '').toLowerCase() === 'status');
      
      if (videoIdx >= 0 && statusIdx >= 0) {
        let updatedCount = 0;
        for (let i = 2; i <= sheet.rowCount; i++) {
          const row = sheet.getRow(i);
          const rawUrl = row.getCell(videoIdx).value;
          const urlCell = rawUrl && typeof rawUrl === 'object' ? String(rawUrl.text || rawUrl.hyperlink || '').trim() : String(rawUrl || '').trim();
          if (progressData[urlCell]) {
            row.getCell(statusIdx).value = progressData[urlCell];
            updatedCount++;
          }
        }
        if (updatedCount > 0) {
          await workbook.xlsx.writeFile(excelFile);
          console.log(`Đã đồng bộ ${updatedCount} trạng thái vào ${path.basename(excelFile)}`);
        } else {
          console.log(`Không có trạng thái nào khớp để đồng bộ vào ${path.basename(excelFile)}`);
        }
      } else {
        console.warn(`Không tìm thấy cột LINK VIDEO hoặc STATUS trong ${path.basename(excelFile)}`);
      }
      
      // Sau khi đồng bộ thành công thì xoá file progress
      fs.unlinkSync(progressFile);

    } catch (e) {
      console.error(`Lỗi cập nhật ${path.basename(excelFile)}:`, e.message);
    }
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
