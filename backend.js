// The pizzeria's backend: book, list and cancel tables.
//
// Look at what is NOT here: no login, no API keys, no "is this your booking?"
// check, no AI code. APIblaze sits in front of this file and does all of that.
// The only things this backend knows about people are two headers APIblaze adds
// to every call it lets through: x-abz-tenant-id, "which pizzeria", and
// x-abz-user-id, "who is asking".
//
// Two doors, so the demo can show the difference:
//   /before/...  the way most apps ship: one shared password, anyone holding it can do anything.
//   /...         behind APIblaze: every call names its person, and APIblaze decides.
//
// Zero dependencies. Run it alone with `node backend.js` (port 3001).

const http = require('http');

const PASSWORD = 'pizza123'; // the "before" app's shared secret
const stores = { before: new Map(), after: new Map() };
let next = 1;

function send(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(body === undefined ? '' : JSON.stringify(body));
}

function handle(req, res, body) {
  const url = new URL(req.url, 'http://x');
  let path = url.pathname;
  let door = 'after';
  if (path.startsWith('/before/')) { door = 'before'; path = path.slice('/before'.length); }

  if (path === '/openapi.yaml') {
    res.writeHead(200, { 'content-type': 'text/yaml' });
    return res.end(require('fs').readFileSync(require('path').join(__dirname, 'openapi.yaml')));
  }

  const who = req.headers['x-abz-user-id'] || '';
  const tenant = req.headers['x-abz-tenant-id'] || '';
  if (door === 'before' && req.headers['x-demo-password'] !== PASSWORD) return send(res, 401, { error: 'wrong password' });
  if (door === 'after' && !who) return send(res, 401, { error: 'only APIblaze may call this door' });

  const db = stores[door];
  const m = /^\/reservations(?:\/([^/]+))?$/.exec(path);
  if (!m) return send(res, 404, { error: 'not found' });
  const id = m[1];

  if (!id && req.method === 'POST') {
    let input = {};
    try { input = JSON.parse(body || '{}'); } catch { return send(res, 400, { error: 'body must be JSON' }); }
    const row = { id: `r${next++}`, name: String(input.name || 'Guest'), table: Number(input.table) || 1, time: String(input.time || '19:30'), owner: who || null, tenant: tenant || null };
    db.set(row.id, row);
    return send(res, 201, row);
  }
  if (!id && req.method === 'GET') {
    // Lists are the backend's job: show each person their own bookings, in their
    // own pizzeria. ("ana" at Nino Pizza and "ana" at Gino Pizza are two people.)
    const rows = [...db.values()].filter((r) => door === 'before' || (r.owner === who && r.tenant === tenant));
    return send(res, 200, rows);
  }
  const row = db.get(id);
  if (!row) return send(res, 404, { error: 'no such booking' });
  if (req.method === 'GET') return send(res, 200, row);
  if (req.method === 'DELETE') { db.delete(id); return send(res, 204); }
  return send(res, 405, { error: 'method not allowed' });
}

function startBackend(port = Number(process.env.BACKEND_PORT) || 3001) {
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      try { handle(req, res, body); } catch (e) { send(res, 500, { error: String(e && e.message || e) }); }
    });
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => resolve(server));
  });
}

module.exports = { startBackend, PASSWORD };
if (require.main === module) startBackend().then(() => console.log('backend on http://localhost:3001'));
