/* Bet-R Play-R app: storage, state, rendering, input. */
(function () {
  const { PROGRESSIONS, GROUP_SIZES, run, stats } = window.Engine;
  const GAMES = window.Games;
  const KEY = 'betrplayr.v1';
  const DEFAULT_CFG = { n: 5, prog: 'double', unit: 1, payout: 1 };
  const $ = (id) => document.getElementById(id);
  const fmt = (x) => (Math.round(x * 100) / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const signed = (x) => (x > 0 ? '+' : x < 0 ? '−' : '') + fmt(Math.abs(x));
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  // ---------- storage ----------
  // Browser localStorage is the instant cache; the local data server (server.js) writes a real file + daily backups.
  const API = 'http://127.0.0.1:47615';
  let data = load();
  let fileOK = null; // null = unknown, true = saving to file, false = browser only
  function load() {
    try {
      const d = JSON.parse(localStorage.getItem(KEY));
      if (d && d.sites) return d;
    } catch (e) { /* fall through */ }
    return { v: 1, sites: [{ id: 'shuff', name: 'Shuff' }], cur: { site: 'shuff', game: 'sicbo' }, books: {}, savedAt: 0 };
  }
  function save() {
    data.savedAt = Date.now();
    localStorage.setItem(KEY, JSON.stringify(data));
    pushFile();
  }
  let pushTimer;
  function pushFile() {
    clearTimeout(pushTimer);
    pushTimer = setTimeout(async () => {
      try { fileOK = (await fetch(API + '/data', { method: 'POST', body: JSON.stringify(data) })).ok; } catch (e) { fileOK = false; }
      renderSaveStatus();
    }, 250);
  }
  async function syncFromFile() {
    try {
      const d = await (await fetch(API + '/data')).json();
      fileOK = true;
      if (d && d.sites && (d.savedAt || 0) > (data.savedAt || 0)) {
        data = d;
        localStorage.setItem(KEY, JSON.stringify(data));
        pending = game().emptyPending();
        renderPad(); render();
      } else pushFile(); // browser copy is newer (or file empty): write it out
    } catch (e) { fileOK = false; }
    renderSaveStatus();
  }
  function renderSaveStatus() {
    const el = $('saveStatus');
    if (!el) return;
    el.className = 'save-status ' + (fileOK ? 'ok' : fileOK === false ? 'warn' : '');
    el.textContent = fileOK ? '● Saved to file' : fileOK === false ? '● Browser only' : '● …';
    el.title = fileOK ? 'Data saved to data/betrplayr.json with daily backups in data/backups/' : 'File saving unavailable (open with the Bet-R Play-R launcher). Data is still kept in the browser.';
  }

  function book() {
    const k = data.cur.site + ':' + data.cur.game;
    if (!data.books[k]) data.books[k] = { cfg: Object.assign({}, DEFAULT_CFG), sessions: [{ id: uid(), start: Date.now() }], entries: [] };
    return data.books[k];
  }
  const game = () => GAMES[data.cur.game];
  const curSession = () => book().sessions[book().sessions.length - 1];

  // ---------- ui state ----------
  let pending = game().emptyPending();
  let scope = 'session';
  let bdMode = 'day';
  let noBetArmed = false;
  let view; // last computed

  function compute() {
    const b = book(), g = game();
    const bySession = new Map(b.sessions.map((s) => [s.id, []]));
    for (let idx = 0; idx < b.entries.length; idx++) {
      const e = b.entries[idx];
      const o = g.outcome(e.raw);
      (bySession.get(e.s) || bySession.set(e.s, []).get(e.s)).push(Object.assign({}, e, { o, side: o.side, lossAll: o.lossAll, entryIdx: idx }));
    }
    const all = [];
    let current = null;
    b.sessions.forEach((s, i) => {
      const res = run(bySession.get(s.id) || [], b.cfg);
      res.rows.forEach((r) => { r.sessionNo = i + 1; });
      all.push(...res.rows);
      if (s === curSession()) current = res;
    });
    return { all, current, next: current.next, rows: current.rows };
  }

  // ---------- actions ----------
  function toggleNoBet() {
    noBetArmed = !noBetArmed;
    render();
    toast(noBetArmed ? 'No Bet ARMED — this entry will record as $0 bet' : 'No Bet disarmed');
  }

  function commit(raw) {
    const b = book();
    const entry = { t: Date.now(), s: curSession().id, raw, cfg: Object.assign({}, b.cfg) };
    if (noBetArmed) {
      entry.nb = true;
      noBetArmed = false;
    }
    b.entries.push(entry);
    save();
  }

  function press(key) {
    const res = game().input(pending, key);
    if (!res) return;
    pending = res.pending;
    if (res.error) toast(res.error);
    if (res.commit) commit(res.commit);
    render();
  }

  function undo() {
    const p = game().undoInput(pending);
    if (p) { pending = p; return render(); }
    const b = book();
    const last = b.entries[b.entries.length - 1];
    if (last && last.s === curSession().id) { b.entries.pop(); save(); render(); }
  }

  function clearPending() { pending = game().emptyPending(); render(); }

  function newSession() {
    const b = book();
    if (!b.entries.some((e) => e.s === curSession().id)) return toast('Current session is already empty');
    b.sessions.push({ id: uid(), start: Date.now() });
    pending = game().emptyPending();
    save(); render();
    toast('New session started');
  }

  function switchTo(site, gameId) {
    data.cur = { site, game: gameId };
    pending = game().emptyPending();
    save();
    renderPad();
    render();
  }

  // ---------- render ----------
  function seg(el, options, value, onPick) {
    el.innerHTML = options.map(([v, label]) => `<button data-v="${v}" class="${String(v) === String(value) ? 'on' : ''}">${label}</button>`).join('');
    el.onclick = (e) => { const b = e.target.closest('button'); if (b) onPick(b.dataset.v); };
  }

  function renderPad() { $('pad').innerHTML = game().padHTML(); }

  function render() {
    view = compute();
    renderHeader();
    renderNext();
    $('pending').innerHTML = game().pendingHTML(pending) + (noBetArmed ? '<span class="nobet-indicator">NO BET ARMED</span>' : '');
    const nbBtn = $('noBet');
    if (nbBtn) {
      nbBtn.classList.toggle('armed', noBetArmed);
      nbBtn.innerHTML = `No Bet ${noBetArmed ? '(ARMED) ' : ''}<span class="kbd">X</span>`;
    }
    renderStrip();
    renderSettings();
    renderStats();
  }

  function renderHeader() {
    $('site').innerHTML = data.sites.map((s) => `<option value="${s.id}" ${s.id === data.cur.site ? 'selected' : ''}>${s.name}</option>`).join('');
    seg($('games'), Object.values(GAMES).map((g) => [g.id, g.name]), data.cur.game, (id) => switchTo(data.cur.site, id));
    const b = book();
    const n = view.rows.length;
    $('sessionInfo').textContent = `Session #${b.sessions.length} · ${n} ${game().entryName.toLowerCase()}${n === 1 ? '' : 's'}`;
  }

  function sideTag(side, cls = '') {
    return `<span class="side ${side === 'A' ? 'a' : 'b'} ${cls}">${game().sides[side].short}</span>`;
  }

  function renderNext() {
    const nx = view.next, g = game();
    const last = view.rows[view.rows.length - 1];
    let lastLine = '';
    if (last && (last.result || last.noBet)) {
      if (last.noBet) lastLine = `<div class="last muted">NO BET · skipped ($0) · flow continues</div>`;
      else if (last.setEnd === 'bust') lastLine = `<div class="last loss">SET BUST · ${signed(last.pnl)} · pattern repeated</div>`;
      else if (last.result === 'win') lastLine = `<div class="last win">WIN on bet ${last.bet.step + 1} · ${signed(last.pnl)}</div>`;
      else if (last.result === 'loss') lastLine = `<div class="last loss">Loss · ${signed(last.pnl)}</div>`;
      else if (last.result === 'push') lastLine = `<div class="last push">TIE · PUSH — played as ${g.sides[last.effSide].label} → ${last.setEnd === 'won' ? 'set ends (no money)' : last.setEnd === 'bust' ? 'set bust (no money)' : 'moves to next bet'}</div>`;
    }

    let h;
    if (nx.phase === 'bet') {
      const plan = nx.plan.map((s, i) => `<div class="plan-step ${i < nx.step ? 'done' : i === nx.step ? 'now' : ''}">${sideTag(s)}<em>${nx.mults[i]}x</em></div>`).join('');
      h = `<div class="phase">BET ${nx.step + 1} of ${nx.of}</div>
           <div class="bet-side ${nx.side === 'A' ? 'a' : 'b'}">${g.sides[nx.side].label}</div>
           <div class="bet-amt">${fmt(nx.amount)} <span>(${nx.mult}x)</span></div>
           <div class="plan">${plan}</div>
           <div class="pattern">Fading <b>${nx.pattern}</b> · factor ${sideTag(nx.factor)}</div>`;
    } else if (nx.phase === 'factor') {
      h = `<div class="phase">WAIT</div>
           <div class="bet-side wait">No bet</div>
           <div class="bet-amt"><span>next ${g.entryName.toLowerCase()} sets the factor</span></div>
           <div class="pattern">Pattern <b>${nx.pattern}</b> · ${nx.raw.map((s) => sideTag(s)).join('')}</div>`;
    } else {
      h = `<div class="phase">COLLECTING</div>
           <div class="bet-side wait">${nx.have} / ${nx.need}</div>
           <div class="bet-amt"><span>need ${nx.need} ${g.entryName.toLowerCase()}s for a pattern</span></div>`;
    }
    $('next').className = 'next ' + nx.phase + (nx.phase === 'bet' ? ' side-' + nx.side.toLowerCase() : '');
    $('next').innerHTML = h + lastLine;
  }

  function renderStrip() {
    const g = game();
    const rows = view.rows.slice(-80).reverse();
    $('strip').innerHTML = rows.map((r) => {
      const c = g.chip(r.raw, r.o);
      const sideCls = r.side === 'A' ? 'a' : r.side === 'B' ? 'b' : 't';
      const res = r.noBet ? '<i class="res nb">Ø</i>' : r.result === 'win' ? '<i class="res win">✓</i>' : r.result === 'loss' ? '<i class="res loss">✗</i>' : r.push ? '<i class="res push">P</i>' : '';
      const role = r.role === 'factor' ? '<i class="role">F</i>' : '';
      const end = r.setEnd === 'bust' ? ' bust' : r.setEnd === 'won' ? ' won' : '';
      const as = r.push && r.effSide ? ` as ${g.sides[r.effSide].label}` : '';
      if (r.push && r.effSide) c.sub = '→' + g.sides[r.effSide].short;
      const nbText = r.noBet ? ' [NO BET] ' : '';
      const tip = `${nbText}` + (r.push ? `Tie, played${as || ' as nothing (no prior winner)'} · ` : '') + (r.role === 'factor' ? `Factor · fading ${r.pattern}` : r.bet ? `Bet ${g.sides[r.bet.side].label} ${fmt(r.bet.amount)} → ${r.result}` : '') + ' · click to toggle No Bet';
      return `<div class="chip ${sideCls}${r.lossAll ? ' special' : ''}${end}${r.noBet ? ' no-bet' : ''}" data-entry-idx="${r.entryIdx}" title="${tip}">${role}${res}<b>${c.main}</b><small>${c.sub}</small>${c.flag ? `<i class="flag">${c.flag}</i>` : ''}</div>`;
    }).join('') || '<div class="muted">No entries yet — start tapping.</div>';
  }

  function renderSettings() {
    const b = book();
    seg($('groupSeg'), GROUP_SIZES.map((n) => [n, `${n} <small>(${n - 1} bets)</small>`]), b.cfg.n, (v) => setCfg('n', Number(v)));
    seg($('progSeg'), Object.entries(PROGRESSIONS).map(([k, p]) => [k, seqLabel(k, b.cfg.n - 1)]), b.cfg.prog, (v) => setCfg('prog', v));
    if (document.activeElement !== $('unit')) $('unit').value = b.cfg.unit;
    if (document.activeElement !== $('payout')) $('payout').value = b.cfg.payout;
    const mults = Array.from({ length: b.cfg.n - 1 }, (_, i) => PROGRESSIONS[b.cfg.prog].mult(i));
    const risk = mults.reduce((a, x) => a + x, 0) * b.cfg.unit;
    $('cfgNote').innerHTML = `Set risk: <b>${fmt(risk)}</b> (${mults.map((m) => fmt(m * b.cfg.unit)).join(' / ')})${view.next.phase === 'bet' ? ' · <span class="warn">changes apply from the next set</span>' : ''}`;
  }

  function seqLabel(k, nBets) {
    return Array.from({ length: nBets }, (_, i) => PROGRESSIONS[k].mult(i) + 'x').join(' ');
  }

  function setCfg(k, v) {
    if (k !== 'prog' && !(v >= 0)) return;
    book().cfg[k] = v;
    save(); render();
  }

  function scopeRows() {
    if (scope === 'session') return view.rows;
    if (scope === 'today') {
      const d0 = new Date(); d0.setHours(0, 0, 0, 0);
      return view.all.filter((r) => r.t >= d0.getTime());
    }
    return view.all;
  }

  function renderStats() {
    seg($('scopeSeg'), [['session', 'Session'], ['today', 'Today'], ['all', 'All time']], scope, (v) => { scope = v; renderStats(); });
    seg($('bdSeg'), [['session', 'Session'], ['day', 'Day'], ['hour', 'Hour'], ['block', 'Per 50']], bdMode, (v) => { bdMode = v; renderStats(); });
    const g = game(), rows = scopeRows(), s = stats(rows);
    const pct = (a, b) => (b ? ((a / b) * 100).toFixed(1) + '%' : '–');
    const sideN = s.A + s.B;
    const specialLabel = g.id === 'sicbo' ? 'Triples' : 'Ties';
    const specialN = g.id === 'sicbo' ? s.special : s.ties;
    const tiles = [
      [g.entryName + 's', s.entries],
      [g.sides.A.label, `${s.A} <small>${pct(s.A, sideN)}</small>`, 'a'],
      [g.sides.B.label, `${s.B} <small>${pct(s.B, sideN)}</small>`, 'b'],
      [specialLabel, `${specialN} <small>${pct(specialN, s.entries)}${g.id === 'sicbo' ? '' : ` · ${s.pushes} on bet · ${s.pushEnds} ended set`}</small>`],
      ['Sets won', `${s.won} <small>${pct(s.won, s.sets)}${s.wonFree ? ` · ${s.wonFree} no-money` : ''}</small>`, 'win'],
      ['Sets bust', `${s.bust} <small>${pct(s.bust, s.sets)}</small>`, 'loss'],
      ['Net', signed(s.net), s.net >= 0 ? 'win' : 'loss'],
      ['Net units', signed(s.units)],
      ['Wagered', `${fmt(s.wagered)}${s.skipped ? ` <small>(${s.skipped} skipped)</small>` : ''}`],
      ['Peak', fmt(s.peak)],
      ['Max drawdown', fmt(s.maxDD)],
      ['Bust streak', `${s.bustStreak} <small>max ${s.maxBustStreak}</small>`],
    ];
    $('statGrid').innerHTML = tiles.map(([k, v, c]) => `<div class="tile ${c || ''}"><label>${k}</label><b>${v}</b></div>`).join('');

    const maxStep = Math.max(1, ...s.byStep);
    const used = s.byStep.reduce((m, x, i) => (x ? i + 1 : m), book().cfg.n - 1);
    $('stepBars').innerHTML = `<h4>Set won on bet #</h4>` + s.byStep.slice(0, used).map((x, i) => `<div class="hbar"><span>Bet ${i + 1}</span><div class="track"><div class="fill" style="width:${(x / maxStep) * 100}%"></div></div><em>${x} · ${pct(x, s.sets)}</em></div>`).join('') +
      `<div class="hbar bust"><span>Bust</span><div class="track"><div class="fill" style="width:${(s.bust / maxStep) * 100}%"></div></div><em>${s.bust} · ${pct(s.bust, s.sets)}</em></div>`;

    $('extra').innerHTML = rows.length ? g.extraStats(rows) : '';
    renderBreakdown(rows);
  }

  function renderBreakdown(rows) {
    const groups = new Map();
    const key = {
      session: (r) => 'Session #' + r.sessionNo,
      day: (r) => new Date(r.t).toLocaleDateString('en-CA'),
      hour: (r) => String(new Date(r.t).getHours()).padStart(2, '0') + ':00',
      block: (r, i) => `${Math.floor(i / 50) * 50 + 1}–${Math.floor(i / 50) * 50 + 50}`,
    }[bdMode];
    rows.forEach((r, i) => { const k = key(r, i); (groups.get(k) || groups.set(k, []).get(k)).push(r); });
    let keys = [...groups.keys()];
    if (bdMode === 'hour') keys.sort();
    const g = game();
    let h = `<thead><tr><th></th><th>${g.entryName}s</th><th>${g.sides.A.short}%</th><th>Sets</th><th>Won</th><th>Bust</th><th>Bust%</th><th>Net</th></tr></thead><tbody>`;
    for (const k of keys.reverse()) {
      const s = stats(groups.get(k));
      const n = s.A + s.B;
      h += `<tr><td>${k}</td><td>${s.entries}</td><td>${n ? ((s.A / n) * 100).toFixed(0) : '–'}</td><td>${s.sets}</td><td>${s.won}</td><td>${s.bust}</td><td>${s.sets ? ((s.bust / s.sets) * 100).toFixed(1) : '–'}</td><td class="${s.net >= 0 ? 'win' : 'loss'}">${signed(s.net)}</td></tr>`;
    }
    $('breakdown').innerHTML = h + '</tbody>';
  }

  let toastTimer;
  function toast(msg) {
    const t = $('toast');
    t.textContent = msg; t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 5000);
  }

  // ---------- wiring ----------
  $('pad').addEventListener('click', (e) => { const b = e.target.closest('[data-key]'); if (b) press(b.dataset.key); });
  $('noBet').onclick = toggleNoBet;
  $('undo').onclick = undo;
  $('clear').onclick = clearPending;
  // Double-click a past entry to flip No Bet (single clicks do nothing, so stray clicks can't change history).
  $('strip').addEventListener('dblclick', (e) => {
    const chip = e.target.closest('.chip[data-entry-idx]');
    if (!chip) return;
    const b = book();
    const entry = b.entries[Number(chip.dataset.entryIdx)];
    if (!entry) return;
    entry.nb = !entry.nb;
    save(); render();
    toast(entry.nb ? 'Marked as No Bet ($0)' : 'Marked as bet placed');
  });
  $('newSession').onclick = newSession;
  $('site').onchange = (e) => switchTo(e.target.value, data.cur.game);
  // Inline "add site" field: Enter adds, Esc or clicking away cancels. No dialogs.
  const siteInput = $('newSite');
  $('addSite').onclick = () => { siteInput.hidden = false; siteInput.value = ''; siteInput.focus(); };
  siteInput.onkeydown = (e) => {
    if (e.key === 'Escape') siteInput.hidden = true;
    if (e.key !== 'Enter') return;
    const name = siteInput.value.trim();
    siteInput.hidden = true;
    if (!name) return;
    const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-') || uid();
    if (!data.sites.some((s) => s.id === id)) data.sites.push({ id, name });
    switchTo(id, data.cur.game);
    toast(`Site "${name}" added`);
  };
  siteInput.onblur = () => { siteInput.hidden = true; };
  $('unit').oninput = (e) => { const v = parseFloat(e.target.value); if (v > 0) setCfg('unit', v); };
  $('payout').oninput = (e) => { const v = parseFloat(e.target.value); if (v > 0) setCfg('payout', v); };
  $('export').onclick = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' }));
    a.download = `bet-r-play-r-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    toast('Backup downloaded');
  };
  $('import').onchange = async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    try {
      const d = JSON.parse(await f.text());
      if (!d.sites || !d.books) throw new Error('not a Bet-R Play-R backup');
      // Keep the current data before replacing it, so an import can always be reversed.
      const prev = JSON.stringify(data);
      localStorage.setItem(KEY + '.preimport', prev);
      fetch(API + '/snapshot', { method: 'POST', body: prev }).catch(() => {});
      data = d; save(); pending = game().emptyPending(); renderPad(); render();
      toast('Backup restored · previous data saved in data/backups/');
    } catch (err) { toast('Import failed: ' + err.message); }
    e.target.value = '';
  };

  document.addEventListener('keydown', (e) => {
    if (e.target.matches?.('input, select, textarea') || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'Backspace') { e.preventDefault(); undo(); }
    else if (e.key === 'Escape') clearPending();
    else if (e.key.toLowerCase() === 'x') { e.preventDefault(); toggleNoBet(); }
    else if (e.key.length === 1) press(e.key.toLowerCase());
  });

  renderPad();
  render();
  renderSaveStatus();
  syncFromFile();
})();
