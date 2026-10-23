const test   = require('node:test');
const assert = require('node:assert/strict');
const fs     = require('fs');
const os     = require('os');
const path   = require('path');
const { BaseDatos } = require('../../src/infraestructura/base-datos');

const tmp = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'alq-undo-')), 'x.sqlite');
const base = { importeBase: 20000, contratoStr: '2 AÑOS', fechaInicio: '2024-01-01' };
const wait = ms => new Promise(r => setTimeout(r, ms));

test('deshacer y rehacer restauran la base', async () => {
  const s = await BaseDatos.open(tmp());
  s.puntoDeControl('Agregar alquiler');
  s.agregarContrato({ ...base, direccion: 'A 1' });
  await wait(1600);
  s.puntoDeControl('Agregar alquiler');
  s.agregarContrato({ ...base, direccion: 'B 2' });
  assert.equal(s.listarContratos().length, 2);
  assert.deepEqual(s.estadoDeshacer(), { canUndo: true, undoLabel: 'Agregar alquiler', canRedo: false, redoLabel: '' });

  assert.equal(s.deshacerCambio(), 'Agregar alquiler');
  assert.deepEqual(s.listarContratos().map(c => c.direccion), ['A 1']);
  s.deshacerCambio();
  assert.equal(s.listarContratos().length, 0);
  assert.throws(() => s.deshacerCambio(), /No hay cambios/);

  s.rehacerCambio(); s.rehacerCambio();
  assert.equal(s.listarContratos().length, 2);
  s.close();

  const again = await BaseDatos.open(s.filePath);
  assert.equal(again.listarContratos().length, 2, 'el estado rehecho queda guardado en disco');
  again.close();
});

test('cambios seguidos se agrupan y un cambio nuevo borra el rehacer', async () => {
  const s = await BaseDatos.open(tmp());
  const c = s.agregarContrato({ ...base, direccion: 'A 1' });
  s.puntoDeControl('Modificar alquiler');
  s.modificarContrato(c.id, { importe: 21000 });
  assert.equal(s.puntoDeControl('Cambiar marca'), false, 'dentro de 1,5 s es el mismo paso');
  s.reemplazarMarcas({ 'a|A 1|3|2026': { date: 'x' } });
  s.deshacerCambio();
  assert.equal(s.obtenerContrato(c.id).importe, 20000);
  assert.deepEqual(s.obtenerMarcas(), {});
  assert.equal(s.estadoDeshacer().canRedo, true);
  await wait(1600);
  s.puntoDeControl('Modificar alquiler');
  s.modificarContrato(c.id, { notas: 'x' });
  assert.equal(s.estadoDeshacer().canRedo, false);
  s.close();
});

test('una importacion es siempre un paso propio: no se junta con el anterior ni con el siguiente', async () => {
  const s = await BaseDatos.open(tmp());
  const c = s.agregarContrato({ ...base, direccion: 'A 1' });
  s.puntoDeControl('Modificar alquiler');
  s.modificarContrato(c.id, { importe: 21000 });
  assert.equal(s.puntoDeControl('Agregar planilla', false), true, 'no se junta con el cambio anterior');
  s.agregarContrato({ ...base, direccion: 'B 1' });
  assert.equal(s.puntoDeControl('Modificar alquiler'), true, 'el cambio siguiente no se junta con la importacion');
  s.modificarContrato(c.id, { importe: 22000 });
  s.deshacerCambio();
  assert.equal(s.obtenerContrato(c.id).importe, 21000, 'deshace solo el ultimo cambio');
  assert.equal(s.listarContratos().length, 2, 'la importacion sigue');
  s.deshacerCambio();
  assert.equal(s.listarContratos().length, 1, 'despues se deshace la importacion sola');
  assert.equal(s.obtenerContrato(c.id).importe, 21000);
  s.close();
});

test('normalizar direcciones conserva la original y mueve las marcas', async () => {
  const s = await BaseDatos.open(tmp());
  const a = s.agregarContrato({ ...base, direccion: 'TORRE CEIBO 403' });
  const b = s.agregarContrato({ ...base, direccion: 'TORRE CEIBO U 403, Ceibo 1500' });
  s.reemplazarMarcas({ 'v|TORRE CEIBO 403': { date: '01/01/2025' }, 'v|TORRE CEIBO U 403, Ceibo 1500': { date: '01/06/2026' } });
  s.ponerCuentaPropietario(s.guardarPropietario({ nombre: 'Juan' }), 'TORRE CEIBO 403', 'BROU 123');
  const dir = 'Torre Ceibo - Ceibo 1500 U403';
  s.aplicarDirecciones([a, b].map(c => ({ id: c.id, edificio: 'Torre Ceibo', calle: 'Ceibo 1500', unidad: '403', direccion: dir })));
  const list = s.listarContratos();
  assert.deepEqual(list.map(c => c.direccion), [dir, dir]);
  assert.deepEqual(list.map(c => c.direccionOriginal), ['TORRE CEIBO 403', 'TORRE CEIBO U 403, Ceibo 1500']);
  assert.deepEqual(s.obtenerMarcas(), { [`v|${dir}`]: { date: '01/06/2026' } }, 'queda la marca mas reciente');
  s.close();
});

test('renombrar un apto desde la edicion mueve marcas y cuentas de cobro', async () => {
  const s = await BaseDatos.open(tmp());
  const c = s.agregarContrato({ ...base, direccion: 'Viejo 1' });
  const oid = s.guardarPropietario({ nombre: 'Ana' });
  s.ponerCuentaPropietario(oid, 'Viejo 1', 'Itau 99');
  s.reemplazarMarcas({ 'nr|Viejo 1': { date: '01/01/2026' } });
  s.editarContrato(c.id, { ...base, direccion: 'Nuevo 2', edificio: '', calle: 'Nuevo 2', unidad: '' });
  assert.deepEqual(Object.keys(s.obtenerMarcas()), ['nr|Nuevo 2']);
  assert.deepEqual(s.listarCuentasPropietarios(), [{ ownerId: oid, direccion: 'Nuevo 2', cuenta: 'Itau 99' }]);
  s.close();
});

test('limpieza: inactivos sin contacto del propietario se eliminan', async () => {
  const s = await BaseDatos.open(tmp());
  const a = s.agregarContrato({ ...base, direccion: 'Sin contacto' });   s.marcarInactivo(a.id);
  const b = s.agregarContrato({ ...base, direccion: 'Con telefono' });   s.marcarInactivo(b.id);
  const c = s.agregarContrato({ ...base, direccion: 'Activo sin dato' });
  const d = s.agregarContrato({ ...base, direccion: 'Sin propietario' }); s.marcarInactivo(d.id);
  const sin = s.guardarPropietario({ nombre: 'Elena' }), con = s.guardarPropietario({ nombre: 'Ana', telefono: '099' });
  s.asignarPropietariosContrato(a.id, [sin]); s.asignarPropietariosContrato(b.id, [con]); s.asignarPropietariosContrato(c.id, [sin]);
  const borrados = s.purgarInactivosSinContacto();
  assert.deepEqual(borrados.sort(), ['Sin contacto', 'Sin propietario']);
  assert.deepEqual(s.listarContratos().map(x => x.direccion).sort(), ['Activo sin dato', 'Con telefono']);
  assert.deepEqual(s.listarPropietarios().map(o => o.nombre).sort(), ['Ana', 'Elena'], 'Elena sigue porque tiene un activo');
  s.close();
});

test('datos de contrato del propietario y documentos', async () => {
  const s = await BaseDatos.open(tmp());
  const id = s.guardarPropietario({ nombre: 'Ana', cedula: '1.234.567-8', domicilio: 'Calle 1', estadoCivil: 'Casada', cuentaCobro: 'BROU 1' });
  s.agregarDocPropietario(id, 'cedula', 'f1.jpg', 'frente.jpg');
  const o = s.listarPropietarios()[0];
  assert.equal(o.cedula, '1.234.567-8');
  assert.equal(o.estadoCivil, 'Casada');
  assert.equal(s.listarDocsPropietarios()[0].nombreOriginal, 'frente.jpg');
  const id2 = s.guardarPropietario({ nombre: 'Ana bis' });
  s.unificarPropietarios(id2, id);
  assert.equal(s.listarPropietarios()[0].cedula, '1.234.567-8', 'unificar conserva los datos');
  assert.equal(s.listarDocsPropietarios()[0].ownerId, id2, 'y los documentos');
  s.close();
});
