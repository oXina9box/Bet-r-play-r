const test = require('node:test');
const assert = require('node:assert/strict');
const { create } = require('../js/sicbo-recovery');

function clock(start = 1000) {
  let time = start, next = 0;
  const timers = new Map();
  return {
    now: () => time,
    setTimer: (fn, delay) => { const id = ++next; timers.set(id, { fn, at: time + delay }); return id; },
    clearTimer: id => timers.delete(id),
    advance(ms) {
      const end = time + ms;
      for (;;) {
        const due = [...timers.entries()].filter(([, timer]) => timer.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        time = due[1].at; timers.delete(due[0]); due[1].fn();
      }
      time = end;
    },
    pending: () => timers.size,
  };
}

test('prompts at three seconds and expires fifteen seconds later, without deadline resets', () => {
  const c = clock(), events = [];
  const recovery = create({ ...c, onPrompt: s => events.push(s.state), onExpire: s => events.push(s.state) });
  recovery.begin({ id: 'one', at: c.now() });
  c.advance(2000); recovery.begin({ id: 'one', at: c.now() }); recovery.begin({ id: 'two', at: c.now() });
  c.advance(999); assert.equal(recovery.status().state, 'reading');
  c.advance(1); assert.equal(recovery.status().state, 'manual');
  assert.equal(recovery.status().remainingMs, 15000);
  c.advance(14999); assert.equal(recovery.status().state, 'manual');
  c.advance(1); assert.equal(recovery.status().state, 'ended');
  c.advance(50000); assert.deepEqual(events, ['manual', 'ended']);
  recovery.begin({ id: 'three', at: c.now() }); assert.equal(recovery.status().state, 'ended');
});

test('resolve cancels timers, remembers round IDs, and allows the next round', () => {
  const c = clock(), events = [];
  const recovery = create({ ...c, onPrompt: () => events.push('prompt'), onExpire: () => events.push('expire') });
  recovery.begin({ id: 1, at: c.now() }); recovery.resolve();
  recovery.begin({ id: 1, at: c.now() }); c.advance(20000);
  assert.equal(recovery.status().state, 'resolved'); assert.deepEqual(events, []);
  recovery.begin({ id: 2, at: c.now() }); c.advance(3000); recovery.resolve(); c.advance(15000);
  assert.deepEqual(events, ['prompt']); assert.equal(c.pending(), 0);
});

test('restore uses absolute deadlines and does not reopen expired or ended recovery', () => {
  const c = clock(), events = [];
  const first = create({ ...c }); first.begin({ id: 'x', at: c.now() });
  const snapshot = first.status(); first.stop(); c.advance(5000);
  const second = create({ ...c, onPrompt: () => events.push('prompt'), onExpire: () => events.push('expire') });
  second.restore(snapshot); assert.equal(second.status().state, 'manual');
  assert.equal(second.status().remainingMs, 13000);
  c.advance(13000); assert.deepEqual(events, ['prompt', 'expire']);
  const ended = second.status(); second.restore(ended); c.advance(20000);
  second.restore(snapshot); assert.equal(second.status().state, 'ended');
  assert.deepEqual(events, ['prompt', 'expire']);
  const third = create({ ...c, onExpire: () => events.push('expired restore') });
  third.restore(snapshot); assert.equal(third.status().state, 'ended');
  assert.deepEqual(events, ['prompt', 'expire', 'expired restore']);
});

test('a delayed timer cannot permit resolution after the absolute deadline', () => {
  let now = 1000, expired = 0;
  const recovery = create({ now: () => now, setTimer: () => 1, clearTimer: () => {}, onExpire: () => expired++ });
  recovery.begin({ id: 'late', at: now }); now += 18000;
  recovery.resolve();
  assert.equal(recovery.status().state, 'ended'); assert.equal(expired, 1);
});

test('an overdue history watchdog prompts immediately and keeps the full fifteen-second window', () => {
  const c = clock(), events = [];
  const recovery = create({ ...c, onPrompt: () => events.push('prompt'), onExpire: () => events.push('expire') });
  recovery.begin({ id: 'overdue', at: c.now(), immediate: true });
  assert.deepEqual(events, ['prompt']);
  assert.equal(recovery.status().remainingMs, 15000);
  c.advance(14999); assert.equal(recovery.status().state, 'manual');
  c.advance(1); assert.deepEqual(events, ['prompt', 'expire']);
});

test('synchronous callbacks may resolve or stop without leaving a timer or firing stale callbacks', () => {
  for (const method of ['resolve', 'stop']) {
    const c = clock(), events = []; let recovery;
    recovery = create({ ...c, onChange: s => { if (s.state === 'manual') recovery[method](); }, onPrompt: () => events.push('prompt'), onExpire: () => events.push('expire') });
    recovery.begin({ id: 'x', at: c.now() }); c.advance(3000); c.advance(20000);
    assert.deepEqual(events, []); assert.equal(c.pending(), 0);
  }
});

test('status is a detached snapshot and invalid options, rounds, and snapshots are rejected', () => {
  const c = clock(), recovery = create({ ...c });
  assert.throws(() => create({ now: null }), TypeError);
  assert.throws(() => create({ manualWindowMs: -1 }), TypeError);
  assert.throws(() => recovery.begin({ id: '', at: c.now() }), TypeError);
  assert.throws(() => recovery.begin({ id: 'x', at: NaN }), TypeError);
  assert.throws(() => recovery.restore({ state: 'manual', id: 'x' }), TypeError);
  recovery.begin({ id: 'x', at: c.now() }); const snapshot = recovery.status(); snapshot.state = 'ended';
  assert.equal(recovery.status().state, 'reading');
});
