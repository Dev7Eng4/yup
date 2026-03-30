export const delay = ms =>
  new Promise(resolve => {
    return setTimeout(resolve, ms);
  });

export const clickElement = async (page, xpath, isLocator = false) => {
  const getPosition = async (page, xpath) => {
    const element = !isLocator ? page.locator(`xpath=${xpath}`) : page.locator(xpath);
    const box = await element.boundingBox();
    if (!box) throw new Error('Element not found');
    return box;
  };

  const box = await getPosition(page, xpath);
  const position = {
    x: box.x + box.width / 2,
    y: box.y + box.height / 2,
  };

  await page.mouse.move(position.x, position.y, { steps: 20 });
  await delay(1000);
  await page.mouse.click(position.x, position.y);
};
