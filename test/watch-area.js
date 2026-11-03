// Direct watch-area drawing on a shared desktop; all persistence uses the test server.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

module.exports = async function checkWatchArea(page, file, reads, waitFor) {
  await page.setViewportSize({ width: 960, height: 900 });
  await page.locator('#optionsToggle').click();
  await page.locator('#resetAll').click();
  await page.waitForFunction(() => document.querySelector('#sessionInfo').textContent.includes('0 rolls'));
  await page.keyboard.press('Escape');
  await waitFor(() => {
    const saved = JSON.parse(fs.readFileSync(file));
    return saved.cur.game === 'sicbo' && Object.values(saved.books).every(book => book.entries.length === 0);
  }, 'watch-area test reset not persisted before reload');
  await page.reload();
  await page.waitForFunction(() => !document.querySelector('#screenStart').disabled);
  await page.locator('#recorderToggle').click();
  reads.length = 0;
  const key = 'betrplayr.screen.shuff.sicbo';
  await page.evaluate(async ({ base64, key }) => {
    localStorage.removeItem(key);
    const bitmap = await createImageBitmap(new Blob([Uint8Array.from(atob(base64), c => c.charCodeAt(0))], { type: 'image/png' }));
    const source = document.createElement('canvas'); source.width = 2560; source.height = 1440;
    const ctx = source.getContext('2d'), x = 160, y = 180, width = 1920, height = 1080;
    window.showWatchScene = settled => {
      ctx.fillStyle = '#151515'; ctx.fillRect(0, 0, source.width, source.height);
      ctx.drawImage(bitmap, x, y, width, height);
      if (!settled) { ctx.fillStyle = '#ad6d35'; ctx.fillRect(x + width * .44, y + height * .367, width * .12, height * .05); }
      // The casino footer is unreadable; round identity must come from the PC.
      ctx.fillStyle = '#151515'; ctx.fillRect(x, y + height * .95, width, height * .05);
    };
    window.showWatchScene(false);
    window.watchShareRequests = 0;
    Object.defineProperty(navigator.mediaDevices, 'getDisplayMedia', { configurable: true, value: async () => {
      window.watchShareRequests++;
      const stream = source.captureStream(2);
      window.watchTrack = stream.getVideoTracks()[0];
      setTimeout(() => { ctx.fillStyle = '#151515'; ctx.fillRect(0, 0, 1, 1); }, 100);
      return stream;
    } });
  }, { base64: fs.readFileSync(path.join(__dirname, 'fixtures/sicbo-screen.png')).toString('base64'), key });

  const entries = () => JSON.parse(fs.readFileSync(file)).books['shuff:sicbo'].entries;
  const area = () => page.evaluate(key => JSON.parse(localStorage.getItem(key) || '{}').table, key);
  const shared = () => page.evaluate(() => ({ requests: window.watchShareRequests, state: window.watchTrack.readyState }));
  async function openEditor() {
    await page.locator('#screenSelectArea').click();
    await page.waitForFunction(() => document.querySelector('#screenAreaDialog').open);
    assert.equal(await page.locator('#screenAreaHint').isVisible(), true);
  }
  async function drag(from, to) {
    const box = await page.locator('#screenAreaPreview').boundingBox();
    assert.ok(box && box.width > 0 && box.height > 0, 'editor displays the whole shared frame');
    await page.mouse.move(box.x + box.width * from[0], box.y + box.height * from[1]);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * to[0], box.y + box.height * to[1], { steps: 6 });
    await page.mouse.up();
  }
  async function closed() { await page.waitForFunction(() => !document.querySelector('#screenAreaDialog').open); }

  // The direct action requests sharing itself; no Start or advanced region dropdown is needed.
  const startedAt = Date.now();
  await openEditor();
  assert.deepEqual(await shared(), { requests: 1, state: 'live' });
  await drag([.4, .4], [.401, .401]);
  assert.equal(await page.locator('#screenAreaDialog').evaluate(dialog => dialog.open), true, 'a tiny gesture keeps the editor open');
  assert.equal(await area(), undefined, 'invalid selection cannot replace the watch area');
  await page.evaluate(() => window.showWatchScene(false));
  await page.locator('#screenAreaCancel').click();
  await closed();
  assert.equal(await area(), undefined);
  assert.deepEqual(await shared(), { requests: 1, state: 'live' }, 'cancel keeps the existing sharing stream');

  await openEditor();
  await page.keyboard.press('Escape');
  await closed();
  assert.deepEqual(await shared(), { requests: 1, state: 'live' }, 'Escape does not open another sharing chooser');
  assert.equal(await area(), undefined);

  await openEditor();
  await page.evaluate(() => window.showWatchScene(true));
  await page.waitForTimeout(4000);
  assert.equal(entries().length, 0, 'completed results cannot record while the editor is open');
  // Draw bottom-right to top-left, selecting only the game inside the shared desktop.
  await drag([.8125, .875], [.0625, .125]);
  await closed();
  const selected = await area(), expected = [.0625, .125, .75, .75];
  assert.ok(selected && selected.every((value, i) => Math.abs(value - expected[i]) < .005), `watch region normalized to full frame: ${JSON.stringify(selected)}`);
  assert.deepEqual(await shared(), { requests: 1, state: 'live' }, 'valid selection resumes the same sharing track');
  try { await waitFor(() => entries().length === 1, 'selected watch area did not resume automatic recording'); }
  catch (error) { throw new Error(`${error.message}: ${await page.locator('#screenStatus').textContent()}; ${JSON.stringify(reads.slice(-2))}`); }
  assert.deepEqual(entries()[0].raw.slice().sort(), [4, 6, 6]);
  assert.match(entries()[0].screen.round, /^\d{13}$/);
  assert.ok(Number(entries()[0].screen.round) >= startedAt && Number(entries()[0].screen.round) <= Date.now(), 'covered casino footer cannot block the PC-timed roll');
  assert.ok(entries()[0].screen.capturedAt >= startedAt && entries()[0].screen.capturedAt <= Date.now());
  await page.waitForFunction(() => document.querySelector('#screenStatus').textContent.includes('already recorded'));

  await openEditor();
  await page.evaluate(() => window.showWatchScene(true));
  await drag([.3, .3], [.301, .301]);
  assert.equal(await page.locator('#screenAreaDialog').evaluate(dialog => dialog.open), true);
  assert.deepEqual(await area(), selected, 'tiny drag preserves an existing watch area');
  await page.waitForTimeout(4000);
  assert.equal(entries().length, 1, 'editing cannot record another copy of a completed result');
  await page.evaluate(() => window.showWatchScene(true));
  await page.locator('#screenAreaCancel').click();
  await closed();
  assert.deepEqual(await area(), selected, 'cancel preserves the saved watch area');
  await page.waitForFunction(() => document.querySelector('#screenStatus').textContent.includes('already recorded'));
  await openEditor();
  await page.keyboard.press('Escape');
  await closed();
  assert.deepEqual(await area(), selected, 'Escape preserves the saved watch area');
  assert.deepEqual(await shared(), { requests: 1, state: 'live' });
  assert.equal(entries().length, 1, 'drawing, cancelling and repeated frames cannot duplicate a round');
  await page.locator('#screenStop').click();
  assert.equal((await shared()).state, 'ended');
  await page.reload();
  await page.waitForFunction(() => document.querySelector('#sessionInfo').textContent.includes('1 roll'));
  await page.locator('#recorderToggle').click();
  assert.deepEqual(await area(), selected, 'watch area survives reload');
  console.log('Direct watch-area sharing, reverse drawing, pause/resume, cancellation and persistence passed');
};
