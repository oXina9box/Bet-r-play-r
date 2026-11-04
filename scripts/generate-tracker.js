/**
 * Bet-R Play-R: Betting Bankroll Sprint Tracker Spreadsheet Generator (Enhanced v4.0)
 *
 * Dual Currency & Game Classification Architecture:
 * - Dual Currency Support:
 *   - Social Coin (SC): Valued chips equivalent to USD chips (1 SC = $1.00 USD).
 *   - Gold Coin (GC): Non-valued entertainment chips (free-play / VIP grinding).
 * - Currency Segregation: SC real money and GC free play are tracked independently
 *   on the Multi-Sprint Dashboard to prevent corrupting portfolio ROI and financial reporting.
 * - Game Classification: Each session row is classified by exactly ONE game type
 *   and ONE currency type via strict dropdown data validation.
 * - Single or Multi-Game Sprints: Sprints can be dedicated to 1 game (100% Sic Bo, etc.)
 *   or multi-game portfolios (mixing Sic Bo, Teen Patti, Kickoff, Sports, etc.).
 * - Per-Game Performance Breakdown: Calculates sessions, staked, net P/L, win rate, and ROI per game.
 */
const path = require('node:path');
const { execSync } = require('node:child_process');
const ExcelJS = require('exceljs');

const OUTPUT_XLSX = path.join(__dirname, '..', 'Betting_Bankroll_Sprint_Tracker.xlsx');
const OUTPUT_ODS = path.join(__dirname, '..', 'Betting_Bankroll_Sprint_Tracker.ods');

// Slate / Navy Executive Theme Palette
const COLORS = {
  headerBg: 'FF0F172A',      // Slate 900
  headerText: 'FFFFFFFF',
  subHeaderBg: 'FF1E293B',   // Slate 800
  calcHeaderBg: 'FF334155',  // Slate 700
  kpiHeaderBg: 'FF065F46',   // Emerald 800 (SC Real Money)
  kpiBg: 'FFF0FDF4',         // Emerald 50
  kpiBorder: 'FF10B981',     // Emerald 500
  gcHeaderBg: 'FFB45309',    // Amber 700 (GC Gold Coins)
  gcBg: 'FFFEF3C7',          // Amber 50
  statsHeaderBg: 'FF1E3A8A', // Blue 900
  statsBg: 'FFEFF6FF',       // Blue 50
  gameHeaderBg: 'FF4C1D95',  // Purple 900
  gameBg: 'FFF5F3FF',        // Purple 50
  inputFill: 'FFEFF6FF',     // Sky 50 (Editable input cell)
  inputBorder: 'FF60A5FA',   // Sky 400
  tableHeaderBg: 'FF1E293B', // Slate 800
  tableBorder: 'FFCBD5E1',   // Slate 300
  zebraLight: 'FFF8FAFC',    // Slate 50
  zebraWhite: 'FFFFFFFF',
  textMuted: 'FF64748B',     // Slate 500
  textDark: 'FF0F172A',      // Slate 900
  badgeGreenFill: 'FFDCFCE7', // Green 100
  badgeGreenText: 'FF166534', // Green 800
  badgeTealFill: 'FFE0F2FE',  // Sky 100
  badgeTealText: 'FF0369A1',  // Sky 700
  badgeAmberFill: 'FFFEF3C7', // Amber 100
  badgeAmberText: 'FF92400E', // Amber 800
  badgeRedFill: 'FFFEE2E2',   // Red 100
  badgeRedText: 'FF991B1B',   // Red 800
};

const BORDER_THIN = {
  top: { style: 'thin', color: { argb: COLORS.tableBorder } },
  left: { style: 'thin', color: { argb: COLORS.tableBorder } },
  bottom: { style: 'thin', color: { argb: COLORS.tableBorder } },
  right: { style: 'thin', color: { argb: COLORS.tableBorder } },
};

const BORDER_INPUT = {
  top: { style: 'medium', color: { argb: COLORS.inputBorder } },
  left: { style: 'medium', color: { argb: COLORS.inputBorder } },
  bottom: { style: 'medium', color: { argb: COLORS.inputBorder } },
  right: { style: 'medium', color: { argb: COLORS.inputBorder } },
};

const CURRENCY_TYPES = [
  'SC (USD Valued)',
  'GC (Gold Coins - Free Play)',
];

const CURRENCY_DROPDOWN_FORMULA = `"${CURRENCY_TYPES.join(',')}"`;
const CURRENCY_SESSION_DROPDOWN = '"SC,GC"';

const GAME_TYPES = [
  'Sic Bo',
  'Teen Patti',
  'The Kickoff',
  'Baccarat',
  'Blackjack',
  'Roulette',
  'Sports',
  'Other',
];

const GAME_DROPDOWN_FORMULA = `"${GAME_TYPES.join(',')}"`;

function applyCellStyles(cell, {
  val,
  formula,
  result,
  font = {},
  fill = null,
  alignment = {},
  border = BORDER_THIN,
  numFmt = null,
  dataValidation = null,
}) {
  if (formula !== undefined) {
    cell.value = { formula, result };
  } else if (val !== undefined) {
    cell.value = val;
  }

  cell.font = {
    name: 'Calibri',
    size: 10,
    color: { argb: COLORS.textDark },
    ...font,
  };

  if (fill) {
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: fill },
    };
  }

  cell.alignment = {
    vertical: 'middle',
    ...alignment,
  };

  if (border) cell.border = border;
  if (numFmt) cell.numFmt = numFmt;
  if (dataValidation) cell.dataValidation = dataValidation;
}

/**
 * Builds a Sprint Tab with:
 * - Dual Currency Configuration: SC (USD Valued) vs GC (Gold Coins)
 * - 4-way Target Engine (Rows 4-14)
 * - Per-Game Breakdown & Game Discipline Insights (Rows 16-26)
 * - 50-Row Session Performance Log with Currency & Game Classification (Rows 28-79)
 */
function buildSprintSheet(wb, sheetName, opts = {}) {
  const {
    title = 'BET-R PLAY-R // SPRINT BANKROLL TRACKER',
    currencyType = 'SC (USD Valued)',
    startingBankroll = 100.0,
    targetMode = '% Target per Session',
    horizonType = 'By Sessions',
    horizonCount = 20,
    compoundingMethod = 'Compounded',
    inputPct = 0.05,
    inputDollar = 100.0,
    startDate = '2026-11-03',
    endDate = '2026-11-23',
    sampleData = [],
    isTemplate = false,
  } = opts;

  const isGC = currencyType.startsWith('GC');
  const currencyCode = isGC ? 'GC' : 'SC';
  const currencyNumFmt = isGC ? '#,##0 "GC"' : '$#,##0.00';
  const plNumFmt = isGC ? '+#,##0 "GC";[Red]-#,##0 "GC";"-"' : '$#,##0.00;[Red]($#,##0.00);"-"';
  const varNumFmt = isGC ? '+#,##0 "GC";[Red]-#,##0 "GC";0 "GC"' : '+$#,##0.00;[Red]-$#,##0.00;$0.00';

  const ws = wb.addWorksheet(sheetName, {
    views: [{ showGridLines: true, state: 'normal' }],
  });

  // 20 Columns (A to T)
  ws.columns = [
    { width: 11 }, // A: Session #
    { width: 9 },  // B: Day #
    { width: 13 }, // C: Date
    { width: 10 }, // D: Time
    { width: 11 }, // E: Currency (SC / GC)
    { width: 18 }, // F: Game Type (Dropdown)
    { width: 26 }, // G: Market / Wager Details
    { width: 16 }, // H: Start Bankroll
    { width: 16 }, // I: Safe Stake Cap (5%)
    { width: 17 }, // J: Benchmark Target
    { width: 15 }, // K: Target Gain
    { width: 15 }, // L: Actual Stake
    { width: 16 }, // M: End Bankroll
    { width: 16 }, // N: Net P/L
    { width: 14 }, // O: Growth %
    { width: 18 }, // P: Target Status
    { width: 15 }, // Q: Variance
    { width: 16 }, // R: Cumulative P/L
    { width: 14 }, // S: Sprint ROI %
    { width: 34 }, // T: Session Notes / Strategy
  ];

  // Row 1: Title Banner
  ws.mergeCells('A1:T1');
  applyCellStyles(ws.getCell('A1'), {
    val: title,
    font: { size: 14, bold: true, color: { argb: COLORS.headerText } },
    fill: COLORS.headerBg,
    alignment: { horizontal: 'left', indent: 1 },
    border: null,
  });
  ws.getRow(1).height = 36;

  // Row 2: Subtitle
  ws.mergeCells('A2:T2');
  applyCellStyles(ws.getCell('A2'), {
    val: 'Dual Currency & Game Classification: Track either Social Coin (SC, 1 SC = $1.00 USD) or Gold Coin (GC, non-valued chips). Each session is classified by Currency (Col E) and Game (Col F).',
    font: { size: 9.5, italic: true, color: { argb: COLORS.textMuted } },
    fill: COLORS.zebraLight,
    alignment: { horizontal: 'left', indent: 1 },
    border: null,
  });
  ws.getRow(2).height = 20;

  // Row 3: 4 KPI / Goal Headers
  ws.mergeCells('B3:D3');
  applyCellStyles(ws.getCell('B3'), {
    val: '⚙ SPRINT SETUP & CONFIG (INPUTS)',
    font: { bold: true, size: 9.5, color: { argb: COLORS.headerText } },
    fill: COLORS.subHeaderBg,
    alignment: { horizontal: 'center' },
  });

  ws.mergeCells('F3:J3');
  applyCellStyles(ws.getCell('F3'), {
    val: '🎯 EQUATED TARGET GOALS (DUAL-ENGINE OUTPUT)',
    font: { bold: true, size: 9.5, color: { argb: COLORS.headerText } },
    fill: COLORS.calcHeaderBg,
    alignment: { horizontal: 'center' },
  });

  ws.mergeCells('L3:P3');
  applyCellStyles(ws.getCell('L3'), {
    val: isGC ? '🪙 LIVE GC CHIP PERFORMANCE & DRAWDOWN' : '📊 LIVE SC PERFORMANCE & DRAWDOWN',
    font: { bold: true, size: 9.5, color: { argb: COLORS.headerText } },
    fill: isGC ? COLORS.gcHeaderBg : COLORS.kpiHeaderBg,
    alignment: { horizontal: 'center' },
  });

  ws.mergeCells('R3:T3');
  applyCellStyles(ws.getCell('R3'), {
    val: '🏆 WIN/LOSS & PACING',
    font: { bold: true, size: 9.5, color: { argb: COLORS.headerText } },
    fill: COLORS.statsHeaderBg,
    alignment: { horizontal: 'center' },
  });
  ws.getRow(3).height = 24;

  // Configuration & Metric Grid (Rows 4 to 14)
  const gridRows = [
    {
      row: 4,
      bLabel: isGC ? 'Starting Bankroll (GC)' : 'Starting Bankroll ($)',
      bVal: startingBankroll,
      bFmt: currencyNumFmt,
      bIsInput: true,
      fLabel: isGC ? 'Target Final Bankroll (GC)' : 'Target Final Bankroll ($)',
      fFormula: 'IF(D6="% Target per Session", IF(D9="Compounded", D4*(1+D10)^D8, D4*(1+D10*D8)), IF(D6="% Target per Day", IF(D9="Compounded", D4*(1+D10)^D14, D4*(1+D10*D14)), IF(ISNUMBER(SEARCH("Profit", D6)), D4+D11, D11)))',
      fResult: isGC ? startingBankroll * 2 : 265.33,
      fFmt: currencyNumFmt,
      fBold: true,
      lLabel: isGC ? 'Current Bankroll (GC)' : 'Current Bankroll ($)',
      lFormula: 'IF(COUNT(M30:M79)>0, LOOKUP(2, 1/(M30:M79<>""), M30:M79), D4)',
      lResult: sampleData.length > 0 ? sampleData[sampleData.length - 1].end : startingBankroll,
      lFmt: currencyNumFmt,
      lBold: true,
      rLabel: 'Sessions Logged / Left',
      rFormula: 'COUNT(M30:M79) & " / " & MAX(0, D8-COUNT(M30:M79))',
      rResult: `${sampleData.length} / ${Math.max(0, horizonCount - sampleData.length)}`,
      rFmt: '@',
    },
    {
      row: 5,
      bLabel: 'Currency Type',
      bVal: currencyType,
      bValidation: {
        type: 'list',
        allowBlank: false,
        formulae: [CURRENCY_DROPDOWN_FORMULA],
      },
      bIsInput: true,
      fLabel: isGC ? 'Target Total Gain (GC)' : 'Target Total Profit ($)',
      fFormula: 'J4-D4',
      fResult: isGC ? startingBankroll : 165.33,
      fFmt: currencyNumFmt,
      fBold: true,
      lLabel: isGC ? 'Current Net Chip P/L' : 'Current Net Profit / Loss ($)',
      lFormula: 'P4-D4',
      lResult: sampleData.length > 0 ? sampleData[sampleData.length - 1].end - startingBankroll : 0.0,
      lFmt: plNumFmt,
      lBold: true,
      rLabel: 'Win / Loss Record',
      rFormula: 'COUNTIF(N30:N79, ">0") & "W - " & COUNTIF(N30:N79, "<0") & "L"',
      rResult: sampleData.length > 0 ? `${sampleData.filter((s) => s.end > (s.start || startingBankroll)).length}W - ${sampleData.filter((s) => s.end < (s.start || startingBankroll)).length}L` : '0W - 0L',
      rFmt: '@',
    },
    {
      row: 6,
      bLabel: 'Target Mode',
      bVal: targetMode,
      bValidation: {
        type: 'list',
        allowBlank: false,
        formulae: ['"% Target per Session,% Target per Day,Dollar/Coin Profit Target,Target Final Bankroll"'],
      },
      bIsInput: true,
      fLabel: 'Target Total Growth %',
      fFormula: '(J4-D4)/D4',
      fResult: isGC ? 1.0 : 1.6533,
      fFmt: '0.00%',
      fBold: true,
      lLabel: 'Current Sprint ROI %',
      lFormula: '(P4-D4)/D4',
      lResult: sampleData.length > 0 ? (sampleData[sampleData.length - 1].end - startingBankroll) / startingBankroll : 0.0,
      lFmt: '+0.00%;-0.00%;0.00%',
      lBold: true,
      rLabel: 'Session Win Rate %',
      rFormula: 'IF(COUNT(M30:M79)=0, 0, COUNTIF(N30:N79, ">0")/COUNT(M30:M79))',
      rResult: sampleData.length > 0 ? 0.8 : 0.0,
      rFmt: '0.0%',
      rBold: true,
    },
    {
      row: 7,
      bLabel: 'Horizon Type',
      bVal: horizonType,
      bValidation: {
        type: 'list',
        allowBlank: false,
        formulae: ['"By Sessions,By Days"'],
      },
      bIsInput: true,
      fLabel: 'Equated % per Session',
      fFormula: 'IF(D6="% Target per Session", D10, IF(D9="Compounded", (J4/D4)^(1/D8)-1, (J4-D4)/(D4*D8)))',
      fResult: isGC ? 0.0281 : 0.05,
      fFmt: '0.00%',
      fBold: true,
      lLabel: 'Target Progress %',
      lFormula: 'IF(J5=0, 0, (P4-D4)/J5)',
      lResult: sampleData.length > 0 ? 0.1512 : 0.0,
      lFmt: '0.00%',
      lBold: true,
      rLabel: 'Profit Factor',
      rFormula: 'IF(SUMIF(N30:N79, "<0")=0, "Undefeated", ROUND(ABS(SUMIF(N30:N79, ">0")/SUMIF(N30:N79, "<0")), 2))',
      rResult: '8.14',
      rFmt: '@',
      rBold: true,
    },
    {
      row: 8,
      bLabel: 'Target Session Count (N)',
      bVal: horizonCount,
      bFmt: '0',
      bIsInput: true,
      fLabel: 'Equated % per Day',
      fFormula: 'IF(D6="% Target per Day", D10, IF(D9="Compounded", (J4/D4)^(1/D14)-1, (J4-D4)/(D4*D14)))',
      fResult: 0.05,
      fFmt: '0.00%',
      fBold: true,
      lLabel: 'Goal Progress Bar',
      lFormula: 'REPT("█", MIN(12, MAX(0, INT(P7*12)))) & REPT("░", 12 - MIN(12, MAX(0, INT(P7*12)))) & " " & TEXT(P7, "0.0%")',
      lResult: sampleData.length > 0 ? '█░░░░░░░░░░░ 15.1%' : '░░░░░░░░░░░░ 0.0%',
      lFmt: '@',
      rLabel: isGC ? 'Avg Profit on Wins (GC)' : 'Avg Profit on Wins ($)',
      rFormula: 'IF(COUNTIF(N30:N79, ">0")=0, 0, SUMIF(N30:N79, ">0")/COUNTIF(N30:N79, ">0"))',
      rResult: sampleData.length > 0 ? (isGC ? 10000 : 7.13) : 0.0,
      rFmt: currencyNumFmt,
    },
    {
      row: 9,
      bLabel: 'Compounding Method',
      bVal: compoundingMethod,
      bValidation: {
        type: 'list',
        allowBlank: false,
        formulae: ['"Compounded,Simple (Flat)"'],
      },
      bIsInput: true,
      fLabel: isGC ? 'Equated Avg Gain / Session (GC)' : 'Equated Avg $ Gain / Session',
      fFormula: 'J5/D8',
      fResult: isGC ? startingBankroll / horizonCount : 8.27,
      fFmt: currencyNumFmt,
      lLabel: isGC ? 'Remaining to Target (GC)' : 'Remaining to Target ($)',
      lFormula: 'MAX(0, J4-P4)',
      lResult: sampleData.length > 0 ? 140.33 : 165.33,
      lFmt: currencyNumFmt,
      rLabel: isGC ? 'Avg Loss on Losses (GC)' : 'Avg Loss on Losses ($)',
      rFormula: 'IF(COUNTIF(N30:N79, "<0")=0, 0, SUMIF(N30:N79, "<0")/COUNTIF(N30:N79, "<0"))',
      rResult: sampleData.length > 0 ? -3.5 : 0.0,
      rFmt: plNumFmt,
    },
    {
      row: 10,
      bLabel: 'Input Target % Rate',
      bVal: inputPct,
      bFmt: '0.00%',
      bIsInput: true,
      fLabel: isGC ? 'Equated Avg Gain / Day (GC)' : 'Equated Avg $ Gain / Day',
      fFormula: 'J5/D14',
      fResult: 8.27,
      fFmt: currencyNumFmt,
      lLabel: isGC ? 'Peak Bankroll Reached (GC)' : 'Peak Bankroll Reached ($)',
      lFormula: 'MAX(D4, M30:M79)',
      lResult: sampleData.length > 0 ? (isGC ? 270000 : 125.0) : startingBankroll,
      lFmt: currencyNumFmt,
      rLabel: 'Pacing vs Target Curve',
      rFormula: 'IF(P4>=J4, "GOAL HIT 🎯", IF(COUNT(M30:M79)=0, "READY", IF(P4>=INDEX(J30:J79, COUNT(M30:M79)), "AHEAD OF PACE 🚀", "BEHIND PACE ⏳")))',
      rResult: sampleData.length > 0 ? 'BEHIND PACE ⏳' : 'READY',
      rFmt: '@',
      rBold: true,
    },
    {
      row: 11,
      bLabel: isGC ? 'Input Target Coins (GC)' : 'Input Dollar Target ($)',
      bVal: inputDollar,
      bFmt: currencyNumFmt,
      bIsInput: true,
      fLabel: 'Target Multiplier',
      fFormula: 'J4/D4',
      fResult: isGC ? 2.0 : 2.65,
      fFmt: '0.00"x"',
      lLabel: isGC ? 'Max Drawdown from Peak (GC)' : 'Max Drawdown from Peak ($)',
      lFormula: 'MAX(0, P10-P4)',
      lResult: 0.0,
      lFmt: plNumFmt,
      rLabel: 'Active Sprint Horizon',
      rFormula: 'D8 & " Sessions (" & D14 & " Days)"',
      rResult: `${horizonCount} Sessions (20 Days)`,
      rFmt: '@',
    },
    {
      row: 12,
      bLabel: 'Sprint Start Date',
      bVal: startDate,
      bFmt: 'YYYY-MM-DD',
      bIsInput: true,
      fLabel: 'Standard 1-Unit Stake (1%)',
      fFormula: 'D4*0.01',
      fResult: startingBankroll * 0.01,
      fFmt: currencyNumFmt,
      lLabel: 'Max Drawdown %',
      lFormula: 'IF(P10>0, (P10-P4)/P10, 0)',
      lResult: 0.0,
      lFmt: '0.00%',
      rLabel: 'Growth Structure',
      rFormula: 'D9',
      rResult: compoundingMethod,
      rFmt: '@',
    },
    {
      row: 13,
      bLabel: 'Sprint Target End Date',
      bVal: endDate,
      bFmt: 'YYYY-MM-DD',
      bIsInput: true,
      fLabel: 'Safe Session Risk Cap (5%)',
      fFormula: 'D4*0.05',
      fResult: startingBankroll * 0.05,
      fFmt: currencyNumFmt,
      lLabel: 'Required Remaining Pace',
      lFormula: 'IF(OR(MAX(0, D8-COUNT(M30:M79))<=0, P4<=0), 0, IF(P4>=J4, 0, (J4/P4)^(1/MAX(1, D8-COUNT(M30:M79)))-1))',
      lResult: sampleData.length > 0 ? 0.0519 : 0.05,
      lFmt: '0.00%',
      lBold: true,
      rLabel: 'Target Engine Mode',
      rFormula: 'D6',
      rResult: targetMode,
      rFmt: '@',
    },
    {
      row: 14,
      bLabel: 'Target Calendar Days',
      bFormula: 'MAX(1, DATEVALUE(D13) - DATEVALUE(D12))',
      bResult: 20,
      bFmt: '0',
      bIsInput: false,
      fLabel: 'Active Currency & Valuation',
      fFormula: 'IF(LEFT(D5,2)="GC", "GC (Gold Coins - Free Play / No Cash Value)", "SC ($1.00 USD Valued Chips)")',
      fResult: isGC ? 'GC (Gold Coins - Free Play / No Cash Value)' : 'SC ($1.00 USD Valued Chips)',
      fFmt: '@',
      lLabel: 'Currency Mode Indicator',
      lFormula: 'LEFT(D5, 2)',
      lResult: currencyCode,
      lFmt: '@',
      lBold: true,
      rLabel: 'Currency Unit Label',
      rFormula: 'IF(LEFT(D5,2)="GC", "GC Chips", "USD ($)")',
      rResult: isGC ? 'GC Chips' : 'USD ($)',
      rFmt: '@',
    },
  ];

  gridRows.forEach((r) => {
    ws.getRow(r.row).height = 20;

    // Block 1: Setup (B:C label, D value)
    ws.mergeCells(`B${r.row}:C${r.row}`);
    applyCellStyles(ws.getCell(`B${r.row}`), {
      val: r.bLabel,
      font: { bold: true, size: 9.5, color: { argb: COLORS.textDark } },
      fill: COLORS.zebraLight,
      alignment: { horizontal: 'left' },
    });

    if (r.bFormula) {
      applyCellStyles(ws.getCell(`D${r.row}`), {
        formula: r.bFormula,
        result: r.bResult,
        font: { bold: true, size: 9.5, color: { argb: COLORS.textDark } },
        fill: COLORS.zebraLight,
        alignment: { horizontal: 'right' },
        numFmt: r.bFmt,
      });
    } else {
      applyCellStyles(ws.getCell(`D${r.row}`), {
        val: r.bVal,
        font: { bold: true, size: 9.5, color: { argb: COLORS.textDark } },
        fill: r.bIsInput ? COLORS.inputFill : COLORS.zebraWhite,
        border: r.bIsInput ? BORDER_INPUT : BORDER_THIN,
        alignment: { horizontal: 'right' },
        numFmt: r.bFmt,
        dataValidation: r.bValidation,
      });
    }

    // Block 2: Equated Target Goals (F:I label, J value)
    ws.mergeCells(`F${r.row}:I${r.row}`);
    applyCellStyles(ws.getCell(`F${r.row}`), {
      val: r.fLabel,
      font: { size: 9.5, color: { argb: COLORS.textDark } },
      fill: COLORS.zebraLight,
      alignment: { horizontal: 'left' },
    });

    applyCellStyles(ws.getCell(`J${r.row}`), {
      formula: r.fFormula,
      result: r.fResult,
      font: { bold: !!r.fBold, size: 9.5, color: { argb: COLORS.textDark } },
      fill: COLORS.zebraWhite,
      alignment: { horizontal: 'right' },
      numFmt: r.fFmt,
    });

    // Block 3: Live Pacing & Drawdown (L:O label, P value)
    ws.mergeCells(`L${r.row}:O${r.row}`);
    applyCellStyles(ws.getCell(`L${r.row}`), {
      val: r.lLabel,
      font: { size: 9.5, color: { argb: COLORS.textDark } },
      fill: isGC ? COLORS.gcBg : COLORS.kpiBg,
      alignment: { horizontal: 'left' },
    });

    applyCellStyles(ws.getCell(`P${r.row}`), {
      formula: r.lFormula,
      result: r.lResult,
      font: { bold: !!r.lBold, size: 9.5, color: { argb: COLORS.textDark } },
      fill: COLORS.zebraWhite,
      alignment: { horizontal: 'right' },
      numFmt: r.lFmt,
    });

    // Block 4: Win/Loss Stats (R:S label, T value)
    ws.mergeCells(`R${r.row}:S${r.row}`);
    applyCellStyles(ws.getCell(`R${r.row}`), {
      val: r.rLabel,
      font: { size: 9, color: { argb: COLORS.textDark } },
      fill: COLORS.statsBg,
      alignment: { horizontal: 'left' },
    });

    applyCellStyles(ws.getCell(`T${r.row}`), {
      formula: r.rFormula,
      result: r.rResult,
      font: { bold: !!r.rBold, size: 9.5, color: { argb: COLORS.textDark } },
      fill: COLORS.zebraWhite,
      alignment: { horizontal: 'right' },
      numFmt: r.rFmt,
    });
  });

  // SECTION 2: PER-GAME PERFORMANCE BREAKDOWN (Rows 16 to 26)
  ws.mergeCells('B16:J16');
  applyCellStyles(ws.getCell('B16'), {
    val: isGC
      ? '🪙 PER-GAME SPRINT PERFORMANCE BREAKDOWN (GOLD COIN CHIPS - SINGLE OR MULTI-GAME)'
      : '🎮 PER-GAME SPRINT PERFORMANCE BREAKDOWN (SOCIAL COIN USD - SINGLE OR MULTI-GAME)',
    font: { size: 9.5, bold: true, color: { argb: COLORS.headerText } },
    fill: isGC ? COLORS.gcHeaderBg : COLORS.gameHeaderBg,
    alignment: { horizontal: 'left', indent: 1 },
    border: null,
  });

  ws.mergeCells('L16:T16');
  applyCellStyles(ws.getCell('L16'), {
    val: '🎯 SPRINT DUAL CURRENCY & CLASSIFICATION RULES',
    font: { size: 9.5, bold: true, color: { argb: COLORS.headerText } },
    fill: COLORS.calcHeaderBg,
    alignment: { horizontal: 'left', indent: 1 },
    border: null,
  });
  ws.getRow(16).height = 22;

  // Breakdown Table Headers (Row 17)
  const breakdownHeaders = [
    { col: 'B', text: 'Game Classification' },
    { col: 'D', text: 'Curr' },
    { col: 'E', text: 'Sessions' },
    { col: 'F', text: isGC ? 'Total Staked (GC)' : 'Total Staked ($)' },
    { col: 'G', text: isGC ? 'Net P/L (GC)' : 'Net P/L ($)' },
    { col: 'H', text: 'Win Rate %' },
    { col: 'I', text: 'ROI on Stake %' },
    { col: 'J', text: 'Performance Status' },
  ];

  ws.mergeCells('B17:C17');
  applyCellStyles(ws.getCell('B17'), {
    val: 'Game Classification',
    font: { bold: true, size: 9, color: { argb: COLORS.headerText } },
    fill: COLORS.tableHeaderBg,
    alignment: { horizontal: 'left', indent: 1 },
  });

  breakdownHeaders.slice(1).forEach((bh) => {
    applyCellStyles(ws.getCell(`${bh.col}17`), {
      val: bh.text,
      font: { bold: true, size: 9, color: { argb: COLORS.headerText } },
      fill: COLORS.tableHeaderBg,
      alignment: { horizontal: 'center' },
    });
  });

  // Insights Headers
  ws.mergeCells('L17:N17');
  applyCellStyles(ws.getCell('L17'), {
    val: 'Allocation Metric',
    font: { bold: true, size: 9, color: { argb: COLORS.headerText } },
    fill: COLORS.tableHeaderBg,
    alignment: { horizontal: 'left', indent: 1 },
  });

  ws.mergeCells('O17:T17');
  applyCellStyles(ws.getCell('O17'), {
    val: 'Sprint Breakdown Status / Analysis',
    font: { bold: true, size: 9, color: { argb: COLORS.headerText } },
    fill: COLORS.tableHeaderBg,
    alignment: { horizontal: 'left', indent: 1 },
  });
  ws.getRow(17).height = 22;

  // 8 Game Rows (Rows 18 to 25)
  GAME_TYPES.forEach((game, idx) => {
    const r = 18 + idx;
    const isEven = idx % 2 === 0;
    const fill = isEven ? COLORS.zebraLight : COLORS.zebraWhite;
    ws.getRow(r).height = 20;

    ws.mergeCells(`B${r}:C${r}`);
    applyCellStyles(ws.getCell(`B${r}`), {
      val: game,
      font: { bold: true, size: 9.5 },
      fill,
      alignment: { horizontal: 'left', indent: 1 },
    });

    // D: Currency Code
    applyCellStyles(ws.getCell(`D${r}`), {
      formula: 'LEFT(D$5, 2)',
      result: currencyCode,
      font: { size: 9, bold: true, color: { argb: COLORS.textMuted } },
      fill,
      alignment: { horizontal: 'center' },
      numFmt: '@',
    });

    // E: Sessions Played
    applyCellStyles(ws.getCell(`E${r}`), {
      formula: `COUNTIF(F$30:F$79, B${r})`,
      font: { size: 9.5 },
      fill,
      alignment: { horizontal: 'center' },
      numFmt: '0',
    });

    // F: Total Staked
    applyCellStyles(ws.getCell(`F${r}`), {
      formula: `SUMIF(F$30:F$79, B${r}, L$30:L$79)`,
      font: { size: 9.5 },
      fill,
      alignment: { horizontal: 'right' },
      numFmt: currencyNumFmt,
    });

    // G: Net P/L
    applyCellStyles(ws.getCell(`G${r}`), {
      formula: `SUMIF(F$30:F$79, B${r}, N$30:N$79)`,
      font: { bold: true, size: 9.5 },
      fill,
      alignment: { horizontal: 'right' },
      numFmt: plNumFmt,
    });

    // H: Win Rate %
    applyCellStyles(ws.getCell(`H${r}`), {
      formula: `IF(E${r}=0, 0, COUNTIFS(F$30:F$79, B${r}, N$30:N$79, ">0") / E${r})`,
      font: { size: 9.5 },
      fill,
      alignment: { horizontal: 'right' },
      numFmt: '0.0%',
    });

    // I: ROI on Stake %
    applyCellStyles(ws.getCell(`I${r}`), {
      formula: `IF(F${r}=0, 0, G${r} / F${r})`,
      font: { size: 9.5 },
      fill,
      alignment: { horizontal: 'right' },
      numFmt: '+0.00%;-0.00%;0.00%',
    });

    // J: Status
    applyCellStyles(ws.getCell(`J${r}`), {
      formula: `IF(E${r}=0, "No Sessions", IF(G${r}>0, "PROFITABLE ✅", IF(G${r}=0, "BREAK-EVEN ⚖", "IN DRAWDOWN 🔻")))`,
      font: { bold: true, size: 9 },
      fill,
      alignment: { horizontal: 'center' },
    });
  });

  // Row 26: Total (All Games)
  ws.getRow(26).height = 22;
  ws.mergeCells('B26:C26');
  applyCellStyles(ws.getCell('B26'), {
    val: 'TOTAL (ALL GAMES)',
    font: { bold: true, size: 9.5, color: { argb: COLORS.textDark } },
    fill: isGC ? COLORS.gcBg : COLORS.kpiBg,
    alignment: { horizontal: 'left', indent: 1 },
  });

  applyCellStyles(ws.getCell('D26'), {
    formula: 'LEFT(D$5, 2)',
    result: currencyCode,
    font: { bold: true, size: 9 },
    fill: isGC ? COLORS.gcBg : COLORS.kpiBg,
    alignment: { horizontal: 'center' },
  });

  applyCellStyles(ws.getCell('E26'), {
    formula: 'SUM(E18:E25)',
    font: { bold: true, size: 9.5 },
    fill: isGC ? COLORS.gcBg : COLORS.kpiBg,
    alignment: { horizontal: 'center' },
    numFmt: '0',
  });

  applyCellStyles(ws.getCell('F26'), {
    formula: 'SUM(F18:F25)',
    font: { bold: true, size: 9.5 },
    fill: isGC ? COLORS.gcBg : COLORS.kpiBg,
    alignment: { horizontal: 'right' },
    numFmt: currencyNumFmt,
  });

  applyCellStyles(ws.getCell('G26'), {
    formula: 'SUM(G18:G25)',
    font: { bold: true, size: 9.5 },
    fill: isGC ? COLORS.gcBg : COLORS.kpiBg,
    alignment: { horizontal: 'right' },
    numFmt: plNumFmt,
  });

  applyCellStyles(ws.getCell('H26'), {
    formula: 'IF(E26=0, 0, COUNTIF(N$30:N$79, ">0") / E26)',
    font: { bold: true, size: 9.5 },
    fill: isGC ? COLORS.gcBg : COLORS.kpiBg,
    alignment: { horizontal: 'right' },
    numFmt: '0.0%',
  });

  applyCellStyles(ws.getCell('I26'), {
    formula: 'IF(F26=0, 0, G26 / F26)',
    font: { bold: true, size: 9.5 },
    fill: isGC ? COLORS.gcBg : COLORS.kpiBg,
    alignment: { horizontal: 'right' },
    numFmt: '+0.00%;-0.00%;0.00%',
  });

  applyCellStyles(ws.getCell('J26'), {
    formula: 'IF(E26=0, "No Sessions", IF(G26>0, "PROFITABLE ✅", IF(G26=0, "BREAK-EVEN ⚖", "IN DRAWDOWN 🔻")))',
    font: { bold: true, size: 9 },
    fill: isGC ? COLORS.gcBg : COLORS.kpiBg,
    alignment: { horizontal: 'center' },
  });

  // Insights on the Right (Rows 18 to 26, Columns L to T)
  const insights = [
    { row: 18, label: 'Sprint Game Scope', formula: 'IF(E26=0, "Ready for First Session", IF(MAX(E18:E25)=E26, "Single-Game Dedicated (" & INDEX(B18:B25, MATCH(MAX(E18:E25), E18:E25, 0)) & ")", "Multi-Game Portfolio (" & COUNTIF(E18:E25, ">0") & " Game Types Active)"))', isBold: true },
    { row: 19, label: 'Most Active Game', formula: 'IF(E26=0, "None", INDEX(B18:B25, MATCH(MAX(E18:E25), E18:E25, 0)) & " (" & MAX(E18:E25) & " sessions)")', isBold: false },
    { row: 20, label: 'Highest Profit Game', formula: `IF(E26=0, "None", INDEX(B18:B25, MATCH(MAX(G18:G25), G18:G25, 0)) & " (" & IF(LEFT(D$5,2)="GC", TEXT(MAX(G18:G25), "#,##0") & " GC", TEXT(MAX(G18:G25), "$#,##0.00")) & ")")`, isBold: true },
    { row: 21, label: 'Currency Classification', formula: 'IF(LEFT(D5,2)="GC", "Gold Coin (GC) - Non-Valued Entertainment Chips", "Social Coin (SC) - 1 SC = $1.00 USD Valued Chips")', isBold: true },
    { row: 22, label: 'Classification Rule', val: '1 Currency & 1 Game per session strictly enforced.', isBold: false },
  ];

  insights.forEach((ins) => {
    ws.mergeCells(`L${ins.row}:N${ins.row}`);
    applyCellStyles(ws.getCell(`L${ins.row}`), {
      val: ins.label,
      font: { bold: true, size: 9, color: { argb: COLORS.textDark } },
      fill: COLORS.zebraLight,
      alignment: { horizontal: 'left', indent: 1 },
    });

    ws.mergeCells(`O${ins.row}:T${ins.row}`);
    applyCellStyles(ws.getCell(`O${ins.row}`), {
      val: ins.val,
      formula: ins.formula,
      font: { bold: !!ins.isBold, size: 9.5, color: { argb: COLORS.textDark } },
      fill: COLORS.zebraWhite,
      alignment: { horizontal: 'left', indent: 1 },
      numFmt: '@',
    });
  });

  // Multi-line guidance card in rows 23-26
  ws.mergeCells('L23:T26');
  applyCellStyles(ws.getCell('L23'), {
    val: '💡 DUAL CURRENCY & GAME CLASSIFICATION INSTRUCTIONS:\n• Currency: Choose "SC (USD Valued)" for cash chips ($1.00 USD) or "GC (Gold Coins)" for free play.\n• Dropdowns: Column E enforces Currency (SC or GC) and Column F enforces Game Type per session.\n• Flexibility: Sprints can be 100% dedicated to 1 game (e.g. Sic Bo) or mixed across multiple games.\n• Independent Portfolios: SC USD and GC chips are tracked separately on the Multi-Sprint Dashboard.',
    font: { size: 8.5, color: { argb: COLORS.textDark } },
    fill: isGC ? COLORS.gcBg : COLORS.gameBg,
    border: BORDER_INPUT,
    alignment: { horizontal: 'left', vertical: 'top', wrapText: true },
  });

  // Row 28: Session Log Section Banner
  ws.mergeCells('A28:T28');
  applyCellStyles(ws.getCell('A28'), {
    val: 'SESSION PERFORMANCE LOG // Classified by Currency (Col E) and Game (Col F). Starting Bankroll, Safe Cap (5%), Benchmarks, P/L, Growth %, and Status calculate automatically.',
    font: { size: 9, bold: true, color: { argb: COLORS.headerText } },
    fill: COLORS.headerBg,
    alignment: { horizontal: 'left', indent: 1 },
    border: null,
  });
  ws.getRow(28).height = 22;

  // Row 29: Table Headers (A to T)
  const tableHeaders = [
    { col: 'A', text: 'Session #' },
    { col: 'B', text: 'Day #' },
    { col: 'C', text: 'Date' },
    { col: 'D', text: 'Time' },
    { col: 'E', text: 'Currency' },
    { col: 'F', text: 'Game Type' },
    { col: 'G', text: 'Market / Wager Details' },
    { col: 'H', text: isGC ? 'Start Bankroll (GC)' : 'Start Bankroll ($)' },
    { col: 'I', text: 'Safe Cap (5%)' },
    { col: 'J', text: isGC ? 'Benchmark (GC)' : 'Benchmark Target ($)' },
    { col: 'K', text: isGC ? 'Target Gain (GC)' : 'Target $ Gain' },
    { col: 'L', text: isGC ? 'Actual Stake (GC)' : 'Actual Stake ($)' },
    { col: 'M', text: isGC ? 'End Bankroll (GC)' : 'End Bankroll ($)' },
    { col: 'N', text: isGC ? 'Net P/L (GC)' : 'Net P/L ($)' },
    { col: 'O', text: 'Growth %' },
    { col: 'P', text: 'Target Status' },
    { col: 'Q', text: isGC ? 'Variance (GC)' : 'Variance ($)' },
    { col: 'R', text: isGC ? 'Cum. P/L (GC)' : 'Cumulative P/L ($)' },
    { col: 'S', text: 'Sprint ROI %' },
    { col: 'T', text: 'Session Notes / Strategy / Discipline' },
  ];

  tableHeaders.forEach((th) => {
    applyCellStyles(ws.getCell(`${th.col}29`), {
      val: th.text,
      font: { bold: true, size: 9.5, color: { argb: COLORS.headerText } },
      fill: COLORS.tableHeaderBg,
      alignment: { horizontal: 'center', wrapText: true },
    });
  });
  ws.getRow(29).height = 28;

  // 50 Session Rows (Row 30 to Row 79)
  for (let i = 1; i <= 50; i++) {
    const rowNum = 29 + i;
    const isEven = i % 2 === 0;
    const rowFill = isEven ? COLORS.zebraLight : COLORS.zebraWhite;
    const sample = sampleData[i - 1];

    ws.getRow(rowNum).height = 20;

    // A: Session #
    applyCellStyles(ws.getCell(`A${rowNum}`), {
      val: i,
      font: { bold: true, size: 9.5 },
      fill: rowFill,
      alignment: { horizontal: 'center' },
      numFmt: '0',
    });

    // B: Sprint Day #
    applyCellStyles(ws.getCell(`B${rowNum}`), {
      formula: `IF(C${rowNum}="","", DATEVALUE(C${rowNum}) - DATEVALUE(D$12) + 1)`,
      result: sample ? sample.dayNum : null,
      font: { size: 9.5, color: { argb: COLORS.textMuted } },
      fill: rowFill,
      alignment: { horizontal: 'center' },
      numFmt: '0',
    });

    // C: Date (Editable)
    applyCellStyles(ws.getCell(`C${rowNum}`), {
      val: sample ? sample.date : '',
      fill: sample ? rowFill : COLORS.inputFill,
      border: sample ? BORDER_THIN : BORDER_INPUT,
      alignment: { horizontal: 'center' },
      numFmt: 'YYYY-MM-DD',
    });

    // D: Time (Editable)
    applyCellStyles(ws.getCell(`D${rowNum}`), {
      val: sample ? sample.time : '',
      fill: sample ? rowFill : COLORS.inputFill,
      border: sample ? BORDER_THIN : BORDER_INPUT,
      alignment: { horizontal: 'center' },
      numFmt: 'HH:MM',
    });

    // E: Currency (Strict Dropdown Validation: SC or GC)
    applyCellStyles(ws.getCell(`E${rowNum}`), {
      val: sample ? (sample.currency || currencyCode) : (isTemplate ? '' : currencyCode),
      font: { bold: true, size: 9.5 },
      fill: sample ? rowFill : COLORS.inputFill,
      border: sample ? BORDER_THIN : BORDER_INPUT,
      alignment: { horizontal: 'center' },
      dataValidation: {
        type: 'list',
        allowBlank: true,
        formulae: [CURRENCY_SESSION_DROPDOWN],
      },
    });

    // F: Game Type (Strict 1-Game Dropdown Validation)
    applyCellStyles(ws.getCell(`F${rowNum}`), {
      val: sample ? sample.game : '',
      font: { bold: true, size: 9.5 },
      fill: sample ? rowFill : COLORS.inputFill,
      border: sample ? BORDER_THIN : BORDER_INPUT,
      alignment: { horizontal: 'center' },
      dataValidation: {
        type: 'list',
        allowBlank: true,
        formulae: [GAME_DROPDOWN_FORMULA],
      },
    });

    // G: Market / Wager Details (Editable)
    applyCellStyles(ws.getCell(`G${rowNum}`), {
      val: sample ? sample.market : '',
      fill: sample ? rowFill : COLORS.inputFill,
      border: sample ? BORDER_THIN : BORDER_INPUT,
      alignment: { horizontal: 'left' },
    });

    // H: Starting Bankroll
    const startFormula = i === 1 ? 'D$4' : `IF(M${rowNum - 1}="","", M${rowNum - 1})`;
    applyCellStyles(ws.getCell(`H${rowNum}`), {
      formula: startFormula,
      font: { size: 9.5 },
      fill: rowFill,
      alignment: { horizontal: 'right' },
      numFmt: currencyNumFmt,
    });

    // I: Safe Stake Cap (5%)
    applyCellStyles(ws.getCell(`I${rowNum}`), {
      formula: `IF(H${rowNum}="","", H${rowNum}*0.05)`,
      font: { size: 9, color: { argb: COLORS.textMuted } },
      fill: rowFill,
      alignment: { horizontal: 'right' },
      numFmt: currencyNumFmt,
    });

    // J: Benchmark Target
    applyCellStyles(ws.getCell(`J${rowNum}`), {
      formula: `IF(D$9="Compounded", D$4*(1+J$7)^A${rowNum}, D$4+(D$4*J$7*A${rowNum}))`,
      font: { size: 9.5, color: { argb: COLORS.textMuted } },
      fill: rowFill,
      alignment: { horizontal: 'right' },
      numFmt: currencyNumFmt,
    });

    // K: Target Gain
    const targetGainFormula =
      i === 1 ? `IF(J${rowNum}="","", J${rowNum}-D$4)` : `IF(J${rowNum}="","", J${rowNum}-J${rowNum - 1})`;
    applyCellStyles(ws.getCell(`K${rowNum}`), {
      formula: targetGainFormula,
      font: { size: 9, color: { argb: COLORS.textMuted } },
      fill: rowFill,
      alignment: { horizontal: 'right' },
      numFmt: currencyNumFmt,
    });

    // L: Actual Stake (Editable)
    applyCellStyles(ws.getCell(`L${rowNum}`), {
      val: sample ? sample.stake : null,
      fill: sample ? rowFill : COLORS.inputFill,
      border: sample ? BORDER_THIN : BORDER_INPUT,
      alignment: { horizontal: 'right' },
      numFmt: currencyNumFmt,
    });

    // M: Ending Bankroll (Editable - Primary User Input)
    applyCellStyles(ws.getCell(`M${rowNum}`), {
      val: sample ? sample.end : null,
      font: { bold: true, size: 9.5 },
      fill: sample ? rowFill : COLORS.inputFill,
      border: sample ? BORDER_THIN : BORDER_INPUT,
      alignment: { horizontal: 'right' },
      numFmt: currencyNumFmt,
    });

    // N: Net P/L
    applyCellStyles(ws.getCell(`N${rowNum}`), {
      formula: `IF(OR(M${rowNum}="", H${rowNum}=""), "", M${rowNum}-H${rowNum})`,
      font: { bold: true, size: 9.5 },
      fill: rowFill,
      alignment: { horizontal: 'right' },
      numFmt: plNumFmt,
    });

    // O: Growth %
    applyCellStyles(ws.getCell(`O${rowNum}`), {
      formula: `IF(OR(M${rowNum}="", H${rowNum}="", H${rowNum}=0), "", (M${rowNum}-H${rowNum})/H${rowNum})`,
      font: { size: 9.5 },
      fill: rowFill,
      alignment: { horizontal: 'right' },
      numFmt: '+0.00%;-0.00%;0.00%',
    });

    // P: Target Status (4 states)
    applyCellStyles(ws.getCell(`P${rowNum}`), {
      formula: `IF(M${rowNum}="","", IF(M${rowNum}>=J${rowNum}, "EXCEEDED TARGET", IF(N${rowNum}>0, "PROFITABLE", IF(N${rowNum}=0, "BREAK-EVEN", "MISSED TARGET"))))`,
      font: { bold: true, size: 9 },
      fill: rowFill,
      alignment: { horizontal: 'center' },
    });

    // Q: Variance vs Target
    applyCellStyles(ws.getCell(`Q${rowNum}`), {
      formula: `IF(OR(M${rowNum}="", K${rowNum}=""), "", N${rowNum}-K${rowNum})`,
      font: { size: 9.5 },
      fill: rowFill,
      alignment: { horizontal: 'right' },
      numFmt: varNumFmt,
    });

    // R: Cumulative P/L
    applyCellStyles(ws.getCell(`R${rowNum}`), {
      formula: `IF(M${rowNum}="","", M${rowNum}-D$4)`,
      font: { bold: true, size: 9.5 },
      fill: rowFill,
      alignment: { horizontal: 'right' },
      numFmt: plNumFmt,
    });

    // S: Sprint ROI %
    applyCellStyles(ws.getCell(`S${rowNum}`), {
      formula: `IF(M${rowNum}="","", (M${rowNum}-D$4)/D$4)`,
      font: { bold: true, size: 9.5 },
      fill: rowFill,
      alignment: { horizontal: 'right' },
      numFmt: '+0.00%;-0.00%;0.00%',
    });

    // T: Notes (Editable)
    applyCellStyles(ws.getCell(`T${rowNum}`), {
      val: sample ? sample.notes : '',
      fill: sample ? rowFill : COLORS.inputFill,
      border: sample ? BORDER_THIN : BORDER_INPUT,
      alignment: { horizontal: 'left' },
    });
  }

  // Conditional Formatting
  ws.addConditionalFormatting({
    ref: 'N30:N79',
    rules: [
      {
        type: 'cellIs',
        operator: 'greaterThan',
        formulae: ['0'],
        style: {
          fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: COLORS.badgeGreenFill } },
          font: { color: { argb: COLORS.badgeGreenText }, bold: true },
        },
      },
      {
        type: 'cellIs',
        operator: 'lessThan',
        formulae: ['0'],
        style: {
          fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: COLORS.badgeRedFill } },
          font: { color: { argb: COLORS.badgeRedText }, bold: true },
        },
      },
    ],
  });

  ws.addConditionalFormatting({
    ref: 'O30:O79',
    rules: [
      {
        type: 'cellIs',
        operator: 'greaterThan',
        formulae: ['0'],
        style: { font: { color: { argb: COLORS.badgeGreenText }, bold: true } },
      },
      {
        type: 'cellIs',
        operator: 'lessThan',
        formulae: ['0'],
        style: { font: { color: { argb: COLORS.badgeRedText }, bold: true } },
      },
    ],
  });

  ws.addConditionalFormatting({
    ref: 'P30:P79',
    rules: [
      {
        type: 'cellIs',
        operator: 'equal',
        formulae: ['"EXCEEDED TARGET"'],
        style: {
          fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: COLORS.badgeGreenFill } },
          font: { color: { argb: COLORS.badgeGreenText }, bold: true },
        },
      },
      {
        type: 'cellIs',
        operator: 'equal',
        formulae: ['"PROFITABLE"'],
        style: {
          fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: COLORS.badgeTealFill } },
          font: { color: { argb: COLORS.badgeTealText }, bold: true },
        },
      },
      {
        type: 'cellIs',
        operator: 'equal',
        formulae: ['"BREAK-EVEN"'],
        style: {
          fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: COLORS.badgeAmberFill } },
          font: { color: { argb: COLORS.badgeAmberText }, bold: true },
        },
      },
      {
        type: 'cellIs',
        operator: 'equal',
        formulae: ['"MISSED TARGET"'],
        style: {
          fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: COLORS.badgeRedFill } },
          font: { color: { argb: COLORS.badgeRedText }, bold: true },
        },
      },
    ],
  });
}

/**
 * Builds the Multi-Sprint Portfolio Dashboard with Dual Currency Architecture:
 * - Real-Money Social Coin (SC) Portfolio Cards (USD)
 * - Free-Play Gold Coin (GC) Portfolio Cards (Entertainment Chips)
 * - Cross-Sprint Game Breakdown segregating SC Staked/PL from GC Staked/PL
 */
function buildDashboardSheet(wb) {
  const ws = wb.addWorksheet('Multi-Sprint Dashboard', {
    views: [{ showGridLines: true, state: 'normal' }],
  });

  ws.columns = [
    { width: 11 }, // A: Sprint #
    { width: 24 }, // B: Sprint Tab / Name
    { width: 22 }, // C: Currency Type
    { width: 18 }, // D: Start Bankroll
    { width: 22 }, // E: Target Mode
    { width: 20 }, // F: Target Final
    { width: 18 }, // G: Current Bankroll
    { width: 18 }, // H: Net Profit / Loss
    { width: 16 }, // I: Sprint ROI %
    { width: 16 }, // J: Goal Progress %
    { width: 16 }, // K: Sessions Logged
    { width: 16 }, // L: Win Rate %
    { width: 20 }, // M: Sprint Status
  ];

  // Banner
  ws.mergeCells('A1:M1');
  applyCellStyles(ws.getCell('A1'), {
    val: 'BET-R PLAY-R // MULTI-SPRINT PORTFOLIO DASHBOARD (DUAL CURRENCY)',
    font: { size: 14, bold: true, color: { argb: COLORS.headerText } },
    fill: COLORS.headerBg,
    alignment: { horizontal: 'left', indent: 1 },
    border: null,
  });
  ws.getRow(1).height = 36;

  ws.mergeCells('A2:M2');
  applyCellStyles(ws.getCell('A2'), {
    val: 'High-level aggregation of all bankroll challenges. Dual-currency segregation separates real-money SC from free-play GC chips.',
    font: { size: 9.5, italic: true, color: { argb: COLORS.textMuted } },
    fill: COLORS.zebraLight,
    alignment: { horizontal: 'left', indent: 1 },
    border: null,
  });
  ws.getRow(2).height = 20;

  // Header for 3 KPI zones (Row 3)
  ws.mergeCells('B3:D3');
  applyCellStyles(ws.getCell('B3'), {
    val: '💵 REAL-MONEY SC PORTFOLIO (USD VALUED)',
    font: { bold: true, size: 9.5, color: { argb: COLORS.headerText } },
    fill: COLORS.kpiHeaderBg,
    alignment: { horizontal: 'center' },
  });

  ws.mergeCells('F3:H3');
  applyCellStyles(ws.getCell('F3'), {
    val: '🪙 FREE-PLAY GC PORTFOLIO (GOLD COINS)',
    font: { bold: true, size: 9.5, color: { argb: COLORS.headerText } },
    fill: COLORS.gcHeaderBg,
    alignment: { horizontal: 'center' },
  });

  ws.mergeCells('J3:M3');
  applyCellStyles(ws.getCell('J3'), {
    val: '📊 PORTFOLIO OPERATIONS & DISCIPLINE',
    font: { bold: true, size: 9.5, color: { argb: COLORS.headerText } },
    fill: COLORS.statsHeaderBg,
    alignment: { horizontal: 'center' },
  });
  ws.getRow(3).height = 24;

  // Row 4: SC Real Money KPIs
  ws.getRow(4).height = 26;
  applyCellStyles(ws.getCell('B4'), { val: 'SC Starting Capital', font: { bold: true, size: 9 }, fill: COLORS.kpiBg, alignment: { horizontal: 'center' } });
  applyCellStyles(ws.getCell('C4'), { formula: 'SUMIF(C10:C19, "SC*", D10:D19)', result: 100.0, font: { bold: true, size: 10.5 }, fill: COLORS.zebraWhite, alignment: { horizontal: 'right' }, numFmt: '$#,##0.00' });

  applyCellStyles(ws.getCell('E4'), { val: 'SC Current Bankroll', font: { bold: true, size: 9 }, fill: COLORS.kpiBg, alignment: { horizontal: 'center' } });
  applyCellStyles(ws.getCell('F4'), { formula: 'SUMIF(C10:C19, "SC*", G10:G19)', result: 125.0, font: { bold: true, size: 10.5 }, fill: COLORS.zebraWhite, alignment: { horizontal: 'right' }, numFmt: '$#,##0.00' });

  applyCellStyles(ws.getCell('H4'), { val: 'SC Net Profit ($)', font: { bold: true, size: 9 }, fill: COLORS.kpiBg, alignment: { horizontal: 'center' } });
  applyCellStyles(ws.getCell('I4'), { formula: 'F4-C4', result: 25.0, font: { bold: true, size: 10.5 }, fill: COLORS.zebraWhite, alignment: { horizontal: 'right' }, numFmt: '$#,##0.00;[Red]($#,##0.00);"-"' });

  applyCellStyles(ws.getCell('K4'), { val: 'SC Portfolio ROI %', font: { bold: true, size: 9 }, fill: COLORS.kpiBg, alignment: { horizontal: 'center' } });
  applyCellStyles(ws.getCell('L4'), { formula: 'IF(C4>0, (F4-C4)/C4, 0)', result: 0.25, font: { bold: true, size: 10.5 }, fill: COLORS.zebraWhite, alignment: { horizontal: 'right' }, numFmt: '+0.00%;-0.00%;0.00%' });

  applyCellStyles(ws.getCell('M4'), { val: '1 SC = $1.00 USD', font: { bold: true, size: 9, color: { argb: COLORS.badgeGreenText } }, fill: COLORS.badgeGreenFill, alignment: { horizontal: 'center' } });

  // Row 5: GC Free Play KPIs
  ws.getRow(5).height = 26;
  applyCellStyles(ws.getCell('B5'), { val: 'GC Starting Chips', font: { bold: true, size: 9 }, fill: COLORS.gcBg, alignment: { horizontal: 'center' } });
  applyCellStyles(ws.getCell('C5'), { formula: 'SUMIF(C10:C19, "GC*", D10:D19)', result: 250000, font: { bold: true, size: 10.5 }, fill: COLORS.zebraWhite, alignment: { horizontal: 'right' }, numFmt: '#,##0 "GC"' });

  applyCellStyles(ws.getCell('E5'), { val: 'GC Current Chips', font: { bold: true, size: 9 }, fill: COLORS.gcBg, alignment: { horizontal: 'center' } });
  applyCellStyles(ws.getCell('F5'), { formula: 'SUMIF(C10:C19, "GC*", G10:G19)', result: 270000, font: { bold: true, size: 10.5 }, fill: COLORS.zebraWhite, alignment: { horizontal: 'right' }, numFmt: '#,##0 "GC"' });

  applyCellStyles(ws.getCell('H5'), { val: 'GC Net Chip P/L', font: { bold: true, size: 9 }, fill: COLORS.gcBg, alignment: { horizontal: 'center' } });
  applyCellStyles(ws.getCell('I5'), { formula: 'F5-C5', result: 20000, font: { bold: true, size: 10.5 }, fill: COLORS.zebraWhite, alignment: { horizontal: 'right' }, numFmt: '+#,##0 "GC";[Red]-#,##0 "GC";"-"' });

  applyCellStyles(ws.getCell('K5'), { val: 'GC Growth Rate %', font: { bold: true, size: 9 }, fill: COLORS.gcBg, alignment: { horizontal: 'center' } });
  applyCellStyles(ws.getCell('L5'), { formula: 'IF(C5>0, (F5-C5)/C5, 0)', result: 0.08, font: { bold: true, size: 10.5 }, fill: COLORS.zebraWhite, alignment: { horizontal: 'right' }, numFmt: '+0.00%;-0.00%;0.00%' });

  applyCellStyles(ws.getCell('M5'), { val: 'Non-Valued Entertainment', font: { italic: true, size: 8.5, color: { argb: COLORS.badgeAmberText } }, fill: COLORS.badgeAmberFill, alignment: { horizontal: 'center' } });

  // Row 6: Portfolio Operations KPIs
  ws.getRow(6).height = 24;
  applyCellStyles(ws.getCell('B6'), { val: 'Active Sprints', font: { bold: true, size: 9 }, fill: COLORS.statsBg, alignment: { horizontal: 'center' } });
  applyCellStyles(ws.getCell('C6'), { formula: 'COUNTIF(M10:M19, "IN PROGRESS")', result: 2, font: { bold: true, size: 10 }, fill: COLORS.zebraWhite, alignment: { horizontal: 'right' }, numFmt: '0' });

  applyCellStyles(ws.getCell('E6'), { val: 'Goals Achieved Sprints', font: { bold: true, size: 9 }, fill: COLORS.statsBg, alignment: { horizontal: 'center' } });
  applyCellStyles(ws.getCell('F6'), { formula: 'COUNTIF(M10:M19, "GOAL ACHIEVED")', result: 0, font: { bold: true, size: 10 }, fill: COLORS.zebraWhite, alignment: { horizontal: 'right' }, numFmt: '0' });

  applyCellStyles(ws.getCell('H6'), { val: 'Total Sessions Completed', font: { bold: true, size: 9 }, fill: COLORS.statsBg, alignment: { horizontal: 'center' } });
  applyCellStyles(ws.getCell('I6'), { formula: 'SUM(K10:K19)', result: 7, font: { bold: true, size: 10 }, fill: COLORS.zebraWhite, alignment: { horizontal: 'right' }, numFmt: '0' });

  applyCellStyles(ws.getCell('K6'), { val: 'Avg Portfolio Win Rate', font: { bold: true, size: 9 }, fill: COLORS.statsBg, alignment: { horizontal: 'center' } });
  applyCellStyles(ws.getCell('L6'), { formula: 'IF(COUNT(L10:L19)>0, AVERAGE(L10:L19), 0)', result: 0.85, font: { bold: true, size: 10 }, fill: COLORS.zebraWhite, alignment: { horizontal: 'right' }, numFmt: '0.0%' });

  applyCellStyles(ws.getCell('M6'), { val: 'Dual Discipline Tracked', font: { bold: true, size: 9, color: { argb: COLORS.textMuted } }, fill: COLORS.zebraLight, alignment: { horizontal: 'center' } });

  // Row 8: Section Banner for SPRINT PORTFOLIO REGISTRY
  ws.mergeCells('A8:M8');
  applyCellStyles(ws.getCell('A8'), {
    val: '🏁 SPRINT PORTFOLIO REGISTRY & PERFORMANCE SUMMARY (DUAL CURRENCY: SC & GC)',
    font: { size: 10, bold: true, color: { argb: COLORS.headerText } },
    fill: COLORS.subHeaderBg,
    alignment: { horizontal: 'left', indent: 1 },
    border: null,
  });
  ws.getRow(8).height = 24;

  // Table Headers (Row 9)
  const headers = [
    { col: 'A', text: 'Sprint #' },
    { col: 'B', text: 'Sprint Tab / Name' },
    { col: 'C', text: 'Currency Type' },
    { col: 'D', text: 'Start Bankroll' },
    { col: 'E', text: 'Target Mode' },
    { col: 'F', text: 'Target Goal' },
    { col: 'G', text: 'Current Bankroll' },
    { col: 'H', text: 'Net P/L' },
    { col: 'I', text: 'Sprint ROI %' },
    { col: 'J', text: 'Goal Progress %' },
    { col: 'K', text: 'Sessions Logged' },
    { col: 'L', text: 'Win Rate %' },
    { col: 'M', text: 'Sprint Status' },
  ];

  headers.forEach((h) => {
    applyCellStyles(ws.getCell(`${h.col}9`), {
      val: h.text,
      font: { bold: true, size: 9.5, color: { argb: COLORS.headerText } },
      fill: COLORS.tableHeaderBg,
      alignment: { horizontal: 'center' },
    });
  });
  ws.getRow(9).height = 26;

  // Row 10: Sprint 1 (SC $100 Challenge - Real Money Multi-Game)
  ws.getRow(10).height = 22;
  applyCellStyles(ws.getCell('A10'), { val: 1, alignment: { horizontal: 'center' }, font: { bold: true } });
  applyCellStyles(ws.getCell('B10'), { val: 'Sprint 1 - $100', font: { bold: true } });
  applyCellStyles(ws.getCell('C10'), { formula: "'Sprint 1 - $100'!D5", result: 'SC (USD Valued)', alignment: { horizontal: 'center' } });
  applyCellStyles(ws.getCell('D10'), { formula: "'Sprint 1 - $100'!D4", result: 100.0, numFmt: '$#,##0.00', alignment: { horizontal: 'right' } });
  applyCellStyles(ws.getCell('E10'), { formula: "'Sprint 1 - $100'!D6", result: '% Target per Session', alignment: { horizontal: 'center' } });
  applyCellStyles(ws.getCell('F10'), { formula: "'Sprint 1 - $100'!J4", result: 265.33, numFmt: '$#,##0.00', alignment: { horizontal: 'right' } });
  applyCellStyles(ws.getCell('G10'), { formula: "'Sprint 1 - $100'!P4", result: 125.0, numFmt: '$#,##0.00', alignment: { horizontal: 'right' }, font: { bold: true } });
  applyCellStyles(ws.getCell('H10'), { formula: "'Sprint 1 - $100'!P5", result: 25.0, numFmt: '$#,##0.00;[Red]($#,##0.00);"-"', alignment: { horizontal: 'right' }, font: { bold: true } });
  applyCellStyles(ws.getCell('I10'), { formula: "'Sprint 1 - $100'!P6", result: 0.25, numFmt: '+0.00%;-0.00%;0.00%', alignment: { horizontal: 'right' } });
  applyCellStyles(ws.getCell('J10'), { formula: "'Sprint 1 - $100'!P7", result: 0.1512, numFmt: '0.00%', alignment: { horizontal: 'right' } });
  applyCellStyles(ws.getCell('K10'), { formula: "'Sprint 1 - $100'!E26", result: 5, numFmt: '0', alignment: { horizontal: 'center' } });
  applyCellStyles(ws.getCell('L10'), { formula: "'Sprint 1 - $100'!H26", result: 0.8, numFmt: '0.0%', alignment: { horizontal: 'right' } });
  applyCellStyles(ws.getCell('M10'), {
    formula: 'IF(G10>=F10, "GOAL ACHIEVED", IF(G10<=0.25*D10, "CRITICAL DRAWDOWN", "IN PROGRESS"))',
    result: 'IN PROGRESS',
    alignment: { horizontal: 'center' },
    font: { bold: true },
  });

  // Row 11: Sprint 2 (GC 250k Challenge - Free Play Dedicated Sic Bo)
  ws.getRow(11).height = 22;
  applyCellStyles(ws.getCell('A11'), { val: 2, alignment: { horizontal: 'center' }, font: { bold: true } });
  applyCellStyles(ws.getCell('B11'), { val: 'Sprint 2 - GC 250k', font: { bold: true } });
  applyCellStyles(ws.getCell('C11'), { formula: "'Sprint 2 - GC 250k'!D5", result: 'GC (Gold Coins - Free Play)', alignment: { horizontal: 'center' } });
  applyCellStyles(ws.getCell('D11'), { formula: "'Sprint 2 - GC 250k'!D4", result: 250000, numFmt: '#,##0 "GC"', alignment: { horizontal: 'right' } });
  applyCellStyles(ws.getCell('E11'), { formula: "'Sprint 2 - GC 250k'!D6", result: 'Dollar/Coin Profit Target', alignment: { horizontal: 'center' } });
  applyCellStyles(ws.getCell('F11'), { formula: "'Sprint 2 - GC 250k'!J4", result: 500000, numFmt: '#,##0 "GC"', alignment: { horizontal: 'right' } });
  applyCellStyles(ws.getCell('G11'), { formula: "'Sprint 2 - GC 250k'!P4", result: 270000, numFmt: '#,##0 "GC"', alignment: { horizontal: 'right' }, font: { bold: true } });
  applyCellStyles(ws.getCell('H11'), { formula: "'Sprint 2 - GC 250k'!P5", result: 20000, numFmt: '+#,##0 "GC";[Red]-#,##0 "GC";"-"', alignment: { horizontal: 'right' }, font: { bold: true } });
  applyCellStyles(ws.getCell('I11'), { formula: "'Sprint 2 - GC 250k'!P6", result: 0.08, numFmt: '+0.00%;-0.00%;0.00%', alignment: { horizontal: 'right' } });
  applyCellStyles(ws.getCell('J11'), { formula: "'Sprint 2 - GC 250k'!P7", result: 0.08, numFmt: '0.00%', alignment: { horizontal: 'right' } });
  applyCellStyles(ws.getCell('K11'), { formula: "'Sprint 2 - GC 250k'!E26", result: 2, numFmt: '0', alignment: { horizontal: 'center' } });
  applyCellStyles(ws.getCell('L11'), { formula: "'Sprint 2 - GC 250k'!H26", result: 1.0, numFmt: '0.0%', alignment: { horizontal: 'right' } });
  applyCellStyles(ws.getCell('M11'), {
    formula: 'IF(G11>=F11, "GOAL ACHIEVED", IF(G11<=0.25*D11, "CRITICAL DRAWDOWN", "IN PROGRESS"))',
    result: 'IN PROGRESS',
    alignment: { horizontal: 'center' },
    font: { bold: true },
  });

  // Rows 12-19: Ready placeholder slots for Sprint 3 to Sprint 10
  for (let s = 3; s <= 10; s++) {
    const r = 9 + s;
    ws.getRow(r).height = 20;
    const isEven = s % 2 === 0;
    const fill = isEven ? COLORS.zebraLight : COLORS.zebraWhite;

    applyCellStyles(ws.getCell(`A${r}`), { val: s, fill, alignment: { horizontal: 'center' }, font: { color: { argb: COLORS.textMuted } } });
    applyCellStyles(ws.getCell(`B${r}`), { val: `Sprint ${s} (Duplicate Template)`, fill, font: { italic: true, color: { argb: COLORS.textMuted } } });
    applyCellStyles(ws.getCell(`C${r}`), { val: '', fill, alignment: { horizontal: 'center' } });
    applyCellStyles(ws.getCell(`D${r}`), { val: null, fill, numFmt: '#,##0.00' });
    applyCellStyles(ws.getCell(`E${r}`), { val: '', fill, alignment: { horizontal: 'center' } });
    applyCellStyles(ws.getCell(`F${r}`), { val: null, fill, numFmt: '#,##0.00' });
    applyCellStyles(ws.getCell(`G${r}`), { val: null, fill, numFmt: '#,##0.00' });
    applyCellStyles(ws.getCell(`H${r}`), { val: null, fill, numFmt: '#,##0.00' });
    applyCellStyles(ws.getCell(`I${r}`), { val: null, fill, numFmt: '0.00%' });
    applyCellStyles(ws.getCell(`J${r}`), { val: null, fill, numFmt: '0.00%' });
    applyCellStyles(ws.getCell(`K${r}`), { val: null, fill, numFmt: '0' });
    applyCellStyles(ws.getCell(`L${r}`), { val: null, fill, numFmt: '0.0%' });
    applyCellStyles(ws.getCell(`M${r}`), { val: 'READY TO START', fill, alignment: { horizontal: 'center' }, font: { italic: true, color: { argb: COLORS.textMuted } } });
  }

  // Row 21: Section Banner for Portfolio Game Breakdown
  ws.mergeCells('A21:M21');
  applyCellStyles(ws.getCell('A21'), {
    val: '🎮 PORTFOLIO BREAKDOWN BY GAME TYPE (CROSS-SPRINT PERFORMANCE & CURRENCY SEGREGATION)',
    font: { size: 10, bold: true, color: { argb: COLORS.headerText } },
    fill: COLORS.gameHeaderBg,
    alignment: { horizontal: 'left', indent: 1 },
    border: null,
  });
  ws.getRow(21).height = 24;

  // Row 22: Portfolio Game Headers
  const pGameHeaders = [
    { col: 'A', text: '#' },
    { col: 'B', text: 'Game Classification' },
    { col: 'C', text: 'Sprints Active' },
    { col: 'D', text: 'Total Sessions' },
    { col: 'E', text: 'SC Staked ($)' },
    { col: 'F', text: 'SC Net P/L ($)' },
    { col: 'G', text: 'GC Staked' },
    { col: 'H', text: 'GC Net P/L' },
    { col: 'I', text: 'Win Rate %' },
    { col: 'J', text: 'SC ROI %' },
    { col: 'K', text: 'GC ROI %' },
    { col: 'L', text: 'Overall Game Status' },
  ];

  pGameHeaders.forEach((pgh) => {
    applyCellStyles(ws.getCell(`${pgh.col}22`), {
      val: pgh.text,
      font: { bold: true, size: 9, color: { argb: COLORS.headerText } },
      fill: COLORS.tableHeaderBg,
      alignment: { horizontal: 'center' },
    });
  });
  ws.mergeCells('L22:M22');
  ws.getRow(22).height = 22;

  // Rows 23 to 30: The 8 Games across sprints
  GAME_TYPES.forEach((game, gIdx) => {
    const r = 23 + gIdx;
    const isEven = gIdx % 2 === 0;
    const fill = isEven ? COLORS.zebraLight : COLORS.zebraWhite;
    const sprintRow = 18 + gIdx; // Row index inside each sprint's game breakdown

    ws.getRow(r).height = 20;

    // A: #
    applyCellStyles(ws.getCell(`A${r}`), { val: gIdx + 1, fill, alignment: { horizontal: 'center' }, numFmt: '0' });

    // B: Game
    applyCellStyles(ws.getCell(`B${r}`), { val: game, font: { bold: true }, fill, alignment: { horizontal: 'left', indent: 1 } });

    // C: Sprints Active
    applyCellStyles(ws.getCell(`C${r}`), {
      formula: `IF('Sprint 1 - $100'!E${sprintRow}>0, 1, 0) + IF('Sprint 2 - GC 250k'!E${sprintRow}>0, 1, 0)`,
      fill,
      alignment: { horizontal: 'center' },
      numFmt: '0',
    });

    // D: Total Sessions
    applyCellStyles(ws.getCell(`D${r}`), {
      formula: `'Sprint 1 - $100'!E${sprintRow} + 'Sprint 2 - GC 250k'!E${sprintRow}`,
      fill,
      alignment: { horizontal: 'center' },
      numFmt: '0',
    });

    // E: SC Staked ($) (from Sprint 1 SC)
    applyCellStyles(ws.getCell(`E${r}`), {
      formula: `'Sprint 1 - $100'!F${sprintRow}`,
      fill,
      alignment: { horizontal: 'right' },
      numFmt: '$#,##0.00',
    });

    // F: SC Net P/L ($) (from Sprint 1 SC)
    applyCellStyles(ws.getCell(`F${r}`), {
      formula: `'Sprint 1 - $100'!G${sprintRow}`,
      font: { bold: true },
      fill,
      alignment: { horizontal: 'right' },
      numFmt: '$#,##0.00;[Red]($#,##0.00);"-"',
    });

    // G: GC Staked (from Sprint 2 GC)
    applyCellStyles(ws.getCell(`G${r}`), {
      formula: `'Sprint 2 - GC 250k'!F${sprintRow}`,
      fill,
      alignment: { horizontal: 'right' },
      numFmt: '#,##0 "GC"',
    });

    // H: GC Net P/L (from Sprint 2 GC)
    applyCellStyles(ws.getCell(`H${r}`), {
      formula: `'Sprint 2 - GC 250k'!G${sprintRow}`,
      font: { bold: true },
      fill,
      alignment: { horizontal: 'right' },
      numFmt: '+#,##0 "GC";[Red]-#,##0 "GC";"-"',
    });

    // I: Win Rate %
    applyCellStyles(ws.getCell(`I${r}`), {
      formula: `IF(D${r}=0, 0, (('Sprint 1 - $100'!E${sprintRow}*'Sprint 1 - $100'!H${sprintRow}) + ('Sprint 2 - GC 250k'!E${sprintRow}*'Sprint 2 - GC 250k'!H${sprintRow})) / D${r})`,
      fill,
      alignment: { horizontal: 'right' },
      numFmt: '0.0%',
    });

    // J: SC ROI %
    applyCellStyles(ws.getCell(`J${r}`), {
      formula: `IF(E${r}=0, 0, F${r}/E${r})`,
      fill,
      alignment: { horizontal: 'right' },
      numFmt: '+0.00%;-0.00%;0.00%',
    });

    // K: GC ROI %
    applyCellStyles(ws.getCell(`K${r}`), {
      formula: `IF(G${r}=0, 0, H${r}/G${r})`,
      fill,
      alignment: { horizontal: 'right' },
      numFmt: '+0.00%;-0.00%;0.00%',
    });

    // L:M Status
    ws.mergeCells(`L${r}:M${r}`);
    applyCellStyles(ws.getCell(`L${r}`), {
      formula: `IF(D${r}=0, "Not Played Yet", IF(OR(F${r}>0, G${r}>0), "PROFITABLE ✅", IF(AND(F${r}=0, G${r}=0), "BREAK-EVEN ⚖", "IN DRAWDOWN 🔻")))`,
      font: { bold: true, size: 9 },
      fill,
      alignment: { horizontal: 'center' },
    });
  });

  // Instruction Box
  ws.mergeCells('A32:M36');
  applyCellStyles(ws.getCell('A32'), {
    val: '💡 HOW TO ADD A NEW SPRINT (SC OR GC):\n1. Right-click the "Sprint Template" tab at the bottom and choose "Move or Copy..." -> check "Create a copy".\n2. Rename the new sheet to "Sprint 3" (or your preferred challenge name).\n3. Set Currency Type in cell D5 ("SC (USD Valued)" for dollars or "GC (Gold Coins)" for free play).\n4. In this Dashboard on Row 12, link the cells: C12 = \'Sprint 3\'!D5, D12 = \'Sprint 3\'!D4, E12 = \'Sprint 3\'!D6, F12 = \'Sprint 3\'!J4, G12 = \'Sprint 3\'!P4, etc.\n5. Your portfolio totals, currency segregation cards, and game breakdowns update automatically!',
    font: { size: 9, bold: false, color: { argb: COLORS.textDark } },
    fill: COLORS.inputFill,
    border: BORDER_INPUT,
    alignment: { horizontal: 'left', vertical: 'top', wrapText: true },
  });
}

/**
 * Builds the Growth Target Matrix & Staking Risk Management Guide
 * Supports both SC ($) real-money and GC free-play chip bankrolls
 */
function buildTargetMatrixSheet(wb) {
  const ws = wb.addWorksheet('Growth Target Matrix', {
    views: [{ showGridLines: true, state: 'normal' }],
  });

  ws.columns = [
    { width: 24 }, // A
    { width: 14 }, // B
    { width: 14 }, // C
    { width: 14 }, // D
    { width: 14 }, // E
    { width: 14 }, // F
    { width: 14 }, // G
    { width: 14 }, // H
    { width: 14 }, // I
    { width: 14 }, // J
  ];

  // Title Banner
  ws.mergeCells('A1:J1');
  applyCellStyles(ws.getCell('A1'), {
    val: 'BET-R PLAY-R // COMPOUNDING GROWTH, TARGET SOLVER & STAKING RISK MATRIX',
    font: { size: 14, bold: true, color: { argb: COLORS.headerText } },
    fill: COLORS.headerBg,
    alignment: { horizontal: 'left', indent: 1 },
    border: null,
  });
  ws.getRow(1).height = 36;

  // Subtitle
  ws.mergeCells('A2:J2');
  applyCellStyles(ws.getCell('A2'), {
    val: 'Reference tables comparing daily / per-session compound returns, reverse-engineered rate targets, and disciplined staking unit sizing for SC ($) and GC chips.',
    font: { size: 9.5, italic: true, color: { argb: COLORS.textMuted } },
    fill: COLORS.zebraLight,
    alignment: { horizontal: 'left', indent: 1 },
    border: null,
  });
  ws.getRow(2).height = 20;

  // SECTION 1: Compounded Growth Schedule ($100 Base)
  ws.mergeCells('A4:J4');
  applyCellStyles(ws.getCell('A4'), {
    val: '📈 TABLE 1: COMPOUNDED FINAL BANKROLL FROM 100 UNITS (100 SC OR SCALE TO GC)',
    font: { size: 10.5, bold: true, color: { argb: COLORS.headerText } },
    fill: COLORS.subHeaderBg,
    alignment: { horizontal: 'left', indent: 1 },
  });
  ws.getRow(4).height = 24;

  const horizonCols = [5, 10, 15, 20, 25, 30, 40, 50, 60];
  const colLetters = ['B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];

  applyCellStyles(ws.getCell('A5'), {
    val: 'Target Rate %',
    font: { bold: true, size: 9.5, color: { argb: COLORS.headerText } },
    fill: COLORS.tableHeaderBg,
    alignment: { horizontal: 'center' },
  });

  horizonCols.forEach((h, idx) => {
    applyCellStyles(ws.getCell(`${colLetters[idx]}5`), {
      val: `${h} Sessions`,
      font: { bold: true, size: 9.5, color: { argb: COLORS.headerText } },
      fill: COLORS.tableHeaderBg,
      alignment: { horizontal: 'center' },
    });
  });
  ws.getRow(5).height = 24;

  const rates = [0.01, 0.02, 0.025, 0.03, 0.04, 0.05, 0.075, 0.1, 0.15];
  rates.forEach((rate, rIdx) => {
    const rNum = 6 + rIdx;
    ws.getRow(rNum).height = 20;
    const isEven = rIdx % 2 === 0;
    const rowFill = isEven ? COLORS.zebraLight : COLORS.zebraWhite;

    applyCellStyles(ws.getCell(`A${rNum}`), {
      val: rate,
      font: { bold: true, size: 9.5 },
      fill: rowFill,
      alignment: { horizontal: 'center' },
      numFmt: '0.00%',
    });

    horizonCols.forEach((h, hIdx) => {
      const formula = `100*(1+$A${rNum})^${h}`;
      const result = 100 * Math.pow(1 + rate, h);
      applyCellStyles(ws.getCell(`${colLetters[hIdx]}${rNum}`), {
        formula,
        result,
        font: { size: 9.5, bold: rate === 0.05 },
        fill: rate === 0.05 ? COLORS.badgeGreenFill : rowFill,
        alignment: { horizontal: 'right' },
        numFmt: '$#,##0.00',
      });
    });
  });

  // SECTION 2: Reverse Rate Solver Matrix
  const table2Start = 17;
  ws.mergeCells(`A${table2Start}:J${table2Start}`);
  applyCellStyles(ws.getCell(`A${table2Start}`), {
    val: '🎯 TABLE 2: REVERSE TARGET SOLVER (REQUIRED % PER SESSION TO HIT MULTIPLIER)',
    font: { size: 10.5, bold: true, color: { argb: COLORS.headerText } },
    fill: COLORS.subHeaderBg,
    alignment: { horizontal: 'left', indent: 1 },
  });
  ws.getRow(table2Start).height = 24;

  applyCellStyles(ws.getCell(`A${table2Start + 1}`), {
    val: 'Target Bankroll Multiplier',
    font: { bold: true, size: 9.5, color: { argb: COLORS.headerText } },
    fill: COLORS.tableHeaderBg,
    alignment: { horizontal: 'center' },
  });

  horizonCols.forEach((h, idx) => {
    applyCellStyles(ws.getCell(`${colLetters[idx]}${table2Start + 1}`), {
      val: `${h} Sessions`,
      font: { bold: true, size: 9.5, color: { argb: COLORS.headerText } },
      fill: COLORS.tableHeaderBg,
      alignment: { horizontal: 'center' },
    });
  });
  ws.getRow(table2Start + 1).height = 24;

  const targets = [
    { label: '1.25x (+25% gain)', target: 125 },
    { label: '1.50x (+50% gain)', target: 150 },
    { label: '1.75x (+75% gain)', target: 175 },
    { label: '2.00x (Double Bankroll)', target: 200 },
    { label: '2.50x (+150% gain)', target: 250 },
    { label: '3.00x (Triple Bankroll)', target: 300 },
    { label: '4.00x (4x Bankroll)', target: 400 },
    { label: '5.00x (5x Bankroll)', target: 500 },
    { label: '10.0x (10x Milestone)', target: 1000 },
  ];

  targets.forEach((t, tIdx) => {
    const rNum = table2Start + 2 + tIdx;
    ws.getRow(rNum).height = 20;
    const isEven = tIdx % 2 === 0;
    const rowFill = isEven ? COLORS.zebraLight : COLORS.zebraWhite;

    applyCellStyles(ws.getCell(`A${rNum}`), {
      val: t.label,
      font: { bold: true, size: 9.5 },
      fill: rowFill,
      alignment: { horizontal: 'left', indent: 1 },
    });

    horizonCols.forEach((h, hIdx) => {
      const formula = `(${t.target}/100)^(1/${h})-1`;
      const result = Math.pow(t.target / 100, 1 / h) - 1;
      applyCellStyles(ws.getCell(`${colLetters[hIdx]}${rNum}`), {
        formula,
        result,
        font: { size: 9.5, bold: t.target === 200 && h === 20 },
        fill: t.target === 200 && h === 20 ? COLORS.badgeAmberFill : rowFill,
        alignment: { horizontal: 'right' },
        numFmt: '0.00%',
      });
    });
  });

  // SECTION 3: Staking Unit & Risk Management Guide (SC & GC)
  const table3Start = 29;
  ws.mergeCells(`A${table3Start}:J${table3Start}`);
  applyCellStyles(ws.getCell(`A${table3Start}`), {
    val: '🛡 TABLE 3: STAKING UNIT MATRIX & RISK GUARDRAILS (SOCIAL COIN & GOLD COIN)',
    font: { size: 10.5, bold: true, color: { argb: COLORS.headerText } },
    fill: COLORS.subHeaderBg,
    alignment: { horizontal: 'left', indent: 1 },
  });
  ws.getRow(table3Start).height = 24;

  const unitHeaders = [
    { col: 'A', text: 'Starting Bankroll' },
    { col: 'B', text: '0.5% (Micro)' },
    { col: 'C', text: '1.0% (Standard Unit)' },
    { col: 'D', text: '2.0% (Aggressive Unit)' },
    { col: 'E', text: '3.0% (Max Per Bet)' },
    { col: 'F', text: '5.0% (Session Stop-Loss)' },
    { col: 'G', text: '10.0% (High Risk Cap)' },
    { col: 'H', text: 'Safe Growth Zone' },
    { col: 'I', text: 'Recommended Stop-Win' },
    { col: 'J', text: 'Discipline Level' },
  ];

  unitHeaders.forEach((uh) => {
    applyCellStyles(ws.getCell(`${uh.col}${table3Start + 1}`), {
      val: uh.text,
      font: { bold: true, size: 9.5, color: { argb: COLORS.headerText } },
      fill: COLORS.tableHeaderBg,
      alignment: { horizontal: 'center' },
    });
  });
  ws.getRow(table3Start + 1).height = 24;

  const bankrolls = [
    { label: '50.00', val: 50, isGC: false, fmt: '$#,##0.00' },
    { label: '100.00', val: 100, isGC: false, fmt: '$#,##0.00' },
    { label: '250.00', val: 250, isGC: false, fmt: '$#,##0.00' },
    { label: '500.00', val: 500, isGC: false, fmt: '$#,##0.00' },
    { label: '1,000.00', val: 1000, isGC: false, fmt: '$#,##0.00' },
    { label: '100,000 GC', val: 100000, isGC: true, fmt: '#,##0 "GC"' },
    { label: '250,000 GC', val: 250000, isGC: true, fmt: '#,##0 "GC"' },
    { label: '500,000 GC', val: 500000, isGC: true, fmt: '#,##0 "GC"' },
    { label: '1,000,000 GC', val: 1000000, isGC: true, fmt: '#,##0 "GC"' },
  ];

  bankrolls.forEach((br, bIdx) => {
    const rNum = table3Start + 2 + bIdx;
    ws.getRow(rNum).height = 20;
    const isEven = bIdx % 2 === 0;
    const rowFill = isEven ? COLORS.zebraLight : COLORS.zebraWhite;
    const fmt = br.fmt;

    applyCellStyles(ws.getCell(`A${rNum}`), { val: br.val, font: { bold: true, size: 9.5 }, fill: rowFill, alignment: { horizontal: 'right' }, numFmt: fmt });
    applyCellStyles(ws.getCell(`B${rNum}`), { formula: `A${rNum}*0.005`, result: br.val * 0.005, fill: rowFill, alignment: { horizontal: 'right' }, numFmt: fmt });
    applyCellStyles(ws.getCell(`C${rNum}`), { formula: `A${rNum}*0.01`, result: br.val * 0.01, fill: COLORS.badgeGreenFill, font: { bold: true }, alignment: { horizontal: 'right' }, numFmt: fmt });
    applyCellStyles(ws.getCell(`D${rNum}`), { formula: `A${rNum}*0.02`, result: br.val * 0.02, fill: rowFill, alignment: { horizontal: 'right' }, numFmt: fmt });
    applyCellStyles(ws.getCell(`E${rNum}`), { formula: `A${rNum}*0.03`, result: br.val * 0.03, fill: rowFill, alignment: { horizontal: 'right' }, numFmt: fmt });
    applyCellStyles(ws.getCell(`F${rNum}`), { formula: `A${rNum}*0.05`, result: br.val * 0.05, fill: COLORS.badgeRedFill, font: { bold: true }, alignment: { horizontal: 'right' }, numFmt: fmt });
    applyCellStyles(ws.getCell(`G${rNum}`), { formula: `A${rNum}*0.10`, result: br.val * 0.1, fill: rowFill, alignment: { horizontal: 'right' }, numFmt: fmt });
    applyCellStyles(ws.getCell(`H${rNum}`), { val: '+2% to +5% / session', fill: rowFill, alignment: { horizontal: 'center' } });
    applyCellStyles(ws.getCell(`I${rNum}`), { val: '+5 Units profit lock', fill: rowFill, alignment: { horizontal: 'center' } });
    applyCellStyles(ws.getCell(`J${rNum}`), { val: br.isGC ? 'Free Play Mastery' : 'Strict Professional', fill: rowFill, alignment: { horizontal: 'center' }, font: { italic: true } });
  });

  // Callout Box
  const calloutStart = table3Start + 2 + bankrolls.length + 1;
  ws.mergeCells(`A${calloutStart}:J${calloutStart + 3}`);
  applyCellStyles(ws.getCell(`A${calloutStart}`), {
    val: '💡 DUAL-CURRENCY BANKROLL MANAGEMENT PRINCIPLES:\n• Social Coin (SC): Real money valued chips (1 SC = $1.00 USD). Follow strict 1%–2% unit sizing and terminate immediately if 5% stop-loss is reached.\n• Gold Coin (GC): Non-valued entertainment chips. Use GC to practice strategies and test bankroll discipline without financial risk.\n• Zero Commingling: Never mix SC and GC totals together — each currency operates with its own independent starting capital and ledger.',
    font: { size: 9, bold: false, color: { argb: COLORS.textDark } },
    fill: COLORS.inputFill,
    border: BORDER_INPUT,
    alignment: { horizontal: 'left', vertical: 'top', wrapText: true },
  });
}

/**
 * Main Generator
 */
async function generateWorkbook() {
  console.log('Generating Enhanced Betting Bankroll Sprint Tracker (v4.0 with Dual Currency & Game Classification)...');
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Bet-R Play-R';
  wb.lastModifiedBy = 'Bet-R Play-R';
  wb.created = new Date();
  wb.modified = new Date();

  // 1. Multi-Sprint Dashboard
  buildDashboardSheet(wb);

  // 2. Sprint 1 ($100 SC Bankroll Active - Demonstrates Social Coin Real Money & Multi-Game Mix)
  buildSprintSheet(wb, 'Sprint 1 - $100', {
    title: 'BET-R PLAY-R // SPRINT 1 ($100 SC CHALLENGE - SOCIAL COIN REAL MONEY MULTI-GAME)',
    currencyType: 'SC (USD Valued)',
    startingBankroll: 100.0,
    targetMode: '% Target per Session',
    horizonType: 'By Sessions',
    horizonCount: 20,
    compoundingMethod: 'Compounded',
    inputPct: 0.05,
    inputDollar: 100.0,
    startDate: '2026-11-03',
    endDate: '2026-11-23',
    sampleData: [
      {
        dayNum: 1,
        date: '2026-11-03',
        time: '10:15',
        currency: 'SC',
        game: 'Sic Bo',
        market: 'Small/Big + Double hedge',
        stake: 12.0,
        start: 100.0,
        end: 106.5,
        notes: 'Hit stop-win after 4 winning spins; locked profit.',
      },
      {
        dayNum: 1,
        date: '2026-11-03',
        time: '14:30',
        currency: 'SC',
        game: 'Teen Patti',
        market: 'Pair Plus Focus',
        stake: 15.0,
        start: 106.5,
        end: 112.0,
        notes: 'Hit flush on hand 7 and exited cleanly.',
      },
      {
        dayNum: 2,
        date: '2026-11-04',
        time: '11:00',
        currency: 'SC',
        game: 'The Kickoff',
        market: 'Over/Under 2.5 Goals',
        stake: 10.0,
        start: 112.0,
        end: 108.5,
        notes: 'Late goal missed over. Respected stop-loss, no tilt.',
      },
      {
        dayNum: 2,
        date: '2026-11-04',
        time: '16:45',
        currency: 'SC',
        game: 'Sic Bo',
        market: 'Single Die Value Progression',
        stake: 14.0,
        start: 108.5,
        end: 118.0,
        notes: 'Rebounded with base 1-unit bets.',
      },
      {
        dayNum: 3,
        date: '2026-11-05',
        time: '09:30',
        currency: 'SC',
        game: 'The Kickoff',
        market: '1st Half Asian Handicap',
        stake: 12.0,
        start: 118.0,
        end: 125.0,
        notes: 'Bankroll at 125.00 SC (+25% sprint ROI). On track.',
      },
    ],
    isTemplate: false,
  });

  // 3. Sprint 2 (250,000 GC Bankroll Active - Demonstrates Gold Coin Free Play & Single-Game Dedicated: Sic Bo)
  buildSprintSheet(wb, 'Sprint 2 - GC 250k', {
    title: 'BET-R PLAY-R // SPRINT 2 (250K GC CHALLENGE - GOLD COIN FREE PLAY: SIC BO DEDICATED)',
    currencyType: 'GC (Gold Coins - Free Play)',
    startingBankroll: 250000,
    targetMode: 'Dollar/Coin Profit Target',
    horizonType: 'By Sessions',
    horizonCount: 25,
    compoundingMethod: 'Compounded',
    inputPct: 0.0281,
    inputDollar: 250000,
    startDate: '2026-11-01',
    endDate: '2026-11-26',
    sampleData: [
      {
        dayNum: 1,
        date: '2026-11-01',
        time: '12:00',
        currency: 'GC',
        game: 'Sic Bo',
        market: 'Big/Small Flat 1-Unit Strategy',
        stake: 25000,
        start: 250000,
        end: 262500,
        notes: 'Clean opening session on Big pattern.',
      },
      {
        dayNum: 2,
        date: '2026-11-02',
        time: '15:30',
        currency: 'GC',
        game: 'Sic Bo',
        market: 'Even/Odd Progression',
        stake: 20000,
        start: 262500,
        end: 270000,
        notes: 'Hit session target +7,500 GC, locked in.',
      },
    ],
    isTemplate: false,
  });

  // 4. Sprint Template (Ready to Duplicate - Defaults to SC, switchable to GC)
  buildSprintSheet(wb, 'Sprint Template', {
    title: 'BET-R PLAY-R // SPRINT BANKROLL TEMPLATE (DUPLICATE FOR NEW SC OR GC SPRINTS)',
    currencyType: 'SC (USD Valued)',
    startingBankroll: 100.0,
    targetMode: '% Target per Session',
    horizonType: 'By Sessions',
    horizonCount: 20,
    compoundingMethod: 'Compounded',
    inputPct: 0.05,
    inputDollar: 100.0,
    startDate: '2026-11-03',
    endDate: '2026-11-23',
    sampleData: [],
    isTemplate: true,
  });

  // 5. Growth Target Matrix & Staking Guide
  buildTargetMatrixSheet(wb);

  // Write Excel file
  await wb.xlsx.writeFile(OUTPUT_XLSX);
  console.log(`Saved Excel workbook to: ${OUTPUT_XLSX}`);

  // Convert to LibreOffice Calc (.ods)
  try {
    console.log('Converting to LibreOffice Calc (.ods)...');
    execSync(`libreoffice --headless --convert-to ods "${OUTPUT_XLSX}" --outdir "${path.dirname(OUTPUT_ODS)}"`, {
      stdio: 'inherit',
    });
    console.log(`Saved Calc workbook to: ${OUTPUT_ODS}`);
  } catch (err) {
    console.warn('Note: Could not run libreoffice headless conversion. .xlsx file is fully compatible with Calc.');
  }

  console.log('Enhanced v4.0 spreadsheet generation completed successfully!');
}

if (require.main === module) {
  generateWorkbook().catch((err) => {
    console.error('Failed to generate spreadsheet:', err);
    process.exit(1);
  });
}

module.exports = { generateWorkbook };
