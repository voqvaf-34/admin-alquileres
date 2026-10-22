const test   = require('node:test');
const assert = require('node:assert/strict');
const fs     = require('fs');
const os     = require('os');
const path   = require('path');
const { Store } = require('../../src/infraestructura/base-datos');

const tmp = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'alq-undo-')), 'x.sqlite');
const base = { importeBase: 20000, contratoStr: '2 AÑOS', fechaInicio: '2024-01-01' };
const wait = ms => new Promise(r => setTimeout(r, ms));

test('deshacer y rehacer restauran la base', async () => {
  const s = await Store.open(tmp());
  s.checkpoint('Agregar alquiler');
  s.addContract({ ...base, direccion: 'A 1' });
  await wait(1600);
  s.checkpoint('Agregar alquiler');
  s.addContract({ ...base, direccion: 'B 2' });
  assert.equal(s.listContracts().length, 2);
  assert.deepEqual(s.undoStatus(), { canUndo: true, undoLabel: 'Agregar alquiler', canRedo: false, redoLabel: '' });

  assert.equal(s.undo(), 'Agregar alquiler');
  assert.deepEqual(s.listContracts().map(c => c.direccion), ['A 1']);
  s.undo();
  assert.equal(s.listContracts().length, 0);
  assert.throws(() => s.undo(), /No hay cambios/);

  s.redo(); s.redo();
  assert.equal(s.listContracts().length, 2);
  s.close();

  const again = await Store.open(s.filePath);
  assert.equal(again.listContracts().length, 2, 'el estado rehecho queda guardado en disco');
  again.close();
});

test('cambios seguidos se agrupan y un cambio nuevo borra el rehacer', async () => {
  const s = await Store.open(tmp());
  const c = s.addContract({ ...base, direccion: 'A 1' });
  s.checkpoint('Modificar alquiler');
  s.patchContract(c.id, { importe: 21000 });
  assert.equal(s.checkpoint('Cambiar marca'), false, 'dentro de 1,5 s es el mismo paso');
  s.replaceMarks({ 'a|A 1|3|2026': { date: 'x' } });
  s.undo();
  assert.equal(s.getContract(c.id).importe, 20000);
  assert.deepEqual(s.getMarks(), {});
  assert.equal(s.undoStatus().canRedo, true);
  await wait(1600);
  s.checkpoint('Modificar alquiler');
  s.patchContract(c.id, { notas: 'x' });
  assert.equal(s.undoStatus().canRedo, false);
  s.close();
});

test('normalizar direcciones conserva la original y mueve las marcas', async () => {
  const s = await Store.open(tmp());
  const a = s.addContract({ ...base, direccion: 'TORRE CEIBO 403' });
  const b = s.addContract({ ...base, direccion: 'TORRE CEIBO U 403, Ceibo 1500' });
  s.replaceMarks({ 'v|TORRE CEIBO 403': { date: '01/01/2025' }, 'v|TORRE CEIBO U 403, Ceibo 1500': { date: '01/06/2026' } });
  s.setOwnerAccount(s.saveOwner({ nombre: 'Juan' }), 'TORRE CEIBO 403', 'BROU 123');
  const dir = 'Torre Ceibo - Ceibo 1500 U403';
  s.applyAddresses([a, b].map(c => ({ id: c.id, edificio: 'Torre Ceibo', calle: 'Ceibo 1500', unidad: '403', direccion: dir })));
  const list = s.listContracts();
  assert.deepEqual(list.map(c => c.direccion), [dir, dir]);
  assert.deepEqual(list.map(c => c.direccionOriginal), ['TORRE CEIBO 403', 'TORRE CEIBO U 403, Ceibo 1500']);
  assert.deepEqual(s.getMarks(), { [`v|${dir}`]: { date: '01/06/2026' } }, 'queda la marca mas reciente');
  s.close();
});

test('renombrar un apto desde la edicion mueve marcas y cuentas de cobro', async () => {
  const s = await Store.open(tmp());
  const c = s.addContract({ ...base, direccion: 'Viejo 1' });
  const oid = s.saveOwner({ nombre: 'Ana' });
  s.setOwnerAccount(oid, 'Viejo 1', 'Itau 99');
  s.replaceMarks({ 'nr|Viejo 1': { date: '01/01/2026' } });
  s.updateContract(c.id, { ...base, direccion: 'Nuevo 2', edificio: '', calle: 'Nuevo 2', unidad: '' });
  assert.deepEqual(Object.keys(s.getMarks()), ['nr|Nuevo 2']);
  assert.deepEqual(s.listOwnerAccounts(), [{ ownerId: oid, direccion: 'Nuevo 2', cuenta: 'Itau 99' }]);
  s.close();
});

test('limpieza: inactivos sin contacto del propietario se eliminan', async () => {
  const s = await Store.open(tmp());
  const a = s.addContract({ ...base, direccion: 'Sin contacto' });   s.setInactive(a.id);
  const b = s.addContract({ ...base, direccion: 'Con telefono' });   s.setInactive(b.id);
  const c = s.addContract({ ...base, direccion: 'Activo sin dato' });
  const d = s.addContract({ ...base, direccion: 'Sin propietario' }); s.setInactive(d.id);
  const sin = s.saveOwner({ nombre: 'Elena' }), con = s.saveOwner({ nombre: 'Ana', telefono: '099' });
  s.setContractOwners(a.id, [sin]); s.setContractOwners(b.id, [con]); s.setContractOwners(c.id, [sin]);
  const borrados = s.purgeInactiveWithoutContact();
  assert.deepEqual(borrados.sort(), ['Sin contacto', 'Sin propietario']);
  assert.deepEqual(s.listContracts().map(x => x.direccion).sort(), ['Activo sin dato', 'Con telefono']);
  assert.deepEqual(s.listOwners().map(o => o.nombre).sort(), ['Ana', 'Elena'], 'Elena sigue porque tiene un activo');
  s.close();
});

test('datos de contrato del propietario y documentos', async () => {
  const s = await Store.open(tmp());
  const id = s.saveOwner({ nombre: 'Ana', cedula: '1.234.567-8', domicilio: 'Calle 1', estadoCivil: 'Casada', cuentaCobro: 'BROU 1' });
  s.addOwnerDoc(id, 'cedula', 'f1.jpg', 'frente.jpg');
  const o = s.listOwners()[0];
  assert.equal(o.cedula, '1.234.567-8');
  assert.equal(o.estadoCivil, 'Casada');
  assert.equal(s.listOwnerDocs()[0].nombreOriginal, 'frente.jpg');
  const id2 = s.saveOwner({ nombre: 'Ana bis' });
  s.mergeOwners(id2, id);
  assert.equal(s.listOwners()[0].cedula, '1.234.567-8', 'unificar conserva los datos');
  assert.equal(s.listOwnerDocs()[0].ownerId, id2, 'y los documentos');
  s.close();
});
