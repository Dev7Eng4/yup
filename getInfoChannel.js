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
const DEFAULT_OUTPUT_DIR = path.join(__dirname, 'channels');
const INPUT_FILE = path.join(__dirname, 'input.txt');

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
        videoLinks = entries.filter(e => e.id && e.id.length === 11).map(e => ({ url: e.url || `https://www.youtube.com/watch?v=${e.id}`, title: e.title || '' }));
      } catch (err) {
        console.warn('Không lấy được danh sách video:', err.message);
      }
    }
  }

  // Nếu là playlist URL trực tiếp, dùng entries từ rawMeta
  if (entries.length === 0 && rawMeta.entries) {
    entries = rawMeta.entries;
    videoLinks = entries.filter(e => e.id && e.id.length === 11).map(e => ({ url: e.url || `https://www.youtube.com/watch?v=${e.id}`, title: e.title || '' }));
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
    const headers = ['EMAIL', 'CHANNEL NAME', 'CHANNEL TAGS', 'LINK VIDEO', 'TITLE', 'DESCRIPTION', 'TAGS', 'BACKGROUND VIDEO', 'OUTRO VIDEO', 'OUTRO TIME', 'STATUS'];
    const videoLinks = [...(result.video_links || [])].reverse();

    const channelName = result.name || '';
    const channelTagsStr = (result.tags || []).join(', ');
    const safeChannelName = channelName.replace(/[\\/:*?"<>|]/g, '_') || 'output';
    const outputExcelPath = path.join(DEFAULT_OUTPUT_DIR, `${safeChannelName}.xlsx`);

    if (fs.existsSync(outputExcelPath)) {
      console.log(`\nFILE EXCEL CHO KÊNH NÀY ĐÃ TỒN TẠI! (${safeChannelName}.xlsx) BỎ QUA.\n`);
      return;
    }

    const rows =
      videoLinks.length > 0
        ? videoLinks.map((video, i) => {
            const url = typeof video === 'string' ? video : (video?.url || '');
            const title = typeof video === 'string' ? '' : (video?.title || '');
            return ['', i === 0 ? channelName : '', i === 0 ? channelTagsStr : '', url, title, '', '', '', '', '', ''];
          })
        : [['', channelName, channelTagsStr, '(Không có video)', '', '', '', '', '', '', '']];

    if (!fs.existsSync(DEFAULT_OUTPUT_DIR)) {
      fs.mkdirSync(DEFAULT_OUTPUT_DIR, { recursive: true });
    }

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Kênh YouTube', { views: [{ state: 'frozen', ySplit: 1 }] });
    sheet.addRow(headers);
    rows.forEach(row => sheet.addRow(row));

    // Độ rộng cột: email | CHANNEL NAME | CHANNEL TAGS | LINK VIDEO (dài nhất) | TITLE | DESCRIPTION | TAGS | BACKGROUND VIDEO | OUTRO VIDEO | OUTRO TIME | STATUS
    sheet.columns = [
      { width: 25 }, { width: 28 }, { width: 35 }, { width: 65 }, { width: 50 },
      { width: 50 }, { width: 30 }, { width: 22 }, { width: 22 },
      { width: 15 }, { width: 22 }
    ];

    // Thêm dropdown cho cột Background Video (cột H)
    const backgroundsDir = path.join(__dirname, 'backgrounds');
    let bgOptions = [];
    if (fs.existsSync(backgroundsDir)) {
      bgOptions = fs.readdirSync(backgroundsDir).filter(f => fs.statSync(path.join(backgroundsDir, f)).isDirectory());
    }
    if (bgOptions.length > 0) {
      const bgFormula = `"${bgOptions.join(',')}"`;
      for (let i = 2; i <= sheet.rowCount; i++) {
        sheet.getCell(`H${i}`).dataValidation = {
          type: 'list',
          allowBlank: true,
          formulae: [bgFormula],
        };
      }
    }

    // Thêm dropdown cho cột STATUS (cột K): "" | "Đã tạo video" | "Đã đăng video"
    const listFormula = `"${TRANG_THAI_OPTIONS.filter(Boolean).join(',')}"`;
    for (let i = 2; i <= sheet.rowCount; i++) {
      sheet.getCell(`K${i}`).dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: [listFormula],
      };
    }

    await workbook.xlsx.writeFile(outputExcelPath);

    console.log(`\nĐã lưu kết quả vào ${path.basename(outputExcelPath)} (${rows.length} video)`);
  } catch (err) {
    console.error('Lỗi:', err.message);
    if (err.stderr) console.error('Chi tiết:', err.stderr);
    process.exit(1);
  }
}

export default main;
