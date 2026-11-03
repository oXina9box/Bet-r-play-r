const assert = require('node:assert/strict');
const { createRoundClock, createTracker } = require('../js/capture');
const game = require('../js/games/sicbo');
const pc = 1793721600000;
const result = { raw: [6, 4, 6], result: { side: 'A', total: 16 }, resultText: 'BIG 16', confidence: 94, wager: { status: 'unknown' } };

const clock = createRoundClock({ now: pc });
assert.equal(clock.read(false, pc), String(pc));
assert.equal(clock.read(false, pc + 50000), String(pc), 'first betting period cannot keep generating IDs');
assert.equal(clock.read(true, pc + 51000), String(pc));
assert.equal(clock.read(true, pc + 53000), String(pc), 'completed result keeps stable PC ID across frames');
assert.equal(clock.read(false, pc + 54000), String(pc));
assert.equal(clock.read(false, pc + 55499), String(pc), 'absence must last at least1500ms');
assert.equal(clock.read(false, pc + 55500), String(pc + 55500));
assert.equal(clock.read(false, pc + 90000), String(pc + 55500), 'same betting period rotates only once');
assert.equal(clock.read(true, pc + 91000), String(pc + 55500));

// Identical consecutive outcomes still record after an observed betting phase.
const tracker = createTracker(), consecutive = createRoundClock({ now: pc });
const first = { ...result, round: consecutive.read(true, pc) };
assert.equal(tracker.read(first, { game, entries: [], now: pc }).status, 'pending');
const saved = tracker.read(first, { game, entries: [], now: pc + 1600 }).entry;
consecutive.read(false, pc + 2000);
const second = { ...result, round: consecutive.read(false, pc + 3600) };
assert.notEqual(second.round, first.round);
assert.equal(tracker.read(second, { game, entries: [saved], now: pc + 3600 }).status, 'pending');
assert.equal(tracker.read(second, { game, entries: [saved], now: pc + 5200 }).status, 'ready');

const entries = [
  { screen: { round: '1881576828', capturedAt: pc - 2000 } },
  { screen: { round: '1881576929', capturedAt: pc - 500 } },
  { t: pc - 100 },
];
const before = JSON.stringify(entries);
const resumed = createRoundClock({ entries, now: pc });
assert.equal(resumed.read(true, pc), '1881576929', 'recent restart reuses latest stored legacy round');
assert.equal(resumed.read(true, pc + 10000), '1881576929');
assert.equal(createTracker().read({ ...result, round: resumed.read(true, pc + 11000) }, { game, entries, now: pc + 11000 }).status, 'duplicate');
resumed.read(false, pc + 12000);
assert.equal(resumed.read(false, pc + 13500), String(pc + 13500), 'new phase switches legacy ID to PC timestamp');
assert.equal(JSON.stringify(entries), before, 'stored entries remain immutable');
assert.equal(createRoundClock({ entries: [{ screen: { round: '1881576828', capturedAt: pc - 120000 } }], now: pc }).read(true, pc), '1881576828', 'recent window includes120s boundary');
assert.equal(createRoundClock({ entries: [{ screen: { round: '1881576828', capturedAt: pc - 120001 } }], now: pc }).read(true, pc), String(pc), 'old result cannot seed current identity');
assert.equal(createRoundClock({ entries: [{ screen: { round: '1881576828', capturedAt: pc + 1000 } }], now: pc }).read(true, pc), String(pc), 'future import is not a recent observed result');
assert.equal(createRoundClock({ entries: [{ screen: { round: 'bad', capturedAt: pc - 10 } }], now: pc }).read(true, pc), String(pc));

const unclear = createRoundClock({ now: pc });
unclear.read(true, pc);
unclear.read(false, pc + 100);
assert.equal(unclear.read(null, pc + 1600), String(pc));
assert.equal(unclear.read(false, pc + 1700), String(pc), 'unclear frame resets absence duration');
assert.equal(unclear.read(undefined, pc + 3300), String(pc));
assert.equal(unclear.read(false, pc + 3400), String(pc));
assert.equal(unclear.read(false, pc + 4900), String(pc + 4900));

const flicker = createRoundClock({ now: pc });
flicker.read(true, pc);
flicker.read(false, pc + 100);
assert.equal(flicker.read(true, pc + 1600), String(pc), 'returning banner cancels pending transition');
assert.equal(flicker.read(false, pc + 1700), String(pc));
assert.equal(flicker.read(false, pc + 3200), String(pc + 3200));

const backwards = createRoundClock({ now: pc });
backwards.read(true, pc);
backwards.read(false, pc + 100);
assert.equal(backwards.read(false, pc + 1600), String(pc + 1600));
backwards.read(true, pc + 1700);
backwards.read(false, pc - 2000);
assert.equal(backwards.read(false, pc - 500), String(pc + 1601), 'generated IDs remain monotonic if PC clock moves backward');
const hugeLegacy = createRoundClock({ entries: [{ screen: { round: '99999999999999', capturedAt: pc - 10 } }], now: pc });
hugeLegacy.read(false, pc + 100);
assert.equal(hugeLegacy.read(false, pc + 1600), String(pc + 1600), 'legacy casino IDs never control timestamp monotonicity');

const interruptedClock = createRoundClock({ now: pc });
interruptedClock.read(true, pc);
interruptedClock.read(false, pc + 2000);
interruptedClock.read(false, pc + 1000);
assert.equal(interruptedClock.read(false, pc + 2499), String(pc), 'clock rollback restarts absence duration');
assert.equal(interruptedClock.read(false, pc + 2500), String(pc + 2500));
assert.throws(() => createRoundClock({ entries: {}, now: pc }), TypeError);
assert.throws(() => createRoundClock({ now: NaN }), RangeError);
assert.throws(() => interruptedClock.read(true, Infinity), RangeError);
assert.match(createRoundClock().read(true), /^\d{13}$/, 'default clock uses local PC milliseconds');

console.log('Local PC round clock, phase transitions and restart deduplication passed.');
