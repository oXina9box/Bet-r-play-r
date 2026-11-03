/**
 * Bet-R Play-R: Betting Bankroll Sprint Tracker Spreadsheet Generator (Enhanced v2.0)
 * Generates professional Excel (.xlsx) and LibreOffice Calc (.ods) workbooks.
 *
 * Features:
 * - 4-way Dual Growth Target Engine (% per session, % per day, dollar profit, final bankroll)
 * - Automatic Calendar Day calculation from start and target end dates
 * - Session Performance Log with Day #, Safe Stake Cap (5%), Target Curve, and 4-state Target Status
 * - Deep Risk KPIs: Peak Bankroll, Max Drawdown ($ and %), Profit Factor, Win-Loss Record
 * - In-cell Unicode Visual Progress Bar
 * - Native Excel Conditional Formatting (Green/Red highlighting)
 * - Multi-Sprint Portfolio Dashboard linking Sprint 1 ($100) and Sprint 2 ($250)
 * - Growth Target Matrix with Staking Unit & Risk Management Guide
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
 * Builds a Sprint Tab with 4-way growth target engine, pacing KPIs, and 50 session rows.
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

  // 18 Column Widths (A to R)
  ws.columns = [
    { width: 11 }, // A: Session #
    { width: 9 },  // B: Day #
    { width: 13 }, // C: Date
    { width: 10 }, // D: Time
    { width: 26 }, // E: Game / Market / Sport
    { width: 16 }, // F: Start Bankroll ($)
    { width: 16 }, // G: Safe Stake Cap (5%)
    { width: 17 }, // H: Benchmark Target ($)
    { width: 15 }, // I: Target $ Gain
    { width: 15 }, // J: Actual Stake ($)
    { width: 16 }, // K: End Bankroll ($)
    { width: 16 }, // L: Net P/L ($)
    { width: 14 }, // M: Growth %
    { width: 18 }, // N: Target Status
    { width: 15 }, // O: Variance ($)
    { width: 16 }, // P: Cumulative P/L ($)
    { width: 14 }, // Q: Sprint ROI %
    { width: 34 }, // R: Session Notes / Strategy
  ];

  // Row 1: Title Banner
  ws.mergeCells('A1:R1');
  applyCellStyles(ws.getCell('A1'), {
    val: title,
    font: { size: 14, bold: true, color: { argb: COLORS.headerText } },
    fill: COLORS.headerBg,
    alignment: { horizontal: 'left', indent: 1 },
    border: null,
  });
  ws.getRow(1).height = 36;

  // Row 2: Subtitle & Instructions
  ws.mergeCells('A2:R2');
  applyCellStyles(ws.getCell('A2'), {
    val: 'Dual Target Engine: Choose % target per session/day to equate dollar targets, OR choose dollar profit to solve backwards to required % per session/day.',
    font: { size: 9.5, italic: true, color: { argb: COLORS.textMuted } },
    fill: COLORS.zebraLight,
    alignment: { horizontal: 'left', indent: 1 },
    border: null,
  });
  ws.getRow(2).height = 20;

  // Row 3: 4 Section Headers Across the 18 Columns
  // Block 1: Setup & Inputs (B3:D3)
  ws.mergeCells('B3:D3');
  applyCellStyles(ws.getCell('B3'), {
    val: '⚙ SPRINT SETUP & TARGET CONFIG (INPUTS)',
    font: { bold: true, size: 9.5, color: { argb: COLORS.headerText } },
    fill: COLORS.subHeaderBg,
    alignment: { horizontal: 'center' },
  });

  // Block 2: Calculated Target Goals (F3:I3)
  ws.mergeCells('F3:I3');
  applyCellStyles(ws.getCell('F3'), {
    val: '🎯 EQUATED TARGET GOALS (DUAL-ENGINE OUTPUT)',
    font: { bold: true, size: 9.5, color: { argb: COLORS.headerText } },
    fill: COLORS.calcHeaderBg,
    alignment: { horizontal: 'center' },
  });

  // Block 3: Live Pacing & Drawdown (K3:O3)
  ws.mergeCells('K3:O3');
  applyCellStyles(ws.getCell('K3'), {
    val: '📊 LIVE PERFORMANCE, PACING & DRAWDOWN',
    font: { bold: true, size: 9.5, color: { argb: COLORS.headerText } },
    fill: COLORS.kpiHeaderBg,
    alignment: { horizontal: 'center' },
  });

  // Block 4: Win/Loss & Discipline Stats (P3:R3)
  ws.mergeCells('P3:R3');
  applyCellStyles(ws.getCell('P3'), {
    val: '🏆 WIN/LOSS & DISCIPLINE STATS',
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
      kLabel: 'Current Bankroll ($)',
      kFormula: 'IF(COUNT(K16:K65)>0, LOOKUP(2, 1/(K16:K65<>""), K16:K65), D4)',
      kResult: sampleData.length > 0 ? sampleData[sampleData.length - 1].end : startingBankroll,
      kFmt: '$#,##0.00',
      kBold: true,
      pLabel: 'Sessions Logged / Left',
      pFormula: 'COUNT(K16:K65) & " / " & MAX(0, D7-COUNT(K16:K65))',
      pResult: `${sampleData.length} / ${Math.max(0, horizonCount - sampleData.length)}`,
      pFmt: '@',
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
      fFormula: 'I4-D4',
      fResult: 165.33,
      fFmt: '$#,##0.00',
      fBold: true,
      kLabel: 'Current Net Profit / Loss ($)',
      kFormula: 'N4-D4',
      kResult: sampleData.length > 0 ? sampleData[sampleData.length - 1].end - startingBankroll : 0.0,
      kFmt: '$#,##0.00;[Red]($#,##0.00);"-"',
      kBold: true,
      pLabel: 'Session Win / Loss Record',
      pFormula: 'COUNTIF(L16:L65, ">0") & "W - " & COUNTIF(L16:L65, "<0") & "L"',
      pResult: '4W - 1L',
      pFmt: '@',
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
      fFormula: '(I4-D4)/D4',
      fResult: 1.6533,
      fFmt: '0.00%',
      fBold: true,
      kLabel: 'Current Sprint ROI %',
      kFormula: '(N4-D4)/D4',
      kResult: sampleData.length > 0 ? (sampleData[sampleData.length - 1].end - startingBankroll) / startingBankroll : 0.0,
      kFmt: '+0.00%;-0.00%;0.00%',
      kBold: true,
      pLabel: 'Session Win Rate %',
      pFormula: 'IF(COUNT(K16:K65)=0, 0, COUNTIF(L16:L65, ">0")/COUNT(K16:K65))',
      pResult: sampleData.length > 0 ? 0.8 : 0.0,
      pFmt: '0.0%',
      pBold: true,
    },
    {
      row: 7,
      bLabel: 'Target Session Count (N)',
      bVal: horizonCount,
      bFmt: '0',
      bIsInput: true,
      fLabel: 'Equated % per Session',
      fFormula: 'IF(D5="% Target per Session", D9, IF(D8="Compounded", (I4/D4)^(1/D7)-1, (I4-D4)/(D4*D7)))',
      fResult: 0.05,
      fFmt: '0.00%',
      fBold: true,
      kLabel: 'Target Progress %',
      kFormula: 'IF(I5=0, 0, (N4-D4)/I5)',
      kResult: sampleData.length > 0 ? 0.1512 : 0.0,
      kFmt: '0.00%',
      kBold: true,
      pLabel: 'Profit Factor (Wins / Losses)',
      pFormula: 'IF(SUMIF(L16:L65, "<0")=0, "Undefeated", ROUND(ABS(SUMIF(L16:L65, ">0")/SUMIF(L16:L65, "<0")), 2))',
      pResult: 8.14,
      pFmt: '@',
      pBold: true,
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
      fFormula: 'IF(D5="% Target per Day", D9, IF(D8="Compounded", (I4/D4)^(1/D13)-1, (I4-D4)/(D4*D13)))',
      fResult: 0.05,
      fFmt: '0.00%',
      fBold: true,
      kLabel: 'Goal Progress Bar',
      kFormula: 'REPT("█", MIN(12, MAX(0, INT(N7*12)))) & REPT("░", 12 - MIN(12, MAX(0, INT(N7*12)))) & " " & TEXT(N7, "0.0%")',
      kResult: sampleData.length > 0 ? '█░░░░░░░░░░░ 15.1%' : '░░░░░░░░░░░░ 0.0%',
      kFmt: '@',
      pLabel: 'Avg Profit on Wins ($)',
      pFormula: 'IF(COUNTIF(L16:L65, ">0")=0, 0, SUMIF(L16:L65, ">0")/COUNTIF(L16:L65, ">0"))',
      pResult: sampleData.length > 0 ? 7.13 : 0.0,
      pFmt: '$#,##0.00',
    },
    {
      row: 9,
      bLabel: 'Input Target % Rate',
      bVal: inputPct,
      bFmt: '0.00%',
      bIsInput: true,
      fLabel: 'Equated Avg $ Gain / Session',
      fFormula: 'I5/D7',
      fResult: 8.27,
      fFmt: '$#,##0.00',
      kLabel: 'Remaining to Target ($)',
      kFormula: 'MAX(0, I4-N4)',
      kResult: sampleData.length > 0 ? 140.33 : 165.33,
      kFmt: '$#,##0.00',
      pLabel: 'Avg Loss on Losses ($)',
      pFormula: 'IF(COUNTIF(L16:L65, "<0")=0, 0, SUMIF(L16:L65, "<0")/COUNTIF(L16:L65, "<0"))',
      pResult: sampleData.length > 0 ? -3.5 : 0.0,
      pFmt: '$#,##0.00;[Red]($#,##0.00);"-"',
    },
    {
      row: 10,
      bLabel: 'Input Dollar Target ($)',
      bVal: inputDollar,
      bFmt: '$#,##0.00',
      bIsInput: true,
      fLabel: 'Equated Avg $ Gain / Day',
      fFormula: 'I5/D13',
      fResult: 8.27,
      fFmt: '$#,##0.00',
      kLabel: 'Peak Bankroll Reached ($)',
      kFormula: 'MAX(D4, K16:K65)',
      kResult: sampleData.length > 0 ? 125.0 : startingBankroll,
      kFmt: '$#,##0.00',
      pLabel: 'Pacing vs Target Curve',
      pFormula: 'IF(N4>=I4, "GOAL HIT 🎯", IF(COUNT(K16:K65)=0, "READY", IF(N4>=INDEX(H16:H65, COUNT(K16:K65)), "AHEAD OF PACE 🚀", "BEHIND PACE ⏳")))',
      pResult: sampleData.length > 0 ? 'BEHIND PACE ⏳' : 'READY',
      pFmt: '@',
      pBold: true,
    },
    {
      row: 11,
      bLabel: 'Sprint Start Date',
      bVal: startDate,
      bFmt: 'YYYY-MM-DD',
      bIsInput: true,
      fLabel: 'Target Multiplier',
      fFormula: 'I4/D4',
      fResult: 2.65,
      fFmt: '0.00"x"',
      kLabel: 'Max Drawdown from Peak ($)',
      kFormula: 'MAX(0, N10-N4)',
      kResult: 0.0,
      kFmt: '$#,##0.00;[Red]($#,##0.00);"-"',
      pLabel: 'Active Sprint Horizon',
      pFormula: 'D7 & " Sessions (" & D13 & " Days)"',
      pResult: `${horizonCount} Sessions (20 Days)`,
      pFmt: '@',
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
      kLabel: 'Max Drawdown %',
      kFormula: 'IF(N10>0, (N10-N4)/N10, 0)',
      kResult: 0.0,
      kFmt: '0.00%',
      pLabel: 'Growth Structure',
      pFormula: 'D8',
      pResult: compoundingMethod,
      pFmt: '@',
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
      kLabel: 'Required Remaining Pace',
      kFormula: 'IF(OR(MAX(0, D7-COUNT(K16:K65))<=0, N4<=0), 0, IF(N4>=I4, 0, (I4/N4)^(1/MAX(1, D7-COUNT(K16:K65)))-1))',
      kResult: sampleData.length > 0 ? 0.0519 : 0.05,
      kFmt: '0.00%',
      kBold: true,
      pLabel: 'Active Target Engine',
      pFormula: 'D5',
      pResult: targetMode,
      pFmt: '@',
    },
  ];

  gridRows.forEach((r) => {
    ws.getRow(r.row).height = 20;

    // Block 1: Setup (B: label, D: value)
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

    // Block 2: Equated Target Goals (F:G label, I: value)
    ws.mergeCells(`F${r.row}:H${r.row}`);
    applyCellStyles(ws.getCell(`F${r.row}`), {
      val: r.fLabel,
      font: { size: 9.5, color: { argb: COLORS.textDark } },
      fill: COLORS.zebraLight,
      alignment: { horizontal: 'left' },
    });

    applyCellStyles(ws.getCell(`I${r.row}`), {
      formula: r.fFormula,
      result: r.fResult,
      font: { bold: !!r.fBold, size: 9.5, color: { argb: COLORS.textDark } },
      fill: COLORS.zebraWhite,
      alignment: { horizontal: 'right' },
      numFmt: r.fFmt,
    });

    // Block 3: Live Pacing & Drawdown (K:L label, N:O value)
    ws.mergeCells(`K${r.row}:M${r.row}`);
    applyCellStyles(ws.getCell(`K${r.row}`), {
      val: r.kLabel,
      font: { size: 9.5, color: { argb: COLORS.textDark } },
      fill: COLORS.kpiBg,
      alignment: { horizontal: 'left' },
    });

    ws.mergeCells(`N${r.row}:O${r.row}`);
    applyCellStyles(ws.getCell(`N${r.row}`), {
      formula: r.kFormula,
      result: r.kResult,
      font: { bold: !!r.kBold, size: 9.5, color: { argb: COLORS.textDark } },
      fill: COLORS.zebraWhite,
      alignment: { horizontal: 'right' },
      numFmt: r.kFmt,
    });

    // Block 4: Win/Loss Stats (P:Q label, R: value)
    ws.mergeCells(`P${r.row}:Q${r.row}`);
    applyCellStyles(ws.getCell(`P${r.row}`), {
      val: r.pLabel,
      font: { size: 9, color: { argb: COLORS.textDark } },
      fill: COLORS.statsBg,
      alignment: { horizontal: 'left' },
    });

    applyCellStyles(ws.getCell(`R${r.row}`), {
      formula: r.pFormula,
      result: r.pResult,
      font: { bold: !!r.pBold, size: 9.5, color: { argb: COLORS.textDark } },
      fill: COLORS.zebraWhite,
      alignment: { horizontal: 'right' },
      numFmt: r.pFmt,
    });
  });

  // Row 14: Session Log Section Banner
  ws.mergeCells('A14:R14');
  applyCellStyles(ws.getCell('A14'), {
    val: 'SESSION PERFORMANCE LOG // Log Date, Time, Game/Market, Stake, and Ending Bankroll below. Starting Bankroll, Safe Cap (5%), Targets, Growth %, and Status calculate automatically.',
    font: { size: 9, bold: true, color: { argb: COLORS.headerText } },
    fill: COLORS.headerBg,
    alignment: { horizontal: 'left', indent: 1 },
    border: null,
  });
  ws.getRow(14).height = 22;

  // Row 15: Table Headers (A to R)
  const tableHeaders = [
    { col: 'A', text: 'Session #' },
    { col: 'B', text: 'Day #' },
    { col: 'C', text: 'Date' },
    { col: 'D', text: 'Time' },
    { col: 'E', text: 'Game / Market / Sport' },
    { col: 'F', text: 'Start Bankroll ($)' },
    { col: 'G', text: 'Safe Cap (5%)' },
    { col: 'H', text: 'Benchmark Target ($)' },
    { col: 'I', text: 'Target $ Gain' },
    { col: 'J', text: 'Actual Stake ($)' },
    { col: 'K', text: 'End Bankroll ($)' },
    { col: 'L', text: 'Net P/L ($)' },
    { col: 'M', text: 'Growth %' },
    { col: 'N', text: 'Target Status' },
    { col: 'O', text: 'Variance ($)' },
    { col: 'P', text: 'Cumulative P/L ($)' },
    { col: 'Q', text: 'Sprint ROI %' },
    { col: 'R', text: 'Session Notes / Strategy / Discipline' },
  ];

  tableHeaders.forEach((th) => {
    applyCellStyles(ws.getCell(`${th.col}15`), {
      val: th.text,
      font: { bold: true, size: 9.5, color: { argb: COLORS.headerText } },
      fill: COLORS.tableHeaderBg,
      alignment: { horizontal: 'center', wrapText: true },
    });
  });
  ws.getRow(15).height = 28;

  // 50 Session Rows (Row 16 to Row 65)
  for (let i = 1; i <= 50; i++) {
    const rowNum = 15 + i;
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

    // E: Game / Market (Editable)
    applyCellStyles(ws.getCell(`E${rowNum}`), {
      val: sample ? sample.market : '',
      fill: sample ? rowFill : COLORS.inputFill,
      border: sample ? BORDER_THIN : BORDER_INPUT,
      alignment: { horizontal: 'left' },
    });

    // F: Starting Bankroll ($)
    const startFormula = i === 1 ? 'D$4' : `IF(K${rowNum - 1}="","", K${rowNum - 1})`;
    applyCellStyles(ws.getCell(`F${rowNum}`), {
      formula: startFormula,
      font: { size: 9.5 },
      fill: rowFill,
      alignment: { horizontal: 'right' },
      numFmt: '$#,##0.00',
    });

    // G: Safe Stake Cap (5%)
    applyCellStyles(ws.getCell(`G${rowNum}`), {
      formula: `IF(F${rowNum}="","", F${rowNum}*0.05)`,
      font: { size: 9, color: { argb: COLORS.textMuted } },
      fill: rowFill,
      alignment: { horizontal: 'right' },
      numFmt: '$#,##0.00',
    });

    // H: Benchmark Target ($) (Pre-plotted roadmap curve)
    applyCellStyles(ws.getCell(`H${rowNum}`), {
      formula: `IF(D$8="Compounded", D$4*(1+I$7)^A${rowNum}, D$4+(D$4*I$7*A${rowNum}))`,
      font: { size: 9.5, color: { argb: COLORS.textMuted } },
      fill: rowFill,
      alignment: { horizontal: 'right' },
      numFmt: '$#,##0.00',
    });

    // I: Target $ Gain
    const targetGainFormula =
      i === 1 ? `IF(H${rowNum}="","", H${rowNum}-D$4)` : `IF(H${rowNum}="","", H${rowNum}-H${rowNum - 1})`;
    applyCellStyles(ws.getCell(`I${rowNum}`), {
      formula: targetGainFormula,
      font: { size: 9, color: { argb: COLORS.textMuted } },
      fill: rowFill,
      alignment: { horizontal: 'right' },
      numFmt: '$#,##0.00',
    });

    // J: Actual Stake ($) (Editable)
    applyCellStyles(ws.getCell(`J${rowNum}`), {
      val: sample ? sample.stake : null,
      fill: sample ? rowFill : COLORS.inputFill,
      border: sample ? BORDER_THIN : BORDER_INPUT,
      alignment: { horizontal: 'right' },
      numFmt: '$#,##0.00',
    });

    // K: Ending Bankroll ($) (Editable - Primary User Input)
    applyCellStyles(ws.getCell(`K${rowNum}`), {
      val: sample ? sample.end : null,
      font: { bold: true, size: 9.5 },
      fill: sample ? rowFill : COLORS.inputFill,
      border: sample ? BORDER_THIN : BORDER_INPUT,
      alignment: { horizontal: 'right' },
      numFmt: '$#,##0.00',
    });

    // L: Net P/L ($)
    applyCellStyles(ws.getCell(`L${rowNum}`), {
      formula: `IF(OR(K${rowNum}="", F${rowNum}=""), "", K${rowNum}-F${rowNum})`,
      font: { bold: true, size: 9.5 },
      fill: rowFill,
      alignment: { horizontal: 'right' },
      numFmt: '$#,##0.00;[Red]($#,##0.00);"-"',
    });

    // M: Growth %
    applyCellStyles(ws.getCell(`M${rowNum}`), {
      formula: `IF(OR(K${rowNum}="", F${rowNum}="", F${rowNum}=0), "", (K${rowNum}-F${rowNum})/F${rowNum})`,
      font: { size: 9.5 },
      fill: rowFill,
      alignment: { horizontal: 'right' },
      numFmt: '+0.00%;-0.00%;0.00%',
    });

    // N: Target Status (4 states)
    applyCellStyles(ws.getCell(`N${rowNum}`), {
      formula: `IF(K${rowNum}="","", IF(K${rowNum}>=H${rowNum}, "EXCEEDED TARGET", IF(L${rowNum}>0, "PROFITABLE", IF(L${rowNum}=0, "BREAK-EVEN", "MISSED TARGET"))))`,
      font: { bold: true, size: 9 },
      fill: rowFill,
      alignment: { horizontal: 'center' },
    });

    // O: Variance vs Target ($)
    applyCellStyles(ws.getCell(`O${rowNum}`), {
      formula: `IF(OR(K${rowNum}="", I${rowNum}=""), "", L${rowNum}-I${rowNum})`,
      font: { size: 9.5 },
      fill: rowFill,
      alignment: { horizontal: 'right' },
      numFmt: '+$#,##0.00;[Red]-$#,##0.00;$0.00',
    });

    // P: Cumulative P/L ($)
    applyCellStyles(ws.getCell(`P${rowNum}`), {
      formula: `IF(K${rowNum}="","", K${rowNum}-D$4)`,
      font: { bold: true, size: 9.5 },
      fill: rowFill,
      alignment: { horizontal: 'right' },
      numFmt: '$#,##0.00;[Red]($#,##0.00);"-"',
    });

    // Q: Sprint ROI %
    applyCellStyles(ws.getCell(`Q${rowNum}`), {
      formula: `IF(K${rowNum}="","", (K${rowNum}-D$4)/D$4)`,
      font: { bold: true, size: 9.5 },
      fill: rowFill,
      alignment: { horizontal: 'right' },
      numFmt: '+0.00%;-0.00%;0.00%',
    });

    // R: Notes (Editable)
    applyCellStyles(ws.getCell(`R${rowNum}`), {
      val: sample ? sample.notes : '',
      fill: sample ? rowFill : COLORS.inputFill,
      border: sample ? BORDER_THIN : BORDER_INPUT,
      alignment: { horizontal: 'left' },
    });
  }

  // Native Excel / Calc Conditional Formatting Rules
  ws.addConditionalFormatting({
    ref: 'L16:L65',
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
    ref: 'M16:M65',
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
    ref: 'N16:N65',
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
 * Builds the Multi-Sprint Portfolio Dashboard (aggregating Sprint 1 & Sprint 2)
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
  applyCellStyles(ws.getCell('E10'), { formula: "'Sprint 1 - $100'!I4", result: 265.33, numFmt: '$#,##0.00', alignment: { horizontal: 'right' } });
  applyCellStyles(ws.getCell('F10'), { formula: "'Sprint 1 - $100'!N4", result: 125.0, numFmt: '$#,##0.00', alignment: { horizontal: 'right' }, font: { bold: true } });
  applyCellStyles(ws.getCell('G10'), { formula: "'Sprint 1 - $100'!N5", result: 25.0, numFmt: '$#,##0.00;[Red]($#,##0.00);"-"', alignment: { horizontal: 'right' }, font: { bold: true } });
  applyCellStyles(ws.getCell('H10'), { formula: "'Sprint 1 - $100'!N6", result: 0.25, numFmt: '+0.00%;-0.00%;0.00%', alignment: { horizontal: 'right' } });
  applyCellStyles(ws.getCell('I10'), { formula: "'Sprint 1 - $100'!N7", result: 0.1512, numFmt: '0.00%', alignment: { horizontal: 'right' } });
  applyCellStyles(ws.getCell('J10'), { formula: "COUNT('Sprint 1 - $100'!K16:K65)", result: 5, numFmt: '0', alignment: { horizontal: 'center' } });
  applyCellStyles(ws.getCell('K10'), { formula: "'Sprint 1 - $100'!R6", result: 0.8, numFmt: '0.0%', alignment: { horizontal: 'right' } });
  applyCellStyles(ws.getCell('L10'), {
    formula: 'IF(F10>=E10, "GOAL ACHIEVED", IF(F10<=0.25*C10, "CRITICAL DRAWDOWN", "IN PROGRESS"))',
    result: 'IN PROGRESS',
    alignment: { horizontal: 'center' },
    font: { bold: true },
  });

  // Row 11: Sprint 2 ($250 Challenge - Demonstrating Dollar Profit Mode)
  ws.getRow(11).height = 22;
  applyCellStyles(ws.getCell('A11'), { val: 2, alignment: { horizontal: 'center' }, font: { bold: true } });
  applyCellStyles(ws.getCell('B11'), { val: 'Sprint 2 - $250', font: { bold: true } });
  applyCellStyles(ws.getCell('C11'), { formula: "'Sprint 2 - $250'!D4", result: 250.0, numFmt: '$#,##0.00', alignment: { horizontal: 'right' } });
  applyCellStyles(ws.getCell('D11'), { formula: "'Sprint 2 - $250'!D5", result: 'Dollar Profit Target', alignment: { horizontal: 'center' } });
  applyCellStyles(ws.getCell('E11'), { formula: "'Sprint 2 - $250'!I4", result: 500.0, numFmt: '$#,##0.00', alignment: { horizontal: 'right' } });
  applyCellStyles(ws.getCell('F11'), { formula: "'Sprint 2 - $250'!N4", result: 270.0, numFmt: '$#,##0.00', alignment: { horizontal: 'right' }, font: { bold: true } });
  applyCellStyles(ws.getCell('G11'), { formula: "'Sprint 2 - $250'!N5", result: 20.0, numFmt: '$#,##0.00;[Red]($#,##0.00);"-"', alignment: { horizontal: 'right' }, font: { bold: true } });
  applyCellStyles(ws.getCell('H11'), { formula: "'Sprint 2 - $250'!N6", result: 0.08, numFmt: '+0.00%;-0.00%;0.00%', alignment: { horizontal: 'right' } });
  applyCellStyles(ws.getCell('I11'), { formula: "'Sprint 2 - $250'!N7", result: 0.08, numFmt: '0.00%', alignment: { horizontal: 'right' } });
  applyCellStyles(ws.getCell('J11'), { formula: "COUNT('Sprint 2 - $250'!K16:K65)", result: 2, numFmt: '0', alignment: { horizontal: 'center' } });
  applyCellStyles(ws.getCell('K11'), { formula: "'Sprint 2 - $250'!R6", result: 1.0, numFmt: '0.0%', alignment: { horizontal: 'right' } });
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

  // Row 21: Instruction Callout Box
  ws.mergeCells('A21:L24');
  applyCellStyles(ws.getCell('A21'), {
    val: '💡 HOW TO ADD A NEW SPRINT:\n1. Right-click the "Sprint Template" tab at the bottom and choose "Move or Copy..." -> check "Create a copy".\n2. Rename the new sheet to "Sprint 3" (or your preferred challenge name).\n3. In this Dashboard on Row 12, link the cells: C12 = \'Sprint 3\'!D4, D12 = \'Sprint 3\'!D5, E12 = \'Sprint 3\'!I4, F12 = \'Sprint 3\'!N4, etc.\n4. Your portfolio totals in the cards above update automatically across all active sprints!',
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

  // Callout Box at bottom
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
  console.log('Generating Enhanced Betting Bankroll Sprint Tracker...');
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Bet-R Play-R';
  wb.lastModifiedBy = 'Bet-R Play-R';
  wb.created = new Date();
  wb.modified = new Date();

  // 1. Multi-Sprint Dashboard
  buildDashboardSheet(wb);

  // 2. Sprint 1 ($100 Bankroll Active - Mode A: % Target)
  buildSprintSheet(wb, 'Sprint 1 - $100', {
    title: 'BET-R PLAY-R // SPRINT 1 ($100 BANKROLL CHALLENGE - MODE A: % TARGET DRIVEN)',
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
        market: 'Sic Bo (Small/Big + Double)',
        stake: 12.0,
        end: 106.5,
        notes: 'Hit stop-win after 4 winning spins; locked profit.',
      },
      {
        dayNum: 1,
        date: '2026-11-03',
        time: '14:30',
        market: 'Teen Patti (Pair Plus Focus)',
        stake: 15.0,
        end: 112.0,
        notes: 'Hit flush on hand 7 and exited cleanly.',
      },
      {
        dayNum: 2,
        date: '2026-11-04',
        time: '11:00',
        market: 'Kickoff (Over/Under Goals)',
        stake: 10.0,
        end: 108.5,
        notes: 'Late goal missed over. Respected stop-loss, no tilt.',
      },
      {
        dayNum: 2,
        date: '2026-11-04',
        time: '16:45',
        market: 'Sic Bo (Single Die Value)',
        stake: 14.0,
        end: 118.0,
        notes: 'Rebounded with base 1-unit bets.',
      },
      {
        dayNum: 3,
        date: '2026-11-05',
        time: '09:30',
        market: 'Kickoff (1st Half Asian Handicap)',
        stake: 12.0,
        end: 125.0,
        notes: 'Bankroll at $125 (+25% sprint ROI). On track.',
      },
    ],
    isTemplate: false,
  });

  // 3. Sprint 2 ($250 Bankroll Active - Mode B: Dollar Profit Target)
  buildSprintSheet(wb, 'Sprint 2 - $250', {
    title: 'BET-R PLAY-R // SPRINT 2 ($250 CHALLENGE - MODE B: DOLLAR PROFIT DRIVEN)',
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
        market: 'Premier League Match Odds',
        stake: 25.0,
        end: 262.5,
        notes: 'Clean opening win on home favorite.',
      },
      {
        dayNum: 2,
        date: '2026-11-02',
        time: '15:30',
        market: 'Sic Bo (Even/Odd Progression)',
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

  console.log('Enhanced spreadsheet generation completed successfully!');
}

if (require.main === module) {
  generateWorkbook().catch((err) => {
    console.error('Failed to generate spreadsheet:', err);
    process.exit(1);
  });
}

module.exports = { generateWorkbook };
