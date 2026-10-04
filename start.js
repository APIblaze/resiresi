// Starts the pizzeria on this laptop: the backend (port 3001) and the website (port 3000).
// No APIblaze involved here — the tunnel is `npx apiblaze@latest demo start|stop|restart`.
//
//   node start.js        run in the foreground (Ctrl-C stops)
//   npm run start        run in the background
//   npm run stop         stop the background one
//   npm run restart      stop, then start again

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const PID = path.join(__dirname, '.demo', 'app.pid');

function loadEnv(file = path.join(__dirname, '.env.local')) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1');
  }
}

async function start() {
  loadEnv();
  const { startBackend } = require('./backend');
  const { startApp } = require('./app');
  const backendPort = Number(process.env.BACKEND_PORT) || 3001;
  const appPort = Number(process.env.APP_PORT) || 3000;
  await startBackend(backendPort);
  await startApp(appPort);
  return { backendPort, appPort };
}

const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
function runningPid() {
  try { const pid = Number(fs.readFileSync(PID, 'utf8')); return pid && alive(pid) ? pid : null; } catch { return null; }
}
async function stop() {
  const pid = runningPid();
  if (!pid) { console.log('The pizzeria is not running.'); return; }
  process.kill(pid, 'SIGTERM');
  for (let i = 0; i < 30 && alive(pid); i++) await new Promise((r) => setTimeout(r, 100));
  try { fs.unlinkSync(PID); } catch { /* gone */ }
  console.log('Stopped the pizzeria (backend and website).');
}
function background() {
  if (runningPid()) { console.log('The pizzeria is already running.'); return; }
  fs.mkdirSync(path.dirname(PID), { recursive: true });
  const log = fs.openSync(path.join(__dirname, '.demo', 'app.log'), 'a');
  const child = spawn(process.execPath, [__filename], { cwd: __dirname, detached: true, stdio: ['ignore', log, log] });
  child.unref();
  fs.writeFileSync(PID, String(child.pid));
  loadEnv();
  console.log(`Started the pizzeria: website http://localhost:${process.env.APP_PORT || 3000}, backend localhost:${process.env.BACKEND_PORT || 3001}.`);
}

module.exports = { start, loadEnv };
if (require.main === module) {
  const arg = process.argv[2];
  if (arg === '--stop') stop();
  else if (arg === '--background') background();
  else if (arg === '--restart') stop().then(() => setTimeout(background, 300));
  else {
    start().then(({ appPort, backendPort }) => console.log(`Pizzeria running: website http://localhost:${appPort}, backend localhost:${backendPort}. Ctrl-C stops.`))
      .catch((e) => { console.error(`Could not start: ${e.message}`); process.exit(1); });
  }
}
