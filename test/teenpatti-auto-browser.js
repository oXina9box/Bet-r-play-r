// Generated display-stream transitions use real local OCR; the archived casino image
// independently checks the existing PLAYER B layout. Neither is a live casino test.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

module.exports = async function checkTeenPattiAuto(page, file, waitFor) {
  await page.locator('#games [data-v="teenpatti"]').click();
  if (!await page.locator('#screenStart').isVisible()) await page.locator('#recorderToggle').click();
  const original = await page.evaluate(() => {
    window.teenOriginalFetch = window.fetch;
    window.teenOriginalDisplay = navigator.mediaDevices.getDisplayMedia;
    return { site: document.querySelector('#site').value };
  });
  const key = `${original.site}:teenpatti`;
  const entries = () => JSON.parse(fs.readFileSync(file)).books[key]?.entries || [];
  const before = entries().length;
  const actual = await page.evaluate(async base64 => {
    const bitmap = await createImageBitmap(new Blob([Uint8Array.from(atob(base64), c => c.charCodeAt(0))], { type: 'image/png' }));
    const source = document.createElement('canvas'); source.width = bitmap.width; source.height = bitmap.height;
    source.getContext('2d').drawImage(bitmap, 0, 0); bitmap.close();
    const start = performance.now();
    const read = await ScreenReader.readFrame(source, 'teenpatti', { source: 'winner' });
    return { read, ms: performance.now() - start };
  }, fs.readFileSync(path.join(__dirname, 'fixtures/teenpatti-screen.png')).toString('base64'));
  assert.deepEqual(actual.read.observation?.raw, { w: 'B' }, JSON.stringify(actual));
  assert.ok(actual.read.observation.confidence >= 80);
  await page.evaluate(() => {
    const source = document.createElement('canvas'); source.width = 2048; source.height = 1153;
    const ctx = source.getContext('2d');
    window.teenTestSource = source;
    window.teenFailSave = false;
    window.teenScene = (kind, winner = 'B') => {
      ctx.fillStyle = '#1d529c'; ctx.fillRect(0, 0, source.width, source.height);
      ctx.textAlign = 'center'; ctx.fillStyle = '#fff'; ctx.font = 'bold 54px Arial';
      if (kind === 'phase' || kind === 'overlap') ctx.fillText('BETTING OPEN', 400, 310);
      if (kind === 'wrongPhase') ctx.fillText('BETTING CLOSED', 400, 310);
      if (kind === 'result' || kind === 'overlap') {
        ctx.fillStyle = '#9c821d'; ctx.fillRect(850, 360, 360, 95);
        ctx.fillStyle = '#fff'; ctx.fillText(winner === 'T' ? 'TIE' : `PLAYER ${winner}`, 1030, 430);
      }
      if (kind === 'label') ctx.fillText(`PLAYER ${winner}`, 1030, 430);
      if (kind === 'payout') ctx.fillText('PLAYER A GC 50', 1030, 430);
    };
    window.teenScene('result');
    Object.defineProperty(navigator.mediaDevices, 'getDisplayMedia', { configurable: true, value: async () => {
      const stream = source.captureStream(10);
      setTimeout(() => teenScene('result'), 50);
      return stream;
    } });
    window.fetch = async (url, options) => {
      if (url === '/data' && options?.method === 'POST' && window.teenFailSave) return Promise.resolve(new Response('test write failure', { status: 503 }));
      if (url === '/ocr' && window.teenDelayOCR) {
        window.teenDelayOCR = false;
        const response = await window.teenOriginalFetch(url, options);
        await new Promise(resolve => { window.teenReleaseOCR = resolve; });
        return response;
      }
      const response = await window.teenOriginalFetch(url, options);
      if (url === '/ocr') window.teenLastOCR = await response.clone().json();
      return response;
    };
  });
  async function draw(selector, rect) {
    await page.locator(selector).click();
    await page.waitForFunction(() => document.querySelector('#screenAreaDialog').open);
    const canvas = page.locator('#screenAreaPreview');
    await canvas.scrollIntoViewIfNeeded();
    const bounds = await canvas.boundingBox();
    const point = (x, y) => [bounds.x + x / 2048 * bounds.width, bounds.y + y / 1153 * bounds.height];
    await page.mouse.move(...point(rect[0], rect[1])); await page.mouse.down();
    await page.mouse.move(...point(rect[0] + rect[2], rect[1] + rect[3])); await page.mouse.up();
    await page.waitForFunction(() => !document.querySelector('#screenAreaDialog').open);
  }
  const waitState = phrase => page.waitForFunction(text => {
    if (!document.querySelector('#screenTeenState').textContent.includes(text)) return false;
    if (text !== 'Waiting for the winner') return true;
    const phase = window.teenLastOCR?.find(item => item.id === 'phase');
    const result = window.teenLastOCR?.find(item => item.id === 'resultTight');
    return phase?.text.trim() === 'BETTING OPEN' && phase.confidence >= 80 && !ScreenVision.parseResult('teenpatti', result?.text);
  }, phrase);
  try {
    await page.locator('#screenTeenSource').selectOption('winner');
    await page.locator('#screenTeenPhaseText').fill('BETTING OPEN');
    await page.locator('#screenTeenPhaseText').dispatchEvent('change');
    await page.locator('#screenStart').click();
    await page.waitForFunction(() => !document.querySelector('#screenStop').disabled);
    await draw('#screenSelectArea', [0, 0, 2048, 1153]);
    await draw('#screenTeenResultSelect', [850, 360, 360, 95]);
    await draw('#screenTeenPhaseSelect', [50, 250, 700, 90]);
    await page.waitForTimeout(700);
    assert.equal(entries().length, before, 'a visible result at startup is a baseline, not a new hand');
    const saved = await page.evaluate(site => ({
      regions: JSON.parse(localStorage.getItem(`betrplayr.screen.${site}.teenpatti`)),
      settings: JSON.parse(localStorage.getItem(`betrplayr.screen.${site}.teenpatti.teen`)),
    }), original.site);
    for (const region of ['result', 'phase']) assert.ok(saved.regions[region], `${region} selected through drag controls`);
    assert.equal(saved.settings.source, 'winner');
    assert.equal(saved.settings.phaseText, 'BETTING OPEN');
    assert.equal(saved.settings.width, 2048);
    assert.equal(saved.settings.height, 1153);
    assert.equal(saved.settings.result, true);
    assert.equal(saved.settings.phase, true);
    console.log('Teen Patti calibration controls passed');

    await page.evaluate(() => teenScene('wrongPhase'));
    await page.waitForFunction(() => document.querySelector('#screenTeenPhaseRead').textContent.includes('BETTING CLOSED'));
    assert.match(await page.locator('#screenTeenPhaseRead').textContent(), /check phrase or crop/);
    assert.equal(entries().length, before, 'different phase text cannot arm recording');

    // A static player label during the betting signal must not arm a new hand.
    await page.evaluate(() => teenScene('overlap', 'A'));
    await waitState('overlap');
    await page.evaluate(() => teenScene('result', 'A'));
    await page.waitForTimeout(700);
    assert.equal(entries().length, before);
    await page.evaluate(() => teenScene('phase'));
    await waitState('Waiting for the winner');
    await page.evaluate(() => teenScene('label', 'A'));
    await page.waitForTimeout(700);
    assert.equal(entries().length, before, 'a static player label is not a winner badge even after a valid phase');

    const winners = ['B', 'B', 'A', 'T', 'A', 'A', 'B', 'T', 'B', 'A'];
    const latencies = [];
    for (const [i, winner] of winners.entries()) {
      await page.evaluate(() => teenScene('phase'));
      await waitState('Waiting for the winner');
      const began = Date.now();
      await page.evaluate(value => teenScene('result', value), winner);
      try { await waitFor(() => entries().length === before + i + 1, `automatic hand ${i + 1} not persisted`); }
      catch (error) {
        const images = await page.evaluate(() => Object.fromEntries(['teenTestSource', 'screenTeenResultPreview', 'screenTeenPhasePreview'].map(id => [id, (window[id] || document.getElementById(id)).toDataURL('image/png')])));
        for (const [name, png] of Object.entries(images)) fs.writeFileSync(`/tmp/teenpatti-debug-${name}.png`, Buffer.from(png.split(',')[1], 'base64'));
        throw new Error(`${error.message}: ${JSON.stringify(await page.evaluate(() => ({
          status: document.querySelector('#screenStatus').textContent,
          state: document.querySelector('#screenTeenState').textContent,
          winner: document.querySelector('#screenTeenWinner').textContent,
          ocr: window.teenLastOCR,
        })))}`);
      }
      latencies.push(Date.now() - began);
      assert.equal(entries().at(-1).raw.w, winner);
      await page.waitForTimeout(250);
      assert.equal(entries().length, before + i + 1, 'rereading the same banner cannot duplicate a hand');
    }
    const recorded = entries().slice(before);
    assert.deepEqual(recorded.map(entry => entry.raw.w), winners);
    assert.equal(new Set(recorded.map(entry => entry.screen.round)).size, winners.length);
    assert.ok(recorded.every(entry => entry.wager.status === 'unknown'));
    assert.ok(recorded.every(entry => entry.screen.confidence >= 80));
    assert.ok(Math.max(...latencies) < 2500, `synthetic result visibility budget exceeded: ${latencies}`);

    await page.evaluate(() => teenScene('blank'));
    await page.waitForTimeout(1700);
    await page.evaluate(() => teenScene('result', 'A'));
    await page.waitForTimeout(700);
    assert.equal(entries().length, before + winners.length, 'OCR absence alone cannot arm another hand');
    await page.locator('#screenStop').click();
    await page.locator('#screenStart').click();
    await page.waitForFunction(() => !document.querySelector('#screenTeenConfirm').disabled);
    await page.locator('#screenTeenConfirm').click();
    await page.waitForTimeout(700);
    assert.equal(entries().length, before + winners.length, 'restart retains the current result as baseline');

    await page.evaluate(() => teenScene('phase'));
    await waitState('Waiting for the winner');
    await page.locator('#pad [data-key="r:2"]').click();
    const pending = await page.locator('#pending').innerHTML();
    await page.evaluate(() => teenScene('result', 'B'));
    await waitState('finish manual entry');
    assert.equal(await page.locator('#pending').innerHTML(), pending, 'automatic reading preserves partial manual entry');
    assert.equal(entries().length, before + winners.length);
    const sessionBefore = await page.locator('#sessionInfo').textContent();
    await page.locator('#optionsToggle').click();
    await page.locator('#newSession').click();
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#sessionInfo').textContent(), sessionBefore, 'a new session cannot strand a verified pending hand');
    await page.locator('#games [data-v="kickoff"]').click();
    assert.equal(await page.locator('body').getAttribute('data-game'), 'teenpatti', 'switching games cannot strand a verified pending hand');
    assert.equal(await page.locator('#pending').innerHTML(), pending);
    await page.locator('#clear').click();
    await waitFor(() => entries().length === before + winners.length + 1, 'verified hand did not retry after manual input cleared');
    const savedBeforeFailure = before + winners.length + 1;

    // An accepted record must remain in local data and retry after file writes recover.
    await page.evaluate(() => { teenFailSave = true; teenScene('phase'); });
    await waitState('Waiting for the winner');
    await page.evaluate(() => teenScene('result', 'B'));
    await page.waitForFunction(({ site, expected }) => JSON.parse(localStorage.getItem('betrplayr.v1')).books[`${site}:teenpatti`].entries.length === expected,
      { site: original.site, expected: savedBeforeFailure + 1 });
    await page.waitForTimeout(700);
    assert.equal(entries().length, savedBeforeFailure, 'failed disk write is not reported as durable data');
    assert.doesNotMatch(await page.locator('#saveStatus').textContent(), /Saved to file/);
    await page.evaluate(() => { teenFailSave = false; });
    await waitFor(() => entries().length === savedBeforeFailure + 1, 'failed disk write did not retry');
    await page.waitForTimeout(400);
    assert.equal(entries().length, savedBeforeFailure + 1, 'retry must not duplicate the accepted hand');

    await page.evaluate(() => { teenDelayOCR = true; teenScene('phase'); });
    await page.waitForFunction(() => typeof window.teenReleaseOCR === 'function');
    await page.locator('#optionsToggle').click();
    await page.locator('#newSession').click();
    await page.keyboard.press('Escape');
    await page.evaluate(() => teenReleaseOCR());
    await page.waitForTimeout(500);
    assert.equal(entries().length, savedBeforeFailure + 1, 'late OCR cannot add an old result to a new session');
    await page.evaluate(() => { teenTestSource.width = 1948; teenScene('phase'); });
    await page.locator('#screenStart').click();
    await page.waitForFunction(() => !document.querySelector('#screenStop').disabled);
    await page.waitForFunction(() => /size changed|Select result and phase/.test(document.querySelector('#screenStatus').textContent));
    assert.equal(await page.locator('#screenTeenConfirm').isEnabled(), false, 'changed source dimensions require new calibration');
    await page.waitForTimeout(300);
    assert.equal(entries().length, savedBeforeFailure + 1, 'source resizing cannot use incompatible calibration');

    if (await page.locator('#screenStop').isEnabled()) await page.locator('#screenStop').click();
    await page.reload();
    await page.waitForFunction(() => !document.querySelector('#screenStart').disabled);
    assert.equal(await page.locator('#screenTeenSource').inputValue(), 'winner');
    assert.equal(await page.locator('#screenTeenPhaseText').inputValue(), 'BETTING OPEN');
    assert.equal(entries().length, savedBeforeFailure + 1);
    const download = page.waitForEvent('download');
    await page.locator('#optionsToggle').click();
    await page.locator('#export').click();
    const chunks = [];
    for await (const chunk of await (await download).createReadStream()) chunks.push(chunk);
    const backup = JSON.parse(Buffer.concat(chunks).toString());
    assert.deepEqual(backup.books[key].entries, entries(), 'export preserves automatic outcomes and metadata');
    await page.keyboard.press('Escape');
    console.log(`Teen Patti generated-stream capture-to-disk ms: ${JSON.stringify(latencies)}; archived B read ${Math.round(actual.ms)}ms`);
    console.log('Teen Patti sustained auto-record and recovery passed');
  } finally {
    await page.evaluate(() => {
      document.querySelector('#screenStop')?.click();
      if (window.teenOriginalFetch) window.fetch = window.teenOriginalFetch;
      if (window.teenOriginalDisplay) Object.defineProperty(navigator.mediaDevices, 'getDisplayMedia', { configurable: true, value: window.teenOriginalDisplay });
    });
  }
};
