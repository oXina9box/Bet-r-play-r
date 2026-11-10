'use strict';
const ExcelJS = require('exceljs');
const { defaultScenario, validateScenario } = require('./engine');
const { GAME_META } = require('./history');
const { FIELDS, ROW, LANES, RULE_HEADERS, OVERRIDE_HEADERS, get, set, presets } = require('./schema');
const { buildLedger, VISIBLE } = require('./formulas');

const INPUT='DCEEFF', NAVY='152C49';
const text = cell => {
  const value=cell.value;
  if(value&&typeof value==='object') return value.result ?? value.text ?? value.richText?.map(x=>x.text).join('') ?? '';
  return value ?? '';
};
const boolean=value=>value===true||value===1||String(value).toLowerCase()==='true';
function header(ws, values) {
  ws.addRow(values);
  ws.getRow(1).font={bold:true,color:{argb:'FFFFFF'}};
  ws.getRow(1).fill={type:'pattern',pattern:'solid',fgColor:{argb:NAVY}};
  ws.views=[{state:'frozen',ySplit:1}];
  ws.columns.forEach(c=>{c.width=20;});
}
function editable(cell, choices) {
  cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:INPUT}};
  cell.protection={locked:false};
  if(choices)cell.dataValidation={type:'list',allowBlank:false,formulae:[`"${choices.map(v=>typeof v==='boolean'?String(v).toUpperCase():v).join(',')}"`],showErrorMessage:true,error:'Choose a listed value.'};
}

function createLegacyWorkbook({game,rounds=[],scenarios,rules=[],overrides=[],savedReviews=[],capacity,ruleSlots=12,source='Awaiting history'}) {
  if(!GAME_META[game])throw new Error('Unknown game');
  if(!Number.isInteger(ruleSlots)||ruleSlots<1||ruleSlots>128)throw new Error('Rule slots must be 1–128 per scenario');
  const configs=scenarios||presets(defaultScenario,game);
  if(!configs.length||new Set(configs.map(c=>c.id)).size!==configs.length)throw new Error('Scenario IDs must be unique');
  configs.forEach(validateScenario);
  const size=Math.max(capacity||Math.max(200,rounds.length+50),rounds.length);
  if(!Number.isInteger(size)||size<1||size>20000)throw new Error('Capacity must be 1–20000 rounds');
  const wb=new ExcelJS.Workbook();
  wb.savedReviews=savedReviews;
  wb.creator='Bet-R Play-R';wb.calcProperties={fullCalcOnLoad:true,forceFullCalc:true};
  const guide=wb.addWorksheet('Guide');
  header(guide,[`${GAME_META[game].name} — betting tests`,'Instructions']);
  const instructions=[
    ['History source',source],['Workflow','Blue cells are editable. Changes recalculate immediately in Calc. Save .ods as your working file.'],
    ['Refresh','Close workbook, run npm run sync:tests, reopen. Refresh preserves settings/rules/overrides/custom ladders.'],
    ['History','One continuous replay; source session IDs never reset bankrolls or ladders.'],
    ['Sides',`A = ${GAME_META[game].labels[0]}; B = ${GAME_META[game].labels[1]}; D = ${GAME_META[game].labels[2]}.`],
    ['Payouts','Gross decimal odds include returned stake. Commission is percent of profit, not stake. Confirm each game before testing.'],
    ['Units','Unit is dollars per unit; increment is units per chip. Bankrolls are dollars. Ledger cash figures are dollars.'],
    ['One player','Only one side at a time, plus optional Draw. Two players: P1 owns A, P2 owns B. No borrowing/transfers.'],
    ['Ladders','flat; double 1,2,4,8…; linear 1,2,3…; fib 1,1,2,3,5…; custom values on Ladders. Steps start at zero.'],
    ['Actions','up/down change ladder steps; multiply/add/set change current units. reset starts over; pause saves state; enter resumes.'],
    ['Caps','Before placing a bet exceeding cap: repeat clamps to cap, reset restarts initial stake, pause preserves saved state.'],
    ['Timing','entering N means after N−1 completed qualifying events; after N means after N completed events. Bets never use current result.'],
    ['Sources','observedA/B/D counts every selected round; betA/B/D counts only placed bets. Pushes break consecutive win/loss counters.'],
    ['Rules','Lowest numeric priority wins per lane and phase. Up to two AND conditions. Entry/stake use previous counters; after updates following bet.'],
    ['Rule blocks','Edit rows assigned to your scenario. For more slots/scenarios, add rows/columns then close and refresh to rebuild ledgers.'],
    ['Delayed entry','Set lane Start paused TRUE; add an entry/enter rule when other bet lane losses/stake reach desired threshold.'],
    ['Example','Blue enters after Red loss at 2u: B startPaused TRUE, entry enter; betA losses >=1 AND betA stake >=2. Use two players fixed mode.'],
    ['Draw protection','Activation uses largest color stake. Required Draw = total color exposure × percent / effective Draw profit odds, rounded upward.'],
    ['Draw progression','Separate from protection. Start paused; entry rule activates; after-win pause saves ladder; stake/after rules control step changes.'],
    ['Overrides','Use original key from Rounds. Blank is automatic; zero sits out. Outside-ladder positive stake requires explicit next step.'],
    ['Targets','Profit/loss limits stop following bets after settlement; target can overshoot. Insufficient cash stops entire scenario before wager.'],
    ['New scenarios','Duplicate a Scenarios column, give unique ID; copy custom ladders/rule/override rows as needed. Close and refresh to create ledger.'],
    ['History capacity',`${size} formula rows prepared. Refresh automatically extends for more imported history. --capacity increases headroom.`],
    ['Status','Setup incomplete means missing confirmation/payouts; no financial result is simulated. No history means Awaiting history.'],
    ['Game rules','Kickoff Draw loses A/B. Sic Bo triples lose Big/Small and win Any Triple. Teen Patti/Baccarat ties push A/B.'],
    ['Caution','Historical comparisons are fitted tests, not a prediction of future profit. Manual overrides are hindsight experiments.'],
  ];instructions.forEach(row=>guide.addRow(row));guide.getColumn(1).width=24;guide.getColumn(2).width=110;
  guide.eachRow(r=>{r.alignment={vertical:'top',wrapText:true};r.height=32;});
  const history=wb.addWorksheet('Rounds');header(history,['Round key','Timestamp','Session','Outcome','Loss all','Raw details','Round ID']);
  rounds.forEach(r=>history.addRow([r.key,r.timestamp,r.session,r.outcome,r.lossAll,r.raw,r.roundId]));
  history.getColumn(1).width=45;history.getColumn(6).width=45;
  const settings=wb.addWorksheet('Scenarios');
  header(settings,['Setting',...configs.map(c=>c.id)]);settings.addRow(['Game',...configs.map(()=>game)]);
  FIELDS.forEach(([key,label,choices],i)=>{
    const row=settings.getRow(i+3);row.getCell(1).value=label;
    configs.forEach((c,j)=>{row.getCell(j+2).value=get(c,key)??(key.endsWith('startPaused')?false:'');editable(row.getCell(j+2),choices);});
  });settings.getColumn(1).width=43;settings.views=[{state:'frozen',xSplit:1,ySplit:2}];
  const ladder=wb.addWorksheet('Ladders');header(ladder,['Scenario','Lane','Step (0 based)','Multiplier']);
  const ranges={};
  configs.forEach(c=>{
    ranges[c.id]={};
    LANES.forEach(lane=>{
      const values=String(c.lanes[lane].custom||'1,2,4,8').split(',').map(Number);
      const first=ladder.rowCount+1;
      for(let i=0;i<Math.max(32,values.length);i++){
        const row=ladder.addRow([c.id,lane,i,values[i]??null]);editable(row.getCell(4));
      }
      ranges[c.id][lane]=`Ladders!$D$${first}:$D$${ladder.rowCount}`;
    });
  });
  const ruleSheet=wb.addWorksheet('Rules');header(ruleSheet,RULE_HEADERS);
  const groups={};
  configs.forEach(c=>{
    const items=rules.filter(r=>r.scenario===c.id);groups[c.id]=[];
    for(let i=0;i<Math.max(ruleSlots,items.length);i++) {
      const r=items[i],a=r?.conditions[0],b=r?.conditions[1];
      const row=ruleSheet.addRow([c.id,r?.id||'',r?.enabled??false,r?.priority??i+1,r?.lane||'A',r?.phase||'entry',
        a?.source||'',a?.metric||'wins',a?.op||'>=',a?.value??1,a?.timing||'after',
        b?.source||'',b?.metric||'wins',b?.op||'>=',b?.value??1,b?.timing||'after',r?.action||'enter',r?.amount??1]);
      groups[c.id].push(row.number);row.eachCell(cell=>editable(cell));
      for(const column of [7,12])editable(row.getCell(column),['observedA','observedB','observedD','betA','betB','betD']);
      for(const column of [8,13])editable(row.getCell(column),['wins','losses','pushes','stake','step']);
      for(const column of [9,14])editable(row.getCell(column),['>=','=','<=','>','<']);
      for(const column of [11,16])editable(row.getCell(column),['after','entering']);
      editable(row.getCell(5),LANES);editable(row.getCell(6),['entry','stake','after']);editable(row.getCell(3),[true,false]);
      editable(row.getCell(17),['enter','pause','hold','reset','up','down','multiply','add','set']);
    }
  });
  ruleSheet.getCell('S1').value='Rule valid';ruleSheet.getCell('T1').value='Validation';ruleSheet.getCell('U1').value='Enabled normalized';
  const settingsIds=`Scenarios!$B$${ROW.id}:$${settings.getColumn(configs.length+1).letter}$${ROW.id}`;
  const list=(ref,values)=>`OR(${values.map(v=>`${ref}="${v}"`).join(',')})`;
  const lastRule=ruleSheet.rowCount;
  for(let n=2;n<=lastRule;n++){
    const conditions=[['G','H','I','J','K'],['L','M','N','O','P']].map(([s,m,o,v,t])=>
      `OR(${s}${n}="",AND(${list(`${s}${n}`,['observedA','observedB','observedD','betA','betB','betD'])},${list(`${m}${n}`,['wins','losses','pushes','stake','step'])},${list(`${o}${n}`,['>=','=','<=','>','<'])},ISNUMBER(${v}${n}),${list(`${t}${n}`,['after','entering'])}))`);
    ruleSheet.getCell(`U${n}`).value={formula:`IF(OR(C${n}=TRUE,UPPER(C${n})="TRUE"),1,0)`};
    ruleSheet.getCell(`S${n}`).value={formula:`IF(U${n}=0,TRUE,AND(B${n}<>"",COUNTIF(${settingsIds},A${n})=1,ISNUMBER(D${n}),D${n}=INT(D${n}),D${n}>=0,D${n}<100000,${list(`E${n}`,LANES)},${list(`F${n}`,['entry','stake','after'])},${list(`Q${n}`,['enter','pause','hold','reset','up','down','multiply','add','set'])},ISNUMBER(R${n}),R${n}>=0,OR(AND(Q${n}<>"up",Q${n}<>"down"),R${n}=INT(R${n})),COUNTIFS($A$2:$A$${lastRule},A${n},$B$2:$B$${lastRule},B${n},$U$2:$U$${lastRule},1)=1,COUNTIFS($A$2:$A$${lastRule},A${n},$D$2:$D$${lastRule},D${n},$E$2:$E$${lastRule},E${n},$F$2:$F$${lastRule},F${n},$U$2:$U$${lastRule},1)=1,${conditions.join(',')}))`};
    ruleSheet.getCell(`T${n}`).value={formula:`IF(S${n},"","Invalid rule, scenario or duplicate priority/ID")`};
  }
  const overrideSheet=wb.addWorksheet('Overrides');header(overrideSheet,OVERRIDE_HEADERS);
  const merged=new Map();
  for(const o of overrides){const key=`${o.scenario}\0${o.key}`;const row=merged.get(key)||[o.scenario,o.key,null,null,null,null,null,null];const offset=LANES.indexOf(o.lane);row[offset+2]=o.units;row[offset+5]=o.nextStep;merged.set(key,row);}
  if(merged.size>10000)throw new Error('Maximum 10000 override rows per workbook');
  for(const values of merged.values())overrideSheet.addRow(values).eachCell(cell=>editable(cell));
  for(let i=overrideSheet.rowCount+1;i<=Math.max(100,overrides.length+25);i++){
    const row=overrideSheet.getRow(i);
    for(let col=1;col<=8;col++){
      editable(row.getCell(col));
      if(col>=3)row.getCell(col).dataValidation={type:'decimal',operator:'greaterThanOrEqual',formulae:[0],allowBlank:true,showErrorMessage:true,error:'Use a nonnegative number, or leave blank.'};
    }
  }
  const comparison=wb.addWorksheet('Comparison');
  header(comparison,['Scenario','Name','Active','Net ($)','P1 ending ($)','P2 ending ($)','Bankroll ROI','Wagering yield','Total wagered ($)','Lowest team cash ($)','P1 lowest ($)','P2 lowest ($)','Max drawdown ($)','Largest bet ($)','Draw net ($)','Cross-bets?','Status','Players']);
  const metadata={};
  configs.forEach((c,i)=>{
    const ws=wb.addWorksheet(c.id);
    ws.addRow([`${GAME_META[game].name}: ${c.name}`]);ws.addRow(VISIBLE);
    LANES.forEach((lane,n)=>{
      const label=GAME_META[game].labels[n];
      ws.getCell(2,8+n).value=`${label}: reason`;
      ws.getCell(2,11+n).value=`${label}: automatic units`;
      ws.getCell(2,14+n).value=`${label}: bet units`;
    });
    ws.getRow(1).font={bold:true,size:14,color:{argb:NAVY}};
    ws.getRow(2).font={bold:true,color:{argb:'FFFFFF'}};ws.getRow(2).fill={type:'pattern',pattern:'solid',fgColor:{argb:NAVY}};
    const column=settings.getColumn(i+2).letter;
    metadata[c.id]=buildLedger(ws,{scenarioColumn:column,ruleRows:groups[c.id],ladderRanges:ranges[c.id],capacity:size,historyCount:rounds.length});
    ws.views=[{state:'frozen',xSplit:6,ySplit:2}];
    ws.columns.forEach((col,n)=>{col.width=n<7?18:20;if(n>=VISIBLE.length)col.hidden=true;});
    ws.getColumn(2).hidden=true;
    [8,9,10].forEach(n=>{ws.getColumn(n).width=46;});
    for(const n of [19,20,21,22,23,24,25,26,27,28,29,30,31])ws.getColumn(n).numFmt='0.00';
    const last=size+2,cr=comparison.addRow([c.id,c.name]);
    const sheetName=`'${c.id.replaceAll("'","''")}'`;
    const ref=field=>`${sheetName}!${metadata[c.id].columns[field]}${last}`;
    const start=`(Scenarios!$${column}$${ROW.bankroll1}+IF(Scenarios!$${column}$${ROW.players}=2,Scenarios!$${column}$${ROW.bankroll2},0))`;
    const col=metadata[c.id].columns;
    const vals={3:`IF(OR(Scenarios!$${column}$${ROW.active}=TRUE,UPPER(Scenarios!$${column}$${ROW.active})="TRUE"),TRUE,FALSE)`,
      4:`${ref('Running')}/100`,5:`${ref('P1 Cash')}/100`,6:`${ref('P2 Cash')}/100`,
      7:`IFERROR(${ref('Running')}/100/${start},0)`,8:`IFERROR(SUM(${sheetName}!W3:W${last})/SUM(${sheetName}!U3:U${last}),0)`,
      9:`SUM(${sheetName}!U3:U${last})`,10:`${ref('Lowest')}/100`,11:`${ref('P1 Low')}/100`,12:`${ref('P2 Low')}/100`,
      13:`${ref('Max Drawdown')}/100`,14:`${ref('Largest Bet')}/100`,15:`SUM(${sheetName}!${col['D Net']}3:${col['D Net']}${last})/100`,
      16:`IF(SUM(${sheetName}!${col['Cross Bet']}3:${col['Cross Bet']}${last})>0,"Yes","No")`,
      17:rounds.length?`IF(COUNTIF(${sheetName}!G3:G${last},"Setup incomplete")>0,"Setup incomplete",IF(${ref('stopNext')}<>"",${ref('stopNext')},"Complete"))`:'"Awaiting history"',
      18:`Scenarios!$${column}$${ROW.players}`};
    for(const [col,formula] of Object.entries(vals))cr.getCell(Number(col)).value={formula};
    cr.eachCell((cell,n)=>{if(n>=4&&n<=15)cell.numFmt=n===7||n===8?'0.00%':'$#,##0.00;[Red]-$#,##0.00';});
  });
  guide.addRow(['Ledger cash columns','Bankroll/return/net/drawdown columns display dollars. Hidden recurrence uses integer cents. Bets use units.']);
  return wb;
}

function readInputs(wb,game) {
  const savedReviews=wb.getWorksheet('Configurations')?require('./compact').getLayout(wb).savedReviews||[]:wb.savedReviews||[];
  if(wb.getWorksheet('Configurations'))wb=require('./compact').expandWorkbook(wb);
  const sheet=wb.getWorksheet('Scenarios');if(!sheet)throw new Error('Not a betting test workbook: missing Scenarios');
  const inputRows=new Map();
  for(let row=3;row<=sheet.rowCount;row++)inputRows.set(String(text(sheet.getCell(row,1))),row);
  const scenarios=[];
  for(let column=2;column<=sheet.columnCount;column++){
    if(!text(sheet.getCell(inputRows.get('Scenario ID')||ROW.id,column)))continue;
    let config=defaultScenario(game);
    FIELDS.forEach(([key,label])=>{
      const inputRow=inputRows.get(label);if(!inputRow)return;
      const raw=text(sheet.getCell(inputRow,column));
      const original=get(config,key);
      const value=typeof original==='boolean'||key.endsWith('startPaused')?boolean(raw):typeof original==='number'?Number(raw):String(raw);
      config=set(config,key,value);
    });scenarios.push(config);
  }
  const ladders=wb.getWorksheet('Ladders');
  for(let n=2;ladders&&n<=ladders.rowCount;n++){
    const row=ladders.getRow(n),id=String(text(row.getCell(1))),lane=String(text(row.getCell(2))),value=text(row.getCell(4));
    const config=scenarios.find(c=>c.id===id);
    if(value!==''&&(!config||!LANES.includes(lane)))throw new Error(`Unknown scenario/lane in custom ladders: ${id}/${lane}`);
    if(config&&LANES.includes(lane)&&value==='')config._gaps={...config._gaps,[lane]:true};
    if(config&&LANES.includes(lane)&&value!==''){
      if(config._gaps?.[lane])throw new Error(`Custom ladder ${id}/${lane} has a gap; keep values contiguous.`);
      const values=config._custom||{};const current=values[lane]||[];current.push(Number(value));config._custom={...values,[lane]:current};
    }
  }
  const updated=scenarios.map(c=>{
    const {_custom,_gaps,...config}=c;
    return {...config,lanes:Object.fromEntries(LANES.map(lane=>[lane,{...config.lanes[lane],custom:_custom?.[lane]?.join(',')||config.lanes[lane].custom}]))};
  });
  const rules=[],ruleSheet=wb.getWorksheet('Rules');
  for(let n=2;ruleSheet&&n<=ruleSheet.rowCount;n++){
    const values=RULE_HEADERS.map((_,i)=>text(ruleSheet.getCell(n,i+1)));
    if(!values[1]){
      if(boolean(values[2])||values[6]!==''||values[11]!=='')throw new Error(`Rule row ${n} needs a Rule ID before refresh.`);
      continue;
    }
    const conditions=[6,11].filter(i=>values[i]!=='').map(i=>({source:String(values[i]),metric:String(values[i+1]),op:String(values[i+2]),value:Number(values[i+3]),timing:String(values[i+4])}));
    rules.push({scenario:String(values[0]),id:String(values[1]),enabled:boolean(values[2]),priority:Number(values[3]),lane:String(values[4]),phase:String(values[5]),conditions,action:String(values[16]),amount:Number(values[17])});
  }
  const overrides=[],overrideSheet=wb.getWorksheet('Overrides');
  for(let n=2;overrideSheet&&n<=overrideSheet.rowCount;n++){
    const row=overrideSheet.getRow(n),scenario=String(text(row.getCell(1))),key=String(text(row.getCell(2)));
    if(!scenario&&!key)continue;
    LANES.forEach((lane,i)=>{const units=text(row.getCell(i+3)),step=text(row.getCell(i+6));if(units!=='')overrides.push({scenario,key,lane,units:Number(units),nextStep:step===''?null:Number(step)});});
  }
  return {scenarios:updated,rules,overrides,savedReviews};
}

function cacheLegacyResults(wb,snapshots){
  const cache=(cell,result)=>{if(cell.formula)cell.value={formula:cell.formula,result};};
  for(const [index,{config,result}] of snapshots.entries()){
    const sheet=wb.getWorksheet(config.id);
    let peak=Math.round((config.bankroll1+(config.players===2?config.bankroll2:0))*100),low=peak,dd=0,largest=0;
    for(const r of result.rows){
      const row=sheet.getRow(r.index+2),balance=r.after[0]+r.after[1];
      peak=Math.max(peak,balance);low=Math.min(low,balance);dd=Math.max(dd,peak-balance);largest=Math.max(largest,Math.round(Math.max(...Object.values(r.bets))*config.unit*100));
      const values={7:r.status==='Played'?'PLAY':r.status,8:r.reasons.A,9:r.reasons.B,10:r.reasons.D,
        11:r.autoBets.A,12:r.autoBets.B,13:r.autoBets.D,14:r.bets.A,15:r.bets.B,16:r.bets.D,17:r.drawAlloc[0],18:r.drawAlloc[1],
        19:r.before[0]/100,20:r.before[1]/100,21:r.staked/100,22:r.returned/100,23:r.net/100,24:r.running/100,25:r.after[0]/100,26:r.after[1]/100,
        27:peak/100,28:low/100,29:(peak-balance)/100,30:dd/100,31:largest/100};
      for(const [column,value] of Object.entries(values))cache(row.getCell(Number(column)),value);
    }
    const s=result.summary,row=wb.getWorksheet('Comparison').getRow(index+2);
    const values={3:!!config.active,4:s.net/100,5:s.ending[0]/100,6:s.ending[1]/100,7:s.bankrollROI,8:s.yield,9:s.staked/100,10:s.lowest/100,
      11:s.playerLowest[0]/100,12:s.playerLowest[1]/100,13:s.drawdown/100,14:s.largestBet/100,15:s.drawNet/100,16:s.crossBets?'Yes':'No',
      17:result.rows.length===0?'Awaiting history':result.rows.some(r=>r.status==='Setup incomplete')?'Setup incomplete':s.complete?'Complete':`Stopped round ${s.stopRound}`,18:config.players};
    for(const [column,value] of Object.entries(values))cache(row.getCell(Number(column)),value);
  }
}
function createWorkbook(options) {
  const legacy=createLegacyWorkbook(options);
  if(options.snapshots)cacheLegacyResults(legacy,options.snapshots);
  const compact=require('./compact').compactWorkbook(legacy);
  if(!options.snapshots)Object.defineProperty(compact,'_legacy',{value:legacy});
  return compact;
}

function cacheResults(wb,snapshots) {
  const legacy=wb._legacy;
  if(!legacy)throw new Error('Cache results immediately after creating the workbook.');
  cacheLegacyResults(legacy,snapshots);
  const model=require('./compact').compactWorkbook(legacy).model;
  wb.model={...model,worksheets:model.worksheets.map(sheet=>({...sheet,mergeCells:sheet.merges}))};
}

module.exports={createWorkbook,readInputs,text,cacheResults};
