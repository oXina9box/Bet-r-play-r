/* Screen capture, ICONIC21 layouts, and local OCR. No casino-page access or clicks. */
(function (root) {
  const $ = id => document.getElementById(id);
  const presets = {
    sicbo: { result: [.44, .367, .12, .05], dice: [.34, .12, .32, .49] },
    teenpatti: { result: [.44, .32, .13, .065], cards: [.25, .52, .48, .16] },
    kickoff: { result: [.465, .298, .07, .033], red: [.17, .26, .30, .43], blue: [.52, .08, .30, .60] },
  };
  function wagerFields(game) {
    const main = [['A', 'side A'], ['B', 'side B'], ...(game === 'sicbo' ? [] : [['T', 'tie/draw']])];
    const side = game === 'teenpatti' ? [['A_PLUS', 'Player A Pair Plus'], ['B_PLUS', 'Player B Pair Plus'], ['BONUS', '3+3 Bonus']]
      : game === 'sicbo' ? [['ANY_TRIPLE', 'any triple'], ...Array.from({ length: 14 }, (_, i) => [`TOTAL_${i + 4}`, `total ${i + 4}`]),
        ...['SINGLE', 'DOUBLE', 'TRIPLE'].flatMap(type => Array.from({ length: 6 }, (_, i) => [`${type}_${i + 1}`, `${type.toLowerCase()} ${i + 1}`])),
        ...Array.from({ length: 6 }, (_, i) => Array.from({ length: 5 - i }, (_, j) => [`COMBO_${i + 1}${i + j + 2}`, `combination ${i + 1}+${i + j + 2}`])).flat()]
      : Array.from({ length: 6 }, (_, i) => Array.from({ length: 6 }, (_, j) => [`SCORE_${i + 1}${j + 1}`, `score ${i + 1}–${j + 1}`])).flat();
    return [...main, ...side].map(([key, label]) => [`bet${key}`, `Actual wager: ${label} (with currency)`]);
  }
  function canvas(width, height) {
    const c = document.createElement('canvas'); c.width = width; c.height = height; return c;
  }
  function crop(source, rect, scale = 1) {
    const [x, y, w, h] = rect;
    const c = canvas(Math.max(1, Math.round(w * scale)), Math.max(1, Math.round(h * scale)));
    c.getContext('2d').drawImage(source, x, y, w, h, 0, 0, c.width, c.height);
    return c;
  }
  const rgba = c => c.getContext('2d').getImageData(0, 0, c.width, c.height);
  const absolute = (area, r) => [area[0] + r[0] * area[2], area[1] + r[1] * area[3], r[2] * area[2], r[3] * area[3]];

  function dominantSpan(hits, gap, mergeMinimum = Infinity) {
    let best = { count: 0, left: Infinity, right: 0 }, start = 0;
    const spans = [];
    for (let i = 0; i <= hits.length; i++) {
      if (i === hits.length || (i > 0 && hits[i] - hits[i - 1] > gap)) {
        if (i - start > best.count) best = { count: i - start, left: hits[start], right: hits[i - 1] };
        if (i > start) spans.push({ count: i - start, left: hits[start], right: hits[i - 1] });
        start = i;
      }
    }
    const supported = spans.filter(r => r.count >= mergeMinimum && r.count >= best.count * .3).sort((a, b) => b.count - a.count).slice(0, 2);
    return supported.length ? { count: supported.reduce((sum, r) => sum + r.count, 0), left: Math.min(...supported.map(r => r.left)), right: Math.max(...supported.map(r => r.right)) } : best;
  }

  function stadiumBounds(hitRows, start, width) {
    // Crowd gaps vary by row; persistent colored columns retain stadium edges.
    const band = hitRows.slice(Math.max(0, start - 10), start + 65);
    const counts = new Uint16Array(width);
    for (const hits of band) for (const x of hits) counts[x]++;
    const columns = Array.from({ length: width }, (_, x) => x).filter(x => counts[x] >= band.length * .10);
    const span = dominantSpan(columns, Math.max(3, width * .02));
    const left = span.left < width * .01 ? 0 : span.left;
    const right = span.right >= width * .99 ? width - 1 : span.right;
    const w = right - left + 1;
    if (w < width * .22) return null;
    for (let y = Math.max(0, start - Math.ceil(w * .15)); y < start; y++) {
      const hits = hitRows[y].filter(x => x >= left && x <= right);
      if (hits.length > w * .05 && hits[0] < left + w * .08 && hits[hits.length - 1] > right - w * .08) { start = y; break; }
    }
    return { left, right, top: start };
  }

  // ponytail: these presets target the supplied ICONIC21 16:9 desktop tables; adjust regions for other layouts.
  function detectTable(source, game) {
    const small = crop(source, [0, 0, source.width, source.height], Math.min(1, 640 / source.width));
    const { width, height, data } = rgba(small);
    const localBounds = game === 'sicbo' || game === 'teenpatti' || game === 'kickoff';
    const rows = [], hitRows = [];
    for (let y = 0; y < height; y++) {
      let count = 0, left = width, right = 0;
      const hits = [];
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4, r = data[i], g = data[i + 1], b = data[i + 2];
        const hit = game === 'sicbo' ? r > 65 && r > g * 1.45 && r > b * 1.4
          : game === 'teenpatti' ? b > 70 && b > r * 1.4 && b > g * 1.15
          : (r > 65 && r > g * 1.5 && r > b * 1.25) || (b > 65 && b > r * 1.3 && b > g * 1.3) || (r > 65 && b > 65 && r > g * 1.2 && b > g * 1.2);
        if (hit) { count++; left = Math.min(left, x); right = Math.max(right, x); if (localBounds) hits.push(x); }
      }
      // Ignore window outlines; merge blue felt on both sides of the dealer.
      rows.push(localBounds ? dominantSpan(hits, Math.max(3, width * .015), game === 'teenpatti' || game === 'kickoff' ? width * .025 : Infinity) : { count, left, right });
      if (game === 'kickoff') hitRows.push(hits);
    }
    const matches = r => localBounds ? r.count > width * .12 && r.right - r.left + 1 > width * .22 : r.count > width * .40;
    let start = -1;
    for (let y = 0; y < height - 25; y++) {
      if (rows.slice(y, y + 25).filter(matches).length >= 23) { start = y; break; }
    }
    if (start < 0) return null;
    while (start > 0 && (localBounds ? matches(rows[start - 1]) : rows[start - 1].count > width * .1 && rows[start - 1].right - rows[start - 1].left > width * .7)) start--;
    const candidates = rows.slice(start + 10, start + 45).filter(matches);
    const widths = candidates.map(r => r.right - r.left + 1).sort((a, b) => a - b);
    const broad = widths[Math.floor(widths.length * .8)];
    const selected = localBounds ? candidates.filter(r => r.right - r.left + 1 >= broad * .9) : candidates;
    const median = list => list.sort((a, b) => a - b)[Math.floor(list.length / 2)];
    const stadium = game === 'kickoff' ? stadiumBounds(hitRows, start, width) : null;
    if (game === 'kickoff' && !stadium) return null;
    if (stadium) start = stadium.top;
    const left = stadium ? stadium.left : median(selected.map(r => r.left)), right = stadium ? stadium.right : median(selected.map(r => r.right));
    const w = right - left + 1, h = w * 9 / 16;
    if (game === 'teenpatti' || game === 'sicbo') {
      // Toolbar can hide several early felt rows at narrow capture sizes.
      for (let y = Math.max(0, start - Math.ceil(w * .08)); y < start; y++) {
        const r = rows[y];
        if (r.count > width * .12 && Math.abs(r.left - left) < w * .06 && Math.abs(r.right - right) < w * .06) { start = y; break; }
      }
    }
    if (w < width * (localBounds ? .22 : .5) || start + h > height + 3) return null;
    const scale = source.width / width;
    return [left * scale, start * scale, w * scale, h * scale];
  }

  function cardBoxes(source) {
    const { data, width, height } = rgba(source), seen = new Uint8Array(width * height), boxes = [];
    const white = i => Math.min(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]) > 160 &&
      Math.max(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]) - Math.min(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]) < 65;
    for (let i = 0; i < seen.length; i++) {
      if (seen[i] || !white(i)) continue;
      const queue = [i]; seen[i] = 1;
      let left = width, right = 0, top = height, bottom = 0;
      for (let k = 0; k < queue.length; k++) {
        const p = queue[k], x = p % width, y = Math.floor(p / width);
        left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y);
        const neighbors = [x > 0 ? p - 1 : -1, x + 1 < width ? p + 1 : -1, p - width, p + width];
        for (const n of neighbors) if (n >= 0 && n < seen.length && !seen[n] && white(n)) { seen[n] = 1; queue.push(n); }
      }
      const w = right - left + 1, h = bottom - top + 1;
      if (w >= width * .04 && w < width * .18 && h > height * .35 && h / w > 1.05 && h / w < 2.1 && queue.length > w * h * .45) boxes.push([left, top, w, h]);
    }
    return boxes.sort((a, b) => a[0] - b[0]);
  }

  async function recognize(images) {
    const results = [];
    for (let i = 0; i < images.length; i += 16) {
      const response = await fetch('/ocr', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ images: images.slice(i, i + 16) }), signal: AbortSignal.timeout(45000) });
      if (!response.ok) throw new Error(await response.text());
      results.push(...await response.json());
    }
    return Object.fromEntries(results.map(r => [r.id, r]));
  }
  function image(id, source, rect, mode = 'text', scale = 3) {
    const c = crop(source, rect, scale);
    if (id === 'result' || id === 'resultTight' || id === 'resultSoft' || mode === 'rank') {
      const ctx = c.getContext('2d'), pixels = rgba(c);
      for (let i = 0; i < pixels.data.length; i += 4) {
        const [r, g, b] = pixels.data.slice(i, i + 3);
        const ink = mode === 'rank' ? Math.max(r, g, b) < 110 || (r > g * 1.6 && r > b * 1.6 && r > 80 && g < 140)
          : Math.min(r, g, b) > (id === 'resultSoft' ? 180 : 225);
        const value = ink ? 0 : 255;
        pixels.data[i] = value; pixels.data[i + 1] = value; pixels.data[i + 2] = value;
      }
      ctx.putImageData(pixels, 0, 0);
      if (mode === 'rank' || id === 'resultTight' || id === 'resultSoft') {
        const { width, height } = c, seen = new Uint8Array(width * height);
        const removeEdge = start => {
          if (seen[start] || pixels.data[start * 4] !== 0) return;
          const queue = [start]; seen[start] = 1;
          for (let k = 0; k < queue.length; k++) {
            const p = queue[k], x = p % width;
            pixels.data[p * 4] = 255; pixels.data[p * 4 + 1] = 255; pixels.data[p * 4 + 2] = 255;
            for (const n of [x > 0 ? p - 1 : -1, x + 1 < width ? p + 1 : -1, p - width, p + width]) {
              if (n >= 0 && n < seen.length && !seen[n] && pixels.data[n * 4] === 0) { seen[n] = 1; queue.push(n); }
            }
          }
        };
        for (let x = 0; x < width; x++) { removeEdge(x); removeEdge((height - 1) * width + x); }
        for (let y = 0; y < height; y++) { removeEdge(y * width); removeEdge(y * width + width - 1); }
        ctx.putImageData(pixels, 0, 0);
      }
      if (id === 'result') return { id, mode, png: c.toDataURL('image/png') };
      const w = c.width, h = c.height;
      let left = w, right = 0, top = h, bottom = 0;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (pixels.data[(y * w + x) * 4] === 0) {
        left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y);
      }
      if (left <= right && top <= bottom) {
        const padding = mode === 'rank' ? 50 : 20;
        const padded = canvas(right - left + 1 + 2 * padding, bottom - top + 1 + 2 * padding), p = padded.getContext('2d');
        p.fillStyle = '#fff'; p.fillRect(0, 0, padded.width, padded.height);
        p.drawImage(c, left, top, right - left + 1, bottom - top + 1, padding, padding, right - left + 1, bottom - top + 1);
        return { id, mode, png: padded.toDataURL('image/png') };
      }
    }
    return { id, mode, png: c.toDataURL('image/png') };
  }

  async function readFrame(frame, gameId, overrides = {}) {
    const vision = root.ScreenVision;
    const area = overrides.table ? absolute([0, 0, frame.width, frame.height], overrides.table) : detectTable(frame, gameId);
    if (!area) throw new Error('Game table not found. Show the whole game or adjust its region.');
    const layout = { ...presets[gameId], ...overrides };
    const region = name => absolute(area, layout[name]);
    const result = await recognize([image('result', frame, region('result')), image('resultTight', frame, region('result')), image('resultSoft', frame, region('result')), image('resultRaw', frame, region('result'))]);
    const round = String(Date.now());
    const wagers = Object.keys(layout).filter(k => wagerFields(gameId).some(([id]) => id === k));
    let wager = { status: 'unknown' };
    if (wagers.length) {
      const read = await recognize(wagers.map(k => image(k, frame, region(k))));
      const amounts = wagers.map(k => ({ market: k.slice(3), money: vision.parseMoney(read[k].text), confidence: read[k].confidence }));
      if (amounts.every(a => a.money && a.confidence >= 80) && new Set(amounts.map(a => a.money.currency)).size === 1) {
        wager = { status: 'observed', currency: amounts[0].money.currency, bets: amounts.map(a => ({ market: a.market, amount: a.money.amount })) };
      }
    }
    const valid = [result.result, result.resultTight, result.resultSoft, result.resultRaw].filter(r => vision.parseResult(gameId, r.text));
    if (new Set(valid.map(r => JSON.stringify(vision.parseResult(gameId, r.text)))).size > 1) return { observation: null, area, round, hasResult: null, message: 'Result reads disagree; waiting' };
    const resultRead = valid.sort((a, b) => b.confidence - a.confidence)[0] || result.result;
    const parsed = vision.parseResult(gameId, resultRead.text);
    if (!parsed) return { observation: null, area, round, wager, hasResult: false, message: 'Waiting for a completed result banner' };
    if (wager.status === 'observed' && wager.bets.every(b => b.amount === 0)) wager = { status: 'unknown' };
    let confidence = resultRead.confidence, raw;
    if (gameId === 'sicbo') {
      const roll = vision.readDice(rgba(crop(frame, region('dice'))), 3);
      if (!roll) return { observation: null, area, round, wager, hasResult: true, message: 'Dice unclear; waiting for a clean roll' };
      raw = roll.dice; confidence = Math.min(confidence, roll.confidence);
    } else if (gameId === 'kickoff') {
      const red = vision.readDieRegion(rgba(crop(frame, region('red'))));
      const blue = vision.readDieRegion(rgba(crop(frame, region('blue'))));
      if (!red || !blue) return { observation: null, area, round, wager, hasResult: true, message: 'Dice unclear; adjust red and blue die regions' };
      raw = [red.value, blue.value]; confidence = Math.min(confidence, red.confidence, blue.confidence);
    } else {
      const hand = crop(frame, region('cards')), boxes = cardBoxes(hand);
      if (boxes.length !== 6) return { observation: null, area, round, wager, hasResult: true, message: 'Waiting for six unobstructed cards' };
      const ranks = [], suits = [];
      for (let i = 0; i < boxes.length; i++) {
        const [x, y, w, h] = boxes[i];
        ranks.push(image(`card${i}`, hand, [x + w * .02, y + h * .01, w * .52, h * .40], 'rank', 5));
        const glyphs = [[.54, .01, .44, .34, 1], [.54, .02, .40, .35, 1], [.54, .01, .44, .34, 3], [.52, .02, .42, .35, 2]]
          .map(([sx, sy, sw, sh, scale]) => vision.readSuit(rgba(crop(hand, [x + w * sx, y + h * sy, w * sw, h * sh], scale)))).filter(Boolean);
        suits.push(new Set(glyphs.map(g => g.suit)).size === 1 ? glyphs.sort((a, b) => b.confidence - a.confidence)[0] : null);
      }
      const read = await recognize(ranks), cards = [];
      for (let i = 0; i < 6; i++) {
        const rank = read[`card${i}`];
        if (!/^(?:[2-9]|10|J|Q|K|A)$/.test(rank.text) || !suits[i]) return { observation: null, area, round, wager, hasResult: true, message: `Card ${i + 1} rank or suit unclear; nothing recorded` };
        cards.push(rank.text + suits[i].suit);
        confidence = Math.min(confidence, rank.confidence, suits[i].confidence);
      }
      if (new Set(cards).size !== 6) return { observation: null, area, round, wager, hasResult: true, message: 'Duplicate card reading; nothing recorded' };
      raw = { c: cards }; // Cards are grouped by player, unlike manual alternating entry.
    }
    return { area, round, hasResult: true, observation: { round, raw, result: parsed, resultText: resultRead.text, confidence, wager } };
  }

  function init({ getContext, record }) {
    const tracker = root.ScreenCapture.createTracker();
    const preview = $('screenPreview'), status = $('screenStatus');
    const areaDialog = $('screenAreaDialog'), areaPreview = $('screenAreaPreview');
    let stream = null, video = null, timer = null, generation = 0, busy = false, frame = null, area = null, drag = null;
    let selecting = false, selectionDrag = null, selectionEnd = null;
    let overrides = {}, tested = null, bound = null, dimensions = '';
    let wagerState = { stable: {}, candidate: null }, roundClock = null;
    const savedKey = () => { const c = getContext(); return `betrplayr.screen.${c.site}.${c.game.id}`; };
    function loadLayout() {
      try {
        const value = JSON.parse(localStorage.getItem(savedKey()) || '{}');
        overrides = Object.fromEntries(Object.entries(value).filter(([key, r]) =>
          ['table', 'result', 'dice', 'cards', 'red', 'blue', ...wagerFields(getContext().game.id).map(([k]) => k)].includes(key) &&
          Array.isArray(r) && r.length === 4 && r.every(Number.isFinite) && r[0] >= 0 && r[1] >= 0 && r[2] > 0 && r[3] > 0 && r[0] + r[2] <= 1 && r[1] + r[3] <= 1));
      } catch { overrides = {}; }
    }
    function stop(message = 'Stopped') {
      selecting = false; selectionDrag = null; selectionEnd = null; drag = null;
      if (areaDialog.open) areaDialog.close();
      generation++; clearTimeout(timer); timer = null;
      if (stream) stream.getTracks().forEach(t => t.stop());
      stream = null; video = null; bound = null; tested = null; tracker.reset(); wagerState = { stable: {}, candidate: null }; roundClock = null;
      $('screenStart').disabled = false; $('screenStop').disabled = true; $('screenSave').disabled = true;
      document.body.classList.remove('recording'); status.textContent = message;
    }
    function fields() {
      const g = getContext().game.id;
      const names = [['table', 'Whole game table'], ['result', 'Result banner'], 
        ...(g === 'sicbo' ? [['dice', 'Dice bowl']] : g === 'teenpatti' ? [['cards', 'Six face-up cards']] : [['red', 'Red die (tight crop)'], ['blue', 'Blue die (tight crop)']]),
        ...wagerFields(g)];
      $('screenField').innerHTML = names.map(([v, label]) => `<option value="${v}">${label}</option>`).join('');
      loadLayout();
    }
    function paint() {
      if (!frame) return;
      preview.width = frame.width; preview.height = frame.height;
      const ctx = preview.getContext('2d'); ctx.drawImage(frame, 0, 0);
      if (!area) return;
      const regions = { ...presets[getContext().game.id], ...overrides };
      ctx.lineWidth = Math.max(2, frame.width / 700); ctx.strokeStyle = '#52f2a8';
      for (const [key, r] of Object.entries(regions)) {
        if (key === 'table') continue;
        const box = absolute(area, r); ctx.strokeRect(...box);
        ctx.font = `${Math.max(12, frame.width / 95)}px sans-serif`; ctx.fillStyle = '#52f2a8'; ctx.fillText(key, box[0], box[1] - 4);
      }
    }
    async function sample(live = true) {
      if (!frame || selecting || drag) return;
      const token = generation, context = getContext();
      if (busy) {
        timer = setTimeout(() => { if (token === generation) { if (live) tick(); else sample(false); } }, 500);
        return;
      }
      busy = true;
      try {
        const result = await readFrame(frame, context.game.id, overrides);
        if (token !== generation) return;
        area = result.area; paint();
        const now = Date.now();
        if (live && !roundClock) roundClock = root.ScreenCapture.createRoundClock({ entries: context.entries, now });
        const readRound = live ? roundClock.read(result.hasResult, now) : result.round;
        const readWager = result.observation?.wager || result.wager;
        wagerState = root.ScreenCapture.trackWagers(wagerState, readRound, readWager, now);
        const confirmed = wagerState.stable[readRound];
        const observation = result.observation ? { ...result.observation, round: readRound, ...(confirmed ? { wager: confirmed.wager } : {}) } : null;
        const decision = tracker.read(observation, { game: context.game, entries: context.entries });
        status.textContent = result.message || decision.message || '';
        if (!live) {
          tested = ['pending', 'ready'].includes(decision.status) ? observation : null;
          $('screenSave').disabled = !tested || tested.confidence < 80;
          status.textContent = tested ? `Screenshot: ${tested.resultText} · ${new Date(Number(tested.round)).toLocaleString()}, read score ${Math.round(tested.confidence)}/100. Review before recording.` : status.textContent;
        } else if (decision.status === 'ready') {
          if (record(decision.entry, bound)) status.textContent = `Recorded ${context.game.entryName.toLowerCase()} · ${new Date(decision.entry.screen.capturedAt).toLocaleString()} · bets ${decision.entry.wager.status}`;
        }
      } catch (err) {
        if (token === generation) { tracker.reset(); status.textContent = err.message; }
      } finally {
        busy = false;
        if (live && token === generation && stream) timer = setTimeout(tick, 1800);
      }
    }
    function tick() {
      if (selecting || drag) return;
      if (!video || video.readyState < 2) { timer = setTimeout(tick, 1000); return; }
      if (video.videoWidth < 400) { stop('Shared image too small; select the casino tab or window'); return; }
      const size = `${video.videoWidth}x${video.videoHeight}`;
      if (dimensions && size !== dimensions) { stop('Capture size changed. Show the whole game and click Start again.'); return; }
      dimensions = size;
      frame = canvas(video.videoWidth, video.videoHeight); frame.getContext('2d').drawImage(video, 0, 0);
      sample();
    }
    async function start(selectArea = false) {
      if (!navigator.mediaDevices?.getDisplayMedia) { status.textContent = 'Open through run.sh in a browser with screen sharing'; return; }
      stop(); fields(); const token = generation;
      bound = { site: getContext().site, game: getContext().game.id, session: getContext().session };
      $('screenStart').disabled = true;
      try {
        const selected = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 2 }, audio: false });
        if (token !== generation) { selected.getTracks().forEach(t => t.stop()); return; }
        stream = selected; dimensions = ''; frame = null;
        selected.getVideoTracks()[0].onended = () => stop('Screen sharing ended');
        video = document.createElement('video'); video.muted = true; video.srcObject = selected; await video.play();
        if (token !== generation) return;
        $('screenStop').disabled = false; document.body.classList.add('recording');
        status.textContent = 'Reading casino screen locally…';
        if (selectArea) {
          frame = canvas(video.videoWidth, video.videoHeight); frame.getContext('2d').drawImage(video, 0, 0);
          openAreaEditor();
        } else tick();
      } catch (err) { if (token === generation) stop(`Screen sharing unavailable: ${err.message}`); }
    }
    $('screenStart').onclick = () => start();
    $('screenStop').onclick = () => stop();
    $('screenImage').onchange = async e => {
      stop(); fields(); const token = generation, file = e.target.files[0]; if (!file) return;
      try {
        if (file.size > 15e6 || !['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) throw new Error('Choose a PNG, JPEG or WebP under 15 MB');
        const bitmap = await createImageBitmap(file);
        if (token !== generation) { bitmap.close(); return; }
        if (bitmap.width * bitmap.height > 16e6) { bitmap.close(); throw new Error('Screenshot exceeds 16 megapixels'); }
        frame = canvas(bitmap.width, bitmap.height); frame.getContext('2d').drawImage(bitmap, 0, 0); bitmap.close();
        $('screenDetails').open = true; paint(); await sample(false);
      } catch (err) { if (token === generation) status.textContent = err.message; }
      e.target.value = '';
    };
    $('screenSave').onclick = () => {
      if (!tested) return;
      const context = getContext();
      const entry = { raw: tested.raw, screen: { round: tested.round, capturedAt: Date.now(), confidence: tested.confidence, result: tested.resultText }, wager: tested.wager };
      if (record(entry, { site: context.site, game: context.game.id, session: context.session })) status.textContent = `Recorded screenshot · ${new Date(entry.screen.capturedAt).toLocaleString()}`;
      tested = null; $('screenSave').disabled = true;
    };
    function point(e, target = preview) {
      const r = target.getBoundingClientRect();
      return [Math.max(0, Math.min(target.width, (e.clientX - r.left) * target.width / r.width)), Math.max(0, Math.min(target.height, (e.clientY - r.top) * target.height / r.height))];
    }
    function pauseReading() { generation++; clearTimeout(timer); timer = null; tracker.reset(); tested = null; $('screenSave').disabled = true; }
    function resumeReading() { if (stream) tick(); else if (frame) sample(false); }
    function selectionRect(from, to) { return [Math.min(from[0], to[0]), Math.min(from[1], to[1]), Math.abs(to[0] - from[0]), Math.abs(to[1] - from[1])]; }
    function paintSelection() {
      if (!frame) return;
      if (areaPreview.width !== frame.width) areaPreview.width = frame.width;
      if (areaPreview.height !== frame.height) areaPreview.height = frame.height;
      const ctx = areaPreview.getContext('2d'); ctx.drawImage(frame, 0, 0);
      const box = selectionDrag && selectionEnd ? selectionRect(selectionDrag, selectionEnd)
        : overrides.table ? absolute([0, 0, frame.width, frame.height], overrides.table) : null;
      if (!box) return;
      ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fillRect(0, 0, frame.width, frame.height);
      if (box[2] && box[3]) ctx.drawImage(frame, ...box, ...box);
      ctx.strokeStyle = '#52f2a8'; ctx.lineWidth = Math.max(3, frame.width / 400); ctx.strokeRect(...box);
    }
    function openAreaEditor() {
      if (!frame) return start(true);
      pauseReading(); selecting = true; selectionDrag = null; selectionEnd = null;
      $('screenAreaHint').textContent = 'Drag around the whole game video. Recording resumes when you release.';
      status.textContent = 'Draw the game area to watch';
      paintSelection(); areaDialog.showModal();
    }
    function cancelAreaEditor() {
      selecting = false; selectionDrag = null; selectionEnd = null; areaDialog.close();
      status.textContent = stream ? 'Reading casino screen locally…' : 'Selection canceled';
      resumeReading();
    }
    $('screenSelectArea').onclick = openAreaEditor;
    $('screenAreaCancel').onclick = cancelAreaEditor;
    areaDialog.oncancel = e => { e.preventDefault(); cancelAreaEditor(); };
    areaPreview.onpointerdown = e => {
      if (!selecting || !frame) return;
      e.preventDefault(); selectionDrag = point(e, areaPreview); selectionEnd = selectionDrag;
      areaPreview.setPointerCapture(e.pointerId); paintSelection();
    };
    areaPreview.onpointermove = e => { if (selecting && selectionDrag) { selectionEnd = point(e, areaPreview); paintSelection(); } };
    areaPreview.onpointercancel = () => { selectionDrag = null; selectionEnd = null; paintSelection(); };
    areaPreview.onpointerup = e => {
      if (!selecting || !selectionDrag || !frame) return;
      const box = selectionRect(selectionDrag, point(e, areaPreview));
      selectionDrag = null; selectionEnd = null;
      if (box[2] < frame.width * .03 || box[3] < frame.height * .03) {
        $('screenAreaHint').textContent = 'Drag a larger box around the whole game video.'; paintSelection(); return;
      }
      const x = box[0] / frame.width, y = box[1] / frame.height;
      overrides = { ...overrides, table: [x, y, Math.min(1 - x, box[2] / frame.width), Math.min(1 - y, box[3] / frame.height)] };
      area = box; wagerState = { stable: {}, candidate: null };
      try { localStorage.setItem(savedKey(), JSON.stringify(overrides)); }
      catch { status.textContent = 'Watch area set for this session; browser storage unavailable'; }
      selecting = false; areaDialog.close(); $('screenDetails').open = false;
      status.textContent = 'Watch area set; reading locally…'; paint(); resumeReading();
    };
    preview.onpointerdown = e => { if (frame) { drag = point(e); preview.setPointerCapture(e.pointerId); } };
    preview.onpointerup = e => {
      if (!drag || !frame) return;
      const start = drag;
      const end = point(e);
      const rect = [Math.min(start[0], end[0]), Math.min(start[1], end[1]), Math.abs(start[0] - end[0]), Math.abs(start[1] - end[1])];
      stop('Regions changed; click Start after adjustment');
      drag = null; if (rect[2] < 5 || rect[3] < 5) return;
      const name = $('screenField').value, base = name === 'table' ? [0, 0, frame.width, frame.height] : area;
      if (!base) { status.textContent = 'Select Whole game table first'; return; }
      const r = [(rect[0] - base[0]) / base[2], (rect[1] - base[1]) / base[3], rect[2] / base[2], rect[3] / base[3]];
      if (r[0] < 0 || r[1] < 0 || r[0] + r[2] > 1 || r[1] + r[3] > 1) { status.textContent = 'Keep region inside game table'; return; }
      overrides = { ...overrides, [name]: r }; tracker.reset(); tested = null; $('screenSave').disabled = true;
      if (name === 'table') area = rect;
      try { localStorage.setItem(savedKey(), JSON.stringify(overrides)); } catch { status.textContent = 'Layout usable this session; browser storage unavailable'; }
      paint(); if (!stream) sample(false);
    };
    $('screenDefaults').onclick = () => { stop('Regions reset; click Start to record'); overrides = {}; tracker.reset(); tested = null; $('screenSave').disabled = true;
      try { localStorage.removeItem(savedKey()); } catch { /* current session defaults still apply */ }
      area = frame && detectTable(frame, getContext().game.id); paint(); if (!stream) sample(false);
    };
    fields(); $('screenStop').disabled = true; $('screenSave').disabled = true;
    return { stop, refresh: fields };
  }
  root.ScreenReader = { init, readFrame, detectTable, cardBoxes };
})(this);
