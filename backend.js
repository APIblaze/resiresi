// Nino's Pizza backend: book, list and cancel tables. It runs on YOUR laptop.
//
// `npx apiblaze@latest dev` (which the demo runs for you) puts it on the internet
// at a public URL and gives AI assistants an MCP address for it. Everything else
// (API keys, sign-in, who may change what, rate limits) happens in APIblaze, in
// front of this file. Look at what is NOT here: no login, no keys, no permission
// checks, no AI code.
//
// What APIblaze tells this backend about each call, in two headers:
//   x-abz-tenant-id  which customer (pizzeria) is calling
//   x-abz-user-id    which person
//
// Zero dependencies. Run it alone with `node backend.js` (port 3001).

const http = require('http');
const fs = require('fs');
const path = require('path');

const bookings = new Map();
let next = 1;
// The last requests this laptop answered — the demo page shows them live.
const recent = [];
function remember(entry) {
  recent.unshift({ at: Date.now(), ...entry });
  recent.length = Math.min(recent.length, 50);
  // One line per request in the terminal (`npx apiblaze@latest demo logs` follows it).
  const who = entry.who ? `${entry.who}${entry.tenant ? ` @ ${entry.tenant}` : ''}` : '-';
  console.log(`${new Date().toISOString().slice(11, 19)}  ${entry.status}  ${entry.method.padEnd(6)} ${entry.path.padEnd(22)} ${who}`);
}

function send(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(body === undefined ? '' : JSON.stringify(body));
}

function handle(req, res, body) {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/openapi.yaml') {
    res.writeHead(200, { 'content-type': 'text/yaml' });
    return res.end(fs.readFileSync(path.join(__dirname, 'openapi.yaml')));
  }
  const who = req.headers['x-abz-user-id'] || '';
  const tenant = req.headers['x-abz-tenant-id'] || '';
  const reply = (status, data) => { remember({ method: req.method, path: url.pathname, who, tenant, status }); send(res, status, data); };
  if (!who) return reply(401, { error: 'calls come through APIblaze, which says who is calling' });

  const m = /^\/reservations(?:\/([^/]+))?$/.exec(url.pathname);
  if (!m) return reply(404, { error: 'not found' });
  const id = m[1];

  if (!id && req.method === 'POST') {
    let input = {};
    try { input = JSON.parse(body || '{}'); } catch { return reply(400, { error: 'body must be JSON' }); }
    const row = {
      id: `r${next++}`, name: String(input.name || who), table: Number(input.table) || 1,
      time: String(input.time || '19:30'), guests: Number(input.guests) || 2, owner: who, tenant,
    };
    bookings.set(row.id, row);
    return reply(201, row);
  }
  if (!id && req.method === 'GET') {
    // Lists are the backend's job: each person sees their own bookings, at their own pizzeria.
    return reply(200, [...bookings.values()].filter((r) => r.owner === who && r.tenant === tenant));
  }
  const row = bookings.get(id);
  if (!row) return reply(404, { error: 'no such booking' });
  if (req.method === 'GET') return reply(200, row);
  if (req.method === 'DELETE') { bookings.delete(id); return reply(204); }
  return reply(405, { error: 'method not allowed' });
}

function startBackend(port = Number(process.env.BACKEND_PORT) || 3001) {
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      try { handle(req, res, body); } catch (e) { send(res, 500, { error: String((e && e.message) || e) }); }
    });
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => resolve(server));
  });
}

module.exports = { startBackend, recent };
if (require.main === module) startBackend().then(() => console.log('backend on http://localhost:3001'));
