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
  const sinToast = () => page.evaluate(() => { document.getElementById('aviso').className = ''; });

  try {
    await page.waitForSelector('#carga-pantalla', { state: 'visible' });
    await captura('01-inicio');
    await page.click('#btn-inicio-demo');
    await page.waitForSelector('#app-pantalla', { state: 'visible' });

    // Marca de ejemplo.
    await page.click('#btn-menu');
    await page.click('#btn-config');
    await page.waitForFunction(() => document.activeElement && document.activeElement.id === 'cfg-nombre');
    await page.fill('#cfg-nombre', 'Inmobiliaria del Sur');
    await page.click('[data-cfg-pestana="apariencia"]');
    await page.click('[data-color-selector="color"] .cfg-muestra[data-color="#0F766E"]');
    await captura('06-configuracion');
    await page.click('#cfg-guardar');
    await page.waitForSelector('#modal-config', { state: 'hidden' });
    await sinToast();

    // Base de datos con una fila desplegada.
    await page.click('#base-tbody .base-fila');
    await captura('02-base-de-datos');

    await page.click('#pestana-aumentos');
    await page.waitForSelector('#contenido .tarjeta');
    await captura('03-aumentos');

    await page.click('#pestana-vencimientos');
    await page.waitForSelector('#contenido .tarjeta');
    await captura('04-renovaciones');

    // Linea de tiempo del apto ya renovado.
    await page.click('#pestana-basedatos');
    await page.fill('#base-busqueda', 'U1002');
    await page.click('#base-tbody .base-fila');
    await page.click('[data-linea-tiempo]');
    await page.waitForSelector('#modal-linea-tiempo.abierto');
    await captura('05-linea-de-tiempo');
    await page.click('[data-cerrar-modal="modal-linea-tiempo"]');
    await page.fill('#base-busqueda', '');

    await page.click('#pestana-propietarios');
    await captura('07-propietarios');

    // Modo oscuro.
    await page.click('#btn-tema');
    await page.click('#pestana-aumentos');
    await page.waitForSelector('#contenido .tarjeta');
    await captura('08-modo-oscuro');
  } finally {
    await app.close();
  }
}

main().catch(e => { console.error(e); process.exit(1); });
