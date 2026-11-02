// Run: node test/browser.test.js (uses an existing Playwright installation).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function playwright() {
  for (const name of [process.env.PLAYWRIGHT_PATH, 'playwright', 'playwright-core'].filter(Boolean)) {
    try { return require(name); } catch (err) { if (err.code !== 'MODULE_NOT_FOUND') throw err; }
  }
  // Reuse installations recorded by Playwright's browser cache; no test dependency install.
  const links = path.join(os.homedir(), '.cache', 'ms-playwright', '.links');
  if (fs.existsSync(links)) {
    for (const file of fs.readdirSync(links)) {
      const installed = fs.readFileSync(path.join(links, file), 'utf8').trim();
      if (fs.existsSync(installed)) return require(installed);
    }
  }
  throw new Error('Playwright required: set PLAYWRIGHT_PATH to an existing playwright-core installation');
}

const cfg = { n: 5, prog: 'double', unit: 1, payout: 1, waitBust: 0, recovery: 0, fibDrop: 2 };
function fixture() {
  const { createDefault } = require('../js/data');
  return {
    ...createDefault(), savedAt: Date.now() - 1000,
    books: { 'shuff:sicbo': {
      cfg, sessions: [{ id: 'old', start: 1 }, { id: 'new', start: 20 }],
      entries: [...'AABABAABAB'].map((side, i) => ({
        t: i + 1, s: 'old', raw: side === 'A' ? [2, 4, 5] : [1, 2, 3], cfg,
      })),
    } },
  };
}

async function waitFor(check, message) {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  assert.fail(message);
}

async function main() {
  const { createServer } = require('../server');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'betrplayr-browser-'));
  const file = path.join(dir, 'betrplayr.json');
  const initial = fixture();
  fs.writeFileSync(file, JSON.stringify(initial));
  const server = createServer({ dataDir: dir });
  const handler = server.listeners('request')[0];
  server.removeAllListeners('request');
  let releaseRead;
  server.on('request', (req, res) => {
    if (req.url === '/data' && req.method === 'GET' && !releaseRead) {
      releaseRead = () => handler(req, res);
    } else handler(req, res);
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  let browser;
  try {
    browser = await playwright().chromium.launch({ headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage();
    page.setDefaultTimeout(10000);
    const errors = [];
    page.on('pageerror', (err) => errors.push(err.message));
    const origin = `http://127.0.0.1:${server.address().port}`;
    await page.goto(origin);
    await waitFor(() => releaseRead, 'initial data GET not requested');
    // Try input before file reconciliation. Existing history must survive this race.
    await page.evaluate(() => {
      const unit = document.getElementById('unit');
      unit.value = '9';
      unit.dispatchEvent(new Event('input', { bubbles: true }));
      document.querySelector('[data-key="1"]')?.click();
    });
    assert.equal(JSON.parse(fs.readFileSync(file)).books['shuff:sicbo'].entries.length, 10);
    releaseRead();
    await page.waitForFunction(() => document.querySelector('#site option') && !document.querySelector('main').inert);
    await page.waitForFunction(() => document.querySelector('#sessionInfo').textContent.includes('0 rolls'));
    await page.locator('#scopeSeg [data-v="all"]').click();
    assert.match(await page.locator('#insightContent').innerText(), /1 bust/);
    assert.doesNotMatch(await page.locator('#insightContent').innerText(), /Resetting on bust is optimal/);
    await page.locator('#scopeSeg [data-v="session"]').click();
    assert.match(await page.locator('#insightContent').innerText(), /0 busts/);

    for (const key of ['1', '1', '2']) await page.locator(`#pad [data-key="${key}"]`).click();
    await waitFor(() => JSON.parse(fs.readFileSync(file)).books['shuff:sicbo'].entries.length === 11,
      'roll was not saved without losing historical entries');
    await page.reload();
    await page.waitForFunction(() => document.querySelector('#sessionInfo').textContent.includes('1 roll'));

    await page.locator('#games [data-v="kickoff"]').click();
    for (const key of ['5', '3']) await page.locator(`#pad [data-key="${key}"]`).click();
    await page.locator('#maxPlay').click();
    assert.match(await page.locator('#sessionInfo').innerText(), /1 roll/i);
    await page.locator('#games [data-v="teenpatti"]').click();
    await page.locator('#pad [data-key="wa"]').click();
    await page.locator('#maxPlay').click();
    assert.match(await page.locator('#sessionInfo').innerText(), /1 hand/i);
    for (const key of ['a', '2', 'k', '1', 'q', '4', 'j', '3', '9', '1', '8', '2']) await page.keyboard.press(key);
    assert.match(await page.locator('#sessionInfo').innerText(), /2 hands/i);
    await waitFor(() => JSON.parse(fs.readFileSync(file)).books['shuff:teenpatti']?.entries.length === 2,
      'Teen Patti quick and card hands were not persisted');
    assert.equal(JSON.parse(fs.readFileSync(file)).books['shuff:teenpatti'].entries[1].raw.order, 'alternating');

    const beforeImport = await page.evaluate(() => localStorage.getItem('betrplayr.v1'));
    await page.locator('#import').setInputFiles({
      name: 'invalid.json', mimeType: 'application/json', buffer: Buffer.from('{"sites":[],"books":{}}'),
    });
    await page.waitForFunction(() => document.querySelector('#toast').textContent.startsWith('Import failed'));
    assert.equal(await page.evaluate(() => localStorage.getItem('betrplayr.v1')), beforeImport);
    await page.reload();
    await page.waitForFunction(() => document.querySelector('#sessionInfo').textContent.includes('2 hands'));

    const hostile = fixture();
    hostile.books['shuff:sicbo'].entries[0].raw[0] = '<img src=x onerror="window.reviewMarker=1">';
    await page.locator('#import').setInputFiles({
      name: 'hostile.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(hostile)),
    });
    await page.waitForFunction(() => document.querySelector('#toast').textContent.startsWith('Import failed'));
    assert.equal(await page.evaluate(() => window.reviewMarker), undefined);

    await page.locator('#addSite').click();
    const name = '<img src=x onerror="window.reviewMarker=1">';
    await page.locator('#newSite').fill(name);
    await page.locator('#newSite').press('Enter');
    assert.equal(await page.locator('#site option:checked').textContent(), name);
    assert.equal(await page.locator('.topbar img').count(), 0);
    assert.equal(await page.evaluate(() => window.reviewMarker), undefined);

    await page.locator('#import').setInputFiles({
      name: 'valid.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(fixture())),
    });
    await page.waitForFunction(() => document.querySelector('#toast').textContent.startsWith('Backup restored'));
    await waitFor(() => {
      const saved = JSON.parse(fs.readFileSync(file));
      return saved.sites.length === 1 && saved.books['shuff:sicbo'].entries.length === 10;
    }, 'valid import was not saved');
    assert.equal(JSON.parse(fs.readFileSync(file)).books['shuff:sicbo'].entries.length, 10);
    await page.locator('#resetAll').click();
    await page.waitForFunction(() => document.querySelector('#toast').textContent.startsWith('All data cleared'));
    await waitFor(() => JSON.parse(fs.readFileSync(file)).books['shuff:sicbo']?.entries.length === 0,
      'reset was not saved');
    assert.ok(fs.readdirSync(path.join(dir, 'backups')).filter((name) => name.startsWith('pre-import-')).length >= 2);

    // Fresh browser + absent file must bootstrap persistent storage, not stay browser-only.
    await page.close();
    fs.unlinkSync(file);
    const fresh = await browser.newPage();
    fresh.on('pageerror', (err) => errors.push(err.message));
    await fresh.goto(origin);
    await fresh.waitForFunction(() => document.querySelector('#saveStatus').textContent.includes('Saved to file'));
    assert.equal(JSON.parse(fs.readFileSync(file)).sites[0].id, 'shuff');
    await fresh.goto('file://' + path.resolve(__dirname, '../index.html'));
    await fresh.waitForFunction(() => document.querySelector('#saveStatus').textContent.includes('Browser only'));
    assert.match(await fresh.locator('#sessionInfo').innerText(), /Session #1/);
    assert.deepEqual(errors, []);
    console.log('All browser tests passed');
  } finally {
    if (browser) await browser.close();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

main().catch((err) => { console.error(err); process.exitCode = 1; });
