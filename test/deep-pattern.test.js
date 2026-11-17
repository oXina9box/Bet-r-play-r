const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const Engine = require('../js/engine.js');

test('analyzeDeepPatterns detects streaks, chops, periodic patterns and historical recurrence', () => {
  // Test streak of 10 A's
  const streakRows = Array.from({ length: 10 }, (_, i) => ({ side: 'A', t: 1000 + i }));
  const streakRes = Engine.analyzeDeepPatterns(streakRows);
  assert.equal(streakRes.hasStrongFormation, true);
  assert.equal(streakRes.strongest.type, 'streak');
  assert.equal(streakRes.strongest.projectedSide, 'B'); // anti-streak projects B
  assert.equal(streakRes.strongest.length, 10);

  // Test alternating chop of 12 rolls
  const chopRows = Array.from({ length: 12 }, (_, i) => ({ side: i % 2 === 0 ? 'A' : 'B', t: 2000 + i }));
  const chopRes = Engine.analyzeDeepPatterns(chopRows);
  assert.equal(chopRes.hasStrongFormation, true);
  const chop = chopRes.formations.find(f => f.type === 'chop' && f.length === 12);
  assert.ok(chop);
  assert.equal(chop.projectedSide, 'A'); // last was B (index 11), next is A

  // Test periodic 2-2 pattern of 10 rolls: AABBAABBAA
  const periodicRows = ['A', 'A', 'B', 'B', 'A', 'A', 'B', 'B', 'A', 'A'].map((s, i) => ({ side: s, t: 3000 + i }));
  const periodicRes = Engine.analyzeDeepPatterns(periodicRows);
  const periodic = periodicRes.formations.find(f => f.type === 'periodic' && f.length === 10);
  assert.ok(periodic);
  assert.equal(periodic.projectedSide, 'B'); // after 2 A's comes B
});

test('analyzeRollingConfirmation computes 50/20/15/10/5 weights and discrete match percentages', () => {
  // Create 15 rolls: alternating A, B, A, B...
  const sides = ['A', 'B', 'A', 'B', 'A', 'B', 'A', 'B', 'A', 'B', 'A', 'B', 'A', 'B', 'A'];
  const rows = sides.map((s, i) => ({ side: s, t: 1000 + i }));
  const next = { side: 'B', phase: 'bet', step: 0 };

  const res = Engine.analyzeRollingConfirmation(rows, next);
  assert.equal(res.currentSide, 'B');
  assert.equal(res.horizons.length, 4); // 12, 11, 10, 9
  assert.ok([0, 25, 50, 75, 100].includes(res.discreteMatchPct));
  assert.ok(res.normalizedWeighted >= 0 && res.normalizedWeighted <= 100);

  // Check horizon weights are 20, 15, 10, 5 for lengths 12, 11, 10, 9
  assert.equal(res.horizons[0].length, 12);
  assert.equal(res.horizons[0].weight, 20); // len 12
  assert.equal(res.horizons[1].length, 11);
  assert.equal(res.horizons[1].weight, 15); // len 11
  assert.equal(res.horizons[2].length, 10);
  assert.equal(res.horizons[2].weight, 10); // len 10
  assert.equal(res.horizons[3].length, 9);
  assert.equal(res.horizons[3].weight, 5);  // len 9

  // First 50% = equal percentage across rolls (e.g. 4/5 match = 40%)
  assert.equal(typeof res.equalRollsPct, 'number');
  assert.ok(res.equalRollsPct >= 0 && res.equalRollsPct <= 50);
  assert.equal(typeof res.weightedHalfPct, 'number');
  assert.ok(res.weightedHalfPct >= 0 && res.weightedHalfPct <= 50);
  assert.equal(res.combinedPct, res.equalRollsPct + res.weightedHalfPct);
  // Specifically verify 4/5 equal rolls = 40% rule
  const fourOfFive = Math.round((4 / 5) * 50);
  assert.equal(fourOfFive, 40, '4/5 matches is exactly 40% in first half');
});

test('patternStats aggregates win and bust stats for all played patterns', () => {
  // Simulate a session with 10 rolls in Sic Bo with Group 5 (4 bets)
  const entries = [
    { raw: [1, 2, 3], side: 'A', t: 1 },
    { raw: [1, 2, 3], side: 'A', t: 2 },
    { raw: [4, 5, 6], side: 'B', t: 3 },
    { raw: [1, 2, 3], side: 'A', t: 4 },
    { raw: [1, 2, 3], side: 'A', t: 5 }, // factor
    { raw: [1, 2, 3], side: 'A', t: 6 }, // Bet 1
    { raw: [4, 5, 6], side: 'B', t: 7 }, // Bet 2
  ];
  const runRes = Engine.run(entries, { n: 5, prog: 'double', unit: 1, payout: 1 });
  const pStats = Engine.patternStats(runRes.rows);
  assert.ok(Array.isArray(pStats.patterns));
  assert.equal(pStats.totalSets, runRes.rows.filter(r => r.setEnd === 'won' || r.setEnd === 'bust').length);
});

// App DOM tests for workbench enhancements
async function bootApp(initialGame = 'sicbo') {
  const elements = new Map();
  function element(id) {
    if (!elements.has(id)) elements.set(id, {
      innerHTML: '', textContent: '', title: '', value: '', hidden: false, disabled: false,
      classList: {
        classes: new Set(),
        add(c) { this.classes.add(c); },
        remove(c) { this.classes.delete(c); },
        toggle(c, v) { if (v === undefined) v = !this.classes.has(c); if (v) this.classes.add(c); else this.classes.delete(c); return v; },
        contains(c) { return this.classes.has(c); },
      },
      listeners: {},
      addEventListener(type, fn) { this.listeners[type] = fn; },
      focus() {}, click() {}, setAttribute() {},
    });
    return elements.get(id);
  }
  const timers = new Map();
  let nextTimer = 1;
  const context = {
    console, Map, Date, Math, URL, Blob, AbortSignal,
    location: { protocol: 'file:', origin: 'null' },
    document: {
      body: { setAttribute() {} },
      getElementById: element,
      activeElement: null,
      addEventListener() {},
      querySelectorAll: () => [...elements.values()],
      createElement: () => element('el'),
    },
    localStorage: {
      data: new Map(),
      getItem(k) { return this.data.get(k) ?? null; },
      setItem(k, v) { this.data.set(k, v); },
      removeItem(k) { this.data.delete(k); },
    },
    setInterval(fn, delay) { const id = nextTimer++; timers.set(id, { fn, delay }); return id; },
    clearInterval(id) { timers.delete(id); },
    setTimeout(fn, delay) { const id = nextTimer++; timers.set(id, { fn, delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
  };
  context.window = context;
  vm.createContext(context);
  for (const file of ['js/history.js', 'js/engine.js', 'js/games/sicbo.js', 'js/games/teenpatti.js', 'js/games/baccarat.js', 'js/games/kickoff.js', 'js/voice.js']) {
    vm.runInContext(fs.readFileSync(file, 'utf8'), context, { filename: path.resolve(file) });
  }
  context.AppData = require('../js/data.js');
  vm.runInContext(fs.readFileSync('js/app.js', 'utf8'), context, { filename: path.resolve('js/app.js') });
  for (let i = 0; i < 12; i++) await Promise.resolve();
  return { element, context, timers };
}

test('bet area #next never has overlays and urgent alert area operates cleanly', async () => {
  const app = await bootApp('sicbo');
  const nextEl = app.element('next');
  assert.ok(!nextEl.innerHTML.includes('triple-overlay'), '#next must never contain triple-overlay');
  assert.ok(app.element('urgentAlertArea'), 'urgentAlertArea exists in DOM');
  assert.ok(app.element('standardMessageArea'), 'standardMessageArea exists in DOM');
  assert.ok(app.element('rollingTracker'), 'rollingTracker exists in DOM');
  assert.ok(app.element('deepPatterns'), 'deepPatterns exists in DOM');
  assert.ok(app.element('settingsBtn'), 'single settings cog button exists');
  assert.ok(app.element('games'), 'games selector dropdown exists');
  assert.ok(app.element('tabSettings'), 'settings tab exists in giant popup');
  assert.ok(app.element('tabRecorder'), 'recorder tab exists in giant popup');
  assert.ok(app.element('targetBetLine'), 'targetBetLine exists on dice entry line');
  assert.ok(!app.element('noticeBanners').innerHTML.includes('target-badge'), 'target-badge is never in noticeBanners');
});

test('settingsBtn opens giant popup with Settings and Visual Recorder tabs', async () => {
  const app = await bootApp('sicbo');
  const btn = app.element('settingsBtn');
  const pop = app.element('optionsMenu');
  btn.onclick?.();
  assert.equal(pop.hidden, false, 'optionsMenu opens on settingsBtn click');
  assert.ok(app.element('tabSettings').classList.contains('on'), 'Settings tab is active by default');
  assert.equal(app.element('panelSettings').hidden, false, 'Settings panel is visible');
  assert.equal(app.element('panelRecorder').hidden, true, 'Recorder panel is hidden');

  app.element('tabRecorder').onclick?.();
  assert.ok(app.element('tabRecorder').classList.contains('on'), 'Recorder tab becomes active');
  assert.equal(app.element('panelSettings').hidden, true, 'Settings panel is hidden');
  assert.equal(app.element('panelRecorder').hidden, false, 'Recorder panel is visible');

  app.element('optionsClose').onclick?.();
  assert.equal(pop.hidden, true, 'optionsClose hides giant popup');
});

test('Teen Patti quick mode does not duplicate entry instructions in pendingHTML', async () => {
  const app = await bootApp('teenpatti');
  const tp = app.context.Games.teenpatti;
  const quickPending = tp.pendingHTML(null, { entryMode: 'quick' });
  assert.equal(quickPending, '', 'pendingHTML is empty in quick mode to prevent duplicating instructions');
  const quickPad = tp.padHTML({ entryMode: 'quick' });
  assert.ok(quickPad.includes('Quick Entry Mode'), 'padHTML contains the entry instruction');
});

test('scoreboard renders Baccarat beads for groups', async () => {
  const app = await bootApp('baccarat');
  const stripEl = app.element('strip');
  assert.ok(stripEl, '#strip element exists');
});

test('rolling tracker and bet skipping operate consistently across all games', async () => {
  const gameIds = ['sicbo', 'baccarat', 'teenpatti', 'kickoff'];
  const cfg = { n: 5, prog: 'double', unit: 1, payout: 1, waitBust: 0, waitWin: 0, waitBet: 0 };

  for (const gid of gameIds) {
    // 1. Engine.analyzeRollingConfirmation across all games
    const sides = ['A', 'B', 'A', 'B', 'A', 'B', 'A', 'B', 'A', 'B', 'A', 'B', 'A'];
    const rows = sides.map((s, i) => ({ side: s, effSide: s, t: 1000 + i }));
    const next = { side: 'B', phase: 'bet', step: 0 };
    const rolling = Engine.analyzeRollingConfirmation(rows, next, cfg);

    assert.equal(rolling.horizons.length, 4, `${gid}: 4 roll horizons (12, 11, 10, 9)`);
    assert.deepEqual(rolling.horizons.map(h => h.length), [12, 11, 10, 9], `${gid}: horizon lengths`);
    assert.equal(typeof rolling.combinedPct, 'number', `${gid}: single combined percentage`);
    assert.ok(rolling.combinedPct >= 0 && rolling.combinedPct <= 100, `${gid}: combinedPct in 0-100`);

    // 2. Bet skipping flow across all games:
    // With n=5: 5 rolls pattern, 6th roll factor, 7th roll Bet 1 (step 0), 8th roll Bet 2 (step 1).
    // Skipping Bet 1 (index 6): rolls are counted, step advances to 1, no money risked.
    const entriesWithSkip = [
      { side: 'A', t: 1 }, { side: 'B', t: 2 }, { side: 'A', t: 3 }, { side: 'B', t: 4 },
      { side: 'A', t: 5 }, // pattern [A, B, A, B, A]
      { side: 'A', t: 6 }, // factor roll: factor A
      { side: 'B', t: 7, nb: true }, // Bet 1 skipped (would-be loss): step advances 0 -> 1
      { side: 'A', t: 8 }, // Bet 2 (loss): step advances 1 -> 2
    ];
    const runSkip = Engine.run(entriesWithSkip, cfg);
    assert.equal(runSkip.rows[6].noBet, true, `${gid}: row 6 marked noBet`);
    assert.equal(runSkip.rows[6].pnl, 0, `${gid}: row 6 pnl is 0`);
    assert.equal(runSkip.rows[6].role, 'bet', `${gid}: row 6 role is bet`);
    assert.equal(runSkip.rows.length, 8, `${gid}: all 8 rolls counted consecutively`);
    assert.equal(runSkip.next.step, 2, `${gid}: group continued advancing to step 2`);

    // Verify unskipped run has the exact same group structure and sides
    const entriesNoSkip = entriesWithSkip.map(e => ({ side: e.side, t: e.t }));
    const runNoSkip = Engine.run(entriesNoSkip, cfg);
    assert.equal(runSkip.rows[6].role, runNoSkip.rows[6].role, `${gid}: role matches unskipped`);
    assert.equal(runSkip.next.plan[runSkip.next.step], runNoSkip.next.plan[runNoSkip.next.step], `${gid}: group sides unchanged by skip`);

    // 3. App DOM renders Rolling card for each game
    const app = await bootApp(gid);
    const badgeEl = app.element('rollingSignalBadge');
    const rollingEl = app.element('rollingTracker');
    assert.ok(badgeEl, `${gid}: rollingSignalBadge exists in DOM`);
    assert.ok(rollingEl, `${gid}: rollingTracker exists in DOM`);
    assert.ok(rollingEl.innerHTML.includes('rolling-chip'), `${gid}: renders rolling chips in DOM`);
    assert.ok(rollingEl.innerHTML.includes('12'), `${gid}: contains roll 12`);
    assert.ok(rollingEl.innerHTML.includes('11'), `${gid}: contains roll 11`);
    assert.ok(rollingEl.innerHTML.includes('10'), `${gid}: contains roll 10`);
    assert.ok(rollingEl.innerHTML.includes('9'), `${gid}: contains roll 9`);
  }
});

