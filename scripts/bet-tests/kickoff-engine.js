'use strict';

const empty = value => value === null || value === undefined || value === '';
const money = cents => cents === 0 ? 0 : cents / 100;
const MAX = Number.MAX_SAFE_INTEGER;

function validateKickoff(inputs) {
  const invalid = [], missing = [];
  const values = Object.fromEntries(Object.entries({globals:9,p1:12,p2:12,draw:11}).map(([name,length]) =>
    [name,Array.from({length},(_,i)=>inputs?.[name]?.[i] ?? null)]));
  function number(group,index,label,{required=false,fallback=0,positive=false,integer=false,choices,currency=false}={}) {
    const raw=values[group][index];
    if(empty(raw)){if(required)missing.push(label);return fallback;}
    const scaled=raw*100,rounded=Math.round(scaled);
    if(typeof raw!=='number'||!Number.isFinite(raw)||raw<0||raw>MAX||
      (positive&&raw<=0)||(integer&&!Number.isSafeInteger(raw))||(choices&&!choices.includes(raw))||
      (currency&&(!Number.isSafeInteger(rounded)||Math.abs(scaled-rounded)>1e-6))){invalid.push(label);return fallback;}
    return currency?rounded:raw;
  }
  const g=(i,label,options)=>number('globals',i,label,options);
  const players=g(0,'Players',{required:true,choices:[1,2]});
  const payout=g(1,'Color payout',{required:true,positive:true});
  const drawRequired=values.draw.slice(0,10).some(x=>typeof x==='number'&&x>0);
  const drawPayout=g(2,'Draw payout',{required:drawRequired,positive:drawRequired});
  const startSide=g(3,'Starting side',{choices:[1,2],fallback:1});
  const colorMode=g(4,'Color mode',{choices:[0,1,2,3,4]});
  if(players===1&&colorMode>=3)invalid.push('Cover requires two players');
  const drawTrigger=g(5,'Draw trigger',{integer:true});
  const owner=g(6,'Draw owner',{choices:[1,2,3],fallback:1});
  const profitTarget=g(7,'Profit target',{currency:true});
  const lossLimit=g(8,'Loss limit',{currency:true});
  function player(name,active) {
    if(!active)return null;
    const bankroll=number(name,0,`${name} bankroll`,{required:true,currency:true});
    const lines=Array.from({length:10},(_,i)=>number(name,i+1,`${name} Bet ${i+1}`,
      {required:name==='p1'&&i===0,positive:name==='p1'&&i===0,currency:true,fallback:null}));
    lines.forEach((line,i)=>{if(line===null)lines[i]=i?lines[i-1]:0;});
    const afterMax=number(name,11,`${name} after Bet 10`,{choices:[0,1]});
    return {bankroll,lines,afterMax};
  }
  const p1=player('p1',true),p2=player('p2',players===2);
  const lines=Array.from({length:10},(_,i)=>number('draw',i,`Draw Bet ${i+1}`,{currency:true,fallback:null}));
  lines.forEach((line,i)=>{if(line===null)lines[i]=i?lines[i-1]:0;});
  const afterMax=number('draw',10,'Draw after Bet 10',{choices:[0,1]});
  const status=missing.length?'Setup incomplete':invalid.length?'Invalid input':'Ready';
  return {valid:!invalid.length,complete:!invalid.length&&!missing.length,status,invalid,missing,
    config:{players,payout,drawPayout,startSide,colorMode,drawTrigger,drawOwner:players===1?1:owner,profitTarget,lossLimit,p1,p2,draw:{lines,afterMax}}};
}

function simulateKickoff(rounds,inputs) {
  if(!Array.isArray(rounds))throw new Error('Invalid history rounds');
  const validation=validateKickoff(inputs),c=validation.config,rows=[];
  const sumKeys=['p1Stake','p2Stake','drawStake','p1Return','p2Return','drawReturn','p1Net','p2Net','net'];
  const totals=Object.fromEntries([...sumKeys,'p1Bankroll','p2Bankroll'].map(k=>[k,null]));
  const result={valid:validation.valid,complete:validation.complete,status:validation.status,rows,totals};
  const blank=(round,i,status)=>({key:round.key,index:i+1,outcome:round.outcome,role:null,factor:null,side:null,step:null,multiplier:null,setEnd:null,
    ...Object.fromEntries([...sumKeys,'cumulative','p1Bankroll','p2Bankroll'].map(k=>[k,null])),status});
  if(!validation.complete){rounds.forEach((r,i)=>rows.push(blank(r,i,validation.status)));return result;}
  const checked=n=>{if(!Number.isSafeInteger(n))throw new Error('Arithmetic limit: unsafe currency amount');return n;};
  const add=(a,b)=>checked(a+b);
  const mul=(a,b)=>{const n=a*b;if(!Number.isFinite(n)||n>MAX)throw new Error('Arithmetic limit: unsafe currency amount');return checked(Math.round(n));};
  const advance=(step,afterMax)=>step===9&&afterMax===1?0:Math.min(9,step+1);
  let leader=c.startSide===1?'A':'B',step1=0,step2=0,drawStep=0,lossStreak=0,drawActive=false,stop='';
  let balance1=c.p1.bankroll,balance2=c.p2?.bankroll??0;
  const sums=Object.fromEntries(sumKeys.map(k=>[k,0]));
  for(const [i,round] of rounds.entries()){
    if(!round||!['A','B','D'].includes(round.outcome))throw new Error('Invalid history round');
    const row=blank(round,i,stop||'bet');rows.push(row);
    if(stop){row.role='Stopped';continue;}
    try{
      const outcome=round.outcome;
      let side1=leader,side2=null,stake1=c.p1.lines[step1],stake2=0;
      if(c.players===2){
        side1='A';side2='B';
        if(c.colorMode===0)stake2=c.p2.lines[step2];
        else {
          stake1=leader==='A'?c.p1.lines[step1]:0;
          stake2=leader==='B'?c.p2.lines[step2]:0;
          if(c.colorMode>=3){
            const threshold=(c.colorMode===3?2:4)*(leader==='A'?c.p1.lines[0]:c.p2.lines[0]);
            if((leader==='A'?stake1:stake2)>=threshold){if(leader==='A')stake2=c.p2.lines[0];else stake1=c.p1.lines[0];}
          }
        }
      }
      const leaderStake=leader==='A'?stake1:(c.players===1?stake1:stake2);
      const leaderStart=c.players===1||leader==='A'?c.p1.lines[0]:c.p2.lines[0];
      const drawStake=c.draw.lines[0]>0&&(c.drawTrigger===0||drawActive||lossStreak>=c.drawTrigger)?c.draw.lines[drawStep]:0;
      const draw1=c.drawOwner===1?drawStake:c.drawOwner===3?Math.ceil(drawStake/2):0,draw2=drawStake-draw1;
      if(add(stake1,draw1)>balance1||(c.players===2&&add(stake2,draw2)>balance2)){
        stop='Stopped: insufficient bankroll';row.status=stop;row.role='Stopped';continue;
      }
      const win1=stake1>0&&outcome===side1,win2=stake2>0&&outcome===side2;
      const profit1=win1?mul(stake1,c.payout):-stake1,profit2=win2?mul(stake2,c.payout):-stake2;
      const drawProfit1=outcome==='D'?mul(draw1,c.drawPayout):-draw1,drawProfit2=outcome==='D'?mul(draw2,c.drawPayout):-draw2;
      const p1Net=add(profit1,drawProfit1),p2Net=add(profit2,drawProfit2);
      const amounts={p1Stake:stake1,p2Stake:stake2,drawStake,p1Return:win1?add(stake1,profit1):0,p2Return:win2?add(stake2,profit2):0,
        drawReturn:outcome==='D'?add(drawStake,add(drawProfit1,drawProfit2)):0,p1Net,p2Net,net:add(p1Net,p2Net)};
      const nextSums=Object.fromEntries(sumKeys.map(k=>[k,add(sums[k],amounts[k])]));
      const next1=add(balance1,p1Net),next2=add(balance2,p2Net);
      Object.assign(row,{role:stake1+stake2+drawStake>0?'bet':'idle',factor:leader,side:side1,step:step1,multiplier:stake1>0?Math.round(stake1/c.p1.lines[0]*100)/100:null,
        ...Object.fromEntries(Object.entries(amounts).map(([k,v])=>[k,money(v)])),cumulative:money(nextSums.net),p1Bankroll:money(next1),p2Bankroll:c.players===2?money(next2):null});
      balance1=next1;balance2=next2;Object.assign(sums,nextSums);
      if(stake1>0)step1=win1?advance(step1,c.p1.afterMax):0;
      if(stake2>0)step2=win2?advance(step2,c.p2.afterMax):0;
      if(c.colorMode>0&&outcome!=='D'&&outcome!==leader&&leaderStake>0&&
        (c.colorMode!==2||leaderStake>=2*leaderStart)){leader=outcome;step1=0;step2=0;}
      if(leaderStake>0)lossStreak=outcome===row.factor?0:lossStreak+1;
      if(c.drawTrigger>0&&lossStreak>=c.drawTrigger)drawActive=true;
      if(drawStake>0){
        if(outcome==='D'){
          drawActive=false;lossStreak=0;
          drawStep=c.drawTrigger>0?0:advance(drawStep,c.draw.afterMax);
        }else drawStep=c.drawTrigger>0?Math.min(9,drawStep+1):0;
      }
      if(c.profitTarget>0&&sums.net>=c.profitTarget)stop='Stopped: profit target';
      if(c.lossLimit>0&&sums.net<=-c.lossLimit)stop='Stopped: loss limit';
      row.status=stop||row.role;
    }catch(error){
      if(!error.message.startsWith('Arithmetic limit:'))throw error;
      stop=error.message;row.status=stop;row.role='Stopped';
    }
  }
  for(const k of sumKeys)totals[k]=money(sums[k]);
  totals.p1Bankroll=money(balance1);totals.p2Bankroll=c.players===2?money(balance2):null;
  result.status=stop||'Complete';return result;
}

module.exports={validateKickoff,simulateKickoff};
