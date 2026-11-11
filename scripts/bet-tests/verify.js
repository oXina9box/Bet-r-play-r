#!/usr/bin/env node
'use strict';
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const assert=require('node:assert/strict');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const {createWorkbook,readInputs}=require('./workbook');
const {defaultScenario,simulate}=require('./engine');
const {presets,ROW}=require('./schema');
const ExcelJS=require('exceljs');
const {GAME_META}=require('./history');
const {text}=require('./workbook');
const {mappedCell,expandWorkbook}=require('./compact');
const {simulateKickoff}=require('./kickoff-engine');
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
const {readKickoffInputs}=require('./kickoff');
const kickoffFixture=()=>{
  const rounds='AAAABBAABDBBAADBAAAAABDBAAD'.split('').map((outcome,i)=>({key:`k${i+1}`,timestamp:i+1,session:'whole-history',outcome,lossAll:outcome==='D',raw:'',roundId:''}));
  const inputs={globals:[1,1.3,...Array(7).fill(null)],p1:[1000,1,...Array(10).fill(null)],p2:Array(12).fill(null),draw:Array(11).fill(null)};
  return {rounds,inputs};
};
function compareKickoff(data,expected,label){
  assert.deepEqual(data['Test Options'].errors,[],`${label} option formula errors`);
  assert.deepEqual(data['Test Results'].errors,[],`${label} result formula errors`);
  assert.equal(data['Test Options'].values[28][1],expected.complete?'Ready':expected.status,`${label} setup status`);
  const rows=data['Test Results'].values;
  for(const r of expected.rows){
    const row=rows[r.index+5],value=col=>row[col]===''?null:row[col];
    for(const [col,key] of [[3,'role'],[4,'factor'],[5,'side'],[6,'step'],[21,'status']]){
      assert.equal(value(col),r[key],`${label} ${key} round ${r.index}`);
    }
    for(const [col,key] of [[8,'p1Stake'],[9,'p2Stake'],[10,'drawStake'],[11,'p1Return'],[12,'p2Return'],[13,'drawReturn'],[14,'p1Net'],[15,'p2Net'],[16,'net'],[17,'cumulative'],[18,'p1Bankroll'],[19,'p2Bankroll']]){
      const actual=value(col),want=r[key];
      assert.equal(actual===null?null:(Math.round(actual*100)||0),want===null?null:(Math.round(want*100)||0),`${label} ${key} round ${r.index}`);
    }
  }
}
async function verifyKickoffCalc(dir){
  const {rounds,inputs}=kickoffFixture();
  const workbook=createWorkbook({game:'kickoff',rounds,source:'fixture'});
  const file=path.join(dir,'kickoff-numeric.xlsx'),output=path.join(dir,'kickoff-numeric.json');
  await workbook.xlsx.writeFile(file);
  const calc=async(...sets)=>{
    await execute('/usr/bin/python3',[path.join(__dirname,'verify-calc.py'),file,'--output',output,...sets.flatMap(item=>['--set',item])],{timeout:180000,maxBuffer:1024*1024});
    return JSON.parse(await fs.readFile(output,'utf8'));
  };
  const core=['Test Options!B5=1','Test Options!B6=1.3','Test Options!B16=1000','Test Options!B17=1'];
  let actual=await calc();
  assert.deepEqual(actual.sheetNames,['Results','Test Options','Test Results']);
  compareKickoff(actual,simulateKickoff(rounds,{}),'Kickoff blank');
  actual=await calc(...core);
  compareKickoff(actual,simulateKickoff(rounds,inputs),'Kickoff core');
  const edited={...inputs,p1:[...inputs.p1]};
  edited.p1[2]=2;edited.p1[3]=4;
  actual=await calc(...core,'Test Options!B18=2','Test Options!B19=4');
  compareKickoff(actual,simulateKickoff(rounds,edited),'Kickoff live edits');
  assert.deepEqual(actual['Test Results'].values.slice(6,11).map(row=>row[8]),[1,2,4,4,4],'Kickoff win lines inherit');
  assert.equal(actual['Test Results'].values[11][8],1,'Kickoff loss resets wager');
  const scenarios=[];
  for(let mode=0;mode<=4;mode++)for(const trigger of [0,2])for(const owner of [1,2,3]){
    const scenario={globals:[2,1.3,5,1,mode,trigger,owner,null,null],
      p1:[1000,1,2,4,8,...Array(6).fill(null),1],
      p2:[1000,1,2,4,8,...Array(6).fill(null),1],
      draw:[.03,.05,.07,...Array(7).fill(null),1]};
    scenarios.push({scenario,label:`mode ${mode}, trigger ${trigger}, owner ${owner}`});
  }
  scenarios.push({scenario:{...edited,p1:[1000,1,0,...Array(9).fill(null)]},label:'explicit zero'});
  scenarios.push({scenario:{...edited,globals:[1,1.3,null,null,null,null,null,1,null]},label:'profit target'});
  scenarios.push({scenario:{...edited,globals:[1,1.3,null,null,null,null,null,null,1]},label:'loss limit'});
  scenarios.push({scenario:{...edited,p1:[.5,1,...Array(10).fill(null)]},label:'insufficient bankroll'});
  for(const {scenario,label} of scenarios){
    const wb=createWorkbook({game:'kickoff',rounds,inputs:scenario,results:simulateKickoff(rounds,scenario),source:'fixture'});
    await wb.xlsx.writeFile(file);
    actual=await calc();
    compareKickoff(actual,simulateKickoff(rounds,scenario),`Kickoff ${label}`);
  }
  return rounds.length*(3+scenarios.length);
}
async function verify({directory,keep=false}={}){
  const dir=directory||await fs.mkdtemp(path.join(os.tmpdir(),'bet-verify-'));
  await fs.mkdir(dir,{recursive:true});let total=0;
  try{
    for(const game of ['kickoff','sicbo','teenpatti','baccarat']){
      if(game==='kickoff'){
        total+=await verifyKickoffCalc(dir);console.log('kickoff: numeric Calc / independent simulator match');continue;
      }
      const {rounds,configs,rules,overrides}=fixtures(game);
      const workbook=createWorkbook({game,rounds,scenarios:configs,rules,overrides,capacity:rounds.length+1,ruleSlots:2});
      const file=path.join(dir,`${game}.xlsx`),output=path.join(dir,`${game}.json`);await workbook.xlsx.writeFile(file);
      await execute('/usr/bin/python3',[path.join(__dirname,'verify-calc.py'),file,'--output',output],{timeout:180000,maxBuffer:1024*1024});
      const actual=JSON.parse(await fs.readFile(output,'utf8'));
      assert.deepEqual(actual.sheetNames,['Results','Configurations','Config Results']);
      assert.deepEqual(actual['Config Results'].errors,[],`${game} visible results errors`);
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
          assert.deepEqual(row.slice(24,26).map(v=>Math.round(v*100)),r.after,`${game}/${config.id} cash round ${i+1}`);total++;
        }
        const row=actual.Comparison.values[configs.indexOf(config)+1];
        assert.equal(Math.round(row[3]*100),expected.summary.net);assert.equal(Math.round(row[8]*100),expected.summary.staked);assert.equal(Math.round(row[12]*100),expected.summary.drawdown);
      }
      console.log(`${game}: Calc / independent simulator match`);
    }
    console.log(`CALC_VERIFIED ${total} rows; four games; numeric Kickoff settings edit recalculates`);return total;
  }finally{if(!directory&&!keep)await fs.rm(dir,{recursive:true,force:true});}
}
async function verifyGenerated(directory=path.resolve('bet tests')){
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),'bet-generated-'));let checked=0;
  try{
    for(const game of Object.keys(GAME_META)){
      const name=GAME_META[game].file.replace('_Results.xlsx','_Tests'),wb=new ExcelJS.Workbook();
      await wb.xlsx.readFile(path.join(directory,`${name}.xlsx`));
      const target=path.join(directory,`${name}.xlsx`),output=path.join(temp,`${game}.json`);
      if(game==='kickoff'){
        const resultsSheet=wb.getWorksheet('Results'),rounds=[];
        for(let i=2;i<=resultsSheet.rowCount;i++){
          const v=Array.from({length:9},(_,n)=>text(resultsSheet.getCell(i,n+1)));
          if(v[0])rounds.push({key:String(v[0]),timestamp:Number(v[1]),session:String(v[2]),outcome:String(v[3]),lossAll:v[4]===true||v[4]===1,raw:String(v[5]),roundId:String(v[6]),site:String(v[7]),sourceIndex:Number(v[8])});
        }
        const core=['Test Options!B5=1','Test Options!B6=1.3','Test Options!B16=100','Test Options!B17=1',
          'Test Options!B18=2','Test Options!B19=4'];
        await execute('/usr/bin/python3',[path.join(__dirname,'verify-calc.py'),target,'--output',output],{timeout:300000,maxBuffer:1024*1024});
        let actual=JSON.parse(await fs.readFile(output,'utf8'));
        const empty=readKickoffInputs(wb);
        assert.deepEqual(empty.globals,Array(9).fill(null),`${game} fresh global inputs blank`);
        assert.deepEqual(empty.p1,Array(12).fill(null),`${game} fresh P1 inputs blank`);
        assert.deepEqual(empty.p2,Array(12).fill(null),`${game} fresh P2 inputs blank`);
        assert.deepEqual(empty.draw,Array(11).fill(null),`${game} fresh Draw inputs blank`);
        compareKickoff(actual,simulateKickoff(rounds,empty),`${game} blank generated workbook`);
        const inputs={globals:[1,1.3,...Array(7).fill(null)],p1:[100,1,2,4,...Array(8).fill(null)],p2:Array(12).fill(null),draw:Array(11).fill(null)};
        const expected=simulateKickoff(rounds,inputs);
        await execute('/usr/bin/python3',[path.join(__dirname,'verify-calc.py'),target,'--output',output,...core.flatMap(item=>['--set',item])],{timeout:300000,maxBuffer:1024*1024});
        actual=JSON.parse(await fs.readFile(output,'utf8'));
        compareKickoff(actual,expected,`${game} generated real-history 1/2/4`);
        checked+=expected.rows.length;
      }else{
        const inputs=readInputs(wb,game),history=expandWorkbook(wb).getWorksheet('Rounds'),rounds=[];
        for(let i=2;i<=history.rowCount;i++){
          const values=Array.from({length:7},(_,n)=>text(history.getCell(i,n+1)));
          if(values[0])rounds.push({key:String(values[0]),timestamp:Number(values[1]),session:String(values[2]),outcome:String(values[3]),lossAll:values[4]===true||values[4]===1,raw:String(values[5]),roundId:String(values[6])});
        }
        await execute('/usr/bin/python3',[path.join(__dirname,'verify-calc.py'),target,'--output',output],{timeout:300000,maxBuffer:1024*1024});
        const actual=JSON.parse(await fs.readFile(output,'utf8'));
        for(const config of inputs.scenarios){
          const expected=simulate(rounds,config,inputs.rules.filter(r=>r.scenario===config.id),inputs.overrides.filter(o=>o.scenario===config.id));
          assert.deepEqual(actual[config.id].errors,[],`${game}/${config.id} formula errors`);
          for(const r of expected.rows){const row=actual[config.id].values[r.index+1];assert.deepEqual(row.slice(13,16),['A','B','D'].map(k=>r.bets[k]),`${game}/${config.id} bets at ${r.index}`);assert.equal(Math.round(row[22]*100),r.net,`${game}/${config.id} net at ${r.index}`);assert.deepEqual(row.slice(24,26).map(n=>Math.round(n*100)),r.after,`${game}/${config.id} cash at ${r.index}`);checked++;}
        }
      }
      console.log(`${name}: generated workbook reconciled`);
    }
    console.log(`GENERATED_CALC_VERIFIED ${checked} real-history rows`);return checked;
  }finally{await fs.rm(temp,{recursive:true,force:true});}
}
if(require.main===module){const task=process.argv[2]==='--generated'?verifyGenerated(process.argv[3]):verify({directory:process.argv[2]});task.catch(error=>{console.error(error);process.exitCode=1;});}
module.exports={verify,verifyGenerated,fixtures,kickoffFixture};
