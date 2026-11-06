/* Sic Bo: 3 dice. Side A = BIG (11-17), B = SMALL (4-10). Any triple loses Big/Small but still counts in the pattern. */
(function (root) {
  const SicBo = {
    id: 'sicbo',
    name: 'Sic Bo',
    sides: { A: { label: 'BIG', short: 'B' }, B: { label: 'SMALL', short: 'S' } },
    entryName: 'Roll',

    outcome(dice) {
      const total = dice[0] + dice[1] + dice[2];
      const triple = dice[0] === dice[1] && dice[1] === dice[2];
      return { side: total >= 11 ? 'A' : 'B', lossAll: triple, total, triple };
    },

    emptyPending: () => ({ dice: [] }),

    input(p, key) {
      const n = Number(key);
      if (!(n >= 1 && n <= 6)) return null;
      const dice = p.dice.concat(n);
      if (dice.length === 3) return { pending: { dice: [] }, commit: dice };
      return { pending: { dice } };
    },

    undoInput(p) {
      return p.dice.length ? { dice: p.dice.slice(0, -1) } : null;
    },

    pendingHTML(p) {
      const slots = [0, 1, 2].map((i) => `<div class="slot ${p.dice[i] ? 'filled' : ''}">${p.dice[i] ? pip(p.dice[i]) : ''}</div>`).join('');
      const sum = p.dice.reduce((a, b) => a + b, 0);
      return `<div class="slots">${slots}</div><div class="pending-sum">${p.dice.length ? 'Σ ' + sum : 'Enter 3 dice'}</div>`;
    },

    padHTML() {
      return `<div class="pad dice-pad">${[1, 2, 3, 4, 5, 6].map((n) => `<button class="key die" data-key="${n}">${pip(n)}<span class="kbd">${n}</span></button>`).join('')}</div>`;
    },

    chip(raw, o) {
      return { main: o.total, sub: raw.join(''), flag: o.triple ? 'T' : '' };
    },

    extraStats(rows) {
      const totals = Array(19).fill(0), faces = Array(7).fill(0);
      let odd = 0, even = 0, doubles = 0, curSide = null, curStreak = 0, maxStreak = 0, maxSide = null;
      for (const r of rows) {
        totals[r.o.total]++;
        r.raw.forEach((d) => faces[d]++);
        if (r.o.total % 2) odd++; else even++;
        const [d1, d2, d3] = r.raw;
        if (!r.o.triple && (d1 === d2 || d2 === d3 || d1 === d3)) doubles++;
        if (r.side === curSide) curStreak++;
        else { curSide = r.side; curStreak = 1; }
        if (curStreak > maxStreak) { maxStreak = curStreak; maxSide = curSide; }
      }
      let sinceTriple = 0;
      for (let i = rows.length - 1; i >= 0; i--) {
        if (rows[i].o?.triple || rows[i].lossAll) break;
        sinceTriple++;
      }
      const recentPairs = rows.slice(-5).filter((r) => {
        const [a, b, c] = r.raw;
        return !(a === b && b === c) && (a === b || b === c || a === c);
      }).length;
      const triplePct = Math.round((1 - Math.pow(35 / 36, sinceTriple)) * 100);
      let hotT = 0, hotF = 0;
      for (let i = 3; i <= 18; i++) if (totals[i] > totals[hotT]) hotT = i;
      for (let i = 1; i <= 6; i++) if (faces[i] > faces[hotF]) hotF = i;
      const streakTxt = curStreak ? `${this.sides[curSide].short}×${curStreak} <small>max ${maxSide ? this.sides[maxSide].short : ''}${maxStreak}</small>` : '–';
      const hotTxt = rows.length ? `Σ${hotT}<small>(${totals[hotT]})</small> · ⚃${hotF}<small>(${faces[hotF]})</small>` : '–';
      const markers = `<div class="game-markers">
        <div class="marker"><label>Streak</label><b>${streakTxt}</b></div>
        <div class="marker ${sinceTriple >= 36 ? 'warn' : ''}"><label>Triple Gap</label><b>${sinceTriple}r <small>${triplePct}%</small></b></div>
        <div class="marker ${recentPairs >= 2 ? 'warn' : ''}"><label>Pairs (5r)</label><b>${recentPairs}/5 <small>${doubles} dbl</small></b></div>
        <div class="marker"><label>Odd / Even</label><b>${odd}O / ${even}E</b></div>
        <div class="marker"><label>Hot Σ / Die</label><b>${hotTxt}</b></div>
      </div>`;
      const maxT = Math.max(1, ...totals), maxF = Math.max(1, ...faces);
      const bars = (arr, from, to, max, cls) => {
        let h = '';
        for (let i = from; i <= to; i++) h += `<div class="bar ${cls(i)}"><div class="fill" style="height:${(arr[i] / max) * 100}%"></div><span>${i}</span><em>${arr[i]}</em></div>`;
        return h;
      };
      return `${markers}<h4>Totals</h4><div class="bars">${bars(totals, 3, 18, maxT, (i) => (i >= 11 ? 'a' : 'b'))}</div>
              <h4>Die faces</h4><div class="bars faces">${bars(faces, 1, 6, maxF, () => 'n')}</div>`;
    },
  };

  const PIPS = { 1: [5], 2: [1, 9], 3: [1, 5, 9], 4: [1, 3, 7, 9], 5: [1, 3, 5, 7, 9], 6: [1, 3, 4, 6, 7, 9] };
  function pip(n) {
    let h = '<span class="pips">';
    for (let i = 1; i <= 9; i++) h += `<i class="${PIPS[n].includes(i) ? 'on' : ''}"></i>`;
    return h + '</span>';
  }

  if (typeof module !== 'undefined' && module.exports) module.exports = SicBo;
  else (root.Games = root.Games || {}).sicbo = SicBo;
})(this);
