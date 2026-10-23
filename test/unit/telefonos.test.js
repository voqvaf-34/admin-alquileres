const test   = require('node:test');
const assert = require('node:assert/strict');
const D      = require('../../src/dominios/index.js');

test('WhatsApp: celulares y fijos uruguayos se completan con 598 (sin el 0 inicial)', () => {
  assert.equal(D.numeroWhatsApp('099 123 456'), '59899123456');
  assert.equal(D.numeroWhatsApp('99123456'), '59899123456');
  assert.equal(D.numeroWhatsApp('2900 1234'), '59829001234');
  assert.equal(D.numeroWhatsApp('091-000-101'), '59891000101');
});

test('WhatsApp: los que ya traen prefijo internacional quedan igual', () => {
  assert.equal(D.numeroWhatsApp('+598 99 123 456'), '59899123456');
  assert.equal(D.numeroWhatsApp('54 9 11 2696-2119'), '5491126962119');   // Argentina
  assert.equal(D.numeroWhatsApp('+55 11 91234 5678'), '5511912345678');   // Brasil
  assert.equal(D.numeroWhatsApp('+34 612 345 678'), '34612345678');       // España
});

test('WhatsApp: numeros muy cortos o vacios no son telefonos', () => {
  for (const t of ['', null, undefined, '098', 'sin telefono', '12 34 5']) assert.equal(D.numeroWhatsApp(t), null, String(t));
});
