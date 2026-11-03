const test = require('node:test');
const assert = require('node:assert/strict');
const Engine = require('../js/engine');
const History = require('../js/history');

const cfg = { n: 4, prog: 'double', unit: 1, payout: 1, waitBust: 0, recovery: 0 };
const replay = (sides, settings = cfg) => Engine.run(sides.map((side, i) => ({
  side, t: i + 1, s: 'session', cfg: { ...settings },
})), settings).rows;

test('set groups preserve original pattern, factor and played bets for sizes 4 through 7', () => {
  for (const n of [4, 5, 6, 7]) {
    const rows = replay([...Array(n + 2).fill('A'), 'B'], { ...cfg, n });
    const [group] = History.groupRows(rows);
    assert.equal(group.kind, 'set');
    assert.equal(group.size, n);
    assert.equal(group.setNo, 1);
    assert.deepEqual(group.pattern, rows.slice(0, n));
    assert.equal(group.factor, rows[n]);
    assert.deepEqual(group.bets, rows.slice(n + 1));
    assert.equal(group.status, 'won');
    assert.equal(group.cfg.n, n);
  }
});

test('each played set has its own source window, including earlier set results', () => {
  const rows = replay(['A', 'B', 'A', 'B', 'A', 'A', 'B', 'A']);
  const groups = History.groupRows(rows).filter(group => group.kind === 'set');
  assert.equal(groups.length, 2);
  assert.deepEqual(groups[1].pattern, rows.slice(2, 6));
  assert.equal(groups[1].factor, rows[6]);
  assert.equal(groups[1].setNo, 2);
});

test('historical size comes from factor plan even when later entry settings change', () => {
  const entries = Array(7).fill('A').map((side, i) => ({ side, cfg: { ...cfg, n: i < 5 ? 4 : 7 } }));
  const rows = Engine.run(entries, { ...cfg, n: 7 }).rows;
  const group = History.groupRows(rows)[0];
  assert.equal(group.size, 4);
  assert.equal(group.pattern.length, 4);
  assert.equal(group.status, 'active');
  assert.equal(group.bets.length, 2);
});

test('leading ties stay visible but effective ties enter the actual pattern', () => {
  const rows = replay([null, null, 'A', null, 'B', 'A', null, null]);
  const groups = History.groupRows(rows);
  assert.equal(groups[0].kind, 'collect');
  assert.deepEqual(groups[0].rows, rows.slice(0, 2));
  const group = groups[1];
  assert.deepEqual(group.pattern, rows.slice(2, 6));
  assert.equal(group.pattern[1].effSide, 'A');
  assert.equal(group.factor, rows[6]);
  assert.deepEqual(group.bets, [rows[7]]);
});

test('delayed factor rows remain grouped with their original pattern and bets', () => {
  const settings = { ...cfg, waitBet: 1 };
  const rows = replay(['A', 'A', 'A', 'A', 'B', 'B', 'A'], settings);
  const [group] = History.groupRows(rows);
  assert.equal(group.kind, 'set');
  assert.deepEqual(group.pattern, rows.slice(0, 4));
  assert.equal(group.factor, rows[4]);
  assert.deepEqual(group.waits, [rows[5]]);
  assert.deepEqual(group.bets, [rows[6]]);
  assert.deepEqual(group.rows, rows);
});

test('incomplete collection and cooldown preserve every otherwise unshown row', () => {
  const collecting = replay(['A', 'B']);
  assert.deepEqual(History.groupRows(collecting)[0].rows, collecting);
  const rows = replay(Array(10).fill('A'), { ...cfg, waitBust: 2 });
  const groups = History.groupRows(rows);
  assert.equal(groups[0].status, 'bust');
  assert.equal(groups[1].kind, 'cooldown');
  assert.deepEqual(groups[1].rows, rows.slice(8));
  assert.deepEqual(groups.flatMap(group => group.rows), rows);
});

test('session boundaries never mix patterns, bet sets, or repeated set numbers', () => {
  const first = replay(Array(6).fill('A')).map(row => ({ ...row, s: 'first', sessionNo: 1 }));
  const second = replay(Array(5).fill('B')).map(row => ({ ...row, s: 'second', sessionNo: 2 }));
  const groups = History.groupRows([...first, ...second]);
  assert.equal(groups.length, 2);
  assert.equal(groups[0].status, 'interrupted');
  assert.equal(groups[1].status, 'active');
  assert.equal(groups[1].setNo, 1);
  assert.deepEqual(groups[1].pattern, second.slice(0, 4));
});

test('empty input and truncated replay preserve original rows without inventing a factor', () => {
  assert.deepEqual(History.groupRows([]), []);
  const bets = replay(Array(7).fill('A')).slice(-2);
  const groups = History.groupRows(bets);
  assert.deepEqual(groups[0].rows, bets);
  assert.equal(groups[0].factor, null);
});

test('grouping does not mutate frozen replay input or share a mutable config copy', () => {
  const rows = replay(Array(6).fill('A'));
  for (const row of rows) {
    Object.freeze(row.cfg);
    if (row.plan) Object.freeze(row.plan);
    if (row.bet) Object.freeze(row.bet);
    Object.freeze(row);
  }
  Object.freeze(rows);
  const before = JSON.stringify(rows);
  const first = History.groupRows(rows);
  const second = History.groupRows(rows);
  assert.deepEqual(first, second);
  assert.equal(JSON.stringify(rows), before);
  assert.notEqual(first[0].cfg, rows[4].cfg);
});

test('classic browser script exposes the same grouping helper', () => {
  const fs = require('node:fs');
  const vm = require('node:vm');
  const browser = {};
  vm.runInNewContext(fs.readFileSync(require.resolve('../js/history'), 'utf8'), browser);
  assert.equal(typeof browser.History.groupRows, 'function');
  assert.equal(browser.History.groupRows([]).length, 0);
});
