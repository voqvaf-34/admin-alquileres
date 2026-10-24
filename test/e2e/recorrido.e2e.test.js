// Recorrido completo de la app con los datos de ejemplo: los flujos de todos los dias (alta, edicion,
// comentarios, propietarios, aumentos, renovaciones, administraciones, deshacer...) y que todo
// persista al reabrir. Es la red de seguridad de los refactors: si algo se rompe, salta aca.
const test   = require('node:test');
const assert = require('node:assert/strict');
const fs     = require('fs');
const path   = require('path');
const { lanzar, carpetaTemporal, captura } = require('./helpers');

const DIR = 'E2E Prueba 999 U1';
const esperarFoco = (page, id) => page.waitForFunction(i => document.activeElement && document.activeElement.id === i, id);
// Despliega la primera fila de la Base de Datos solo si esta cerrada (un clic en una abierta la cierra).
async function desplegarPrimeraFila(page) {
  const fila = page.locator('#base-tbody .base-fila').first();
  if (!/expanded/.test(await fila.getAttribute('class'))) await fila.click();
  await page.waitForSelector('#base-tbody .base-fila.expandida');
}

test('recorrido completo con datos de ejemplo', { timeout: 300000 }, async (t) => {
  const carpetaDatos = carpetaTemporal();
  const { app, page, errores } = await lanzar(carpetaDatos);
  await page.evaluate(() => { window.confirm = () => true; });
  // Los formularios solo se cierran con Cancelar/Guardar: si una prueba falla con uno abierto,
  // se cierra antes de la siguiente para que no queden todas trabadas.
  t.afterEach(async () => {
    await page.evaluate(() => document.querySelectorAll('[data-formulario].abierto, .modal.abierto').forEach(m => {
      const c = m.querySelector('.btn-modal-cancelar'); if (c && m.hasAttribute('data-formulario')) c.click(); else m.classList.remove('abierto');
    })).catch(() => {});
  });

  await t.test('carga los datos de ejemplo', async () => {
    await page.click('#btn-inicio-demo');
    await page.waitForSelector('#app-pantalla', { state: 'visible' });
    assert.equal(await page.textContent('#pestana-basedatos'), 'Base de Datos', 'las pestañas no muestran numeros');
    assert.equal(await page.evaluate(() => app.estado.entradas.length), 21);
  });

  await t.test('modo oscuro persistente', async () => {
    assert.equal(await page.evaluate(() => document.documentElement.dataset.esquema || 'claro'), 'claro');
    await page.click('#btn-tema');
    assert.equal(await page.evaluate(() => document.documentElement.dataset.esquema), 'oscuro');
    await page.reload();
    await page.waitForSelector('#app-pantalla', { state: 'visible' });
    await page.evaluate(() => { window.confirm = () => true; });
    assert.equal(await page.evaluate(() => document.documentElement.dataset.esquema), 'oscuro', 'el modo se recuerda');
    await page.click('#btn-tema');
    assert.equal(await page.evaluate(() => document.documentElement.dataset.esquema || 'claro'), 'claro');
  });

  await t.test('cabecera: menu ☰, pestañas fijas e indicador de guardado', async () => {
    assert.equal(await page.isVisible('#btn-exportar-csv'), false, 'opciones ocultas hasta abrir el menu');
    await page.click('#btn-menu');
    for (const sel of ['#btn-exportar-csv', '#btn-menu-compartir', '#btn-menu-importar', '#btn-menu-modelo', '#btn-datos-carpeta', '#btn-config']) {
      assert.ok(await page.isVisible(sel), sel);
    }
    assert.equal(await page.isVisible('#archivo-info'), false, 'sin "Base local -- N activos" en la cabecera');
    // Cambiar de pestaña no mueve la barra de pestañas (la activa no cambia de ancho).
    const posiciones = [];
    for (const tab of ['basedatos', 'propietarios', 'aumentos', 'vencimientos', 'administraciones', 'basedatos']) {
      await page.click('#pestana-' + tab);
      posiciones.push(await page.evaluate(() => [...document.querySelectorAll('.pestana-btn')].map(b => {
        const r = b.getBoundingClientRect(); return `${Math.round(r.left)}/${Math.round(r.width)}`; }).join(' ')));
    }
    assert.equal(new Set(posiciones).size, 1, 'las pestañas no se mueven: ' + posiciones.join(' || '));
    // La barra de color y las pestañas quedan fijas al bajar.
    await page.evaluate(() => window.scrollTo(0, 800));
    assert.deepEqual(await page.evaluate(() => [Math.round(document.querySelector('.cabecera').getBoundingClientRect().top),
      Math.round(document.querySelector('.pestanas').getBoundingClientRect().top)]), [0, 56]);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.keyboard.press('Escape');
    assert.equal(await page.isVisible('#cab-menu'), false);
    assert.equal((await page.textContent('#guardado-ind')).trim(), '✓');
  });

  await t.test('nombres y direcciones estandarizados; delegado sin prefijo', async () => {
    const r = await page.evaluate(() => ({
      upper: app.estado.propietarios.filter(o => o.nombre === o.nombre.toUpperCase()).map(o => o.nombre),
      ceibo: app.estado.entradas.filter(e => e.direccion === 'Torre Ceibo - Av. Italia 2875 U403').length,
      delegados: app.estado.entradas.map(e => e.remitente).filter(Boolean),
      garantias: app.estado.entradas.map(e => e.garantia).filter(Boolean).sort(),
    }));
    assert.deepEqual(r.upper, [], 'sin nombres en mayusculas');
    assert.equal(r.ceibo, 2, 'mismo apto con dos inquilinos (uno inactivo)');
    assert.deepEqual(r.delegados, ['Gestora Norte']);
    assert.deepEqual(r.garantias, ['ANDA', 'CGN']);
  });

  await t.test('busqueda sin tildes y boton X', async () => {
    await page.click('#pestana-basedatos');
    await page.fill('#base-busqueda', 'araza');
    assert.equal(await page.locator('#base-tbody .base-fila').count(), 3);
    await page.fill('#base-busqueda', 'BENITEZ');                       // por inquilino
    assert.equal(await page.locator('#base-tbody .base-fila').count(), 1);
    await page.click('#base-busqueda-limpiar');
    assert.equal(await page.inputValue('#base-busqueda'), '');
  });

  await t.test('filtro activos / inactivos (exclusivos, ninguno = todos)', async () => {
    const activos = await page.locator('#base-tbody .base-fila').count();
    await page.check('#base-mostrar-inactivo');
    assert.equal(await page.isChecked('#base-mostrar-activo'), false, 'no se pueden tildar ambos');
    const inactivos = await page.locator('#base-tbody .base-fila.base-fila-inactivo').count();
    assert.equal(inactivos, 2);
    assert.equal(await page.locator('#base-tbody .base-fila').count(), inactivos, 'solo inactivos');
    await page.uncheck('#base-mostrar-inactivo');
    assert.equal(await page.locator('#base-tbody .base-fila').count(), activos + inactivos, 'ninguno = todos');
    await page.check('#base-mostrar-activo');
  });

  await t.test('alta de alquiler con autocompletado', async () => {
    const existentes = await page.evaluate(() => app.estado.propietarios.find(o => o.nombre === 'Bruno Silva'));
    await page.click('#btn-agregar-entrada');
    await esperarFoco(page, 'm-edificio');
    // Elegir un apto existente en "Edificio" completa las tres partes y el propietario.
    await page.fill('#m-edificio', 'italia 2875 u403');
    await page.locator('#ac-dropdown .ac-item', { hasText: 'Torre Ceibo - Av. Italia 2875 U403' }).first().click();
    assert.deepEqual([await page.inputValue('#m-edificio'), await page.inputValue('#m-calle'), await page.inputValue('#m-unidad')],
      ['Torre Ceibo', 'Av. Italia 2875', '403']);
    assert.equal(await page.inputValue('#m-prop'), 'Ana Perez');
    await page.fill('#m-edificio', '');
    await page.fill('#m-calle', 'e2e prueba 999');
    await page.fill('#m-unidad', '1');
    assert.equal(await page.textContent('#m-dir-vista'), DIR, 'vista previa con el formato estandar');
    // Propietario e inquilinos como viñetas; elegir un propietario existente trae su telefono.
    assert.equal(await page.locator('#m-prop-chips .chip:not(.chip-agregar)').count(), 1);
    await page.click('#m-prop-chips .chip-x');
    await page.fill('#m-prop-entry', 'Bruno');
    await page.waitForSelector('#ac-dropdown .ac-item');
    await page.locator('#ac-dropdown .ac-item', { hasText: existentes.nombre }).first().click();
    assert.equal(await page.inputValue('#m-prop'), existentes.nombre);
    assert.equal(await page.inputValue('#m-tel-prop'), existentes.telefono, 'autocompleta el telefono del propietario');
    await page.click('#m-prop-chips .chip-x');
    await page.fill('#m-prop-entry', 'Propietario Nuevo E2E');
    await page.keyboard.press('Enter');
    await page.fill('#m-inq-entry', 'Inquilino E2E');
    await page.keyboard.press('Enter');
    if (await page.isVisible('#m-inq-chips .chip-agregar')) await page.click('#m-inq-chips .chip-agregar');
    await page.fill('#m-inq-entry', 'segundo inquilino e2e');
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('#m-inq-chips .chip:not(.chip-agregar)').count(), 2);
    assert.equal(await page.inputValue('#m-inq'), 'Inquilino E2E / segundo inquilino e2e');
    await page.fill('#m-importe', '20000');
    await page.click('#m-duracion-selector .elegir[data-v="2 años"]');
    const y = new Date().getFullYear() - 1, m = String(new Date().getMonth() + 1).padStart(2, '0');
    await page.fill('#m-fecha', `${y}-${m}-10`);           // aniversario este mes -> aparece en aumentos
    assert.deepEqual([await page.isVisible('#m-remitente'), await page.isVisible('#m-notas-chips')], [false, false], 'opcionales plegados');
    await page.click('#m-opc-rem > summary');
    await page.click('#m-opc-notas > summary');
    assert.deepEqual([await page.isVisible('#m-remitente'), await page.isVisible('#m-notas-chips')], [true, true], 'se despliegan');
    await captura(page, '40-recorrido-alta');
    await page.click('#modal-enviar');
    await page.waitForSelector('#modal-agregar', { state: 'hidden' });
    await page.fill('#base-busqueda', 'e2e prueba');
    assert.equal(await page.locator('#base-tbody .base-fila').count(), 1);
    assert.equal(await page.evaluate(d => app.estado.entradas.find(e => e.direccion === d).inquilino, DIR), 'Inquilino E2E / Segundo Inquilino E2E');
  });

  await t.test('edicion y comentarios como viñetas', async () => {
    await desplegarPrimeraFila(page);
    await page.click('#base-tbody [data-editar-fila]');
    await esperarFoco(page, 'm-importe');
    assert.equal(await page.locator('#m-inq-chips .chip:not(.chip-agregar)').count(), 2, 'al editar vuelven como viñetas');
    await page.click('#m-prop-chips .chip-x');
    await page.fill('#m-prop-entry', 'Propietario Editado');
    await page.keyboard.press('Enter');
    await page.click('#modal-enviar');
    await page.waitForSelector('#modal-agregar', { state: 'hidden' });
    assert.match(await page.textContent('#base-tbody .base-fila'), /Propietario Editado/);
    await page.click('#base-tbody [data-nota-agregar]');
    await page.fill('#base-tbody .nota-textarea', 'comentario e2e');
    await page.keyboard.press('Enter');
    await page.waitForFunction(d => app.estado.entradas.find(e => e.direccion === d).notas === 'comentario e2e', DIR);
    await page.click('#base-tbody [data-nota-agregar]');
    await page.fill('#base-tbody .nota-textarea', 'segundo comentario');
    await page.click('#base-tbody [data-nota-fila]');
    await page.waitForFunction(d => app.estado.entradas.find(e => e.direccion === d).notas === 'comentario e2e | segundo comentario', DIR);
    assert.equal(await page.locator('#base-tbody .nota-chip').count(), 2);
    await page.locator('#base-tbody .nota-txt', { hasText: 'segundo' }).click();
    await page.fill('#base-tbody .nota-textarea', 'segundo corregido');
    await page.keyboard.press('Enter');
    await page.waitForFunction(d => app.estado.entradas.find(e => e.direccion === d).notas === 'comentario e2e | segundo corregido', DIR);
    await page.locator('#base-tbody .nota-chip', { hasText: 'segundo corregido' }).locator('.chip-x').click();
    await page.waitForFunction(d => app.estado.entradas.find(e => e.direccion === d).notas === 'comentario e2e', DIR);
  });

  await t.test('linea de tiempo y renovaciones viejas fuera de comentarios', async () => {
    const id = await page.evaluate(d => app.estado.entradas.find(e => e.direccion === d).id, DIR);
    const y0 = new Date().getFullYear() - 1, mm = String(new Date().getMonth() + 1).padStart(2, '0');
    const viejas = `20/${mm}/${y0} Renovacion 2 años | comentario e2e | En fecha 25/${mm}/${y0 + 1} se renovo a 2 años`;
    await page.evaluate(([i, n]) => app.guardarNotas(app.estado.entradas.find(e => e.id === i), n), [id, viejas]);
    await page.waitForFunction(i => /Renovacion/.test(app.estado.entradas.find(e => e.id === i).notas), id);
    await page.evaluate(() => app.dibujarTablaBase());
    assert.equal(await page.locator(`[data-detalle-id="${id}"] .nota-chip`).count(), 1, 'las renovaciones no aparecen como comentario');
    await page.click(`[data-detalle-id="${id}"] [data-linea-tiempo]`);
    await page.waitForSelector('#modal-linea-tiempo.abierto');
    const titulos = await page.$$eval('#tl-lista .tl-titulo', elementos => elementos.map(x => x.textContent));
    assert.equal(titulos[0], 'Entró al apto', titulos.join(' | '));
    assert.ok(titulos.includes('Renovó') && titulos.some(x => /Renovó de nuevo/.test(x)), titulos.join(' | '));
    await page.keyboard.press('Escape');
    await page.waitForSelector('#modal-linea-tiempo', { state: 'hidden' });
    // Al editar el alquiler las notas de renovacion no se pierden.
    await page.click(`#base-tbody [data-editar-fila="${id}"]`);
    await esperarFoco(page, 'm-importe');
    assert.equal(await page.locator('#m-notas-chips .chip:not(.chip-agregar)').count(), 1);
    await page.click('#modal-enviar');
    await page.waitForSelector('#modal-agregar', { state: 'hidden' });
    const notas = await page.evaluate(i => app.estado.entradas.find(e => e.id === i).notas, id);
    for (const x of ['Renovacion 2 años', 'comentario e2e', 'se renovo a 2 años']) assert.ok(notas.includes(x), notas);
    await page.evaluate(i => app.guardarNotas(app.estado.entradas.find(e => e.id === i), 'comentario e2e'), id);
    await page.evaluate(() => app.dibujarTablaBase());
  });

  await t.test('garantia, moneda y el formulario no se cierra solo', async () => {
    await page.click('#base-tbody [data-editar-fila]');
    await esperarFoco(page, 'm-importe');
    await page.mouse.click(5, 5);
    await page.keyboard.press('Escape');
    assert.ok(await page.isVisible('#modal-agregar .modal-caja'), 'clic afuera y Escape no lo cierran');
    await page.click('#m-garantia-selector [data-agregar]');
    await page.fill('#m-garantia-entry', 'Fianza E2E');
    await page.keyboard.press('Enter');
    assert.equal(await page.inputValue('#m-garantia'), 'Fianza E2E');
    await page.click('#m-moneda-seg [data-moneda="USD"]');
    assert.equal(await page.inputValue('#m-moneda'), 'USD');
    assert.match(await page.textContent('#m-gestion-ayuda'), /la inmobiliaria/);
    await page.click('#m-garantia-selector .elegir[data-v="CGN"]');
    assert.match(await page.textContent('#m-gestion-ayuda'), /CGN/);
    await page.click('#m-garantia-selector .elegir[data-v="Fianza E2E"]');
    await page.click('#modal-enviar');
    await page.waitForSelector('#modal-agregar .modal-caja', { state: 'hidden' });
    assert.match(await page.textContent('#base-tbody .base-fila .garantia-insignia'), /Fianza E2E/);
    assert.match(await page.evaluate(() => app.estado.ajustesApp.garantias), /Fianza E2E/, 'la opcion nueva queda guardada');
    assert.match(await page.textContent('#base-tbody .base-detalle-fila'), /Alquiler: US\$ 20\.000/);
    await page.click('#base-tbody [data-editar-fila]');
    await esperarFoco(page, 'm-importe');
    await page.click('#m-moneda-seg [data-moneda="UYU"]');
    await page.click('#modal-enviar');
    await page.waitForSelector('#modal-agregar .modal-caja', { state: 'hidden' });
    assert.equal(await page.evaluate(d => app.estado.entradas.find(e => e.direccion === d).moneda, DIR), 'UYU');
    await page.fill('#base-busqueda', 'fianza e2e');                     // el buscador encuentra por garantia
    assert.equal(await page.locator('#base-tbody .base-fila').count(), 1);
    await page.click('#base-busqueda-limpiar');
  });

  await t.test('ficha del propietario: datos para contrato, contacto y cuenta por apto', async () => {
    await page.click('#pestana-propietarios');
    await page.fill('#propietarios-busqueda', 'propietario editado');
    const id = await page.evaluate(() => app.estado.propietarios.find(o => o.nombre === 'Propietario Editado').id);
    await page.click(`[data-propietario-fila="${id}"]`);
    assert.match(await page.textContent('#propietarios-tbody .base-detalle-fila'), /Falta para contratos: cedula, foto de cedula, domicilio, estado civil, cuenta de cobro/);
    await page.click(`[data-propietario-editar="${id}"]`);
    await esperarFoco(page, 'm-prop-nombre');
    await page.fill('#m-prop-cedula', '1.234.567-8');
    await page.fill('#m-prop-estado', 'Casado/a');
    await page.fill('#m-prop-domicilio', 'Av. Siempre Viva 742');
    assert.equal(await page.isVisible('#m-prop-contacto'), false, 'contacto plegado si no tiene');
    await page.click('#prop-opc-contacto > summary');
    await page.selectOption('#m-prop-contacto', 'new');
    await page.fill('#m-con-nombre', 'gestor e2e');
    await page.fill('#m-con-rol', 'Administrador');
    await page.fill('#m-con-tel-entry', '099 000 111');
    await page.click('#modal-propietario-enviar');
    await page.waitForSelector('#modal-propietario', { state: 'hidden' });
    assert.match(await page.locator(`[data-propietario-fila="${id}"]`).textContent(), /Administrador: Gestor E2E/);
    const cuenta = page.locator(`[data-cuenta-propietario="${id}"]`).first();
    await cuenta.fill('BROU 001234567-00001');
    await cuenta.press('Tab');
    await page.waitForFunction(i => app.estado.cuentasPropietarios.some(a => a.idPropietario === i && a.cuenta === 'BROU 001234567-00001'), id);
    assert.match(await page.textContent('#propietarios-tbody .base-detalle-fila'), /Falta para contratos: foto de cedula/);
    // El contacto aparece tambien en el detalle del apto.
    await page.click('#propietarios-tbody [data-ir-contrato]');
    assert.equal(await page.isChecked('#base-mostrar-activo'), true, 'ir al apto no cambia el filtro');
    assert.match(await page.textContent('#base-tbody .base-detalle-fila'), /Contacto: Gestor E2E\s*Administrador/);
    await page.click('#base-busqueda-limpiar');
  });

  await t.test('unificar propietarios y deshacer con Ctrl+Z / rehacer con Ctrl+Y', async () => {
    // Un duplicado: el mismo dueño cargado con otro nombre en un alquiler nuevo.
    await page.evaluate(async () => {
      const r = await window.api.agregarContrato({ direccion: 'E2E Duplicado 1', calle: 'E2E Duplicado 1', importeBase: 15000, propietario: 'A. Perez', inquilino: 'X', contratoTexto: '2 años' });
      if (!r.ok) throw new Error(r.error);
    });
    await page.reload();
    await page.waitForSelector('#app-pantalla', { state: 'visible' });
    await page.evaluate(() => { window.confirm = () => true; });
    const ids = await page.evaluate(() => ({
      conservar: app.estado.propietarios.find(o => o.nombre === 'Ana Perez').id,
      quitar: app.estado.propietarios.find(o => o.nombre === 'A. Perez').id,
    }));
    const total = await page.evaluate(i => app.estado.contratosPropietarios.filter(l => l.idPropietario === i.conservar || l.idPropietario === i.quitar).length, ids);
    await page.click('#pestana-propietarios');
    await page.fill('#propietarios-busqueda', 'perez');
    await page.click(`[data-propietario-fila="${ids.conservar}"]`);
    await new Promise(r => setTimeout(r, 1600));     // un paso de deshacer propio (no junto al cambio anterior)
    await page.click(`[data-propietario-unificar="${ids.conservar}"]`);
    await page.fill('#m-unificar-busqueda', 'a. perez');
    await page.click(`[data-unificar-elegir="${ids.quitar}"]`);
    await page.click('#modal-unificar-enviar');
    await page.waitForFunction(id => !app.estado.propietarios.some(o => o.id === id), ids.quitar);
    assert.equal(await page.evaluate(id => app.estado.contratosPropietarios.filter(l => l.idPropietario === id).length, ids.conservar), total, 'todos los aptos quedan en uno');
    assert.match(await page.getAttribute('#btn-deshacer', 'title'), /Deshacer: Unificar propietarios/);
    await page.click('#propietarios-cantidad');                // foco fuera de los campos de texto
    await page.keyboard.press('Control+z');
    await page.waitForFunction(id => app.estado.propietarios.some(o => o.id === id), ids.quitar);
    await page.keyboard.press('Control+y');
    await page.waitForFunction(id => !app.estado.propietarios.some(o => o.id === id), ids.quitar);
    await page.click('#propietarios-busqueda-limpiar');
  });

  await t.test('aumentos: marcar enviado colapsa, persiste el nuevo importe y se puede deshacer', async () => {
    await page.click('#pestana-aumentos');
    await page.fill('#campo-ipc', '5');
    const tarjeta = page.locator('.tarjeta', { hasText: DIR });
    await tarjeta.waitFor();
    assert.match(await tarjeta.textContent(), /\$21\.000/, 'nuevo importe con IPC 5%');
    const pendientes = () => page.evaluate(() => { const a = document.querySelector('#pestana-aumentos .pestana-aviso'); return a && !a.hidden ? +a.textContent : 0; });
    const antes = await pendientes();
    await tarjeta.locator('[data-aum]').click();
    const compacto = page.locator('.tarjeta-compacta', { hasText: DIR });
    await compacto.waitFor();
    assert.match(await compacto.textContent(), /Enviado .*\$20\.000.*\$21\.000/);
    assert.equal(await pendientes(), antes - 1, 'el circulito cuenta solo los pendientes');
    const e = await page.evaluate(d => { const x = app.estado.entradas.find(y => y.direccion === d); return { importe: x.importe, ult: x.ultimoAumento && x.ultimoAumento.getMonth() }; }, DIR);
    assert.deepEqual(e, { importe: 21000, ult: new Date().getMonth() });
    await page.check('#op-mostrar-sinresolver');
    assert.equal(await page.locator('.tarjeta', { hasText: DIR }).count(), 0, 'filtro sin resolver lo oculta');
    await page.uncheck('#op-mostrar-sinresolver');
    // Tocar el resuelto despliega el detalle (no lo deshace); deshacer es un boton aparte.
    await compacto.locator('[data-aum-alternar]').click();
    const abierta = page.locator('.tarjeta-compacta.abierta', { hasText: DIR });
    await abierta.waitFor();
    assert.match(await abierta.textContent(), /IPC aplicado: 5,00%/);
    await abierta.locator('[data-aum-deshacer]').click();
    await page.locator('.tarjeta:not(.tarjeta-compacta)', { hasText: DIR }).waitFor();
    assert.equal(await page.evaluate(d => app.estado.entradas.find(x => x.direccion === d).importe, DIR), 20000, 'deshacer revierte el importe');
    assert.equal(await pendientes(), antes, 'al desmarcar vuelve a contar');
  });

  await t.test('aumentos: copiar mensajes con la marca y los datos del contrato', async () => {
    const tarjeta = page.locator('.tarjeta', { hasText: DIR });
    const inq = await tarjeta.locator('.copiar-btn[title="Copiar mensaje inquilino"]').getAttribute('data-copiar');
    const prop = await tarjeta.locator('.copiar-btn[title="Copiar mensaje propietario"]').getAttribute('data-copiar');
    assert.match(inq, /^Hola! Te escribo desde Mi Inmobiliaria\. .*es de 5,00% quedando en \$21\.000/);
    assert.match(prop, new RegExp(`de ${DIR}\\.`));
  });

  await t.test('no aumenta con descripcion', async () => {
    const tarjeta = page.locator('.tarjeta', { hasText: DIR });
    await tarjeta.locator('[data-na-inicio]').click();
    await page.fill('#inp-na-desc', 'acuerdo e2e');
    await page.click('[data-na-conf]');
    await page.locator('.tarjeta-compacta', { hasText: 'No aumenta' }).filter({ hasText: DIR }).waitFor();
    await page.click(`.tarjeta-compacta:has-text("${DIR}") [data-aum-alternar]`);
    assert.match(await page.textContent(`.tarjeta-compacta:has-text("${DIR}")`), /Motivo: acuerdo e2e/);
    await page.click(`.tarjeta-compacta:has-text("${DIR}") [data-des-na]`);
    await page.locator('.tarjeta:not(.tarjeta-compacta)', { hasText: DIR }).waitFor();
  });

  await t.test('renovaciones: aviso, colores por dias, marcar renovado y deshacer desde la base', async () => {
    await page.click('#pestana-vencimientos');
    await page.waitForSelector('#contenido .sec-titulo');
    assert.equal(await page.isVisible('#campo-ipc'), false, 'el IPC no se ve en Renovaciones');
    assert.match(await page.textContent('#pestana-vencimientos'), /^Renovaciones\d*$/);
    const direcciones = await page.$$eval('#contenido .tarjeta:not(.tarjeta-compacta) .tarjeta-arriba > span:first-child',
      elementos => elementos.map(x => x.textContent.replace(/VENCIDO.*/, '').trim()));
    assert.equal(new Set(direcciones).size, direcciones.length, 'ningun vencimiento repetido: ' + direcciones.join(' | '));
    const colores = await page.evaluate(() => [5, 10, 11, 30].map(d => {
      const x = new Date(); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() + d); return app.colorPorDias(x);
    }));
    assert.deepEqual(colores, ['var(--rojo)', 'var(--rojo)', 'var(--ambar)', 'var(--ambar)'], 'rojo con 10 dias o menos, amarillo con mas');
    await page.locator('[data-copiar-venc-mensaje]').first().click();
    let clip = '';
    for (let i = 0; i < 20 && !clip.startsWith('Hola!'); i++) {
      clip = await app.evaluate(({ clipboard }) => clipboard.readText());
      if (!clip.startsWith('Hola!')) await new Promise(r => setTimeout(r, 100));
    }
    assert.match(clip, /^Hola! Te escribo desde Mi Inmobiliaria\. Te avisamos que el contrato de arrendamiento vence el \d{2}\/\d{2}\/\d{4}/);
    const tarjeta = page.locator('.tarjeta:not(.tarjeta-compacta)').filter({ has: page.locator('[data-vinicio]') }).first();
    const dir = (await tarjeta.locator('.tarjeta-arriba span').first().textContent()).replace(/VENCIDO.*/, '').trim();
    const notasAntes = await page.evaluate(d => app.entradaPorDireccion(d).notas, dir);
    await tarjeta.locator('[data-vinicio]').click();
    await page.fill('#inp-venc-date', `${new Date().getFullYear()}-01-01`);
    await page.click('[data-vconf]');
    await page.waitForFunction(d => !!app.estado.marcas['v|' + d], dir);
    assert.equal(await page.evaluate(d => app.entradaPorDireccion(d).notas, dir), notasAntes, 'la renovacion no se escribe en comentarios');
    await page.click('#pestana-basedatos');
    await page.fill('#base-busqueda', dir);
    const id = await page.evaluate(d => app.entradaPorDireccion(d).id, dir);
    await page.click(`#base-tbody .base-fila[data-id="${id}"]`);
    await page.click(`[data-detalle-id="${id}"] [data-base-vunc]`);
    await page.waitForFunction(d => !app.estado.marcas['v|' + d], dir);
    await page.click('#base-busqueda-limpiar');
  });

  await t.test('no renueva: si sigue activo continua; si no, pasa a inactivo; ambos se deshacen', async () => {
    await page.click('#pestana-vencimientos');
    const elegir = async () => page.locator('.tarjeta:not(.tarjeta-compacta) [data-nr-inicio]').first().getAttribute('data-nr-inicio');
    const espera = ms => new Promise(r => setTimeout(r, ms));
    let dir = await elegir();
    await espera(1600);
    await page.click(`[data-nr-inicio="${dir}"]`);
    await page.check('#inp-nr-sigue');
    await page.click('[data-nr-conf]');
    await page.waitForFunction(d => app.estado.marcas['nr|' + d] && app.estado.marcas['nr|' + d].sigueActivo, dir);
    assert.equal(await page.evaluate(d => app.entradaPorDireccion(d).inactivo, dir), false, 'sigue activo');
    await page.click('#btn-deshacer');
    await page.waitForFunction(d => !app.estado.marcas['nr|' + d], dir);
    dir = await elegir();
    await espera(1600);
    await page.click(`[data-nr-inicio="${dir}"]`);
    await page.click('[data-nr-conf]');
    await page.waitForFunction(d => app.entradaPorDireccion(d) && app.entradaPorDireccion(d).inactivo, dir);
    await page.click('#btn-deshacer');                         // marca + inactivo = un solo paso
    await page.waitForFunction(d => !app.estado.marcas['nr|' + d] && !app.entradaPorDireccion(d).inactivo, dir);
  });

  await t.test('administraciones: alta con viñetas, edicion y baja', async () => {
    await page.click('#pestana-administraciones');
    const antesDe = await page.locator('#admin-tbody tr[data-admin-fila]').count();
    await page.click('#btn-agregar-admin');
    await esperarFoco(page, 'm-adm-nombre');
    await page.fill('#m-adm-nombre', 'ADMIN E2E');
    await page.fill('#m-adm-edificios-entry', 'Edificio Uno');
    await page.keyboard.press('Enter');
    if (await page.isVisible('#m-adm-edificios-chips .chip-agregar')) await page.click('#m-adm-edificios-chips .chip-agregar');
    await page.fill('#m-adm-edificios-entry', 'Edificio Dos');
    await page.keyboard.press('Enter');
    await page.fill('#m-adm-telefono-entry', '099 123 456');
    await page.keyboard.press('Enter');
    await page.click('#m-adm-nombre');
    await page.click('#m-adm-telefono-chips .chip-agregar');
    await page.fill('#m-adm-telefono-entry', '098 765 432');
    await page.click('#modal-admin-enviar');
    await page.waitForSelector('#modal-admin', { state: 'hidden' });
    assert.equal(await page.locator('#admin-tbody tr[data-admin-fila]').count(), antesDe + 1);
    const fila = page.locator('#admin-tbody tr', { hasText: 'ADMIN E2E' });
    assert.equal(await fila.locator('a.wa').first().getAttribute('href'), 'https://wa.me/59899123456');
    const guardado = await page.evaluate(() => app.estado.administraciones.find(a => a.nombre === 'ADMIN E2E'));
    assert.deepEqual([guardado.edificios, guardado.telefono], ['Edificio Uno; Edificio Dos', '099 123 456; 098 765 432']);
    await fila.locator('[data-admin-editar]').click();
    await esperarFoco(page, 'm-adm-nombre');
    assert.equal(await page.locator('#m-adm-telefono-chips .chip:not(.chip-agregar)').count(), 2);
    await page.locator('#m-adm-edificios-chips .chip', { hasText: 'Edificio Dos' }).locator('.chip-x').click();
    await page.fill('#m-adm-nombre', 'ADMIN E2E 2');
    await page.click('#modal-admin-enviar');
    await page.locator('#admin-tbody tr', { hasText: 'ADMIN E2E 2' }).waitFor();
    await page.locator('#admin-tbody tr', { hasText: 'ADMIN E2E 2' }).locator('[data-admin-borrar]').click();
    await page.waitForFunction(n => document.querySelectorAll('#admin-tbody tr[data-admin-fila]').length === n, antesDe);
  });

  await t.test('exportar CSV', async () => {
    const carpeta = carpetaTemporal('alq-csv-');
    await app.evaluate(({ dialog, shell }, dir) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [dir] });
      shell.openPath = async () => '';
    }, carpeta);
    await page.click('#btn-menu');
    await page.click('#btn-exportar-csv');
    await page.waitForSelector('#aviso.mostrar');
    assert.match(await page.textContent('#aviso'), /Exportados \d+ archivos CSV/);
    const archivos = fs.readdirSync(carpeta, { recursive: true }).filter(f => /\.csv$/.test(f));
    assert.ok(archivos.length >= 3, archivos.join(', '));
  });

  await t.test('marcar inactivo', async () => {
    await page.click('#pestana-basedatos');
    await page.fill('#base-busqueda', 'e2e prueba');
    await desplegarPrimeraFila(page);
    await page.click('#base-tbody [data-borrar-fila]');
    await page.waitForFunction(d => app.estado.entradas.find(e => e.direccion === d).inactivo, DIR);
    assert.equal(await page.locator('#base-tbody .base-fila').count(), 0, 'filtro activos lo oculta');
  });

  await t.test('cerrar la ventana la oculta en la bandeja sin salir', async () => {
    const st = await app.evaluate(async ({ BrowserWindow }) => {
      const w = BrowserWindow.getAllWindows()[0];
      w.close();
      await new Promise(r => setTimeout(r, 300));
      return { destroyed: w.isDestroyed(), visible: w.isVisible() };
    });
    assert.deepEqual(st, { destroyed: false, visible: false });
    assert.equal(await app.evaluate(({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows()[0]; w.showInactive(); return w.isVisible(); }), true);
  });

  assert.deepEqual(errores, [], 'sin errores de consola');
  await app.close();

  await t.test('los datos persisten al reabrir la app', async () => {
    const r = await lanzar(carpetaDatos);
    try {
      await r.page.waitForSelector('#app-pantalla', { state: 'visible' });
      const c = await r.page.evaluate(d => app.estado.entradas.find(e => e.direccion === d), DIR);
      assert.equal(c.propietario, 'Propietario Editado');
      assert.equal(c.notas, 'comentario e2e | NO AUMENTA: acuerdo e2e');
      assert.equal(c.inactivo, true);
      assert.equal(c.garantia, 'Fianza E2E');
      assert.ok(fs.readdirSync(path.join(carpetaDatos, 'backups')).length >= 1, 'hay copias de seguridad');
      assert.deepEqual(r.errores, []);
    } finally { await r.app.close(); }
  });
});
