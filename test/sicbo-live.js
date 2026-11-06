// Real OCR with a browser-generated display stream; no casino interaction.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
module.exports = async function checkSicBoLive(page, file, reads, waitFor, checkReloadedResult) {
  await page.locator('#optionsToggle').click();
  await page.locator('#resetAll').click();
  await page.waitForFunction(() => document.querySelector('#sessionInfo').textContent.includes('0 rolls'));
  await page.keyboard.press('Escape');
  reads.length = 0;
  await page.evaluate(async base64 => {
    const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
    const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
    const c = document.createElement('canvas'); c.width = bitmap.width; c.height = bitmap.height;
    const ctx = c.getContext('2d');
    function scene(settled) {
      ctx.drawImage(bitmap, 0, 0);
      if (!settled) { ctx.fillStyle = '#ad6d35'; ctx.fillRect(c.width * .44, c.height * .367, c.width * .12, c.height * .05); }
      ctx.fillStyle = '#151515'; ctx.fillRect(c.width * .02, c.height * .68, c.width * .12, c.height * .06);
      ctx.fillStyle = 'white'; ctx.font = 'bold 46px Arial';
      ctx.fillText(settled ? 'GC 0' : 'GC 50', c.width * .02 + 12, c.height * .68 + 57);
    }
    scene(false);
    localStorage.setItem('betrplayr.screen.shuff.sicbo', JSON.stringify({ betA: [.02, .68, .12, .06] }));
    Object.defineProperty(navigator.mediaDevices, 'getDisplayMedia', { configurable: true, value: async () => {
      const stream = c.captureStream(2);
      setTimeout(() => { ctx.fillStyle = '#151515'; ctx.fillRect(0, 0, 1, 1); }, 100);
      return stream;
    } });
    window.finishTestRoll = () => scene(true);
  }, fs.readFileSync(path.join(__dirname, 'fixtures/sicbo-screen.png')).toString('base64'));
  const startedAt = Date.now();
  await page.locator('#screenStart').click();
  try { await waitFor(() => reads.filter(batch => batch.some(r => r.id === 'betA')).length >= 2, 'pre-result wagers not read twice'); }
  catch (err) { throw new Error(`${err.message}: ${await page.locator('#screenStatus').textContent()}; ${JSON.stringify(reads.slice(-2))}`); }
  await page.waitForFunction(() => document.querySelector('#screenStatus').textContent.includes('Waiting for a completed result banner'));
  assert.equal(JSON.parse(fs.readFileSync(file)).books['shuff:sicbo'].entries.length, 0, 'visible dice during betting cannot record a round');
  await page.evaluate(() => window.finishTestRoll());
  await waitFor(() => JSON.parse(fs.readFileSync(file)).books['shuff:sicbo'].entries.length === 1, 'live settled roll not saved');
  const saved = JSON.parse(fs.readFileSync(file)).books['shuff:sicbo'].entries[0];
  assert.deepEqual(saved.raw.slice().sort(), [4, 6, 6]);
  assert.match(saved.screen.round, /^\d{13}$/);
  assert.ok(Number(saved.screen.round) >= startedAt && Number(saved.screen.round) <= Date.now());
  assert.ok(saved.screen.capturedAt >= startedAt && saved.screen.capturedAt <= Date.now());
  assert.deepEqual(saved.wager, { status: 'observed', currency: 'GC', bets: [{ market: 'A', amount: 50 }] }, 'settlement zero must preserve observed pre-result stake');
  await page.waitForFunction(() => document.querySelector('#screenStatus').textContent.includes('already recorded'));
  assert.equal(JSON.parse(fs.readFileSync(file)).books['shuff:sicbo'].entries.length, 1, 'live repeated frames are deduplicated');
  await page.locator('#screenStop').click();
  assert.equal(await page.locator('#screenStart').isEnabled(), true);
  await page.locator('#screenStart').click();
  await page.waitForFunction(() => document.querySelector('#screenStatus').textContent.includes('already recorded'));
  await page.locator('#screenStop').click();
  await page.reload();
  await page.waitForFunction(() => document.querySelector('#sessionInfo').textContent.includes('1 roll'));
  await checkReloadedResult(page, 'sicbo');
  assert.equal(JSON.parse(fs.readFileSync(file)).books['shuff:sicbo'].entries.length, 1, 'reload and a fresh sharing stream cannot duplicate the settled roll');
  assert.equal(JSON.parse(fs.readFileSync(file)).books['shuff:sicbo'].entries[0].wager.bets[0].amount, 50);
  console.log('Sic Bo live capture, phase gating, wagers, stop/restart and persistence passed');
};
