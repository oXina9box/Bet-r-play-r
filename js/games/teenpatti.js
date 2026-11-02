/* Teen Patti: Player 1 (first 3 cards) vs Player 2 (next 3 cards), best hand wins.
 * Ranking: Trail > Pure Sequence > Sequence > Color > Pair > High Card.
 * Sequences: A-K-Q highest, K-Q-J second ... 2-3-4, A-2-3 lowest. Suits never break ties -> exact tie.
 * Side A = Player 1, B = Player 2, null = tie (engine plays it as the last winner, marked as a push).
 */
(function (root) {
  const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
  const VAL = Object.fromEntries(RANKS.map((r, i) => [r, i + 2]));
  const SUITS = { h: '♥', d: '♦', s: '♠', c: '♣' };
  const RANK_KEYS = { 2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9', 0: '10', t: '10', j: 'J', q: 'Q', k: 'K', a: 'A' };
  const CATS = ['', 'High Card', 'Pair', 'Color', 'Sequence', 'Pure Seq', 'Trail'];

  const parse = (c) => ({ r: VAL[c.slice(0, -1)], s: c.slice(-1) });

  function rankHand(cards) {
    const cs = cards.map(parse);
    const v = cs.map((c) => c.r).sort((a, b) => b - a);
    const flush = cs.every((c) => c.s === cs[0].s);
    let seq = 0;
    if (v[0] === 14 && v[1] === 3 && v[2] === 2) seq = 3; // A-2-3: lowest sequence
    else if (v[0] - v[1] === 1 && v[1] - v[2] === 1) seq = v[0]; // A-K-Q = 14 top, K-Q-J = 13 ...
    if (v[0] === v[2]) return [6, v[0]];
    if (seq && flush) return [5, seq];
    if (seq) return [4, seq];
    if (flush) return [3, ...v];
    if (v[0] === v[1]) return [2, v[0], v[2]];
    if (v[1] === v[2]) return [2, v[1], v[0]];
    return [1, ...v];
  }

  function compare(a, b) {
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) > (b[i] || 0) ? 1 : -1;
    }
    return 0;
  }

  const TeenPatti = {
    id: 'teenpatti',
    name: 'Teen Patti',
    sides: { A: { label: 'PLAYER 1', short: '1' }, B: { label: 'PLAYER 2', short: '2' } },
    entryName: 'Hand',
    rankHand,
    compare,

    // raw: { c: [6 cards] } (A1 A2 A3 B1 B2 B3)  or quick entry { w: 'A'|'B'|'T' }
    outcome(raw) {
      if (raw.w) return { side: raw.w === 'T' ? null : raw.w, lossAll: false };
      const ha = rankHand(raw.c.slice(0, 3)), hb = rankHand(raw.c.slice(3));
      const cmp = compare(ha, hb);
      return { side: cmp > 0 ? 'A' : cmp < 0 ? 'B' : null, lossAll: false, ha: ha[0], hb: hb[0] };
    },

    emptyPending: () => ({ cards: [], rank: null }),

    input(p, key) {
      key = String(key).toLowerCase();
      if (key === 'wa' || key === 'wb' || key === 'wt') return { pending: this.emptyPending(), commit: { w: key[1].toUpperCase() } };
      if (key.startsWith('r:')) key = key.slice(2);
      // Suits are h/d/s/c, ranks never use those letters ('a' = Ace).
      if (RANK_KEYS[key]) return { pending: { cards: p.cards, rank: RANK_KEYS[key] } };
      if (SUITS[key]) {
        if (!p.rank) return { pending: p };
        const card = p.rank + key;
        if (p.cards.includes(card)) return { pending: { cards: p.cards, rank: null }, error: card + ' already dealt' };
        const cards = p.cards.concat(card);
        if (cards.length === 6) return { pending: this.emptyPending(), commit: { c: cards } };
        return { pending: { cards, rank: null } };
      }
      return null;
    },

    undoInput(p) {
      if (p.rank) return { cards: p.cards, rank: null };
      if (p.cards.length) return { cards: p.cards.slice(0, -1), rank: null };
      return null;
    },

    pendingHTML(p) {
      const slot = (i) => {
        const c = p.cards[i];
        const active = i === p.cards.length;
        if (c) return `<div class="slot card filled ${suitCls(c)}">${cardLabel(c)}</div>`;
        return `<div class="slot card ${active ? 'active' : ''}">${active && p.rank ? p.rank + '<small>?</small>' : ''}</div>`;
      };
      let live = '';
      if (p.cards.length >= 3) live = `<span class="hand-type">${CATS[rankHand(p.cards.slice(0, 3))[0]]}</span>`;
      return `<div class="hands">
        <div class="hand"><label>Player 1 · cards 1–3 ${live}</label><div class="slots">${[0, 1, 2].map(slot).join('')}</div></div>
        <div class="hand"><label>Player 2 · cards 4–6</label><div class="slots">${[3, 4, 5].map(slot).join('')}</div></div>
      </div>`;
    },

    padHTML() {
      const ranks = RANKS.map((r) => {
        const k = r === '10' ? '0' : r.toLowerCase();
        return `<button class="key rank" data-key="r:${k}">${r}${r === '10' ? '<span class="kbd">0</span>' : ''}</button>`;
      }).join('');
      const suits = Object.entries(SUITS).map(([k, s]) => `<button class="key suit ${k === 'h' || k === 'd' ? 'red' : ''}" data-key="${k}">${s}<span class="kbd">${k}</span></button>`).join('');
      return `<div class="pad card-pad"><div class="ranks">${ranks}</div><div class="suits">${suits}</div>
        <div class="quick"><span>Quick:</span>
          <button class="key qa" data-key="wa">P1 won</button>
          <button class="key qt" data-key="wt">Tie</button>
          <button class="key qb" data-key="wb">P2 won</button></div></div>`;
    },

    chip(raw, o) {
      const main = o.side === 'A' ? '1' : o.side === 'B' ? '2' : 'T';
      if (raw.w) return { main, sub: 'quick', flag: '' };
      return { main, sub: CATS[o.side === 'B' ? o.hb : o.ha], flag: '' };
    },

    extraStats(rows) {
      const counts = Array(7).fill(0);
      let carded = 0;
      for (const r of rows) {
        if (r.raw.w) continue;
        carded++;
        counts[r.o.ha]++; counts[r.o.hb]++;
      }
      if (!carded) return '<h4>Hand types</h4><p class="muted">Enter cards to see hand-type stats.</p>';
      const max = Math.max(1, ...counts);
      let h = '';
      for (let i = 6; i >= 1; i--) h += `<div class="hbar"><span>${CATS[i]}</span><div class="track"><div class="fill" style="width:${(counts[i] / max) * 100}%"></div></div><em>${counts[i]} · ${((counts[i] / (carded * 2)) * 100).toFixed(1)}%</em></div>`;
      return `<h4>Hand types (${carded} carded hands)</h4>${h}`;
    },
  };

  function cardLabel(c) { return c.slice(0, -1) + SUITS[c.slice(-1)]; }
  function suitCls(c) { return 'hd'.includes(c.slice(-1)) ? 'red' : ''; }

  if (typeof module !== 'undefined' && module.exports) module.exports = TeenPatti;
  else (root.Games = root.Games || {}).teenpatti = TeenPatti;
})(this);
