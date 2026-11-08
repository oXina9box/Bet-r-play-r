/* The Kickoff: Two dice (Red vs Blue, 1 each). Highest die wins.
 * Red > Blue = RED wins (Side A)
 * Blue > Red = BLUE wins (Side B)
 * Red == Blue = DRAW / TIE (loss for both Red and Blue)
 */
(function (root) {
  const Kickoff = {
    id: 'kickoff',
    name: 'The Kickoff',
    sides: { A: { label: 'RED', short: 'R' }, B: { label: 'BLUE', short: 'B' } },
    entryName: 'Roll',

    outcome(dice) {
      if (dice && dice.w) {
        const tie = dice.w === 'T';
        const side = tie ? null : dice.w;
        return { side, lossAll: tie, tie, red: null, blue: null };
      }
      const red = dice[0];
      const blue = dice[1];
      const tie = red === blue;
      const side = red > blue ? 'A' : blue > red ? 'B' : null;
      return { side, lossAll: tie, tie, red, blue };
    },

    // Rules are fixed in advance; unknown outcomes and session changes break each context.
    drawPatterns(rows, current = rows[rows.length - 1]) {
      const rules = [
        { id: 'after-draw', label: 'After a draw', size: 1, match: d => d[0] },
        { id: 'back-to-back', label: 'After two straight draws', size: 2, match: d => d[0] && d[1] },
        { id: 'one-off', label: 'Draw, one off → draw', size: 2, match: d => d[0] && !d[1] },
        { id: 'alternating', label: 'After draw–off–draw', size: 3, match: d => d[0] && !d[1] && d[2] },
        { id: 'cluster', label: '2+ draws in last 5', size: 5, match: d => d.filter(Boolean).length >= 2 },
      ];
      const last = rows[rows.length - 1];
      const anchored = current && last && current.s === last.s && JSON.stringify(current.raw) === JSON.stringify(last.raw);
      return rules.map(rule => {
        const tail = rows.slice(-rule.size);
        const active = !!(anchored && tail.length === rule.size && tail.every(r => r.s === last.s && drawResult(r.raw) !== null) && rule.match(tail.map(r => drawResult(r.raw))));
        const counts = contextCounts(rows, rule.size, window => rule.match(window.map(r => drawResult(r.raw))));
        return { id: rule.id, label: rule.label, active, ...counts, play: active && higherDrawRate(counts) };
      });
    },

    drawSignal(rows, current = rows[rows.length - 1]) {
      const latest = current?.raw;
      const pair = validDice(latest) ? latest.slice() : null;
      const patterns = this.drawPatterns(rows, current);
      const counts = pair ? contextCounts(rows, 1, window => window[0].raw[0] === pair[0] && window[0].raw[1] === pair[1], true)
        : { matches: 0, draws: 0, others: 0, otherDraws: 0 };
      const last = rows[rows.length - 1];
      const anchored = !!(pair && last && current.s === last.s && JSON.stringify(current.raw) === JSON.stringify(last.raw));
      const exact = { id: 'exact-pair', label: pair ? `After R${pair[0]} / B${pair[1]}` : 'Exact dice pair', active: anchored, ...counts, play: anchored && higherDrawRate(counts) };
      const candidates = [...patterns, exact].filter(p => p.active);
      const evidence = candidates.find(p => p.play) || candidates.find(p => p.matches >= 20 && p.others >= 20) || (anchored ? exact : candidates[0]) || { ...exact, label: 'No active draw pattern' };
      const play = candidates.some(p => p.play);
      const reason = !current ? 'Record a roll' : !candidates.length ? 'No matching draw pattern' : play ? evidence.label
        : evidence.matches < 20 || evidence.others < 20 ? 'Collecting matches (20 minimum per group)' : 'No clear draw signal';
      return { ...counts, pair, patterns, evidence, play, reason };
    },

    emptyPending: () => ({ dice: [] }),

    input(p, key) {
      key = String(key).toLowerCase();
      // Quick keys: wr (win red), wb (win blue), wt (win tie)
      if (key === 'wr' || key === 'wa' || key === 'r') return { pending: this.emptyPending(), commit: { w: 'A' } };
      if (key === 'wb' || key === 'b') return { pending: this.emptyPending(), commit: { w: 'B' } };
      if (key === 'wt' || key === 't') return { pending: this.emptyPending(), commit: { w: 'T' } };

      const n = Number(key);
      if (!(n >= 1 && n <= 6)) return null;
      const dice = p.dice.concat(n);
      if (dice.length === 2) return { pending: { dice: [] }, commit: dice };
      return { pending: { dice } };
    },

    undoInput(p) {
      return p.dice.length ? { dice: p.dice.slice(0, -1) } : null;
    },

    pendingHTML(p) {
      const red = p.dice[0] || null;
      const blue = p.dice[1] || null;
      const rSlot = `<div class="slot red-slot ${red ? 'filled' : ''}">${red ? pip(red) : 'RED'}</div>`;
      const bSlot = `<div class="slot blue-slot ${blue ? 'filled' : ''}">${blue ? pip(blue) : 'BLUE'}</div>`;
      const txt = !red ? 'Tap RED die (1–6)' : 'Tap BLUE die (1–6)';
      return `<div class="slots kickoff-slots">${rSlot}<span class="vs">vs</span>${bSlot}</div><div class="pending-sum">${txt}</div>`;
    },

    padHTML() {
      const diceButtons = [1, 2, 3, 4, 5, 6].map((n) => `<button class="key die ko-die" data-key="${n}">${pip(n)}<span class="kbd">${n}</span></button>`).join('');
      return `
        <div class="pad dice-pad kickoff-pad">${diceButtons}</div>
        <div class="quick kickoff-quick">
          <span>Quick:</span>
          <button class="key qa ko-btn-red" data-key="wr">RED <span class="kbd">R</span></button>
          <button class="key qb ko-btn-blue" data-key="wb">BLUE <span class="kbd">B</span></button>
          <button class="key qt ko-btn-tie" data-key="wt">TIE <span class="kbd">T</span></button>
        </div>
      `;
    },

    chip(raw, o) {
      if (o.tie) {
        return { main: raw.w ? 'TIE' : `${o.red}-${o.blue}`, sub: 'TIE', flag: 'T' };
      }
      if (raw.w) {
        return { main: raw.w === 'A' ? 'RED' : 'BLUE', sub: 'Quick', flag: '' };
      }
      const winnerName = o.side === 'A' ? 'RED' : 'BLUE';
      return { main: `${o.red} - ${o.blue}`, sub: winnerName, flag: '' };
    },

    extraStats(rows) {
      let redWins = 0, blueWins = 0, ties = 0;
      let redSum = 0, blueSum = 0, diceCount = 0, marginSum = 0, redHigh = 0, blueHigh = 0;
      let curSide = null, curStreak = 0, maxStreak = 0, maxSide = null;
      for (const r of rows) {
        if (r.side === 'A') redWins++;
        else if (r.side === 'B') blueWins++;
        else ties++;
        if (r.side) {
          if (r.side === curSide) curStreak++;
          else { curSide = r.side; curStreak = 1; }
          if (curStreak > maxStreak) { maxStreak = curStreak; maxSide = curSide; }
        }
        if (r.o && r.o.red && r.o.blue) {
          redSum += r.o.red;
          blueSum += r.o.blue;
          marginSum += Math.abs(r.o.red - r.o.blue);
          if (r.o.red >= 5) redHigh++;
          if (r.o.blue >= 5) blueHigh++;
          diceCount++;
        }
      }
      const total = rows.length || 1;
      const redPct = rows.length ? ((redWins / total) * 100).toFixed(1) : '0.0';
      const bluePct = rows.length ? ((blueWins / total) * 100).toFixed(1) : '0.0';
      const tiePct = rows.length ? ((ties / total) * 100).toFixed(1) : '0.0';
      const avgRed = diceCount ? (redSum / diceCount).toFixed(2) : '–';
      const avgBlue = diceCount ? (blueSum / diceCount).toFixed(2) : '–';
      const avgMargin = diceCount ? (marginSum / diceCount).toFixed(2) : '–';
      const recent = rows.slice(-20);
      const recentDraws = recent.filter(r => r.o?.tie).length;
      const streakTxt = curStreak ? `${this.sides[curSide].short}×${curStreak} <small>max ${maxSide ? this.sides[maxSide].short : ''}${maxStreak}</small>` : '–';

      return `
        <div class="game-markers">
          <div class="marker"><label>Streak</label><b>${streakTxt}</b></div>
          <div class="marker"><label>Recent Draws</label><b>${recentDraws} / ${recent.length}</b></div>
          <div class="marker"><label>Avg Margin</label><b>Δ ${avgMargin}</b></div>
          <div class="marker"><label>High Die (5–6)</label><b>R ${ redHigh } / B ${ blueHigh }</b></div>
        </div>
        <div class="muted small">Score hits marked: ${rows.filter(r => r.scoreHit).length} / ${rows.length} rolls</div>
        <h4>Head-to-Head Record</h4>
        <div class="ko-stats-grid">
          <div class="ko-stat-box red"><span>RED WINS</span><b>${redWins}</b><small>${redPct}% (avg: ${avgRed})</small></div>
          <div class="ko-stat-box tie"><span>TIES</span><b>${ties}</b><small>${tiePct}% (1 in ${(total / (ties || 1)).toFixed(1)})</small></div>
          <div class="ko-stat-box blue"><span>BLUE WINS</span><b>${blueWins}</b><small>${bluePct}% (avg: ${avgBlue})</small></div>
        </div>
      `;
    },
  };

  const validDice = raw => Array.isArray(raw) && raw.length === 2 && raw.every(n => Number.isInteger(n) && n >= 1 && n <= 6);
  function drawResult(raw) {
    if (validDice(raw)) return raw[0] === raw[1];
    return ['A', 'B', 'T'].includes(raw?.w) ? raw.w === 'T' : null;
  }

  function contextCounts(rows, size, match, exact = false) {
    return rows.reduce((acc, next, i) => {
      if (i < size || drawResult(next.raw) === null || (exact && !validDice(next.raw))) return acc;
      const window = rows.slice(i - size, i);
      if (!window.every(r => r.s === next.s && drawResult(r.raw) !== null && (!exact || validDice(r.raw)))) return acc;
      const draw = drawResult(next.raw) ? 1 : 0;
      return match(window) ? { ...acc, matches: acc.matches + 1, draws: acc.draws + draw }
        : { ...acc, others: acc.others + 1, otherDraws: acc.otherDraws + draw };
    }, { matches: 0, draws: 0, others: 0, otherDraws: 0 });
  }

  function higherDrawRate(counts) {
    if (counts.matches < 20 || counts.others < 20) return false;
    // Conservative intervals across the six predefined comparisons; no counts are pooled.
    const interval = (wins, total) => {
      const z = 2.87, z2 = z * z, rate = wins / total, denom = 1 + z2 / total;
      const center = (rate + z2 / (2 * total)) / denom;
      const radius = z * Math.sqrt(rate * (1 - rate) / total + z2 / (4 * total ** 2)) / denom;
      return { low: center - radius, high: center + radius };
    };
    return interval(counts.draws, counts.matches).low > interval(counts.otherDraws, counts.others).high;
  }

  const PIPS = { 1: [5], 2: [1, 9], 3: [1, 5, 9], 4: [1, 3, 7, 9], 5: [1, 3, 5, 7, 9], 6: [1, 3, 4, 6, 7, 9] };
  function pip(n) {
    let h = '<span class="pips">';
    for (let i = 1; i <= 9; i++) h += `<i class="${PIPS[n].includes(i) ? 'on' : ''}"></i>`;
    return h + '</span>';
  }

  if (typeof module !== 'undefined' && module.exports) module.exports = Kickoff;
  else (root.Games = root.Games || {}).kickoff = Kickoff;
})(this);
