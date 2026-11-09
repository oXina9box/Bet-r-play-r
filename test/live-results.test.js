const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const ExcelJS = require('exceljs');
const { syncGame } = require('../scripts/live-results');
const { createServer } = require('../server');

const files = { sicbo: 'Sic_Bo_Results', kickoff: 'The_Kickoff_Results', teenpatti: 'Teen_Patti_Results' };
const headers = {
  sicbo: ['Round #','Date','Time','Timestamp','Session ID','Die 1','Die 2','Die 3','Total Sum','Result','Triple','Round ID'],
  kickoff: ['Round #','Date','Time','Timestamp','Session ID','Red Die','Blue Die','Result','Score Hit','Round ID'],
  teenpatti: ['Round #','Date','Time','Timestamp','Session ID','Winner','Cards / Details','Round ID'],
};
async function rows(file) {
  const workbook = new ExcelJS.Workbook(); await workbook.xlsx.readFile(file);
  assert.equal(workbook.worksheets.length, 1);
  const sheet = workbook.worksheets[0];
  return Array.from({ length: sheet.rowCount }, (_, i) =>
    Array.from({ length: sheet.columnCount }, (_, j) => sheet.getRow(i + 1).getCell(j + 1).value || null));
}
function entry(t, raw, extra = {}) { return { t, s: 'session_1', raw, ...extra }; }

test('pure results preserve sessions, deduplicate timestamps and survive ODS conversion', { timeout: 120000 }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'round-results-'));
  try {
    const examples = {
      sicbo: [entry(1700000000001, [1,1,1]), entry(1700000000002, [6,6,6], { screen: { round: '12345678', capturedAt: 1700000000002, confidence: 90, result: 'BIG' } })],
      kickoff: [entry(1700000000003, [5,3], { scoreHit: true }), entry(1700000000004, { w: 'T' })],
      teenpatti: [entry(1700000000005, { w: 'B' }), entry(1700000000006, { c: ['As','Ks','Qs','7s','2d','Jc'] })],
    };
    for (const [game, entries] of Object.entries(examples)) {
      const first = await syncGame(game, entries, { outputDir: dir });
      assert.equal(first.total, 2); assert.equal(first.added, 2);
      const again = await syncGame(game, entries, { outputDir: dir });
      assert.equal(again.total, 2); assert.equal(again.added, 0);
      const workbook = await rows(path.join(dir, files[game] + '.xlsx'));
      assert.deepEqual(workbook[0], headers[game]);
      assert.deepEqual(workbook.slice(1).map(row => row[3]), entries.map(e => e.t));
      assert.equal(new Set(workbook.slice(1).map(row => row[3])).size, 2);
      if (game === 'sicbo') { assert.deepEqual(workbook[1].slice(8,11), [3,'SMALL','Yes']); assert.deepEqual(workbook[2].slice(8,11), [18,'BIG','Yes']); }
      if (game === 'kickoff') { assert.equal(workbook[1][7], 'RED'); assert.equal(workbook[1][8], 'Yes'); assert.equal(workbook[2][7], 'DRAW'); }
      if (game === 'teenpatti') { assert.equal(workbook[1][5], 'Player B'); assert.equal(workbook[2][5], 'Player A'); }
      const converted = path.join(dir, 'converted-' + game); fs.mkdirSync(converted);
      execFileSync('libreoffice', ['-env:UserInstallation=' + new URL('file://' + path.join(dir, 'profile-' + game)).href, '--headless', '--convert-to', 'xlsx', '--outdir', converted, path.join(dir, files[game] + '.ods')], { stdio: 'pipe' });
      assert.deepEqual(await rows(path.join(converted, files[game] + '.xlsx')), workbook);
    }
    await assert.rejects(syncGame('sicbo', [entry(1700000000001, [2,2,2])], { outputDir: dir }));
    const lock = path.join(dir, '.Sic_Bo_Results.lock');
    fs.writeFileSync(lock, 'another process');
    await assert.rejects(syncGame('sicbo', [entry(1700000000010, [1,2,3])], { outputDir: dir }), /already running/);
    fs.unlinkSync(lock);
    assert.equal((await rows(path.join(dir, files.sicbo + '.xlsx'))).length, 3);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('session endpoint appends once, rejects cross-origin and survives concurrent requests', { timeout: 120000 }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'round-server-'));
  const server = createServer({ dataDir: dir, resultsDir: dir, ocr: { close: async () => {} } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const post = (body, from = origin) => fetch(origin + '/session/end', { method: 'POST', headers: { Origin: from, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  try {
    assert.equal((await post({ game: 'sicbo', entries: [entry(1700000000011, [1,2,3])] }, 'https://evil.example')).status, 403);
    assert.equal((await post({ game: 'baccarat', entries: [] })).status, 400);
    const first = { game: 'sicbo', entries: [entry(1700000000011, [1,2,3])] };
    const second = { game: 'sicbo', entries: [entry(1700000000012, [4,5,6])] };
    const responses = await Promise.all([post(first), post(second)]);
    assert.deepEqual(responses.map(r => r.status), [200,200]);
    assert.equal((await post(first)).status, 200);
    const result = await rows(path.join(dir, files.sicbo + '.xlsx'));
    assert.deepEqual(result.slice(1).map(r => r[3]), [1700000000011,1700000000012]);
    assert.notEqual((await post({ game: 'sicbo', entries: [entry(1700000000013, [1,2,9])] })).status, 200);
  } finally { await new Promise(resolve => server.close(resolve)); fs.rmSync(dir, { recursive: true, force: true }); }
});
