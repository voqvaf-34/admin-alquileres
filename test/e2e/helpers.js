// Utilidades de las pruebas E2E: lanzar la app real con una carpeta de datos temporal.
const fs   = require('fs');
const os   = require('os');
const path = require('path');
const { _electron } = require('playwright-core');

const ROOT  = path.join(__dirname, '..', '..');
const SHOTS = process.env.E2E_SCREENSHOTS || path.join(os.tmpdir(), 'alq-e2e-shots');

async function launch(dataDir, extraEnv = {}) {
  const app = await _electron.launch({
    executablePath: require('electron'),
    args: [ROOT],
    cwd: ROOT,
    env: { ...process.env, ADMIN_ALQ_NO_EXTERNAL: '1', ADMIN_ALQ_DATA_DIR: dataDir, ADMIN_ALQ_SHARED_DIR: path.join(dataDir, 'compartida'), ...extraEnv },
  });
  const page = await app.firstWindow();
  page.setDefaultTimeout(20000);
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.setViewportSize({ width: 1400, height: 900 }).catch(() => {});
  return { app, page, errors };
}

const tmpDir = (prefix = 'alq-e2e-') => fs.mkdtempSync(path.join(os.tmpdir(), prefix));

function shot(page, name) {
  fs.mkdirSync(SHOTS, { recursive: true });
  return page.screenshot({ path: path.join(SHOTS, name + '.png') });
}

// Primer arranque: "Empezar con una base vacia".
async function empezarVacia(page) {
  await page.waitForSelector('#upload-screen', { state: 'visible' });
  await page.click('#btn-start-empty');
  await page.waitForSelector('#app-screen', { state: 'visible' });
}

module.exports = { ROOT, SHOTS, launch, tmpDir, shot, empezarVacia };
