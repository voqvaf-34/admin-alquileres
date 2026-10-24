const test   = require('node:test');
const assert = require('node:assert/strict');
const fs     = require('fs');
const os     = require('os');
const path   = require('path');
const initSqlJs = require('sql.js');
const { BaseDatos } = require('../../src/infraestructura/base-datos');
const { ESQUEMA_0_8 } = require('./fixtures/esquema-0.8');

// Arma en disco una base como la dejaba la 0.8.1 (tablas y columnas en ingles).
async function baseVieja(archivo) {
  const SQL = await initSqlJs({ wasmBinary: fs.readFileSync(require.resolve('sql.js/dist/sql-wasm.wasm')) });
  const db = new SQL.Database();
  db.run('PRAGMA foreign_keys = ON;');
  db.exec(ESQUEMA_0_8);
  db.run(`INSERT INTO contracts (direccion, propietario, importe_base, importe, contrato_str, fecha_inicio, inactive, source_row)
          VALUES ('Calle 1', 'Ana', 20000, 21000, '2 AÑOS', '2025-01-10', 0, 3), ('Calle 2', 'Beto', 30000, 30000, '3 AÑOS', '2024-03-01', 1, 4)`);
  db.run("INSERT INTO admins (nombre, edificios, telefono, mail, source_row) VALUES ('Adm', 'Torre', '2900', 'a@x', 7)");
  db.run(`INSERT INTO marks (key, data) VALUES ('v|Calle 1', '{"date":"01/10/2026"}')`);
  db.run("INSERT INTO settings (key, value) VALUES ('marcaNombre', 'Sur'), ('sharedDir', 'C:/compartida'), ('initialized', '1'), ('msgRenovacion', 'Hola')");
  db.run("INSERT INTO contacts (nombre, rol) VALUES ('Gestor', 'Admin')");
  db.run("INSERT INTO owners (nombre, telefono, contact_id) VALUES ('Ana', '099', 1), ('Beto', '098', NULL)");
  db.run('INSERT INTO contract_owners (contract_id, owner_id, orden) VALUES (1, 1, 0), (2, 2, 0)');
  db.run("INSERT INTO owner_docs (owner_id, tipo, archivo, nombre_original) VALUES (1, 'cedula', 'a.jpg', 'foto.jpg')");
  db.run("INSERT INTO owner_accounts (owner_id, direccion, cuenta) VALUES (1, 'Calle 1', 'BROU 1')");
  fs.writeFileSync(archivo, Buffer.from(db.export()));
  db.close();
}

test('una base de la 0.8.1 (en ingles) se migra al abrirla y no pierde nada', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'alq-migra-')), archivo = path.join(dir, 'a.sqlite');
  await baseVieja(archivo);
  const s = await BaseDatos.open(archivo);

  const tablas = s.consultar("SELECT name, sql FROM sqlite_master WHERE type='table' AND name != 'sqlite_sequence'");
  assert.deepEqual(tablas.map(t => t.name).sort(), ['administraciones', 'ajustes', 'contactos', 'contratos',
    'contratos_propietarios', 'cuentas_propietarios', 'documentos_propietarios', 'marcas', 'propietarios']);
  for (const t of tablas) assert.doesNotMatch(t.sql, /\b(contracts|owners|contacts|owner_id|contract_id|contact_id)\b/, t.name);

  const [c1, c2] = s.listarContratos();
  assert.equal(c1.direccion, 'Calle 1');
  assert.equal(c1.importe, 21000);
  assert.equal(c1.contratoStr, '2 AÑOS');
  assert.equal(c2.inactive, true);
  assert.equal(s.listarAdmins()[0].nombre, 'Adm');
  assert.deepEqual(s.obtenerMarcas(), { 'v|Calle 1': { date: '01/10/2026' } });
  assert.deepEqual(s.obtenerAjustes(), { marcaNombre: 'Sur', carpetaCompartida: 'C:/compartida', inicializada: '1', mensajeRenovacionTexto: 'Hola' });
  assert.equal(s.listarPropietarios().find(o => o.nombre === 'Ana').contactId, 1);
  assert.equal(s.listarPropietariosDeContratos().length, 2);
  assert.equal(s.listarDocsPropietarios()[0].nombreOriginal, 'foto.jpg');
  assert.equal(s.listarCuentasPropietarios()[0].cuenta, 'BROU 1');
  assert.equal(s.consultar('PRAGMA foreign_key_check').length, 0);

  // La numeracion sigue y el borrado en cascada funciona con las tablas renombradas.
  assert.equal(s.agregarContrato({ direccion: 'Calle 3', importeBase: 1000 }).id, 3);
  s.borrarPropietario(1);
  assert.equal(s.listarPropietariosDeContratos().some(l => l.ownerId === 1), false);
  assert.equal(s.listarDocsPropietarios().length, 0);
  assert.equal(s.listarCuentasPropietarios().length, 0);
  s.close();

  // Ya migrada: al reabrir no hay nada mas que renombrar y lo nuevo quedo en disco.
  const s2 = await BaseDatos.open(archivo);
  assert.equal(s2.renombrarTablasViejas(), false);
  assert.equal(s2.listarContratos().length, 3);
  s2.close();
});

test('el Visor (solo lectura) lee una base vieja sin escribirla', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'alq-migra-ro-')), archivo = path.join(dir, 'a.sqlite');
  await baseVieja(archivo);
  const antes = fs.readFileSync(archivo);
  const s = await BaseDatos.open(archivo, { readOnly: true });
  assert.equal(s.listarContratos().length, 2);
  s.close();
  assert.ok(fs.readFileSync(archivo).equals(antes), 'la base compartida no se toca');
});
