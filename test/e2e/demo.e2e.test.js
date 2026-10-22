// Datos de ejemplo: se cargan desde la pantalla de inicio y llenan todas las pestañas.
const test   = require('node:test');
const assert = require('node:assert/strict');
const { launch, tmpDir, shot } = require('./helpers');

test('datos de ejemplo: cargar y recorrer las pestañas', { timeout: 90000 }, async () => {
  const { app, page, errors } = await launch(tmpDir());
  try {
    await page.waitForSelector('#upload-screen', { state: 'visible' });
    await page.click('#btn-start-demo');
    await page.waitForSelector('#app-screen', { state: 'visible' });
    assert.match(await page.textContent('#file-info'), /19 activos \/ 21 total/);
    assert.ok(await page.locator('#db-tbody tr').count() >= 19);
    await shot(page, '20-demo-base-datos');

    await page.click('#tab-propietarios');
    await page.waitForSelector('#owners-panel', { state: 'visible' });
    const owners = await page.evaluate(() => app.estado.owners.map(o => o.nombre));
    assert.ok(owners.includes('Carla Mendez') && owners.includes('Diego Mendez'), 'copropietarios separados');
    await shot(page, '21-demo-propietarios');

    await page.click('#tab-aumentos');
    await page.waitForSelector('#content .card');
    assert.ok(+(await page.textContent('#tab-aumentos .tab-aviso')) >= 5, 'circulito de aumentos pendientes');
    // El mensaje usa el nombre configurado y los datos del contrato.
    const msg = await page.getAttribute('#content .copy-btn[title="Copiar mensaje propietario"]', 'data-copy');
    assert.match(msg, /^Hola! Te escribo desde Mi Inmobiliaria\. .* quedando en /);
    await shot(page, '22-demo-aumentos');

    await page.click('#tab-vencimientos');
    await page.waitForSelector('#content .card');
    assert.match(await page.textContent('#content'), /Vencidos sin resolver \(1\)/);
    assert.equal(await page.textContent('#tab-vencimientos .tab-aviso'), '3');
    await shot(page, '23-demo-renovaciones');

    await page.click('#tab-administraciones');
    await page.waitForSelector('#admin-panel', { state: 'visible' });
    assert.match(await page.textContent('#admin-panel'), /Gestión Edificios Norte/);
    await shot(page, '24-demo-administraciones');
    assert.deepEqual(errors, []);
  } finally { await app.close(); }
});
