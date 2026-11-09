const { test } = require('node:test');
const assert = require('node:assert/strict');
const { defaultScenario, validateScenario, simulate, laneResult } = require('../scripts/bet-tests/engine');
const rounds = text => [...text].map((outcome, i) => ({ key: String(i + 1), outcome, session: i % 2 }));
const config = (extra = {}, lane = {}) => {
  const c = defaultScenario('kickoff');
  return { ...c, ...extra, lanes: { ...c.lanes, A: { ...c.lanes.A, ...lane } } };
};
test('flat settlement uses cents; draws lose colors', () => {
  const r = simulate(rounds('ABD'), config());
  assert.equal(r.summary.net, -70);
  assert.deepEqual(r.rows.map(x => x.bets.A), [1, 1, 1]);
  assert.equal(r.summary.staked, 300);
});
test('progressions and selected rounds remain continuous across sessions', () => {
  for (const [ladder, expected] of [['double', [1,2,4,8]], ['linear',[1,2,3,4]], ['fib',[1,1,2,3]], ['custom',[1,3,5,5]]]) {
    const r = simulate(rounds('BBBB'), config({}, { ladder, custom: '1,3,5', lossAction:'up', lossValue:1 }));
    assert.deepEqual(r.rows.map(x => x.bets.A), expected);
  }
  assert.equal(simulate(rounds('BAA'), config({startRound:2,endRound:2})).rows.length,1);
});
test('fib decreases two steps and resets safely', () => {
  const r = simulate(rounds('BBBAB'), config({}, {ladder:'fib',lossAction:'up',winAction:'down',winValue:2}));
  assert.deepEqual(r.rows.map(x=>x.bets.A),[1,1,2,3,1]);
});
test('prospective rules distinguish entering and completed counts', () => {
  for (const [timing, expected] of [['after',[1,1,1,2]],['entering',[1,1,2,2]]]) {
    const rule = {id:'press',priority:1,lane:'A',phase:'stake',enabled:true,conditions:[{source:'betA',metric:'wins',op:'>=',value:3,timing}],action:'set',amount:2};
    assert.deepEqual(simulate(rounds('AAAA'),config(),[rule]).rows.map(x=>x.bets.A),expected);
  }
});
test('draw protection rounds up, loss exposes both stakes, split whole units', () => {
  const c = config({drawMode:'protection', drawThreshold:4, players:2, sideMode:'swap1', drawOwner:'split'}, {initial:4});
  c.lanes.D = {...c.lanes.D,enabled:true};
  const r = simulate(rounds('D'),c);
  assert.equal(r.rows[0].bets.D,1);
  assert.deepEqual(r.rows[0].drawAlloc,[1,0]);
  assert.equal(r.summary.net,80);
  assert.equal(simulate(rounds('B'),c).summary.net,-500);
});
test('independent cash stops whole scenario and preserves remaining rows', () => {
  const c=config({players:2,sideMode:'dual',bankroll1:1,bankroll2:100});
  const r=simulate(rounds('BBB'),c);
  assert.equal(r.summary.stopRound,2);
  assert.equal(r.rows[2].staked,0);
  assert.equal(r.summary.complete,false);
});
test('push returns stake and breaks bet win streak', () => {
  const c=config({game:'baccarat',oddsA:2,oddsB:2,oddsD:9,commissionA:5});
  const r=simulate(rounds('ADA'),c);
  assert.equal(r.rows[1].net,0);
  assert.equal(r.rows[1].counters.betA.wins,0);
  assert.equal(r.summary.net,190);
  assert.equal(laneResult({outcome:'D'},'A','teenpatti'),'push');
  assert.equal(laneResult({outcome:'D'},'A','sicbo'),'loss');
});
test('overrides propagate actual stake; zero skips; off-ladder requires step', () => {
  assert.throws(()=>simulate(rounds('AA'),config(),[],[{key:'1',lane:'A',units:3}]),/nextStep/);
  const r=simulate(rounds('AAA'),config({}, {ladder:'double',winAction:'up'}),[],[{key:'1',lane:'A',units:3,nextStep:2},{key:'3',lane:'A',units:0}]);
  assert.deepEqual(r.rows.map(x=>x.bets.A),[3,4,0]);
  assert.throws(()=>simulate(rounds('A'),config(),[],[{key:'1',lane:'B',units:1,nextStep:0}]),/one.player/i);
});
test('cap policies and targets',()=>{
  for(const [capAction,expected] of [['repeat',[1,2,2]],['reset',[1,2,1]],['pause',[1,2,0]]]){
    assert.deepEqual(simulate(rounds('BBB'),config({}, {ladder:'double',lossAction:'up',cap:2,capAction})).rows.map(x=>x.bets.A),expected);
  }
  assert.equal(simulate(rounds('AAA'),config({profitTarget:1})).summary.stopRound,2);
  assert.equal(simulate(rounds('BBB'),config({lossLimit:1})).summary.stopRound,2);
});
test('inputs, rule conflicts, missing confirmation and immutable inputs',()=>{
  assert.throws(()=>validateScenario(config({unit:0})),/unit/);
  assert.throws(()=>validateScenario(config({players:1,sideMode:'dual'})),/dual/);
  assert.throws(()=>validateScenario(config({}, {custom:'1,no',ladder:'custom'})),/custom/);
  assert.equal(simulate(rounds('A'),config({confirmed:false})).rows[0].status,'Setup incomplete');
  const c=config();const before=JSON.stringify(c);simulate(rounds('AAA'),c);assert.equal(JSON.stringify(c),before);
});
const rule=(extra={})=>({id:'r',priority:1,lane:'A',phase:'after',enabled:true,conditions:[],action:'hold',amount:1,...extra});
test('after rules replace normal actions; explicit actual stakes persist',()=>{
  const c=config({}, {ladder:'double',lossAction:'up'});
  assert.deepEqual(simulate(rounds('BBB'),c,[rule({action:'add',amount:2})]).rows.map(x=>x.bets.A),[1,3,5]);
  assert.deepEqual(simulate(rounds('AAA'),config(),[rule({action:'multiply',amount:2})]).rows.map(x=>x.bets.A),[1,2,4]);
  assert.deepEqual(simulate(rounds('AAA'),config({}, {initial:4}),[rule({action:'reset'})]).rows.map(x=>x.bets.A),[4,4,4]);
  assert.deepEqual(simulate(rounds('AAA'),config(),[rule({action:'pause'})]).rows.map(x=>x.bets.A),[1,0,0]);
});
test('entry triggers persist; rule comparisons and AND use prior counters',()=>{
  const c=config({players:2,sideMode:'dual'});c.lanes.B.startPaused=true;
  const r=rule({lane:'B',phase:'entry',action:'enter',conditions:[{source:'observedA',metric:'losses',op:'=',value:2,timing:'after'},{source:'observedD',metric:'losses',op:'>',value:1,timing:'after'}]});
  assert.deepEqual(simulate(rounds('BBAA'),c,[r]).rows.map(x=>x.bets.B),[0,0,1,1]);
  for(const op of ['<=','<'])assert.equal(simulate(rounds('A'),config(),[rule({phase:'stake',action:'set',amount:2,conditions:[{source:'betA',metric:'wins',op,value:2,timing:'after'}]})]).rows[0].bets.A,2);
});
test('only highest-priority matching entry rule can activate opposite lane',()=>{
  const c=config({players:2,sideMode:'swap1'});
  const enter=rule({id:'enter',lane:'B',phase:'entry',priority:2,action:'enter'});
  for(const action of ['pause','hold']){
    const first=rule({id:'first',lane:'B',phase:'entry',priority:1,action});
    assert.equal(simulate(rounds('A'),c,[enter,first]).rows[0].bets.B,0);
  }
  assert.equal(simulate(rounds('A'),c,[enter]).rows[0].bets.B,1);
});
test('paused or overridden sit-out does not swap leader on observed opposite result',()=>{
  const c=config({sideMode:'swap1'});c.lanes.A.startPaused=true;
  const enter=rule({phase:'entry',action:'enter',conditions:[{source:'observedA',metric:'losses',op:'=',value:1,timing:'after'}]});
  const r=simulate(rounds('BBA'),c,[enter]);
  assert.deepEqual(r.rows.map(x=>x.bets),[{A:0,B:0,D:0},{A:1,B:0,D:0},{A:0,B:1,D:0}]);
  const skipped=simulate(rounds('BB'),config({sideMode:'swap1'}),[],[{key:'1',lane:'A',units:0}]);
  assert.equal(skipped.rows[1].bets.A,1);
});
test('Draw win decreases saved ladder two steps, pauses, then resumes saved position',()=>{
  const c=config({drawMode:'progression'});
  c.lanes.D={...c.lanes.D,enabled:true,ladder:'linear',lossAction:'up',lossValue:1,winAction:'down',winValue:2,winPause:true};
  const enter=rule({lane:'D',phase:'entry',action:'enter',conditions:[{source:'observedD',metric:'losses',op:'=',value:2,timing:'after'}]});
  const r=simulate(rounds('AAADAAA'),c,[enter]);
  assert.deepEqual(r.rows.map(x=>x.bets.D),[1,2,3,4,0,0,2]);
  assert.equal(r.rows[3].nextSteps.D,1);
  assert.throws(()=>validateScenario(config({}, {winPause:'true'})),/pause flag/);
});
test('draw owners, fixed/progression modes and overrides protection',()=>{
  for(const drawOwner of ['P1','P2','split']){
    const c=config({players:2,sideMode:'dual',drawOwner,drawMode:'fixed'});c.lanes.D={...c.lanes.D,enabled:true,initial:3};
    const r=simulate(rounds('D'),c);assert.equal(r.rows[0].bets.D,3);
    assert.deepEqual(r.rows[0].drawAlloc,drawOwner==='P1'?[3,0]:drawOwner==='P2'?[0,3]:[2,1]);
  }
  const c=config({drawMode:'protection'});c.lanes.D.enabled=true;
  assert.equal(simulate(rounds('D'),c,[],[{key:'1',lane:'A',units:8,nextStep:0}]).rows[0].bets.D,2);
  c.drawMode='progression';c.lanes.D.lossAction='add';c.lanes.D.lossValue=1;
  assert.deepEqual(simulate(rounds('AAD'),c).rows.map(x=>x.bets.D),[1,2,3]);
});
test('protection activates on largest color stake; commission included in hedge sizing',()=>{
  const c=config({players:2,sideMode:'dual',drawMode:'protection',drawThreshold:4},{initial:2});
  c.lanes.B.initial=2;c.lanes.D.enabled=true;
  assert.equal(simulate(rounds('D'),c).rows[0].bets.D,0,'two $2 bets do not trigger $4 threshold');
  c.lanes.A.initial=4;c.commissionD=50;
  const r=simulate(rounds('D'),c);
  assert.equal(r.rows[0].bets.D,3,'$6 exposure divided by 2.4 net Draw profit');
  assert.equal(r.rows[0].net,120);
  c.commissionD=100;
  assert.equal(simulate(rounds('D'),c).rows[0].status,'Setup incomplete');
});
test('Draw protection obeys cap repeat, reset and persistent pause',()=>{
  for(const [capAction,expected] of [['repeat',[2,2]],['reset',[1,1]],['pause',[0,0]]]){
    const c=config({drawMode:'protection'},{initial:16});
    c.lanes.D={...c.lanes.D,enabled:true,cap:2,capAction};
    const r=simulate(rounds('AA'),c);
    assert.deepEqual(r.rows.map(x=>x.bets.D),expected);
    assert.match(r.rows[0].reasons.D,/cap/i);
  }
});
test('swap modes, zero bets, stopped history, arithmetic boundary',()=>{
  assert.deepEqual(simulate(rounds('BAA'),config({sideMode:'swap1'})).rows.map(x=>x.bets),[{A:1,B:0,D:0},{A:0,B:1,D:0},{A:1,B:0,D:0}]);
  const c=config({sideMode:'swap2'},{initial:2});assert.equal(simulate(rounds('BA'),c).rows[1].bets.B,1);
  assert.equal(simulate(rounds('BA'),config({sideMode:'swap2'})).rows[1].bets.B,0);
  const huge=config({}, {ladder:'double',initial:1e14});assert.match(simulate(rounds('AA'),huge).rows[0].status,/Arithmetic limit/);
  assert.equal(simulate([],config()).summary.complete,true);
  const zero=config({bankroll1:0});assert.equal(simulate(rounds('A'),zero).summary.bankrollROI,0);
});
test('trust boundaries reject invalid values',()=>{
  for(const patch of [{players:3},{unit:.001},{increment:.001},{startRound:0},{endRound:-1},{protectPercent:101},{startSide:'D'},{sideMode:'bad'},{drawOwner:'P2'},{drawMode:'bad'},{oddsA:-1},{commissionA:101},{bankroll1:-1}])assert.throws(()=>validateScenario(config(patch)));
  for(const patch of [{enabled:'yes'},{startPaused:1},{ladder:'bad'},{lossAction:'bad'},{lossValue:-1},{lossAction:'up',lossValue:.5},{cap:-1},{cap:.5},{capAction:'bad'}])assert.throws(()=>validateScenario(config({},patch)));
  for(const patch of [{lane:'X'},{phase:'bad'},{priority:NaN},{priority:.5},{priority:-1},{priority:100000},{action:'bad'},{amount:-1},{action:'up',amount:.5},{conditions:[{source:'bad'}]}])assert.throws(()=>simulate(rounds('A'),config(),[rule(patch)]));
  assert.throws(()=>simulate(rounds('A'),config(),[rule(),rule({id:'other'})]),/priorities/);
  assert.throws(()=>simulate(rounds('A'),config(),[rule(),rule()]),/IDs/);
  for(const o of [{key:'missing',lane:'A',units:1},{key:'1',lane:'A',units:.5},{key:'1',lane:'A',units:-1},{key:'1',lane:'A',units:1,nextStep:-1}])assert.throws(()=>simulate(rounds('A'),config(),[],[o]));
  assert.throws(()=>simulate([{key:'1',outcome:'X'}],config()));
  assert.throws(()=>laneResult({outcome:'A'},'X','kickoff'));
  assert.throws(()=>defaultScenario('unknown'));
});
