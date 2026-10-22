// Prueba de punta a punta: lanza la app Electron real con una carpeta de datos temporal.
const test   = require('node:test');
const assert = require('node:assert/strict');
const fs     = require('fs');
const os     = require('os');
const path   = require('path');
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

const shot = (page, name) => page.screenshot({ path: path.join(SHOTS, name + '.png') });

test('primer arranque: empezar con una base vacia', { timeout: 60000 }, async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'alq-e2e-'));
  const { app, page, errors } = await launch(dataDir);
  try {
    await page.waitForSelector('#upload-screen', { state: 'visible' });
    assert.match(await page.textContent('#upload-screen'), /Cómo querés empezar/);
    await shot(page, '01-inicio');
    await page.click('#btn-start-empty');
    await page.waitForSelector('#app-screen', { state: 'visible' });
    assert.match(await page.textContent('#file-info'), /0 activos \/ 0 total/);
    await shot(page, '02-base-vacia');
    assert.deepEqual(errors, []);
  } finally { await app.close(); }
});
