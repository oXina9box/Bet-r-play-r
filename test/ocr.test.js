const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createOCR, decodeImages } = require('../ocr');
(async () => {
  const png = fs.readFileSync(path.join(__dirname, 'fixtures/sicbo-result.png'));
  const images = decodeImages(JSON.stringify({ images: [{ id: 'result', mode: 'text', png: 'data:image/png;base64,' + png.toString('base64') }] }));
  const ocr = createOCR();
  try {
    const [result] = await ocr.recognize(images);
    assert.equal(result.text, 'BIG 16', 'real screenshot banner passes local OCR');
    assert.ok(result.confidence >= 80);
    const [restricted, unrestricted] = await Promise.all([
      ocr.recognize(images.map(image => ({ ...image, mode: 'rank' }))),
      ocr.recognize(images),
    ]);
    assert.match(restricted[0].text, /^[2345678910JQKA\s]*$/, 'concurrent requests keep their own OCR whitelist');
    assert.equal(unrestricted[0].text, 'BIG 16', 'text request cannot inherit another request\'s rank settings');
    await ocr.close();
    const restarted = await Promise.all([ocr.recognize(images), ocr.recognize(images)]);
    assert.deepEqual(restarted.map(batch => batch[0].text), ['BIG 16', 'BIG 16'], 'concurrent requests share one restarted worker safely');
  } finally { await ocr.close(); }
  for (const body of ['{}', 'null', '{', '{"images":[]}']) assert.throws(() => decodeImages(body));
  console.log('All local OCR tests passed');
})().catch(err => { console.error(err); process.exitCode = 1; });
