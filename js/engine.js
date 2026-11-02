/* Generic "pattern will not repeat" strategy engine + stats.
 * Works on outcomes with side 'A' | 'B' | null (null = tie/push, skipped by the pattern).
 * Classic script (no modules) so the app runs straight from file://. Also loadable in Node for tests.
 */
(function (root) {
  const PROGRESSIONS = {
    double: { label: '1x 2x 4x 8x', mult: (k) => 2 ** k },
    plusone: { label: '1x 3x 7x 15x', mult: (k) => 2 ** (k + 1) - 1 },
  };
  const GROUP_SIZES = [4, 5, 6, 7];
  const opp = (s) => (s === 'A' ? 'B' : 'A');

  function abstract(pattern) {
    return pattern.map((s) => (s === pattern[0] ? 'X' : 'Y')).join('');
  }

  // Sides we'd bet over the whole set, given pattern + factor side.
  function betPlan(pattern, factor) {
    const plan = [];
    for (let k = 1; k < pattern.length; k++) {
      const repeatSide = pattern[k] === pattern[0] ? factor : opp(factor);
      plan.push(opp(repeatSide));
    }
    return plan;
  }

  function betFor(set, step) {
    const cfg = set.cfg;
    const mult = PROGRESSIONS[cfg.prog].mult(step);
    return { side: set.plan[step], step, of: set.plan.length, mult, amount: mult * cfg.unit };
  }

  /**
   * Replay one session's entries.
   * entry: { side, lossAll, cfg:{n,prog,unit,payout}, ... }
   * Returns { rows, next } where each row gets role/bet/result/pnl annotations.
   */
  function run(entries, curCfg) {
    const seq = [];
    const rows = [];
    let set = null;
    let setNo = 0;

    for (const e of entries) {
      const r = Object.assign({}, e, { role: 'collect', bet: null, result: null, pnl: 0, setEnd: null });
      rows.push(r);

      // Tie: plays as whoever won last (for pattern/flow), but money-wise it's a push.
      let side = e.side;
      const push = side == null;
      if (push) {
        side = seq[seq.length - 1];
        r.push = true;
        r.effSide = side;
        if (!side) { r.role = 'tie'; continue; } // no prior winner this session: ignore
      }

      if (set) {
        const bet = betFor(set, set.step);
        r.role = 'bet';
        r.bet = bet;
        r.setNo = set.no;
        const win = side === bet.side && !e.lossAll;
        r.result = push ? 'push' : win ? 'win' : 'loss';
        r.pnl = push ? 0 : win ? bet.amount * (set.cfg.payout || 1) : -bet.amount;
        if (e.nb) { r.noBet = true; r.pnl = 0; } // bet skipped: flow continues, no money
        r.units = r.pnl / set.cfg.unit;
        if (win) { r.setEnd = 'won'; r.setStep = set.step; set = null; }
        else if (++set.step >= set.plan.length) { r.setEnd = 'bust'; r.setStep = set.step - 1; set = null; }
        seq.push(side);
        continue;
      }

      // Idle: this entry becomes the factor if we have a full window behind it.
      const n = e.cfg.n;
      if (seq.length >= n) {
        const pattern = seq.slice(-n);
        set = { no: ++setNo, pattern, factor: side, plan: betPlan(pattern, side), cfg: Object.assign({}, e.cfg), step: 0 };
        r.role = 'factor';
        r.setNo = set.no;
        r.pattern = abstract(pattern);
        r.plan = set.plan;
      }
      seq.push(side);
    }

    let next;
    if (set) {
      next = Object.assign({ phase: 'bet', pattern: abstract(set.pattern), factor: set.factor, plan: set.plan,
        mults: set.plan.map((_, i) => PROGRESSIONS[set.cfg.prog].mult(i)) }, betFor(set, set.step));
    } else if (seq.length >= curCfg.n) {
      next = { phase: 'factor', pattern: abstract(seq.slice(-curCfg.n)), raw: seq.slice(-curCfg.n) };
    } else {
      next = { phase: 'collect', have: seq.length, need: curCfg.n };
    }
    return { rows, next };
  }

  /** Aggregate stats over annotated rows. */
  function stats(rows, nBetsMax = 6) {
    const s = {
      entries: rows.length, A: 0, B: 0, special: 0, ties: 0,
      sets: 0, won: 0, bust: 0, byStep: Array(nBetsMax).fill(0),
      bets: 0, betWins: 0, wagered: 0, net: 0, units: 0, peak: 0, maxDD: 0,
      bustStreak: 0, maxBustStreak: 0, pushes: 0, pushEnds: 0, skipped: 0, wonFree: 0,
    };
    let run = 0;
    for (const r of rows) {
      if (r.side === 'A') s.A++;
      else if (r.side === 'B') s.B++;
      else s.ties++;
      if (r.lossAll) s.special++;
      if (r.result === 'push') { s.pushes++; if (r.setEnd) s.pushEnds++; }
      if (r.noBet) s.skipped++;
      else if (r.result === 'win' || r.result === 'loss') {
        s.bets++; s.wagered += r.bet.amount;
        if (r.result === 'win') s.betWins++;
      }
      s.net += r.pnl; s.units += r.units || 0;
      run += r.pnl;
      s.peak = Math.max(s.peak, run);
      s.maxDD = Math.max(s.maxDD, s.peak - run);
      if (r.setEnd) {
        s.sets++;
        if (r.setEnd === 'won') { s.won++; s.byStep[r.setStep]++; s.bustStreak = 0; if (r.noBet || r.result === 'push') s.wonFree++; }
        else { s.bust++; s.bustStreak++; s.maxBustStreak = Math.max(s.maxBustStreak, s.bustStreak); }
      }
    }
    return s;
  }

  const api = { PROGRESSIONS, GROUP_SIZES, opp, abstract, betPlan, run, stats };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Engine = api;
})(this);
