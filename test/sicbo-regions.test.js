const test = require('node:test');
const assert = require('node:assert/strict');
const regions = require('../js/sicbo-regions');

test('direct selection maps scaled preview pixels back to source coordinates', () => {
  const bounds = { left: 50, top: 100, width: 320, height: 180 };
  assert.deepEqual(regions.point(210, 190, bounds, 1280, 720), [640, 360]);
  assert.deepEqual(regions.point(-1, 999, bounds, 1280, 720), [0, 720]);
  assert.deepEqual(regions.normalize([960, 540], [320, 180], 1280, 720), [.25, .25, .5, .5]);
  assert.equal(regions.normalize([100, 100], [102, 102], 1280, 720), null);
});

test('profiles round-trip, retain separate regions and invalidate on source size change', () => {
  let profile = regions.update(null, 'dice', [.1, .2, .3, .4], 1280, 720);
  profile = regions.update(profile, 'result', [.3, .4, .1, .1], 1280, 720);
  profile = regions.update(profile, 'history', [.01, .7, .02, .2], 1280, 720);
  const restored = regions.read(JSON.stringify(profile));
  assert.deepEqual(restored, profile);
  assert.deepEqual(regions.pixels(restored.regions.history, 1280, 720), [12.8, 503.99999999999994, 25.6, 144]);
  assert.equal(regions.matches(restored, 1280, 720), true);
  assert.equal(regions.matches(restored, 1024, 720), false);
  const redrawn = regions.update(restored, 'dice', [.2, .2, .3, .4], 1024, 720);
  assert.equal(redrawn.regions.result, undefined);
  assert.equal(redrawn.regions.history, undefined);
  assert.ok(redrawn.revision > restored.revision);
  assert.ok(restored.regions.history, 'updating does not mutate the saved profile');
});

test('untrusted or malformed stored regions are rejected', () => {
  for (const value of ['{', '{}', JSON.stringify({ v: 1, width: 100, height: 100, revision: 1, regions: { dice: [-1, 0, .5, .5] } })]) {
    assert.equal(regions.read(value), null);
  }
  assert.throws(() => regions.update(null, 'history', [0, 0, 2, 1], 100, 100));
});

test('explicit ordered rolls must fit history without overlap and old profiles require recalibration', () => {
  let profile = regions.update(null, 'history', [.1, .1, .8, .6], 1000, 500);
  profile = regions.update(profile, 'newest', [.1, .1, .2, .6], 1000, 500);
  profile = regions.update(profile, 'previous', [.35, .1, .2, .6], 1000, 500);
  assert.throws(() => regions.update(profile, 'twoBack', [.4, .1, .2, .6], 1000, 500));
  assert.throws(() => regions.update(profile, 'twoBack', [.8, .1, .2, .6], 1000, 500));
  profile = regions.update(profile, 'twoBack', [.6, .1, .2, .6], 1000, 500);
  assert.equal(regions.complete(profile), true);
  assert.deepEqual(regions.read(JSON.stringify(profile)), profile);
  assert.equal(regions.read({ ...profile, v: 1 }), null);
  assert.equal(regions.complete(regions.update(profile, 'history', [.1, .1, .8, .6], 1000, 500)), false);
});
