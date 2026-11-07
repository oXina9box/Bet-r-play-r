/* Bet-R Play-R app: storage, state, rendering, input. */
(function () {
  const { PROGRESSIONS, GROUP_SIZES, run, stats, analyzeBusts, simulateDelays, recoveryOptions } = window.Engine;
  const GAMES = window.Games;
  const KEY = 'betrplayr.v1';
  const DEFAULT_CFG = { n: 5, prog: 'double', unit: 1, payout: 1, waitBust: 0, waitWin: 1, waitBet: 0, recovery: 0, targetProfit: 0 };
  let manualBetAmount = null;
  let dismissedTripleRoll = null;
  const $ = (id) => document.getElementById(id);
  const fmt = (x) => (Math.round(x * 100) / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const signed = (x) => (x > 0 ? '+' : x < 0 ? '−' : '') + fmt(Math.abs(x));
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const escapeHTML = (value) => String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const { validate, createDefault } = window.AppData;

  // ---------- storage ----------
  // Browser localStorage is the instant cache; the local data server (server.js) writes a real file + daily backups.
  const API = window.location.protocol === 'http:' ? '' : null;
  let data = load();
  let ready = false, canWriteFile = false, cacheOK = true, revision = 0;
  let fileQueue = Promise.resolve();
  let fileOK = null; // null = unknown, true = saving to file, false = browser only
  let fileRevision = null, conflict = false, reconnectTimer;
  try { fileRevision = localStorage.getItem(KEY + '.fileRevision'); } catch {}
  function fileConflict() {
    conflict = true; canWriteFile = false; fileOK = false;
    clearTimeout(pushTimer);
    renderSaveStatus();
    toast('File history changed. Export this window’s backup before reloading; automatic file saving is paused.');
  }
  function load() {
    try {
      const d = JSON.parse(localStorage.getItem(KEY));
      if (d) return validate(d);
    } catch (e) { /* fall through */ }
    return createDefault();
  }
  function cache(value) {
    try {
      localStorage.setItem(KEY, JSON.stringify(value));
      if (fileRevision) localStorage.setItem(KEY + '.fileRevision', fileRevision);
      cacheOK = true; return true;
    }
    catch (e) { cacheOK = false; toast('Browser storage unavailable. Export a backup to keep these changes.'); return false; }
  }
  function save() {
    data = { ...data, savedAt: Date.now() };
    revision++;
    cache(data);
    pushFile();
    renderSaveStatus();
  }
  let pushTimer;
  function pushFile() {
    if (!canWriteFile) return;
    clearTimeout(pushTimer);
    fileOK = null;
    pushTimer = setTimeout(() => {
      const body = JSON.stringify(data), writing = revision;
      // ponytail: serialize disk writes so a slow older save cannot replace a newer one.
      fileQueue = fileQueue.then(async () => {
        if (conflict) return;
        let ok;
        try {
          const response = await fetch(API + '/data', { method: 'POST', headers: { 'Content-Type': 'application/json', 'If-Match': fileRevision }, body, signal: AbortSignal.timeout(5000) });
          if (response.status === 412 || response.status === 428) { fileConflict(); return; }
          ok = response.ok;
          if (ok) {
            fileRevision = response.headers?.get('ETag') || fileRevision;
            // Cache the current edits with the revision they now descend from.
            cache(data);
          }
        } catch (e) { ok = false; }
        if (writing === revision) {
          fileOK = ok; renderSaveStatus();
          if (!ok) pushTimer = setTimeout(() => { if (writing === revision) pushFile(); }, 2000);
        }
      });
      return fileQueue;
    }, 250);
  }
  async function syncFromFile() {
    if (API === null) { fileOK = false; return; }
    try {
      const response = await fetch(API + '/data', { signal: AbortSignal.timeout(5000) });
      if (!response.ok) throw new Error('File load failed');
      const value = await response.json();
      const d = value === null ? null : validate(value);
      const remoteRevision = response.headers?.get('ETag') || null;
      // Offline edits and a newer cache must not silently replace unrelated disk history.
      const localChanges = revision > 0 || (d && (data.savedAt || 0) > (d.savedAt || 0));
      if (d && localChanges && fileRevision !== remoteRevision) { fileConflict(); return; }
      fileRevision = remoteRevision;
      canWriteFile = true;
      fileOK = true;
      if (d && !localChanges && (d.savedAt || 0) >= (data.savedAt || 0)) {
        data = d;
        cache(data);
        if (ready) { pending = game().emptyPending(); renderPad(); render(); }
      } else pushFile();
    } catch (e) {
      canWriteFile = false; fileOK = false;
      clearTimeout(reconnectTimer);
      reconnectTimer = setTimeout(() => { syncFromFile().finally(renderSaveStatus); }, 2000);
    }
  }
  function renderSaveStatus() {
    const el = $('saveStatus');
    if (!el) return;
    el.className = 'save-status ' + (fileOK ? 'ok' : fileOK === false ? 'warn' : '');
    el.textContent = conflict ? '● File conflict — export before reloading' : fileOK ? '● Saved to file' : fileOK === null ? '● Loading / saving…' : cacheOK ? '● Browser only' : '● Not saved';
    el.title = conflict ? 'Another window changed the file. Export this window’s history to preserve its unsaved changes before reconciling the backups.' : fileOK ? 'Data saved to data/betrplayr.json with daily backups in data/backups/' : cacheOK ? 'Current data is kept in browser storage. File connection will be retried automatically.' : 'Browser storage failed. Export a backup to keep changes.';
  }

  function book() {
    const k = data.cur.site + ':' + data.cur.game;
    if (!data.books[k]) data.books[k] = { cfg: { ...DEFAULT_CFG, waitWin: data.cur.game === 'sicbo' ? 0 : DEFAULT_CFG.waitWin }, sessions: [{ id: uid(), start: Date.now() }], entries: [] };
    return data.books[k];
  }
  const game = () => GAMES[data.cur.game];
  const curSession = () => book().sessions[book().sessions.length - 1];

  // ---------- ui state ----------
  let pending = game().emptyPending();
  let scope = 'session';
  let bdMode = 'day';
  let insightTab = 'bust';
  let noBetArmed = false;
  let spokenSignature = '';
  let view; // last computed
  let screenReader = null;
  let voiceHeld = false, voiceBinding = null;
  function cancelVoice() { voiceHeld = false; voiceBinding = null; window.Voice?.cancel?.(); }

  let historyReadStatus = null;
  const manualClaims = new Set();
  const currentBinding = () => ({ site: data.cur.site, game: data.cur.game, session: curSession().id });
  const bindingKey = b => `${b.site}:${b.game}:${b.session}`;
  function renderRollRecovery() {
    const ended = data.cur.game === 'sicbo' && curSession().endedAt !== undefined;
    const retrying = data.cur.game === 'sicbo' && ['reading', 'gap'].includes(historyReadStatus?.status);
    const node = $('rollRecovery');
    const state = ended ? 'ended' : retrying ? 'reading' : 'idle';
    node.hidden = !ended && !retrying;
    node.dataset && (node.dataset.state = state);
    document.body?.setAttribute?.('data-recovery', state);
    if (ended) $('rollRecoveryMessage').textContent = 'Session ended. History saved as-is. Start a new session to continue.';
    else if (retrying) $('rollRecoveryMessage').textContent = historyReadStatus.status === 'gap'
      ? 'Unresolved roll moved outside the visible history. Later rolls are held.'
      : 'Reading history — retrying unresolved results in order.';
    $('rollRecoveryCountdown').textContent = '';
  }
  function detectMissedRoll(round, bound) {
    // History remains available for retries. No manual prompt or session deadline.
    return ready && bound?.game === 'sicbo' && bound.site === data.cur.site &&
      bound.session === curSession().id && curSession().endedAt === undefined;
  }
  function restoreRollRecoveries() {
    manualClaims.clear();
    let changed = false;
    const books = Object.fromEntries(Object.entries(data.books).map(([key, b]) => {
      if (!key.endsWith(':sicbo')) return [key, b];
      const sessions = b.sessions.map(session => {
        if (!session.missedRoll) return session;
        changed = true;
        const { missedRoll, ...kept } = session;
        return kept;
      });
      return [key, { ...b, sessions }];
    }));
    if (changed) { data = { ...data, books }; save(); }
    renderRollRecovery();
  }

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
    if (!ready) return;
    noBetArmed = !noBetArmed;
    render();
    toast(noBetArmed ? 'No Bet ARMED — this entry will record as $0 bet' : 'No Bet disarmed');
  }

  function commit(raw) {
    if (!ready) return;
    const bound = currentBinding();
    if (data.cur.game === 'sicbo' && curSession().endedAt !== undefined) return;
    if (screenReader?.manual?.() === false) return toast('History recovery pending. Let it finish before entering a roll manually.');
    const b = book();
    const entry = { t: Date.now(), s: curSession().id, raw, cfg: Object.assign({}, b.cfg) };
    if (noBetArmed) {
      entry.nb = true;
      noBetArmed = false;
    }
    if (manualBetAmount != null) {
      entry.manualAmount = manualBetAmount;
      manualBetAmount = null;
    }
    const key = `${data.cur.site}:${data.cur.game}`;
    data = { ...data, books: { ...data.books, [key]: { ...b, entries: [...b.entries, entry] } } };
    manualClaims.delete(bindingKey(bound));
    save();
    return true;
  }

  function press(key) {
    if (!ready) return;
    cancelVoice();
    if (data.cur.game === 'sicbo' && curSession().endedAt !== undefined) return toast('Session ended. Start a new session to continue.');
    const res = game().input(pending, key, book().cfg);
    if (!res) return;
    pending = res.pending;
    if (data.cur.game === 'sicbo') {
      if (pending.dice?.length) manualClaims.add(bindingKey(currentBinding()));
      else manualClaims.delete(bindingKey(currentBinding()));
    }
    if (res.error) toast(res.error);
    if (res.commit) commit(res.commit);
    render();
  }

  function undo() {
    if (!ready) return;
    cancelVoice();
    if (data.cur.game === 'sicbo' && curSession().endedAt !== undefined) return;
    const p = game().undoInput(pending);
    if (p) { pending = p; if (!pending.dice?.length) manualClaims.delete(bindingKey(currentBinding())); return render(); }
    const b = book();
    const last = b.entries[b.entries.length - 1];
    if (last && last.s === curSession().id) { b.entries.pop(); manualBetAmount = null; save(); render(); }
  }

  function clearPending() { cancelVoice(); pending = game().emptyPending(); manualBetAmount = null; manualClaims.delete(bindingKey(currentBinding())); render(); }

  function newSession() {
    if (!ready) return;
    cancelVoice();
    if (screenReader?.canSwitch?.() === false) return toast('A verified hand is waiting. Finish or clear manual input, then resume recording.');
    if (!book().entries.some((e) => e.s === curSession().id) && curSession().endedAt === undefined && !curSession().missedRoll) return toast('Current session is already empty');
    screenReader?.stop('New session selected; click Start to record');
    const b = book(), key = `${data.cur.site}:${data.cur.game}`;
    data = { ...data, books: { ...data.books, [key]: { ...b, sessions: [...b.sessions, { id: uid(), start: Date.now() }] } } };
    pending = game().emptyPending();
    noBetArmed = false;
    manualBetAmount = null;
    save(); render();
    toast('New session started');
  }

  function switchTo(site, gameId) {
    if (!ready) return;
    cancelVoice();
    if (screenReader?.canSwitch?.() === false) { $('site').value = data.cur.site; return toast('A verified hand is waiting. Finish or clear manual input, then resume recording.'); }
    screenReader?.stop('Casino/game changed; click Start to record');
    game().emptyPending(); // Cancel an active card timer before leaving its game.
    data.cur = { site, game: gameId };
    pending = game().emptyPending();
    noBetArmed = false;
    manualBetAmount = null;
    save();
    renderPad();
    render();
    screenReader?.refresh();
  }

  // ---------- render ----------
  function seg(el, options, value, onPick) {
    el.innerHTML = options.map(([v, label]) => `<button data-v="${v}" class="${String(v) === String(value) ? 'on' : ''}">${label}</button>`).join('');
    el.onclick = (e) => { const b = e.target.closest('button'); if (b) onPick(b.dataset.v); };
  }

  function renderPad() { $('pad').innerHTML = game().padHTML(book().cfg); }

  function render() {
    view = compute();
    renderHeader();
    renderNext();
    $('pending').innerHTML = game().pendingHTML(pending, book().cfg) + (noBetArmed ? '<span class="nobet-indicator">NO BET ARMED</span>' : '');
    const nbBtn = $('noBet');
    if (nbBtn) {
      nbBtn.classList.toggle('armed', noBetArmed);
      nbBtn.innerHTML = `No Bet ${noBetArmed ? '(ARMED) ' : ''}<span class="kbd">X</span>`;
    }
    renderStrip();
    renderSettings();
    renderStats();
    renderInsights();
    renderRollRecovery();
  }

  function renderHeader() {
    document.body?.setAttribute?.('data-game', data.cur.game);
    $('site').innerHTML = data.sites.map((s) => `<option value="${escapeHTML(s.id)}" ${s.id === data.cur.site ? 'selected' : ''}>${escapeHTML(s.name)}</option>`).join('');
    seg($('games'), Object.values(GAMES).map((g) => [g.id, g.name]), data.cur.game, (id) => switchTo(data.cur.site, id));
    const b = book();
    const n = view.rows.length;
    $('sessionInfo').textContent = `Session #${b.sessions.length} · ${n} ${game().entryName.toLowerCase()}${n === 1 ? '' : 's'}${curSession().endedAt !== undefined ? ' · ENDED' : ''}`;
  }

  function sideTag(side, cls = '') {
    return `<span class="side ${side === 'A' ? 'a' : 'b'} ${cls}">${game().sides[side].short}</span>`;
  }

  function renderNext() {
    if (data.cur.game === 'sicbo' && curSession().endedAt !== undefined) {
      $('next').className = 'next wait';
      $('next').innerHTML = '<div class="phase">SESSION ENDED</div><div class="bet-side wait">Missed roll</div><div class="pattern">History saved as-is. Start a new session to continue.</div><button id="resumeSession">Start new session</button>';
      $('resumeSession')?.addEventListener('click', newSession); return;
    }
    const nx = view.next, g = game();
    const last = view.rows[view.rows.length - 1];
    let lastLine = '';
    if (last && (last.result || last.noBet)) {
      if (last.noBet) lastLine = `<div class="last muted">NO BET · skipped ($0) · flow continues</div>`;
      else if (last.setEnd === 'bust') lastLine = `<div class="last loss">SET BUST · ${signed(last.pnl)} · pattern repeated</div>`;
      else if (last.result === 'win') lastLine = `<div class="last win">${last.recovery ? `RECOVERY WIN (Set ${last.recovery.currentSet} of ${last.recovery.totalSets})` : `WIN on bet ${last.bet.step + 1}`} · ${signed(last.pnl)}</div>`;
      else if (last.result === 'loss') lastLine = `<div class="last loss">Loss · ${signed(last.pnl)}</div>`;
      else if (last.result === 'push') lastLine = `<div class="last push">TIE · PUSH — played as ${g.sides[last.effSide].label} → ${last.setEnd === 'won' ? 'set ends (no money)' : last.setEnd === 'bust' ? 'set bust (no money)' : 'moves to next bet'}</div>`;
    }

    let recBanner = '';
    if (nx.recovery) {
      const rec = nx.recovery;
      const profit = rec.profitPerWin == null ? `${signed(rec.profitMin)} to ${signed(rec.profitMax)} per winning set` : `${signed(rec.profitPerWin)} per winning set`;
      recBanner = `<div class="recovery-banner">⚡ RECOVERY MODE · SET ${rec.currentSet} OF ${rec.totalSets} (${profit})</div>`;
    }

    let alertBanner = '';
    const prob = Engine.specialProbability ? Engine.specialProbability(data.cur.game, view.rows) : null;
    if (prob && (prob.isOverdue || prob.isHigh)) {
      alertBanner = `<div class="special-alert ${prob.isHigh ? 'high' : ''}">${escapeHTML(prob.message)}<small>Past waiting does not increase the next outcome's probability.</small></div>`;
    }

    const b = book();
    let targetBadge = '';
    if (b.cfg.targetProfit > 0) {
      const s = stats(view.rows);
      const targetDol = b.cfg.targetProfit;
      const targetU = targetDol / b.cfg.unit;
      const diffDol = targetDol - s.net;
      const diffU = targetU - s.units;
      const reached = s.net >= targetDol;
      const signDol = diffDol > 0 ? `-$${fmt(diffDol).replace('$', '')}` : `+$${fmt(Math.abs(diffDol)).replace('$', '')}`;
      const signU = diffU > 0 ? `-${diffU.toFixed(1)}u` : `+${Math.abs(diffU).toFixed(1)}u`;
      targetBadge = `
        <div class="target-badge ${reached ? 'achieved' : 'needed'}">
          <span class="target-title">🎯 Target: ${fmt(targetDol)} (${targetU.toFixed(1)}u)</span>
          <span class="target-progress">${reached ? 'Goal Achieved!' : 'Needed:'} <b>${fmt(Math.max(0, diffDol))}</b> (${Math.max(0, diffU).toFixed(1)}u)</span>
          <span class="target-diff">[<b>${signDol}</b> / <b>${signU}</b>]</span>
        </div>
      `;
    }

    let tripleOverlay = '';
    const tripleRisk = (data.cur.game === 'sicbo' && (nx.phase === 'bet' || nx.phase === 'continue'))
      ? Engine.detectTripleRisk('sicbo', view.rows, nx.step)
      : null;
    if (tripleRisk && tripleRisk.due && dismissedTripleRoll !== view.rows.length) {
      const shieldNotice = tripleRisk.shieldRecommended
        ? `<div class="triple-shield-badge">${escapeHTML(tripleRisk.shieldMessage)}</div>`
        : '';
      tripleOverlay = `
        <div id="tripleAlertOverlay" class="triple-overlay ${tripleRisk.urgent ? 'urgent' : 'warning'}">
          <div class="triple-overlay-card">
            <div class="triple-overlay-badge">${tripleRisk.urgent ? '🚨 CRITICAL STEP 5 ALERT' : '⚠️ TRIPLE RISK DETECTED'}</div>
            <div class="triple-overlay-title">${tripleRisk.urgent ? 'HIGH TRIPLE PROBABILITY ON STEP 5' : 'TRIPLE DUE SOON'}</div>
            <div class="triple-overlay-body">${escapeHTML(tripleRisk.message)}</div>
            ${shieldNotice}
            <div class="triple-overlay-actions">
              <button id="tripleOverlaySkip" class="triple-skip-btn ${tripleRisk.urgent ? 'urgent' : ''}">${noBetArmed ? '✓ Bet Skipped (Armed)' : (tripleRisk.urgent ? '🚨 STRONGLY URGED: SKIP THIS BET' : 'Skip This Bet (One-Time)')}</button>
              <button id="tripleOverlayDismiss" class="triple-dismiss-btn">Dismiss</button>
            </div>
          </div>
        </div>
      `;
    }

    if (tripleOverlay) alertBanner = '';

    let dragonBanner = '';
    const dragon = Engine.detectDragon ? Engine.detectDragon(view.rows) : null;
    if (dragon && (nx.phase === 'bet' || nx.phase === 'continue' || nx.phase === 'factor' || nx.phase === 'factor-delay')) {
      dragonBanner = `<div class="dragon-alert ${dragon.action}">${escapeHTML(dragon.message)}</div>`;
    }

    let ladderBadge = '';
    if (nx.ladder) {
      const l = nx.ladder;
      const icon = l.isClimber ? '🧗' : '🪜';
      const name = l.isClimber ? 'Fib Climber' : 'Fib Ladder';
      const bankText = l.bankTarget > 0 ? ` · Bank: <b>${l.bankProfit}/${l.bankTarget}u</b>` : '';
      ladderBadge = `
        <div class="ladder-badge">
          <div><b>${icon} ${name} Step ${l.step}</b> <span>(${l.mult}x stake)</span>${bankText}</div>
          <div class="ladder-flow">Win: <b>${l.dropMult}x</b> · Loss: <b>${l.climbMult}x</b></div>
        </div>
      `;
    }

    const currentAmt = manualBetAmount != null ? manualBetAmount : nx.amount;
    const currentMult = Math.round((currentAmt / b.cfg.unit) * 100) / 100;
    const isManual = manualBetAmount != null && manualBetAmount !== nx.amount;
    const betAmt = `
      <div class="bet-amt interactive${noBetArmed ? ' skip-armed' : ''}">
        <button id="betMinus" class="bet-step-btn" title="Decrease bet by 1 unit (${fmt(b.cfg.unit)})">−</button>
        <span class="bet-val">${fmt(currentAmt)}</span>
        <span class="bet-mult">(${currentMult}x)</span>
        <button id="betPlus" class="bet-step-btn" title="Increase bet by 1 unit (${fmt(b.cfg.unit)})">+</button>
        ${isManual ? `<button id="betReset" class="bet-reset-btn" title="Reset to calculated stake">↺</button>` : ''}
      </div>
    `;

    let h;
    if (nx.phase === 'factor-delay') {
      h = `<div class="phase">FACTOR FOUND · WAITING</div>
           <div class="bet-side wait">Wait ${nx.left}</div>
           <div class="bet-amt"><span>watching ${g.entryName.toLowerCase()}s; a pattern break resets the sequence</span></div>
           <div class="pattern">Fading <b>${nx.pattern}</b> · factor ${sideTag(nx.factor)}</div>`;
    } else if (nx.phase === 'bet') {
      const plan = nx.plan.map((s, i) => `<div class="plan-step ${i < nx.step ? 'done' : i === nx.step ? 'now' : ''}">${sideTag(s)}<em>${nx.mults[i]}x</em></div>`).join('');
      const winNet = currentAmt * (b.cfg.payout == null ? 1 : b.cfg.payout) - (nx.setLost || 0);
      h = `<div class="phase">BET ${nx.step + 1} of ${nx.of}${noBetArmed ? ' · SKIP ARMED ($0)' : ''}</div>
           <div class="bet-side ${nx.side === 'A' ? 'a' : 'b'}">${g.sides[nx.side].label}</div>
           ${betAmt}
           <div class="plan">${plan}</div>
           <div class="pattern">Fading <b>${nx.pattern}</b> · factor ${sideTag(nx.factor)} · <span class="win">Win ${signed(winNet)}</span></div>`;
    } else if (nx.phase === 'continue') {
      h = `<div class="phase">OPTIONAL CONTINUE AFTER BUST</div>
           <div class="bet-side ${nx.side === 'A' ? 'a' : 'b'}">${g.sides[nx.side].label}</div>
           ${betAmt}
           <div class="pattern">Run resumes only when a matching visible wager is detected.</div>`;
    } else if (nx.phase === 'cooldown') {
      const unitWord = nx.left === 1 ? g.entryName.toLowerCase() : g.entryName.toLowerCase() + 's';
      const reason = nx.reason === 'win' ? 'WIN' : 'BUST';
      h = `<div class="phase">COOLDOWN AFTER ${reason}</div>
           <div class="bet-side wait">Wait ${nx.left}</div>
           <div class="bet-amt"><span>sitting out ${nx.left} ${unitWord} before starting a new pattern</span></div>`;
    } else if (nx.phase === 'factor') {
      const preview = nx.ifA && nx.ifB ? ` · If ${sideTag('A')}→${sideTag(nx.ifA)} / If ${sideTag('B')}→${sideTag(nx.ifB)}` : '';
      h = `<div class="phase">WAIT · NEXT SETS FACTOR</div>
           <div class="bet-side wait">No bet</div>
           <div class="bet-amt"><span>next ${g.entryName.toLowerCase()} sets the factor</span></div>
           <div class="pattern">Pattern <b>${nx.pattern}</b> · ${nx.raw.map((s) => sideTag(s)).join('')}${preview}</div>`;
    } else {
      const collected = nx.raw?.length ? `<div class="pattern">${nx.raw.map((s) => sideTag(s)).join('')} · ${nx.need - nx.have} more</div>` : '';
      h = `<div class="phase">COLLECTING · NO BET</div>
           <div class="bet-side wait">${nx.have} / ${nx.need}</div>
           <div class="bet-amt"><span>need ${nx.need} ${g.entryName.toLowerCase()}s for a pattern</span></div>${collected}`;
    }
    $('next').className = 'next ' + nx.phase + (nx.phase === 'bet' ? ' side-' + nx.side.toLowerCase() : '') + (nx.recovery ? ' recovery' : '');
    const skip = nx.phase === 'bet' ? `<button id="skipBetOnce" class="skip-bet ${noBetArmed ? 'armed' : ''}">${noBetArmed ? 'Cancel one-time skip' : 'Skip this bet once'}</button>` : '';
    $('next').innerHTML = tripleOverlay + targetBadge + recBanner + alertBanner + dragonBanner + h + ladderBadge + lastLine + skip;
    $('skipBetOnce')?.addEventListener('click', toggleNoBet);
    $('betMinus')?.addEventListener('click', (e) => {
      e.stopPropagation();
      const cur = manualBetAmount != null ? manualBetAmount : nx.amount;
      manualBetAmount = Math.max(0, Math.round((cur - b.cfg.unit) * 100) / 100);
      render();
    });
    $('betPlus')?.addEventListener('click', (e) => {
      e.stopPropagation();
      const cur = manualBetAmount != null ? manualBetAmount : nx.amount;
      manualBetAmount = Math.round((cur + b.cfg.unit) * 100) / 100;
      render();
    });
    $('betReset')?.addEventListener('click', (e) => {
      e.stopPropagation();
      manualBetAmount = null;
      render();
    });
    $('tripleOverlaySkip')?.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!noBetArmed) toggleNoBet();
      dismissedTripleRoll = view.rows.length;
      render();
    });
    $('tripleOverlayDismiss')?.addEventListener('click', (e) => {
      e.stopPropagation();
      dismissedTripleRoll = view.rows.length;
      render();
    });
    announceNext(last, nx, g);
  }

  function announceNext(last, next, g) {
    if (!last || data.audioFeedback !== true || !window.speechSynthesis || !window.SpeechSynthesisUtterance) return;
    const raw = Array.isArray(last.raw) ? last.raw.join(', ') : last.raw?.c ? last.raw.c.join(', ') : last.raw?.w || '';
    const outcome = last.side ? g.sides[last.side].label : 'tie';
    const result = last.nb || last.noBet ? 'Bet skipped. No money risked.' : last.setEnd === 'bust' ? 'Bust.' : last.setEnd === 'won' ? 'Set won.' : last.result === 'loss' ? 'Bet lost.' : last.result === 'win' ? 'Bet won.' : '';
    const stake = manualBetAmount != null ? manualBetAmount : next.amount;
    const advice = noBetArmed ? 'Skip the next roll. No bet.' : next.phase === 'bet' ? `Bet ${g.sides[next.side].label}, ${fmt(stake)}.`
      : next.phase === 'continue' ? `Optional continue after bust: bet ${g.sides[next.side].label}, ${fmt(stake)}. I will resume this run if that wager is visible.`
        : next.phase === 'factor-delay' ? `Waiting ${next.left} rolls for the pattern.`
          : next.phase === 'cooldown' ? `Waiting ${next.left} rolls after ${next.reason}.`
            : next.phase === 'factor' ? 'No bet. Next roll sets the factor.'
              : `No bet. Collecting ${next.have} of ${next.need} rolls.`;
    const signature = [data.cur.site, g.id, last.s, last.t, next.phase, next.side, stake, next.left, result, noBetArmed].join(':');
    if (signature === spokenSignature) return;
    spokenSignature = signature;
    const detail = last.o.total ? `total ${last.o.total}.` : last.o.red ? `red ${last.o.red}, blue ${last.o.blue}.` : '';
    const text = `${g.entryName}: ${raw}. ${outcome}. ${detail} ${last.lossAll ? 'Triple. ' : ''}${result} ${advice}`;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(new window.SpeechSynthesisUtterance(text));
  }

  function historyChip(r) {
    const g = game();
    const c = g.chip(r.raw, r.o);
    const sideCls = r.side === 'A' ? 'a' : r.side === 'B' ? 'b' : 't';
    const res = r.noBet ? '<i class="res nb">Ø</i>' : r.result === 'win' ? '<i class="res win">✓</i>' : r.result === 'loss' ? '<i class="res loss">✗</i>' : r.push ? '<i class="res push">P</i>' : '';
    const role = r.role === 'factor' ? '<i class="role">F</i>' : r.role === 'factor-wait' ? '<i class="role cd">W</i>' : r.role === 'factor-break' ? '<i class="role cd">↻</i>' : r.role === 'cooldown' ? '<i class="role cd">CD</i>' : '';
    const end = r.setEnd === 'bust' ? ' bust' : r.setEnd === 'won' ? ' won' : '';
    const as = r.push && r.effSide ? ` as ${g.sides[r.effSide].label}` : '';
    if (r.push && r.effSide) c.sub = '→' + g.sides[r.effSide].short;
    if ((g.id === 'teenpatti' || g.id === 'baccarat') && r.screen && r.raw?.w) c.sub = 'winner only';
    const nbText = r.noBet ? ' [NO BET] ' : '';
    const recText = r.recovery ? ` [Recovery ${r.recovery.currentSet}/${r.recovery.totalSets}] ` : '';
    const tip = `${nbText}${recText}` + (r.push ? `Tie, played${as || ' as nothing (no prior winner)'} · ` : '') + (r.role === 'factor' ? `Factor · fading ${r.pattern}` : r.role === 'factor-wait' ? `Delayed bet wait (${r.delayLeft} remaining)` : r.role === 'factor-break' ? 'Pattern broke during delay; sequence reset' : r.role === 'cooldown' ? `Cooldown after ${r.cooldownReason || 'bust'} (${r.cooldownLeft} remaining)` : r.bet ? `Bet ${g.sides[r.bet.side].label} ${fmt(r.bet.amount)} → ${r.result}` : '') + ' · double-click to toggle No Bet';
    return `<div class="chip ${sideCls}${r.lossAll ? ' special' : ''}${end}${r.noBet ? ' no-bet' : ''}" data-entry-idx="${r.entryIdx}" title="${escapeHTML(tip)}">${role}${res}<b>${escapeHTML(c.main)}</b><small>${escapeHTML(c.sub)}</small>${c.flag ? `<i class="flag">${escapeHTML(c.flag)}</i>` : ''}</div>`;
  }


  function renderStrip() {
    const groups = window.History.groupRows(view.rows).slice(-40).reverse();
    $('strip').innerHTML = groups.map(group => {
      const title = group.kind === 'set' ? `Set ${group.setNo} · Group ${group.size} · ${group.status}`
        : group.kind === 'cooldown' ? 'Cooldown' : 'Collecting';
      const bottom = group.factor ? [group.factor, ...(group.waits || []), ...group.bets] : [];
      return `<div class="history-group" data-size="${group.size || ''}" data-set="${group.setNo || ''}">
        <div class="history-title">${escapeHTML(title)}</div>
        <div class="history-pattern">${group.pattern.map(historyChip).join('')}</div>
        ${bottom.length ? `<div class="history-label">Factor, waits &amp; played results</div><div class="history-played">${bottom.map(historyChip).join('')}</div>` : ''}
      </div>`;
    }).join('') || '<div class="muted">No entries yet — start tapping.</div>';
  }

  const MAX_PLAY_PRESETS = {
    baccarat: {
      name: 'Baccarat',
      cfg: { n: 7, prog: 'double', recovery: 0, waitBust: 0 },
      summary: 'Group 7 (6 bets) · Doubling · Recovery off · No wait after bust',
    },
    teenpatti: {
      name: 'Teen Patti',
      cfg: { n: 7, prog: 'double', recovery: 0, waitBust: 0 },
      summary: 'Group 7 (6 bets) · Doubling · Recovery off · No wait after bust',
    },
    sicbo: {
      name: 'Sic Bo',
      cfg: { n: 5, prog: 'double', recovery: 1, waitBust: 0 },
      summary: 'Group 5 (4 bets) · Doubling · 1-set recovery · No wait after bust',
    },
    kickoff: {
      name: 'The Kickoff',
      cfg: { n: 5, prog: 'fib_ladder', recovery: 0, waitBust: 0 },
      summary: 'Group 5 (4 bets) · Continuous Fibonacci ladder · No wait after bust',
    },
  };

  function updateMaxPlayBtn() {
    const btn = $('maxPlay');
    if (!btn) return;
    const curGame = data.cur.game;
    const preset = MAX_PLAY_PRESETS[curGame];
    if (!preset) return;
    const cfg = book().cfg;
    const isMax = cfg.n === preset.cfg.n &&
                  cfg.prog === preset.cfg.prog &&
                  (cfg.recovery || 0) === preset.cfg.recovery &&
                  (cfg.waitBust || 0) === preset.cfg.waitBust;
    btn.classList.toggle('active', isMax);
    btn.innerHTML = isMax ? '✓ Max Play Active' : '⚡ Max Play';
    btn.title = isMax ? `Preset active: ${preset.summary}` : `Apply preset for ${preset.name}: ${preset.summary}`;
  }

  function applyMaxPlay() {
    if (!ready) return;
    const curGame = data.cur.game;
    const preset = MAX_PLAY_PRESETS[curGame];
    if (!preset) return;
    const b = book();
    Object.assign(b.cfg, preset.cfg);
    save();
    render();
    toast(`⚡ Max Play Applied for ${preset.name}: ${preset.summary}`);
  }

  function renderSettings() {
    const b = book();
    updateMaxPlayBtn();
    const isTeenPatti = data.cur.game === 'teenpatti';
    const tpRow = $('teenPattiModeRow');
    if (tpRow) {
      if (tpRow.style) tpRow.style.display = isTeenPatti ? '' : 'none';
      else tpRow.hidden = !isTeenPatti;
      if (isTeenPatti) {
        seg($('teenPattiModeSeg'), [
          ['cards', 'Cards (Rank+Suit)'],
          ['quick', 'Quick 1/2 (1=A, 2=B)'],
        ], b.cfg.entryMode || 'cards', (v) => setCfg('entryMode', v));
      }
    }
    seg($('groupSeg'), GROUP_SIZES.map((n) => [n, `${n} <small>(${n - 1} bets)</small>`]), b.cfg.n, (v) => setCfg('n', Number(v)));
    seg($('progSeg'), Object.entries(PROGRESSIONS).map(([k, p]) => [k, seqLabel(k, b.cfg.n - 1)]), b.cfg.prog, (v) => setCfg('prog', v));

    const isFib = b.cfg.prog === 'fib_ladder' || b.cfg.prog === 'fib_climber';
    const fibBankRow = $('fibBankRow');
    if (fibBankRow) {
      if (fibBankRow.style) fibBankRow.style.display = isFib ? '' : 'none';
      else fibBankRow.hidden = !isFib;
      if (isFib) {
        seg($('fibBankSeg'), [
          [0, 'Off'],
          [10, '10+'],
          [15, '15+'],
          [20, '20+'],
          [25, '25+'],
        ], b.cfg.fibBank || 0, (v) => setCfg('fibBank', Number(v)));
      }
    }

    if (document.activeElement !== $('unit')) $('unit').value = b.cfg.unit;
    if (document.activeElement !== $('payout')) $('payout').value = b.cfg.payout;
    if ($('targetProfit') && document.activeElement !== $('targetProfit')) {
      $('targetProfit').value = b.cfg.targetProfit || '';
    }
    if ($('targetHint')) {
      if (b.cfg.targetProfit > 0) {
        const s = stats(view.rows);
        const tDol = b.cfg.targetProfit;
        const tUnits = tDol / b.cfg.unit;
        const diffDol = tDol - s.net;
        const diffUnits = tUnits - s.units;
        const signDol = diffDol > 0 ? `-$${fmt(diffDol).replace('$', '')}` : `+$${fmt(Math.abs(diffDol)).replace('$', '')}`;
        const signUnits = diffUnits > 0 ? `-${diffUnits.toFixed(1)}u` : `+${Math.abs(diffUnits).toFixed(1)}u`;
        $('targetHint').textContent = `Target: ${fmt(tDol)} (${tUnits.toFixed(1)}u) · Needed: ${fmt(Math.max(0, diffDol))} (${Math.max(0, diffUnits).toFixed(1)}u) [${signDol} / ${signUnits}]`;
      } else {
        $('targetHint').textContent = 'Set a profit goal to track progress.';
      }
    }
    $('audioFeedback').checked = data.audioFeedback === true;
    $('voiceEntry').checked = data.voiceEntry === true;
    $('voiceEntryHelp').textContent = data.cur.game === 'sicbo' ? 'Say three numbers, one through six, in order.'
      : data.cur.game === 'kickoff' ? 'Say two numbers, one through six: Red first, then Blue.'
        : 'Say rank and suit for each card: Player A, B, A, B, A, B. Example: ace spades, king hearts.';
    seg($('waitSeg'), [[0, '0 (none)'], [1, '1 roll'], [2, '2 rolls'], [3, '3 rolls']], b.cfg.waitBust || 0, (v) => setCfg('waitBust', Number(v)));
    seg($('waitWinSeg'), [[0, data.cur.game === 'sicbo' ? '0 (standard)' : '0'], [1, data.cur.game === 'sicbo' ? '1' : '1 (standard)'], [2, '2'], [3, '3'], [4, '4']], b.cfg.waitWin || 0, (v) => setCfg('waitWin', Number(v)));
    seg($('waitBetSeg'), [[0, '0 (none)'], [1, '1'], [2, '2'], [3, '3']], b.cfg.waitBet || 0, (v) => setCfg('waitBet', Number(v)));
    seg($('recSeg'), [
      [0, 'Off (Flat)'],
      [4, '4 Sets'],
      [3, '3 Sets'],
      [2, '2 Sets'],
      [1, '1 Set'],
    ], b.cfg.recovery || 0, (v) => setCfg('recovery', Number(v)));
    renderRecNotes(b.cfg);
    const progObj = PROGRESSIONS[b.cfg.prog] || PROGRESSIONS.double;
    const mults = Array.from({ length: b.cfg.n - 1 }, (_, i) => progObj.mult(i));
    const risk = mults.reduce((a, x) => a + x, 0) * b.cfg.unit;
    const isLadder = b.cfg.prog === 'fib_ladder' || b.cfg.prog === 'fib_climber';
    $('cfgNote').innerHTML = `${isLadder ? 'Starting ladder stakes' : 'Base set stakes'}: <b>${fmt(risk)}</b> (${mults.map((m) => fmt(m * b.cfg.unit)).join(' / ')})${isLadder ? ' · later ladder stakes can be higher' : ' · recovery can increase stakes'}${view.next.phase === 'bet' ? ' · <span class="warn">changes apply from the next set</span>' : ''}`;
  }

  function renderRecNotes(cfg) {
    const el = $('recNotes');
    if (!el) return;
    if (cfg.prog === 'fib_ladder' || cfg.prog === 'fib_climber') {
      const isClimber = cfg.prog === 'fib_climber';
      const drop = cfg.fibDrop != null ? cfg.fibDrop : (isClimber ? 1 : 2);
      const icon = isClimber ? '🧗' : '🪜';
      const name = isClimber ? 'Fib Climber' : 'Fib Ladder';
      const bankNotice = cfg.fibBank > 0 ? ` · Bank profit reset at <b>+${cfg.fibBank}u</b>` : '';
      el.innerHTML = `
        <div class="ladder-badge" style="margin-top:6px; margin-bottom:6px;">
          <div><b>${icon} Continuous ${name} Active</b></div>
          <div class="ladder-flow">Climbs on loss (+1) · Drops ${drop} on win${bankNotice} · Recovery is not guaranteed</div>
        </div>
      `;
      return;
    }
    const opts = recoveryOptions(cfg);
    const activeK = cfg.recovery || 0;
    const baseOpt = opts.find((o) => o.k === 0) || opts[0];

    const rows = opts.map((o) => {
      const isActive = o.k === activeK;
      const targetLabel = o.k === 0 ? 'Off (Flat Reset)' : `<b>${o.k} Set${o.k === 1 ? '' : 's'}</b>`;
      const stakes = o.stakesLabel;
      const winLabel = o.profitPerWinCash == null
        ? `${signed(o.minProfitPerWinCash)} to ${signed(o.maxProfitPerWinCash)} <small class="muted">(varies by bet)</small>`
        : signed(o.profitPerWinCash) + ` <small class="muted">(${o.profitPerWinUnits}u)</small>`;
      const riskLabel = `${o.recSetRiskUnits}u <small class="muted">(${fmt(o.recSetRiskCash)})</small>`;
      const totalLabel = `<span class="rec-total">${o.totalBankrollUnits} units</span> <small class="muted">(${fmt(o.totalBankrollCash)})</small>`;
      return `<tr class="${isActive ? 'active' : ''}" data-k="${o.k}" style="cursor:pointer" title="Click to select ${o.label}">
        <td>${isActive ? '<span class="rec-badge">● </span>' : ''}${targetLabel}</td>
        <td><code>${stakes}</code></td>
        <td class="win">${winLabel}</td>
        <td>${riskLabel}</td>
        <td>${totalLabel}</td>
      </tr>`;
    }).join('');

    el.innerHTML = `
      <div class="rec-notes-head">
        <span>Session Entry Bankroll: <b>Survive 1 Bust + Run Full 2nd Factor</b></span>
        <span>Bust 1 cost: <b>${baseOpt.bust1Units}u</b> (${fmt(baseOpt.bust1Cash)})</span>
      </div>
      <table class="rec-table">
        <thead>
          <tr>
            <th>Recovery Mode</th>
            <th>Stakes (x Unit)</th>
            <th>Win / Set</th>
            <th>2nd Set Risk</th>
            <th>Total Bankroll Needed</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>`;
  }

  function seqLabel(k, nBets) {
    if (k === 'fib_ladder') return '🪜 Fib Ladder';
    if (k === 'fib_climber') return '🧗 Fib Climber';
    const progObj = PROGRESSIONS[k] || PROGRESSIONS.double;
    return Array.from({ length: nBets }, (_, i) => progObj.mult(i) + 'x').join(' ');
  }

  function setCfg(k, v) {
    if (!ready || (k !== 'prog' && k !== 'entryMode' && (!Number.isFinite(v) || !(v >= 0)))) return;
    const b = book(), key = data.cur.site + ':' + data.cur.game;
    try { data = validate({ ...data, books: { ...data.books, [key]: { ...b, cfg: { ...b.cfg, [k]: v } } } }); }
    catch (err) { toast('Invalid setting'); return; }
    save();
    if (k === 'entryMode') renderPad();
    render();
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
    seg($('scopeSeg'), [['session', 'Session'], ['today', 'Today'], ['all', 'All time']], scope, (v) => { scope = v; renderStats(); renderInsights(); });
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
    const observed = rows.filter(r => r.wager?.status === 'observed');
    const currencies = [...new Set(observed.map(r => r.wager.currency))];
    const amounts = currencies.map(c => `${c} ${fmt(observed.filter(r => r.wager.currency === c).reduce((sum, r) => sum + r.wager.bets.reduce((n, b) => n + b.amount, 0), 0))}`);
    $('observedWagers').textContent = `Observed wagers: ${amounts.join(' / ') || 'none read'} · ${rows.filter(r => r.screen && r.wager?.status !== 'observed').length} screen rounds with unknown wagers. Net above uses strategy settings.`;

    const maxStep = Math.max(1, ...s.byStep);
    const used = s.byStep.reduce((m, x, i) => (x ? i + 1 : m), book().cfg.n - 1);
    $('stepBars').innerHTML = `<h4>Set won on bet #</h4>` + s.byStep.slice(0, used).map((x, i) => `<div class="hbar"><span>Bet ${i + 1}</span><div class="track"><div class="fill" style="width:${(x / maxStep) * 100}%"></div></div><em>${x} · ${pct(x, s.sets)}</em></div>`).join('') +
      `<div class="hbar bust"><span>Bust</span><div class="track"><div class="fill" style="width:${(s.bust / maxStep) * 100}%"></div></div><em>${s.bust} · ${pct(s.bust, s.sets)}</em></div>`;

    $('extra').innerHTML = g.extraStats(rows);
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
    if (!keys.length) {
      h += `<tr><td>Session #${book().sessions.length}</td><td>0</td><td>–</td><td>0</td><td>0</td><td>0</td><td>–</td><td class="win">${signed(0)}</td></tr>`;
    }
    for (const k of keys.reverse()) {
      const s = stats(groups.get(k));
      const n = s.A + s.B;
      h += `<tr><td>${k}</td><td>${s.entries}</td><td>${n ? ((s.A / n) * 100).toFixed(0) : '–'}</td><td>${s.sets}</td><td>${s.won}</td><td>${s.bust}</td><td>${s.sets ? ((s.bust / s.sets) * 100).toFixed(1) : '–'}</td><td class="${s.net >= 0 ? 'win' : 'loss'}">${signed(s.net)}</td></tr>`;
    }
    $('breakdown').innerHTML = h + '</tbody>';
  }

  function renderInsights() {
    const b = book();
    const rows = scopeRows();
    seg($('insightSeg'), [['bust', 'Play Past Bust'], ['delays', 'Re-Entry Delays']], insightTab, (v) => { insightTab = v; renderInsights(); });

    const cEl = $('insightContent');
    if (!cEl) return;

    if (insightTab === 'bust') {
      const maxExtra = 4;
      const res = analyzeBusts(rows, maxExtra);
      let h = `<div class="insight-desc">Hypothetical additional P&amp;L from extending each historical progression up to 1–${maxExtra} extra bets. Uses observed outcomes within the same session, stopping on resolution. ${res.total} bust${res.total === 1 ? '' : 's'} in selected scope. Stakes follow each set's recorded settings; results do not predict future outcomes.</div>`;
      if (res.total === 0) {
        h += `<div class="insight-callout">No busts recorded yet in this scope. As you play, any bust sets will be analyzed here in real-time.</div>`;
      } else {
        let cumHits = 0;
        let tableRows = '';
        for (let i = 0; i < maxExtra; i++) {
          cumHits += res.countsByExtra[i];
          const evaluated = res.evaluatedByExtra[i], pendingCount = res.pendingByExtra[i];
          const cumPct = evaluated ? ((cumHits / evaluated) * 100).toFixed(1) + '%' : '–';
          const pnl = res.pnlImpact[i];
          tableRows += `<tr>
            <td style="text-align:left">Up to ${i + 1} extra bet${i ? 's' : ''}</td>
            <td>${res.countsByExtra[i]}</td>
            <td>${cumHits} / ${evaluated} (${cumPct})${pendingCount ? ` <small class="muted">${pendingCount} pending</small>` : ''}</td>
            <td class="${pnl > 0 ? 'win' : pnl < 0 ? 'loss' : ''}">${evaluated ? signed(pnl) : 'Pending'}</td>
          </tr>`;
        }
        h += `<div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th style="text-align:left">Extension horizon</th>
                <th>Resolved on bet</th>
                <th>Resolved / evaluated</th>
                <th>Observed extra P&amp;L</th>
              </tr>
            </thead>
            <tbody>${tableRows}</tbody>
          </table>
        </div>`;

        h += `<div class="insight-callout">${res.evaluatedByExtra.some((n) => n > 0) ? 'Each horizon excludes pending outcomes, so evaluated samples can differ. Additional stakes can increase losses.' : 'Pending: no extension outcomes have been fully observed yet.'}</div>`;
      }
      cEl.innerHTML = h;
    } else {
      const entries = rows.map((r) => ({ side: r.side, lossAll: r.lossAll, nb: r.noBet, s: r.s, sessionNo: r.sessionNo, cfg: r.cfg }));
      const delays = simulateDelays(entries, b.cfg, [0, 1, 2, 3]);
      const curDelay = b.cfg.waitBust || 0;
      let h = `<div class="insight-desc">Simulates how waiting 0, 1, 2, or 3 rolls after a bust affects total sets, win rate, net P&amp;L, and max drawdown across this exact roll history.</div>`;
      let tableRows = '';
      for (const d of delays) {
        const s = d.stats;
        const isCurrent = d.delay === curDelay;
        const bustPct = s.sets ? ((s.bust / s.sets) * 100).toFixed(1) + '%' : '–';
        const applyBtn = isCurrent
          ? `<span class="badge muted">Active</span>`
          : `<button class="ghost apply-btn" data-delay="${d.delay}">Apply</button>`;
        tableRows += `<tr>
          <td style="text-align:left">${d.delay} roll${d.delay === 1 ? '' : 's'}${isCurrent ? ' <small class="win">●</small>' : ''}</td>
          <td>${s.sets}</td>
          <td>${s.won}</td>
          <td>${s.bust} <small class="muted">(${bustPct})</small></td>
          <td class="${s.net >= 0 ? 'win' : 'loss'}">${signed(s.net)}</td>
          <td>${fmt(s.maxDD)}</td>
          <td style="text-align:center">${applyBtn}</td>
        </tr>`;
      }
      h += `<div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th style="text-align:left">Wait</th>
              <th>Sets</th>
              <th>Won</th>
              <th>Bust</th>
              <th>Net P&amp;L</th>
              <th>Max DD</th>
              <th style="text-align:center">Action</th>
            </tr>
          </thead>
          <tbody>${tableRows}</tbody>
        </table>
      </div>`;

      const best = delays.reduce((acc, cur) => (cur.stats.net > acc.stats.net ? cur : acc), delays[0]);
      if (best.stats.sets > 0 && best.delay !== curDelay) {
        h += `<div class="insight-callout"><b>Historical comparison:</b> Waiting ${best.delay} roll${best.delay === 1 ? '' : 's'} had the highest net P&amp;L (${signed(best.stats.net)}) in this dataset. This does not predict future results.</div>`;
      } else {
        h += `<div class="insight-callout">Replays past rolls to test whether cooling down after a bust aligns your entry with favorable rolls or if immediate re-entry performs better.</div>`;
      }
      cEl.innerHTML = h;
    }
  }

  let toastTimer;
  function toast(msg) {
    const t = $('toast');
    t.textContent = msg; t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 5000);
  }

  async function replaceData(next, backupKey) {
    cancelVoice();
    if (screenReader?.canSwitch?.() === false) throw new Error('A verified hand is waiting. Finish or clear manual input, then resume recording.');
    screenReader?.stop('Data changed; click Start to record');
    const replacement = validate({ ...next, savedAt: Date.now() });
    const prev = JSON.stringify(data);
    // Both browser writes must succeed before replacing live data or scheduling a disk write.
    localStorage.setItem(KEY + backupKey, prev);
    localStorage.setItem(KEY, JSON.stringify(replacement));
    game().emptyPending(); // Imported/reset data can select a different game.
    let snapshotOK = false;
    if (canWriteFile) {
      try {
        const response = await fetch(API + '/snapshot', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: prev, signal: AbortSignal.timeout(5000) });
        snapshotOK = response.ok;
      } catch (e) { snapshotOK = false; }
    }
    data = replacement;
    restoreRollRecoveries();
    cacheOK = true;
    revision++;
    noBetArmed = false;
    pending = game().emptyPending();
    pushFile();
    renderPad(); render(); renderSaveStatus();
    return snapshotOK ? 'previous data backed up to file and browser' : 'previous data kept in browser backup';
  }

  // ---------- wiring ----------
  function wire() {
  $('voiceEntry').onchange = (e) => {
    cancelVoice();
    if (e.target.checked && !window.Voice?.isSupported()) {
      e.target.checked = false;
      return toast('Microphone speech recognition is not supported in this browser.');
    }
    data = validate({ ...data, voiceEntry: !!e.target.checked });
    save(); render();
    toast(data.voiceEntry ? 'Hold Space, speak the cards or dice, then release.' : 'Voice entry off');
  };
  $('audioFeedback').onchange = (e) => {
    data = validate({ ...data, audioFeedback: !!e.target.checked });
    if (!data.audioFeedback) window.speechSynthesis?.cancel();
    spokenSignature = '';
    save(); render();
    toast(data.audioFeedback ? 'Spoken feedback on' : 'Spoken feedback off');
  };
  if (window.ScreenReader) screenReader = window.ScreenReader.init({
    getContext: () => ({ site: data.cur.site, game: game(), session: curSession().id, entries: book().entries, ended: curSession().endedAt !== undefined }),
    rollDetected: detectMissedRoll,
    readingStatus: status => { historyReadStatus = status; renderRollRecovery(); },
    record: (observation, bound, evidence = {}) => {
      if (!ready || !bound || bound.site !== data.cur.site || bound.game !== data.cur.game || bound.session !== curSession().id) return false;
      if (voiceBinding && bindingKey(voiceBinding) === bindingKey(bound)) return false;
      if (bound.game === 'sicbo') {
        if (curSession().endedAt !== undefined) return false;
        if (manualClaims.has(bindingKey(bound)) || pending.dice?.length) return false;
      }
      if ((bound.game === 'teenpatti' || bound.game === 'baccarat') && (pending.cards?.length || pending.active)) return false;
      const key = `${data.cur.site}:${data.cur.game}`, b = book();
      if (b.entries.some(e => e.screen?.round === observation.screen.round)) return false;
      const entry = { t: Date.now(), s: curSession().id, cfg: { ...b.cfg }, ...observation, ...(noBetArmed ? { nb: true } : {}) };
      try { data = validate({ ...data, books: { ...data.books, [key]: { ...b, entries: [...b.entries, entry] } } }); }
      catch { toast('Screen reading invalid; nothing recorded'); return false; }
      manualClaims.delete(bindingKey(bound));
      pending = game().emptyPending(); noBetArmed = false; save(); render(); return true;
    },
  });
  $('pad').addEventListener('click', (e) => { const b = e.target.closest('[data-key]'); if (b) press(b.dataset.key); });
  $('insightContent').addEventListener('click', (e) => {
    const btn = e.target.closest('.apply-btn[data-delay]');
    if (btn) {
      const d = Number(btn.dataset.delay);
      setCfg('waitBust', d);
      toast(`Wait after bust set to ${d} roll${d === 1 ? '' : 's'}`);
    }
  });
  $('recNotes').addEventListener('click', (e) => {
    const tr = e.target.closest('tr[data-k]');
    if (tr && tr.dataset.k != null) {
      const k = Number(tr.dataset.k);
      setCfg('recovery', k);
      toast(`Recovery mode set to ${k === 0 ? 'Off (Flat)' : k + ' sets'}`);
    }
  });
  if ($('maxPlay')) $('maxPlay').onclick = applyMaxPlay;
  if ($('voiceBtn')) $('voiceBtn').onclick = toggleVoice;
  $('noBet').onclick = toggleNoBet;
  $('undo').onclick = undo;
  $('clear').onclick = clearPending;
  // Double-click a past entry to flip No Bet (single clicks do nothing, so stray clicks can't change history).
  $('strip').addEventListener('dblclick', (e) => {
    if (!ready) return;
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
    if (!ready) return;
    if (e.key === 'Escape') siteInput.hidden = true;
    if (e.key !== 'Enter') return;
    const name = siteInput.value.trim();
    siteInput.hidden = true;
    if (!name) return;
    if (screenReader?.canSwitch?.() === false) return toast('A verified hand is waiting. Finish or clear manual input, then resume recording.');
    const id = (name.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 128).replace(/^-+|-+$/g, '') || uid());
    if (!data.sites.some((s) => s.id === id)) {
      try { data = validate({ ...data, sites: [...data.sites, { id, name }] }); }
      catch (err) { toast('Invalid site name (maximum 1000 characters)'); return; }
    }
    switchTo(id, data.cur.game);
    toast(`Site "${name}" added`);
  };
  siteInput.onblur = () => { siteInput.hidden = true; };
  $('unit').oninput = (e) => { const v = parseFloat(e.target.value); if (v > 0) setCfg('unit', v); };
  $('payout').oninput = (e) => { const v = parseFloat(e.target.value); if (v > 0) setCfg('payout', v); };
  if ($('targetProfit')) {
    $('targetProfit').oninput = (e) => {
      const v = parseFloat(e.target.value);
      setCfg('targetProfit', v > 0 ? v : 0);
    };
  }
  $('export').onclick = () => {
    const a = document.createElement('a');
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' }));
    a.href = url;
    a.download = `bet-r-play-r-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL?.(url), 1000);
    toast('Backup downloaded');
  };
  $('import').onchange = async (e) => {
    if (!ready) return;
    const f = e.target.files[0];
    if (!f) return;
    try {
      const d = validate(JSON.parse(await f.text()));
      ready = false;
      const backup = await replaceData(d, '.preimport');
      toast('Backup restored · ' + backup);
    } catch (err) { toast('Import failed: ' + err.message); }
    finally { ready = true; }
    e.target.value = '';
  };
  $('resetAll').onclick = async () => {
    if (!ready) return;
    ready = false;
    try { const backup = await replaceData(createDefault(), '.prereset'); toast('All data cleared · ' + backup); }
    catch (err) { toast('Reset failed: ' + err.message); }
    finally { ready = true; }
  };

  function updateVoiceUI(listening) {
    const btn = $('voiceBtn');
    if (btn) {
      btn.classList.toggle('listening', listening);
      btn.textContent = listening ? 'Listening — release Space' : 'Hold Space';
    }
  }
  function showVoiceTranscript(msg) {
    const el = $('voiceTranscript');
    if (el) { el.hidden = false; el.textContent = msg; }
  }
  function toggleVoice() { toast('Enable Voice entry in Options, then hold Space to speak and release to enter.'); }
  if (window.Voice?.isSupported()) window.Voice.init({
    onStateChange: ({ listening }) => updateVoiceUI(listening),
    onInterim: ({ transcript }) => showVoiceTranscript(transcript),
    onError: message => { voiceHeld = false; voiceBinding = null; toast(message); },
    onResult: ({ transcript }) => {
      const bound = voiceBinding; voiceBinding = null;
      if (!ready || !data.voiceEntry || !bound || bindingKey(bound) !== bindingKey(currentBinding())) return;
      const parsed = window.Voice.parseEntry(transcript, data.cur.game);
      showVoiceTranscript(transcript);
      if (parsed.error) return toast(parsed.error + ' Nothing recorded.');
      const keys = parsed.keys, g = game();
      if ((g.id === 'sicbo' || g.id === 'kickoff') && keys.length + pending.dice.length !== (g.id === 'sicbo' ? 3 : 2)) {
        return toast('Incorrect number of dice. Nothing recorded.');
      }
      // Validate the entire utterance before changing pending input or recording.
      let next = JSON.parse(JSON.stringify(pending)), raw = null;
      for (let i = 0; i < keys.length; i++) {
        const result = g.input(next, keys[i]);
        if (!result || result.error || (result.commit && i !== keys.length - 1)) return toast((result?.error || 'Too many cards or dice.') + ' Nothing recorded.');
        next = result.pending;
        if (result.commit) raw = result.commit;
      }
      if (raw && !commit(raw)) return;
      pending = next;
      if (g.id === 'sicbo') manualClaims.delete(bindingKey(bound));
      render();
      toast(raw ? 'Voice entry recorded.' : 'Cards entered. Hold Space for the next card.');
    },
  });
  document.addEventListener('keyup', e => {
    if (e.key !== ' ' || !voiceHeld) return;
    e.preventDefault(); voiceHeld = false; window.Voice.stop();
  });
  window.addEventListener?.('blur', cancelVoice);
  document.addEventListener('visibilitychange', () => { if (document.hidden) cancelVoice(); });

  if (window.Games?.teenpatti?.registerAutoCommit) {
    window.Games.teenpatti.registerAutoCommit(() => {
      if (!ready || data.cur.game !== 'teenpatti') return;
      const res = game().confirmActive ? game().confirmActive(pending) : null;
      if (!res) return;
      if (res.error) toast(res.error);
      pending = res.pending;
      if (res.commit) commit(res.commit);
      render();
    });
  }

  if (window.Games?.baccarat?.registerAutoCommit) {
    window.Games.baccarat.registerAutoCommit(() => {
      if (!ready || data.cur.game !== 'baccarat') return;
      const res = game().confirmActive ? game().confirmActive(pending) : null;
      if (!res) return;
      if (res.error) toast(res.error);
      pending = res.pending;
      if (res.commit) commit(res.commit);
      render();
    });
  }

  document.addEventListener('keydown', (e) => {
    if (!ready || $('optionsMenu')?.matches?.(':popover-open') || $('screenAreaDialog')?.open) return;
    if (e.target.matches?.('input, select, textarea') || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === ' ' && data.voiceEntry) {
      e.preventDefault();
      if (e.repeat || voiceHeld || voiceBinding) return;
      voiceBinding = currentBinding(); voiceHeld = true;
      window.speechSynthesis?.cancel();
      if (!window.Voice?.start()) { voiceHeld = false; voiceBinding = null; }
      return;
    }
    if (e.key === 'Backspace') { e.preventDefault(); undo(); }
    else if (e.key === 'Escape') clearPending();
    else if (['Enter', ' ', 'Tab'].includes(e.key) && (data.cur.game === 'teenpatti' || data.cur.game === 'baccarat') && pending.active) {
      e.preventDefault(); press(e.key === ' ' ? 'space' : e.key.toLowerCase());
    }
    else if (e.key.toLowerCase() === 'v') {
      e.preventDefault();
      toggleVoice();
    }
    else if (e.key.toLowerCase() === 'x') { e.preventDefault(); toggleNoBet(); }
    else if (/^[0-9]$/.test(e.key)) { e.preventDefault(); press(e.key); }
    else if (e.key.length === 1) press(e.key.toLowerCase());
  });
  }

  // Handlers are installed only after reconciliation; early clicks cannot replace file history.
  document.querySelectorAll('button, input, select').forEach((el) => { el.disabled = true; });
  renderSaveStatus();
  syncFromFile().finally(() => {
    pending = game().emptyPending();
    ready = true;
    renderPad(); render(); renderSaveStatus();
    document.querySelectorAll('button, input, select').forEach((el) => { el.disabled = false; });
    wire();
    restoreRollRecoveries();
  });
})();
