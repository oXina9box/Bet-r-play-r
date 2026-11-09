#!/usr/bin/env node
'use strict';
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const assert=require('node:assert/strict');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const {createWorkbook}=require('./workbook');
const {defaultScenario,simulate}=require('./engine');
const {presets,ROW}=require('./schema');
const ExcelJS=require('exceljs');
const {GAME_META}=require('./history');
const {readInputs,text}=require('./workbook');
const execute=promisify(execFile);

function fixtures(game){
  const outcomes=['A','A','A','D','B','B','A','D','A','B','D','A','B','A','B','B','B','A'];
  const rounds=outcomes.map((outcome,i)=>({key:`r${i}`,timestamp:i+1000,session:i<6?'session1':'session2',outcome,lossAll:['kickoff','sicbo'].includes(game)&&outcome==='D',raw:'quick',roundId:''}));
  const configs=presets(defaultScenario,game).map(c=>({...c,confirmed:true,oddsA:2.3,oddsB:2.3,oddsD:5.8}));
  const base=configs[0];
  configs.push({...base,id:'Split',players:2,sideMode:'dual',unit:.01,bankroll1:2,bankroll2:2,drawOwner:'split',drawMode:'fixed',lanes:{...base.lanes,D:{...base.lanes.D,enabled:true,initial:3}}});
  configs.push({...base,id:'Entry',players:2,sideMode:'fixed',lanes:{...base.lanes,B:{...base.lanes.B,startPaused:true}}});
  configs.push({...configs[2],id:'Saved',drawMode:'progression',lanes:{...configs[2].lanes,D:{...base.lanes.D,enabled:true,ladder:'linear',winAction:'down',winValue:2,winPause:true,lossAction:'up',lossValue:1}}});
  configs.push({...base,id:'Override',sideMode:'swap1'});
  configs.push({...base,id:'CashStop',bankroll1:1});
  configs.push({...base,id:'Target',profitTarget:1});
  configs.push({...configs[4],id:'Commission',commissionD:10,players:2,sideMode:'dual'});
  configs.push({...base,id:'Custom',lanes:{...base.lanes,A:{...base.lanes.A,ladder:'custom',custom:'1,2,3,5,8',winAction:'up',winValue:1,lossAction:'down',lossValue:2,cap:5,capAction:'repeat'}}});
  const condition=(source,metric,value,timing='after')=>({source,metric,op:'>=',value,timing});
  const rules=[{scenario:'Entry',id:'blue-entry',enabled:true,priority:1,lane:'B',phase:'entry',conditions:[condition('betA','losses',1),condition('betA','stake',1)],action:'enter',amount:1},
    {scenario:'Saved',id:'resume',enabled:true,priority:1,lane:'D',phase:'entry',conditions:[condition('observedD','losses',2)],action:'enter',amount:1},
    {scenario:'Custom',id:'third-win',enabled:true,priority:1,lane:'A',phase:'stake',conditions:[condition('observedA','wins',3,'entering')],action:'set',amount:3}];
  const overrides=[{scenario:'Override',key:'r0',lane:'A',units:2,nextStep:1},{scenario:'Override',key:'r1',lane:'A',units:0,nextStep:null}];
  return {rounds,configs,rules,overrides};
}

async function verify({directory,keep=false}={}){
  const dir=directory||await fs.mkdtemp(path.join(os.tmpdir(),'bet-verify-'));
  await fs.mkdir(dir,{recursive:true});
  let total=0;
  try{
    for(const game of ['kickoff','sicbo','teenpatti','baccarat']){
      const {rounds,configs,rules,overrides}=fixtures(game);
      const workbook=createWorkbook({game,rounds,scenarios:configs,rules,overrides,capacity:rounds.length+1,ruleSlots:2});
      const file=path.join(dir,`${game}.xlsx`),output=path.join(dir,`${game}.json`);
      await workbook.xlsx.writeFile(file);
      await execute('python3',[path.join(__dirname,'verify-calc.py'),file,'--output',output],{timeout:180000,maxBuffer:1024*1024});
      const actual=JSON.parse(await fs.readFile(output,'utf8'));
      assert.deepEqual(actual.Comparison.errors,[],`${game} comparison errors`);
      for(const config of configs){
        const expected=simulate(rounds,config,rules.filter(r=>r.scenario===config.id),overrides.filter(o=>o.scenario===config.id));
        assert.deepEqual(actual[config.id].errors,[],`${game}/${config.id} Calc errors`);
        for(const [i,r] of expected.rows.entries()){
          const row=actual[config.id].values[i+2];
          assert.deepEqual(row.slice(13,16),['A','B','D'].map(k=>r.bets[k]),`${game}/${config.id} bets round ${i+1}`);
          assert.deepEqual(row.slice(16,18),r.drawAlloc,`${game}/${config.id} draw allocation round ${i+1}`);
          assert.equal(Math.round(row[20]*100),r.staked,`${game}/${config.id} stake round ${i+1}`);
          assert.equal(Math.round(row[21]*100),r.returned,`${game}/${config.id} return round ${i+1}`);
          assert.equal(Math.round(row[22]*100),r.net,`${game}/${config.id} net round ${i+1}`);
          assert.deepEqual(row.slice(24,26).map(v=>Math.round(v*100)),r.after,`${game}/${config.id} cash round ${i+1}`);
          total++;
        }
        const row=actual.Comparison.values[configs.indexOf(config)+1];
        assert.equal(Math.round(row[2]*100),expected.summary.net);
        assert.equal(Math.round(row[7]*100),expected.summary.staked);
        assert.equal(Math.round(row[9]*100),expected.summary.drawdown);
      }
      if(game==='kickoff'){
        await execute('python3',[path.join(__dirname,'verify-calc.py'),file,'--output',output,'--set',`Scenarios!B${ROW.unit}=2`],{timeout:180000});
        const edited=JSON.parse(await fs.readFile(output,'utf8'));
        assert.equal(edited.S1.values[2][22],2.6,'Changing unit inside Calc recalculates without JS regeneration');
      }
      console.log(`${game}: Calc / independent simulator match`);
    }
    console.log(`CALC_VERIFIED ${total} rows; four games; settings edit recalculates`);
    return total;
  }finally{if(!directory&&!keep)await fs.rm(dir,{recursive:true,force:true});}
}
async function verifyGenerated(directory=path.resolve('bet tests')){
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),'bet-generated-'));
  let checked=0;
  try{
    for(const game of Object.keys(GAME_META)){
      const name=GAME_META[game].file.replace('_Results.xlsx','_Tests');
      const wb=new ExcelJS.Workbook();await wb.xlsx.readFile(path.join(directory,`${name}.xlsx`));
      const inputs=readInputs(wb,game),history=wb.getWorksheet('Rounds'),rounds=[];
      for(let i=2;i<=history.rowCount;i++){
        const values=Array.from({length:7},(_,n)=>text(history.getCell(i,n+1)));
        if(values[0])rounds.push({key:String(values[0]),timestamp:Number(values[1]),session:String(values[2]),outcome:String(values[3]),lossAll:values[4]===true||values[4]===1,raw:String(values[5]),roundId:String(values[6])});
      }
      const output=path.join(temp,`${game}.json`);
      await execute('python3',[path.join(__dirname,'verify-calc.py'),path.join(directory,`${name}.ods`),'--output',output],{timeout:300000,maxBuffer:1024*1024});
      const actual=JSON.parse(await fs.readFile(output,'utf8'));
      for(const config of inputs.scenarios){
        const expected=simulate(rounds,config,inputs.rules.filter(r=>r.scenario===config.id),inputs.overrides.filter(o=>o.scenario===config.id));
        assert.deepEqual(actual[config.id].errors,[],`${game}/${config.id} formula errors`);
        for(const r of expected.rows){
          const row=actual[config.id].values[r.index+1];
          assert.deepEqual(row.slice(13,16),['A','B','D'].map(k=>r.bets[k]),`${game}/${config.id} bets at ${r.index}`);
          assert.equal(Math.round(row[22]*100),r.net,`${game}/${config.id} net at ${r.index}`);
          assert.deepEqual(row.slice(24,26).map(n=>Math.round(n*100)),r.after,`${game}/${config.id} cash at ${r.index}`);
          checked++;
        }
      }
      console.log(`${name}: generated ODS reconciled`);
    }
    console.log(`GENERATED_CALC_VERIFIED ${checked} real-history rows`);
    return checked;
  }finally{await fs.rm(temp,{recursive:true,force:true});}
}
if(require.main===module){
  const task=process.argv[2]==='--generated'?verifyGenerated(process.argv[3]):verify({directory:process.argv[2]});
  task.catch(error=>{console.error(error);process.exitCode=1;});
}
module.exports={verify,verifyGenerated,fixtures};
