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
  for (const file of ['js/history.js', 'js/engine.js', 'js/games/sicbo.js', 'js/games/teenpatti.js', 'js/games/baccarat.js', 'js/games/kickoff.js', 'js/voice.js']) {
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
    keyup(key) { const event = { key, preventDefault() {} }; documentListeners.keyup?.(event); },
    async runTimers(delay) { for (const [id, timer] of [...timers]) if (timer.delay === delay) { timers.delete(id); timer.fn(); } await tick(); },
    timerCount: (delay) => [...timers.values()].filter((timer) => timer.delay === delay).length,
    async startTimers() { for (const [id, timer] of [...timers]) if (timer.delay === 250) { timers.delete(id); timer.fn(); } await tick(); },
    async flush() { for (const [id, timer] of [...timers]) if (timer.delay === 250) { timers.delete(id); await timer.fn(); } await tick(); },
    async import(value) { const input = element('import'); input.files = [{ text: async () => JSON.stringify(value) }]; await input.onchange?.({ target: input }); await tick(); },
  };
}

(async () => {
  const scoreApp = boot({ cache: { ...fixture(), cur: { site: 'shuff', game: 'kickoff' } }, protocol: 'file:' });
  await tick();
  const scoreEntries = () => JSON.parse(scoreApp.stored.get('betrplayr.v1')).books['shuff:kickoff']?.entries || [];
  scoreApp.key('0'); assert.equal(scoreEntries().length, 0);
  scoreApp.key('6'); scoreApp.key('4');
  scoreApp.key('0'); assert.equal(scoreEntries()[0].scoreHit, true);
  scoreApp.key('0', { repeat: true }); assert.equal(scoreEntries()[0].scoreHit, true);
  assert.equal(scoreEntries().length, 1, 'mark does not add a roll');
  assert.match(scoreApp.element('strip').innerHTML, /SCORE/);
  scoreApp.element('scoreHit').onclick(); assert.equal(scoreEntries()[0].scoreHit, false);
  scoreApp.key('0', { target: { matches: () => true } }); assert.equal(scoreEntries()[0].scoreHit, false);
  scoreApp.key('0'); scoreApp.key('2'); scoreApp.key('3');
  assert.equal(scoreEntries()[0].scoreHit, true);
  assert.equal(scoreEntries()[1].scoreHit, undefined, 'new rolls start unmarked');
  scoreApp.element('newSession').onclick(); scoreApp.key('0');
  assert.equal(scoreEntries()[1].scoreHit, undefined, 'empty session cannot mark old rolls');
  scoreApp.pick('games', 'sicbo'); scoreApp.key('0');
  assert.equal(scoreEntries().length, 2);
  assert.equal(scoreApp.element('scoreHit').hidden, true);
  for (const [game, transcript, raw] of [
    ['sicbo', 'one six two', [1, 6, 2]],
    ['kickoff', 'six two', [6, 2]],
    ['teenpatti', 'ace spades five diamonds king hearts queen clubs ten spades two hearts', { c: ['As', '5d', 'Kh', 'Qc', '10s', '2h'], order: 'alternating' }],
  ]) {
    let hooks, starts = 0, stops = 0;
    const voiceApp = boot({ cache: { ...fixture(), cur: { site: 'shuff', game } }, protocol: 'file:', beforeApp(context) {
      context.Voice = {
        isSupported: () => true, init: callbacks => { hooks = callbacks; },
        start: () => { starts++; return true; }, cancel() {},
        stop: () => { stops++; hooks.onResult({ transcript }); },
        parseEntry: require('../js/voice').parseEntry,
      };
    } });
    await tick();
    voiceApp.key(' '); assert.equal(starts, 0, 'voice is opt-in');
    voiceApp.element('voiceEntry').onchange({ target: { checked: true } });
    assert.equal(JSON.parse(voiceApp.stored.get('betrplayr.v1')).voiceEntry, true);
    voiceApp.key(' ', { target: { matches: () => true } });
    assert.equal(starts, 0, 'Space in a form field does not capture speech');
    voiceApp.key(' '); voiceApp.key(' ', { repeat: true });
    assert.equal(starts, 1, 'holding Space starts one recognition session');
    assert.equal(JSON.parse(voiceApp.stored.get('betrplayr.v1')).books[`shuff:${game}`].entries.length, 0, 'holding does not record');
    voiceApp.keyup(' ');
    const recorded = JSON.parse(voiceApp.stored.get('betrplayr.v1')).books[`shuff:${game}`].entries;
    assert.equal(stops, 1); assert.equal(recorded.length, 1);
    assert.deepEqual(recorded[0].raw, raw, `${game} voice uses manual entry data format`);
    assert.equal(recorded[0].cfg.n, 5);
    assert.match(voiceApp.element('sessionInfo').textContent, /1 (roll|hand)/);
    voiceApp.key(' '); voiceApp.pick('games', game === 'sicbo' ? 'kickoff' : 'sicbo');
    hooks.onResult({ transcript });
    assert.equal(JSON.parse(voiceApp.stored.get('betrplayr.v1')).books[`shuff:${game}`].entries.length, 1, 'game switching cancels late recognition');
  }
  let invalidHooks;
  const invalidVoice = boot({ protocol: 'file:', beforeApp(context) {
    context.Voice = { isSupported: () => true, init: hooks => { invalidHooks = hooks; }, start: () => true, cancel() {},
      stop: () => invalidHooks.onResult({ transcript: 'one two three four' }), parseEntry: require('../js/voice').parseEntry };
  } });
  await tick(); invalidVoice.element('voiceEntry').onchange({ target: { checked: true } });
  invalidVoice.key(' '); invalidVoice.keyup(' ');
  assert.equal(JSON.parse(invalidVoice.stored.get('betrplayr.v1')).books['shuff:sicbo'].entries.length, 0, 'extra dice reject the entire utterance');
  assert.match(invalidVoice.element('toast').textContent, /Incorrect number/);

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
  const freshSaved = JSON.parse(fresh.requests.find((r) => r.options?.method === 'POST').options.body);
  assert.equal(freshSaved.books['shuff:sicbo'].cfg.waitWin, 0, 'fresh Sic Bo books default to no win wait');
  assert.match(fresh.element('waitWinSeg').innerHTML, /data-v="0"[^>]*>0 \(standard\)/, 'zero is labeled standard for Sic Bo');
  assert.match(fresh.element('waitWinSeg').innerHTML, /data-v="1"[^>]*>1</, 'one is a normal wait for Sic Bo');

  const otherGame = boot(); await tick();
  await otherGame.import({ ...fixture(), cur: { site: 'shuff', game: 'teenpatti' } });
  assert.match(otherGame.element('waitWinSeg').innerHTML, /data-v="1"[^>]*>1 \(standard\)/, 'other-game standard label stays on one');

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
  const headers = revision => ({ get: name => name === 'ETag' ? revision : null });
  let online = false;
  const reconnect = boot({
    get: async () => { if (!online) throw new Error('offline'); return { ok: true, headers: headers('"empty"'), json: async () => null }; },
    post: async () => ({ ok: true, headers: headers('"saved"') }),
  });
  await tick();
  reconnect.clickKey('1'); reconnect.clickKey('2'); reconnect.clickKey('3');
  online = true;
  await reconnect.runTimers(2000); await reconnect.flush();
  const recoveredPost = reconnect.requests.find(r => r.options?.method === 'POST');
  assert.equal(recoveredPost.options.headers['If-Match'], '"empty"');
  assert.deepEqual(JSON.parse(recoveredPost.options.body).books['shuff:sicbo'].entries[0].raw, [1, 2, 3]);
  assert.match(reconnect.element('saveStatus').textContent, /Saved to file/, 'startup failure reconnects and saves offline edits');

  let remoteOnline = false;
  const remote = fixture(100);
  remote.sites[0].name = 'Restored file';
  const reconnectRead = boot({ get: async () => {
    if (!remoteOnline) throw new Error('offline');
    return { ok: true, headers: headers('"remote"'), json: async () => remote };
  } });
  await tick(); remoteOnline = true;
  await reconnectRead.runTimers(2000);
  assert.match(reconnectRead.element('site').innerHTML, /Restored file/, 'reconnection redraws adopted file state');

  let conflictOnline = false;
  const offlineConflict = boot({ get: async () => {
    if (!conflictOnline) throw new Error('offline');
    return { ok: true, headers: headers('"remote"'), json: async () => remote };
  } });
  await tick(); offlineConflict.clickKey('1'); offlineConflict.clickKey('2'); offlineConflict.clickKey('3');
  conflictOnline = true; await offlineConflict.runTimers(2000); await offlineConflict.flush();
  assert.match(offlineConflict.element('saveStatus').textContent, /File conflict/);
  assert.equal(offlineConflict.requests.filter(r => r.options?.method === 'POST').length, 0, 'offline edits cannot overwrite unknown remote history');
  assert.equal(JSON.parse(offlineConflict.stored.get('betrplayr.v1')).books['shuff:sicbo'].entries.length, 1, 'conflicting offline history remains exportable');

  let disk = fixture(100), diskRevision = '"one"';
  const sharedGet = async () => ({ ok: true, headers: headers(diskRevision), json: async () => JSON.parse(JSON.stringify(disk)) });
  const sharedPost = async (url, options) => {
    if (options.headers['If-Match'] !== diskRevision) return { ok: false, status: 412 };
    disk = JSON.parse(options.body); diskRevision = '"two"';
    return { ok: true, headers: headers(diskRevision) };
  };
  const windowA = boot({ get: sharedGet, post: sharedPost }), windowB = boot({ get: sharedGet, post: sharedPost });
  await tick();
  windowA.clickKey('1'); windowA.clickKey('2'); windowA.clickKey('3'); await windowA.flush();
  windowB.clickKey('4'); windowB.clickKey('5'); windowB.clickKey('6'); await windowB.flush();
  assert.deepEqual(disk.books['shuff:sicbo'].entries.map(e => e.raw), [[1, 2, 3]], 'stale window leaves saved history intact');
  assert.match(windowB.element('saveStatus').textContent, /File conflict/);
  assert.deepEqual(JSON.parse(windowB.stored.get('betrplayr.v1')).books['shuff:sicbo'].entries[0].raw, [4, 5, 6], 'stale window keeps its unsaved roll');
  windowB.clickKey('1'); windowB.clickKey('1'); windowB.clickKey('1');
  await windowB.runTimers(2000); await windowB.flush();
  assert.equal(windowB.requests.filter(r => r.options?.method === 'POST').length, 1, 'conflicts do not retry destructive writes');

  const staleCache = boot({ cache: fixture(Date.now() + 10000), get: sharedGet }); await tick(); await staleCache.flush();
  assert.match(staleCache.element('saveStatus').textContent, /File conflict/, 'reload cannot authorize a stale cached history using a fresh revision');
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
  for (const name of ['???', '---']) {
    escaped.element('newSite').value = name;
    escaped.element('newSite').onkeydown({ key: 'Enter' });
  }
  const siteIds = JSON.parse(escaped.stored.get('betrplayr.v1')).sites.map((s) => s.id);
  assert.equal(siteIds.length, 3, 'punctuation-only site names each get a unique fallback ID');
  assert.ok(siteIds.every((id) => !id.startsWith('-') && !id.endsWith('-')));

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
  let recoverWrite = false;
  const retry = boot({ get: async () => ({ ok: true, json: async () => null }), post: async () => ({ ok: recoverWrite }) });
  await tick(); await retry.flush();
  assert.match(retry.element('saveStatus').textContent, /Browser only/);
  recoverWrite = true; await retry.runTimers(2000); await retry.flush();
  assert.match(retry.element('saveStatus').textContent, /Saved to file/, 'failed disk write retries without new data');

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

  const spoken = [], canceled = [];
  const speech = boot({ protocol: 'file:', beforeApp(context) {
    context.speechSynthesis = { cancel: () => canceled.push(true), speak: message => spoken.push(message.text) };
    context.SpeechSynthesisUtterance = function (text) { this.text = text; };
  } }); await tick();
  speech.element('audioFeedback').onchange({ target: { checked: true } });
  for (const key of ['1', '2', '3']) speech.key(key);
  assert.match(spoken.at(-1), /1, 2, 3.*SMALL.*total 6/);
  const count = spoken.length;
  speech.key('1');
  assert.equal(spoken.length, count, 'partial input does not repeat the last announcement');
  speech.element('noBet').onclick();
  assert.match(spoken.at(-1), /Skip.*No bet/i, 'arming a skip announces no wager rather than advising a stake');
  speech.key('2'); speech.key('3');
  assert.match(spoken.at(-1), /skipped.*No money/i, 'the skipped completed round is announced');
  const stops = canceled.length;
  speech.element('audioFeedback').onchange({ target: { checked: false } });
  assert.equal(canceled.length, stops + 1, 'turning speech off cancels active audio');
  speech.element('noBet').onclick();
  speech.element('newSession').onclick();
  speech.key('1'); speech.key('2'); speech.key('3');
  assert.equal(JSON.parse(speech.stored.get('betrplayr.v1')).books['shuff:sicbo'].entries.at(-1).nb, undefined, 'skip cannot leak into a new session');

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

  // Test Baccarat switching, fast entry, and natural commit under shuff
  cards.pick('games', 'baccarat');
  assert.equal(JSON.parse(cards.stored.get('betrplayr.v1')).cur.game, 'baccarat');
  assert.match(cards.element('pad').innerHTML, /Player won/, 'baccarat pad rendered');
  // Enter Natural 9: P: 9s, B: 7h, P: 10d, B: 8c
  cards.key('9'); cards.key('2'); // 9s (Deal 1 - Player)
  cards.key('7'); cards.key('1'); // 7h (Deal 2 - Banker)
  cards.key('1'); cards.key('0'); cards.key('4'); // 10d (Deal 3 - Player)
  cards.key('8'); cards.key('3'); // 8c (Deal 4 - Banker) -> Natural 9 auto-commits!
  const baccBook = JSON.parse(cards.stored.get('betrplayr.v1')).books['shuff:baccarat'];
  assert.equal(baccBook.entries.length, 1, 'Baccarat natural 9 commits after 4 cards');
  assert.deepEqual(baccBook.entries[0].raw.c, ['9s', '7h', '10d', '8c']);
  assert.equal(baccBook.entries[0].raw.order, 'alternating');
  assert.match(cards.element('strip').innerHTML, /Natural 9|9-5/, 'strip renders Baccarat hand');

  // Voice toggle test
  assert.ok(cards.element('voiceBtn'), 'voice button exists');
  cards.key('v');
  cards.element('voiceBtn').onclick();
  const voiceEvents = {};
  const voiceHostile = boot({ protocol: 'file:', beforeApp(context) {
    context.Voice = {
      isSupported: () => true,
      init(opts) { Object.assign(voiceEvents, opts); return true; },
      parseSpeech: () => ({ cards: [], dice: [], commands: [] }),
      toggle: () => true,
    };
  } });
  await tick();
  voiceEvents.onInterim({ transcript: '<img src=x onerror=alert(1)>' });
  assert.ok(!voiceHostile.element('voiceTranscript').innerHTML.includes('<img'), 'voice transcript escapes HTML');
  assert.equal(voiceHostile.element('voiceTranscript').textContent, '<img src=x onerror=alert(1)>', 'voice transcript renders hostile input as plain text');

  const teenHooks = {};
  const teenSeed = { ...fixture(), cur: { site: 'shuff', game: 'teenpatti' }, books: { 'shuff:teenpatti': { cfg: { n: 5, prog: 'double', unit: 1, payout: 1 }, sessions: [{ id: 'teen', start: 1 }], entries: [] } } };
  const teenManual = boot({ protocol: 'file:', cache: teenSeed, beforeApp(context) {
    context.ScreenReader = { init(options) { Object.assign(teenHooks, options); return { stop() {}, manual() {}, refresh() {} }; } };
  } });
  await tick(); teenManual.key('a');
  const teenState = JSON.parse(teenManual.stored.get('betrplayr.v1'));
  const teenBound = { site: 'shuff', game: 'teenpatti', session: teenState.books['shuff:teenpatti'].sessions[0].id };
  const teenEntry = { raw: { w: 'A' }, screen: { round: '1900000000000', capturedAt: 1900000000000, confidence: 90, result: 'PLAYER A' }, wager: { status: 'unknown' } };
  assert.equal(teenHooks.record(teenEntry, teenBound), false, 'active manual rank is preserved');
  assert.match(teenManual.element('pending').innerHTML, /rank-pending/);
  teenManual.key('2');
  assert.equal(teenHooks.record(teenEntry, teenBound), false, 'partial manual hand is preserved');
  teenManual.element('clear').onclick();
  assert.equal(teenHooks.record(teenEntry, teenBound), true, 'verified hand can be retried after manual input clears');
  assert.match(teenManual.element('strip').innerHTML, /winner only/, 'screen winner records identify missing cards');
  assert.equal(teenHooks.record(teenEntry, teenBound), false, 'retry does not duplicate accepted hand');
  let held = true;
  const heldReader = boot({ protocol: 'file:', cache: teenSeed, beforeApp(context) {
    context.ScreenReader = { init() { return { stop() {}, manual() {}, refresh() {}, canSwitch: () => !held }; } };
  } });
  await tick(); heldReader.pick('games', 'sicbo');
  assert.match(heldReader.element('toast').textContent, /verified hand/i, 'pending hand blocks changing game');
  assert.match(heldReader.element('games').innerHTML, /teenpatti[^>]*class="on"/);
  held = false; heldReader.pick('games', 'sicbo');
  assert.match(heldReader.element('games').innerHTML, /sicbo[^>]*class="on"/, 'game can change when pending hand resolves');

  function recoveryApp(session = { id: 'recover', start: 1 }) {
    const clock = { at: 1900000000000 }, hooks = {};
    const seed = { ...fixture(), books: { 'shuff:sicbo': { cfg: { n: 5, prog: 'double', unit: 1, payout: 1 }, sessions: [session], entries: [] } } };
    const app = boot({ protocol: 'file:', cache: seed, beforeApp(context) {
      context.Date = class extends Date { static now() { return clock.at; } };
      context.SicBoRecovery = { create: options => require('../js/sicbo-recovery').create({ ...options, now: () => clock.at,
        setTimer: context.setTimeout, clearTimer: context.clearTimeout }) };
      context.ScreenReader = { init(options) { Object.assign(hooks, options); return { stop() {}, manual() {}, refresh() {} }; } };
    } });
    const state = () => JSON.parse(app.stored.get('betrplayr.v1'));
    const roll = () => ({ raw: [4, 5, 6], screen: { round: String(clock.at), capturedAt: clock.at, confidence: 96, result: 'BIG 15' }, wager: { status: 'unknown' } });
    return { app, clock, hooks, state, roll, bound: { site: 'shuff', game: 'sicbo', session: session.id } };
  }
  const fallback = recoveryApp(); await tick();
  fallback.hooks.rollDetected({ id: String(fallback.clock.at), at: fallback.clock.at }, fallback.bound);
  assert.equal(fallback.state().books['shuff:sicbo'].sessions[0].missedRoll, undefined, 'history retries do not persist a manual deadline');
  fallback.clock.at += 60000; await fallback.app.runTimers(2500); await fallback.app.runTimers(15000);
  assert.equal(fallback.app.element('rollRecovery').hidden, true, 'late history never opens automatic manual entry');
  assert.equal(fallback.state().books['shuff:sicbo'].sessions[0].endedAt, undefined, 'late history never ends the session');
  assert.equal(fallback.hooks.record(fallback.roll(), fallback.bound, { sourceAt: fallback.clock.at }), true, 'verified delayed history remains recordable');
  assert.equal(fallback.hooks.record(fallback.roll(), fallback.bound, { sourceAt: fallback.clock.at }), false, 'repeated retry cannot duplicate a roll');

  const partial = recoveryApp(); await tick();
  partial.app.key('1');
  partial.hooks.rollDetected({ id: String(partial.clock.at), at: partial.clock.at }, partial.bound);
  assert.equal(partial.hooks.record(partial.roll(), partial.bound, { sourceAt: partial.clock.at }), false, 'manual typing cannot be overwritten by OCR');
  partial.app.element('clear').onclick();
  assert.equal(partial.hooks.record(partial.roll(), partial.bound, { sourceAt: partial.clock.at }), true, 'clearing partial input releases OCR ownership');

  const lateHistory = recoveryApp(); await tick();
  lateHistory.hooks.rollDetected({ id: String(lateHistory.clock.at), at: lateHistory.clock.at, reason: 'late-history' }, lateHistory.bound);
  assert.equal(lateHistory.app.element('rollRecovery').hidden, true, '35-second retry never prompts for manual entry');
  lateHistory.app.key('1'); lateHistory.app.key('2'); lateHistory.app.key('3');
  assert.deepEqual(lateHistory.state().books['shuff:sicbo'].entries[0].raw, [1, 2, 3], 'voluntary three-key manual entry still works');

  const reloaded = recoveryApp({ id: 'recover', start: 1, missedRoll: { id: '1899999982000', detectedAt: 1899999982000, promptAt: 1899999984500, deadline: 1899999999500 } });
  await tick();
  assert.equal(reloaded.state().books['shuff:sicbo'].sessions[0].endedAt, undefined, 'old pending deadlines are retired without ending sessions');
  assert.equal(reloaded.state().books['shuff:sicbo'].sessions[0].missedRoll, undefined, 'obsolete pending deadline is removed');
  assert.equal(reloaded.state().books['shuff:sicbo'].entries.length, 0);

  const ended = recoveryApp({ id: 'recover', start: 1, endedAt: 1800000000000, endReason: 'missed-roll' });
  await tick();
  assert.equal(ended.hooks.record(ended.roll(), ended.bound, { sourceAt: ended.clock.at }), false, 'already ended history stays closed');
  ended.app.key('1'); ended.app.key('2'); ended.app.key('3');
  assert.equal(ended.state().books['shuff:sicbo'].entries.length, 0);
  ended.app.element('newSession').onclick();
  assert.equal(ended.state().books['shuff:sicbo'].sessions.length, 2, 'closed session can be followed by a new session');

  const switched = recoveryApp(); await tick();
  switched.hooks.rollDetected({ id: String(switched.clock.at), at: switched.clock.at }, switched.bound);
  switched.app.pick('games', 'kickoff');
  switched.app.key('1'); switched.app.key('2');
  switched.clock.at += 60000; await switched.app.runTimers(2500);
  assert.equal(switched.state().books['shuff:sicbo'].sessions[0].endedAt, undefined, 'switching games cannot revive the old deadline');
  assert.equal(switched.state().books['shuff:kickoff'].sessions[0].endedAt, undefined);


  // Spacebar confirmation over voice entry in card games
  let voiceStarts = 0;
  const cardVoiceApp = boot({
    protocol: 'file:',
    cache: { ...fixture(), cur: { site: 'shuff', game: 'teenpatti' } },
    beforeApp(context) {
      context.Voice = { isSupported: () => true, init() {}, start: () => { voiceStarts++; return true; }, stop: () => {}, cancel() {}, active: () => false };
    }
  });
  await tick();
  cardVoiceApp.element('voiceEntry').checked = true;
  cardVoiceApp.element('voiceEntry').onchange?.({ target: { checked: true } });
  cardVoiceApp.key('a');
  assert.equal(voiceStarts, 0);
  cardVoiceApp.key(' ');
  assert.equal(voiceStarts, 0, 'Spacebar confirmed pending card rank rather than starting voice');
  assert.match(cardVoiceApp.element('pending').innerHTML, /A♥/, 'Card Ah confirmed by spacebar');
  cardVoiceApp.key(' ');
  assert.equal(voiceStarts, 1, 'Spacebar starts voice when no card rank pending');
  cardVoiceApp.key('a', { target: { isContentEditable: true } });
  assert.equal(cardVoiceApp.element('pending').innerHTML.includes('rank-pending'), false, 'contenteditable ignored');

  // Undo restores armed No Bet and manual bet amount
  const undoApp = boot({ protocol: 'file:' });
  await tick();
  undoApp.key('x');
  assert.match(undoApp.element('pending').innerHTML, /NO BET ARMED/);
  undoApp.key('1'); undoApp.key('2'); undoApp.key('3');
  const undoState1 = JSON.parse(undoApp.stored.get('betrplayr.v1'));
  const entries1 = undoState1.books['shuff:sicbo'].entries;
  assert.equal(entries1.length, 1);
  assert.equal(entries1[0].nb, true);
  assert.equal(undoApp.element('pending').innerHTML.includes('NO BET ARMED'), false, 'No Bet disarmed after commit');
  undoApp.key('Backspace');
  const undoState2 = JSON.parse(undoApp.stored.get('betrplayr.v1'));
  assert.equal(undoState2.books['shuff:sicbo'].entries.length, 0);
  assert.match(undoApp.element('pending').innerHTML, /NO BET ARMED/, 'undo restored armed No Bet');

  // Enforce recovery=0 and locked selector for Fibonacci progressions
  const fibApp = boot({ protocol: 'file:' });
  await tick();
  fibApp.pick('recSeg', 2);
  let fibState = JSON.parse(fibApp.stored.get('betrplayr.v1'));
  assert.equal(fibState.books['shuff:sicbo'].cfg.recovery, 2);
  fibApp.pick('progSeg', 'fib_ladder');
  fibState = JSON.parse(fibApp.stored.get('betrplayr.v1'));
  assert.equal(fibState.books['shuff:sicbo'].cfg.prog, 'fib_ladder');
  assert.equal(fibState.books['shuff:sicbo'].cfg.recovery, 0, 'switching to fib resets recovery to 0');
  assert.match(fibApp.element('recSeg').innerHTML, /Off \(Self-Recovering\)/);
  fibApp.pick('recSeg', 2);
  fibState = JSON.parse(fibApp.stored.get('betrplayr.v1'));
  assert.equal(fibState.books['shuff:sicbo'].cfg.recovery, 0, 'recovery remains 0 for fib_ladder');

  // Protect speech synthesis calls against browser exceptions
  const speechApp = boot({
    protocol: 'file:',
    beforeApp(context) {
      context.speechSynthesis = {
        cancel() {},
        speak() { throw new Error('Speech synthesis error'); },
      };
      context.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
    }
  });
  await tick();
  speechApp.element('audioFeedback').checked = true;
  speechApp.element('audioFeedback').onchange?.({ target: { checked: true } });
  speechApp.key('1'); speechApp.key('2'); speechApp.key('3');
  assert.equal(JSON.parse(speechApp.stored.get('betrplayr.v1')).books['shuff:sicbo'].entries.length, 1);
  console.log('All app tests passed');
})().catch((error) => { console.error(error); process.exitCode = 1; });
