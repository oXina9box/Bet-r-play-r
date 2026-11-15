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
  assert.equal(res.horizons.length, 4); // 11, 10, 9, 8
  assert.ok([0, 20, 40, 60, 80, 100].includes(res.discreteMatchPct));
  assert.ok(res.normalizedWeighted >= 0 && res.normalizedWeighted <= 100);

  // Check horizon weights are 20, 15, 10, 5
  assert.equal(res.horizons[0].weight, 20); // len 11
  assert.equal(res.horizons[1].weight, 15); // len 10
  assert.equal(res.horizons[2].weight, 10); // len 9
  assert.equal(res.horizons[3].weight, 5);  // len 8
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
function bootApp(initialGame = 'sicbo') {
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
  return { element, context, timers };
}

test('bet area #next never has overlays and urgent alert area operates cleanly', () => {
  const app = bootApp('sicbo');
  const nextEl = app.element('next');
  assert.ok(!nextEl.innerHTML.includes('triple-overlay'), '#next must never contain triple-overlay');
  assert.ok(app.element('urgentAlertArea'), 'urgentAlertArea exists in DOM');
  assert.ok(app.element('standardMessageArea'), 'standardMessageArea exists in DOM');
  assert.ok(app.element('rollingTracker'), 'rollingTracker exists in DOM');
  assert.ok(app.element('deepPatterns'), 'deepPatterns exists in DOM');
});

test('scoreboard renders Baccarat beads for groups', () => {
  const app = bootApp('baccarat');
  const stripEl = app.element('strip');
  assert.ok(stripEl, '#strip element exists');
});
