// Run: node test/browser.test.js (uses an existing Playwright installation).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const stage = process.argv.find(arg => ['--ui', '--sicbo-ui', '--sicbo-reader', '--sicbo-history', '--sicbo-recovery', '--watch', '--split', '--sicbo', '--teenpatti', '--teenpatti-auto', '--kickoff'].includes(arg))?.slice(2);

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

const cfg = { n: 5, prog: 'double', unit: 1, payout: 1, waitBust: 0, waitWin: 0, waitBet: 0, recovery: 0, fibDrop: 2 };
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

async function openOptions(page) {
  if (!await page.locator('#optionsMenu').evaluate(menu => menu.matches(':popover-open'))) {
    await page.locator('#optionsToggle').click();
  }
  assert.equal(await page.locator('#optionsMenu').isVisible(), true);
}

async function openRecorder(page) {
  if (!await page.locator('#screenStart').isVisible()) await page.locator('#recorderToggle').click();
  assert.equal(await page.locator('#screenStart').isVisible(), true);
}

async function checkOptionsUI(page) {
  await openRecorder(page);
  assert.equal(await page.locator('#optionsMenu').isVisible(), false);
  await page.locator('#pad [data-key="1"]').click();
  const pending = await page.locator('#pending').innerHTML();
  await openOptions(page);
  for (const id of ['newSession', 'export', 'resetAll', 'maxPlay', 'unit', 'payout', 'groupSeg', 'progSeg', 'waitSeg', 'waitWinSeg', 'waitBetSeg', 'audioFeedback', 'recSeg']) {
    assert.equal(await page.locator(`#optionsMenu #${id}`).isVisible(), true, `${id} remains accessible in Options`);
  }
  for (const id of ['insightSeg', 'insightContent']) {
    assert.equal(await page.locator(`#optionsMenu #${id}`).count(), 0, `${id} is outside Options`);
    assert.equal(await page.locator(`.strategy-sections #${id}`).count(), 1, `${id} is on the main page`);
  }
  assert.equal(await page.locator('#optionsMenu label:has(#import)').isVisible(), true);
  assert.equal(await page.locator('#optionsMenu #groupSeg button').count(), 4);
  assert.equal(await page.locator('#optionsMenu #progSeg button').count(), 4);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#optionsMenu').isVisible(), false);
  assert.equal(await page.locator('#pending').innerHTML(), pending, 'dismissing Options must preserve pending dice');
  await openOptions(page);
  await page.locator('#optionsClose').click();
  assert.equal(await page.locator('#optionsMenu').isVisible(), false);
  assert.equal(await page.locator('#pending').innerHTML(), pending);
  await page.locator('#recorderMenu').evaluate(el => { el.open = false; });
  await page.locator('#clear').click();
  for (const width of [760, 600, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await openRecorder(page);
    for (const selector of ['#optionsToggle', '#screenStart', '#pad', '#voiceBtn', '#noBet', '#undo', '#clear']) {
      assert.equal(await page.locator(selector).isVisible(), true, `${selector} accessible at ${width}px`);
    }
    const layout = await page.evaluate(() => ({
      width: innerWidth, content: Math.max(document.body.scrollWidth, document.documentElement.scrollWidth),
      stats: document.querySelector('.stats').getBoundingClientRect().toJSON(),
      pad: document.querySelector('#pad').getBoundingClientRect().toJSON(),
      actions: document.querySelector('.entry-actions').getBoundingClientRect().toJSON(),
      history: document.querySelector('#strip').getBoundingClientRect().toJSON(),
    }));
    assert.ok(layout.content <= width, `main page overflows ${width}px (${layout.content}px)`);
    assert.ok(layout.stats.x >= 0 && layout.stats.right <= width, `simulation clipped at ${width}px`);
    if (width === 760) {
      assert.ok(layout.pad.height <= 150, `manual pad too tall: ${layout.pad.height}px`);
      assert.ok(layout.actions.bottom <= 900 && layout.history.top < 900 && layout.stats.top < 900,
        'manual controls, history and simulation should fit the initial 760x900 viewport');
    }
    await openOptions(page);
    const menu = await page.locator('#optionsMenu').evaluate(el => ({
      left: el.getBoundingClientRect().left, right: el.getBoundingClientRect().right,
      width: el.clientWidth, content: el.scrollWidth,
    }));
    assert.ok(menu.left >= 0 && menu.right <= width && menu.content <= menu.width,
      `Options overflows ${width}px viewport: ${JSON.stringify(menu)}`);
    await page.keyboard.press('Escape');
    await page.locator('#recorderMenu').evaluate(el => { el.open = false; });
  }
  await page.locator('#recorderMenu').evaluate(el => { el.open = false; });
  await page.setViewportSize({ width: 1280, height: 720 });
}

async function checkSicBoHistory(page, file) {
  const { createDefault } = require('../js/data');
  const seed = { ...createDefault(), savedAt: Date.now(), books: { 'shuff:sicbo': {
    cfg: { ...cfg }, sessions: [{ id: 'history', start: 1 }],
    entries: [...'AAAAAAB'].map((side, i) => ({
      t: i + 2, s: 'history', raw: side === 'A' ? [2, 4, 5] : [1, 2, 3], cfg: { ...cfg },
    })),
  } } };
  async function importState(state) {
    await openOptions(page);
    await page.locator('#import').setInputFiles({ name: 'sicbo-history.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(state)) });
    await waitFor(() => {
      const saved = JSON.parse(fs.readFileSync(file));
      return JSON.stringify(saved.books) === JSON.stringify(state.books);
    }, 'Sic Bo history fixture not saved');
    await page.keyboard.press('Escape');
  }
  await importState(seed);
  const first = page.locator('#strip .history-group[data-set="1"]');
  assert.equal(await first.getAttribute('data-size'), '5');
  assert.equal(await first.locator('.history-pattern .chip').count(), 5);
  assert.deepEqual(await first.locator('.history-played .chip').evaluateAll(chips => chips.map(chip => Number(chip.dataset.entryIdx))), [5, 6],
    'played results begin with the factor, followed by its bets');
  assert.equal(await first.locator('.history-played .chip').first().locator('.role').textContent(), 'F');
  const original = await first.evaluate(group => group.outerHTML);
  await openOptions(page);
  await page.locator('#groupSeg [data-v="6"]').click();
  await page.keyboard.press('Escape');
  assert.equal(await first.evaluate(group => group.outerHTML), original, 'current group setting must not rewrite an earlier set');
  for (const key of ['2', '4', '5', '1', '2', '3']) await page.locator(`#pad [data-key="${key}"]`).click();
  await waitFor(() => JSON.parse(fs.readFileSync(file)).books['shuff:sicbo'].entries.length === 9, 'new Group 6 factor and bet not saved');
  const second = page.locator('#strip .history-group[data-set="2"]');
  assert.equal(await second.getAttribute('data-size'), '6');
  assert.equal(await second.locator('.history-pattern .chip').count(), 6);
  assert.deepEqual(await second.locator('.history-played .chip').evaluateAll(chips => chips.map(chip => Number(chip.dataset.entryIdx))), [7, 8]);
  assert.equal(await second.locator('.history-played .chip').first().locator('.role').textContent(), 'F');
  assert.equal(await second.locator('.history-played .chip').last().locator('.res.win').count(), 1);
  assert.equal(await first.evaluate(group => group.outerHTML), original);
  const snapshots = JSON.parse(fs.readFileSync(file)).books['shuff:sicbo'].entries.map(entry => entry.cfg.n);
  assert.deepEqual(snapshots, [5, 5, 5, 5, 5, 5, 5, 6, 6]);
  await page.reload();
  await page.waitForFunction(() => document.querySelector('#sessionInfo').textContent.includes('9 rolls'));
  assert.equal(await first.evaluate(group => group.outerHTML), original, 'reload retains historical Group 5');
  await page.setViewportSize({ width: 760, height: 900 });
  await page.screenshot({ path: '/tmp/betr-sicbo-compact.png' });
  await page.setViewportSize({ width: 1280, height: 720 });
  assert.equal(await second.getAttribute('data-size'), '6');
  assert.equal(await second.locator('.history-pattern .chip').count(), 6, 'reload retains later Group 6');
  await importState(fixture());
  await page.waitForFunction(() => document.querySelector('#sessionInfo').textContent.includes('0 rolls'));
}

async function checkSplitOCR(page, game, reads) {
  const startedAt = Date.now();
  const read = await page.evaluate(async ({ base64, game }) => {
    const bitmap = await createImageBitmap(new Blob([Uint8Array.from(atob(base64), c => c.charCodeAt(0))], { type: 'image/png' }));
    const frame = document.createElement('canvas'); frame.width = 3827; frame.height = 2160;
    const ctx = frame.getContext('2d');
    ctx.fillStyle = '#12151a'; ctx.fillRect(0, 0, frame.width, frame.height);
    ctx.drawImage(bitmap, 270, 325, 1920, 1080); bitmap.close();
    // Match a whole-desktop share with a casino on the left and window borders.
    ctx.fillStyle = '#bf4570'; ctx.fillRect(4, 0, 4, frame.height); ctx.fillRect(3800, 0, 4, frame.height);
    ctx.fillStyle = '#4051d0'; ctx.fillRect(35, 70, 4, frame.height - 90);
    const originalFetch = window.fetch, originalDice = ScreenVision.readDice;
    const scores = { ocr: [] };
    window.fetch = async (...args) => {
      const response = await originalFetch(...args);
      if (args[0] === '/ocr') scores.ocr.push(await response.clone().json());
      return response;
    };
    ScreenVision.readDice = (...args) => { const roll = originalDice(...args); scores.dice = roll?.confidence; return roll; };
    try {
      const scan = await ScreenReader.readFrame(frame, game);
      return { area: scan.area, observation: scan.observation, message: scan.message, scores };
    } finally { window.fetch = originalFetch; ScreenVision.readDice = originalDice; }
  }, { game, base64: fs.readFileSync(path.join(__dirname, `fixtures/${game}-screen.png`)).toString('base64') });
  assert.ok(read.observation, `${game} split-screen OCR: ${JSON.stringify(read)}; last read: ${JSON.stringify(reads?.at(-1))}`);
  assert.ok(read.observation.confidence >= 80, `${game} split-screen read score: ${JSON.stringify(read)}`);
  const expected = { sicbo: [4, 6, 6], teenpatti: { c: ['8s', '4c', '3c', '9c', '10c', 'Ah'] }, kickoff: [6, 4] }[game];
  const actual = game === 'sicbo' ? read.observation.raw.slice().sort() : read.observation.raw;
  assert.deepEqual(actual, expected, `${game} split-screen preserves all cards/dice`);
  assert.match(read.observation.round, /^\d{13}$/);
  assert.ok(Number(read.observation.round) >= startedAt && Number(read.observation.round) <= Date.now(), `${game} round uses current PC time`);
  console.log(`${game} whole-desktop split-screen OCR passed`);
}

async function checkReloadedResult(page, game) {
  await openRecorder(page);
  await page.evaluate(async base64 => {
    const bitmap = await createImageBitmap(new Blob([Uint8Array.from(atob(base64), c => c.charCodeAt(0))], { type: 'image/png' }));
    const source = document.createElement('canvas'); source.width = bitmap.width; source.height = bitmap.height;
    const ctx = source.getContext('2d'); ctx.drawImage(bitmap, 0, 0); bitmap.close();
    Object.defineProperty(navigator.mediaDevices, 'getDisplayMedia', { configurable: true, value: async () => {
      const stream = source.captureStream(2);
      setTimeout(() => { ctx.fillStyle = '#151515'; ctx.fillRect(0, 0, 1, 1); }, 100);
      return stream;
    } });
  }, fs.readFileSync(path.join(__dirname, `fixtures/${game}-screen.png`)).toString('base64'));
  await page.locator('#screenStart').click();
  if (game === 'teenpatti') {
    await page.waitForFunction(() => !document.querySelector('#screenTeenConfirm').disabled);
    await page.locator('#screenTeenConfirm').click();
    await page.waitForFunction(() => document.querySelector('#screenTeenState').textContent.includes('Waiting for the next round phase'));
  } else await page.waitForFunction(() => document.querySelector('#screenStatus').textContent.includes('already recorded'));
  await page.locator('#screenStop').click();
}

async function main() {
  if (process.argv.includes('--running')) {
    const target = new URL(process.argv.find(arg => arg.startsWith('--url='))?.slice(6) || 'http://127.0.0.1:47615');
    assert.equal(target.protocol, 'http:'); assert.equal(target.hostname, '127.0.0.1');
    const origin = target.origin;
    const missing = [];
    for (const asset of ['/', '/js/history.js', '/js/screen.js', '/js/capture.js']) {
      const response = await fetch(origin + asset, { signal: AbortSignal.timeout(5000) });
      console.log(`Running app ${asset}: ${response.status}`);
      if (response.status !== 200) missing.push(asset);
    }
    assert.deepEqual(missing, [], 'Running app scripts missing; restart the app server after updates');
    const browser = await playwright().chromium.launch({ headless: true, args: ['--no-sandbox'] });
    try {
      const page = await browser.newPage({ viewport: { width: 650, height: 900 } });
      const errors = [];
      page.on('pageerror', err => errors.push(err.message));
      // Smoke-check the running app without permitting any changes to real history.
      await page.route('**/*', route => route.request().method() === 'POST' && new URL(route.request().url()).pathname !== '/ocr' ? route.abort() : route.continue());
      await page.goto(origin);
      await page.waitForFunction(() => document.querySelector('#site option') && !document.querySelector('#screenStart').disabled);
      await openRecorder(page);
      assert.match(await page.locator('#saveStatus').textContent(), /Saved to file/);
      assert.equal(await page.locator('#screenStop').isDisabled(), true);
      await page.locator('#recorderToggle').click();
      if (!await page.locator('#games [data-v="sicbo"]').evaluate(button => button.classList.contains('on'))) await page.locator('#games [data-v="sicbo"]').click();
      await page.locator('#pad [data-key="1"]').click();
      assert.equal(await page.locator('#pending .slot.filled').count(), 1);
      await openOptions(page);
      assert.equal(await page.locator('#groupSeg').isVisible(), true);
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('#pending .slot.filled').count(), 1);
      await page.keyboard.press('2');
      assert.equal(await page.locator('#pending .slot.filled').count(), 2, 'keyboard numbers work');
      await page.locator('#clear').click();
      await openRecorder(page);
      await page.evaluate(() => {
        Object.defineProperty(navigator.mediaDevices, 'getDisplayMedia', { configurable: true, value: async () => {
          window.captureRequested = true;
          throw new DOMException('Test canceled screen selection', 'NotAllowedError');
        } });
      });
      await page.locator('#screenStart').click();
      assert.equal(await page.evaluate(() => window.captureRequested), true, 'Start invokes browser screen sharing');
      await page.waitForFunction(() => document.querySelector('#screenStatus').textContent.includes('Test canceled screen selection'));
      await page.locator('#screenImage').setInputFiles(path.join(__dirname, 'fixtures/sicbo-screen.png'));
      await waitFor(async () => /Screenshot:|already recorded/.test(await page.locator('#screenStatus').textContent()), 'running app screenshot OCR failed');
      assert.match(await page.locator('#screenStatus').textContent(), /BIG\s*16|already recorded/);
      await page.locator('#screenDetails').evaluate(el => { el.open = false; });
      await page.locator('#recorderMenu').evaluate(el => { el.open = false; });
      await page.screenshot({ path: '/tmp/betr-running-app.png' });
      assert.deepEqual(errors, [], 'running app initializes without JavaScript errors');
      console.log('Running app startup, number entry, Start, screenshot OCR and Options passed (read-only)');
    } finally { await browser.close(); }
    return;
  }
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
    await checkOptionsUI(page);
    if (!stage || ['ui', 'sicbo-ui', 'sicbo'].includes(stage)) {
      await require('./sicbo-ui')(page, file, waitFor, openOptions, fixture());
    }
    if (stage === 'sicbo-ui') {
      assert.deepEqual(errors, [], 'Sic Bo UI has no JavaScript errors');
      console.log('All Sic Bo UI browser tests passed');
      return;
    }
    await page.locator('#scopeSeg [data-v="all"]').click();
    assert.match(await page.locator('#insightContent').textContent(), /1 bust/);
    assert.doesNotMatch(await page.locator('#insightContent').textContent(), /Resetting on bust is optimal/);
    await page.locator('#scopeSeg [data-v="session"]').click();
    assert.match(await page.locator('#insightContent').textContent(), /0 busts/);
    await checkSicBoHistory(page, file);

    for (const key of ['1', '1', '2']) await page.locator(`#pad [data-key="${key}"]`).click();
    await waitFor(() => JSON.parse(fs.readFileSync(file)).books['shuff:sicbo'].entries.length === 11,
      'roll was not saved without losing historical entries');
    await page.reload();
    await page.waitForFunction(() => document.querySelector('#sessionInfo').textContent.includes('1 roll'));

    await page.locator('#games [data-v="kickoff"]').click();
    for (const key of ['5', '3']) await page.locator(`#pad [data-key="${key}"]`).click();
    await openOptions(page);
    await page.locator('#maxPlay').click();
    await page.keyboard.press('Escape');
    assert.match(await page.locator('#sessionInfo').innerText(), /1 roll/i);
    await page.locator('#games [data-v="teenpatti"]').click();
    await page.locator('#pad [data-key="wa"]').click();
    await openOptions(page);
    await page.locator('#maxPlay').click();
    await page.keyboard.press('Escape');
    assert.match(await page.locator('#sessionInfo').innerText(), /1 hand/i);
    for (const key of ['a', '2', 'k', '1', 'q', '4', 'j', '3', '9', '1', '8', '2']) await page.keyboard.press(key);
    assert.match(await page.locator('#sessionInfo').innerText(), /2 hands/i);
    await waitFor(() => JSON.parse(fs.readFileSync(file)).books['shuff:teenpatti']?.entries.length === 2,
      'Teen Patti quick and card hands were not persisted');
    assert.equal(JSON.parse(fs.readFileSync(file)).books['shuff:teenpatti'].entries[1].raw.order, 'alternating');

    const beforeImport = await page.evaluate(() => localStorage.getItem('betrplayr.v1'));
    await openOptions(page);
    await page.locator('#import').setInputFiles({
      name: 'invalid.json', mimeType: 'application/json', buffer: Buffer.from('{"sites":[],"books":{}}'),
    });
    await page.waitForFunction(() => document.querySelector('#toast').textContent.startsWith('Import failed'));
    await page.keyboard.press('Escape');
    assert.equal(await page.evaluate(() => localStorage.getItem('betrplayr.v1')), beforeImport);
    await page.reload();
    await page.waitForFunction(() => document.querySelector('#sessionInfo').textContent.includes('2 hands'));

    const hostile = fixture();
    hostile.books['shuff:sicbo'].entries[0].raw[0] = '<img src=x onerror="window.reviewMarker=1">';
    await openOptions(page);
    await page.locator('#import').setInputFiles({
      name: 'hostile.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(hostile)),
    });
    await page.waitForFunction(() => document.querySelector('#toast').textContent.startsWith('Import failed'));
    await page.keyboard.press('Escape');
    assert.equal(await page.evaluate(() => window.reviewMarker), undefined);

    await page.locator('#addSite').click();
    const name = '<img src=x onerror="window.reviewMarker=1">';
    await page.locator('#newSite').fill(name);
    await page.locator('#newSite').press('Enter');
    assert.equal(await page.locator('#site option:checked').textContent(), name);
    assert.equal(await page.locator('.topbar img').count(), 0);
    assert.equal(await page.evaluate(() => window.reviewMarker), undefined);

    await openOptions(page);
    await page.locator('#import').setInputFiles({
      name: 'valid.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(fixture())),
    });
    await page.waitForFunction(() => document.querySelector('#toast').textContent.startsWith('Backup restored'));
    await page.keyboard.press('Escape');
    await waitFor(() => {
      const saved = JSON.parse(fs.readFileSync(file));
      return saved.sites.length === 1 && saved.books['shuff:sicbo'].entries.length === 10;
    }, 'valid import was not saved');
    assert.equal(JSON.parse(fs.readFileSync(file)).books['shuff:sicbo'].entries.length, 10);
    await openOptions(page);
    await page.locator('#resetAll').click();
    await page.waitForFunction(() => document.querySelector('#toast').textContent.startsWith('All data cleared'));
    await page.keyboard.press('Escape');
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
    if (stage === 'ui') {
      assert.deepEqual(errors, []);
      console.log('All UI browser tests passed');
      return;
    }
    const capture = await browser.newPage({ viewport: { width: 960, height: 900 } });
    const reads = [];
    capture.on('response', async response => { if (response.url().endsWith('/ocr')) reads.push(await response.json()); });
    capture.on('pageerror', err => errors.push(err.message));
    await capture.goto(origin);
    await capture.waitForFunction(() => !document.querySelector('#screenStart').disabled);
    await openRecorder(capture);
    if (stage === 'teenpatti-auto') {
      await require('./teenpatti-auto-browser')(capture, file, waitFor);
      assert.deepEqual(errors, []);
      console.log('All browser tests passed');
      return;
    }
    if (stage === 'sicbo-history') {
      await require('./history-segmentation-browser')(capture);
      await require('./sicbo-history-browser')(capture, file, reads, waitFor);
      assert.deepEqual(errors, []);
      console.log('Sic Bo history-only browser checks passed');
      return;
    }
    if (stage === 'sicbo-recovery') {
      await require('./sicbo-history-browser')(capture, file, reads, waitFor);
      assert.deepEqual(errors, []);
      console.log('Sic Bo missed-roll recovery browser checks passed');
      return;
    }
    if (stage === 'sicbo-reader') {
      await require('./sicbo-history-browser')(capture, file, reads, waitFor);
      assert.deepEqual(errors, []);
      console.log('Sic Bo reader browser checks passed');
      return;
    }
    if (stage === 'watch') {
      await require('./sicbo-history-browser')(capture, file, reads, waitFor);
      assert.deepEqual(errors, []);
      await capture.close();
      console.log('All watch-area browser tests passed');
      return;
    }
    if (stage === 'split') {
      for (const game of ['teenpatti', 'kickoff']) await checkSplitOCR(capture, game, reads);
      assert.deepEqual(errors, []);
      console.log('All split-screen OCR checks passed');
      return;
    }
    await capture.locator('#screenImage').setInputFiles(path.join(__dirname, 'fixtures/sicbo-screen.png'));
    await capture.waitForFunction(() => document.querySelector('#screenStatus').textContent.includes('Select history and all three roll boxes'));
    assert.equal(await capture.locator('#screenSave').isDisabled(), true, 'a stale still cannot bypass the live three-source gate');
    assert.equal(JSON.parse(fs.readFileSync(file)).books['shuff:sicbo'].entries.length, 0);
    await capture.reload();
    await capture.waitForFunction(() => document.querySelector('#sessionInfo').textContent.includes('0 rolls'));
    await openRecorder(capture);
    for (const width of [1024, 960, 760, 600, 390]) {
      await capture.setViewportSize({ width, height: 900 });
      const layout = await capture.evaluate(() => ({
        width: innerWidth, content: Math.max(document.body.scrollWidth, document.documentElement.scrollWidth),
        stats: document.querySelector('.stats').getBoundingClientRect().toJSON(),
      }));
      assert.ok(layout.content <= layout.width, `page overflows ${width}px viewport (${layout.content}px)`);
      assert.ok(layout.stats.x >= 0 && layout.stats.right <= width, `stats clipped at ${width}px`);
      assert.ok(layout.stats.top < 900, `stats below first screen at ${width}px`);
    }
    await capture.setViewportSize({ width: 960, height: 900 });
    if (!stage || stage === 'sicbo') {
      await require('./sicbo-history-browser')(capture, file, reads, waitFor);
    }
    if (!stage || stage === 'teenpatti') {
    await capture.locator('#games [data-v="teenpatti"]').click();
    await capture.locator('#screenTeenSource').selectOption('cards');
    await capture.locator('#screenImage').setInputFiles(path.join(__dirname, 'fixtures/teenpatti-screen.png'));
    await waitFor(async () => {
      const text = await capture.locator('#screenStatus').textContent();
      if (await capture.locator('#screenSave').isEnabled()) return true;
      if (!text.startsWith('Stopped')) throw new Error(`Teen Patti screenshot read failed: ${text}`);
      return false;
    }, 'Teen Patti OCR did not finish');
    await capture.locator('#screenSave').click();
    await waitFor(() => JSON.parse(fs.readFileSync(file)).books['shuff:teenpatti']?.entries.length === 1, 'card hand not saved');
    assert.deepEqual(JSON.parse(fs.readFileSync(file)).books['shuff:teenpatti'].entries[0].raw.c, ['8s', '4c', '3c', '9c', '10c', 'Ah']);
    await require('./teenpatti-live')(capture, file, reads, waitFor, checkReloadedResult);
    await checkSplitOCR(capture, 'teenpatti', reads);
    await require('./teenpatti-auto-browser')(capture, file, waitFor);
    for (const width of [1024, 960, 760, 600, 390]) {
      await capture.setViewportSize({ width, height: 900 });
      const layout = await capture.evaluate(() => ({
        width: innerWidth, content: Math.max(document.body.scrollWidth, document.documentElement.scrollWidth),
        stats: document.querySelector('.stats').getBoundingClientRect().toJSON(),
      }));
      assert.ok(layout.content <= layout.width, `Teen Patti page overflows ${width}px viewport (${layout.content}px)`);
      assert.ok(layout.stats.x >= 0 && layout.stats.right <= width, `Teen Patti stats clipped at ${width}px`);
      assert.ok(layout.stats.top < 900, `Teen Patti stats below first screen at ${width}px`);
      if (width === 760) await capture.screenshot({ path: '/tmp/betr-teenpatti-compact.png' });
    }
    }
    if (!stage || stage === 'kickoff') {
    await capture.setViewportSize({ width: 960, height: 900 });
    await capture.locator('#games [data-v="kickoff"]').click();
    await openRecorder(capture);
    await capture.locator('#screenDetails').evaluate(el => { el.open = true; });
    await capture.locator('#screenImage').setInputFiles(path.join(__dirname, 'fixtures/kickoff-screen.png'));
    await waitFor(async () => {
      const text = await capture.locator('#screenStatus').textContent();
      if (await capture.locator('#screenSave').isEnabled()) return true;
      if (!text.startsWith('Stopped')) throw new Error(`Kickoff screenshot read failed: ${text}; ${JSON.stringify(reads.at(-1))}`);
      return false;
    }, 'Kickoff OCR did not finish');
    await capture.locator('#screenSave').click();
    await waitFor(() => JSON.parse(fs.readFileSync(file)).books['shuff:kickoff']?.entries.length === 1, 'Kickoff roll not saved');
    assert.deepEqual(JSON.parse(fs.readFileSync(file)).books['shuff:kickoff'].entries[0].raw, [6, 4]);
    const banners = await capture.evaluate(async base64 => {
      const bitmap = await createImageBitmap(new Blob([Uint8Array.from(atob(base64), c => c.charCodeAt(0))], { type: 'image/png' }));
      const frame = document.createElement('canvas'); frame.width = bitmap.width; frame.height = bitmap.height;
      const ctx = frame.getContext('2d'), results = [];
      for (const label of ['BLUE', 'DRAW']) {
        ctx.drawImage(bitmap, 0, 0);
        ctx.fillStyle = '#321d48'; ctx.fillRect(frame.width * .455, frame.height * .29, frame.width * .09, frame.height * .055);
        ctx.fillStyle = 'white'; ctx.font = 'bold 44px Arial'; ctx.textAlign = 'center';
        ctx.fillText(label, frame.width * .5, frame.height * .324);
        const read = await ScreenReader.readFrame(frame, 'kickoff');
        results.push({ label, result: read.observation?.result, message: read.message });
      }
      bitmap.close(); return results;
    }, fs.readFileSync(path.join(__dirname, 'fixtures/kickoff-screen.png')).toString('base64'));
    assert.deepEqual(banners.map(b => b.result?.side), ['B', null], `Kickoff banner crops: ${JSON.stringify(banners)}`);
    await require('./kickoff-live')(capture, file, reads, waitFor, checkReloadedResult);
    await checkSplitOCR(capture, 'kickoff', reads);
    for (const width of [1024, 960, 760, 600, 390]) {
      await capture.setViewportSize({ width, height: 900 });
      const layout = await capture.evaluate(() => ({
        width: innerWidth, content: Math.max(document.body.scrollWidth, document.documentElement.scrollWidth),
        stats: document.querySelector('.stats').getBoundingClientRect().toJSON(),
      }));
      assert.ok(layout.content <= layout.width, `Kickoff page overflows ${width}px viewport (${layout.content}px)`);
      assert.ok(layout.stats.x >= 0 && layout.stats.right <= width, `Kickoff stats clipped at ${width}px`);
      assert.ok(layout.stats.top < 900, `Kickoff stats below first screen at ${width}px`);
      if (width === 760) await capture.screenshot({ path: '/tmp/betr-kickoff-compact.png' });
    }
    }
    await capture.close();
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
