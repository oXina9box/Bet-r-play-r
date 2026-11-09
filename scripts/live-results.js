'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { pathToFileURL } = require('node:url');
const { spawn } = require('node:child_process');
const ExcelJS = require('exceljs');
const AppData = require('../js/data');
const SicBo = require('../js/games/sicbo');
const Kickoff = require('../js/games/kickoff');
const TeenPatti = require('../js/games/teenpatti');

const MAX_TIMESTAMP = 8640000000000000;
const DEFAULT_OUTPUT = path.resolve(__dirname, '..', 'live results');
const SPECS = {
  sicbo: { name: 'Sic_Bo_Results', game: SicBo, headers: ['Round #', 'Date', 'Time', 'Timestamp', 'Session ID', 'Die 1', 'Die 2', 'Die 3', 'Total Sum', 'Result', 'Triple', 'Round ID'], widths: [11, 13, 12, 20, 24, 9, 9, 9, 12, 11, 10, 18],
    row(e) { const o = this.game.outcome(e.raw); return [null, null, null, e.t, e.s, ...e.raw, o.total, o.side === 'A' ? 'BIG' : 'SMALL', o.triple ? 'Yes' : 'No', e.screen?.round || '']; } },
  kickoff: { name: 'The_Kickoff_Results', game: Kickoff, headers: ['Round #', 'Date', 'Time', 'Timestamp', 'Session ID', 'Red Die', 'Blue Die', 'Result', 'Score Hit', 'Round ID'], widths: [11, 13, 12, 20, 24, 11, 11, 12, 11, 18],
    row(e) { const o = this.game.outcome(e.raw); return [null, null, null, e.t, e.s, o.red ?? '', o.blue ?? '', o.tie ? 'DRAW' : o.side === 'A' ? 'RED' : 'BLUE', e.scoreHit ? 'Yes' : 'No', e.screen?.round || '']; } },
  teenpatti: { name: 'Teen_Patti_Results', game: TeenPatti, headers: ['Round #', 'Date', 'Time', 'Timestamp', 'Session ID', 'Winner', 'Cards / Details', 'Round ID'], widths: [11, 13, 12, 20, 24, 14, 52, 18],
    row(e) {
      const o = this.game.outcome(e.raw), winner = o.side === 'A' ? 'Player A' : o.side === 'B' ? 'Player B' : 'Tie';
      if (!e.raw.c) return [null, null, null, e.t, e.s, winner, 'Quick entry', e.screen?.round || ''];
      const a = e.raw.order === 'alternating' ? [e.raw.c[0], e.raw.c[2], e.raw.c[4]] : e.raw.c.slice(0, 3);
      const b = e.raw.order === 'alternating' ? [e.raw.c[1], e.raw.c[3], e.raw.c[5]] : e.raw.c.slice(3);
      return [null, null, null, e.t, e.s, winner, `${e.raw.order === 'alternating' ? 'Alternating' : 'Grouped'} — A: ${a.join(' ')} | B: ${b.join(' ')}`, e.screen?.round || ''];
    } },
};
const queues = new Map();
const invalid = message => { throw new TypeError(`Invalid live results: ${message}`); };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function normalizeEntry(game, entry) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) invalid('entry must be an object');
  let e;
  try {
    e = AppData.validate({ v: 1, sites: [{ id: 'site', name: 'Site' }], cur: { site: 'site', game }, books: {
      [`site:${game}`]: { cfg: { n: 4, prog: 'double', unit: 1, payout: 1 }, sessions: [{ id: entry.s, start: entry.t }], entries: [{
        t: entry.t, s: entry.s, raw: entry.raw, cfg: { n: 4, prog: 'double', unit: 1, payout: 1 },
        ...(entry.screen === undefined ? {} : { screen: entry.screen }), ...(entry.scoreHit === undefined ? {} : { scoreHit: entry.scoreHit }),
      }] },
    } }).books[`site:${game}`].entries[0];
  } catch { invalid('entry violates game, session, timestamp, or screen-round schema'); }
  return { t: e.t, s: e.s, raw: e.raw, ...(e.screen ? { screen: { round: e.screen.round } } : {}), ...(e.scoreHit !== undefined || game === 'kickoff' ? { scoreHit: e.scoreHit === true } : {}) };
}
function identity(e) { return JSON.stringify([e.raw, e.scoreHit ?? null]); }
function utcDate(t) { return new Date(t).toISOString().slice(0, 10); }
function utcTime(t) { return new Date(t).toISOString().slice(11, 19); }
function dedupe(entries) {
  const byTime = new Map();
  for (const entry of entries) {
    const old = byTime.get(entry.t);
    if (old && identity(old) !== identity(entry)) throw new Error(`Conflicting results share timestamp ${entry.t}`);
    if (!old || (!old.screen && entry.screen)) byTime.set(entry.t, entry);
  }
  return [...byTime.values()].sort((a, b) => a.t - b.t);
}
function decodeRows(spec, sheet) {
  if (!same(sheet.getRow(1).values.slice(1), spec.headers)) throw new Error(`Existing workbook sheet has unexpected columns: ${sheet.name}`);
  const entries = [];
  for (let i = 2; i <= sheet.rowCount; i++) {
    const vals = sheet.getRow(i).values.slice(1, spec.headers.length + 1);
    if (vals.every(v => v == null || v === '')) continue;
    const [round, date, time, t, s, ...r] = vals;
    if (!Number.isSafeInteger(t) || t < 0 || t > MAX_TIMESTAMP || typeof s !== 'string') throw new Error(`Invalid existing row ${i} in ${sheet.name}`);
    let raw, scoreHit, roundId;
    if (spec === SPECS.sicbo) {
      const [a, b, c, total, side, triple, id] = r; roundId = id; raw = [a, b, c];
      const o = spec.game.outcome(raw);
      if (o.total !== total || (o.side === 'A' ? 'BIG' : 'SMALL') !== side || (o.triple ? 'Yes' : 'No') !== triple) throw new Error(`Inconsistent existing Sic Bo row ${i}`);
    } else if (spec === SPECS.kickoff) {
      const [red, blue, result, hit, id] = r; roundId = id; scoreHit = hit === 'Yes';
      if (hit !== 'Yes' && hit !== 'No') throw new Error(`Invalid score-hit field in row ${i}`);
      raw = red === '' && blue === '' ? { w: result === 'RED' ? 'A' : result === 'BLUE' ? 'B' : result === 'DRAW' ? 'T' : null } : [red, blue];
      const o = spec.game.outcome(raw);
      if ((o.tie ? 'DRAW' : o.side === 'A' ? 'RED' : 'BLUE') !== result) throw new Error(`Inconsistent existing Kickoff row ${i}`);
    } else {
      const [winner, detail, id] = r; roundId = id;
      if (detail === 'Quick entry') raw = { w: winner === 'Player A' ? 'A' : winner === 'Player B' ? 'B' : winner === 'Tie' ? 'T' : null };
      else {
        const m = /^(Alternating|Grouped) — A: ((?:[2-9]|10|J|Q|K|A)[hdsc](?: (?:[2-9]|10|J|Q|K|A)[hdsc]){2}) \| B: ((?:[2-9]|10|J|Q|K|A)[hdsc](?: (?:[2-9]|10|J|Q|K|A)[hdsc]){2})$/.exec(detail);
        if (!m) throw new Error(`Invalid Teen Patti details in row ${i}`);
        const a = m[2].split(' '), b = m[3].split(' ');
        raw = { c: m[1] === 'Alternating' ? [a[0], b[0], a[1], b[1], a[2], b[2]] : [...a, ...b], ...(m[1] === 'Alternating' ? { order: 'alternating' } : {}) };
      }
      const o = spec.game.outcome(raw);
      if ((o.side === 'A' ? 'Player A' : o.side === 'B' ? 'Player B' : 'Tie') !== winner) throw new Error(`Inconsistent existing Teen Patti row ${i}`);
    }
    if (round !== entries.length + 1 || date !== utcDate(t) || time !== utcTime(t)) throw new Error(`Invalid round number or UTC date/time in row ${i}`);
    let screen;
    if (roundId !== '' && roundId != null) screen = { round: String(roundId), capturedAt: t, confidence: 80, result: 'Recorded result' };
    entries.push(normalizeEntry(spec === SPECS.sicbo ? 'sicbo' : spec === SPECS.kickoff ? 'kickoff' : 'teenpatti', { t, s, raw, ...(screen ? { screen } : {}), ...(spec === SPECS.kickoff ? { scoreHit } : {}) }));
  }
  return entries;
}
function buildWorkbook(spec, entries) {
  const wb = new ExcelJS.Workbook(); wb.creator = 'Bet-R Play-R';
  const ws = wb.addWorksheet(spec.name.replace(/_Results$/, ''), { views: [{ state: 'frozen', ySplit: 1, showGridLines: false }] });
  ws.columns = spec.headers.map((header, i) => ({ header, key: `c${i}`, width: spec.widths[i] }));
  const header = ws.getRow(1); header.height = 25;
  header.eachCell(cell => { cell.font = { name: 'Aptos', bold: true, color: { argb: 'FFFFFFFF' }, size: 11 }; cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF17324D' } }; cell.alignment = { vertical: 'middle', horizontal: 'center' }; cell.border = { bottom: { style: 'medium', color: { argb: 'FF18A999' } } }; });
  entries.forEach((entry, i) => {
    const values = spec.row(entry); values[0] = i + 1; values[1] = utcDate(entry.t); values[2] = utcTime(entry.t);
    const row = ws.addRow(values); row.height = 21;
    row.eachCell((cell, col) => { cell.font = { name: 'Aptos', size: 10, color: { argb: col === 1 ? 'FF137C73' : 'FF263548' } }; cell.alignment = { vertical: 'middle', horizontal: col <= 4 ? 'center' : 'left' }; if (i % 2) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F6F8' } }; cell.border = { bottom: { style: 'hair', color: { argb: 'FFDCE5EA' } } }; });
  });
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: Math.max(1, entries.length + 1), column: spec.headers.length } };
  return wb;
}
function libreOffice(args) {
  return new Promise((resolve, reject) => { const child = spawn('libreoffice', args, { stdio: 'ignore' }); child.once('error', reject); child.once('exit', (code, signal) => code === 0 ? resolve() : reject(new Error(`LibreOffice conversion failed (${signal || code})`))); });
}
async function syncPair(spec, entries, dir) {
  await fs.mkdir(dir, { recursive: true });
  const stage = await fs.mkdtemp(path.join(dir, `.${spec.name}-`)), profile = pathToFileURL(path.join(stage, 'profile')).href;
  const xlsx = path.join(stage, `${spec.name}.xlsx`), ods = path.join(stage, `${spec.name}.ods`);
  const targets = [path.join(dir, `${spec.name}.xlsx`), path.join(dir, `${spec.name}.ods`)], staged = [xlsx, ods];
  const backups = targets.map((_, i) => path.join(stage, `old-${i}`));
  const old = [false, false], fresh = [false, false]; let keep = false;
  try {
    await buildWorkbook(spec, entries).xlsx.writeFile(xlsx);
    const file = await fs.open(xlsx, 'r'); try { await file.sync(); } finally { await file.close(); }
    await libreOffice(['-env:UserInstallation=' + profile, '--headless', '--convert-to', 'ods', '--outdir', stage, xlsx]);
    await fs.access(ods);
    for (let i = 0; i < 2; i++) { try { await fs.rename(targets[i], backups[i]); old[i] = true; } catch (e) { if (e.code !== 'ENOENT') throw e; } }
    for (let i = 0; i < 2; i++) { await fs.rename(staged[i], targets[i]); fresh[i] = true; }
    const dh = await fs.open(dir, 'r'); try { await dh.sync(); } finally { await dh.close(); }
  } catch (error) {
    for (let i = 0; i < 2; i++) if (fresh[i]) await fs.rm(targets[i], { force: true }).catch(() => {});
    for (let i = 0; i < 2; i++) if (old[i]) try { await fs.rename(backups[i], targets[i]); } catch (restoreError) { error.restoreError = restoreError; keep = true; }
    throw error;
  } finally { if (!keep) await fs.rm(stage, { recursive: true, force: true }).catch(() => {}); }
}
async function exists(file) { try { await fs.access(file); return true; } catch (e) { if (e.code === 'ENOENT') return false; throw e; } }
async function readMaster(spec, file, format) {
  const wb = new ExcelJS.Workbook();
  if (format === 'xlsx') await wb.xlsx.readFile(file);
  else {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'live-results-')), profile = pathToFileURL(path.join(dir, 'profile')).href;
    try { await libreOffice(['-env:UserInstallation=' + profile, '--headless', '--convert-to', 'xlsx', '--outdir', dir, file]); await wb.xlsx.readFile(path.join(dir, `${path.basename(file, '.ods')}.xlsx`)); }
    finally { await fs.rm(dir, { recursive: true, force: true }).catch(() => {}); }
  }
  const sheet = wb.getWorksheet(spec.name.replace(/_Results$/, '')) || wb.worksheets[0];
  if (!sheet) throw new Error(`Existing workbook has no sheets: ${file}`);
  return decodeRows(spec, sheet);
}
async function syncGame(game, entries, { outputDir = DEFAULT_OUTPUT } = {}) {
  const spec = SPECS[game]; if (!spec) invalid('unsupported game');
  if (!Array.isArray(entries)) invalid('entries must be an array');
  const incoming = entries.map(entry => normalizeEntry(game, entry)), dir = path.resolve(outputDir);
  const prior = queues.get(dir) || Promise.resolve();
  const operation = prior.catch(() => {}).then(async () => {
    await fs.mkdir(dir, { recursive: true });
    const lock = path.join(dir, `.${spec.name}.lock`);
    let handle;
    try { handle = await fs.open(lock, 'wx'); }
    catch (error) {
      if (error.code === 'EEXIST') throw new Error(`Results sync already running for ${spec.name}; retry when it finishes`);
      throw error;
    }
    try {
      const xlsx = path.join(dir, `${spec.name}.xlsx`), ods = path.join(dir, `${spec.name}.ods`);
      const existing = await exists(xlsx) ? await readMaster(spec, xlsx, 'xlsx') : await exists(ods) ? await readMaster(spec, ods, 'ods') : [];
      const old = dedupe(existing), merged = dedupe([...old, ...dedupe(incoming)]), oldTimes = new Set(old.map(e => e.t));
      await syncPair(spec, merged, dir);
      return { file: path.relative(path.resolve(__dirname, '..'), ods).split(path.sep).join('/'), added: merged.filter(e => !oldTimes.has(e.t)).length, total: merged.length };
    } finally {
      await handle.close();
      await fs.unlink(lock);
    }
  });
  queues.set(dir, operation);
  try { return await operation; } finally { if (queues.get(dir) === operation) queues.delete(dir); }
}
module.exports = { syncGame };
