import { test, expect } from '@playwright/test';
import { mkdir } from 'fs/promises';
import path from 'path';

const SCREENSHOTS_DIR = '/tmp/restocking-test-screenshots';
const BASE = 'http://localhost:3000';

test.beforeAll(async () => {
  await mkdir(SCREENSHOTS_DIR, { recursive: true });
});

test('Step 1-2: Homepage loads and Restocking tab is visible in nav', async ({ page }) => {
  await page.goto(BASE);
  await page.waitForLoadState('networkidle');

  await page.screenshot({ path: `${SCREENSHOTS_DIR}/01-homepage-nav.png` });

  // Collect all nav link texts
  const navTexts = await page.$$eval(
    'nav a, .nav-item, .sidebar-item, header a, [class*="nav"] a, aside a',
    els => els.map(el => el.textContent?.trim()).filter(Boolean)
  );
  console.log('Nav items:', navTexts);

  // Also look in entire page for Restocking
  const restockingVisible = await page.locator('text=Restocking').first().isVisible().catch(() => false);
  console.log('Restocking visible anywhere:', restockingVisible);

  expect(restockingVisible).toBe(true);
});

test('Step 3-5: Restocking page loads with slider, stat cards, and table rows', async ({ page }) => {
  await page.goto(BASE);
  await page.waitForLoadState('networkidle');

  // Click the Restocking link
  const restockingLink = page.locator('a, button, [role="link"]').filter({ hasText: /^restocking$/i }).first();
  const exists = await restockingLink.count() > 0;

  if (exists) {
    await restockingLink.click();
  } else {
    console.log('Restocking link not found by text, navigating directly');
    await page.goto(`${BASE}/restocking`);
  }

  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1000);

  await page.screenshot({ path: `${SCREENSHOTS_DIR}/02-restocking-page-load.png`, fullPage: true });
  console.log('Current URL:', page.url());

  // Budget slider
  const slider = page.locator('input[type="range"]').first();
  const sliderVisible = await slider.isVisible().catch(() => false);
  console.log('Slider visible:', sliderVisible);
  expect(sliderVisible).toBe(true);

  // Stat cards - look for any card elements
  const cardCount = await page.locator('[class*="card"], [class*="stat"], [class*="summary"]').count();
  console.log('Card elements:', cardCount);
  expect(cardCount).toBeGreaterThan(0);

  // Table rows
  const rowCount = await page.locator('table tbody tr, .table-row, [class*="table"] tr:not(:first-child)').count();
  console.log('Table rows:', rowCount);
  expect(rowCount).toBeGreaterThan(0);
});

test('Step 6: Slider at $5,000 greys out rows (row-excluded class)', async ({ page }) => {
  await page.goto(`${BASE}/restocking`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1000);

  const slider = page.locator('input[type="range"]').first();
  await expect(slider).toBeVisible();

  const min = await slider.getAttribute('min') || '0';
  const max = await slider.getAttribute('max') || '100000';
  console.log(`Slider range: ${min} - ${max}`);

  // Set to $5,000
  await slider.evaluate((el) => {
    el.value = '5000';
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.waitForTimeout(800);

  await page.screenshot({ path: `${SCREENSHOTS_DIR}/03-slider-at-5000.png`, fullPage: true });

  const sliderValue = await slider.inputValue();
  console.log('Slider value after set:', sliderValue);

  const excludedRows = await page.locator('.row-excluded, tr.excluded, [class*="excluded"]').count();
  const allRows = await page.locator('table tbody tr').count();
  console.log(`Excluded rows: ${excludedRows} / ${allRows} total`);

  // There should be some excluded rows at $5k
  expect(excludedRows).toBeGreaterThan(0);
});

test('Step 7-8: Set slider to $25,000, place order, confirm success banner', async ({ page }) => {
  await page.goto(`${BASE}/restocking`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1000);

  // Set slider to $25,000
  const slider = page.locator('input[type="range"]').first();
  await slider.evaluate((el) => {
    el.value = '25000';
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.waitForTimeout(500);

  // Click Place Order
  const placeOrderBtn = page.locator('button').filter({ hasText: /place order/i }).first();
  const btnExists = await placeOrderBtn.count() > 0;
  console.log('Place Order button found:', btnExists);

  if (!btnExists) {
    const allBtns = await page.$$eval('button', btns => btns.map(b => b.textContent?.trim()));
    console.log('All buttons:', allBtns);
  }

  await expect(placeOrderBtn).toBeVisible();
  await placeOrderBtn.click();
  await page.waitForTimeout(1500);

  await page.screenshot({ path: `${SCREENSHOTS_DIR}/04-after-place-order.png`, fullPage: true });

  // Check for success banner
  const successBanner = await page.locator('.success-banner, [class*="success"], .alert-success, .banner').first().isVisible().catch(() => false);
  const orderPlacedText = await page.locator('text=/order placed|successfully|submitted/i').first().isVisible().catch(() => false);
  console.log('Success banner visible:', successBanner);
  console.log('Order placed text visible:', orderPlacedText);

  expect(successBanner || orderPlacedText).toBe(true);

  // Check button changed to "Order Placed"
  const orderPlacedBtn = page.locator('button').filter({ hasText: /order placed/i });
  const btnChanged = await orderPlacedBtn.isVisible().catch(() => false);
  console.log('"Order Placed" button visible:', btnChanged);
  expect(btnChanged).toBe(true);
});

test('Step 9-11: Orders page shows Submitted Restocking Orders section', async ({ page }) => {
  // First place an order to ensure state exists
  await page.goto(`${BASE}/restocking`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1000);

  const slider = page.locator('input[type="range"]').first();
  const sliderExists = await slider.count() > 0;
  if (sliderExists) {
    await slider.evaluate((el) => {
      el.value = '25000';
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await page.waitForTimeout(300);

    const placeOrderBtn = page.locator('button').filter({ hasText: /place order/i }).first();
    const btnExists = await placeOrderBtn.isVisible().catch(() => false);
    if (btnExists) {
      await placeOrderBtn.click();
      await page.waitForTimeout(1000);
    }
  }

  // Navigate to Orders
  await page.goto(`${BASE}/orders`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1000);

  await page.screenshot({ path: `${SCREENSHOTS_DIR}/05-orders-page.png`, fullPage: true });

  // Check for "Submitted Restocking Orders" section
  const sectionHeading = await page.locator('text=/submitted restocking orders/i').first().isVisible().catch(() => false);
  console.log('"Submitted Restocking Orders" section visible:', sectionHeading);
  expect(sectionHeading).toBe(true);

  // Check RST-001 order number
  await page.screenshot({ path: `${SCREENSHOTS_DIR}/06-orders-restocking-section.png`, fullPage: true });

  const orderNum = await page.locator('text=RST-001').first().isVisible().catch(() => false);
  console.log('RST-001 order number visible:', orderNum);
  expect(orderNum).toBe(true);

  // Status badge
  const statusBadge = await page.locator('[class*="badge"], [class*="status-"]').first().isVisible().catch(() => false);
  console.log('Status badge visible:', statusBadge);

  // Date fields
  const pageText = await page.locator('body').innerText();
  const hasDate = /202[56]/.test(pageText);
  console.log('Has date (2025/2026):', hasDate);

  const hasDelivery = /delivery|expected/i.test(pageText);
  const hasLeadTime = /lead time|days/i.test(pageText);
  console.log('Has delivery info:', hasDelivery);
  console.log('Has lead time:', hasLeadTime);

  expect(statusBadge).toBe(true);
  expect(hasDate).toBe(true);
  expect(hasDelivery).toBe(true);
  expect(hasLeadTime).toBe(true);
});
