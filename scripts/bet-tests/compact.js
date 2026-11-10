'use strict';
const ExcelJS = require('exceljs');
const { FIELDS } = require('./schema');
const NAVY='152C49', BLUE='DCEEFF', INK='233B53', PALE='F1F5F9';
const META='BET_R_COMPACT_V1';
function getLayout(wb){const sheet=wb.getWorksheet('Configurations');if(!sheet)throw new Error('Missing Configurations sheet');for(const c of [26,23])for(let r=1;r<=20;r++)if(plain(sheet.getCell(r,c))===META){let data=plain(sheet.getCell(r+1,c));if(typeof data==='string'&&data.startsWith('BET_R_PARTS:')){const count=Number(data.slice(12));data=Array.from({length:count},(_,i)=>plain(sheet.getCell(r+2+i,c))).join('');}return JSON.parse(data);}throw new Error('Compact workbook layout information is missing.');}
function writeMetadata(sheet,metadata){const data=JSON.stringify(metadata);if(data.length<=30000){sheet.getCell('Z2').value=data;return;}const parts=data.match(/[\s\S]{1,30000}/g);sheet.getCell('Z2').value=`BET_R_PARTS:${parts.length}`;parts.forEach((part,i)=>{sheet.getCell(i+3,26).value=part;});}
function mappedCell(wb,name,address){if(!isCompact(wb))return wb.getWorksheet(name).getCell(address);if(name==='Guide'&&address==='B2')return wb.getWorksheet('Results').getCell('A3');const meta=getLayout(wb),map=meta.maps[name];if(!map)throw new Error(`No compact mapping for ${name}`);const match=/^([A-Z]+)([0-9]+)$/.exec(address.replaceAll('$',''));const col=number(match[1]),row=Number(match[2]);return wb.getWorksheet(map.name).getCell(map.rows?.[row]??row+(map.row||0),map.cols?.[col]??col+(map.col||0));}
const quote=name=>`'${name.replaceAll("'","''")}'`;
const plain=cell=>cell.value&&typeof cell.value==='object'?(cell.value.result??cell.value.text??''):cell.value;
const clone=value=>value===undefined?undefined:JSON.parse(JSON.stringify(value));
function letter(n){let s='';for(;n;n=Math.floor((n-1)/26))s=String.fromCharCode(65+(n-1)%26)+s;return s;}
function number(s){return [...s].reduce((n,c)=>n*26+c.charCodeAt(0)-64,0);}
function banner(ws,row,title,last=12){ws.mergeCells(row,1,row,last);const c=ws.getCell(row,1);c.value=title;c.font={bold:true,size:row===1?20:12,color:{argb:'FFFFFF'}};c.fill={type:'pattern',pattern:'solid',fgColor:{argb:NAVY}};ws.getRow(row).height=row===1?36:25;}
function base(ws){ws.properties.defaultRowHeight=21;ws.views=[{state:'frozen',ySplit:4,zoomScale:85}];ws.properties.outlineProperties={summaryBelow:false};ws.pageSetup={orientation:'landscape',paperSize:9,fitToPage:true,fitToWidth:1,fitToHeight:0};ws.getColumn(1).width=40;}
function copyCell(source,target,formula){target.value=source.formula?{formula:formula(source.formula),...(source.value.result!==undefined?{result:source.value.result}:{})}:clone(source.value);target.style=clone(source.style);if(source.dataValidation?.type)target.dataValidation=clone(source.dataValidation);if(source.note)target.note=clone(source.note);}
function formulaMapper(maps){
  const cell=(ref,map)=>{const m=/^(\$?)([A-Z]{1,3})(\$?)(\d+)$/.exec(ref);return `${m[1]}${letter(number(m[2])+(map.col||0))}${m[3]}${Math.min(1048576,map.rows?.[Number(m[4])]??Number(m[4])+(map.row||0))}`;};
  return (formula,local)=>formula.split(/("(?:[^"]|"")*")/g).map((part,i)=>i%2?part:part.replace(/(?<![A-Za-z0-9_\.])(?:(?:'((?:[^']|'')+)'|([A-Za-z_][A-Za-z0-9_ ]*))!)?(\$?[A-Z]{1,3}\$?\d+)(?::(\$?[A-Z]{1,3}\$?\d+))?(?![A-Za-z0-9_]|\s*\()/g,(all,quoted,bare,start,end)=>{
    const name=quoted?quoted.replaceAll("''", "'"):bare;const map=maps[name||local];if(!map)return all;
    return `${name?quote(map.name)+'!':''}${cell(start,map)}${end?':'+cell(end,map):''}`;
  })).join('');
}
function isCompact(wb){return !!wb.getWorksheet('Configurations')&&!!wb.getWorksheet('Config Results');}
function compactWorkbook(legacy){
  const wb=new ExcelJS.Workbook();wb.creator='Bet-R Play-R';wb.calcProperties={fullCalcOnLoad:true,forceFullCalc:true};
  const results=wb.addWorksheet('Results'),settings=wb.addWorksheet('Configurations'),output=wb.addWorksheet('Config Results');[results,settings,output].forEach(base);
  const original=legacy.getWorksheet('Scenarios');const count=original.columnCount-1;if(count>24)throw new Error('Compact workbooks support up to 24 configurations.');
  const ledgers=legacy.worksheets.filter(ws=>!['Guide','Rounds','Scenarios','Ladders','Rules','Overrides','Comparison'].includes(ws.name));
  const maps={Rounds:{name:'Results',row:3},Scenarios:{name:'Configurations',rows:{1:5,2:6}},Comparison:{name:'Config Results',row:3}};
  banner(settings,1,'Configurations — change blue cells',Math.max(6,count+1));settings.getCell('A2').value='Adjust a configuration column, then see Config Results. Each column is a separate test.';settings.getCell('A3').value='Advanced options, rules, overrides and custom ladders are below. Expand grouped rows and columns when needed.';
  let row=7;const used=new Set();
  const section=(title,keys,advanced=false)=>{banner(settings,row++,title,Math.max(6,count+1));for(const key of keys){const index=FIELDS.findIndex(f=>f[0]===key);if(index<0||used.has(index))continue;used.add(index);maps.Scenarios.rows[index+3]=row;if(advanced){settings.getRow(row).outlineLevel=1;settings.getRow(row).hidden=true;}row++;}};
  section('01  Basics & bankroll',['id','name','active','lockStore','confirmed','players','bankroll1','bankroll2','unit','increment','startRound','endRound','startSide','sideMode','profitTarget','lossLimit']);
  for(const lane of ['A','B','D'])section(`${lane==='D'?'04  Draw / Triple':lane==='A'?'02  Side A':'03  Side B'} — stake & progression`,['enabled','startPaused','initial','ladder','winAction','winValue','winPause','lossAction','lossValue','lossPause','cap','capAction'].map(k=>`${lane}.${k}`));
  section('05  Payouts & draw protection',['oddsA','oddsB','oddsD','commissionA','commissionB','commissionD','drawMode','drawTrigger','drawOwner','drawThreshold','protectPercent']);
  banner(settings,row++,'06  Live test metrics (from Config Results)',Math.max(6,count+1));
  const metrics=['Net ($)','P1 ending ($)','P2 ending ($)','Bankroll ROI','Wagering yield','Total wagered ($)','Lowest team cash ($)','P1 lowest ($)','P2 lowest ($)','Max drawdown ($)','Largest bet ($)','Draw net ($)','Cross-bets?','Status'];
  metrics.forEach((name,i)=>{settings.getCell(row,1).value=name;for(let c=2;c<=count+1;c++){const cell=settings.getCell(row,c);const source=legacy.getWorksheet('Comparison').getCell(c,i+4);cell.value={formula:`'Config Results'!${letter(i+4)}${c+3}`,...(source.value?.result!==undefined?{result:source.value.result}:{})};cell.protection={locked:true};if(i<12)cell.numFmt=i===3||i===4?'0.00%':'$#,##0.00;[Red]-$#,##0.00';}row++;});
  section('07  Advanced — pushes (expand rows)',FIELDS.filter((_,i)=>!used.has(i)).map(f=>f[0]),true);
  const sections={};
  for(const name of ['Rules','Ladders','Overrides']){row+=2;sections[name]=row;banner(settings,row++,`Advanced: ${name}`,Math.max(name==='Rules'?21:8,count+1));maps[name]={name:'Configurations',row:row-1};for(let n=row+1;n<row+legacy.getWorksheet(name).rowCount;n++){settings.getRow(n).outlineLevel=1;settings.getRow(n).hidden=true;}row+=legacy.getWorksheet(name).rowCount;}
  const historyCols={1:7,2:10,3:5,4:9,5:6,6:4,7:8};maps.Rounds.cols=historyCols;
  // History is reordered for reading; every original field remains available.
  const mapperBase=formulaMapper(maps);
  const mapper=(formula,local)=>{
    const historyFixed=formula.replace(/Rounds!(\$?)([A-G])(\$?)(\d+)/g,(_,a,c,b,r)=>`Rounds!${a}${letter(historyCols[number(c)])}${b}${r}`);
    return mapperBase(historyFixed,local);
  };
  let next=24;for(const ws of ledgers){maps[ws.name]={name:'Config Results',col:next-1};next+=ws.columnCount+2;}
  if(next>16384)throw new Error('Too many configurations for the compact workbook. Reduce configuration count or rule slots.');
  // Mapper reads maps lazily, so ledger offsets added above apply to every formula.
  for(const source of legacy.worksheets){const map=maps[source.name];if(!map)continue;const destination=wb.getWorksheet(map.name);source.eachRow({includeEmpty:false},r=>r.eachCell({includeEmpty:false},c=>{const rr=map.rows?.[r.number]??r.number+(map.row||0),cc=map.cols?.[c.col]??c.col+(map.col||0);copyCell(c,destination.getCell(rr,cc),f=>mapper(f,source.name));}));}
  banner(results,1,'Results — historical game outcomes',7);
  const {GAME_META}=require('./history');const game=plain(original.getCell('B2')),labels=GAME_META[game].labels;settings.eachRow(r=>{const title=String(plain(r.getCell(1))||'');if(title.startsWith('02  Side A'))r.getCell(1).value=`02  ${labels[0]} (A) — stake & progression`;if(title.startsWith('03  Side B'))r.getCell(1).value=`03  ${labels[1]} (B) — stake & progression`;if(title.startsWith('04  Draw / Triple'))r.getCell(1).value=`04  ${labels[2]} (D) — stake & progression`;});results.getCell('A4').value='Round';results.getCell('C4').value='Outcome';
  for(let r=5;r<=results.rowCount;r++){results.getCell(r,1).value=r-4;const code=plain(results.getCell(r,9));results.getCell(r,3).value={formula:`IF(I${r}=\"A\",\"${labels[0]}\",IF(I${r}=\"B\",\"${labels[1]}\",IF(I${r}=\"D\",\"${labels[2]}\",\"\")))`,result:labels[['A','B','D'].indexOf(code)]||''};}
  for(let r=5;r<=results.rowCount;r++){const timestamp=plain(results.getCell(r,10));results.getCell(r,2).value={formula:`IF(ISNUMBER(J${r}),J${r}/86400000+DATE(1970,1,1),"")`,result:typeof timestamp==='number'?timestamp/86400000+25569:''};results.getCell(r,2).numFmt='yyyy-mm-dd hh:mm:ss';}results.getCell('B4').value='Time (UTC)';
  [5,6,7,8,9,10].forEach(c=>{results.getColumn(c).hidden=true;results.getColumn(c).outlineLevel=1;});results.getCell('A2').value='Imported history. Configuration performance and round-by-round cash are on Config Results.';results.getRow(4).font={bold:true,color:{argb:'FFFFFF'}};results.getRow(4).fill={type:'pattern',pattern:'solid',fgColor:{argb:NAVY}};results.autoFilter={from:'A4',to:`J${Math.max(4,results.rowCount)}`};[18,24,16,52,22,17,45].forEach((w,i)=>results.getColumn(i+1).width=w);results.getCell('F4').value='Colors lose on draw?';
  for(let c=2;c<=Math.max(count+1,24);c++)settings.getColumn(c).width=c<=count+1?23:16;
  settings.getColumn(1).width=47;
  for(let c=count+2;c<=24;c++){settings.getColumn(c).hidden=true;settings.getColumn(c).outlineLevel=1;}
  for(const r of [2,3]){settings.mergeCells(r,1,r,Math.max(6,count+1));settings.getRow(r).height=32;settings.getCell(r,1).alignment={wrapText:true,vertical:'middle'};}
  for(const r of [2,3]){results.mergeCells(r,1,r,4);results.getRow(r).height=32;results.getCell(r,1).alignment={wrapText:true,vertical:'middle'};}
  const help={ladder:'flat: 1,1,1; double: 1,2,4,8; linear: 1,2,3; fib: 1,1,2,3,5. Custom values are in the advanced ladder table.',sideMode:'fixed keeps starting side; swap1 switches after a losing bet; swap2 switches after a losing bet of at least 2 units; dual bets both sides with two players.',confirmed:'Confirm gross decimal payouts and commissions before interpreting financial results.',drawMode:'off: no draw bet; fixed: fixed units; progression: independent draw ladder; protection: offsets the configured percentage of color exposure.'};
  FIELDS.forEach(([key],i)=>{const note=help[key]||(key.endsWith('.ladder')?help.ladder:undefined);if(note)settings.getCell(maps.Scenarios.rows[i+3],1).note=note;});settings.views=[{state:'frozen',xSplit:1,ySplit:6,zoomScale:85}];
  const guide=legacy.getWorksheet('Guide');results.getCell('A3').value=plain(guide.getCell('B2'));const metadata={version:1,maps,sections,historyCols,guide:guide.getSheetValues(),count,ledgerNames:ledgers.map(ws=>ws.name),savedReviews:legacy.savedReviews||[]};
  settings.getCell('Z1').value=META;writeMetadata(settings,metadata);settings.getColumn(26).hidden=true;
  banner(output,1,'Config Results — compare & inspect',18);output.mergeCells('A2:R2');output.getRow(2).height=30;output.getCell('A2').alignment={wrapText:true,vertical:'middle'};output.getCell('A2').value='Compare every configuration below. Active strategy selects the round-by-round results.';
  output.getRow(4).height=40;output.getRow(4).alignment={wrapText:true,vertical:'middle'};
  const selector=count+9,head=selector+5,detail=head+1;
  banner(output,selector-1,'Round detail',18);output.getCell(selector,1).value='Active configuration';
  const ids=ledgers.map(ws=>plain(original.getCell(3,ledgers.indexOf(ws)+2))||ws.name);
  const chosen=Math.max(0,ledgers.findIndex((_,i)=>plain(original.getCell(require('./schema').ROW.active,i+2))===true));
  output.getCell(selector,2).value={formula:`IFERROR(INDEX($A$5:$A$${count+4},MATCH(TRUE,INDEX($C$5:$C$${count+4}=TRUE,0),0)),$A$5)`,result:ids[chosen]};output.getCell(selector,2).fill={type:'pattern',pattern:'solid',fgColor:{argb:BLUE}};
  output.getCell(selector,2).dataValidation={type:'list',allowBlank:false,formulae:[`$A$5:$A$${count+4}`],showErrorMessage:true,error:'Choose a configuration from the list.'};
  output.getCell(selector,2).protection={locked:false};
  output.getCell(selector,4).value={formula:`IFERROR(INDEX($B$5:$B$${count+4},MATCH($B$${selector},$A$5:$A$${count+4},0)),"")`,result:plain(original.getCell(4,2))};output.getCell(selector,4).font={bold:true,color:{argb:INK}};
  const fields=[['Round',1],['Outcome',6],[`${labels[0]} bet (u)`,14],[`${labels[1]} bet (u)`,15],[`${labels[2]} bet (u)`,16],['Staked ($)',21],['Returned ($)',22],['Net ($)',23],['Running ($)',24],['P1 cash ($)',25],['P2 cash ($)',26],['Status',7]];
  fields.forEach(([title],i)=>output.getCell(head,i+1).value=title);output.getRow(head).font={bold:true,color:{argb:'FFFFFF'}};output.getRow(head).fill={type:'pattern',pattern:'solid',fgColor:{argb:NAVY}};
  const capacity=Math.max(...ledgers.map(ws=>ws.rowCount-2));
  metadata.detail={selectorRow:selector,headerRow:head,firstRow:detail,capacity};writeMetadata(settings,metadata);
  ledgers.forEach((ws,i)=>{output.getCell(i+5,1).value={formula:`Configurations!${letter(i+2)}${maps.Scenarios.rows[3]}`,result:plain(original.getCell(3,i+2))};const input=original.getCell(4,i+2),target=output.getCell(i+5,2);target.value={formula:`Configurations!${letter(i+2)}${maps.Scenarios.rows[4]}`,result:plain(input)};});
  const selectSetting=key=>`INDEX(Configurations!$B$${maps.Scenarios.rows[require('./schema').ROW[key]]}:$${letter(count+1)}$${maps.Scenarios.rows[require('./schema').ROW[key]]},1,MATCH($B$${selector},$A$5:$A$${count+4},0))`;
  const summary=[['Players','players'],['P1 bankroll','bankroll1'],['P2 bankroll','bankroll2'],['Side mode','sideMode'],['A ladder','A.ladder'],['A cap','A.cap'],['B ladder','B.ladder'],['B cap','B.cap'],['D ladder','D.ladder'],['D cap','D.cap'],['Draw mode','drawMode'],['Trigger','drawTrigger'],['Draw owner','drawOwner']];
  summary.forEach(([label,key],i)=>{const r=selector+1+Math.floor(i/7),c=1+(i%7)*2;output.getCell(r,c).value=label;output.getCell(r,c+1).value={formula:`IFERROR(${selectSetting(key)},"")`};});
  [['Net',4],['ROI',7],['Drawdown',13],['Status',17]].forEach(([label,col],i)=>{const c=1+i*4;output.getCell(selector+3,c).value=label;output.getCell(selector+3,c+1).value={formula:`IFERROR(INDEX($${letter(col)}$5:$${letter(col)}$${count+4},MATCH($B$${selector},$A$5:$A$${count+4},0)),"")`};});
  for(let index=0;index<capacity;index++)for(let c=0;c<fields.length;c++){
    const sourceColumn=fields[c][1];const choices=ledgers.map(ws=>`${maps[ws.name].col+sourceColumn}`).join(',');
    const range=`$A$${index+3}:$${letter(next-1)}$${index+3}`;
    let formula=`IFERROR(IF(INDEX(${range},1,CHOOSE(MATCH($B$${selector},$A$5:$A$${count+4},0),${ledgers.map(ws=>maps[ws.name].col+2).join(',')}))="","",INDEX(${range},1,CHOOSE(MATCH($B$${selector},$A$5:$A$${count+4},0),${choices}))),"")`;
    const cached=ledgers[chosen].getCell(index+3,sourceColumn);let result=plain(cached);if(c===1){formula=`IFERROR(Results!C${index+5},"")`;const code=plain(legacy.getWorksheet('Rounds').getCell(index+2,4));result=labels[['A','B','D'].indexOf(code)]||'';}if(!plain(legacy.getWorksheet('Rounds').getCell(index+2,1)))result='';
    output.getCell(detail+index,c+1).value={formula,result:result??''};if(c>=5&&c<=10)output.getCell(detail+index,c+1).numFmt='$#,##0.00;[Red]-$#,##0.00';
  }
  let savedRow=detail+capacity+2;banner(output,savedRow++,'Saved & Locked Strategy Reviews',18);
  if(!metadata.savedReviews.length) output.getCell(savedRow++,1).value='No locked strategies yet. Set "Lock & store result" = TRUE on Configurations and run npm run sync:tests (or npm run store:tests) to lock the active strategy here and reset its slot.';
  for(const review of metadata.savedReviews){
    const c=review.config,s=review.summary;
    const lines=[['Locked timestamp',review.lockedAt,'Original slot & name',`${c.id} ${c.name}`,'Archive file',review.archiveFile],
      ['Players',c.players,'P1/P2 bankroll',`${c.bankroll1} / ${c.bankroll2}`,'Unit',c.unit,'Side mode',c.sideMode],
      ['A/B/D ladders & caps',...['A','B','D'].map(k=>`${k}: ${c.lanes[k].ladder} / ${c.lanes[k].cap}`),'Draw mode / trigger / owner',`${c.drawMode} / ${c.drawTrigger} / ${c.drawOwner}`],
      ['Net',s.net/100,'P1/P2 ending',`${s.ending[0]/100} / ${s.ending[1]/100}`,'ROI',s.bankrollROI,'Yield',s.yield,'Staked',s.staked/100],
      ['Lowest team cash',s.lowest/100,'P1/P2 lowest',`${s.playerLowest[0]/100} / ${s.playerLowest[1]/100}`,'Max drawdown',s.drawdown/100,'Largest bet',s.largestBet/100,'Draw net',s.drawNet/100,'Cross-bets?',s.crossBets?'Yes':'No','Status',s.complete?'Complete':`Stopped round ${s.stopRound}`]];
    for(const line of lines){output.getRow(savedRow++).values=line;}
    output.getRow(savedRow++).values=fields.map(x=>x[0]);
    for(const r of review.rows){const rr=output.getRow(savedRow++);rr.values=[r.index,r.outcome,r.bets.A,r.bets.B,r.bets.D,r.staked/100,r.returned/100,r.net/100,r.running/100,r.after[0]/100,r.after[1]/100,r.status];rr.outlineLevel=1;rr.hidden=true;}
  }
  output.columns.forEach((col,i)=>{if(i<18)col.width=i===0?23:i===11?25:17;else col.hidden=true;});
  output.sheetProtection={sheet:true,selectLockedCells:true,selectUnlockedCells:true,formatRows:true};
  results.pageSetup.printArea=`A1:D${Math.max(4,results.rowCount)}`;settings.pageSetup.printArea=`A1:${letter(count+1)}${row}`;
  output.views=[{state:'frozen',ySplit:4,zoomScale:85}];output.pageSetup.printArea=`A1:R${savedRow-1}`;
  for(const ws of [settings,output])ws.eachRow({includeEmpty:false},r=>{if(r.number>1)r.eachCell({includeEmpty:false},c=>{if(c.col<=Math.max(ws===settings?count+1:12,1)&&!c.font?.bold){c.font={name:'Aptos',size:11,color:{argb:INK}};if(!c.fill?.fgColor&&r.number%2===0)c.fill={type:'pattern',pattern:'solid',fgColor:{argb:PALE}};}});});
  for(const ws of [results,settings,output])ws.eachRow({includeEmpty:false},r=>r.eachCell({includeEmpty:false},c=>{if(c.col<=(ws===settings?count+1:12))c.font={...c.font,name:'Arial'};}));
  return wb;
}
function expandWorkbook(compact){
  if(!isCompact(compact))return compact;
  const settings=compact.getWorksheet('Configurations');const meta=getLayout(compact);
  if(!meta)throw new Error('Compact workbook layout information is missing. Restore the original workbook before refreshing.');
  const wb=new ExcelJS.Workbook();const guide=wb.addWorksheet('Guide');guide.addRows(meta.guide.slice(1));guide.getCell('B2').value=plain(compact.getWorksheet('Results').getCell('A3'));
  const scenarios=wb.addWorksheet('Scenarios');
  const labelRows=new Map();settings.eachRow({includeEmpty:false},r=>labelRows.set(String(plain(r.getCell(1))),r.number));
  const idRow=labelRows.get('Scenario ID');let count=meta.count;while(count<24&&plain(settings.getCell(idRow,count+2)))count++;
  scenarios.getCell(1,1).value='Setting';scenarios.getCell(2,1).value='Game';
  for(let c=2;c<=count+1;c++){scenarios.getCell(1,c).value=plain(settings.getCell(idRow,c));scenarios.getCell(2,c).value=plain(settings.getCell(meta.maps.Scenarios.rows[2],c));}
  FIELDS.forEach(([key,label],i)=>{const source=labelRows.get(label);if(!source&&!['active','lockStore','drawTrigger'].includes(key))throw new Error(`Missing configuration setting: ${label}`);scenarios.getCell(i+3,1).value=label;for(let c=2;c<=count+1;c++)scenarios.getCell(i+3,c).value=source?plain(settings.getCell(source,c)):key==='drawTrigger'?3:key==='active'&&c===2;});
  const results=compact.getWorksheet('Results'),rounds=wb.addWorksheet('Rounds');results.eachRow({includeEmpty:false},r=>{if(r.number<4)return;for(const [col,destination]of Object.entries(meta.historyCols))rounds.getCell(r.number-3,Number(col)).value=plain(r.getCell(destination));});
  const sectionNames=['Rules','Ladders','Overrides'];for(let i=0;i<sectionNames.length;i++){
    const name=sectionNames[i],sourceRow=labelRows.get(`Advanced: ${name}`);if(!sourceRow)throw new Error(`Missing advanced section: ${name}`);
    const next=sectionNames[i+1],end=next?labelRows.get(`Advanced: ${next}`)-3:settings.rowCount;
    const sheet=wb.addWorksheet(name),columns=name==='Rules'?18:name==='Overrides'?8:4;
    for(let r=sourceRow+1;r<=end;r++)for(let c=1;c<=columns;c++){const value=plain(settings.getCell(r,c));if(value!==null&&value!==undefined&&value!=='')sheet.getCell(r-sourceRow,c).value=value;}
  }
  return wb;
}
module.exports={compactWorkbook,expandWorkbook,isCompact,getLayout,mappedCell};
