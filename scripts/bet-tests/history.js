'use strict';
// Pure-result adapters: source files are opened only for reading.
const fs = require('node:fs/promises');
const path = require('node:path');
const GAME_META = Object.freeze({
  kickoff: Object.freeze({ id: 'kickoff', name: 'The Kickoff', file: 'The_Kickoff_Results.xlsx', labels: ['Red', 'Blue', 'Draw'], tiePush: false }),
  sicbo: Object.freeze({ id: 'sicbo', name: 'Sic Bo', file: 'Sic_Bo_Results.xlsx', labels: ['Big', 'Small', 'Any Triple'], tiePush: false }),
  teenpatti: Object.freeze({ id: 'teenpatti', name: 'Teen Patti', file: 'Teen_Patti_Results.xlsx', labels: ['Player A', 'Player B', 'Tie'], tiePush: true }),
  baccarat: Object.freeze({ id: 'baccarat', name: 'Baccarat', file: 'Baccarat_Results.xlsx', labels: ['Player', 'Banker', 'Tie'], tiePush: true })
});
const games = Object.fromEntries(Object.keys(GAME_META).map(game => [game, require(`../../js/games/${game}`)]));
const canonical = key => String(key).toLowerCase().replace(/#/g, 'number').replace(/[^a-z0-9]/g, '');
const present = value => value !== undefined && value !== null && value !== '';
const fail = message => { throw new Error(message); };
function meta(game) { return Object.hasOwn(GAME_META, game) ? GAME_META[game] : fail(`Unknown game: ${game}`); }
function fields(row) {
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [canonical(key), value]));
}
function pick(row, ...names) { return names.map(canonical).map(name => row[name]).find(present); }
function boolean(value) {
  if (!present(value)) return undefined;
  if ([true, 1, '1', 'true', 'TRUE', 'Yes', 'YES', 'yes', 'Y'].includes(value)) return true;
  if ([false, 0, '0', 'false', 'FALSE', 'No', 'NO', 'no', 'N'].includes(value)) return false;
  return fail('Invalid triple/lossAll flag');
}
function timestamp(value) {
  if (!present(value)) return null;
  const number = value instanceof Date ? value.getTime() : typeof value === 'number' || /^\d+(?:\.\d+)?$/.test(String(value)) ? Number(value) : Date.parse(value);
  if (!Number.isFinite(number) || number < 0 || number > 8640000000000000) fail('Invalid timestamp');
  return number;
}
function winner(game, value) {
  if (!present(value)) return null;
  const name = canonical(value);
  if (['a', canonical(GAME_META[game].labels[0]), 'sidea', ...(game === 'kickoff' ? ['r', 'redwins'] : [])].includes(name)) return 'A';
  if (['b', canonical(GAME_META[game].labels[1]), 'sideb', ...(game === 'kickoff' ? ['bluewins'] : [])].includes(name)) return 'B';
  if (['d', 't', 'draw', 'tie', 'triple', 'anytriple', 'lossall'].includes(name)) return 'D';
  return fail(`Invalid ${game} outcome: ${value}`);
}
function parseRaw(value) {
  if (!present(value)) return undefined;
  if (typeof value !== 'string') return structuredClone(value);
  if (/^\s*[\[{]/.test(value)) {
    try { return JSON.parse(value); } catch { return fail('Invalid raw JSON'); }
  }
  return value;
}
function rawOutcome(game, raw) {
  if (!present(raw)) return null;
  if (Array.isArray(raw)) {
    if (!['kickoff', 'sicbo'].includes(game) || raw.length !== (game === 'sicbo' ? 3 : 2) || !raw.every(n => Number.isInteger(n) && n >= 1 && n <= 6)) fail('Invalid dice');
  } else if (typeof raw === 'object') {
    if (present(raw.w)) {
      const side = winner(game, raw.w);
      return side;
    }
    if (!['teenpatti', 'baccarat'].includes(game) || !Array.isArray(raw.c) || (game === 'teenpatti' ? raw.c.length !== 6 : raw.c.length < 4 || raw.c.length > 6) || !raw.c.every(c => /^(?:[2-9]|10|J|Q|K|A)[hdsc]$/.test(c)) || (game === 'teenpatti' && new Set(raw.c).size !== 6) || (raw.order !== undefined && raw.order !== 'alternating')) fail('Invalid cards');
  } else return null; // Preserve original descriptive text without fabricating detail.
  const result = games[game].outcome(raw);
  return game === 'sicbo' && result.lossAll ? 'D' : result.side || 'D';
}
function rowOutcome(game, row, raw) {
  const derived = rawOutcome(game, raw);
  const stated = winner(game, pick(row, 'outcome', 'winner', 'result', 'winning side', 'side'));
  const totalValue = pick(row, 'total', 'total sum', 'dice total', 'sum');
  const triple = boolean(pick(row, 'triple', 'is triple', 'lossAll'));
  let totalOutcome = null;
  if (game === 'sicbo' && present(totalValue)) {
    const total = Number(totalValue);
    if (!Number.isInteger(total) || total < 3 || total > 18) fail('Invalid Sic Bo total');
    if ((total === 3 || total === 18) && triple === false) fail('Invalid non-triple extreme total');
    if (triple === true && total % 3 !== 0) fail('Invalid triple total');
    totalOutcome = triple === true || total === 3 || total === 18 ? 'D' : total >= 11 ? 'A' : 'B';
  }
  const result = derived || (game === 'sicbo' && triple === true ? 'D' : stated) || totalOutcome;
  if (!result) fail('Missing or invalid outcome');
  // Sic Bo masters may label a triple Big/Small according to total; triple overrides that label.
  if (derived && stated && derived !== stated && !(game === 'sicbo' && derived === 'D' && stated !== 'D')) fail('Conflicting raw and stated outcome');
  if (game === 'sicbo' && derived && present(totalValue) && Array.isArray(raw) && raw.reduce((a, b) => a + b, 0) !== Number(totalValue)) fail('Conflicting dice total');
  if (game === 'sicbo' && derived && triple !== undefined && (derived === 'D') !== triple) fail('Conflicting triple flag');
  if (game === 'sicbo' && !derived && totalOutcome && stated && totalOutcome !== stated && totalOutcome !== 'D') fail('Conflicting total and stated outcome');
  return result;
}
function rawFromFields(game, row) {
  const raw = parseRaw(pick(row, 'raw', 'raw JSON', 'raw result', 'dice', 'cards', 'cards / details'));
  if (raw !== undefined) return raw;
  const dice = game === 'kickoff' ? [pick(row, 'red die', 'red', 'die 1', 'dice 1'), pick(row, 'blue die', 'blue', 'die 2', 'dice 2')]
    : game === 'sicbo' ? [1, 2, 3].map(n => pick(row, `die ${n}`, `dice ${n}`, `d${n}`)) : [];
  if (dice.some(present)) {
    if (!dice.every(present)) fail('Invalid partial dice');
    return dice.map(Number);
  }
  return undefined;
}
function normalizeRows(game, rows) {
  meta(game);
  if (!Array.isArray(rows)) fail('Invalid history rows');
  const seen = new Map();
  const normalized = rows.map((source, index) => {
    if (!source || typeof source !== 'object' || Array.isArray(source)) fail(`Invalid history row ${index + 1}`);
    const row = fields(source);
    const raw = rawFromFields(game, row);
    const outcome = rowOutcome(game, row, raw);
    const time = timestamp(pick(row, 'timestamp', 't', 'datetime', 'captured at'));
    const session = String(pick(row, 'session', 'session ID', 's') ?? '');
    const site = String(pick(row, 'site', 'site ID') ?? '');
    const originalId = pick(row, 'round ID', 'roundId', 'round', 'id');
    const roundId = String(originalId ?? pick(row, 'round #') ?? '');
    const explicitKey = pick(row, 'key', 'record key');
    if (!explicitKey && !roundId && time === null) fail('Missing round identity: supply round ID or timestamp');
    const key = String(explicitKey ?? JSON.stringify([game, site, session, originalId ?? time ?? roundId]));
    return { key, timestamp: time, session, site, outcome, lossAll: !GAME_META[game].tiePush && outcome === 'D', raw: raw === undefined ? '' : typeof raw === 'string' ? raw : JSON.stringify(raw), roundId, sourceIndex: index + 1 };
  });
  for (const round of normalized) {
    const prior = seen.get(round.key);
    if (prior && JSON.stringify({ ...prior, sourceIndex: 0 }) !== JSON.stringify({ ...round, sourceIndex: 0 })) fail(`Conflicting duplicate round: ${round.key}`);
    if (!prior) seen.set(round.key, round);
  }
  // ponytail: stable sort retains source order when timestamps tie or are unavailable.
  return [...seen.values()].sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0));
}
function fromBackup(game, backup) {
  meta(game);
  if (!backup || typeof backup !== 'object' || !backup.books || typeof backup.books !== 'object') fail('Invalid backup');
  const rows = Object.entries(backup.books).filter(([key]) => key.endsWith(`:${game}`)).flatMap(([key, book]) => {
    if (!book || !Array.isArray(book.entries)) return fail('Invalid backup entries');
    return book.entries.map(entry => ({ ...entry, site: key.slice(0, -(game.length + 1)), session: entry.s, timestamp: entry.t, roundId: entry.screen?.round }));
  });
  return normalizeRows(game, rows);
}
function parseCSV(text) {
  if (!text.trim()) return [];
  const records = [], cells = [];
  let cell = '', quoted = false, closed = false;
  const pushCell = () => { cells.push(cell); cell = ''; closed = false; };
  const pushRow = () => { pushCell(); if (cells.some(present)) records.push(cells.splice(0)); else cells.splice(0); };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch !== '"') cell += ch;
      else if (text[i + 1] === '"') { cell += '"'; i++; }
      else { quoted = false; closed = true; }
    } else if (ch === '"') {
      if (cell || closed) fail('Invalid CSV quote');
      quoted = true;
    } else if (ch === ',') pushCell();
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; pushRow(); }
    else { if (closed) fail('Invalid CSV characters after quote'); cell += ch; }
  }
  if (quoted) fail('Invalid CSV: unterminated quote');
  if (cell || cells.length || closed) pushRow();
  if (!records.length) return [];
  const [headers, ...data] = records;
  if (headers.some(h => !canonical(h)) || new Set(headers.map(canonical)).size !== headers.length) fail('Invalid CSV headers');
  return data.map(values => {
    if (values.length !== headers.length) fail('Invalid CSV column count');
    return Object.fromEntries(headers.map((key, i) => [key, values[i]]));
  });
}
function cellValue(cell) {
  const value = cell.value;
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    if (value.formula || value.sharedFormula) return fail('History source contains formulas; supply pure results');
    if (value.richText) return value.richText.map(item => item.text).join('');
    return value.text ?? fail('Invalid spreadsheet cell');
  }
  return value;
}
async function readXlsx(file) {
  const ExcelJS = require('exceljs');
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(file);
  const candidates = workbook.worksheets.flatMap(sheet => {
    const headers = sheet.getRow(1).values.slice(1).map(value => String(value ?? ''));
    return headers.some(h => ['outcome', 'winner', 'result', 'raw', 'rawjson', 'reddie', 'die1', 'dice1', 'total'].includes(canonical(h))) ? [{ sheet, headers }] : [];
  });
  if (candidates.length !== 1) fail('Expected exactly one history sheet with result headers');
  const { sheet, headers } = candidates[0];
  if (new Set(headers.map(canonical)).size !== headers.length || headers.some(h => !canonical(h))) fail('Invalid spreadsheet headers');
  const rows = [];
  sheet.eachRow((row, n) => {
    if (n > 1) rows.push(Object.fromEntries(headers.map((header, i) => [header, cellValue(row.getCell(i + 1))])));
  });
  return rows;
}
async function loadHistory(game, { sourceDir = path.resolve('live results'), sourceFile } = {}) {
  const gameMeta = meta(game);
  let source = sourceFile ? path.resolve(sourceFile) : path.resolve(sourceDir, gameMeta.file);
  try { await fs.access(source); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    if (!sourceFile) {
      let names;
      try { names = await fs.readdir(sourceDir); } catch (e) { if (e.code !== 'ENOENT') throw e; names = []; }
      const matches = names.filter(name => canonical(name).includes(game) && /(?:master|history|results)/i.test(name) && /\.xlsx$/i.test(name));
      if (matches.length > 1) fail(`Multiple matching ${game} masters; select --source explicitly`);
      if (matches.length) source = path.resolve(sourceDir, matches[0]);
      else return { rounds: [], source, status: 'Awaiting history' };
    } else return { rounds: [], source, status: 'Awaiting history' };
  }
  const extension = path.extname(source).toLowerCase();
  let rounds;
  if (extension === '.xlsx') rounds = normalizeRows(game, await readXlsx(source));
  else if (extension === '.csv') rounds = normalizeRows(game, parseCSV((await fs.readFile(source, 'utf8')).replace(/^\ufeff/, '')));
  else if (extension === '.json') rounds = fromBackup(game, JSON.parse(await fs.readFile(source, 'utf8')));
  else fail('Unsupported history format; use .xlsx, .csv or explicit backup .json');
  return { rounds, source, status: rounds.length ? 'Ready' : 'Awaiting history' };
}
module.exports = { GAME_META, normalizeRows, loadHistory, fromBackup };
