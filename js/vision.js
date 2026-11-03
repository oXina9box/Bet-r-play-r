/* Conservative helpers for isolated screen regions. Scores measure shape fit,
 * not probability of a correct casino result. Unknown/ambiguous input stays null. */
(function (root) {
  const normalized = (text) => typeof text === 'string' ? text.trim().toUpperCase().replace(/\s+/g, ' ') : '';

  function parseResult(game, text) {
    const value = normalized(text);
    if (game === 'teenpatti') {
      const match = /^(?:PLAYER ?([AB])|(TIE))$/.exec(value);
      return match ? { side: match[1] || null } : null;
    }
    if (game === 'kickoff') {
      return /^(RED|BLUE|DRAW)$/.test(value) ? { side: value === 'RED' ? 'A' : value === 'BLUE' ? 'B' : null } : null;
    }
    if (game !== 'sicbo') return null;
    const match = /^(BIG|SMALL|(?:ANY ?)?TRIPLE)(?: ?(\d{1,2}))?$/.exec(value);
    if (!match) return null;
    const total = match[2] === undefined ? undefined : Number(match[2]);
    if (match[1].includes('TRIPLE')) {
      if (total !== undefined && (total < 3 || total > 18 || total % 3)) return null;
      return { side: null, ...(total === undefined ? {} : { total }), triple: true };
    }
    if (!Number.isInteger(total) || (match[1] === 'BIG' ? total < 11 || total > 17 : total < 4 || total > 10)) return null;
    return { side: match[1] === 'BIG' ? 'A' : 'B', total };
  }

  function parseRound(text) {
    if (typeof text !== 'string') return null;
    const ids = text.match(/\b\d{8,}\b/g);
    if (!ids || ids.length !== 1) return null;
    const match = /\b(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d\s*[.·•|\-]?\s*(\d{8,14})\b/.exec(text);
    return match && match[1] === ids[0] ? match[1] : null;
  }

  function parseMoney(text) {
    const match = /^(GC|SC|\$)\s*((?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?)$/.exec(normalized(text));
    if (!match) return null;
    const amount = Number(match[2].replace(/,/g, ''));
    if (!Number.isFinite(amount) || !Number.isSafeInteger(Math.round(amount * 100))) return null;
    return { amount, currency: match[1] === '$' ? 'USD' : match[1] };
  }

  function validImage(image) {
    return image && Number.isInteger(image.width) && Number.isInteger(image.height) &&
      image.width >= 6 && image.height >= 6 && image.width <= 2048 && image.height <= 2048 &&
      image.data && image.data.length === image.width * image.height * 4;
  }

  function components(image, predicate) {
    const { width, height, data } = image;
    const mask = new Uint8Array(width * height);
    for (let i = 0; i < mask.length; i++) mask[i] = data[i * 4 + 3] > 128 && predicate(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]) ? 1 : 0;
    const found = [];
    for (let start = 0; start < mask.length; start++) {
      if (!mask[start]) continue;
      const stack = [start], pixels = [];
      let minX = width, maxX = 0, minY = height, maxY = 0, sx = 0, sy = 0;
      mask[start] = 0;
      while (stack.length) {
        const i = stack.pop(), x = i % width, y = Math.floor(i / width);
        pixels.push(i); sx += x; sy += y;
        minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
        const neighbors = [x > 0 ? i - 1 : -1, x + 1 < width ? i + 1 : -1, y > 0 ? i - width : -1, y + 1 < height ? i + width : -1];
        for (const next of neighbors) if (next >= 0 && mask[next]) { mask[next] = 0; stack.push(next); }
      }
      found.push({ pixels, area: pixels.length, x: sx / pixels.length, y: sy / pixels.length, minX, maxX, minY, maxY });
    }
    return found;
  }

  const PIPS = [
    [[0, 0]], [[-1, -1], [1, 1]], [[-1, -1], [0, 0], [1, 1]],
    [[-1, -1], [1, -1], [-1, 1], [1, 1]],
    [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]],
    [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]],
  ];

  // At most 6! orders. Bounded affine fit allows a foreshortened physical face.
  function pipFit(points, template) {
    const center = points.reduce((sum, p) => ({ x: sum.x + p.x / points.length, y: sum.y + p.y / points.length }), { x: 0, y: 0 });
    const denominator = template.reduce((sum, [x, y]) => sum + x * x + y * y, 0);
    function fit(order) {
      const coefficient = (coordinate, axis) => order.reduce((sum, p, i) => sum + (p[coordinate] - center[coordinate]) * template[i][axis], 0) / template.reduce((sum, p) => sum + p[axis] ** 2, 0);
      const a = order.length >= 4 ? coefficient('x', 0) : order.reduce((sum, p, i) => sum + (p.x - center.x) * template[i][0] + (p.y - center.y) * template[i][1], 0) / denominator;
      const b = order.length >= 4 ? coefficient('y', 0) : order.reduce((sum, p, i) => sum + (p.y - center.y) * template[i][0] - (p.x - center.x) * template[i][1], 0) / denominator;
      const c = order.length >= 4 ? coefficient('x', 1) : -b;
      const d = order.length >= 4 ? coefficient('y', 1) : a;
      const trace = a * a + b * b + c * c + d * d, determinant = a * d - b * c;
      const spread = Math.sqrt(Math.max(0, trace * trace - 4 * determinant * determinant));
      if (trace === 0 || (trace - spread) / (trace + spread) < 0.18) return { error: Infinity, scale: 0 };
      const scale = Math.sqrt(Math.abs(determinant));
      const error = Math.sqrt(order.reduce((sum, p, i) => sum + (p.x - center.x - a * template[i][0] - c * template[i][1]) ** 2 + (p.y - center.y - b * template[i][0] - d * template[i][1]) ** 2, 0) / order.length);
      return scale > 0 ? { error: error / scale, scale } : { error: Infinity, scale: 0 };
    }
    function search(order, remaining) {
      if (!remaining.length) return fit(order);
      return remaining.map((point, i) => search(order.concat(point), remaining.filter((_, j) => j !== i))).reduce((best, candidate) => candidate.error < best.error ? candidate : best, { error: Infinity, scale: 0 });
    }
    return { ...search([], points), center };
  }

  function readDieAt(image, threshold) {
    if (!validImage(image)) return null;
    const { width, height } = image, size = Math.min(width, height), area = width * height;
    const dots = components(image, (r, g, b) => Math.min(r, g, b) >= threshold && Math.max(r, g, b) - Math.min(r, g, b) < 80)
      .filter((c) => c.minX > 0 && c.minY > 0 && c.maxX < width - 1 && c.maxY < height - 1 && c.area >= Math.max(3, area * 0.0007));
    if (!dots.length || dots.length > 6 || dots.some((p) => {
      const w = p.maxX - p.minX + 1, h = p.maxY - p.minY + 1;
      const fill = p.area / (w * h);
      return p.area > area * 0.06 || w / h > 2.4 || h / w > 2.4 || fill < 0.45 || fill > 0.95;
    })) return null;
    const sizes = dots.map((p) => p.area);
    if (Math.max(...sizes) / Math.min(...sizes) > 2.4) return null;
    const center = dots.reduce((sum, p) => ({ x: sum.x + p.x / dots.length, y: sum.y + p.y / dots.length }), { x: 0, y: 0 });
    const offset = Math.hypot((center.x - width / 2) / width, (center.y - height / 2) / height);
    if (offset > 0.22) return null;
    if (dots.length === 1) return { value: 1, confidence: Math.round(100 * (1 - offset)) };
    const fit = pipFit(dots, PIPS[dots.length - 1]);
    if (fit.error > 0.13 || fit.scale < size * 0.12 || fit.scale > size * 0.48) return null;
    const radius = Math.sqrt(Math.max(...sizes) / Math.PI);
    if (fit.scale < radius * 1.8) return null;
    return { value: dots.length, confidence: Math.round(100 * Math.max(0, 1 - fit.error - offset)) };
  }

  function readDie(image) {
    return readDieAt(image, 175) || readDieAt(image, 195);
  }

  function cropImage(image, box) {
    const data = new Uint8ClampedArray(box.width * box.height * 4);
    for (let y = 0; y < box.height; y++) {
      const start = ((box.y + y) * image.width + box.x) * 4;
      data.set(Array.prototype.slice.call(image.data, start, start + box.width * 4), y * box.width * 4);
    }
    return { width: box.width, height: box.height, data };
  }

  function darkSurrounding(image, dot) {
    const rx = (dot.maxX - dot.minX + 1) * 0.75 + 2, ry = (dot.maxY - dot.minY + 1) * 0.75 + 2;
    let dark = 0;
    for (let n = 0; n < 16; n++) {
      const x = Math.round(dot.x + Math.cos(n * Math.PI / 8) * rx), y = Math.round(dot.y + Math.sin(n * Math.PI / 8) * ry);
      if (x < 0 || y < 0 || x >= image.width || y >= image.height) continue;
      const i = (y * image.width + x) * 4;
      if (Math.max(image.data[i], image.data[i + 1], image.data[i + 2]) < 145 && (image.data[i] + image.data[i + 1] + image.data[i + 2]) / 3 < 100) dark++;
    }
    return dark >= 6;
  }

  function darkBowl(image, group) {
    const x = group.reduce((sum, p) => sum + p.x / group.length, 0), y = group.reduce((sum, p) => sum + p.y / group.length, 0);
    const radius = Math.max(Math.max(...group.map((p) => p.maxX)) - Math.min(...group.map((p) => p.minX)), Math.max(...group.map((p) => p.maxY)) - Math.min(...group.map((p) => p.minY))) * 1.3 + 15;
    let dark = 0;
    for (let n = 0; n < 16; n++) {
      const px = Math.round(x + Math.cos(n * Math.PI / 8) * radius), py = Math.round(y + Math.sin(n * Math.PI / 8) * radius);
      if (px < 0 || py < 0 || px >= image.width || py >= image.height) continue;
      const i = (py * image.width + px) * 4, colors = [image.data[i], image.data[i + 1], image.data[i + 2]];
      if (Math.max(...colors) < 130 && Math.max(...colors) - Math.min(...colors) < 75) dark++;
    }
    return dark >= 7;
  }

  // Locate one bright-pipped die inside a broad dark Kickoff bowl region.
  // Bright extra faces, multiple clusters, and irregular shapes remain unknown.
  function readDieRegion(image) {
    if (!validImage(image)) return null;
    const first = locateDieAt(image, 175);
    if (first === false) return null;
    return first || locateDieAt(image, 195) || null;
  }

  function locateDieAt(image, threshold) {
    const area = image.width * image.height;
    const dots = components(image, (r, g, b) => Math.min(r, g, b) >= threshold && Math.max(r, g, b) - Math.min(r, g, b) < 80).filter((p) => {
      const w = p.maxX - p.minX + 1, h = p.maxY - p.minY + 1, fill = p.area / (w * h);
      return p.area >= 9 && p.area < area * 0.003 && w / h <= 2.4 && h / w <= 2.4 && fill >= 0.45 && fill <= 0.9 && darkSurrounding(image, p);
    });
    const clusters = [], visited = new Set();
    for (let i = 0; i < dots.length; i++) {
      if (visited.has(i)) continue;
      const indices = [i]; visited.add(i);
      for (let at = 0; at < indices.length; at++) for (let next = 0; next < dots.length; next++) {
        const p = dots[indices[at]], q = dots[next];
        if (!visited.has(next) && Math.hypot(p.x - q.x, p.y - q.y) <= Math.sqrt(Math.max(p.area, q.area) / Math.PI) * 14) { visited.add(next); indices.push(next); }
      }
      clusters.push(indices.map((index) => dots[index]));
    }
    const plausible = clusters.filter((group) => darkBowl(image, group));
    if (plausible.length > 1 || plausible.some((group) => group.length > 6)) return false;
    if (plausible.length !== 1) return null;
    const group = plausible[0], pad = Math.ceil(Math.max(...group.map((p) => Math.max(p.maxX - p.minX + 1, p.maxY - p.minY + 1))) * 1.6);
    const x = Math.max(0, Math.min(...group.map((p) => p.minX)) - pad), y = Math.max(0, Math.min(...group.map((p) => p.minY)) - pad);
    const box = { x, y, width: Math.min(image.width - 1, Math.max(...group.map((p) => p.maxX)) + pad) - x + 1, height: Math.min(image.height - 1, Math.max(...group.map((p) => p.maxY)) + pad) - y + 1 };
    const reading = readDieAt(cropImage(image, box), threshold);
    return reading ? { ...reading, box } : null;
  }

  // Isolate red physical die faces in a Sic Bo bowl, excluding UI/history.
  // ponytail: color segmentation is layout-specific; no guess for black dice.
  function readDice(image, count = 3) {
    if (!validImage(image) || !Number.isInteger(count) || count < 1 || count > 3) return null;
    const area = image.width * image.height, size = Math.min(image.width, image.height);
    const faces = components(image, (r, g, b) => r > 50 && g < 80 && b < 80 && r > g * 1.65 && r > b * 1.5)
      .filter((c) => c.area > area * 0.0005 && c.area < area * 0.09 && c.maxX - c.minX >= 8 && c.maxY - c.minY >= 8 && c.maxX - c.minX < size * 0.35 && c.maxY - c.minY < size * 0.35);
    const readings = faces.map((face) => {
      const x = Math.max(0, face.minX - 3), y = Math.max(0, face.minY - 3);
      const box = { x, y, width: Math.min(image.width - 1, face.maxX + 3) - x + 1, height: Math.min(image.height - 1, face.maxY + 3) - y + 1 };
      return { box, reading: readDie(cropImage(image, box)) };
    }).filter((item) => item.reading);
    if (readings.length !== count) return null;
    return { dice: readings.map((item) => item.reading.value), confidence: Math.min(...readings.map((item) => item.reading.confidence)), boxes: readings.map((item) => item.box) };
  }

  function glyphMask(image, component, resolution = 24) {
    const occupied = new Set(component.pixels);
    return Array.from({ length: resolution * resolution }, (_, i) => {
      const x = component.minX + Math.min(component.maxX - component.minX, Math.floor((i % resolution + 0.5) * (component.maxX - component.minX + 1) / resolution));
      const y = component.minY + Math.min(component.maxY - component.minY, Math.floor((Math.floor(i / resolution) + 0.5) * (component.maxY - component.minY + 1) / resolution));
      return occupied.has(y * image.width + x);
    });
  }

  const heart = (x, y) => (x * x + y * y - 1) ** 3 - x * x * y ** 3 <= 0;
  const shapes = {
    h: (x, y) => heart(x * 1.2, -y * 1.15),
    d: (x, y) => Math.abs(x) + Math.abs(y) <= 0.95,
    s: (x, y) => (y < 0.5 && heart(x * 1.2, y * 1.5 + 0.35)) || (y > 0.15 && y < 0.95 && Math.abs(x) < 0.08 + y * 0.2),
    c: (x, y) => Math.hypot(x, y + 0.48) < 0.43 || Math.hypot(x - 0.4, y - 0.04) < 0.43 || Math.hypot(x + 0.4, y - 0.04) < 0.43 || (y > 0 && y < 0.95 && Math.abs(x) < 0.08 + y * 0.2),
  };
  // DejaVu Sans glyph masks supplement vector silhouettes for ordinary text.
  // ponytail: fixed upright templates; unfamiliar/rotated fonts require review.
  const fontMasks = {
    h: '0600701f81fc3fe3fe7fe7fe7ff7ffffffffffffffffffff7fffff7ffffe7ffffe3ffffc3ffffc1ffff80ffff007fff003ffc001ff8001ff8000ff00007e00003e00001800000000',
    d: '000800003c00007e0000ff0001ff8001ffc007ffe00ffff01ffff83ffffe7ffffe7fffff7fffff3ffffe3ffffc0ffff80ffff003ffe001ff8001ff80007f00007e00001c00000000',
    s: '000800001c00003c00007f0000ff0000ff8003ffc007ffe00ffff81ffff81ffffc7ffffe7ffffe7fffff7fffffffffff7fffff7fcbff7fc9fe3f88fc000800001800001c00003c00',
    c: '00180000ff0001ff8001ff8001ff8003ffc001ff8001ff8001ff8000ff000f7ef03ffffc7ffffe7ffffefffffffffffffffffffffffe7ffffe3fdbfc1f18f8001800001800003c00',
  };
  const SUITS = Object.entries(shapes).map(([suit, shape]) => {
    const width = 64, height = 64, data = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if (shape((x - 31.5) / 30, (y - 31.5) / 30)) data.set([0, 0, 0, 255], (y * width + x) * 4);
    const image = { width, height, data };
    const component = components(image, () => true).sort((a, b) => b.area - a.area)[0];
    const fontMask = Array.from({ length: 576 }, (_, i) => Boolean(parseInt(fontMasks[suit].slice(Math.floor(i / 24) * 6, Math.floor(i / 24) * 6 + 6), 16) & (1 << (23 - i % 24))));
    return { suit, masks: [glyphMask(image, component), fontMask] };
  });

  function readSuit(image) {
    if (!validImage(image)) return null;
    const marks = components(image, (r, g, b) => Math.max(r, g, b) < 130 || (r > 110 && r > g * 1.5 && r > b * 1.4))
      .filter((c) => c.area >= 6 && !((c.minY === 0 || c.maxY === image.height - 1) && c.maxY - c.minY + 1 <= Math.max(4, image.height * 0.12) && c.maxX - c.minX + 1 >= image.width * 0.75)).sort((a, b) => b.area - a.area);
    if (!marks.length) return null;
    const main = marks[0], w = main.maxX - main.minX + 1, h = main.maxY - main.minY + 1;
    // Compression can disconnect a narrow club/spade stem. Merge only a small,
    // centered fragment immediately below the main glyph, never adjacent ranks.
    const stems = marks.slice(1).filter((p) => p.area <= main.area * 0.2 && p.maxX - p.minX < w * 0.35 && Math.abs(p.x - (main.minX + main.maxX) / 2) < w * 0.2 && p.minY >= main.maxY - h * 0.2 && p.minY <= main.maxY + h * 0.12 && p.maxY <= main.maxY + h * 0.4);
    if (marks.slice(1).some((p) => !stems.includes(p) && p.area > main.area * 0.15)) return null;
    const pieces = [main, ...stems];
    const mark = { ...main, pixels: pieces.flatMap((p) => p.pixels), area: pieces.reduce((sum, p) => sum + p.area, 0), minY: Math.min(...pieces.map((p) => p.minY)), maxY: Math.max(...pieces.map((p) => p.maxY)) };
    if (mark.maxX - mark.minX < 5 || mark.maxY - mark.minY < 5 || mark.area > image.width * image.height * 0.9) return null;
    const mask = glyphMask(image, mark);
    const redCount = mark.pixels.filter((i) => image.data[i * 4] > 110 && image.data[i * 4] > image.data[i * 4 + 1] * 1.5 && image.data[i * 4] > image.data[i * 4 + 2] * 1.4).length;
    const redFraction = redCount / mark.area;
    if (redFraction > 0.2 && redFraction < 0.8) return null;
    const scores = SUITS.map(({ suit, masks }) => {
      const scores = masks.map((template) => {
        const intersection = mask.filter((on, i) => on && template[i]).length;
        const union = mask.filter((on, i) => on || template[i]).length;
        return intersection / union;
      });
      return { suit, score: Math.max(...scores) };
    }).sort((a, b) => b.score - a.score);
    if (scores[0].score < 0.85 || scores[0].score - scores[1].score < 0.07) return null;
    if ('hd'.includes(scores[0].suit) !== (redFraction >= 0.8)) return null;
    return { suit: scores[0].suit, confidence: Math.round(scores[0].score * 100) };
  }

  const ScreenVision = { parseResult, parseRound, parseMoney, readDie, readDieRegion, readDice, readSuit };
  if (typeof module !== 'undefined' && module.exports) module.exports = ScreenVision;
  else root.ScreenVision = ScreenVision;
})(typeof window !== 'undefined' ? window : this);
