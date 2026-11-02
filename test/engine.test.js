// Run: node test/engine.test.js
const assert = require('assert');
const E = require('../js/engine.js');
const SicBo = require('../js/games/sicbo.js');
const TP = require('../js/games/teenpatti.js');

const cfg = { n: 5, prog: 'double', unit: 1, payout: 1 };
// Dice that produce a given total (non-triple unless forced).
const DICE = { 4: [1, 1, 2], 5: [1, 1, 3], 6: [1, 2, 3], 7: [1, 2, 4], 8: [1, 3, 4], 9: [2, 3, 4], 10: [2, 3, 5], 11: [2, 4, 5], 12: [3, 4, 5], 13: [3, 4, 6], 14: [3, 5, 6], 15: [4, 5, 6], 16: [4, 6, 6], 17: [5, 6, 6] };
const entries = (list, c = cfg) => list.map((x) => {
  const raw = Array.isArray(x) ? x : DICE[x];
  const o = SicBo.outcome(raw);
  return { raw, o, side: o.side, lossAll: o.lossAll, cfg: c };
});
const S = (side) => (side === 'A' ? 'B' : 'S'); // engine side -> Big/Small letter
const plan = (n) => n.plan.map(S).join('');

// Example: 11 14 9 14 6 = BBSBS -> XXYXY
let r = E.run(entries([11, 14, 9, 14, 6]), cfg);
assert.strictEqual(r.next.phase, 'factor');
assert.strictEqual(r.next.pattern, 'XXYXY');

// Roll 6 = 13 (Big) -> bet SBSB
r = E.run(entries([11, 14, 9, 14, 6, 13]), cfg);
assert.strictEqual(r.next.phase, 'bet');
assert.strictEqual(plan(r.next), 'SBSB');
assert.deepStrictEqual(r.next.mults, [1, 2, 4, 8]);

// Roll 6 = 7 (Small) -> bet BSBS
r = E.run(entries([11, 14, 9, 14, 6, 7]), cfg);
assert.strictEqual(plan(r.next), 'BSBS');

// Win on bet 2: factor 13 -> bet S (lose with 12), bet B (win with 15)
r = E.run(entries([11, 14, 9, 14, 6, 13, 12, 15]), cfg);
const last = r.rows[r.rows.length - 1];
assert.strictEqual(last.setEnd, 'won');
assert.strictEqual(last.setStep, 1);
assert.strictEqual(r.rows.reduce((a, x) => a + x.pnl, 0), 1); // -1 +2
// New window = last 5 (rolls 4-8: 14 6 13 12 15 = BSBBB -> XYXXX), waiting for factor
assert.strictEqual(r.next.phase, 'factor');
assert.strictEqual(r.next.pattern, 'XYXXX');

// Bust: pattern repeats exactly -> 4 losses, -15
r = E.run(entries([11, 14, 9, 14, 6, 13, 12, 8, 12, 9]), cfg);
assert.strictEqual(r.rows[9].setEnd, 'bust');
assert.strictEqual(r.rows.reduce((a, x) => a + x.pnl, 0), -15);
assert.strictEqual(r.next.phase, 'factor');

// Triple loses the bet but counts in pattern: bet S on roll 7, roll is 2-2-2 (total 6, Small) -> loss
r = E.run(entries([11, 14, 9, 14, 6, 13, [2, 2, 2]]), cfg);
assert.strictEqual(r.rows[6].result, 'loss');
assert.strictEqual(r.next.step, 1);

// +1 progression, group 4 (3 bets)
const c2 = { n: 4, prog: 'plusone', unit: 2, payout: 1 };
r = E.run(entries([11, 14, 9, 14, 6], c2), c2);
assert.strictEqual(r.next.phase, 'bet'); // window 11 14 9 14, factor 6
assert.deepStrictEqual(r.next.mults, [1, 3, 7]);
assert.strictEqual(r.next.amount, 2);

// Group 7 -> 6 bets doubling
const c3 = { n: 7, prog: 'double', unit: 1, payout: 1 };
r = E.run(entries([11, 14, 9, 14, 6, 13, 12, 8], c3), c3);
assert.deepStrictEqual(r.next.mults, [1, 2, 4, 8, 16, 32]);

// Teen Patti ranking: AKQ > KQJ > ... > 432 > A23 (lowest)
const w = (c) => TP.outcome({ c }).side;
assert.strictEqual(w(['Ah', 'Ad', 'As', 'Kh', 'Qh', 'Jh']), 'A'); // trail > pure seq
assert.strictEqual(w(['Ah', '2d', '3s', 'Kh', 'Qd', 'Js']), 'B'); // KQJ > A23 (A23 is lowest)
assert.strictEqual(w(['4h', '3d', '2s', 'Ah', '2c', '3d']), 'A'); // 432 > A23
assert.strictEqual(w(['Ah', 'Kd', 'Qs', 'Ah', '2d', '3c']), 'A'); // AKQ > A23
assert.strictEqual(w(['2h', '5h', '9h', 'Ah', 'Ad', 'Ks']), 'A'); // color > pair
assert.strictEqual(w(['Kh', 'Kd', '2s', 'Kc', 'Ks', '3h']), 'B'); // pair kicker
assert.strictEqual(w(['Kh', '9d', '2s', 'Kc', '9s', '2h']), null); // exact tie

// Tie plays as last winner, pushes money, flow continues
const tpe = (list) => list.map((x) => { const raw = { w: x }; const o = TP.outcome(raw); return { raw, o, side: o.side, lossAll: false, cfg }; });
r = E.run(tpe(['A', 'A', 'B', 'A', 'B', 'A', 'T']), cfg);
assert.strictEqual(r.rows[6].result, 'push');
assert.strictEqual(r.rows[6].pnl, 0);
assert.strictEqual(r.next.step, 1); // Tie played as A, bet was B -> step advanced to bet 2

// No Bet: flow continues but pnl = 0 and not counted in wagered
const nbe = (list) => list.map((x, i) => {
  const raw = DICE[x];
  const o = SicBo.outcome(raw);
  return { raw, o, side: o.side, lossAll: o.lossAll, cfg, nb: i === 6 };
});
r = E.run(nbe([11, 14, 9, 14, 6, 13, 12]), cfg);
assert.strictEqual(r.rows[6].noBet, true);
assert.strictEqual(r.rows[6].pnl, 0);
assert.strictEqual(r.next.step, 1);
const st = E.stats(r.rows);
assert.strictEqual(st.skipped, 1);
assert.strictEqual(st.wagered, 0);

// Card input: duplicate rejected, 6 cards commit
let p = TP.emptyPending();
for (const k of ['a', 'h', 'a', 'h']) p = TP.input(p, k).pending;
// Delay simulation: waitBust = 1 should insert a cooldown roll after a bust
const bustSeq = [11, 14, 9, 14, 6, 13, 12, 8, 12, 9, 6, 14, 15, 11, 12];
const rNoDelay = E.run(entries(bustSeq), Object.assign({}, cfg, { waitBust: 0 }));
assert.strictEqual(rNoDelay.rows[9].setEnd, 'bust');
assert.strictEqual(rNoDelay.rows[10].role, 'factor'); // roll 11 is factor immediately

const rDelay1 = E.run(entries(bustSeq), Object.assign({}, cfg, { waitBust: 1 }));
assert.strictEqual(rDelay1.rows[9].setEnd, 'bust');
assert.strictEqual(rDelay1.rows[10].role, 'cooldown'); // roll 11 is cooldown
assert.strictEqual(rDelay1.rows[11].role, 'factor'); // roll 12 is factor

// Post-bust analysis: check if bust hit on extra Bet 5 (roll 11 was 6, which is Small -> hit!)
const bustAnalysis = E.analyzeBusts(rNoDelay.rows);
assert.strictEqual(bustAnalysis.total, 1);
assert.strictEqual(bustAnalysis.countsByExtra[0], 1); // hit on Bet 5 (1 extra roll)
assert.strictEqual(bustAnalysis.pnlImpact[0], 16); // +16 units improvement vs stopping at 4 bets

const delays = E.simulateDelays(entries(bustSeq), cfg, [0, 1, 2]);
assert.strictEqual(delays.length, 3);
assert.strictEqual(delays[0].delay, 0);
assert.strictEqual(delays[1].delay, 1);

// Recovery mode unit tests
const recOpts = E.recoveryOptions(cfg);
assert.strictEqual(recOpts.length, 5);
const opt4 = recOpts.find((o) => o.k === 4);
assert.strictEqual(opt4.recMult, 4);
assert.strictEqual(opt4.totalBankrollUnits, 75);
assert.deepStrictEqual(opt4.stakesUnits, [4, 8, 16, 32]);

const opt3 = recOpts.find((o) => o.k === 3);
assert.strictEqual(opt3.recMult, 5);
assert.strictEqual(opt3.totalBankrollUnits, 90);
assert.deepStrictEqual(opt3.stakesUnits, [5, 10, 20, 40]);

const opt2 = recOpts.find((o) => o.k === 2);
assert.strictEqual(opt2.recMult, 8);
assert.strictEqual(opt2.totalBankrollUnits, 135);
assert.deepStrictEqual(opt2.stakesUnits, [8, 16, 32, 64]);

const opt1 = recOpts.find((o) => o.k === 1);
assert.strictEqual(opt1.recMult, 16);
assert.strictEqual(opt1.totalBankrollUnits, 255);
assert.deepStrictEqual(opt1.stakesUnits, [16, 32, 64, 128]);

// Recovery gameplay: with recovery = 3, after bust at roll 10, next set bets with 5x multiplier
const rRec = E.run(entries(bustSeq), Object.assign({}, cfg, { waitBust: 0, recovery: 3 }));
assert.strictEqual(rRec.rows[9].setEnd, 'bust');
assert.strictEqual(rRec.next.phase, 'bet');
assert.strictEqual(rRec.next.recMult, 5);
assert.strictEqual(rRec.next.amount, 5); // bet 1 is 1 * 5 = 5
assert.deepStrictEqual(rRec.next.mults, [5, 10, 20, 40]);
assert.strictEqual(rRec.next.recovery.totalSets, 3);

// ---------- 1. Fibonacci Progression & Recovery Tests ----------
const cfgFib = { n: 5, prog: 'fib', unit: 1, payout: 1 };
const rFib = E.run(entries([11, 14, 9, 14, 6, 13], cfgFib), cfgFib);
assert.strictEqual(rFib.next.phase, 'bet');
assert.deepStrictEqual(rFib.next.mults, [1, 2, 3, 5]);

const fibRecOpts = E.recoveryOptions(cfgFib);
assert.strictEqual(fibRecOpts.length, 5);
assert.strictEqual(fibRecOpts[0].k, 0); // off
assert.strictEqual(fibRecOpts[4].k, 1); // 1 set
assert.strictEqual(fibRecOpts[4].recMult, 12);
assert.strictEqual(fibRecOpts[4].totalBankrollUnits, 143);

// ---------- 2. Fibonacci Ladder Tests ----------
const cfgLadder = { n: 5, prog: 'fib_ladder', unit: 1, payout: 1, fibDrop: 2 };
const rLadder = E.run(entries([11, 14, 9, 14, 6, 13, 12, 15], cfgLadder), cfgLadder);
assert.strictEqual(rLadder.rows[6].role, 'bet');
assert.strictEqual(rLadder.rows[6].bet.amount, 1);
assert.strictEqual(rLadder.rows[6].result, 'loss');
assert.strictEqual(rLadder.rows[7].role, 'bet');
assert.strictEqual(rLadder.rows[7].bet.amount, 2);
assert.strictEqual(rLadder.rows[7].result, 'win');
assert.strictEqual(rLadder.next.ladder.level, 0);
assert.strictEqual(rLadder.next.ladder.mult, 1);

// ---------- 3. The Kickoff Game Tests ----------
const Kickoff = require('../js/games/kickoff.js');
assert.strictEqual(Kickoff.id, 'kickoff');
assert.strictEqual(Kickoff.outcome([5, 3]).side, 'A'); // Red wins
assert.strictEqual(Kickoff.outcome([2, 6]).side, 'B'); // Blue wins
assert.strictEqual(Kickoff.outcome([4, 4]).side, null); // Tie
assert.strictEqual(Kickoff.outcome([4, 4]).tie, true);

// Quick entries
assert.strictEqual(Kickoff.outcome({ w: 'A' }).side, 'A');
assert.strictEqual(Kickoff.outcome({ w: 'B' }).side, 'B');
assert.strictEqual(Kickoff.outcome({ w: 'T' }).side, null);

// Kickoff 30-round session test from user image
const kickoffRounds = [
  [3, 5], [1, 5], [4, 6], [2, 2], [5, 5], [5, 2], [5, 6], [4, 4], [4, 4], [5, 6],
  [3, 1], [5, 6], [4, 1], [2, 6], [3, 1], [2, 3], [2, 3], [6, 6], [1, 1], [1, 5],
  [3, 6], [5, 5], [2, 3], [3, 6], [6, 3], [3, 6], [6, 4], [3, 6], [3, 5], [1, 2]
];
const koEntries = kickoffRounds.map(d => {
  const o = Kickoff.outcome(d);
  return { raw: d, o, side: o.side, lossAll: false };
});
const koRes = E.run(koEntries, { n: 5, prog: 'double', unit: 1, payout: 1, waitBust: 0, recovery: 0 });
const koStats = E.stats(koRes.rows);
assert.strictEqual(koStats.sets, 9);
assert.strictEqual(koStats.won, 8);
assert.strictEqual(koStats.bust, 1);
assert.strictEqual(koStats.ties, 7);

// ---------- 4. Special Probability & Overdue Alert Tests ----------
const koProb = E.specialProbability('kickoff', koRes.rows);
assert.strictEqual(koProb.rollsSince, 8);
assert.strictEqual(koProb.isOverdue, true);

const fakeSb = Array(45).fill(null).map(() => ({ lossAll: false, o: { triple: false } }));
const sbProb = E.specialProbability('sicbo', fakeSb);
assert.strictEqual(sbProb.rollsSince, 45);
assert.strictEqual(sbProb.isHigh, true);

// ---------- 5. Session #3: User 105-Round Test Dataset ----------
const sb105Dice = [
  [1,3,4],[6,1,2],[5,1,6],[6,4,1],[4,6,5],[3,3,2],[2,6,5],[3,5,4],[2,5,1],[3,2,5],
  [6,6,5],[3,3,2],[3,2,6],[4,5,4],[3,5,2],[2,3,3],[2,3,4],[2,3,2],[6,4,1],[6,5,4],
  [3,2,1],[3,5,3],[6,3,1],[1,1,3],[3,2,2],[3,2,6],[2,6,3],[1,2,5],[1,2,3],[5,5,2],
  [4,3,2],[3,6,1],[2,5,1],[6,3,5],[6,4,5],[2,6,5],[4,6,2],[5,2,3],[3,1,2],[4,2,4],
  [2,4,6],[6,5,6],[1,4,1],[5,4,6],[5,5,4],[1,1,5],[2,2,3],[6,1,4],[5,5,5],[6,5,6],
  [4,3,2],[5,2,5],[4,2,5],[3,4,3],[1,3,3],[6,1,3],[6,4,2],[3,6,4],[4,4,5],[5,3,2],
  [2,1,4],[6,5,6],[6,1,2],[1,1,4],[1,1,5],[3,6,6],[4,4,2],[5,2,4],[5,2,5],[1,4,5],
  [2,5,1],[6,5,1],[2,4,6],[6,4,4],[6,6,6],[3,3,4],[2,5,6],[3,1,6],[1,3,3],[5,4,3],
  [5,1,5],[3,2,2],[2,5,4],[5,6,6],[2,1,5],[6,5,1],[2,5,5],[6,3,3],[4,4,1],[5,4,3],
  [2,6,4],[1,4,4],[5,5,2],[4,5,1],[5,1,4],[3,2,5],[4,3,1],[4,1,2],[2,3,6],[5,3,3],
  [2,2,2],[5,5,5],[1,1,4],[5,6,4],[4,6,4]
];
const sb105Entries = sb105Dice.map(d => {
  const o = SicBo.outcome(d);
  return { raw: d, o, side: o.side, lossAll: o.lossAll, total: o.total };
});
const sb105Res = E.run(sb105Entries, cfg);
const sb105Stats = E.stats(sb105Res.rows);
assert.strictEqual(sb105Stats.sets, 34);
assert.strictEqual(sb105Stats.won, 31);
assert.strictEqual(sb105Stats.bust, 3);
assert.strictEqual(sb105Stats.special, 4); // 4 triples

const tp105Winners = [
  'A','A','A','B','A','B','A','B','B','B',
  'A','B','A','B','A','B','B','A','A','B',
  'A','A','A','A','A','B','B','B','B','A',
  'B','A','A','A','B','B','B','A','A','A',
  'B','B','B','A','A','B','A','A','A','A',
  'A','A','A','B','A','B','A','A','A','B',
  'B','A','B','B','B','A','B','B','B','B',
  'A','A','A','A','B','B','B','A','B','A',
  'A','A','A','B','B','A','B','B','B','B',
  'B','B','A','A','B','A','A','A','B','B',
  'B','A','B','A','B'
];
const tp105Entries = tp105Winners.map(w => ({ raw: { w }, side: w, lossAll: false }));
const tp105Res = E.run(tp105Entries, cfg);
const tp105Stats = E.stats(tp105Res.rows);
assert.strictEqual(tp105Stats.sets, 37);
assert.strictEqual(tp105Stats.won, 37);
assert.strictEqual(tp105Stats.bust, 0); // 0 busts!

console.log('All engine tests passed (including Fibonacci, Kickoff, Probabilities, and Session #3)');
