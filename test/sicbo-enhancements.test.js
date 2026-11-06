const assert = require('node:assert/strict');
const Engine = require('../js/engine');
const SicBo = require('../js/games/sicbo');
const { validate, createDefault } = require('../js/data');

const DICE = {
  4: [1, 1, 2],
  6: [1, 2, 3],
  8: [2, 3, 3],
  9: [1, 2, 6],
  10: [2, 3, 5],
  11: [1, 4, 6],
  12: [3, 4, 5],
  13: [3, 4, 6],
  14: [2, 6, 6],
  17: [5, 6, 6],
  triple1: [1, 1, 1],
  triple4: [4, 4, 4],
};

function rollRow(totalOrKey) {
  const dice = DICE[totalOrKey] || DICE[10];
  const o = SicBo.outcome(dice);
  return { raw: dice, o, side: o.side, lossAll: o.lossAll };
}

// -------------------------------------------------------------
// 1. Triple Risk Detection Tests
// -------------------------------------------------------------
console.log('Testing Sic Bo Triple Detection...');

// No rows / non-sicbo
assert.equal(Engine.detectTripleRisk('sicbo', []), null);
assert.equal(Engine.detectTripleRisk('teenpatti', [rollRow(10)]), null);

// Gap threshold tests (expected 36 rolls, warning starts at 30)
const rolls25 = Array.from({ length: 25 }, () => rollRow(10));
assert.equal(Engine.detectTripleRisk('sicbo', rolls25), null, '25 rolls without triple or pairs does not trigger');

const rolls30 = Array.from({ length: 30 }, () => rollRow(10));
const risk30 = Engine.detectTripleRisk('sicbo', rolls30, 0);
assert.ok(risk30, '30 rolls triggers triple risk');
assert.equal(risk30.due, true);
assert.equal(risk30.rollsSince, 30);
assert.equal(risk30.urgent, false, 'Step 1 is not urgent');

// Overdue threshold (36 rolls)
const rolls36 = Array.from({ length: 36 }, () => rollRow(10));
const risk36 = Engine.detectTripleRisk('sicbo', rolls36, 0);
assert.ok(risk36);
assert.equal(risk36.gapOverdue, true);
assert.match(risk36.message, /TRIPLE OVERDUE/);

// Pair clustering detection: 2 pairs in last 5 rolls after 15 rolls
const rollsPairCluster = [
  ...Array.from({ length: 15 }, () => rollRow(10)), // 2, 3, 5 (no pair)
  rollRow(4), // 1, 1, 2 (pair)
  rollRow(10), // 2, 3, 5
  rollRow(8), // 2, 3, 3 (pair)
  rollRow(11), // 1, 4, 6
  rollRow(12), // 3, 4, 5
];
const riskPairs = Engine.detectTripleRisk('sicbo', rollsPairCluster, 1);
assert.ok(riskPairs, 'Pair clustering triggers risk');
assert.equal(riskPairs.due, true);
assert.equal(riskPairs.pairCount, 2);

// Step 5 urgency: step >= 4 (5th bet)
const riskStep5 = Engine.detectTripleRisk('sicbo', rolls30, 4);
assert.ok(riskStep5);
assert.equal(riskStep5.urgent, true, 'Step 5 bet flags urgent');
assert.match(riskStep5.message, /CRITICAL RISK/);
assert.match(riskStep5.message, /Strongly recommend skipping/);

// Reset on actual triple
const rollsAfterTriple = [...rolls36, rollRow('triple4'), rollRow(10), rollRow(11)];
assert.equal(Engine.detectTripleRisk('sicbo', rollsAfterTriple), null, 'Risk clears after recent triple');

// -------------------------------------------------------------
// 2. Bet Step Preservation on Skip (Option B) Tests
// -------------------------------------------------------------
console.log('Testing Bet Step Preservation on Skip (Option B)...');

const cfg = { n: 5, prog: 'double', unit: 1, payout: 1, waitBust: 0, waitWin: 0, waitBet: 0, recovery: 0, fibDrop: 2 };

// Helper to create engine entries
function makeEntries(diceList, skips = []) {
  return diceList.map((d, i) => {
    const raw = Array.isArray(d) ? d : (DICE[d] || DICE[10]);
    const o = SicBo.outcome(raw);
    return { raw, o, side: o.side, lossAll: o.lossAll, cfg, nb: skips.includes(i) };
  });
}

// Sequence: 5 rolls to set factor: [11(A), 14(A), 9(B), 14(A), 6(B)] -> pattern B
// Roll 5: 13(A) -> factor A
// Roll 6 is Bet 1 (step 0).
// If we skip Bet 1 (i = 6):
const runSkip1 = Engine.run(makeEntries([11, 14, 9, 14, 6, 13, 12], [6]), cfg);
assert.equal(runSkip1.rows[6].noBet, true);
assert.equal(runSkip1.rows[6].pnl, 0);
assert.equal(runSkip1.next.step, 0, 'Skipping bet 1 keeps step frozen at 0');
assert.equal(runSkip1.next.mult, 1, 'Stake remains 1x after skipping bet 1');
assert.equal(runSkip1.next.plan[runSkip1.next.step], runSkip1.next.side, 'Plan step 0 updates to match shifted rollIndex side after skip');

// Now lose next roll for real: step advances to 1 (bet 2)
// For rollIndex 1, plan[1] is 'A' (Big). So 9 (B, Small) is a loss.
const runLossAfterSkip = Engine.run(makeEntries([11, 14, 9, 14, 6, 13, 12, 9], [6]), cfg);
assert.equal(runLossAfterSkip.rows[7].result, 'loss');
assert.equal(runLossAfterSkip.next.step, 1, 'Next bet is now step 1 (2x)');
assert.equal(runLossAfterSkip.next.mult, 2);

// Now advance to Bet 3 (step 2) and skip:
// Roll 6: skip at step 0 (12 -> A, plan[0] is B -> loss). Step stays 0.
// Roll 7: loss at step 0 (9 -> B, plan[1] is A -> loss). Step advances to 1.
// Roll 8: loss at step 1 (12 -> A, plan[2] is B -> loss). Step advances to 2.
// Roll 9: skip at step 2 (9 -> B, plan[3] is A -> loss). Step remains at 2!
const runSkip3 = Engine.run(makeEntries([11, 14, 9, 14, 6, 13, 12, 9, 12, 9], [6, 9]), cfg);
assert.equal(runSkip3.rows[9].noBet, true);
assert.equal(runSkip3.rows[9].bet.step, 2);
assert.equal(runSkip3.rows[9].bet.mult, 4);
assert.equal(runSkip3.next.step, 2, 'Skipping bet 3 keeps next bet at step 2');
assert.equal(runSkip3.next.mult, 4, 'Stake remains 4x after skipping bet 3');
assert.equal(runSkip3.next.plan[runSkip3.next.step], runSkip3.next.side, 'Plan step 2 matches shifted rollIndex side after skip');

// Option B Test: If a skipped roll matches the win side, set ends as won ($0 pnl)
// Pattern fading A: bet side is B (Small, <= 10).
// Let roll 6 be 9 (B - Small, would-be win) with skip!
const runSkipWin = Engine.run(makeEntries([11, 14, 9, 14, 6, 13, 9], [6]), cfg);
assert.equal(runSkipWin.rows[6].noBet, true);
assert.equal(runSkipWin.rows[6].result, 'win');
assert.equal(runSkipWin.rows[6].pnl, 0, 'No profit on skipped win');
assert.equal(runSkipWin.rows[6].setEnd, 'won', 'Set ends on skipped win under Option B');
assert.ok(['collect', 'factor'].includes(runSkipWin.next.phase), 'Next phase moves to new pattern collection/factor');

// -------------------------------------------------------------
// 3. Manual Bet Adjustments Tests
// -------------------------------------------------------------
console.log('Testing Manual Bet Amount Override...');

const manualEntry = makeEntries([11, 14, 9, 14, 6, 13, 12])[6];
manualEntry.manualAmount = 5.00; // override from 1.00 to 5.00
const runManual = Engine.run([
  ...makeEntries([11, 14, 9, 14, 6, 13]),
  manualEntry,
], cfg);
assert.equal(runManual.rows[6].bet.amount, 5.00);
assert.equal(runManual.rows[6].bet.mult, 5);
assert.equal(runManual.rows[6].pnl, -5.00);

// -------------------------------------------------------------
// 4. Target Profit Calculation Tests
// -------------------------------------------------------------
console.log('Testing Target Profit Schema & Calculations...');

// Data validation
const cfgWithTarget = { ...cfg, targetProfit: 25.5 };
const validatedCfg = validate({ ...createDefault(), books: { 'shuff:sicbo': { cfg: cfgWithTarget, sessions: [{ id: 's1', start: 1 }], entries: [] } } });
assert.equal(validatedCfg.books['shuff:sicbo'].cfg.targetProfit, 25.5);

// Target math:
const unit = 0.50;
const targetProfit = 10.00;
const targetUnits = targetProfit / unit; // 20.0 units

// Scenario A: Under target (net = +$3.00, +6.0u)
const netA = 3.00;
const unitsA = netA / unit;
const diffDolA = targetProfit - netA; // 7.00 needed
const diffUnitsA = targetUnits - unitsA; // 14.0 units needed
assert.equal(diffDolA, 7.00);
assert.equal(diffUnitsA, 14.0);

// Scenario B: Achieved target (net = +$12.50, +25.0u)
const netB = 12.50;
const unitsB = netB / unit;
const diffDolB = targetProfit - netB; // -2.50 (ahead)
const diffUnitsB = targetUnits - unitsB; // -5.0 units (ahead)
assert.equal(diffDolB, -2.50);
assert.equal(diffUnitsB, -5.0);

console.log('All Sic Bo Enhancement tests passed successfully!');
