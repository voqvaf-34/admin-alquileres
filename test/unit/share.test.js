const test   = require('node:test');
const assert = require('node:assert/strict');
const fs     = require('fs');
const os     = require('os');
const path   = require('path');
const share  = require('../../src/infraestructura/compartir');
const { BaseDatos } = require('../../src/infraestructura/base-datos');

const carpetaTemporal = () => fs.mkdtempSync(path.join(os.tmpdir(), 'alq-share-'));
const base = { importeBase: 20000, contratoTexto: '2 AÑOS', fechaInicio: '2024-01-01' };

test('publicar copia la base y las fotos sin dejar temporales', async () => {
  const local = carpetaTemporal(), compartida = path.join(carpetaTemporal(), 'Base Admin Alquileres');
  const s = await BaseDatos.open(path.join(local, 'alquileres.sqlite'));
  s.agregarContrato({ ...base, direccion: 'A 1' });
  fs.mkdirSync(path.join(local, 'documentos'));
  fs.writeFileSync(path.join(local, 'documentos', 'prop1-cedula.jpg'), 'x');
  const info = share.publicar({ archivoBase: s.rutaArchivo, carpetaDocs: path.join(local, 'documentos'), carpetaCompartida: compartida, por: 'test' });
  assert.ok(info.publicado);
  assert.deepEqual(fs.readdirSync(compartida).sort(), ['alquileres.sqlite', 'documentos', 'publicado.json']);
  assert.ok(fs.existsSync(path.join(compartida, 'documentos', 'prop1-cedula.jpg')));
  assert.equal(share.leerInfo(compartida).por, 'test');
  s.close();
});

test('el visor abre la base en solo lectura y nunca la modifica', async () => {
  const local = carpetaTemporal(), compartida = carpetaTemporal();
  const s = await BaseDatos.open(path.join(local, 'alquileres.sqlite'));
  s.agregarContrato({ ...base, direccion: 'A 1' });
  share.publicar({ archivoBase: s.rutaArchivo, carpetaCompartida: compartida });
  const archivo = share.rutaBaseCompartida(compartida);
  const antesDe = fs.readFileSync(archivo);
  const v = await BaseDatos.open(archivo, { soloLectura: true });
  assert.deepEqual(v.listarContratos().map(c => c.direccion), ['A 1']);
  v.agregarContrato({ ...base, direccion: 'B 2' });            // aunque se intente, no se escribe
  v.respaldar('x');
  assert.deepEqual(fs.readFileSync(archivo), antesDe);
  assert.ok(!fs.existsSync(path.join(compartida, 'backups')));
  await assert.rejects(BaseDatos.open(path.join(compartida, 'no-existe.sqlite'), { soloLectura: true }), /No se encontro la base compartida/);
  v.close(); s.close();
});

test('cada guardado avisa para publicar', async () => {
  const s = await BaseDatos.open(path.join(carpetaTemporal(), 'alquileres.sqlite'));
  let n = 0;
  s.alPersistir = () => { n++; };
  s.agregarContrato({ ...base, direccion: 'A 1' });
  s.guardarAjuste('ipc', '4');
  assert.equal(n, 2);
  s.close();
});
