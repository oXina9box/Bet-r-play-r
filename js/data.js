/* Shared backup/storage boundary. Validation returns a fresh, normalized v1 state. */
(function (root) {
  const GAMES = ['sicbo', 'teenpatti', 'kickoff'];
  const PROGRESSIONS = ['double', 'plusone', 'fib', 'fib_ladder'];
  const RESERVED = ['__proto__', 'prototype', 'constructor'];
  const check = (ok) => { if (!ok) throw new Error('Invalid Bet-R Play-R backup'); };
  const object = x => x !== null && typeof x === 'object' && !Array.isArray(x);
  const number = x => typeof x === 'number' && Number.isFinite(x);
  const stamp = x => number(x) && x >= 0 && x <= 8640000000000000;
  const id = x => typeof x === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(x) && !RESERVED.includes(x);

  function createDefault() {
    return { v: 1, sites: [{ id: 'shuff', name: 'Shuff' }], cur: { site: 'shuff', game: 'sicbo' }, books: {}, savedAt: 0 };
  }

  function safeKeys(value, seen = new Set(), depth = 0) {
    if (!value || typeof value !== 'object') return;
    check(depth <= 20 && !seen.has(value));
    seen.add(value);
    for (const key of Object.keys(value)) {
      check(!RESERVED.includes(key));
      safeKeys(value[key], seen, depth + 1);
    }
    seen.delete(value);
  }

  function config(c) {
    check(object(c) && [4, 5, 6, 7].includes(c.n) && PROGRESSIONS.includes(c.prog));
    check(number(c.unit) && c.unit > 0 && number(c.payout) && c.payout > 0);
    const waitBust = c.waitBust === undefined ? 0 : c.waitBust;
    const recovery = c.recovery === undefined ? 0 : c.recovery;
    const fibDrop = c.fibDrop === undefined ? 2 : c.fibDrop;
    check(Number.isInteger(waitBust) && waitBust >= 0 && waitBust <= 3);
    check(Number.isInteger(recovery) && recovery >= 0 && recovery <= 4);
    check(Number.isInteger(fibDrop) && fibDrop >= 1 && fibDrop <= 10);
    // Maximum supported multiplier includes recovery; reject arithmetic overflow.
    check(Number.isFinite(c.unit * c.payout * 144 * 127));
    return { n: c.n, prog: c.prog, unit: c.unit, payout: c.payout, waitBust, recovery, fibDrop };
  }

  function rawEntry(raw, game) {
    if (game !== 'sicbo' && object(raw) && ['A', 'B', 'T'].includes(raw.w)) return { w: raw.w };
    if (game === 'teenpatti') {
      check(object(raw) && Array.isArray(raw.c) && raw.c.length === 6);
      check(raw.c.every(c => typeof c === 'string' && /^(?:[2-9]|10|J|Q|K|A)[hdsc]$/.test(c)) && new Set(raw.c).size === 6);
      check(raw.order === undefined || raw.order === 'alternating');
      return { c: raw.c.slice(), ...(raw.order === undefined ? {} : { order: raw.order }) };
    }
    check(Array.isArray(raw) && raw.length === (game === 'sicbo' ? 3 : 2));
    check(raw.every(n => Number.isInteger(n) && n >= 1 && n <= 6));
    return raw.slice();
  }

  function book(value, game) {
    check(object(value) && Array.isArray(value.sessions) && value.sessions.length > 0 && Array.isArray(value.entries));
    const sessions = value.sessions.map(s => {
      check(object(s) && id(s.id) && stamp(s.start));
      return { id: s.id, start: s.start };
    });
    const sessionIds = new Set(sessions.map(s => s.id));
    check(sessionIds.size === sessions.length);
    const entries = value.entries.map(e => {
      check(object(e) && sessionIds.has(e.s) && stamp(e.t) && (e.nb === undefined || typeof e.nb === 'boolean'));
      return { t: e.t, s: e.s, raw: rawEntry(e.raw, game), cfg: config(e.cfg), ...(e.nb === undefined ? {} : { nb: e.nb }) };
    });
    return { cfg: config(value.cfg), sessions, entries };
  }

  function validate(value) {
    safeKeys(value);
    check(object(value) && value.v === 1 && Array.isArray(value.sites) && value.sites.length > 0);
    const sites = value.sites.map(s => {
      check(object(s) && id(s.id) && typeof s.name === 'string' && s.name.trim().length > 0 && s.name.length <= 1000);
      return { id: s.id, name: s.name };
    });
    const siteIds = new Set(sites.map(s => s.id));
    check(siteIds.size === sites.length && object(value.cur) && siteIds.has(value.cur.site) && GAMES.includes(value.cur.game));
    check(object(value.books) && (value.savedAt === undefined || stamp(value.savedAt)));
    const books = Object.fromEntries(Object.entries(value.books).map(([key, b]) => {
      const [site, game, extra] = key.split(':');
      check(siteIds.has(site) && GAMES.includes(game) && extra === undefined);
      return [key, book(b, game)];
    }));
    return { v: 1, sites, cur: { site: value.cur.site, game: value.cur.game }, books, savedAt: value.savedAt === undefined ? 0 : value.savedAt };
  }

  if (typeof module !== 'undefined' && module.exports) module.exports = { validate, createDefault };
  else root.AppData = { validate, createDefault };
})(this);
