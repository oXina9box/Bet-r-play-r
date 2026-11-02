// Tiny local data server: saves app data to data/betrplayr.json + a daily backup copy.
// No dependencies. Started automatically by run.sh. Listens on localhost only.
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 47615;
const DIR = path.join(__dirname, 'data');
const FILE = path.join(DIR, 'betrplayr.json');
const BACKUPS = path.join(DIR, 'backups');
fs.mkdirSync(BACKUPS, { recursive: true });

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Private-Network': 'true' };

function write(file, body) {
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, body);
  fs.renameSync(tmp, file);
}

http.createServer((req, res) => {
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
  if (req.url === '/data' && req.method === 'GET') {
    res.writeHead(200, { ...cors, 'Content-Type': 'application/json' });
    return res.end(fs.existsSync(FILE) ? fs.readFileSync(FILE) : 'null');
  }
  if ((req.url === '/data' || req.url === '/snapshot') && req.method === 'POST') {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      try {
        const d = JSON.parse(body);
        if (!d || !d.sites || !d.books) throw new Error('invalid');
        const day = new Date().toLocaleDateString('en-CA');
        if (req.url === '/snapshot') write(path.join(BACKUPS, `pre-import-${Date.now()}.json`), body);
        else { write(FILE, body); write(path.join(BACKUPS, `${day}.json`), body); }
        res.writeHead(200, cors); res.end('ok');
      } catch (e) { res.writeHead(400, cors); res.end(e.message); }
    });
    return;
  }
  if (req.url === '/ping') { res.writeHead(200, cors); return res.end('ok'); }
  res.writeHead(404, cors); res.end();
}).listen(PORT, '127.0.0.1', () => console.log(`Bet-R Play-R data server on :${PORT} → ${FILE}`));
