#!/usr/bin/env node
'use strict';
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const {pathToFileURL}=require('node:url');
const ExcelJS=require('exceljs');
const {GAME_META,loadHistory}=require('./history');
const {createWorkbook,readInputs,cacheResults}=require('./workbook');
const {expandWorkbook}=require('./compact');
const {simulate}=require('./engine');
const {defaultScenario}=require('./engine');
const {presets}=require('./schema');
const {ledger,serialize}=require('./csv');
const execute=promisify(execFile);

async function exists(file){try{await fs.access(file);return true;}catch(error){if(error.code==='ENOENT')return false;throw error;}}
async function convertFile(input,format,directory){
  const profile=await fs.mkdtemp(path.join(os.tmpdir(),'bet-calc-profile-'));
  try{
    await execute('libreoffice',[`-env:UserInstallation=${pathToFileURL(profile).href}`,'--headless','--convert-to',format,'--outdir',directory,input],{timeout:180000,maxBuffer:1024*1024});
    const output=path.join(directory,`${path.basename(input,path.extname(input))}.${format}`);
    if(!await exists(output))throw new Error(`LibreOffice did not produce ${format} output`);
    return output;
  }finally{await fs.rm(profile,{recursive:true,force:true});}
}

async function generate({game,sourceDir,sourceFile,outputDir=path.resolve('bet tests'),capacity,convert=true,refresh=true,ruleSlots=12}={}){
  if(!Object.hasOwn(GAME_META,game))throw new Error(`Unknown game: ${game}`);
  if(capacity!==undefined&&(!Number.isInteger(capacity)||capacity<1||capacity>20000))throw new Error('Capacity must be 1–20000 rounds');
  await fs.mkdir(outputDir,{recursive:true});
  const name=GAME_META[game].file.replace('_Results.xlsx','_Tests');
  const xlsx=path.join(outputDir,`${name}.xlsx`),ods=path.join(outputDir,`${name}.ods`);
  for(const file of [xlsx,ods])if(await exists(path.join(outputDir,`.~lock.${path.basename(file)}#`)))throw new Error(`Workbook is open or locked: ${file}. Close it before refresh.`);
  const stage=await fs.mkdtemp(path.join(outputDir,'.refresh-'));
  try{
    let inputs={},previousSource='',previousRounds=0;
    if(refresh&&(await exists(ods)||await exists(xlsx))){
      const previous=await exists(ods)?await convertFile(ods,'xlsx',stage):xlsx;
      const workbook=new ExcelJS.Workbook();await workbook.xlsx.readFile(previous);inputs=readInputs(workbook,game);
      const previousLayout=workbook.getWorksheet('Configurations')?expandWorkbook(workbook):workbook;
      const sourceCell=previousLayout.getWorksheet('Guide')?.getCell('B2');
      previousRounds=Math.max(0,(previousLayout.getWorksheet('Rounds')?.rowCount||1)-1);
      if(sourceCell&&typeof sourceCell.value==='string'&&/\.(xlsx|csv|json)$/i.test(sourceCell.value))previousSource=sourceCell.value;
    }
    const history=await loadHistory(game,{sourceDir:sourceDir||path.resolve('live results'),sourceFile:sourceFile||(!sourceDir&&previousSource?previousSource:undefined)});
    if(previousRounds>0&&history.rounds.length===0)
      throw new Error(`History refresh returned no rounds. Existing workbook preserved; check source ${history.source||previousSource}.`);
    const scenarios=inputs.scenarios||presets(defaultScenario,game);
    const ids=new Set((scenarios||[]).map(c=>c.id));
    for(const row of [...(inputs.rules||[]),...(inputs.overrides||[])])if(!ids.has(row.scenario))throw new Error(`Unknown scenario ${row.scenario} in rules/overrides. Existing workbook preserved.`);
    const snapshots=[];
    for(const config of scenarios){
      const rules=(inputs.rules||[]).filter(r=>r.scenario===config.id);
      const overrides=(inputs.overrides||[]).filter(o=>o.scenario===config.id);
      snapshots.push({config,result:simulate(history.rounds,config,rules,overrides)});
    }
    const workbook=createWorkbook({game,rounds:history.rounds,...inputs,capacity,ruleSlots,source:history.source||history.status});
    cacheResults(workbook,snapshots);
    const stagedXlsx=path.join(stage,`${name}.xlsx`);await workbook.xlsx.writeFile(stagedXlsx);
    let stagedOds;
    if(convert)stagedOds=await convertFile(stagedXlsx,'ods',stage);
    const stamp=`${Date.now()}`;
    for(const [temporary,destination] of [[stagedXlsx,xlsx],...(stagedOds?[[stagedOds,ods]]:[])]){
      if(await exists(destination))await fs.copyFile(destination,`${destination}.backup-${stamp}`);
      await fs.rename(temporary,destination);
    }
    const csvDir=path.join(outputDir,'csv',name);await fs.mkdir(csvDir,{recursive:true});
    for(const [index,{config,result}] of snapshots.entries()){
      const target=path.join(csvDir,`scenario-${index+1}.csv`),tmp=path.join(stage,`scenario-${index+1}.csv`);
      await fs.writeFile(tmp,ledger(config,result));await fs.rename(tmp,target);
    }
    const comparison=serialize([['Scenario','Name','Net dollars','P1 ending dollars','P2 ending dollars','Bankroll ROI','Wagering yield','Complete','Stop round'],
      ...snapshots.map(({config,result:{summary:s}})=>[config.id,config.name,s.net/100,...s.ending.map(n=>n/100),s.bankrollROI,s.yield,s.complete,s.stopRound])]);
    const temporaryCsv=path.join(stage,'comparison.csv');await fs.writeFile(temporaryCsv,comparison);await fs.rename(temporaryCsv,path.join(csvDir,'comparison.csv'));
    return {game,xlsx,ods:stagedOds?ods:null,rounds:history.rounds.length,status:history.status,source:history.source};
  }finally{await fs.rm(stage,{recursive:true,force:true});}
}

function argumentsOf(argv){
  const options={};
  for(let i=0;i<argv.length;i++){
    const flag=argv[i];
    if(flag==='--no-convert')options.convert=false;
    else if(flag==='--help')options.help=true;
    else if(['--game','--source-dir','--source','--output-dir','--capacity','--rule-slots'].includes(flag)){
      const value=argv[++i];if(value===undefined||value.startsWith('--'))throw new Error(`Missing value: ${flag}`);
      const key={'--source-dir':'sourceDir','--source':'sourceFile','--output-dir':'outputDir','--rule-slots':'ruleSlots'}[flag]||flag.slice(2);
      options[key]=['capacity','ruleSlots'].includes(key)?Number(value):value;
    }else throw new Error(`Unknown option: ${flag}`);
  }
  return options;
}
async function main(argv=process.argv.slice(2)){
  const options=argumentsOf(argv);
  if(options.help){console.log('Usage: npm run generate:tests -- [--game kickoff|sicbo|teenpatti|baccarat] [--source-dir "live results"] [--source master.csv|master.xlsx|backup.json] [--output-dir "bet tests"] [--capacity 500] [--rule-slots 12]');return;}
  if(options.sourceFile&&!options.game)throw new Error('--source requires --game');
  for(const game of options.game?[options.game]:Object.keys(GAME_META)){
    const result=await generate({...options,game});console.log(`${GAME_META[game].name}: ${result.rounds} rounds; ${result.status}; ${result.ods||result.xlsx}`);
  }
}
if(require.main===module)main().catch(error=>{console.error(error.message);process.exitCode=1;});
module.exports={generate,convertFile,argumentsOf,main};
