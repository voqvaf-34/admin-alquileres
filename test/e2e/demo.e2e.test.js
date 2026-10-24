// Datos de ejemplo: se cargan desde la pantalla de inicio y llenan todas las pestañas.
const test   = require('node:test');
const assert = require('node:assert/strict');
const { lanzar, carpetaTemporal, captura } = require('./helpers');

test('datos de ejemplo: cargar y recorrer las pestañas', { timeout: 90000 }, async () => {
  const { app, page, errores } = await lanzar(carpetaTemporal());
  try {
    await page.waitForSelector('#carga-pantalla', { state: 'visible' });
    await page.click('#btn-inicio-demo');
    await page.waitForSelector('#app-pantalla', { state: 'visible' });
    assert.match(await page.textContent('#archivo-info'), /19 activos \/ 21 total/);
    assert.ok(await page.locator('#base-tbody tr').count() >= 19);
    await captura(page, '20-demo-base-datos');

    await page.click('#pestana-propietarios');
    await page.waitForSelector('#propietarios-panel', { state: 'visible' });
    const propietarios = await page.evaluate(() => app.estado.propietarios.map(o => o.nombre));
    assert.ok(propietarios.includes('Carla Mendez') && propietarios.includes('Diego Mendez'), 'copropietarios separados');
    await captura(page, '21-demo-propietarios');

    await page.click('#pestana-aumentos');
    await page.waitForSelector('#contenido .tarjeta');
    assert.ok(+(await page.textContent('#pestana-aumentos .pestana-aviso')) >= 5, 'circulito de aumentos pendientes');
    // El mensaje usa el nombre configurado y los datos del contrato.
    const msg = await page.getAttribute('#contenido .copiar-btn[title="Copiar mensaje propietario"]', 'data-copiar');
    assert.match(msg, /^Hola! Te escribo desde Mi Inmobiliaria\. .* quedando en /);
    await captura(page, '22-demo-aumentos');

    await page.click('#pestana-vencimientos');
    await page.waitForSelector('#contenido .tarjeta');
    assert.match(await page.textContent('#contenido'), /Vencidos sin resolver \(1\)/);
    assert.equal(await page.textContent('#pestana-vencimientos .pestana-aviso'), '3');
    await captura(page, '23-demo-renovaciones');

    await page.click('#pestana-administraciones');
    await page.waitForSelector('#admin-panel', { state: 'visible' });
    assert.match(await page.textContent('#admin-panel'), /Gestión Edificios Norte/);
    await captura(page, '24-demo-administraciones');
    assert.deepEqual(errores, []);
  } finally { await app.close(); }
});
