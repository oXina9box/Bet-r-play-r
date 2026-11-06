// Browser-side checks for exact selected crops and roll-specific read failures.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

module.exports = async function checkSicBoReader(page) {
  const base64 = fs.readFileSync(path.join(__dirname, 'fixtures/sicbo-history-strip.png')).toString('base64');
  const result = await page.evaluate(async image => {
    const bitmap = await createImageBitmap(new Blob([Uint8Array.from(atob(image), c => c.charCodeAt(0))], { type: 'image/png' }));
    const source = document.createElement('canvas'); source.width = bitmap.width; source.height = bitmap.height;
    source.getContext('2d').drawImage(bitmap, 0, 0); bitmap.close();
    const norm = rect => rect.map((v, i) => v / (i % 2 ? source.height : source.width));
    const profile = { v: 2, width: source.width, height: source.height, revision: 1, direction: 'left',
      regions: { history: norm([15, 10, 155, 150]) }, rolls: {
        newest: norm([41, 41, 33, 110]), previous: norm([81, 40, 35, 110]), twoBack: norm([123, 40, 34, 110]),
      } };
    const originalFetch = window.fetch;
    window.fetch = async (url, options) => url === '/ocr'
      ? new Response(JSON.stringify(JSON.parse(options.body).images.map(({ id }) => ({ id, text: 'unreadable', confidence: 0 }))), { status: 200 })
      : originalFetch(url, options);
    try {
      const read = await ScreenReader.readSicBoFrame(source, profile);
      return { failures: read.failures, message: read.message, readings: read.readings.histories };
    } finally { window.fetch = originalFetch; }
  }, base64);
  assert.deepEqual(result.failures, ['Newest: OCR failed', 'Previous: OCR failed', 'Two back: OCR failed']);
  assert.equal(result.message, 'Newest: OCR failed');
  assert.deepEqual(result.readings, [null, null, null]);
};
