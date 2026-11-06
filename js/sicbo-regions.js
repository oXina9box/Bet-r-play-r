/* Sic Bo calibration rectangles use normalized captured-frame coordinates. */
(function (root) {
  const keys = ['dice', 'result', 'history'], rollKeys = ['newest', 'previous', 'twoBack'];
  const size = (w, h) => Number.isInteger(w) && Number.isInteger(h) && w > 0 && h > 0;
  const valid = r => Array.isArray(r) && r.length === 4 && r.every(Number.isFinite) && r[0] >= 0 && r[1] >= 0 && r[2] > 0 && r[3] > 0 && r[0] + r[2] <= 1 && r[1] + r[3] <= 1;
  const pixels = (r, w, h) => [r[0] * w, r[1] * h, r[2] * w, r[3] * h];
  const inside = (r, h) => r[0] >= h[0] - 1e-10 && r[1] >= h[1] - 1e-10 && r[0] + r[2] <= h[0] + h[2] + 1e-10 && r[1] + r[3] <= h[1] + h[3] + 1e-10;
  const overlaps = (a, b) => a[0] < b[0] + b[2] - 1e-10 && b[0] < a[0] + a[2] - 1e-10 && a[1] < b[1] + b[3] - 1e-10 && b[1] < a[1] + a[3] - 1e-10;
  function point(x, y, bounds, w, h) { return [Math.max(0, Math.min(w, (x - bounds.left) * w / bounds.width)), Math.max(0, Math.min(h, (y - bounds.top) * h / bounds.height))]; }
  function normalize(a, b, w, h) {
    if (!size(w, h) || !Array.isArray(a) || !Array.isArray(b) || ![...a, ...b].every(Number.isFinite)) return null;
    const x = Math.max(0, Math.min(w, Math.min(a[0], b[0]))), y = Math.max(0, Math.min(h, Math.min(a[1], b[1])));
    const right = Math.max(0, Math.min(w, Math.max(a[0], b[0]))), bottom = Math.max(0, Math.min(h, Math.max(a[1], b[1])));
    if (right - x < 8 || bottom - y < 8) return null;
    return [x / w, y / h, Math.min(1 - x / w, (right - x) / w), Math.min(1 - y / h, (bottom - y) / h)];
  }
  function read(value) {
    try {
      const p = typeof value === 'string' ? JSON.parse(value) : value;
      if (!p || p.v !== 2 || !size(p.width, p.height) || !Number.isSafeInteger(p.revision) || p.revision < 1 || !p.regions || typeof p.regions !== 'object' || Array.isArray(p.regions) || Object.keys(p.regions).some(k => !keys.includes(k) || !valid(p.regions[k])) || !p.rolls || typeof p.rolls !== 'object' || Array.isArray(p.rolls) || Object.keys(p.rolls).some(k => !rollKeys.includes(k) || !valid(p.rolls[k])) || !['left', 'right'].includes(p.direction)) return null;
      const boxes = Object.values(p.rolls);
      if (boxes.length && (!p.regions.history || boxes.some(r => !inside(r, p.regions.history)) || boxes.some((r, i) => boxes.slice(i + 1).some(other => overlaps(r, other))))) return null;
      return { v: 2, width: p.width, height: p.height, revision: p.revision, direction: p.direction, regions: Object.fromEntries(Object.entries(p.regions).map(([k, r]) => [k, [...r]])), rolls: Object.fromEntries(Object.entries(p.rolls).map(([k, r]) => [k, [...r]])) };
    } catch { return null; }
  }
  const matches = (p, w, h) => Boolean(p && p.width === w && p.height === h);
  const complete = p => Boolean(read(p) && p.regions.history && rollKeys.every(k => p.rolls[k]));
  function update(profile, key, rect, width, height) {
    if (![...keys, ...rollKeys].includes(key) || !size(width, height) || !valid(rect)) throw new TypeError('Invalid Sic Bo region');
    const previous = read(profile), same = matches(previous, width, height);
    const regions = same ? { ...previous.regions } : {}, rolls = same ? { ...previous.rolls } : {};
    if (keys.includes(key)) { regions[key] = [...rect]; if (key === 'history') for (const k of rollKeys) delete rolls[k]; }
    else { if (!regions.history || !inside(rect, regions.history) || Object.entries(rolls).some(([k, r]) => k !== key && overlaps(rect, r))) throw new TypeError('Roll boxes must be inside history and not overlap'); rolls[key] = [...rect]; }
    return { v: 2, width, height, revision: (previous?.revision || 0) + 1, direction: previous?.direction || 'left', regions, rolls };
  }
  const api = { point, normalize, pixels, read, matches, complete, update, rollKeys };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.SicBoRegions = api;
})(this);
