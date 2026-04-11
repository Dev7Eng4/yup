/**
 * Đọc file Excel/CSV và lấy danh sách URL từ cột Video
 */
async function readVideoUrlsFromFile(inputFile = null) {
  const filePath = inputFile || DATA_FILE_PATHS.find(p => fs.existsSync(p));

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
    const items = [];
    for (let i = 2; i <= sheet.rowCount; i++) {
      const row = sheet.getRow(i);
      if (trangThaiIdx >= 0) {
        const trangThai = String(row.getCell(trangThaiIdx).value || '').trim();
        if (trangThai) continue;
      }
      const rawVal = row.getCell(videoIdx).value;
      const val = rawVal && typeof rawVal === 'object' ? String(rawVal.text || rawVal.hyperlink || '').trim() : String(rawVal || '').trim();
      const bgVal = bgIdx >= 0 ? String(row.getCell(bgIdx).value || '').trim() : DEFAULT_VIDEO.BACKGROUND_VIDEO;
      if (val && (val.startsWith('http://') || val.startsWith('https://')) && !val.includes('(Không có video)')) {
        items.push({
          url: val,
          background: bgVal || DEFAULT_VIDEO.BACKGROUND_VIDEO,
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
  const items = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(',').map(c => c.trim().replace(/^"|"$/g, ''));
    if (trangThaiIdx >= 0) {
      const trangThai = (cells[trangThaiIdx] || '').trim();
      if (trangThai) continue;
    }
    const val = cells[videoIdx] || '';
    const bgVal = bgIdx >= 0 ? (cells[bgIdx] || '').trim() : 'cat';
    if (val && (val.startsWith('http://') || val.startsWith('https://')) && !val.includes('(Không có video)')) {
      items.push({
        url: val,
        background: bgVal || DEFAULT_VIDEO.BACKGROUND_VIDEO,
      });
    }
  }
  return items;
}
