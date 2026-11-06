const assert = require('node:assert/strict');
const fs = require('node:fs');

// This helper runs only against browser.test.js's temporary server and data file.
module.exports = async function checkSicBoUI(page, file, waitFor, openOptions, original) {
  const { createDefault } = require('../js/data');
  const cfg = { n: 5, prog: 'double', unit: 1, payout: 1, waitBust: 0, waitWin: 1, waitBet: 0, recovery: 0, fibDrop: 2 };
  const seed = {
    ...createDefault(), savedAt: Date.now(),
    books: { 'shuff:sicbo': {
      cfg, sessions: [{ id: 'controls', start: 1 }],
      entries: Array.from({ length: 6 }, (_, i) => ({ t: i + 2, s: 'controls', raw: [2, 4, 5], cfg: { ...cfg } })),
    } },
  };
  const saved = () => JSON.parse(fs.readFileSync(file));
  async function importState(state) {
    await openOptions(page);
    await page.locator('#import').setInputFiles({ name: 'sicbo-controls.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(state)) });
    await page.waitForFunction(() => document.querySelector('#toast').textContent.startsWith('Backup restored'));
    await page.keyboard.press('Escape');
    await waitFor(() => JSON.stringify(saved().books) === JSON.stringify(state.books), 'Sic Bo control fixture not saved');
  }
  await importState(seed);
  assert.match(await page.locator('#next').textContent(), /BET 1 of 4/);
  assert.equal(await page.locator('#next #skipBetOnce').isVisible(), true, 'skip is part of advice');

  // Capture platform calls, proving announcements without relying on audio hardware.
  await page.evaluate(() => {
    window.testSpeech = [];
    window.testSpeechCancels = 0;
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: {
      cancel() { window.testSpeechCancels++; }, speak(utterance) { window.testSpeech.push(utterance.text); },
    } });
    window.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
    window.testKeys = [];
    document.addEventListener('keydown', event => {
      if (/^[1-6]$/.test(event.key)) window.testKeys.push({ key: event.key, prevented: event.defaultPrevented });
    });
  });
  await openOptions(page);
  await page.locator('#audioFeedback').check();
  await page.keyboard.press('Escape');
  await page.locator('#skipBetOnce').click();
  assert.match(await page.locator('#skipBetOnce').textContent(), /Cancel one-time skip/);
  assert.match(await page.evaluate(() => testSpeech.at(-1)), /skip|no bet/i, 'arming skip announces no bet');
  await page.locator('#pending').click();
  for (const key of ['6', '2', '3']) await page.keyboard.press(key);
  await waitFor(() => saved().books['shuff:sicbo'].entries.length === 7, 'skipped roll not persisted');
  assert.deepEqual(saved().books['shuff:sicbo'].entries[6].raw, [6, 2, 3]);
  assert.equal(saved().books['shuff:sicbo'].entries[6].nb, true);
  assert.ok(await page.evaluate(() => testKeys.length === 3 && testKeys.every(event => event.prevented)),
    'handled dice numbers suppress browser quick-find');
  assert.match(await page.locator('#next').textContent(), /NO BET.*skipped/);
  assert.match(await page.locator('#skipBetOnce').textContent(), /^Skip this bet once$/,
    'skip automatically disarms after one result');
  assert.ok(await page.evaluate(() => testSpeech.some(text => /Roll: 6, 2, 3/.test(text) && /BIG/.test(text) && /Bet SMALL, 1\.00/.test(text))),
    'spoken feedback includes entered dice and next side/stake');
  assert.match(await page.evaluate(() => testSpeech.at(-1)), /skip|no bet/i, 'spoken result acknowledges skipped wager');
  for (const key of ['2', '4', '5']) await page.keyboard.press(key);
  await waitFor(() => saved().books['shuff:sicbo'].entries.length === 8, 'next roll not persisted');
  assert.equal(saved().books['shuff:sicbo'].entries[7].nb, undefined, 'only one roll was skipped');

  await openOptions(page);
  const beforeMute = await page.evaluate(() => ({ spoken: testSpeech.length, canceled: testSpeechCancels }));
  await page.locator('#audioFeedback').uncheck();
  assert.ok(await page.evaluate(() => testSpeechCancels) > beforeMute.canceled, 'audio off cancels current utterance');
  await page.keyboard.press('Escape');
  for (const key of ['2', '4', '5']) await page.keyboard.press(key);
  await waitFor(() => saved().books['shuff:sicbo'].entries.length === 9, 'muted roll not persisted');
  assert.equal(await page.evaluate(() => testSpeech.length), beforeMute.spoken, 'muted entry stays silent');
  await openOptions(page);
  await page.locator('#audioFeedback').check();
  await page.locator('#waitWinSeg [data-v="4"]').click();
  await page.locator('#waitBetSeg [data-v="3"]').click();
  await page.keyboard.press('Escape');
  await waitFor(() => saved().books['shuff:sicbo'].cfg.waitWin === 4 && saved().books['shuff:sicbo'].cfg.waitBet === 3 && saved().audioFeedback === true,
    'Sic Bo waits/audio options not saved');
  await page.reload();
  await page.waitForFunction(() => document.querySelector('#sessionInfo').textContent.includes('9 rolls'));
  await openOptions(page);
  assert.equal(await page.locator('#audioFeedback').isChecked(), true, 'audio preference survives reload');
  assert.equal(await page.locator('#waitWinSeg [data-v="4"]').getAttribute('class'), 'on');
  assert.equal(await page.locator('#waitBetSeg [data-v="3"]').getAttribute('class'), 'on');
  await page.locator('#audioFeedback').uncheck();
  await page.keyboard.press('Escape');

  for (const [width, height] of [[960, 900], [760, 900], [650, 900], [600, 800], [522, 828], [390, 900]]) {
    await page.setViewportSize({ width, height });
    const layout = await page.evaluate(() => {
      const bounds = selector => document.querySelector(selector).getBoundingClientRect().toJSON();
      return { advice: bounds('#next'), entry: bounds('.entry'), actions: bounds('.entry-actions'),
        history: bounds('#strip'), stats: bounds('.stats'), recorder: bounds('#recorderToggle'), options: bounds('#optionsToggle'),
        header: bounds('.topbar'), historyPanel: bounds('.strip-wrap'),
        height: Math.max(document.body.scrollHeight, document.documentElement.scrollHeight),
        statsOverflow: document.querySelector('.stats').scrollHeight - document.querySelector('.stats').clientHeight,
        adviceOverflow: document.querySelector('#next').scrollHeight - document.querySelector('#next').clientHeight,
        width: Math.max(document.body.scrollWidth, document.documentElement.scrollWidth) };
    });
    assert.ok(layout.width <= width, `Sic Bo page overflows ${width}px`);
    assert.ok(layout.entry.top >= layout.advice.bottom && layout.entry.top - layout.advice.bottom <= 12,
      `dice input must sit directly below advice at ${width}px`);
    assert.ok(layout.actions.bottom < height, `dice/action controls below fold at ${width}px`);
    assert.ok(layout.recorder.bottom <= layout.header.bottom && layout.options.bottom <= layout.header.bottom,
      'Recorder and Options stay in header');
    assert.ok(Math.abs(layout.recorder.top - layout.options.top) <= 3, 'Recorder sits beside Options');
    assert.ok(layout.options.left - layout.recorder.right <= 12, 'Recorder and Options remain adjacent');
    if (width >= 520) {
      await openOptions(page);
      const optOverflow = await page.locator('#optionsMenu').evaluate(el => el.scrollHeight - el.clientHeight);
      assert.ok(optOverflow <= 1, `Options panel must not scroll at ${width}x${height} (overflow ${optOverflow}px)`);
      await page.keyboard.press('Escape');
    }
    if (width >= 390) {
      assert.ok(Math.abs(layout.historyPanel.top - layout.advice.top) <= 2, `history must share the top row with advice at ${width}px`);
      assert.ok(layout.historyPanel.left >= layout.advice.right, `history must occupy the right half at ${width}px`);
      assert.ok(Math.abs(layout.historyPanel.height - layout.advice.height) <= 2, `top row panels must share a height at ${width}px`);
      for (const panel of [layout.entry, layout.stats]) {
        assert.ok(Math.abs(panel.left - layout.advice.left) <= 2 && Math.abs(panel.right - layout.historyPanel.right) <= 2,
          `all panels below the top row must use the full width at ${width}px`);
      }
      assert.ok(layout.stats.top >= layout.actions.bottom, `statistics must follow dice entry at ${width}px`);
      assert.ok(layout.historyPanel.bottom <= height && layout.stats.bottom <= height, `history and statistics must fit above fold at ${width}x${height}`);
      assert.ok(layout.height <= height, `the Sic Bo page must not scroll at ${width}x${height}`);
      assert.ok(layout.statsOverflow <= 1, `statistics cannot be clipped to fake a fit at ${width}x${height}`);
      assert.ok(layout.adviceOverflow <= 1, `advice and skip controls must fit inside the top card at ${width}px`);
    }
  }
  assert.equal(await page.locator('#sicboRolls').count(), 0, 'duplicate lower roll-by-roll panel is removed');
  await page.setViewportSize({ width: 650, height: 900 });
  await page.screenshot({ path: '/tmp/betr-sicbo-controls.png' });
  await page.locator('#skipBetOnce').click();
  await openOptions(page);
  await page.locator('#newSession').click();
  await page.keyboard.press('Escape');
  assert.match(await page.locator('#sessionInfo').textContent(), /Session #2.*0 rolls/);
  assert.doesNotMatch(await page.locator('#noBet').textContent(), /ARMED/, 'new session clears pending skip');
  for (const key of ['1', '2', '3']) await page.keyboard.press(key);
  await waitFor(() => saved().books['shuff:sicbo'].entries.length === 10, 'new-session result not saved');
  assert.equal(saved().books['shuff:sicbo'].entries[9].nb, undefined, 'skip cannot leak into a new session');
  await importState(original);
  console.log('Sic Bo keyboard, one-time skip, spoken feedback, wait settings and compact layout passed');
};
