// Revision automatica de accesibilidad (WCAG 2.1 A y AA) con axe-core: recorre las pantallas de la
// app con datos de ejemplo, en modo claro y oscuro, y devuelve lo que no cumple.
// La usan la prueba accesibilidad.e2e.test.js y el diagnostico: node test/e2e/accesibilidad.js
const fs   = require('fs');
const { lanzar, carpetaTemporal } = require('./helpers');

const AXE = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
const ETIQUETAS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

async function revisar(page, pantalla, modo) {
  await page.waitForTimeout(100);
  const res = await page.evaluate(async etiquetas => {

    // Con una ventana abierta se revisa solo esa (lo de atras queda tapado a proposito).
    const abierta = document.querySelector('.modal.abierto, #modal-agregar.abierto, #modal-admin.abierto');
    const r = await axe.run(abierta || document, { runOnly: { type: 'tag', values: etiquetas }, resultTypes: ['violations'] });
    return r.violations.map(v => ({
      regla: v.id, impacto: v.impact, ayuda: v.help,
      nodos: v.nodes.map(n => ({ selector: n.target.join(' '), detalle: (n.any[0] || n.all[0] || n.none[0] || {}).message || n.failureSummary })),
    }));
  }, ETIQUETAS);
  return res.map(v => ({ pantalla, modo, ...v }));
}

// Recorre las pantallas; devuelve la lista de problemas (vacia = todo bien).
// marca: { color, color2 } para probar con colores de marca; a11y: opciones de Accesibilidad.
async function recorrer({ temas = ['clasico'], marca = null, a11y = null, soloApp = false, alPaso } = {}) {
  const problemas = [];
  const { app, page } = await lanzar(carpetaTemporal());
  const paso = async (pantalla, modo) => {
    const r = await revisar(page, pantalla, modo);
    problemas.push(...r);
    if (alPaso) alPaso(pantalla, modo, r);
  };
  try {
    await page.evaluate(src => { (0, eval)(src); }, AXE);
    // Sin animaciones: se mide el color final, no uno a mitad de la transicion entre temas.
    await page.evaluate(() => A11y.poner({ animaciones: 'no' }));
    await page.waitForSelector('#carga-pantalla', { state: 'visible' });
    if (!soloApp) for (const modo of ['light', 'dark']) {
      await page.emulateMedia({ colorScheme: modo });
      await paso('inicio', modo);
    }
    await page.click('#btn-inicio-demo');
    await page.waitForSelector('#app-pantalla', { state: 'visible' });
    if (marca || a11y) {
      await page.evaluate(async ({ marca, a11y }) => {
        if (a11y) A11y.poner({ ...a11y, animaciones: 'no' });
        if (marca) await window.api.guardarConfig({ marca: { nombre: '', color: marca.color, color2: marca.color2 || '' } });
      }, { marca, a11y });
      await page.reload();
      await page.waitForSelector('#app-pantalla', { state: 'visible' });
      await page.evaluate(src => { (0, eval)(src); }, AXE);
    }
    for (const tema of temas) {
      await page.evaluate(t => { document.documentElement.dataset.tema = t; }, tema);
      for (const modo of ['light', 'dark']) {
        await page.emulateMedia({ colorScheme: modo });
        const m = `${tema}/${modo}`;
        await page.click('#pestana-basedatos');
        if (!(await page.$('#base-tbody .base-fila.expandida'))) await page.click('#base-tbody .base-fila');
        await paso('base de datos', m);
        await page.click('#pestana-propietarios');
        await paso('propietarios', m);
        await page.click('#pestana-aumentos');
        await page.waitForSelector('#contenido .tarjeta');
        await paso('aumentos', m);
        await page.click('#pestana-vencimientos');
        await page.waitForSelector('#contenido .tarjeta');
        await paso('renovaciones', m);
        await page.click('#pestana-administraciones');
        await paso('administraciones', m);
        await page.click('#pestana-basedatos');
        await page.click('#btn-agregar-entrada');
        await page.waitForSelector('#modal-agregar.abierto');
        await paso('alquiler nuevo', m);
        await page.click('#modal-cancelar');
        await page.click('#btn-menu');
        await page.click('#btn-menu-importar');
        await paso('importar', m);
        await page.click('#modal-importar .btn-modal-cancelar');
        await page.click('#btn-menu');
        await page.click('#btn-config');
        await page.waitForSelector('#modal-config.abierto');
        for (const tab of ['marca', 'apariencia', 'mensajes']) {
          await page.click(`[data-cfg-pestana="${tab}"]`);
          if (tab === 'mensajes') await page.click('[data-mensaje="renovacion"] summary');
          await paso(`configuración/${tab}`, m);
        }
        await page.click('#cfg-cancelar');
      }
    }
  } finally { await app.close(); }
  return problemas;
}

function resumen(problemas) {
  const porRegla = new Map();
  for (const p of problemas) for (const n of p.nodos) {
    const k = `${p.regla} | ${n.selector}`;
    if (!porRegla.has(k)) porRegla.set(k, { ...p, nodo: n, donde: new Set() });
    porRegla.get(k).donde.add(`${p.pantalla} (${p.modo})`);
  }
  return [...porRegla.values()].map(x => `- [${x.regla}] ${x.nodo.selector}\n    ${x.nodo.detalle}\n    en: ${[...x.donde].join(', ')}`).join('\n');
}

module.exports = { recorrer, resumen };

if (require.main === module) {
  const temas = process.argv.slice(2);
  recorrer({ temas: temas.length ? temas : ['clasico'], alPaso: (p, m, r) => console.log(`${p} (${m}): ${r.reduce((n, v) => n + v.nodos.length, 0)} problemas`) })
    .then(ps => { console.log('\n' + (ps.length ? resumen(ps) : 'Sin problemas.')); process.exit(ps.length ? 1 : 0); })
    .catch(e => { console.error(e); process.exit(1); });
}
