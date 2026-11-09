'use strict';
// Prefix formula-looking text; numeric results remain numbers when opened in Calc.
function cell(value){
  const safe=typeof value==='string'&&/^[=+\-@\t\r]/.test(value)?`'${value}`:String(value??'');
  return `"${safe.replaceAll('"','""')}"`;
}
function serialize(rows){return rows.map(row=>row.map(cell).join(',')).join('\n')+'\n';}
function ledger(config,result){
  const columns=['Scenario','Round','Round key','Outcome','A units','B units','Draw units','P1 Draw units','P2 Draw units',
    'Staked dollars','Returned dollars','Net dollars','Running dollars','P1 cash dollars','P2 cash dollars','Status','A reason','B reason','Draw reason'];
  return serialize([columns,...result.rows.map(r=>[config.id,r.index,r.key,r.outcome,r.bets.A,r.bets.B,r.bets.D,...r.drawAlloc,
    r.staked/100,r.returned/100,r.net/100,r.running/100,...r.after.map(n=>n/100),r.status,r.reasons.A,r.reasons.B,r.reasons.D])]);
}
module.exports={serialize,ledger};
