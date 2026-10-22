// Configuracion: marca (nombre, color y logo) y plantillas de mensajes.
const test   = require('node:test');
const assert = require('node:assert/strict');
const path   = require('path');
const { ROOT, launch, tmpDir, shot, empezarVacia } = require('./helpers');

const LOGO = path.join(ROOT, 'src', 'interfaz', 'recursos', 'icon.png');
const cssVar = (page, name) => page.evaluate(n => getComputedStyle(document.documentElement).getPropertyValue(n).trim(), name);

test('configuracion: nombre, color y logo de la inmobiliaria', { timeout: 90000 }, async () => {
  const dataDir = tmpDir();
  let { app, page, errors } = await launch(dataDir);
  try {
    await empezarVacia(page);
    // Por defecto: nombre generico y azul.
    assert.equal(await page.textContent('#hdr-logo [data-marca-nombre]'), 'Mi Inmobiliaria');
    assert.equal(await cssVar(page, '--m-header'), '#2563EB');

    await page.click('#btn-menu');
    await page.click('#btn-config');
    await page.waitForSelector('#modal-config.open');
    await page.waitForFunction(() => document.activeElement && document.activeElement.id === 'cfg-nombre');
    await page.fill('#cfg-nombre', 'Inmobiliaria del Sur');
    await page.click('.cfg-swatch[data-color="#0F766E"]');
    // La vista previa cambia antes de guardar; la app todavia no.
    assert.equal(await page.textContent('#cfg-prev-nombre'), 'Inmobiliaria del Sur');
    assert.equal(await cssVar(page, '--m-header'), '#2563EB');
    await shot(page, '10-configuracion');
    await page.click('#cfg-guardar');
    await page.waitForSelector('#modal-config', { state: 'hidden' });
    assert.equal(await cssVar(page, '--m-header'), '#0F766E');
    assert.equal(await page.textContent('#hdr-logo [data-marca-nombre]'), 'Inmobiliaria del Sur');
    assert.equal(await page.title(), 'Inmobiliaria del Sur · Alquileres');

    // Logo: reemplaza al nombre en la barra.
    await page.click('#btn-menu');
    await page.click('#btn-config');
    await page.setInputFiles('#cfg-logo-file', LOGO);
    await page.waitForSelector('#cfg-logo-img:not([hidden])');
    await page.click('#cfg-guardar');
    await page.waitForSelector('#hdr-logo img[data-marca-logo]:not([hidden])');
    assert.equal(await page.isHidden('#hdr-logo [data-marca-nombre]'), true);
    await shot(page, '11-marca-aplicada');

    // Deshacer vuelve a la configuracion anterior (sin logo).
    await page.click('#btn-undo');
    await page.waitForSelector('#hdr-logo img[data-marca-logo]', { state: 'hidden' });
    await page.click('#btn-redo');
    await page.waitForSelector('#hdr-logo img[data-marca-logo]:not([hidden])');
    assert.deepEqual(errors, []);
  } finally { await app.close(); }

  // Al reabrir sigue la marca guardada.
  ({ app, page, errors } = await launch(dataDir));
  try {
    await page.waitForSelector('#app-screen', { state: 'visible' });
    assert.equal(await cssVar(page, '--m-header'), '#0F766E');
    await page.waitForSelector('#hdr-logo img[data-marca-logo]:not([hidden])');
    assert.equal(await page.title(), 'Inmobiliaria del Sur · Alquileres');
    assert.deepEqual(errors, []);
  } finally { await app.close(); }
});

test('configuracion: plantillas de mensajes', { timeout: 60000 }, async () => {
  const { app, page, errors } = await launch(tmpDir());
  try {
    await empezarVacia(page);
    await page.click('#btn-menu');
    await page.click('#btn-config');
    await page.waitForSelector('#modal-config.open');
    await page.fill('#cfg-nombre', 'Inmobiliaria del Sur');
    await page.click('[data-msg="renovacion"] summary');
    const ta = '[data-msg="renovacion"] textarea';
    assert.match(await page.inputValue(ta), /^Hola! Te escribo desde \{inmobiliaria\}/);
    // Restaurar no aparece mientras el texto es el original.
    assert.equal(await page.isDisabled('[data-msg="renovacion"] .cfg-restaurar'), true);
    await page.fill(ta, 'Hola ');
    await page.click('[data-msg="renovacion"] .cfg-var[data-var="inquilino"]');
    await page.type(ta, ', vence el {vencimiento}. {nada}');
    assert.equal(await page.inputValue(ta), 'Hola {inquilino}, vence el {vencimiento}. {nada}');
    assert.match(await page.textContent('[data-msg="renovacion"] .cfg-ejemplo'), /Hola Beto Gomez, vence el 01\/11\/2026\. \{nada\}/);
    assert.match(await page.textContent('[data-msg="renovacion"] .cfg-aviso'), /\{nada\}/);
    await shot(page, '12-mensajes');
    await page.click('#cfg-guardar');
    await page.waitForSelector('#modal-config', { state: 'hidden' });
    assert.equal(await page.evaluate(() => app.estado.appSettings.msgRenovacion), 'Hola {inquilino}, vence el {vencimiento}. {nada}');

    // Al reabrir se ve el texto guardado; restaurar el original lo guarda vacio (= original).
    await page.click('#btn-menu');
    await page.click('#btn-config');
    await page.click('[data-msg="renovacion"] summary');
    assert.equal(await page.inputValue(ta), 'Hola {inquilino}, vence el {vencimiento}. {nada}');
    await page.click('[data-msg="renovacion"] .cfg-restaurar');
    await page.click('#cfg-guardar');
    await page.waitForSelector('#modal-config', { state: 'hidden' });
    assert.equal(await page.evaluate(() => app.estado.appSettings.msgRenovacion), '');
    assert.deepEqual(errors, []);
  } finally { await app.close(); }
});
