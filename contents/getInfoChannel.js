/**
 * Script lấy thông tin kênh YouTube từ link trong input.txt
 * Chỉ xử lý channel/playlist, không xử lý video
 * Xuất kết quả ra file Excel (.xlsx) với dropdown cột Trạng thái
 */

import youtubedl from 'youtube-dl-exec';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import ExcelJS from 'exceljs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_OUTPUT_DIR = path.join(__dirname, '..', 'channels');
const INPUT_FILE = path.join(__dirname, '..', 'input.txt');

/** Options cho cột Trạng thái (dropdown) */
const TRANG_THAI_OPTIONS = ['', 'Đã tạo video', 'Đã đăng video'];

/**
 * Phát hiện loại URL: 'video' | 'channel' | 'playlist'
 */
function detectUrlType(url) {
  const u = url.toLowerCase().trim();
  if (u.includes('/watch?v=') || u.includes('/shorts/') || u.includes('/live/')) {
    return 'video';
  }
  if (u.includes('/playlist?list=')) {
    return 'playlist';
  }
  if (u.includes('/channel/') || u.includes('/@') || u.includes('/c/') || u.includes('/user/')) {
    return 'channel';
  }
  return 'video';
}

/**
 * Chuyển channel ID sang uploads playlist ID (UC... -> UU...)
 */
function channelToUploadsPlaylistId(channelId) {
  if (!channelId || !channelId.startsWith('UC')) return null;
  return 'UU' + channelId.slice(2);
}

/**
 * Format duration từ giây sang HH:mm:ss
 */
function formatDuration(seconds) {
  if (!seconds) return '00:00:00';
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  return [hrs, mins, secs].map(v => (v < 10 ? '0' + v : v)).join(':');
}

/**
 * Lấy thông tin kênh (và video từ kênh)
 */
async function getChannelInfo(url) {
  // Bước 1: Lấy metadata kênh
  const rawMeta = await youtubedl(url, {
    dumpSingleJson: true,
    flatPlaylist: true,
    noCheckCertificates: true,
    noWarnings: true,
    addHeader: ['referer:youtube.com', 'user-agent:googlebot'],
  });

  const channelId = rawMeta.channel_id;
  let videoLinks = [];
  let entries = [];

  // Bước 2: Nếu là kênh, lấy danh sách video từ uploads
  if (channelId) {
    const playlistId = channelToUploadsPlaylistId(channelId);
    if (playlistId) {
      const plUrl = `https://www.youtube.com/playlist?list=${playlistId}`;
      try {
        const rawPlaylist = await youtubedl(plUrl, {
          dumpSingleJson: true,
          flatPlaylist: true,
          noCheckCertificates: true,
          noWarnings: true,
          addHeader: ['referer:youtube.com', 'user-agent:googlebot'],
        });
        entries = rawPlaylist.entries || [];
        videoLinks = entries
          .filter(e => e.id && e.id.length === 11)
          .map(e => ({
            url: e.url || `https://www.youtube.com/watch?v=${e.id}`,
            title: e.title || '',
            viewCount: e.view_count || 0,
            duration: e.duration_string || (e.duration ? formatDuration(e.duration) : '00:00:00'),
          }));
      } catch (err) {
        console.warn('Không lấy được danh sách video:', err.message);
      }
    }
  }

  // Nếu là playlist URL trực tiếp, dùng entries từ rawMeta
  if (entries.length === 0 && rawMeta.entries) {
    entries = rawMeta.entries;
    videoLinks = entries
      .filter(e => e.id && e.id.length === 11)
      .map(e => ({
        url: e.url || `https://www.youtube.com/watch?v=${e.id}`,
        title: e.title || '',
        viewCount: e.view_count || 0,
        duration: e.duration_string || (e.duration ? formatDuration(e.duration) : '00:00:00'),
      }));
  }

  return {
    type: 'channel',
    name: rawMeta.channel || rawMeta.uploader || rawMeta.title || rawMeta.id,
    description: rawMeta.description || '',
    tags: rawMeta.tags || [],
    video_count: videoLinks.length,
    video_links: videoLinks,
    metadata: {
      id: rawMeta.id,
      channel_id: rawMeta.channel_id,
      channel_url: rawMeta.channel_url,
      uploader: rawMeta.uploader,
      uploader_id: rawMeta.uploader_id,
      uploader_url: rawMeta.uploader_url,
      entries_preview: entries
        .slice(0, 5)
        .map(e => ({
          id: e.id,
          title: e.title,
          url: e.url || (e.id?.length === 11 ? `https://www.youtube.com/watch?v=${e.id}` : null),
        }))
        .filter(e => e.url),
    },
  };
}

async function main() {
  if (!fs.existsSync(INPUT_FILE)) {
    console.error('Không tìm thấy file input.txt');
    process.exit(1);
  }

  const content = fs.readFileSync(INPUT_FILE, 'utf-8').trim();
  const lines = content
    .split('\n')
    .map(l => l.trim())
    .filter(l => l && (l.startsWith('http://') || l.startsWith('https://')));

  if (lines.length === 0) {
    console.error('File input.txt không có link hợp lệ. Chỉ đọc dòng bắt đầu bằng http:// hoặc https://');
    process.exit(1);
  }

  const url = lines[0];
  const urlType = detectUrlType(url);

  if (urlType === 'video') {
    const { main } = await import('./downloadVideo.js');
    return main();
  }

  console.log(`Đang xử lý: ${url}`);
  console.log(`Loại: ${urlType}`);

  try {
    const result = await getChannelInfo(url);

    // Tạo dữ liệu: mỗi video một dòng (đảo ngược: cũ ở đầu, mới ở cuối)
    const headers = [
      'EMAIL',
      'CHANNEL NAME',
      'CHANNEL TAGS',
      'LINK VIDEO',
      'VIEWS',
      'DURATION',
      'STATUS',
      'BACKGROUND VIDEO',
      'START FROM',
    ];
    const videoLinks = [...(result.video_links || [])].reverse();

    const channelName = result.name || '';
    const channelTagsStr = (result.tags || []).join(', ');

    let excelFilename = 'unknown_id';
    const matchUrl = url.match(/@([a-zA-Z0-9_.-]+)/);
    if (matchUrl) {
      excelFilename = matchUrl[1];
    } else if (result.metadata?.uploader_url && result.metadata.uploader_url.includes('@')) {
      const m2 = result.metadata.uploader_url.match(/@([a-zA-Z0-9_.-]+)/);
      if (m2) excelFilename = m2[1];
    } else if (result.metadata?.uploader_id) {
      excelFilename = result.metadata.uploader_id;
      if (excelFilename.startsWith('@')) excelFilename = excelFilename.substring(1);
    } else if (result.metadata?.channel_id || result.metadata?.id) {
      excelFilename = result.metadata.channel_id || result.metadata.id;
    }

    // Thư mục lưu kết quả: channels/<Tên người dùng>/
    const channelDir = path.join(DEFAULT_OUTPUT_DIR, excelFilename);
    const outputExcelPath = path.join(channelDir, `${excelFilename}.xlsx`);

    let workbook;
    let sheet;
    let startRowIndex = 2;

    if (fs.existsSync(outputExcelPath)) {
      console.log(`\nFILE EXCEL CHO KÊNH NÀY ĐÃ TỒN TẠI! (${excelFilename}/${excelFilename}.xlsx) Đang kiểm tra video mới...`);
      workbook = new ExcelJS.Workbook();
      await workbook.xlsx.readFile(outputExcelPath);
      sheet = workbook.worksheets[0];

      const headerRow = sheet.getRow(1);
      const videoIdx = headerRow.values.findIndex(v => String(v || '').toLowerCase() === 'link video');
      if (videoIdx < 0) throw new Error('Không tìm thấy cột LINK VIDEO trong file hiện tại.');

      const existingUrls = new Set();
      for (let i = 2; i <= sheet.rowCount; i++) {
        const row = sheet.getRow(i);
        const rawVal = row.getCell(videoIdx).value;
        const val =
          rawVal && typeof rawVal === 'object' ? String(rawVal.text || rawVal.hyperlink || '').trim() : String(rawVal || '').trim();
        if (val) existingUrls.add(val);
      }

      const newVideos = videoLinks.filter(v => {
        const url = typeof v === 'string' ? v : v?.url || '';
        return url && !existingUrls.has(url);
      });

      if (newVideos.length === 0) {
        console.log('Không có video mới nào. Kết thúc.');
        return;
      }

      console.log(`Tìm thấy ${newVideos.length} video mới. Đang thêm vào cuối file...`);
      startRowIndex = sheet.rowCount + 1;
      newVideos.forEach(video => {
        const url = video?.url || '';
        const views = video?.viewCount || 0;
        const duration = video?.duration || '';
        sheet.addRow(['', '', '', url, views, duration, '', '', '']);
      });
    } else {
      const rows =
        videoLinks.length > 0
          ? videoLinks.map((video, i) => {
              const url = video?.url || '';
              const views = video?.viewCount || 0;
              const duration = video?.duration || '';
              return ['', i === 0 ? channelName : '', i === 0 ? channelTagsStr : '', url, views, duration, '', '', ''];
            })
          : [['', channelName, channelTagsStr, '(Không có video)', 0, '00:00:00', '', '', '']];

      if (!fs.existsSync(channelDir)) {
        fs.mkdirSync(channelDir, { recursive: true });
      }

      workbook = new ExcelJS.Workbook();
      sheet = workbook.addWorksheet('Kênh YouTube', { views: [{ state: 'frozen', ySplit: 1 }] });
      sheet.addRow(headers);
      rows.forEach(row => sheet.addRow(row));

      // Độ rộng cột: email | CHANNEL NAME | CHANNEL TAGS | LINK VIDEO | STATUS | BACKGROUND VIDEO | START FROM
      sheet.columns = [
        { width: 20 }, // EMAIL
        { width: 25 }, // CHANNEL NAME
        { width: 20 }, // CHANNEL TAGS
        { width: 45 }, // LINK VIDEO
        { width: 12 }, // VIEWS
        { width: 12 }, // DURATION
        { width: 20 }, // STATUS
        { width: 22 }, // BACKGROUND VIDEO
        { width: 12 }, // START FROM
      ];
    }

    // Thêm hoặc cập nhật data validation cho tất cả các dòng dữ liệu (cả cũ và mới)
    const backgroundsDir = path.join(__dirname, '..', 'backgrounds');
    let bgOptions = [];
    if (fs.existsSync(backgroundsDir)) {
      bgOptions = fs.readdirSync(backgroundsDir).filter(f => fs.statSync(path.join(backgroundsDir, f)).isDirectory());
    }

    const listFormula = `"${TRANG_THAI_OPTIONS.filter(Boolean).join(',')}"`;

    for (let i = 2; i <= sheet.rowCount; i++) {
      // Dropdown STATUS (cột G - index 7)
      sheet.getCell(`G${i}`).dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: [listFormula],
      };

      // Dropdown Background Video (cột H - index 8)
      if (bgOptions.length > 0) {
        const bgFormula = `"${bgOptions.join(',')}"`;
        sheet.getCell(`H${i}`).dataValidation = {
          type: 'list',
          allowBlank: true,
          formulae: [bgFormula],
        };
      }
    }

    await workbook.xlsx.writeFile(outputExcelPath);

    console.log(`\nĐã lưu kết quả vào ${path.basename(outputExcelPath)} (${videoLinks.length} video)`);
  } catch (err) {
    console.error('Lỗi:', err.message);
    if (err.stderr) console.error('Chi tiết:', err.stderr);
    process.exit(1);
  }
}

export default main;
