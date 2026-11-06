// History-only Sic Bo integration: real screenshot OCR plus controlled live strip transitions.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createDefault, validate } = require('../js/data');

module.exports = async function checkSicBoHistoryReader(page, file, reads, waitFor) {
  await require('./sicbo-reader-browser')(page);
  await page.locator('#optionsToggle').click();
  await page.locator('#resetAll').click();
  await page.waitForFunction(() => document.querySelector('#sessionInfo').textContent.includes('0 rolls'));
  await page.keyboard.press('Escape');
  await waitFor(() => JSON.parse(fs.readFileSync(file)).books['shuff:sicbo']?.entries.length === 0, 'history test state was not reset');
  const seed = validate({ ...createDefault(), savedAt: Date.now(), books: { 'shuff:sicbo': {
    cfg: { n: 5, prog: 'double', unit: 1, payout: 1, waitBust: 0, waitWin: 0, waitBet: 0, recovery: 0, fibDrop: 2 },
    sessions: [{ id: 'history-reader', start: Date.now() - 1000 }], entries: [],
  } } });
  const seedFile = `${file}.sicbo-history-seed.json`;
  fs.writeFileSync(seedFile, JSON.stringify(seed));
  await page.locator('#optionsToggle').click();
  await page.locator('#import').setInputFiles(seedFile);
  await waitFor(() => JSON.parse(fs.readFileSync(file)).books['shuff:sicbo']?.sessions[0]?.id === 'history-reader', 'history session fixture was not imported');
  await page.keyboard.press('Escape');
  await page.evaluate(() => localStorage.removeItem('betrplayr.sicbo.regions.shuff'));
  await page.reload();
  await page.waitForFunction(() => document.querySelector('#screenStart') && !document.querySelector('#screenStart').disabled);
  if (!await page.locator('#screenStart').isVisible()) await page.locator('#recorderToggle').click();
  assert.equal(await page.locator('#screenSicBoCalibration [data-screen-region]').count(), 1);
  assert.equal(await page.locator('#screenHistorySelect').isVisible(), true);
  for (const id of ['screenDiceSelect', 'screenBannerSelect', 'screenDicePreview', 'screenBannerPreview']) {
    assert.equal(await page.locator(`#${id}`).count(), 0, `${id} must not appear in the history-only UI`);
  }

  // This checked-in crop is an actual casino history column, including its total.
  const actual = await page.evaluate(async base64 => {
    const bitmap = await createImageBitmap(new Blob([Uint8Array.from(atob(base64), c => c.charCodeAt(0))], { type: 'image/png' }));
    const source = document.createElement('canvas'); source.width = bitmap.width; source.height = bitmap.height;
    source.getContext('2d').drawImage(bitmap, 0, 0); bitmap.close();
    const normalized = rect => rect.map((v, i) => v / (i % 2 ? source.height : source.width));
    const profile = { v: 2, width: source.width, height: source.height, revision: 1, direction: 'left',
      regions: { history: normalized([8, 8, 91, 179]) }, rolls: {
        newest: normalized([40, 44, 37, 126]), previous: normalized([8, 10, 29, 175]), twoBack: normalized([78, 10, 20, 175]),
      } };
    const originalFetch = window.fetch.bind(window), submitted = [], responses = [];
    window.fetch = async (url, options) => {
      if (url !== '/ocr') return originalFetch(url, options);
      const images = JSON.parse(options.body).images;
      submitted.push(...images);
      const response = await originalFetch(url, options);
      responses.push(...await response.clone().json());
      return response;
    };
    try {
      const read = await ScreenReader.readSicBoFrame(source, profile);
      const beforeBlank = submitted.length;
      source.getContext('2d').fillStyle = '#282828'; source.getContext('2d').fillRect(0, 0, source.width, source.height);
      const blank = await ScreenReader.readSicBoFrame(source, profile);
      return { history: read.readings.history, histories: read.readings.histories,
        blank, blankOCRCalls: submitted.length - beforeBlank,
        hasDice: Object.hasOwn(read.readings, 'dice'), hasBanner: Object.hasOwn(read.readings, 'banner'), submitted, responses };
    } finally { window.fetch = originalFetch; }
  }, fs.readFileSync(path.join(__dirname, 'fixtures/sicbo-history-10.png')).toString('base64'));
  for (const image of actual.submitted) if (image.png) fs.writeFileSync(`/tmp/betr-history10-${image.id}.png`, Buffer.from(image.png.split(',')[1], 'base64'));
  console.log(`Sic Bo actual history crop OCR diagnostics: ${JSON.stringify({ images: actual.submitted.map(({ id, width, height }) => ({ id, width, height })), responses: actual.responses })}`);
  assert.equal(actual.hasDice, false, 'history reader does not return physical dice');
  assert.equal(actual.hasBanner, false, 'history reader does not return a result banner');
  assert.equal(actual.history.total, 10, `real casino history total: ${JSON.stringify(actual.history)}`);
  assert.deepEqual(actual.history.values, [2, 2, 6], `real casino history dice: ${JSON.stringify(actual.history)}`);
  assert.ok(actual.history.confidence > 0);
  assert.match(actual.blank.message, /insufficient image detail/i, 'flat capture is identified before OCR');
  assert.equal(actual.blankOCRCalls, 0, 'blank history never becomes an OCR baseline');
  assert.deepEqual(actual.histories.map(item => item && [item.total, item.values]), [[10, [2, 2, 6]], null, null], 'explicit boxes read only their own pixels');

  const normalized = rect => rect.map((v, i) => v / (i % 2 ? 800 : 1200));
  const historyRect = [760, 300, 210, 240];
  const profile = { v: 2, width: 1200, height: 800, revision: 1, direction: 'left', regions: { history: normalized(historyRect) }, rolls: {
    newest: normalized([760, 300, 70, 240]), previous: normalized([830, 300, 70, 240]), twoBack: normalized([900, 300, 70, 240]),
  } };
  await page.evaluate(profile => {
    localStorage.setItem('betrplayr.sicbo.regions.shuff', JSON.stringify(profile));
    const source = document.createElement('canvas'); source.width = 1200; source.height = 800;
    let context = source.getContext('2d');
    const columns = [[13, [4, 4, 5]], [10, [2, 2, 6]], [16, [4, 6, 6]]];
    let phase = 'preroll', timer = 4, invalidLatest = false, blank = true, realOCR = false;
    function paint() {
      context.fillStyle = '#222'; context.fillRect(0, 0, 1200, 800);
      // Physical dice and banner intentionally change independently of history.
      context.fillStyle = '#9b311d'; context.fillRect(40, 40, 180, 120);
      context.fillStyle = '#fff'; context.font = 'bold 48px Arial'; context.fillText(phase === 'betting' ? '6 6 6' : '1 1 1', 50, 110);
      context.fillStyle = '#ddd'; context.fillRect(740, 100, 340, 70);
      context.fillStyle = '#111'; context.font = 'bold 40px Arial'; context.fillText(phase === 'betting' ? `BETTING 0${timer}` : 'BIG 16', 760, 150);
      columns.forEach(([total, dice], index) => {
        const x = 760 + index * 70;
        context.fillStyle = blank ? '#282828' : '#eee'; context.fillRect(x, 300, 70, 240);
        if (blank) return;
        context.fillStyle = '#111'; context.font = 'bold 32px Arial'; context.textAlign = 'center';
        [total, ...dice].forEach((value, row) => context.fillText(String(value), x + 35, 330 + row * 58));
      });
      window.historyTrack?.requestFrame();
    }
    window.historyScene = (next, nextTimer = timer) => { phase = next; timer = nextTimer; paint(); };
    window.historyShift = next => { columns.unshift(next); columns.length = 3; paint(); };
    window.historySetInvalid = value => { invalidLatest = value; };
    window.historyBlank = value => { blank = value; paint(); };
    window.historyResize = width => { source.width = width; context = source.getContext('2d'); paint(); };
    window.historyRealOCR = value => { realOCR = value; };
    window.historyRealReads = 0;
    window.historyOCRResponses = [];
    window.historySource = source;
    window.historyReads = [];
    const originalFetch = window.fetch.bind(window);
    window.historyOriginalFetch = originalFetch;
    window.historyOriginalDisplayMedia = Object.getOwnPropertyDescriptor(navigator.mediaDevices, 'getDisplayMedia') || null;
    window.fetch = async (url, options) => {
      if (url !== '/ocr') return originalFetch(url, options);
      if (realOCR) { window.historyRealReads++; const response = await originalFetch(url, options); window.historyOCRResponses.push(...await response.clone().json()); return response; }
      const images = JSON.parse(options.body).images;
      window.historyReads.push(images.map(({ id }) => id));
      const responses = images.map(({ id }) => {
        const match = /^history(?:(\d)_)?([0-3])$/.exec(id);
        const column = match?.[1] ? Number(match[1]) : 0;
        const values = [columns[column][0], ...columns[column][1]];
        const text = !match ? '' : invalidLatest && column === 0 ? 'unreadable' : String(values[Number(match[2])]);
        return { id, text, confidence: text ? 96 : 0 };
      });
      return new Response(JSON.stringify(responses), { status: 200, headers: { 'Content-Type': 'application/json' } });
    };
    paint();
    Object.defineProperty(navigator.mediaDevices, 'getDisplayMedia', { configurable: true, value: async () => {
      const stream = source.captureStream(2); window.historyTrack = stream.getVideoTracks()[0];
      setTimeout(paint, 100); return stream;
    } });
  }, profile);
  reads.length = 0;
  const entries = () => JSON.parse(fs.readFileSync(file)).books['shuff:sicbo']?.entries || [];
  await page.evaluate(() => historyBlank(false));
  await page.locator('#screenStart').click();
  await page.waitForTimeout(700);
  assert.equal(entries().length, 0, 'sharing only prepares capture and never records');
  assert.equal(await page.locator('#screenAreaDialog').evaluate(el => el.open), true, 'each shared source requires current crop confirmation');
  await page.locator('#screenAreaCancel').click();
  await page.waitForTimeout(1200);
  assert.equal(await page.locator('#screenSyncStart').isEnabled(), false, 'canceling confirmation cannot reactivate an old crop even when it contains readable numbers');
  await page.evaluate(() => historyBlank(true));
  await page.locator('#screenHistorySelect').click();
  const editor = await page.locator('#screenAreaPreview').boundingBox();
  await page.mouse.move(editor.x + editor.width * 760 / 1200, editor.y + editor.height * 300 / 800);
  await page.mouse.down();
  await page.mouse.move(editor.x + editor.width * 970 / 1200, editor.y + editor.height * 540 / 800);
  await page.mouse.up();
  await page.waitForFunction(() => !document.querySelector('#screenAreaDialog').open);
  const historyPreviewLocator = page.locator('#screenHistoryCalibrationPreview');
  async function markRoll(name, key, x) {
    await page.locator(`#screenRoll${name}Select`).click();
    await historyPreviewLocator.scrollIntoViewIfNeeded();
    const historyPreview = await historyPreviewLocator.boundingBox();
    await page.mouse.move(historyPreview.x + (x - 760) / 210 * historyPreview.width, historyPreview.y);
    await page.mouse.down();
    await page.mouse.move(historyPreview.x + (x - 760 + 70) / 210 * historyPreview.width, historyPreview.y + historyPreview.height);
    await page.mouse.up();
    await page.waitForFunction(key => Boolean(JSON.parse(localStorage.getItem('betrplayr.sicbo.regions.shuff')).rolls[key]), key);
  }
  await markRoll('Newest', 'newest', 760);
  await page.locator('#screenRollPreviousSelect').click();
  await historyPreviewLocator.scrollIntoViewIfNeeded();
  const overlapPreview = await historyPreviewLocator.boundingBox();
  await page.mouse.move(overlapPreview.x + 2, overlapPreview.y + 2);
  await page.mouse.down();
  await page.mouse.move(overlapPreview.x + 68, overlapPreview.y + overlapPreview.height - 2);
  await page.mouse.up();
  await page.waitForFunction(() => document.querySelector('#screenRollPreviousStatus').textContent.includes('not overlap'));
  await markRoll('Previous', 'previous', 830);
  await markRoll('TwoBack', 'twoBack', 900);
  const savedRegion = await page.evaluate(() => JSON.parse(localStorage.getItem('betrplayr.sicbo.regions.shuff')).regions.history);
  for (const [i, value] of profile.regions.history.entries()) assert.ok(Math.abs(savedRegion[i] - value) < .005, 'drawn section remains in capture coordinates');
  const savedRolls = await page.evaluate(() => JSON.parse(localStorage.getItem('betrplayr.sicbo.regions.shuff')).rolls);
  assert.deepEqual(Object.keys(savedRolls), ['newest', 'previous', 'twoBack']);
  await page.waitForTimeout(700);
  assert.equal(entries().length, 0, 'drawing waits for the user to sync timing');
  assert.equal(await page.locator('#screenSyncStart').isEnabled(), false, 'blank crops cannot start recording even if OCR is mocked to return valid numbers');
  assert.match(await page.locator('#screenStatus').textContent(), /insufficient image detail/i);
  for (const label of ['Newest', 'Previous', 'TwoBack']) assert.match(await page.locator(`#screenRoll${label}Status`).textContent(), /insufficient image detail/i);
  assert.notEqual(await page.locator('#screenCaptureIndicator').textContent(), 'Recording');
  assert.equal(await page.locator('#screenSourcePreview').isVisible(), true, 'actual shared source remains visible before sync');
  await page.evaluate(() => historyResize(1280));
  await page.waitForFunction(() => document.querySelector('#screenStatus').textContent.includes('size changed'));
  assert.equal(await page.locator('#screenSyncStart').isEnabled(), false, 'source resizing invalidates the saved crop boxes');
  await page.evaluate(() => historyResize(1200));
  await page.evaluate(() => { historyRealOCR(true); historyBlank(false); });
  try { await page.waitForFunction(() => !document.querySelector('#screenSyncStart').disabled); }
  catch (error) { throw new Error(`calibrated boxes did not pass OCR: ${JSON.stringify(await page.evaluate(() => ({ status: document.querySelector('#screenStatus').textContent, rolls: ['Newest', 'Previous', 'TwoBack'].map(name => document.querySelector(`#screenRoll${name}Status`).textContent), ocr: historyOCRResponses.slice(-20), profile: JSON.parse(localStorage.getItem('betrplayr.sicbo.regions.shuff')) })))}; ${error.message}`); }
  assert.equal(await page.locator('#screenSyncStart').isEnabled(), true);
  await page.locator('#screenSyncStart').click();
  await page.waitForTimeout(1200);
  assert.match(await page.locator('#screenTimingStatus').textContent(), /Synced/);
  await page.evaluate(() => historyScene('betting', 4));
  await page.evaluate(() => historyScene('betting', 3));
  await page.waitForTimeout(4200);
  assert.equal(entries().length, 0, 'timer, physical dice and banner changes cannot add a roll');
  assert.equal(await page.locator('#rollRecovery').isVisible(), false, 'preroll changes do not trigger a manual alert');

  await page.evaluate(() => historyShift([16, [4, 6, 6]]));
  try { await waitFor(() => entries().length === 1, 'first appended history column was not recorded'); }
  catch (error) {
    const live = await page.evaluate(() => ({ status: document.querySelector('#screenStatus').textContent,
      history: document.querySelector('#screenHistoryStatus').textContent,
      recovery: document.querySelector('#rollRecovery').outerHTML,
      ocrIds: historyReads }));
    throw new Error(`${error.message}: ${JSON.stringify(live)}`);
  }
  assert.deepEqual(entries()[0].raw.slice().sort(), [4, 6, 6]);
  assert.ok(await page.evaluate(() => historyRealReads > 0), 'first live roll goes through real pixel OCR, not the data-derived mock');
  await page.evaluate(() => historyRealOCR(false));
  await page.evaluate(() => historyShift([16, [4, 6, 6]]));
  await waitFor(() => entries().length === 2, 'identical total and dice with fresh neighbors was not recorded');
  assert.deepEqual(entries()[1].raw.slice().sort(), [4, 6, 6]);
  await page.evaluate(() => historyBlank(true));
  await page.waitForTimeout(800);
  assert.notEqual(await page.locator('#screenCaptureIndicator').textContent(), 'Recording', 'a disappearing crop cannot keep claiming verified recording');
  assert.equal(entries().length, 2, 'blank frames do not become rolls');
  await page.evaluate(() => historyBlank(false));
  await page.waitForTimeout(700);

  await page.evaluate(() => { historySetInvalid(true); historyShift([10, [2, 2, 6]]); });
  await page.waitForTimeout(3500);
  assert.equal(entries().length, 2, 'unread newest-column OCR stays pending');
  assert.notEqual(await page.locator('#rollRecovery').getAttribute('data-state'), 'manual', 'failed history never forces manual input');
  assert.equal(JSON.parse(fs.readFileSync(file)).books['shuff:sicbo'].sessions.at(-1).endedAt, undefined);
  assert.ok(await page.evaluate(() => historyReads.some(ids => ids.includes('history1_1'))), 'reader also samples previous history columns');
  await page.locator('#screenSyncStart').click();
  await page.locator('#screenHistorySelect').click();
  assert.equal(await page.locator('#screenAreaDialog').evaluate(el => el.open), false, 'crop edits cannot erase unresolved history');
  await page.locator('#screenHistoryDirection').selectOption('right');
  assert.equal(await page.locator('#screenHistoryDirection').inputValue(), 'left', 'direction cannot reset pending history');
  for (const key of ['2', '2', '6']) await page.keyboard.press(key);
  assert.equal(entries().length, 2, 'manual entry cannot discard an unresolved earlier result');

  // A new result moves the unread roll to the previous column. Recover oldest first.
  await page.evaluate(() => { historySetInvalid(false); historyShift([13, [4, 4, 5]]); });
  await waitFor(() => entries().length === 4, 'previous unread roll and newest result were not recovered');
  assert.deepEqual(entries().slice(2).map(entry => entry.raw), [[2, 2, 6], [4, 4, 5]]);
  assert.ok(entries().every(entry => entry.wager.status === 'unknown'), 'current wagers are never assigned to historical results');
  await page.waitForTimeout(1500);
  assert.equal(entries().length, 4, 'stable rereads cannot duplicate recovered results');

  // More than 35 seconds without a shift is a retry, not a manual or end deadline.
  await page.evaluate(() => {
    const originalNow = Date.now;
    window.historyOriginalNow = originalNow;
    Date.now = () => originalNow() + 40000;
  });
  await page.waitForFunction(() => document.querySelector('#screenTimingStatus').textContent.includes('retrying'), null, { timeout: 3000 });
  await page.waitForTimeout(1500);
  assert.equal(entries().length, 4, '35-second cadence cannot invent a round from unchanged history');
  assert.notEqual(await page.locator('#rollRecovery').getAttribute('data-state'), 'manual');
  assert.equal(JSON.parse(fs.readFileSync(file)).books['shuff:sicbo'].sessions.at(-1).endedAt, undefined, 'retry does not end a session');
  await page.locator('#screenStop').click();
  await page.locator('#screenStart').click();
  await page.waitForFunction(() => document.querySelector('#screenAreaDialog').open);
  assert.equal(await page.locator('#screenAreaUseSaved').isVisible(), true, 'matching v2 profile offers explicit reuse');
  await page.locator('#screenAreaCancel').click();
  await page.waitForTimeout(500);
  assert.equal(await page.locator('#screenSyncStart').isEnabled(), false, 'cancel leaves a saved profile unconfirmed');
  await page.locator('#screenStart').click();
  await page.waitForFunction(() => document.querySelector('#screenAreaDialog').open);
  await page.locator('#screenAreaUseSaved').click();
  await page.waitForFunction(() => !document.querySelector('#screenSyncStart').disabled);
  assert.equal(entries().length, 4, 'confirming the saved baseline does not replay historical rolls');
  await page.locator('#screenStop').click();
  await page.evaluate(() => {
    if (window.historyOriginalFetch) window.fetch = window.historyOriginalFetch;
    if (window.historyOriginalNow) Date.now = window.historyOriginalNow;
    if (window.historyOriginalDisplayMedia) Object.defineProperty(navigator.mediaDevices, 'getDisplayMedia', window.historyOriginalDisplayMedia);
    else delete navigator.mediaDevices.getDisplayMedia;
    delete window.historyOriginalFetch; delete window.historyOriginalNow; delete window.historyOriginalDisplayMedia;
  });
};
