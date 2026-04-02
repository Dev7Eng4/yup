import fs from 'fs';
import { openChromeProfile } from '../makeChromeProfile.js';
import { delay, clickElement } from './dom.util.js';
import { flowSettings } from '../constants/index.js';

async function superClear(page, context) {
  try {
    await context.clearCookies();
  } catch (e) {
    /* ignore */
  }
}

export async function generateImageThumbnailWithFlow(prompt, pathSave, FROM_GEMINI, setting = {}) {
  const cfg = { ...flowSettings, ...setting };
  console.log('🔄 Đang generate ảnh thumbnail từ flow...');

  const { context, page } = await openChromeProfile({ visible: true });

  try {
    await page.goto(cfg.FLOW_URL + cfg.FLOW_PROJECT_ID);
    await page.waitForLoadState('domcontentloaded');
    await page.keyboard.press('Escape');
    await delay(8000);

    const dialogs = page.locator("div[data-state='open'][role='dialog']");
    const count = await dialogs.count();
    const isDialogOpen = count > 0;

    if (isDialogOpen) {
      console.log('Có popup hiện. Đang tắt popup!');
      const buttonXPath = 'html/body/div[1]/div[2]/div[2]/button';
      await clickElement(page, buttonXPath);
      await delay(1000);
    }

    // Tìm chính xác text "Create with Flow"
    const createWithFlowText = page.getByText('Create with Flow', { exact: true });

    // KIỂM TRA:
    if (await createWithFlowText.isVisible()) {
      console.log('🔄 Đang Create with Flow...');
      await delay(3000);
      await clickElement(page, 'html/body/div[1]/div[1]/div/section[1]/div[1]/div[2]/button');
    }

    await clickElement(page, 'html/body/div[1]/div[1]/div[5]/div/div/div[2]/div[2]/button[1]'); //button select type image/video

    await clickElement(page, '/html/body/div[3]/div/div[2]/div/button[1]'); // select ratio

    await clickElement(page, 'html/body/div[3]/div/div[2]/div/button[1]'); // select quantity
    await clickElement(page, 'html/body/div[3]/div/div[3]/div/button[1]');

    await clickElement(page, 'html/body/div[3]/div/button'); // select model
    await clickElement(page, 'html/body/div[4]/div/div[1]/div');
    await page.keyboard.press('Escape');

    const areaXpath = 'html/body/div[1]/div[1]/div[5]/div/div/div[1]';
    await clickElement(page, areaXpath);
    await delay(1000);
    // await page.keyboard.type(prompt);
    await page.keyboard.insertText(prompt);
    await page.keyboard.press('Enter');

    const [response] = await Promise.all([
      page.waitForResponse(
        async res => {
          const isMatch = res
            .url()
            .includes(`https://aisandbox-pa.googleapis.com/v1/projects/${cfg.FLOW_PROJECT_ID}/flowMedia:batchGenerateImages`);

          if (isMatch) {
            if (res.status() === 403) {
              await superClear(page, context);
              throw new Error('Lỗi 403: Bạn không có quyền truy cập hoặc bị chặn!');
            }
            if (res.status() === 400) {
              throw new Error(`Lỗi vi phạm chính sách tạo ảnh`);
            }
            if (res.status() > 400) {
              throw new Error(`Server trả lỗi: ${res.status()}`);
            }
            return true;
          }
          return false;
        },
        { timeout: 3 * 60 * 1000 },
      ),
    ]);

    const data = await response.json();
    if (!data?.media[0]?.image?.generatedImage?.fifeUrl) throw new Error('Không lấy được ảnh từ flow', response);

    const imageUrl = data?.media[0].image.generatedImage.fifeUrl;
    const imageData = await fetch(imageUrl);
    const imageBuffer = await imageData.arrayBuffer();
    const imageBase64 = Buffer.from(imageBuffer).toString('base64');
    const base64OutputPath = `${pathSave}/images/${FROM_GEMINI}.jpg`;
    fs.writeFileSync(base64OutputPath, imageBase64, 'base64');
    console.log('✅ Đã lưu ảnh vào file:', base64OutputPath);
  } catch (error) {
    console.error('❌ Lỗi: Tạo thumbnail flow:', error);
    throw error;
  } finally {
    if (context) {
      console.log('🔒 Đang đóng browser...');
      await delay(3000);
      await context.close();
    }
  }
}
