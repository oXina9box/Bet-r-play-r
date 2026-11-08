// Same-origin loopback app server. Tests inject a temporary data directory.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID, createHash } = require('node:crypto');
const { validate } = require('./js/data');
const { decodeImages, createOCR } = require('./ocr');
const { syncGame } = require('./scripts/live-results');
const PORT = 47615;
const ASSETS = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/index.html': ['index.html', 'text/html; charset=utf-8'],
  '/styles.css': ['styles.css', 'text/css; charset=utf-8'],
  ...Object.fromEntries(['data', 'app', 'history', 'engine', 'voice', 'vision', 'capture', 'sicbo-regions', 'sicbo-consensus', 'sicbo-recovery', 'screen', 'games/sicbo', 'games/teenpatti', 'games/baccarat', 'games/kickoff']
    .map(name => [`/js/${name}.js`, [`js/${name}.js`, 'text/javascript; charset=utf-8']])),
};
const HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Cache-Control': 'no-store',
};

function write(file, body) {
  const tmp = `${file}.${Date.now()}-${randomUUID()}.tmp`;
  try { fs.writeFileSync(tmp, body); fs.renameSync(tmp, file); }
  finally { if (fs.existsSync(tmp)) fs.unlinkSync(tmp); }
}

function createServer({ dataDir = path.join(__dirname, 'data'), resultsDir = path.join(__dirname, 'live results'), maxBodyBytes = 10 * 1024 * 1024, requestLimit = 1200, ocr = createOCR() } = {}) {
  let recognizing = false, resultsQueue = Promise.resolve();
  const file = path.join(dataDir, 'betrplayr.json');
  const backups = path.join(dataDir, 'backups');
  const readData = () => fs.existsSync(file) ? JSON.stringify(validate(JSON.parse(fs.readFileSync(file, 'utf8')))) : 'null';
  const tag = body => '"' + createHash('sha256').update(body).digest('hex') + '"';
  const reply = (res, status, body = '', type = 'text/plain; charset=utf-8', headers = {}) => {
    res.writeHead(status, { ...HEADERS, 'Content-Type': type, ...headers }); res.end(body);
  };
  function persist(req, res, url, text) {
    let body;
    try { body = JSON.stringify(validate(JSON.parse(text))); }
    catch { return reply(res, 400, 'Invalid Bet-R Play-R backup'); }
    try {
      if (url === '/data') {
        if (!req.headers['if-match']) return reply(res, 428, 'Read data before saving');
        if (req.headers['if-match'] !== tag(readData())) return reply(res, 412, 'Data changed in another window');
      }
      fs.mkdirSync(backups, { recursive: true });
      if (url === '/snapshot') write(path.join(backups, `pre-import-${Date.now()}-${randomUUID()}.json`), body);
      else {
        if (fs.existsSync(file)) write(path.join(backups, `pre-save-${Date.now()}.json`), fs.readFileSync(file, 'utf8'));
        const day = new Date().toLocaleDateString('en-CA');
        write(path.join(backups, `${day}.json`), body);
        write(file, body);
      }
      reply(res, 200, 'ok', 'text/plain; charset=utf-8', url === '/data' ? { ETag: tag(body) } : {});
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
    req.on('end', async () => {
      if (res.writableEnded) return;
      const text = Buffer.concat(chunks).toString('utf8');
      if (req.url === '/session/end') {
        let payload;
        try {
          payload = JSON.parse(text);
          if (!payload || !['sicbo', 'kickoff', 'teenpatti'].includes(payload.game) || !Array.isArray(payload.entries) || !payload.entries.length) throw new Error();
        } catch { return reply(res, 400, 'Invalid session results'); }
        // The writer validates each result; serializing requests prevents lost updates.
        const update = resultsQueue.then(() => syncGame(payload.game, payload.entries, { outputDir: resultsDir }));
        resultsQueue = update.catch(() => {});
        try { return reply(res, 200, JSON.stringify(await update), 'application/json'); }
        catch { return reply(res, 500, 'Unable to sync session results'); }
      }
      if (req.url !== '/ocr') return persist(req, res, req.url, text);
      let images;
      try { images = decodeImages(text); } catch { return reply(res, 400, 'Invalid OCR images'); }
      if (recognizing) return reply(res, 429, 'OCR busy; retry shortly');
      recognizing = true;
      try { reply(res, 200, JSON.stringify(await ocr.recognize(images)), 'application/json'); }
      catch { reply(res, 503, 'Local OCR unavailable. Run npm install and retry.'); }
      finally { recognizing = false; }
    });
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
        const body = readData();
        return reply(res, 200, body, 'application/json', { ETag: tag(body) });
      } catch { return reply(res, 500, 'Unable to read data'); }
    }
    if (req.method === 'POST' && ['/data', '/snapshot', '/ocr', '/session/end'].includes(req.url)) return receive(req, res);
    if (req.method === 'GET' && Object.hasOwn(ASSETS, req.url)) {
      const [asset, type] = ASSETS[req.url];
      try { return reply(res, 200, fs.readFileSync(path.join(__dirname, asset)), type); }
      catch { return reply(res, 500, 'Unable to read app'); }
    }
    reply(res, 404, 'Not found');
  });
  server.requestTimeout = 30000;
  server.headersTimeout = 10000;
  server.on('close', () => { ocr.close?.().catch(() => {}); });
  return server;
}

function parsePort(value = PORT) {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new RangeError('Port must be an integer from 1024 to 65535');
  return port;
}

module.exports = { createServer, parsePort, write };
if (require.main === module) {
  let port;
  try { port = parsePort(process.argv.find(arg => arg.startsWith('--port='))?.slice(7)); }
  catch (err) { console.error(err.message); process.exitCode = 1; }
  if (port !== undefined) {
    const server = createServer();
    server.on('error', err => { console.error(`Unable to start Bet-R Play-R: ${err.code || 'server error'}`); process.exitCode = 1; });
    server.listen(port, '127.0.0.1', () => console.log(`Bet-R Play-R on http://127.0.0.1:${port}/`));
  }
}
