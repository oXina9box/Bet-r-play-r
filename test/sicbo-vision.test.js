const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { gunzipSync } = require('node:zlib');
const Vision = require('../js/vision');
const fixtures = path.join(__dirname, 'fixtures/sicbo-physical');
const manifest = JSON.parse(fs.readFileSync(path.join(fixtures, 'manifest.json')));
const load = fixture => ({ ...fixture, data: new Uint8ClampedArray(gunzipSync(fs.readFileSync(path.join(fixtures, fixture.file)))) });

test('latest Sic Bo history requires one total and three independently read dice', () => {
  for (const [text, expected] of [
    ['16\n6\n4\n6', { total: 16, dice: [6, 4, 6] }],
    [' 10  1 3 6 ', { total: 10, dice: [1, 3, 6] }],
    ['3\n1\n1\n1', { total: 3, dice: [1, 1, 1] }],
    ['18\n6\n6\n6', { total: 18, dice: [6, 6, 6] }],
  ]) assert.deepEqual(Vision.parseSicBoHistory(text), expected);
  for (const text of [null, {}, '', '16', '16466', '16 4 6', '16 4 6 5', '16 4 6 6 3', 'BIG16 4 6 6', '16 4 x6 6', '16 4 6 6%',
    '20 6 6 8', '3 0 1 2', '6 2 2 2.0', '6 2 2 +2', '06 2 2 2', '6 02 2 2', '6 2 2 O', '6\n2 2 2\n1:1']) {
    assert.equal(Vision.parseSicBoHistory(text), null, String(text));
  }
});

for (const fixture of manifest.cases.filter(item => item.kind === 'physical-dice')) test(`physical pips from actual crop ${fixture.file}`, () => {
  const read = Vision.inspectSicBoDice(load(fixture));
  assert.deepEqual(read.dice?.slice().sort(), fixture.dice.slice().sort(), read.reason);
  assert.ok(read.confidence >= 80);
  assert.equal(read.faces.length, 3);
  assert.equal(read.boxes.length, 3);
  for (const face of read.faces) {
    assert.ok(face.value >= 1 && face.value <= 6);
    assert.ok(face.box.width > 0 && face.box.height > 0 && face.confidence >= 80);
  }
});

test('incomplete dice report unknown without consulting confirmation totals', () => {
  const fixture = manifest.cases.find(item => item.file === 'qzizGm.rgba.gz');
  const source = load(fixture), data = new Uint8ClampedArray(source.data);
  // Cover a physical die with bowl color; do not introduce another die or a label.
  for (let y = 390; y < source.height; y++) for (let x = 210; x < 360; x++) data.set([204, 128, 60, 255], (y * source.width + x) * 4);
  const read = Vision.inspectSicBoDice({ ...source, data });
  assert.equal(read.dice, null);
  assert.equal(read.faces.length, 2);
  assert.match(read.reason, /three|3/i);
  assert.equal(Vision.inspectSicBoDice(null).dice, null);
  const invalid = load(manifest.cases.find(item => item.kind === 'invalid-dice-region'));
  assert.equal(Vision.inspectSicBoDice(invalid).dice, null, 'the user\'s actual misplaced green region cannot invent dice outside the crop');
  const clipped = Vision.inspectSicBoDice({ ...source, height: 460, data: source.data.slice(0, source.width * 460 * 4) });
  assert.equal(clipped.dice, null, 'part of a visible physical face cannot become a lower die value');
  assert.ok(clipped.faces.some(face => face.value === null && /clipped/.test(face.reason)));
});

function greenShape(kind) {
  const width = 180, height = 150, data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const radius = Math.hypot(x - 90, y - 75);
    const on = kind === 'disk' ? radius < 27 : kind === 'square' ? Math.max(Math.abs(x - 90), Math.abs(y - 75)) >= 24 && Math.max(Math.abs(x - 90), Math.abs(y - 75)) <= 28
      : radius > 24 && radius < 28 && (kind !== 'partial' || x > 87);
    data.set(on ? [145, 245, 0, 255] : [100, 45, 20, 255], (y * width + x) * 4);
  }
  return { width, height, data };
}
test('countdown requires a circular green arc, excluding a chip or rectangle', () => {
  for (const image of [greenShape('ring'), greenShape('partial'), load(manifest.cases.find(item => item.kind === 'countdown'))]) {
    const read = Vision.sicboCountdown(image);
    assert.ok(read?.box && read.center && read.radius > 8, 'clear countdown arc should locate its numeral crop');
  }
  for (const image of [greenShape('disk'), greenShape('square'), load(manifest.cases.find(item => item.kind === 'green-chip')), null]) {
    assert.equal(Vision.sicboCountdown(image), null);
  }
});
