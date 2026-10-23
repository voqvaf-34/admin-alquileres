// Editor + Visor: el editor publica en una carpeta compartida (temporal) y el Visor la
// muestra en solo lectura y se actualiza solo.
const test   = require('node:test');
const assert = require('node:assert/strict');
const fs     = require('fs');
const os     = require('os');
const path   = require('path');
const { _electron } = require('playwright-core');
const { abrirConfiguracion, elegirColor } = require('./helpers');

const ROOT      = path.join(__dirname, '..', '..');
const SHOTS     = process.env.E2E_SCREENSHOTS || path.join(os.tmpdir(), 'alq-e2e-shots');

async function launch(env) {
  const app = await _electron.launch({ executablePath: require('electron'), args: [ROOT], cwd: ROOT, env: { ...process.env, ADMIN_ALQ_NO_EXTERNAL: '1', ADMIN_ALQ_SIN_ASISTENTE: '1', ADMIN_ALQ_FUERA_DE_PANTALLA: '1', ...env } });
  const page = await app.firstWindow();
  page.setDefaultTimeout(20000);
  await page.emulateMedia({ colorScheme: 'light' });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.evaluate(() => { window.confirm = () => true; });
  return { app, page, errors };
}

test('editor publica y el visor muestra en solo lectura, actualizandose solo', { timeout: 120000 }, async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const shared = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'alq-shared-')), 'Base Admin Alquileres');
  const editor = await launch({ ADMIN_ALQ_DATA_DIR: fs.mkdtempSync(path.join(os.tmpdir(), 'alq-ed-')),
    ADMIN_ALQ_SHARED_DIR: shared });
  let viewer;
  try {
    // El editor arranca con los datos de ejemplo y una marca propia.
    await editor.page.click('#btn-start-demo');
    await editor.page.waitForSelector('#app-screen', { state: 'visible' });
    await abrirConfiguracion(editor.page);
    await editor.page.fill('#cfg-nombre', 'Inmobiliaria del Sur');
    await elegirColor(editor.page, '#7C3AED');
    await editor.page.click('#cfg-guardar');
    await editor.page.waitForSelector('#modal-config', { state: 'hidden' });
    await editor.page.waitForFunction(() => document.getElementById('share-dot').classList.contains('ok'));
    assert.ok(fs.existsSync(path.join(shared, 'alquileres.sqlite')), 'la base se publico');
    const total = await editor.page.evaluate(() => app.estado.entries.length);

    viewer = await launch({ ADMIN_ALQ_DATA_DIR: fs.mkdtempSync(path.join(os.tmpdir(), 'alq-vi-')),
      ADMIN_ALQ_MODE: 'viewer', ADMIN_ALQ_SHARED_DIR: shared, ADMIN_ALQ_POLL_MS: '500' });
    const vp = viewer.page;
    await vp.waitForSelector('#app-screen', { state: 'visible' });
    assert.equal(await vp.evaluate(() => app.estado.entries.length), total, 'el visor ve los mismos datos');
    assert.ok(await vp.isVisible('.viewer-badge'));
    // Misma marca que el editor (viaja dentro de la base publicada).
    assert.equal(await vp.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--m-header').trim()), '#7C3AED');
    assert.equal(await vp.textContent('#hdr-logo [data-marca-nombre]'), 'Inmobiliaria del Sur');
    assert.equal(await vp.title(), 'Inmobiliaria del Sur · Alquileres · Visor');
    for (const sel of ['#btn-add-entry', '#btn-undo', '#btn-share', '#btn-config', '#tab-aumentos', '#tab-vencimientos']) {
      assert.equal(await vp.isVisible(sel), false, `${sel} oculto en el visor`);
    }
    await vp.click('#db-tbody .db-row');
    assert.equal(await vp.locator('#db-tbody [data-edit-row]:visible, #db-tbody [data-delete-row]:visible').count(), 0, 'sin editar ni inactivar');
    await vp.screenshot({ path: path.join(SHOTS, '10-visor.png') });
    await vp.click('#tab-propietarios');

    // Un cambio en el editor aparece solo en el visor.
    const ep = editor.page;
    const agregar = async calle => {
      await ep.click('#btn-add-entry');
      await ep.waitForFunction(() => document.activeElement && document.activeElement.id === 'm-edificio');
      await ep.fill('#m-calle', calle);
      await ep.fill('#m-importe', '15000');
      await ep.click('#modal-submit');
      await ep.waitForSelector('#modal-add', { state: 'hidden' });
      await vp.waitForFunction(c => app.estado.entries.some(e => e.direccion === c), calle, { timeout: 15000 });
    };
    await agregar('Visor Prueba 123');
    assert.match(await vp.textContent('#viewer-updated'), /Datos al \d{2}\/\d{2} \d{2}:\d{2}/);

    // Lo nuevo se marca con un aviso en la pestaña hasta que se entra a verla.
    const novedad = tab => vp.evaluate(t => { const a = document.querySelector(`#tab-${t} .tab-aviso`); return a && !a.hidden ? +a.textContent : 0; }, tab);
    assert.equal(await novedad('basedatos'), 1, 'un alquiler nuevo');
    assert.equal(await novedad('administraciones'), 0, 'nada nuevo en administraciones');
    await vp.screenshot({ path: path.join(SHOTS, '10b-visor-novedad.png') });
    await vp.click('#tab-basedatos');
    assert.equal(await novedad('basedatos'), 0, 'al entrar a la pestaña se da por visto');
    // ...y lo nuevo queda arriba de todo, con un punto naranja, mientras se este en la pestaña
    assert.match(await vp.textContent('#db-tbody tr:first-child'), /Nuevos/);
    assert.match(await vp.locator('#db-tbody .db-row').first().textContent(), /Visor Prueba 123/);
    assert.equal(await vp.locator('#db-tbody .punto-nuevo').count(), 1);
    await vp.screenshot({ path: path.join(SHOTS, '10c-visor-nuevos-arriba.png') });
    await vp.click('#tab-propietarios');
    await vp.click('#tab-basedatos');
    assert.equal(await vp.locator('#db-tbody .punto-nuevo').count(), 0, 'al volver ya es un registro normal');
    // Lo que llega estando en la pestaña (o al abrir el Visor en ella) se ve directo: sin circulito, con punto.
    await agregar('Visor Prueba 456');
    assert.equal(await novedad('basedatos'), 0, 'la pestaña en pantalla no acumula novedades');
    assert.match(await vp.locator('#db-tbody .db-row').first().textContent(), /Visor Prueba 456/);
    assert.equal(await vp.locator('#db-tbody .punto-nuevo').count(), 1);
    await vp.reload();
    await vp.waitForSelector('#app-screen', { state: 'visible' });
    assert.equal(await novedad('basedatos'), 0, 'lo visto se recuerda al volver a abrir');

    // El visor no puede escribir: no hay canales de modificacion.
    const r = await vp.evaluate(() => window.api.addContract({ direccion: 'X', importeBase: 1 }).catch(e => 'rechazado'));
    assert.ok(r === 'rechazado' || (r && r.ok === false), 'escritura rechazada');
    assert.deepEqual(viewer.errors, []);
    assert.deepEqual(editor.errors, []);
  } finally {
    if (viewer) await viewer.app.close();
    await editor.app.close();
  }
});

test('visor sin carpeta compartida pide elegirla', { timeout: 60000 }, async () => {
  const v = await launch({ ADMIN_ALQ_DATA_DIR: fs.mkdtempSync(path.join(os.tmpdir(), 'alq-vi-')),
    ADMIN_ALQ_MODE: 'viewer', ADMIN_ALQ_SHARED_DIR: path.join(os.tmpdir(), 'no-existe-' + Date.now()) });
  try {
    await v.page.waitForSelector('#viewer-setup-screen', { state: 'visible' });
    assert.match(await v.page.textContent('#viewer-setup-error'), /No se encontro la base compartida/);
    assert.deepEqual(v.errors, []);
  } finally { await v.app.close(); }
});

test('visor recien instalado (sin carpeta elegida) pide elegirla', { timeout: 60000 }, async () => {
  const env = { ...process.env };
  delete env.ADMIN_ALQ_SHARED_DIR;
  const app = await _electron.launch({ executablePath: require('electron'), args: [ROOT], cwd: ROOT,
    env: { ...env, ADMIN_ALQ_NO_EXTERNAL: '1', ADMIN_ALQ_FUERA_DE_PANTALLA: '1', ADMIN_ALQ_MODE: 'viewer', ADMIN_ALQ_DATA_DIR: fs.mkdtempSync(path.join(os.tmpdir(), 'alq-vi-')) } });
  try {
    const page = await app.firstWindow();
    await page.waitForSelector('#viewer-setup-screen', { state: 'visible' });
    assert.match(await page.textContent('#viewer-setup-error'), /Todavía no se eligió la carpeta compartida/);
  } finally { await app.close(); }
});
