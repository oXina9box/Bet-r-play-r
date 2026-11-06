const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { createServer } = require('../server');
const { createDefault } = require('../js/data');

async function main() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'betrplayr-server-'));
  const calls = [];
  const server = createServer({ dataDir: dir, maxBodyBytes: 4096, ocr: {
    recognize: async images => { calls.push(images); return images.map(i => ({ id: i.id, text: 'BIG 16', confidence: 94 })); },
  } });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const origin = `http://127.0.0.1:${server.address().port}`;
  function request(url, { method = 'GET', body, headers = {} } = {}) {
    return new Promise((resolve, reject) => {
      const req = http.request(origin + url, { method, headers }, res => {
        const chunks = [];
        res.on('data', c => chunks.push(c));
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString() }));
      });
      req.on('error', reject); req.end(body);
    });
  }
  const post = body => request('/data', { method: 'POST', body, headers: { Origin: origin, 'Content-Type': 'application/json' } });
  try {
    assert.equal((await request('/ping')).body, 'Bet-R Play-R');
    const page = await request('/');
    assert.equal(page.status, 200);
    assert.match(page.body, /Bet-R Play-R/);
    assert.match(page.headers['content-security-policy'], /script-src 'self'/);
    assert.equal(page.headers['x-content-type-options'], 'nosniff');
    for (const asset of ['/styles.css', '/js/data.js', '/js/history.js', '/js/engine.js', '/js/games/kickoff.js', '/js/vision.js', '/js/capture.js', '/js/screen.js']) assert.equal((await request(asset)).status, 200);
    assert.equal((await request('/data')).body, 'null');
    for (const url of ['/server.js', '/run.sh', '/data/betrplayr.json', '/../server.js', '/.git/config']) assert.equal((await request(url)).status, 404);
    const hostile = { Origin: 'https://evil.example' };
    assert.equal((await request('/data', { headers: hostile })).status, 403);
    assert.equal((await request('/data', { headers: { Origin: 'null' } })).status, 403);
    assert.equal((await request('/data', { headers: { Host: 'evil.example' } })).status, 403);
    assert.equal((await request('/data', { headers: { 'Sec-Fetch-Site': 'cross-site' } })).status, 403);
    assert.equal((await request('/data', { method: 'POST', body: '{}', headers: hostile })).status, 403);
    assert.equal((await request('/data', { method: 'POST', body: '{}' })).status, 403);
    assert.equal((await request('/data', { method: 'POST', body: '{}', headers: { Origin: 'null' } })).status, 403);
    assert.equal((await request('/data', { method: 'OPTIONS', headers: hostile })).status, 403);
    assert.equal((await request('/data')).headers['access-control-allow-origin'], undefined);
    assert.equal((await request('/data', { method: 'POST', body: '{}', headers: { Origin: origin } })).status, 415);
    assert.equal((await post('{')).status, 400);
    assert.equal((await post('{"sites":[],"books":{}}')).status, 400);
    assert.equal(fs.existsSync(path.join(dir, 'betrplayr.json')), false);
    const data = createDefault(); data.savedAt = 123;
    assert.equal((await post(JSON.stringify(data))).status, 200);
    assert.deepEqual(JSON.parse((await request('/data')).body), data);
    assert.equal((await post('{"sites":[],"books":{}}')).status, 400);
    assert.deepEqual(JSON.parse((await request('/data')).body), data);
    assert.equal(fs.readdirSync(path.join(dir, 'backups')).length, 1);
    assert.equal((await request('/snapshot', { method: 'POST', body: JSON.stringify(data), headers: { Origin: origin, 'Content-Type': 'application/json' } })).status, 200);
    assert.equal(fs.readdirSync(path.join(dir, 'backups')).length, 2);
    assert.equal((await post(' '.repeat(4097))).status, 413);
    const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a69sAAAAASUVORK5CYII=';
    const scan = body => request('/ocr', { method: 'POST', body: JSON.stringify(body), headers: { Origin: origin, 'Content-Type': 'application/json' } });
    assert.equal((await scan({ images: [] })).status, 400);
    assert.equal((await scan({ images: [{ id: 'x', mode: 'text', png: 'https://evil.example/image.png' }] })).status, 400);
    const validImage = { id: 'result', mode: 'text', png };
    assert.equal((await scan({ images: [validImage, validImage] })).status, 400);
    const huge = Buffer.from(png.slice(22), 'base64'); huge.writeUInt32BE(99999, 16);
    assert.equal((await scan({ images: [{ ...validImage, png: 'data:image/png;base64,' + huge.toString('base64') }] })).status, 400);
    assert.equal((await request('/ocr', { method: 'POST', body: '{}', headers: hostile })).status, 403);
    const recognized = await scan({ images: [validImage] });
    assert.equal(recognized.status, 200);
    assert.deepEqual(JSON.parse(recognized.body), [{ id: 'result', text: 'BIG 16', confidence: 94 }]);
    assert.ok(Buffer.isBuffer(calls[0][0].png));
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, 'betrplayr.json'), 'utf8')), data);
    fs.writeFileSync(path.join(dir, 'betrplayr.json'), '{broken');
    assert.equal((await request('/data')).status, 500);
    fs.rmSync(path.join(dir, 'backups'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'backups'), 'blocked');
    const failed = await post(JSON.stringify(data));
    assert.equal(failed.status, 500);
    assert.doesNotMatch(failed.body, new RegExp(dir));
  } finally {
    await new Promise(resolve => server.close(resolve));
    fs.rmSync(dir, { recursive: true, force: true });
  }
  const limited = createServer({ dataDir: dir, requestLimit: 1 });
  await new Promise((resolve, reject) => { limited.once('error', reject); limited.listen(0, '127.0.0.1', resolve); });
  try {
    const limitedOrigin = `http://127.0.0.1:${limited.address().port}`;
    assert.equal((await fetch(limitedOrigin + '/ping')).status, 200);
    assert.equal((await fetch(limitedOrigin + '/ping')).status, 429);
  } finally { await new Promise(resolve => limited.close(resolve)); }
  console.log('All server tests passed');
}
main().catch(err => { console.error(err); process.exitCode = 1; });
