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
      let curSide = null, curStreak = 0, maxStreak = 0, maxSide = null, sinceTie = 0;
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
      for (let i = rows.length - 1; i >= 0; i--) {
        if (rows[i].side == null || rows[i].o?.tie) break;
        sinceTie++;
      }
      const total = rows.length || 1;
      const redPct = rows.length ? ((redWins / total) * 100).toFixed(1) : '0.0';
      const bluePct = rows.length ? ((blueWins / total) * 100).toFixed(1) : '0.0';
      const tiePct = rows.length ? ((ties / total) * 100).toFixed(1) : '0.0';
      const avgRed = diceCount ? (redSum / diceCount).toFixed(2) : '–';
      const avgBlue = diceCount ? (blueSum / diceCount).toFixed(2) : '–';
      const avgMargin = diceCount ? (marginSum / diceCount).toFixed(2) : '–';
      const tieCumPct = Math.round((1 - Math.pow(5 / 6, sinceTie)) * 100);
      const streakTxt = curStreak ? `${this.sides[curSide].short}×${curStreak} <small>max ${maxSide ? this.sides[maxSide].short : ''}${maxStreak}</small>` : '–';

      return `
        <div class="game-markers">
          <div class="marker"><label>Streak</label><b>${streakTxt}</b></div>
          <div class="marker ${sinceTie >= 6 ? 'warn' : ''}"><label>Tie Gap</label><b>${sinceTie}r <small>${tieCumPct}%</small></b></div>
          <div class="marker"><label>Avg Margin</label><b>Δ ${avgMargin}</b></div>
          <div class="marker"><label>High Die (5–6)</label><b>R ${ redHigh } / B ${ blueHigh }</b></div>
        </div>
        <h4>Head-to-Head Record</h4>
        <div class="ko-stats-grid">
          <div class="ko-stat-box red"><span>RED WINS</span><b>${redWins}</b><small>${redPct}% (avg: ${avgRed})</small></div>
          <div class="ko-stat-box tie"><span>TIES</span><b>${ties}</b><small>${tiePct}% (1 in ${(total / (ties || 1)).toFixed(1)})</small></div>
          <div class="ko-stat-box blue"><span>BLUE WINS</span><b>${blueWins}</b><small>${bluePct}% (avg: ${avgBlue})</small></div>
        </div>
      `;
    },
  };

  const PIPS = { 1: [5], 2: [1, 9], 3: [1, 5, 9], 4: [1, 3, 7, 9], 5: [1, 3, 5, 7, 9], 6: [1, 3, 4, 6, 7, 9] };
  function pip(n) {
    let h = '<span class="pips">';
    for (let i = 1; i <= 9; i++) h += `<i class="${PIPS[n].includes(i) ? 'on' : ''}"></i>`;
    return h + '</span>';
  }

  if (typeof module !== 'undefined' && module.exports) module.exports = Kickoff;
  else (root.Games = root.Games || {}).kickoff = Kickoff;
})(this);
