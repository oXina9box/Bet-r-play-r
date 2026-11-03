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
    await ocr.close();
    assert.equal((await ocr.recognize(images))[0].text, 'BIG 16', 'worker can restart');
  } finally { await ocr.close(); }
  for (const body of ['{}', 'null', '{', '{"images":[]}']) assert.throws(() => decodeImages(body));
  console.log('All local OCR tests passed');
})().catch(err => { console.error(err); process.exitCode = 1; });
