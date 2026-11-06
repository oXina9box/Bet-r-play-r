const fs = require('node:fs');
const path = require('node:path');
const Engine = require('../js/engine');
const SicBo = require('../js/games/sicbo');
const { validate } = require('../js/data');

// 1. Collect all unique Sic Bo rolls across betrplayr.json and backups
const dataDir = path.join(__dirname, '..', 'data');
const bpFile = path.join(dataDir, 'betrplayr.json');
const backupsDir = path.join(dataDir, 'backups');

const files = [bpFile];
if (fs.existsSync(backupsDir)) {
  for (const f of fs.readdirSync(backupsDir)) {
    if (f.endsWith('.json')) files.push(path.join(backupsDir, f));
  }
}

const map = new Map();
for (const file of files) {
  try {
    const d = JSON.parse(fs.readFileSync(file, 'utf8'));
    const sb = d.books && d.books['shuff:sicbo'];
    if (sb && sb.entries) {
      for (const e of sb.entries) {
        if (!map.has(e.t)) map.set(e.t, e);
      }
    }
  } catch (err) {
    console.error(`Skipping ${file}: ${err.message}`);
  }
}

const allRolls = Array.from(map.values()).sort((a, b) => a.t - b.t);
console.log(`Found ${allRolls.length} unique Sic Bo rolls in full history.`);

// 2. Backup current betrplayr.json before modifying
const backupTimestamp = Date.now();
const backupFile = path.join(backupsDir, `pre-giant-session-${backupTimestamp}.json`);
fs.copyFileSync(bpFile, backupFile);
console.log(`Backed up betrplayr.json to ${path.basename(backupFile)}`);

// 3. Create 1 giant session in betrplayr.json
const currentBp = JSON.parse(fs.readFileSync(bpFile, 'utf8'));
const giantSessionId = 's_giant_full_history';
const earliestTime = allRolls[0].t;

const giantSession = {
  id: giantSessionId,
  start: earliestTime - 1000,
};

const giantEntries = allRolls.map(e => ({
  t: e.t,
  s: giantSessionId,
  raw: e.raw.slice(),
  cfg: {
    n: 5,
    prog: 'double',
    unit: 1,
    payout: 1,
    waitBust: 0,
    waitWin: 0,
    waitBet: 0,
    recovery: 0,
    fibDrop: 2,
  },
}));

currentBp.books['shuff:sicbo'].sessions = [giantSession];
currentBp.books['shuff:sicbo'].entries = giantEntries;
currentBp.books['shuff:sicbo'].cfg.unit = 1;
currentBp.books['shuff:sicbo'].cfg.payout = 1;

// Validate updated data
const validated = validate(currentBp);
fs.writeFileSync(bpFile, JSON.stringify(validated, null, 2), 'utf8');
console.log(`Updated betrplayr.json with 1 giant session (${giantEntries.length} rolls).`);

// 4. Define the Simulation Runner
function runSimulations(marketName, outcomeFn, prog = 'double') {
  const entries = allRolls.map(r => ({
    t: r.t,
    s: giantSessionId,
    raw: r.raw,
    ...outcomeFn(r.raw),
  }));

  const groups = [5, 6, 7];
  const waitWins = [0, 1, 2, 3];
  const waitBusts = [0, 1, 2, 3];
  const recoveries = [0, 1, 2, 3, 4]; // 0 is flat
  const startRolls = [1, 2, 3, 4, 5]; // offsets 0, 1, 2, 3, 4

  const combos = [];

  for (const n of groups) {
    for (const ww of waitWins) {
      for (const wb of waitBusts) {
        for (const rec of recoveries) {
          const startDetails = [];
          let netSum = 0;
          let wagSum = 0;
          let wonSum = 0;
          let setsSum = 0;
          let bustSum = 0;
          let maxDDSum = 0;
          let peakMaxDD = 0;

          for (const start of startRolls) {
            const sliced = entries.slice(start - 1);
            const cfg = {
              n,
              prog,
              unit: 1,
              payout: 1,
              waitWin: ww,
              waitBust: wb,
              recovery: rec,
            };
            const res = Engine.run(sliced.map(e => ({ ...e, cfg })), cfg);
            const st = Engine.stats(res.rows, n - 1);
            startDetails.push({
              start,
              net: st.net,
              sets: st.sets,
              won: st.won,
              bust: st.bust,
              wagered: st.wagered,
              maxDD: st.maxDD,
              byStep: st.byStep,
            });
            netSum += st.net;
            wagSum += st.wagered;
            wonSum += st.won;
            setsSum += st.sets;
            bustSum += st.bust;
            maxDDSum += st.maxDD;
            peakMaxDD = Math.max(peakMaxDD, st.maxDD);
          }

          const avgNet = netSum / startRolls.length;
          const avgWagered = wagSum / startRolls.length;
          const avgMaxDD = maxDDSum / startRolls.length;
          const winRate = setsSum > 0 ? (wonSum / setsSum) * 100 : 0;
          const minNet = Math.min(...startDetails.map(d => d.net));
          const maxNet = Math.max(...startDetails.map(d => d.net));

          combos.push({
            market: marketName,
            prog,
            group: n,
            waitWin: ww,
            waitBust: wb,
            recovery: rec === 0 ? 'flat' : rec,
            avgNet,
            minNet,
            maxNet,
            avgWagered,
            avgMaxDD,
            peakMaxDD,
            setsSum,
            wonSum,
            bustSum,
            winRate,
            startDetails,
          });
        }
      }
    }
  }
  return combos;
}

// 5. Run simulations across the top 3 betting options
// Option 1: Big / Small (standard Sic Bo even-money, triples lose)
const opt1_BigSmall = runSimulations('Big/Small (1:1 Payout, Triples Lose)', raw => SicBo.outcome(raw), 'double');

// Option 2: Odd / Even (Sic Bo even-money, triples lose)
const opt2_OddEven = runSimulations('Odd/Even (1:1 Payout, Triples Lose)', raw => {
  const total = raw[0] + raw[1] + raw[2];
  const triple = (raw[0] === raw[1] && raw[1] === raw[2]);
  return { side: total % 2 !== 0 ? 'A' : 'B', lossAll: triple, total, triple };
}, 'double');

// Option 3: Big / Small without triple penalty (Pure 50/50 baseline, 1:1 payout)
const opt3_Pure5050 = runSimulations('Pure Even-Money (No Triple Loss)', raw => {
  const total = raw[0] + raw[1] + raw[2];
  return { side: total >= 11 ? 'A' : 'B', lossAll: false, total, triple: false };
}, 'double');

// Option 3b: Single Die Hot Face (1:1 payout when target face appears)
const opt3b_SingleDie = runSimulations('Single Die Focus (Face 4 vs Others, 1:1)', raw => {
  const contains4 = raw.includes(4);
  return { side: contains4 ? 'A' : 'B', lossAll: false, total: raw[0]+raw[1]+raw[2], triple: false };
}, 'double');

const output = {
  totalRolls: allRolls.length,
  giantSessionId,
  markets: {
    bigSmall: opt1_BigSmall,
    oddEven: opt2_OddEven,
    pure5050: opt3_Pure5050,
    singleDie: opt3b_SingleDie,
  },
};

fs.writeFileSync(path.join(__dirname, 'simulation-results.json'), JSON.stringify(output, null, 2), 'utf8');
console.log('Saved simulation results to scripts/simulation-results.json');
