'use strict';

const LANES = ['A', 'B', 'D'];
const ACTIONS = ['hold', 'reset', 'up', 'down', 'multiply', 'add', 'set', 'pause'];
const BASE = [
  ['id', 'Scenario ID'], ['name', 'Scenario name'], ['active', 'Active strategy', [true, false]],
  ['lockStore', 'Lock & store result', [true, false]], ['players', 'Players', [1, 2]],
  ['bankroll1', 'P1 starting cash'], ['bankroll2', 'P2 starting cash'],
  ['unit', 'Dollar value of 1 unit'], ['increment', 'Minimum increment (units)'],
  ['startRound', 'First round'], ['endRound', 'Last round (0 = all)'],
  ['startSide', 'Starting side', ['A', 'B']], ['sideMode', 'Color selection', ['fixed', 'swap1', 'swap2', 'dual', 'trend2', 'cover2', 'cover4', 'cover_quarter', 'momentum']],
  ['drawOwner', 'Draw funded by', ['P1', 'P2', 'split']],
  ['drawMode', 'Draw mode', ['off', 'fixed', 'progression', 'protection', 'high', 'streak', 'cold', 'gap']],
  ['drawTrigger', 'Draw trigger count (rounds/losses)'],
  ['drawThreshold', 'Protect when largest color bet >= units'], ['protectPercent', 'Color exposure protected (%)'],
  ['profitTarget', 'Stop after net profit ($; 0 = off)'], ['lossLimit', 'Stop after net loss ($; 0 = off)'],
  ['oddsA', 'A gross decimal payout'], ['oddsB', 'B gross decimal payout'], ['oddsD', 'Draw/Triple gross decimal payout'],
  ['commissionA', 'A commission (% of profit)'], ['commissionB', 'B commission (% of profit)'],
  ['commissionD', 'Draw/Triple commission (% of profit)'], ['confirmed', 'Payouts confirmed', [true, false]],
];
const LANE = [
  ['enabled', 'Enabled', [true, false]], ['startPaused', 'Start paused', [true, false]], ['initial', 'Starting stake (units)'],
  ['ladder', 'Ladder', ['flat', 'double', 'linear', 'fib', 'gentle', 'partial', 'custom']],
  ['winAction', 'After win', ACTIONS], ['winValue', 'Win action value'],
  ['winPause', 'Pause after win action', [true,false]],
  ['lossAction', 'After loss', ACTIONS], ['lossValue', 'Loss action value'],
  ['lossPause', 'Pause after loss action', [true,false]],
  ['pushAction', 'After push', ACTIONS], ['pushValue', 'Push action value'],
  ['pushPause', 'Pause after push action', [true,false]],
  ['cap', 'Maximum stake (units; 0 = uncapped)'], ['capAction', 'At cap', ['repeat', 'reset', 'pause']],
];
const FIELDS = [...BASE, ...LANES.flatMap(lane => LANE.map(([key, label, values]) =>
  [`${lane}.${key}`, `${lane}: ${label}`, values]))];
const ROW = Object.fromEntries(FIELDS.map(([key], i) => [key, i + 3]));
const RULE_HEADERS = ['Scenario', 'Rule ID', 'Enabled', 'Priority', 'Lane', 'Phase',
  'Source 1', 'Metric 1', 'Operator 1', 'Threshold 1', 'Timing 1',
  'Source 2', 'Metric 2', 'Operator 2', 'Threshold 2', 'Timing 2', 'Action', 'Amount'];
const OVERRIDE_HEADERS = ['Scenario', 'Round key', 'A units', 'B units', 'Draw units',
  'A next step', 'B next step', 'Draw next step'];

function get(config, key) {
  const parts = key.split('.');
  return parts.length === 1 ? config[key] : config.lanes[parts[0]][parts[1]];
}

function set(config, key, value) {
  const parts = key.split('.');
  return parts.length === 1 ? { ...config, [key]: value }
    : { ...config, lanes: { ...config.lanes, [parts[0]]: { ...config.lanes[parts[0]], [parts[1]]: value } } };
}

function presets(defaultScenario, game) {
  const single = ['Flat', 'Martingale', 'Fibonacci', 'Win Press', 'Draw Protection'].map((name, i) => {
    const base = defaultScenario(game);
    const winAction = i === 2 ? 'down' : i >= 3 ? 'up' : i === 1 ? 'reset' : 'hold';
    const lossAction = i === 1 || i === 2 ? 'up' : i >= 3 ? 'reset' : 'hold';
    const ladder = i === 2 ? 'fib' : i === 0 ? 'flat' : 'double';
    return { ...base, id: `S${i + 1}`, name, active: i === 0, lockStore: false, drawTrigger: 3,
      drawMode: i === 4 ? 'protection' : 'off',
      lanes: Object.fromEntries(LANES.map(lane => [lane, { ...base.lanes[lane],
        enabled: lane !== 'D' || i === 4,
        ladder: lane === 'D' ? 'flat' : ladder,
        winAction: lane === 'D' ? 'hold' : winAction,
        lossAction: lane === 'D' ? 'hold' : lossAction,
        winValue: i === 2 ? 2 : 1, lossValue: 1,
        cap: i >= 3 && lane !== 'D' ? 16 : 0,
        capAction: i >= 3 ? 'reset' : 'repeat',
      }])) };
  });
  return single.concat(['2P Split Draw', '2P Cover 2u+', '2P Cover 4u+', '2P Momentum Flip', '2P Dual Ladders'].map((name, i) => {
    const base = defaultScenario(game);
    const color = { enabled:true, ladder:'double', winAction:'up', winValue:1,
      lossAction:'reset', lossValue:1, cap:16, capAction:'reset' };
    return { ...base, id:`S${i + 6}`, name, active:false, lockStore:false, players:2,
      bankroll1:100, bankroll2:100, sideMode:['swap1','cover2','cover4','momentum','dual'][i],
      drawOwner:['split','P1','P1','split','P1'][i], drawMode:'cold', drawTrigger:3,
      lanes:{ A:{...base.lanes.A, ...color}, B:{...base.lanes.B, ...color},
        D:{...base.lanes.D, enabled:true, ladder:'linear', winAction:'down', winValue:1,
          winPause:true, lossAction:'up', lossValue:1, cap:0, capAction:'repeat'} } };
  }));
}

function templateScenario(defaultScenario, game, index) {
  const base = defaultScenario(game);
  return { ...base, id:`S${index}`, name:index > 5 ? `2P New Strategy ${index - 5}` : `1P New Strategy ${index}`,
    players:index > 5 ? 2 : 1, sideMode:index > 5 ? 'dual' : 'fixed',
    active:false, lockStore:false, drawMode:'off', drawTrigger:3 };
}

module.exports = { LANES, ACTIONS, FIELDS, ROW, RULE_HEADERS, OVERRIDE_HEADERS, get, set, presets, templateScenario };
