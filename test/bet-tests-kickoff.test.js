'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const ExcelJS=require('exceljs');
const {simulateKickoff,validateKickoff}=require('../scripts/bet-tests/kickoff-engine');
const {createWorkbook,readInputs}=require('../scripts/bet-tests/workbook');
const {generate,convertFile}=require('../scripts/bet-tests/cli');

const rounds=outcomes=>outcomes.split('').map((outcome,index)=>({key:`r${index}`,timestamp:1000+index,session:'one',outcome,lossAll:outcome==='D',raw:'',roundId:''}));
const player=(bankroll=100,wager=1)=>[bankroll,wager,...Array(10).fill(null)];
const inputs=()=>({globals:[1,1.3,...Array(7).fill(null)],p1:player(),p2:Array(12).fill(null),draw:Array(11).fill(null)});
const withValues=(base,changes)=>{const copy=structuredClone(base);for(const [group,values] of Object.entries(changes))for(const [index,value] of Object.entries(values))copy[group][index]=value;return copy;};

test('minimal setup, optional defaults, and conditional requirements',()=>{
  const blank={globals:Array(9).fill(null),p1:Array(12).fill(null),p2:Array(12).fill(null),draw:Array(11).fill(null)};
  assert.deepEqual([validateKickoff(blank).valid,validateKickoff(blank).complete,validateKickoff(blank).status],[true,false,'Setup incomplete']);
  assert.ok(simulateKickoff(rounds('ABA'),blank).rows.every(row=>row.p1Stake===null&&row.net===null));
  const minimal=inputs(),validation=validateKickoff(minimal);
  assert.deepEqual([validation.valid,validation.complete,validation.status],[true,true,'Ready']);
  assert.deepEqual([validation.config.startSide,validation.config.colorMode,validation.config.drawTrigger,validation.config.drawOwner],[1,0,0,1]);
  assert.deepEqual(validation.config.p1.lines,Array(10).fill(100));
  for(const change of [{globals:{0:null}},{globals:{1:null}},{p1:{0:null}},{p1:{1:null}},{globals:{0:2}},{draw:{2:1}}]){
    assert.equal(validateKickoff(withValues(minimal,change)).status,'Setup incomplete');
  }
  const inactiveDraw=withValues(minimal,{globals:{5:2},draw:{0:0}});
  assert.equal(validateKickoff(inactiveDraw).status,'Ready');
  const dual=withValues(minimal,{globals:{0:2},p2:{0:0}});
  assert.equal(validateKickoff(dual).status,'Ready');
  assert.equal(validateKickoff(dual).config.p2.lines[0],0);
  for(const change of [{globals:{0:3}},{globals:{1:0}},{globals:{3:3}},{globals:{4:5}},{globals:{4:3}},{globals:{5:1.5}},{globals:{6:4}},{globals:{7:-1}},{p1:{0:1.001}},{p1:{1:0}},{p1:{2:-1}},{p1:{11:2}},{draw:{0:1},globals:{2:0}}]){
    const invalid=validateKickoff(withValues(minimal,change));assert.equal(invalid.valid,false,JSON.stringify(change));assert.equal(invalid.status,'Invalid input');
  }
});

test('win lines advance through ten, hold or reset after maximum, and reset on loss',()=>{
  const cfg=inputs();cfg.p1=[1000,...Array.from({length:10},(_,i)=>i+1),null];
  const held=simulateKickoff(rounds('AAAAAAAAAAABA'),cfg);
  assert.deepEqual(held.rows.map(r=>r.p1Stake),[1,2,3,4,5,6,7,8,9,10,10,10,1]);
  assert.deepEqual(held.rows.map(r=>r.step),[0,1,2,3,4,5,6,7,8,9,9,9,0]);
  cfg.p1[11]=1;
  assert.deepEqual(simulateKickoff(rounds('AAAAAAAAAAAA'),cfg).rows.map(r=>r.p1Stake),[1,2,3,4,5,6,7,8,9,10,1,2]);
  const inherited=inputs();inherited.p1[2]=2;inherited.p1[4]=4;
  assert.deepEqual(simulateKickoff(rounds('AAAAABA'),inherited).rows.map(r=>r.p1Stake),[1,2,2,4,4,4,1]);
  inherited.p1[2]=0;
  const idle=simulateKickoff(rounds('AAA'),inherited);
  assert.deepEqual(idle.rows.map(r=>[r.p1Stake,r.role]),[[1,'bet'],[0,'idle'],[0,'idle']]);
});

test('two-player modes enforce independent bets, switch thresholds and cover thresholds',()=>{
  const base=inputs();base.globals[0]=2;base.p2=player(100,1);base.p1[2]=2;base.p1[3]=4;base.p2[2]=2;
  const dual=simulateKickoff(rounds('AAB'),base);
  assert.deepEqual(dual.rows.map(r=>[r.p1Stake,r.p2Stake]),[[1,1],[2,1],[4,1]]);
  const switching=withValues(base,{globals:{4:1}});
  assert.deepEqual(simulateKickoff(rounds('BA'),switching).rows.map(r=>[r.factor,r.p1Stake,r.p2Stake]),[['A',1,0],['B',0,1]]);
  const threshold=withValues(base,{globals:{4:2}});
  assert.deepEqual(simulateKickoff(rounds('BAAB'),threshold).rows.map(r=>[r.factor,r.p1Stake,r.p2Stake]),[['A',1,0],['A',1,0],['A',2,0],['A',4,0]]);
  assert.deepEqual(simulateKickoff(rounds('ABB'),threshold).rows.map(r=>[r.factor,r.p1Stake,r.p2Stake]),[['A',1,0],['A',2,0],['B',0,1]]);
  for(const [mode,expected] of [[3,[[1,0],[2,1],[4,1]]],[4,[[1,0],[2,0],[4,1]]]]){
    const cover=withValues(base,{globals:{4:mode}});
    assert.deepEqual(simulateKickoff(rounds('AAA'),cover).rows.map(r=>[r.p1Stake,r.p2Stake]),expected);
    assert.equal(simulateKickoff(rounds('ABA'),cover).rows[2].factor,'B');
  }
  const blue=withValues(base,{globals:{3:2,4:1}});
  assert.deepEqual(simulateKickoff(rounds('B'),blue).rows.map(r=>[r.factor,r.p1Stake,r.p2Stake]),[['B',0,1]]);
});

test('Draw progression latches after trigger, pauses on win, and rounds each funder independently',()=>{
  const base=inputs();base.globals[2]=2;base.draw[0]=1;base.draw[1]=2;base.draw[2]=3;
  assert.deepEqual(simulateKickoff(rounds('DDA'),base).rows.map(r=>r.drawStake),[1,2,3]);
  assert.deepEqual(simulateKickoff(rounds('DAD'),base).rows.map(r=>r.drawStake),[1,2,1]);
  const trigger=withValues(base,{globals:{5:2}});
  const rows=simulateKickoff(rounds('BBAADA'),trigger).rows;
  assert.deepEqual(rows.map(r=>r.drawStake),[0,0,1,2,3,0]);
  assert.equal(rows[4].drawReturn,9);
  const split=withValues(base,{globals:{0:2,2:0.5,6:3},p2:{0:100},draw:{0:0.03}});
  const win=simulateKickoff(rounds('D'),split).rows[0];
  assert.deepEqual([win.drawStake,win.drawReturn,win.p1Net,win.p2Net],[0.03,0.05,-0.99,0.01]);
  const p2=withValues(split,{globals:{6:2}}),p2win=simulateKickoff(rounds('D'),p2).rows[0];
  assert.deepEqual([p2win.p1Net,p2win.p2Net,p2win.drawReturn],[-1,0.02,0.05]);
  const one=withValues(base,{globals:{6:2}});assert.equal(validateKickoff(one).config.drawOwner,1);
});

test('bankroll and target stops do not settle subsequent rounds',()=>{
  const small=withValues(inputs(),{p1:{0:0.5}}),insufficient=simulateKickoff(rounds('AA'),small);
  assert.equal(insufficient.status,'Stopped: insufficient bankroll');
  assert.ok(insufficient.rows.every(r=>r.p1Stake===null&&r.role==='Stopped'));
  const target=simulateKickoff(rounds('AA'),withValues(inputs(),{globals:{7:1}}));
  assert.equal(target.status,'Stopped: profit target');assert.equal(target.rows[0].p1Net,1.3);assert.equal(target.rows[1].p1Stake,null);
  const limit=simulateKickoff(rounds('BA'),withValues(inputs(),{globals:{8:1}}));
  assert.equal(limit.status,'Stopped: loss limit');assert.equal(limit.rows[0].p1Net,-1);assert.equal(limit.rows[1].p1Stake,null);
  const unfunded=withValues(inputs(),{globals:{0:2,2:2,6:2},p2:{0:0},draw:{0:1}});
  assert.equal(simulateKickoff(rounds('A'),unfunded).status,'Stopped: insufficient bankroll');
});

test('Calc recalculates blank workbook, live lines, modes, Draw, and ODS refresh',{skip:process.env.BET_TEST_CALC!=='1'},async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'bet-kickoff-calc-'));
  try{
    const {execFile}=require('node:child_process'),{promisify}=require('node:util'),exec=promisify(execFile);
    const history=rounds('AAABBAADBDAB'),file=path.join(dir,'test.xlsx'),output=path.join(dir,'values.json');
    await createWorkbook({game:'kickoff',rounds:history}).xlsx.writeFile(file);
    const calc=async(target=file,...sets)=>{await exec('/usr/bin/python3',['scripts/bet-tests/verify-calc.py',target,'--output',output,...sets.flatMap(s=>['--set',s])],{timeout:180000});return JSON.parse(await fs.readFile(output,'utf8'));};
    const compare=(actual,expected,label)=>{
      assert.deepEqual(actual['Test Options'].errors,[],label);assert.deepEqual(actual['Test Results'].errors,[],label);
      assert.equal(actual['Test Options'].values[28][1],'Ready',label);
      assert.equal(actual['Test Results'].values[2][1],expected.status,label);
      for(const r of expected.rows){
        const row=actual['Test Results'].values[r.index+5];
        for(const [col,key] of [[3,'role'],[4,'factor'],[5,'side'],[6,'step'],[7,'multiplier'],[20,'setEnd'],[21,'status']])assert.equal(row[col]===''?null:row[col],r[key],`${label} round ${r.index} ${key}`);
        for(const [col,key] of [[8,'p1Stake'],[9,'p2Stake'],[10,'drawStake'],[11,'p1Return'],[12,'p2Return'],[13,'drawReturn'],[14,'p1Net'],[15,'p2Net'],[16,'net'],[17,'cumulative'],[18,'p1Bankroll'],[19,'p2Bankroll']]){
          const got=row[col];assert.equal(got===''?null:(Math.round(got*100)||0),r[key]===null?null:(Math.round(r[key]*100)||0),`${label} round ${r.index} ${key}`);
        }
      }
    };
    const core=['Test Options!B5=1','Test Options!B6=1.3','Test Options!B16=100','Test Options!B17=1'];
    let actual=await calc(file);
    assert.equal(actual['Test Options'].values[28][1],'Setup incomplete');
    assert.deepEqual(actual['Test Options'].errors,[]);assert.deepEqual(actual['Test Results'].errors,[]);
    assert.ok(actual['Test Results'].values.slice(6,6+history.length).every(r=>r.slice(8,20).every(v=>v===''||v===null)));
    actual=await calc(file,...core);compare(actual,simulateKickoff(history,inputs()),'core only');
    actual=await calc(file,...core,'Test Options!B18=2','Test Options!B19=4');
    const edited=withValues(inputs(),{p1:{2:2,3:4}});compare(actual,simulateKickoff(history,edited),'live lines and inheritance');
    assert.deepEqual(actual['Test Results'].values.slice(6,10).map(r=>r[8]),[1,2,4,4]);
    actual=await calc(file,...core,'Test Options!B18=0');
    compare(actual,simulateKickoff(history,withValues(inputs(),{p1:{2:0}})),'explicit zero');
    assert.equal(actual['Test Results'].values[7][3],'idle');
    const dual=withValues(inputs(),{globals:{0:2,2:0.5,6:3},p1:{2:2,3:4},p2:{0:100,1:1,2:2},draw:{0:0.03,1:0.05,2:0.07}});
    for(const mode of [0,1,2,3,4])for(const trigger of [0,2]){
      const cfg=withValues(dual,{globals:{4:mode,5:trigger}}),result=simulateKickoff(history,cfg);
      await createWorkbook({game:'kickoff',rounds:history,inputs:cfg}).xlsx.writeFile(file);
      compare(await calc(),result,`mode ${mode} trigger ${trigger}`);
    }
    const source=path.join(dir,'history.csv');await fs.writeFile(source,'Timestamp,Session ID,Result\n1000,s,RED\n1001,s,BLUE\n1002,s,DRAW\n');
    await createWorkbook({game:'kickoff',rounds:history,inputs:dual,source}).xlsx.writeFile(file);
    const ods=await convertFile(file,'ods',dir),existing=path.join(dir,'The_Kickoff_Tests.ods');await fs.rename(ods,existing);
    await exec('/usr/bin/python3',['scripts/bet-tests/verify-calc.py',existing,'--output',output,'--save','--set','Test Options!B10=0','--set','Test Options!B18=4','--set','Test Options!C18=null','--set','Test Options!D17=0','--set','Test Options!D18=null'],{timeout:180000});
    const refreshed=await generate({game:'kickoff',outputDir:dir,convert:true});
    const xlsx=new ExcelJS.Workbook();await xlsx.xlsx.readFile(refreshed.xlsx);
    const fromXlsx=readInputs(xlsx,'kickoff');assert.equal(fromXlsx.globals[5],0);assert.equal(fromXlsx.p1[2],4);assert.equal(fromXlsx.p2[2],null);assert.equal(fromXlsx.draw[0],0);assert.equal(fromXlsx.draw[1],null);
    const restored=path.join(dir,'restored');await fs.mkdir(restored);const converted=await convertFile(refreshed.ods,'xlsx',restored);
    const roundtrip=new ExcelJS.Workbook();await roundtrip.xlsx.readFile(converted);assert.deepEqual(readInputs(roundtrip,'kickoff'),fromXlsx);
    await assert.rejects(generate({game:'kickoff',outputDir:dir,convert:false}),/precedence|exists/i);
  }finally{await fs.rm(dir,{recursive:true,force:true});}
});
