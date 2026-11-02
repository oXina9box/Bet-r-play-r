// Same-origin loopback app server. Tests inject a temporary data directory.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { validate } = require('./js/data');
const PORT = 47615;
const ASSETS = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/index.html': ['index.html', 'text/html; charset=utf-8'],
  '/styles.css': ['styles.css', 'text/css; charset=utf-8'],
  ...Object.fromEntries(['data', 'app', 'engine', 'games/sicbo', 'games/teenpatti', 'games/kickoff']
    .map(name => [`/js/${name}.js`, [`js/${name}.js`, 'text/javascript; charset=utf-8']])),
};
const HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Cache-Control': 'no-store',
};

function write(file, body) {
  const tmp = file + '.tmp';
  try { fs.writeFileSync(tmp, body); fs.renameSync(tmp, file); }
  finally { if (fs.existsSync(tmp)) fs.unlinkSync(tmp); }
}

function createServer({ dataDir = path.join(__dirname, 'data'), maxBodyBytes = 10 * 1024 * 1024, requestLimit = 1200 } = {}) {
  const file = path.join(dataDir, 'betrplayr.json');
  const backups = path.join(dataDir, 'backups');
  const reply = (res, status, body = '', type = 'text/plain; charset=utf-8') => {
    res.writeHead(status, { ...HEADERS, 'Content-Type': type }); res.end(body);
  };
  function persist(res, url, text) {
    let body;
    try { body = JSON.stringify(validate(JSON.parse(text))); }
    catch { return reply(res, 400, 'Invalid Bet-R Play-R backup'); }
    try {
      fs.mkdirSync(backups, { recursive: true });
      if (url === '/snapshot') write(path.join(backups, `pre-import-${Date.now()}-${randomUUID()}.json`), body);
      else {
        const day = new Date().toLocaleDateString('en-CA');
        write(path.join(backups, `${day}.json`), body);
        write(file, body);
      }
      reply(res, 200, 'ok');
    } catch { reply(res, 500, 'Unable to save data'); }
  }
  function receive(req, res) {
    if (!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type'] || '')) return reply(res, 415, 'JSON required');
    let size = 0;
    const chunks = [];
    req.on('data', chunk => {
      size += chunk.length;
      if (size > maxBodyBytes) {
        if (!res.writableEnded) reply(res, 413, 'Backup too large');
      } else chunks.push(chunk);
    });
    req.on('end', () => { if (!res.writableEnded) persist(res, req.url, Buffer.concat(chunks).toString('utf8')); });
    req.on('error', () => { if (!res.writableEnded) reply(res, 400, 'Invalid request'); });
  }
  let requests = 0;
  let windowStart = Date.now();
  const server = http.createServer((req, res) => {
    const authority = `127.0.0.1:${server.address().port}`;
    const origin = `http://${authority}`;
    if (req.headers.host !== authority || req.headers['sec-fetch-site'] === 'cross-site' ||
      (req.headers.origin && req.headers.origin !== origin) || (req.method === 'POST' && req.headers.origin !== origin)) {
      return reply(res, 403, 'Forbidden');
    }
    // ponytail: one bucket covers this loopback-only server; per-client limits if exposed beyond loopback.
    if (Date.now() - windowStart >= 60000) { requests = 0; windowStart = Date.now(); }
    if (++requests > requestLimit) return reply(res, 429, 'Too many requests; try again shortly');
    if (req.method === 'GET' && req.url === '/ping') return reply(res, 200, 'Bet-R Play-R');
    if (req.method === 'GET' && req.url === '/data') {
      try {
        const body = fs.existsSync(file) ? JSON.stringify(validate(JSON.parse(fs.readFileSync(file, 'utf8')))) : 'null';
        return reply(res, 200, body, 'application/json');
      } catch { return reply(res, 500, 'Unable to read data'); }
    }
    if (req.method === 'POST' && ['/data', '/snapshot'].includes(req.url)) return receive(req, res);
    if (req.method === 'GET' && Object.hasOwn(ASSETS, req.url)) {
      const [asset, type] = ASSETS[req.url];
      try { return reply(res, 200, fs.readFileSync(path.join(__dirname, asset)), type); }
      catch { return reply(res, 500, 'Unable to read app'); }
    }
    reply(res, 404, 'Not found');
  });
  server.requestTimeout = 30000;
  server.headersTimeout = 10000;
  return server;
}

module.exports = { createServer };
if (require.main === module) {
  const server = createServer();
  server.on('error', err => { console.error(`Unable to start Bet-R Play-R: ${err.code || 'server error'}`); process.exitCode = 1; });
  server.listen(PORT, '127.0.0.1', () => console.log(`Bet-R Play-R on http://127.0.0.1:${PORT}/`));
}
