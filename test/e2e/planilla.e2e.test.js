// Planilla modelo: se descarga desde la pantalla de inicio y se importa tal cual.
const test   = require('node:test');
const assert = require('node:assert/strict');
const fs     = require('fs');
const path   = require('path');
const { lanzar, carpetaTemporal, captura } = require('./helpers');

test('planilla modelo: descargar e importar', { timeout: 90000 }, async () => {
  const destino = path.join(carpetaTemporal('alq-planilla-'), 'planilla-alquileres.xlsx');
  let { app, page, errores } = await lanzar(carpetaTemporal());
  try {
    await page.waitForSelector('#carga-pantalla', { state: 'visible' });
    // El dialogo "Guardar como" se responde desde el proceso principal (no se abre la carpeta).
    await app.evaluate(({ dialog, shell }, archivo) => {
      dialog.showSaveDialog = async () => ({ canceled: false, rutaArchivo: archivo });
      shell.showItemInFolder = () => {};
    }, destino);
    await captura(page, '30-inicio-planilla');
    await page.click('#btn-modelo');
    await page.waitForSelector('#aviso.mostrar');
    assert.match(await page.textContent('#aviso'), /Planilla modelo guardada/);
    assert.ok(fs.existsSync(destino), 'se guardo la planilla');
    assert.deepEqual(errores, []);
  } finally { await app.close(); }

  ({ app, page, errores } = await lanzar(carpetaTemporal(), { ADMIN_ALQ_IMPORT_FILE: destino }));
  try {
    await page.waitForSelector('#app-pantalla', { state: 'visible' });
    const datos = await page.evaluate(() => ({
      alquileres: app.estado.entradas.map(e => [e.direccion, e.importe, e.moneda, e.garantia]),
      propietarios: app.estado.propietarios.map(o => o.nombre).sort(),
      administraciones: app.estado.administraciones.map(a => a.nombre),
    }));
    assert.deepEqual(datos.alquileres, [
      ['Torre Ceibo - Av. Italia 2875 U403', 29400, 'UYU', 'Porto'],
      ['Canelones 1234 U502', 850, 'USD', 'ANDA'],
    ]);
    assert.deepEqual(datos.propietarios, ['Ana Perez', 'Carla Mendez', 'Diego Mendez']);
    assert.deepEqual(datos.administraciones, ['Administración Sur (Laura Gómez)']);
    assert.deepEqual(errores, []);
  } finally { await app.close(); }
});

test('importar planilla con la app en uso: agregar (sin repetir), reemplazar y deshacer', { timeout: 90000 }, async () => {
  const XLSX = require('xlsx');
  const { libroModelo } = require('../../src/infraestructura/importador-excel');
  const archivo = path.join(carpetaTemporal('alq-planilla-'), 'mis-alquileres.xlsx');
  XLSX.writeFile(libroModelo(), archivo);

  const { app, page, errores } = await lanzar(carpetaTemporal());
  try {
    await page.click('#btn-inicio-demo');
    await page.waitForSelector('#app-pantalla', { state: 'visible' });
    await app.evaluate(({ dialog }, file) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] }); }, archivo);
    const total = () => page.evaluate(() => app.estado.entradas.length);
    const toast = async () => { await page.waitForSelector('#aviso.mostrar'); const t = await page.textContent('#aviso'); await page.evaluate(() => { document.getElementById('aviso').className = ''; }); return t; };
    assert.equal(await total(), 21);

    // Agregar: suma las dos filas de la planilla modelo (su administracion ya esta en los datos de ejemplo).
    await page.click('#btn-menu');
    await page.click('#btn-menu-importar');
    await page.waitForSelector('#modal-importar.abierto');
    await captura(page, '31-importar-con-la-app-en-uso');
    await page.click('#imp-elegir');
    await page.waitForSelector('#modal-importar', { state: 'hidden' });
    assert.match(await toast(), /Agregados 2 alquileres$/);
    assert.equal(await total(), 23);
    const nueva = await page.evaluate(() => app.estado.entradas.find(e => e.direccion === 'Canelones 1234 U502' && e.inquilino === 'Camila Ruiz'));
    assert.deepEqual([nueva.moneda, nueva.garantia, nueva.propietario], ['USD', 'ANDA', 'Carla Mendez / Diego Mendez']);
    // Los propietarios que ya existian (de los datos de ejemplo) se reutilizan.
    assert.equal(await page.evaluate(() => app.estado.propietarios.filter(o => o.nombre === 'Ana Perez').length), 1);

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
    await page.click('#btn-deshacer');
    await page.waitForFunction(() => app.estado.entradas.length === 23);
    assert.deepEqual(errores, []);
  } finally { await app.close(); }
});
