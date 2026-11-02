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
    let cooldown = 0;

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
        else if (++set.step >= set.plan.length) {
          r.setEnd = 'bust';
          r.setStep = set.step - 1;
          r.pattern = abstract(set.pattern);
          r.rawPattern = set.pattern.slice();
          r.factor = set.factor;
          r.plan = set.plan.slice();
          r.setCfg = Object.assign({}, set.cfg);
          cooldown = (set.cfg && set.cfg.waitBust != null) ? set.cfg.waitBust : (curCfg.waitBust || 0);
          set = null;
        }
        seq.push(side);
        continue;
      }

      // If waiting after a bust, sit out without forming factor
      if (cooldown > 0) {
        r.role = 'cooldown';
        r.cooldownLeft = cooldown;
        cooldown--;
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
    } else if (cooldown > 0) {
      next = { phase: 'cooldown', left: cooldown, have: seq.length, need: curCfg.n };
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

  /**
   * Post-bust recovery analysis:
   * For each bust in rows, check what happened on subsequent non-tie rolls if the player had
   * continued betting cyclically up to maxExtra bets (e.g. bets 5, 6, 7, 8).
   */
  function analyzeBusts(rows, maxExtra = 4) {
    const busts = [];
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      if (r.setEnd !== 'bust') continue;
      const pat = r.rawPattern;
      if (!pat) continue;
      const factor = r.factor;
      const n = pat.length;
      const cfg = r.setCfg || r.cfg || {};
      const prog = cfg.prog || 'double';
      const unit = cfg.unit || 1;

      const extraSteps = [];
      let j = i + 1;
      let stepCount = 0;
      while (j < rows.length && stepCount < maxExtra) {
        const sub = rows[j++];
        if (sub.side == null) continue; // skip ties
        const step = (n - 1) + stepCount;
        const repeatSide = pat[(step + 1) % n] === pat[0] ? factor : opp(factor);
        const betSide = opp(repeatSide);
        const win = sub.side === betSide && !sub.lossAll;
        const mult = PROGRESSIONS[prog] ? PROGRESSIONS[prog].mult(step) : (2 ** step);
        extraSteps.push({
          step: step + 1,
          betSide,
          actualSide: sub.side,
          win,
          mult,
          amount: mult * unit,
        });
        stepCount++;
        if (win) break;
      }

      const hitIdx = extraSteps.findIndex((s) => s.win);
      const hitOnBet = hitIdx !== -1 ? extraSteps[hitIdx].step : null;
      busts.push({
        setNo: r.setNo,
        rowIdx: i,
        pattern: r.pattern,
        factor,
        n,
        prog,
        unit,
        extraSteps,
        hitOnBet,
        resolved: hitOnBet !== null,
      });
    }

    const countsByExtra = Array(maxExtra).fill(0);
    let resolvedCount = 0;
    for (const b of busts) {
      if (b.hitOnBet) {
        const extraIdx = b.hitOnBet - b.n;
        if (extraIdx >= 0 && extraIdx < maxExtra) {
          countsByExtra[extraIdx]++;
          resolvedCount++;
        }
      }
    }

    const pnlImpact = Array(maxExtra).fill(0);
    for (const b of busts) {
      const prog = b.prog;
      const unit = b.unit;
      for (let e = 1; e <= maxExtra; e++) {
        const hitExtra = b.hitOnBet ? (b.hitOnBet - b.n + 1) : 999;
        if (hitExtra <= e) {
          let baseLoss = 0;
          for (let k = 0; k < b.n - 1; k++) baseLoss += (PROGRESSIONS[prog] ? PROGRESSIONS[prog].mult(k) : (2 ** k)) * unit;
          pnlImpact[e - 1] += (baseLoss + unit);
        } else {
          let addedLoss = 0;
          for (let k = b.n - 1; k < b.n - 1 + e; k++) addedLoss += (PROGRESSIONS[prog] ? PROGRESSIONS[prog].mult(k) : (2 ** k)) * unit;
          pnlImpact[e - 1] -= addedLoss;
        }
      }
    }

    return {
      total: busts.length,
      countsByExtra,
      resolvedCount,
      unresolvedCount: busts.length - resolvedCount,
      pnlImpact,
      busts,
    };
  }

  /**
   * Simulate different re-entry delays (e.g. wait 0, 1, 2, 3 rolls after a bust)
   * on the exact same roll history.
   */
  function simulateDelays(entries, baseCfg, delays = [0, 1, 2, 3]) {
    return delays.map((d) => {
      const cfg = Object.assign({}, baseCfg, { waitBust: d });
      const res = run(entries, cfg);
      const s = stats(res.rows);
      return { delay: d, stats: s, next: res.next };
    });
  }

  const api = { PROGRESSIONS, GROUP_SIZES, opp, abstract, betPlan, run, stats, analyzeBusts, simulateDelays };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Engine = api;
})(this);
