// Full-hand OCR through a browser-generated display stream; no casino interaction.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { validate } = require('../js/data');
module.exports = async function checkTeenPattiLive(page, file, reads, waitFor, checkReloadedResult) {
  await page.locator('#optionsToggle').click();
  await page.locator('#resetAll').click();
  await page.waitForFunction(() => document.querySelector('#sessionInfo').textContent.includes('0 rolls'));
  await page.keyboard.press('Escape');
  await page.locator('#games [data-v="teenpatti"]').click();
  reads.length = 0;
  await page.evaluate(async base64 => {
    const bitmap = await createImageBitmap(new Blob([Uint8Array.from(atob(base64), c => c.charCodeAt(0))], { type: 'image/png' }));
    const c = document.createElement('canvas'); c.width = bitmap.width; c.height = bitmap.height;
    const ctx = c.getContext('2d');
    function scene(phase) {
      ctx.drawImage(bitmap, 0, 0);
      if (phase === 'betting') { ctx.fillStyle = '#1d529c'; ctx.fillRect(c.width * .44, c.height * .32, c.width * .13, c.height * .065); }
      if (phase === 'covered') { ctx.fillStyle = '#1d529c'; ctx.fillRect(c.width * .275, c.height * .54, c.width * .075, c.height * .13); }
      if (phase === 'betting') {
        ctx.fillStyle = '#111'; ctx.fillRect(c.width * .02, c.height * .2, c.width * .3, c.height * .07);
        ctx.fillStyle = '#fff'; ctx.font = 'bold 46px Arial';
        ctx.fillText('BETTING OPEN', c.width * .02 + 12, c.height * .2 + 60);
      }
      for (const [y, amount] of [[.68, 50], [.76, 10]]) {
        ctx.fillStyle = '#151515'; ctx.fillRect(c.width * .02, c.height * y, c.width * .13, c.height * .06);
        ctx.fillStyle = 'white'; ctx.font = 'bold 46px Arial';
        ctx.fillText(`GC ${phase === 'betting' ? amount : 0}`, c.width * .02 + 12, c.height * y + 57);
      }
    }
    scene('betting');
    localStorage.setItem('betrplayr.screen.shuff.teenpatti', JSON.stringify({ table: [0, 0, 1, 1], result: [.44, .32, .13, .065], phase: [.02, .2, .3, .07], betB: [.02, .68, .13, .06], betB_PLUS: [.02, .76, .13, .06] }));
    localStorage.setItem('betrplayr.screen.shuff.teenpatti.teen', JSON.stringify({ source: 'cards', phaseText: 'BETTING OPEN', width: c.width, height: c.height, result: true, phase: true }));
    Object.defineProperty(navigator.mediaDevices, 'getDisplayMedia', { configurable: true, value: async () => {
      const stream = c.captureStream(2);
      setTimeout(() => { ctx.fillStyle = '#151515'; ctx.fillRect(0, 0, 1, 1); }, 100);
      return stream;
    } });
    window.showTestHand = scene;
  }, fs.readFileSync(path.join(__dirname, 'fixtures/teenpatti-screen.png')).toString('base64'));
  const startedAt = Date.now();
  await page.locator('#screenStart').click();
  await page.waitForFunction(() => !document.querySelector('#screenTeenConfirm').disabled);
  await page.locator('#screenTeenConfirm').click();
  try { await waitFor(() => reads.filter(batch => batch.some(r => r.id === 'betB')).length >= 2, 'Teen Patti stakes not read twice'); }
  catch (error) { throw new Error(`${error.message}: ${await page.locator('#screenStatus').textContent()}; ${JSON.stringify(reads.slice(-3))}`); }
  await page.waitForFunction(() => document.querySelector('#screenTeenState').textContent.includes('Waiting for the winner'));
  await page.waitForTimeout(1700);
  const entries = () => JSON.parse(fs.readFileSync(file)).books['shuff:teenpatti'].entries;
  assert.equal(entries().length, 0, 'six stale physical cards and panel cards cannot record without a result');
  await page.evaluate(() => window.showTestHand('covered'));
  await page.waitForFunction(() => document.querySelector('#screenStatus').textContent.includes('Waiting for six unobstructed cards'));
  assert.equal(entries().length, 0, 'a result banner cannot commit an incomplete hand');
  await page.evaluate(() => window.showTestHand('settled'));
  try { await waitFor(() => entries().length === 1, 'Teen Patti live hand not saved'); }
  catch (err) { throw new Error(`${err.message}: ${await page.locator('#screenStatus').textContent()}; ${JSON.stringify(reads.slice(-2))}`); }
  const [saved] = entries();
  assert.deepEqual(saved.raw, { c: ['8s', '4c', '3c', '9c', '10c', 'Ah'] });
  assert.match(saved.screen.round, /^\d{13}$/);
  assert.ok(Number(saved.screen.round) >= startedAt && Number(saved.screen.round) <= Date.now());
  assert.ok(saved.screen.capturedAt >= startedAt && saved.screen.capturedAt <= Date.now());
  assert.match(saved.screen.result, /^PLAYER\s*B$/);
  assert.deepEqual(saved.wager, { status: 'observed', currency: 'GC', bets: [{ market: 'B', amount: 50 }, { market: 'B_PLUS', amount: 10 }] });
  await page.waitForFunction(() => document.querySelector('#screenTeenState').textContent.includes('Waiting for the next round phase'));
  assert.equal(entries().length, 1);
  await page.locator('#screenStop').click();
  await page.locator('#screenStart').click();
  await page.waitForFunction(() => !document.querySelector('#screenTeenConfirm').disabled);
  await page.locator('#screenTeenConfirm').click();
  await page.waitForFunction(() => document.querySelector('#screenTeenState').textContent.includes('Waiting for the next round phase'));
  await page.locator('#screenStop').click();
  assert.equal(entries().length, 1, 'restart cannot duplicate a completed hand');
  await page.reload();
  await page.waitForFunction(() => document.querySelector('#sessionInfo').textContent.includes('1 hand'));
  await checkReloadedResult(page, 'teenpatti');
  assert.equal(entries().length, 1, 'reload and a fresh sharing stream cannot duplicate the settled hand');
  assert.deepEqual(entries()[0], saved, 'reload preserves full hand and metadata');
  const downloaded = page.waitForEvent('download');
  await page.locator('#optionsToggle').click();
  await page.locator('#export').click();
  await page.keyboard.press('Escape');
  const chunks = [];
  for await (const chunk of await (await downloaded).createReadStream()) chunks.push(chunk);
  const backup = validate(JSON.parse(Buffer.concat(chunks).toString()));
  assert.deepEqual(backup.books['shuff:teenpatti'].entries[0], saved, 'export preserves grouped order, round and observed bets');
  console.log('Teen Patti live capture, full hands, phase gating, wagers and persistence passed');
};
