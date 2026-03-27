export async function waitForGeminiResponse(page, timeoutMs = 120000) {
  await page.waitForSelector('.model-response-text, .response-content, message-content', {
    timeout: timeoutMs,
  });

  const startTime = Date.now();
  while (Date.now() - startTime < timeoutMs) {
    const isStreaming = await page.evaluate(() => {
      const stopBtn = document.querySelector('button[aria-label="Stop response"], mat-icon[data-mat-icon-name="stop_circle"]');
      if (stopBtn) {
        const rect = stopBtn.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      }
      return false;
    });

    if (!isStreaming) break;
    await page.waitForTimeout(1000);
  }

  await page.waitForTimeout(2000);
}

export async function extractGeminiResponse(page) {
  await page.waitForTimeout(1500);

  return page.evaluate(() => {
    const responses = Array.from(
      document.querySelectorAll('.model-response-text, .response-content, message-content, div[data-message-author-role="model"]')
    );

    if (responses.length === 0) return '';

    const lastResponse = responses[responses.length - 1];

    const codeBlocks = lastResponse.querySelectorAll('code[data-test-id="code-content"]');

    if (codeBlocks.length > 0) {
      return (codeBlocks[codeBlocks.length - 1].innerText || codeBlocks[codeBlocks.length - 1].textContent || '').trim();
    }

    const anyCode = lastResponse.querySelectorAll('code');
    if (anyCode.length > 0) {
      return (anyCode[anyCode.length - 1].innerText || anyCode[anyCode.length - 1].textContent || '').trim();
    }

    return (lastResponse.innerText || lastResponse.textContent || '').trim();
  });
}
