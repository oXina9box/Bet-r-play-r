// Run: node test/voice.test.js
const assert = require('node:assert/strict');
const TP = require('../js/games/teenpatti.js');
const Voice = require('../js/voice.js');

// 1. Spoken card parser unit tests
console.log('Testing Voice Parser...');
assert.deepStrictEqual(Voice.parseSpeech('ace of spades').cards, ['As']);
assert.deepStrictEqual(Voice.parseSpeech('king of hearts').cards, ['Kh']);
assert.deepStrictEqual(Voice.parseSpeech('queen of clubs').cards, ['Qc']);
assert.deepStrictEqual(Voice.parseSpeech('jack of diamonds').cards, ['Jd']);
assert.deepStrictEqual(Voice.parseSpeech('ten of spades').cards, ['10s']);
assert.deepStrictEqual(Voice.parseSpeech('nine of hearts').cards, ['9h']);
assert.deepStrictEqual(Voice.parseSpeech('eight of clubs').cards, ['8c']);
assert.deepStrictEqual(Voice.parseSpeech('seven of diamonds').cards, ['7d']);
assert.deepStrictEqual(Voice.parseSpeech('six of spades').cards, ['6s']);
assert.deepStrictEqual(Voice.parseSpeech('five of hearts').cards, ['5h']);
assert.deepStrictEqual(Voice.parseSpeech('four of clubs').cards, ['4c']);
assert.deepStrictEqual(Voice.parseSpeech('three of diamonds').cards, ['3d']);
assert.deepStrictEqual(Voice.parseSpeech('two of spades').cards, ['2s']);

// Short form (without "of")
assert.deepStrictEqual(Voice.parseSpeech('ace spades').cards, ['As']);
assert.deepStrictEqual(Voice.parseSpeech('king hearts').cards, ['Kh']);
assert.deepStrictEqual(Voice.parseSpeech('five diamonds').cards, ['5d']);
assert.deepStrictEqual(Voice.parseSpeech('10 clubs').cards, ['10c']);

// Aliases
assert.deepStrictEqual(Voice.parseSpeech('deuce spades').cards, ['2s']);
assert.deepStrictEqual(Voice.parseSpeech('trey diamonds').cards, ['3d']);

// Spoken keypad keys (rank + suit number)
assert.deepStrictEqual(Voice.parseSpeech('ace 1').cards, ['Ah']);
assert.deepStrictEqual(Voice.parseSpeech('ace 2').cards, ['As']);
assert.deepStrictEqual(Voice.parseSpeech('ace 3').cards, ['Ac']);
assert.deepStrictEqual(Voice.parseSpeech('ace 4').cards, ['Ad']);
assert.deepStrictEqual(Voice.parseSpeech('5 4').cards, ['5d']);
assert.deepStrictEqual(Voice.parseSpeech('2 2').cards, ['2s']);

// Multi-card utterances in one breath
const multi = Voice.parseSpeech('ace of spades, king of hearts, five of diamonds, jack of clubs, ten of spades, two of hearts');
assert.deepStrictEqual(multi.cards, ['As', 'Kh', '5d', 'Jc', '10s', '2h']);

// Voice commands
assert.deepStrictEqual(Voice.parseSpeech('undo').commands, ['undo']);
assert.deepStrictEqual(Voice.parseSpeech('go back').commands, ['undo']);
assert.deepStrictEqual(Voice.parseSpeech('clear').commands, ['clear']);
assert.deepStrictEqual(Voice.parseSpeech('cancel').commands, ['clear']);
assert.deepStrictEqual(Voice.parseSpeech('new session').commands, ['newSession']);
assert.deepStrictEqual(Voice.parseSpeech('p1 won').commands, ['wa']);
assert.deepStrictEqual(Voice.parseSpeech('player 1 won').commands, ['wa']);
assert.deepStrictEqual(Voice.parseSpeech('p2 won').commands, ['wb']);
assert.deepStrictEqual(Voice.parseSpeech('player 2 won').commands, ['wb']);
assert.deepStrictEqual(Voice.parseSpeech('tie').commands, ['wt']);

// Dice games
assert.deepStrictEqual(Voice.parseSpeech('four five six', 'sicbo').dice, [4, 5, 6]);
assert.deepStrictEqual(Voice.parseSpeech('triple three', 'sicbo').dice, [3, 3, 3]);
assert.deepStrictEqual(Voice.parseSpeech('three six', 'kickoff').dice, [3, 6]);

// 2. Fast Keypad Card Entry (Rank then 1..4)
console.log('Testing Fast Keypad Entry (Rank + 1..4)...');
let p = TP.emptyPending();

// Deal 1: Player 1 -> A2 (A♠)
p = TP.input(p, 'a').pending;
assert.strictEqual(p.active.rank, 'A');
p = TP.input(p, '2').pending; // '2' = Spades
assert.deepStrictEqual(p.cards, ['As']);
assert.strictEqual(p.active, null);

// Deal 2: Player 2 -> 54 (5♦)
p = TP.input(p, '5').pending;
p = TP.input(p, '4').pending; // '4' = Diamonds
assert.deepStrictEqual(p.cards, ['As', '5d']);

// Deal 3: Player 1 -> K1 (K♥)
p = TP.input(p, 'k').pending;
p = TP.input(p, '1').pending; // '1' = Hearts
assert.deepStrictEqual(p.cards, ['As', '5d', 'Kh']);

// Deal 4: Player 2 -> Q3 (Q♣)
p = TP.input(p, 'q').pending;
p = TP.input(p, '3').pending; // '3' = Clubs
assert.deepStrictEqual(p.cards, ['As', '5d', 'Kh', 'Qc']);

// Deal 5: Player 1 -> 02 (10♠)
p = TP.input(p, '0').pending;
p = TP.input(p, '2').pending; // '2' = Spades
assert.deepStrictEqual(p.cards, ['As', '5d', 'Kh', 'Qc', '10s']);

// Deal 6: Player 2 -> 21 (2♥) - commits!
p = TP.input(p, '2').pending;
const res = TP.input(p, '1'); // '1' = Hearts
assert.strictEqual(res.commit.order, 'alternating');
assert.deepStrictEqual(res.commit.c, ['As', '5d', 'Kh', 'Qc', '10s', '2h']);
assert.deepStrictEqual(res.pending, { cards: [], active: null });

// Verify alternating deal outcome evaluation:
// P1 has Deals 1, 3, 5: As, Kh, 10s (High Card A, K, 10)
// P2 has Deals 2, 4, 6: 5d, Qc, 2h (High Card Q, 5, 2)
// Winner: Player 1 ('A')
const outcome = TP.outcome(res.commit);
assert.strictEqual(outcome.side, 'A');

// Duplicate rejection test
let p2 = TP.emptyPending();
p2 = TP.input(p2, 'a').pending;
p2 = TP.input(p2, '2').pending; // As dealt
assert.deepStrictEqual(p2.cards, ['As']);

// Try to deal As again
const dupStart = TP.input(p2, 'a').pending;
const dupEnd = TP.input(dupStart, '2');
assert.strictEqual(dupEnd.error, 'A♠ already dealt');
assert.deepStrictEqual(dupEnd.pending, { cards: ['As'], active: null });

console.log('All Voice and Fast Keypad tests passed!');
