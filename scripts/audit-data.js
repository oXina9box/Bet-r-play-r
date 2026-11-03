// Read-only audit. A repeated outcome is valid; only identical records are duplicates.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { validate } = require('../js/data');
const folder = path.resolve(process.argv[2] || path.join(__dirname, '../data'));
const files = [path.join(folder, 'betrplayr.json')];
const backups = path.join(folder, 'backups');
if (fs.existsSync(backups)) files.push(...fs.readdirSync(backups).filter(n => n.endsWith('.json')).map(n => path.join(backups, n)));
for (const file of files) {
  const data = validate(JSON.parse(fs.readFileSync(file, 'utf8')));
  const summary = {};
  for (const [key, book] of Object.entries(data.books)) {
    const seen = new Set();
    const prior = new Map();
    for (const entry of book.entries) {
      const identity = JSON.stringify(entry);
      assert.ok(!seen.has(identity), `${path.basename(file)} ${key}: duplicate record`);
      seen.add(identity);
      assert.ok(entry.t >= book.sessions.find(s => s.id === entry.s).start, `${key}: record before session`);
      assert.ok(entry.t >= (prior.get(entry.s) || 0), `${key}: reversed chronology`);
      prior.set(entry.s, entry.t);
    }
    summary[key] = { entries: book.entries.length, sessions: book.sessions.length };
  }
  console.log(path.basename(file), JSON.stringify(summary));
}
console.log(`Data audit passed (${files.length} files; history unchanged)`);
