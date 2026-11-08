#!/usr/bin/env node
// Export canonical round history without changing the original data.
const fs = require('node:fs');
const path = require('node:path');
const { validate } = require('../js/data');
const { syncGame } = require('./live-results');

async function main() {
  const file = path.join(__dirname, '..', 'data', 'betrplayr.json');
  const data = validate(JSON.parse(fs.readFileSync(file, 'utf8')));
  for (const game of ['sicbo', 'kickoff', 'teenpatti']) {
    const entries = Object.entries(data.books)
      .filter(([key]) => key.endsWith(':' + game))
      .flatMap(([, book]) => book.entries.map(({ t, s, raw, screen, scoreHit }) => ({
        t, s, raw, ...(screen ? { screen } : {}), ...(scoreHit === undefined ? {} : { scoreHit }),
      })));
    const result = await syncGame(game, entries);
    console.log(`${result.file}: ${result.total} rounds (${result.added} added)`);
  }
}

main().catch(error => { console.error(`Live results sync failed: ${error.message}`); process.exitCode = 1; });
