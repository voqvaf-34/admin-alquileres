const test   = require('node:test');
const assert = require('node:assert/strict');
const D      = require('../../src/dominios/index.js');

const contrato = { direccion: 'Torre Ceibo - Av. Italia 875 U403', inquilino: 'Beto Gomez', propietario: 'Ana Perez' };

test('mensajes: usan el nombre de la inmobiliaria de la configuracion', () => {
  const settings = { marcaNombre: 'Inmobiliaria del Sur' };
  assert.match(D.renewalMessage(new Date(2026, 10, 1), { settings }), /^Hola! Te escribo desde Inmobiliaria del Sur\./);
  const m = D.increaseMessages({ settings, contrato, porcentaje: '3,16%', nuevoImporte: '$ 25.790' });
  assert.match(m.inquilino, /desde Inmobiliaria del Sur\..*es de 3,16% quedando en \$ 25\.790/);
  assert.match(m.propietario, /de Torre Ceibo - Av\. Italia 875 U403\./);
});

test('mensajes: plantilla propia con variables', () => {
  const settings = { msgRenovacion: 'Hola {inquilino}, tu contrato de {direccion} vence el {vencimiento}. {inmobiliaria}' };
  assert.equal(D.renewalMessage(new Date(2026, 10, 1), { settings, contrato }),
    'Hola Beto Gomez, tu contrato de Torre Ceibo - Av. Italia 875 U403 vence el 01/11/2026. Mi Inmobiliaria');
});

test('mensajes: variables desconocidas o vacias quedan a la vista', () => {
  assert.equal(D.rellenar('Hola {inquilino} {otra}', { inquilino: '' }), 'Hola {inquilino} {otra}');
  assert.deepEqual(D.variablesDesconocidas('renovacion', 'Hola {inquilino} {otra} {porcentaje}'), ['otra', 'porcentaje']);
  assert.deepEqual(D.variablesDesconocidas('aumentoInquilino', 'Sube {porcentaje}'), []);
});

test('mensajes: guardar el texto original o vacio equivale a usar el original', () => {
  const orig = D.PLANTILLAS.renovacion.texto;
  assert.deepEqual(D.mensajesASettings({ renovacion: orig, aumentoInquilino: '  ', aumentoPropietario: 'Otro texto' }),
    { msgRenovacion: '', msgAumentoInq: '', msgAumentoProp: 'Otro texto' });
  assert.deepEqual(D.mensajesASettings({}), {});
  assert.throws(() => D.mensajesASettings({ renovacion: 'x'.repeat(D.PLANTILLA_MAX + 1) }), /2000/);
  assert.equal(D.textoPlantilla({ msgRenovacion: '' }, 'renovacion'), orig);
});
