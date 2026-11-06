/* Only a proven history shift creates a round; the clock only prompts retries. */
(function (root) {
  const validFrame = frame => (typeof frame === 'string' && frame.length > 0) || Number.isFinite(frame);
  const validSlots = slots => Array.isArray(slots) && slots.length === 3 && slots.every(slot =>
    Array.isArray(slot) && slot.length > 0 && slot.length === slots[0].length &&
    slot.every(value => Number.isInteger(value) && value >= 0 && value <= 16));
  const similar = (a, b) => a.length === b.length && a.reduce((sum, value, i) => sum + Math.abs(value - b[i]), 0) / a.length <= 0.65;
  const sameStrip = (a, b) => a.every((slot, i) => similar(slot, b[i]));
  const copySlots = slots => slots.map(slot => [...slot]);
  const validHistory = h => h && Array.isArray(h.values) && h.values.length === 3 &&
    h.values.every(v => Number.isInteger(v) && v >= 1 && v <= 6) && Number.isInteger(h.total) &&
    h.values.reduce((sum, v) => sum + v, 0) === h.total && Number.isFinite(h.confidence) && h.confidence >= 80 && h.confidence <= 100;
  const key = h => [...h.values].sort((a, b) => a - b).join(',');

  function create({ revision = 0, entries = [], now = Date.now, minStableMs = 500, cycleMs = 35000 } = {}) {
    if (!Array.isArray(entries) || typeof now !== 'function' || !Number.isFinite(minStableMs) || minStableMs < 0 || !Number.isFinite(cycleMs) || cycleMs <= 0) throw new TypeError('Invalid history tracker options');
    let layout = revision, started = false, baseline = null, initial = null, latest = null;
    let baselineAt = null, transitionAt = -Infinity, lastWatchAt = -Infinity, lastReadAt = -Infinity;
    let lastId = 0, version = 0, ocr = null, ocrCandidate = null, visualCandidate = null, queue = [];
    for (const entry of entries) {
      const id = entry?.screen?.round;
      if (typeof id === 'string' && /^\d+$/.test(id) && Number.isSafeInteger(Number(id))) lastId = Math.max(lastId, Number(id));
    }
    let result = { status: 'waiting', message: 'Waiting for a stable history baseline' };
    function report(status, message, extra = {}) { result = { status, message, ...extra }; return result; }
    function current(extra = {}) {
      const first = queue[0];
      if (first?.gap) return report('gap', 'An unread result has moved beyond visible history', extra);
      if (first?.entry) return report('ready', 'History result verified', { ...extra, entry: first.entry });
      if (first) return report('reading', 'Reading history results in order', extra);
      return report('waiting', baselineAt !== null && lastWatchAt - baselineAt >= cycleMs ? 'History update overdue; an identical strip cannot confirm a new roll' : 'Waiting for a history update', extra);
    }
    function reset({ revision: next = layout } = {}) {
      layout = next; started = false; baseline = null; initial = null; latest = null; baselineAt = null;
      transitionAt = -Infinity; lastWatchAt = -Infinity; lastReadAt = -Infinity; version = 0; ocr = null; ocrCandidate = null; visualCandidate = null; queue = [];
      return report('waiting', 'Waiting for a stable history baseline');
    }
    function sync({ at, anchorAt = at } = {}) {
      if (!Number.isFinite(at) || !Number.isFinite(anchorAt) || anchorAt > at || at < lastWatchAt) return report('stale', 'Ignoring invalid synchronization time');
      started = true;
      baseline = latest && initial?.stable ? copySlots(latest) : null;
      baselineAt = baseline ? anchorAt : null;
      transitionAt = at; queue = []; version = 0; ocr = null; ocrCandidate = null; visualCandidate = null;
      return report('waiting', baseline ? 'History baseline captured; waiting for an update' : 'Waiting for a stable history baseline');
    }
    function shift(at) {
      const stamp = Math.max(Math.floor(now()), lastId + 1);
      if (!Number.isSafeInteger(stamp) || stamp < 0) return null;
      lastId = stamp;
      queue.forEach(item => { item.index++; item.candidate = null; if (item.index >= 3 && !item.entry) item.gap = true; });
      const event = { id: String(stamp), at };
      queue.push({ event, index: 0, candidate: null, entry: null, gap: false });
      version++; transitionAt = at; baselineAt = at;
      return event;
    }
    function watch(sample) {
      if (!sample || sample.revision !== layout || !Number.isFinite(sample.at) || sample.at < lastWatchAt || sample.at < lastReadAt || sample.at < transitionAt || !validFrame(sample.frame) || !validSlots(sample.slots)) return report('stale', 'Ignoring invalid or stale history frame');
      lastWatchAt = sample.at;
      const slots = copySlots(sample.slots); latest = slots;
      if (!baseline) {
        if (!initial || !sameStrip(slots, initial.slots)) initial = { slots, at: sample.at, frame: sample.frame, stable: false };
        else if (sample.frame !== initial.frame && sample.at - initial.at >= minStableMs) {
          initial.stable = true;
          if (started) { baseline = slots; baselineAt = sample.at; }
        }
        return report('waiting', started && baseline ? 'History baseline captured; waiting for an update' : 'Waiting for a stable history baseline');
      }
      if (started && !sameStrip(slots, baseline) && similar(slots[1], baseline[0]) && similar(slots[2], baseline[1])) {
        baseline = slots; visualCandidate = null;
        const event = shift(sample.at);
        return current(event ? { event } : {});
      }
      if (started && !sameStrip(slots, baseline) && !similar(slots[1], baseline[0]) && similar(slots[2], baseline[0])) {
        if (!visualCandidate || !sameStrip(slots, visualCandidate.slots)) visualCandidate = { slots, at: sample.at, frame: sample.frame };
        else if (sample.frame !== visualCandidate.frame && sample.at - visualCandidate.at >= minStableMs) {
          const at = visualCandidate.at;
          baseline = slots; visualCandidate = null;
          const event = shift(at);
          shift(at);
          return current(event ? { event } : {});
        }
      } else if (started && !sameStrip(slots, baseline) && !similar(slots[1], baseline[0]) && !similar(slots[2], baseline[0])) {
        if (!visualCandidate || !sameStrip(slots, visualCandidate.slots)) visualCandidate = { slots, at: sample.at, frame: sample.frame };
        else if (sample.frame !== visualCandidate.frame && sample.at - visualCandidate.at >= minStableMs) return report('gap', 'History changed without a visible continuity anchor; results may be missing');
      } else visualCandidate = null;
      return current();
    }
    function read(sample) {
      if (!sample || sample.revision !== layout || !Number.isFinite(sample.at) || sample.at < lastReadAt || sample.at < transitionAt || !validFrame(sample.frame) || !validSlots(sample.slots) || !latest || !sameStrip(sample.slots, latest)) return report('stale', 'Ignoring stale history reading');
      lastReadAt = sample.at;
      if (!started || !baseline) return report('waiting', 'Waiting for a stable history baseline');
      const histories = Array.isArray(sample.histories) && sample.histories.length === 3 ? sample.histories : [];
      if (histories.length === 3 && histories.every(validHistory)) {
        const keys = histories.map(key), signature = keys.join('|');
        if (!ocrCandidate || ocrCandidate.signature !== signature || ocrCandidate.version !== version) ocrCandidate = { signature, keys, at: sample.at, frame: sample.frame, version };
        else if (sample.frame !== ocrCandidate.frame && sample.at - ocrCandidate.at >= minStableMs) {
          let event;
          if (ocr && ocr.version === version && signature !== ocr.signature) {
            const single = keys[1] === ocr.keys[0] && keys[2] === ocr.keys[1];
            const double = !single && keys[2] === ocr.keys[0];
            if (single || double) {
              event = shift(sample.at);
              if (double) shift(sample.at);
              baseline = copySlots(sample.slots); visualCandidate = null;
            }
          }
          ocr = { signature, keys, version };
          ocrCandidate = { signature, keys, at: sample.at, frame: sample.frame, version };
          if (event) {
            // This stable strip proves the shift, but a later frame must verify the new result.
            queue[queue.length - 1].candidate = { key: keys[0], at: sample.at, frame: sample.frame, values: [...histories[0].values], total: histories[0].total, confidence: histories[0].confidence };
            return current({ event });
          }
        }
      } else ocrCandidate = null;
      for (const item of queue) {
        if (item.entry || item.gap) continue;
        const h = histories[item.index];
        if (!validHistory(h)) { item.candidate = null; continue; }
        const k = key(h), candidate = item.candidate;
        if (!candidate || candidate.key !== k) item.candidate = { key: k, at: sample.at, frame: sample.frame, values: [...h.values], total: h.total, confidence: h.confidence };
        else if (sample.frame !== candidate.frame && sample.at - candidate.at >= minStableMs) {
          item.entry = { raw: [...candidate.values], screen: { round: item.event.id, capturedAt: item.event.at, confidence: Math.min(candidate.confidence, h.confidence), result: `HISTORY ${candidate.total}` }, wager: { status: 'unknown' } };
        }
      }
      return current();
    }
    function acknowledge(id) {
      if (queue[0]?.entry && queue[0].event.id === id) queue.shift();
      return current();
    }
    function retime({ at, anchorAt = at } = {}) {
      if (!started || !Number.isFinite(at) || !Number.isFinite(anchorAt) || anchorAt > at || at < lastWatchAt) return report('stale', 'Ignoring invalid synchronization time');
      baselineAt = anchorAt;
      return current();
    }
    function manual() {
      if (queue.length) return { status: 'blocked', message: 'History recovery pending; no result was discarded' };
      if (latest) {
        baseline = copySlots(latest); baselineAt = Math.max(lastWatchAt, lastReadAt);
        ocr = null; ocrCandidate = null; visualCandidate = null;
      }
      return current();
    }
    return { watch, read, sync, retime, acknowledge, manual, reset, pending: () => queue.length, status: () => result };
  }
  const api = { create };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SicBoHistory = api;
})(this);
