'use strict';

// Independent reference engine. All cash accounting uses integer cents.
const LANES = ['A', 'B', 'D'];
const ACTIONS = ['enter','pause','hold','reset','up','down','multiply','add','set'];
const GAMES = ['kickoff','sicbo','teenpatti','baccarat'];
const fail = message => { throw new Error(message); };
const finite = n => typeof n === 'number' && Number.isFinite(n);
const cents = n => {
  const result = Math.round(n * 100);
  if (!Number.isSafeInteger(result)) fail('Arithmetic limit: unsafe currency amount');
  return result;
};
const counter = () => ({ wins:0, losses:0, pushes:0, stake:0, step:0 });
const baseLane = () => ({ enabled:true, startPaused:false, initial:1, ladder:'flat', custom:'1,2,4,8',
  winAction:'hold', winValue:1, lossAction:'hold', lossValue:1,
  pushAction:'hold', pushValue:0, winPause:false, lossPause:false, pushPause:false, cap:0, capAction:'repeat' });

function defaultScenario(game = 'kickoff') {
  if (!GAMES.includes(game)) fail('Unknown game');
  return { id:'flat',name:'Flat',game,players:1,bankroll1:100,bankroll2:100,unit:1,increment:1,
    startRound:1,endRound:0,startSide:'A',sideMode:'fixed',drawOwner:'P1',drawMode:'off',
    drawThreshold:4,protectPercent:100,profitTarget:0,lossLimit:0,
    oddsA:game==='kickoff'?2.3:0,oddsB:game==='kickoff'?2.3:0,oddsD:game==='kickoff'?5.8:0,
    commissionA:0,commissionB:0,commissionD:0,confirmed:game==='kickoff',
    lanes:{ A:baseLane(), B:baseLane(), D:{...baseLane(),enabled:false} } };
}

function customValues(lane) {
  const values = String(lane.custom).split(',').map(x => x.trim() === '' ? NaN : Number(x));
  if (!values.length || values.some(x => !finite(x) || x <= 0)) fail('Invalid custom ladder');
  return values;
}

function validateScenario(c) {
  if (!c || !GAMES.includes(c.game)) fail('Unknown game');
  if (![1,2].includes(c.players)) fail('players must be 1 or 2');
  for (const key of ['unit','increment']) if (!finite(c[key]) || c[key]<=0) fail(`${key} must be positive`);
  if(cents(c.unit)<=0||Math.abs(c.unit*100-cents(c.unit))>1e-7) fail('unit must be whole cents');
  if (cents(c.unit*c.increment)<=0 || Math.abs(c.unit*c.increment*100-cents(c.unit*c.increment))>1e-7) fail('Stake increment must be whole cents');
  for (const key of ['bankroll1','bankroll2','drawThreshold','protectPercent','profitTarget','lossLimit']) {
    if (!finite(c[key]) || c[key]<0) fail(`${key} must be nonnegative`);
  }
  cents(c.bankroll1); cents(c.bankroll2);
  if (c.protectPercent>100) fail('protectPercent must not exceed 100');
  if (!Number.isInteger(c.startRound)||c.startRound<1||!Number.isInteger(c.endRound)||c.endRound<0||(c.endRound>0&&c.endRound<c.startRound)) fail('Invalid round range');
  if (!['A','B'].includes(c.startSide)) fail('Invalid startSide');
  if (!['fixed','swap1','swap2','dual'].includes(c.sideMode)) fail('Invalid sideMode');
  if (c.players===1&&c.sideMode==='dual') fail('dual requires two players');
  if (!['P1','P2','split'].includes(c.drawOwner) || (c.players===1&&c.drawOwner!=='P1')) fail('Invalid Draw owner');
  if (!['off','fixed','progression','protection'].includes(c.drawMode)) fail('Invalid Draw mode');
  for(const key of LANES){
    const l=c.lanes?.[key];
    if(!l||typeof l.enabled!=='boolean'||!finite(l.initial)||l.initial<=0) fail(`Invalid lane ${key}`);
    if(l.startPaused!==undefined&&typeof l.startPaused!=='boolean') fail('Invalid startPaused');
    if(!['flat','double','linear','fib','custom'].includes(l.ladder)) fail('Invalid ladder');
    if(l.ladder==='custom') customValues(l);
    for(const result of ['win','loss','push']) {
      if(l[`${result}Pause`]!==undefined&&typeof l[`${result}Pause`]!=='boolean') fail('Invalid pause flag');
      if(!ACTIONS.includes(l[`${result}Action`])||!finite(l[`${result}Value`])||l[`${result}Value`]<0) fail('Invalid progression action');
      if(['up','down'].includes(l[`${result}Action`])&&!Number.isInteger(l[`${result}Value`])) fail('Step value must be integer');
    }
    if(!finite(l.cap)||l.cap<0||!['repeat','reset','pause'].includes(l.capAction)) fail('Invalid cap');
    if(l.cap&&l.cap+1e-8<roundedUnits(ladderUnits(l,0),c)) fail('Cap cannot be below initial stake');
    if(!finite(c[`odds${key}`])||c[`odds${key}`]<0) fail('Invalid decimal payout');
    if(!finite(c[`commission${key}`])||c[`commission${key}`]<0||c[`commission${key}`]>100) fail('Invalid commission');
  }
  return c;
}

function laneResult(round,lane,game) {
  if (!GAMES.includes(game)||!LANES.includes(lane)||!['A','B','D'].includes(round.outcome)) fail('Invalid settlement input');
  if (round.outcome===lane) return 'win';
  if (round.outcome==='D'&&lane!=='D'&&!round.lossAll&&['teenpatti','baccarat'].includes(game)) return 'push';
  return 'loss';
}

function ladderUnits(lane,step) {
  if(!Number.isSafeInteger(step)||step<0) fail('Arithmetic limit: unsafe ladder step');
  let multiple=1;
  if(lane.ladder==='double') multiple=2**step;
  if(lane.ladder==='linear') multiple=step+1;
  if(lane.ladder==='custom') { const values=customValues(lane); multiple=values[Math.min(step,values.length-1)]; }
  if(lane.ladder==='fib') {
    if(step>77) fail('Arithmetic limit: Fibonacci ladder exhausted');
    let a=1,b=1;
    for(let i=0;i<step;i++){const n=a+b;a=b;b=n;}
    multiple=a;
  }
  return lane.initial*multiple;
}
function roundedUnits(units,c) {
  if(!finite(units)||units<0) fail('Arithmetic limit: invalid stake');
  const increment=cents(c.increment*c.unit);
  const value=Math.ceil((units*c.unit*100-1e-7)/increment)*increment;
  if(!Number.isSafeInteger(value)) fail('Arithmetic limit: unsafe stake');
  return value/cents(c.unit);
}
function stake(state,lane,c) {
  return roundedUnits(state.explicit===null?ladderUnits(lane,state.step):state.explicit,c);
}
function action(state,kind,value,lane,c) {
  if(kind==='hold') return {...state};
  if(kind==='pause') return {...state,paused:true};
  if(kind==='enter') return {...state,paused:false};
  if(kind==='reset') return {step:0,explicit:null,paused:false};
  if(kind==='up'||kind==='down') return {...state,step:Math.max(0,state.step+(kind==='up'?value:-value)),explicit:null};
  const current=stake(state,lane,c);
  const explicit=kind==='multiply'?current*value:kind==='add'?current+value:value;
  return {...state,explicit:Math.max(0,explicit)};
}
function capState(state,lane,c) {
  if(!lane.cap||stake(state,lane,c)<=lane.cap) return state;
  if(lane.capAction==='reset') return {step:0,explicit:null,paused:false};
  if(lane.capAction==='pause') return {...state,paused:true};
  return {...state,explicit:Math.floor(lane.cap/c.increment)*c.increment};
}
function protectionCap(units,state,lane,c) {
  if(!lane.cap||units<=lane.cap) return {units,state,reason:''};
  if(lane.capAction==='pause') return {units:0,state:{...state,paused:true},reason:'Protection exceeds Draw cap; paused'};
  if(lane.capAction==='reset') return {units:roundedUnits(lane.initial,c),state:{step:0,explicit:null,paused:false},reason:'Protection exceeds Draw cap; reset to initial stake; partial protection'};
  return {units:Math.floor(lane.cap/c.increment)*c.increment,state,reason:'Draw cap limits stake; partial protection'};
}
function updatedCounter(previous,result,units,step) {
  return { wins:result==='win'?previous.wins+1:0,losses:result==='loss'?previous.losses+1:0,
    pushes:result==='push'?previous.pushes+1:0,stake:units,step };
}
function validateRules(rules) {
  const priorities=new Set(); const ids=new Set();
  for(const r of rules){
    if(!r.enabled) continue;
    if(!r.id||ids.has(r.id)) fail('Rule IDs must be unique'); ids.add(r.id);
    if(!LANES.includes(r.lane)||!['entry','stake','after'].includes(r.phase)||!Number.isInteger(r.priority)||r.priority<0||r.priority>=100000) fail('Invalid rule target or priority');
    const key=`${r.lane}:${r.phase}:${r.priority}`;
    if(priorities.has(key)) fail('Conflicting rule priorities'); priorities.add(key);
    if(!ACTIONS.includes(r.action)||!finite(r.amount)||r.amount<0) fail('Invalid rule action');
    if(['up','down'].includes(r.action)&&!Number.isInteger(r.amount)) fail('Rule step value must be integer');
    if(!Array.isArray(r.conditions)||r.conditions.length>2) fail('Rules support at most two conditions');
    for(const x of r.conditions){
      if(!/^(observed|bet)[ABD]$/.test(x.source)||!['wins','losses','pushes','stake','step'].includes(x.metric)||!['>=','=','<=','>','<'].includes(x.op)||!finite(x.value)||!['after','entering'].includes(x.timing)) fail('Invalid rule condition');
    }
  }
}
function matchRule(r,counters) {
  return r.conditions.every(x=>{
    const value=counters[x.source][x.metric];
    const threshold=x.value-(x.timing==='entering'&&['wins','losses','pushes'].includes(x.metric)?1:0);
    return x.op==='>='?value>=threshold:x.op==='='?value===threshold:x.op==='<='?value<=threshold:x.op==='>'?value>threshold:value<threshold;
  });
}

function simulate(rounds,c,rules=[],overrides=[]) {
  validateScenario(c); validateRules(rules);
  const selected=rounds.slice(c.startRound-1,c.endRound||undefined);
  const keys=new Set();
  for(const r of rounds){if(!r.key||keys.has(r.key)||!['A','B','D'].includes(r.outcome)) fail('Invalid or duplicate history round');keys.add(r.key);}
  const overrideMap=new Map();
  for(const o of overrides){
    const k=`${o.key}:${o.lane}`;
    if(!keys.has(o.key)||!LANES.includes(o.lane)||overrideMap.has(k)||!finite(o.units)||o.units<0) fail('Invalid or duplicate override');
    if(Math.abs(o.units/c.increment-Math.round(o.units/c.increment))>1e-7) fail('Override must match stake increment');
    if(o.nextStep!=null&&(!Number.isSafeInteger(o.nextStep)||o.nextStep<0)) fail('Invalid override nextStep');
    overrideMap.set(k,o);
  }
  const ordered=rules.filter(r=>r.enabled).toSorted((a,b)=>a.priority-b.priority);
  let states=Object.fromEntries(LANES.map(k=>[k,{step:0,explicit:null,paused:!c.lanes[k].enabled||!!c.lanes[k].startPaused}]));
  let counters=Object.fromEntries(['observed','bet'].flatMap(prefix=>LANES.map(k=>[prefix+k,counter()])));
  let balances=[cents(c.bankroll1),c.players===2?cents(c.bankroll2):0];
  const initial=balances.reduce((a,b)=>a+b,0);
  let leader=c.startSide,totalStaked=0,largestBet=0,peak=initial,drawdown=0,lowest=initial;
  let playerLowest=[...balances],stop='',stopRound=null;
  const rows=[];
  const incomplete=!c.confirmed||LANES.some(k=>(k==='D'?c.drawMode!=='off':c.lanes[k].enabled)&&c[`odds${k}`]<1)
    ||(c.drawMode==='protection'&&(c.oddsD<=1||c.commissionD>=100));
  for(let n=0;n<selected.length;n++){
    const round=selected[n],index=n+c.startRound,before=[...balances];
    const reasons=Object.fromEntries(LANES.map(k=>[k,'Configured progression']));
    const applyPhase=phase=>{
      for(const k of LANES){const rule=ordered.find(r=>r.lane===k&&r.phase===phase&&matchRule(r,counters));
        if(rule){states={...states,[k]:action(states[k],rule.action,rule.amount,c.lanes[k],c)};reasons[k]=`${rule.id}: ${rule.action} ${rule.amount}`;}}
    };
    const empty={A:0,B:0,D:0};
    const row={key:round.key,index,outcome:round.outcome,bets:{...empty},autoBets:{...empty},drawAlloc:[0,0],before,after:[...before],net:0,running:before.reduce((a,b)=>a+b,0)-initial,staked:0,returned:0,status:'Played',reasons,steps:{},nextSteps:{},counters:{}};
    if(stop||incomplete){row.status=stop||'Setup incomplete';row.counters=structuredClone(counters);rows.push(row);continue;}
    try{
      applyPhase('entry'); applyPhase('stake');
      for(const k of LANES){states={...states,[k]:capState(states[k],c.lanes[k],c)};row.steps[k]=states[k].step;}
      for(const k of ['A','B']){
        const active=c.players===2&&['fixed','dual'].includes(c.sideMode)?true:k===leader;
        const entryRule=ordered.find(r=>r.lane===k&&r.phase==='entry'&&matchRule(r,counters));
        const entered=entryRule?.action==='enter';
        row.autoBets[k]=c.lanes[k].enabled&&!states[k].paused&&(active||entered)?stake(states[k],c.lanes[k],c):0;
      }
      if(c.drawMode!=='off'&&c.lanes.D.enabled&&!states.D.paused){
        if(c.drawMode==='protection'){
          const exposure=row.autoBets.A+row.autoBets.B;
          row.autoBets.D=Math.max(row.autoBets.A,row.autoBets.B)>=c.drawThreshold?roundedUnits(exposure*c.protectPercent/100/((c.oddsD-1)*(1-c.commissionD/100)),c):0;
          row.autoBets.D=protectionCap(row.autoBets.D,states.D,c.lanes.D,c).units;
          reasons.D=`Protection of ${exposure} units at ${c.protectPercent}%`;
        }else row.autoBets.D=c.drawMode==='fixed'?roundedUnits(c.lanes.D.initial,c):stake(states.D,c.lanes.D,c);
      }
      row.bets={...row.autoBets};
      for(const k of LANES){
        const o=overrideMap.get(`${round.key}:${k}`);
        if(o){
          if(o.units>0&&!c.lanes[k].enabled) fail('Override requires enabled lane');
          if(o.units>0&&o.nextStep==null&&Math.abs(o.units-stake(states[k],c.lanes[k],c))>1e-8) fail(`Override ${round.key}/${k} outside ladder requires nextStep`);
          if(k==='D'&&o.units>0&&c.drawMode==='off') fail('Draw override requires enabled Draw mode');
          row.bets[k]=o.units;reasons[k]=`Manual override ${o.units} units`;
        }
      }
      if(c.drawMode==='protection'&&c.lanes.D.enabled&&!states.D.paused&&!overrideMap.has(`${round.key}:D`)){
        const exposure=row.bets.A+row.bets.B;
        row.bets.D=Math.max(row.bets.A,row.bets.B)>=c.drawThreshold?roundedUnits(exposure*c.protectPercent/100/((c.oddsD-1)*(1-c.commissionD/100)),c):0;
        reasons.D=`Protection of ${exposure} units at ${c.protectPercent}%`;
        const capped=protectionCap(row.bets.D,states.D,c.lanes.D,c);
        row.bets.D=capped.units;states={...states,D:capped.state};
        if(capped.reason)reasons.D=capped.reason;
      }
      if(c.players===1&&row.bets.A>0&&row.bets.B>0) fail('One-player cannot bet both colors');
      const d=row.bets.D;
      if(c.drawOwner==='P1')row.drawAlloc=[d,0];
      if(c.drawOwner==='P2')row.drawAlloc=[0,d];
      if(c.drawOwner==='split'){
        const second=Math.floor((d/c.increment)/2+1e-9)*c.increment;
        row.drawAlloc=[d-second,second];
      }
      const cash=Object.fromEntries(LANES.map(k=>[k,cents(row.bets[k]*c.unit)]));
      const allocations={A:[cash.A,0],B:c.players===2?[0,cash.B]:[cash.B,0],D:row.drawAlloc.map(x=>cents(x*c.unit))};
      const costs=[0,1].map(p=>LANES.reduce((sum,k)=>sum+allocations[k][p],0));
      if(costs.some((value,p)=>value>balances[p])){stop='Insufficient cash';stopRound=index;}
      else {
        const returns=[0,0];
        const priorStates=structuredClone(states);
        for(const k of LANES){
          const result=laneResult(round,k,c.game);
          const totalReturn=result==='push'?cash[k]:result==='loss'?0:Math.round(cash[k]*(1+(c[`odds${k}`]-1)*(1-c[`commission${k}`]/100)));
          if(!Number.isSafeInteger(totalReturn))fail('Arithmetic limit: unsafe payout');
          const first=cash[k]?Math.round(totalReturn*allocations[k][0]/cash[k]):0;
          returns[0]+=first;returns[1]+=totalReturn-first;
          counters={...counters,[`observed${k}`]:updatedCounter(counters[`observed${k}`],result,row.bets[k],states[k].step)};
          if(cash[k]){
            counters={...counters,[`bet${k}`]:updatedCounter(counters[`bet${k}`],result,row.bets[k],states[k].step)};
            const override=overrideMap.get(`${round.key}:${k}`);
            let next=override?{...states[k],explicit:row.bets[k]}:states[k];
            next=action(next,c.lanes[k][`${result}Action`],c.lanes[k][`${result}Value`],c.lanes[k],c);
            if(override?.nextStep!=null)next={...next,step:override.nextStep,explicit:null};
            if(c.lanes[k][`${result}Pause`])next={...next,paused:true};
            states={...states,[k]:next};
          }
        }
        for(const k of LANES){
          const rule=ordered.find(r=>r.lane===k&&r.phase==='after'&&matchRule(r,counters));
          if(rule){
            const override=overrideMap.get(`${round.key}:${k}`);
            const prior=override?{...priorStates[k],explicit:row.bets[k]}:priorStates[k];
            states={...states,[k]:action(prior,rule.action,rule.amount,c.lanes[k],c)};
            reasons[k]=`${rule.id}: ${rule.action} ${rule.amount} next round`;
          }
        }
        if(c.sideMode.startsWith('swap')&&['A','B'].includes(round.outcome)&&round.outcome!==leader){
          if((c.sideMode==='swap1'&&row.bets[leader]>0)||row.bets[leader]>=2){leader=round.outcome;states={...states,[leader]:{step:0,explicit:null,paused:false}};}
        }
        balances=balances.map((value,p)=>value-costs[p]+returns[p]);
        if(balances.some(value=>!Number.isSafeInteger(value)))fail('Arithmetic limit: unsafe bankroll');
        row.after=[...balances];row.staked=costs[0]+costs[1];row.returned=returns[0]+returns[1];row.net=row.returned-row.staked;
        row.running=balances[0]+balances[1]-initial;
        totalStaked+=row.staked;largestBet=Math.max(largestBet,...Object.values(cash));
        const balance=balances[0]+balances[1];peak=Math.max(peak,balance);drawdown=Math.max(drawdown,peak-balance);lowest=Math.min(lowest,balance);
        playerLowest=playerLowest.map((v,p)=>Math.min(v,balances[p]));
        if(c.profitTarget&&row.running>=cents(c.profitTarget)){stop='Profit target reached';stopRound=index+1;}
        if(c.lossLimit&&row.running<=-cents(c.lossLimit)){stop='Loss limit reached';stopRound=index+1;}
      }
    }catch(error){
      if(!error.message.startsWith('Arithmetic limit:'))throw error;
      stop=error.message;stopRound=index;
    }
    if(stop&&row.staked===0){row.status=stop;row.bets={...empty};row.drawAlloc=[0,0];}
    row.nextSteps=Object.fromEntries(LANES.map(k=>[k,states[k].step]));
    counters=Object.fromEntries(Object.entries(counters).map(([key,value])=>[key,{...value,step:states[key.at(-1)].step}]));
    row.counters=structuredClone(counters);rows.push(row);
  }
  const net=balances[0]+balances[1]-initial;
  return {rows,summary:{net,ending:[...balances],lowest,playerLowest,drawdown,staked:totalStaked,largestBet,
    complete:!incomplete&&(!stop||stopRound> (selected.at(-1)?selected.length+c.startRound-1:0)),stopRound,
    bankrollROI:initial?net/initial:0,yield:totalStaked?net/totalStaked:0}};
}

module.exports={defaultScenario,validateScenario,simulate,laneResult};
