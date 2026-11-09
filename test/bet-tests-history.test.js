'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { GAME_META, normalizeRows, loadHistory, fromBackup } = require('../scripts/bet-tests/history');
const row = (outcome, extra = {}) => ({ timestamp: 1000, session: 's1', roundId: '1', outcome, ...extra });

test('four games settle actual dice and ties without mutating rows', () => {
  assert.equal(Object.keys(GAME_META).length, 4);
  const input = [row('Red', { raw: [6, 2] }), row('Draw', { roundId: '2', raw: [3, 3] })];
  const before = JSON.stringify(input);
  const rounds = normalizeRows('kickoff', input);
  assert.deepEqual(rounds.map(r => [r.outcome, r.lossAll]), [['A', false], ['D', true]]);
  assert.equal(rounds[0].raw, '[6,2]');
  assert.equal(JSON.stringify(input), before);
  assert.equal(normalizeRows('sicbo', [row('Big', { raw: [6, 6, 6] })])[0].outcome, 'D');
  assert.equal(normalizeRows('sicbo', [row('Any Triple', { total: 3, triple: true })])[0].lossAll, true);
  for (const game of ['teenpatti', 'baccarat']) assert.equal(normalizeRows(game, [row('Tie')])[0].lossAll, false);
});

test('stable identities deduplicate exact copies and reject conflicts', () => {
  assert.equal(normalizeRows('kickoff', [row('Red'), row('Red')]).length, 1);
  assert.throws(() => normalizeRows('kickoff', [row('Red'), row('Blue')]), /conflict/i);
  assert.equal(normalizeRows('kickoff', [row('Red'), row('Blue', { session: 's2' }), row('Blue', { roundId: '2' }), row('Blue', { site: 'other' })]).length, 4);
  assert.throws(() => normalizeRows('kickoff', [row('Red', { raw: [1, 6] })]), /conflict/i);
});

test('normalization validates malformed values and preserves winner-only details', () => {
  assert.throws(() => normalizeRows('unknown', []), /game/i);
  assert.throws(() => normalizeRows('kickoff', null), /rows/i);
  for (const bad of [null, {}, row('bogus'), row('Red', { timestamp: 'tomorrow' }), row('Red', { raw: [0, 2] }), row('Red', { raw: '[oops' })]) {
    assert.throws(() => normalizeRows('kickoff', [bad]), /invalid|missing/i);
  }
  assert.equal(normalizeRows('teenpatti', [row('', { raw: { w: 'B' } })])[0].outcome, 'B');
  assert.equal(normalizeRows('baccarat', [row('Player')])[0].raw, '');
  assert.equal(normalizeRows('sicbo', [row('', { total: 12 })])[0].outcome, 'A');
  assert.throws(() => normalizeRows('sicbo', [row('Big', { total: 19 })]), /total/i);
  assert.throws(() => normalizeRows('sicbo', [row('Small', { total: 3, triple: false })]), /triple/i);
  assert.throws(() => normalizeRows('teenpatti', [row('', { raw: { c: ['bad'] } })]), /cards/i);
});

test('chronological order uses timestamps and preserves equal-time source order', () => {
  assert.deepEqual(normalizeRows('kickoff', [row('Blue', { timestamp: 2000 }), row('Red', { roundId: '2' }), row('Draw', { roundId: '3' })]).map(r => r.outcome), ['A', 'D', 'B']);
  assert.equal(normalizeRows('kickoff', [row('Red', { timestamp: '2026-01-01T00:00:00Z' })])[0].timestamp, Date.UTC(2026, 0, 1));
});

test('producer headers preserve details and use timestamps when ordinal round numbers change', () => {
  const fields = { Timestamp: 1000, 'Session ID': 's', 'Round ID': '', 'Round #': 1, Winner: 'Player A', 'Cards / Details': 'Grouped — A: As Ks Qs | B: 7s 2d Jc' };
  const first = normalizeRows('teenpatti', [fields])[0];
  assert.match(first.raw, /As Ks Qs/);
  assert.equal(first.key, normalizeRows('teenpatti', [{ ...fields, 'Round #': 12 }])[0].key);
  assert.equal(normalizeRows('sicbo', [{ Timestamp: 1, 'Session ID': 's', 'Die 1': 1, 'Die 2': 1, 'Die 3': 1, 'Total Sum': 3, Result: 'SMALL', Triple: 'Yes' }])[0].outcome, 'D');
  assert.throws(() => normalizeRows('sicbo', [row('Small', { 'Total Sum': 15 })]), /conflict/i);
  assert.throws(() => normalizeRows('__proto__', []), /game/i);
  assert.equal(normalizeRows('teenpatti', [row('Player A', { raw: { c: ['As', 'Ks', 'Qs', '7s', '2d', 'Jc'] } })])[0].outcome, 'A');
  assert.equal(normalizeRows('baccarat', [row('Player', { raw: { c: ['4s', '3s', '5s', '4d'], order: 'alternating' } })])[0].outcome, 'A');
});

test('explicit backup import reads matching books, sites and quick entries', () => {
  const backup = { books: { 's:kickoff': { entries: [{ t: 123, s: 'sess', raw: { w: 'A' }, screen: { round: '1234' } }] }, 't:kickoff': { entries: [{ t: 123, s: 'sess', raw: [1, 6] }] }, 's:sicbo': { entries: [] } } };
  const before = JSON.stringify(backup);
  const rounds = fromBackup('kickoff', backup);
  assert.equal(rounds.length, 2);
  assert.equal(rounds[0].roundId, '1234');
  assert.equal(rounds[0].raw, '{"w":"A"}');
  assert.equal(JSON.stringify(backup), before);
  assert.deepEqual(fromBackup('baccarat', backup), []);
  assert.throws(() => fromBackup('kickoff', {}), /backup/i);
});

test('files: missing masters, explicit JSON, quoted CSV and corrupt files', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'bet-history-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  assert.equal((await loadHistory('baccarat', { sourceDir: dir })).status, 'Awaiting history');
  assert.equal((await loadHistory('kickoff', { sourceFile: path.join(dir, 'absent.csv') })).status, 'Awaiting history');
  const csv = path.join(dir, 'manual.csv');
  await fs.writeFile(csv, '\ufeffTimestamp,Session,Round ID,Outcome,Raw,Notes\r\n1000,s1,1,Red,"[6,2]","quoted ""note"", line\nnext"\r\n2000,s1,2,Blue,,x\r\n');
  const result = await loadHistory('kickoff', { sourceFile: csv });
  assert.equal(result.rounds.length, 2);
  assert.equal(result.status, 'Ready');
  assert.equal(result.rounds[0].raw, '[6,2]');
  for (const text of ['Outcome,Outcome\nRed,Blue', 'Outcome\n"Red', 'Outcome,Timestamp\nRed', 'Outcome\n"Red"x']) {
    await fs.writeFile(csv, text);
    await assert.rejects(loadHistory('kickoff', { sourceFile: csv }), /CSV|header/i);
  }
  await fs.writeFile(csv, '');
  assert.equal((await loadHistory('kickoff', { sourceFile: csv })).status, 'Awaiting history');
  const json = path.join(dir, 'raw.json');
  await fs.writeFile(json, JSON.stringify({ books: { 'site:kickoff': { entries: [{ t: 1, s: 'x', raw: [6, 1] }] } } }));
  assert.equal((await loadHistory('kickoff', { sourceFile: json })).rounds[0].outcome, 'A');
  await fs.writeFile(path.join(dir, 'bad.txt'), 'bad');
  await assert.rejects(loadHistory('kickoff', { sourceFile: path.join(dir, 'bad.txt') }), /format/i);
});

test('xlsx adapter reads result sheet; masters preferred, ambiguity refused', async t => {
  const ExcelJS = require('exceljs');
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'bet-history-xlsx-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const wb = new ExcelJS.Workbook();
  wb.addWorksheet('Guide').addRow(['Guide']);
  const sheet = wb.addWorksheet('Results');
  sheet.addRow(['Timestamp', 'Session ID', 'Round ID', 'Winner', 'Red Die', 'Blue Die']);
  sheet.addRow([new Date(1000), 's', '1', 'RED', 6, 2]);
  sheet.addRow([new Date(2000), 's', '2', 'DRAW', 3, 3]);
  await wb.xlsx.writeFile(path.join(dir, GAME_META.kickoff.file));
  assert.equal((await loadHistory('kickoff', { sourceDir: dir })).rounds.length, 2);
  await fs.rename(path.join(dir, GAME_META.kickoff.file), path.join(dir, 'Kickoff Game History.xlsx'));
  assert.equal((await loadHistory('kickoff', { sourceDir: dir })).rounds.length, 2);
  await fs.copyFile(path.join(dir, 'Kickoff Game History.xlsx'), path.join(dir, 'Kickoff Results Master.xlsx'));
  await assert.rejects(loadHistory('kickoff', { sourceDir: dir }), /multiple/i);
  const empty = new ExcelJS.Workbook();
  empty.addWorksheet('Guide').addRow(['No result headers']);
  await empty.xlsx.writeFile(path.join(dir, 'empty.xlsx'));
  await assert.rejects(loadHistory('kickoff', { sourceFile: path.join(dir, 'empty.xlsx') }), /sheet|header/i);
});
