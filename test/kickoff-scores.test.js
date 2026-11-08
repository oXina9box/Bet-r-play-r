const assert = require('node:assert/strict');
const { test } = require('node:test');
const KO = require('../js/games/kickoff');
const { createDefault, validate } = require('../js/data');

test('draw signal uses ordered dice transitions, sample size and observed comparison', () => {
  assert.equal(KO.drawSignal([]).play, false);
  const history = (count, draw) => Array.from({ length: count }, () => [{ s: 'a', raw: [6, 4] }, { s: 'a', raw: draw ? [1, 1] : [2, 3] }]).flat().concat({ s: 'a', raw: [6, 4] });
  const thin = KO.drawSignal(history(19, true));
  assert.equal(thin.play, false); assert.equal(thin.matches, 19);
  const strong = KO.drawSignal(history(20, true));
  assert.equal(strong.play, true); assert.equal(strong.matches, 20); assert.equal(strong.draws, 20);
  assert.equal(strong.others, 20); assert.equal(strong.otherDraws, 0);
  assert.equal(KO.drawSignal(history(40, false)).play, false);
  const equalRates = Array.from({ length: 41 }, (_, i) => ({ s: 'a', raw: i % 2 ? [2, 2] : [1, 1] }));
  assert.equal(KO.drawSignal(equalRates).play, false, 'frequent draws alone are not a conditional signal');
  assert.equal(KO.drawSignal(history(40, true), { raw: [4, 6] }).matches, 0, 'red/blue order matters');
  assert.equal(KO.drawSignal(history(40, true), { raw: { w: 'T' } }).pair, null);
  const boundaries = [{ s: 'a', raw: [6, 4] }, { s: 'b', raw: [1, 1] }, { s: 'b', raw: { w: 'T' } }, { s: 'b', raw: [6, 4] }];
  assert.equal(KO.drawSignal(boundaries).matches, 0, 'unknown dice and new sessions never create transitions');
  assert.equal(KO.drawSignal(history(40, true), null).play, false, 'empty current session does not reuse previous session signal');
});

test('score-hit marks survive backup roundtrip, reject invalid values and other games', () => {
  const cfg = { n: 5, prog: 'double', unit: 1, payout: 1 };
  const fixture = (game, scoreHit) => ({ ...createDefault(), books: {
    [`shuff:${game}`]: { cfg, sessions: [{ id: 's', start: 0 }],
      entries: [{ s: 's', t: 2, raw: game === 'kickoff' ? [6, 4] : { w: 'A' }, cfg, ...(scoreHit === undefined ? {} : { scoreHit }) }] },
  } });
  for (const value of [true, false]) {
    const clean = validate(fixture('kickoff', value));
    assert.equal(clean.books['shuff:kickoff'].entries[0].scoreHit, value);
    assert.deepEqual(validate(JSON.parse(JSON.stringify(clean))), clean);
  }
  assert.equal(validate(fixture('kickoff')).books['shuff:kickoff'].entries[0].scoreHit, undefined);
  for (const value of [null, 1, 'true']) assert.throws(() => validate(fixture('kickoff', value)));
  assert.doesNotThrow(() => validate(fixture('teenpatti')));
  assert.throws(() => validate(fixture('teenpatti', true))); 
});

test('draw patterns count back-to-back, one-off and cluster contexts without crossing unknowns or sessions', () => {
  const rows = text => [...text].map(c => ({ s: 'a', raw: c === 'D' ? [2, 2] : c === 'N' ? [6, 4] : {} }));
  const stats = KO.drawPatterns(rows('DDNDND'));
  const get = id => stats.find(p => p.id === id);
  assert.equal(get('after-draw').matches, 3);
  assert.equal(get('after-draw').draws, 1);
  assert.equal(get('one-off').matches, 2);
  assert.equal(get('one-off').draws, 2);
  assert.equal(get('one-off').active, false);
  assert.equal(get('alternating').active, true);
  assert.equal(get('cluster').active, true);
  const afterNonDraw = KO.drawPatterns(rows('DDNDN')).find(p => p.id === 'one-off');
  assert.equal(afterNonDraw.active, true, 'D then N is the next one-off draw opportunity');
  assert.equal(KO.drawPatterns(rows('DD?ND')).find(p => p.id === 'cluster').matches, 0);
  assert.equal(KO.drawPatterns(rows('DD?ND')).find(p => p.id === 'alternating').active, false);
  const split = rows('DD'); split[1].s = 'b';
  assert.equal(KO.drawPatterns(split).find(p => p.id === 'back-to-back').active, false);
  assert.equal(KO.drawPatterns(split).find(p => p.id === 'after-draw').matches, 0);
  const quick = [{ s: 'a', raw: { w: 'T' } }, { s: 'a', raw: { w: 'A' } }];
  assert.equal(KO.drawPatterns(quick).find(p => p.id === 'one-off').active, true);
});

test('clump signal can trigger without repeated exact dice and waits when samples are thin', () => {
  const rows = [];
  for (let i = 0; i < 35; i++) {
    for (const w of 'TTTTAAA') rows.push({ s: String(i), raw: { w: w === 'T' ? 'T' : 'A' } });
  }
  rows.push({ s: 'current', raw: { w: 'T' } });
  const signal = KO.drawSignal(rows);
  assert.equal(signal.play, true);
  assert.equal(signal.pair, null);
  assert.equal(signal.evidence.id, 'after-draw');
  assert.equal(signal.evidence.matches, 140);
  assert.equal(signal.evidence.draws, 105);
  assert.equal(KO.drawSignal(rows.slice(-8)).play, false);
  assert.equal(KO.drawSignal(rows, null).play, false);
  assert.equal(KO.drawSignal([{ raw: { w: 'A' } }]).reason, 'No matching draw pattern');
});
