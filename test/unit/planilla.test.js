const test   = require('node:test');
const assert = require('node:assert/strict');
const XLSX   = require('xlsx');
const D      = require('../../src/dominios/index.js');
const { leerBuffer, leerLibro, libroModelo } = require('../../src/infraestructura/importador-excel');

const libro = (hojas) => {
  const wb = XLSX.utils.book_new();
  for (const [nombre, filas] of Object.entries(hojas)) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(filas), nombre);
  // Ida y vuelta por el formato real, como un archivo guardado en disco.
  return XLSX.read(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }), { type: 'buffer' });
};

test('planilla: encabezados en cualquier orden, con o sin tildes y mayusculas', () => {
  const enc = D.detectarEncabezados([
    ['Listado de alquileres'],
    [],
    ['INQUILINO', 'Importe', 'DIRECCIÓN', 'fecha inicio', 'Mail Propietario', 'Columna rara'],
  ]);
  assert.deepEqual(enc, { fila: 2, columnas: { inquilino: 0, importe: 1, direccion: 2, fechaInicio: 3, mailProp: 4 } });
  assert.equal(D.detectarEncabezados([['Inquilino', 'Propietario']]), null, 'sin direccion ni importe no es la planilla');
});

test('planilla: fechas, importes y moneda en distintos formatos', () => {
  assert.equal(D.aFechaISO(D.leerFecha('05/03/2025')), '2025-03-05');
  assert.equal(D.aFechaISO(D.leerFecha('5-3-25')), '2025-03-05');
  assert.equal(D.aFechaISO(D.leerFecha('2025-03-05')), '2025-03-05');
  assert.equal(D.aFechaISO(D.leerFecha('11/2025')), '2025-11-01');
  assert.equal(D.aFechaISO(D.leerFecha(45721)), '2025-03-05');   // numero de serie de Excel
  assert.equal(D.leerFecha('pronto'), null);
  for (const v of ['USD', 'u$s', 'U$S', 'Dólares', 'us$']) assert.equal(D.leerMoneda(v), 'USD', v);
  for (const v of ['UYU', '$', 'pesos']) assert.equal(D.leerMoneda(v), 'UYU', v);
  assert.equal(D.leerMoneda(''), '');
});

test('planilla modelo: se puede importar tal cual (ida y vuelta)', () => {
  const wb = XLSX.read(XLSX.write(libroModelo(), { type: 'buffer', bookType: 'xlsx' }), { type: 'buffer' });
  assert.deepEqual(wb.SheetNames, ['Alquileres', 'Administraciones', 'Instrucciones']);
  const data = leerLibro(wb);
  assert.equal(data.formato, 'plantilla');
  assert.equal(data.contracts.length, 2);
  const [a, b] = data.contracts;
  assert.equal(a.direccion, 'Torre Ceibo - Av. Italia 2875 U403');
  assert.deepEqual([a.importe, a.importeBase, a.moneda, a.fechaInicio, a.garantia, a.inactive], [29400, 28500, 'UYU', '2025-03-05', 'Porto', false]);
  assert.deepEqual([b.moneda, b.ultimoAumento, b.propietario], ['USD', '2025-11-01', 'Carla Mendez / Diego Mendez']);
  assert.equal(data.admins.length, 1);
  assert.equal(data.admins[0].nombre, 'Administración Sur (Laura Gómez)');
});

test('planilla: filas vacias o sin importe se saltean; Estado inactivo', () => {
  const data = leerLibro(libro({ Hoja1: [
    ['Dirección', 'Alquiler', 'Estado'],
    ['Canelones 1234 U502', '$ 25.000', ''],
    [],
    ['Maldonado 1580 U2', '', 'Activo'],
    ['Maldonado 1580 U5', 18000, 'Inactivo'],
  ] }));
  assert.equal(data.formato, 'plantilla');
  assert.deepEqual(data.contracts.map(c => [c.direccion, c.importe, c.inactive]),
    [['Canelones 1234 U502', 25000, false], ['Maldonado 1580 U5', 18000, true]]);
  assert.deepEqual(data.admins, []);
});

test('planilla CSV con encabezados, en UTF-8 y en ANSI (Excel en Windows)', () => {
  const csv = 'Dirección;Alquiler actual;Moneda;Inquilino\nCanelones 1234 U502;25000;UYU;Beto Gómez\nGuayabo 1850 U3;850;USD;Camila Ruiz\n';
  for (const buf of [Buffer.from(csv, 'utf8'), Buffer.from(csv, 'latin1')]) {
    const data = leerBuffer(buf);
    assert.equal(data.formato, 'plantilla');
    assert.deepEqual(data.contracts.map(c => [c.direccion, c.importe, c.moneda, c.inquilino]),
      [['Canelones 1234 U502', 25000, 'UYU', 'Beto Gómez'], ['Guayabo 1850 U3', 850, 'USD', 'Camila Ruiz']]);
  }
});

test('planilla clasica (sin encabezados reconocibles): columnas por posicion', () => {
  const data = leerLibro(libro({ ALQUILADOS: [
    ['NUMERO', 'DIRECCCION', 'PROPIETARIO', 'TEL', 'MAIL', 'IMPORTE', 'ULT', 'ACTUAL', 'CONTRATO', 'FECHA', 'INQUILINO', 'TEL', 'MAIL', 'NOTAS', 'ESTADO'],
    [2025],
    [1, 'TORRE CEIBO 403', 'ANA PEREZ', '091000101', '', 28500, '03/2026', 29400, '2 AÑOS', 45721, 'BETO GOMEZ', '', '', '', ''],
    [2, 'CANELONES 1234 U5', 'BRUNO SILVA', '', '', 18000, 'MANDA Gestora', '', '1 AÑO', 45000, 'CAMILA RUIZ', '', '', '', 'INACTIVO'],
  ] }));
  assert.equal(data.formato, 'clasico');
  assert.deepEqual(data.contracts.map(c => [c.direccion, c.importeBase, c.importe, c.ultimoAumento, c.remitente, c.inactive]), [
    ['TORRE CEIBO 403', 28500, 29400, '2026-03-01', '', false],
    ['CANELONES 1234 U5', 18000, 18000, null, 'Gestora', true],
  ]);
});
