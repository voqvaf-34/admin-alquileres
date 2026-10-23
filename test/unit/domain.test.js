const test   = require('node:test');
const assert = require('node:assert/strict');
const D      = require('../../src/dominios/index.js');

const mk = (o) => D.hidratarContrato({
  id: 1, direccion: 'TEST 101', importeBase: 20000, importe: 20000, contratoStr: '2 AÑOS',
  fechaInicio: '2023-03-15', ...o,
});

test('interpretarDuracion y duracionReal (firmado N = N+1 reales)', () => {
  assert.equal(D.interpretarDuracion('2 AÑOS'), 2);
  assert.equal(D.interpretarDuracion('1 año'), 1);
  assert.equal(D.interpretarDuracion(''), null);
  assert.equal(D.duracionReal(2), 3);
  assert.equal(D.duracionReal(null), null);
});

test('normalizar ignora tildes y mayusculas', () => {
  assert.equal(D.normalizar('Árbol de las MAÑANAS'), 'arbol de las mananas');
  assert.ok(D.normalizar('Olímpicos').includes(D.normalizar('olimpicos')));
});

test('fechaExcel convierte seriales de Excel a fecha local', () => {
  const d = D.fechaExcel(45000);            // 2023-03-15
  assert.equal(D.aFechaISO(d), '2023-03-15');
  assert.equal(D.fechaExcel(100), null);
});

test('obtenerAumentos: aniversario de fecha de inicio a partir del 2do anio', () => {
  const e = mk({});
  assert.equal(D.obtenerAumentos([e], 3, 2023).length, 0, 'mismo anio de inicio: no aumenta');
  assert.equal(D.obtenerAumentos([e], 3, 2024).length, 1);
  assert.equal(D.obtenerAumentos([e], 4, 2024).length, 0, 'otro mes: no');
});

test('obtenerAumentos: usa ultimoAumento si existe', () => {
  const e = mk({ ultimoAumento: '2024-07-01' });
  assert.equal(D.obtenerAumentos([e], 7, 2024).length, 0);
  assert.equal(D.obtenerAumentos([e], 7, 2025).length, 1);
  assert.equal(D.obtenerAumentos([e], 3, 2025).length, 0);
});

test('obtenerAumentos mantiene visible un aumento ya enviado ese mes', () => {
  const enviado = mk({ ultimoAumento: '2024-03-01' });   // el envio actualizo ultimoAumento
  assert.equal(D.obtenerAumentos([enviado], 3, 2024).length, 0, 'sin mark desaparece');
  assert.equal(D.obtenerAumentos([enviado], 3, 2024, { 'a|TEST 101|3|2024': { date: 'x' } }).length, 1);
});

test('obtenerAumentos excluye inactivos y delegados', () => {
  assert.equal(D.obtenerAumentos([mk({ inactive: 1 })], 3, 2024).length, 0);
  assert.equal(D.obtenerAumentos([mk({ remitente: 'JUAN' })], 3, 2024).length, 0);
});

test('obtenerFechaVenc: original y post-renovacion', () => {
  const e = mk({});
  assert.equal(D.aFechaISO(D.obtenerFechaVenc(e, {})), '2026-03-15');
  const marks = { 'v|TEST 101': { nuevaInicio: '01/03/2026', renewYears: 2 } };
  assert.equal(D.aFechaISO(D.obtenerFechaVenc(e, marks)), '2028-03-01');
});

test('obtenerVencimientos: ventana de 45 dias desde el inicio del mes', () => {
  const e = mk({});                                  // vence 15/03/2026
  assert.equal(D.obtenerVencimientos([e], 3, 2026, {}).length, 1, 'mismo mes');
  assert.equal(D.obtenerVencimientos([e], 2, 2026, {}).length, 1, '1/02 + 45d = 18/03 incluye 15/03');
  assert.equal(D.obtenerVencimientos([e], 1, 2026, {}).length, 0, 'demasiado temprano');
  assert.equal(D.obtenerVencimientos([e], 4, 2026, {}).length, 0, 'ya vencido');
});

test('obtenerVencidosAtrasados: excluye renovados y no-renueva', () => {
  const e = mk({});
  assert.equal(D.obtenerVencidosAtrasados([e], 8, 2026, {}).length, 1);
  assert.equal(D.obtenerVencidosAtrasados([e], 8, 2026, { 'v|TEST 101': { date: 'x' } }).length, 0);
  assert.equal(D.obtenerVencidosAtrasados([e], 8, 2026, { 'nr|TEST 101': { date: 'x' } }).length, 0);
  assert.equal(D.obtenerVencidosAtrasados([e], 2, 2026, {}).length, 0, 'todavia no vencio');
});

test('no renueva pero sigue activo: vuelve a avisar al anio siguiente', () => {
  const e = mk({});                                          // vence 15/03/2026
  const marks = { 'nr|TEST 101': { date: '01/03/2026', sigueActivo: true, hasta: '2026-03-15' } };
  assert.equal(D.aFechaISO(D.obtenerFechaVenc(e, marks)), '2027-03-15');
  assert.equal(D.esVencResuelto(e, marks), false, 'el ciclo nuevo queda pendiente');
  assert.equal(D.obtenerVencimientos([e], 3, 2026, marks).length, 0, 'no aparece en el ciclo ya resuelto');
  assert.equal(D.obtenerVencimientos([e], 2, 2027, marks).length, 1, 'aparece 45 dias antes del proximo');
  assert.equal(D.obtenerVencidosAtrasados([e], 5, 2027, marks).length, 1, 'si pasa sin resolver queda atrasado');
  const sinSeguir = { 'nr|TEST 101': { date: '01/03/2026' } };
  assert.equal(D.esVencResuelto(e, sinSeguir), true);
  assert.equal(D.obtenerVencidosAtrasados([e], 5, 2027, sinSeguir).length, 0);
});

test('esVencResuelto contempla el segundo ciclo', () => {
  const e = mk({});
  const ren1 = { 'v|TEST 101': { date: 'x', nuevaInicio: '01/03/2026', renewYears: 2 } };
  assert.equal(D.esVencResuelto(e, ren1), false, 'renovado 1 vez: el ciclo nuevo queda pendiente');
  assert.equal(D.esVencResuelto(e, { ...ren1, 'vr|TEST 101': { date: 'y' } }), true);
  assert.equal(D.esVencResuelto(e, { 'v|TEST 101': { date: 'x' } }), true, 'mark simple sin fechas');
});

test('nuevoImporte redondea hacia abajo', () => {
  assert.equal(D.nuevoImporte(20000, 3.16), 20632);
});

test('ultimoIPCPublicado segun el dia del mes', () => {
  assert.deepEqual(D.ultimoIPCPublicado(new Date(2026, 9, 8)), { month: 9, year: 2026 });
  assert.deepEqual(D.ultimoIPCPublicado(new Date(2026, 9, 3)), { month: 8, year: 2026 });
  assert.deepEqual(D.ultimoIPCPublicado(new Date(2026, 0, 10)), { month: 12, year: 2025 });
  assert.deepEqual(D.ultimoIPCPublicado(new Date(2026, 0, 2)), { month: 11, year: 2025 });
});

test('interpretarIPCDesdeHtml reconoce los formatos del INE', () => {
  assert.equal(D.interpretarIPCDesdeHtml('<p>La variación de los últimos 12 meses de <b>4,15%</b></p>'), 4.15);
  assert.equal(D.interpretarIPCDesdeHtml('IPC (Var.12 meses) 09/26: 3,98%'), 3.98);
  assert.equal(D.interpretarIPCDesdeHtml('la inflación interanual se ubicó en 5,02%'), 5.02);
  assert.equal(D.interpretarIPCDesdeHtml('<html>sin datos</html>'), null);
});

test('mensajeRenovacion (texto original) incluye la fecha y no la direccion', () => {
  const msg = D.mensajeRenovacion(new Date(2026, 10, 1));
  assert.match(msg, /vence el 01\/11\/2026/);
  assert.match(msg, /^Hola! Te escribo desde Mi Inmobiliaria/);
  assert.match(msg, /Aguardo tus comentarios!$/);
  assert.ok(!msg.includes('—'));
});

test('garantia CGN/ANDA o tercero: fuera de Aumentos y Vencimientos; otras garantias no', () => {
  assert.equal(D.gestionadoPor(mk({ garantia: 'cgn' })), 'CGN');
  assert.equal(D.gestionadoPor(mk({ garantia: 'Sura' })), '');
  assert.equal(D.gestionadoPor(mk({ garantia: 'Porto', remitente: 'Gabriel' })), 'Gabriel');
  assert.equal(D.obtenerAumentos([mk({ garantia: 'ANDA' })], 3, 2024).length, 0);
  assert.equal(D.obtenerAumentos([mk({ garantia: 'Sura' })], 3, 2024).length, 1);
  const venc = mk({ fechaInicio: '2021-03-15' });            // 2 años firmados = vence 03/2024
  assert.equal(D.obtenerVencimientos([venc], 3, 2024, {}).length, 1);
  assert.equal(D.obtenerVencimientos([{ ...venc, garantia: 'CGN' }], 3, 2024, {}).length, 0);
});

test('notas de renovacion: se reconocen y no cuentan como comentario', () => {
  assert.deepEqual(D.interpretarNotaRenovacion('En fecha 06/08/2026 se renovo a 2 años'), { date: new Date(2026, 7, 6), years: 2 });
  assert.deepEqual(D.interpretarNotaRenovacion('01/03/2024 Renovacion 2 años'), { date: new Date(2024, 2, 1), years: 2 });
  assert.deepEqual(D.interpretarNotaRenovacion('10/05/2026 renovación 1 año'), { date: new Date(2026, 4, 10), years: 1 });
  assert.equal(D.interpretarNotaRenovacion('01/05/2026 se le renovo pero en vez de $37.137 se cobra menos'), null, 'con info extra queda como comentario');
  const e = mk({ notas: '01/03/2024 Renovacion 2 años | Juan arregla precio | En fecha 06/08/2026 se renovo a 2 años' });
  assert.deepEqual(D.comentarios(e), ['Juan arregla precio']);
});

test('linea de tiempo del contrato: entro, vencio, renovo (con su nuevo vencimiento), renovo de nuevo', () => {
  const e = mk({ fechaInicio: '2021-03-01', contratoStr: '2 años', importeBase: 18000, importe: 25000,
    notas: '01/03/2024 Renovacion 2 años | comentario suelto' });
  const marks = {
    'a|TEST 101|3|2022': { date: '05/03/2022', importeNuevo: 22000, ipc: 9.5 },   // los aumentos no van
    'v|TEST 101': { date: '06/02/2026', nuevaInicio: '01/03/2026', renewYears: 2 },
  };
  const otro = mk({ id: 2, fechaInicio: '2019-01-01', inactive: 1 });   // inquilino anterior del mismo apto
  const t = D.lineaTiempo(e, marks, [e, otro]);
  assert.deepEqual(t.map(x => x.tipo), ['inicio', 'renov', 'renov', 'proximo', 'hoy']);
  assert.match(t[0].detalle, /contrato a \$18\.000 · 2 años firmado \(3 reales\) · vence 01\/03\/2024/);
  assert.deepEqual([t[1].titulo, t[1].detalle], ['Renovó', 'por 2 años · vence 01/03/2026']);
  assert.match(t[2].titulo, /Renovó de nuevo \(2ª/);
  assert.equal(t[2].detalle, 'por 2 años · vence 01/03/2028');
  assert.deepEqual([t[3].titulo, D.aFechaISO(t[3].date)], ['Vence el contrato', '2028-03-01']);
  assert.match(t[4].detalle, /25\.000/);
  // las renovaciones del apto no se le atribuyen al inquilino anterior
  assert.equal(D.renovaciones(otro, marks, [e, otro]).lista.length, 0);
  assert.equal(D.renovaciones(e, marks, [e, otro]).lista.length, 2);
});

test('renovaciones: con el indice por direccion da lo mismo que con la lista completa', () => {
  const a = mk({ id: 1, fechaInicio: '2021-03-01', notas: '01/03/2024 Renovacion 2 años' });
  const b = mk({ id: 2, fechaInicio: '2019-01-01', inactive: 1 });
  const c = mk({ id: 3, direccion: 'OTRO 1', fechaInicio: '2022-01-01' });
  const marks = { 'v|TEST 101': { date: '06/02/2026', nuevaInicio: '01/03/2026', renewYears: 2 } };
  const lista = [a, b, c], idx = D.indicePorDireccion(lista);
  assert.deepEqual([...idx.get('TEST 101')].map(x => x.id), [2, 1], 'ordenado por fecha de inicio');
  for (const e of lista) assert.deepEqual(D.renovaciones(e, marks, idx), D.renovaciones(e, marks, lista));
});

test('linea de tiempo: la misma renovacion como marca y como nota vieja cuenta una sola vez', () => {
  const e = mk({ fechaInicio: '2022-03-01', contratoStr: '2 años', notas: '01/03/2024 Renovacion 2 años' });
  const marks = { 'v|TEST 101': { date: '06/08/2026', nuevaInicio: '01/03/2024', renewYears: 2 } };   // marcada tarde
  const r = D.renovaciones(e, marks, [e]);
  assert.equal(r.lista.length, 1, 'una sola renovacion');
  const t = D.lineaTiempo(e, marks, [e]);
  const renov = t.filter(x => x.tipo === 'renov');
  assert.equal(renov.length, 1);
  assert.equal(renov[0].titulo, 'Renovó');
  assert.equal(D.aFechaISO(renov[0].date), '2024-03-01', 'se muestra cuando empezo, no cuando se marco');
  assert.equal(renov[0].detalle, 'por 2 años · vence 01/03/2026');
});

test('vencimientos: dias que faltan y urgencia (10 dias o menos, o ya vencido)', () => {
  const hoy = new Date(2026, 9, 22, 15, 30);              // la hora del dia no cuenta
  const en = d => new Date(2026, 9, 22 + d);
  assert.deepEqual([0, 1, 10, 11, -3].map(d => D.diasHasta(en(d), hoy)), [0, 1, 10, 11, -3]);
  assert.deepEqual([-3, 0, 10, 11, 30].map(d => D.urgenciaVencimiento(en(d), hoy)), ['urgente', 'urgente', 'urgente', 'proximo', 'proximo']);
  assert.equal(D.urgenciaVencimiento(null, hoy), 'proximo');
  assert.equal(D.diasHasta(new Date(2026, 11, 31), new Date(2026, 11, 30, 23, 59)), 1, 'cruce de año');
});

test('normalizarContrato: direccion armada, nombres con mayusculas iniciales y copropietarios', () => {
  const c = D.normalizarContrato({ edificio: 'TORRE CEIBO', calle: 'av. italia 2875', unidad: '403b', propietario: 'ANA PEREZ //JUAN PEREZ', inquilino: 'beto gomez', importeBase: 1 });
  assert.equal(c.direccion, 'Torre Ceibo - Av. Italia 2875 U403B');
  assert.equal(c.propietario, 'Ana Perez / Juan Perez');
  assert.equal(c.inquilino, 'Beto Gomez');
  assert.equal(D.normalizarContrato({ direccion: 'CANELONES 1234', propietario: null }).propietario, null, 'null = no se toca');
  assert.equal(D.normalizarContrato({ calle: 'Canelones 1234', unidad: 'local frente' }).direccion, 'Canelones 1234 Local Frente', 'unidad con nombre, sin la U');
});

test('prepararImportado: CGN/ANDA pasan a garantia y la planilla clasica marca dolares por importe', () => {
  const reglas = { buildings: [], overrides: {} };
  const a = D.prepararImportado({ direccion: 'CANELONES 1234 U502', remitente: 'anda', importe: 25000, importeBase: 25000 }, { reglasDirecciones: reglas });
  assert.deepEqual([a.direccion, a.garantia, a.remitente, a.moneda, a.direccionOriginal], ['Canelones 1234 U502', 'ANDA', '', 'UYU', 'CANELONES 1234 U502']);
  const b = D.prepararImportado({ direccion: 'Guayabo 1850 U3', remitente: 'gestora norte', importe: 850 }, { reglasDirecciones: reglas, clasico: true });
  assert.deepEqual([b.garantia, b.remitente, b.moneda], ['', 'Gestora Norte', 'USD']);
  const c = D.prepararImportado({ direccion: 'Guayabo 1850 U3', importe: 850, moneda: 'UYU' }, { reglasDirecciones: reglas, clasico: true });
  assert.equal(c.moneda, 'UYU', 'la moneda de la planilla manda');
});
