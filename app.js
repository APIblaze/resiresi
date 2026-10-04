// Nino's Pizza website server: serves the page and makes its calls.
//
// PROTECTED (the default): every call goes to the PUBLIC API — through APIblaze — with the
// pizzeria's server key (kept here, never in the browser) and X-End-User-Id naming the
// person. APIblaze checks the key, applies the rules and forwards to the backend.
//
// DIRECT (the page's "unprotected" switch): the same calls go straight to the backend on
// localhost, with the shared backend secret and whatever user the page claims. No APIblaze:
// nobody checks who may do what. That is how most apps ship.
//
// The chat and the two admin widgets use apiblaze's own server helpers
// (lib/apiblaze-server.js, copied in by `npx apiblaze@latest demo` — the same code as
// `import … from 'apiblaze/server'`).

const http = require('http');
const fs = require('fs');
const path = require('path');

const env = (name, fallback = '') => process.env[name] || fallback;
const json = (res, status, body) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };

let lib = null;
try { lib = require('./lib/apiblaze-server.js'); } catch { /* run without the widgets */ }

// The two pizzerias (tenants) and the people the demo lets you be. A real app takes
// "who is this" from its own login.
const PIZZERIAS = {
  nino: { label: 'Nino Pizza', tenant: () => env('APIBLAZE_TENANT', env('DEMO_NINO_TENANT')), key: () => env('APIBLAZE_SERVER_KEY'), admin: { userId: 'ana', label: 'Ana', email: 'ana@ninopizza.example' } },
  gino: { label: 'Gino Pizza', tenant: () => env('APIBLAZE_GINO_TENANT', env('DEMO_GINO_TENANT')), key: () => env('APIBLAZE_GINO_KEY'), admin: { userId: 'gina', label: 'Gina', email: 'gina@ginopizza.example' } },
};
// Each pizzeria (tenant) has its own MCP address: https://{proxy}-{tenant}.mcp.…
const portalFor = (tenant) => (env('APIBLAZE_PORTAL_URL') && env('APIBLAZE_TENANT') && tenant ? env('APIBLAZE_PORTAL_URL').replace(`${env('APIBLAZE_TENANT')}.portal`, `${tenant}.portal`) : '');
const mcpFor = (tenant) => (env('APIBLAZE_MCP_URL') && env('APIBLAZE_TENANT') && tenant ? env('APIBLAZE_MCP_URL').replace(`-${env('APIBLAZE_TENANT')}.`, `-${tenant}.`) : '');
const CUSTOMERS = { ana: 'Ana', ben: 'Ben' };
const pizzeriaOf = (id) => PIZZERIAS[id] || PIZZERIAS.nino;
function queryOf(req) { return new URL(req.url, 'http://x').searchParams; }

async function call(op, { pizzeria = 'nino', as = 'ana', id, body, direct = false } = {}) {
  const pz = pizzeriaOf(pizzeria);
  const base = direct ? `http://127.0.0.1:${env('BACKEND_PORT', '3001')}` : env('APIBLAZE_URL').replace(/\/$/, '');
  const headers = { 'content-type': 'application/json' };
  if (direct) {
    // Straight to localhost: the backend trusts whatever these headers say.
    headers['x-target-api-key'] = env('BACKEND_SECRET');
    headers['x-abz-user-id'] = as;
    headers['x-abz-tenant-id'] = pz.tenant();
  } else {
    headers['x-api-key'] = pz.key();
    headers['x-end-user-id'] = as;
  }
  const req = op === 'book' ? { method: 'POST', url: `${base}/reservations`, body: JSON.stringify({ name: CUSTOMERS[as] || as, ...(body || {}) }) }
    : op === 'cancel' ? { method: 'DELETE', url: `${base}/reservations/${encodeURIComponent(id || '')}` }
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
  const out = { chat: {} };
  for (const [id, pz] of Object.entries(PIZZERIAS)) {
    if (!pz.tenant() || !pz.key()) continue;
    // The assistant acts as the signed-in customer, at that customer's pizzeria.
    out.chat[id] = lib.createApiblazeChat({
      project: `${env('APIBLAZE_NAME')}-${pz.tenant()}`, apiKey: pz.key(),
      host: 'tryabz.run', environment: 'dev', getUser: (req) => ({ userId: queryOf(req).get('as') || 'ana' }),
    });
  }
  if (env('APIBLAZE_CP_KEY') && env('APIBLAZE_WIDGETS') === '1') {
    // Admin widgets: the admin of the chosen pizzeria.
    const admin = (req) => { const pz = pizzeriaOf(queryOf(req).get('pizzeria')); return { tenant: pz.tenant(), ...pz.admin }; };
    out.keys = lib.createApiblazeKeys({ cpKey: env('APIBLAZE_CP_KEY'), getUser: admin, environment: 'dev' });
    out.groups = lib.createApiblazeGroups({ cpKey: env('APIBLAZE_CP_KEY'), getUser: admin });
  }
  return out;
}

/** One of the two websites: `direct` = straight to the backend (unprotected), else through APIblaze. */
function startApp(port = Number(env('APP_PORT', '3000')), { direct = false } = {}) {
  const w = direct ? {} : widgets();
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
        for (const asset of ['apiblaze-widgets.js', 'apiblaze-logo.svg']) {
          if (req.method === 'GET' && p === `/${asset}` && fs.existsSync(path.join(pub, asset))) {
            res.writeHead(200, { 'content-type': asset.endsWith('.svg') ? 'image/svg+xml' : 'text/javascript; charset=utf-8' });
            return res.end(fs.readFileSync(path.join(pub, asset)));
          }
        }
        if (p === '/api/config') {
          return json(res, 200, {
            direct, apiUrl: env('APIBLAZE_URL'), portalUrl: env('APIBLAZE_PORTAL_URL'),
            backendPort: env('BACKEND_PORT', '3001'),
            protectedUrl: env('APIBLAZE_URL') ? `http://localhost:${env('APP_PORT', '3000')}` : '',
            directUrl: `http://localhost:${env('DIRECT_PORT', '3002')}`,
            logsCommand: `npx apiblaze@latest logs ${env('APIBLAZE_NAME')} --tenant ${env('APIBLAZE_TENANT')}`,
            pizzerias: Object.entries(PIZZERIAS).filter(([, pz]) => pz.tenant()).map(([id, pz]) => ({ id, label: pz.label, admin: pz.admin.label, mcpUrl: mcpFor(pz.tenant()), portalUrl: portalFor(pz.tenant()) })),
            widgets: { chat: Object.keys(w.chat || {}), keys: !!w.keys, groups: !!w.groups },
          });
        }
        if (p === '/api/apiblaze/chat') {
          const h = (w.chat || {})[url.searchParams.get('pizzeria') || 'nino'];
          if (h) return viaHandler(h.handler, req, res, raw);
        }
        if (p === '/api/apiblaze/keys' && w.keys) return viaHandler(w.keys.handler, req, res, raw);
        if (p === '/api/apiblaze/groups' && w.groups) return viaHandler(w.groups.handler, req, res, raw);
        if (req.method === 'POST' && p === '/api/act') {
          const b = JSON.parse(raw || '{}');
          return json(res, 200, await call(String(b.op || 'list'), { pizzeria: b.pizzeria, as: String(b.as || 'ana'), id: b.id, body: b.body, direct }));
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
