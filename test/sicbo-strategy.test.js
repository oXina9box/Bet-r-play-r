const test = require('node:test');
const assert = require('node:assert/strict');
const Engine = require('../js/engine');
const SicBo = require('../js/games/sicbo');

const base = { n: 5, prog: 'double', unit: 1, payout: 1, waitWin: 1, waitBust: 0, waitBet: 0, recovery: 0 };
const rawFor = side => side === 'A' ? [2, 4, 5] : [1, 2, 3];
const entries = (sides, cfg = base) => sides.map((side, i) => ({
  t: i + 1, s: 'sicbo', raw: rawFor(side), ...SicBo.outcome(rawFor(side)), cfg,
}));
const pattern = ['A', 'A', 'B', 'A', 'B'];

test('Sic Bo delayed entry follows every repeated pattern position with a fresh initial stake', () => {
  const repeats = ['A', 'B', 'A'];
  for (let waitBet = 1; waitBet <= 3; waitBet++) {
    const cfg = { ...base, waitBet };
    const prefix = [...pattern, 'A', ...repeats.slice(0, waitBet)];
    const ready = Engine.run(entries(prefix, cfg), cfg);
    assert.equal(ready.rows.at(-1).role, 'factor-wait', `delay ${waitBet} accepts the repeated pattern`);
    assert.equal(ready.next.phase, 'bet');
    assert.equal(ready.next.amount, 1, 'waiting risks no units');
    assert.equal(ready.next.side, waitBet === 1 ? 'A' : waitBet === 2 ? 'B' : 'A');
    const won = Engine.run(entries([...prefix, ready.next.side], cfg), cfg);
    assert.equal(won.rows.at(-1).result, 'win');
  }
});

test('Sic Bo delay breaks at the second position and is not a bust or a wager', () => {
  const cfg = { ...base, waitBet: 3 };
  const result = Engine.run(entries([...pattern, 'A', 'A', 'A'], cfg), cfg);
  assert.equal(result.rows.at(-1).role, 'factor-break');
  assert.equal(result.next.phase, 'collect');
  assert.equal(result.next.have, 0);
  const stats = Engine.stats(result.rows);
  assert.equal(stats.sets, 0);
  assert.equal(stats.bust, 0);
  assert.equal(stats.wagered, 0);
});

test('Sic Bo triple still breaks a delayed pattern by its total side', () => {
  const cfg = { ...base, waitBet: 1 };
  const triple = { ...entries(['B'], cfg)[0], raw: [2, 2, 2], ...SicBo.outcome([2, 2, 2]) };
  const result = Engine.run([...entries([...pattern, 'A'], cfg), triple], cfg);
  assert.equal(result.rows.at(-1).role, 'factor-break');
  assert.equal(Engine.stats(result.rows).bust, 0);
});

test('Sic Bo win waits consume exactly zero through four completed rounds', () => {
  for (let waitWin = 0; waitWin <= 4; waitWin++) {
    const cfg = { ...base, waitWin };
    const won = [...pattern, 'A', 'B'];
    const result = Engine.run(entries([...won, ...Array(waitWin).fill('A'), 'A'], cfg), cfg);
    assert.equal(result.rows.filter(row => row.cooldownReason === 'win').length, waitWin);
    assert.equal(result.rows.at(-1).role, 'factor');
  }
});

test('Sic Bo observed continuation remains one set and cannot bypass an armed skip', () => {
  const cfg = { ...base, recovery: 3 };
  const busted = entries([...pattern, 'A', 'A', 'B', 'A', 'B'], cfg);
  const advice = Engine.run(busted, cfg).next;
  const placed = { ...entries([advice.side], cfg)[0], t: 11, wager: {
    status: 'observed', currency: 'SC', bets: [{ market: advice.side, amount: advice.amount }],
  } };
  const result = Engine.run([...busted, placed], cfg);
  assert.equal(result.rows.at(-1).bet.continuation, true);
  const stats = Engine.stats(result.rows);
  assert.equal(stats.sets, 1);
  assert.equal(stats.won, 1);
  assert.equal(stats.bust, 0);
  assert.equal(stats.net, 1);
  assert.equal(result.next.recovery, null, 'continuing the original run does not start a new recovery run');
  assert.ok(Number.isFinite(stats.byStep[4]), 'extended win bar remains numeric');
  const skipped = Engine.run([...busted, { ...placed, nb: true }], cfg);
  assert.notEqual(skipped.rows.at(-1).role, 'bet', 'skip cannot confirm continuation');
});

test('Sic Bo extended wins beyond six bets have finite bars and one terminal set', () => {
  const cfg = { ...base, n: 7 };
  const busted = entries(Array(14).fill('A'), cfg);
  const advice = Engine.run(busted, cfg).next;
  assert.equal(advice.phase, 'continue');
  const won = { ...entries([advice.side], cfg)[0], wager: {
    status: 'observed', currency: 'SC', bets: [{ market: advice.side, amount: advice.amount }],
  } };
  const result = Engine.run([...busted, won], cfg);
  const stats = Engine.stats(result.rows);
  assert.equal(stats.sets, 1);
  assert.equal(stats.won, 1);
  assert.equal(stats.bust, 0);
  assert.equal(stats.byStep[6], 1);
  assert.ok(stats.byStep.every(Number.isFinite));
});

test('Sic Bo optional continuation applies to the next roll and expires when declined', () => {
  const cfg = { ...base, waitBust: 2 };
  const busted = entries([...pattern, 'A', 'A', 'B', 'A', 'B'], cfg);
  const advice = Engine.run(busted, cfg).next;
  const wagered = { ...entries([advice.side], cfg)[0], wager: {
    status: 'observed', currency: 'SC', bets: [{ market: advice.side, amount: advice.amount }],
  } };
  const immediate = Engine.run([...busted, wagered], cfg);
  assert.equal(immediate.rows.at(-1).bet.continuation, true, 'placing the next wager resumes despite normal cooldown');
  const declined = Engine.run([...busted, entries(['A'], cfg)[0]], cfg);
  assert.equal(declined.next.phase, 'cooldown', 'declining the next wager restores normal cooldown');
  const later = Engine.run([...busted, entries(['A'], cfg)[0], wagered], cfg);
  assert.equal(later.rows.at(-1).role, 'cooldown');
  assert.equal(later.rows[9].continued, undefined, 'a later wager cannot revive the stale original run');
});
