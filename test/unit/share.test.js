const test   = require('node:test');
const assert = require('node:assert/strict');
const fs     = require('fs');
const os     = require('os');
const path   = require('path');
const share  = require('../../src/infraestructura/compartir');
const { Store } = require('../../src/infraestructura/base-datos');

const tmpDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'alq-share-'));
const base = { importeBase: 20000, contratoStr: '2 AÑOS', fechaInicio: '2024-01-01' };

test('publicar copia la base y las fotos sin dejar temporales', async () => {
  const local = tmpDir(), shared = path.join(tmpDir(), 'Base Admin Alquileres');
  const s = await Store.open(path.join(local, 'alquileres.sqlite'));
  s.addContract({ ...base, direccion: 'A 1' });
  fs.mkdirSync(path.join(local, 'documentos'));
  fs.writeFileSync(path.join(local, 'documentos', 'prop1-cedula.jpg'), 'x');
  const info = share.publish({ dbFile: s.filePath, docsDir: path.join(local, 'documentos'), sharedDir: shared, by: 'test' });
  assert.ok(info.publicado);
  assert.deepEqual(fs.readdirSync(shared).sort(), ['alquileres.sqlite', 'documentos', 'publicado.json']);
  assert.ok(fs.existsSync(path.join(shared, 'documentos', 'prop1-cedula.jpg')));
  assert.equal(share.readInfo(shared).por, 'test');
  s.close();
});

test('el visor abre la base en solo lectura y nunca la modifica', async () => {
  const local = tmpDir(), shared = tmpDir();
  const s = await Store.open(path.join(local, 'alquileres.sqlite'));
  s.addContract({ ...base, direccion: 'A 1' });
  share.publish({ dbFile: s.filePath, sharedDir: shared });
  const file = share.sharedDbPath(shared);
  const before = fs.readFileSync(file);
  const v = await Store.open(file, { readOnly: true });
  assert.deepEqual(v.listContracts().map(c => c.direccion), ['A 1']);
  v.addContract({ ...base, direccion: 'B 2' });            // aunque se intente, no se escribe
  v.backup('x');
  assert.deepEqual(fs.readFileSync(file), before);
  assert.ok(!fs.existsSync(path.join(shared, 'backups')));
  await assert.rejects(Store.open(path.join(shared, 'no-existe.sqlite'), { readOnly: true }), /No se encontro la base compartida/);
  v.close(); s.close();
});

test('cada guardado avisa para publicar', async () => {
  const s = await Store.open(path.join(tmpDir(), 'alquileres.sqlite'));
  let n = 0;
  s.onPersist = () => { n++; };
  s.addContract({ ...base, direccion: 'A 1' });
  s.setSetting('ipc', '4');
  assert.equal(n, 2);
  s.close();
});
