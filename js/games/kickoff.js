/* The Kickoff: Two dice (Red vs Blue, 1 each). Highest die wins.
 * Red > Blue = RED wins (Side A)
 * Blue > Red = BLUE wins (Side B)
 * Red == Blue = TIE (null / push, pattern sequence continues)
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
        return { side, lossAll: false, tie, red: null, blue: null };
      }
      const red = dice[0];
      const blue = dice[1];
      const tie = red === blue;
      const side = red > blue ? 'A' : blue > red ? 'B' : null;
      return { side, lossAll: false, tie, red, blue };
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
      let redSum = 0, blueSum = 0, diceCount = 0;
      for (const r of rows) {
        if (r.side === 'A') redWins++;
        else if (r.side === 'B') blueWins++;
        else ties++;
        if (r.o && r.o.red && r.o.blue) {
          redSum += r.o.red;
          blueSum += r.o.blue;
          diceCount++;
        }
      }
      const total = rows.length || 1;
      const redPct = ((redWins / total) * 100).toFixed(1);
      const bluePct = ((blueWins / total) * 100).toFixed(1);
      const tiePct = ((ties / total) * 100).toFixed(1);
      const avgRed = diceCount ? (redSum / diceCount).toFixed(2) : '-';
      const avgBlue = diceCount ? (blueSum / diceCount).toFixed(2) : '-';

      return `
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
