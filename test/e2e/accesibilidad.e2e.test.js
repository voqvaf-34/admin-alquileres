// Accesibilidad automatica (WCAG 2.1 A y AA, con axe-core): todas las pantallas sin problemas, en
// claro y oscuro, con cada tema, con las opciones de Accesibilidad y con colores de marca claros.
const test   = require('node:test');
const assert = require('node:assert/strict');
const { recorrer, resumen } = require('./accesibilidad');

const sinProblemas = ps => assert.equal(ps.length, 0, '\n' + resumen(ps));

test('accesibilidad: todos los temas, en claro y oscuro', { timeout: 600000 }, async () => {
  sinProblemas(await recorrer({ temas: ['clasico', 'calido', 'pizarra', 'fresco', 'marca', 'contraste'] }));
});

test('accesibilidad: con mas contraste, negrita y mas espacio', { timeout: 300000 }, async () => {
  sinProblemas(await recorrer({ soloApp: true, a11y: { contraste: true, negrita: true, espaciado: true, subrayar: true } }));
});

test('accesibilidad: colores de marca claros (naranja y amarillo)', { timeout: 300000 }, async () => {
  sinProblemas(await recorrer({ soloApp: true, temas: ['clasico', 'marca'], marca: { color: '#FD4108', color2: '#FACC15' } }));
});
