// Prueba rapida de la app empaquetada (despues de npm run dist / dist:visor): abre el .exe con
// una carpeta temporal, carga los datos de ejemplo (o, en el Visor, pide la carpeta compartida).
// Uso: node test/e2e/empaquetado.smoke.js [editor|visor]
const assert = require('node:assert/strict');
const fs     = require('fs');
const os     = require('os');
const path   = require('path');
const { _electron } = require('playwright-core');

const visor = process.argv[2] === 'visor';
const exe = visor
  ? path.join(__dirname, '..', '..', 'dist-visor', 'win-unpacked', 'Admin Alquileres Visor.exe')
  : path.join(__dirname, '..', '..', 'dist', 'win-unpacked', 'Admin Alquileres.exe');

(async () => {
  assert.ok(fs.existsSync(exe), `no existe ${exe} (correr antes npm run ${visor ? 'dist:visor' : 'dist'})`);
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'alq-smoke-'));
  const env = { ...process.env, ADMIN_ALQ_NO_EXTERNAL: '1', ADMIN_ALQ_DATA_DIR: dataDir, ADMIN_ALQ_SHARED_DIR: path.join(dataDir, 'compartida') };
  const app = await _electron.launch({ executablePath: exe, env });
  try {
    const page = await app.firstWindow();
    page.setDefaultTimeout(20000);
    if (visor) {
      await page.waitForSelector('#viewer-setup-screen', { state: 'visible' });
      assert.ok(await page.isVisible('#btn-viewer-pick'));
    } else {
      await page.click('#btn-start-demo');
      await page.waitForSelector('#app-screen', { state: 'visible' });
      assert.equal(await page.evaluate(() => app.estado.entries.length), 21);
    }
    console.log(`OK: ${path.basename(exe)}`);
  } finally { await app.close(); }
})().catch(e => { console.error(e); process.exit(1); });
