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

  async function recognize(images, timeoutMs = 45000) {
    const results = [];
    for (let i = 0; i < images.length; i += 16) {
      const controller = new AbortController(); let deadline;
      try {
        const reading = fetch('/ocr', { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ images: images.slice(i, i + 16) }), signal: controller.signal }).then(async response => {
          if (!response.ok) throw new Error(await response.text());
          return response.json();
        });
        const timeout = new Promise((_, reject) => { deadline = setTimeout(() => {
          controller.abort(); reject(new Error('OCR slow; retrying visible history'));
        }, timeoutMs); });
        results.push(...await Promise.race([reading, timeout]));
      } finally { clearTimeout(deadline); }
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

  // The history column has a light or dark background depending on the result.
  function historyCrop(source, rect, scale = 5, padding = 35) {
    const c = crop(source, rect, scale), ctx = c.getContext('2d'), p = rgba(c);
    const luma = (r, g, b) => .299 * r + .587 * g + .114 * b;
    let lightCount = 0;
    for (let i = 0; i < p.data.length; i += 4) if (luma(p.data[i], p.data[i + 1], p.data[i + 2]) > 150) lightCount++;
    const lightBackground = lightCount > c.width * c.height / 2;
    for (let i = 0; i < p.data.length; i += 4) {
      const light = luma(p.data[i], p.data[i + 1], p.data[i + 2]);
      const ink = lightBackground ? light < 125 : light > 120;
      p.data[i] = p.data[i + 1] = p.data[i + 2] = ink ? 0 : 255;
    }
    // Casino column outlines touch the crop edge; isolated digits stay inside.
    const clearEdge = start => {
      if (p.data[start * 4] !== 0) return;
      const queue = [start]; p.data[start * 4] = p.data[start * 4 + 1] = p.data[start * 4 + 2] = 255;
      for (let k = 0; k < queue.length; k++) {
        const index = queue[k], x = index % c.width;
        for (const n of [x > 0 ? index - 1 : -1, x < c.width - 1 ? index + 1 : -1, index - c.width, index + c.width]) {
          if (n < 0 || n >= c.width * c.height || p.data[n * 4] !== 0) continue;
          p.data[n * 4] = p.data[n * 4 + 1] = p.data[n * 4 + 2] = 255; queue.push(n);
        }
      }
    };
    for (let x = 0; x < c.width; x++) { clearEdge(x); clearEdge((c.height - 1) * c.width + x); }
    for (let y = 0; y < c.height; y++) { clearEdge(y * c.width); clearEdge(y * c.width + c.width - 1); }
    ctx.putImageData(p, 0, 0);
    let left = c.width, right = -1, top = c.height, bottom = -1;
    for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) if (p.data[(y * c.width + x) * 4] === 0) {
      left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y);
    }
    if (right >= left && bottom >= top) {
      const trimmed = canvas(right - left + 1 + padding * 2, bottom - top + 1 + padding * 2), t = trimmed.getContext('2d');
      t.fillStyle = '#fff'; t.fillRect(0, 0, trimmed.width, trimmed.height);
      t.drawImage(c, left, top, right - left + 1, bottom - top + 1, padding, padding, right - left + 1, bottom - top + 1);
      const factor = Math.min(1, 48 / Math.max(trimmed.width, trimmed.height));
      const normalized = crop(trimmed, [0, 0, trimmed.width, trimmed.height], factor);
      return normalized;
    }
    return c;
  }
  function historyImage(id, source, rect) {
    return { id, mode: /(?:^history|_)[123]$/.test(id) ? 'digit' : 'digits', png: historyCrop(source, rect).toDataURL('image/png') };
  }

  function historyStep(source, rect, direction) {
    const [x, y, w, h] = rect, sign = direction === 'right' ? -1 : 1;
    const start = sign === 1 ? x : x + w - 1;
    const band = crop(source, [0, y + h * .035, source.width, Math.max(2, h * .04)]), p = rgba(band);
    const runs = []; let run = null;
    for (let d = 0; d <= Math.ceil(w * 4.5); d++) {
      const sx = Math.round(start + sign * d);
      let bright = 0;
      if (sx >= 0 && sx < p.width) for (let row = 0; row < p.height; row++) {
        const i = (row * p.width + sx) * 4; bright += (p.data[i] + p.data[i + 1] + p.data[i + 2]) / 3;
      }
      const filled = d < w * 4.5 && sx >= 0 && sx < p.width && bright / p.height > 50;
      if (filled && run === null) run = d;
      if (!filled && run !== null) { if (d - run >= w * .45) runs.push(run); run = null; }
    }
    const distance = runs.length >= 2 ? runs[1] - runs[0] : w;
    return distance >= w * .75 && distance <= w * 1.7 ? distance : w;
  }
  function historyCells(rect, direction, width, step = rect[2]) {
    const [x, y, w, h] = rect;
    const cells = Array.from({ length: 4 }, (_, i) => [x, y + h * i / 4, w, h / 4]);
    const sign = direction === 'right' ? -1 : 1;
    const columns = [0, 1, 2].map(i => [x + sign * step * i, y, w, h]);
    return { cells, columns: columns.filter(r => r[0] >= 0 && r[0] + r[2] <= width) };
  }
  function historyColumns(source, selection, direction) {
    const [x, y, w, h] = selection;
    const area = crop(source, selection), { data, width, height } = rgba(area);
    const seen = new Uint8Array(width * height), headers = [];
    const cream = p => data[p * 4] > 160 && data[p * 4 + 1] > 145 && data[p * 4 + 2] > 110 && data[p * 4] - data[p * 4 + 2] > 8;
    for (let p = 0; p < seen.length; p++) {
      if (seen[p] || !cream(p)) continue;
      const queue = [p]; seen[p] = 1;
      let left = width, right = 0, top = height, bottom = 0;
      for (let i = 0; i < queue.length; i++) {
        const n = queue[i], cx = n % width, cy = Math.floor(n / width);
        left = Math.min(left, cx); right = Math.max(right, cx); top = Math.min(top, cy); bottom = Math.max(bottom, cy);
        for (const next of [cx ? n - 1 : -1, cx + 1 < width ? n + 1 : -1, n - width, n + width]) {
          if (next >= 0 && next < seen.length && !seen[next] && cream(next)) { seen[next] = 1; queue.push(next); }
        }
      }
      const cw = right - left + 1, ch = bottom - top + 1;
      if (cw >= 8 && ch >= 8 && cw / ch > .6 && cw / ch < 1.5 && ch < height * .4 && queue.length > cw * ch * .45) headers.push({ left, top, cw, ch });
    }
    headers.sort((a, b) => a.left - b.left);
    const groups = headers.filter(a => headers.some(b => a !== b && Math.abs(a.top - b.top) < Math.max(a.ch, b.ch) * .25 && Math.abs(a.ch - b.ch) < a.ch * .3));
    if (groups.length >= 2) {
      const sorted = direction === 'right' ? groups.reverse() : groups;
      const size = sorted.map(a => a.ch).sort((a, b) => a - b)[Math.floor(sorted.length / 2)];
      const margin = Math.max(1, Math.round(size * .1));
      const columns = sorted.slice(0, 3).map(a => [x + a.left - margin, y + a.top - margin, a.cw + margin * 2, size * 4 - margin * 2])
        .filter(r => r[0] >= 0 && r[1] >= 0 && r[0] + r[2] <= source.width && r[1] + r[3] <= source.height);
      if (columns.length) return { columns, rect: columns[0], cells: historyCells(columns[0], direction, source.width).cells, stride: columns.length > 1 ? Math.abs(columns[1][0] - columns[0][0]) : 0 };
    }
    // Existing single-column selections also cover synthetic or monochrome cards.
    if (w > h * .7) return { columns: [], rect: null, cells: [], stride: 0 };
    const stride = historyStep(source, selection, direction), columns = historyCells(selection, direction, source.width, stride).columns;
    return { columns, rect: selection, cells: historyCells(selection, direction, source.width).cells, stride };
  }
  function historyHasText(source, rect) {
    return historyCells(rect, 'left', source.width).cells.every(row => {
      const pixels = rgba(crop(source, row)), histogram = new Uint32Array(256);
      for (let i = 0; i < pixels.data.length; i += 4) histogram[Math.round((pixels.data[i] + pixels.data[i + 1] + pixels.data[i + 2]) / 3)]++;
      const count = pixels.width * pixels.height;
      let sum = 0, low = 0, high = 255;
      for (let i = 0; i < 256; i++) { sum += histogram[i]; if (sum >= count * .02) { low = i; break; } }
      sum = 0;
      for (let i = 255; i >= 0; i--) { sum += histogram[i]; if (sum >= count * .02) { high = i; break; } }
      return high - low >= 24;
    });
  }

  async function readSicBoFrame(frame, profile, overrides = {}) {
    const vision = root.ScreenVision, regions = root.SicBoRegions;
    const labels = ['Newest', 'Previous', 'Two back'];
    const empty = { history: null, histories: [null, null, null] };
    if (!profile || !regions.matches(profile, frame.width, frame.height)) return { message: profile ? 'Capture size changed; recalibrate history' : 'Select history and all three roll boxes', readings: empty };
    if (!regions.complete(profile)) return { message: 'Select history and all three roll boxes', readings: empty };
    const columns = regions.rollKeys.map(key => regions.pixels(profile.rolls[key], frame.width, frame.height));
    const failures = columns.map((rect, i) => historyHasText(frame, rect) ? null : `${labels[i]}: insufficient image detail`);
    const rows = columns.map(rect => historyCells(rect, 'left', frame.width).cells);
    const readingId = (column, row) => column ? `history${column}_${row}` : `history${row}`;
    const requests = rows.flatMap((cells, column) => failures[column] ? [] : cells.map((rect, row) => historyImage(readingId(column, row), frame, rect)));
    const selectedWagers = Object.keys(overrides).filter(k => wagerFields('sicbo').some(([id]) => id === k));
    const area = selectedWagers.length ? (overrides.table ? absolute([0, 0, frame.width, frame.height], overrides.table) : detectTable(frame, 'sicbo')) : null;
    const wagers = area ? selectedWagers : [];
    requests.push(...wagers.map(k => image(k, frame, absolute(area, overrides[k]))));
    let read;
    try { read = await recognize(requests, 5000); }
    catch (err) {
      const reason = /slow|timeout|abort/i.test(err.message) ? 'OCR service timeout' : 'OCR failed';
      return { message: `${labels[0]}: ${reason}`, failures: labels.map(label => `${label}: ${reason}`), readings: empty };
    }
    const histories = [0, 1, 2].map(column => {
      const values = rows[column]?.map((_, row) => read[readingId(column, row)]);
      const parsed = values?.every(item => item && item.confidence >= 80)
        ? vision.parseSicBoHistory(values.map(item => item.text).join(' ')) : null;
      return parsed ? { total: parsed.total, values: parsed.dice, confidence: Math.min(...values.map(item => item.confidence)) } : null;
    });
    histories.forEach((history, i) => { if (!history && !failures[i]) failures[i] = `${labels[i]}: OCR failed`; });
    const amounts = wagers.map(k => ({ market: k.slice(3), money: vision.parseMoney(read[k]?.text), confidence: read[k]?.confidence }));
    const wager = amounts.length && amounts.every(a => a.money && a.confidence >= 80) &&
      new Set(amounts.map(a => a.money.currency)).size === 1 && amounts.some(a => a.money.amount > 0)
      ? { status: 'observed', currency: amounts[0].money.currency, bets: amounts.map(a => ({ market: a.market, amount: a.money.amount })) }
      : { status: 'unknown' };
    return { message: failures.find(Boolean), failures, readings: { history: histories[0], histories }, wager };
  }

  async function readFrame(frame, gameId, overrides = {}) {
    if (gameId === 'sicbo') return readSicBoFrame(frame, overrides.profile || null, overrides);
    const vision = root.ScreenVision;
    const area = overrides.table ? absolute([0, 0, frame.width, frame.height], overrides.table) : detectTable(frame, gameId);
    if (!area) throw new Error('Game table not found. Show the whole game or adjust its region.');
    const layout = { ...presets[gameId], ...overrides };
    const region = name => absolute(area, layout[name]);
    const teenLive = gameId === 'teenpatti' && overrides.source;
    const fast = teenLive && overrides.source === 'winner';
    const badge = !teenLive || vision.teenBadge(rgba(crop(frame, region('result'))));
    const requests = fast ? [image('resultTight', frame, region('result'))] : [image('result', frame, region('result')), image('resultTight', frame, region('result')), image('resultSoft', frame, region('result')), image('resultRaw', frame, region('result'))];
    if (teenLive && layout.phase && overrides.phaseText) requests.push(image('phase', frame, region('phase')));
    const result = await recognize(requests);
    const phase = teenLive && result.phase?.confidence >= 80 && result.phase.text.trim().toUpperCase().replace(/\s+/g, ' ') === overrides.phaseText;
    const phaseReading = teenLive ? { text: String(result.phase?.text || '').slice(0, 200), confidence: Number.isFinite(result.phase?.confidence) ? result.phase.confidence : 0, matched: Boolean(phase) } : null;
    const round = String(Date.now());
    const wagers = teenLive && (fast || !phase) ? [] : Object.keys(layout).filter(k => wagerFields(gameId).some(([id]) => id === k));
    let wager = { status: 'unknown' };
    if (wagers.length) {
      try {
        const read = await recognize(wagers.map(k => image(k, frame, region(k))), teenLive ? 1000 : 45000);
        const amounts = wagers.map(k => ({ market: k.slice(3), money: vision.parseMoney(read[k]?.text), confidence: read[k]?.confidence }));
        if (amounts.every(a => a.money && a.confidence >= 80) && new Set(amounts.map(a => a.money.currency)).size === 1) {
          wager = { status: 'observed', currency: amounts[0].money.currency, bets: amounts.map(a => ({ market: a.market, amount: a.money.amount })) };
        }
      } catch (err) { if (!teenLive) throw err; }
    }
    const valid = [result.result, result.resultTight, result.resultSoft, result.resultRaw].filter(r => r && vision.parseResult(gameId, r.text));
    if (new Set(valid.map(r => JSON.stringify(vision.parseResult(gameId, r.text)))).size > 1) return { observation: null, area, round, phaseReading, hasResult: null, message: 'Result reads disagree; waiting' };
    const resultRead = valid.sort((a, b) => b.confidence - a.confidence)[0] || result.result || result.resultTight;
    const parsed = badge ? vision.parseResult(gameId, resultRead.text) : null;
    if (!parsed) return { observation: null, area, round, wager, phase, phaseReading, hasResult: teenLive && vision.parseResult(gameId, resultRead.text) ? true : teenLive ? null : false, message: teenLive ? (phase ? 'Betting phase detected' : 'Result badge or text unclear; waiting') : 'Waiting for a completed result banner' };
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
    } else if (fast) {
      raw = { w: parsed.side || 'T' };
    } else {
      const hand = crop(frame, region('cards')), boxes = cardBoxes(hand);
      if (boxes.length !== 6) return { observation: null, area, round, wager, phase, phaseReading, hasResult: true, message: 'Waiting for six unobstructed cards' };
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
        if (!/^(?:[2-9]|10|J|Q|K|A)$/.test(rank.text) || !suits[i]) return { observation: null, area, round, wager, phase, phaseReading, hasResult: true, message: `Card ${i + 1} rank or suit unclear; nothing recorded` };
        cards.push(rank.text + suits[i].suit);
        confidence = Math.min(confidence, rank.confidence, suits[i].confidence);
      }
      if (new Set(cards).size !== 6) return { observation: null, area, round, wager, phase, phaseReading, hasResult: true, message: 'Duplicate card reading; nothing recorded' };
      raw = { c: cards }; // Cards are grouped by player, unlike manual alternating entry.
    }
    return { area, round, phase, phaseReading, hasResult: true, observation: { round, raw, result: parsed, resultText: resultRead.text, confidence, wager, ...(fast ? { source: 'winner' } : {}) } };
  }

  function init({ getContext, record, rollDetected = () => {}, readingStatus = () => {} }) {
    const tracker = root.ScreenCapture.createTracker();
    const preview = $('screenPreview'), status = $('screenStatus');
    const areaDialog = $('screenAreaDialog'), areaPreview = $('screenAreaPreview');
    let stream = null, video = null, timer = null, generation = 0, busyGeneration = null, frame = null, area = null, drag = null;
    let selecting = false, selectionDrag = null, selectionEnd = null;
    let overrides = {}, tested = null, bound = null, dimensions = '';
    let wagerState = { stable: {}, candidate: null }, roundClock = null;
    let profile = null, historyTracker = null, selectedRegion = 'table', frameAt = 0, frameNumber = 0, pendingEntry = null;
    let monitorTimer = null, monitorFrame = null, monitorNumber = 0;
    let synced = false, syncAt = null;
    let captureCheck = null, checkAfter = 0;
    let shareConfirmed = false;
    let teenConfig = {}, teenClock = null, teenPending = null, teenConfirmed = false, teenDrawn = new Set();
    const teenKey = () => `${savedKey()}.teen`;
    function saveTeen() { try { localStorage.setItem(teenKey(), JSON.stringify(teenConfig)); } catch { status.textContent = 'Calibration kept for this session; browser storage unavailable'; } }
    const sameSlots = (a, b) => a && b && a.length === b.length && a.every((slot, i) => slot.length === b[i].length && slot.reduce((sum, value, j) => sum + Math.abs(value - b[i][j]), 0) / slot.length <= .65);
    function captureProblem(message) {
      if (captureCheck) $('screenSourceDetails').open = true;
      captureCheck = null;
      $('screenSyncStart').disabled = true;
      $('screenCaptureIndicator').dataset.active = 'false';
      $('screenCaptureIndicator').textContent = 'History not readable';
      $('screenHistoryStatus').textContent = message;
      $('screenHistoryStatus').dataset.status = 'waiting';
      status.textContent = message;
      if (synced) readingStatus({ status: 'reading', message });
    }
    function visualKey(source, rect) {
      const [x, y, w, h] = rect;
      return Array.from({ length: 4 }, (_, row) => {
        const glyph = historyCrop(source, [x, y + row * h / 4, w, h / 4], 2, 4), small = canvas(12, 16);
        small.getContext('2d').drawImage(glyph, 0, 0, 12, 16);
        const p = rgba(small).data;
        return Array.from({ length: 192 }, (_, i) => Math.round(p[i * 4] / 16));
      }).flat();
    }
    function historySlots(source) {
      if (!root.SicBoRegions.complete(profile) || !root.SicBoRegions.matches(profile, source.width, source.height)) return null;
      return root.SicBoRegions.rollKeys.map(key => visualKey(source, root.SicBoRegions.pixels(profile.rolls[key], source.width, source.height)));
    }
    function watchHistory(source, at, slots = historySlots(source)) {
      if (!historyTracker || !slots) return;
      const decision = historyTracker.watch({ revision: profile.revision, at, frame: `watch${++monitorNumber}`, slots });
      if (decision.event) rollDetected(decision.event, bound);
      if (synced) readingStatus(decision);
      if (synced && syncAt !== null) {
        const elapsed = Math.floor((at - syncAt) / 1000);
        $('screenTimingStatus').textContent = decision.status === 'gap' ? decision.message
          : elapsed >= 35 ? 'Update overdue — retrying visible history' : `Synced · next update due in ${35 - elapsed}s`;
        if (decision.event) syncAt = decision.event.at;
      }
      return decision;
    }
    function monitor() {
      if (!stream || !sicbo()) return;
      monitorTimer = setTimeout(monitor, 250);
      if (drag || selectionDrag || !video || video.readyState < 2 || !video.videoWidth || !video.videoHeight) return;
      const width = video.videoWidth, height = video.videoHeight;
      if (!monitorFrame || monitorFrame.width !== width || monitorFrame.height !== height) monitorFrame = canvas(width, height);
      monitorFrame.getContext('2d').drawImage(video, 0, 0);
      frame = monitorFrame; frameAt = Date.now();
      if (selecting) { paintSelection(); return; }
      if (selectedRoll) { paint(); return; }
      paint();
      if (!root.SicBoRegions.complete(profile)) { captureProblem('Select history and all three roll boxes.'); return; }
      if (!root.SicBoRegions.matches(profile, width, height)) { captureProblem('Shared screen size changed. Recalibrate history and roll boxes.'); return; }
      const slots = historySlots(monitorFrame);
      if (!slots) { captureProblem('History area is blank or incomplete. Redraw around the visible total and three dice; keep two older columns in view.'); return; }
      watchHistory(monitorFrame, frameAt, slots);
      if (!synced && (!captureCheck || !sameSlots(captureCheck.slots, slots))) validateHistory(monitorFrame, frameAt, slots);
      else if (synced) $('screenSyncStart').disabled = false;
    }
    async function validateHistory(source, at, slots) {
      const token = generation;
      if (!shareConfirmed) { captureProblem('Confirm the saved calibration or select history for this shared screen.'); return; }
      if (busyGeneration === token || Date.now() < checkAfter) return;
      busyGeneration = token; checkAfter = Date.now() + 1000;
      $('screenSyncStart').disabled = true;
      status.textContent = 'Checking the selected history numbers…';
      try {
        const result = await readSicBoFrame(source, profile);
        if (token !== generation || synced) return;
        if (!sameSlots(slots, historySlots(frame))) return;
        const history = result.readings.history;
        updateRollStatuses(result);
        if (!result.readings.histories?.every(Boolean)) {
          captureProblem(result.message || 'Cannot read the total and three dice in all three columns. Redraw the newest column tightly, keeping two older columns visible.'); return;
        }
        captureCheck = { revision: profile.revision, slots };
        $('screenSyncStart').disabled = false;
        $('screenCaptureIndicator').dataset.active = 'true'; $('screenCaptureIndicator').textContent = 'Ready to sync';
        $('screenHistoryStatus').textContent = `Verified: ${history.values.join(' + ')} = ${history.total}`;
        $('screenHistoryStatus').dataset.status = 'agree';
        status.textContent = 'History verified. Click Start synced two seconds after the next history update.';
      } catch (err) { if (token === generation) captureProblem(`History check failed: ${err.message}`); }
      finally { if (busyGeneration === token) busyGeneration = null; }
    }
    const profileKey = () => `betrplayr.sicbo.regions.${getContext().site}`;
    const sicbo = () => getContext().game.id === 'sicbo';
    function resetConsensus() {
      historyTracker = profile ? root.SicBoHistory.create({ revision: profile.revision, entries: getContext().entries, minStableMs: 500 }) : null;
      pendingEntry = null;
      captureCheck = null; checkAfter = 0;
    }
    function saveProfile() {
      try { localStorage.setItem(profileKey(), JSON.stringify(profile)); return true; }
      catch { return false; }
    }
    const savedKey = () => { const c = getContext(); return `betrplayr.screen.${c.site}.${c.game.id}`; };
    function loadLayout() {
      try {
        const value = JSON.parse(localStorage.getItem(savedKey()) || '{}');
        overrides = Object.fromEntries(Object.entries(value).filter(([key, r]) =>
          ['table', 'result', 'phase', 'dice', 'cards', 'red', 'blue', ...wagerFields(getContext().game.id).map(([k]) => k)].includes(key) &&
          Array.isArray(r) && r.length === 4 && r.every(Number.isFinite) && r[0] >= 0 && r[1] >= 0 && r[2] > 0 && r[3] > 0 && r[0] + r[2] <= 1 && r[1] + r[3] <= 1));
      } catch { overrides = {}; }
      try { teenConfig = JSON.parse(localStorage.getItem(teenKey()) || '{}'); } catch { teenConfig = {}; }
      if (!teenConfig || typeof teenConfig !== 'object' || Array.isArray(teenConfig)) teenConfig = {};
      if (getContext().game.id === 'teenpatti') {
        $('screenTeenSource').value = teenConfig.source === 'winner' ? 'winner' : 'cards';
        $('screenTeenPhaseText').value = typeof teenConfig.phaseText === 'string' ? teenConfig.phaseText : '';
      }
      if (sicbo()) {
        try { profile = root.SicBoRegions.read(localStorage.getItem(profileKey())); } catch { profile = null; }
        $('screenHistoryDirection').value = profile?.direction || 'left';
        resetConsensus();
      }
    }
    function stop(message = 'Stopped') {
      clearTimeout(monitorTimer); monitorTimer = null; monitorFrame = null;
      synced = false; syncAt = null;
      shareConfirmed = false;
      readingStatus(null);
      selecting = false; selectionDrag = null; selectionEnd = null; drag = null; selectedRoll = null; rollDrag = null; rollEnd = null;
      if (areaDialog.open) areaDialog.close();
      generation++; clearTimeout(timer); timer = null;
      const priorStream = stream; stream = null;
      if (priorStream) priorStream.getTracks().forEach(t => t.stop());
      video = null; bound = null; tested = null; tracker.reset(); wagerState = { stable: {}, candidate: null }; roundClock = null; teenClock = null;
      teenConfirmed = false; teenDrawn = new Set(); $('screenTeenConfirm').disabled = true;
      $('screenStart').disabled = false; $('screenStop').disabled = true; $('screenSave').disabled = true;
      $('screenSyncStart').disabled = true;
      $('screenSyncStart').textContent = 'Start synced';
      document.body.classList.remove('recording'); status.textContent = message;
      $('screenCaptureIndicator').dataset.active = 'false'; $('screenCaptureIndicator').textContent = 'Capture off'; resetConsensus();
      $('screenTimingStatus').textContent = 'Select history area, then start two seconds after it updates.';
      $('screenSourceLabel').textContent = 'No screen shared'; $('screenSourceDetails').open = true;
      for (const id of ['screenSourcePreview', 'screenHistoryPreview']) {
        const target = $(id); target.getContext('2d').clearRect(0, 0, target.width, target.height);
      }
    }
    function fields() {
      const g = getContext().game.id;
      const names = [['table', 'Whole game table'], ...(g === 'sicbo' ? [] : [['result', 'Result banner']]),
        ...(g === 'sicbo' ? [] : g === 'teenpatti' ? [['cards', 'Six face-up cards']] : [['red', 'Red die (tight crop)'], ['blue', 'Blue die (tight crop)']]),
        ...wagerFields(g)];
      $('screenField').innerHTML = names.map(([v, label]) => `<option value="${v}">${label}</option>`).join('');
      loadLayout();
      $('screenSicBoCalibration').hidden = g !== 'sicbo';
      $('screenTeenCalibration').hidden = g !== 'teenpatti';
      $('screenSelectArea').hidden = g === 'sicbo';
      $('screenStart').textContent = g === 'sicbo' ? 'Share screen' : 'Start';
      $('screenSyncStart').hidden = g !== 'sicbo';
    }
    const rollNames = { newest: 'Newest', previous: 'Previous', twoBack: 'TwoBack' };
    const historyPreview = $('screenHistoryCalibrationPreview');
    let selectedRoll = null, rollDrag = null, rollEnd = null;
    function updateRollStatuses(result) {
      root.SicBoRegions.rollKeys.forEach((key, i) => {
        const h = result.readings.histories?.[i];
        $(`screenRoll${rollNames[key]}Status`).textContent = h ? `${h.total} [${h.values.join(', ')}]` : result.failures?.[i] || 'Select this roll';
      });
    }
    function paintHistory(box) {
      historyPreview.width = Math.max(1, Math.round(box[2])); historyPreview.height = Math.max(1, Math.round(box[3]));
      const ctx = historyPreview.getContext('2d'); ctx.drawImage(frame, ...box, 0, 0, historyPreview.width, historyPreview.height);
      for (const key of root.SicBoRegions.rollKeys) {
        const r = profile.rolls[key], target = $(`screenRoll${rollNames[key]}Preview`);
        if (!r) { target.getContext('2d').clearRect(0, 0, target.width, target.height); continue; }
        const rect = root.SicBoRegions.pixels(r, frame.width, frame.height);
        target.width = Math.max(1, Math.round(rect[2])); target.height = Math.max(1, Math.round(rect[3]));
        target.getContext('2d').drawImage(frame, ...rect, 0, 0, target.width, target.height);
        ctx.strokeStyle = '#52f2a8'; ctx.lineWidth = 2; ctx.strokeRect(rect[0] - box[0], rect[1] - box[1], rect[2], rect[3]);
      }
      if (rollDrag && rollEnd) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.strokeRect(...selectionRect(rollDrag, rollEnd)); }
    }
    document.querySelectorAll('[data-screen-roll]').forEach(button => button.onclick = () => {
      if (!frame || !root.SicBoRegions.matches(profile, frame.width, frame.height) || !profile.regions.history) { status.textContent = 'Select history first'; return; }
      if (synced && historyTracker?.pending()) { status.textContent = 'History recovery pending. Stop before changing boxes.'; return; }
      pauseReading(); selectedRoll = button.dataset.screenRoll; rollDrag = null; rollEnd = null;
      $(`screenRoll${rollNames[selectedRoll]}Status`).textContent = 'Drag this roll on the history preview';
    });
    historyPreview.onpointerdown = e => {
      if (!selectedRoll) return; e.preventDefault(); rollDrag = point(e, historyPreview); rollEnd = rollDrag; historyPreview.setPointerCapture(e.pointerId);
    };
    historyPreview.onpointermove = e => { if (rollDrag) { rollEnd = point(e, historyPreview); paint(); } };
    historyPreview.onpointercancel = () => { rollDrag = null; rollEnd = null; paint(); };
    historyPreview.onpointerup = e => {
      if (!selectedRoll || !rollDrag || !frame) return;
      const rect = selectionRect(rollDrag, point(e, historyPreview)), history = root.SicBoRegions.pixels(profile.regions.history, frame.width, frame.height);
      rollDrag = null; rollEnd = null;
      const normalized = root.SicBoRegions.normalize([history[0] + rect[0] * history[2] / historyPreview.width, history[1] + rect[1] * history[3] / historyPreview.height], [history[0] + (rect[0] + rect[2]) * history[2] / historyPreview.width, history[1] + (rect[1] + rect[3]) * history[3] / historyPreview.height], frame.width, frame.height);
      try {
        if (!normalized) throw new TypeError('Drag a larger roll box');
        profile = root.SicBoRegions.update(profile, selectedRoll, normalized, frame.width, frame.height);
        $(`screenRoll${rollNames[selectedRoll]}Status`).textContent = 'Checking…';
        selectedRoll = null; saveProfile(); resetConsensus(); paint(); resumeReading();
      } catch (err) { $(`screenRoll${rollNames[selectedRoll]}Status`).textContent = err.message; paint(); }
    };
    function paint() {
      if (!frame) return;
      if (preview.width !== frame.width || preview.height !== frame.height) { preview.width = frame.width; preview.height = frame.height; }
      const ctx = preview.getContext('2d');
      if (!sicbo() || $('screenDetails').open) ctx.drawImage(frame, 0, 0);
      if (sicbo()) {
        const source = $('screenSourcePreview'), sourceContext = source.getContext('2d');
        source.width = Math.min(frame.width, 640); source.height = Math.max(1, Math.round(frame.height * source.width / frame.width));
        sourceContext.drawImage(frame, 0, 0, source.width, source.height);
        const target = $('screenHistoryPreview'); target.getContext('2d').clearRect(0, 0, target.width, target.height);
        if (!root.SicBoRegions.matches(profile, frame.width, frame.height)) return;
        ctx.lineWidth = Math.max(2, frame.width / 700); ctx.strokeStyle = '#52f2a8';
        for (const [key, r] of Object.entries(profile.regions)) {
          if (key !== 'history') continue;
          const box = root.SicBoRegions.pixels(r, frame.width, frame.height);
          ctx.strokeRect(...box); ctx.fillStyle = '#52f2a8'; ctx.fillText(key, box[0], box[1] - 4);
          sourceContext.strokeStyle = '#52f2a8'; sourceContext.lineWidth = 2;
          sourceContext.strokeRect(box[0] * source.width / frame.width, box[1] * source.height / frame.height, box[2] * source.width / frame.width, box[3] * source.height / frame.height);
          target.width = Math.max(1, Math.round(box[2])); target.height = Math.max(1, Math.round(box[3]));
          target.getContext('2d').drawImage(frame, ...box, 0, 0, target.width, target.height);
          paintHistory(box);
        }
        return;
      }
      if (!area) return;
      if (getContext().game.id === 'teenpatti') {
        for (const key of ['result', 'phase']) {
          const target = $(`screenTeen${key === 'result' ? 'Result' : 'Phase'}Preview`);
          target.getContext('2d').clearRect(0, 0, target.width, target.height);
          if (teenConfig[key] && overrides[key] && teenConfig.width === frame.width && teenConfig.height === frame.height) {
            const box = absolute(area, overrides[key]);
            target.getContext('2d').drawImage(frame, ...box, 0, 0, target.width, target.height);
          }
        }
      }
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
      if (busyGeneration === token) {
        timer = setTimeout(() => { if (token === generation) { if (live) tick(); else sample(false); } }, 500);
        return;
      }
      busyGeneration = token;
      try {
        if (context.game.id === 'sicbo') {
          const captured = frame, at = frameAt || Date.now(), number = ++frameNumber;
          paint();
          const slots = historySlots(captured);
          if (live) watchHistory(captured, at, slots);
          if (live && !synced) return;
          const result = await readSicBoFrame(captured, profile, overrides);
          if (token !== generation) return;
          const { history, histories } = result.readings;
          updateRollStatuses(result);
          $('screenHistoryStatus').textContent = history ? `History: ${history.values.join(' + ')} = ${history.total}` : 'History unclear or not selected';
          $('screenHistoryStatus').dataset.status = history ? 'agree' : 'waiting';
          if (live && synced) {
            $('screenCaptureIndicator').dataset.active = history ? 'true' : 'false';
            $('screenCaptureIndicator').textContent = history ? 'Recording' : 'History unreadable — retrying';
          }
          if (!live) { $('screenSave').disabled = true; status.textContent = result.message || 'Screenshot preview only; a live round transition is required'; return; }
          if (!historyTracker || !profile || !slots) { status.textContent = result.message || 'Keep the newest and two older history columns visible'; return; }
          let decision = historyTracker.read({ revision: profile.revision, at, frame: `read${number}`, histories, slots });
          status.textContent = result.message || decision.message;
          if (decision.event) { rollDetected(decision.event, bound); syncAt = decision.event.at; }
          while (decision.status === 'ready') {
            pendingEntry = decision.entry;
            // A history row cannot prove which current on-screen wager belongs to it.
            if (!record(pendingEntry, bound, { sourceAt: at })) break;
            status.textContent = `Recorded ${pendingEntry.raw.join(' + ')} · ${new Date(pendingEntry.screen.capturedAt).toLocaleTimeString()} · history verified`;
            decision = historyTracker.acknowledge(pendingEntry.screen.round);
            pendingEntry = null;
          }
          readingStatus(decision);
          if (decision.status === 'gap') { status.textContent = decision.message; $('screenTimingStatus').textContent = decision.message; }
          return;
        }
        const teen = context.game.id === 'teenpatti' && live;
        const phrase = String(teenConfig.phaseText || '').trim().toUpperCase().replace(/\s+/g, ' ');
        if (teen && (!teenConfig.result || !teenConfig.phase || !overrides.result || !overrides.phase || teenConfig.width !== frame.width || teenConfig.height !== frame.height || !phrase || root.ScreenVision.parseResult('teenpatti', phrase))) {
          area = overrides.table ? absolute([0, 0, frame.width, frame.height], overrides.table) : detectTable(frame, 'teenpatti'); paint();
          status.textContent = 'Select result and phase areas for this screen and enter the exact phase text'; $('screenTeenState').textContent = status.textContent; return;
        }
        if (teen && !teenConfirmed) {
          area = overrides.table ? absolute([0, 0, frame.width, frame.height], overrides.table) : detectTable(frame, 'teenpatti'); paint();
          $('screenTeenConfirm').disabled = false;
          status.textContent = 'Confirm the saved reading areas for this shared screen'; $('screenTeenState').textContent = status.textContent; return;
        }
        if (teen && teenPending) {
          if (teenPending.bound.site !== bound.site || teenPending.bound.game !== bound.game || teenPending.bound.session !== bound.session) { status.textContent = 'Verified hand waiting in its original session'; $('screenTeenState').textContent = status.textContent; return; }
          if (!record(teenPending.entry, teenPending.bound)) { status.textContent = 'Verified hand waiting; finish manual entry before recording'; $('screenTeenState').textContent = status.textContent; return; }
          teenPending = null; teenClock = null; status.textContent = 'Recorded verified hand'; $('screenTeenState').textContent = status.textContent;
        }
        const result = await readFrame(frame, context.game.id, teen ? { ...overrides, source: teenConfig.source === 'winner' ? 'winner' : 'cards', phaseText: phrase } : overrides);
        if (token !== generation) return;
        if (teen && (!video || video.videoWidth !== frame.width || video.videoHeight !== frame.height)) { stop('Capture size changed. Recalibrate the reading areas.'); return; }
        area = result.area; paint();
        if (context.game.id === 'teenpatti') {
          const observation = result.observation;
          const side = observation && context.game.outcome(observation.raw).side;
          $('screenTeenWinner').textContent = observation
            ? `Winner: ${side ? `Player ${side}` : 'Tie'} · ${observation.raw.c ? 'six cards' : 'banner'}`
            : 'Winner: waiting';
        }
        const now = Date.now();
        if (teen) {
          const phaseReading = result.phaseReading;
          $('screenTeenPhaseRead').textContent = phaseReading?.text.trim() ? `Phase read: ${phaseReading.text} · OCR score ${Math.round(phaseReading.confidence)}/100${phaseReading.matched ? ' · matches' : ' · check phrase or crop'}` : 'Phase text not visible';
          if (!teenClock) teenClock = root.ScreenCapture.createTeenPhaseClock({ now });
          const readRound = teenClock.read(result.phase === true, result.hasResult === true, now);
          wagerState = root.ScreenCapture.trackWagers(wagerState, readRound, result.wager || result.observation?.wager, now);
          if (result.phase && result.hasResult === true) { tracker.reset(); status.textContent = 'Phase and result overlap; waiting for a clear transition'; }
          else if (!readRound) status.textContent = result.phase ? 'Checking the next round phase' : 'Waiting for the next round phase';
          else {
            const confirmed = wagerState.stable[readRound];
            const observation = result.observation ? { ...result.observation, round: readRound, ...(confirmed ? { wager: confirmed.wager } : {}) } : null;
            const decision = tracker.read(observation, { game: context.game, entries: context.entries, now });
            status.textContent = observation ? (result.message || decision.message || '') : result.hasResult === true ? (result.message || 'Result unclear; waiting') : 'Waiting for the winner';
            if (decision.status === 'ready') {
              teenPending = { entry: decision.entry, bound: { ...bound } };
              if (record(teenPending.entry, teenPending.bound)) { teenPending = null; teenClock.recorded(); status.textContent = 'Recorded verified hand'; }
              else status.textContent = 'Verified hand waiting; finish manual entry before recording';
            }
          }
          if (teenClock.gap()) status.textContent += ' · Possible missed hand; review history';
          $('screenTeenState').textContent = status.textContent; return;
        }
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
        if (busyGeneration === token) busyGeneration = null;
        if (live && token === generation && stream && (!sicbo() || synced)) timer = setTimeout(tick, sicbo() ? 500 : context.game.id === 'teenpatti' ? 200 : 1800);
      }
    }
    function tick() {
      if (selecting || drag) return;
      if (!video || video.readyState < 2) { timer = setTimeout(tick, 1000); return; }
      if (video.videoWidth < 400) { stop('Shared image too small; select the casino tab or window'); return; }
      const size = `${video.videoWidth}x${video.videoHeight}`;
      if (dimensions && size !== dimensions && !sicbo()) { stop('Capture size changed. Show the whole game and click Start again.'); return; }
      dimensions = size;
      frame = canvas(video.videoWidth, video.videoHeight); frame.getContext('2d').drawImage(video, 0, 0);
      frameAt = Date.now();
      sample();
    }
    async function start(selectArea = false) {
      if (getContext().ended) { status.textContent = 'Session ended; start a new session before recording'; return; }
      if (!navigator.mediaDevices?.getDisplayMedia) { status.textContent = 'Open through run.sh in a browser with screen sharing'; return; }
      stop(); fields(); const token = generation;
      bound = { site: getContext().site, game: getContext().game.id, session: getContext().session };
      $('screenStart').disabled = true;
      try {
        const selected = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 2 }, audio: false });
        if (token !== generation) { selected.getTracks().forEach(t => t.stop()); return; }
        stream = selected; dimensions = ''; frame = null;
        selected.getVideoTracks()[0].onended = () => { if (stream === selected) stop('Screen sharing ended'); };
        video = document.createElement('video'); video.muted = true; video.srcObject = selected; await video.play();
        if (token !== generation) return;
        if (!video.videoWidth || !video.videoHeight) throw new Error('Shared screen has no video frame. Share the casino tab or window again.');
        $('screenStop').disabled = false; if (!sicbo()) document.body.classList.add('recording');
        $('screenCaptureIndicator').dataset.active = 'true'; $('screenCaptureIndicator').textContent = 'Capturing';
        status.textContent = 'Reading casino screen locally…';
        if (sicbo()) {
          const track = selected.getVideoTracks()[0];
          $('screenSourceLabel').textContent = `${track.label || track.getSettings?.().displaySurface || 'Shared screen'} · ${video.videoWidth}×${video.videoHeight}`;
          $('screenSourceDetails').open = true;
          $('screenStart').disabled = false; $('screenStart').textContent = 'Change screen';
          monitor();
          frame = canvas(video.videoWidth, video.videoHeight); frame.getContext('2d').drawImage(video, 0, 0);
          frameAt = Date.now(); paint();
          $('screenSyncStart').disabled = true;
          status.textContent = 'Screen shared. Select the history section and three rolls.';
          openAreaEditor(selectArea || 'history');
        } else if (selectArea) {
          frame = canvas(video.videoWidth, video.videoHeight); frame.getContext('2d').drawImage(video, 0, 0);
          frameAt = Date.now(); openAreaEditor(selectArea === true ? 'table' : selectArea);
        } else tick();
      } catch (err) { if (token === generation) stop(`Screen sharing unavailable: ${err.message}`); }
    }
    $('screenStart').onclick = () => start();
    $('screenSyncStart').onclick = () => {
      if (!stream || !historyTracker || !profile?.regions.history || !video || video.readyState < 2) return;
      const captured = canvas(video.videoWidth, video.videoHeight); captured.getContext('2d').drawImage(video, 0, 0);
      const at = Date.now(), slots = historySlots(captured);
      if (!slots) { status.textContent = 'Keep the newest and two older history columns visible'; return; }
      if (!synced && (!captureCheck || captureCheck.revision !== profile.revision || !sameSlots(captureCheck.slots, slots))) {
        captureCheck = null; $('screenSyncStart').disabled = true; validateHistory(captured, at, slots); return;
      }
      watchHistory(captured, at, slots);
      const decision = synced ? historyTracker.retime({ at, anchorAt: at - 2000 }) : historyTracker.sync({ at, anchorAt: at - 2000 });
      if (decision.status === 'stale') { status.textContent = decision.message; return; }
      synced = true; syncAt = at - 2000;
      document.body.classList.add('recording'); $('screenSourceDetails').open = false;
      generation++; clearTimeout(timer); timer = null;
      $('screenSyncStart').textContent = 'Resync timing';
      $('screenCaptureIndicator').textContent = 'Recording';
      status.textContent = 'Timing synced. Current history is the baseline; recording starts with the next update.';
      tick();
    };
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
    function pauseReading() {
      generation++; clearTimeout(timer); timer = null; tracker.reset(); resetConsensus(); teenClock = null; tested = null; $('screenSave').disabled = true;
      if (sicbo()) { synced = false; syncAt = null; document.body.classList.remove('recording'); readingStatus(null); $('screenSyncStart').textContent = 'Start synced'; }
    }
    function resumeReading() {
      if (stream && sicbo()) {
        $('screenSyncStart').disabled = true;
        status.textContent = 'Checking the selected history numbers…';
        $('screenCaptureIndicator').dataset.active = 'false'; $('screenCaptureIndicator').textContent = 'Checking history';
      } else if (stream) tick();
      else if (frame) sample(false);
    }
    function selectionRect(from, to) { return [Math.min(from[0], to[0]), Math.min(from[1], to[1]), Math.abs(to[0] - from[0]), Math.abs(to[1] - from[1])]; }
    function paintSelection() {
      if (!frame) return;
      if (areaPreview.width !== frame.width) areaPreview.width = frame.width;
      if (areaPreview.height !== frame.height) areaPreview.height = frame.height;
      const ctx = areaPreview.getContext('2d'); ctx.drawImage(frame, 0, 0);
      const previous = sicbo() && root.SicBoRegions.matches(profile, frame.width, frame.height) ? profile.regions[selectedRegion] : null;
      const box = selectionDrag && selectionEnd ? selectionRect(selectionDrag, selectionEnd)
        : previous ? root.SicBoRegions.pixels(previous, frame.width, frame.height)
          : !sicbo() && overrides.table ? absolute([0, 0, frame.width, frame.height], overrides.table) : null;
      if (!box) return;
      ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fillRect(0, 0, frame.width, frame.height);
      if (box[2] && box[3]) ctx.drawImage(frame, ...box, ...box);
      ctx.strokeStyle = '#52f2a8'; ctx.lineWidth = Math.max(3, frame.width / 400); ctx.strokeRect(...box);
    }
    function openAreaEditor(key = 'table') {
      if (sicbo() && synced && historyTracker?.pending()) { status.textContent = 'History recovery pending. Let it finish, or Stop before changing the area.'; return; }
      if (stream && video?.readyState >= 2) { frame = canvas(video.videoWidth, video.videoHeight); frame.getContext('2d').drawImage(video, 0, 0); frameAt = Date.now(); }
      if (!frame) return start(key);
      selectedRoll = null; rollDrag = null; rollEnd = null;
      selectedRegion = key;
      $('screenAreaUseSaved').hidden = !(sicbo() && key === 'history' && stream && root.SicBoRegions.complete(profile) && root.SicBoRegions.matches(profile, frame.width, frame.height));
      pauseReading(); selecting = true; selectionDrag = null; selectionEnd = null;
      $('screenAreaHint').textContent = key === 'dice' ? 'Draw the whole dice bowl, including the green countdown.' : key === 'result' ? 'Draw the completed result banner.' : key === 'phase' ? 'Draw the exact text visible before the deal.' : key === 'history' ? 'Draw the history section containing all three rolls.' : 'Drag around the whole game video.';
      status.textContent = `Draw ${key} area`;
      paintSelection(); areaDialog.showModal();
    }
    function cancelAreaEditor() {
      selecting = false; selectionDrag = null; selectionEnd = null; areaDialog.close();
      status.textContent = stream ? 'Reading casino screen locally…' : 'Selection canceled';
      resumeReading();
    }
    $('screenSelectArea').onclick = () => openAreaEditor('table');
    $('screenTeenResultSelect').onclick = () => openAreaEditor('result');
    $('screenTeenPhaseSelect').onclick = () => openAreaEditor('phase');
    $('screenTeenConfirm').onclick = () => { if (stream && frame && teenConfig.width === frame.width && teenConfig.height === frame.height && teenConfig.result && teenConfig.phase) { teenConfirmed = true; $('screenTeenConfirm').disabled = true; status.textContent = 'Waiting for the next round phase'; $('screenTeenState').textContent = status.textContent; } };
    $('screenTeenSource').onchange = e => { stop('Source changed; click Start'); teenConfig = { ...teenConfig, source: e.target.value === 'cards' ? 'cards' : 'winner' }; saveTeen(); };
    $('screenTeenPhaseText').onchange = e => { stop('Phase text changed; click Start'); teenConfig = { ...teenConfig, phaseText: e.target.value.trim().toUpperCase().replace(/\s+/g, ' ') }; saveTeen(); };
    document.querySelector('[data-screen-region="history"]').onclick = () => openAreaEditor('history');
    $('screenHistoryDirection').onchange = e => {
      if (!profile) return;
      if (synced && historyTracker?.pending()) { e.target.value = profile.direction; status.textContent = 'History recovery pending. Let it finish, or Stop before changing direction.'; return; }
      pauseReading(); profile = { ...profile, direction: e.target.value, revision: profile.revision + 1 }; saveProfile(); resetConsensus(); resumeReading();
    };
    $('screenAreaUseSaved').onclick = () => { shareConfirmed = true; selecting = false; areaDialog.close(); paint(); resumeReading(); };
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
      if (sicbo()) {
        const rect = root.SicBoRegions.normalize([box[0], box[1]], [box[0] + box[2], box[1] + box[3]], frame.width, frame.height);
        if (!rect) { $('screenAreaHint').textContent = 'Drag a larger area.'; paintSelection(); return; }
        profile = root.SicBoRegions.update(profile, selectedRegion, rect, frame.width, frame.height);
        if (selectedRegion === 'history') {
          if (stream) shareConfirmed = true;
          root.SicBoRegions.rollKeys.forEach(key => { $(`screenRoll${rollNames[key]}Status`).textContent = 'Select this roll'; });
        }
        profile = { ...profile, direction: $('screenHistoryDirection').value };
        const saved = saveProfile(); resetConsensus(); wagerState = { stable: {}, candidate: null };
        selecting = false; areaDialog.close();
        status.textContent = saved ? `${selectedRegion} area saved; waiting for a fresh round` : 'Area set for this session; browser storage unavailable';
        paint(); resumeReading(); return;
      }
      if (getContext().game.id === 'teenpatti' && ['result', 'phase'].includes(selectedRegion)) {
        const base = overrides.table ? absolute([0, 0, frame.width, frame.height], overrides.table) : detectTable(frame, 'teenpatti');
        if (!base || box[2] < 5 || box[3] < 5) { $('screenAreaHint').textContent = 'Draw a larger area inside the game table.'; paintSelection(); return; }
        const r = [(box[0] - base[0]) / base[2], (box[1] - base[1]) / base[3], box[2] / base[2], box[3] / base[3]];
        if (r[0] < 0 || r[1] < 0 || r[0] + r[2] > 1 || r[1] + r[3] > 1) { $('screenAreaHint').textContent = 'Keep the area inside the game table.'; paintSelection(); return; }
        if (teenConfig.width !== frame.width || teenConfig.height !== frame.height) teenConfig = { source: teenConfig.source, phaseText: teenConfig.phaseText };
        overrides = { ...overrides, [selectedRegion]: r };
        teenConfig = { ...teenConfig, width: frame.width, height: frame.height, [selectedRegion]: true };
        teenDrawn = new Set([...teenDrawn, selectedRegion]); teenConfirmed = teenDrawn.has('result') && teenDrawn.has('phase');
        if (teenConfirmed) $('screenTeenConfirm').disabled = true;
        try { localStorage.setItem(savedKey(), JSON.stringify(overrides)); } catch { status.textContent = 'Calibration kept for this session'; }
        saveTeen(); area = base; selecting = false; areaDialog.close(); paint(); resumeReading(); return;
      }
      if (box[2] < frame.width * .03 || box[3] < frame.height * .03) {
        $('screenAreaHint').textContent = 'Drag a larger box around the whole game video.'; paintSelection(); return;
      }
      const x = box[0] / frame.width, y = box[1] / frame.height;
      overrides = { ...overrides, table: [x, y, Math.min(1 - x, box[2] / frame.width), Math.min(1 - y, box[3] / frame.height)] };
      if (getContext().game.id === 'teenpatti') { teenConfig = { ...teenConfig, result: false, phase: false }; teenConfirmed = false; teenDrawn = new Set(); saveTeen(); }
      area = box; wagerState = { stable: {}, candidate: null };
      try { localStorage.setItem(savedKey(), JSON.stringify(overrides)); }
      catch { status.textContent = 'Watch area set for this session; browser storage unavailable'; }
      selecting = false; areaDialog.close(); $('screenDetails').open = false;
      status.textContent = 'Watch area set; reading locally…'; paint(); resumeReading();
    };
    preview.onpointerdown = e => { if (!sicbo() && frame) { drag = point(e); preview.setPointerCapture(e.pointerId); } };
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
    $('screenDefaults').onclick = () => { stop('Regions reset; click Start to record'); overrides = {}; profile = null; resetConsensus(); tracker.reset(); tested = null; $('screenSave').disabled = true;
      try { localStorage.removeItem(savedKey()); localStorage.removeItem(teenKey()); teenConfig = {}; } catch { /* current session defaults still apply */ }
      try { localStorage.removeItem(profileKey()); } catch { /* current session defaults still apply */ }
      area = frame && detectTable(frame, getContext().game.id); paint(); if (!stream) sample(false);
    };
    fields(); $('screenStop').disabled = true; $('screenSave').disabled = true; $('screenSyncStart').disabled = true;
    return { stop, refresh: fields, canSwitch() { return !teenPending; }, manual() {
      if (!sicbo()) return;
      if (historyTracker?.manual().status === 'blocked') return false;
      generation++; clearTimeout(timer); pendingEntry = null; wagerState = { stable: {}, candidate: null };
      if (stream && synced) tick();
    } };
  }
  root.ScreenReader = { init, readFrame, readSicBoFrame, detectTable, cardBoxes, historyStep, historyColumns };
})(this);
