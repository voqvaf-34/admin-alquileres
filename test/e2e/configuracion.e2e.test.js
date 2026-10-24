// Configuracion: marca (nombre, color y logo) y plantillas de mensajes.
const test   = require('node:test');
const assert = require('node:assert/strict');
const path   = require('path');
const { ROOT, lanzar, carpetaTemporal, captura, empezarVacia, abrirConfiguracion, elegirColor } = require('./helpers');

const LOGO = path.join(ROOT, 'src', 'interfaz', 'recursos', 'icon.png');
const cssVar = (page, nombre) => page.evaluate(n => getComputedStyle(document.documentElement).getPropertyValue(n).trim(), nombre);

test('configuracion: nombre, color y logo de la inmobiliaria', { timeout: 90000 }, async () => {
  const carpetaDatos = carpetaTemporal();
  let { app, page, errores } = await lanzar(carpetaDatos);
  try {
    await empezarVacia(page);
    // Por defecto: nombre generico y azul.
    assert.equal(await page.textContent('#cab-logo [data-marca-nombre]'), 'Mi Inmobiliaria');
    assert.equal(await cssVar(page, '--m-cabecera'), '#2563EB');

    await abrirConfiguracion(page);
    await page.fill('#cfg-nombre', 'Inmobiliaria del Sur');
    await elegirColor(page, '#0F766E');
    // La vista previa cambia antes de guardar; la app todavia no.
    assert.equal(await page.textContent('#cfg-vista-nombre'), 'Inmobiliaria del Sur');
    assert.equal(await cssVar(page, '--m-cabecera'), '#2563EB');
    await captura(page, '10-configuracion');
    await page.click('#cfg-guardar');
    await page.waitForSelector('#modal-config', { state: 'hidden' });
    assert.equal(await cssVar(page, '--m-cabecera'), '#0F766E');
    assert.equal(await page.textContent('#cab-logo [data-marca-nombre]'), 'Inmobiliaria del Sur');
    assert.equal(await page.title(), 'Inmobiliaria del Sur · Alquileres');

    // Logo: reemplaza al nombre en la barra.
    await abrirConfiguracion(page);
    await page.setInputFiles('#cfg-logo-archivo', LOGO);
    await page.waitForSelector('#cfg-logo-img:not([hidden])');
    await page.click('#cfg-guardar');
    await page.waitForSelector('#cab-logo img[data-marca-logo]:not([hidden])');
    assert.equal(await page.isHidden('#cab-logo [data-marca-nombre]'), true);
    await captura(page, '11-marca-aplicada');

    // Deshacer vuelve a la configuracion anterior (sin logo).
    await page.click('#btn-deshacer');
    await page.waitForSelector('#cab-logo img[data-marca-logo]', { state: 'hidden' });
    await page.click('#btn-rehacer');
    await page.waitForSelector('#cab-logo img[data-marca-logo]:not([hidden])');
    assert.deepEqual(errores, []);
  } finally { await app.close(); }

  // Al reabrir sigue la marca guardada.
  ({ app, page, errores } = await lanzar(carpetaDatos));
  try {
    await page.waitForSelector('#app-pantalla', { state: 'visible' });
    assert.equal(await cssVar(page, '--m-cabecera'), '#0F766E');
    await page.waitForSelector('#cab-logo img[data-marca-logo]:not([hidden])');
    assert.equal(await page.title(), 'Inmobiliaria del Sur · Alquileres');
    assert.deepEqual(errores, []);
  } finally { await app.close(); }
});

test('configuracion: plantillas de mensajes', { timeout: 60000 }, async () => {
  const { app, page, errores } = await lanzar(carpetaTemporal());
  try {
    await empezarVacia(page);
    await abrirConfiguracion(page);
    await page.fill('#cfg-nombre', 'Inmobiliaria del Sur');
    await page.click('[data-cfg-pestana="mensajes"]');
    await page.click('[data-mensaje="renovacion"] summary');
    const ta = '[data-mensaje="renovacion"] textarea';
    assert.match(await page.inputValue(ta), /^Hola! Te escribo desde \{inmobiliaria\}/);
    // Restaurar no aparece mientras el texto es el original.
    assert.equal(await page.isDisabled('[data-mensaje="renovacion"] .cfg-restaurar'), true);
    await page.fill(ta, 'Hola ');
    await page.click('[data-mensaje="renovacion"] .cfg-var[data-var="inquilino"]');
    await page.type(ta, ', vence el {vencimiento}. {nada}');
    assert.equal(await page.inputValue(ta), 'Hola {inquilino}, vence el {vencimiento}. {nada}');
    assert.match(await page.textContent('[data-mensaje="renovacion"] .cfg-ejemplo'), /Hola Beto Gomez, vence el 01\/11\/2026\. \{nada\}/);
    assert.match(await page.textContent('[data-mensaje="renovacion"] .cfg-aviso'), /\{nada\}/);
    await captura(page, '12-mensajes');
    await page.click('#cfg-guardar');
    await page.waitForSelector('#modal-config', { state: 'hidden' });
    assert.equal(await page.evaluate(() => app.estado.ajustesApp.mensajeRenovacionTexto), 'Hola {inquilino}, vence el {vencimiento}. {nada}');

    // Al reabrir se ve el texto guardado; restaurar el original lo guarda vacio (= original).
    await abrirConfiguracion(page);
    await page.click('[data-cfg-pestana="mensajes"]');
    await page.click('[data-mensaje="renovacion"] summary');
    assert.equal(await page.inputValue(ta), 'Hola {inquilino}, vence el {vencimiento}. {nada}');
    await page.click('[data-mensaje="renovacion"] .cfg-restaurar');
    await page.click('#cfg-guardar');
    await page.waitForSelector('#modal-config', { state: 'hidden' });
    assert.equal(await page.evaluate(() => app.estado.ajustesApp.mensajeRenovacionTexto), '');
    assert.deepEqual(errores, []);
  } finally { await app.close(); }
});

const fs = require('fs');

test('asistente de primer uso: marca y apariencia paso a paso', { timeout: 90000 }, async () => {
  const carpetaDatos = carpetaTemporal();
  let { app, page, errores } = await lanzar(carpetaDatos, { ADMIN_ALQ_SIN_ASISTENTE: '' });
  try {
    await page.waitForSelector('#modal-config.abierto.asistente');
    await page.waitForFunction(() => document.activeElement && document.activeElement.id === 'cfg-nombre');
    assert.equal(await page.isVisible('#cfg-bienvenida'), true);
    assert.equal(await page.isVisible('[data-cfg-pestana="mensajes"]'), false, 'mensajes no es un paso del asistente');
    assert.equal(await page.isVisible('#cfg-guardar'), false, 'en el paso 1 se sigue con Siguiente');
    await page.fill('#cfg-nombre', 'Inmobiliaria del Sur');
    await page.setInputFiles('#cfg-logo-archivo', LOGO);
    await page.waitForSelector('#cfg-logo-img:not([hidden])');
    await page.click('[data-icono-tipo="logo"]');
    await page.waitForSelector('[data-icono-tipo="logo"].activo');
    await captura(page, '13-asistente-paso1');

    await page.click('#cfg-siguiente');
    assert.equal(await page.isVisible('[data-cfg-panel="apariencia"]'), true);
    await page.click('[data-color-selector="color"] .cfg-muestra[data-color="#334155"]');
    await page.click('[data-color-selector="color2"] .cfg-muestra[data-color="#EA580C"]');
    await page.click('.cfg-tema[data-tema="calido"]');
    await page.click('.cfg-fuente[data-fuente="lora"]');
    // La vista previa ya muestra el tema; la app todavia no.
    assert.equal(await page.getAttribute('#cfg-vista', 'data-tema'), 'calido');
    assert.notEqual(await page.getAttribute('html', 'data-tema'), 'calido');
    await captura(page, '14-asistente-paso2');
    await page.click('#cfg-siguiente');   // paso 3: accesibilidad
    await page.click('#cfg-guardar');
    await page.waitForSelector('#modal-config', { state: 'hidden' });
    await page.waitForSelector('#carga-pantalla', { state: 'visible' });
    assert.equal(await page.getAttribute('html', 'data-tema'), 'calido');
    assert.match(await cssVar(page, '--fuente'), /Lora/);
    assert.equal(await cssVar(page, '--m-cabecera'), '#334155');
    assert.equal(await cssVar(page, '--m-sec'), '#EA580C');
    assert.equal(await page.evaluate(() => getComputedStyle(document.body).fontFamily.split(',')[0].replace(/['"]/g, '')), 'Lora');
    // Icono propio guardado para el proximo arranque.
    for (let i = 0; i < 20 && !fs.existsSync(path.join(carpetaDatos, 'icono.png')); i++) await page.waitForTimeout(100);
    assert.ok(fs.existsSync(path.join(carpetaDatos, 'icono.png')), 'icono.png guardado');
    await captura(page, '15-asistente-listo');
    assert.deepEqual(errores, []);
  } finally { await app.close(); }

  // Al reabrir ya no aparece el asistente y se mantiene la apariencia.
  ({ app, page, errores } = await lanzar(carpetaDatos, { ADMIN_ALQ_SIN_ASISTENTE: '' }));
  try {
    await page.waitForSelector('#carga-pantalla', { state: 'visible' });
    await page.waitForTimeout(300);
    assert.equal(await page.isVisible('#modal-config'), false);
    assert.equal(await page.getAttribute('html', 'data-tema'), 'calido');
    assert.deepEqual(errores, []);
  } finally { await app.close(); }
});

test('asistente de primer uso: se puede saltear', { timeout: 60000 }, async () => {
  const carpetaDatos = carpetaTemporal();
  let { app, page, errores } = await lanzar(carpetaDatos, { ADMIN_ALQ_SIN_ASISTENTE: '' });
  try {
    await page.waitForSelector('#modal-config.abierto.asistente');
    await page.click('#cfg-saltar');
    await page.waitForSelector('#modal-config', { state: 'hidden' });
    await page.waitForSelector('#carga-pantalla', { state: 'visible' });
    // Despues, la configuracion normal tiene las tres pestañas y Cancelar.
    await page.click('#btn-inicio-vacio');
    await page.waitForSelector('#app-pantalla', { state: 'visible' });
    await abrirConfiguracion(page);
    assert.equal(await page.isVisible('[data-cfg-pestana="mensajes"]'), true);
    assert.equal(await page.isVisible('#cfg-cancelar'), true);
    assert.equal(await page.isVisible('#cfg-saltar'), false);
    assert.deepEqual(errores, []);
  } finally { await app.close(); }
  ({ app, page } = await lanzar(carpetaDatos, { ADMIN_ALQ_SIN_ASISTENTE: '' }));
  try {
    await page.waitForSelector('#app-pantalla', { state: 'visible' });
    assert.equal(await page.isVisible('#modal-config'), false);
  } finally { await app.close(); }
});

test('apariencia: modo oscuro con tema y vista previa independiente', { timeout: 60000 }, async () => {
  const { app, page, errores } = await lanzar(carpetaTemporal());
  try {
    await empezarVacia(page);
    await abrirConfiguracion(page);
    await page.click('[data-cfg-pestana="apariencia"]');
    await page.click('.cfg-tema[data-tema="pizarra"]');
    await page.click('#cfg-vista-modo');
    assert.equal(await page.evaluate(() => document.getElementById('cfg-vista').classList.contains('oscuro')), true);
    assert.equal(await page.evaluate(() => getComputedStyle(document.getElementById('cfg-vista')).getPropertyValue('--fondo').trim()), '#0e131a');
    await page.click('#cfg-guardar');
    await page.waitForSelector('#modal-config', { state: 'hidden' });
    await page.click('#btn-tema');
    assert.equal(await cssVar(page, '--fondo'), '#0e131a');
    await page.click('#btn-tema');
    assert.equal(await cssVar(page, '--fondo'), '#edf1f6');
    assert.deepEqual(errores, []);
  } finally { await app.close(); }
});

test('icono de la app: prediseñado con color propio e imagen propia', { timeout: 60000 }, async () => {
  const carpetaDatos = carpetaTemporal();
  const { app, page, errores } = await lanzar(carpetaDatos);
  try {
    await empezarVacia(page);
    await abrirConfiguracion(page);
    // Sin logo, "Mi logo" no se puede elegir.
    assert.equal(await page.isDisabled('[data-icono-tipo="logo"]'), true);
    assert.equal(await page.isVisible('[data-icono-panel="app"]'), true);
    const srcAntes = await page.getAttribute('#cfg-icono-img', 'src');
    await page.click('.cfg-diseno[data-diseno="casa"]');
    await page.click('[data-color-selector="iconoColor"] .cfg-muestra[data-color="#BE123C"]');
    await page.waitForFunction(a => document.getElementById('cfg-icono-img').src !== a, srcAntes);
    // Los botones de diseños se dibujan con el color elegido.
    await page.waitForFunction(() => [...document.querySelectorAll('.cfg-diseno img')].every(i => i.src.startsWith('data:image/png')));
    await captura(page, '16-icono-prediseñado');
    await page.click('#cfg-guardar');
    await page.waitForSelector('#modal-config', { state: 'hidden' });
    const st = await page.evaluate(() => app.estado.ajustesApp);
    assert.deepEqual([st.marcaIconoTipo, st.marcaIconoDiseno, st.marcaIconoColor], ['app', 'casa', '#BE123C']);
    for (let i = 0; i < 20 && !fs.existsSync(path.join(carpetaDatos, 'icono.png')); i++) await page.waitForTimeout(100);
    assert.ok(fs.existsSync(path.join(carpetaDatos, 'icono.png')));

    // Imagen propia: se recorta a cuadrado.
    await abrirConfiguracion(page);
    await page.setInputFiles('#cfg-icono-archivo', LOGO);
    await page.waitForSelector('[data-icono-tipo="imagen"].activo');
    await page.click('#cfg-guardar');
    await page.waitForSelector('#modal-config', { state: 'hidden' });
    assert.equal(await page.evaluate(() => app.estado.ajustesApp.marcaIconoTipo), 'imagen');
    assert.match(await page.evaluate(() => app.estado.ajustesApp.marcaIconoImagen), /^data:image\/png;base64,/);
    assert.deepEqual(errores, []);
  } finally { await app.close(); }
});

test('modo de color: sigue a Windows por defecto y se elige en el asistente', { timeout: 60000 }, async () => {
  const { app, page, errores } = await lanzar(carpetaTemporal(), { ADMIN_ALQ_SIN_ASISTENTE: '' });
  const modo = () => page.evaluate(() => document.documentElement.dataset.esquema || 'claro');
  try {
    await page.waitForSelector('#modal-config.abierto.asistente');
    // Automatico: cambia junto con el modo del sistema.
    assert.equal(await modo(), 'claro');
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.waitForFunction(() => document.documentElement.dataset.esquema === 'oscuro');
    await page.emulateMedia({ colorScheme: 'light' });
    await page.waitForFunction(() => !document.documentElement.dataset.esquema);

    // En el paso 2 del asistente se elige el modo y se ve en el momento.
    await page.click('#cfg-siguiente');
    assert.equal(await page.isVisible('#cfg-modos'), true);
    assert.equal(await page.getAttribute('[data-modo="auto"]', 'class'), 'seg-btn activo');
    await page.click('[data-modo="oscuro"]');
    assert.equal(await modo(), 'oscuro');
    assert.equal(await page.evaluate(() => document.getElementById('cfg-vista').classList.contains('oscuro')), true);
    await captura(page, '17-asistente-modo-oscuro');
    await page.click('#cfg-siguiente');
    await page.click('#cfg-guardar');
    await page.waitForSelector('#carga-pantalla', { state: 'visible' });
    // Fijado en oscuro: ya no sigue al sistema.
    await page.emulateMedia({ colorScheme: 'light' });
    assert.equal(await modo(), 'oscuro');

    // En Configuracion, Cancelar vuelve al modo que habia.
    await page.click('#btn-inicio-vacio');
    await page.waitForSelector('#app-pantalla', { state: 'visible' });
    await abrirConfiguracion(page);
    await page.click('[data-cfg-pestana="apariencia"]');
    await page.click('[data-modo="claro"]');
    assert.equal(await modo(), 'claro');
    await page.click('#cfg-cancelar');
    assert.equal(await modo(), 'oscuro');
    assert.deepEqual(errores, []);
  } finally { await app.close(); }
});

test('accesibilidad: tamaño, negrita y contraste se aplican, se cancelan y se recuerdan', { timeout: 90000 }, async () => {
  const carpetaDatos = carpetaTemporal();
  let { app, page, errores } = await lanzar(carpetaDatos);
  const zoom = a => a.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.getZoomFactor());
  const pesoBody = () => page.evaluate(() => getComputedStyle(document.querySelector('#archivo-info')).fontWeight);
  try {
    await empezarVacia(page);
    assert.equal(await zoom(app), 1);
    await abrirConfiguracion(page);
    await page.click('[data-cfg-pestana="accesibilidad"]');
    assert.equal(await page.isVisible('#cfg-vista-caja'), false);
    // Cancelar deshace lo que se probo.
    await page.click('.cfg-tamano[data-tamano="1.5"]');
    await page.waitForFunction(() => document.querySelector('.cfg-tamano.prendido').dataset.tamano === '1.5');
    assert.equal(await zoom(app), 1.5);
    await page.click('#cfg-cancelar');
    assert.equal(await zoom(app), 1);

    await abrirConfiguracion(page);
    await page.click('[data-cfg-pestana="accesibilidad"]');
    await page.click('.cfg-tamano[data-tamano="1.3"]');
    await page.check('[data-a11y="negrita"]');
    await page.check('[data-a11y="contraste"]');
    await page.check('[data-a11y="subrayar"]');
    await page.click('[data-anim="no"]');
    await captura(page, '18-accesibilidad');
    await page.click('#cfg-guardar');
    await page.waitForSelector('#modal-config', { state: 'hidden' });
    assert.equal(await zoom(app), 1.3);
    assert.equal(await pesoBody(), '600');
    assert.equal(await cssVar(page, '--tenue').then(v => v.replace(/\s/g, '')), 'rgba(26,26,26,0.86)');
    assert.equal(await page.evaluate(() => document.documentElement.classList.contains('a11y-sin-animaciones')), true);
    assert.deepEqual(errores, []);
  } finally { await app.close(); }

  ({ app, page, errores } = await lanzar(carpetaDatos));
  try {
    await page.waitForSelector('#app-pantalla', { state: 'visible' });
    await page.waitForFunction(() => document.documentElement.classList.contains('a11y-negrita'));
    for (let i = 0; i < 20 && (await zoom(app)) !== 1.3; i++) await page.waitForTimeout(100);
    assert.equal(await zoom(app), 1.3);
    // Volver a lo normal.
    await abrirConfiguracion(page);
    await page.click('[data-cfg-pestana="accesibilidad"]');
    await page.click('#cfg-a11y-normal');
    await page.click('#cfg-guardar');
    assert.equal(await zoom(app), 1);
    assert.notEqual(await pesoBody(), '600');
    assert.deepEqual(errores, []);
  } finally { await app.close(); }
});
