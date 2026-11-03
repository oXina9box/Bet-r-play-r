// Real dice OCR through a browser-generated display stream; no casino interaction.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { validate } = require('../js/data');
module.exports = async function checkKickoffLive(page, file, reads, waitFor, checkReloadedResult) {
  await page.locator('#optionsToggle').click();
  await page.locator('#resetAll').click();
  await page.waitForFunction(() => document.querySelector('#sessionInfo').textContent.includes('0 rolls'));
  await page.keyboard.press('Escape');
  await page.locator('#games [data-v="kickoff"]').click();
  reads.length = 0;
  await page.evaluate(async base64 => {
    const bitmap = await createImageBitmap(new Blob([Uint8Array.from(atob(base64), c => c.charCodeAt(0))], { type: 'image/png' }));
    const c = document.createElement('canvas'); c.width = bitmap.width; c.height = bitmap.height;
    const ctx = c.getContext('2d');
    function scene(phase) {
      ctx.drawImage(bitmap, 0, 0);
      if (phase === 'betting') { ctx.fillStyle = '#511b45'; ctx.fillRect(c.width * .480, c.height * .298, c.width * .043, c.height * .033); }
      if (phase === 'covered') { ctx.fillStyle = '#151515'; ctx.fillRect(c.width * .54, c.height * .14, c.width * .25, c.height * .23); }
      for (const [y, amount] of [[.78, 100], [.86, 20]]) {
        ctx.fillStyle = '#151515'; ctx.fillRect(c.width * .02 - 5, c.height * y - 5, c.width * .15 + 10, c.height * .06 + 10);
        ctx.fillStyle = 'white'; ctx.font = 'bold 46px Arial';
        ctx.fillText(`GC ${phase === 'betting' ? amount : 0}`, c.width * .02 + 12, c.height * y + 57);
      }
    }
    scene('betting');
    localStorage.setItem('betrplayr.screen.shuff.kickoff', JSON.stringify({ betA: [.02, .78, .15, .06], betSCORE_64: [.02, .86, .15, .06] }));
    Object.defineProperty(navigator.mediaDevices, 'getDisplayMedia', { configurable: true, value: async () => {
      const stream = c.captureStream(2);
      setTimeout(() => { ctx.fillStyle = '#151515'; ctx.fillRect(0, 0, 1, 1); }, 100);
      return stream;
    } });
    window.showTestKickoff = scene;
  }, fs.readFileSync(path.join(__dirname, 'fixtures/kickoff-screen.png')).toString('base64'));
  const startedAt = Date.now();
  await page.locator('#screenStart').click();
  await waitFor(() => reads.filter(batch => batch.some(r => r.id === 'betA')).length >= 2, 'Kickoff stakes not read twice');
  await page.waitForFunction(() => document.querySelector('#screenStatus').textContent.includes('Waiting for a completed result banner'));
  const stakeReads = reads.filter(batch => batch.some(r => r.id === 'betA')).slice(0, 2);
  const entries = () => JSON.parse(fs.readFileSync(file)).books['shuff:kickoff'].entries;
  assert.equal(entries().length, 0, 'visible dice cannot record without a completed result');
  await page.evaluate(() => window.showTestKickoff('covered'));
  await page.waitForFunction(() => document.querySelector('#screenStatus').textContent.includes('Dice unclear'));
  assert.equal(entries().length, 0, 'a winner banner cannot record without both dice');
  await page.evaluate(() => window.showTestKickoff('settled'));
  try { await waitFor(() => entries().length === 1, 'Kickoff live roll not saved'); }
  catch (err) { throw new Error(`${err.message}: ${await page.locator('#screenStatus').textContent()}; ${JSON.stringify(reads.slice(-2))}`); }
  const [saved] = entries();
  assert.deepEqual(saved.raw, [6, 4], 'stored die order is red then blue');
  assert.match(saved.screen.round, /^\d{13}$/);
  assert.ok(Number(saved.screen.round) >= startedAt && Number(saved.screen.round) <= Date.now());
  assert.ok(saved.screen.capturedAt >= startedAt && saved.screen.capturedAt <= Date.now());
  assert.equal(saved.screen.result, 'RED');
  assert.deepEqual(saved.wager, { status: 'observed', currency: 'GC', bets: [{ market: 'A', amount: 100 }, { market: 'SCORE_64', amount: 20 }] }, JSON.stringify(stakeReads));
  await page.waitForFunction(() => document.querySelector('#screenStatus').textContent.includes('already recorded'));
  assert.equal(entries().length, 1);
  await page.locator('#screenStop').click();
  await page.locator('#screenStart').click();
  await page.waitForFunction(() => document.querySelector('#screenStatus').textContent.includes('already recorded'));
  await page.locator('#screenStop').click();
  assert.equal(entries().length, 1, 'restart cannot duplicate the roll');
  await page.reload();
  await page.waitForFunction(() => document.querySelector('#sessionInfo').textContent.includes('1 roll'));
  await checkReloadedResult(page, 'kickoff');
  assert.equal(entries().length, 1, 'reload and a fresh sharing stream cannot duplicate the settled roll');
  assert.deepEqual(entries()[0], saved, 'reload preserves dice and metadata');
  const downloaded = page.waitForEvent('download');
  await page.locator('#optionsToggle').click();
  await page.locator('#export').click();
  await page.keyboard.press('Escape');
  const chunks = [];
  for await (const chunk of await (await downloaded).createReadStream()) chunks.push(chunk);
  assert.deepEqual(validate(JSON.parse(Buffer.concat(chunks).toString())).books['shuff:kickoff'].entries[0], saved);
  console.log('Kickoff live capture, ordered dice, phase gating, wagers and persistence passed');
};
