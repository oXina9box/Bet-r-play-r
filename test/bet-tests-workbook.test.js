'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createWorkbook, readInputs } = require('../scripts/bet-tests/workbook');
const { generate } = require('../scripts/bet-tests/cli');
const { ROW } = require('../scripts/bet-tests/schema');
const ExcelJS=require('exceljs');
const {defaultScenario,simulate}=require('../scripts/bet-tests/engine');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const execute=promisify(execFile);

const rounds = ['A', 'A', 'A', 'D', 'B', 'B'].map((outcome, i) => ({
  key: `r${i}`, timestamp: 1000+i, session: 'one', outcome, lossAll: outcome==='D', raw: 'quick', roundId: '',
}));

test('workbook supplies editable controls, rule table, overrides, comparisons and five formula ledgers', () => {
  const wb = createWorkbook({ game: 'kickoff', rounds, capacity: 12 });
  for (const name of ['Guide','Rounds','Scenarios','Rules','Overrides','Comparison','Ladders', 'S1','S2','S3','S4','S5']) {
    assert.ok(wb.getWorksheet(name), name);
  }
  assert.equal(wb.getWorksheet('Scenarios').getCell(`B${ROW.bankroll1}`).value,100);
  assert.equal(wb.getWorksheet('Scenarios').getCell(`B${ROW.oddsA}`).value,2.3);
  assert.ok(wb.getWorksheet('S1').getCell('N3').formula);
  assert.equal(wb.getWorksheet('Rounds').getCell('A2').value,'r0');
});

test('scenario edits and zero overrides survive input extraction', () => {
  const wb = createWorkbook({ game: 'kickoff', rounds, capacity: 12 });
  wb.getWorksheet('Scenarios').getCell(`B${ROW.bankroll1}`).value=234;
  wb.getWorksheet('Overrides').addRow(['S1','r0',0,null,null]);
  const inputs=readInputs(wb,'kickoff');
  assert.equal(inputs.scenarios[0].bankroll1,234);
  assert.deepEqual(inputs.overrides[0],{scenario:'S1',key:'r0',lane:'A',units:0,nextStep:null});
});

test('missing history produces setup workbook without fabricated rounds', async () => {
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'bet-workbook-'));
  try {
    const result=await generate({game:'baccarat',sourceDir:dir,outputDir:dir,convert:false,capacity:12});
    assert.equal(result.rounds,0);
    assert.match(result.status,/Awaiting history/i);
    assert.ok((await fs.stat(result.xlsx)).size>0);
  } finally { await fs.rm(dir,{recursive:true,force:true}); }
});

test('refresh refuses open-workbook locks', async () => {
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'bet-locked-'));
  try {
    await fs.writeFile(path.join(dir,'.~lock.The_Kickoff_Tests.ods#'),'locked');
    await assert.rejects(generate({game:'kickoff',sourceDir:dir,outputDir:dir,convert:false,capacity:12}),/open|lock/i);
  } finally { await fs.rm(dir,{recursive:true,force:true}); }
});

test('refresh preserves settings, named scenarios, overrides and source; missing source preserves file',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'bet-refresh-'));
  const source=path.join(dir,'history.csv');
  try{
    await fs.writeFile(source,'Timestamp,Session ID,Result\n1000,s,RED\n2000,s,BLUE\n');
    const first=await generate({game:'kickoff',sourceFile:source,outputDir:dir,convert:false,capacity:5});
    const wb=new ExcelJS.Workbook();await wb.xlsx.readFile(first.xlsx);
    wb.getWorksheet('Scenarios').getCell(`B${ROW.bankroll1}`).value=321;
    const key=wb.getWorksheet('Rounds').getCell('A2').value;
    wb.getWorksheet('Overrides').getCell('A2').value='S1';
    wb.getWorksheet('Overrides').getCell('B2').value=key;
    wb.getWorksheet('Overrides').getCell('C2').value=0;
    await wb.xlsx.writeFile(first.xlsx);
    await fs.appendFile(source,'3000,s,DRAW\n');
    const second=await generate({game:'kickoff',outputDir:dir,convert:false,capacity:6});
    assert.equal(second.rounds,3);
    const refreshed=new ExcelJS.Workbook();await refreshed.xlsx.readFile(second.xlsx);
    const inputs=readInputs(refreshed,'kickoff');
    assert.equal(inputs.scenarios[0].bankroll1,321);
    assert.equal(inputs.overrides[0].units,0);
    const before=await fs.readFile(second.xlsx);
    await fs.unlink(source);
    await assert.rejects(generate({game:'kickoff',outputDir:dir,convert:false}),/preserved|missing/i);
    assert.deepEqual(await fs.readFile(second.xlsx),before);
  }finally{await fs.rm(dir,{recursive:true,force:true});}
});

test('invalid scenario references are not discarded on refresh',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'bet-orphan-'));
  try{
    const first=await generate({game:'kickoff',sourceDir:dir,outputDir:dir,convert:false,capacity:2});
    const wb=new ExcelJS.Workbook();await wb.xlsx.readFile(first.xlsx);
    wb.getWorksheet('Rules').getCell('A2').value='Unknown';
    wb.getWorksheet('Rules').getCell('B2').value='draft';
    await wb.xlsx.writeFile(first.xlsx);
    await assert.rejects(generate({game:'kickoff',sourceDir:dir,outputDir:dir,convert:false}),/Unknown scenario/);
  }finally{await fs.rm(dir,{recursive:true,force:true});}
});

test('invalid capacity/rule limits reject and generated formulas fit Excel limits',()=>{
  assert.throws(()=>createWorkbook({game:'kickoff',capacity:20001}),/Capacity/);
  assert.throws(()=>createWorkbook({game:'kickoff',capacity:1,ruleSlots:0}),/Rule slots/);
  const wb=createWorkbook({game:'kickoff',rounds,capacity:6});
  wb.eachSheet(sheet=>sheet.eachRow(row=>row.eachCell(cell=>{if(cell.formula)assert.ok(cell.formula.length<=8192,`${sheet.name}!${cell.address}`);}))); 
});

test('actual 128-roll Kickoff history preserves agreed no-draw benchmark',()=>{
  const history=require('./fixtures/kickoff-history128.json');
  const base=defaultScenario('kickoff');
  const config={...base,sideMode:'swap2',lanes:{...base.lanes,
    A:{...base.lanes.A,ladder:'double',winAction:'up',winValue:1,lossAction:'reset',cap:16,capAction:'reset'},
    B:{...base.lanes.B,ladder:'double',winAction:'up',winValue:1,lossAction:'reset',cap:16,capAction:'reset'}}};
  const result=simulate(history,config);
  assert.equal(result.summary.net,7650);
  assert.equal(result.summary.staked,32600);
  assert.equal(result.summary.complete,true);
});

test('Calc formulas independently reconcile every bet, payout and balance, including live settings edits', {skip:process.env.BET_TEST_CALC!=='1'},async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'bet-calc-test-'));
  try{
    const {presets}=require('../scripts/bet-tests/schema');
    const configs=presets(defaultScenario,'kickoff');
    configs[1]={...configs[1],players:2,sideMode:'dual',drawMode:'fixed',drawOwner:'split',unit:0.01,bankroll1:1,bankroll2:1,
      lanes:{...configs[1].lanes,D:{...configs[1].lanes.D,enabled:true,initial:3}}};
    const wb=createWorkbook({game:'kickoff',rounds,scenarios:configs,capacity:8,ruleSlots:2});
    const file=path.join(dir,'test.xlsx'),output=path.join(dir,'values.json');
    await wb.xlsx.writeFile(file);
    await execute('python3',['scripts/bet-tests/verify-calc.py',file,'--output',output],{timeout:120000});
    const actual=JSON.parse(await fs.readFile(output,'utf8'));
    for(const config of configs){
      assert.deepEqual(actual[config.id].errors,[]);
      const expected=simulate(rounds,config).rows;
      expected.forEach((r,i)=>{
        const row=actual[config.id].values[i+2];
        assert.deepEqual(row.slice(13,16),['A','B','D'].map(k=>r.bets[k]),`${config.id} bets ${i+1}`);
        assert.equal(Math.round(row[22]*100),r.net,`${config.id} net ${i+1}`);
        assert.deepEqual(row.slice(24,26).map(n=>Math.round(n*100)),r.after,`${config.id} cash ${i+1}`);
      });
    }
    await execute('python3',['scripts/bet-tests/verify-calc.py',file,'--output',output,'--set',`Scenarios!B${ROW.unit}=2`],{timeout:120000});
    const edited=JSON.parse(await fs.readFile(output,'utf8'));
    assert.equal(edited.S1.values[2][22],2.6);
  }finally{await fs.rm(dir,{recursive:true,force:true});}
});
