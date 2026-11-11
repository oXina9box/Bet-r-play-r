'use strict';

const ExcelJS = require('exceljs');
const { MARKER, buildKickoffFormulas, VISIBLE } = require('./kickoff-formulas');

const NAVY='152C49', INPUT='DCEEFF', INK='233B53';
const GLOBALS=['Players (1 or 2)','Color net payout multiplier','Draw net payout multiplier (blank = 0)','Starting side (1 Red, 2 Blue; blank = 1)','Color mode (0 fixed/dual, 1 switch on loss, 2 switch on loss >=2, 3 cover at 2+, 4 cover at 4+; blank = 0)','Draw trigger consecutive losses (0 every round, 1+ after N losses; blank = 0)','Draw funded by (1 P1, 2 P2, 3 split; blank = 1)','Profit target ($; 0 or blank = off)','Loss limit ($; 0 or blank = off)'];
const PLAYER=['Starting bankroll ($)','Bet 1 — Starting wager ($)',...Array.from({length:9},(_,i)=>`Bet ${i+2} — After win ${i+1}${i===8?'+':''} ($)`),'After Bet 10 win (0 hold Bet 10, 1 reset to Bet 1; blank = 0)'];
const NUMFMT='$#,##0.00;[Red]-$#,##0.00';
const clean = value => value === undefined ? null : value;
function header(ws, values) { ws.addRow(values); ws.getRow(1).font={bold:true,color:{argb:'FFFFFF'}}; ws.getRow(1).fill={type:'pattern',pattern:'solid',fgColor:{argb:NAVY}}; ws.views=[{state:'frozen',ySplit:1}]; }
function editable(cell, choices) { cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:INPUT}}; cell.protection={locked:false}; cell.numFmt='0.00'; if(choices) cell.dataValidation={type:'list',allowBlank:true,formulae:[`"${choices.join(',')}"`],showErrorMessage:true,error:'Choose listed numeric code.'}; return cell; }
function putFormula(cell, formula, result) { cell.value={formula,...(result===undefined||result===null?{}:{result})}; }
function createKickoffWorkbook(options={}) {
  const rounds=options.rounds||[], inputs=options.inputs||{globals:[],p1:[],p2:[],draw:[]}, simulation=options.results;
  if (!Array.isArray(rounds)) throw new Error('Invalid history rounds');
  if (options.capacity!==undefined&&(!Number.isInteger(options.capacity)||options.capacity<1||options.capacity>20000)) throw new Error('Capacity must be 1–20000 rounds');
  if (rounds.length>20000) throw new Error('Capacity must be 1–20000 rounds');
  const wb=new ExcelJS.Workbook(); wb.creator='Bet-R Play-R'; wb.calcProperties={fullCalcOnLoad:true,forceFullCalc:true,calcMode:'auto'};
  const results=wb.addWorksheet('Results'); header(results,['Round key','Timestamp','Session','Outcome','Loss all','Raw details','Round ID','Site','Source index']);
  rounds.forEach(r=>results.addRow([r.key,r.timestamp,r.session,r.outcome,r.lossAll,r.raw,r.roundId,r.site,r.sourceIndex]));
  results.getColumn(2).numFmt='General';
  results.autoFilter={from:'A1',to:`I${Math.max(1,results.rowCount)}`};
  const opts=wb.addWorksheet('Test Options');
  opts.getCell('A1').value='Kickoff line-by-line test options';
  opts.mergeCells('A1:D1'); opts.getCell('A1').font={bold:true,size:16,color:{argb:'FFFFFF'}}; opts.getCell('A1').fill={type:'pattern',pattern:'solid',fgColor:{argb:NAVY}};
  opts.getCell('A2').value='Blue cells start blank. Enter Players, Color payout, P1 bankroll and Bet 1; blank later bets repeat the prior line.'; opts.mergeCells('A2:D2');
  opts.getCell('A4').value='Global inputs'; opts.getCell('A4').font={bold:true,color:{argb:'FFFFFF'}}; opts.getCell('A4').fill={type:'pattern',pattern:'solid',fgColor:{argb:NAVY}};
  GLOBALS.forEach((label,i)=>{const r=5+i;opts.getCell(r,1).value=label;const c=opts.getCell(r,2);c.value=clean(inputs.globals?.[i]);editable(c,({0:[1,2],3:[1,2],4:[0,1,2,3,4],6:[1,2,3]})[i]);});
  for(const [col,label] of ['Player & Draw wagers','P1 (Red / Leader)','P2 (Blue / Cover)','Draw'].entries()){const c=opts.getCell(15,col+1);c.value=label;c.font={bold:true,color:{argb:'FFFFFF'}};c.fill={type:'pattern',pattern:'solid',fgColor:{argb:NAVY}};}
  for(let i=0;i<PLAYER.length;i++){
    const row=16+i;opts.getCell(row,1).value=PLAYER[i];
    for(const [col,values] of [[2,inputs.p1],[3,inputs.p2]]){const c=editable(opts.getCell(row,col),i===11?[0,1]:null);c.value=clean(values?.[i]);if(i<11)c.numFmt=NUMFMT;}
    if(i>0){const c=editable(opts.getCell(row,4),i===11?[0,1]:null);c.value=clean(inputs.draw?.[i-1]);if(i<11)c.numFmt=NUMFMT;}
  }
  opts.getCell('A29').value='Setup status'; opts.getCell('B29').value=null;
  opts.getCell('Z1').value=MARKER; opts.getCell('Z2').value=options.source||'Awaiting history'; opts.getColumn(26).hidden=true;
  opts.getColumn(1).width=70;opts.getColumn(2).width=25;opts.getColumn(3).width=25;opts.getColumn(4).width=25;opts.views=[{state:'frozen',xSplit:1,ySplit:4}];
  for(const row of [9,10,11,27]){opts.getCell(row,1).alignment={wrapText:true,vertical:'middle'};opts.getRow(row).height=row===9?45:30;}
  const detail=wb.addWorksheet('Test Results');
  detail.getCell('A1').value='Kickoff test results';detail.getCell('A1').font={bold:true,size:18,color:{argb:'FFFFFF'}};detail.getCell('A1').fill={type:'pattern',pattern:'solid',fgColor:{argb:NAVY}};detail.mergeCells('A1:H1');
  detail.getCell('A3').value='Status';
  const last=Math.max(7,6+rounds.length);
  putFormula(detail.getCell('B3'),`IF('Test Options'!$B$29<>"Ready",'Test Options'!$B$29,IFERROR(IF(OR(LEFT(LOOKUP(2,1/(V7:V${last}<>""),V7:V${last}),8)="Stopped:",LEFT(LOOKUP(2,1/(V7:V${last}<>""),V7:V${last}),16)="Arithmetic limit:"),LOOKUP(2,1/(V7:V${last}<>""),V7:V${last}),"Complete"),"Complete"))`,simulation?.status);
  detail.getCell('D3').value='Net';detail.getCell('F3').value='P1 ending';detail.getCell('H3').value='P2 ending';
  putFormula(detail.getCell('E3'),`IF('Test Options'!$B$29="Ready",IFERROR(LOOKUP(2,1/(R7:R${last}<>""),R7:R${last}),0),"")`,simulation?.complete?simulation.totals?.net:null);
  putFormula(detail.getCell('G3'),`IF('Test Options'!$B$29="Ready",IFERROR(LOOKUP(2,1/(S7:S${last}<>""),S7:S${last}),'Test Options'!$B$16),"")`,simulation?.complete?simulation.totals?.p1Bankroll:null);
  putFormula(detail.getCell('I3'),`IF('Test Options'!$B$29="Ready",IF('Test Options'!$B$5=2,IFERROR(LOOKUP(2,1/(T7:T${last}<>""),T7:T${last}),'Test Options'!$C$16),""),"")`,simulation?.complete?simulation.totals?.p2Bankroll:null);
  detail.getColumn(2).numFmt='yyyy-mm-dd hh:mm:ss'; for(let c=9;c<=20;c++)detail.getColumn(c).numFmt=NUMFMT;
  for(const cell of ['E3','G3','I3'])detail.getCell(cell).numFmt=NUMFMT;
  detail.getRow(6).values=[...VISIBLE];detail.getRow(6).font={bold:true,color:{argb:'FFFFFF'}};detail.getRow(6).fill={type:'pattern',pattern:'solid',fgColor:{argb:NAVY}};
  const state=buildKickoffFormulas(detail,{rounds,optionsSheet:opts,resultsSheet:results,results:simulation});
  detail.stateColumns=state;
  for(let c=1;c<=VISIBLE.length;c++)detail.getColumn(c).width=c===2?21:c===23?45:16;
  for(const [address,label] of [['A3','Status'],['D3','Net'],['F3','P1 ending'],['H3','P2 ending']]){const cell=detail.getCell(address);cell.font={bold:true,color:{argb:'FFFFFF'}};cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:NAVY}};}
  detail.getCell('J3').value='P1 stake';detail.getCell('K3').value='P1 return';detail.getCell('L3').value='P2 stake';detail.getCell('M3').value='P2 return';detail.getCell('N3').value='Draw stake';detail.getCell('O3').value='Draw return';
  for(const cell of ['J3','K3','L3','M3','N3','O3']){detail.getCell(cell).font={bold:true,color:{argb:'FFFFFF'}};detail.getCell(cell).fill={type:'pattern',pattern:'solid',fgColor:{argb:NAVY}};}
  for(const [address,column,key] of [['J4','I','p1Stake'],['K4','L','p1Return'],['L4','J','p2Stake'],['M4','M','p2Return'],['N4','K','drawStake'],['O4','N','drawReturn']])putFormula(detail.getCell(address),`IF('Test Options'!$B$29="Ready",SUM(${column}7:${column}${last}),"")`,simulation?.complete?simulation.totals?.[key]:null);
  for(const column of ['J','K','L','M','N','O'])detail.getColumn(column).width=18;
  rounds.forEach((round,i)=>{const cell=detail.getCell(7+i,3);cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:round.outcome==='A'?'FCE4D6':round.outcome==='B'?'DDEBF7':'E2F0D9'}};cell.font={name:'Arial',bold:true,color:{argb:INK}};});
  results.sheetProtection={sheet:true,selectLockedCells:true,selectUnlockedCells:true};
  detail.sheetProtection={sheet:true,selectLockedCells:true,selectUnlockedCells:true,formatRows:true}; opts.sheetProtection={sheet:true,selectLockedCells:true,selectUnlockedCells:true};
  return wb;
}
function readKickoffInputs(wb) {
  const ws=wb.getWorksheet('Test Options'); if(!ws)throw new Error('Missing Test Options sheet');
  const value=cell=>{const v=cell.value;return v===undefined?null:v;};
  return {globals:Array.from({length:9},(_,i)=>value(ws.getCell(5+i,2))),p1:Array.from({length:12},(_,i)=>value(ws.getCell(16+i,2))),p2:Array.from({length:12},(_,i)=>value(ws.getCell(16+i,3))),draw:Array.from({length:11},(_,i)=>value(ws.getCell(17+i,4)))};
}
module.exports={createKickoffWorkbook,readKickoffInputs,MARKER};
