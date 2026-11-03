const assert = require('node:assert/strict');
const { validate, createDefault } = require('../js/data');

function fixture(game = 'sicbo', raw = [1, 2, 3]) {
  return { ...createDefault(), cur: { site: 'shuff', game }, books: {
    [`shuff:${game}`]: { cfg: { n: 5, prog: 'double', unit: 1, payout: 1 },
      sessions: [{ id: 's1', start: 1 }], entries: [{ s: 's1', t: 2, raw, cfg: { n: 5, prog: 'double', unit: 1, payout: 1 } }] },
  } };
}
assert.notEqual(createDefault().sites, createDefault().sites);
assert.deepEqual(validate(createDefault()), createDefault());
const source = fixture();
const clean = validate(source);
assert.equal(clean.books['shuff:sicbo'].cfg.fibDrop, 2);
assert.equal(clean.books['shuff:sicbo'].entries[0].cfg.recovery, 0);
assert.equal(clean.books['shuff:sicbo'].cfg.waitWin, 1, 'older active settings get the standard one-game win wait');
assert.equal(clean.books['shuff:sicbo'].cfg.waitBet, 0);
clean.books['shuff:sicbo'].entries[0].raw[0] = 6;
assert.equal(source.books['shuff:sicbo'].entries[0].raw[0], 1);
for (const prog of ['double', 'plusone', 'fib', 'fib_ladder']) {
  const d = fixture(); d.books['shuff:sicbo'].cfg.prog = prog; validate(d);
}
for (const [game, raw] of [['kickoff', [6, 2]], ['kickoff', { w: 'T' }],
  ['teenpatti', { w: 'A' }], ['teenpatti', { c: ['Ah', 'Kd', 'Qs', 'Jc', '10h', '9d'] }]]) validate(fixture(game, raw));
const alternating = fixture('teenpatti', { c: ['Ah', 'Kh', 'Qh', 'Jh', '9h', '8h'], order: 'alternating' });
assert.equal(validate(alternating).books['shuff:teenpatti'].entries[0].raw.order, 'alternating');
alternating.books['shuff:teenpatti'].entries[0].raw.order = 'unknown';
assert.throws(() => validate(alternating));
for (const d of [null, {}, { sites: [], books: {} }, { ...createDefault(), v: 2 },
  { ...createDefault(), sites: [] }, { ...createDefault(), cur: { site: 'missing', game: 'sicbo' } },
  JSON.parse('{"v":1,"sites":[{"id":"shuff","name":"Shuff"}],"cur":{"site":"shuff","game":"sicbo"},"books":{},"__proto__":{}}'),
  fixture('sicbo', ['<img src=x onerror=alert(1)>', 1, 1]), fixture('sicbo', [1, 2]),
  fixture('kickoff', [1, 7]), fixture('kickoff', { w: 'X' }),
  fixture('teenpatti', { c: ['Ah', 'Ah', 'Qs', 'Jc', '10h', '9d'] }),
  fixture('teenpatti', { c: ['invalid', 'Kd', 'Qs', 'Jc', '10h', '9d'] })]) assert.throws(() => validate(d));
for (const edit of [
  d => { d.books['shuff:sicbo'].cfg.unit = Infinity; },
  d => { d.books['shuff:sicbo'].cfg.unit = 0; },
  d => { d.books['shuff:sicbo'].cfg.payout = NaN; },
  d => { d.books['shuff:sicbo'].cfg.n = 3; },
  d => { d.books['shuff:sicbo'].cfg.prog = 'unknown'; },
  d => { d.books['shuff:sicbo'].cfg.waitWin = 5; },
  d => { d.books['shuff:sicbo'].cfg.waitBet = -1; },
  d => { d.books['shuff:sicbo'].sessions = []; },
  d => { d.books['shuff:sicbo'].sessions.push({ id: 's1', start: 3 }); },
  d => { d.books['shuff:sicbo'].entries[0].s = 'missing'; },
  d => { d.books['shuff:sicbo'].entries[0].nb = 'false'; },
  d => { d.sites.push({ id: 'shuff', name: 'Duplicate' }); },
  d => { d.books['missing:sicbo'] = d.books['shuff:sicbo']; },
]) { const d = fixture(); edit(d); assert.throws(() => validate(d)); }
const observed = fixture();
const entry = observed.books['shuff:sicbo'].entries[0];
entry.screen = { round: '1881576828', capturedAt: 2, confidence: 94, result: 'SMALL 6' };
entry.wager = { status: 'observed', currency: 'GC', bets: [{ market: 'B', amount: 50 }] };
assert.deepEqual(validate(observed).books['shuff:sicbo'].entries[0].screen, entry.screen);
assert.deepEqual(validate(observed).books['shuff:sicbo'].entries[0].wager, entry.wager);
for (const edit of [
  e => { e.screen.round = 'bad'; },
  e => { e.screen.confidence = 101; },
  e => { e.wager.bets[0].amount = -1; },
  e => { e.wager.bets[0].amount = Infinity; },
  e => { e.wager.bets[0].market = '<script>'; },
  e => { e.wager.currency = '<script>'; },
]) {
  const bad = structuredClone(observed); edit(bad.books['shuff:sicbo'].entries[0]);
  assert.throws(() => validate(bad));
}
const duplicate = structuredClone(observed);
duplicate.books['shuff:sicbo'].entries.push({ ...entry, t: 3 });
assert.throws(() => validate(duplicate), 'same screen round cannot appear twice in a book');
entry.wager = { status: 'unknown' };
assert.deepEqual(validate(observed).books['shuff:sicbo'].entries[0].wager, { status: 'unknown' });
entry.wager = { status: 'observed', currency: 'GC', bets: [{ market: 'TOTAL_6', amount: 20 }, { market: 'ANY_TRIPLE', amount: 10 }] };
assert.deepEqual(validate(observed).books['shuff:sicbo'].entries[0].wager, entry.wager, 'side-market wagers survive backups');
console.log('All data tests passed');
