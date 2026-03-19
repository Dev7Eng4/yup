/**
 * Script lấy thông tin kênh YouTube từ link trong input.txt
 * Chỉ xử lý channel/playlist, không xử lý video
 */

import youtubedl from 'youtube-dl-exec';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const INPUT_FILE = path.join(__dirname, 'input.txt');
const OUTPUT_FILE = path.join(__dirname, 'output.json');

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
 * Lấy thông tin kênh/playlist
 */
async function getChannelInfo(url) {
  // Bước 1: Lấy metadata kênh (name, description, tags)
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

  // Bước 2: Nếu là kênh, lấy danh sách video từ uploads playlist
  if (channelId) {
    const playlistId = channelToUploadsPlaylistId(channelId);
    if (playlistId) {
      const playlistUrl = `https://www.youtube.com/playlist?list=${playlistId}`;
      try {
        const rawPlaylist = await youtubedl(playlistUrl, {
          dumpSingleJson: true,
          flatPlaylist: true,
          noCheckCertificates: true,
          noWarnings: true,
          addHeader: ['referer:youtube.com', 'user-agent:googlebot'],
        });
        entries = rawPlaylist.entries || [];
        videoLinks = entries
          .filter(e => e.id && e.id.length === 11) // Video ID có 11 ký tự
          .map(e => e.url || `https://www.youtube.com/watch?v=${e.id}`);
      } catch (err) {
        console.warn('Không lấy được danh sách video:', err.message);
      }
    }
  }

  // Nếu là playlist trực tiếp (không phải kênh), dùng entries từ rawMeta
  if (entries.length === 0 && rawMeta.entries) {
    entries = rawMeta.entries;
    videoLinks = entries.filter(e => e.id && e.id.length === 11).map(e => e.url || `https://www.youtube.com/watch?v=${e.id}`);
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
    const output = JSON.stringify(result, null, 2);
    fs.writeFileSync(OUTPUT_FILE, output, 'utf-8');
    console.log(`\nĐã lưu kết quả vào output.json`);
  } catch (err) {
    console.error('Lỗi:', err.message);
    if (err.stderr) console.error('Chi tiết:', err.stderr);
    process.exit(1);
  }
}

export default main;
