// Genera las capturas del README (docs/capturas) con los datos de ejemplo.
// Uso: npm run capturas
const fs   = require('fs');
const os   = require('os');
const path = require('path');
const { _electron } = require('playwright-core');

const ROOT = path.join(__dirname, '..');
const OUT  = path.join(ROOT, 'docs', 'capturas');

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'alq-capturas-'));
  const app = await _electron.launch({
    executablePath: require('electron'), args: [ROOT], cwd: ROOT,
    env: { ...process.env, ADMIN_ALQ_NO_EXTERNAL: '1', ADMIN_ALQ_SIN_ASISTENTE: '1', ADMIN_ALQ_FUERA_DE_PANTALLA: '1', ADMIN_ALQ_DATA_DIR: dataDir, ADMIN_ALQ_SHARED_DIR: path.join(dataDir, 'compartida') },
  });
  const page = await app.firstWindow();
  page.setDefaultTimeout(20000);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.emulateMedia({ colorScheme: 'light' });
  const shot = async name => { await page.waitForTimeout(250); await page.screenshot({ path: path.join(OUT, name + '.png') }); console.log('  ' + name); };
  const sinToast = () => page.evaluate(() => { document.getElementById('toast').className = ''; });

  try {
    await page.waitForSelector('#upload-screen', { state: 'visible' });
    await shot('01-inicio');
    await page.click('#btn-start-demo');
    await page.waitForSelector('#app-screen', { state: 'visible' });

    // Marca de ejemplo.
    await page.click('#btn-menu');
    await page.click('#btn-config');
    await page.waitForFunction(() => document.activeElement && document.activeElement.id === 'cfg-nombre');
    await page.fill('#cfg-nombre', 'Inmobiliaria del Sur');
    await page.click('[data-cfg-tab="apariencia"]');
    await page.click('[data-color-picker="color"] .cfg-swatch[data-color="#0F766E"]');
    await shot('06-configuracion');
    await page.click('#cfg-guardar');
    await page.waitForSelector('#modal-config', { state: 'hidden' });
    await sinToast();

    // Base de datos con una fila desplegada.
    await page.click('#db-tbody .db-row');
    await shot('02-base-de-datos');

    await page.click('#tab-aumentos');
    await page.waitForSelector('#content .card');
    await shot('03-aumentos');

    await page.click('#tab-vencimientos');
    await page.waitForSelector('#content .card');
    await shot('04-renovaciones');

    // Linea de tiempo del apto ya renovado.
    await page.click('#tab-basedatos');
    await page.fill('#db-search', 'U1002');
    await page.click('#db-tbody .db-row');
    await page.click('[data-timeline]');
    await page.waitForSelector('#modal-timeline.open');
    await shot('05-linea-de-tiempo');
    await page.click('[data-close-modal="modal-timeline"]');
    await page.fill('#db-search', '');

    await page.click('#tab-propietarios');
    await shot('07-propietarios');

    // Modo oscuro.
    await page.click('#btn-theme');
    await page.click('#tab-aumentos');
    await page.waitForSelector('#content .card');
    await shot('08-modo-oscuro');
  } finally {
    await app.close();
  }
}

main().catch(e => { console.error(e); process.exit(1); });
