// Starts the pizzeria: the backend (port 3001) and the website (port 3000).
// `npx apiblaze@latest demo` runs this for you and connects APIblaze to the backend.
// To run it yourself: `node start.js`, then in another terminal
//   npx apiblaze@latest dev --port 3001 --project <the name in .env.local> --auto

const fs = require('fs');
const path = require('path');

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

module.exports = { start, loadEnv };
if (require.main === module) {
  start().then(({ appPort }) => console.log(`Pizzeria running: http://localhost:${appPort}`))
    .catch((e) => { console.error(`Could not start: ${e.message}`); process.exit(1); });
}
