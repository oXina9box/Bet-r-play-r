(function (root) {
  function create({ now = Date.now, setTimer = setTimeout, clearTimer = clearTimeout,
    onChange = () => {}, onPrompt = () => {}, onExpire = () => {},
    promptAfterMs = 3000, manualWindowMs = 15000 } = {}) {
    if (![now, setTimer, clearTimer, onChange, onPrompt, onExpire].every(fn => typeof fn === 'function') ||
        !Number.isFinite(promptAfterMs) || promptAfterMs < 0 || !Number.isFinite(manualWindowMs) || manualWindowMs <= 0) {
      throw new TypeError('Invalid recovery options');
    }
    const idle = () => ({ state: 'idle', id: null, detectedAt: null, promptAt: null, deadline: null });
    const validId = id => (typeof id === 'string' && id.trim().length > 0) || (typeof id === 'number' && Number.isSafeInteger(id) && id >= 0);
    let current = idle(), timer = null, version = 0;
    const resolved = new Set();
    function time() {
      const value = now();
      if (!Number.isFinite(value)) throw new TypeError('Invalid clock time');
      return value;
    }
    function status() {
      return { ...current, remainingMs: current.state === 'manual' ? Math.max(0, current.deadline - time()) : 0 };
    }
    function cancel() {
      version++;
      if (timer !== null) clearTimer(timer);
      timer = null;
    }
    function notify() { onChange(status()); }
    function schedule() {
      const token = version;
      const target = current.state === 'reading' ? current.promptAt : current.deadline;
      timer = setTimer(() => {
        if (version !== token) return;
        timer = null;
        advance();
      }, Math.max(0, target - time()));
    }
    function advance() {
      const stamp = time();
      if (current.state !== 'reading' && current.state !== 'manual') return;
      if (stamp >= current.deadline) {
        current = { ...current, state: 'ended' }; cancel();
        const token = version; notify();
        if (token === version && current.state === 'ended') onExpire(status());
      } else if (current.state === 'reading' && stamp >= current.promptAt) {
        current = { ...current, state: 'manual' };
        const token = version; notify();
        if (token !== version || current.state !== 'manual') return;
        onPrompt(status());
        if (token === version && current.state === 'manual') schedule();
      } else schedule();
    }
    function begin({ id, at, immediate = false } = {}) {
      if (!validId(id) || !Number.isFinite(at) || at < 0) throw new TypeError('Invalid recovery round');
      if (resolved.has(id) || ['reading', 'manual', 'ended'].includes(current.state)) return status();
      const promptAt = at + (immediate ? 0 : promptAfterMs), deadline = promptAt + manualWindowMs;
      if (!Number.isFinite(deadline)) throw new TypeError('Invalid recovery deadline');
      cancel(); current = { state: 'reading', id, detectedAt: at, promptAt, deadline };
      const token = version; notify();
      if (token === version && current.state === 'reading') advance();
      return status();
    }
    function resolve() {
      if (current.state !== 'reading' && current.state !== 'manual') return status();
      if (time() >= current.deadline) { advance(); return status(); }
      cancel(); resolved.add(current.id); current = { ...current, state: 'resolved' }; notify();
      return status();
    }
    function stop() { cancel(); current = idle(); notify(); return status(); }
    function restore(snapshot) {
      if (!snapshot || !['idle', 'reading', 'manual', 'ended', 'resolved'].includes(snapshot.state)) throw new TypeError('Invalid recovery snapshot');
      if (snapshot.state !== 'idle' && (!validId(snapshot.id) || !Number.isFinite(snapshot.detectedAt) || snapshot.detectedAt < 0 ||
          !Number.isFinite(snapshot.promptAt) || !Number.isFinite(snapshot.deadline) || snapshot.promptAt < snapshot.detectedAt || snapshot.deadline <= snapshot.promptAt)) {
        throw new TypeError('Invalid recovery snapshot');
      }
      if (current.state === 'ended' || (resolved.has(snapshot.id) && (snapshot.state === 'reading' || snapshot.state === 'manual'))) return status();
      cancel();
      current = snapshot.state === 'idle' ? idle() : { state: snapshot.state, id: snapshot.id, detectedAt: snapshot.detectedAt, promptAt: snapshot.promptAt, deadline: snapshot.deadline };
      if (current.state === 'resolved') resolved.add(current.id);
      const token = version; notify();
      if (token === version && (current.state === 'reading' || current.state === 'manual')) advance();
      return status();
    }
    return { begin, resolve, stop, restore, status };
  }
  const api = { create };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SicBoRecovery = api;
})(this);
