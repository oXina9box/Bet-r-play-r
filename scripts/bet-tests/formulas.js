'use strict';
const ExcelJS = require('exceljs');
const { LANES, ROW } = require('./schema');
const quote = value => `"${String(value).replaceAll('"', '""')}"`;
const iff = (a,b,c) => `IF(${a},${b},${c})`;
const both = (...a) => `AND(${a.join(',')})`;
const any = (...a) => `OR(${a.join(',')})`;
const truth = ref => `OR(${ref}=TRUE,UPPER(${ref})="TRUE")`;

const VISIBLE = ['Round','Key','Timestamp','Session','Details','Outcome','Status','Reason A','Reason B','Reason D',
  'Auto A','Auto B','Auto D','Bet A','Bet B','Bet D','P1 Draw','P2 Draw','P1 Before','P2 Before',
  'Staked','Returned','Net','Running','P1 Cash','P2 Cash','Peak','Lowest','Drawdown','Max Drawdown','Largest Bet'];
const MONEY=VISIBLE.slice(18);
const STATE = ['selected','setup','setupEnums','invalid','leader','nextLeader','stopNext','overrideCount','requestedA','requestedB','requestedD','protectionNeed','protectionCapHit','lastColor','outcomeRun','leaderLosses','nonDrawGap','drawActive','drawWinPaused','Cross Bet','D Gross','D Staked','D Net','P1 Low','P2 Low'];
for (const lane of LANES) {
  STATE.push(...['step','manual','paused','entryStep','entryManual','entryPaused','actionStep','actionManual','actionPaused','stakeStep','stakeManual','stakePaused',
    'entryRule','stakeRule','afterRule','override','overrideStep','rawUnits','capUnits','result','nextStep','nextManual','nextPaused',
    'observedWins','observedLosses','observedPushes','observedStake','betWins','betLosses','betPushes','betStake'].map(k=>`${lane}_${k}`));
}

function buildLedger(ws, { scenarioColumn, ruleRows, ladderRanges, capacity, historyCount }) {
  const names=[...VISIBLE.map(n=>MONEY.includes(n)?`${n} dollars`:n),...MONEY,...STATE,...ruleRows.flatMap((_,i)=>[`preRule${i}`,`postRule${i}`])];
  const col=Object.fromEntries(names.map((n,i)=>[n,ExcelJS.Workbook ? ws.getColumn(i+1).letter : i+1]));
  const cfg=key=>`Scenarios!$${scenarioColumn}$${ROW[key]}`;
  const lc=(lane,key)=>cfg(`${lane}.${key}`);
  const id=cfg('id');
  const put=(row,key,formula)=>{ws.getCell(`${col[key]}${row}`).value={formula};};
  const manualSheet=`'${ws.name}'`;
  const initial={};
  for(const lane of LANES) initial[lane]={step:'0',manual:'-1',paused:lc(lane,'startPaused')};

  for(let row=3;row<capacity+3;row++) {
    const here=key=>`${col[key]}${row}`;
    const prev=(key,fallback='0')=>row===3?fallback:`${col[key]}${row-1}`;
    const hrow=row-1;
    const active=here('selected');
    const dollarsToCents=expr=>`ROUND((${expr})*100,0)`;
    const condition=(rr,offset,post)=>{
      const field=letter=>`Rules!$${letter}$${rr}`;
      const letters=offset===0?['G','H','I','J','K']:['L','M','N','O','P'];
      const [source,metric,op,value,timing]=letters.map(field);
      const sources=['observedA','observedB','observedD','betA','betB','betD'];
      const sourceIndex=`MATCH(${source},{"observedA","observedB","observedD","betA","betB","betD"},0)`;
      const metricIndex=`MATCH(${metric},{"wins","losses","pushes","stake"},0)`;
      const starts=sources.map(s=>names.indexOf(`${s.at(-1)}_${s.startsWith('observed')?'observed':'bet'}Wins`)+1).join(',');
      const steps=['A','B','D'].map(lane=>names.indexOf(`${lane}_${post?'stakeStep':'nextStep'}`)+1).join(',');
      const index=iff(`${metric}="step"`,`CHOOSE(MATCH(RIGHT(${source},1),{"A","B","D"},0),${steps})`,`CHOOSE(${sourceIndex},${starts})+${metricIndex}-1`);
      const actual=!post&&row===3?'0':`INDEX($A${post?row:row-1}:$${col[names.at(-1)]}${post?row:row-1},1,${index})`;
      const threshold=`(${value}-${iff(both(`${timing}="entering"`,any(`${metric}="wins"`,`${metric}="losses"`,`${metric}="pushes"`)),1,0)})`;
      let allowed='""';
      for(const [operator,signs] of [['>=','23'],['=','2'],['<=','12'],['>','3'],['<','1']]) allowed=iff(`${op}=${quote(operator)}`,quote(signs),allowed);
      const compare=`ISNUMBER(SEARCH(SIGN((${actual})-${threshold})+2,${allowed}))`;
      return iff(`${source}=""`,'TRUE',compare);
    };
    ruleRows.forEach((rr,i)=>{
      for(const [phase,post] of [['pre',false],['post',true]]) {
        put(row,`${phase}Rule${i}`,iff(both(`Rules!$A$${rr}=${id}`,`Rules!$U$${rr}=1`,condition(rr,0,post),condition(rr,1,post)),`Rules!$D$${rr}+${rr}/1000000`,'1E9'));
      }
    });
    const selectedRule=(lane,phase)=>{
      const scores=ruleRows.map((rr,i)=>iff(both(`Rules!$E$${rr}=${quote(lane)}`,`Rules!$F$${rr}=${quote(phase)}`),here(`${phase==='after'?'post':'pre'}Rule${i}`),'1E9'));
      const minimum=`MIN(${scores.join(',')})`;
      return iff(`${minimum}>=1E9`,'0',`ROUND(MOD(${minimum},1)*1000000,0)`);
    };
    const ruleField=(lane,phase,letter,defaultValue)=>iff(`${here(`${lane}_${phase}Rule`)}=0`,defaultValue,`INDEX(Rules!$${letter}$1:$${letter}$1048576,${here(`${lane}_${phase}Rule`)})`);
    const action=(a,v,step,manual,units,paused)=>({
      step:iff(`${a}="reset"`,0,iff(`${a}="up"`,`${step}+${v}`,iff(`${a}="down"`,`MAX(0,${step}-${v})`,step))),
      manual:iff(any(`${a}="reset"`,`${a}="up"`,`${a}="down"`),-1,iff(`${a}="multiply"`,`${units}*${v}`,iff(`${a}="add"`,`MAX(0,${units}+${v})`,iff(`${a}="set"`,v,manual)))),
      paused:iff(`${a}="pause"`,1,iff(any(`${a}="enter"`,`${a}="reset"`),0,paused)),
    });
    const ladder=(lane,step)=>{
      const range=ladderRanges[lane];
      const custom=`IFERROR(INDEX(${range},MIN(${step}+1,COUNT(${range}))),0)`;
      return `${lc(lane,'initial')}*${iff(`${lc(lane,'ladder')}="double"`,`2^${step}`,iff(`${lc(lane,'ladder')}="linear"`,`${step}+1`,iff(`${lc(lane,'ladder')}="fib"`,`ROUND(((1+SQRT(5))/2)^(${step}+1)/SQRT(5),0)`,iff(`${lc(lane,'ladder')}="gentle"`,`CHOOSE(MIN(${step}+1,5),1,2,3,6,12)`,iff(`${lc(lane,'ladder')}="partial"`,`CHOOSE(MIN(${step}+1,5),1,2,3,5,8)`,iff(`${lc(lane,'ladder')}="custom"`,custom,1))))))}`;
    };
    const effective=(lane,step,manual)=>iff(`${manual}>=0`,manual,ladder(lane,step));
    put(row,'Round',`ROW()-2`);
    for(const [name,column] of [['Key','A'],['Timestamp','B'],['Session','C'],['Outcome','D'],['Details','F']])
      put(row,name,iff(`Rounds!$A${hrow}=""`,'""',`Rounds!$${column}${hrow}`));
    put(row,'selected',both(`${here('Key')}<>""`,`${here('Round')}>=${cfg('startRound')}`,any(`${cfg('endRound')}=0`,`${here('Round')}<=${cfg('endRound')}`)));
    put(row,'leader',prev('nextLeader',cfg('startSide')));
    put(row,'P1 Before',prev('P1 Cash',dollarsToCents(cfg('bankroll1'))));
    put(row,'P2 Before',prev('P2 Cash',iff(`${cfg('players')}=2`,dollarsToCents(cfg('bankroll2')),0)));
    const setupTerms=[truth(cfg('confirmed')),`${cfg('unit')}>=0.01`,`${cfg('increment')}>0`,`ABS(${cfg('unit')}*100-ROUND(${cfg('unit')}*100,0))<0.000001`,`ABS(${cfg('unit')}*${cfg('increment')}*100-ROUND(${cfg('unit')}*${cfg('increment')}*100,0))<0.000001`,`${cfg('unit')}*${cfg('increment')}>=0.01`,`${cfg('bankroll1')}>=0`,`${cfg('bankroll2')}>=0`,any(`${cfg('players')}=1`,`${cfg('players')}=2`),`NOT(AND(${cfg('players')}=1,OR(${['dual','cover2','cover4','cover_quarter','momentum'].map(x=>`${cfg('sideMode')}="${x}"`).join(',')})))`,`NOT(AND(${cfg('players')}=1,${cfg('drawOwner')}<>"P1"))`,`${cfg('drawTrigger')}>=1`,`${cfg('drawTrigger')}=INT(${cfg('drawTrigger')})`,`${cfg('protectPercent')}>=0`,`${cfg('protectPercent')}<=100`,iff(`${cfg('drawMode')}="protection"`,both(`${cfg('oddsD')}>1`,`${cfg('commissionD')}<100`),'TRUE')];
    for(const lane of LANES) setupTerms.push(`${lc(lane,'initial')}>0`,`${lc(lane,'cap')}>=0`,any(`${lc(lane,'cap')}=0`,`${lc(lane,'cap')}>=CEILING(${lc(lane,'initial')},${cfg('increment')})`),`${cfg(`commission${lane}`)}>=0`,`${cfg(`commission${lane}`)}<=100`,iff(lane==='D'?`${cfg('drawMode')}<>"off"`:truth(lc(lane,'enabled')),`${cfg(`odds${lane}`)}>=1`,'TRUE'));
    for(const lane of LANES){
      const range=ladderRanges[lane],first=range.split(':')[0];
      setupTerms.push(iff(`${lc(lane,'ladder')}="custom"`,both(`COUNT(${range})>0`,`COUNT(${range})=COUNTA(${range})`,`MIN(${range})>0`,`SUMPRODUCT((${range}<>"")*(ROW(${range})-ROW(${first})+1))=COUNT(${range})*(COUNT(${range})+1)/2`,any(`${lc(lane,'cap')}=0`,`${lc(lane,'cap')}>=CEILING(${lc(lane,'initial')}*INDEX(${range},1),${cfg('increment')})`)),'TRUE'));
      for(const result of ['win','loss','push'])setupTerms.push(`${lc(lane,`${result}Value`)}>=0`,iff(any(`${lc(lane,`${result}Action`)}="up"`,`${lc(lane,`${result}Action`)}="down"`),`${lc(lane,`${result}Value`)}=INT(${lc(lane,`${result}Value`)})`,'TRUE'));
    }
    const allowed=(ref,values)=>any(...values.map(value=>`${ref}=${quote(value)}`));
    const enums=[allowed(cfg('startSide'),['A','B']),allowed(cfg('sideMode'),['fixed','swap1','swap2','dual','trend2','cover2','cover4','cover_quarter','momentum']),allowed(cfg('drawMode'),['off','fixed','progression','protection','high','streak','cold','gap']),allowed(cfg('drawOwner'),['P1','P2','split'])];
    for(const lane of LANES){
      enums.push(allowed(lc(lane,'ladder'),['flat','double','linear','fib','gentle','partial','custom']),allowed(lc(lane,'capAction'),['repeat','reset','pause']));
      for(const result of ['win','loss','push'])enums.push(allowed(lc(lane,`${result}Action`),['enter','hold','reset','up','down','multiply','add','set','pause']));
      for(const field of ['enabled','startPaused','winPause','lossPause','pushPause'])enums.push(any(`${lc(lane,field)}=TRUE`,`${lc(lane,field)}=FALSE`,`UPPER(${lc(lane,field)})="TRUE"`,`UPPER(${lc(lane,field)})="FALSE"`));
    }
    put(row,'setupEnums',row===3?`IFERROR(${both(...enums)},FALSE)`:`$${col.setupEnums}$3`);
    setupTerms.push(here('setupEnums'),`${cfg('startRound')}>=1`,`${cfg('startRound')}=INT(${cfg('startRound')})`,`${cfg('endRound')}>=0`,`${cfg('endRound')}=INT(${cfg('endRound')})`,any(`${cfg('endRound')}=0`,`${cfg('endRound')}>=${cfg('startRound')}`),`${cfg('drawThreshold')}>=0`,`${cfg('profitTarget')}>=0`,`${cfg('lossLimit')}>=0`);
    for(const field of ['players','bankroll1','bankroll2','unit','increment','startRound','endRound','drawTrigger','drawThreshold','protectPercent','profitTarget','lossLimit','oddsA','oddsB','oddsD','commissionA','commissionB','commissionD'])setupTerms.push(`ISNUMBER(${cfg(field)})`);
    setupTerms.push(...ruleRows.map(rr=>`Rules!$S$${rr}=TRUE`));
    put(row,'setup',row===3?`IFERROR(${both(...setupTerms)},FALSE)`:`$${col.setup}$3`);
    const desired={};
    for(const lane of LANES) {
      put(row,`${lane}_step`,prev(`${lane}_nextStep`,'0'));
      put(row,`${lane}_manual`,prev(`${lane}_nextManual`,'-1'));
      put(row,`${lane}_paused`,lane==='D'?iff(both(any(`${cfg('drawMode')}="cold"`,`${cfg('drawMode')}="gap"`),`${prev('drawWinPaused')}=TRUE`,`${iff(`${cfg('drawMode')}="cold"`,prev('leaderLosses'),prev('nonDrawGap'))}>=${cfg('drawTrigger')}`),0,prev(`${lane}_nextPaused`,truth(lc(lane,'startPaused')))):prev(`${lane}_nextPaused`,truth(lc(lane,'startPaused'))));
      for(const phase of ['entry','stake','after']) put(row,`${lane}_${phase}Rule`,selectedRule(lane,phase));
      const step=here(`${lane}_step`),manual=here(`${lane}_manual`),paused=here(`${lane}_paused`);
      const ea=ruleField(lane,'entry','Q','"hold"'),ev=ruleField(lane,'entry','R','0');
      const entry=action(ea,ev,step,manual,`CEILING(${effective(lane,step,manual)},${cfg('increment')})`,paused);
      put(row,`${lane}_entryStep`,entry.step);put(row,`${lane}_entryManual`,entry.manual);put(row,`${lane}_entryPaused`,entry.paused);
      const es=here(`${lane}_entryStep`),em=here(`${lane}_entryManual`),ep=here(`${lane}_entryPaused`);
      const stake=action(ruleField(lane,'stake','Q','"hold"'),ruleField(lane,'stake','R','0'),es,em,`CEILING(${effective(lane,es,em)},${cfg('increment')})`,ep);
      put(row,`${lane}_actionStep`,stake.step);put(row,`${lane}_actionManual`,stake.manual);put(row,`${lane}_actionPaused`,stake.paused);
      const actionStep=here(`${lane}_actionStep`),actionManual=here(`${lane}_actionManual`);
      put(row,`${lane}_rawUnits`,`IFERROR(${effective(lane,actionStep,actionManual)},1E100)`);
      const exceeds=both(`${lc(lane,'cap')}>0`,`CEILING(${here(`${lane}_rawUnits`)},${cfg('increment')})>${lc(lane,'cap')}`);
      put(row,`${lane}_stakeStep`,iff(both(exceeds,`${lc(lane,'capAction')}="reset"`),0,actionStep));
      put(row,`${lane}_stakeManual`,iff(exceeds,iff(`${lc(lane,'capAction')}="repeat"`,`FLOOR(${lc(lane,'cap')},${cfg('increment')})`,iff(`${lc(lane,'capAction')}="reset"`,-1,actionManual)),actionManual));
      put(row,`${lane}_stakePaused`,iff(both(exceeds,`${lc(lane,'capAction')}="pause"`),1,iff(both(exceeds,`${lc(lane,'capAction')}="reset"`),0,here(`${lane}_actionPaused`))));
      const os=here(`${lane}_stakeStep`),om=here(`${lane}_stakeManual`);
      put(row,`${lane}_capUnits`,`IFERROR(${effective(lane,os,om)},1E100)`);
      const num=lane==='A'?3:lane==='B'?4:5;
      const ocol=String.fromCharCode(64+num),scol=String.fromCharCode(67+num);
      const count=`COUNTIFS(Overrides!$A$2:$A$10001,${id},Overrides!$B$2:$B$10001,${here('Key')},Overrides!$${ocol}$2:$${ocol}$10001,">=0",Overrides!$${ocol}$2:$${ocol}$10001,"<>")`;
      put(row,`${lane}_override`,iff(`${count}=0`,-1,`SUMIFS(Overrides!$${ocol}$2:$${ocol}$10001,Overrides!$A$2:$A$10001,${id},Overrides!$B$2:$B$10001,${here('Key')})`));
      const stepCount=`COUNTIFS(Overrides!$A$2:$A$10001,${id},Overrides!$B$2:$B$10001,${here('Key')},Overrides!$${scol}$2:$${scol}$10001,">=0",Overrides!$${scol}$2:$${scol}$10001,"<>")`;
      put(row,`${lane}_overrideStep`,iff(`${stepCount}=0`,-1,`SUMIFS(Overrides!$${scol}$2:$${scol}$10001,Overrides!$A$2:$A$10001,${id},Overrides!$B$2:$B$10001,${here('Key')})`));
      let eligible=both(truth(lc(lane,'enabled')),`${here(`${lane}_stakePaused`)}=FALSE`);
      if(lane!=='D') eligible=both(eligible,any(iff(`${cfg('sideMode')}="trend2"`,both(`${prev('outcomeRun')}>=2`,`${prev('lastColor','""')}=${quote(lane)}`),iff(any(`${cfg('sideMode')}="fixed"`,`${cfg('sideMode')}="dual"`),iff(`${cfg('players')}=2`,'TRUE',`${here('leader')}=${quote(lane)}`),`${here('leader')}=${quote(lane)}`)),both(`${here(`${lane}_entryRule`)}>0`,`${ruleField(lane,'entry','Q','"hold"')}="enter"`)));
      else eligible=both(eligible,`${cfg('drawMode')}<>"off"`);
      desired[lane]=iff(eligible,`CEILING(${here(`${lane}_capUnits`)},${cfg('increment')})`,0);
    }
    for(const lane of ['A','B']) {
      const opp=lane==='A'?'B':'A';
      const cover=both(any(`${cfg('sideMode')}="cover2"`,`${cfg('sideMode')}="cover4"`,`${cfg('sideMode')}="cover_quarter"`,`${cfg('sideMode')}="momentum"`),`${here('leader')}=${quote(opp)}`,truth(lc(lane,'enabled')),`${here(`${lane}_stakePaused`)}=FALSE`);
      const main=`CEILING(${here(`${opp}_capUnits`)},${cfg('increment')})`;
      const coverUnits=iff(`${cfg('sideMode')}="momentum"`,iff(`${quote(lane)}="A"`,`CEILING(${lc(lane,'initial')},${cfg('increment')})`,0),iff(`${main}>=${iff(`${cfg('sideMode')}="cover4"`,4,2)}`,`CEILING(${iff(`${cfg('sideMode')}="cover_quarter"`,`MAX(1,ROUNDUP(${main}/4,0))`,lc(lane,'initial'))},${cfg('increment')})`,0));
      put(row,`Auto ${lane}`,iff(active,iff(cover,coverUnits,desired[lane]),0));
      // Requested bets are separated from affordable settled bets to avoid circular cash checks.
      desired[lane]=iff(`${here(`${lane}_override`)}>=0`,here(`${lane}_override`),here(`Auto ${lane}`));
      put(row,`requested${lane}`,desired[lane]);desired[lane]=here(`requested${lane}`);
    }
    const actualColors=`(${desired.A}+${desired.B})`;
    const dEffective=`((${cfg('oddsD')}-1)*(1-${cfg('commissionD')}/100))`;
    put(row,'protectionNeed',iff(`MAX(${desired.A},${desired.B})>=${cfg('drawThreshold')}`,`IFERROR(CEILING(${actualColors}*${cfg('protectPercent')}/100/${dEffective},${cfg('increment')}),0)`,0));
    const protection=here('protectionNeed');
    const oldPaused=ws.getCell(here('D_stakePaused')).formula;
    put(row,'protectionCapHit',both(`${cfg('drawMode')}="protection"`,truth(lc('D','enabled')),`(${oldPaused})=FALSE`,`${here('D_override')}<0`,`${lc('D','cap')}>0`,`${protection}>${lc('D','cap')}`));
    const protectionExceeds=here('protectionCapHit');
    for(const [field,value] of [['Step','0'],['Manual','-1'],['Paused','1']]){
      const key=`D_stake${field}`,old=ws.getCell(here(key)).formula;
      put(row,key,iff(both(protectionExceeds,`${lc('D','capAction')}=${quote(field==='Paused'?'pause':'reset')}`),value,old));
    }
    const cappedProtection=value=>iff(both(`${lc('D','cap')}>0`,`${value}>${lc('D','cap')}`),iff(`${lc('D','capAction')}="repeat"`,`FLOOR(${lc('D','cap')},${cfg('increment')})`,iff(`${lc('D','capAction')}="reset"`,`CEILING(${lc('D','initial')},${cfg('increment')})`,0)),value);
    const autoExposure=`(${here('Auto A')}+${here('Auto B')})`;
    const autoProtection=iff(`MAX(${here('Auto A')},${here('Auto B')})>=${cfg('drawThreshold')}`,`IFERROR(CEILING(${autoExposure}*${cfg('protectPercent')}/100/${dEffective},${cfg('increment')}),0)`,0);
    const triggered=iff(`${cfg('drawMode')}="cold"`,prev('leaderLosses'),prev('nonDrawGap'));
    const streakStep=`MAX(0,${prev('outcomeRun')}-(${cfg('drawTrigger')}-1))`;
    const streakUnits=`CEILING(${ladder('D',streakStep)},${cfg('increment')})`;
    const newDraw=iff(`${cfg('drawMode')}="high"`,iff(`MAX(${here('Auto A')},${here('Auto B')})>=${cfg('drawThreshold')}`,`CEILING(${lc('D','initial')},${cfg('increment')})`,0),iff(`${cfg('drawMode')}="streak"`,iff(`${prev('outcomeRun')}>=${cfg('drawTrigger')}-1`,cappedProtection(streakUnits),0),iff(any(`${cfg('drawMode')}="cold"`,`${cfg('drawMode')}="gap"`),iff(any(`${prev('drawActive')}=TRUE`,`${triggered}>=${cfg('drawTrigger')}`),desired.D,0),desired.D)));
    const autoDraw=iff(`${cfg('drawMode')}="protection"`,iff(both(truth(lc('D','enabled')),`(${oldPaused})=FALSE`),cappedProtection(autoProtection),0),iff(`${cfg('drawMode')}="fixed"`,iff(both(truth(lc('D','enabled')),`${here('D_stakePaused')}=FALSE`),`CEILING(${lc('D','initial')},${cfg('increment')})`,0),iff(both(truth(lc('D','enabled')),`${here('D_stakePaused')}=FALSE`),newDraw,0)));
    put(row,'Auto D',iff(active,autoDraw,0));
    const actualProtection=iff(both(truth(lc('D','enabled')),`(${oldPaused})=FALSE`),cappedProtection(protection),0);
    desired.D=iff(`${here('D_override')}>=0`,here('D_override'),iff(`${cfg('drawMode')}="protection"`,actualProtection,here('Auto D')));
    put(row,'requestedD',desired.D);desired.D=here('requestedD');
    const alloc1=iff(`${cfg('players')}=1`,desired.D,iff(`${cfg('drawOwner')}="P1"`,desired.D,iff(`${cfg('drawOwner')}="P2"`,0,`CEILING(${desired.D}/2,${cfg('increment')})`)));
    const alloc2=`(${desired.D}-${alloc1})`;
    const stake1=iff(`${cfg('players')}=1`,`${actualColors}+${desired.D}`,`${desired.A}+${alloc1}`);
    const stake2=`(${desired.B}+${alloc2})`;
    const invalidTerms=[both(`${cfg('players')}=1`,`${desired.A}>0`,`${desired.B}>0`),both(`${cfg('drawMode')}="off"`,`${desired.D}>0`)];
    for(const [index,lane] of LANES.entries()) {
      const letter=String.fromCharCode(67+index),stepLetter=String.fromCharCode(70+index);
      const base=`Overrides!$A$2:$A$10001,${id},Overrides!$B$2:$B$10001,${here('Key')}`;
      const nonempty=`COUNTIFS(${base},Overrides!$${letter}$2:$${letter}$10001,"<>")`;
      const numeric=`COUNTIFS(${base},Overrides!$${letter}$2:$${letter}$10001,">=0",Overrides!$${letter}$2:$${letter}$10001,"<>")`;
      invalidTerms.push(`${nonempty}>1`,`${nonempty}<>${numeric}`,`COUNTIFS(${base},Overrides!$${stepLetter}$2:$${stepLetter}$10001,"<0")>0`,`${desired[lane]}<0`,`${desired[lane]}*${cfg('unit')}*100>9007199254740991`,both(`${lc(lane,'ladder')}="fib"`,`${here(`${lane}_stakeStep`)}>77`),both(`${desired[lane]}>0`,`NOT(${truth(lc(lane,'enabled'))})`),`ABS(${desired[lane]}/${cfg('increment')}-ROUND(${desired[lane]}/${cfg('increment')},0))>0.000001`,both(`${here(`${lane}_override`)}>0`,`${here(`${lane}_overrideStep`)}<0`,`ABS(${here(`${lane}_override`)}-CEILING(${here(`${lane}_capUnits`)},${cfg('increment')}))>0.000001`));
    }
    put(row,'invalid',any(...invalidTerms));
    const insufficient=any(`${dollarsToCents(`${stake1}*${cfg('unit')}`)}>${here('P1 Before')}`,both(`${cfg('players')}=2`,`${dollarsToCents(`${stake2}*${cfg('unit')}`)}>${here('P2 Before')}`));
    const previousStop=prev('stopNext','""');
    put(row,'Status',iff(`${here('Key')}=""`,'""',iff(`NOT(${active})`,'"Outside range"',iff(`NOT(${here('setup')})`,'"Setup incomplete"',iff(`${previousStop}<>""`,previousStop,iff(here('invalid'),'"Invalid bet"',iff(insufficient,'"Insufficient cash"','"PLAY"')))))));
    const played=`${here('Status')}="PLAY"`;
    for(const lane of LANES) put(row,`Bet ${lane}`,iff(played,desired[lane],0));
    put(row,'P1 Draw',iff(played,alloc1,0)); put(row,'P2 Draw',iff(played,alloc2,0));
    put(row,'Staked',dollarsToCents(`(${here('Bet A')}+${here('Bet B')}+${here('Bet D')})*${cfg('unit')}`));
    const gross={};
    for(const lane of LANES) {
      const tiePush=lane!=='D'?both(`${here('Outcome')}="D"`,`Rounds!$E${hrow}=FALSE`):'FALSE';
      const win=`${here('Outcome')}=${quote(lane)}`;
      put(row,`${lane}_result`,iff(win,'"win"',iff(tiePush,'"push"','"loss"')));
      const effectiveOdds=`(1+(${cfg(`odds${lane}`)}-1)*(1-${cfg(`commission${lane}`)}/100))`;
      gross[lane]=dollarsToCents(`${here(`Bet ${lane}`)}*${cfg('unit')}*${iff(win,effectiveOdds,iff(tiePush,1,0))}`);
    }
    put(row,'Returned',`${gross.A}+${gross.B}+${gross.D}`);
    put(row,'Net',`${here('Returned')}-${here('Staked')}`);
    const dWinFactor=iff(`${here('D_result')}="win"`,`(1+(${cfg('oddsD')}-1)*(1-${cfg('commissionD')}/100))`,0);
    const drawReturn1=`IFERROR(ROUND((${gross.D})*${here('P1 Draw')}/${here('Bet D')},0),0)`;
    const drawReturn2=`((${gross.D})-${drawReturn1})`;
    put(row,'P1 Cash',`${here('P1 Before')}+${iff(`${cfg('players')}=1`,here('Net'),`${gross.A}+${drawReturn1}-${dollarsToCents(`(${here('Bet A')}+${here('P1 Draw')})*${cfg('unit')}`)}`)}`);
    put(row,'P2 Cash',`${here('P2 Before')}+${iff(`${cfg('players')}=1`,0,`${gross.B}+${drawReturn2}-${dollarsToCents(`(${here('Bet B')}+${here('P2 Draw')})*${cfg('unit')}`)}`)}`);
    put(row,'Cross Bet',iff(both(`${here('Bet A')}>0`,`${here('Bet B')}>0`),1,0));
    put(row,'D Staked',dollarsToCents(`${here('Bet D')}*${cfg('unit')}`));
    put(row,'D Gross',gross.D);
    put(row,'D Net',`${here('D Gross')}-${here('D Staked')}`);
    put(row,'P1 Low',`MIN(${prev('P1 Low',dollarsToCents(cfg('bankroll1')))},${here('P1 Cash')})`);
    put(row,'P2 Low',`MIN(${prev('P2 Low',iff(`${cfg('players')}=2`,dollarsToCents(cfg('bankroll2')),0))},${here('P2 Cash')})`);
    const total=`(${here('P1 Cash')}+${here('P2 Cash')})`;
    const initialTotal=dollarsToCents(`(${cfg('bankroll1')}+${iff(`${cfg('players')}=2`,cfg('bankroll2'),0)})`);
    put(row,'Running',`${total}-${initialTotal}`);
    put(row,'Peak',`MAX(${prev('Peak',initialTotal)},${total})`);
    put(row,'Lowest',`MIN(${prev('Lowest',initialTotal)},${total})`);
    put(row,'Drawdown',`${here('Peak')}-${total}`);
    put(row,'Max Drawdown',`MAX(${prev('Max Drawdown')},${here('Drawdown')})`);
    put(row,'Largest Bet',`MAX(${prev('Largest Bet')},ROUND(MAX(${here('Bet A')},${here('Bet B')},${here('Bet D')})*${cfg('unit')}*100,0))`);
    const target=any(both(`${cfg('profitTarget')}>0`,`${here('Running')}>=${dollarsToCents(cfg('profitTarget'))}`),both(`${cfg('lossLimit')}>0`,`${here('Running')}<=-${dollarsToCents(cfg('lossLimit'))}`));
    put(row,'stopNext',iff(any(`${here('Status')}="Invalid bet"`,`${here('Status')}="Insufficient cash"`),here('Status'),iff(both(played,target),'"Target reached"',previousStop)));
    const leaderBet=`IF(${here('leader')}="A",${here('Bet A')},${here('Bet B')})`;
    const lossSwap=any(both(any(...['swap1','cover2','cover4','cover_quarter','momentum'].map(x=>`${cfg('sideMode')}="${x}"`)),`${leaderBet}>=1`),both(`${cfg('sideMode')}="swap2"`,`${leaderBet}>=2`));
    const switched=both(played,`${here('Outcome')}<>"D"`,`${here('Outcome')}<>${here('leader')}`,lossSwap);
    put(row,'nextLeader',iff(both(played,`${cfg('sideMode')}="dual"`,`${here('Outcome')}<>"D"`),here('Outcome'),iff(switched,here('Outcome'),here('leader'))));
    const activeLeader=iff(both(`${cfg('sideMode')}="trend2"`,`${prev('outcomeRun')}>=2`),prev('lastColor','""'),here('leader'));
    const activeBet=`IF(${activeLeader}="A",${here('Bet A')},${here('Bet B')})`;
    const drawCycle=any(`${cfg('drawMode')}="cold"`,`${cfg('drawMode')}="gap"`);
    put(row,'lastColor',iff(played,iff(`${here('Outcome')}="D"`,'""',here('Outcome')),prev('lastColor','""')));
    put(row,'outcomeRun',iff(played,iff(`${here('Outcome')}="D"`,0,iff(`${here('Outcome')}=${prev('lastColor','""')}`,`${prev('outcomeRun')}+1`,1)),prev('outcomeRun')));
    put(row,'nonDrawGap',iff(played,iff(`${here('Outcome')}="D"`,0,`${prev('nonDrawGap')}+1`),prev('nonDrawGap')));
    put(row,'leaderLosses',iff(both(played,drawCycle,`${here('Bet D')}>0`,`${here('Outcome')}="D"`),0,iff(both(played,`${activeBet}>0`),iff(`IF(${activeLeader}="A",${here('A_result')},${here('B_result')})="win"`,0,iff(`IF(${activeLeader}="A",${here('A_result')},${here('B_result')})="loss"`,`${prev('leaderLosses')}+1`,prev('leaderLosses'))),prev('leaderLosses'))));
    put(row,'drawActive',iff(both(played,drawCycle,`${here('Bet D')}>0`),`${here('Outcome')}<>"D"`,prev('drawActive')));
    put(row,'drawWinPaused',iff(both(played,drawCycle,`${here('Bet D')}>0`,`${here('Outcome')}="D"`),truth(lc('D','winPause')),iff(both(played,drawCycle,`${prev('drawWinPaused')}=TRUE`,`${iff(`${cfg('drawMode')}="cold"`,prev('leaderLosses'),prev('nonDrawGap'))}>=${cfg('drawTrigger')}`),0,prev('drawWinPaused'))));
    for(const lane of LANES) {
      const settled=here(`${lane}_result`),bet=here(`Bet ${lane}`);
      for(const kind of ['observed','bet']) {
        const stakeKey=`${lane}_${kind}Stake`;
        put(row,stakeKey,iff(kind==='observed'?both(played,active):both(played,`${bet}>0`),bet,prev(stakeKey)));
        for(const [metric,event] of [['Wins','win'],['Losses','loss'],['Pushes','push']]) {
        const key=`${lane}_${kind}${metric}`;
        const should=kind==='observed'?both(played,active):both(played,`${bet}>0`);
        put(row,key,iff(should,iff(`${settled}=${quote(event)}`,`${prev(key)}+1`,0),prev(key)));
        }
      }
      const normalAction=iff(`${settled}="win"`,lc(lane,'winAction'),iff(`${settled}="push"`,lc(lane,'pushAction'),lc(lane,'lossAction')));
      const normalValue=iff(`${settled}="win"`,lc(lane,'winValue'),iff(`${settled}="push"`,lc(lane,'pushValue'),lc(lane,'lossValue')));
      const aa=ruleField(lane,'after','Q',normalAction),av=ruleField(lane,'after','R',normalValue);
      const priorManual=iff(`${here(`${lane}_override`)}>=0`,bet,here(`${lane}_stakeManual`));
      const priorUnits=iff(`${here(`${lane}_override`)}>=0`,bet,`CEILING(${here(`${lane}_capUnits`)},${cfg('increment')})`);
      const next=action(aa,av,here(`${lane}_stakeStep`),priorManual,priorUnits,here(`${lane}_stakePaused`));
      const trendReset=both(`${cfg('sideMode')}="trend2"`,`${prev('outcomeRun')}>=2`,`${activeBet}>0`,`${here('Outcome')}<>${activeLeader}`,lane==='D'?'FALSE':'TRUE');
      const reset=any(both(switched,`${here('nextLeader')}=${quote(lane)}`),trendReset);
      const hasAfter=`${here(`${lane}_afterRule`)}>0`;
      const nextStep=iff(reset,0,iff(both(`${here(`${lane}_overrideStep`)}>=0`,`NOT(${hasAfter})`),here(`${lane}_overrideStep`),next.step));
      const nextManual=iff(reset,-1,iff(both(`${here(`${lane}_overrideStep`)}>=0`,`NOT(${hasAfter})`),-1,next.manual));
      const pauseFlag=iff(`${settled}="win"`,lc(lane,'winPause'),iff(`${settled}="push"`,lc(lane,'pushPause'),lc(lane,'lossPause')));
      const nextPaused=iff(both(switched,`${here('nextLeader')}=${quote(lane)}`),0,iff(both(`NOT(${hasAfter})`,truth(pauseFlag)),1,next.paused));
      // Entry/stake changes persist even when no wager is placed; settlement progression does not.
      const advance=lane==='D'?`${bet}>0`:both(`${bet}>0`,any(`NOT(${any(...['cover2','cover4','cover_quarter','momentum'].map(x=>`${cfg('sideMode')}="${x}"`))})`,`${here('leader')}=${quote(lane)}`));
      put(row,`${lane}_nextStep`,iff(both(played,any(advance,hasAfter,reset)),nextStep,iff(played,here(`${lane}_stakeStep`),here(`${lane}_step`))));
      put(row,`${lane}_nextManual`,iff(both(played,any(advance,hasAfter,reset)),nextManual,iff(played,here(`${lane}_stakeManual`),here(`${lane}_manual`))));
      put(row,`${lane}_nextPaused`,iff(both(played,any(advance,hasAfter,reset)),nextPaused,iff(played,here(`${lane}_stakePaused`),here(`${lane}_paused`))));
      const reason=iff(`${here(`${lane}_override`)}>=0`,'"Manual override"',iff(`${here(`${lane}_entryRule`)}>0`,`"Entry rule "&${ruleField(lane,'entry','B','""')}`,iff(`${here(`${lane}_stakeRule`)}>0`,`"Stake rule "&${ruleField(lane,'stake','B','""')}`,iff(`${here(`${lane}_stakePaused`)}=TRUE`,'"Paused; saved units "&CEILING('+here(`${lane}_capUnits`)+','+cfg('increment')+')',lane==='D'?iff(`${cfg('drawMode')}="protection"`,'"Draw protects current color exposure"','"Draw "&'+cfg('drawMode')):'"Color selection / ladder"'))));
      const afterReason=iff(hasAfter,`"; after rule "&${ruleField(lane,'after','B','""')}&": "&${aa}&" "&${av}`,'""');
      const capReason=iff(both(`${lc(lane,'cap')}>0`,`${here(`${lane}_rawUnits`)}>${lc(lane,'cap')}`),`"; cap "&${lc(lane,'capAction')}`,'""');
      put(row,`Reason ${lane}`,iff(played,`${reason}&${capReason}&"; stake "&${bet}&"u; next step "&${here(`${lane}_nextStep`)}&${afterReason}`,here('Status')));
    }
    MONEY.forEach(name=>put(row,`${name} dollars`,`${here(name)}/100`));
  }
  return { columns:col, names, capacity, historyCount, sheet:manualSheet };
}

module.exports={buildLedger,VISIBLE,STATE};
