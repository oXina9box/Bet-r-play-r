/* Teen Patti: Player A vs Player B, best hand wins.
 * Ranking: Trail > Pure Sequence > Sequence > Color > Pair > High Card.
 * Sequences: A-K-Q highest, K-Q-J second ... 2-3-4, A-2-3 lowest. Suits never break ties -> exact tie.
 * Side A = Player A, B = Player B, null = tie (push).
 *
 * Alternating Dealing Order (matching real dealer):
 * Deal 1: Player A (Card 1)
 * Deal 2: Player B (Card 1)
 * Deal 3: Player A (Card 2)
 * Deal 4: Player B (Card 2)
 * Deal 5: Player A (Card 3)
 * Deal 6: Player B (Card 3)
 *
 * Fast Keypad Card Entry:
 * Step 1: Press Rank (2..9, 0/t/10, J, Q, K, A)
 * Step 2: Press Suit Number:
 *   1 = Hearts
 *   2 = Spades
 *   3 = Clubs
 *   4 = Diamonds
 * Direct letter suits (h, s, c, d) and full codes (e.g. As, 5d) are also supported.
 */
(function (root) {
  const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
  const VAL = Object.fromEntries(RANKS.map((r, i) => [r, i + 2]));
  const SUITS = { h: '\u2665', d: '\u2666', s: '\u2660', c: '\u2663' };
  const NUMERIC_SUITS = { '1': 'h', '2': 's', '3': 'c', '4': 'd' };
  const SUIT_CYCLE = ['h', 's', 'c', 'd'];
  const RANK_KEYS = {
    2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9',
    0: '10', t: '10', 10: '10',
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

  let autoCommitCb = null;

  const TeenPatti = {
    id: 'teenpatti',
    name: 'Teen Patti',
    sides: { A: { label: 'PLAYER A', short: 'A' }, B: { label: 'PLAYER B', short: 'B' } },
    entryName: 'Hand',
    rankHand,
    compare,

    registerAutoCommit(cb) {
      autoCommitCb = cb;
    },

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
      return { cards: [], active: null };
    },

    confirmActive(p) {
      if (!p || !p.active || !p.active.rank) return null;
      const suit = p.active.suit || 'h';
      const card = p.active.rank + suit;
      if (p.cards.includes(card)) {
        return { pending: { cards: p.cards, active: null }, error: cardLabel(card) + ' already dealt' };
      }
      const cards = p.cards.concat(card);
      if (cards.length === 6) {
        return { pending: this.emptyPending(), commit: { c: cards, order: 'alternating' } };
      }
      return { pending: { cards, active: null } };
    },

    input(p, key, cfg) {
      p = Object.assign({ active: null }, p, { cards: (p && p.cards) || [] });
      key = String(key).toLowerCase();

      // Quick entry
      if (key === 'wa' || key === 'wb' || key === 'wt') {
        return { pending: this.emptyPending(), commit: { w: key[1].toUpperCase() } };
      }

      // Quick 1/2 mode: 1 = Player A, 2 = Player B, 3 = Tie
      if (cfg?.entryMode === 'quick') {
        if (key === '1') return { pending: this.emptyPending(), commit: { w: 'A' } };
        if (key === '2') return { pending: this.emptyPending(), commit: { w: 'B' } };
        if (key === '3') return { pending: this.emptyPending(), commit: { w: 'T' } };
      }

      // Space / Enter / Tab: explicitly confirm current active card (defaults to Hearts if suit wasn't chosen)
      if (key === 'enter' || key === ' ' || key === 'space' || key === 'tab') {
        return this.confirmActive(p) || { pending: p };
      }

      if (key.startsWith('r:')) key = key.slice(2);

      // Direct full card code, e.g. "as", "5d", "10h", "kc"
      const fullMatch = key.match(/^([2-9]|10|[jqka])([hscd])$/);
      if (fullMatch) {
        if (p.cards.length >= 6) return null;
        const r = RANK_KEYS[fullMatch[1]] || fullMatch[1].toUpperCase();
        const s = fullMatch[2];
        const card = r + s;
        if (p.cards.includes(card)) {
          return { pending: { cards: p.cards, active: null }, error: cardLabel(card) + ' already dealt' };
        }
        const cards = p.cards.concat(card);
        if (cards.length === 6) {
          return { pending: this.emptyPending(), commit: { c: cards, order: 'alternating' } };
        }
        return { pending: { cards, active: null } };
      }

      // If a rank is currently active:
      if (p.active && p.active.rank) {
        // Suit key: 1=h (Hearts), 2=s (Spades), 3=c (Clubs), 4=d (Diamonds), or direct h/s/c/d
        const suit = NUMERIC_SUITS[key] || (SUITS[key] ? key : null);
        if (suit) {
          const card = p.active.rank + suit;
          if (p.cards.includes(card)) {
            return { pending: { cards: p.cards, active: null }, error: cardLabel(card) + ' already dealt' };
          }
          const cards = p.cards.concat(card);
          if (cards.length === 6) {
            return { pending: this.emptyPending(), commit: { c: cards, order: 'alternating' } };
          }
          return { pending: { cards, active: null } };
        }

        // Extra 0 while rank is 10 (e.g. user typed '1' then '0')
        if (key === '0' && p.active.rank === '10') {
          return { pending: p };
        }

        // If user typed another non-suit rank key (e.g. 5..9, 0, t, j, q, k, a):
        // Confirm previous card with Hearts, then start new rank (or commit if 6th card)
        if (RANK_KEYS[key]) {
          const prevCard = p.active.rank + (p.active.suit || 'h');
          if (p.cards.includes(prevCard)) {
            return { pending: { cards: p.cards, active: null }, error: cardLabel(prevCard) + ' already dealt' };
          }
          const cards = p.cards.concat(prevCard);
          if (cards.length === 6) {
            return { pending: this.emptyPending(), commit: { c: cards, order: 'alternating' } };
          }
          return { pending: { cards, active: { rank: RANK_KEYS[key] } } };
        }

        return { pending: p };
      }

      // No active rank currently:
      if (p.cards.length >= 6) return null;

      // '1' when no rank is active starts rank 10
      if (key === '1') {
        return { pending: { cards: p.cards, active: { rank: '10' } } };
      }

      // Normal rank key (2..9, 0, t, j, q, k, a)
      if (RANK_KEYS[key]) {
        return { pending: { cards: p.cards, active: { rank: RANK_KEYS[key] } } };
      }

      return null;
    },

    undoInput(p) {
      if (!p) return null;
      if (p.active) return { cards: p.cards, active: null };
      if (p.cards && p.cards.length) return { cards: p.cards.slice(0, -1), active: null };
      return null;
    },

    pendingHTML(p, cfg) {
      if (cfg?.entryMode === 'quick') {
        return `<div class="quick-status-panel">
          <div class="quick-status-hint">Quick Mode Active · Press <b>1</b> for Player A · <b>2</b> for Player B · <b>3</b> for Tie</div>
        </div>`;
      }
      p = p || { cards: [], active: null };
      const cards = p.cards || [];
      const currentDeal = cards.length; // 0..5
      const isPATurn = currentDeal % 2 === 0;

      // Slot renderer for deal index (0..5)
      const slot = (dealIdx) => {
        const c = cards[dealIdx];
        const isActive = currentDeal === dealIdx;
        if (c) {
          return `<div class="slot card filled ${suitCls(c)}"><span class="deal-num">#${dealIdx + 1}</span>${cardLabel(c)}</div>`;
        }
        if (isActive && p.active && p.active.rank) {
          return `<div class="slot card active rank-pending"><span class="deal-num">#${dealIdx + 1}</span><span class="active-rank">${p.active.rank}</span><span class="suit-hints"><span class="red">1\u2665</span> 2\u2660 3\u2663 <span class="red">4\u2666</span></span></div>`;
        }
        return `<div class="slot card ${isActive ? 'active' : ''}"><span class="deal-num">#${dealIdx + 1}</span><small>${isActive ? 'deal' : ''}</small></div>`;
      };

      // Player A has deals 0, 2, 4 (Deals #1, #3, #5)
      // Player B has deals 1, 3, 5 (Deals #2, #4, #6)
      const pATurnBadge = currentDeal < 6 && isPATurn ? '<span class="deal-turn">DEALING</span>' : '';
      const pBTurnBadge = currentDeal < 6 && !isPATurn ? '<span class="deal-turn">DEALING</span>' : '';

      let pALive = '';
      if (cards.length >= 5) {
        const pACards = [cards[0], cards[2], cards[4]];
        pALive = `<span class="hand-type">${CATS[rankHand(pACards)[0]]}</span>`;
      }

      let pBLive = '';
      if (cards.length === 6) {
        const pBCards = [cards[1], cards[3], cards[5]];
        pBLive = `<span class="hand-type">${CATS[rankHand(pBCards)[0]]}</span>`;
      }

      return `<div class="hands alternating">
        <div class="hand ${isPATurn && currentDeal < 6 ? 'dealing' : ''}">
          <label>Player A · deals 1, 3, 5 ${pATurnBadge} ${pALive}</label>
          <div class="slots">${[0, 2, 4].map(slot).join('')}</div>
        </div>
        <div class="hand ${!isPATurn && currentDeal < 6 ? 'dealing' : ''}">
          <label>Player B · deals 2, 4, 6 ${pBTurnBadge} ${pBLive}</label>
          <div class="slots">${[1, 3, 5].map(slot).join('')}</div>
        </div>
      </div>`;
    },

    padHTML(cfg) {
      if (cfg?.entryMode === 'quick') {
        return `<div class="pad quick-pad">
          <div class="multitap-hint">Quick Entry Mode: Press <b>1</b> for Player A · <b>2</b> for Player B · <b>3</b> for Tie</div>
          <div class="quick-large">
            <button class="key qa-large" data-key="1"><span class="kbd">1</span> PLAYER A WON</button>
            <button class="key qb-large" data-key="2"><span class="kbd">2</span> PLAYER B WON</button>
            <button class="key qt-large" data-key="3"><span class="kbd">3</span> TIE</button>
          </div>
        </div>`;
      }
      const ranks = RANKS.map((r) => {
        const k = r === '10' ? '0' : r.toLowerCase();
        return `<button class="key rank" data-key="r:${k}">${r}${r === '10' ? '<span class="kbd">0</span>' : ''}</button>`;
      }).join('');
      const suits = [
        { k: '1', s: '\u2665', cls: 'red' },
        { k: '2', s: '\u2660', cls: '' },
        { k: '3', s: '\u2663', cls: '' },
        { k: '4', s: '\u2666', cls: 'red' },
      ].map((it) => `<button class="key suit ${it.cls}" data-key="${it.k}">${it.s}<span class="kbd">${it.k}</span></button>`).join('');

      return `<div class="pad card-pad">
        <div class="multitap-hint">Fast Entry: <b>[Rank]</b> then suit: <b>1=\u2665</b> · <b>2=\u2660</b> · <b>3=\u2663</b> · <b>4=\u2666</b> &nbsp;<small class="muted">(e.g. A2=A\u2660, 54=5\u2666, 01=10\u2665, 22=2\u2660 · or hold Space for voice)</small></div>
        <div class="ranks">${ranks}</div>
        <div class="suits">${suits}</div>
        <div class="quick"><span>Quick:</span>
          <button class="key qa" data-key="wa" title="Player A won"><span class="kbd">1</span> Player A won</button>
          <button class="key qt" data-key="wt" title="Tie"><span class="kbd">3</span> Tie</button>
          <button class="key qb" data-key="wb" title="Player B won"><span class="kbd">2</span> Player B won</button></div></div>`;
    },

    chip(raw, o) {
      const main = o.side === 'A' ? 'A' : o.side === 'B' ? 'B' : 'T';
      if (raw.w) return { main, sub: 'quick', flag: '' };
      return { main, sub: CATS[o.side === 'B' ? o.hb : o.ha], flag: '' };
    },

    extraStats(rows) {
      const counts = Array(7).fill(0);
      let carded = 0, curSide = null, curStreak = 0, maxStreak = 0, maxSide = null, sinceTie = 0, seenTie = false;
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        if (r.side) {
          if (r.side === curSide) curStreak++;
          else { curSide = r.side; curStreak = 1; }
          if (curStreak > maxStreak) { maxStreak = curStreak; maxSide = curSide; }
        }
        if (!r.raw.w) {
          carded++;
          counts[r.o.ha]++; counts[r.o.hb]++;
        }
      }
      for (let i = rows.length - 1; i >= 0; i--) {
        if (rows[i].side == null) { seenTie = true; break; }
        sinceTie++;
      }
      const totalHands = carded * 2;
      const pairPlus = counts[2] + counts[3] + counts[4] + counts[5] + counts[6];
      const seqPlus = counts[4] + counts[5] + counts[6];
      const pairPct = totalHands ? ((pairPlus / totalHands) * 100).toFixed(0) + '%' : '–';
      const streakTxt = curStreak ? `${this.sides[curSide].short}×${curStreak} <small>max ${maxSide ? this.sides[maxSide].short : ''}${maxStreak}</small>` : '–';
      const markers = `<div class="game-markers">
        <div class="marker"><label>Streak</label><b>${streakTxt}</b></div>
        <div class="marker"><label>Tie Gap</label><b>${sinceTie}h <small>${seenTie ? 'since tie' : 'no ties'}</small></b></div>
        <div class="marker"><label>Pair+ Rate</label><b>${pairPct} <small>${pairPlus}/${totalHands}</small></b></div>
        <div class="marker"><label>Seq / Trail</label><b>${seqPlus} <small>${counts[6]} trail</small></b></div>
      </div>`;
      const max = Math.max(1, ...counts);
      let h = '';
      for (let i = 6; i >= 1; i--) h += `<div class="hbar"><span>${CATS[i]}</span><div class="track"><div class="fill" style="width:${(counts[i] / max) * 100}%"></div></div><em>${counts[i]} · ${totalHands ? ((counts[i] / totalHands) * 100).toFixed(1) : '0.0'}%</em></div>`;
      return `${markers}<h4>Hand types (${carded} carded hands)</h4>${h}`;
    },
  };

  function cardLabel(c) { return c.slice(0, -1) + SUITS[c.slice(-1)]; }
  function suitCls(c) { return 'hd'.includes(c.slice(-1)) ? 'red' : ''; }

  if (typeof module !== 'undefined' && module.exports) module.exports = TeenPatti;
  else (root.Games = root.Games || {}).teenpatti = TeenPatti;
})(this);
