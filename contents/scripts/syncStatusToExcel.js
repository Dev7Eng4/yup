import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import ExcelJS from 'exceljs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CHANNELS_DIR = path.join(__dirname, '..', '..', 'channels');

async function main() {
  if (!fs.existsSync(CHANNELS_DIR)) {
    console.log('Không có thư mục channels.');
    return;
  }

  function findProgressFiles(dir) {
    let results = [];
    if (!fs.existsSync(dir)) return results;
    const items = fs.readdirSync(dir);
    for (const item of items) {
      const fullPath = path.join(dir, item);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        results = results.concat(findProgressFiles(fullPath));
      } else if (item.endsWith('_progress.json')) {
        results.push(fullPath);
      }
    }
    return results;
  }

  const files = findProgressFiles(CHANNELS_DIR);
  if (files.length === 0) {
    console.log('Không tìm thấy file _progress.json nào để đồng bộ trong thư mục channels hoặc thư mục con.');
    return;
  }

  for (const progressFile of files) {
    const file = path.basename(progressFile);
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
      let videoIdx = headerRow.values.findIndex(v => String(v || '').toLowerCase() === 'link video');
      let statusIdx = headerRow.values.findIndex(v => String(v || '').toLowerCase() === 'status');
      let titleIdx = headerRow.values.findIndex(v => String(v || '').toLowerCase() === 'title');
      let descIdx = headerRow.values.findIndex(v => String(v || '').toLowerCase() === 'description');
      let tagsIdx = headerRow.values.findIndex(v => String(v || '').toLowerCase() === 'tags');

      if (videoIdx >= 0) {
        let nextCol = Math.max(headerRow.values.length, sheet.columnCount + 1);
        if (statusIdx < 0) {
          statusIdx = nextCol++;
          headerRow.getCell(statusIdx).value = 'STATUS';
        }

        let updatedCount = 0;
        for (let i = 2; i <= sheet.rowCount; i++) {
          const row = sheet.getRow(i);
          const rawUrl = row.getCell(videoIdx).value;
          const urlCell =
            rawUrl && typeof rawUrl === 'object' ? String(rawUrl.text || rawUrl.hyperlink || '').trim() : String(rawUrl || '').trim();
          if (progressData[urlCell]) {
            const data = progressData[urlCell];
            if (typeof data === 'string') {
              row.getCell(statusIdx).value = data;
            } else {
              if (data.status) row.getCell(statusIdx).value = data.status;
              if (data.title != null && titleIdx > 0) row.getCell(titleIdx).value = data.title;
              if (data.description != null && descIdx > 0) row.getCell(descIdx).value = data.description;
              if (data.tags != null && tagsIdx > 0) row.getCell(tagsIdx).value = data.tags;
            }
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
        console.warn(`Không tìm thấy cột LINK VIDEO trong ${path.basename(excelFile)}`);
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
