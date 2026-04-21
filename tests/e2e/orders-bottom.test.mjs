import { test, expect } from '@playwright/test';

const SCREENSHOTS_DIR = '/tmp/restocking-test-screenshots';
const BASE = 'http://localhost:3000';

test('Capture orders bottom section', async ({ page }) => {
  // Place an order first
  await page.goto(`${BASE}/restocking`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1000);

  const slider = page.locator('input[type="range"]').first();
  await slider.evaluate((el) => {
    el.value = '25000';
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.waitForTimeout(300);

  const placeOrderBtn = page.locator('button').filter({ hasText: /place order/i }).first();
  if (await placeOrderBtn.isVisible()) {
    await placeOrderBtn.click();
    await page.waitForTimeout(1000);
  }

  // Go to orders
  await page.goto(`${BASE}/orders`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1500);

  // Scroll to bottom
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(500);

  await page.screenshot({ path: `${SCREENSHOTS_DIR}/07-orders-bottom-scrolled.png` });

  // Find the restocking section
  const section = page.locator('text=/submitted restocking orders/i');
  const sectionVisible = await section.first().isVisible().catch(() => false);
  console.log('Restocking section visible:', sectionVisible);

  if (sectionVisible) {
    await section.first().scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${SCREENSHOTS_DIR}/08-restocking-section-focused.png` });
  }

  // Dump the bottom part of page text
  const bodyText = await page.locator('body').innerText();
  const lines = bodyText.split('\n');
  const restockingIndex = lines.findIndex(l => /restocking/i.test(l));
  if (restockingIndex >= 0) {
    console.log('Restocking section text:');
    console.log(lines.slice(restockingIndex, restockingIndex + 30).join('\n'));
  } else {
    console.log('No restocking section in page text');
    console.log('Last 20 lines:');
    console.log(lines.slice(-20).join('\n'));
  }

  expect(sectionVisible).toBe(true);
});
