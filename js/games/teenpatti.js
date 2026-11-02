/* Teen Patti: Player 1 vs Player 2, best hand wins.
 * Ranking: Trail > Pure Sequence > Sequence > Color > Pair > High Card.
 * Sequences: A-K-Q highest, K-Q-J second ... 2-3-4, A-2-3 lowest. Suits never break ties -> exact tie.
 * Side A = Player 1, B = Player 2, null = tie (push).
 *
 * Alternating Dealing Order (matching real dealer):
 * Deal 1: Player 1 (Card 1)
 * Deal 2: Player 2 (Card 1)
 * Deal 3: Player 1 (Card 2)
 * Deal 4: Player 2 (Card 2)
 * Deal 5: Player 1 (Card 3)
 * Deal 6: Player 2 (Card 3)
 *
 * Multi-Tap Card Key Entry:
 * 1 tap : Hearts (♥)
 * 2 taps: Spades (♠)
 * 3 taps: Clubs (♣)
 * 4 taps: Diamonds (♦)
 * e.g. aa = A♠, 5555 = 5♦, k = K♥, jjj = J♣.
 * Changing rank, pressing Space/Enter, or a 650ms pause confirms the card.
 */
(function (root) {
  const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
  const VAL = Object.fromEntries(RANKS.map((r, i) => [r, i + 2]));
  const SUITS = { h: '♥', d: '♦', s: '♠', c: '♣' };
  const SUIT_CYCLE = ['h', 's', 'c', 'd']; // 1=h, 2=s, 3=c, 4=d
  const RANK_KEYS = {
    2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9',
    0: '10', t: '10', 1: '10', 10: '10',
    j: 'J', q: 'Q', k: 'K', a: 'A'
  };
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

  let commitTimer = null;
  let autoCommitCb = null;

  function scheduleAutoCommit() {
    clearTimeout(commitTimer);
    commitTimer = setTimeout(() => {
      if (typeof autoCommitCb === 'function') autoCommitCb();
    }, 650);
  }

  const TeenPatti = {
    id: 'teenpatti',
    name: 'Teen Patti',
    sides: { A: { label: 'PLAYER 1', short: '1' }, B: { label: 'PLAYER 2', short: '2' } },
    entryName: 'Hand',
    rankHand,
    compare,

    registerAutoCommit(cb) {
      autoCommitCb = cb;
    },

    // Legacy {c} groups P1's first 3 cards; new deals explicitly mark alternating order.
    // Quick entry: { w: 'A'|'B'|'T' }.
    outcome(raw) {
      if (raw.w) return { side: raw.w === 'T' ? null : raw.w, lossAll: false };
      const alternating = raw.order === 'alternating';
      const p1 = alternating ? [raw.c[0], raw.c[2], raw.c[4]] : raw.c.slice(0, 3);
      const p2 = alternating ? [raw.c[1], raw.c[3], raw.c[5]] : raw.c.slice(3);
      const ha = rankHand(p1), hb = rankHand(p2);
      const cmp = compare(ha, hb);
      return { side: cmp > 0 ? 'A' : cmp < 0 ? 'B' : null, lossAll: false, ha: ha[0], hb: hb[0] };
    },

    emptyPending() {
      clearTimeout(commitTimer);
      return { cards: [], active: null };
    },

    confirmActive(p) {
      if (!p || !p.active) return null;
      clearTimeout(commitTimer);
      const card = p.active.rank + SUIT_CYCLE[p.active.suitIdx];
      if (p.cards.includes(card)) {
        return { pending: { cards: p.cards, active: null }, error: card + ' already dealt' };
      }
      const cards = p.cards.concat(card);
      if (cards.length === 6) {
        return { pending: this.emptyPending(), commit: { c: cards, order: 'alternating' } };
      }
      return { pending: { cards, active: null } };
    },

    input(p, key) {
      p = Object.assign({ active: null }, p, { cards: p && p.cards || [] });
      key = String(key).toLowerCase();

      // Quick entry
      if (key === 'wa' || key === 'wb' || key === 'wt') {
        clearTimeout(commitTimer);
        return { pending: this.emptyPending(), commit: { w: key[1].toUpperCase() } };
      }

      // Space / Enter / Tab: explicitly confirm current active card
      if (key === 'enter' || key === ' ' || key === 'space' || key === 'tab') {
        return this.confirmActive(p) || { pending: p };
      }

      if (key.startsWith('r:')) key = key.slice(2);

      // Direct suit key ('h', 's', 'c', 'd') immediately confirms active card with that suit
      if (SUITS[key]) {
        if (!p.active) return { pending: p };
        clearTimeout(commitTimer);
        const card = p.active.rank + key;
        if (p.cards.includes(card)) {
          return { pending: { cards: p.cards, active: null }, error: card + ' already dealt' };
        }
        const cards = p.cards.concat(card);
        if (cards.length === 6) {
          return { pending: this.emptyPending(), commit: { c: cards, order: 'alternating' } };
        }
        return { pending: { cards, active: null } };
      }

      // Rank key (2..9, 0, t, 1, j, q, k, a)
      if (RANK_KEYS[key]) {
        const rank = RANK_KEYS[key];
        if (p.active) {
          if (p.active.rank === rank) {
            // Multi-tap: same rank tapped again -> cycle suit: Hearts -> Spades -> Clubs -> Diamonds
            const suitIdx = (p.active.suitIdx + 1) % 4;
            const active = { rank, suitIdx };
            scheduleAutoCommit();
            return { pending: { cards: p.cards, active } };
          } else {
            // Different rank tapped: confirm previous card first
            clearTimeout(commitTimer);
            const prevCard = p.active.rank + SUIT_CYCLE[p.active.suitIdx];
            if (p.cards.includes(prevCard)) {
              return { pending: { cards: p.cards, active: null }, error: prevCard + ' already dealt' };
            }
            const cards = p.cards.concat(prevCard);
            if (cards.length === 6) {
              return { pending: this.emptyPending(), commit: { c: cards, order: 'alternating' } };
            }
            // Start new active card at Hearts (suitIdx 0)
            const active = { rank, suitIdx: 0 };
            scheduleAutoCommit();
            return { pending: { cards, active } };
          }
        } else {
          // No active card: start new active card at Hearts (suitIdx 0)
          if (p.cards.length >= 6) return null;
          const active = { rank, suitIdx: 0 };
          scheduleAutoCommit();
          return { pending: { cards: p.cards, active } };
        }
      }

      return null;
    },

    undoInput(p) {
      clearTimeout(commitTimer);
      if (!p) return null;
      if (p.active) return { cards: p.cards, active: null };
      if (p.cards && p.cards.length) return { cards: p.cards.slice(0, -1), active: null };
      return null;
    },

    pendingHTML(p) {
      p = p || { cards: [], active: null };
      const cards = p.cards || [];
      const currentDeal = cards.length; // 0..5
      const isP1Turn = currentDeal % 2 === 0;

      // Slot renderer for deal index (0..5)
      const slot = (dealIdx) => {
        const c = cards[dealIdx];
        const isActive = currentDeal === dealIdx;
        if (c) {
          return `<div class="slot card filled ${suitCls(c)}"><span class="deal-num">#${dealIdx + 1}</span>${cardLabel(c)}</div>`;
        }
        if (isActive && p.active) {
          const activeCard = p.active.rank + SUIT_CYCLE[p.active.suitIdx];
          return `<div class="slot card filled active ${suitCls(activeCard)}"><span class="deal-num">#${dealIdx + 1}</span>${cardLabel(activeCard)}</div>`;
        }
        return `<div class="slot card ${isActive ? 'active' : ''}"><span class="deal-num">#${dealIdx + 1}</span><small>${isActive ? 'deal' : ''}</small></div>`;
      };

      // Player 1 has deals 0, 2, 4 (Deals #1, #3, #5)
      // Player 2 has deals 1, 3, 5 (Deals #2, #4, #6)
      const p1TurnBadge = currentDeal < 6 && isP1Turn ? '<span class="deal-turn">DEALING</span>' : '';
      const p2TurnBadge = currentDeal < 6 && !isP1Turn ? '<span class="deal-turn">DEALING</span>' : '';

      let p1Live = '';
      if (cards.length >= 5) {
        const p1Cards = [cards[0], cards[2], cards[4]];
        p1Live = `<span class="hand-type">${CATS[rankHand(p1Cards)[0]]}</span>`;
      }

      let p2Live = '';
      if (cards.length === 6) {
        const p2Cards = [cards[1], cards[3], cards[5]];
        p2Live = `<span class="hand-type">${CATS[rankHand(p2Cards)[0]]}</span>`;
      }

      return `<div class="hands alternating">
        <div class="hand ${isP1Turn && currentDeal < 6 ? 'dealing' : ''}">
          <label>Player 1 · deals 1, 3, 5 ${p1TurnBadge} ${p1Live}</label>
          <div class="slots">${[0, 2, 4].map(slot).join('')}</div>
        </div>
        <div class="hand ${!isP1Turn && currentDeal < 6 ? 'dealing' : ''}">
          <label>Player 2 · deals 2, 4, 6 ${p2TurnBadge} ${p2Live}</label>
          <div class="slots">${[1, 3, 5].map(slot).join('')}</div>
        </div>
      </div>`;
    },

    padHTML() {
      const ranks = RANKS.map((r) => {
        const k = r === '10' ? '0' : r.toLowerCase();
        return `<button class="key rank" data-key="r:${k}">${r}${r === '10' ? '<span class="kbd">0</span>' : ''}</button>`;
      }).join('');
      const suits = Object.entries(SUITS).map(([k, s]) => `<button class="key suit ${k === 'h' || k === 'd' ? 'red' : ''}" data-key="${k}">${s}<span class="kbd">${k}</span></button>`).join('');
      return `<div class="pad card-pad">
        <div class="multitap-hint">Multi-tap rank: <b>1×♥</b> · <b>2×♠</b> · <b>3×♣</b> · <b>4×♦</b> &nbsp;<small class="muted">(aa = A♠, 5555 = 5♦ · Space/Enter to confirm)</small></div>
        <div class="ranks">${ranks}</div>
        <div class="suits">${suits}</div>
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
