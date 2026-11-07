const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createServer } = require('../server');

function playwright() {
  for (const name of [process.env.PLAYWRIGHT_PATH, 'playwright', 'playwright-core'].filter(Boolean)) {
    try { return require(name); } catch (err) { if (err.code !== 'MODULE_NOT_FOUND') throw err; }
  }
  const links = path.join(os.homedir(), '.cache', 'ms-playwright', '.links');
  if (fs.existsSync(links)) {
    for (const file of fs.readdirSync(links)) {
      const installed = fs.readFileSync(path.join(links, file), 'utf8').trim();
      if (fs.existsSync(installed)) return require(installed);
    }
  }
  throw new Error('Playwright required: set PLAYWRIGHT_PATH to an existing playwright-core installation');
}

test('hold Space voice entry records each game only on release', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'betr-voice-'));
  const server = createServer({ dataDir: dir });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await playwright().chromium.launch({ headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage();
    await page.addInitScript(() => {
      window.SpeechRecognition = class {
        start() { window.voiceStarts = (window.voiceStarts || 0) + 1; this.onstart(); }
        stop() {
          const result = [{ transcript: window.voiceWords }]; result.isFinal = true;
          this.onresult({ resultIndex: 0, results: [result] }); this.onend();
        }
        abort() {}
      };
    });
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.waitForFunction(() => !document.querySelector('#optionsToggle').disabled);
    await page.locator('#optionsToggle').click();
    await page.locator('#voiceEntry').check();
    await page.keyboard.press('Escape');
    for (const [game, words, expected] of [
      ['sicbo', 'one six two', [1, 6, 2]],
      ['kickoff', 'six two', [6, 2]],
      ['teenpatti', 'ace spades five diamonds king hearts queen clubs ten spades two hearts', { c: ['As','5d','Kh','Qc','10s','2h'], order: 'alternating' }],
    ]) {
      await page.locator(`#games [data-v="${game}"]`).click();
      await page.evaluate(text => { window.voiceWords = text; }, words);
      await page.keyboard.down('Space');
      assert.equal(await page.evaluate(id => JSON.parse(localStorage.getItem('betrplayr.v1')).books[`shuff:${id}`]?.entries.length || 0, game), 0);
      await page.keyboard.up('Space');
      await page.waitForFunction(id => JSON.parse(localStorage.getItem('betrplayr.v1')).books[`shuff:${id}`].entries.length === 1, game);
      assert.deepEqual(await page.evaluate(id => JSON.parse(localStorage.getItem('betrplayr.v1')).books[`shuff:${id}`].entries[0].raw, game), expected);
    }
    await page.waitForFunction(() => document.querySelector('#saveStatus').textContent.includes('Saved to file'));
    const saved = JSON.parse(fs.readFileSync(path.join(dir, 'betrplayr.json')));
    for (const game of ['sicbo','kickoff','teenpatti']) assert.equal(saved.books[`shuff:${game}`].entries.length, 1);
    await page.reload();
    await page.waitForFunction(() => !document.querySelector('#optionsToggle').disabled);
    await page.locator('#optionsToggle').click();
    assert.equal(await page.locator('#voiceEntry').isChecked(), true, 'voice opt-in survives reload');
  } finally {
    await browser?.close();
    await new Promise(resolve => server.close(resolve));
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
