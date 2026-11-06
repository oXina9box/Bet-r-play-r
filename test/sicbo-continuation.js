// Actual local OCR connects a visible wager to continuation of the original Sic Bo run.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Engine = require('../js/engine');
const SicBo = require('../js/games/sicbo');
const { createDefault } = require('../js/data');

module.exports = async function checkSicBoContinuation(page, file, reads, waitFor) {
  const cfg = { n: 5, prog: 'double', unit: 1, payout: 1, waitWin: 1, waitBust: 0, waitBet: 0, recovery: 3, fibDrop: 2 };
  const prefix = ['B', 'B', 'A', 'B', 'A', 'B', 'B', 'A', 'B', 'A'];
  const seeded = { ...createDefault(), books: { 'shuff:sicbo': {
    cfg, sessions: [{ id: 'continue', start: 1 }],
    entries: prefix.map((side, i) => ({ t: i + 1, s: 'continue', cfg, raw: side === 'A' ? [2, 4, 5] : [1, 2, 3] })),
  } } };
  const saved = () => JSON.parse(fs.readFileSync(file)).books['shuff:sicbo'].entries;
  await page.locator('#optionsToggle').click();
  await page.locator('#import').setInputFiles({ name: 'sicbo-continue.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(seeded)) });
  await page.waitForFunction(() => document.querySelector('#toast').textContent.startsWith('Backup restored'));
  await page.keyboard.press('Escape');
  await waitFor(() => saved().length === 10, 'Sic Bo continuation seed not saved');
  assert.match(await page.locator('#next').innerText(), /OPTIONAL CONTINUE AFTER BUST/);
  assert.match(await page.locator('#next').innerText(), /BIG/);
  if (!await page.locator('#screenStart').isVisible()) await page.locator('#recorderToggle').click();
  reads.length = 0;
  await page.evaluate(async base64 => {
    const bitmap = await createImageBitmap(new Blob([Uint8Array.from(atob(base64), c => c.charCodeAt(0))], { type: 'image/png' }));
    const source = document.createElement('canvas'); source.width = bitmap.width; source.height = bitmap.height;
    const ctx = source.getContext('2d');
    const paint = settled => {
      ctx.drawImage(bitmap, 0, 0);
      if (!settled) { ctx.fillStyle = '#ad6d35'; ctx.fillRect(source.width * .44, source.height * .367, source.width * .12, source.height * .05); }
      ctx.fillStyle = '#151515'; ctx.fillRect(source.width * .02, source.height * .68, source.width * .12, source.height * .06);
      ctx.fillStyle = '#fff'; ctx.font = 'bold 46px Arial';
      ctx.fillText(settled ? 'GC 0' : 'GC 16', source.width * .02 + 12, source.height * .68 + 57);
    };
    paint(false);
    localStorage.setItem('betrplayr.screen.shuff.sicbo', JSON.stringify({ betA: [.02, .68, .12, .06] }));
    Object.defineProperty(navigator.mediaDevices, 'getDisplayMedia', { configurable: true, value: async () => {
      const stream = source.captureStream(2);
      setTimeout(() => { ctx.fillStyle = '#151515'; ctx.fillRect(0, 0, 1, 1); }, 100);
      return stream;
    } });
    window.finishSicBoContinuation = () => paint(true);
  }, fs.readFileSync(path.join(__dirname, 'fixtures/sicbo-screen.png')).toString('base64'));
  await page.locator('#screenStart').click();
  await waitFor(() => reads.filter(batch => batch.some(r => r.id === 'betA')).length >= 2, 'Sic Bo continued wager not read twice');
  assert.equal(saved().length, 10, 'betting phase cannot invent a completed roll');
  await page.evaluate(() => window.finishSicBoContinuation());
  await waitFor(() => saved().length === 11, 'observed continuation roll not saved');
  const result = Engine.run(saved().map(entry => ({ ...entry, ...SicBo.outcome(entry.raw) })), cfg);
  assert.deepEqual(saved().at(-1).wager, { status: 'observed', currency: 'GC', bets: [{ market: 'A', amount: 16 }] });
  assert.equal(result.rows.at(-1).setNo, result.rows[9].setNo);
  assert.equal(result.rows.at(-1).bet.continuation, true);
  assert.equal(result.rows.at(-1).setEnd, 'won');
  assert.deepEqual(saved().at(-1).raw.slice().sort(), [4, 6, 6]);
  const stats = Engine.stats(result.rows);
  assert.equal(stats.sets, 1); assert.equal(stats.won, 1); assert.equal(stats.bust, 0); assert.equal(stats.net, 1);
  assert.match(await page.locator('#observedWagers').innerText(), /GC 16\.00/);
  assert.match(await page.locator('#next').innerText(), /WIN on bet 5/);
  await page.locator('#screenStop').click();
  await page.reload();
  await page.waitForFunction(() => document.querySelector('#sessionInfo').textContent.includes('11 rolls'));
  assert.match(await page.locator('#next').innerText(), /WIN on bet 5/);
  assert.equal(await page.locator('#strip .history-group[data-set="1"]').count(), 1, 'history preserves one continued run');
  console.log('Sic Bo observed-wager continuation, accounting and reload passed');
};
