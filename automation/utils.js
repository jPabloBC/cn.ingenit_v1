async function randomDelay(min = 10, max = 40) {
  const delay = Math.floor(Math.random() * (max - min + 1)) + min;
  return new Promise(resolve => setTimeout(resolve, delay));
}

async function humanDelay() {
  return randomDelay(8, 20);
}

async function humanClick(page, selector) {
  const element = await page.$(selector);
  if (element) {
    const box = await element.boundingBox();
    if (box) {
      const x = box.x + Math.random() * box.width;
      const y = box.y + Math.random() * box.height;
      await page.mouse.move(x, y, { steps: 10 });
      await randomDelay(20, 60);
      await page.mouse.click(x, y);
    }
  }
}

async function humanType(page, selector, text) {
  await page.focus(selector);
  await randomDelay(20, 60);
  for (const char of text) {
    await page.keyboard.type(char);
    await randomDelay(5, 20);
  }
}

// Fast typing: use fill or keyboard.insertText for much faster input
async function fastType(page, selector, text) {
  try {
    const locator = await page.locator(selector);
    // Try locator.fill first (fast)
    try {
      await locator.fill(text);
      return;
    } catch (e) {}
    // Fallback to focusing and inserting text
    try {
      await page.focus(selector);
      if (page.keyboard && typeof page.keyboard.insertText === 'function') {
        await page.keyboard.insertText(text);
        return;
      }
      await page.keyboard.type(text, { delay: 0 });
    } catch (e) {
      // last resort: set value via evaluate
      try {
        await page.$eval(selector, (el, v) => { el.value = v; el.dispatchEvent(new Event('input')); el.dispatchEvent(new Event('change')); }, text);
      } catch (ee) {}
    }
  } catch (e) {
    // ignore
  }
}

module.exports = { randomDelay, humanDelay, humanClick, humanType, fastType };
