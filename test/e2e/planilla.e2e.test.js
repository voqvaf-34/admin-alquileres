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
