'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const ExcelJS=require('exceljs');
const {createWorkbook,readInputs}=require('../scripts/bet-tests/workbook');
const {generate,convertFile}=require('../scripts/bet-tests/cli');
const {mappedCell}=require('../scripts/bet-tests/compact');
const {ROW}=require('../scripts/bet-tests/schema');
const rounds=['A','A','A','D','B','B'].map((outcome,i)=>({key:`r${i}`,timestamp:1000+i,session:'one',outcome,lossAll:outcome==='D',raw:'quick',roundId:'',site:'test',sourceIndex:i}));

test('Kickoff numeric workbook exposes 44 blank unlocked inputs and V2 array shapes',async()=>{
  const wb=createWorkbook({game:'kickoff',rounds,capacity:12,source:'/tmp/history.csv'});
  assert.deepEqual(wb.worksheets.map(s=>s.name),['Results','Test Options','Test Results']);
  const options=wb.getWorksheet('Test Options'),results=wb.getWorksheet('Results'),detail=wb.getWorksheet('Test Results');
  assert.equal(options.getCell('Z1').value,require('../scripts/bet-tests/kickoff').MARKER);assert.equal(options.getCell('Z2').value,'/tmp/history.csv');
  const inputs=[];
  for(let row=5;row<=13;row++)inputs.push(`B${row}`);
  for(let row=16;row<=27;row++)inputs.push(`B${row}`,`C${row}`);
  for(let row=17;row<=27;row++)inputs.push(`D${row}`);
  assert.equal(inputs.length,44);
  for(const address of inputs){const cell=options.getCell(address);assert.equal(cell.value,null,address);assert.equal(cell.protection.locked,false,address);}
  assert.deepEqual(results.getRow(1).values.slice(1,10),['Round key','Timestamp','Session','Outcome','Loss all','Raw details','Round ID','Site','Source index']);
  assert.deepEqual(results.getRow(2).values.slice(1,10),[rounds[0].key,rounds[0].timestamp,rounds[0].session,rounds[0].outcome,rounds[0].lossAll,rounds[0].raw,rounds[0].roundId,rounds[0].site,rounds[0].sourceIndex]);
  assert.equal(detail.getRow(6).values[1],'Round');assert.equal(detail.getRow(6).values[23],'Key');
  const saved=new ExcelJS.Workbook();await saved.xlsx.load(await wb.xlsx.writeBuffer());
  assert.deepEqual(readInputs(saved,'kickoff'),{globals:Array(9).fill(null),p1:Array(12).fill(null),p2:Array(12).fill(null),draw:Array(11).fill(null)});
  const values=readInputs(saved,'kickoff');values.globals[5]=0;values.p1[7]=0;values.draw[0]=0;
  const zeros=createWorkbook({game:'kickoff',rounds,inputs:values});assert.deepEqual(readInputs(zeros,'kickoff'),values);
  assert.ok(zeros.worksheets.every(s=>s.state==='visible'));
});

test('legacy compact scenario edits and zero overrides remain supported by Sic Bo',()=>{
  const wb=createWorkbook({game:'sicbo',rounds,capacity:12});mappedCell(wb,'Scenarios',`B${ROW.bankroll1}`).value=234;
  ['S1','r0',0].forEach((v,i)=>{mappedCell(wb,'Overrides',`${String.fromCharCode(65+i)}2`).value=v;});
  const inputs=readInputs(wb,'sicbo');assert.equal(inputs.scenarios[0].bankroll1,234);
  assert.deepEqual(inputs.overrides[0],{scenario:'S1',key:'r0',lane:'A',units:0,nextStep:null});
  assert.deepEqual(wb.worksheets.map(s=>s.name),['Results','Configurations','Config Results']);
});

test('non-Kickoff lock, missing history and compact refresh protections remain intact',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'bet-workbook-'));
  try{
    await fs.writeFile(path.join(dir,'.~lock.Sic_Bo_Tests.ods#'),'locked');
    await assert.rejects(generate({game:'sicbo',sourceDir:dir,outputDir:dir,convert:false,capacity:12}),/open|lock/i);
    await fs.unlink(path.join(dir,'.~lock.Sic_Bo_Tests.ods#'));
    const empty=await generate({game:'baccarat',sourceDir:dir,outputDir:dir,convert:false,capacity:12});assert.equal(empty.rounds,0);assert.match(empty.status,/Awaiting history/i);
    const source=path.join(dir,'history.csv');await fs.writeFile(source,'Timestamp,Session ID,Result\n1000,s,BIG\n2000,s,SMALL\n');
    const first=await generate({game:'sicbo',sourceFile:source,outputDir:dir,convert:false,capacity:5});
    const prior=await fs.readFile(first.xlsx);await fs.unlink(source);
    await assert.rejects(generate({game:'sicbo',outputDir:dir,convert:false}),/preserved|missing/i);assert.deepEqual(await fs.readFile(first.xlsx),prior);
  }finally{await fs.rm(dir,{recursive:true,force:true});}
});

test('Kickoff V1 migration backs up layout, retains source guards, and starts blank',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'bet-kickoff-migrate-'));
  try{
    const source=path.join(dir,'history.csv');await fs.writeFile(source,'Timestamp,Session ID,Result\n1000,s,RED\n2000,s,BLUE\n');
    const first=path.join(dir,'The_Kickoff_Tests.xlsx');
    const legacy=createWorkbook({game:'kickoff',rounds,capacity:5,source});
    const legacyOptions=legacy.getWorksheet('Test Options');legacyOptions.getCell('Z1').value='BET_R_KICKOFF_NUMERIC_V1';
    legacyOptions.getCell('Z2').value=source;legacyOptions.getCell('B5').value=1;legacyOptions.getCell('B6').value=4;
    legacyOptions.getCell('B16').value=100;legacyOptions.getCell('B17').value=1;await legacy.xlsx.writeFile(first);
    const original=await fs.readFile(first),migrated=await generate({game:'kickoff',outputDir:dir,convert:false});
    const backupName=(await fs.readdir(dir)).find(n=>n.startsWith('The_Kickoff_Tests.xlsx.backup-'));
    assert.ok(backupName);assert.deepEqual(await fs.readFile(path.join(dir,backupName)),original);
    const wb=new ExcelJS.Workbook();await wb.xlsx.readFile(migrated.xlsx);
    assert.deepEqual(readInputs(wb,'kickoff'),{globals:Array(9).fill(null),p1:Array(12).fill(null),p2:Array(12).fill(null),draw:Array(11).fill(null)});
    assert.equal(wb.getWorksheet('Test Options').getCell('Z2').value,source);
    assert.equal(wb.getWorksheet('Results').rowCount,3);
    const bytes=await fs.readFile(migrated.xlsx);await fs.unlink(source);
    await assert.rejects(generate({game:'kickoff',outputDir:dir,convert:false}),/preserved|missing/i);
    assert.deepEqual(await fs.readFile(migrated.xlsx),bytes);
  }finally{await fs.rm(dir,{recursive:true,force:true});}
});

test('Kickoff refresh preserves blanks and explicit zeros; store archives then clears',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'bet-kickoff-store-'));
  try{
    const source=path.join(dir,'history.csv');await fs.writeFile(source,'Timestamp,Session ID,Result\n1000,s,RED\n2000,s,BLUE\n3000,s,RED\n4000,s,BLUE\n5000,s,RED\n6000,s,BLUE\n');
    const first=await generate({game:'kickoff',sourceFile:source,outputDir:dir,convert:false});const wb=new ExcelJS.Workbook();await wb.xlsx.readFile(first.xlsx);
    const options=wb.getWorksheet('Test Options');for(const [address,value] of Object.entries({B5:1,B6:1.3,B7:2,B16:100,B17:1,B18:0,B22:5,B27:1,D17:0,D21:2}))options.getCell(address).value=value;await wb.xlsx.writeFile(first.xlsx);
    await assert.rejects(generate({game:'kickoff',sourceFile:source,outputDir:dir,convert:false,store:true,slot:'S2'}),/Unknown scenario S2/);
    const refreshed=await generate({game:'kickoff',outputDir:dir,convert:false});
    const saved=new ExcelJS.Workbook();await saved.xlsx.readFile(refreshed.xlsx);
    assert.deepEqual(readInputs(saved,'kickoff'),{globals:[1,1.3,2,null,null,null,null,null,null],p1:[100,1,0,null,null,null,5,null,null,null,null,1],p2:Array(12).fill(null),draw:[0,null,null,null,2,null,null,null,null,null,null]});
    await generate({game:'kickoff',sourceFile:source,outputDir:dir,convert:false,store:true,slot:'S1'});
    const fresh=new ExcelJS.Workbook();await fresh.xlsx.readFile(first.xlsx);assert.equal(readInputs(fresh,'kickoff').globals[0],null);
    const archives=await fs.readdir(path.join(dir,'saved'));const archive=new ExcelJS.Workbook();await archive.xlsx.readFile(path.join(dir,'saved',archives.find(n=>n.endsWith('.xlsx'))));
    assert.deepEqual(readInputs(archive,'kickoff'),readInputs(saved,'kickoff'));
    assert.ok(archive.worksheets.every(s=>s.sheetProtection?.sheet));
    for(const address of [...Array.from({length:9},(_,i)=>`B${5+i}`),...Array.from({length:12},(_,i)=>[`B${16+i}`,`C${16+i}`]).flat(),...Array.from({length:11},(_,i)=>`D${17+i}`)]){
      assert.notEqual(archive.getWorksheet('Test Options').getCell(address).protection?.locked,false,address);
    }
  }finally{await fs.rm(dir,{recursive:true,force:true});}
});

test('invalid capacity rejects before workbook creation',()=>{assert.throws(()=>createWorkbook({game:'kickoff',capacity:20001}),/Capacity/);});





