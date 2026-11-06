const test = require('node:test');
const assert = require('node:assert/strict');
const { parsePort } = require('../server');

test('server keeps default port and accepts explicit local ports', () => {
  assert.equal(parsePort(), 47615);
  for (const port of [1024, 47616, 65535]) assert.equal(parsePort(String(port)), port);
});

test('server rejects invalid explicit ports before starting', () => {
  for (const port of ['bad', '0', '-1', '65536', '47616.5', '']) {
    assert.throws(() => parsePort(port), /Port must be an integer from 1024 to 65535/);
  }
});
