const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const fixture = (savedAt = 10) => ({ v: 1, savedAt, sites: [{ id: 'shuff', name: 'Shuff' }], cur: { site: 'shuff', game: 'sicbo' }, books: {} });
const tick = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };

function boot({ cache = null, get = async () => ({ ok: true, json: async () => fixture() }), post = async () => ({ ok: true }), protocol = 'http:', quota = false, beforeApp = () => {} } = {}) {
  const elements = new Map();
  function element(id) {
    if (!elements.has(id)) elements.set(id, {
      innerHTML: '', textContent: '', title: '', value: '', hidden: false, disabled: false,
      classList: { add() {}, remove() {}, toggle() {} }, listeners: {},
      addEventListener(type, fn) { this.listeners[type] = fn; }, focus() {}, click() {},
    });
    return elements.get(id);
  }
  const stored = new Map(cache === null ? [] : [['betrplayr.v1', JSON.stringify(cache)]]);
  const requests = [], timers = new Map(), documentListeners = {};
  let nextTimer = 1;
  const context = {
    console, Map, Date, Math, URL, Blob, AbortSignal,
    location: { protocol, origin: protocol === 'file:' ? 'null' : 'http://127.0.0.1:47615' },
    document: { getElementById: element, activeElement: null, addEventListener(type, callback) { documentListeners[type] = callback; }, querySelectorAll: () => [...elements.values()], createElement: () => element('download') },
    localStorage: {
      getItem: (key) => stored.get(key) ?? null,
      setItem(key, value) { if (quota) throw new Error('quota exceeded'); stored.set(key, value); },
      removeItem: (key) => stored.delete(key),
    },
    fetch: async (url, options) => { requests.push({ url, options }); return options?.method === 'POST' ? post(url, options) : get(); },
    setTimeout(fn, delay) { const id = nextTimer++; timers.set(id, { fn, delay }); return id; },
    clearTimeout: (id) => timers.delete(id),
  };
  context.window = context;
  vm.createContext(context);
  for (const file of ['js/history.js', 'js/engine.js', 'js/games/sicbo.js', 'js/games/teenpatti.js', 'js/games/kickoff.js', 'js/voice.js']) {
    vm.runInContext(fs.readFileSync(file, 'utf8'), context, { filename: path.resolve(file) });
  }
  context.AppData = require('../js/data.js');
  beforeApp(context);
  vm.runInContext(fs.readFileSync('js/app.js', 'utf8'), context, { filename: path.resolve('js/app.js') });
  const clickKey = (key) => element('pad').listeners.click?.({ target: { closest: () => ({ dataset: { key } }) } });
  const pick = (id, value) => element(id).onclick?.({ target: { closest: () => ({ dataset: { v: value } }) } });
  return {
    element, context, stored, requests, clickKey, pick,
    key(key, options = {}) { const event = { key, target: {}, preventDefault() { this.prevented = true; }, ...options }; documentListeners.keydown?.(event); return event; },
    async runTimers(delay) { for (const [id, timer] of [...timers]) if (timer.delay === delay) { timers.delete(id); timer.fn(); } await tick(); },
    timerCount: (delay) => [...timers.values()].filter((timer) => timer.delay === delay).length,
    async startTimers() { for (const [id, timer] of [...timers]) if (timer.delay === 250) { timers.delete(id); timer.fn(); } await tick(); },
    async flush() { for (const [id, timer] of [...timers]) if (timer.delay === 250) { timers.delete(id); await timer.fn(); } await tick(); },
    async import(value) { const input = element('import'); input.files = [{ text: async () => JSON.stringify(value) }]; await input.onchange?.({ target: input }); await tick(); },
  };
}

(async () => {
  const keyboard = boot(); await tick();
  assert.equal(keyboard.key('6').prevented, true, 'recorder number shortcuts suppress browser quick-find');
  let release;
  const pending = new Promise((resolve) => { release = resolve; });
  const slow = boot({ get: () => pending });
  slow.clickKey('1'); slow.clickKey('2'); slow.clickKey('3');
  await slow.flush();
  assert.equal(slow.stored.size, 0, 'startup input cannot timestamp or save defaults before file loads');
  assert.equal(slow.requests.filter((r) => r.options?.method === 'POST').length, 0, 'no startup write before GET');
  release({ ok: true, json: async () => fixture(100) }); await tick();
  assert.equal(JSON.parse(slow.stored.get('betrplayr.v1')).savedAt, 100);
  assert.equal(slow.requests[0].url, '/data', 'API stays same origin');

  const fresh = boot({ get: async () => ({ ok: true, json: async () => null }) }); await tick(); await fresh.flush();
  assert.equal(fresh.requests.filter((r) => r.options?.method === 'POST').length, 1, 'empty server file bootstraps default data');
  assert.match(fresh.element('saveStatus').textContent, /Saved to file/);

  const app = boot(); await tick();
  const original = app.stored.get('betrplayr.v1');
  await app.import({ sites: [], books: {} }); await app.flush();
  assert.equal(app.stored.get('betrplayr.v1'), original, 'invalid import leaves cache intact');
  assert.equal(app.requests.filter((r) => r.options?.method === 'POST').length, 0, 'invalid import never posts');
  assert.match(app.element('toast').textContent, /Import failed/);
  const malformed = fixture();
  malformed.books['shuff:sicbo'] = { cfg: { n: 5, prog: 'double', unit: 1, payout: 1 }, sessions: [{ id: 's1', start: 1 }], entries: [{ t: 1, s: 's1', raw: ['<img src=x onerror=alert(1)>', 1, 1], cfg: { n: 5, prog: 'double', unit: 1, payout: 1 } }] };
  await app.import(malformed); await app.flush();
  assert.equal(app.stored.get('betrplayr.v1'), original, 'invalid dice import is atomic');
  assert.equal(app.requests.filter((r) => r.options?.method === 'POST').length, 0);

  const failed = boot({ get: async () => { throw new Error('offline'); } }); await tick();
  failed.clickKey('1'); failed.clickKey('2'); failed.clickKey('3'); await failed.flush();
  assert.equal(failed.requests.filter((r) => r.options?.method === 'POST').length, 0, 'failed GET disables file writes');
  assert.match(failed.element('saveStatus').textContent, /Browser only/);
  for (const get of [async () => ({ ok: false }), async () => ({ ok: true, json: async () => ({ sites: [] }) })]) {
    const rejected = boot({ get }); await tick();
    rejected.clickKey('1'); rejected.clickKey('2'); rejected.clickKey('3'); await rejected.flush();
    assert.equal(rejected.requests.filter((r) => r.options?.method === 'POST').length, 0, 'bad GET never authorizes writes');
  }

  const file = boot({ protocol: 'file:' }); await tick();
  file.clickKey('1'); file.clickKey('2'); file.clickKey('3'); await file.flush();
  assert.equal(file.requests.length, 0, 'file URL never contacts loopback API');

  const blockedStorage = boot({ protocol: 'file:', quota: true }); await tick();
  blockedStorage.clickKey('1'); blockedStorage.clickKey('2'); blockedStorage.clickKey('3');
  assert.match(blockedStorage.element('saveStatus').textContent, /Not saved/);
  assert.match(blockedStorage.element('toast').textContent, /Browser storage/);
  const previous = fixture(40);
  const quotaImport = boot({ cache: previous, protocol: 'file:', quota: true }); await tick();
  await quotaImport.import(fixture(50));
  assert.equal(JSON.parse(quotaImport.stored.get('betrplayr.v1')).savedAt, 40, 'quota failure preserves original import state');
  assert.match(quotaImport.element('toast').textContent, /Import failed/);
  assert.match(quotaImport.element('sessionInfo').textContent, /Session #1/, 'quota failure remains usable');

  const invalidCache = boot({ cache: { sites: [] }, protocol: 'file:' }); await tick();
  assert.match(invalidCache.element('sessionInfo').textContent, /Session #1/, 'malformed cache recovers to usable default');
  assert.equal(typeof invalidCache.element('resetAll').onclick, 'function');

  const hostile = fixture(100);
  hostile.sites[0].name = '<img src=x onerror=alert(1)>';
  const escaped = boot({ cache: hostile, protocol: 'file:' }); await tick();
  assert.ok(!escaped.element('site').innerHTML.includes('<img'), 'site names rendered as text');
  assert.match(escaped.element('site').innerHTML, /&lt;img/);

  const newer = boot({ cache: fixture(500), get: async () => ({ ok: true, json: async () => fixture(100) }) }); await tick(); await newer.flush();
  assert.equal(JSON.parse(newer.requests.find((r) => r.options?.method === 'POST').options.body).savedAt, 500, 'newer browser history wins');
  assert.equal(newer.requests.find((r) => r.options?.method === 'POST').options.headers['Content-Type'], 'application/json');

  let finishPost;
  const queued = boot({ post: async () => new Promise((resolve) => { finishPost = resolve; }) }); await tick();
  queued.clickKey('1'); queued.clickKey('2'); queued.clickKey('3'); await queued.startTimers();
  queued.clickKey('2'); queued.clickKey('3'); queued.clickKey('4'); await queued.startTimers();
  assert.equal(queued.requests.filter((r) => r.options?.method === 'POST').length, 1, 'second file write waits for first');
  assert.match(queued.element('saveStatus').textContent, /saving/);
  finishPost({ ok: true }); await tick();
  assert.equal(queued.requests.filter((r) => r.options?.method === 'POST').length, 2);
  assert.match(queued.element('saveStatus').textContent, /saving/, 'older success cannot mark newer edits saved');
  finishPost({ ok: false }); await tick();
  assert.match(queued.element('saveStatus').textContent, /Browser only/, 'failed write does not claim saved');

  const snapshotFail = boot({ post: async () => ({ ok: false }) }); await tick();
  await snapshotFail.import(fixture(50)); await snapshotFail.flush();
  assert.match(snapshotFail.element('toast').textContent, /previous data kept in browser backup/);
  assert.ok(!snapshotFail.element('toast').textContent.includes('backed up to file'));

  const restored = fixture(900);
  restored.sites.push({ id: 'second', name: 'Second' });
  await app.import(restored); await app.flush();
  assert.ok(app.stored.has('betrplayr.v1.preimport'), 'import keeps previous backup');
  assert.equal(JSON.parse(app.stored.get('betrplayr.v1')).sites.length, 2);
  assert.match(app.element('toast').textContent, /previous data backed up to file and browser/);
  await app.element('resetAll').onclick(); await app.flush();
  assert.equal(JSON.parse(app.stored.get('betrplayr.v1.prereset')).sites.length, 2, 'reset backs up complete previous state');
  assert.equal(JSON.parse(app.stored.get('betrplayr.v1')).sites.length, 1);

  const history = fixture(100);
  const cfg = { n: 5, prog: 'double', unit: 1, payout: 1, waitBust: 0, recovery: 0 };
  history.books['shuff:sicbo'] = {
    cfg, sessions: [{ id: 's1', start: 1 }, { id: 's2', start: 20 }],
    entries: [11, 14, 9, 14, 6, 13, 12, 8, 12, 9].map((total, i) => ({ t: i + 1, s: 's1', raw: total >= 11 ? [6, 4, 2] : [1, 2, 3], cfg })),
  };
  let simulated;
  const replay = boot({ cache: history, protocol: 'file:', beforeApp(context) {
    const simulate = context.Engine.simulateDelays;
    context.Engine.simulateDelays = (entries, ...args) => { simulated = entries; return simulate(entries, ...args); };
  } }); await tick();
  assert.match(replay.element('insightContent').innerHTML, /0 busts in selected scope/);
  replay.pick('scopeSeg', 'all');
  assert.match(replay.element('insightContent').innerHTML, /1 bust in selected scope/, 'scope picker repaints insights');
  assert.match(replay.element('insightContent').innerHTML, /Pending/);
  assert.match(replay.element('insightContent').innerHTML, /0 \/ 0/);
  assert.ok(!replay.element('insightContent').innerHTML.includes('optimal'));
  replay.pick('insightSeg', 'delays');
  assert.equal(simulated.length, 10);
  assert.ok(simulated.every((entry) => entry.s === 's1' && entry.sessionNo === 1 && entry.cfg.waitBust === 0), 'delay replay preserves session and historical config');
  replay.pick('progSeg', 'plusone');
  assert.match(replay.element('recNotes').innerHTML, /varies by bet/, 'variable winning-set profit rendered as a range');
  assert.ok(!replay.element('maxPlay').title.includes('proven'));

  const cards = boot({ protocol: 'file:' }); await tick();
  cards.pick('games', 'teenpatti');
  assert.equal(cards.key('Tab').prevented, undefined, 'Tab keeps normal navigation without active card');
  // Two-stroke fast card entry: A then 2 = As
  cards.key('a');
  assert.match(cards.element('pending').innerHTML, /rank-pending/, 'active rank highlighted');
  cards.key('2'); // '2' = Spades
  assert.match(cards.element('pending').innerHTML, /A♠/, 'A then 2 immediately produces A♠');
  // Deal remaining 5 cards: K1 (Kh), Q4 (Qd), J3 (Jc), 91 (9h), 82 (8s)
  for (const [r, s] of [['k', '1'], ['q', '4'], ['j', '3'], ['9', '1'], ['8', '2']]) {
    cards.key(r); cards.key(s);
  }
  const dealt = JSON.parse(cards.stored.get('betrplayr.v1')).books['shuff:teenpatti'].entries;
  assert.equal(dealt.length, 1, '6th card immediately commits without timer delay');
  assert.deepEqual(dealt[0].raw.c, ['As', 'Kh', 'Qd', 'Jc', '9h', '8s']);
  assert.equal(dealt[0].raw.order, 'alternating');

  // Voice toggle test
  assert.ok(cards.element('voiceBtn'), 'voice button exists');
  cards.key('v');
  cards.element('voiceBtn').onclick();

  console.log('All app tests passed');
})().catch((error) => { console.error(error); process.exitCode = 1; });
