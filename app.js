// Nino's Pizza website server: serves the page and makes its calls.
//
// Every call goes through APIblaze with ONE server key (kept here, never in the
// browser) and says who is acting with X-End-User-Id. The chat and the two
// widgets use apiblaze's own server helpers (lib/apiblaze-server.js, copied in by
// `npx apiblaze@latest demo` — the same code as `import … from 'apiblaze/server'`).

const http = require('http');
const fs = require('fs');
const path = require('path');
const { recent } = require('./backend');

const env = (name, fallback = '') => process.env[name] || fallback;
const json = (res, status, body) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
const mask = (k) => (k ? `${k.slice(0, 7)}••••${k.slice(-4)}` : '');

let lib = null;
try { lib = require('./lib/apiblaze-server.js'); } catch { /* run without the widgets */ }

// The person using the page. A real app takes this from its own login.
const ME = { userId: 'ana', email: 'ana@ninopizza.example', label: 'Ana' };

async function call(op, { as = 'ana', id, key = 'nino', body } = {}) {
  const base = env('APIBLAZE_URL').replace(/\/$/, '');
  const headers = {
    'content-type': 'application/json',
    'x-api-key': key === 'gino' ? env('APIBLAZE_GINO_KEY') : env('APIBLAZE_SERVER_KEY'),
    'x-end-user-id': as,
  };
  const req = op === 'book' ? { method: 'POST', url: `${base}/reservations`, body: JSON.stringify(body || { name: 'Ana', table: 4, time: '19:30', guests: 2 }) }
    : op === 'cancel' ? { method: 'DELETE', url: `${base}/reservations/${encodeURIComponent(id || '')}` }
      : op === 'open' ? { method: 'GET', url: `${base}/reservations/${encodeURIComponent(id || '')}` }
        : { method: 'GET', url: `${base}/reservations` };
  const r = await fetch(req.url, { method: req.method, headers, body: req.body });
  const text = await r.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { status: r.status, body: data };
}

// Node http  <->  the web-standard handlers apiblaze/server exports.
async function viaHandler(handler, req, res, raw) {
  const request = new Request(`http://localhost${req.url}`, {
    method: req.method,
    headers: { 'content-type': req.headers['content-type'] || 'application/json' },
    body: ['GET', 'HEAD'].includes(req.method) ? undefined : raw,
  });
  const out = await handler(request);
  const headers = {};
  out.headers.forEach((v, k) => { headers[k] = v; });
  res.writeHead(out.status, headers);
  if (!out.body) return res.end();
  const reader = out.body.getReader();
  for (;;) { const { done, value } = await reader.read(); if (done) break; res.write(Buffer.from(value)); }
  res.end();
}

function widgets() {
  if (!lib) return {};
  const project = env('APIBLAZE_NAME');
  const tenant = env('APIBLAZE_TENANT');
  const out = {};
  out.chat = lib.createApiblazeChat({
    project: `${project}-${tenant}`, apiKey: env('APIBLAZE_SERVER_KEY'),
    host: 'tryabz.run', environment: 'dev', getUser: () => ({ userId: ME.userId }),
  });
  if (env('APIBLAZE_CP_KEY') && env('APIBLAZE_WIDGETS') === '1') {
    const user = () => ({ tenant, userId: ME.userId, email: ME.email, label: ME.label });
    out.keys = lib.createApiblazeKeys({ cpKey: env('APIBLAZE_CP_KEY'), getUser: user });
    out.groups = lib.createApiblazeGroups({ cpKey: env('APIBLAZE_CP_KEY'), getUser: user });
  }
  return out;
}

function startApp(port = Number(env('APP_PORT', '3000'))) {
  const w = widgets();
  const pub = path.join(__dirname, 'public');
  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => { raw += c; });
    req.on('end', async () => {
      try {
        const url = new URL(req.url, 'http://x');
        const p = url.pathname;
        if (req.method === 'GET' && (p === '/' || p === '/index.html')) {
          res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
          return res.end(fs.readFileSync(path.join(pub, 'index.html')));
        }
        if (req.method === 'GET' && p === '/apiblaze-widgets.js' && fs.existsSync(path.join(pub, 'apiblaze-widgets.js'))) {
          res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8' });
          return res.end(fs.readFileSync(path.join(pub, 'apiblaze-widgets.js')));
        }
        if (p === '/api/config') {
          return json(res, 200, {
            name: env('APIBLAZE_NAME'), apiUrl: env('APIBLAZE_URL'), mcpUrl: env('APIBLAZE_MCP_URL'),
            portalUrl: env('APIBLAZE_PORTAL_URL'), key: mask(env('APIBLAZE_SERVER_KEY')), ginoKey: mask(env('APIBLAZE_GINO_KEY')),
            backendPort: env('BACKEND_PORT', '3001'), rps: Number(env('APIBLAZE_DEMO_RPS')) || null, rateCard: env('APIBLAZE_RATE_CARD') === '1', widgets: { chat: !!w.chat, keys: !!w.keys, groups: !!w.groups },
          });
        }
        if (p === '/api/ticker') return json(res, 200, recent.slice(0, 12));
        if (p === '/api/apiblaze/chat' && w.chat) return viaHandler(w.chat.handler, req, res, raw);
        if (p === '/api/apiblaze/keys' && w.keys) return viaHandler(w.keys.handler, req, res, raw);
        if (p === '/api/apiblaze/groups' && w.groups) return viaHandler(w.groups.handler, req, res, raw);
        if (req.method === 'POST' && p === '/api/act') {
          const b = JSON.parse(raw || '{}');
          return json(res, 200, await call(String(b.op || 'list'), { as: String(b.as || 'ana'), id: b.id, key: b.key, body: b.body }));
        }
        if (req.method === 'POST' && p === '/api/hammer') {
          // 30 calls at once, as one customer: the demo's rate limit lets only some through.
          const codes = await Promise.all(Array.from({ length: 30 }, () => call('list').then((r) => r.status).catch(() => 0)));
          const served = codes.filter((c) => c === 200).length;
          const limited = codes.filter((c) => c === 429).length;
          return json(res, 200, { sent: codes.length, served, limited, other: codes.length - served - limited });
        }
        json(res, 404, { error: 'not found' });
      } catch (e) {
        json(res, 502, { error: `Could not reach the API: ${String((e && e.message) || e)}` });
      }
    });
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => resolve(server));
  });
}

module.exports = { startApp };
