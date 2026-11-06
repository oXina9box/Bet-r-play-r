// Recovery fallback timing and persistence through a synthetic browser capture stream.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { gunzipSync } = require('node:zlib');
const { createDefault, validate } = require('../js/data');

module.exports = async function checkSicBoRecovery(page, file, reads, waitFor) {
  assert.ok(path.resolve(file).startsWith(os.tmpdir() + path.sep), 'recovery integration requires temporary data');
  const start = Date.now() - 1000;
  const seed = validate({ ...createDefault(), savedAt: Date.now(), books: { 'shuff:sicbo': {
    cfg: { n: 5, prog: 'double', unit: 1, payout: 1, waitBust: 0, waitWin: 0, waitBet: 0, recovery: 0, fibDrop: 2 },
    sessions: [{ id: 'manual-test', start }], entries: [],
  } } });
  const seedFile = `${file}.sicbo-recovery-seed.json`;
  fs.writeFileSync(seedFile, JSON.stringify(seed));
  if (!await page.locator('#optionsMenu').evaluate(menu => menu.matches(':popover-open'))) await page.locator('#optionsToggle').click();
  await page.locator('#import').setInputFiles(seedFile);
  await waitFor(() => JSON.parse(fs.readFileSync(file)).books['shuff:sicbo']?.sessions[0]?.id === 'manual-test',
    'temporary seeded session was not persisted through import');
  await page.keyboard.press('Escape');

  const profileKey = 'betrplayr.sicbo.regions.shuff';
  const pixel = (x, y, w, h) => [x / w, y / h];
  const rect = (x, y, w, h, fw = 1200, fh = 800) => [...pixel(x, y, fw, fh), ...pixel(w, h, fw, fh)];
  await page.evaluate(({ key, profile }) => localStorage.setItem(key, JSON.stringify(profile)), {
    key: profileKey,
    profile: { v: 1, width: 1200, height: 800, revision: 1, direction: 'left', regions: {
      dice: rect(50, 50, 593, 563), result: rect(760, 100, 360, 80), history: rect(760, 300, 70, 240),
    } },
  });
  await page.reload();
  await page.waitForFunction(() => document.querySelector('#screenStart') && !document.querySelector('#screenStart').disabled);
  if (!await page.locator('#screenStart').isVisible()) await page.locator('#recorderToggle').click();
  reads.length = 0;

  const fixture = path.join(__dirname, 'fixtures/sicbo-physical/pypWTt.rgba.gz');
  await page.evaluate(({ pixels }) => {
    const raw = Uint8Array.from(atob(pixels), character => character.charCodeAt(0));
    const physical = document.createElement('canvas'); physical.width = 593; physical.height = 563;
    physical.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(raw), 593, 563), 0, 0);
    const source = document.createElement('canvas'); source.width = 1200; source.height = 800;
    const context = source.getContext('2d');
    let phase = 'betting', cycle = 0;
    const historyByCycle = [[13, 4, 4, 5], [16, 4, 6, 6], [10, 3, 3, 4]];
    function scene(nextPhase, nextCycle = cycle) {
      phase = nextPhase; cycle = nextCycle;
      context.fillStyle = '#222'; context.fillRect(0, 0, source.width, source.height);
      context.drawImage(physical, 50, 50);
      if (phase === 'betting') {
        context.beginPath(); context.arc(335, 335, 32, 0, Math.PI * 2);
        context.strokeStyle = '#a8ff00'; context.lineWidth = 5; context.stroke();
        context.fillStyle = '#fff'; context.font = 'bold 28px Arial'; context.textAlign = 'center'; context.textBaseline = 'middle';
        context.fillText(cycle ? '14' : '15', 335, 335);
      }
      context.fillStyle = '#dedede'; context.fillRect(760, 100, 360, 80);
      context.fillStyle = '#111'; context.font = 'bold 48px Arial'; context.textAlign = 'center'; context.textBaseline = 'middle';
      context.fillText(phase === 'betting' ? 'BETTING' : cycle === 1 ? 'BIG 16' : 'SMALL 10', 940, 140);
      const values = historyByCycle[cycle];
      for (let row = 0; row < 4; row++) {
        context.fillStyle = '#eee'; context.fillRect(760, 300 + row * 60, 70, 60);
        context.fillStyle = '#111'; context.font = 'bold 34px Arial'; context.fillText(String(values[row]), 795, 330 + row * 60);
      }
      // Keep adjacent history columns visually distinct for the reader fingerprint.
      for (let col = 1; col <= 2; col++) {
        context.fillStyle = col === 1 ? '#d0d0d0' : '#aaa'; context.fillRect(760 + col * 70, 300, 70, 240);
        context.fillStyle = '#111'; context.font = 'bold 30px Arial'; context.fillText(String(10 + col + cycle), 795 + col * 70, 330);
      }
      window.recoveryTrack?.requestFrame();
    }
    window.recoveryScene = scene;
    window.recoveryState = () => ({ phase, cycle });
    window.holdRecoveryOCR = false;
    window.recoveryReadCount = 0;
    window.fetch = ((originalFetch) => (url, options) => {
      if (url !== '/ocr') return originalFetch(url, options);
      if (window.holdRecoveryOCR) return new Promise(() => {});
      window.recoveryReadCount++;
      const current = historyByCycle[cycle];
      const textFor = id => id.startsWith('result') ? (phase === 'betting' ? '' : cycle === 1 ? 'BIG 16' : 'SMALL 10')
        : id === 'timer' ? '15' : /^history[0-3]$/.test(id) ? String(current[Number(id.slice(-1))]) : '';
      return Promise.resolve(new Response(JSON.stringify(JSON.parse(options.body).images.map(({ id }) => ({ id, text: textFor(id), confidence: 96 }))),
        { status: 200, headers: { 'Content-Type': 'application/json' } }));
    })(window.fetch.bind(window));
    scene('betting');
    Object.defineProperty(navigator.mediaDevices, 'getDisplayMedia', { configurable: true, value: async () => {
      const stream = source.captureStream(2);
      window.recoveryTrack = stream.getVideoTracks()[0];
      setTimeout(() => scene('betting'), 100);
      return stream;
    } });
  }, { pixels: gunzipSync(fs.readFileSync(fixture)).toString('base64') });

  const saved = () => JSON.parse(fs.readFileSync(file)).books['shuff:sicbo'];
  const session = () => saved().sessions.at(-1);
  const entries = () => saved().entries;
  const initialSessionId = 'manual-test';
  const initialCount = entries().length;
  await page.locator('#screenStart').click();
  await page.waitForFunction(() => document.querySelector('#screenStatus').textContent.toLowerCase().includes('history baseline captured'), null,
    { timeout: 10000 });
  await page.evaluate(() => { window.holdRecoveryOCR = true; });
  const detectedAt = Date.now();
  await page.evaluate(() => recoveryScene('complete', 1));

  try { await page.waitForFunction(() => !document.querySelector('#rollRecovery').hidden, null, { timeout: 3500 }); }
  catch (error) { throw new Error(`manual recovery alert did not appear within 3.5s: ${await page.locator('#screenStatus').textContent()}; ${error.message}`); }
  const promptAt = Date.now();
  assert.ok(promptAt - detectedAt <= 3500, 'visual fallback prompts promptly while OCR requests are unresolved');
  assert.match(await page.locator('#rollRecoveryMessage').textContent(), /three|3.*dice|numbers/i, 'alert requests all three dice');
  assert.match(await page.locator('#rollRecoveryCountdown').textContent(), /15s|15 seconds|15/i, 'manual entry window starts at fifteen seconds');
  assert.equal(await page.locator('#next').isVisible(), true, 'bet advice remains visible');
  assert.equal(await page.locator('#pad').isVisible(), true, 'existing dice pad remains visible');
  assert.equal(await page.locator('.entry').isVisible(), true, 'existing three-die entry stays available');
  assert.equal(await page.evaluate(() => Math.max(document.documentElement.scrollHeight, document.body.scrollHeight) <= innerHeight), true,
    'the fallback fits without page scrolling');
  assert.equal(session().id, initialSessionId, `manual prompt must stay in its original session: ${JSON.stringify(saved().sessions)}`);
  assert.equal(entries().length, initialCount, 'blocked OCR cannot create a fake entry');

  for (const key of ['1', '2', '3']) await page.keyboard.press(key);
  await waitFor(() => entries().length === initialCount + 1, 'manual fallback did not save exactly one roll');
  const manualEntry = entries().at(-1);
  assert.deepEqual(manualEntry.raw, [1, 2, 3]);
  assert.equal(manualEntry.s, initialSessionId, 'manual dice remain in the original session');
  assert.equal(manualEntry.screen, undefined, 'manual dice are not attributed to OCR');
  assert.equal(entries().length, initialCount + 1, 'manual completion saves exactly once');

  const readCount = await page.evaluate(() => window.recoveryReadCount);
  await page.evaluate(() => { window.holdRecoveryOCR = false; recoveryScene('betting', 1); });
  await page.waitForFunction(previous => window.recoveryReadCount >= previous + 3 && document.querySelector('#screenStatus').textContent.includes('history baseline captured'), readCount,
    { timeout: 10000 });
  await page.evaluate(() => { window.holdRecoveryOCR = true; });
  const secondDetectedAt = Date.now();
  await page.evaluate(() => recoveryScene('complete', 2));
  await page.waitForFunction(() => !document.querySelector('#rollRecovery').hidden && document.querySelector('#rollRecovery').dataset.state === 'manual', null,
    { timeout: 3500 });
  const secondPromptAt = Date.now();
  const secondStartCount = entries().length;
  assert.equal(secondStartCount, initialCount + 1, 'unresolved second roll has no entry');
  await page.waitForFunction(() => document.querySelector('#rollRecovery').dataset.state === 'ended', null,
    { timeout: 16000 });
  await waitFor(() => session().endedAt !== undefined, 'missed-roll session end was not persisted');
  const ended = session();
  assert.ok(ended.endedAt >= secondPromptAt + 14500 && ended.endedAt <= Date.now(),
    `session end is persisted at the recovery deadline (${JSON.stringify({ secondPromptAt, endedAt: ended.endedAt, now: Date.now() })})`);
  assert.equal(ended.endReason, 'missed-roll');
  assert.equal(entries().length, secondStartCount, 'missed second roll does not create an entry');
  assert.ok(Date.now() - secondPromptAt >= 14500 && Date.now() - secondPromptAt <= 16000, 'manual window lasts fifteen seconds from notification');
  assert.ok(secondPromptAt - secondDetectedAt <= 3500);
  await page.reload();
  await page.waitForFunction(() => document.querySelector('#rollRecovery').dataset.state === 'ended');
  assert.equal(session().endedAt, ended.endedAt, 'ended UI restores from persisted session data');
  assert.equal(await page.locator('#rollRecovery').isVisible(), true);
  assert.equal(await page.locator('#pad').isVisible(), true);
  for (const key of ['4', '5', '6']) await page.keyboard.press(key);
  await page.waitForTimeout(100);
  assert.equal(entries().length, secondStartCount, 'ended session rejects further dice input');

  const sessionCount = saved().sessions.length;
  const resume = page.locator('#resumeSession');
  if (await resume.count()) await resume.click();
  else await page.locator('#newSession').click();
  await waitFor(() => saved().sessions.length === sessionCount + 1, 'new session action did not start a fresh session');
  assert.equal(session().endedAt, undefined, 'explicit new session clears ended state even when empty');
  assert.equal(entries().length, secondStartCount);
  console.log('Sic Bo visual recovery prompt, manual resolution, deadline, persistence and resume passed');
};
