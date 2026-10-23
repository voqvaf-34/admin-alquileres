// Planilla modelo: se descarga desde la pantalla de inicio y se importa tal cual.
const test   = require('node:test');
const assert = require('node:assert/strict');
const fs     = require('fs');
const path   = require('path');
const { launch, tmpDir, shot } = require('./helpers');

test('planilla modelo: descargar e importar', { timeout: 90000 }, async () => {
  const destino = path.join(tmpDir('alq-planilla-'), 'planilla-alquileres.xlsx');
  let { app, page, errors } = await launch(tmpDir());
  try {
    await page.waitForSelector('#upload-screen', { state: 'visible' });
    // El dialogo "Guardar como" se responde desde el proceso principal (no se abre la carpeta).
    await app.evaluate(({ dialog, shell }, file) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
      shell.showItemInFolder = () => {};
    }, destino);
    await shot(page, '30-inicio-planilla');
    await page.click('#btn-template');
    await page.waitForSelector('#toast.show');
    assert.match(await page.textContent('#toast'), /Planilla modelo guardada/);
    assert.ok(fs.existsSync(destino), 'se guardo la planilla');
    assert.deepEqual(errors, []);
  } finally { await app.close(); }

  ({ app, page, errors } = await launch(tmpDir(), { ADMIN_ALQ_IMPORT_FILE: destino }));
  try {
    await page.waitForSelector('#app-screen', { state: 'visible' });
    const datos = await page.evaluate(() => ({
      alquileres: app.estado.entries.map(e => [e.direccion, e.importe, e.moneda, e.garantia]),
      propietarios: app.estado.owners.map(o => o.nombre).sort(),
      admins: app.estado.admins.map(a => a.nombre),
    }));
    assert.deepEqual(datos.alquileres, [
      ['Torre Ceibo - Av. Italia 2875 U403', 29400, 'UYU', 'Porto'],
      ['Canelones 1234 U502', 850, 'USD', 'ANDA'],
    ]);
    assert.deepEqual(datos.propietarios, ['Ana Perez', 'Carla Mendez', 'Diego Mendez']);
    assert.deepEqual(datos.admins, ['Administración Sur (Laura Gómez)']);
    assert.deepEqual(errors, []);
  } finally { await app.close(); }
});

test('importar planilla con la app en uso: agregar (sin repetir), reemplazar y deshacer', { timeout: 90000 }, async () => {
  const XLSX = require('xlsx');
  const { templateWorkbook } = require('../../src/infraestructura/importador-excel');
  const archivo = path.join(tmpDir('alq-planilla-'), 'mis-alquileres.xlsx');
  XLSX.writeFile(templateWorkbook(), archivo);

  const { app, page, errors } = await launch(tmpDir());
  try {
    await page.click('#btn-start-demo');
    await page.waitForSelector('#app-screen', { state: 'visible' });
    await app.evaluate(({ dialog }, file) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] }); }, archivo);
    const total = () => page.evaluate(() => app.estado.entries.length);
    const toast = async () => { await page.waitForSelector('#toast.show'); const t = await page.textContent('#toast'); await page.evaluate(() => { document.getElementById('toast').className = ''; }); return t; };
    assert.equal(await total(), 21);

    // Agregar: suma las dos filas de la planilla modelo (su administracion ya esta en los datos de ejemplo).
    await page.click('#btn-menu');
    await page.click('#btn-menu-importar');
    await page.waitForSelector('#modal-importar.open');
    await shot(page, '31-importar-con-la-app-en-uso');
    await page.click('#imp-elegir');
    await page.waitForSelector('#modal-importar', { state: 'hidden' });
    assert.match(await toast(), /Agregados 2 alquileres$/);
    assert.equal(await total(), 23);
    const nueva = await page.evaluate(() => app.estado.entries.find(e => e.direccion === 'Canelones 1234 U502' && e.inquilino === 'Camila Ruiz'));
    assert.deepEqual([nueva.moneda, nueva.garantia, nueva.propietario], ['USD', 'ANDA', 'Carla Mendez / Diego Mendez']);
    // Los propietarios que ya existian (de los datos de ejemplo) se reutilizan.
    assert.equal(await page.evaluate(() => app.estado.owners.filter(o => o.nombre === 'Ana Perez').length), 1);

    // Agregar de nuevo la misma planilla: todo repetido.
    await page.click('#btn-menu');
    await page.click('#btn-menu-importar');
    await page.click('#imp-elegir');
    assert.match(await toast(), /Agregados 0 alquileres \(2 repetidos salteados\)/);
    assert.equal(await total(), 23);

    // Reemplazar todo (con confirmacion) y deshacer.
    page.once('dialog', d => d.accept());
    await page.click('#btn-menu');
    await page.click('#btn-menu-importar');
    await page.check('input[name="imp-modo"][value="reemplazar"]');
    await page.click('#imp-elegir');
    assert.match(await toast(), /Importados 2 alquileres y 1 administración$/);
    assert.equal(await total(), 2);
    await page.click('#btn-undo');
    await page.waitForFunction(() => app.estado.entries.length === 23);
    assert.deepEqual(errors, []);
  } finally { await app.close(); }
});
