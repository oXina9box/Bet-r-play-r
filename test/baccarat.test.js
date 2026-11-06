const test = require('node:test');
const assert = require('node:assert/strict');
const Baccarat = require('../js/games/baccarat');

test('Baccarat card values', () => {
  assert.equal(Baccarat.cardValue('Ah'), 1);
  assert.equal(Baccarat.cardValue('as'), 1);
  assert.equal(Baccarat.cardValue('2d'), 2);
  assert.equal(Baccarat.cardValue('9c'), 9);
  assert.equal(Baccarat.cardValue('10h'), 0);
  assert.equal(Baccarat.cardValue('Js'), 0);
  assert.equal(Baccarat.cardValue('Qd'), 0);
  assert.equal(Baccarat.cardValue('Kc'), 0);
  assert.equal(Baccarat.cardValue(null), 0);
});

test('Baccarat hand scores', () => {
  assert.equal(Baccarat.handScore(['9h', '7s']), 6); // 16 -> 6
  assert.equal(Baccarat.handScore(['8h', 'Ah']), 9); // 9
  assert.equal(Baccarat.handScore(['10c', 'Ks', 'Qd']), 0); // 0
  assert.equal(Baccarat.handScore([]), 0);
});

test('Baccarat tableau - Natural 8 or 9 ends after 4 cards', () => {
  // Deal 1: P (9h), Deal 2: B (7s), Deal 3: P (10d), Deal 4: B (8c)
  // Player: 9h + 10d = 9 (Natural 9). Banker: 7s + 8c = 5.
  const cards = ['9h', '7s', '10d', '8c'];
  const t = Baccarat.analyzeTableau(cards);
  assert.equal(t.complete, true);
  assert.equal(t.natural, true);
  assert.equal(t.pScore, 9);
  assert.equal(t.bScore, 5);
  assert.equal(t.nextDeal, null);

  const out = Baccarat.outcome({ c: cards });
  assert.equal(out.side, 'A');
  assert.equal(out.scoreA, 9);
  assert.equal(out.scoreB, 5);
  assert.equal(out.natural, true);
});

test('Baccarat tableau - Player stands on 6 or 7; Banker draws on 0-5', () => {
  // Player: 3h + 4s = 7. Banker: 2d + 3c = 5.
  // Neither has 8 or 9. Player stands on 7.
  // Banker has 5 -> Banker draws Card 5!
  const cards4 = ['3h', '2d', '4s', '3c'];
  const t4 = Baccarat.analyzeTableau(cards4);
  assert.equal(t4.complete, false);
  assert.equal(t4.natural, false);
  assert.equal(t4.nextDeal, 'B'); // Next deal is for Banker

  // Deal card 5 to Banker: 4h (value 4). Banker total = 5 + 4 = 9.
  const cards5 = ['3h', '2d', '4s', '3c', '4h'];
  const t5 = Baccarat.analyzeTableau(cards5);
  assert.equal(t5.complete, true);
  assert.equal(t5.bScore, 9);
  assert.equal(t5.pScore, 7);

  const out = Baccarat.outcome({ c: cards5 });
  assert.equal(out.side, 'B');
  assert.equal(out.scoreA, 7);
  assert.equal(out.scoreB, 9);
  assert.equal(out.natural, false);
});

test('Baccarat tableau - Banker stands when Player 3rd card is 8 and Banker has 3', () => {
  // Player: 2h + As = 3. Banker: 3c + 10d = 3.
  // Player draws on 3. Card 5 is dealt to Player: 8s.
  // Player total = 2 + 1 + 8 = 11 -> 1.
  // Banker has 3. Player 3rd card was 8 -> Banker STANDS on 8!
  const cards5 = ['2h', '3c', 'As', '10d', '8s'];
  const t = Baccarat.analyzeTableau(cards5);
  assert.equal(t.complete, true);
  assert.equal(t.pScore, 1);
  assert.equal(t.bScore, 3);
  assert.equal(t.bCards.length, 2);
  assert.equal(t.pCards.length, 3);

  const out = Baccarat.outcome({ c: cards5 });
  assert.equal(out.side, 'B');
  assert.equal(out.scoreA, 1);
  assert.equal(out.scoreB, 3);
});

test('Baccarat tableau - Both draw 3rd card (6 cards total)', () => {
  // Player: 2h + As = 3. Banker: 2c + 2d = 4.
  // Player draws Card 5: 5s (value 5). Player total = 8.
  // Banker has 4. Player 3rd card was 5 (2..7) -> Banker draws Card 6!
  const cards5 = ['2h', '2c', 'As', '2d', '5s'];
  const t5 = Baccarat.analyzeTableau(cards5);
  assert.equal(t5.complete, false);
  assert.equal(t5.nextDeal, 'B');

  // Banker draws 4c. Banker total = 4 + 4 = 8. Tie!
  const cards6 = ['2h', '2c', 'As', '2d', '5s', '4c'];
  const t6 = Baccarat.analyzeTableau(cards6);
  assert.equal(t6.complete, true);
  assert.equal(t6.pScore, 8);
  assert.equal(t6.bScore, 8);

  const out = Baccarat.outcome({ c: cards6 });
  assert.equal(out.side, null); // Tie
  assert.equal(out.scoreA, 8);
  assert.equal(out.scoreB, 8);
});

test('Baccarat quick entry inputs', () => {
  const p = Baccarat.emptyPending();
  assert.deepEqual(Baccarat.input(p, 'wa'), { pending: { cards: [], active: null }, commit: { w: 'A' } });
  assert.deepEqual(Baccarat.input(p, 'wp'), { pending: { cards: [], active: null }, commit: { w: 'A' } });
  assert.deepEqual(Baccarat.input(p, 'p'), { pending: { cards: [], active: null }, commit: { w: 'A' } });

  assert.deepEqual(Baccarat.input(p, 'wb'), { pending: { cards: [], active: null }, commit: { w: 'B' } });
  assert.deepEqual(Baccarat.input(p, 'b'), { pending: { cards: [], active: null }, commit: { w: 'B' } });

  assert.deepEqual(Baccarat.input(p, 'wt'), { pending: { cards: [], active: null }, commit: { w: 'T' } });
  assert.deepEqual(Baccarat.input(p, 't'), { pending: { cards: [], active: null }, commit: { w: 'T' } });
});

test('Baccarat fast keypad card entry and auto-commit', () => {
  let p = Baccarat.emptyPending();

  // Deal 1: 9♠ (rank 9, suit 2)
  p = Baccarat.input(p, '9').pending;
  assert.deepEqual(p.active, { rank: '9' });
  p = Baccarat.input(p, '2').pending;
  assert.deepEqual(p.cards, ['9s']);

  // Deal 2: 7♥ (rank 7, suit 1)
  p = Baccarat.input(p, '7').pending;
  p = Baccarat.input(p, '1').pending;
  assert.deepEqual(p.cards, ['9s', '7h']);

  // Deal 3: 10♦ ('1' then '0' or '0', then '4')
  p = Baccarat.input(p, '1').pending;
  p = Baccarat.input(p, '0').pending;
  assert.equal(p.active.rank, '10');
  p = Baccarat.input(p, '4').pending;
  assert.deepEqual(p.cards, ['9s', '7h', '10d']);

  // Deal 4: 8♣ ('8', then '3') -> Natural 9 for Player! Hand auto-commits!
  const res = Baccarat.input(p, '8');
  assert.deepEqual(res.pending.active, { rank: '8' });
  const finalRes = Baccarat.input(res.pending, '3');
  assert.deepEqual(finalRes.pending, { cards: [], active: null });
  assert.deepEqual(finalRes.commit, { c: ['9s', '7h', '10d', '8c'], order: 'alternating' });
});

test('Baccarat undoInput', () => {
  let p = Baccarat.emptyPending();
  p = Baccarat.input(p, '9').pending;
  assert.equal(p.active.rank, '9');
  p = Baccarat.undoInput(p);
  assert.equal(p.active, null);

  p = Baccarat.input(p, '9s').pending;
  assert.deepEqual(p.cards, ['9s']);
  p = Baccarat.undoInput(p);
  assert.deepEqual(p.cards, []);
});

test('Baccarat chip rendering and extraStats', () => {
  const chipP = Baccarat.chip({ c: ['9s', '7h', '10d', '8c'] }, { side: 'A', scoreA: 9, scoreB: 5, natural: true });
  assert.equal(chipP.main, 'P');
  assert.equal(chipP.sub, '9-5');
  assert.equal(chipP.flag, 'N');

  const chipQuick = Baccarat.chip({ w: 'B' }, { side: 'B' });
  assert.equal(chipQuick.main, 'B');
  assert.equal(chipQuick.sub, 'quick');

  const rows = [
    { side: 'A', raw: { c: ['9s', '7h', '10d', '8c'] }, o: { scoreA: 9, scoreB: 5, natural: true } },
    { side: 'B', raw: { c: ['3h', '2d', '4s', '3c', '4h'] }, o: { scoreA: 7, scoreB: 9, natural: false } },
    { side: null, raw: { w: 'T' }, o: { scoreA: null, scoreB: null, natural: false } }
  ];
  const statsHTML = Baccarat.extraStats(rows);
  assert.match(statsHTML, /Player/);
  assert.match(statsHTML, /Banker/);
  assert.match(statsHTML, /Tie Gap/);
  assert.match(statsHTML, /Natural/);
  assert.match(statsHTML, /Score distribution/);
});
