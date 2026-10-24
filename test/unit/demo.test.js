const test   = require('node:test');
const assert = require('node:assert/strict');
const D      = require('../../src/dominios/index.js');

// Se prueba con varios "hoy": principio, mitad y fin de mes, y fin de anio.
const DIAS = [new Date(2026, 0, 1), new Date(2026, 9, 21), new Date(2026, 4, 31), new Date(2026, 11, 31), new Date(2027, 1, 28)];

function cartera(hoy) {
  const { contracts: contratos, admins, marks } = D.datosDemo(hoy);
  // Lo mismo que hace la migracion de garantias: CGN/ANDA pasan del remitente a la garantia.
  const entradas = contratos.map((c, i) => {
    const g = ['CGN', 'ANDA'].includes(c.remitente) ? c.remitente : '';
    return D.hidratarContrato({ ...c, id: i + 1, garantia: g, remitente: g ? '' : c.remitente });
  });
  return { entries: entradas, admins, marks };
}

for (const hoy of DIAS) {
  test(`datos de ejemplo (${hoy.toLocaleDateString('es-UY')}): hay algo para ver en cada pestaña`, () => {
    const { entries: entradas, admins, marks } = cartera(hoy);
    const m = hoy.getMonth() + 1, y = hoy.getFullYear();
    const nxM = m === 12 ? 1 : m + 1, nxY = m === 12 ? y + 1 : y;
    assert.ok(D.obtenerAumentos(entradas, m, y, marks).length >= 5, 'aumentos del mes');
    assert.ok(D.obtenerAumentos(entradas, nxM, nxY, marks).length >= 2, 'aumentos del mes que viene');
    const venc = D.obtenerVencimientos(entradas, m, y, marks).map(e => e.direccion);
    assert.deepEqual(venc.sort(), ['Maldonado 1580 U2', 'Mirador del Parque - Av. Rivera 3300 U604', 'Torre Ceibo - Av. Italia 2875 U1104']);
    assert.deepEqual(D.obtenerVencidosAtrasados(entradas, m, y, marks).map(e => e.direccion), ['Residencial Guayabo - Guayabo 1850 U7']);
    assert.equal(entradas.filter(e => D.gestionadoPor(e)).length, 3, 'dos garantias y un tercero');
    assert.deepEqual(entradas.map(e => e.remitente).filter(Boolean), ['Gestora Norte'], 'el delegado sin el prefijo de la planilla vieja');
    assert.equal(entradas.filter(e => e.inactive).length, 2);
    assert.equal(admins.length, 3);
  });
}

test('datos de ejemplo: el apto renovado tiene linea de tiempo y no figura como vencido', () => {
  const hoy = new Date(2026, 9, 21);
  const { entries: entradas, marks } = cartera(hoy);
  const e = entradas.find(x => x.direccion === 'Edificio Araza - Bv. Artigas 1610 U1002');
  const venc = D.obtenerFechaVenc(e, marks);
  assert.ok(venc > hoy, 'el nuevo vencimiento es a futuro');
  assert.deepEqual(D.lineaTiempo(e, marks, entradas).map(p => p.tipo), ['inicio', 'renov', 'proximo', 'hoy']);
});

test('datos de ejemplo: direcciones ya normalizadas, montos en pesos y en dolares, sin datos reales', () => {
  const { contracts: contratos } = D.datosDemo(new Date(2026, 9, 21));
  for (const c of contratos) {
    assert.equal(D.normalizarDireccion(c.direccion, { buildings: [], overrides: {} }).direccion, c.direccion);
    assert.match(c.mailProp, /@example\.com$/);
    assert.match(c.telProp, /^091 000 \d{3}$/);
  }
  assert.deepEqual(contratos.filter(c => c.moneda === 'USD').map(c => c.importe), [850, 1100], 'dos en dolares');
});
