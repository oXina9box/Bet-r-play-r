const test = require('node:test');
const assert = require('node:assert/strict');
const { create } = require('../js/sicbo-consensus');
const s = (...v) => v.map(n => [n, n, n, n]);
const a = s(2, 5, 8), b = s(11, 2, 5), c = s(11, 11, 2), d = s(14, 11, 11);
const h = (...values) => ({ values, total: values.reduce((x,y) => x+y, 0), confidence: 90 });
const A = h(1,2,3), B = h(1,3,6), C = h(2,3,6), D = h(4,5,6);
const gate = () => create({ revision: 1, now: () => 10000, minStableMs: 500, cycleMs: 35000 });
const watch = (g, at, slots = a, revision = 1) => g.watch({revision, at, frame: `f${at}`, slots});
const read = (g, at, slots, histories, frame = `f${at}`, revision = 1) => g.read({revision, at, frame, slots, histories});
function start(g) { watch(g, 1000); watch(g, 1500); g.sync({at:1500}); }
function verified(g, at, slots, histories) { read(g, at, slots, histories); return read(g, at+500, slots, histories); }

test('sync establishes baseline; 35 seconds only retries and unchanged history never records', () => {
 const g = gate(); start(g);
 assert.equal(watch(g, 36500).status, 'waiting');
 assert.equal(watch(g, 37000).status, 'waiting');
 assert.notEqual(verified(g, 37000, a, [A,B,C]).status, 'ready');
 assert.equal(watch(g, 38000).event, undefined);
});
test('invalid readings retry; two distinct stable valid readings required', () => {
 const g = gate(); start(g); const e = watch(g, 2000, b).event;
 assert.ok(e); read(g, 2000, b, [B,A,C]);
 read(g, 2600, b, [{...B,total: 11},A,C]);
 read(g, 2700, b, [B,A,C]);
 assert.notEqual(read(g, 3300, b, [B,A,C], 'f2700').status, 'ready');
 const r = read(g, 3400, b, [B,A,C]);
 assert.equal(r.status, 'ready'); assert.deepEqual(r.entry.raw, B.values);
 assert.equal(r.entry.screen.round, e.id);
 assert.equal(g.acknowledge(e.id).status, 'waiting');
 assert.equal(watch(g, 3500, b).event, undefined);
});
test('unresolved result moves back as history shifts and entries are acknowledged oldest first', () => {
 const g = gate(); start(g); const first = watch(g, 2000, b).event;
 const second = watch(g, 3000, c).event;
 assert.ok(second); assert.notEqual(first.id, second.id);
 const r = verified(g, 3000, c, [C,B,A]);
 assert.equal(r.entry.screen.round, first.id); assert.deepEqual(r.entry.raw, B.values);
 assert.equal(g.acknowledge(second.id).entry.screen.round, first.id);
 const next = g.acknowledge(first.id);
 assert.equal(next.entry.screen.round, second.id); assert.deepEqual(next.entry.raw, C.values);
 assert.equal(g.acknowledge(second.id).status, 'waiting');
});
test('identical newest masks still count when neighbours prove a fresh shift', () => {
 const g = gate(); start(g); watch(g,2000,b); watch(g,3000,c);
 assert.equal(verified(g,3000,c,[B,B,A]).entry.raw.join(','), B.values.join(','));
});
test('stale capture and wrong layout cannot attach to shifted rows', () => {
 const g = gate(); start(g); watch(g,2000,b); watch(g,3000,c);
 assert.equal(read(g,3100,b,[B,A,C]).status,'stale');
 assert.equal(read(g,3200,c,[C,B,A],'x',2).status,'stale');
 assert.equal(watch(g,3300,[[99],[0],[0]]).status,'stale');
 assert.equal(verified(g,3400,c,[C,B,A]).status,'ready');
});
test('unread result beyond visible columns produces an explicit gap and blocks later entries', () => {
 const g = gate(); start(g); watch(g,2000,b); watch(g,3000,c); watch(g,4000,d); watch(g,5000,s(15,14,11));
 assert.equal(verified(g,5000,s(15,14,11),[D,C,B]).status,'gap');
});
test('stable OCR shift can prove an update when visual masks do not', () => {
 const g = gate(); start(g); verified(g,1600,a,[A,B,C]);
 assert.notEqual(read(g,2200,a,[D,A,B]).status,'ready');
 const transition = read(g,2800,a,[D,A,B]);
 assert.ok(transition.event);
 assert.equal(read(g,3400,a,[D,A,B]).status,'ready');
});
test('sync anchor measures retry time from the actual update before the click', () => {
 const g = gate(); watch(g,1000); watch(g,1500);
 g.sync({at:3500, anchorAt:1500});
 assert.equal(watch(g,36499).message, 'Waiting for a history update');
 assert.match(watch(g,36500).message, /overdue/);
});
test('retiming preserves unread results instead of resetting the run', () => {
 const g = gate(); start(g); const event = watch(g,2000,b).event;
 g.retime({at:4000, anchorAt:2000});
 const result = verified(g,4000,b,[B,A,C]);
 assert.equal(result.entry.screen.round,event.id);
});
test('partial invalid columns do not prevent independently recovering a valid older result', () => {
 const g = gate(); start(g); watch(g,2000,b); watch(g,3000,c);
 const r = verified(g,3000,c,[null,B,null]);
 assert.equal(r.status,'ready'); assert.deepEqual(r.entry.raw,B.values);
 assert.equal(g.acknowledge(r.entry.screen.round).status,'reading');
 assert.equal(verified(g,4000,c,[C,null,null]).status,'ready');
});
test('two missed shifts require stable overlap, then queue both oldest first', () => {
 const g = gate(); start(g);
 const twice = s(12,11,2);
 assert.equal(watch(g,2000,twice).event, undefined);
 const proof = watch(g,2500,twice);
 assert.ok(proof.event);
 const r = verified(g,2500,twice,[C,B,A]);
 assert.deepEqual(r.entry.raw,B.values);
 const next = g.acknowledge(r.entry.screen.round);
 assert.deepEqual(next.entry.raw,C.values);
 assert.equal(g.acknowledge(next.entry.screen.round).status,'waiting');
});
test('manual cannot discard unresolved history and otherwise rebaselines', () => {
 const g = gate(); start(g); watch(g,2000,b); watch(g,3000,c);
 assert.equal(g.manual().status,'blocked');
 const r = verified(g,3000,c,[C,B,A]);
 assert.deepEqual(r.entry.raw,B.values);
 const next = g.acknowledge(r.entry.screen.round);
 assert.deepEqual(next.entry.raw,C.values);
 g.acknowledge(next.entry.screen.round);
 assert.equal(g.manual().status,'waiting');
 assert.equal(watch(g,4000,c).event,undefined);
});
test('a middle column that still matches newest cannot prove two shifts', () => {
 const g = gate(); start(g);
 const ambiguous = s(11,2,2);
 watch(g,2000,ambiguous);
 assert.equal(watch(g,2600,ambiguous).event,undefined);
 assert.equal(g.pending(),0);
});
test('stable OCR overlap recovers two shifts when visual signatures do not move', () => {
 const g = gate(); start(g); verified(g,1600,a,[A,B,C]);
 read(g,2200,a,[D,C,A]);
 assert.ok(read(g,2800,a,[D,C,A]).event);
 read(g,3400,a,[D,C,A]);
 const first = read(g,4000,a,[D,C,A]);
 assert.deepEqual(first.entry.raw,C.values);
 assert.deepEqual(g.acknowledge(first.entry.screen.round).entry.raw,D.values);
});

test('a failed save remains pending until its record is acknowledged', () => {
 const g = gate(); start(g); const event = watch(g, 2000, b).event;
 const ready = verified(g, 2000, b, [B, A, C]);
 assert.equal(ready.entry.screen.round, event.id);
 // A failed record call does not acknowledge the queued result.
 assert.equal(watch(g, 3100, b).entry.screen.round, event.id);
 assert.equal(read(g, 3200, b, [B, A, C]).entry.screen.round, event.id);
 assert.equal(g.pending(), 1);
 assert.equal(g.acknowledge(event.id).status, 'waiting');
 assert.equal(g.pending(), 0);
});

test('stable history without a continuity anchor reports a possible gap without inventing records', () => {
 const g = gate(); start(g); const unknown = s(12, 13, 14);
 assert.equal(watch(g, 2000, unknown).status, 'waiting');
 const result = watch(g, 2500, unknown);
 assert.equal(result.status, 'gap');
 assert.match(result.message, /continuity anchor/);
 assert.equal(g.pending(), 0);
 assert.equal(watch(g, 3000, a).status, 'waiting');
});
