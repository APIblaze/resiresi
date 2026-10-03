// The pizzeria's website server. It serves the page and makes the calls for it.
//
//   "Before" calls go straight to the backend with the shared password.
//   "After"  calls go through APIblaze with ONE server key, and say who is
//            acting with X-End-User-Id. The browser never sees the key.
//
// That is the whole integration: a URL, a key, and a header naming the person.

const http = require('http');
const fs = require('fs');
const path = require('path');
const { PASSWORD } = require('./backend');

function env(name, fallback = '') { return process.env[name] || fallback; }

function json(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

const mask = (k) => (k ? `${k.slice(0, 7)}••••${k.slice(-4)}` : '');

async function call(door, as, op, id, extra) {
  const backend = `http://127.0.0.1:${env('BACKEND_PORT', '3001')}`;
  const base = door === 'before' ? `${backend}/before` : env('APIBLAZE_URL').replace(/\/$/, '');
  const headers = { 'content-type': 'application/json' };
  if (door === 'before') headers['x-demo-password'] = PASSWORD;
  else {
    // Each pizzeria has its own key. "after" = Nino Pizza's key, "gino" = Gino Pizza's key.
    headers['x-api-key'] = door === 'gino' ? env('APIBLAZE_GINO_KEY') : env('APIBLAZE_SERVER_KEY');
    headers['x-end-user-id'] = as;
  }
  const who = { ana: 'Ana', ben: 'Ben' }[as] || as;
  const req = op === 'book'
    ? { method: 'POST', url: `${base}/reservations`, body: JSON.stringify({ name: who, table: (extra && extra.table) || 4, time: (extra && extra.time) || '19:30' }) }
    : op === 'cancel'
      ? { method: 'DELETE', url: `${base}/reservations/${encodeURIComponent(id || '')}` }
      : op === 'open'
        ? { method: 'GET', url: `${base}/reservations/${encodeURIComponent(id || '')}` }
        : { method: 'GET', url: `${base}/reservations` };
  const r = await fetch(req.url, { method: req.method, headers, body: req.body });
  const text = await r.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  return { status: r.status, body };
}

async function relayChat(req, res, raw) {
  let input;
  try { input = JSON.parse(raw || '{}'); } catch { return json(res, 400, { error: 'bad json' }); }
  const mcp = env('APIBLAZE_MCP_URL').replace(/\/$/, '');
  if (!mcp) return json(res, 503, { error: 'The assistant is not set up. Run: npx apiblaze@latest demo' });
  const upstream = await fetch(`${mcp}/runtime-chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': env('APIBLAZE_SERVER_KEY'), 'x-end-user-id': String(input.as || 'ben') },
    body: JSON.stringify({ id: String(input.id || Date.now()), trigger: 'submit-message', messages: input.messages || [] }),
  });
  res.writeHead(upstream.status, { 'content-type': upstream.headers.get('content-type') || 'application/json', 'cache-control': 'no-cache' });
  if (!upstream.body) return res.end();
  const reader = upstream.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    res.write(Buffer.from(value));
  }
  res.end();
}

function startApp(port = Number(env('APP_PORT', '3000'))) {
  const page = path.join(__dirname, 'public', 'index.html');
  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => { raw += c; });
    req.on('end', async () => {
      try {
        const url = new URL(req.url, 'http://x');
        if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
          res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
          return res.end(fs.readFileSync(page));
        }
        if (url.pathname === '/api/config') {
          return json(res, 200, {
            name: env('APIBLAZE_NAME'), apiUrl: env('APIBLAZE_URL'), mcpUrl: env('APIBLAZE_MCP_URL'),
            key: mask(env('APIBLAZE_SERVER_KEY')),
            ginoKey: mask(env('APIBLAZE_GINO_KEY')),
          });
        }
        if (req.method === 'POST' && url.pathname === '/api/act') {
          const b = JSON.parse(raw || '{}');
          const door = ['before', 'gino'].includes(b.door) ? b.door : 'after';
          return json(res, 200, await call(door, String(b.as || 'ana'), String(b.op || 'list'), b.id, b));
        }
        if (req.method === 'POST' && url.pathname === '/api/chat') return relayChat(req, res, raw);
        json(res, 404, { error: 'not found' });
      } catch (e) {
        json(res, 502, { error: `Could not reach the API: ${String(e && e.message || e)}` });
      }
    });
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => resolve(server));
  });
}

module.exports = { startApp };
