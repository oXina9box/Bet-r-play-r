// Run: node test/vision.test.js
const assert = require('node:assert/strict');
const Vision = require('../js/vision.js');

for (const [game, text, expected] of [
  ['teenpatti', ' PLAYER B\n', { side: 'B' }],
  ['teenpatti', 'PLAYER A', { side: 'A' }],
  ['teenpatti', 'PLAYERB', { side: 'B' }],
  ['teenpatti', 'TIE', { side: null }],
  ['sicbo', 'BIG 16', { side: 'A', total: 16 }],
  ['sicbo', 'BIG16', { side: 'A', total: 16 }],
  ['sicbo', 'SMALL\n8', { side: 'B', total: 8 }],
  ['sicbo', 'ANY TRIPLE 12', { side: null, total: 12, triple: true }],
  ['sicbo', 'TRIPLE', { side: null, triple: true }],
  ['kickoff', 'RED', { side: 'A' }],
  ['kickoff', 'BLUE', { side: 'B' }],
  ['kickoff', 'DRAW', { side: null }],
]) assert.deepEqual(Vision.parseResult(game, text), expected);
for (const text of ['BIG', 'SMALL', '4–10 SMALL 1:1', 'BIG 8', 'SMALL 16', 'BIG 19', 'BIG 16 20', 'ANY TRIPLE 30:1', 'TRIPLE 10']) {
  assert.equal(Vision.parseResult('sicbo', text), null, text);
}
for (const [game, text] of [['kickoff', 'RED BLUE DRAW'], ['kickoff', 'RED x2.3'], ['teenpatti', 'PLAYER A 0.95:1'], ['teenpatti', 'PLAYER A PLAYER B'], ['unknown', 'RED']]) {
  assert.equal(Vision.parseResult(game, text), null, text);
}
assert.equal(Vision.parseRound('03 Nov 2026 04:59:58 · 1881576929'), '1881576929');
assert.equal(Vision.parseRound('03 Nov 2026 04:59:22. 1881576828'), '1881576828');
assert.equal(Vision.parseRound('03 Nov 2026 04:59:58 · 1881576929\nLast win GC 0 Coins GC 3,230.04'), '1881576929');
for (const text of ['03 Nov 2026 04:59:58', '20261103', '1881576929', '04:59:58 · 1881576929 1881576930', '04:59:58 · 188157692900000']) {
  assert.equal(Vision.parseRound(text), null, text);
}
assert.deepEqual(Vision.parseMoney('GC 3,230.04'), { amount: 3230.04, currency: 'GC' });
assert.deepEqual(Vision.parseMoney('SC 0'), { amount: 0, currency: 'SC' });
assert.deepEqual(Vision.parseMoney('$50.00'), { amount: 50, currency: 'USD' });
for (const text of ['50', '50%', '0.95:1', 'x50', 'GC -50', 'GC 50 100', 'GC 3,23.00', 'GC 1/2', 'GC 50K', 'Selected chip GC 50', 'GC Infinity', 'GC 9007199254740992', 'GC 1.001']) {
  assert.equal(Vision.parseMoney(text), null, text);
}

function picture(points, angle = 0, extra) {
  const width = 80, height = 80;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) data.set([100, 20, 20, 255], i);
  const dots = points.map(([x, y]) => [40 + x * Math.cos(angle) - y * Math.sin(angle), 40 + x * Math.sin(angle) + y * Math.cos(angle)]);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (dots.some(([px, py]) => Math.hypot(x - px, y - py) <= 4) || (extra && extra(x, y))) data.set([245, 240, 230, 255], (y * width + x) * 4);
  }
  return { width, height, data };
}
const shapes = [
  [[0, 0]],
  [[-18, -18], [18, 18]],
  [[-18, -18], [0, 0], [18, 18]],
  [[-18, -18], [18, -18], [-18, 18], [18, 18]],
  [[-18, -18], [18, -18], [0, 0], [-18, 18], [18, 18]],
  [[-18, -18], [18, -18], [-18, 0], [18, 0], [-18, 18], [18, 18]],
];
for (const [i, shape] of shapes.entries()) for (const angle of [0, 0.35, 1.1]) {
  const die = Vision.readDie(picture(shape, angle));
  assert.equal(die && die.value, i + 1, `die ${i + 1}, rotation ${angle}`);
  assert.ok(die.confidence >= 70 && die.confidence <= 100);
}
assert.equal(Vision.readDie(null), null);
assert.equal(Vision.readDie({ width: 1e9, height: 1e9, data: [] }), null);
assert.equal(Vision.readDie(picture([])), null);
assert.equal(Vision.readDie(picture([[0, 0]], 0, (x, y) => x < 2 || x > 77 || y < 2 || y > 77)).value, 1);
assert.equal(Vision.readDie(picture([[-20, -15], [15, -20], [10, 20]])), null, 'non-collinear three');
assert.equal(Vision.readDie(picture([[-22, -22], [18, -19], [-4, 7], [25, 20]])), null, 'irregular four');
assert.equal(Vision.readDie(picture([[28, 28]])), null, 'off-center noise');
assert.equal(Vision.readDie(picture([], 0, (x, y) => x >= 36 && x <= 44 && y >= 36 && y <= 44)), null, 'square highlight is not a physical pip');
const foreshortened = picture([], 0, (x, y) => [[22, 28], [58, 28], [22, 52], [58, 52]].some(([px, py]) => ((x - px) / 5.2) ** 2 + ((y - py) / 2.1) ** 2 <= 1));
assert.equal(Vision.readDie(foreshortened)?.value, 4, 'resampled foreshortened pip can span11 by5 pixels');
assert.equal(Vision.readDie(picture([], 0, (x, y) => x >= 30 && x <= 50 && y >= 39 && y <= 41)), null, 'thin white streak rejected');
assert.equal(Vision.readSuit(picture([[0, 0]])), null, 'unknown glyph remains unknown');
// Independent glyph fixtures rendered at 32px from DejaVu Sans; no font needed at runtime.
const suitFixtures = {
  "h": "000000000000000000000000000000000000000000000000000000000000007c0fc00000fe1fe00001ff1ff00003ffbff00003ffbff80003fffff80003fffff80003fffff80003fffff00001fffff00001ffffe00000ffffe000007fffc000003fff8000003fff0000001fff0000000ffe00000007fc00000003f800000003f000000001e000000000e00000000040000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000",
  "d": "00000000000000000000000000000000000000000000000000000000000000004000000000e000000001f000000003f000000003f800000007fc0000000ffe0000001ffe0000001fff0000003fff8000007fffc000007fffc000007fff8000003fff8000001fff0000000ffe0000000ffc00000007fc00000003f800000001f000000001e000000000c00000000040000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000",
  "s": "00000000000000000000000000000000000000000000000000000000000000004000000000c000000001e000000001f000000003f800000007f80000000ffc0000000ffe0000001fff0000003fff8000007fff8000007fffc00000ffffc00000ffffe00000ffffe00000ffffe00000ff5fc000007f5fc000003e4f8000000040000000004000000000c000000000e0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000",
  "c": "0000000000000000000000000000000000000000000000000000000000000001f000000003f800000007fc0000000ffc0000000ffc0000000ffc00000007fc00000007fc00000003f800000003f00000007fffc00000ffffe00001ffffe00001fffff00001fffff00001fffff00001fffff00001ff5fe00000fe5fe000003c47800000004000000000c000000000e0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000"
};
for (const [suit, rows] of Object.entries(suitFixtures)) {
  const data = new Uint8ClampedArray(40 * 40 * 4);
  for (let y = 0; y < 40; y++) for (let x = 0; x < 40; x++) {
    const on = Math.floor(parseInt(rows.slice(y * 10, y * 10 + 10), 16) / 2 ** (39 - x)) % 2;
    data.set(on ? (suit === 'h' || suit === 'd' ? [190, 35, 40, 255] : [30, 30, 30, 255]) : [255, 255, 255, 255], (y * 40 + x) * 4);
  }
  const result = Vision.readSuit({ width: 40, height: 40, data });
  assert.equal(result && result.suit, suit, 'rendered suit ' + suit);
  assert.ok(result.confidence >= 85);
  const bordered = new Uint8ClampedArray(data);
  for (let y = 0; y < 3; y++) for (let x = 0; x < 40; x++) bordered.set([30, 30, 30, 255], (y * 40 + x) * 4);
  assert.equal(Vision.readSuit({ width: 40, height: 40, data: bordered }).suit, suit, 'thin card border ignored');
  const wrongColor = new Uint8ClampedArray(data);
  for (let i = 0; i < wrongColor.length; i += 4) if (wrongColor[i + 1] < 130) wrongColor.set(suit === 'h' || suit === 'd' ? [25, 25, 25, 255] : [190, 35, 40, 255], i);
  assert.equal(Vision.readSuit({ width: 40, height: 40, data: wrongColor }), null, 'suit silhouette and color must agree');
}


// Actual screenshot club: compression separates narrow stem from upper lobes.
const splitClub = '3bffff98000003ffffffffffff00000001fffff0000000000001000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000003fc0000000000ffe0000000001fff8000000003fff8000000003fffc000000007fffc000000007fffe000000007fffe000000007fffe000000007fffc000000007fffc000000003fffc000000003fff8000000001fff8000000001fff0000000011fff00000001ffffffe000007fffffff80000ffffffffc0001ffffffffe0001fffffffff0003fffffffff0003fffffffff0003fffffffff0003fffffffff0003fffffffff0003fffffffff0001ffffdffff0001fffccfffe0000fff80fffe0000fff8c7ffc00007ff0c3ff800001fc0c1ff000000001c000000000001e000000000001e000000000003f000000000007f00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000';
const clubPixels = new Uint8ClampedArray(50 * 59 * 4);
for (let y = 0; y < 59; y++) for (let x = 0; x < 50; x++) {
  const on = Math.floor(parseInt(splitClub.slice(y * 13, y * 13 + 13), 16) / 2 ** (49 - x)) % 2;
  clubPixels.set(on ? [30, 30, 30, 255] : [255, 255, 255, 255], (y * 50 + x) * 4);
}
assert.equal(Vision.readSuit({ width: 50, height: 59, data: clubPixels }).suit, 'c', 'compressed club stem');
// Second actual club has a slightly tilted glyph and visible card border.
const tiltedClub = 'fffffffffffffffffffffffffffffffff00000001fff0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000ff000000003ffc00000007ffe0000000ffff0000000ffff0000001ffff0000001ffff8000001ffff8000001ffff8000001ffff8000001ffff8000000ffff0000000ffff00000007ffe00000007ffe000000ffffe000007ffffff8001ffffffff003ffffffff807ffffffffc07ffffffffe07ffffffffe0fffffffffe0ffffffffff0ffffffffff0ffffffffff07ffffffffe07ffffffffe03fff9bfffe03fff99fffc01fff18fff800ffe187ff8003f8183fe000040380fc0000003c0000000003c0000000007e0000000007e0000000007e000000000000000000000000000000000000000000000000000000000000000000000000000000000';
const tiltedPixels = new Uint8ClampedArray(44 * 60 * 4);
for (let y = 0; y < 60; y++) for (let x = 0; x < 44; x++) {
  const on = Math.floor(parseInt(tiltedClub.slice(y * 11, y * 11 + 11), 16) / 2 ** (43 - x)) % 2;
  tiltedPixels.set(on ? [30, 30, 30, 255] : [255, 255, 255, 255], (y * 44 + x) * 4);
}
assert.equal(Vision.readSuit({ width: 44, height: 60, data: tiltedPixels }).suit, 'c', 'slightly tilted actual club');
function bowl(values) {
  const width = 400, height = 300;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) data.set([200, 110, 40, 255], i);
  values.forEach((value, i) => {
    const die = picture(shapes[value - 1], 0.15);
    for (let y = 0; y < 80; y++) for (let x = 0; x < 80; x++) data.set(die.data.slice((y * 80 + x) * 4, (y * 80 + x + 1) * 4), ((y + 100) * width + x + 20 + i * 130) * 4);
  });
  return { width, height, data };
}
assert.deepEqual(Vision.readDice(bowl([6, 4, 6])).dice, [6, 4, 6]);
assert.equal(Vision.readDice(bowl([6, 4]), 3), null);
assert.equal(Vision.readDice(bowl([6, 4, 6]), 2), null);
assert.equal(Vision.readDice(null), null);
assert.equal(Vision.readDice(bowl([6, 4, 6]), 4), null);
assert.equal(Vision.readSuit(null), null);
function darkRegion(values) {
  const width = 400, height = 300;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) data.set([45, 45, 45, 255], i);
  values.forEach((value, i) => {
    const die = picture(shapes[value - 1], 0.2);
    for (let pixel = 0; pixel < die.data.length; pixel += 4) if (die.data[pixel] < 175) die.data.set([25, 25, 25, 255], pixel);
    for (let y = 0; y < 80; y++) for (let x = 0; x < 80; x++) data.set(die.data.slice((y * 80 + x) * 4, (y * 80 + x + 1) * 4), ((y + 90) * width + x + 70 + i * 150) * 4);
  });
  return { width, height, data };
}
for (let n = 1; n <= 6; n++) assert.equal(Vision.readDieRegion(darkRegion([n])).value, n, 'locate die ' + n);
assert.equal(Vision.readDieRegion(darkRegion([])), null);
assert.equal(Vision.readDieRegion(darkRegion([4, 6])), null, 'two dice in one region ambiguous');
const secondaryFace = darkRegion([4]);
for (let y = 160; y < 200; y++) for (let x = 85; x < 140; x++) {
  if ([95, 125].some(px => [168, 180, 192].some(py => Math.hypot(x - px, y - py) <= 4))) secondaryFace.data.set([245, 240, 230, 255], (y * secondaryFace.width + x) * 4);
}
assert.equal(Vision.readDieRegion(secondaryFace), null, 'bright secondary face must remain ambiguous');
const twoBrightness = darkRegion([4, 6]);
for (let y = 0; y < twoBrightness.height; y++) for (let x = 220; x < twoBrightness.width; x++) {
  const i = (y * twoBrightness.width + x) * 4;
  if (twoBrightness.data[i] >= 175) twoBrightness.data.set([185, 185, 185, 255], i);
}
assert.equal(Vision.readDieRegion(twoBrightness), null, 'threshold fallback cannot discard a second die');
assert.equal(Vision.readDieRegion(null), null);
assert.equal(Vision.readDie(picture([[-21, -12], [21, -12], [-21, 12], [21, 12]])).value, 4, 'foreshortened face');
assert.equal(Vision.parseResult(null, null), null);
assert.equal(Vision.parseRound(null), null);
assert.equal(Vision.parseMoney(null), null);
const badge = { width: 20, height: 20, data: new Uint8ClampedArray(20 * 20 * 4) };
for (let i = 0; i < 400; i++) badge.data.set(i < 40 ? [255, 255, 255, 255] : [190, 150, 40, 255], i * 4);
assert.equal(Vision.teenBadge(badge), true, 'white letters and gold background');
const purple = { ...badge, data: new Uint8ClampedArray(badge.data) };
for (let i = 40; i < 400; i++) purple.data.set([190, 70, 190, 255], i * 4);
assert.equal(Vision.teenBadge(purple), true, 'Player A uses a purple result badge');
const label = { ...badge, data: new Uint8ClampedArray(badge.data) };
for (let i = 40; i < 400; i++) label.data.set([25, 80, 150, 255], i * 4);
assert.equal(Vision.teenBadge(label), false, 'white player label on blue is not a result badge');
assert.equal(Vision.teenBadge(null), false);
console.log('Vision parser, pip and suit checks passed.');
