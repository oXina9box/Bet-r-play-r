'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const ExcelJS=require('exceljs');
const {createWorkbook,readInputs,cacheResults}=require('../scripts/bet-tests/workbook');
const {defaultScenario,simulate}=require('../scripts/bet-tests/engine');
const {presets,ROW}=require('../scripts/bet-tests/schema');
const rounds=['A','B','D'].map((outcome,i)=>({key:`simple-${i}`,timestamp:1000+i,session:'original',outcome,lossAll:outcome==='D',raw:'quick',roundId:''}));

test('compact workbook retains configurations, rules, overrides and custom ladders for Sic Bo',async()=>{
  const base=presets(defaultScenario,'sicbo');
  const scenarios=base.map(c=>({...c,lanes:{...c.lanes,A:{...c.lanes.A,custom:'1,3,7,12'}}}));
  const rules=[{scenario:'S1',id:'wait',enabled:true,priority:1,lane:'A',phase:'entry',conditions:[{source:'observedA',metric:'wins',op:'>=',value:2,timing:'after'}],action:'enter',amount:1}];
  const overrides=[{scenario:'S1',key:'simple-0',lane:'A',units:0,nextStep:null}];
  const wb=createWorkbook({game:'sicbo',rounds,scenarios,rules,overrides,capacity:4,source:'/tmp/original.csv'});
  assert.deepEqual(wb.worksheets.map(s=>s.name),['Results','Configurations','Config Results']);
  assert.ok(wb.worksheets.every(s=>s.state==='visible'));
  assert.match(wb.getWorksheet('Results').autoFilter.to,/^J/);
  cacheResults(wb,scenarios.map(config=>({config,result:simulate(rounds,config,rules.filter(r=>r.scenario===config.id),overrides.filter(r=>r.scenario===config.id))})));
  assert.ok(wb.getWorksheet('Configurations').getCell('B1').isMerged);
  assert.ok(wb.getWorksheet('Config Results').getCell('B1').isMerged);
  const saved=new ExcelJS.Workbook();await saved.xlsx.load(await wb.xlsx.writeBuffer());
  assert.deepEqual(readInputs(saved,'sicbo'),{scenarios,rules,overrides,savedReviews:[]});
  const formulas=[];saved.eachSheet(s=>s.eachRow(row=>row.eachCell(cell=>{if(cell.formula)formulas.push(cell.formula);})));
  assert.ok(formulas.length>100);
  assert.ok(formulas.every(f=>!/#REF!|(?:Scenarios|Rules|Overrides|Ladders|Comparison|Rounds)!/.test(f)));
});

test('Sic Bo compact controls stay visible and advanced inputs remain grouped and editable',()=>{
  const wb=createWorkbook({game:'sicbo',rounds,capacity:3});
  const {mappedCell,getLayout}=require('../scripts/bet-tests/compact');
  const settings=wb.getWorksheet('Configurations'),basic=mappedCell(wb,'Scenarios',`B${ROW.bankroll1}`);
  assert.equal(basic.fill.fgColor.argb,'DCEEFF');assert.equal(settings.getRow(basic.row).hidden,false);
  const paused=mappedCell(wb,'Scenarios',`B${ROW['A.startPaused']}`);
  assert.equal(paused.fill.fgColor.argb,'DCEEFF');assert.equal(settings.getRow(paused.row).hidden,false);
  assert.equal(mappedCell(wb,'Rules','C2').dataValidation.type,'list');
  const layout=getLayout(wb);assert.ok(layout.maps.Overrides.row>layout.maps.Ladders.row);
  const dropdown=wb.getWorksheet('Config Results').getCell(layout.detail.selectorRow,2);
  for(const key of ['active','lockStore','drawTrigger','A.startPaused','A.winPause','D.winPause']){
    const cell=mappedCell(wb,'Scenarios',`B${ROW[key]}`);assert.equal(settings.getRow(cell.row).hidden,false,key);
  }
  const metricRow=settings.getColumn(1).values.findIndex(v=>v==='Net ($)');
  assert.match(settings.getCell(metricRow,2).formula,/Config Results/);
  assert.equal(readInputs(wb,'sicbo').scenarios.length,10);assert.equal(dropdown.dataValidation.type,'list');
  basic.value=245;paused.value=true;
  const config=readInputs(wb,'sicbo').scenarios[0];assert.equal(config.bankroll1,245);assert.equal(config.lanes.A.startPaused,true);
});


