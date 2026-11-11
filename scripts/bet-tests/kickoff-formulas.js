'use strict';

const {validateKickoff}=require('./kickoff-engine');
const MARKER='BET_R_KICKOFF_NUMERIC_V2';
const VISIBLE=['Round','Timestamp','Outcome','Role','Factor','Signal','Step','Multiplier','P1 Stake','P2 Stake','Draw Stake','P1 Return','P2 Return','Draw Return','P1 Net','P2 Net','Net','Cumulative','P1 Bankroll','P2 Bankroll','Set End','Status','Key'];
const MAX='9007199254740991';
const IF=(a,b,c)=>`IF(${a},${b},${c})`,AND=(...v)=>`AND(${v.join(',')})`,OR=(...v)=>`OR(${v.join(',')})`;
const write=(ws,col,row,formula,result)=>{ws.getCell(row,col).value={formula,...(result===undefined||result===null?{}:{result})};};

function buildKickoffFormulas(ws,{rounds,optionsSheet:opts,results}) {
  const raw=(col,row)=>`$${col}$${row}`,external=ref=>`'Test Options'!${ref}`;
  const optional=(cell,fallback='0')=>IF(`ISBLANK(${cell})`,fallback,cell);
  const valid=(x,{positive=false,integer=false,cents=false,choices}={})=>`IFERROR(AND(ISNUMBER(${x}),${x}>=0,${x}<=${MAX}${positive?`,${x}>0`:''}${integer?`,${x}=INT(${x})`:''}${cents?`,${x}*100<=${MAX},ABS(${x}*100-ROUND(${x}*100,0))<=0.000001`:''}${choices?`,OR(${choices.map(v=>`${x}=${v}`).join(',')})`:''}),FALSE)`;
  const bad=[];
  const check=(cell,options={},on='TRUE')=>bad.push(AND(on,`NOT(ISBLANK(${cell}))`,`NOT(${valid(cell,options)})`));
  const defaults=[0,0,0,1,0,0,1,0,0];
  for(let i=0;i<9;i++){
    const cell=raw('B',i+5);
    check(cell,[{choices:[1,2]},{positive:true},{positive:false},{choices:[1,2]},{choices:[0,1,2,3,4]},{integer:true},{choices:[1,2,3]},{cents:true},{cents:true}][i]);
    write(opts,27,i+5,optional(cell,String(defaults[i])));
  }
  bad.push(AND('$B$5=1','$AA$9>=3'),AND('SUM($D$17:$D$26)>0','NOT(ISBLANK($B$7))','$B$7<=0'));
  const missing=OR('ISBLANK($B$5)','ISBLANK($B$6)','ISBLANK($B$16)','ISBLANK($B$17)',AND('$B$5=2','ISBLANK($C$16)'),AND('SUM($D$17:$D$26)>0','ISBLANK($B$7)'));
  for(const [source,dest,active] of [['B',28,'TRUE'],['C',29,'$B$5=2']]){
    check(raw(source,16),{cents:true},active);
    write(opts,dest,16,IF(valid(raw(source,16),{cents:true}),`ROUND(${raw(source,16)}*100,0)`,'0'));
    for(let i=0;i<10;i++){
      const cell=raw(source,17+i);check(cell,{cents:true,positive:source==='B'&&i===0},active);
      write(opts,dest,17+i,IF(`ISBLANK(${cell})`,i?raw(dest===28?'AB':'AC',16+i):'0',IF(valid(cell,{cents:true}),`ROUND(${cell}*100,0)`,'0')));
    }
    check(raw(source,27),{choices:[0,1]},active);write(opts,dest,27,optional(raw(source,27)));
  }
  for(let i=0;i<10;i++){
    const cell=raw('D',17+i);check(cell,{cents:true});
    write(opts,30,17+i,IF(`ISBLANK(${cell})`,i?raw('AD',16+i):'0',IF(valid(cell,{cents:true}),`ROUND(${cell}*100,0)`,'0')));
  }
  check('$D$27',{choices:[0,1]});write(opts,30,27,optional('$D$27'));
  for(let col=27;col<=30;col++)opts.getColumn(col).hidden=true;
  const input={globals:Array.from({length:9},(_,i)=>opts.getCell(5+i,2).value),p1:Array.from({length:12},(_,i)=>opts.getCell(16+i,2).value),p2:Array.from({length:12},(_,i)=>opts.getCell(16+i,3).value),draw:Array.from({length:11},(_,i)=>opts.getCell(17+i,4).value)};
  write(opts,2,29,`IF(${missing},"Setup incomplete",IF(${OR(...bad)},"Invalid input","Ready"))`,validateKickoff(input).status);
  const [players,payout,drawPayout,startSide,mode,trigger,owner,target,limit]=Array.from({length:9},(_,i)=>external(raw('AA',5+i)));
  const ready=`'Test Options'!$B$29="Ready"`,line=(col,step)=>`INDEX('Test Options'!$${col}$17:$${col}$26,${step}+1)`,after=col=>external(raw(col,27));
  const names=['leader','step1','step2','drawStep','lossStreak','drawActive','stop','cum','bank1','bank2','side1','amount1','amount2','leaderStake','leaderStart','drawAmount','draw1','draw2','win1','win2','profit1','profit2','drawProfit1','drawProfit2','return1','return2','drawReturn','net1','net2','roundNet','cumNext','bankNext1','bankNext2','cashStop','unsafe','settle','switch','lossNext',...Array.from({length:9},(_,i)=>`sum${i}`)];
  const map=Object.fromEntries(names.map((name,i)=>[name,i+24]));
  for(const name of names){ws.getCell(6,map[name]).value=name;ws.getColumn(map[name]).hidden=true;}
  const ref=(name,row)=>`${ws.getColumn(map[name]).letter}${row}`;
  const initial={leader:IF(`${startSide}=2`,'"B"','"A"'),step1:'0',step2:'0',drawStep:'0',lossStreak:'0',drawActive:'FALSE',stop:'""',cum:'0',bank1:external('$AB$16'),bank2:IF(`${players}=2`,external('$AC$16'),'0')};
  const advance=(step,reset)=>IF(AND(`${step}=9`,`${reset}=1`),'0',`MIN(9,${step}+1)`);
  const multiply=(amount,rate)=>`IFERROR(ROUND(${amount}*${rate},0),${MAX}+1)`;
  for(let i=0;i<rounds.length;i++){
    const r=i+7,h=i+2,q=name=>ref(name,r),p=name=>i?ref(name,r-1):(initial[name]??'0');
    const put=(name,f)=>write(ws,map[name],r,IF(ready,f,'0'));
    const outcome=`Results!$D${h}`,isDraw=`${outcome}="D"`,stopped=`${p('stop')}<>""`;
    const leaderA=`${p('leader')}="A"`,dual=`${mode}=0`,one=`${players}=1`;
    put('side1',IF(one,p('leader'),'"A"'));
    const s1=line('AB',p('step1')),s2=line('AC',p('step2'));
    const leaderLine=IF(leaderA,s1,s2),leaderStart=IF(OR(one,leaderA),line('AB','0'),line('AC','0'));
    const cover=AND(`${mode}>=3`,`${leaderLine}>=IF(${mode}=3,2,4)*${leaderStart}`);
    put('amount1',IF(OR(one,dual,leaderA),s1,IF(cover,line('AB','0'),'0')));
    put('amount2',IF(one,'0',IF(OR(dual,`NOT(${leaderA})`),s2,IF(cover,line('AC','0'),'0'))));
    put('leaderStake',IF(OR(one,leaderA),q('amount1'),q('amount2')));put('leaderStart',leaderStart);
    put('drawAmount',IF(AND(`${line('AD','0')}>0`,OR(`${trigger}=0`,p('drawActive'),`${p('lossStreak')}>=${trigger}`)),line('AD',p('drawStep')),'0'));
    put('draw1',IF(OR(one,`${owner}=1`),q('drawAmount'),IF(`${owner}=3`,`ROUNDUP(${q('drawAmount')}/2,0)`,'0')));put('draw2',`${q('drawAmount')}-${q('draw1')}`);
    put('cashStop',OR(`${q('amount1')}+${q('draw1')}>${p('bank1')}`,AND(`${players}=2`,`${q('amount2')}+${q('draw2')}>${p('bank2')}`)));
    put('win1',AND(`${q('amount1')}>0`,`${outcome}=${q('side1')}`));put('win2',AND(`${q('amount2')}>0`,`${outcome}="B"`));
    for(const n of [1,2]){
      put(`profit${n}`,IF(q(`win${n}`),multiply(q(`amount${n}`),payout),`-${q(`amount${n}`)}`));
      put(`drawProfit${n}`,IF(isDraw,multiply(q(`draw${n}`),drawPayout),`-${q(`draw${n}`)}`));
      put(`return${n}`,IF(q(`win${n}`),`${q(`amount${n}`)}+${q(`profit${n}`)}`,'0'));
      put(`net${n}`,`${q(`profit${n}`)}+${q(`drawProfit${n}`)}`);
      put(`bankNext${n}`,`${p(`bank${n}`)}+${q(`net${n}`)}`);
    }
    put('drawReturn',IF(isDraw,`${q('drawAmount')}+${q('drawProfit1')}+${q('drawProfit2')}`,'0'));
    put('roundNet',`${q('net1')}+${q('net2')}`);put('cumNext',`${p('cum')}+${q('roundNet')}`);
    const sums=['amount1','amount2','drawAmount','return1','return2','drawReturn','net1','net2','roundNet'];
    const unsafe=[...sums,'profit1','profit2','drawProfit1','drawProfit2','bankNext1','bankNext2','cumNext'].map(n=>`ABS(${q(n)})>${MAX}`);
    sums.forEach((name,j)=>unsafe.push(`ABS(${p(`sum${j}`)}+${q(name)})>${MAX}`));
    put('unsafe',`IFERROR(${OR(...unsafe)},TRUE)`);
    put('settle',AND(`NOT(${stopped})`,`NOT(${q('cashStop')})`,`NOT(${q('unsafe')})`));
    put('switch',AND(q('settle'),`${mode}>0`,`NOT(${isDraw})`,`${outcome}<>${p('leader')}`,`${q('leaderStake')}>0`,OR(`${mode}<>2`,`${q('leaderStake')}>=2*${q('leaderStart')}`)));
    put('lossNext',IF(`${q('leaderStake')}>0`,IF(`${outcome}=${p('leader')}`,'0',`${p('lossStreak')}+1`),p('lossStreak')));
    const state=(name,f)=>put(name,IF(q('settle'),f,p(name)));
    state('leader',IF(q('switch'),outcome,p('leader')));
    for(const n of [1,2])state(`step${n}`,IF(q('switch'),'0',IF(`${q(`amount${n}`)}>0`,IF(q(`win${n}`),advance(p(`step${n}`),after(n===1?'AB':'AC')),'0'),p(`step${n}`))));
    const drawWon=AND(`${q('drawAmount')}>0`,isDraw);
    state('lossStreak',IF(drawWon,'0',q('lossNext')));
    state('drawActive',IF(drawWon,'FALSE',OR(p('drawActive'),AND(`${trigger}>0`,`${q('lossNext')}>=${trigger}`))));
    state('drawStep',IF(`${q('drawAmount')}>0`,IF(`${trigger}>0`,IF(isDraw,'0',`MIN(9,${p('drawStep')}+1)`),IF(isDraw,advance(p('drawStep'),after('AD')),'0')),p('drawStep')));
    state('cum',q('cumNext'));state('bank1',q('bankNext1'));state('bank2',q('bankNext2'));
    sums.forEach((name,j)=>state(`sum${j}`,`${p(`sum${j}`)}+${q(name)}`));
    const targetStop=AND(`${target}>0`,`${q('cumNext')}>=ROUND(${target}*100,0)`),limitStop=AND(`${limit}>0`,`${q('cumNext')}<=-ROUND(${limit}*100,0)`);
    put('stop',IF(stopped,p('stop'),IF(q('cashStop'),'"Stopped: insufficient bankroll"',IF(q('unsafe'),'"Arithmetic limit: unsafe currency amount"',IF(limitStop,'"Stopped: loss limit"',IF(targetStop,'"Stopped: profit target"','""'))))));
    const cached=key=>results?.rows?.[i]?.[key],show=(col,f,key)=>write(ws,col,r,f,cached(key));
    const visible=f=>IF(AND(ready,q('settle')),f,'""');
    show(1,String(i+1),'index');show(2,`IF(ISNUMBER(Results!$B${h}),Results!$B${h}/86400000+DATE(1970,1,1),"")`,'timestamp');
    show(3,IF(`${outcome}="A"`,'"Red"',IF(`${outcome}="B"`,'"Blue"','"Draw"')),'displayOutcome');
    const role=IF(q('settle'),IF(`${q('amount1')}+${q('amount2')}+${q('drawAmount')}>0`,'"bet"','"idle"'),'"Stopped"');
    show(4,IF(ready,role,'""'),'role');show(5,visible(p('leader')),'factor');show(6,visible(q('side1')),'side');show(7,visible(p('step1')),'step');
    show(8,visible(IF(`${q('amount1')}>0`,`ROUND(${q('amount1')}/${line('AB','0')},2)`,'""')),'multiplier');
    const columns=[['amount1','p1Stake'],['amount2','p2Stake'],['drawAmount','drawStake'],['return1','p1Return'],['return2','p2Return'],['drawReturn','drawReturn'],['net1','p1Net'],['net2','p2Net'],['roundNet','net'],['cumNext','cumulative'],['bankNext1','p1Bankroll'],['bankNext2','p2Bankroll']];
    columns.forEach(([name,key],j)=>show(9+j,j===11?IF(`${players}=2`,visible(`${q(name)}/100`),'""'):visible(`${q(name)}/100`),key));
    show(21,'""','setEnd');show(22,IF(ready,IF(`${q('stop')}<>""`,q('stop'),role),"'Test Options'!$B$29"),'status');show(23,`Results!$A${h}`,'key');
  }
  return {columns:Object.fromEntries(VISIBLE.map((x,i)=>[x,i+1])),state:map};
}
module.exports={buildKickoffFormulas,MARKER,VISIBLE};
