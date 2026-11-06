/* Baccarat: Player vs Banker. Target is 9.
 * Card values: Ace = 1, 2-9 = face value, 10/J/Q/K = 0.
 * Hand score: sum of cards modulo 10 (0..9).
 * Natural: 8 or 9 on the initial two cards.
 *
 * Alternating Dealing Order:
 * Deal 1: Player (Card 1)
 * Deal 2: Banker (Card 1)
 * Deal 3: Player (Card 2)
 * Deal 4: Banker (Card 2)
 * (If required by standard Baccarat tableau):
 * Deal 5: Player 3rd card (if Player draws) OR Banker 3rd card (if Player stands and Banker draws)
 * Deal 6: Banker 3rd card (if Player drew and Banker also draws)
 *
 * Side A = PLAYER ('P'), Side B = BANKER ('B'), null = TIE ('T').
 *
 * Fast Keypad Card Entry:
 * Step 1: Press Rank (A, 2..9, 0/t/10, J, Q, K)
 * Step 2: Press Suit Number:
 *   1 = Hearts (♥)
 *   2 = Spades (♠)
 *   3 = Clubs (♣)
 *   4 = Diamonds (♦)
 * Direct letter suits (h, s, c, d) and full codes (e.g. As, 9d) are also supported.
 */
(function (root) {
  const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
  const SUITS = { h: '♥', d: '♦', s: '♠', c: '♣' };
  const NUMERIC_SUITS = { '1': 'h', '2': 's', '3': 'c', '4': 'd' };
  const RANK_KEYS = {
    a: 'A',
    2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9',
    0: '10', t: '10', 10: '10',
    j: 'J', q: 'Q', k: 'K'
  };

  function cardValue(c) {
    if (!c || typeof c !== 'string') return 0;
    const r = c.slice(0, -1).toUpperCase();
    if (r === 'A') return 1;
    if (r === '10' || r === 'J' || r === 'Q' || r === 'K') return 0;
    const n = Number(r);
    return Number.isInteger(n) && n >= 2 && n <= 9 ? n : 0;
  }

  function handScore(cards) {
    if (!Array.isArray(cards) || cards.length === 0) return 0;
    const sum = cards.reduce((acc, c) => acc + cardValue(c), 0);
    return sum % 10;
  }

  /* Analyzes cards dealt according to the official Baccarat Tableau.
   * Deal order:
   * [0] Player 1, [1] Banker 1, [2] Player 2, [3] Banker 2.
   * If either has 8 or 9 (Natural), round ends (4 cards).
   * Otherwise:
   * - Player stands on 6, 7; draws on 0..5 (taking card [4]).
   * - If Player stands: Banker draws on 0..5 (taking card [4]), stands on 6, 7.
   * - If Player draws: Banker draws based on Player's 3rd card (taking card [5]).
   */
  function analyzeTableau(cards) {
    const list = Array.isArray(cards) ? cards : [];
    if (list.length < 4) {
      const p = [], b = [];
      if (list[0]) p.push(list[0]);
      if (list[2]) p.push(list[2]);
      if (list[1]) b.push(list[1]);
      if (list[3]) b.push(list[3]);
      return {
        pCards: p,
        bCards: b,
        nextDeal: list.length % 2 === 0 ? 'P' : 'B',
        complete: false,
        natural: false,
        pScore: handScore(p),
        bScore: handScore(b)
      };
    }

    const pInit = [list[0], list[2]];
    const bInit = [list[1], list[3]];
    const pScoreInit = handScore(pInit);
    const bScoreInit = handScore(bInit);

    // Natural 8 or 9
    if (pScoreInit >= 8 || bScoreInit >= 8) {
      return {
        pCards: pInit,
        bCards: bInit,
        nextDeal: null,
        complete: true,
        natural: true,
        pScore: pScoreInit,
        bScore: bScoreInit
      };
    }

    // Player drawing rule: draws on 0..5, stands on 6, 7
    const pDraws = pScoreInit <= 5;

    if (pDraws) {
      const pCards = [list[0], list[2]];
      const bCards = [list[1], list[3]];
      if (list.length === 4) {
        return {
          pCards,
          bCards,
          nextDeal: 'P', // Card 5 goes to Player
          complete: false,
          natural: false,
          pScore: pScoreInit,
          bScore: bScoreInit
        };
      }
      pCards.push(list[4]);
      const p3Val = cardValue(list[4]);

      // Banker drawing rule when Player drew a 3rd card
      let bDraws = false;
      if (bScoreInit <= 2) bDraws = true;
      else if (bScoreInit === 3) bDraws = (p3Val !== 8);
      else if (bScoreInit === 4) bDraws = (p3Val >= 2 && p3Val <= 7);
      else if (bScoreInit === 5) bDraws = (p3Val >= 4 && p3Val <= 7);
      else if (bScoreInit === 6) bDraws = (p3Val === 6 || p3Val === 7);
      else bDraws = false; // 7

      if (bDraws) {
        if (list.length === 5) {
          return {
            pCards,
            bCards,
            nextDeal: 'B', // Card 6 goes to Banker
            complete: false,
            natural: false,
            pScore: handScore(pCards),
            bScore: bScoreInit
          };
        }
        bCards.push(list[5]);
        return {
          pCards,
          bCards,
          nextDeal: null,
          complete: true,
          natural: false,
          pScore: handScore(pCards),
          bScore: handScore(bCards)
        };
      } else {
        // Banker stands; complete at 5 cards
        return {
          pCards,
          bCards,
          nextDeal: null,
          complete: true,
          natural: false,
          pScore: handScore(pCards),
          bScore: bScoreInit
        };
      }
    } else {
      // Player stood on 6 or 7. Banker draws on 0..5, stands on 6, 7.
      const pCards = [list[0], list[2]];
      const bCards = [list[1], list[3]];
      const bDraws = bScoreInit <= 5;

      if (bDraws) {
        if (list.length === 4) {
          return {
            pCards,
            bCards,
            nextDeal: 'B', // Card 5 goes to Banker
            complete: false,
            natural: false,
            pScore: pScoreInit,
            bScore: bScoreInit
          };
        }
        bCards.push(list[4]);
        return {
          pCards,
          bCards,
          nextDeal: null,
          complete: true,
          natural: false,
          pScore: pScoreInit,
          bScore: handScore(bCards)
        };
      } else {
        // Both stood; complete at 4 cards
        return {
          pCards,
          bCards,
          nextDeal: null,
          complete: true,
          natural: false,
          pScore: pScoreInit,
          bScore: bScoreInit
        };
      }
    }
  }

  let autoCommitCb = null;

  const Baccarat = {
    id: 'baccarat',
    name: 'Baccarat',
    sides: { A: { label: 'PLAYER', short: 'P' }, B: { label: 'BANKER', short: 'B' } },
    entryName: 'Hand',
    cardValue,
    handScore,
    analyzeTableau,

    registerAutoCommit(cb) {
      autoCommitCb = cb;
    },

    outcome(raw) {
      if (raw.w) {
        return {
          side: raw.w === 'T' ? null : raw.w,
          lossAll: false,
          scoreA: null,
          scoreB: null,
          natural: false,
        };
      }
      const t = analyzeTableau(raw.c || []);
      const scoreA = t.pScore !== undefined ? t.pScore : handScore(t.pCards);
      const scoreB = t.bScore !== undefined ? t.bScore : handScore(t.bCards);
      const side = scoreA > scoreB ? 'A' : scoreA < scoreB ? 'B' : null;
      return {
        side,
        lossAll: false,
        scoreA,
        scoreB,
        natural: !!t.natural,
        pCards: t.pCards,
        bCards: t.bCards,
      };
    },

    emptyPending() {
      return { cards: [], active: null };
    },

    confirmActive(p) {
      if (!p || !p.active || !p.active.rank) return null;
      const suit = p.active.suit || 'h';
      const card = p.active.rank + suit;
      const cards = p.cards.concat(card);
      const t = analyzeTableau(cards);
      if (t.complete || cards.length >= 6) {
        return { pending: this.emptyPending(), commit: { c: cards, order: 'alternating' } };
      }
      return { pending: { cards, active: null } };
    },

    input(p, key) {
      p = Object.assign({ active: null }, p, { cards: (p && p.cards) || [] });
      key = String(key).toLowerCase();

      // Quick entry
      if (key === 'wa' || key === 'wp' || key === 'p') {
        return { pending: this.emptyPending(), commit: { w: 'A' } };
      }
      if (key === 'wb' || key === 'b') {
        return { pending: this.emptyPending(), commit: { w: 'B' } };
      }
      if (key === 'wt' || key === 't') {
        return { pending: this.emptyPending(), commit: { w: 'T' } };
      }

      // Space / Enter / Tab: explicitly confirm current active card (defaults to Hearts)
      if (key === 'enter' || key === ' ' || key === 'space' || key === 'tab') {
        if (p.active && p.active.rank) {
          return this.confirmActive(p) || { pending: p };
        }
        // If at least 4 cards are already present and enter is pressed with no active rank, allow committing complete hand
        if (p.cards.length >= 4) {
          return { pending: this.emptyPending(), commit: { c: p.cards, order: 'alternating' } };
        }
        return { pending: p };
      }

      if (key.startsWith('r:')) key = key.slice(2);

      // Direct full card code, e.g. "as", "5d", "10h", "kc"
      const fullMatch = key.match(/^([2-9]|10|[jqka])([hscd])$/);
      if (fullMatch) {
        if (p.cards.length >= 6) return null;
        const r = RANK_KEYS[fullMatch[1]] || fullMatch[1].toUpperCase();
        const s = fullMatch[2];
        const card = r + s;
        const cards = p.cards.concat(card);
        const t = analyzeTableau(cards);
        if (t.complete || cards.length >= 6) {
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
          const cards = p.cards.concat(card);
          const t = analyzeTableau(cards);
          if (t.complete || cards.length >= 6) {
            return { pending: this.emptyPending(), commit: { c: cards, order: 'alternating' } };
          }
          return { pending: { cards, active: null } };
        }

        // Extra 0 while rank is 10 (e.g. user typed '1' then '0')
        if (key === '0' && p.active.rank === '10') {
          return { pending: p };
        }

        // If user typed another rank key (a, 2..9, 0, t, j, q, k):
        // Confirm previous card with Hearts, then start new rank
        if (RANK_KEYS[key]) {
          const prevCard = p.active.rank + (p.active.suit || 'h');
          const cards = p.cards.concat(prevCard);
          const t = analyzeTableau(cards);
          if (t.complete || cards.length >= 6) {
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

      // Normal rank key (a, 2..9, 0, t, j, q, k)
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

    pendingHTML(p) {
      p = p || { cards: [], active: null };
      const cards = p.cards || [];
      const currentDeal = cards.length;
      const t = analyzeTableau(cards);

      const isPDealing = !t.complete && (currentDeal < 4 ? currentDeal % 2 === 0 : t.nextDeal === 'P');
      const isBDealing = !t.complete && (currentDeal < 4 ? currentDeal % 2 === 1 : t.nextDeal === 'B');

      // Helper to render card slot
      const renderCard = (c, dealNum, isActive) => {
        if (c) {
          return `<div class="slot card filled ${suitCls(c)}"><span class="deal-num">#${dealNum}</span>${cardLabel(c)}</div>`;
        }
        if (isActive && p.active && p.active.rank) {
          return `<div class="slot card active rank-pending"><span class="deal-num">#${dealNum}</span><span class="active-rank">${p.active.rank}</span><span class="suit-hints"><span class="red">1♥</span> 2♠ 3♣ <span class="red">4♦</span></span></div>`;
        }
        return `<div class="slot card ${isActive ? 'active' : ''}"><span class="deal-num">#${dealNum}</span><small>${isActive ? 'deal' : ''}</small></div>`;
      };

      // Player cards:
      // Card 1 = Deal #1 (cards[0])
      // Card 2 = Deal #3 (cards[2])
      // Card 3 = Deal #5 (cards[4] if Player drew)
      const pCard1 = renderCard(cards[0], 1, currentDeal === 0);
      const pCard2 = renderCard(cards[2], 3, currentDeal === 2);
      let pCard3 = '';
      if (currentDeal < 4 || t.nextDeal === 'P' || t.pCards.length === 3) {
        const isP3Active = currentDeal >= 4 && isPDealing;
        const c3 = t.pCards.length === 3 ? t.pCards[2] : null;
        pCard3 = renderCard(c3, 5, isP3Active);
      }

      // Banker cards:
      // Card 1 = Deal #2 (cards[1])
      // Card 2 = Deal #4 (cards[3])
      // Card 3 = Deal #5 (if Player stood) or Deal #6 (if Player drew)
      const bCard1 = renderCard(cards[1], 2, currentDeal === 1);
      const bCard2 = renderCard(cards[3], 4, currentDeal === 3);
      let bCard3 = '';
      if (currentDeal < 4 || t.nextDeal === 'B' || t.bCards.length === 3) {
        const isB3Active = currentDeal >= 4 && isBDealing;
        const c3 = t.bCards.length === 3 ? t.bCards[2] : null;
        const dealNum = t.pCards.length === 3 ? 6 : 5;
        bCard3 = renderCard(c3, dealNum, isB3Active);
      }

      const pTurnBadge = isPDealing ? '<span class="deal-turn">DEALING</span>' : '';
      const bTurnBadge = isBDealing ? '<span class="deal-turn">DEALING</span>' : '';

      let pLive = '';
      if (cards.length >= 3 && cards[0] && cards[2]) {
        const score = handScore(t.pCards);
        pLive = `<span class="hand-type">${t.natural ? 'Natural ' : 'Score '}${score}</span>`;
      }

      let bLive = '';
      if (cards.length >= 4 && cards[1] && cards[3]) {
        const score = handScore(t.bCards);
        bLive = `<span class="hand-type">${t.natural ? 'Natural ' : 'Score '}${score}</span>`;
      }

      return `<div class="hands alternating">
        <div class="hand ${isPDealing ? 'dealing' : ''}">
          <label>Player · deals 1, 3${pCard3 ? ', 5' : ''} ${pTurnBadge} ${pLive}</label>
          <div class="slots">${pCard1}${pCard2}${pCard3}</div>
        </div>
        <div class="hand ${isBDealing ? 'dealing' : ''}">
          <label>Banker · deals 2, 4${bCard3 ? (t.pCards.length === 3 ? ', 6' : ', 5') : ''} ${bTurnBadge} ${bLive}</label>
          <div class="slots">${bCard1}${bCard2}${bCard3}</div>
        </div>
      </div>`;
    },

    padHTML() {
      const ranks = RANKS.map((r) => {
        const k = r === '10' ? '0' : r.toLowerCase();
        return `<button class="key rank" data-key="r:${k}">${r}${r === '10' ? '<span class="kbd">0</span>' : ''}</button>`;
      }).join('');
      const suits = [
        { k: '1', s: '♥', cls: 'red' },
        { k: '2', s: '♠', cls: '' },
        { k: '3', s: '♣', cls: '' },
        { k: '4', s: '♦', cls: 'red' },
      ].map((it) => `<button class="key suit ${it.cls}" data-key="${it.k}">${it.s}<span class="kbd">${it.k}</span></button>`).join('');

      return `<div class="pad card-pad">
        <div class="multitap-hint">Fast Entry: <b>[Rank]</b> then suit: <b>1=♥</b> · <b>2=♠</b> · <b>3=♣</b> · <b>4=♦</b> &nbsp;<small class="muted">(e.g. 92=9♠, 84=8♦, 01=10♥, A2=A♠ · or use Mic 🎙️)</small></div>
        <div class="ranks">${ranks}</div>
        <div class="suits">${suits}</div>
        <div class="quick"><span>Quick:</span>
          <button class="key qa" data-key="wa" title="Player won">Player won</button>
          <button class="key qt" data-key="wt" title="Tie">Tie</button>
          <button class="key qb" data-key="wb" title="Banker won">Banker won</button></div></div>`;
    },

    chip(raw, o) {
      const main = o.side === 'A' ? 'P' : o.side === 'B' ? 'B' : 'T';
      if (raw.w) return { main, sub: 'quick', flag: '' };
      const sub = `${o.scoreA ?? '–'}-${o.scoreB ?? '–'}`;
      const flag = o.natural ? 'N' : '';
      return { main, sub, flag };
    },

    extraStats(rows) {
      const scoreCounts = Array(10).fill(0);
      let carded = 0, pWins = 0, bWins = 0, ties = 0, naturals = 0;
      let curSide = null, curStreak = 0, maxStreak = 0, maxSide = null, sinceTie = 0, seenTie = false;

      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        if (r.side) {
          if (r.side === curSide) curStreak++;
          else { curSide = r.side; curStreak = 1; }
          if (curStreak > maxStreak) { maxStreak = curStreak; maxSide = curSide; }
        }
        if (r.side === 'A') pWins++;
        else if (r.side === 'B') bWins++;
        else ties++;

        if (!r.raw.w) {
          carded++;
          if (r.o.scoreA != null) scoreCounts[r.o.scoreA]++;
          if (r.o.scoreB != null) scoreCounts[r.o.scoreB]++;
          if (r.o.natural) naturals++;
        }
      }

      for (let i = rows.length - 1; i >= 0; i--) {
        if (rows[i].side == null) { seenTie = true; break; }
        sinceTie++;
      }

      const totalRounds = rows.length;
      const naturalPct = carded ? ((naturals / carded) * 100).toFixed(0) + '%' : '–';
      const streakTxt = curStreak ? `${this.sides[curSide].short}×${curStreak} <small>max ${maxSide ? this.sides[maxSide].short : ''}${maxStreak}</small>` : '–';
      const pPct = totalRounds ? ((pWins / totalRounds) * 100).toFixed(0) + '%' : '–';
      const bPct = totalRounds ? ((bWins / totalRounds) * 100).toFixed(0) + '%' : '–';
      const tPct = totalRounds ? ((ties / totalRounds) * 100).toFixed(0) + '%' : '–';

      const markers = `<div class="game-markers">
        <div class="marker"><label>Streak</label><b>${streakTxt}</b></div>
        <div class="marker"><label>Tie Gap</label><b>${sinceTie}h <small>${seenTie ? 'since tie' : 'no ties'}</small></b></div>
        <div class="marker"><label>Player</label><b>${pWins} <small>${pPct}</small></b></div>
        <div class="marker"><label>Banker</label><b>${bWins} <small>${bPct}</small></b></div>
        <div class="marker"><label>Tie</label><b>${ties} <small>${tPct}</small></b></div>
        <div class="marker"><label>Natural</label><b>${naturals} <small>${naturalPct}</small></b></div>
      </div>`;

      const maxScore = Math.max(1, ...scoreCounts);
      const totalScores = carded * 2;
      let bars = '';
      for (let s = 9; s >= 0; s--) {
        const pct = totalScores ? ((scoreCounts[s] / totalScores) * 100).toFixed(1) : '0.0';
        bars += `<div class="hbar"><span>Score ${s}</span><div class="track"><div class="fill" style="width:${(scoreCounts[s] / maxScore) * 100}%"></div></div><em>${scoreCounts[s]} · ${pct}%</em></div>`;
      }

      return `${markers}<h4>Score distribution (${carded} carded hands)</h4>${bars}`;
    },
  };

  function cardLabel(c) { return c.slice(0, -1) + (SUITS[c.slice(-1)] || ''); }
  function suitCls(c) { return 'hd'.includes(c.slice(-1)) ? 'red' : ''; }

  if (typeof module !== 'undefined' && module.exports) module.exports = Baccarat;
  else (root.Games = root.Games || {}).baccarat = Baccarat;
})(this);
