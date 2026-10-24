// Genera las capturas del README (docs/capturas) con los datos de ejemplo.
// Uso: npm run capturas
const fs   = require('fs');
const path = require('path');
const { ROOT, lanzar, carpetaTemporal } = require('../test/e2e/helpers');

const SALIDA = path.join(ROOT, 'docs', 'capturas');

async function main() {
  fs.mkdirSync(SALIDA, { recursive: true });
  // El IPC se consulta al INE como en la app real (las pruebas lo desactivan).
  const { app, page } = await lanzar(carpetaTemporal('alq-capturas-'), { ADMIN_ALQ_NO_EXTERNAL: undefined }, { tamano: { width: 1280, height: 800 } });
  const captura = async nombre => { await page.waitForTimeout(250); await page.screenshot({ path: path.join(SALIDA, nombre + '.png') }); console.log('  ' + nombre); };
  const sinToast = () => page.evaluate(() => { document.getElementById('toast').className = ''; });

  try {
    await page.waitForSelector('#upload-screen', { state: 'visible' });
    await captura('01-inicio');
    await page.click('#btn-start-demo');
    await page.waitForSelector('#app-screen', { state: 'visible' });

    // Marca de ejemplo.
    await page.click('#btn-menu');
    await page.click('#btn-config');
    await page.waitForFunction(() => document.activeElement && document.activeElement.id === 'cfg-nombre');
    await page.fill('#cfg-nombre', 'Inmobiliaria del Sur');
    await page.click('[data-cfg-tab="apariencia"]');
    await page.click('[data-color-picker="color"] .cfg-swatch[data-color="#0F766E"]');
    await captura('06-configuracion');
    await page.click('#cfg-guardar');
    await page.waitForSelector('#modal-config', { state: 'hidden' });
    await sinToast();

    // Base de datos con una fila desplegada.
    await page.click('#db-tbody .db-row');
    await captura('02-base-de-datos');

    await page.click('#tab-aumentos');
    await page.waitForSelector('#content .card');
    await captura('03-aumentos');

    await page.click('#tab-vencimientos');
    await page.waitForSelector('#content .card');
    await captura('04-renovaciones');

    // Linea de tiempo del apto ya renovado.
    await page.click('#tab-basedatos');
    await page.fill('#db-search', 'U1002');
    await page.click('#db-tbody .db-row');
    await page.click('[data-timeline]');
    await page.waitForSelector('#modal-timeline.open');
    await captura('05-linea-de-tiempo');
    await page.click('[data-close-modal="modal-timeline"]');
    await page.fill('#db-search', '');

    await page.click('#tab-propietarios');
    await captura('07-propietarios');

    // Modo oscuro.
    await page.click('#btn-theme');
    await page.click('#tab-aumentos');
    await page.waitForSelector('#content .card');
    await captura('08-modo-oscuro');
  } finally {
    await app.close();
  }
}

main().catch(e => { console.error(e); process.exit(1); });
