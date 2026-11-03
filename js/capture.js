/* Finalized, consistent observations only. Round identity survives restart/export. */
(function (root) {
  function createRoundClock({ entries = [], now = Date.now() } = {}) {
    if (!Array.isArray(entries)) throw new TypeError('Round clock entries must be an array');
    const timestamp = value => {
      if (!Number.isSafeInteger(value) || value < 0) throw new RangeError('Round clock requires a valid PC timestamp');
      return value;
    };
    let generated = timestamp(now);
    const recent = entries.filter(e => /^\d{8,14}$/.test(e?.screen?.round || '') &&
      Number.isSafeInteger(e.screen.capturedAt) && now - e.screen.capturedAt >= 0 && now - e.screen.capturedAt <= 120000)
      .reduce((latest, e) => !latest || e.screen.capturedAt > latest.screen.capturedAt ? e : latest, null);
    let round = recent ? recent.screen.round : String(generated), seenResult = Boolean(recent), absence = null;
    return {
      read(hasResult, at = Date.now()) {
        timestamp(at);
        if (hasResult === true) {
          seenResult = true; absence = null;
        } else if (hasResult === false && seenResult) {
          absence = !absence || at < absence.since ? { since: at, reads: 1 } : { ...absence, reads: absence.reads + 1 };
          if (absence.reads >= 2 && at - absence.since >= 1500) {
            generated = Math.max(at, generated + 1);
            round = String(generated); seenResult = false; absence = null;
          }
        } else absence = null;
        return round;
      },
    };
  }

  function trackWagers(state, round, wager, now) {
    const stable = Object.fromEntries(Object.entries(state.stable).filter(([, value]) => now - value.at <= 120000));
    if (!round || wager?.status !== 'observed') return { stable, candidate: null };
    const retained = Object.fromEntries(Object.entries(stable).filter(([id, value]) => id !== round || JSON.stringify(value.wager) === JSON.stringify(wager)));
    const identity = JSON.stringify([round, wager]);
    const candidate = state.candidate?.identity === identity ? state.candidate : { identity, at: now };
    return { candidate, stable: now - candidate.at >= 1500 ? { ...retained, [round]: { wager, at: now } } : retained };
  }

  function createTracker() {
    let candidate = null;
    return {
      reset() { candidate = null; },
      read(observation, { game, entries, now = Date.now() }) {
        const review = message => { candidate = null; return { status: 'review', message }; };
        if (!observation) { candidate = null; return { status: 'waiting', message: 'Waiting for a completed round' }; }
        const o = observation;
        if (!/^\d{8,14}$/.test(o.round || '') || !Number.isFinite(o.confidence) || o.confidence < 80 || o.confidence > 100) {
          return review('Round ID or confidence unclear; nothing recorded');
        }
        if (entries.some(e => e.screen?.round === o.round)) { candidate = null; return { status: 'duplicate', message: `Round ${o.round} already recorded` }; }
        const cards = o.raw?.c;
        if (game.id === 'teenpatti' && (Array.isArray(o.raw) || o.raw?.w !== undefined || o.raw?.order !== undefined ||
          !Array.isArray(cards) || cards.length !== 6 || new Set(cards).size !== 6 ||
          !cards.every(c => typeof c === 'string' && /^(?:[2-9]|10|J|Q|K|A)[hdsc]$/.test(c)))) {
          return review('Screen hand requires six valid, unique cards grouped by player');
        }
        if (game.id === 'kickoff' && (!Array.isArray(o.raw) || o.raw.length !== 2 || o.raw.w !== undefined ||
          ![0, 1].every(i => Number.isInteger(o.raw[i]) && o.raw[i] >= 1 && o.raw[i] <= 6))) {
          return review('Screen roll requires valid red and blue dice, in that order');
        }
        let outcome;
        try { outcome = game.outcome(o.raw); } catch { return review('Incomplete cards or dice'); }
        const triple = game.id === 'sicbo' && o.result?.triple === true;
        if (!o.result || !['A', 'B', null].includes(o.result.side) || (!triple && outcome.side !== o.result.side) ||
          (game.id === 'sicbo' && Boolean(outcome.triple) !== triple) ||
          (o.result.total !== undefined && o.result.total !== outcome.total) ||
          (game.id === 'sicbo' && o.result.total === undefined && !outcome.triple)) {
          return review('Result banner and hand/roll disagree');
        }
        const identity = JSON.stringify([o.round, o.raw, o.result, o.wager]);
        if (!candidate || candidate.identity !== identity) {
          candidate = { identity, since: now };
          return { status: 'pending', message: `Checking round ${o.round} again` };
        }
        if (now - candidate.since < 1500) return { status: 'pending', message: 'Waiting for a second stable read' };
        return { status: 'ready', entry: {
          raw: o.raw,
          screen: { round: o.round, capturedAt: now, confidence: o.confidence, result: o.resultText },
          wager: o.wager || { status: 'unknown' },
        } };
      },
    };
  }
  const api = { createTracker, trackWagers, createRoundClock };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ScreenCapture = api;
})(this);
