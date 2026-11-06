const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { createServer } = require('../server');

function playwright() {
  for (const name of [process.env.PLAYWRIGHT_PATH, 'playwright', 'playwright-core'].filter(Boolean)) {
    try { return require(name); } catch (error) { if (error.code !== 'MODULE_NOT_FOUND') throw error; }
  }
  const links = path.join(os.homedir(), '.cache/ms-playwright/.links');
  for (const file of fs.readdirSync(links)) {
    const installed = fs.readFileSync(path.join(links, file), 'utf8').trim();
    if (fs.existsSync(installed)) return require(installed);
  }
  throw new Error('An existing Playwright installation is required');
}

test('Sic Bo calibrates a history section and its three explicit rolls', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'betr-calibration-ui-'));
  const server = createServer({ dataDir: dir });
  let browser;
  try {
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    browser = await playwright().chromium.launch({ headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage({ viewport: { width: 650, height: 900 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.waitForFunction(() => document.querySelector('#screenStart')?.disabled === false);
    await page.locator('#recorderToggle').click();
    assert.equal(await page.locator('#screenHistorySelect').isVisible(), true, 'history can be selected directly');
    assert.equal(await page.locator('#screenHistorySelect').getAttribute('data-screen-region'), 'history');
    assert.equal(await page.locator('#screenHistoryPreview').isVisible(), true, 'history crop is visible');
    assert.ok(await page.locator('#screenHistoryPreview').getAttribute('aria-label'), 'history crop is named');
    assert.equal(await page.locator('#screenHistoryCalibrationPreview').isVisible(), true, 'enlarged history crop is visible');
    for (const roll of ['Newest', 'Previous', 'TwoBack']) {
      assert.equal(await page.locator(`#screenRoll${roll}Select`).isVisible(), true, `${roll} can be selected`);
      assert.equal(await page.locator(`#screenRoll${roll}Preview`).isVisible(), true, `${roll} crop is previewed`);
      assert.equal(await page.locator(`#screenRoll${roll}Status`).isVisible(), true, `${roll} decode has a status`);
    }
    assert.equal(await page.locator('#screenHistoryStatus').isVisible(), true, 'history evidence has its own status');
    assert.equal(await page.locator('#screenSicBoCalibration [data-screen-region]').count(), 1,
      'history is the only calibration area');
    for (const removed of ['screenDiceSelect', 'screenDicePreview', 'screenDiceStatus', 'screenBannerSelect', 'screenBannerPreview', 'screenBannerStatus']) {
      assert.equal(await page.locator(`#${removed}`).count(), 0, `${removed} is not shown`);
    }
    const hint = await page.locator('.reader-history-hint').innerText();
    assert.match(hint, /three visible rolls form a baseline/i);
    assert.match(hint, /identical images alone never establish a new roll/i);
    assert.equal(await page.locator('#screenSyncStart').isVisible(), true);
    assert.equal(await page.locator('#screenSyncStart').isEnabled(), false);
    assert.equal(await page.locator('#screenDetails').getAttribute('open'), null,
      'direct calibration does not require the advanced dropdown');
    assert.equal(await page.locator('#screenCaptureIndicator').isVisible(), true);
    assert.equal(await page.locator('#screenSyncStart').isEnabled(), false, 'sync waits for all three decoded boxes');
    assert.equal(await page.locator('#screenAreaUseSaved').count(), 1, 'saved calibration requires an explicit confirmation control');
    assert.equal(await page.locator('#screenAreaUseSaved').isVisible(), false, 'reuse is offered only for a compatible saved profile');
    assert.equal(await page.locator('#screenSelectArea').isVisible(), false, 'Sic Bo uses its history selector');
    assert.equal(await page.locator('#screenHistoryDirection').inputValue(), 'left');
    await page.locator('#screenHistoryDirection').selectOption('right');
    assert.equal(await page.locator('#screenHistoryDirection').inputValue(), 'right');
    for (const width of [650, 600, 390]) {
      await page.setViewportSize({ width, height: 800 });
      const layout = await page.locator('#screenSicBoCalibration').evaluate(element => {
        const bounds = element.getBoundingClientRect();
        return { left: bounds.left, right: bounds.right, content: element.scrollWidth, width: element.clientWidth };
      });
      assert.ok(layout.left >= 0 && layout.right <= width && layout.content <= layout.width,
        `calibration overflows ${width}px: ${JSON.stringify(layout)}`);
    }
    await page.setViewportSize({ width: 650, height: 900 });
    await page.screenshot({ path: '/tmp/betr-sicbo-calibration-ui.png' });
    await page.locator('#recorderToggle').click();
    await page.keyboard.press('2');
    assert.equal(await page.locator('#pending .slot.filled').count(), 1, 'manual dice remain available');
    await page.locator('#games [data-v="kickoff"]').click();
    await page.locator('#recorderToggle').click();
    assert.equal(await page.locator('#screenSicBoCalibration').isVisible(), false,
      'Sic Bo calibration does not appear for other games');
    assert.deepEqual(errors, []);
  } finally {
    if (browser) await browser.close();
    server.closeAllConnections();
    if (server.listening) await new Promise(resolve => server.close(resolve));
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
