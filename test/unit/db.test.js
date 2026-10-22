const test   = require('node:test');
const assert = require('node:assert/strict');
const fs     = require('fs');
const os     = require('os');
const path   = require('path');
const { Store } = require('../../src/infraestructura/base-datos');

function tmpDir() { return fs.mkdtempSync(path.join(os.tmpdir(), 'alq-db-')); }

const sample = {
  direccion: 'CERRO LARGO 1234 AP 301', propietario: 'Ana', telProp: '099111222', mailProp: 'a@x.com',
  importeBase: 25000, contratoStr: '2 AÑOS', fechaInicio: '2024-05-10',
  inquilino: 'Beto', telInq: '098', mailInq: 'b@x.com', notas: 'nota',
};

test('crea la base, agrega y persiste en disco', async () => {
  const dir = tmpDir(), file = path.join(dir, 'a.sqlite');
  const s1 = await Store.open(file);
  assert.equal(s1.isEmpty(), true);
  const c = s1.addContract(sample);
  assert.equal(c.importe, 25000);
  assert.equal(c.importeBase, 25000);
  assert.equal(c.inactive, false);
  s1.close();

  const s2 = await Store.open(file);
  const list = s2.listContracts();
  assert.equal(list.length, 1);
  assert.equal(list[0].direccion, sample.direccion);
  assert.equal(list[0].fechaInicio, '2024-05-10');
  s2.close();
});

test('validaciones de alta', async () => {
  const s = await Store.open(path.join(tmpDir(), 'b.sqlite'));
  assert.throws(() => s.addContract({ ...sample, direccion: '' }), /direccion/);
  assert.throws(() => s.addContract({ ...sample, importeBase: 0 }), /importe/);
  assert.equal(s.isEmpty(), true, 'un alta invalida no deja registros');
  s.close();
});

test('editar, patch de aumento/comentario e inactivar', async () => {
  const s = await Store.open(path.join(tmpDir(), 'c.sqlite'));
  const c = s.addContract(sample);
  const u = s.updateContract(c.id, { ...sample, propietario: 'Ana Maria', importeBase: 26000 });
  assert.equal(u.propietario, 'Ana Maria');
  assert.equal(u.importe, 26000);

  const p = s.patchContract(c.id, { importe: 27000, ultimoAumento: '2026-10-01', direccion: 'HACK' });
  assert.equal(p.importe, 27000);
  assert.equal(p.ultimoAumento, '2026-10-01');
  assert.equal(p.direccion, sample.direccion, 'campos no permitidos se ignoran');

  assert.equal(s.patchContract(c.id, { notas: '' }).notas, '');
  assert.equal(s.setInactive(c.id).inactive, true);
  assert.throws(() => s.setInactive(9999), /inexistente/);
  s.close();
});

test('marks: reemplazo completo y lectura', async () => {
  const s = await Store.open(path.join(tmpDir(), 'd.sqlite'));
  s.replaceMarks({ 'v|X': { date: '01/01/2026', nuevaInicio: '01/02/2026', renewYears: 2 }, 'nr|Y': { date: 'z', desc: 'se va' } });
  assert.deepEqual(Object.keys(s.getMarks()).sort(), ['nr|Y', 'v|X']);
  s.replaceMarks({ 'a|X|3|2026': { date: 'q', xlSaved: true } });
  assert.deepEqual(s.getMarks(), { 'a|X|3|2026': { date: 'q', xlSaved: true } });
  s.close();
});

test('administraciones: alta, edicion, baja', async () => {
  const s = await Store.open(path.join(tmpDir(), 'e.sqlite'));
  const id = s.saveAdmin({ nombre: 'ADMIN SUR', edificios: 'Torre Ceibo', telefono: '2401', mail: 'b@b' });
  s.saveAdmin({ id, nombre: 'ADMIN SUR SRL', edificios: 'Torre Ceibo; Edificio Arazá', telefono: '2401', mail: 'b@b' });
  assert.equal(s.listAdmins()[0].nombre, 'ADMIN SUR SRL');
  assert.throws(() => s.saveAdmin({ nombre: ' ' }), /obligatorio/);
  s.deleteAdmin(id);
  assert.equal(s.listAdmins().length, 0);
  s.close();
});

test('importData reemplaza todo y backup rota archivos', async () => {
  const dir = tmpDir();
  const s = await Store.open(path.join(dir, 'f.sqlite'), { maxBackups: 3 });
  s.addContract(sample);
  const res = s.importData({ contracts: [{ ...sample, importe: 30000 }, { ...sample, direccion: 'OTRA', inactive: true }], admins: [{ nombre: 'A' }] });
  assert.deepEqual(res, { contracts: 2, admins: 1 });
  const list = s.listContracts();
  assert.equal(list.length, 2);
  assert.equal(list[0].id, 1, 'los ids se reinician');
  assert.equal(list[0].importe, 30000, 'conserva el importe actual importado');
  assert.equal(list[1].inactive, true);
  for (let i = 0; i < 5; i++) s.backup('t' + i);
  assert.equal(fs.readdirSync(path.join(dir, 'backups')).length, 3);
  s.close();
});

test('garantia: se guarda, se edita y CGN/ANDA migran desde remitente', async () => {
  const s = await Store.open(path.join(tmpDir(), 'g.sqlite'));
  const a = s.addContract({ ...sample, garantia: 'Sura' });
  assert.equal(a.garantia, 'Sura');
  const b = s.addContract({ ...sample, direccion: 'B 1', remitente: 'CGN' });
  const c = s.addContract({ ...sample, direccion: 'C 1', remitente: 'GESTORA' });
  s.migrateGarantias(t => t.charAt(0) + t.slice(1).toLowerCase());
  assert.deepEqual([s.getContract(b.id).garantia, s.getContract(b.id).remitente], ['CGN', '']);
  assert.deepEqual([s.getContract(c.id).garantia, s.getContract(c.id).remitente], ['', 'Gestora']);
  const u = s.updateContract(a.id, { ...sample, garantia: 'Porto', remitente: 'Laura' });
  assert.deepEqual([u.garantia, u.remitente], ['Porto', 'Laura']);
  const keep = s.updateContract(a.id, { ...sample });           // sin los campos: no los borra
  assert.deepEqual([keep.garantia, keep.remitente], ['Porto', 'Laura']);
  s.close();
});

test('moneda: pesos por defecto, dolares para importes de hasta 4 cifras y se puede cambiar', async () => {
  const s = await Store.open(path.join(tmpDir(), 'm.sqlite'));
  const pesos = s.addContract({ ...sample, importeBase: 25000 });
  const dolares = s.addContract({ ...sample, direccion: 'D 1', importeBase: 1140 });
  assert.equal(pesos.moneda, 'UYU');
  s.migrateMoneda();
  assert.deepEqual([s.getContract(pesos.id).moneda, s.getContract(dolares.id).moneda], ['UYU', 'USD']);
  assert.equal(s.updateContract(pesos.id, { ...sample, importeBase: 900, moneda: 'UYU' }).moneda, 'UYU', 'se respeta lo elegido');
  assert.equal(s.updateContract(pesos.id, { ...sample, importeBase: 900 }).moneda, 'UYU', 'sin el campo no cambia');
  assert.equal(s.addContract({ ...sample, direccion: 'E 1', importeBase: 800, moneda: 'USD' }).moneda, 'USD');
  s.close();
});
