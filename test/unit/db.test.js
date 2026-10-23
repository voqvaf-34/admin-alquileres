const test   = require('node:test');
const assert = require('node:assert/strict');
const fs     = require('fs');
const os     = require('os');
const path   = require('path');
const { BaseDatos } = require('../../src/infraestructura/base-datos');

function carpetaTemporal() { return fs.mkdtempSync(path.join(os.tmpdir(), 'alq-db-')); }

const sample = {
  direccion: 'CERRO LARGO 1234 AP 301', propietario: 'Ana', telProp: '099111222', mailProp: 'a@x.com',
  importeBase: 25000, contratoStr: '2 AÑOS', fechaInicio: '2024-05-10',
  inquilino: 'Beto', telInq: '098', mailInq: 'b@x.com', notas: 'nota',
};

test('crea la base, agrega y persiste en disco', async () => {
  const dir = carpetaTemporal(), file = path.join(dir, 'a.sqlite');
  const s1 = await BaseDatos.open(file);
  assert.equal(s1.estaVacia(), true);
  const c = s1.agregarContrato(sample);
  assert.equal(c.importe, 25000);
  assert.equal(c.importeBase, 25000);
  assert.equal(c.inactive, false);
  s1.close();

  const s2 = await BaseDatos.open(file);
  const list = s2.listarContratos();
  assert.equal(list.length, 1);
  assert.equal(list[0].direccion, sample.direccion);
  assert.equal(list[0].fechaInicio, '2024-05-10');
  s2.close();
});

test('validaciones de alta', async () => {
  const s = await BaseDatos.open(path.join(carpetaTemporal(), 'b.sqlite'));
  assert.throws(() => s.agregarContrato({ ...sample, direccion: '' }), /direccion/);
  assert.throws(() => s.agregarContrato({ ...sample, importeBase: 0 }), /importe/);
  assert.equal(s.estaVacia(), true, 'un alta invalida no deja registros');
  s.close();
});

test('editar, patch de aumento/comentario e inactivar', async () => {
  const s = await BaseDatos.open(path.join(carpetaTemporal(), 'c.sqlite'));
  const c = s.agregarContrato(sample);
  const u = s.editarContrato(c.id, { ...sample, propietario: 'Ana Maria', importeBase: 26000 });
  assert.equal(u.propietario, 'Ana Maria');
  assert.equal(u.importe, 26000);

  const p = s.modificarContrato(c.id, { importe: 27000, ultimoAumento: '2026-10-01', direccion: 'HACK' });
  assert.equal(p.importe, 27000);
  assert.equal(p.ultimoAumento, '2026-10-01');
  assert.equal(p.direccion, sample.direccion, 'campos no permitidos se ignoran');

  assert.equal(s.modificarContrato(c.id, { notas: '' }).notas, '');
  assert.equal(s.marcarInactivo(c.id).inactive, true);
  assert.throws(() => s.marcarInactivo(9999), /inexistente/);
  s.close();
});

test('marks: reemplazo completo y lectura', async () => {
  const s = await BaseDatos.open(path.join(carpetaTemporal(), 'd.sqlite'));
  s.reemplazarMarcas({ 'v|X': { date: '01/01/2026', nuevaInicio: '01/02/2026', renewYears: 2 }, 'nr|Y': { date: 'z', desc: 'se va' } });
  assert.deepEqual(Object.keys(s.obtenerMarcas()).sort(), ['nr|Y', 'v|X']);
  s.reemplazarMarcas({ 'a|X|3|2026': { date: 'q', xlSaved: true } });
  assert.deepEqual(s.obtenerMarcas(), { 'a|X|3|2026': { date: 'q', xlSaved: true } });
  s.close();
});

test('administraciones: alta, edicion, baja', async () => {
  const s = await BaseDatos.open(path.join(carpetaTemporal(), 'e.sqlite'));
  const id = s.guardarAdmin({ nombre: 'ADMIN SUR', edificios: 'Torre Ceibo', telefono: '2401', mail: 'b@b' });
  s.guardarAdmin({ id, nombre: 'ADMIN SUR SRL', edificios: 'Torre Ceibo; Edificio Arazá', telefono: '2401', mail: 'b@b' });
  assert.equal(s.listarAdmins()[0].nombre, 'ADMIN SUR SRL');
  assert.throws(() => s.guardarAdmin({ nombre: ' ' }), /obligatorio/);
  s.borrarAdmin(id);
  assert.equal(s.listarAdmins().length, 0);
  s.close();
});

test('importarDatos reemplaza todo y respaldar rota archivos', async () => {
  const dir = carpetaTemporal();
  const s = await BaseDatos.open(path.join(dir, 'f.sqlite'), { maxBackups: 3 });
  s.agregarContrato(sample);
  const res = s.importarDatos({ contracts: [{ ...sample, importe: 30000 }, { ...sample, direccion: 'OTRA', inactive: true }], admins: [{ nombre: 'A' }] });
  assert.deepEqual(res, { contracts: 2, admins: 1 });
  const list = s.listarContratos();
  assert.equal(list.length, 2);
  assert.equal(list[0].id, 1, 'los ids se reinician');
  assert.equal(list[0].importe, 30000, 'conserva el importe actual importado');
  assert.equal(list[1].inactive, true);
  for (let i = 0; i < 5; i++) s.respaldar('t' + i);
  assert.equal(fs.readdirSync(path.join(dir, 'backups')).length, 3);
  s.close();
});

test('garantia: se guarda, se edita y CGN/ANDA migran desde remitente', async () => {
  const s = await BaseDatos.open(path.join(carpetaTemporal(), 'g.sqlite'));
  const a = s.agregarContrato({ ...sample, garantia: 'Sura' });
  assert.equal(a.garantia, 'Sura');
  const b = s.agregarContrato({ ...sample, direccion: 'B 1', remitente: 'CGN' });
  const c = s.agregarContrato({ ...sample, direccion: 'C 1', remitente: 'GESTORA' });
  s.migrarGarantias(t => t.charAt(0) + t.slice(1).toLowerCase());
  assert.deepEqual([s.obtenerContrato(b.id).garantia, s.obtenerContrato(b.id).remitente], ['CGN', '']);
  assert.deepEqual([s.obtenerContrato(c.id).garantia, s.obtenerContrato(c.id).remitente], ['', 'Gestora']);
  const u = s.editarContrato(a.id, { ...sample, garantia: 'Porto', remitente: 'Laura' });
  assert.deepEqual([u.garantia, u.remitente], ['Porto', 'Laura']);
  const keep = s.editarContrato(a.id, { ...sample });           // sin los campos: no los borra
  assert.deepEqual([keep.garantia, keep.remitente], ['Porto', 'Laura']);
  s.close();
});

test('moneda: pesos por defecto, dolares para importes de hasta 4 cifras y se puede cambiar', async () => {
  const s = await BaseDatos.open(path.join(carpetaTemporal(), 'm.sqlite'));
  const pesos = s.agregarContrato({ ...sample, importeBase: 25000 });
  const dolares = s.agregarContrato({ ...sample, direccion: 'D 1', importeBase: 1140 });
  assert.equal(pesos.moneda, 'UYU');
  s.migrarMoneda();
  assert.deepEqual([s.obtenerContrato(pesos.id).moneda, s.obtenerContrato(dolares.id).moneda], ['UYU', 'USD']);
  assert.equal(s.editarContrato(pesos.id, { ...sample, importeBase: 900, moneda: 'UYU' }).moneda, 'UYU', 'se respeta lo elegido');
  assert.equal(s.editarContrato(pesos.id, { ...sample, importeBase: 900 }).moneda, 'UYU', 'sin el campo no cambia');
  assert.equal(s.agregarContrato({ ...sample, direccion: 'E 1', importeBase: 800, moneda: 'USD' }).moneda, 'USD');
  s.close();
});

test('agregar planilla: suma sin tocar lo cargado, saltea repetidos y vincula propietarios por nombre', async () => {
  const s = await BaseDatos.open(path.join(carpetaTemporal(), 'a.sqlite'));
  const { claveNombre } = require('../../src/dominios/index.js');
  const prev = s.agregarContrato(sample);
  s.vincularPropietariosDesdeTexto(prev.id, 'Ana', '', '', claveNombre);
  s.guardarAdmin({ nombre: 'Admin Sur', edificios: 'Torre Ceibo' });
  const fila = (o) => ({ ...sample, importe: sample.importeBase, moneda: 'UYU', inactive: false, ...o });
  const r = s.agregarImportados({
    contracts: [
      fila({}),                                                               // repetido
      fila({ direccion: 'Maldonado 1580 U2', inquilino: 'Camila', propietario: 'Ana / Bruno', moneda: 'USD', importeBase: 900, importe: 950 }),
      fila({ direccion: 'Guayabo 1850 U3', inquilino: 'Dario', propietario: 'Bruno', inactive: true }),
    ],
    admins: [{ nombre: 'ADMIN SUR' }, { nombre: 'Consorcio Guayabo', edificios: 'Guayabo' }],
  }, claveNombre);
  assert.deepEqual(r, { agregados: 2, repetidos: 1, admins: 1 });
  const list = s.listarContratos();
  assert.equal(list.length, 3);
  const mald = list.find(c => c.direccion === 'Maldonado 1580 U2');
  assert.deepEqual([mald.moneda, mald.importe, mald.importeBase, mald.inactive], ['USD', 950, 900, false]);
  assert.equal(list.find(c => c.direccion === 'Guayabo 1850 U3').inactive, true);
  const owners = s.listarPropietarios().map(o => o.nombre).sort();
  assert.deepEqual(owners, ['Ana', 'Bruno'], 'Ana se reutiliza, Bruno se crea una sola vez');
  assert.equal(s.listarPropietariosDeContratos().filter(l => l.contractId === mald.id).length, 2);
  assert.deepEqual(s.listarAdmins().map(a => a.nombre), ['Admin Sur', 'Consorcio Guayabo']);
});
