const assert = require('node:assert/strict');

// Crop of the user's shared-screen preview, including its surrounding padding.
const screenshot = require('node:fs').readFileSync(require('node:path').join(__dirname, 'fixtures/sicbo-history-strip.png')).toString('base64');
module.exports = async function checkHistorySegmentation(page) {
  const result = await page.evaluate(async base64 => {
    const bitmap = await createImageBitmap(new Blob([Uint8Array.from(atob(base64), c => c.charCodeAt(0))], { type: 'image/png' }));
    const source = document.createElement('canvas'); source.width = bitmap.width; source.height = bitmap.height;
    source.getContext('2d').drawImage(bitmap, 0, 0); bitmap.close();
    const selection = [15, 10, 155, 150];
    const boxes = [[41, 41, 33, 110], [81, 40, 35, 110], [123, 40, 34, 110]];
    const normalized = rect => rect.map((v, i) => v / (i % 2 ? source.height : source.width));
    const profile = { v: 2, width: source.width, height: source.height, revision: 1, direction: 'left',
      regions: { history: normalized(selection) }, rolls: { newest: normalized(boxes[0]), previous: normalized(boxes[1]), twoBack: normalized(boxes[2]) } };
    const read = await ScreenReader.readSicBoFrame(source, profile);
    return read.readings.histories;

  }, screenshot);
  assert.equal(result.length, 3, 'reader uses all three explicitly selected boxes');
  assert.deepEqual(result.map(x => [x?.total, x?.values]), [[10, [2, 4, 4]], [9, [1, 2, 6]], [5, [1, 1, 3]]]);
  const single = require('node:fs').readFileSync(require('node:path').join(__dirname, 'fixtures/sicbo-history-10.png')).toString('base64');
  const one = await page.evaluate(async base64 => {
    const bitmap = await createImageBitmap(new Blob([Uint8Array.from(atob(base64), c => c.charCodeAt(0))], { type: 'image/png' }));
    const source = document.createElement('canvas'); source.width = bitmap.width; source.height = bitmap.height;
    source.getContext('2d').drawImage(bitmap, 0, 0); bitmap.close();
    const rect = [40, 44, 37, 126];
    const normalized = values => values.map((v, i) => v / (i % 2 ? source.height : source.width));
    const profile = { v: 2, width: source.width, height: source.height, revision: 1, direction: 'left',
      regions: { history: normalized([8, 8, 91, 179]) }, rolls: { newest: normalized(rect), previous: normalized([8, 10, 29, 175]), twoBack: normalized([78, 10, 20, 175]) } };
    return (await ScreenReader.readSicBoFrame(source, profile)).readings.history;
  }, single);
  assert.deepEqual([one?.total, one?.values], [10, [2, 2, 6]], 'single-column selection remains readable');
};
