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
assert.strictEqual(r.next.phase, 'continue');

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
// Alternating dealing order: [P1_1, P2_1, P1_2, P2_2, P1_3, P2_3]
const w = (c) => TP.outcome({ c, order: 'alternating' }).side;
assert.strictEqual(w(['Ah', 'Kh', 'Ad', 'Qh', 'As', 'Jh']), 'A'); // trail > pure seq
assert.strictEqual(w(['Ah', 'Kh', '2d', 'Qd', '3s', 'Js']), 'B'); // KQJ > A23 (A23 is lowest)
assert.strictEqual(w(['4h', 'Ah', '3d', '2c', '2s', '3d']), 'A'); // 432 > A23
assert.strictEqual(w(['Ah', 'Ad', 'Kd', '2d', 'Qs', '3c']), 'A'); // AKQ > A23
assert.strictEqual(w(['2h', 'Ah', '5h', 'Ad', '9h', 'Ks']), 'A'); // color > pair
assert.strictEqual(w(['Kh', 'Kc', 'Kd', 'Ks', '2s', '3h']), 'B'); // pair kicker
assert.strictEqual(w(['Kh', 'Kc', '9d', '9s', '2s', '2h']), null); // exact tie

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

// Card input: rank then numeric suit 1=♥ 2=♠ 3=♣ 4=♦
let p = TP.emptyPending();
p = TP.input(p, 'a').pending;
assert.strictEqual(p.active.rank, 'A');
p = TP.input(p, '1').pending; // '1' = Hearts
assert.deepStrictEqual(p.cards, ['Ah']);
assert.strictEqual(p.active, null);

// A then 2 = As
p = TP.input(p, 'a').pending;
p = TP.input(p, '2').pending; // '2' = Spades
assert.deepStrictEqual(p.cards, ['Ah', 'As']);

// 5 then 4 = 5d
p = TP.input(p, '5').pending;
p = TP.input(p, '4').pending; // '4' = Diamonds
assert.deepStrictEqual(p.cards, ['Ah', 'As', '5d']);

// 2 then 2 = 2s
p = TP.input(p, '2').pending;
p = TP.input(p, '2').pending; // '2' = Spades
assert.deepStrictEqual(p.cards, ['Ah', 'As', '5d', '2s']);

// 3 then 3 = 3c
p = TP.input(p, '3').pending;
p = TP.input(p, '3').pending; // '3' = Clubs
assert.deepStrictEqual(p.cards, ['Ah', 'As', '5d', '2s', '3c']);

// 0 then 1 = 10h (Deal 6 commits!)
const c6 = TP.input(p, '0').pending;
const res6 = TP.input(c6, '1'); // '1' = Hearts
assert.strictEqual(res6.commit.order, 'alternating');
assert.deepStrictEqual(res6.commit.c, ['Ah', 'As', '5d', '2s', '3c', '10h']);
assert.deepStrictEqual(res6.pending, { cards: [], active: null });

// Duplicate rejection
let pDup = TP.emptyPending();
pDup = TP.input(pDup, 'a').pending;
pDup = TP.input(pDup, '1').pending; // Ah
const dupRes = TP.input(pDup, 'a').pending;
const dupAttempt = TP.input(dupRes, '1'); // Ah again!
assert.strictEqual(dupAttempt.error, 'A♥ already dealt');
assert.deepStrictEqual(dupAttempt.pending, { cards: ['Ah'], active: null });

// Delay simulation: waitBust = 1 should insert a cooldown roll after a bust
const bustSeq = [11, 14, 9, 14, 6, 13, 12, 8, 12, 9, 6, 14, 15, 11, 12];
const rNoDelay = E.run(entries(bustSeq), Object.assign({}, cfg, { waitBust: 0 }));
assert.strictEqual(rNoDelay.rows[9].setEnd, 'bust');
assert.strictEqual(rNoDelay.rows[10].role, 'factor'); // roll 11 is factor immediately

const rDelay1 = E.run(entries(bustSeq), Object.assign({}, cfg, { waitBust: 1 }));
assert.strictEqual(rDelay1.rows[9].setEnd, 'bust');
assert.strictEqual(rDelay1.rows[10].role, 'cooldown'); // roll 11 is cooldown
assert.strictEqual(rDelay1.rows[11].role, 'factor'); // roll 12 is factor

// Wait after a win consumes completed games before detecting the next factor.
const winWait = E.run(entries([11, 14, 9, 14, 6, 13, 12, 15, 9, 6], { ...cfg, waitWin: 1 }), { ...cfg, waitWin: 1 });
assert.equal(winWait.rows[8].role, 'cooldown');
assert.equal(winWait.rows[8].cooldownReason, 'win');
assert.equal(winWait.rows[9].role, 'factor');

// Delayed betting waits only while the first planned bet would still lose.
const delayed = E.run(entries([11, 14, 9, 14, 6, 13, 12, 15], { ...cfg, waitBet: 1 }), { ...cfg, waitBet: 1 });
assert.equal(delayed.rows[5].role, 'factor');
assert.equal(delayed.rows[6].role, 'factor-wait');
assert.equal(delayed.rows[7].role, 'bet');
const broken = E.run(entries([11, 14, 9, 14, 6, 13, 9, 14, 9, 14, 6], { ...cfg, waitBet: 1 }), { ...cfg, waitBet: 1 });
assert.equal(broken.rows[6].role, 'factor-break');
assert.equal(broken.rows[6].pnl, 0);
assert.equal(broken.rows[6].setEnd, 'delay-break');
assert.equal(broken.rows[7].role, 'collect', 'a broken pattern clears state and starts collection fresh');

// A bust displays an optional next step; visible matching stake resumes the same run.
const atBust = entries(bustSeq.slice(0, 10));
const extension = E.analyzeBusts(rNoDelay.rows).busts[0].extraSteps[0];
assert.equal(E.run(atBust, cfg).next.phase, 'continue');
const resumed = E.run([...atBust, { side: extension.betSide, cfg, wager: {
  status: 'observed', currency: 'GC', bets: [{ market: extension.betSide, amount: extension.amount }],
} }], cfg);
assert.equal(resumed.rows.at(-1).role, 'bet');
assert.equal(resumed.rows.at(-1).bet.continuation, true);
assert.equal(resumed.rows.at(-1).setNo, resumed.rows[9].setNo);
assert.equal(resumed.rows.at(-1).bet.amount, extension.amount);

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
// Recovery is a recorded factor setting; changing today's setting cannot rewrite history.
const recCfg = Object.assign({}, cfg, { waitBust: 0, recovery: 3 });
const rRec = E.run(entries(bustSeq, recCfg), recCfg);
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

// Regressions: historical snapshots, simulations, observed extension P&L, and ladder previews.
const regressions = [
  ['Teen Patti preserves grouped history and marks alternating deals', () => {
    const cards = ['Ah', 'Ad', 'As', 'Kh', 'Kd', 'Qh'];
    const before = JSON.stringify(cards);
    assert.strictEqual(TP.outcome({ c: cards }).side, 'A');
    assert.strictEqual(TP.outcome({ c: cards, order: 'alternating' }).side, 'B');
    assert.strictEqual(JSON.stringify(cards), before);
    for (const complete of [pending => TP.confirmActive(pending), pending => TP.input(pending, 'h'), pending => TP.input(pending, 'j')]) {
      const pending = { cards: cards.slice(0, 5), active: { rank: 'Q', suitIdx: 0 } };
      const snapshot = JSON.stringify(pending);
      const result = complete(pending);
      assert.deepStrictEqual(result.commit, { c: cards, order: 'alternating' });
      assert.deepStrictEqual(result.pending, { cards: [], active: null });
      assert.strictEqual(JSON.stringify(pending), snapshot);
    }
  }],
  ['Teen Patti fast entry, numeric suits, duplicates and undo preserve input', () => {
    const missingCards = {};
    let pending = TP.input(missingCards, 'a').pending;
    assert.deepStrictEqual(missingCards, {});
    assert.deepStrictEqual(pending.active, { rank: 'A' });
    // Numeric suits: 1=h, 2=s, 3=c, 4=d
    for (const [key, suit] of [['1', 'h'], ['2', 's'], ['3', 'c'], ['4', 'd']]) {
      const p = TP.input({ cards: [] }, 'a').pending;
      const res = TP.input(p, key);
      assert.deepStrictEqual(res.pending.cards, ['A' + suit]);
    }
    const duplicate = { cards: ['Ah'], active: { rank: 'A' } };
    const before = JSON.stringify(duplicate);
    for (const confirm of [p => TP.confirmActive(p), p => TP.input(p, '1'), p => TP.input(p, 'h')]) {
      assert.strictEqual(confirm(duplicate).error, 'A♥ already dealt');
      assert.strictEqual(JSON.stringify(duplicate), before);
    }
    assert.deepStrictEqual(TP.undoInput(duplicate), { cards: ['Ah'], active: null });
    assert.deepStrictEqual(TP.undoInput({ cards: ['Ah'], active: null }), { cards: [], active: null });
    const changed = TP.input({ cards: [], active: { rank: 'A' } }, 'k');
    assert.deepStrictEqual(changed.pending, { cards: ['Ah'], active: { rank: 'K' } });
    assert.deepStrictEqual(TP.input(changed.pending, 'wa').commit, { w: 'A' });
    TP.emptyPending();
  }],
  ['Voice module parses spoken cards, dice, and commands accurately', () => {
    const Voice = require('../js/voice.js');
    assert.deepStrictEqual(Voice.parseSpeech('ace of spades').cards, ['As']);
    assert.deepStrictEqual(Voice.parseSpeech('king hearts').cards, ['Kh']);
    assert.deepStrictEqual(Voice.parseSpeech('five of diamonds').cards, ['5d']);
    assert.deepStrictEqual(Voice.parseSpeech('ten of clubs').cards, ['10c']);
    assert.deepStrictEqual(Voice.parseSpeech('deuce spades').cards, ['2s']);
    assert.deepStrictEqual(Voice.parseSpeech('trey of diamonds').cards, ['3d']);
    assert.deepStrictEqual(Voice.parseSpeech('ace 2').cards, ['As']);
    assert.deepStrictEqual(Voice.parseSpeech('5 4').cards, ['5d']);
    assert.deepStrictEqual(Voice.parseSpeech('ace of spades, king of hearts, five of clubs').cards, ['As', 'Kh', '5c']);
    assert.deepStrictEqual(Voice.parseSpeech('undo').commands, ['undo']);
    assert.deepStrictEqual(Voice.parseSpeech('clear').commands, ['clear']);
    assert.deepStrictEqual(Voice.parseSpeech('player 1 won').commands, ['wa']);
    assert.deepStrictEqual(Voice.parseSpeech('four five six', 'sicbo').dice, [4, 5, 6]);
    assert.deepStrictEqual(Voice.parseSpeech('triple four', 'sicbo').dice, [4, 4, 4]);
  }],
  ['recovery changes preserve recorded and legacy history', () => {
    const recorded = entries(bustSeq, { ...cfg, recovery: 0 });
    assert.deepStrictEqual(E.run(recorded, { ...cfg, recovery: 3 }).rows, E.run(recorded, cfg).rows);
    const legacy = entries(bustSeq);
    assert.strictEqual(E.stats(E.run(legacy, { ...cfg, recovery: 3 }).rows).net,
      E.stats(E.run(legacy, cfg).rows).net);
    const unsaved = legacy.map(({ cfg: ignored, ...entry }) => entry);
    assert.strictEqual(E.run(unsaved, recCfg).next.recMult, 5);
  }],
  ['changing recovery at the next factor cancels queued escalation', () => {
    const busted = entries(bustSeq.slice(0, 10), recCfg);
    const before = JSON.stringify(busted);
    for (const recovery of [0, 2]) {
      const changed = { ...cfg, recovery };
      const result = E.run([...busted, ...entries([6], changed)], changed);
      assert.strictEqual(result.next.recMult, 1);
      assert.strictEqual(result.next.recovery, null);
      assert.strictEqual(result.next.amount, 1);
    }
    // The newly chosen mode begins only after the next base set busts.
    const newMode = { ...cfg, recovery: 2 };
    const history = [...Array.from({ length: 10 }, () => ({ side: 'A', cfg: recCfg })),
      ...Array.from({ length: 6 }, () => ({ side: 'A', cfg: newMode }))];
    assert.strictEqual(E.run(history, newMode).next.recMult, 8);
    assert.strictEqual(JSON.stringify(busted), before);
  }],
  ['fibDrop uses recorded factor setting', () => {
    const history = entries([11, 14, 9, 14, 6, 13, 12, 8, 6], cfgLadder);
    const original = E.run(history, cfgLadder);
    const changed = E.run(history, { ...cfgLadder, fibDrop: 1 });
    assert.strictEqual(original.rows[8].setEnd, 'won');
    assert.strictEqual(changed.next.ladder.level, original.next.ladder.level);
    const legacy = entries([11, 14, 9, 14, 6, 13, 12, 8, 6], { ...cfgLadder, fibDrop: undefined });
    assert.strictEqual(E.run(legacy, { ...cfgLadder, fibDrop: 1 }).next.ladder.level, 0);
  }],
  ['delay simulations override recorded delays without mutation', () => {
    const history = entries(bustSeq, { ...cfg, waitBust: 0 });
    const before = JSON.stringify(history);
    const simulated = E.simulateDelays(history, cfg, [0, 1, 2]);
    const expected = [0, 1, 2].map(waitBust => E.stats(E.run(
      history.map(entry => ({ ...entry, cfg: { ...entry.cfg, waitBust } })), { ...cfg, waitBust }).rows));
    assert.deepStrictEqual(simulated.map(x => x.stats), expected);
    assert.strictEqual(JSON.stringify(history), before);
  }],
  ['delay simulations reset each session', () => {
    for (const sessionKey of ['s', 'sessionNo']) {
      const first = entries(bustSeq.slice(0, 10)).map(entry => ({ ...entry, [sessionKey]: 1 }));
      const second = entries([6, 14, 15]).map(entry => ({ ...entry, [sessionKey]: 2 }));
      const result = E.simulateDelays([...first, ...second], cfg, [0])[0];
      const expected = E.stats([...E.run(first, cfg).rows, ...E.run(second, cfg).rows]);
      assert.deepStrictEqual(result.stats, expected);
      assert.strictEqual(result.next.phase, 'collect');
    }
  }],
  ['unobserved extension horizons stay pending', () => {
    const truncated = E.run(entries(bustSeq.slice(0, 10)), cfg);
    const a = E.analyzeBusts(truncated.rows);
    assert.deepStrictEqual(a.pnlImpact, [0, 0, 0, 0]);
    assert.deepStrictEqual(a.evaluatedByExtra, [0, 0, 0, 0]);
    assert.deepStrictEqual(a.pendingByExtra, [1, 1, 1, 1]);
    const oneLoss = E.run(entries([...bustSeq.slice(0, 10), 11]), cfg);
    const partial = E.analyzeBusts(oneLoss.rows);
    assert.deepStrictEqual(partial.pnlImpact, [-16, 0, 0, 0]);
    assert.deepStrictEqual(partial.evaluatedByExtra, [1, 0, 0, 0]);
    const resolved = E.analyzeBusts(rNoDelay.rows);
    assert.deepStrictEqual(resolved.evaluatedByExtra, [1, 1, 1, 1]);
    assert.deepStrictEqual(resolved.pendingByExtra, [0, 0, 0, 0]);
  }],
  ['extension profit uses actual progression and payout', () => {
    const history = [...bustSeq.slice(0, 10), 6];
    for (const [prog, payout, expected] of [['plusone', 1, 31], ['double', 0.5, 8], ['fib', 1, 8]]) {
      const settings = { ...cfg, prog, payout };
      const a = E.analyzeBusts(E.run(entries(history, settings), settings).rows);
      assert.deepStrictEqual(a.pnlImpact, [expected, expected, expected, expected]);
    }
  }],
  ['extension horizons sum actual losses before the resolving win', () => {
    for (const [prog, payout, expected] of [['double', 1, 16], ['plusone', 1, 32], ['double', 0.5, 0], ['fib_ladder', 1, 5]]) {
      const settings = { ...cfg, prog, payout };
      const history = entries([...bustSeq.slice(0, 10), 11, 6], settings);
      const a = E.analyzeBusts(E.run(history, settings).rows);
      const firstStake = prog === 'plusone' ? 31 : prog === 'fib_ladder' ? 8 : 16;
      assert.deepStrictEqual(a.pnlImpact, [-firstStake, expected, expected, expected]);
      assert.deepStrictEqual(a.countsByExtra, [0, 1, 0, 0]);
    }
  }],
  ['extension analysis stops at either session identifier', () => {
    for (const key of ['s', 'sessionNo']) {
      const rows = E.run(entries([...bustSeq.slice(0, 10), 6]), cfg).rows.map((row, i) => ({ ...row, [key]: i < 10 ? 1 : 2 }));
      const a = E.analyzeBusts(rows);
      assert.deepStrictEqual(a.pnlImpact, [0, 0, 0, 0]);
      assert.deepStrictEqual(a.pendingByExtra, [1, 1, 1, 1]);
    }
  }],
  ['extension ties advance flow and skipped bets carry no money', () => {
    const rows = E.run(entries(bustSeq.slice(0, 10)), cfg).rows;
    // Bet 5 wants B, last outcome is B: push ends continuation with zero profit.
    const pushed = E.analyzeBusts([...rows, { side: null }]);
    assert.deepStrictEqual(pushed.pnlImpact, [0, 0, 0, 0]);
    assert.deepStrictEqual(pushed.evaluatedByExtra, [1, 1, 1, 1]);
    const skipped = E.analyzeBusts([...rows, { side: 'B', nb: true }]);
    assert.deepStrictEqual(skipped.pnlImpact, [0, 0, 0, 0]);
    assert.strictEqual(skipped.resolvedCount, 1);
  }],
  ['ladder previews align with actual next stake including recovery', () => {
    const history = entries([11, 14, 9, 14, 6, 13, 12, 8], cfgLadder);
    const result = E.run(history, cfgLadder);
    assert.strictEqual(result.next.step, 2);
    assert.strictEqual(result.next.mults[result.next.step], result.next.mult);
    assert.deepStrictEqual(result.next.mults, [1, 2, 3, 5]);
    const ladderRec = { ...cfgLadder, recovery: 3 };
    const recovered = E.run(entries([...bustSeq.slice(0, 10), 6], ladderRec), ladderRec);
    assert.strictEqual(recovered.next.recMult, 4);
    assert.strictEqual(recovered.next.mults[recovered.next.step], recovered.next.mult);
    assert.strictEqual(recovered.next.mult, 32);
  }],
  ['extension ladder stakes preserve level and recovery multiplier', () => {
    const ladderRec = { ...cfgLadder, recovery: 3 };
    // Two consecutive busts: first from 1,2,3,5; recovery from 8,13,21,34 at 4x.
    const sides = ['A','A','A','A','A','A','A','A','A','A','A','A','A','A','A','B'];
    const history = sides.map(side => ({ side, cfg: ladderRec }));
    const rows = E.run(history, ladderRec).rows;
    const analysis = E.analyzeBusts(rows);
    assert.strictEqual(analysis.total, 2);
    assert.strictEqual(analysis.busts[1].extraSteps[0].mult, 220);
    assert.strictEqual(analysis.busts[1].extraSteps[0].amount, 220);
    assert.strictEqual(analysis.busts[1].extraSteps[0].pnl, 220);
  }],
  ['zero payout stays zero consistently with recovery and extension calculations', () => {
    const zero = { ...cfg, payout: 0 };
    const result = E.run(entries([11, 14, 9, 14, 6, 13, 12, 15], zero), zero);
    assert.strictEqual(result.rows[7].result, 'win');
    assert.strictEqual(result.rows[7].pnl, 0);
    assert.strictEqual(E.stats(result.rows).net, -1);
  }],
  ['rare-outcome messages keep next-roll odds independent of roll gap', () => {
    for (const [probability, chance] of [[sbProb, '1/36 (2.78%)'], [koProb, '1/6 (16.67%)']]) {
      assert.ok(probability.message.includes(`next-roll chance remains ${chance}`));
      assert.ok(probability.message.includes('Historical'));
      assert.ok(!/overdue|high.*alert/i.test(probability.message));
    }
  }],
  ['recovery profit claims reflect progression and payout', () => {
    const plus = E.recoveryOptions({ ...cfg, prog: 'plusone' }).find(o => o.k === 3);
    assert.strictEqual(plus.profitPerWinUnits, null);
    assert.deepStrictEqual(plus.profitByStepUnits, [9, 18, 27, 36]);
    const fib = E.recoveryOptions(cfgFib).find(o => o.k === 3);
    assert.strictEqual(fib.minProfitPerWinUnits, -4);
    assert.strictEqual(fib.maxProfitPerWinUnits, 4);
    const low = E.recoveryOptions({ ...cfg, payout: 0.5 }).find(o => o.k === 3);
    assert.strictEqual(low.minProfitPerWinUnits, -15);
    assert.strictEqual(low.profitPerWinUnits, null);
  }],
];
const failures = [];
for (const [name, check] of regressions) {
  try { check(); }
  catch (error) { failures.push(`${name}: ${error.message}`); }
}
assert.deepStrictEqual(failures, [], failures.join('\n'));
console.log('All engine tests passed (including history, simulations, extension analysis, Fibonacci, and game regressions)');
