const test   = require('node:test');
const assert = require('node:assert/strict');
const D      = require('../../src/dominios/index.js');

const mk = (o) => D.hydrateContract({
  id: 1, direccion: 'TEST 101', importeBase: 20000, importe: 20000, contratoStr: '2 AÑOS',
  fechaInicio: '2023-03-15', ...o,
});

test('parseDuration y realDuration (firmado N = N+1 reales)', () => {
  assert.equal(D.parseDuration('2 AÑOS'), 2);
  assert.equal(D.parseDuration('1 año'), 1);
  assert.equal(D.parseDuration(''), null);
  assert.equal(D.realDuration(2), 3);
  assert.equal(D.realDuration(null), null);
});

test('norm ignora tildes y mayusculas', () => {
  assert.equal(D.norm('Árbol de las MAÑANAS'), 'arbol de las mananas');
  assert.ok(D.norm('Olímpicos').includes(D.norm('olimpicos')));
});

test('excelDate convierte seriales de Excel a fecha local', () => {
  const d = D.excelDate(45000);            // 2023-03-15
  assert.equal(D.toISODate(d), '2023-03-15');
  assert.equal(D.excelDate(100), null);
});

test('getAumentos: aniversario de fecha de inicio a partir del 2do anio', () => {
  const e = mk({});
  assert.equal(D.getAumentos([e], 3, 2023).length, 0, 'mismo anio de inicio: no aumenta');
  assert.equal(D.getAumentos([e], 3, 2024).length, 1);
  assert.equal(D.getAumentos([e], 4, 2024).length, 0, 'otro mes: no');
});

test('getAumentos: usa ultimoAumento si existe', () => {
  const e = mk({ ultimoAumento: '2024-07-01' });
  assert.equal(D.getAumentos([e], 7, 2024).length, 0);
  assert.equal(D.getAumentos([e], 7, 2025).length, 1);
  assert.equal(D.getAumentos([e], 3, 2025).length, 0);
});

test('getAumentos mantiene visible un aumento ya enviado ese mes', () => {
  const enviado = mk({ ultimoAumento: '2024-03-01' });   // el envio actualizo ultimoAumento
  assert.equal(D.getAumentos([enviado], 3, 2024).length, 0, 'sin mark desaparece');
  assert.equal(D.getAumentos([enviado], 3, 2024, { 'a|TEST 101|3|2024': { date: 'x' } }).length, 1);
});

test('getAumentos excluye inactivos y delegados', () => {
  assert.equal(D.getAumentos([mk({ inactive: 1 })], 3, 2024).length, 0);
  assert.equal(D.getAumentos([mk({ remitente: 'JUAN' })], 3, 2024).length, 0);
});

test('getVencDate: original y post-renovacion', () => {
  const e = mk({});
  assert.equal(D.toISODate(D.getVencDate(e, {})), '2026-03-15');
  const marks = { 'v|TEST 101': { nuevaInicio: '01/03/2026', renewYears: 2 } };
  assert.equal(D.toISODate(D.getVencDate(e, marks)), '2028-03-01');
});

test('getVencimientos: ventana de 45 dias desde el inicio del mes', () => {
  const e = mk({});                                  // vence 15/03/2026
  assert.equal(D.getVencimientos([e], 3, 2026, {}).length, 1, 'mismo mes');
  assert.equal(D.getVencimientos([e], 2, 2026, {}).length, 1, '1/02 + 45d = 18/03 incluye 15/03');
  assert.equal(D.getVencimientos([e], 1, 2026, {}).length, 0, 'demasiado temprano');
  assert.equal(D.getVencimientos([e], 4, 2026, {}).length, 0, 'ya vencido');
});

test('getVencidosAtrasados: excluye renovados y no-renueva', () => {
  const e = mk({});
  assert.equal(D.getVencidosAtrasados([e], 8, 2026, {}).length, 1);
  assert.equal(D.getVencidosAtrasados([e], 8, 2026, { 'v|TEST 101': { date: 'x' } }).length, 0);
  assert.equal(D.getVencidosAtrasados([e], 8, 2026, { 'nr|TEST 101': { date: 'x' } }).length, 0);
  assert.equal(D.getVencidosAtrasados([e], 2, 2026, {}).length, 0, 'todavia no vencio');
});

test('no renueva pero sigue activo: vuelve a avisar al anio siguiente', () => {
  const e = mk({});                                          // vence 15/03/2026
  const marks = { 'nr|TEST 101': { date: '01/03/2026', sigueActivo: true, hasta: '2026-03-15' } };
  assert.equal(D.toISODate(D.getVencDate(e, marks)), '2027-03-15');
  assert.equal(D.isVencResuelto(e, marks), false, 'el ciclo nuevo queda pendiente');
  assert.equal(D.getVencimientos([e], 3, 2026, marks).length, 0, 'no aparece en el ciclo ya resuelto');
  assert.equal(D.getVencimientos([e], 2, 2027, marks).length, 1, 'aparece 45 dias antes del proximo');
  assert.equal(D.getVencidosAtrasados([e], 5, 2027, marks).length, 1, 'si pasa sin resolver queda atrasado');
  const sinSeguir = { 'nr|TEST 101': { date: '01/03/2026' } };
  assert.equal(D.isVencResuelto(e, sinSeguir), true);
  assert.equal(D.getVencidosAtrasados([e], 5, 2027, sinSeguir).length, 0);
});

test('isVencResuelto contempla el segundo ciclo', () => {
  const e = mk({});
  const ren1 = { 'v|TEST 101': { date: 'x', nuevaInicio: '01/03/2026', renewYears: 2 } };
  assert.equal(D.isVencResuelto(e, ren1), false, 'renovado 1 vez: el ciclo nuevo queda pendiente');
  assert.equal(D.isVencResuelto(e, { ...ren1, 'vr|TEST 101': { date: 'y' } }), true);
  assert.equal(D.isVencResuelto(e, { 'v|TEST 101': { date: 'x' } }), true, 'mark simple sin fechas');
});

test('nuevoImporte redondea hacia abajo', () => {
  assert.equal(D.nuevoImporte(20000, 3.16), 20632);
});

test('latestPublishedIPC segun el dia del mes', () => {
  assert.deepEqual(D.latestPublishedIPC(new Date(2026, 9, 8)), { month: 9, year: 2026 });
  assert.deepEqual(D.latestPublishedIPC(new Date(2026, 9, 3)), { month: 8, year: 2026 });
  assert.deepEqual(D.latestPublishedIPC(new Date(2026, 0, 10)), { month: 12, year: 2025 });
  assert.deepEqual(D.latestPublishedIPC(new Date(2026, 0, 2)), { month: 11, year: 2025 });
});

test('parseIPCFromHtml reconoce los formatos del INE', () => {
  assert.equal(D.parseIPCFromHtml('<p>La variación de los últimos 12 meses de <b>4,15%</b></p>'), 4.15);
  assert.equal(D.parseIPCFromHtml('IPC (Var.12 meses) 09/26: 3,98%'), 3.98);
  assert.equal(D.parseIPCFromHtml('la inflación interanual se ubicó en 5,02%'), 5.02);
  assert.equal(D.parseIPCFromHtml('<html>sin datos</html>'), null);
});

test('renewalMessage incluye la fecha y no la direccion', () => {
  const msg = D.renewalMessage(new Date(2026, 10, 1));
  assert.match(msg, /vence el 01\/11\/2026/);
  assert.match(msg, /^Hola! Te escribo desde Mi Inmobiliaria/);
  assert.match(msg, /Aguardo tus comentarios!$/);
  assert.ok(!msg.includes('—'));
});

test('garantia CGN/ANDA o tercero: fuera de Aumentos y Vencimientos; otras garantias no', () => {
  assert.equal(D.gestionadoPor(mk({ garantia: 'cgn' })), 'CGN');
  assert.equal(D.gestionadoPor(mk({ garantia: 'Sura' })), '');
  assert.equal(D.gestionadoPor(mk({ garantia: 'Porto', remitente: 'Gabriel' })), 'Gabriel');
  assert.equal(D.getAumentos([mk({ garantia: 'ANDA' })], 3, 2024).length, 0);
  assert.equal(D.getAumentos([mk({ garantia: 'Sura' })], 3, 2024).length, 1);
  const venc = mk({ fechaInicio: '2021-03-15' });            // 2 años firmados = vence 03/2024
  assert.equal(D.getVencimientos([venc], 3, 2024, {}).length, 1);
  assert.equal(D.getVencimientos([{ ...venc, garantia: 'CGN' }], 3, 2024, {}).length, 0);
});

test('notas de renovacion: se reconocen y no cuentan como comentario', () => {
  assert.deepEqual(D.parseRenewalNote('En fecha 06/08/2026 se renovo a 2 años'), { date: new Date(2026, 7, 6), years: 2 });
  assert.deepEqual(D.parseRenewalNote('01/03/2024 Renovacion 2 años'), { date: new Date(2024, 2, 1), years: 2 });
  assert.deepEqual(D.parseRenewalNote('10/05/2026 renovación 1 año'), { date: new Date(2026, 4, 10), years: 1 });
  assert.equal(D.parseRenewalNote('01/05/2026 se le renovo pero en vez de $37.137 se cobra menos'), null, 'con info extra queda como comentario');
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
  const t = D.timeline(e, marks, [e, otro]);
  assert.deepEqual(t.map(x => x.tipo), ['inicio', 'renov', 'renov', 'proximo', 'hoy']);
  assert.match(t[0].detalle, /contrato a \$18\.000 · 2 años firmado \(3 reales\) · vence 01\/03\/2024/);
  assert.deepEqual([t[1].titulo, t[1].detalle], ['Renovó', 'por 2 años · vence 01/03/2026']);
  assert.match(t[2].titulo, /Renovó de nuevo \(2ª/);
  assert.equal(t[2].detalle, 'por 2 años · vence 01/03/2028');
  assert.deepEqual([t[3].titulo, D.toISODate(t[3].date)], ['Vence el contrato', '2028-03-01']);
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
  const t = D.timeline(e, marks, [e]);
  const renov = t.filter(x => x.tipo === 'renov');
  assert.equal(renov.length, 1);
  assert.equal(renov[0].titulo, 'Renovó');
  assert.equal(D.toISODate(renov[0].date), '2024-03-01', 'se muestra cuando empezo, no cuando se marco');
  assert.equal(renov[0].detalle, 'por 2 años · vence 01/03/2026');
});
