/* Generic "pattern will not repeat" strategy engine + stats.
 * Works on outcomes with side 'A' | 'B' | null (null = tie/push, skipped by the pattern).
 * Classic script (no modules) so the app runs straight from file://. Also loadable in Node for tests.
 */
(function (root) {
  const FIB_SEQUENCE = [1, 2, 3, 5, 8, 13, 21, 34, 55, 89, 144];
  const PROGRESSIONS = {
    double: { label: '1x 2x 4x 8x', mult: (k) => 2 ** k },
    plusone: { label: '1x 3x 7x 15x', mult: (k) => 2 ** (k + 1) - 1 },
    fib: { label: '1x 2x 3x 5x', mult: (k) => FIB_SEQUENCE[k] || FIB_SEQUENCE[FIB_SEQUENCE.length - 1] },
    fib_ladder: { label: 'Fib Ladder', mult: (k) => FIB_SEQUENCE[k] || FIB_SEQUENCE[FIB_SEQUENCE.length - 1], ladder: true },
    fib_climber: { label: 'Fib Climber', mult: (k) => FIB_SEQUENCE[k] || FIB_SEQUENCE[FIB_SEQUENCE.length - 1], ladder: true, climber: true },
  };
  const GROUP_SIZES = [4, 5, 6, 7];
  const opp = (s) => (s === 'A' ? 'B' : 'A');

  function abstract(pattern) {
    return pattern.map((s) => (s === pattern[0] ? 'X' : 'Y')).join('');
  }

  // Sides we'd bet over the whole set, given pattern + factor side.
  function betPlan(pattern, factor, offset = 0) {
    const plan = [];
    for (let k = 1; k < pattern.length; k++) {
      plan.push(continuationSide(pattern, factor, offset + k - 1));
    }
    return plan;
  }

  function profitRange(cfg, mults) {
    let lost = 0;
    const profits = mults.map((mult) => {
      const profit = mult * (cfg.payout == null ? 1 : cfg.payout) - lost;
      lost += mult;
      return profit;
    });
    const min = Math.min(...profits);
    const max = Math.max(...profits);
    return { profits, min, max, constant: min === max };
  }

  function recoveryProfit(cfg, recMult, level = 0) {
    const prog = PROGRESSIONS[cfg.prog] || PROGRESSIONS.double;
    const mults = Array.from({ length: cfg.n - 1 }, (_, k) =>
      prog.mult(prog.ladder ? level + k : k) * recMult);
    const range = profitRange(cfg, mults);
    const unit = cfg.unit || 1;
    return {
      profitPerWin: range.constant ? range.min * unit : null,
      profitMin: range.min * unit,
      profitMax: range.max * unit,
    };
  }

  function recoveryOptions(cfg) {
    const n = cfg.n || 5;
    const nBets = n - 1;
    const progKey = cfg.prog && PROGRESSIONS[cfg.prog] ? cfg.prog : 'double';
    const prog = PROGRESSIONS[progKey];
    const baseMults = Array.from({ length: nBets }, (_, i) => prog.mult(i));
    const baseRiskUnits = baseMults.reduce((a, b) => a + b, 0);
    const unit = cfg.unit || 1;

    const targets = [
      { k: 0, label: 'Off (Flat)' },
      { k: 4, label: '4 Sets' },
      { k: 3, label: '3 Sets' },
      { k: 2, label: '2 Sets' },
      { k: 1, label: '1 Set' },
    ];

    return targets.map(({ k, label }) => {
      const recMult = k === 0 ? 1 : (k === 1 ? (baseRiskUnits + 1) : Math.ceil(baseRiskUnits / k));
      const stakesUnits = baseMults.map((m) => m * recMult);
      const range = profitRange(cfg, stakesUnits);
      const recSetRiskUnits = baseRiskUnits * recMult;
      const totalBankrollUnits = baseRiskUnits + recSetRiskUnits;
      return {
        k,
        label,
        recMult,
        stakesUnits,
        stakesLabel: stakesUnits.map((m) => m + 'x').join(' '),
        profitPerWinUnits: range.constant && !prog.ladder ? range.min : null,
        profitPerWinCash: range.constant && !prog.ladder ? range.min * unit : null,
        profitByStepUnits: range.profits,
        minProfitPerWinUnits: range.min,
        maxProfitPerWinUnits: range.max,
        minProfitPerWinCash: range.min * unit,
        maxProfitPerWinCash: range.max * unit,
        bust1Units: baseRiskUnits,
        bust1Cash: baseRiskUnits * unit,
        recSetRiskUnits,
        recSetRiskCash: recSetRiskUnits * unit,
        totalBankrollUnits,
        totalBankrollCash: totalBankrollUnits * unit,
      };
    });
  }

  function betFor(set, step) {
    const cfg = set.cfg;
    const isLadder = PROGRESSIONS[cfg.prog] && PROGRESSIONS[cfg.prog].ladder;
    const recMult = set.recMult || 1;
    let baseMult;
    if (isLadder) {
      const lvl = (set.ladderLevel != null) ? set.ladderLevel : 0;
      baseMult = FIB_SEQUENCE[Math.min(FIB_SEQUENCE.length - 1, Math.max(0, lvl))];
    } else {
      const p = PROGRESSIONS[cfg.prog] || PROGRESSIONS.double;
      baseMult = p.mult(step);
    }
    const mult = baseMult * recMult;
    const planIdx = set.rollIndex != null ? set.rollIndex : step;
    return {
      side: set.plan[planIdx] || continuationSide(set.pattern, set.factor, planIdx + (set.patternOffset || 0)),
      step,
      of: set.plan.length,
      mult,
      baseMult,
      recMult,
      ladderLevel: set.ladderLevel,
      amount: mult * cfg.unit,
      recovery: set.recovery || null,
      continuation: !!set.continuing,
    };
  }

  function continuationSide(pattern, factor, step) {
    const repeatSide = pattern[(step + 1) % pattern.length] === pattern[0] ? factor : opp(factor);
    return opp(repeatSide);
  }

  function continueSet(set, ladderLevel, bustIndex, recoveryState) {
    const startIdx = set.rollIndex != null ? set.rollIndex : set.plan.length;
    const extra = Array.from({ length: 4 }, (_, i) => continuationSide(set.pattern, set.factor, startIdx + i + (set.patternOffset || 0)));
    return { ...set, plan: [...set.plan, ...extra], step: set.plan.length, rollIndex: startIdx, playedMults: [...set.playedMults],
      ladderLevel, delayLeft: 0, continuing: true, bustIndex, recoveryState: recoveryState ? { ...recoveryState } : null };
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
    let cooldownReason = 'bust';
    let continuation = null;
    let recoveryState = null;
    let ladderLevel = 0;
    let sessionBankProfit = 0;

    for (const e of entries) {
      const r = Object.assign({}, e, { role: 'collect', bet: null, result: null, pnl: 0, setEnd: null });
      rows.push(r);

      // Tie: plays as whoever won last (for pattern/flow), but money-wise it's a push unless lossAll.
      let side = e.side;
      const push = side == null && !e.lossAll;
      if (side == null) {
        side = seq[seq.length - 1];
        if (push) {
          r.push = true;
          r.effSide = side;
          if (!side) { r.role = 'tie'; continue; } // no prior winner this session: ignore
        } else {
          r.effSide = side;
          if (!side) { r.role = 'tie'; continue; }
        }
      }

      if (!set && continuation) {
        const expected = betFor(continuation, continuation.step);
        const confirmed = !e.nb && e.wager?.status === 'observed' && e.wager.bets.some(b => b.market === expected.side && b.amount > 0);
        if (confirmed) {
          rows[continuation.bustIndex] = { ...rows[continuation.bustIndex], continued: true };
          set = continuation; recoveryState = continuation.recoveryState; continuation = null; cooldown = 0;
        }
        else continuation = null; // Declining the next wager returns to the normal cooldown/new-run flow.
      }

      if (set) {
        if (set.delayLeft > 0) {
          const expectedBetSide = continuationSide(set.pattern, set.factor, set.delayElapsed);
          r.setNo = set.no;
          if (!push && side === expectedBetSide) {
            r.role = 'factor-break';
            r.setEnd = 'delay-break';
            r.setNo = set.no;
            r.pattern = abstract(set.pattern);
            r.pnl = 0;
            seq.length = 0;
            set = null;
            recoveryState = null;
            ladderLevel = 0;
            sessionBankProfit = 0;
            cooldown = 0;
            continue;
          }
          r.role = 'factor-wait';
          r.delayLeft = set.delayLeft;
          set.delayLeft--;
          set.delayElapsed++;
          seq.push(side);
          continue;
        }
        const bet = betFor(set, set.step);
        if (e.manualAmount != null && Number.isFinite(e.manualAmount) && e.manualAmount >= 0) {
          bet.amount = e.manualAmount;
          bet.mult = Math.round((bet.amount / (set.cfg.unit || 1)) * 100) / 100;
        }
        r.role = 'bet';
        r.bet = bet;
        set.playedMults.push(bet.mult);
        r.setNo = set.no;
        if (set.recovery) r.recovery = Object.assign({}, set.recovery);
        const win = !push && !e.lossAll && side === bet.side;
        r.result = push ? 'push' : win ? 'win' : 'loss';
        r.pnl = push ? 0 : win ? bet.amount * (set.cfg.payout == null ? 1 : set.cfg.payout) : -bet.amount;
        if (e.nb) { r.noBet = true; r.pnl = 0; } // bet skipped: flow continues, no money
        r.units = r.pnl / set.cfg.unit;

        const isLadderProg = set.cfg.prog === 'fib_ladder' || set.cfg.prog === 'fib_climber';
        if (!e.nb && isLadderProg && (set.cfg.fibBank || 0) > 0) {
          sessionBankProfit += (r.pnl / set.cfg.unit);
          if (sessionBankProfit >= set.cfg.fibBank) {
            r.bankReset = true;
            ladderLevel = 0;
            sessionBankProfit = 0;
          }
        }

        set.rollIndex = (set.rollIndex || 0) + 1;
        if (win) {
          r.setEnd = 'won';
          r.setStep = set.step;
          if (!e.nb && recoveryState && recoveryState.setsLeft > 0) {
            recoveryState.setsLeft--;
            if (recoveryState.setsLeft <= 0) recoveryState = null;
          }
          if (isLadderProg) {
            const drop = set.cfg.fibDrop != null ? set.cfg.fibDrop : (set.cfg.prog === 'fib_climber' ? 1 : 2);
            ladderLevel = r.bankReset ? 0 : Math.max(0, set.ladderLevel - drop);
          }
          cooldown = set.cfg.waitWin || 0;
          cooldownReason = 'win';
          set = null;
        } else {
          // If bet was skipped, the bet value remains at the previous step value
          if (!e.nb) {
            if (!push && isLadderProg && !r.bankReset) {
              ladderLevel = Math.min(FIB_SEQUENCE.length - 1, set.ladderLevel + 1);
            }
            if (++set.step >= set.plan.length) {
              r.setEnd = 'bust';
              r.setStep = set.step - 1;
              r.pattern = abstract(set.pattern);
              r.rawPattern = set.pattern.slice();
              r.factor = set.factor;
              r.plan = set.plan.slice();
              r.setCfg = Object.assign({}, set.cfg);
              continuation = continueSet(set, ladderLevel, rows.length - 1, recoveryState);
              cooldown = (set.cfg && set.cfg.waitBust != null) ? set.cfg.waitBust : (curCfg.waitBust || 0);
              cooldownReason = 'bust';

              // If recovery was already active and busted, reset it to protect bankroll
              if (set.recovery) {
                recoveryState = null;
              } else {
                const recTarget = set.cfg.recovery;
                if (recTarget > 0) {
                  const baseRisk = Array.from({ length: set.plan.length }, (_, k) => (PROGRESSIONS[set.cfg.prog] || PROGRESSIONS.double).mult(k)).reduce((a, b) => a + b, 0);
                  const recMult = recTarget === 1 ? (baseRisk + 1) : Math.ceil(baseRisk / recTarget);
                  recoveryState = {
                    target: recTarget,
                    setsLeft: recTarget,
                    recMult,
                    ...recoveryProfit(set.cfg, recMult, ladderLevel),
                  };
                } else {
                  recoveryState = null;
                }
              }
              set = null;
            } else {
              if (isLadderProg) {
                set.ladderLevel = ladderLevel;
              }
            }
          }
        }
        seq.push(side);
        continue;
      }

      // If waiting after a bust, sit out without forming factor
      if (cooldown > 0) {
        r.role = 'cooldown';
        r.cooldownLeft = cooldown;
        r.cooldownReason = cooldownReason;
        cooldown--;
        seq.push(side);
        continue;
      }

      // Idle: this entry becomes the factor if we have a full window behind it.
      const n = (e.cfg && e.cfg.n) || curCfg.n;
      if (seq.length >= n) {
        const pattern = seq.slice(-n);
        // Old recorded configurations predate recovery and ladder drop settings.
        const setCfg = Object.assign({}, curCfg, e.cfg);
        setCfg.recovery = e.cfg ? (e.cfg.recovery == null ? 0 : e.cfg.recovery) : (curCfg.recovery || 0);
        const defaultDrop = (e.cfg?.prog || curCfg.prog) === 'fib_climber' ? 1 : 2;
        setCfg.fibDrop = e.cfg ? (e.cfg.fibDrop == null ? defaultDrop : e.cfg.fibDrop) : (curCfg.fibDrop == null ? defaultDrop : curCfg.fibDrop);
        setCfg.fibBank = e.cfg ? (e.cfg.fibBank || 0) : (curCfg.fibBank || 0);
        if (recoveryState && setCfg.recovery !== recoveryState.target) recoveryState = null;
        let recMult = 1;
        let recInfo = null;
        if (recoveryState && recoveryState.setsLeft > 0) {
          recMult = recoveryState.recMult;
          recInfo = {
            target: recoveryState.target,
            currentSet: recoveryState.target - recoveryState.setsLeft + 1,
            totalSets: recoveryState.target,
            recMult,
            ...recoveryProfit(setCfg, recMult, ladderLevel),
          };
        }
        set = {
          no: ++setNo,
          pattern,
          factor: side,
          plan: betPlan(pattern, side, setCfg.waitBet || 0),
          cfg: setCfg,
          step: 0,
          rollIndex: 0,
          playedMults: [],
          ladderLevel,
          recMult,
          recovery: recInfo,
          delayLeft: setCfg.waitBet || 0,
          delayElapsed: 0,
          patternOffset: setCfg.waitBet || 0,
        };
        r.role = 'factor';
        r.setNo = set.no;
        r.pattern = abstract(pattern);
        r.plan = set.plan;
      }
      seq.push(side);
    }

    let next;
    const recInfo = recoveryState ? {
      target: recoveryState.target,
      currentSet: recoveryState.target - recoveryState.setsLeft + 1,
      totalSets: recoveryState.target,
      recMult: recoveryState.recMult,
      profitPerWin: recoveryState.profitPerWin,
      profitMin: recoveryState.profitMin,
      profitMax: recoveryState.profitMax,
    } : null;

    const nextProg = set ? set.cfg.prog : curCfg.prog;
    const isLadder = nextProg === 'fib_ladder' || nextProg === 'fib_climber';
    const curLvl = isLadder ? (set ? (set.ladderLevel || 0) : ladderLevel) : 0;
    const nextCfg = set ? set.cfg : curCfg;
    const defaultDrop = nextCfg.prog === 'fib_climber' ? 1 : 2;
    const dropLvl = Math.max(0, curLvl - (nextCfg.fibDrop == null ? defaultDrop : nextCfg.fibDrop));
    const climbLvl = Math.min(FIB_SEQUENCE.length - 1, curLvl + 1);
    const ladderInfo = isLadder ? {
      level: curLvl,
      step: curLvl + 1,
      mult: FIB_SEQUENCE[curLvl],
      dropMult: FIB_SEQUENCE[dropLvl],
      climbMult: FIB_SEQUENCE[climbLvl],
      isClimber: nextCfg.prog === 'fib_climber',
      bankTarget: nextCfg.fibBank || 0,
      bankProfit: Math.max(0, Math.round(sessionBankProfit * 10) / 10),
    } : null;

    if (set) {
      const progObj = PROGRESSIONS[set.cfg.prog] || PROGRESSIONS.double;
      const mults = isLadder
        ? Array.from({ length: set.plan.length }, (_, i) => i < set.step
          ? set.playedMults[i]
          : progObj.mult(curLvl + i - set.step) * (set.recMult || 1))
        : set.plan.map((_, i) => progObj.mult(i) * (set.recMult || 1));
      const rollIdx = set.rollIndex != null ? set.rollIndex : set.step;
      const activePlan = Array.from({ length: set.plan.length }, (_, i) =>
        i < set.step ? set.plan[i] : continuationSide(set.pattern, set.factor, rollIdx + (i - set.step) + (set.patternOffset || 0)));
      const setLost = rows.filter((r) => r.setNo === set.no && r.role === 'bet' && r.result === 'loss' && !r.noBet)
        .reduce((sum, r) => sum + Math.abs(r.pnl), 0);
      next = Object.assign({
        phase: set.delayLeft > 0 ? 'factor-delay' : 'bet',
        left: set.delayLeft,
        pattern: abstract(set.pattern),
        factor: set.factor,
        plan: activePlan,
        mults,
        setLost,
        recovery: set.recovery,
        ladder: ladderInfo,
      }, betFor(set, set.step));
    } else if (continuation) {
      next = Object.assign({ phase: 'continue', optional: true, cooldownLeft: cooldown,
        pattern: abstract(continuation.pattern), factor: continuation.factor, plan: continuation.plan,
        mults: continuation.plan.map((_, i) => (PROGRESSIONS[continuation.cfg.prog] || PROGRESSIONS.double).mult(i) * (continuation.recMult || 1)),
        recovery: continuation.recovery }, betFor(continuation, continuation.step));
    } else if (cooldown > 0) {
      next = { phase: 'cooldown', left: cooldown, reason: cooldownReason, have: seq.length, need: curCfg.n, recovery: recInfo, ladder: ladderInfo };
    } else if (seq.length >= curCfg.n) {
      const pat = seq.slice(-curCfg.n);
      next = {
        phase: 'factor', pattern: abstract(pat), raw: pat,
        ifA: continuationSide(pat, 'A', curCfg.waitBet || 0),
        ifB: continuationSide(pat, 'B', curCfg.waitBet || 0),
        recovery: recInfo, ladder: ladderInfo,
      };
    } else {
      next = { phase: 'collect', have: seq.length, need: curCfg.n, raw: seq.slice(-curCfg.n), recovery: recInfo, ladder: ladderInfo };
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
      if ((r.setEnd === 'won' || r.setEnd === 'bust') && !r.continued) {
        s.sets++;
        if (r.setEnd === 'won') {
          s.won++;
          while (s.byStep.length <= r.setStep) s.byStep.push(0);
          s.byStep[r.setStep]++;
          s.bustStreak = 0;
          if (r.noBet || r.result === 'push') s.wonFree++;
        }
        else { s.bust++; s.bustStreak++; s.maxBustStreak = Math.max(s.maxBustStreak, s.bustStreak); }
      }
    }
    return s;
  }

  function sameSession(a, b) {
    return a.s === b.s && a.sessionNo === b.sessionNo;
  }

  /** Hypothetical continuation follows replay's push/skipped-bet flow within one session. */
  function analyzeBusts(rows, maxExtra = 4) {
    const busts = [];
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      if (r.setEnd !== 'bust' || r.continued || !r.rawPattern) continue;
      const pat = r.rawPattern;
      const n = pat.length;
      const cfg = r.setCfg || r.cfg || {};
      const prog = cfg.prog || 'double';
      const progression = PROGRESSIONS[prog] || PROGRESSIONS.double;
      const unit = cfg.unit || 1;
      const recMult = r.bet ? (r.bet.recMult || 1) : 1;
      let level = r.bet && r.bet.ladderLevel != null ? r.bet.ladderLevel : n - 2;
      if (r.result !== 'push') level = Math.min(FIB_SEQUENCE.length - 1, level + 1);
      let previousSide = r.effSide || r.side;
      const extraSteps = [];
      for (let j = i + 1; j < rows.length && extraSteps.length < maxExtra; j++) {
        const sub = rows[j];
        if (!sameSession(r, sub)) break;
        const push = sub.side == null && !sub.lossAll;
        const side = sub.side == null ? previousSide : sub.side;
        const step = (r.bet?.step ?? n - 2) + 1 + extraSteps.length;
        const betSide = continuationSide(pat, r.factor, step + (cfg.waitBet || 0));
        const win = !push && !sub.lossAll && side === betSide;
        const pushEnd = push && side === betSide;
        const mult = progression.mult(progression.ladder ? level : step) * recMult;
        const amount = mult * unit;
        const noBet = !!(sub.nb || sub.noBet);
        const pnl = push || noBet ? 0 : win ? amount * (cfg.payout == null ? 1 : cfg.payout) : -amount;
        extraSteps.push({ step: step + 1, betSide, actualSide: sub.side, win, push, pushEnd, noBet, mult, amount, pnl });
        previousSide = side;
        if (win || pushEnd) break;
        if (!push && progression.ladder) level = Math.min(FIB_SEQUENCE.length - 1, level + 1);
      }
      const hit = extraSteps.find(s => s.win || s.pushEnd);
      busts.push({
        setNo: r.setNo, rowIdx: i, pattern: r.pattern, factor: r.factor, n, prog, unit,
        extraSteps, hitOnBet: hit ? hit.step : null, resolved: !!hit,
      });
    }

    const countsByExtra = Array(maxExtra).fill(0);
    const pnlImpact = Array(maxExtra).fill(0);
    const evaluatedByExtra = Array(maxExtra).fill(0);
    const pendingByExtra = Array(maxExtra).fill(0);
    let resolvedCount = 0;
    for (const b of busts) {
      if (b.resolved) {
        countsByExtra[b.extraSteps.length - 1]++;
        resolvedCount++;
      }
      for (let e = 1; e <= maxExtra; e++) {
        // A win ends every longer horizon. Otherwise, all e outcomes must be recorded.
        if (!b.resolved && b.extraSteps.length < e) {
          pendingByExtra[e - 1]++;
          continue;
        }
        evaluatedByExtra[e - 1]++;
        pnlImpact[e - 1] += b.extraSteps.slice(0, e).reduce((sum, step) => sum + step.pnl, 0);
      }
    }
    return {
      total: busts.length, countsByExtra, resolvedCount, unresolvedCount: busts.length - resolvedCount,
      pnlImpact, evaluatedByExtra, pendingByExtra, busts,
    };
  }

  /** Replay each session independently, overriding only the simulated delay in copied settings. */
  function simulateDelays(entries, baseCfg, delays = [0, 1, 2, 3]) {
    const sessions = [];
    for (const entry of entries) {
      const last = sessions[sessions.length - 1];
      if (!last || !sameSession(last[0], entry)) sessions.push([entry]);
      else last.push(entry);
    }
    return delays.map((delay) => {
      const cfg = Object.assign({}, baseCfg, { waitBust: delay });
      const results = sessions.map(session => run(session.map(entry => Object.assign({}, entry, {
        cfg: Object.assign({}, entry.cfg || cfg, { waitBust: delay }),
      })), cfg));
      return {
        delay,
        stats: stats(results.flatMap(result => result.rows)),
        next: results.length ? results[results.length - 1].next : run([], cfg).next,
      };
    });
  }

  /**
   * Roll gaps and historical interval probabilities for independent rare outcomes:
   * - Sic Bo: Triples (1 in 36 rolls, 2.78%)
   * - The Kickoff: Ties (1 in 6 rolls, 16.67%)
   */
  function specialProbability(gameId, rows) {
    if (!rows || rows.length === 0) return null;
    if (gameId === 'sicbo') {
      let rollsSince = 0;
      for (let i = rows.length - 1; i >= 0; i--) {
        const r = rows[i];
        if (r.lossAll || (r.o && r.o.triple)) break;
        rollsSince++;
      }
      const avgWait = 36;
      const isOverdue = rollsSince >= avgWait;
      const isHigh = rollsSince >= 45;
      const cumProb = 1 - Math.pow(35 / 36, rollsSince);
      const cumPct = Math.round(cumProb * 100);
      return {
        gameId,
        type: 'triple',
        label: 'Sic Bo Triple',
        rollsSince,
        avgWait,
        cumPct,
        isOverdue,
        isHigh,
        message: isOverdue
          ? `${rollsSince} rolls since last triple; next-roll chance remains 1/36 (2.78%). Historical chance of at least one triple across ${rollsSince} independent rolls: ${cumPct}%.`
          : null,
      };
    } else if (gameId === 'kickoff') {
      let rollsSince = 0;
      for (let i = rows.length - 1; i >= 0; i--) {
        const r = rows[i];
        if (r.push || (r.o && r.o.tie) || (r.raw && r.raw[0] === r.raw[1])) break;
        rollsSince++;
      }
      const avgWait = 6;
      const isOverdue = rollsSince >= avgWait;
      const isHigh = rollsSince >= 9;
      const cumProb = 1 - Math.pow(5 / 6, rollsSince);
      const cumPct = Math.round(cumProb * 100);
      return {
        gameId,
        type: 'tie',
        label: 'Kickoff Tie',
        rollsSince,
        avgWait,
        cumPct,
        isOverdue,
        isHigh,
        message: isOverdue
          ? `${rollsSince} rolls since last tie; next-roll chance remains 1/6 (16.67%). Historical chance of at least one tie across ${rollsSince} independent rolls: ${cumPct}%.`
          : null,
      };
    }
    return null;
  }

  /**
   * Evaluates triple risk exposure based on roll gap since last triple and recent roll sequences (pair clustering).
   * Flags urgent when step >= 4 (5th bet).
   */
  function detectTripleRisk(gameId, rows, step = 0) {
    if (!rows || rows.length === 0 || gameId !== 'sicbo') return null;
    let rollsSince = 0;
    for (let i = rows.length - 1; i >= 0; i--) {
      const r = rows[i];
      const dice = r.raw || (r.o && r.o.dice);
      const isTriple = Boolean(r.lossAll || (r.o && r.o.triple) ||
        (Array.isArray(dice) && dice.length === 3 && dice[0] === dice[1] && dice[1] === dice[2]));
      if (isTriple) break;
      rollsSince++;
    }

    const recent = rows.slice(-5);
    let pairCount = 0;
    for (const r of recent) {
      const dice = r.raw || (r.o && r.o.dice);
      if (Array.isArray(dice) && dice.length === 3) {
        const isTriple = (dice[0] === dice[1] && dice[1] === dice[2]);
        const isPair = !isTriple && (dice[0] === dice[1] || dice[1] === dice[2] || dice[0] === dice[2]);
        if (isPair) pairCount++;
      }
    }

    const gapDue = rollsSince >= 30;
    const gapOverdue = rollsSince >= 36;
    const pairClustering = pairCount >= 2 && rollsSince >= 15;
    const isDue = gapDue || pairClustering;

    if (!isDue && !gapOverdue) return null;

    const urgent = (step >= 4); // 5th bet in a group or continuation
    const shieldRecommended = (step >= 3) && (gapDue || pairClustering);
    const shieldStake = step >= 5 ? 2 : 1;
    let shieldMessage = '';
    if (shieldRecommended) {
      shieldMessage = `🛡️ TRIPLE SHIELD: Bet ${shieldStake}u on Any Triple (30:1) to hedge your Step ${step + 1} Big/Small bet.`;
    }

    let message = '';
    if (urgent) {
      message = `🚨 CRITICAL RISK (Step ${step + 1}): Historical gap threshold reached (${rollsSince} rolls since last triple${pairClustering ? ' with ' + pairCount + ' pairs in last 5 rolls' : ''}). A triple will immediately bust your set at maximum stake. Strongly recommend skipping this roll.`;
    } else if (gapOverdue) {
      message = `⚠️ TRIPLE OVERDUE: Historical gap threshold reached (${rollsSince} rolls since last triple vs avg 36). Suggest skipping this bet or hedging with triple shield.`;
    } else {
      message = `⚠️ TRIPLE RISK: Historical gap threshold reached (${rollsSince} rolls since last triple${pairClustering ? ' with frequent pairs detected' : ''}). Suggest skipping this bet or hedging with triple shield.`;
    }

    return {
      due: true,
      urgent,
      rollsSince,
      pairCount,
      gapOverdue,
      shieldRecommended,
      shieldStake,
      shieldMessage,
      message,
    };
  }

  /**
   * Detects dragons (unbroken streaks of identical sides, e.g. 4+ in a row).
   * User anti-streak rule:
   * - Streak of 4 (1, 2, 3, 4 straight): Suggest SKIP roll 5.
   * - Streak of 5: Suggest BET roll 6 (bet anti-streak on opp(streakSide)).
   * - Streak of 6+: Extended dragon.
   */
  function detectDragon(rows) {
    if (!rows || rows.length < 4) return null;
    let streakSide = null;
    let streakLen = 0;
    for (let i = rows.length - 1; i >= 0; i--) {
      const r = rows[i];
      const s = r.effSide || r.side;
      if (!s || r.push) continue;
      if (streakSide === null) {
        streakSide = s;
        streakLen = 1;
      } else if (s === streakSide) {
        streakLen++;
      } else {
        break;
      }
    }
    if (streakLen < 4) return null;
    const antiSide = opp(streakSide);
    const action = streakLen === 4 ? 'skip' : (streakLen === 5 ? 'bet' : 'watch');
    let message = '';
    if (streakLen === 4) {
      message = `🐉 DRAGON ALERT (4 straight ${streakSide}s): Anti-streak rule recommends SKIPPING Roll 5. If 5 resets, bet next factor.`;
    } else if (streakLen === 5) {
      message = `🐉 DRAGON ALERT (5 straight ${streakSide}s): Anti-streak rule recommends BETTING Roll 6 on ${antiSide}.`;
    } else {
      message = `🐉 EXTENDED DRAGON (${streakLen} straight ${streakSide}s): Anti-streak caution on ${streakSide}.`;
    }
    return {
      side: streakSide,
      length: streakLen,
      action,
      antiSide,
      message,
    };
  }

  const api = { PROGRESSIONS, FIB_SEQUENCE, GROUP_SIZES, opp, abstract, betPlan, run, stats, analyzeBusts, simulateDelays, recoveryOptions, specialProbability, detectTripleRisk, detectDragon };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Engine = api;
})(this);
