/**
 * Bet-R Play-R: Betting Bankroll Sprint Tracker Spreadsheet Generator (Enhanced v3.0)
 *
 * Game Classification Architecture:
 * - Each session row is classified by exactly ONE game type (via strict dropdown data validation).
 * - A sprint sheet can be single-game dedicated (100% Sic Bo, etc.) OR multi-game (mixing Sic Bo, Teen Patti, Kickoff, Sports, etc.).
 * - Per-Game Performance Breakdown table on every sprint tab calculates sessions, staked, net P/L, win rate, and ROI per game.
 * - Multi-Sprint Dashboard aggregates portfolio results across all sprints by game type.
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
  kpiHeaderBg: 'FF065F46',   // Emerald 800
  kpiBg: 'FFF0FDF4',         // Emerald 50
  kpiBorder: 'FF10B981',     // Emerald 500
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
 * - 4-way Target Engine (Rows 3-13)
 * - Per-Game Breakdown & Game Discipline Insights (Rows 15-25)
 * - 50-Row Session Performance Log with 1-Game Classification per session (Rows 28-78)
 */
function buildSprintSheet(wb, sheetName, opts = {}) {
  const {
    title = 'BET-R PLAY-R // SPRINT BANKROLL TRACKER',
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

  const ws = wb.addWorksheet(sheetName, {
    views: [{ showGridLines: true, state: 'normal' }],
  });

  // 19 Columns (A to S)
  ws.columns = [
    { width: 11 }, // A: Session #
    { width: 9 },  // B: Day #
    { width: 13 }, // C: Date
    { width: 10 }, // D: Time
    { width: 18 }, // E: Game Type (Dropdown)
    { width: 26 }, // F: Market / Wager Details
    { width: 16 }, // G: Start Bankroll ($)
    { width: 16 }, // H: Safe Stake Cap (5%)
    { width: 17 }, // I: Benchmark Target ($)
    { width: 15 }, // J: Target $ Gain
    { width: 15 }, // K: Actual Stake ($)
    { width: 16 }, // L: End Bankroll ($)
    { width: 16 }, // M: Net P/L ($)
    { width: 14 }, // N: Growth %
    { width: 18 }, // O: Target Status
    { width: 15 }, // P: Variance ($)
    { width: 16 }, // Q: Cumulative P/L ($)
    { width: 14 }, // R: Sprint ROI %
    { width: 34 }, // S: Session Notes / Strategy
  ];

  // Row 1: Title Banner
  ws.mergeCells('A1:S1');
  applyCellStyles(ws.getCell('A1'), {
    val: title,
    font: { size: 14, bold: true, color: { argb: COLORS.headerText } },
    fill: COLORS.headerBg,
    alignment: { horizontal: 'left', indent: 1 },
    border: null,
  });
  ws.getRow(1).height = 36;

  // Row 2: Subtitle
  ws.mergeCells('A2:S2');
  applyCellStyles(ws.getCell('A2'), {
    val: 'Game Classification: Each session is classified by exactly 1 game in Column E. Sheets can track 1 dedicated game or multiple mixed games with auto-breakdown.',
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
    val: '📊 LIVE PERFORMANCE, PACING & DRAWDOWN',
    font: { bold: true, size: 9.5, color: { argb: COLORS.headerText } },
    fill: COLORS.kpiHeaderBg,
    alignment: { horizontal: 'center' },
  });

  ws.mergeCells('R3:S3');
  applyCellStyles(ws.getCell('R3'), {
    val: '🏆 WIN/LOSS & PACING',
    font: { bold: true, size: 9.5, color: { argb: COLORS.headerText } },
    fill: COLORS.statsHeaderBg,
    alignment: { horizontal: 'center' },
  });
  ws.getRow(3).height = 24;

  // Configuration & Metric Grid (Rows 4 to 13)
  const gridRows = [
    {
      row: 4,
      bLabel: 'Starting Bankroll ($)',
      bVal: startingBankroll,
      bFmt: '$#,##0.00',
      bIsInput: true,
      fLabel: 'Target Final Bankroll ($)',
      fFormula: 'IF(D5="% Target per Session", IF(D8="Compounded", D4*(1+D9)^D7, D4*(1+D9*D7)), IF(D5="% Target per Day", IF(D8="Compounded", D4*(1+D9)^D13, D4*(1+D9*D13)), IF(D5="Dollar Profit Target", D4+D10, D10)))',
      fResult: 265.33,
      fFmt: '$#,##0.00',
      fBold: true,
      lLabel: 'Current Bankroll ($)',
      lFormula: 'IF(COUNT(L29:L78)>0, LOOKUP(2, 1/(L29:L78<>""), L29:L78), D4)',
      lResult: sampleData.length > 0 ? sampleData[sampleData.length - 1].end : startingBankroll,
      lFmt: '$#,##0.00',
      lBold: true,
      rLabel: 'Sessions Logged / Left',
      rFormula: 'COUNT(L29:L78) & " / " & MAX(0, D7-COUNT(L29:L78))',
      rResult: `${sampleData.length} / ${Math.max(0, horizonCount - sampleData.length)}`,
      rFmt: '@',
    },
    {
      row: 5,
      bLabel: 'Target Mode',
      bVal: targetMode,
      bValidation: {
        type: 'list',
        allowBlank: false,
        formulae: ['"% Target per Session,% Target per Day,Dollar Profit Target,Target Final Bankroll ($)"'],
      },
      bIsInput: true,
      fLabel: 'Target Total Profit ($)',
      fFormula: 'J4-D4',
      fResult: 165.33,
      fFmt: '$#,##0.00',
      fBold: true,
      lLabel: 'Current Net Profit / Loss ($)',
      lFormula: 'P4-D4',
      lResult: sampleData.length > 0 ? sampleData[sampleData.length - 1].end - startingBankroll : 0.0,
      lFmt: '$#,##0.00;[Red]($#,##0.00);"-"',
      lBold: true,
      rLabel: 'Win / Loss Record',
      rFormula: 'COUNTIF(M29:M78, ">0") & "W - " & COUNTIF(M29:M78, "<0") & "L"',
      rResult: '4W - 1L',
      rFmt: '@',
    },
    {
      row: 6,
      bLabel: 'Horizon Type',
      bVal: horizonType,
      bValidation: {
        type: 'list',
        allowBlank: false,
        formulae: ['"By Sessions,By Days"'],
      },
      bIsInput: true,
      fLabel: 'Target Total Growth %',
      fFormula: '(J4-D4)/D4',
      fResult: 1.6533,
      fFmt: '0.00%',
      fBold: true,
      lLabel: 'Current Sprint ROI %',
      lFormula: '(P4-D4)/D4',
      lResult: sampleData.length > 0 ? (sampleData[sampleData.length - 1].end - startingBankroll) / startingBankroll : 0.0,
      lFmt: '+0.00%;-0.00%;0.00%',
      lBold: true,
      rLabel: 'Session Win Rate %',
      rFormula: 'IF(COUNT(L29:L78)=0, 0, COUNTIF(M29:M78, ">0")/COUNT(L29:L78))',
      rResult: sampleData.length > 0 ? 0.8 : 0.0,
      rFmt: '0.0%',
      rBold: true,
    },
    {
      row: 7,
      bLabel: 'Target Session Count (N)',
      bVal: horizonCount,
      bFmt: '0',
      bIsInput: true,
      fLabel: 'Equated % per Session',
      fFormula: 'IF(D5="% Target per Session", D9, IF(D8="Compounded", (J4/D4)^(1/D7)-1, (J4-D4)/(D4*D7)))',
      fResult: 0.05,
      fFmt: '0.00%',
      fBold: true,
      lLabel: 'Target Progress %',
      lFormula: 'IF(J5=0, 0, (P4-D4)/J5)',
      lResult: sampleData.length > 0 ? 0.1512 : 0.0,
      lFmt: '0.00%',
      lBold: true,
      rLabel: 'Profit Factor',
      rFormula: 'IF(SUMIF(M29:M78, "<0")=0, "Undefeated", ROUND(ABS(SUMIF(M29:M78, ">0")/SUMIF(M29:M78, "<0")), 2))',
      rResult: 8.14,
      rFmt: '@',
      rBold: true,
    },
    {
      row: 8,
      bLabel: 'Compounding Method',
      bVal: compoundingMethod,
      bValidation: {
        type: 'list',
        allowBlank: false,
        formulae: ['"Compounded,Simple (Flat)"'],
      },
      bIsInput: true,
      fLabel: 'Equated % per Day',
      fFormula: 'IF(D5="% Target per Day", D9, IF(D8="Compounded", (J4/D4)^(1/D13)-1, (J4-D4)/(D4*D13)))',
      fResult: 0.05,
      fFmt: '0.00%',
      fBold: true,
      lLabel: 'Goal Progress Bar',
      lFormula: 'REPT("█", MIN(12, MAX(0, INT(P7*12)))) & REPT("░", 12 - MIN(12, MAX(0, INT(P7*12)))) & " " & TEXT(P7, "0.0%")',
      lResult: sampleData.length > 0 ? '█░░░░░░░░░░░ 15.1%' : '░░░░░░░░░░░░ 0.0%',
      lFmt: '@',
      rLabel: 'Avg Profit on Wins ($)',
      rFormula: 'IF(COUNTIF(M29:M78, ">0")=0, 0, SUMIF(M29:M78, ">0")/COUNTIF(M29:M78, ">0"))',
      rResult: sampleData.length > 0 ? 7.13 : 0.0,
      rFmt: '$#,##0.00',
    },
    {
      row: 9,
      bLabel: 'Input Target % Rate',
      bVal: inputPct,
      bFmt: '0.00%',
      bIsInput: true,
      fLabel: 'Equated Avg $ Gain / Session',
      fFormula: 'J5/D7',
      fResult: 8.27,
      fFmt: '$#,##0.00',
      lLabel: 'Remaining to Target ($)',
      lFormula: 'MAX(0, J4-P4)',
      lResult: sampleData.length > 0 ? 140.33 : 165.33,
      lFmt: '$#,##0.00',
      rLabel: 'Avg Loss on Losses ($)',
      rFormula: 'IF(COUNTIF(M29:M78, "<0")=0, 0, SUMIF(M29:M78, "<0")/COUNTIF(M29:M78, "<0"))',
      rResult: sampleData.length > 0 ? -3.5 : 0.0,
      rFmt: '$#,##0.00;[Red]($#,##0.00);"-"',
    },
    {
      row: 10,
      bLabel: 'Input Dollar Target ($)',
      bVal: inputDollar,
      bFmt: '$#,##0.00',
      bIsInput: true,
      fLabel: 'Equated Avg $ Gain / Day',
      fFormula: 'J5/D13',
      fResult: 8.27,
      fFmt: '$#,##0.00',
      lLabel: 'Peak Bankroll Reached ($)',
      lFormula: 'MAX(D4, L29:L78)',
      lResult: sampleData.length > 0 ? 125.0 : startingBankroll,
      lFmt: '$#,##0.00',
      rLabel: 'Pacing vs Target Curve',
      rFormula: 'IF(P4>=J4, "GOAL HIT 🎯", IF(COUNT(L29:L78)=0, "READY", IF(P4>=INDEX(I29:I78, COUNT(L29:L78)), "AHEAD OF PACE 🚀", "BEHIND PACE ⏳")))',
      rResult: sampleData.length > 0 ? 'BEHIND PACE ⏳' : 'READY',
      rFmt: '@',
      rBold: true,
    },
    {
      row: 11,
      bLabel: 'Sprint Start Date',
      bVal: startDate,
      bFmt: 'YYYY-MM-DD',
      bIsInput: true,
      fLabel: 'Target Multiplier',
      fFormula: 'J4/D4',
      fResult: 2.65,
      fFmt: '0.00"x"',
      lLabel: 'Max Drawdown from Peak ($)',
      lFormula: 'MAX(0, P10-P4)',
      lResult: 0.0,
      lFmt: '$#,##0.00;[Red]($#,##0.00);"-"',
      rLabel: 'Active Sprint Horizon',
      rFormula: 'D7 & " Sessions (" & D13 & " Days)"',
      rResult: `${horizonCount} Sessions (20 Days)`,
      rFmt: '@',
    },
    {
      row: 12,
      bLabel: 'Sprint Target End Date',
      bVal: endDate,
      bFmt: 'YYYY-MM-DD',
      bIsInput: true,
      fLabel: 'Standard 1-Unit Stake (1%)',
      fFormula: 'D4*0.01',
      fResult: startingBankroll * 0.01,
      fFmt: '$#,##0.00',
      lLabel: 'Max Drawdown %',
      lFormula: 'IF(P10>0, (P10-P4)/P10, 0)',
      lResult: 0.0,
      lFmt: '0.00%',
      rLabel: 'Growth Structure',
      rFormula: 'D8',
      rResult: compoundingMethod,
      rFmt: '@',
    },
    {
      row: 13,
      bLabel: 'Target Calendar Days',
      bFormula: 'MAX(1, DATEVALUE(D12) - DATEVALUE(D11))',
      bResult: 20,
      bFmt: '0',
      bIsInput: false,
      fLabel: 'Safe Session Risk Cap (5%)',
      fFormula: 'D4*0.05',
      fResult: startingBankroll * 0.05,
      fFmt: '$#,##0.00',
      lLabel: 'Required Remaining Pace',
      lFormula: 'IF(OR(MAX(0, D7-COUNT(L29:L78))<=0, P4<=0), 0, IF(P4>=J4, 0, (J4/P4)^(1/MAX(1, D7-COUNT(L29:L78)))-1))',
      lResult: sampleData.length > 0 ? 0.0519 : 0.05,
      lFmt: '0.00%',
      lBold: true,
      rLabel: 'Target Engine Mode',
      rFormula: 'D5',
      rResult: targetMode,
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
      fill: COLORS.kpiBg,
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

    // Block 4: Win/Loss Stats (R label, S value)
    applyCellStyles(ws.getCell(`R${r.row}`), {
      val: r.rLabel,
      font: { size: 9, color: { argb: COLORS.textDark } },
      fill: COLORS.statsBg,
      alignment: { horizontal: 'left' },
    });

    applyCellStyles(ws.getCell(`S${r.row}`), {
      formula: r.rFormula,
      result: r.rResult,
      font: { bold: !!r.rBold, size: 9.5, color: { argb: COLORS.textDark } },
      fill: COLORS.zebraWhite,
      alignment: { horizontal: 'right' },
      numFmt: r.rFmt,
    });
  });

  // SECTION 2: PER-GAME PERFORMANCE BREAKDOWN (Rows 15 to 25)
  ws.mergeCells('B15:I15');
  applyCellStyles(ws.getCell('B15'), {
    val: '🎮 PER-GAME SPRINT PERFORMANCE BREAKDOWN (SINGLE OR MULTI-GAME)',
    font: { size: 9.5, bold: true, color: { argb: COLORS.headerText } },
    fill: COLORS.gameHeaderBg,
    alignment: { horizontal: 'left', indent: 1 },
    border: null,
  });

  ws.mergeCells('K15:S15');
  applyCellStyles(ws.getCell('K15'), {
    val: '🎯 SPRINT GAME CLASSIFICATION RULES & INSIGHTS',
    font: { size: 9.5, bold: true, color: { argb: COLORS.headerText } },
    fill: COLORS.calcHeaderBg,
    alignment: { horizontal: 'left', indent: 1 },
    border: null,
  });
  ws.getRow(15).height = 22;

  // Breakdown Table Headers (Row 16)
  const breakdownHeaders = [
    { col: 'B', text: 'Game Classification' },
    { col: 'D', text: 'Sessions' },
    { col: 'E', text: 'Total Staked ($)' },
    { col: 'F', text: 'Net P/L ($)' },
    { col: 'G', text: 'Win Rate %' },
    { col: 'H', text: 'ROI on Stake %' },
    { col: 'I', text: 'Performance Status' },
  ];

  ws.mergeCells('B16:C16');
  applyCellStyles(ws.getCell('B16'), {
    val: 'Game Classification',
    font: { bold: true, size: 9, color: { argb: COLORS.headerText } },
    fill: COLORS.tableHeaderBg,
    alignment: { horizontal: 'left', indent: 1 },
  });

  breakdownHeaders.slice(1).forEach((bh) => {
    applyCellStyles(ws.getCell(`${bh.col}16`), {
      val: bh.text,
      font: { bold: true, size: 9, color: { argb: COLORS.headerText } },
      fill: COLORS.tableHeaderBg,
      alignment: { horizontal: 'center' },
    });
  });

  // Insights Headers
  ws.mergeCells('K16:M16');
  applyCellStyles(ws.getCell('K16'), {
    val: 'Allocation Metric',
    font: { bold: true, size: 9, color: { argb: COLORS.headerText } },
    fill: COLORS.tableHeaderBg,
    alignment: { horizontal: 'left', indent: 1 },
  });

  ws.mergeCells('N16:S16');
  applyCellStyles(ws.getCell('N16'), {
    val: 'Sprint Breakdown Status / Analysis',
    font: { bold: true, size: 9, color: { argb: COLORS.headerText } },
    fill: COLORS.tableHeaderBg,
    alignment: { horizontal: 'left', indent: 1 },
  });
  ws.getRow(16).height = 22;

  // 8 Game Rows (Rows 17 to 24)
  GAME_TYPES.forEach((game, idx) => {
    const r = 17 + idx;
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

    // D: Sessions Played
    applyCellStyles(ws.getCell(`D${r}`), {
      formula: `COUNTIF(E$29:E$78, B${r})`,
      font: { size: 9.5 },
      fill,
      alignment: { horizontal: 'center' },
      numFmt: '0',
    });

    // E: Total Staked ($)
    applyCellStyles(ws.getCell(`E${r}`), {
      formula: `SUMIF(E$29:E$78, B${r}, K$29:K$78)`,
      font: { size: 9.5 },
      fill,
      alignment: { horizontal: 'right' },
      numFmt: '$#,##0.00',
    });

    // F: Net P/L ($)
    applyCellStyles(ws.getCell(`F${r}`), {
      formula: `SUMIF(E$29:E$78, B${r}, M$29:M$78)`,
      font: { bold: true, size: 9.5 },
      fill,
      alignment: { horizontal: 'right' },
      numFmt: '$#,##0.00;[Red]($#,##0.00);"-"',
    });

    // G: Win Rate %
    applyCellStyles(ws.getCell(`G${r}`), {
      formula: `IF(D${r}=0, 0, COUNTIFS(E$29:E$78, B${r}, M$29:M$78, ">0") / D${r})`,
      font: { size: 9.5 },
      fill,
      alignment: { horizontal: 'right' },
      numFmt: '0.0%',
    });

    // H: ROI on Stake %
    applyCellStyles(ws.getCell(`H${r}`), {
      formula: `IF(E${r}=0, 0, F${r} / E${r})`,
      font: { size: 9.5 },
      fill,
      alignment: { horizontal: 'right' },
      numFmt: '+0.00%;-0.00%;0.00%',
    });

    // I: Status
    applyCellStyles(ws.getCell(`I${r}`), {
      formula: `IF(D${r}=0, "No Sessions", IF(F${r}>0, "PROFITABLE ✅", IF(F${r}=0, "BREAK-EVEN ⚖", "IN DRAWDOWN 🔻")))`,
      font: { bold: true, size: 9 },
      fill,
      alignment: { horizontal: 'center' },
    });
  });

  // Row 25: Total (All Games)
  ws.getRow(25).height = 22;
  ws.mergeCells('B25:C25');
  applyCellStyles(ws.getCell('B25'), {
    val: 'TOTAL (ALL GAMES)',
    font: { bold: true, size: 9.5, color: { argb: COLORS.textDark } },
    fill: COLORS.kpiBg,
    alignment: { horizontal: 'left', indent: 1 },
  });

  applyCellStyles(ws.getCell('D25'), {
    formula: 'SUM(D17:D24)',
    font: { bold: true, size: 9.5 },
    fill: COLORS.kpiBg,
    alignment: { horizontal: 'center' },
    numFmt: '0',
  });

  applyCellStyles(ws.getCell('E25'), {
    formula: 'SUM(E17:E24)',
    font: { bold: true, size: 9.5 },
    fill: COLORS.kpiBg,
    alignment: { horizontal: 'right' },
    numFmt: '$#,##0.00',
  });

  applyCellStyles(ws.getCell('F25'), {
    formula: 'SUM(F17:F24)',
    font: { bold: true, size: 9.5 },
    fill: COLORS.kpiBg,
    alignment: { horizontal: 'right' },
    numFmt: '$#,##0.00;[Red]($#,##0.00);"-"',
  });

  applyCellStyles(ws.getCell('G25'), {
    formula: 'IF(D25=0, 0, COUNTIF(M$29:M$78, ">0") / D25)',
    font: { bold: true, size: 9.5 },
    fill: COLORS.kpiBg,
    alignment: { horizontal: 'right' },
    numFmt: '0.0%',
  });

  applyCellStyles(ws.getCell('H25'), {
    formula: 'IF(E25=0, 0, F25 / E25)',
    font: { bold: true, size: 9.5 },
    fill: COLORS.kpiBg,
    alignment: { horizontal: 'right' },
    numFmt: '+0.00%;-0.00%;0.00%',
  });

  applyCellStyles(ws.getCell('I25'), {
    formula: 'IF(D25=0, "No Sessions", IF(F25>0, "PROFITABLE ✅", IF(F25=0, "BREAK-EVEN ⚖", "IN DRAWDOWN 🔻")))',
    font: { bold: true, size: 9 },
    fill: COLORS.kpiBg,
    alignment: { horizontal: 'center' },
  });

  // Insights on the Right (Rows 17 to 25, Columns K to S)
  const insights = [
    { row: 17, label: 'Sprint Game Scope', formula: 'IF(D25=0, "Ready for First Session", IF(MAX(D17:D24)=D25, "Single-Game Dedicated (" & INDEX(B17:B24, MATCH(MAX(D17:D24), D17:D24, 0)) & ")", "Multi-Game Portfolio (" & COUNTIF(D17:D24, ">0") & " Game Types Active)"))', isBold: true },
    { row: 18, label: 'Most Active Game', formula: 'IF(D25=0, "None", INDEX(B17:B24, MATCH(MAX(D17:D24), D17:D24, 0)) & " (" & MAX(D17:D24) & " sessions)")', isBold: false },
    { row: 19, label: 'Highest Profit Game', formula: 'IF(D25=0, "None", INDEX(B17:B24, MATCH(MAX(F17:F24), F17:F24, 0)) & " (" & TEXT(MAX(F17:F24), "$#,##0.00") & ")")', isBold: true },
    { row: 20, label: 'Classification Rule', val: '1 Game per session strictly enforced via Column E dropdown.', isBold: false },
  ];

  insights.forEach((ins) => {
    ws.mergeCells(`K${ins.row}:M${ins.row}`);
    applyCellStyles(ws.getCell(`K${ins.row}`), {
      val: ins.label,
      font: { bold: true, size: 9, color: { argb: COLORS.textDark } },
      fill: COLORS.zebraLight,
      alignment: { horizontal: 'left', indent: 1 },
    });

    ws.mergeCells(`N${ins.row}:S${ins.row}`);
    applyCellStyles(ws.getCell(`N${ins.row}`), {
      val: ins.val,
      formula: ins.formula,
      font: { bold: !!ins.isBold, size: 9.5, color: { argb: COLORS.textDark } },
      fill: COLORS.zebraWhite,
      alignment: { horizontal: 'left', indent: 1 },
      numFmt: '@',
    });
  });

  // Multi-line guidance card in rows 21-25
  ws.mergeCells('K21:S25');
  applyCellStyles(ws.getCell('K21'), {
    val: '💡 GAME CLASSIFICATION INSTRUCTIONS:\n• Every session must select exactly ONE game type from the Column E dropdown.\n• You can dedicate the entire sheet to 1 game (e.g. 100% Sic Bo), OR mix multiple games across sessions.\n• The breakdown table on the left automatically updates your volume, profit, win rate, and ROI per game.',
    font: { size: 9, color: { argb: COLORS.textDark } },
    fill: COLORS.gameBg,
    border: BORDER_INPUT,
    alignment: { horizontal: 'left', vertical: 'top', wrapText: true },
  });

  // Row 27: Session Log Section Banner
  ws.mergeCells('A27:S27');
  applyCellStyles(ws.getCell('A27'), {
    val: 'SESSION PERFORMANCE LOG // Each session is classified by exactly 1 game in Column E. Starting Bankroll, Safe Cap (5%), Benchmarks, P/L, Growth %, and Status calculate automatically.',
    font: { size: 9, bold: true, color: { argb: COLORS.headerText } },
    fill: COLORS.headerBg,
    alignment: { horizontal: 'left', indent: 1 },
    border: null,
  });
  ws.getRow(27).height = 22;

  // Row 28: Table Headers (A to S)
  const tableHeaders = [
    { col: 'A', text: 'Session #' },
    { col: 'B', text: 'Day #' },
    { col: 'C', text: 'Date' },
    { col: 'D', text: 'Time' },
    { col: 'E', text: 'Game Type' },
    { col: 'F', text: 'Market / Wager Details' },
    { col: 'G', text: 'Start Bankroll ($)' },
    { col: 'H', text: 'Safe Cap (5%)' },
    { col: 'I', text: 'Benchmark Target ($)' },
    { col: 'J', text: 'Target $ Gain' },
    { col: 'K', text: 'Actual Stake ($)' },
    { col: 'L', text: 'End Bankroll ($)' },
    { col: 'M', text: 'Net P/L ($)' },
    { col: 'N', text: 'Growth %' },
    { col: 'O', text: 'Target Status' },
    { col: 'P', text: 'Variance ($)' },
    { col: 'Q', text: 'Cumulative P/L ($)' },
    { col: 'R', text: 'Sprint ROI %' },
    { col: 'S', text: 'Session Notes / Strategy / Discipline' },
  ];

  tableHeaders.forEach((th) => {
    applyCellStyles(ws.getCell(`${th.col}28`), {
      val: th.text,
      font: { bold: true, size: 9.5, color: { argb: COLORS.headerText } },
      fill: COLORS.tableHeaderBg,
      alignment: { horizontal: 'center', wrapText: true },
    });
  });
  ws.getRow(28).height = 28;

  // 50 Session Rows (Row 29 to Row 78)
  for (let i = 1; i <= 50; i++) {
    const rowNum = 28 + i;
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
      formula: `IF(C${rowNum}="","", DATEVALUE(C${rowNum}) - DATEVALUE(D$11) + 1)`,
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

    // E: Game Type (Strict 1-Game Dropdown Validation)
    applyCellStyles(ws.getCell(`E${rowNum}`), {
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

    // F: Market / Wager Details (Editable)
    applyCellStyles(ws.getCell(`F${rowNum}`), {
      val: sample ? sample.market : '',
      fill: sample ? rowFill : COLORS.inputFill,
      border: sample ? BORDER_THIN : BORDER_INPUT,
      alignment: { horizontal: 'left' },
    });

    // G: Starting Bankroll ($)
    const startFormula = i === 1 ? 'D$4' : `IF(L${rowNum - 1}="","", L${rowNum - 1})`;
    applyCellStyles(ws.getCell(`G${rowNum}`), {
      formula: startFormula,
      font: { size: 9.5 },
      fill: rowFill,
      alignment: { horizontal: 'right' },
      numFmt: '$#,##0.00',
    });

    // H: Safe Stake Cap (5%)
    applyCellStyles(ws.getCell(`H${rowNum}`), {
      formula: `IF(G${rowNum}="","", G${rowNum}*0.05)`,
      font: { size: 9, color: { argb: COLORS.textMuted } },
      fill: rowFill,
      alignment: { horizontal: 'right' },
      numFmt: '$#,##0.00',
    });

    // I: Benchmark Target ($) (Compounding roadmap curve)
    applyCellStyles(ws.getCell(`I${rowNum}`), {
      formula: `IF(D$8="Compounded", D$4*(1+J$7)^A${rowNum}, D$4+(D$4*J$7*A${rowNum}))`,
      font: { size: 9.5, color: { argb: COLORS.textMuted } },
      fill: rowFill,
      alignment: { horizontal: 'right' },
      numFmt: '$#,##0.00',
    });

    // J: Target $ Gain
    const targetGainFormula =
      i === 1 ? `IF(I${rowNum}="","", I${rowNum}-D$4)` : `IF(I${rowNum}="","", I${rowNum}-I${rowNum - 1})`;
    applyCellStyles(ws.getCell(`J${rowNum}`), {
      formula: targetGainFormula,
      font: { size: 9, color: { argb: COLORS.textMuted } },
      fill: rowFill,
      alignment: { horizontal: 'right' },
      numFmt: '$#,##0.00',
    });

    // K: Actual Stake ($) (Editable)
    applyCellStyles(ws.getCell(`K${rowNum}`), {
      val: sample ? sample.stake : null,
      fill: sample ? rowFill : COLORS.inputFill,
      border: sample ? BORDER_THIN : BORDER_INPUT,
      alignment: { horizontal: 'right' },
      numFmt: '$#,##0.00',
    });

    // L: Ending Bankroll ($) (Editable - Primary User Input)
    applyCellStyles(ws.getCell(`L${rowNum}`), {
      val: sample ? sample.end : null,
      font: { bold: true, size: 9.5 },
      fill: sample ? rowFill : COLORS.inputFill,
      border: sample ? BORDER_THIN : BORDER_INPUT,
      alignment: { horizontal: 'right' },
      numFmt: '$#,##0.00',
    });

    // M: Net P/L ($)
    applyCellStyles(ws.getCell(`M${rowNum}`), {
      formula: `IF(OR(L${rowNum}="", G${rowNum}=""), "", L${rowNum}-G${rowNum})`,
      font: { bold: true, size: 9.5 },
      fill: rowFill,
      alignment: { horizontal: 'right' },
      numFmt: '$#,##0.00;[Red]($#,##0.00);"-"',
    });

    // N: Growth %
    applyCellStyles(ws.getCell(`N${rowNum}`), {
      formula: `IF(OR(L${rowNum}="", G${rowNum}="", G${rowNum}=0), "", (L${rowNum}-G${rowNum})/G${rowNum})`,
      font: { size: 9.5 },
      fill: rowFill,
      alignment: { horizontal: 'right' },
      numFmt: '+0.00%;-0.00%;0.00%',
    });

    // O: Target Status (4 states)
    applyCellStyles(ws.getCell(`O${rowNum}`), {
      formula: `IF(L${rowNum}="","", IF(L${rowNum}>=I${rowNum}, "EXCEEDED TARGET", IF(M${rowNum}>0, "PROFITABLE", IF(M${rowNum}=0, "BREAK-EVEN", "MISSED TARGET"))))`,
      font: { bold: true, size: 9 },
      fill: rowFill,
      alignment: { horizontal: 'center' },
    });

    // P: Variance vs Target ($)
    applyCellStyles(ws.getCell(`P${rowNum}`), {
      formula: `IF(OR(L${rowNum}="", J${rowNum}=""), "", M${rowNum}-J${rowNum})`,
      font: { size: 9.5 },
      fill: rowFill,
      alignment: { horizontal: 'right' },
      numFmt: '+$#,##0.00;[Red]-$#,##0.00;$0.00',
    });

    // Q: Cumulative P/L ($)
    applyCellStyles(ws.getCell(`Q${rowNum}`), {
      formula: `IF(L${rowNum}="","", L${rowNum}-D$4)`,
      font: { bold: true, size: 9.5 },
      fill: rowFill,
      alignment: { horizontal: 'right' },
      numFmt: '$#,##0.00;[Red]($#,##0.00);"-"',
    });

    // R: Sprint ROI %
    applyCellStyles(ws.getCell(`R${rowNum}`), {
      formula: `IF(L${rowNum}="","", (L${rowNum}-D$4)/D$4)`,
      font: { bold: true, size: 9.5 },
      fill: rowFill,
      alignment: { horizontal: 'right' },
      numFmt: '+0.00%;-0.00%;0.00%',
    });

    // S: Notes (Editable)
    applyCellStyles(ws.getCell(`S${rowNum}`), {
      val: sample ? sample.notes : '',
      fill: sample ? rowFill : COLORS.inputFill,
      border: sample ? BORDER_THIN : BORDER_INPUT,
      alignment: { horizontal: 'left' },
    });
  }

  // Conditional Formatting
  ws.addConditionalFormatting({
    ref: 'M29:M78',
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
    ref: 'N29:N78',
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
    ref: 'O29:O78',
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
 * Builds the Multi-Sprint Portfolio Dashboard (aggregating Sprint 1 & Sprint 2 and cross-sprint game breakdown)
 */
function buildDashboardSheet(wb) {
  const ws = wb.addWorksheet('Multi-Sprint Dashboard', {
    views: [{ showGridLines: true, state: 'normal' }],
  });

  ws.columns = [
    { width: 11 }, // A: Sprint #
    { width: 22 }, // B: Sprint Tab / Name
    { width: 18 }, // C: Starting Bankroll ($)
    { width: 22 }, // D: Target Mode
    { width: 20 }, // E: Target Final ($)
    { width: 18 }, // F: Current Bankroll ($)
    { width: 18 }, // G: Net Profit / Loss ($)
    { width: 16 }, // H: Sprint ROI %
    { width: 16 }, // I: Goal Progress %
    { width: 16 }, // J: Sessions Logged
    { width: 16 }, // K: Win Rate %
    { width: 20 }, // L: Sprint Status
  ];

  // Banner
  ws.mergeCells('A1:L1');
  applyCellStyles(ws.getCell('A1'), {
    val: 'BET-R PLAY-R // MULTI-SPRINT PORTFOLIO DASHBOARD',
    font: { size: 14, bold: true, color: { argb: COLORS.headerText } },
    fill: COLORS.headerBg,
    alignment: { horizontal: 'left', indent: 1 },
    border: null,
  });
  ws.getRow(1).height = 36;

  ws.mergeCells('A2:L2');
  applyCellStyles(ws.getCell('A2'), {
    val: 'High-level aggregation of all bankroll challenges. Each row summarizes a distinct sprint.',
    font: { size: 9.5, italic: true, color: { argb: COLORS.textMuted } },
    fill: COLORS.zebraLight,
    alignment: { horizontal: 'left', indent: 1 },
    border: null,
  });
  ws.getRow(2).height = 20;

  // Portfolio KPI Summary Cards (Rows 4 to 5)
  const kpis = [
    { colLabel: 'B', colVal: 'C', label: 'Combined Starting Capital', formula: 'SUM(C10:C19)', result: 350.0, fmt: '$#,##0.00' },
    { colLabel: 'E', colVal: 'F', label: 'Combined Current Bankroll', formula: 'SUM(F10:F19)', result: 395.0, fmt: '$#,##0.00' },
    { colLabel: 'H', colVal: 'I', label: 'Combined Net P/L ($)', formula: 'F4-C4', result: 45.0, fmt: '$#,##0.00' },
    { colLabel: 'K', colVal: 'L', label: 'Portfolio Overall ROI %', formula: 'IF(C4>0, (F4-C4)/C4, 0)', result: 0.1286, fmt: '+0.00%;-0.00%;0.00%' },
  ];

  kpis.forEach((k) => {
    applyCellStyles(ws.getCell(`${k.colLabel}4`), {
      val: k.label,
      font: { bold: true, size: 9, color: { argb: COLORS.textMuted } },
      fill: COLORS.kpiBg,
      alignment: { horizontal: 'center' },
    });
    applyCellStyles(ws.getCell(`${k.colVal}4`), {
      formula: k.formula,
      result: k.result,
      font: { bold: true, size: 11, color: { argb: COLORS.textDark } },
      fill: COLORS.zebraWhite,
      alignment: { horizontal: 'right' },
      numFmt: k.fmt,
    });
  });
  ws.getRow(4).height = 28;

  const subKpis = [
    { colLabel: 'B', colVal: 'C', label: 'Active Sprints in Flight', formula: 'COUNTIF(L10:L19, "IN PROGRESS")', result: 2, fmt: '0' },
    { colLabel: 'E', colVal: 'F', label: 'Goals Achieved Sprints', formula: 'COUNTIF(L10:L19, "GOAL ACHIEVED")', result: 0, fmt: '0' },
    { colLabel: 'H', colVal: 'I', label: 'Total Sessions Completed', formula: 'SUM(J10:J19)', result: 7, fmt: '0' },
    { colLabel: 'K', colVal: 'L', label: 'Avg Portfolio Win Rate', formula: 'IF(COUNT(K10:K19)>0, AVERAGE(K10:K19), 0)', result: 0.85, fmt: '0.0%' },
  ];

  subKpis.forEach((k) => {
    applyCellStyles(ws.getCell(`${k.colLabel}5`), {
      val: k.label,
      font: { bold: true, size: 9, color: { argb: COLORS.textMuted } },
      fill: COLORS.zebraLight,
      alignment: { horizontal: 'center' },
    });
    applyCellStyles(ws.getCell(`${k.colVal}5`), {
      formula: k.formula,
      result: k.result,
      font: { bold: true, size: 10, color: { argb: COLORS.textDark } },
      fill: COLORS.zebraWhite,
      alignment: { horizontal: 'right' },
      numFmt: k.fmt,
    });
  });
  ws.getRow(5).height = 24;

  // Table Headers (Row 8)
  const headers = [
    { col: 'A', text: 'Sprint #' },
    { col: 'B', text: 'Sprint Tab / Name' },
    { col: 'C', text: 'Start Bankroll ($)' },
    { col: 'D', text: 'Target Mode' },
    { col: 'E', text: 'Target Goal ($)' },
    { col: 'F', text: 'Current Bankroll ($)' },
    { col: 'G', text: 'Net P/L ($)' },
    { col: 'H', text: 'Sprint ROI %' },
    { col: 'I', text: 'Goal Progress %' },
    { col: 'J', text: 'Sessions Logged' },
    { col: 'K', text: 'Win Rate %' },
    { col: 'L', text: 'Sprint Status' },
  ];

  headers.forEach((h) => {
    applyCellStyles(ws.getCell(`${h.col}8`), {
      val: h.text,
      font: { bold: true, size: 9.5, color: { argb: COLORS.headerText } },
      fill: COLORS.tableHeaderBg,
      alignment: { horizontal: 'center' },
    });
  });
  ws.getRow(8).height = 26;

  // Row 10: Sprint 1 ($100 Challenge)
  ws.getRow(10).height = 22;
  applyCellStyles(ws.getCell('A10'), { val: 1, alignment: { horizontal: 'center' }, font: { bold: true } });
  applyCellStyles(ws.getCell('B10'), { val: 'Sprint 1 - $100', font: { bold: true } });
  applyCellStyles(ws.getCell('C10'), { formula: "'Sprint 1 - $100'!D4", result: 100.0, numFmt: '$#,##0.00', alignment: { horizontal: 'right' } });
  applyCellStyles(ws.getCell('D10'), { formula: "'Sprint 1 - $100'!D5", result: '% Target per Session', alignment: { horizontal: 'center' } });
  applyCellStyles(ws.getCell('E10'), { formula: "'Sprint 1 - $100'!J4", result: 265.33, numFmt: '$#,##0.00', alignment: { horizontal: 'right' } });
  applyCellStyles(ws.getCell('F10'), { formula: "'Sprint 1 - $100'!P4", result: 125.0, numFmt: '$#,##0.00', alignment: { horizontal: 'right' }, font: { bold: true } });
  applyCellStyles(ws.getCell('G10'), { formula: "'Sprint 1 - $100'!P5", result: 25.0, numFmt: '$#,##0.00;[Red]($#,##0.00);"-"', alignment: { horizontal: 'right' }, font: { bold: true } });
  applyCellStyles(ws.getCell('H10'), { formula: "'Sprint 1 - $100'!P6", result: 0.25, numFmt: '+0.00%;-0.00%;0.00%', alignment: { horizontal: 'right' } });
  applyCellStyles(ws.getCell('I10'), { formula: "'Sprint 1 - $100'!P7", result: 0.1512, numFmt: '0.00%', alignment: { horizontal: 'right' } });
  applyCellStyles(ws.getCell('J10'), { formula: "'Sprint 1 - $100'!D25", result: 5, numFmt: '0', alignment: { horizontal: 'center' } });
  applyCellStyles(ws.getCell('K10'), { formula: "'Sprint 1 - $100'!G25", result: 0.8, numFmt: '0.0%', alignment: { horizontal: 'right' } });
  applyCellStyles(ws.getCell('L10'), {
    formula: 'IF(F10>=E10, "GOAL ACHIEVED", IF(F10<=0.25*C10, "CRITICAL DRAWDOWN", "IN PROGRESS"))',
    result: 'IN PROGRESS',
    alignment: { horizontal: 'center' },
    font: { bold: true },
  });

  // Row 11: Sprint 2 ($250 Challenge - Single-Game Dedicated)
  ws.getRow(11).height = 22;
  applyCellStyles(ws.getCell('A11'), { val: 2, alignment: { horizontal: 'center' }, font: { bold: true } });
  applyCellStyles(ws.getCell('B11'), { val: 'Sprint 2 - $250', font: { bold: true } });
  applyCellStyles(ws.getCell('C11'), { formula: "'Sprint 2 - $250'!D4", result: 250.0, numFmt: '$#,##0.00', alignment: { horizontal: 'right' } });
  applyCellStyles(ws.getCell('D11'), { formula: "'Sprint 2 - $250'!D5", result: 'Dollar Profit Target', alignment: { horizontal: 'center' } });
  applyCellStyles(ws.getCell('E11'), { formula: "'Sprint 2 - $250'!J4", result: 500.0, numFmt: '$#,##0.00', alignment: { horizontal: 'right' } });
  applyCellStyles(ws.getCell('F11'), { formula: "'Sprint 2 - $250'!P4", result: 270.0, numFmt: '$#,##0.00', alignment: { horizontal: 'right' }, font: { bold: true } });
  applyCellStyles(ws.getCell('G11'), { formula: "'Sprint 2 - $250'!P5", result: 20.0, numFmt: '$#,##0.00;[Red]($#,##0.00);"-"', alignment: { horizontal: 'right' }, font: { bold: true } });
  applyCellStyles(ws.getCell('H11'), { formula: "'Sprint 2 - $250'!P6", result: 0.08, numFmt: '+0.00%;-0.00%;0.00%', alignment: { horizontal: 'right' } });
  applyCellStyles(ws.getCell('I11'), { formula: "'Sprint 2 - $250'!P7", result: 0.08, numFmt: '0.00%', alignment: { horizontal: 'right' } });
  applyCellStyles(ws.getCell('J11'), { formula: "'Sprint 2 - $250'!D25", result: 2, numFmt: '0', alignment: { horizontal: 'center' } });
  applyCellStyles(ws.getCell('K11'), { formula: "'Sprint 2 - $250'!G25", result: 1.0, numFmt: '0.0%', alignment: { horizontal: 'right' } });
  applyCellStyles(ws.getCell('L11'), {
    formula: 'IF(F11>=E11, "GOAL ACHIEVED", IF(F11<=0.25*C11, "CRITICAL DRAWDOWN", "IN PROGRESS"))',
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
    applyCellStyles(ws.getCell(`C${r}`), { val: null, fill, numFmt: '$#,##0.00' });
    applyCellStyles(ws.getCell(`D${r}`), { val: '', fill, alignment: { horizontal: 'center' } });
    applyCellStyles(ws.getCell(`E${r}`), { val: null, fill, numFmt: '$#,##0.00' });
    applyCellStyles(ws.getCell(`F${r}`), { val: null, fill, numFmt: '$#,##0.00' });
    applyCellStyles(ws.getCell(`G${r}`), { val: null, fill, numFmt: '$#,##0.00' });
    applyCellStyles(ws.getCell(`H${r}`), { val: null, fill, numFmt: '0.00%' });
    applyCellStyles(ws.getCell(`I${r}`), { val: null, fill, numFmt: '0.00%' });
    applyCellStyles(ws.getCell(`J${r}`), { val: null, fill, numFmt: '0' });
    applyCellStyles(ws.getCell(`K${r}`), { val: null, fill, numFmt: '0.0%' });
    applyCellStyles(ws.getCell(`L${r}`), { val: 'READY TO START', fill, alignment: { horizontal: 'center' }, font: { italic: true, color: { argb: COLORS.textMuted } } });
  }

  // Row 21: Section Banner for Portfolio Game Breakdown
  ws.mergeCells('A21:L21');
  applyCellStyles(ws.getCell('A21'), {
    val: '🎮 PORTFOLIO BREAKDOWN BY GAME TYPE (CROSS-SPRINT PERFORMANCE)',
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
    { col: 'C', text: 'Sprints Featuring' },
    { col: 'D', text: 'Total Sessions' },
    { col: 'E', text: 'Total Staked ($)' },
    { col: 'F', text: 'Total Net P/L ($)' },
    { col: 'G', text: 'Win Rate %' },
    { col: 'H', text: 'ROI on Stake %' },
    { col: 'I', text: 'Portfolio Share %' },
    { col: 'J', text: 'Overall Game Status' },
  ];

  pGameHeaders.forEach((pgh) => {
    applyCellStyles(ws.getCell(`${pgh.col}22`), {
      val: pgh.text,
      font: { bold: true, size: 9, color: { argb: COLORS.headerText } },
      fill: COLORS.tableHeaderBg,
      alignment: { horizontal: 'center' },
    });
  });
  ws.mergeCells('J22:L22');
  ws.getRow(22).height = 22;

  // Rows 23 to 30: The 8 Games across sprints
  GAME_TYPES.forEach((game, gIdx) => {
    const r = 23 + gIdx;
    const isEven = gIdx % 2 === 0;
    const fill = isEven ? COLORS.zebraLight : COLORS.zebraWhite;
    const sprintRow = 17 + gIdx; // Row index inside each sprint's game breakdown

    ws.getRow(r).height = 20;

    // A: #
    applyCellStyles(ws.getCell(`A${r}`), { val: gIdx + 1, fill, alignment: { horizontal: 'center' }, numFmt: '0' });

    // B: Game
    applyCellStyles(ws.getCell(`B${r}`), { val: game, font: { bold: true }, fill, alignment: { horizontal: 'left', indent: 1 } });

    // C: Sprints Featuring
    applyCellStyles(ws.getCell(`C${r}`), {
      formula: `IF('Sprint 1 - $100'!D${sprintRow}>0, 1, 0) + IF('Sprint 2 - $250'!D${sprintRow}>0, 1, 0)`,
      fill,
      alignment: { horizontal: 'center' },
      numFmt: '0',
    });

    // D: Total Sessions
    applyCellStyles(ws.getCell(`D${r}`), {
      formula: `'Sprint 1 - $100'!D${sprintRow} + 'Sprint 2 - $250'!D${sprintRow}`,
      fill,
      alignment: { horizontal: 'center' },
      numFmt: '0',
    });

    // E: Total Staked ($)
    applyCellStyles(ws.getCell(`E${r}`), {
      formula: `'Sprint 1 - $100'!E${sprintRow} + 'Sprint 2 - $250'!E${sprintRow}`,
      fill,
      alignment: { horizontal: 'right' },
      numFmt: '$#,##0.00',
    });

    // F: Total Net P/L ($)
    applyCellStyles(ws.getCell(`F${r}`), {
      formula: `'Sprint 1 - $100'!F${sprintRow} + 'Sprint 2 - $250'!F${sprintRow}`,
      font: { bold: true },
      fill,
      alignment: { horizontal: 'right' },
      numFmt: '$#,##0.00;[Red]($#,##0.00);"-"',
    });

    // G: Win Rate %
    applyCellStyles(ws.getCell(`G${r}`), {
      formula: `IF(D${r}=0, 0, (('Sprint 1 - $100'!D${sprintRow}*'Sprint 1 - $100'!G${sprintRow}) + ('Sprint 2 - $250'!D${sprintRow}*'Sprint 2 - $250'!G${sprintRow})) / D${r})`,
      fill,
      alignment: { horizontal: 'right' },
      numFmt: '0.0%',
    });

    // H: ROI on Stake %
    applyCellStyles(ws.getCell(`H${r}`), {
      formula: `IF(E${r}=0, 0, F${r}/E${r})`,
      fill,
      alignment: { horizontal: 'right' },
      numFmt: '+0.00%;-0.00%;0.00%',
    });

    // I: Portfolio Share %
    applyCellStyles(ws.getCell(`I${r}`), {
      formula: `IF(F$4=0, 0, F${r}/F$4)`,
      fill,
      alignment: { horizontal: 'right' },
      numFmt: '0.0%',
    });

    // J: Status
    ws.mergeCells(`J${r}:L${r}`);
    applyCellStyles(ws.getCell(`J${r}`), {
      formula: `IF(D${r}=0, "Not Played Yet", IF(F${r}>0, "PROFITABLE ✅", IF(F${r}=0, "BREAK-EVEN ⚖", "IN DRAWDOWN 🔻")))`,
      font: { bold: true, size: 9 },
      fill,
      alignment: { horizontal: 'center' },
    });
  });

  // Instruction Box
  ws.mergeCells('A32:L35');
  applyCellStyles(ws.getCell('A32'), {
    val: '💡 HOW TO ADD A NEW SPRINT:\n1. Right-click the "Sprint Template" tab at the bottom and choose "Move or Copy..." -> check "Create a copy".\n2. Rename the new sheet to "Sprint 3" (or your preferred challenge name).\n3. In this Dashboard on Row 12, link the cells: C12 = \'Sprint 3\'!D4, D12 = \'Sprint 3\'!D5, E12 = \'Sprint 3\'!J4, F12 = \'Sprint 3\'!P4, etc.\n4. Your portfolio totals and game breakdowns update automatically in real time!',
    font: { size: 9, bold: false, color: { argb: COLORS.textDark } },
    fill: COLORS.inputFill,
    border: BORDER_INPUT,
    alignment: { horizontal: 'left', vertical: 'top', wrapText: true },
  });
}

/**
 * Builds the Growth Target Matrix & Staking Risk Management Guide
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
    val: 'Reference tables comparing daily / per-session compound returns, reverse-engineered rate targets, and disciplined staking unit sizing.',
    font: { size: 9.5, italic: true, color: { argb: COLORS.textMuted } },
    fill: COLORS.zebraLight,
    alignment: { horizontal: 'left', indent: 1 },
    border: null,
  });
  ws.getRow(2).height = 20;

  // SECTION 1: Compounded Growth Schedule ($100 Base)
  ws.mergeCells('A4:J4');
  applyCellStyles(ws.getCell('A4'), {
    val: '📈 TABLE 1: COMPOUNDED FINAL BANKROLL FROM $100 STARTING CAPITAL',
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
    val: '🎯 TABLE 2: REVERSE TARGET SOLVER (REQUIRED % PER SESSION TO HIT MULTIPLIER FROM $100)',
    font: { size: 10.5, bold: true, color: { argb: COLORS.headerText } },
    fill: COLORS.subHeaderBg,
    alignment: { horizontal: 'left', indent: 1 },
  });
  ws.getRow(table2Start).height = 24;

  applyCellStyles(ws.getCell(`A${table2Start + 1}`), {
    val: 'Target Bankroll Goal',
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
    { label: '$125 (1.25x / +$25)', target: 125 },
    { label: '$150 (1.50x / +$50)', target: 150 },
    { label: '$175 (1.75x / +$75)', target: 175 },
    { label: '$200 (2.00x / Double)', target: 200 },
    { label: '$250 (2.50x / +$150)', target: 250 },
    { label: '$300 (3.00x / Triple)', target: 300 },
    { label: '$400 (4.00x / 4x)', target: 400 },
    { label: '$500 (5.00x / 5x)', target: 500 },
    { label: '$1,000 (10.0x / 10x)', target: 1000 },
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

  // SECTION 3: Staking Unit & Risk Management Guide
  const table3Start = 29;
  ws.mergeCells(`A${table3Start}:J${table3Start}`);
  applyCellStyles(ws.getCell(`A${table3Start}`), {
    val: '🛡 TABLE 3: STAKING UNIT MATRIX & BANKROLL PRESERVATION GUARDRAILS',
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

  const bankrolls = [50, 100, 200, 250, 500, 1000, 2500, 5000];
  bankrolls.forEach((br, bIdx) => {
    const rNum = table3Start + 2 + bIdx;
    ws.getRow(rNum).height = 20;
    const isEven = bIdx % 2 === 0;
    const rowFill = isEven ? COLORS.zebraLight : COLORS.zebraWhite;

    applyCellStyles(ws.getCell(`A${rNum}`), { val: br, font: { bold: true, size: 9.5 }, fill: rowFill, alignment: { horizontal: 'right' }, numFmt: '$#,##0.00' });
    applyCellStyles(ws.getCell(`B${rNum}`), { formula: `A${rNum}*0.005`, result: br * 0.005, fill: rowFill, alignment: { horizontal: 'right' }, numFmt: '$#,##0.00' });
    applyCellStyles(ws.getCell(`C${rNum}`), { formula: `A${rNum}*0.01`, result: br * 0.01, fill: COLORS.badgeGreenFill, font: { bold: true }, alignment: { horizontal: 'right' }, numFmt: '$#,##0.00' });
    applyCellStyles(ws.getCell(`D${rNum}`), { formula: `A${rNum}*0.02`, result: br * 0.02, fill: rowFill, alignment: { horizontal: 'right' }, numFmt: '$#,##0.00' });
    applyCellStyles(ws.getCell(`E${rNum}`), { formula: `A${rNum}*0.03`, result: br * 0.03, fill: rowFill, alignment: { horizontal: 'right' }, numFmt: '$#,##0.00' });
    applyCellStyles(ws.getCell(`F${rNum}`), { formula: `A${rNum}*0.05`, result: br * 0.05, fill: COLORS.badgeRedFill, font: { bold: true }, alignment: { horizontal: 'right' }, numFmt: '$#,##0.00' });
    applyCellStyles(ws.getCell(`G${rNum}`), { formula: `A${rNum}*0.10`, result: br * 0.1, fill: rowFill, alignment: { horizontal: 'right' }, numFmt: '$#,##0.00' });
    applyCellStyles(ws.getCell(`H${rNum}`), { val: '+2% to +5% / session', fill: rowFill, alignment: { horizontal: 'center' } });
    applyCellStyles(ws.getCell(`I${rNum}`), { val: '+5 Units profit lock', fill: rowFill, alignment: { horizontal: 'center' } });
    applyCellStyles(ws.getCell(`J${rNum}`), { val: 'Strict Professional', fill: rowFill, alignment: { horizontal: 'center' }, font: { italic: true } });
  });

  // Callout Box
  const calloutStart = table3Start + 2 + bankrolls.length + 1;
  ws.mergeCells(`A${calloutStart}:J${calloutStart + 2}`);
  applyCellStyles(ws.getCell(`A${calloutStart}`), {
    val: '💡 GOLDEN RULES FOR COMPOUNDING BANKROLL SPRINTS:\n• 1% - 2% Rule: Risk no more than 1 to 2 standard units on any individual bet or decision.\n• 5% Hard Session Stop-Loss: If your session drawdown hits 5% of starting capital, immediately stop, close the app, and take a breather.\n• Lock in Target Milestone: When your bankroll hits or exceeds the session benchmark target, lock in profit and terminate the session.',
    font: { size: 9.5, bold: false, color: { argb: COLORS.textDark } },
    fill: COLORS.inputFill,
    border: BORDER_INPUT,
    alignment: { horizontal: 'left', vertical: 'top', wrapText: true },
  });
}

/**
 * Main Generator
 */
async function generateWorkbook() {
  console.log('Generating Enhanced Betting Bankroll Sprint Tracker (v3.0 with Game Classification)...');
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Bet-R Play-R';
  wb.lastModifiedBy = 'Bet-R Play-R';
  wb.created = new Date();
  wb.modified = new Date();

  // 1. Multi-Sprint Dashboard
  buildDashboardSheet(wb);

  // 2. Sprint 1 ($100 Bankroll Active - Demonstrates Multi-Game Mix across sessions)
  buildSprintSheet(wb, 'Sprint 1 - $100', {
    title: 'BET-R PLAY-R // SPRINT 1 ($100 CHALLENGE - MULTI-GAME MIX DEMONSTRATION)',
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
        game: 'Sic Bo',
        market: 'Small/Big + Double hedge',
        stake: 12.0,
        end: 106.5,
        notes: 'Hit stop-win after 4 winning spins; locked profit.',
      },
      {
        dayNum: 1,
        date: '2026-11-03',
        time: '14:30',
        game: 'Teen Patti',
        market: 'Pair Plus Focus',
        stake: 15.0,
        end: 112.0,
        notes: 'Hit flush on hand 7 and exited cleanly.',
      },
      {
        dayNum: 2,
        date: '2026-11-04',
        time: '11:00',
        game: 'The Kickoff',
        market: 'Over/Under 2.5 Goals',
        stake: 10.0,
        end: 108.5,
        notes: 'Late goal missed over. Respected stop-loss, no tilt.',
      },
      {
        dayNum: 2,
        date: '2026-11-04',
        time: '16:45',
        game: 'Sic Bo',
        market: 'Single Die Value Progression',
        stake: 14.0,
        end: 118.0,
        notes: 'Rebounded with base 1-unit bets.',
      },
      {
        dayNum: 3,
        date: '2026-11-05',
        time: '09:30',
        game: 'The Kickoff',
        market: '1st Half Asian Handicap',
        stake: 12.0,
        end: 125.0,
        notes: 'Bankroll at $125 (+25% sprint ROI). On track.',
      },
    ],
    isTemplate: false,
  });

  // 3. Sprint 2 ($250 Bankroll Active - Demonstrates Single-Game Dedicated: 100% Sic Bo)
  buildSprintSheet(wb, 'Sprint 2 - $250', {
    title: 'BET-R PLAY-R // SPRINT 2 ($250 CHALLENGE - SINGLE-GAME DEDICATED: SIC BO)',
    startingBankroll: 250.0,
    targetMode: 'Dollar Profit Target',
    horizonType: 'By Sessions',
    horizonCount: 25,
    compoundingMethod: 'Compounded',
    inputPct: 0.0281,
    inputDollar: 250.0,
    startDate: '2026-11-01',
    endDate: '2026-11-26',
    sampleData: [
      {
        dayNum: 1,
        date: '2026-11-01',
        time: '12:00',
        game: 'Sic Bo',
        market: 'Big/Small Flat 1-Unit Strategy',
        stake: 25.0,
        end: 262.5,
        notes: 'Clean opening session on Big pattern.',
      },
      {
        dayNum: 2,
        date: '2026-11-02',
        time: '15:30',
        game: 'Sic Bo',
        market: 'Even/Odd Progression',
        stake: 20.0,
        end: 270.0,
        notes: 'Hit session target +$7.50, locked in.',
      },
    ],
    isTemplate: false,
  });

  // 4. Sprint Template (Ready to Duplicate)
  buildSprintSheet(wb, 'Sprint Template', {
    title: 'BET-R PLAY-R // SPRINT BANKROLL TEMPLATE (DUPLICATE FOR NEW SPRINTS)',
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

  console.log('Enhanced v3.0 spreadsheet generation completed successfully!');
}

if (require.main === module) {
  generateWorkbook().catch((err) => {
    console.error('Failed to generate spreadsheet:', err);
    process.exit(1);
  });
}

module.exports = { generateWorkbook };
