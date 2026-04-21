/**
 * Restocking feature end-to-end test
 * Tests: nav visibility, page load, slider behavior, order placement, orders tab verification
 */
import { chromium } from 'playwright';
import { writeFileSync } from 'fs';
import path from 'path';

const BASE = 'http://localhost:3000';
const SCREENSHOTS = '/tmp/restocking-test-screenshots';

import { mkdirSync } from 'fs';
mkdirSync(SCREENSHOTS, { recursive: true });

const results = [];

function log(step, status, detail = '') {
  const entry = { step, status, detail };
  results.push(entry);
  console.log(`[${status}] ${step}${detail ? ': ' + detail : ''}`);
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.setDefaultTimeout(10000);

  // Capture console errors
  const consoleErrors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });

  try {
    // ── Step 1: Navigate to homepage ──────────────────────────────────────────
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    log('Step 1: Navigate to http://localhost:3000', 'PASS');

    // ── Step 2: Screenshot nav bar — confirm Restocking tab ───────────────────
    await page.screenshot({ path: `${SCREENSHOTS}/01-homepage-nav.png`, fullPage: false });
    const navLinks = await page.$$eval('nav a, nav button, .nav-link, header a', els =>
      els.map(el => el.textContent?.trim()).filter(Boolean)
    );
    console.log('Nav items found:', navLinks);
    const hasRestocking = navLinks.some(t => /restocking/i.test(t));
    if (hasRestocking) {
      log('Step 2: Restocking tab visible in nav', 'PASS', `Nav items: ${navLinks.join(', ')}`);
    } else {
      log('Step 2: Restocking tab visible in nav', 'FAIL', `Nav items: ${navLinks.join(', ')}`);
    }

    // ── Step 3: Click Restocking nav link ─────────────────────────────────────
    const restockingLink = page.locator('a, button').filter({ hasText: /^Restocking$/i }).first();
    const restockingLinkCount = await restockingLink.count();
    if (restockingLinkCount > 0) {
      await restockingLink.click();
      await page.waitForLoadState('networkidle');
      log('Step 3: Click Restocking nav link', 'PASS');
    } else {
      // Try navigating directly
      await page.goto(`${BASE}/restocking`);
      await page.waitForLoadState('networkidle');
      log('Step 3: Click Restocking nav link', 'WARN', 'Link not found by text, navigated directly to /restocking');
    }

    // ── Step 4: Screenshot — confirm page elements ────────────────────────────
    await page.screenshot({ path: `${SCREENSHOTS}/02-restocking-page.png`, fullPage: true });
    const pageUrl = page.url();
    log('Step 4a: Current URL', 'INFO', pageUrl);

    // Check for budget slider
    const sliderCount = await page.locator('input[type="range"]').count();
    log('Step 4b: Budget slider present', sliderCount > 0 ? 'PASS' : 'FAIL', `Found ${sliderCount} range input(s)`);

    // Check for stat cards (look for card-like elements with numeric content)
    const statCards = await page.locator('.stat-card, .summary-card, .kpi-card, [class*="card"]').count();
    log('Step 4c: Stat cards present', statCards > 0 ? 'PASS' : 'WARN', `Found ${statCards} card element(s)`);

    // Check for recommendations table
    const tableRows = await page.locator('table tbody tr, .table tbody tr').count();
    log('Step 4d: Recommendations table present', tableRows > 0 ? 'PASS' : 'FAIL', `Found ${tableRows} table rows`);

    // ── Step 5: Verify table has rows ─────────────────────────────────────────
    if (tableRows > 0) {
      log('Step 5: Table has rows', 'PASS', `${tableRows} rows visible`);
    } else {
      // Get page text to understand what's showing
      const bodyText = await page.locator('body').innerText();
      const snippet = bodyText.substring(0, 500);
      log('Step 5: Table has rows', 'FAIL', `No rows. Page text snippet: ${snippet}`);
    }

    // ── Step 6: Move slider to $5,000 — check greyed out rows ────────────────
    const slider = page.locator('input[type="range"]').first();
    if (await slider.count() > 0) {
      // Get slider min/max
      const min = await slider.getAttribute('min') || '0';
      const max = await slider.getAttribute('max') || '100000';
      console.log(`Slider range: ${min} - ${max}`);

      // Set to low value ($5,000)
      await slider.evaluate((el, val) => {
        el.value = val;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      }, '5000');
      await page.waitForTimeout(500);

      await page.screenshot({ path: `${SCREENSHOTS}/03-slider-5000.png`, fullPage: true });
      const excludedRows = await page.locator('.row-excluded, tr.excluded, [class*="excluded"], [class*="greyed"], .greyed-out').count();
      const sliderValue = await slider.inputValue();
      log('Step 6: Slider set to low ($5,000)', 'PASS', `Slider value: ${sliderValue}`);
      log('Step 6b: Greyed-out rows at $5,000', excludedRows > 0 ? 'PASS' : 'WARN', `Found ${excludedRows} excluded row(s)`);

      // Also check by looking for any visual exclusion
      const allTableRows = await page.locator('table tbody tr').count();
      log('Step 6c: Total table rows at $5,000', 'INFO', `${allTableRows} total rows`);
    } else {
      log('Step 6: Move slider', 'SKIP', 'No slider found');
    }

    // ── Step 7: Set slider to $25,000 and click "Place Order" ─────────────────
    if (await slider.count() > 0) {
      await slider.evaluate((el, val) => {
        el.value = val;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      }, '25000');
      await page.waitForTimeout(300);
      log('Step 7a: Slider set to $25,000', 'PASS');
    }

    const placeOrderBtn = page.locator('button').filter({ hasText: /place order/i }).first();
    const btnCount = await placeOrderBtn.count();
    if (btnCount > 0) {
      await placeOrderBtn.click();
      await page.waitForTimeout(1000);
      log('Step 7b: Clicked "Place Order" button', 'PASS');
    } else {
      // Look for any submit/order button
      const allButtons = await page.$$eval('button', btns => btns.map(b => b.textContent?.trim()));
      log('Step 7b: "Place Order" button', 'FAIL', `Buttons found: ${allButtons.join(', ')}`);
    }

    // ── Step 8: Screenshot — confirm success banner and button change ─────────
    await page.screenshot({ path: `${SCREENSHOTS}/04-after-place-order.png`, fullPage: true });

    const successBanner = await page.locator('.success, .alert-success, [class*="success"], .banner').count();
    const greenBanner = await page.locator('text=/order placed|success|submitted/i').count();
    log('Step 8a: Success banner appears', successBanner > 0 || greenBanner > 0 ? 'PASS' : 'FAIL',
      `Success elements: ${successBanner}, Text matches: ${greenBanner}`);

    // Check if button text changed to "Order Placed"
    const orderPlacedBtn = await page.locator('button').filter({ hasText: /order placed/i }).count();
    log('Step 8b: Button changes to "Order Placed"', orderPlacedBtn > 0 ? 'PASS' : 'WARN',
      `"Order Placed" buttons found: ${orderPlacedBtn}`);

    // ── Step 9: Navigate to Orders tab ────────────────────────────────────────
    await page.goto(`${BASE}/orders`);
    await page.waitForLoadState('networkidle');
    log('Step 9: Navigate to /orders', 'PASS', `URL: ${page.url()}`);

    // ── Step 10: Screenshot — confirm Submitted Restocking Orders section ──────
    await page.screenshot({ path: `${SCREENSHOTS}/05-orders-page.png`, fullPage: true });

    const restockingSection = await page.locator('text=/submitted restocking orders/i').count();
    log('Step 10: "Submitted Restocking Orders" section visible', restockingSection > 0 ? 'PASS' : 'FAIL',
      `Section found: ${restockingSection}`);

    // ── Step 11: Verify order details ─────────────────────────────────────────
    const orderNumber = await page.locator('text=/RST-001/i').count();
    log('Step 11a: Order number RST-001 visible', orderNumber > 0 ? 'PASS' : 'FAIL',
      `Instances found: ${orderNumber}`);

    // Status badge
    const statusBadge = await page.locator('[class*="badge"], [class*="status"], .tag').count();
    log('Step 11b: Status badge present', statusBadge > 0 ? 'PASS' : 'WARN', `Badge elements: ${statusBadge}`);

    // Submitted date
    const submittedDate = await page.locator('text=/submitted|2025|2026/i').count();
    log('Step 11c: Submitted date visible', submittedDate > 0 ? 'PASS' : 'WARN');

    // Expected delivery
    const expectedDelivery = await page.locator('text=/expected delivery|delivery/i').count();
    log('Step 11d: Expected delivery text visible', expectedDelivery > 0 ? 'PASS' : 'WARN',
      `Instances: ${expectedDelivery}`);

    // Lead time
    const leadTime = await page.locator('text=/lead time|days/i').count();
    log('Step 11e: Lead time visible', leadTime > 0 ? 'PASS' : 'WARN', `Instances: ${leadTime}`);

    // Final full screenshot of orders section
    await page.screenshot({ path: `${SCREENSHOTS}/06-orders-restocking-section.png`, fullPage: true });

  } catch (err) {
    log('UNEXPECTED ERROR', 'ERROR', err.message);
    await page.screenshot({ path: `${SCREENSHOTS}/error-state.png`, fullPage: true });
  } finally {
    await browser.close();
  }

  // ── Summary ─────────────────────────────────────────────────────────────────
  console.log('\n═══════════════════════════════════════════════');
  console.log('RESTOCKING FEATURE TEST SUMMARY');
  console.log('═══════════════════════════════════════════════');
  const passed = results.filter(r => r.status === 'PASS').length;
  const failed = results.filter(r => r.status === 'FAIL').length;
  const warned = results.filter(r => r.status === 'WARN').length;
  results.forEach(r => {
    const icon = r.status === 'PASS' ? 'PASS' : r.status === 'FAIL' ? 'FAIL' : r.status === 'WARN' ? 'WARN' : '....';
    console.log(`  [${icon}] ${r.step}${r.detail ? ' → ' + r.detail : ''}`);
  });
  console.log('───────────────────────────────────────────────');
  console.log(`  Total: ${results.length} | PASS: ${passed} | FAIL: ${failed} | WARN: ${warned}`);
  console.log(`  Screenshots saved to: ${SCREENSHOTS}`);

  if (consoleErrors.length > 0) {
    console.log('\n  Browser console errors:');
    consoleErrors.forEach(e => console.log('    - ' + e));
  }

  writeFileSync(`${SCREENSHOTS}/results.json`, JSON.stringify(results, null, 2));
})();
