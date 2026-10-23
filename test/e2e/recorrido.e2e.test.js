// Recorrido completo de la app con los datos de ejemplo: los flujos de todos los dias (alta, edicion,
// comentarios, propietarios, aumentos, renovaciones, administraciones, deshacer...) y que todo
// persista al reabrir. Es la red de seguridad de los refactors: si algo se rompe, salta aca.
const test   = require('node:test');
const assert = require('node:assert/strict');
const fs     = require('fs');
const path   = require('path');
const { launch, tmpDir, shot } = require('./helpers');

const DIR = 'E2E Prueba 999 U1';
const esperarFoco = (page, id) => page.waitForFunction(i => document.activeElement && document.activeElement.id === i, id);

test('recorrido completo con datos de ejemplo', { timeout: 300000 }, async (t) => {
  const dataDir = tmpDir();
  const { app, page, errors } = await launch(dataDir);
  await page.evaluate(() => { window.confirm = () => true; });
  // Los formularios solo se cierran con Cancelar/Guardar: si una prueba falla con uno abierto,
  // se cierra antes de la siguiente para que no queden todas trabadas.
  t.afterEach(async () => {
    await page.evaluate(() => document.querySelectorAll('[data-form].open, .modal.open').forEach(m => {
      const c = m.querySelector('.btn-modal-cancel'); if (c && m.hasAttribute('data-form')) c.click(); else m.classList.remove('open');
    })).catch(() => {});
  });

  await t.test('carga los datos de ejemplo', async () => {
    await page.click('#btn-start-demo');
    await page.waitForSelector('#app-screen', { state: 'visible' });
    assert.equal(await page.textContent('#tab-basedatos'), 'Base de Datos', 'las pestañas no muestran numeros');
    assert.equal(await page.evaluate(() => app.estado.entries.length), 21);
  });

  await t.test('modo oscuro persistente', async () => {
    assert.equal(await page.evaluate(() => document.documentElement.dataset.theme || 'light'), 'light');
    await page.click('#btn-theme');
    assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'dark');
    await page.reload();
    await page.waitForSelector('#app-screen', { state: 'visible' });
    await page.evaluate(() => { window.confirm = () => true; });
    assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'dark', 'el modo se recuerda');
    await page.click('#btn-theme');
    assert.equal(await page.evaluate(() => document.documentElement.dataset.theme || 'light'), 'light');
  });

  await t.test('cabecera: menu ☰, pestañas fijas e indicador de guardado', async () => {
    assert.equal(await page.isVisible('#btn-export-csv'), false, 'opciones ocultas hasta abrir el menu');
    await page.click('#btn-menu');
    for (const sel of ['#btn-export-csv', '#btn-menu-share', '#btn-menu-importar', '#btn-menu-template', '#btn-data-folder', '#btn-config']) {
      assert.ok(await page.isVisible(sel), sel);
    }
    assert.equal(await page.isVisible('#file-info'), false, 'sin "Base local -- N activos" en la cabecera');
    // Cambiar de pestaña no mueve la barra de pestañas (la activa no cambia de ancho).
    const posiciones = [];
    for (const tab of ['basedatos', 'propietarios', 'aumentos', 'vencimientos', 'administraciones', 'basedatos']) {
      await page.click('#tab-' + tab);
      posiciones.push(await page.evaluate(() => [...document.querySelectorAll('.tab-btn')].map(b => {
        const r = b.getBoundingClientRect(); return `${Math.round(r.left)}/${Math.round(r.width)}`; }).join(' ')));
    }
    assert.equal(new Set(posiciones).size, 1, 'las pestañas no se mueven: ' + posiciones.join(' || '));
    // La barra de color y las pestañas quedan fijas al bajar.
    await page.evaluate(() => window.scrollTo(0, 800));
    assert.deepEqual(await page.evaluate(() => [Math.round(document.querySelector('.header').getBoundingClientRect().top),
      Math.round(document.querySelector('.tabs').getBoundingClientRect().top)]), [0, 56]);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.keyboard.press('Escape');
    assert.equal(await page.isVisible('#hdr-menu'), false);
    assert.equal((await page.textContent('#save-ind')).trim(), '✓');
  });

  await t.test('nombres y direcciones estandarizados; delegado sin prefijo', async () => {
    const r = await page.evaluate(() => ({
      upper: app.estado.owners.filter(o => o.nombre === o.nombre.toUpperCase()).map(o => o.nombre),
      ceibo: app.estado.entries.filter(e => e.direccion === 'Torre Ceibo - Av. Italia 2875 U403').length,
      delegados: app.estado.entries.map(e => e.remitente).filter(Boolean),
      garantias: app.estado.entries.map(e => e.garantia).filter(Boolean).sort(),
    }));
    assert.deepEqual(r.upper, [], 'sin nombres en mayusculas');
    assert.equal(r.ceibo, 2, 'mismo apto con dos inquilinos (uno inactivo)');
    assert.deepEqual(r.delegados, ['Gestora Norte']);
    assert.deepEqual(r.garantias, ['ANDA', 'CGN']);
  });

  await t.test('busqueda sin tildes y boton X', async () => {
    await page.click('#tab-basedatos');
    await page.fill('#db-search', 'araza');
    assert.equal(await page.locator('#db-tbody .db-row').count(), 3);
    await page.fill('#db-search', 'BENITEZ');                       // por inquilino
    assert.equal(await page.locator('#db-tbody .db-row').count(), 1);
    await page.click('#db-search-clear');
    assert.equal(await page.inputValue('#db-search'), '');
  });

  await t.test('filtro activos / inactivos (exclusivos, ninguno = todos)', async () => {
    const activos = await page.locator('#db-tbody .db-row').count();
    await page.check('#db-show-inactive');
    assert.equal(await page.isChecked('#db-show-active'), false, 'no se pueden tildar ambos');
    const inactivos = await page.locator('#db-tbody .db-row.db-row-inactive').count();
    assert.equal(inactivos, 2);
    assert.equal(await page.locator('#db-tbody .db-row').count(), inactivos, 'solo inactivos');
    await page.uncheck('#db-show-inactive');
    assert.equal(await page.locator('#db-tbody .db-row').count(), activos + inactivos, 'ninguno = todos');
    await page.check('#db-show-active');
  });

  await t.test('alta de alquiler con autocompletado', async () => {
    const existing = await page.evaluate(() => app.estado.owners.find(o => o.nombre === 'Bruno Silva'));
    await page.click('#btn-add-entry');
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
    assert.equal(await page.textContent('#m-dir-preview'), DIR, 'vista previa con el formato estandar');
    // Propietario e inquilinos como viñetas; elegir un propietario existente trae su telefono.
    assert.equal(await page.locator('#m-prop-chips .chip:not(.chip-add)').count(), 1);
    await page.click('#m-prop-chips .chip-x');
    await page.fill('#m-prop-entry', 'Bruno');
    await page.waitForSelector('#ac-dropdown .ac-item');
    await page.locator('#ac-dropdown .ac-item', { hasText: existing.nombre }).first().click();
    assert.equal(await page.inputValue('#m-prop'), existing.nombre);
    assert.equal(await page.inputValue('#m-tel-prop'), existing.telefono, 'autocompleta el telefono del propietario');
    await page.click('#m-prop-chips .chip-x');
    await page.fill('#m-prop-entry', 'Propietario Nuevo E2E');
    await page.keyboard.press('Enter');
    await page.fill('#m-inq-entry', 'Inquilino E2E');
    await page.keyboard.press('Enter');
    if (await page.isVisible('#m-inq-chips .chip-add')) await page.click('#m-inq-chips .chip-add');
    await page.fill('#m-inq-entry', 'segundo inquilino e2e');
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('#m-inq-chips .chip:not(.chip-add)').count(), 2);
    assert.equal(await page.inputValue('#m-inq'), 'Inquilino E2E / segundo inquilino e2e');
    await page.fill('#m-importe', '20000');
    await page.click('#m-duracion-picker .pick[data-v="2 años"]');
    const y = new Date().getFullYear() - 1, m = String(new Date().getMonth() + 1).padStart(2, '0');
    await page.fill('#m-fecha', `${y}-${m}-10`);           // aniversario este mes -> aparece en aumentos
    assert.deepEqual([await page.isVisible('#m-remitente'), await page.isVisible('#m-notas-chips')], [false, false], 'opcionales plegados');
    await page.click('#m-opt-rem > summary');
    await page.click('#m-opt-notas > summary');
    assert.deepEqual([await page.isVisible('#m-remitente'), await page.isVisible('#m-notas-chips')], [true, true], 'se despliegan');
    await shot(page, '40-recorrido-alta');
    await page.click('#modal-submit');
    await page.waitForSelector('#modal-add', { state: 'hidden' });
    await page.fill('#db-search', 'e2e prueba');
    assert.equal(await page.locator('#db-tbody .db-row').count(), 1);
    assert.equal(await page.evaluate(d => app.estado.entries.find(e => e.direccion === d).inquilino, DIR), 'Inquilino E2E / Segundo Inquilino E2E');
  });

  await t.test('edicion y comentarios como viñetas', async () => {
    await page.click('#db-tbody .db-row');
    await page.click('#db-tbody [data-edit-row]');
    await esperarFoco(page, 'm-importe');
    assert.equal(await page.locator('#m-inq-chips .chip:not(.chip-add)').count(), 2, 'al editar vuelven como viñetas');
    await page.click('#m-prop-chips .chip-x');
    await page.fill('#m-prop-entry', 'Propietario Editado');
    await page.keyboard.press('Enter');
    await page.click('#modal-submit');
    await page.waitForSelector('#modal-add', { state: 'hidden' });
    assert.match(await page.textContent('#db-tbody .db-row'), /Propietario Editado/);
    await page.click('#db-tbody [data-nota-add]');
    await page.fill('#db-tbody .nota-textarea', 'comentario e2e');
    await page.keyboard.press('Enter');
    await page.waitForFunction(d => app.estado.entries.find(e => e.direccion === d).notas === 'comentario e2e', DIR);
    await page.click('#db-tbody [data-nota-add]');
    await page.fill('#db-tbody .nota-textarea', 'segundo comentario');
    await page.click('#db-tbody [data-nota-row]');
    await page.waitForFunction(d => app.estado.entries.find(e => e.direccion === d).notas === 'comentario e2e | segundo comentario', DIR);
    assert.equal(await page.locator('#db-tbody .nota-chip').count(), 2);
    await page.locator('#db-tbody .nota-txt', { hasText: 'segundo' }).click();
    await page.fill('#db-tbody .nota-textarea', 'segundo corregido');
    await page.keyboard.press('Enter');
    await page.waitForFunction(d => app.estado.entries.find(e => e.direccion === d).notas === 'comentario e2e | segundo corregido', DIR);
    await page.locator('#db-tbody .nota-chip', { hasText: 'segundo corregido' }).locator('.chip-x').click();
    await page.waitForFunction(d => app.estado.entries.find(e => e.direccion === d).notas === 'comentario e2e', DIR);
  });

  await t.test('linea de tiempo y renovaciones viejas fuera de comentarios', async () => {
    const id = await page.evaluate(d => app.estado.entries.find(e => e.direccion === d).id, DIR);
    const y0 = new Date().getFullYear() - 1, mm = String(new Date().getMonth() + 1).padStart(2, '0');
    const viejas = `20/${mm}/${y0} Renovacion 2 años | comentario e2e | En fecha 25/${mm}/${y0 + 1} se renovo a 2 años`;
    await page.evaluate(([i, n]) => app.saveNotes(app.estado.entries.find(e => e.id === i), n), [id, viejas]);
    await page.waitForFunction(i => /Renovacion/.test(app.estado.entries.find(e => e.id === i).notas), id);
    await page.evaluate(() => app.renderDBTable());
    assert.equal(await page.locator(`[data-detail-id="${id}"] .nota-chip`).count(), 1, 'las renovaciones no aparecen como comentario');
    await page.click(`[data-detail-id="${id}"] [data-timeline]`);
    await page.waitForSelector('#modal-timeline.open');
    const titulos = await page.$$eval('#tl-list .tl-title', els => els.map(x => x.textContent));
    assert.equal(titulos[0], 'Entró al apto', titulos.join(' | '));
    assert.ok(titulos.includes('Renovó') && titulos.some(x => /Renovó de nuevo/.test(x)), titulos.join(' | '));
    await page.keyboard.press('Escape');
    await page.waitForSelector('#modal-timeline', { state: 'hidden' });
    // Al editar el alquiler las notas de renovacion no se pierden.
    await page.click(`#db-tbody [data-edit-row="${id}"]`);
    await esperarFoco(page, 'm-importe');
    assert.equal(await page.locator('#m-notas-chips .chip:not(.chip-add)').count(), 1);
    await page.click('#modal-submit');
    await page.waitForSelector('#modal-add', { state: 'hidden' });
    const notas = await page.evaluate(i => app.estado.entries.find(e => e.id === i).notas, id);
    for (const x of ['Renovacion 2 años', 'comentario e2e', 'se renovo a 2 años']) assert.ok(notas.includes(x), notas);
    await page.evaluate(i => app.saveNotes(app.estado.entries.find(e => e.id === i), 'comentario e2e'), id);
    await page.evaluate(() => app.renderDBTable());
  });

  await t.test('garantia, moneda y el formulario no se cierra solo', async () => {
    await page.click('#db-tbody [data-edit-row]');
    await esperarFoco(page, 'm-importe');
    await page.mouse.click(5, 5);
    await page.keyboard.press('Escape');
    assert.ok(await page.isVisible('#modal-add .modal-box'), 'clic afuera y Escape no lo cierran');
    await page.click('#m-garantia-picker [data-add]');
    await page.fill('#m-garantia-entry', 'Fianza E2E');
    await page.keyboard.press('Enter');
    assert.equal(await page.inputValue('#m-garantia'), 'Fianza E2E');
    await page.click('#m-moneda-seg [data-moneda="USD"]');
    assert.equal(await page.inputValue('#m-moneda'), 'USD');
    assert.match(await page.textContent('#m-gestion-hint'), /la inmobiliaria/);
    await page.click('#m-garantia-picker .pick[data-v="CGN"]');
    assert.match(await page.textContent('#m-gestion-hint'), /CGN/);
    await page.click('#m-garantia-picker .pick[data-v="Fianza E2E"]');
    await page.click('#modal-submit');
    await page.waitForSelector('#modal-add .modal-box', { state: 'hidden' });
    assert.match(await page.textContent('#db-tbody .db-row .garantia-badge'), /Fianza E2E/);
    assert.match(await page.evaluate(() => app.estado.appSettings.garantias), /Fianza E2E/, 'la opcion nueva queda guardada');
    assert.match(await page.textContent('#db-tbody .db-detail-row'), /Alquiler: US\$ 20\.000/);
    await page.click('#db-tbody [data-edit-row]');
    await esperarFoco(page, 'm-importe');
    await page.click('#m-moneda-seg [data-moneda="UYU"]');
    await page.click('#modal-submit');
    await page.waitForSelector('#modal-add .modal-box', { state: 'hidden' });
    assert.equal(await page.evaluate(d => app.estado.entries.find(e => e.direccion === d).moneda, DIR), 'UYU');
    await page.fill('#db-search', 'fianza e2e');                     // el buscador encuentra por garantia
    assert.equal(await page.locator('#db-tbody .db-row').count(), 1);
    await page.click('#db-search-clear');
  });

  await t.test('ficha del propietario: datos para contrato, contacto y cuenta por apto', async () => {
    await page.click('#tab-propietarios');
    await page.fill('#owners-search', 'propietario editado');
    const id = await page.evaluate(() => app.estado.owners.find(o => o.nombre === 'Propietario Editado').id);
    await page.click(`[data-owner-row="${id}"]`);
    assert.match(await page.textContent('#owners-tbody .db-detail-row'), /Falta para contratos: cedula, foto de cedula, domicilio, estado civil, cuenta de cobro/);
    await page.click(`[data-owner-edit="${id}"]`);
    await esperarFoco(page, 'm-own-nombre');
    await page.fill('#m-own-cedula', '1.234.567-8');
    await page.fill('#m-own-estado', 'Casado/a');
    await page.fill('#m-own-domicilio', 'Av. Siempre Viva 742');
    assert.equal(await page.isVisible('#m-own-contact'), false, 'contacto plegado si no tiene');
    await page.click('#own-opt-contacto > summary');
    await page.selectOption('#m-own-contact', 'new');
    await page.fill('#m-con-nombre', 'gestor e2e');
    await page.fill('#m-con-rol', 'Administrador');
    await page.fill('#m-con-tel-entry', '099 000 111');
    await page.click('#modal-owner-submit');
    await page.waitForSelector('#modal-owner', { state: 'hidden' });
    assert.match(await page.locator(`[data-owner-row="${id}"]`).textContent(), /Administrador: Gestor E2E/);
    const acct = page.locator(`[data-acct-owner="${id}"]`).first();
    await acct.fill('BROU 001234567-00001');
    await acct.press('Tab');
    await page.waitForFunction(i => app.estado.ownerAccounts.some(a => a.ownerId === i && a.cuenta === 'BROU 001234567-00001'), id);
    assert.match(await page.textContent('#owners-tbody .db-detail-row'), /Falta para contratos: foto de cedula/);
    // El contacto aparece tambien en el detalle del apto.
    await page.click('#owners-tbody [data-goto-contract]');
    assert.equal(await page.isChecked('#db-show-active'), true, 'ir al apto no cambia el filtro');
    assert.match(await page.textContent('#db-tbody .db-detail-row'), /Contacto: Gestor E2E\s*Administrador/);
    await page.click('#db-search-clear');
  });

  await t.test('unificar propietarios y deshacer con Ctrl+Z / rehacer con Ctrl+Y', async () => {
    // Un duplicado: el mismo dueño cargado con otro nombre en un alquiler nuevo.
    await page.evaluate(async () => {
      const r = await window.api.addContract({ direccion: 'E2E Duplicado 1', calle: 'E2E Duplicado 1', importeBase: 15000, propietario: 'A. Perez', inquilino: 'X', contratoStr: '2 años' });
      if (!r.ok) throw new Error(r.error);
    });
    await page.reload();
    await page.waitForSelector('#app-screen', { state: 'visible' });
    await page.evaluate(() => { window.confirm = () => true; });
    const ids = await page.evaluate(() => ({
      keep: app.estado.owners.find(o => o.nombre === 'Ana Perez').id,
      drop: app.estado.owners.find(o => o.nombre === 'A. Perez').id,
    }));
    const total = await page.evaluate(i => app.estado.contractOwners.filter(l => l.ownerId === i.keep || l.ownerId === i.drop).length, ids);
    await page.click('#tab-propietarios');
    await page.fill('#owners-search', 'perez');
    await page.click(`[data-owner-row="${ids.keep}"]`);
    await new Promise(r => setTimeout(r, 1600));     // un paso de deshacer propio (no junto al cambio anterior)
    await page.click(`[data-owner-merge="${ids.keep}"]`);
    await page.fill('#m-merge-search', 'a. perez');
    await page.click(`[data-merge-pick="${ids.drop}"]`);
    await page.click('#modal-merge-submit');
    await page.waitForFunction(id => !app.estado.owners.some(o => o.id === id), ids.drop);
    assert.equal(await page.evaluate(id => app.estado.contractOwners.filter(l => l.ownerId === id).length, ids.keep), total, 'todos los aptos quedan en uno');
    assert.match(await page.getAttribute('#btn-undo', 'title'), /Deshacer: Unificar propietarios/);
    await page.click('#owners-count');                // foco fuera de los campos de texto
    await page.keyboard.press('Control+z');
    await page.waitForFunction(id => app.estado.owners.some(o => o.id === id), ids.drop);
    await page.keyboard.press('Control+y');
    await page.waitForFunction(id => !app.estado.owners.some(o => o.id === id), ids.drop);
    await page.click('#owners-search-clear');
  });

  await t.test('aumentos: marcar enviado colapsa, persiste el nuevo importe y se puede deshacer', async () => {
    await page.click('#tab-aumentos');
    await page.fill('#inp-ipc', '5');
    const card = page.locator('.card', { hasText: DIR });
    await card.waitFor();
    assert.match(await card.textContent(), /\$21\.000/, 'nuevo importe con IPC 5%');
    const pendientes = () => page.evaluate(() => { const a = document.querySelector('#tab-aumentos .tab-aviso'); return a && !a.hidden ? +a.textContent : 0; });
    const antes = await pendientes();
    await card.locator('[data-aum]').click();
    const compact = page.locator('.card-compact', { hasText: DIR });
    await compact.waitFor();
    assert.match(await compact.textContent(), /Enviado .*\$20\.000.*\$21\.000/);
    assert.equal(await pendientes(), antes - 1, 'el circulito cuenta solo los pendientes');
    const e = await page.evaluate(d => { const x = app.estado.entries.find(y => y.direccion === d); return { importe: x.importe, ult: x.ultimoAumento && x.ultimoAumento.getMonth() }; }, DIR);
    assert.deepEqual(e, { importe: 21000, ult: new Date().getMonth() });
    await page.check('#op-show-sinresolver');
    assert.equal(await page.locator('.card', { hasText: DIR }).count(), 0, 'filtro sin resolver lo oculta');
    await page.uncheck('#op-show-sinresolver');
    // Tocar el resuelto despliega el detalle (no lo deshace); deshacer es un boton aparte.
    await compact.locator('[data-aum-toggle]').click();
    const abierta = page.locator('.card-compact.abierta', { hasText: DIR });
    await abierta.waitFor();
    assert.match(await abierta.textContent(), /IPC aplicado: 5,00%/);
    await abierta.locator('[data-aum-undo]').click();
    await page.locator('.card:not(.card-compact)', { hasText: DIR }).waitFor();
    assert.equal(await page.evaluate(d => app.estado.entries.find(x => x.direccion === d).importe, DIR), 20000, 'deshacer revierte el importe');
    assert.equal(await pendientes(), antes, 'al desmarcar vuelve a contar');
  });

  await t.test('aumentos: copiar mensajes con la marca y los datos del contrato', async () => {
    const card = page.locator('.card', { hasText: DIR });
    const inq = await card.locator('.copy-btn[title="Copiar mensaje inquilino"]').getAttribute('data-copy');
    const prop = await card.locator('.copy-btn[title="Copiar mensaje propietario"]').getAttribute('data-copy');
    assert.match(inq, /^Hola! Te escribo desde Mi Inmobiliaria\. .*es de 5,00% quedando en \$21\.000/);
    assert.match(prop, new RegExp(`de ${DIR}\\.`));
  });

  await t.test('no aumenta con descripcion', async () => {
    const card = page.locator('.card', { hasText: DIR });
    await card.locator('[data-na-start]').click();
    await page.fill('#inp-na-desc', 'acuerdo e2e');
    await page.click('[data-na-conf]');
    await page.locator('.card-compact', { hasText: 'No aumenta' }).filter({ hasText: DIR }).waitFor();
    await page.click(`.card-compact:has-text("${DIR}") [data-aum-toggle]`);
    assert.match(await page.textContent(`.card-compact:has-text("${DIR}")`), /Motivo: acuerdo e2e/);
    await page.click(`.card-compact:has-text("${DIR}") [data-un-na]`);
    await page.locator('.card:not(.card-compact)', { hasText: DIR }).waitFor();
  });

  await t.test('renovaciones: aviso, colores por dias, marcar renovado y deshacer desde la base', async () => {
    await page.click('#tab-vencimientos');
    await page.waitForSelector('#content .sec-title');
    assert.equal(await page.isVisible('#inp-ipc'), false, 'el IPC no se ve en Renovaciones');
    assert.match(await page.textContent('#tab-vencimientos'), /^Renovaciones\d*$/);
    const dirs = await page.$$eval('#content .card:not(.card-compact) .card-top > span:first-child',
      els => els.map(x => x.textContent.replace(/VENCIDO.*/, '').trim()));
    assert.equal(new Set(dirs).size, dirs.length, 'ningun vencimiento repetido: ' + dirs.join(' | '));
    const colores = await page.evaluate(() => [5, 10, 11, 30].map(d => {
      const x = new Date(); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() + d); return app.colorPorDias(x);
    }));
    assert.deepEqual(colores, ['var(--red)', 'var(--red)', 'var(--amber)', 'var(--amber)'], 'rojo con 10 dias o menos, amarillo con mas');
    await page.locator('[data-copy-venc-msg]').first().click();
    let clip = '';
    for (let i = 0; i < 20 && !clip.startsWith('Hola!'); i++) {
      clip = await app.evaluate(({ clipboard }) => clipboard.readText());
      if (!clip.startsWith('Hola!')) await new Promise(r => setTimeout(r, 100));
    }
    assert.match(clip, /^Hola! Te escribo desde Mi Inmobiliaria\. Te avisamos que el contrato de arrendamiento vence el \d{2}\/\d{2}\/\d{4}/);
    const card = page.locator('.card:not(.card-compact)').filter({ has: page.locator('[data-vstart]') }).first();
    const dir = (await card.locator('.card-top span').first().textContent()).replace(/VENCIDO.*/, '').trim();
    const notasAntes = await page.evaluate(d => app.entryByDir(d).notas, dir);
    await card.locator('[data-vstart]').click();
    await page.fill('#inp-venc-date', `${new Date().getFullYear()}-01-01`);
    await page.click('[data-vconf]');
    await page.waitForFunction(d => !!app.estado.marks['v|' + d], dir);
    assert.equal(await page.evaluate(d => app.entryByDir(d).notas, dir), notasAntes, 'la renovacion no se escribe en comentarios');
    await page.click('#tab-basedatos');
    await page.fill('#db-search', dir);
    const id = await page.evaluate(d => app.entryByDir(d).id, dir);
    await page.click(`#db-tbody .db-row[data-id="${id}"]`);
    await page.click(`[data-detail-id="${id}"] [data-db-vunc]`);
    await page.waitForFunction(d => !app.estado.marks['v|' + d], dir);
    await page.click('#db-search-clear');
  });

  await t.test('no renueva: si sigue activo continua; si no, pasa a inactivo; ambos se deshacen', async () => {
    await page.click('#tab-vencimientos');
    const pick = async () => page.locator('.card:not(.card-compact) [data-nr-start]').first().getAttribute('data-nr-start');
    const espera = ms => new Promise(r => setTimeout(r, ms));
    let dir = await pick();
    await espera(1600);
    await page.click(`[data-nr-start="${dir}"]`);
    await page.check('#inp-nr-sigue');
    await page.click('[data-nr-conf]');
    await page.waitForFunction(d => app.estado.marks['nr|' + d] && app.estado.marks['nr|' + d].sigueActivo, dir);
    assert.equal(await page.evaluate(d => app.entryByDir(d).inactive, dir), false, 'sigue activo');
    await page.click('#btn-undo');
    await page.waitForFunction(d => !app.estado.marks['nr|' + d], dir);
    dir = await pick();
    await espera(1600);
    await page.click(`[data-nr-start="${dir}"]`);
    await page.click('[data-nr-conf]');
    await page.waitForFunction(d => app.entryByDir(d) && app.entryByDir(d).inactive, dir);
    await page.click('#btn-undo');                         // marca + inactivo = un solo paso
    await page.waitForFunction(d => !app.estado.marks['nr|' + d] && !app.entryByDir(d).inactive, dir);
  });

  await t.test('administraciones: alta con viñetas, edicion y baja', async () => {
    await page.click('#tab-administraciones');
    const before = await page.locator('#admin-tbody tr[data-admin-row]').count();
    await page.click('#btn-add-admin');
    await esperarFoco(page, 'm-adm-nombre');
    await page.fill('#m-adm-nombre', 'ADMIN E2E');
    await page.fill('#m-adm-edificios-entry', 'Edificio Uno');
    await page.keyboard.press('Enter');
    if (await page.isVisible('#m-adm-edificios-chips .chip-add')) await page.click('#m-adm-edificios-chips .chip-add');
    await page.fill('#m-adm-edificios-entry', 'Edificio Dos');
    await page.keyboard.press('Enter');
    await page.fill('#m-adm-telefono-entry', '099 123 456');
    await page.keyboard.press('Enter');
    await page.click('#m-adm-nombre');
    await page.click('#m-adm-telefono-chips .chip-add');
    await page.fill('#m-adm-telefono-entry', '098 765 432');
    await page.click('#modal-admin-submit');
    await page.waitForSelector('#modal-admin', { state: 'hidden' });
    assert.equal(await page.locator('#admin-tbody tr[data-admin-row]').count(), before + 1);
    const row = page.locator('#admin-tbody tr', { hasText: 'ADMIN E2E' });
    assert.equal(await row.locator('a.wa').first().getAttribute('href'), 'https://wa.me/59899123456');
    const saved = await page.evaluate(() => app.estado.admins.find(a => a.nombre === 'ADMIN E2E'));
    assert.deepEqual([saved.edificios, saved.telefono], ['Edificio Uno; Edificio Dos', '099 123 456; 098 765 432']);
    await row.locator('[data-admin-edit]').click();
    await esperarFoco(page, 'm-adm-nombre');
    assert.equal(await page.locator('#m-adm-telefono-chips .chip:not(.chip-add)').count(), 2);
    await page.locator('#m-adm-edificios-chips .chip', { hasText: 'Edificio Dos' }).locator('.chip-x').click();
    await page.fill('#m-adm-nombre', 'ADMIN E2E 2');
    await page.click('#modal-admin-submit');
    await page.locator('#admin-tbody tr', { hasText: 'ADMIN E2E 2' }).waitFor();
    await page.locator('#admin-tbody tr', { hasText: 'ADMIN E2E 2' }).locator('[data-admin-del]').click();
    await page.waitForFunction(n => document.querySelectorAll('#admin-tbody tr[data-admin-row]').length === n, before);
  });

  await t.test('exportar CSV', async () => {
    const carpeta = tmpDir('alq-csv-');
    await app.evaluate(({ dialog, shell }, dir) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [dir] });
      shell.openPath = async () => '';
    }, carpeta);
    await page.click('#btn-menu');
    await page.click('#btn-export-csv');
    await page.waitForSelector('#toast.show');
    assert.match(await page.textContent('#toast'), /Exportados \d+ archivos CSV/);
    const archivos = fs.readdirSync(carpeta, { recursive: true }).filter(f => /\.csv$/.test(f));
    assert.ok(archivos.length >= 3, archivos.join(', '));
  });

  await t.test('marcar inactivo', async () => {
    await page.click('#tab-basedatos');
    await page.fill('#db-search', 'e2e prueba');
    const row = page.locator('#db-tbody .db-row');
    if (!/expanded/.test(await row.getAttribute('class'))) await row.click();
    await page.click('#db-tbody [data-delete-row]');
    await page.waitForFunction(d => app.estado.entries.find(e => e.direccion === d).inactive, DIR);
    assert.equal(await page.locator('#db-tbody .db-row').count(), 0, 'filtro activos lo oculta');
  });

  await t.test('cerrar la ventana la oculta en la bandeja sin salir', async () => {
    const st = await app.evaluate(async ({ BrowserWindow }) => {
      const w = BrowserWindow.getAllWindows()[0];
      w.close();
      await new Promise(r => setTimeout(r, 300));
      return { destroyed: w.isDestroyed(), visible: w.isVisible() };
    });
    assert.deepEqual(st, { destroyed: false, visible: false });
    assert.equal(await app.evaluate(({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows()[0]; w.show(); return w.isVisible(); }), true);
  });

  assert.deepEqual(errors, [], 'sin errores de consola');
  await app.close();

  await t.test('los datos persisten al reabrir la app', async () => {
    const r = await launch(dataDir);
    try {
      await r.page.waitForSelector('#app-screen', { state: 'visible' });
      const c = await r.page.evaluate(d => app.estado.entries.find(e => e.direccion === d), DIR);
      assert.equal(c.propietario, 'Propietario Editado');
      assert.equal(c.notas, 'comentario e2e | NO AUMENTA: acuerdo e2e');
      assert.equal(c.inactive, true);
      assert.equal(c.garantia, 'Fianza E2E');
      assert.ok(fs.readdirSync(path.join(dataDir, 'backups')).length >= 1, 'hay copias de seguridad');
      assert.deepEqual(r.errors, []);
    } finally { await r.app.close(); }
  });
});
